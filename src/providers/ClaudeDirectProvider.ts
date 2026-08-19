import { BaseProvider } from './BaseProvider'
import { ChatMessageProps, UniversalChunkProps } from '../shared/types'
import { convertMessages } from '../domains/chat/helper'
import type { AgentToolCallDelta, ChatWithToolsResult } from './OpenAIProvider'
import { toAnthropicToolDefinitions } from '../domains/workspace/agentToolRuntime'
import type OpenAI from 'openai'

type AnthropicRole = 'user' | 'assistant'

/**
 * 环境变量（主进程 / .env，与 main.ts 的 dotenv 一致）：
 * - ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY：可与设置页二选一，设置页优先
 * - ANTHROPIC_API_PATH：仅 host 无路径时追加的路径，默认 /v1/messages
 * - ANTHROPIC_AUTH：x-api-key（默认）| bearer（Authorization: Bearer）
 * - ANTHROPIC_SKIP_VERSION=1：不发送 anthropic-version 头（部分自建网关会拒）
 * - ANTHROPIC_VERSION：覆盖默认 2023-06-01
 */
function resolveClaudePostUrl(input: string): string {
  const trimmed = input.trim()
  const rawPath = (process.env.ANTHROPIC_API_PATH || '/v1/messages').trim()
  const defaultPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  try {
    const u = new URL(trimmed)
    if (!u.pathname || u.pathname === '/') {
      u.pathname = defaultPath
    }
    return u.toString()
  } catch {
    throw new Error(`无效的 Base URL：${trimmed}`)
  }
}

function buildClaudeHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  }
  const mode = (process.env.ANTHROPIC_AUTH || 'x-api-key').toLowerCase()
  if (mode === 'bearer' || mode === 'authorization') {
    h.authorization = `Bearer ${apiKey}`
  } else {
    h['x-api-key'] = apiKey
  }
  if (process.env.ANTHROPIC_SKIP_VERSION !== '1') {
    h['anthropic-version'] = process.env.ANTHROPIC_VERSION || '2023-06-01'
  }
  return h
}

/**
 * 向 Base URL 发 Anthropic Messages 流式请求（非 OpenAI chat/completions）。
 * 仅 origin 时追加 ANTHROPIC_API_PATH 或 /v1/messages。
 */
export class ClaudeDirectProvider extends BaseProvider {
  constructor(
    private readonly apiKey: string,
    private readonly endpointUrl: string,
  ) {
    super()
  }

  protected transformResponse(chunk: UniversalChunkProps): UniversalChunkProps {
    return chunk
  }

  async chat(messages: ChatMessageProps[], model: string) {
    const converted = await convertMessages(messages)
    const systemChunks: string[] = []
    const dialog: typeof converted = []
    for (const m of converted) {
      if (m.role === 'system' && typeof m.content === 'string' && m.content.trim()) {
        systemChunks.push(m.content.trim())
      } else if (m.role !== 'system') {
        dialog.push(m)
      }
    }
    const system = systemChunks.length > 0 ? systemChunks.join('\n\n') : undefined
    const anthropicMessages = toAnthropicMessages(dialog)
    const url = resolveClaudePostUrl(this.endpointUrl)

    const res = await fetch(url, {
      method: 'POST',
      headers: buildClaudeHeaders(this.apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        ...(system ? { system } : {}),
        messages: anthropicMessages,
        stream: true,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText}${errText ? `: ${errText.slice(0, 500)}` : ''}`)
    }

    const body = res.body
    if (!body) {
      throw new Error('响应无 body')
    }

    return {
      async *[Symbol.asyncIterator]() {
        let sawEnd = false
        for await (const chunk of parseAnthropicSse(body)) {
          if (chunk.is_end) sawEnd = true
          yield chunk
        }
        // 部分网关/代理不推 message_stop，流关闭后 UI 会一直 streaming
        if (!sawEnd) {
          yield { is_end: true, result: '' }
        }
      },
    }
  }

  async toOpenAIMessages(
    messages: ChatMessageProps[],
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    return (await convertMessages(messages)) as OpenAI.Chat.ChatCompletionMessageParam[]
  }

  /** 非流式工具调用；messages 沿用 OpenAI 风格以便 Agent 循环共用 */
  async chatWithTools(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    model: string,
    _tools: OpenAI.Chat.ChatCompletionTool[],
    toolChoice: 'auto' | 'required' = 'auto',
  ): Promise<ChatWithToolsResult> {
    const systemChunks: string[] = []
    const dialog: OpenAI.Chat.ChatCompletionMessageParam[] = []
    for (const m of messages) {
      if (m.role === 'system') {
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        if (c.trim()) systemChunks.push(c.trim())
      } else {
        dialog.push(m)
      }
    }

    const anthropicMessages = openAIMessagesToAnthropicTools(dialog)
    const url = resolveClaudePostUrl(this.endpointUrl)
    const tools = toAnthropicToolDefinitions()

    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      ...(systemChunks.length ? { system: systemChunks.join('\n\n') } : {}),
      messages: anthropicMessages,
      tools,
      tool_choice: toolChoice === 'required' ? { type: 'any' } : { type: 'auto' },
      stream: false,
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: buildClaudeHeaders(this.apiKey),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText}${errText ? `: ${errText.slice(0, 500)}` : ''}`)
    }

    const data = (await res.json()) as {
      content?: unknown[]
      stop_reason?: string
    }
    const toolCalls: AgentToolCallDelta[] = []
    const textParts: string[] = []
    for (const raw of data.content ?? []) {
      if (!raw || typeof raw !== 'object') continue
      const block = raw as Record<string, unknown>
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text)
      }
      if (block.type === 'tool_use') {
        const name = typeof block.name === 'string' ? block.name : ''
        if (!name) continue
        toolCalls.push({
          id: typeof block.id === 'string' ? block.id : `tool_${toolCalls.length + 1}`,
          name,
          arguments: JSON.stringify(block.input ?? {}),
        })
      }
    }

    return {
      content: textParts.join('\n'),
      toolCalls,
      finishReason: data.stop_reason ?? null,
    }
  }
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function parseDataUrlImage(url: string): { media_type: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/is.exec(url.replace(/\s/g, ''))
  if (!m) return null
  return { media_type: m[1].trim() || 'image/png', data: m[2].trim() }
}

function openAIBlocksToAnthropic(content: unknown[]): AnthropicBlock[] {
  const blocks: AnthropicBlock[] = []
  for (const raw of content) {
    const part = raw as { type?: string; text?: string; image_url?: { url?: string } }
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      blocks.push({ type: 'text', text: part.text })
    }
    if (part.type === 'image_url' && part.image_url?.url) {
      const parsed = parseDataUrlImage(part.image_url.url)
      if (parsed) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: parsed.media_type, data: parsed.data },
        })
      }
    }
  }
  return blocks
}

/** 将 Agent 循环中的 OpenAI 消息（含 tool）转为 Anthropic Messages */
function openAIMessagesToAnthropicTools(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): { role: AnthropicRole; content: string | AnthropicBlock[] }[] {
  const out: { role: AnthropicRole; content: string | AnthropicBlock[] }[] = []

  for (const m of messages) {
    if (m.role === 'tool') {
      const toolMsg = m as OpenAI.Chat.ChatCompletionToolMessageParam
      const block: AnthropicBlock = {
        type: 'tool_result',
        tool_use_id: toolMsg.tool_call_id,
        content: typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content),
      }
      const last = out[out.length - 1]
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (m.role === 'assistant') {
      const blocks: AnthropicBlock[] = []
      if (typeof m.content === 'string' && m.content.trim()) {
        blocks.push({ type: 'text', text: m.content })
      }
      if ('tool_calls' in m && m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          if (!('function' in tc)) continue
          let input: unknown = {}
          try {
            input = JSON.parse(tc.function.arguments || '{}')
          } catch {
            input = { raw: tc.function.arguments }
          }
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input,
          })
        }
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : '' })
      continue
    }

    if (m.role === 'user') {
      let payload: string | AnthropicBlock[]
      if (typeof m.content === 'string') {
        payload = m.content
      } else if (Array.isArray(m.content)) {
        payload = openAIBlocksToAnthropic(m.content)
        if (payload.length === 0) payload = ''
      } else {
        payload = ''
      }
      out.push({ role: 'user', content: payload })
    }
  }

  return out
}

/** Anthropic Messages API：支持纯文本或多模态块（含 base64 图）。 */
function toAnthropicMessages(
  converted: Awaited<ReturnType<typeof convertMessages>>,
): { role: AnthropicRole; content: string | AnthropicBlock[] }[] {
  const out: { role: AnthropicRole; content: string | AnthropicBlock[] }[] = []
  for (const m of converted) {
    const role: AnthropicRole = m.role === 'assistant' ? 'assistant' : 'user'
    let payload: string | AnthropicBlock[]
    if (typeof m.content === 'string') {
      payload = m.content
    } else if (Array.isArray(m.content)) {
      payload = openAIBlocksToAnthropic(m.content)
      if (payload.length === 0) {
        payload = ''
      }
    } else {
      payload = ''
    }

    const last = out[out.length - 1]
    const canMergeStrings =
      last &&
      last.role === role &&
      typeof last.content === 'string' &&
      typeof payload === 'string'
    if (canMergeStrings) {
      last.content = `${last.content}\n${payload}`
    } else {
      out.push({ role, content: payload })
    }
  }
  return out
}

async function* parseAnthropicSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<UniversalChunkProps> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''

    for (const raw of parts) {
      const line = raw.replace(/\r$/, '')
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
        continue
      }
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue

      let data: Record<string, unknown>
      try {
        data = JSON.parse(payload) as Record<string, unknown>
      } catch {
        continue
      }

      const isBlockDelta =
        currentEvent === 'content_block_delta' || data.type === 'content_block_delta'
      if (isBlockDelta) {
        const delta = data.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          // 允许空串片段，避免吞掉与后续块拼接时的边界
          if (delta.text.length > 0) {
            yield { is_end: false, result: delta.text }
          }
        }
      }

      if (currentEvent === 'message_delta' || data.type === 'message_delta') {
        const dr = data.delta as Record<string, unknown> | undefined
        const stop = dr?.stop_reason as string | undefined
        const s = typeof stop === 'string' ? stop.toLowerCase() : ''
        if (
          s === 'end_turn' ||
          s === 'max_tokens' ||
          s === 'stop_sequence' ||
          s === 'model_context_window_exceeded'
        ) {
          yield { is_end: true, result: '' }
        }
      }

      if (currentEvent === 'message_stop' || data.type === 'message_stop') {
        yield { is_end: true, result: '' }
      }

      if (data.type === 'error') {
        const err = data.error as Record<string, unknown> | undefined
        const msg = typeof err?.message === 'string' ? err.message : JSON.stringify(data)
        throw new Error(msg)
      }
    }
  }
}
