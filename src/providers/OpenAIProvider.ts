import OpenAI from 'openai'
import { BaseProvider } from './BaseProvider'
import { ChatMessageProps, UniversalChunkProps } from '../types'
import { convertMessages, normalizeOpenAICompatibleBaseURL } from '../helper'

/** 流式最后一帧可能带 length / tool_calls 等；仅判断 stop 会导致界面一直停在 loading */
const TERMINAL_FINISH_REASONS = new Set([
  'stop',
  'length',
  'content_filter',
  'tool_calls',
  'function_call',
])

/** 各厂商 OpenAI 兼容层 delta 字段差异大，统一抽取可见文本，避免只收到「.」或空白 */
function extractOpenAIChatDeltaText(delta: unknown): string {
  if (!delta || typeof delta !== 'object') return ''
  const d = delta as Record<string, unknown>
  const out: string[] = []

  const takeContent = (c: unknown) => {
    if (typeof c === 'string') {
      out.push(c)
      return
    }
    if (!Array.isArray(c)) return
    for (const part of c) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      const typ = p.type
      if (typ === 'text' || typ === 'output_text') {
        const text = p.text
        if (typeof text === 'string') out.push(text)
        else if (text && typeof text === 'object') {
          const v = (text as Record<string, unknown>).value
          if (typeof v === 'string') out.push(v)
        }
      }
    }
  }

  takeContent(d.content)

  const merged = out.join('')
  if (merged.length > 0) return merged

  const reasoning = d.reasoning_content ?? d.reasoning
  if (typeof reasoning === 'string' && reasoning.length > 0) return reasoning

  if (typeof d.refusal === 'string' && d.refusal.length > 0) return d.refusal

  return ''
}

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;
  constructor(apiKey: string, baseURL: string) {
    super()
    const root = normalizeOpenAICompatibleBaseURL(baseURL)
    this.client = new OpenAI({
      apiKey,
      baseURL: root,
    })
  }
  async chat(messages: ChatMessageProps[], model: string) {
    const convertedMessages = await convertMessages(messages)
    const stream = await this.client.chat.completions.create({
      model,
      messages: convertedMessages as any,
      stream: true
    })
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        let sawTerminal = false
        for await (const chunk of stream) {
          const out = self.transformResponse(chunk)
          if (out.is_end) sawTerminal = true
          yield out
        }
        if (!sawTerminal) {
          yield { is_end: true, result: '' }
        }
      }
    }
  }
  protected transformResponse(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): UniversalChunkProps {
    const choice = chunk.choices?.[0]
    if (!choice) {
      return { is_end: false, result: '' }
    }
    const frRaw = choice.finish_reason as string | null | undefined
    const fr = typeof frRaw === 'string' ? frRaw.toLowerCase() : ''
    const is_end = fr !== '' && TERMINAL_FINISH_REASONS.has(fr)

    const result = extractOpenAIChatDeltaText(choice.delta)

    return {
      is_end,
      result,
    }
  }
}