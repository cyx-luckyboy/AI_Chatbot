import { createProvider } from '../../providers/createProvider'
import { buildTranslatePromptForModel } from '../media/translatePrompt'
import { translateTextMain } from '../media/translateMain'
import type { MeetingTranslatePayload, TranslateTextResult } from '../../shared/types'

const CHUNK_SIZE = 4000
const LLM_TIMEOUT_MS = 90_000

function splitForTranslate(text: string, maxLen: number): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return [trimmed]
  const parts: string[] = []
  let rest = trimmed
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen)
    if (cut < maxLen * 0.4) cut = maxLen
    const piece = rest.slice(0, cut).trim()
    if (piece) parts.push(piece)
    rest = rest.slice(cut).trimStart()
    if (!rest) break
  }
  if (rest) parts.push(rest)
  return parts.length > 0 ? parts : [trimmed]
}

async function translateChunkWithLlm(
  text: string,
  providerName: string,
  model: string,
  target: MeetingTranslatePayload['target'],
  uiLang: 'zh' | 'en',
): Promise<string | null> {
  try {
    const provider = createProvider(providerName)
    const content = buildTranslatePromptForModel(text, target, uiLang)
    const stream = await Promise.race([
      provider.chat([{ role: 'user', content }], model),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), LLM_TIMEOUT_MS)
      }),
    ])
    let out = ''
    for await (const chunk of stream) {
      out += chunk.result
      if (chunk.is_end) break
    }
    const trimmed = out.trim()
    return trimmed || null
  } catch {
    return null
  }
}

export async function meetingTranslateMain(payload: MeetingTranslatePayload): Promise<TranslateTextResult> {
  const raw = payload.text.trim()
  if (!raw) return { ok: false, error: 'EMPTY' }
  if (!payload.providerName?.trim() || !payload.selectedModel?.trim()) {
    return { ok: false, error: 'NO_PROVIDER' }
  }

  const chunks = splitForTranslate(raw, CHUNK_SIZE)
  const parts: string[] = []

  for (const chunk of chunks) {
    let translated = await translateChunkWithLlm(
      chunk,
      payload.providerName,
      payload.selectedModel,
      payload.target,
      payload.uiLang,
    )
    if (!translated) {
      const fallback = await translateTextMain(chunk, payload.target)
      if (!fallback.ok) return fallback
      translated = fallback.text
    }
    parts.push(translated)
  }

  return { ok: true, text: parts.join('\n\n') }
}
