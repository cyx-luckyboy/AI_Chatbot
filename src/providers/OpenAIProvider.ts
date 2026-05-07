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

    const delta = choice.delta as {
      content?: string | Array<{ type?: string; text?: string }>
      refusal?: string | null
    }
    let result = ''
    if (typeof delta?.content === 'string') {
      result = delta.content
    } else if (Array.isArray(delta?.content)) {
      for (const part of delta.content) {
        if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
          result += part.text
        }
      }
    }
    if (!result && typeof delta?.refusal === 'string' && delta.refusal) {
      result = delta.refusal
    }

    return {
      is_end,
      result,
    }
  }
}