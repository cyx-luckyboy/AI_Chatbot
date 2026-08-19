import OpenAI from 'openai'
import { BaseProvider } from './BaseProvider'
import { ChatMessageProps, UniversalChunkProps } from '../shared/types'
import { convertMessages, normalizeOpenAICompatibleBaseURL } from '../domains/chat/helper'

export type AgentToolCallDelta = {
  id: string
  name: string
  arguments: string
}

export type ChatWithToolsResult = {
  content: string
  toolCalls: AgentToolCallDelta[]
  finishReason: string | null
}

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

  /** 非流式工具调用轮次（本机 Agent）；messages 为 OpenAI 原生格式 */
  async chatWithTools(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    model: string,
    tools: OpenAI.Chat.ChatCompletionTool[],
    toolChoice: 'auto' | 'required' = 'auto',
  ): Promise<ChatWithToolsResult> {
    const resp = await this.client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: toolChoice,
      stream: false,
    })
    const choice = resp.choices?.[0]
    const msg = choice?.message as
      | (OpenAI.Chat.ChatCompletionMessage & {
          function_call?: { name?: string; arguments?: string }
        })
      | undefined
    const toolCalls: AgentToolCallDelta[] = []

    for (const tc of msg?.tool_calls ?? []) {
      const anyTc = tc as {
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
        name?: string
        arguments?: string
      }
      const name = anyTc.function?.name || anyTc.name || ''
      const args = anyTc.function?.arguments || anyTc.arguments || ''
      if (!name) continue
      toolCalls.push({
        id: anyTc.id || `call_${toolCalls.length + 1}`,
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
      })
    }

    // 旧版 function_call
    if (!toolCalls.length && msg?.function_call?.name) {
      toolCalls.push({
        id: 'call_function',
        name: msg.function_call.name,
        arguments: msg.function_call.arguments || '{}',
      })
    }

    return {
      content: typeof msg?.content === 'string' ? msg.content : '',
      toolCalls,
      finishReason: choice?.finish_reason ?? null,
    }
  }

  /** 将 ChatMessageProps 转为 OpenAI messages（含附件文本展开） */
  async toOpenAIMessages(
    messages: ChatMessageProps[],
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    return (await convertMessages(messages)) as OpenAI.Chat.ChatCompletionMessageParam[]
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