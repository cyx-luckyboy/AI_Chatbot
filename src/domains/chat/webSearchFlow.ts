import type { BrowserWindow } from 'electron'
import { buildChatSystemContexts } from './chatSystemContext'
import { configManager } from '../../shared/config'
import { enrichSearchQueryWithLocation } from '../location/userLocation'
import type { BaseProvider } from '../../providers/BaseProvider'
import { tavilySearch, type TavilySearchHit } from './tavilySearch'
import type {
  ChatMessageProps,
  CreateChatProps,
  UpdatgedStreamData,
  WebSearchMeta,
} from '../../shared/types'
import { notifyPetFromChatChunk } from '../pet/petChatBridge'
import { isChatAborted } from './chatAbort'

export type WebSearchLang = 'zh' | 'en'

export type SearchJudgeResult = {
  needSearch: boolean
  query: string
}

const JUDGE_SYSTEM: Record<WebSearchLang, string> = {
  zh: `你是检索路由助手。根据用户最新问题判断是否需要联网搜索以获取实时或最新信息。
仅回复一行 JSON，不要 markdown 或其它文字：
{"needSearch":true或false,"query":"用于搜索引擎的简短关键词或问句，与用户语言一致"}
需要联网：新闻、天气、股价、汇率、最新政策/法规、近期事件、具体日期的事实、含「今天/现在/最新/今年」、你不确定或可能已过时的信息。
不需要联网：纯逻辑/数学、代码调试、翻译、写作润色、历史常识、用户已提供完整资料的总结、闲聊。`,
  en: `You are a search routing assistant. Decide if the user's latest question needs a web search for fresh or factual information.
Reply with a single line of JSON only, no markdown:
{"needSearch":true|false,"query":"short search keywords in the user's language"}
Need search: news, weather, stocks, rates, recent policies, dated events, words like today/now/latest/current year, uncertain or possibly outdated facts.
Skip search: pure logic/math, code help, translation, writing, well-known history, summarizing user-provided material, small talk.`,
}

const SEARCH_HINT_RE =
  /今天|今日|现在|当前|最新|实时|新闻|天气|股价|汇率|热搜|政策|法规|多少钱|价格|几点|何时|今年|本月|这周|today|now|latest|current|news|weather|stock|price/i

const MAX_HITS = 5
const MAX_CHARS_PER_HIT = 700
const MAX_TOTAL_SEARCH_CHARS = 14_000

function getTavilyApiKey(): string {
  const cfg = configManager.get()
  return (cfg.tavilyApiKey || process.env.TAVILY_API_KEY || '').trim()
}

function statusText(
  key: 'judging' | 'searching' | 'composing' | 'noSearch' | 'searchFailed',
  lang: WebSearchLang,
  extra?: string,
): string {
  const zh = {
    judging: '🔍 正在判断是否需要联网搜索…',
    searching: `🔍 正在联网搜索${extra ? `：${extra}` : ''}…`,
    composing: '✍️ 正在根据检索结果撰写回答…',
    noSearch: 'ℹ️ 无需联网，正在直接回答…\n\n',
    searchFailed: `⚠️ 联网搜索失败（${extra ?? ''}），将基于已有知识回答…\n\n`,
  }
  const en = {
    judging: '🔍 Checking if a web search is needed…',
    searching: `🔍 Searching the web${extra ? `: ${extra}` : ''}…`,
    composing: '✍️ Writing an answer from search results…',
    noSearch: 'ℹ️ No search needed, answering directly…\n\n',
    searchFailed: `⚠️ Web search failed (${extra ?? ''}), answering from model knowledge…\n\n`,
  }
  return (lang === 'zh' ? zh : en)[key]
}

export function questionLikelyNeedsSearch(q: string): boolean {
  return SEARCH_HINT_RE.test(q)
}

export function getLastUserPlainText(messages: ChatMessageProps[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const c = messages[i].content?.trim() ?? ''
      if (c && !c.startsWith('【重要】下方已是联网检索')) return c
    }
  }
  return ''
}

/** 普通对话中：天气/新闻等实时问题且已配置 Tavily 时自动走联网 */
export function shouldAutoWebSearch(messages: ChatMessageProps[]): boolean {
  const q = getLastUserPlainText(messages)
  if (!q || !questionLikelyNeedsSearch(q)) return false
  return Boolean(getTavilyApiKey())
}

function parseJudgeResponse(text: string, fallbackQuery: string): SearchJudgeResult {
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      let needSearch = Boolean(o.needSearch ?? o.search ?? o.need_search)
      const query = String(o.query ?? o.searchQuery ?? o.q ?? '').trim()
      if (!needSearch && questionLikelyNeedsSearch(fallbackQuery)) {
        needSearch = true
      }
      return { needSearch, query: query || fallbackQuery }
    } catch {
      /* fall through */
    }
  }
  return {
    needSearch: questionLikelyNeedsSearch(fallbackQuery),
    query: fallbackQuery,
  }
}

function buildSearchQueries(userQuestion: string, searchQuery: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [searchQuery, userQuestion]) {
    const q = raw.trim()
    if (!q || seen.has(q)) continue
    seen.add(q)
    out.push(q)
  }
  return out.slice(0, 5)
}

function buildWebSearchMeta(
  userQuestion: string,
  searchQuery: string,
  hits: TavilySearchHit[],
): WebSearchMeta {
  return {
    queries: buildSearchQueries(userQuestion, searchQuery),
    sources: trimHits(hits).map((h) => ({
      title: h.title,
      url: h.url,
    })),
  }
}

function trimHits(hits: TavilySearchHit[]): TavilySearchHit[] {
  const out: TavilySearchHit[] = []
  let total = 0
  for (const h of hits.slice(0, MAX_HITS)) {
    let content = h.content
    if (content.length > MAX_CHARS_PER_HIT) {
      content = `${content.slice(0, MAX_CHARS_PER_HIT)}…`
    }
    if (total + content.length > MAX_TOTAL_SEARCH_CHARS) break
    total += content.length
    out.push({ ...h, content })
  }
  return out
}

async function collectChatCompletion(
  provider: BaseProvider,
  messages: ChatMessageProps[],
  model: string,
): Promise<string> {
  let text = ''
  const stream = await provider.chat(messages, model)
  for await (const chunk of stream) {
    if (chunk.result) text += chunk.result
  }
  return text
}

export async function judgeNeedsWebSearch(
  userQuestion: string,
  provider: BaseProvider,
  model: string,
  lang: WebSearchLang,
): Promise<SearchJudgeResult> {
  const q = userQuestion.trim()
  if (!q) return { needSearch: false, query: '' }

  const judgeMessages: ChatMessageProps[] = [
    { role: 'system', content: JUDGE_SYSTEM[lang] },
    { role: 'user', content: q },
  ]
  const raw = await collectChatCompletion(provider, judgeMessages, model)
  return parseJudgeResponse(raw, q.slice(0, 200))
}

function formatSearchHits(hits: TavilySearchHit[], summary: string | undefined, lang: WebSearchLang): string {
  const lines: string[] = []
  if (summary) {
    lines.push(lang === 'zh' ? `【检索摘要】\n${summary}` : `【Search summary】\n${summary}`)
  }
  hits.forEach((h, i) => {
    lines.push(
      lang === 'zh'
        ? `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`
        : `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`,
    )
  })
  return lines.join('\n\n')
}

/** 联网问答专用：仅系统时间 + 单轮用户消息，避免整段历史 + 超长检索把上下文撑爆 */
export function buildSearchAnswerMessages(
  userQuestion: string,
  hits: TavilySearchHit[],
  summary: string | undefined,
  lang: WebSearchLang,
  searchFailedNote?: string,
): ChatMessageProps[] {
  const trimmed = trimHits(hits)
  const block = trimmed.length ? formatSearchHits(trimmed, summary, lang) : ''
  const now = new Date().toISOString()

  let userBody: string
  if (block) {
    userBody =
      lang === 'zh'
        ? `【重要】下方是联网检索得到的网页摘要（${now}）。请直接据此回答，勿声称无法联网。\n\n${block}\n\n---\n\n用户问题：\n${userQuestion}`
        : `【Important】Web search snippets (${now}). Answer from them; do not claim you lack internet access.\n\n${block}\n\n---\n\nUser question:\n${userQuestion}`
  } else if (searchFailedNote) {
    userBody =
      lang === 'zh'
        ? `${searchFailedNote}\n\n请尽量根据已有知识回答：\n${userQuestion}`
        : `${searchFailedNote}\n\nAnswer as best you can:\n${userQuestion}`
  } else {
    userBody = userQuestion
  }

  return [...buildChatSystemContexts(), { role: 'user', content: userBody }]
}

export function formatSearchFallbackMarkdown(
  userQuestion: string,
  hits: TavilySearchHit[],
  summary: string | undefined,
  lang: WebSearchLang,
): string {
  const trimmed = trimHits(hits)
  if (!summary && trimmed.length === 0) {
    return lang === 'zh'
      ? '联网检索已完成，但对话模型未返回文字。请换用其它模型重试，或稍后再试。'
      : 'Search finished but the chat model returned no text. Try another model or retry later.'
  }
  const head =
    lang === 'zh'
      ? `> 对话模型未返回正文，以下为 **Tavily 检索摘要**（问题：${userQuestion}）\n\n`
      : `> The chat model returned no text. **Tavily search summary** for: ${userQuestion}\n\n`
  const body = formatSearchHits(trimmed, summary, lang)
  return `${head}${body}`
}

export function sendChunk(win: BrowserWindow, messageId: number, data: UpdatgedStreamData['data']) {
  win.webContents.send('update-message', { messageId, data })
  notifyPetFromChatChunk(messageId, data)
}

/** 空回复 / 仅标点（如「.」）视为无有效正文 */
export function isMeaningfulAssistantText(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  if (s.length <= 8 && /^[.。…·\s]+$/.test(s)) return false
  return true
}

function emptyStreamError(lang: WebSearchLang): string {
  return lang === 'zh'
    ? '模型未返回有效文字（可能卡住或只回了标点）。请换一个模型重试，或稍后再试。'
    : 'The model returned no usable text (hung or punctuation-only). Try another model.'
}

/** @returns 是否得到非空正文；若被用户中断则返回 false 且已发结束帧 */
export async function streamChatToWindow(
  win: BrowserWindow,
  provider: BaseProvider,
  messages: ChatMessageProps[],
  model: string,
  messageId: number,
  fallbackMarkdown?: string,
  lang: WebSearchLang = 'zh',
): Promise<boolean> {
  let acc = ''
  let sawEnd = false
  const STREAM_TIMEOUT_MS = 180_000
  let timedOut = false
  const stream = await provider.chat(messages, model)

  const consume = (async () => {
    for await (const chunk of stream) {
      if (timedOut || isChatAborted(messageId)) break
      if (chunk.result) acc += chunk.result
      if (chunk.is_end) sawEnd = true
      sendChunk(win, messageId, chunk)
    }
  })()

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      consume,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          reject(new Error('STREAM_TIMEOUT'))
        }, STREAM_TIMEOUT_MS)
      }),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'STREAM_TIMEOUT' || timedOut) {
      sendChunk(win, messageId, {
        is_end: true,
        is_error: true,
        replace: true,
        result:
          lang === 'zh'
            ? '回复超时：模型长时间无完整结束。请换模型或稍后重试。'
            : 'Reply timed out. Try another model or retry later.',
      })
      return false
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (isChatAborted(messageId)) {
    const note =
      lang === 'zh' ? '\n\n_（已中断生成）_' : '\n\n_(Generation stopped)_'
    sendChunk(win, messageId, {
      is_end: true,
      replace: true,
      result: (acc.trim() ? acc : lang === 'zh' ? '已中断生成。' : 'Generation stopped.') + (acc.trim() ? note : ''),
    })
    return false
  }

  if (isMeaningfulAssistantText(acc)) {
    if (!sawEnd) {
      sendChunk(win, messageId, { is_end: true, result: '' })
    }
    return true
  }

  const fb = (fallbackMarkdown ?? '').trim()
  if (fb) {
    sendChunk(win, messageId, { is_end: true, result: fb, replace: true })
    return true
  }

  // 已有无意义片段（如「.」）也要结束，否则界面与桌宠会一直 thinking
  sendChunk(win, messageId, {
    is_end: true,
    is_error: true,
    replace: true,
    result: emptyStreamError(lang),
  })
  return false
}

export async function runWebSearchChatPipeline(
  win: BrowserWindow,
  provider: BaseProvider,
  data: CreateChatProps,
  lang: WebSearchLang,
): Promise<void> {
  const { messages, messageId, selectedModel, webSearch: userForcedSearch } = data
  const userQuestion = getLastUserPlainText(messages)
  if (!userQuestion) {
    await streamChatToWindow(win, provider, messages, selectedModel, messageId, undefined, lang)
    return
  }

  const cfg = configManager.get()
  const autoRealtime = !userForcedSearch && questionLikelyNeedsSearch(userQuestion) && Boolean(getTavilyApiKey())

  let judge: SearchJudgeResult
  if (userForcedSearch || autoRealtime) {
    judge = {
      needSearch: true,
      query: enrichSearchQueryWithLocation(userQuestion, cfg),
    }
  } else {
    sendChunk(win, messageId, { is_end: false, result: statusText('judging', lang), replace: true })
    judge = await judgeNeedsWebSearch(userQuestion, provider, selectedModel, lang)
  }

  if (!judge.needSearch) {
    sendChunk(win, messageId, { is_end: false, result: statusText('noSearch', lang), replace: true })
    await streamChatToWindow(win, provider, messages, selectedModel, messageId, undefined, lang)
    return
  }

  const apiKey = getTavilyApiKey()
  if (!apiKey) {
    sendChunk(win, messageId, {
      is_end: true,
      result:
        lang === 'zh'
          ? '未配置 Tavily API Key。请在「设置 → 通用」填写，或在 .env 中设置 TAVILY_API_KEY。'
          : 'Tavily API Key is missing. Add it in Settings → General or set TAVILY_API_KEY in .env.',
      is_error: true,
      replace: true,
    })
    return
  }

  const searchQuery = enrichSearchQueryWithLocation(
    judge.query || userQuestion,
    configManager.get(),
  )
  sendChunk(win, messageId, {
    is_end: false,
    result: statusText('searching', lang, searchQuery.slice(0, 80)),
    replace: true,
  })

  const search = await tavilySearch(searchQuery, apiKey)
  let hits: TavilySearchHit[] = []
  let summary: string | undefined
  let failedNote: string | undefined

  if (search.ok && search.hits.length > 0) {
    hits = search.hits
    summary = search.answer
    const webSearchMeta = buildWebSearchMeta(userQuestion, searchQuery, hits)
    sendChunk(win, messageId, {
      is_end: false,
      result: statusText('composing', lang),
      replace: true,
      webSearchMeta,
    })
  } else {
    const err = search.ok ? '无结果' : search.error
    failedNote =
      lang === 'zh'
        ? `⚠️ 联网检索未返回可用结果（${err}）。`
        : `⚠️ Web search returned no usable results (${err}).`
    sendChunk(win, messageId, {
      is_end: false,
      result: statusText('searchFailed', lang, err),
      replace: true,
    })
  }

  const answerMessages = buildSearchAnswerMessages(userQuestion, hits, summary, lang, failedNote)
  const fallback = formatSearchFallbackMarkdown(userQuestion, hits, summary, lang)

  const ok = await streamChatToWindow(
    win,
    provider,
    answerMessages,
    selectedModel,
    messageId,
    fallback,
    lang,
  )

  if (!ok) {
    // streamChatToWindow 已发送错误结束帧；此处无需重复
  }
}
