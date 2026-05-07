import fs from 'fs/promises'
import path from 'node:path'
import { lookup } from 'mime-types'
import type { ChatMessageProps } from './types'

/** OpenAI JS SDK 会把请求发到 `${baseURL}/chat/completions`，因此 baseURL 须指向 …/v1。 */
export function normalizeOpenAICompatibleBaseURL(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) return trimmed
  if (/\/v1$/i.test(trimmed)) return trimmed
  return `${trimmed}/v1`
}

const MAX_TEXT_CHARS = 120_000
/** 单张内联图超过此大小极易导致请求极慢或网关无响应 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const TEXT_MIME_RE =
  /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|yaml|x-yaml|sql|graphql))/

function isTextLikeFile(mime: string | false, fileName: string): boolean {
  if (mime && TEXT_MIME_RE.test(mime)) return true
  return /\.(txt|md|mdx|json|csv|ts|tsx|vue|js|cjs|mjs|jsx|html?|css|yaml|yml|xml|log|env|sh|ps1|bat|properties|toml|ini|gitignore)$/i.test(
    fileName,
  )
}

function isImageFile(mime: string | false, fileName: string): boolean {
  if (mime && mime.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName)
}

type ContentPart = { type: string; text?: string; image_url?: { url: string } }

export async function convertMessages(messages: ChatMessageProps[]) {
  const convertedMessages = []
  for (const message of messages) {
    const parts: ContentPart[] = []
    const text = (message.content ?? '').trim()
    if (text) {
      parts.push({ type: 'text', text })
    }

    const seenPaths = new Set<string>()
    const fileList: { path: string; name: string }[] = []
    for (const a of message.attachments ?? []) {
      if (a.path && !seenPaths.has(a.path)) {
        seenPaths.add(a.path)
        fileList.push({ path: a.path, name: a.name || path.basename(a.path) })
      }
    }
    if (message.imagePath && !seenPaths.has(message.imagePath)) {
      fileList.push({
        path: message.imagePath,
        name: path.basename(message.imagePath),
      })
    }

    for (const { path: filePath, name } of fileList) {
      const mime = lookup(filePath)
      if (isImageFile(mime, name)) {
        try {
          const st = await fs.stat(filePath)
          if (st.size > MAX_IMAGE_BYTES) {
            parts.push({
              type: 'text',
              text: `【附件: ${name}】图片约 ${Math.round(st.size / 1024 / 1024)}MB，超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 内联上限，已跳过以免请求卡死。请压缩或缩小分辨率后重发。`,
            })
            continue
          }
          const imageBuffer = await fs.readFile(filePath)
          const base64Image = imageBuffer.toString('base64')
          const mimeType = mime || 'image/png'
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          })
        } catch (e) {
          parts.push({
            type: 'text',
            text: `【附件: ${name}】（读取图片失败：${e instanceof Error ? e.message : String(e)}）`,
          })
        }
      } else if (isTextLikeFile(mime, name)) {
        try {
          const raw = await fs.readFile(filePath, 'utf8')
          const clipped = raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n…(已截断)` : raw
          parts.push({
            type: 'text',
            text: `【附件: ${name}】\n${clipped}`,
          })
        } catch {
          parts.push({
            type: 'text',
            text: `【附件: ${name}】（无法按 UTF-8 读取）`,
          })
        }
      } else {
        parts.push({
          type: 'text',
          text: `【附件: ${name}】（非文本或未识别类型，未内联全文；可描述你需要从此文件了解的内容）`,
        })
      }
    }

    let convertedContent: string | ContentPart[]
    if (parts.length === 0) {
      convertedContent = ''
    } else if (parts.length === 1 && parts[0].type === 'text') {
      convertedContent = parts[0].text ?? ''
    } else {
      convertedContent = parts
    }

    convertedMessages.push({
      role: message.role,
      content: convertedContent,
    })
  }
  return convertedMessages
}
