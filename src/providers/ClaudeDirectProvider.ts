import { BaseProvider } from './BaseProvider'
import { ChatMessageProps, UniversalChunkProps } from '../types'
import { convertMessages } from '../helper'

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
    const anthropicMessages = toAnthropicMessages(converted)
    const url = resolveClaudePostUrl(this.endpointUrl)

    const res = await fetch(url, {
      method: 'POST',
      headers: buildClaudeHeaders(this.apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 8192,
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
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

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
