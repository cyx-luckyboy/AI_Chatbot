import { createProvider } from '../../providers/createProvider'
import type { SuggestConversationTitlePayload, SuggestConversationTitleResult } from '../../shared/types'

const TIMEOUT_MS = 45_000
const MAX_TITLE_LEN = 28

function buildPrompt(
  messages: SuggestConversationTitlePayload['messages'],
  uiLang: 'zh' | 'en',
): string {
  const lines = messages
    .slice(0, 6)
    .map((m) => {
      const role = m.role === 'user' ? (uiLang === 'zh' ? '用户' : 'User') : uiLang === 'zh' ? '助手' : 'Assistant'
      const body = String(m.content || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400)
      return `${role}: ${body}`
    })
    .filter((l) => l.length > 4)
    .join('\n')

  if (uiLang === 'zh') {
    return [
      '根据下面的对话，生成一个简短中文会话标题。',
      '要求：不超过 16 个字；概括主题；不要引号、书名号、句号或冒号；不要前缀如「标题：」；只输出标题本身。',
      '',
      lines || '（空对话）',
    ].join('\n')
  }
  return [
    'Write a short English chat title for the dialogue below.',
    'Rules: at most 6 words; capture the topic; no quotes or trailing punctuation; no prefix like "Title:"; output only the title.',
    '',
    lines || '(empty)',
  ].join('\n')
}

export function sanitizeConversationTitle(raw: string, fallback: string): string {
  let t = String(raw || '')
    .replace(/^[\s"'「」『』【】《》]+|[\s"'「」『』【】《》.。!！?？:：;；]+$/g, '')
    .replace(/^(标题|Title)\s*[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) t = fallback
  if (t.length > MAX_TITLE_LEN) t = t.slice(0, MAX_TITLE_LEN).trim()
  return t || fallback || 'Chat'
}

function fallbackFromMessages(messages: SuggestConversationTitlePayload['messages']): string {
  const firstUser = messages.find((m) => m.role === 'user')?.content || ''
  return sanitizeConversationTitle(firstUser.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LEN), 'Chat')
}

export async function suggestConversationTitleMain(
  payload: SuggestConversationTitlePayload,
): Promise<SuggestConversationTitleResult> {
  const providerName = String(payload.providerName || '').trim()
  const model = String(payload.selectedModel || '').trim()
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const uiLang = payload.uiLang === 'en' ? 'en' : 'zh'
  const fallback = fallbackFromMessages(messages)

  if (!providerName || !model) {
    return { ok: true, title: fallback, source: 'fallback' }
  }
  if (!messages.some((m) => String(m.content || '').trim())) {
    return { ok: false, error: 'EMPTY' }
  }

  try {
    const provider = createProvider(providerName)
    const content = buildPrompt(messages, uiLang)
    const stream = await Promise.race([
      provider.chat([{ role: 'user', content }], model),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      }),
    ])
    let out = ''
    for await (const chunk of stream) {
      out += chunk.result || ''
      if (chunk.is_end) break
    }
    const title = sanitizeConversationTitle(out.split('\n')[0] || out, fallback)
    return { ok: true, title, source: 'ai' }
  } catch (e) {
    return {
      ok: true,
      title: fallback,
      source: 'fallback',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
