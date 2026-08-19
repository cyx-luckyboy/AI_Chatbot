import type { BrowserWindow } from 'electron'
import { createProvider } from '../../providers/createProvider'
import type { SummarySection } from '../../shared/types'

const SINGLE_PASS_MAX = 24_000
const CHUNK_SIZE = 8_000

const SUMMARY_SYSTEM = `你是会议记录助手。根据转写文本生成结构化总结。
必须只输出一个 JSON 对象，不要 markdown 代码块，不要其他说明。
字符串必须使用英文双引号；字符串内的双引号写成 \\"；禁止 trailing comma。
格式：
{"title":"简短会议标题","overview":"一段概述","sections":[{"heading":"小节标题","bullets":["要点1","要点2"]}]}
title 不超过 30 字；sections 3~6 个小节；每个小节 2~5 个 bullets。`

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

function repairJsonLike(str: string): string {
  return str
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
}

/** 括号匹配提取首个完整 JSON 对象，避免贪婪正则截断嵌套结构 */
function extractJsonObject(raw: string): string | null {
  const cleaned = stripCodeFences(raw)
  const start = cleaned.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i]
    if (inString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    if (c === '}') {
      depth--
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return cleaned.slice(start)
}

function tryParseSummaryObject(jsonStr: string): {
  title?: string
  overview?: string
  sections?: { heading?: string; bullets?: string[] }[]
} | null {
  for (const candidate of [jsonStr, repairJsonLike(jsonStr)]) {
    try {
      return JSON.parse(candidate) as {
        title?: string
        overview?: string
        sections?: { heading?: string; bullets?: string[] }[]
      }
    } catch {
      /* try repaired */
    }
  }
  return null
}

function normalizeSummary(parsed: {
  title?: string
  overview?: string
  sections?: { heading?: string; bullets?: string[] }[]
}): { title: string; overview: string; sections: SummarySection[] } {
  const title = (parsed.title ?? '').trim().slice(0, 100) || '会议记录'
  const overview = (parsed.overview ?? '').trim()
  const sections: SummarySection[] = (parsed.sections ?? [])
    .map((s) => ({
      heading: (s.heading ?? '').trim(),
      bullets: (s.bullets ?? []).map((b) => String(b).trim()).filter(Boolean),
    }))
    .filter((s) => s.heading && s.bullets.length > 0)
  return { title, overview, sections }
}

function parseSummaryJson(raw: string): {
  title: string
  overview: string
  sections: SummarySection[]
} {
  const jsonStr = extractJsonObject(raw) ?? stripCodeFences(raw)
  const parsed = tryParseSummaryObject(jsonStr)
  if (!parsed) {
    throw new Error('INVALID_SUMMARY_JSON')
  }
  const result = normalizeSummary(parsed)
  if (!result.overview && result.sections.length === 0) {
    throw new Error('INVALID_SUMMARY_JSON')
  }
  return result
}

function splitTranscript(text: string, maxLen: number): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return [trimmed]
  const parts: string[] = []
  let rest = trimmed
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen)
    if (cut < maxLen * 0.5) cut = maxLen
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

async function streamToText(
  providerName: string,
  model: string,
  userContent: string,
): Promise<string> {
  const provider = createProvider(providerName)
  const stream = await provider.chat(
    [
      { role: 'system', content: SUMMARY_SYSTEM },
      { role: 'user', content: userContent },
    ],
    model,
  )
  let out = ''
  for await (const chunk of stream) {
    out += chunk.result
    if (chunk.is_end) break
  }
  return out.trim()
}

async function summarizeChunk(
  providerName: string,
  model: string,
  transcript: string,
  hint?: string,
): Promise<{ title: string; overview: string; sections: SummarySection[] }> {
  const prefix = hint
    ? `以下是会议转写的${hint}，请总结：\n\n`
    : '以下是会议转写全文，请总结：\n\n'
  const userContent = prefix + transcript
  const raw = await streamToText(providerName, model, userContent)
  try {
    return parseSummaryJson(raw)
  } catch {
    const retryRaw = await streamToText(
      providerName,
      model,
      `${userContent}\n\n【重要】你上一轮的输出不是合法 JSON（常见错误：数组末尾多余逗号、未转义的双引号）。请重新输出，且只输出一个可被 JSON.parse 解析的对象，不要 markdown。`,
    )
    return parseSummaryJson(retryRaw)
  }
}

export async function summarizeMeeting(
  win: BrowserWindow,
  payload: {
    meetingId: number
    providerName: string
    selectedModel: string
    transcript: string
  },
): Promise<{ title: string; overview: string; sections: SummarySection[] }> {
  const { meetingId, providerName, selectedModel, transcript } = payload
  const trimmed = transcript.trim()
  if (!trimmed) {
    throw new Error('EMPTY_TRANSCRIPT')
  }

  const sendChunk = (partial: string) => {
    win.webContents.send('meeting-summary-chunk', { meetingId, partial })
  }

  if (trimmed.length <= SINGLE_PASS_MAX) {
    sendChunk('正在生成总结…')
    const result = await summarizeChunk(providerName, selectedModel, trimmed)
    win.webContents.send('meeting-summary-done', { meetingId, ...result })
    return result
  }

  const chunks = splitTranscript(trimmed, CHUNK_SIZE)
  const partialSummaries: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    sendChunk(`正在总结第 ${i + 1}/${chunks.length} 段…`)
    const part = await summarizeChunk(
      providerName,
      selectedModel,
      chunks[i],
      `第 ${i + 1}/${chunks.length} 段`,
    )
    partialSummaries.push(
      `## ${part.title}\n${part.overview}\n${part.sections.map((s) => `- ${s.heading}: ${s.bullets.join('；')}`).join('\n')}`,
    )
  }

  sendChunk('正在合并总结…')
  const merged = await summarizeChunk(
    providerName,
    selectedModel,
    partialSummaries.join('\n\n'),
    '分段小结（请合并为一份完整会议总结）',
  )
  win.webContents.send('meeting-summary-done', { meetingId, ...merged })
  return merged
}
