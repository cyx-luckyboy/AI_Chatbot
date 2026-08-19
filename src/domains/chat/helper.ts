import fs from 'fs/promises'
import path from 'node:path'
import { lookup } from 'mime-types'
/** 勿用包入口 `pdf-parse`：其 index 在 `!module.parent` 时会读 `./test/data/...`，Vite 打进主进程后 module.parent 常为空，启动即 ENOENT。须用 ESM import，否则 Rollup 会留下运行时 `require`，打包后无 node_modules 即崩。 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import type { ChatMessageProps } from '../../shared/types'

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
/** PDF 抽取上限，防止超大文件拖垮主进程内存 */
const MAX_PDF_BYTES = 25 * 1024 * 1024
/** Word .docx 抽取上限 */
const MAX_DOCX_BYTES = 25 * 1024 * 1024
/** PowerPoint .pptx 抽取上限（与附件导入上限一致） */
const MAX_PPTX_BYTES = 50 * 1024 * 1024

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

function isPdfFile(mime: string | false, fileName: string): boolean {
  if (mime && /^application\/pdf$/i.test(mime)) return true
  return /\.pdf$/i.test(fileName)
}

function isDocxFile(mime: string | false, fileName: string): boolean {
  if (
    mime &&
    /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i.test(mime)
  ) {
    return true
  }
  return /\.docx$/i.test(fileName)
}

function isPptxFile(mime: string | false, fileName: string): boolean {
  if (
    mime &&
    /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/i.test(mime)
  ) {
    return true
  }
  return /\.pptx$/i.test(fileName)
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** 从 slide/notes 等 OOXML 片段抽取 <a:t> 文本 */
function extractATextFromOoxml(xml: string): string {
  const lines: string[] = []
  const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const t = decodeXmlEntities(m[1].replace(/<[^>]+>/g, '')).trim()
    if (t) lines.push(t)
  }
  return lines.join('\n')
}

function slideNumberFromPath(entryPath: string): number {
  const slide = /\/slides\/slide(\d+)\.xml$/i.exec(entryPath)
  if (slide) return parseInt(slide[1], 10)
  const notes = /\/notesSlides\/notesSlide(\d+)\.xml$/i.exec(entryPath)
  if (notes) return parseInt(notes[1], 10)
  return 0
}

async function extractPptxPlainText(buffer: Buffer): Promise<{ text: string } | { error: string }> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const slideEntries = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name) && !zip.files[name].dir)
      .sort((a, b) => slideNumberFromPath(a) - slideNumberFromPath(b))

    const notesBySlide = new Map<number, string>()
    for (const name of Object.keys(zip.files)) {
      if (!/^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name) || zip.files[name].dir) continue
      const n = slideNumberFromPath(name)
      const xml = await zip.files[name].async('string')
      const noteText = extractATextFromOoxml(xml).trim()
      if (noteText) notesBySlide.set(n, noteText)
    }

    const sections: string[] = []
    for (const entry of slideEntries) {
      const n = slideNumberFromPath(entry)
      const xml = await zip.files[entry].async('string')
      const body = extractATextFromOoxml(xml).trim()
      const note = notesBySlide.get(n)
      let block = body
      if (note) {
        block = block ? `${body}\n\n【备注】\n${note}` : `【备注】\n${note}`
      }
      if (block) {
        sections.push(`--- 第 ${n} 页 ---\n${block}`)
      }
    }

    if (!sections.length) {
      return {
        error:
          '未能从 PPTX 中提取到文本（可能为空、仅含图片/图表、加密或损坏；旧版 .ppt 请先另存为 .pptx）。',
      }
    }
    return { text: sections.join('\n\n') }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
}

/** 附件路径可能是 Electron 落盘的绝对路径，或浏览器预览里存的 data URL */
async function readBinaryFromPathOrDataUrl(filePath: string): Promise<{ buffer: Buffer; dataUrlMime: string | null }> {
  if (filePath.startsWith('data:')) {
    const comma = filePath.indexOf(',')
    if (comma === -1) throw new Error('无效的 data URL')
    const header = filePath.slice(0, comma).trim()
    const payload = filePath.slice(comma + 1)
    const mimeMatch = /^data:([^;]+)/i.exec(header)
    const mime = mimeMatch?.[1]?.trim() || 'application/octet-stream'
    const isBase64 = /;base64/i.test(header)
    const buffer = isBase64
      ? Buffer.from(payload.replace(/\s/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8')
    return { buffer, dataUrlMime: mime }
  }
  const buffer = await fs.readFile(filePath)
  return { buffer, dataUrlMime: null }
}

async function extractDocxPlainText(buffer: Buffer): Promise<{ text: string } | { error: string }> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    const text = (result.value ?? '').trim()
    if (!text) {
      return {
        error: '未能从 Word 文档中提取到文本（可能为空、加密或文件损坏；旧版 .doc 请先另存为 .docx）。',
      }
    }
    return { text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
}

async function extractPdfPlainText(buffer: Buffer): Promise<{ text: string } | { error: string }> {
  try {
    const result = await pdfParse(buffer)
    const text = (result.text ?? '').trim()
    if (!text) {
      return {
        error:
          '未能从 PDF 中提取到可读文本（常见于纯扫描件/图片型发票，需 OCR；也可尝试导出为文本型 PDF 后重试）。',
      }
    }
    return { text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
}

type ContentPart = { type: string; text?: string; image_url?: { url: string } }

export async function convertMessages(messages: ChatMessageProps[]) {
  const convertedMessages = []
  for (const message of messages) {
    const parts: ContentPart[] = []
    const role =
      message.role === 'assistant'
        ? 'assistant'
        : message.role === 'system'
          ? 'system'
          : 'user'
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
      const mime = filePath.startsWith('data:') ? false : lookup(filePath)
      const treatAsImage =
        isImageFile(mime, name) || /^data:image\//i.test(filePath)
      if (treatAsImage) {
        try {
          const { buffer, dataUrlMime } = await readBinaryFromPathOrDataUrl(filePath)
          if (buffer.length > MAX_IMAGE_BYTES) {
            parts.push({
              type: 'text',
              text: `【附件: ${name}】图片约 ${Math.round(buffer.length / 1024 / 1024)}MB，超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 内联上限，已跳过以免请求卡死。请压缩或缩小分辨率后重发。`,
            })
            continue
          }
          const mimeType =
            (dataUrlMime && dataUrlMime.startsWith('image/') ? dataUrlMime : null) ||
            (mime && String(mime).startsWith('image/') ? String(mime) : null) ||
            'image/png'
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${buffer.toString('base64')}`,
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
      } else if (isPdfFile(mime, name)) {
        try {
          const st = await fs.stat(filePath)
          if (st.size > MAX_PDF_BYTES) {
            parts.push({
              type: 'text',
              text: `【附件: ${name}】PDF 约 ${Math.round(st.size / 1024 / 1024)}MB，超过 ${MAX_PDF_BYTES / 1024 / 1024}MB 解析上限，已跳过。请压缩或拆分后重试。`,
            })
          } else {
            const buf = await fs.readFile(filePath)
            const extracted = await extractPdfPlainText(buf)
            if ('error' in extracted) {
              parts.push({
                type: 'text',
                text: `【附件: ${name}】PDF 解析：${extracted.error}`,
              })
            } else {
              const raw = extracted.text
              const clipped =
                raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n…(已截断)` : raw
              parts.push({
                type: 'text',
                text: `【附件: ${name}】以下为从 PDF 抽取的正文文本，版式可能与原件不完全一致；若为扫描件可能无内容。\n${clipped}`,
              })
            }
          }
        } catch (e) {
          parts.push({
            type: 'text',
            text: `【附件: ${name}】（读取或解析 PDF 失败：${e instanceof Error ? e.message : String(e)}）`,
          })
        }
      } else if (isDocxFile(mime, name)) {
        try {
          const { buffer } = await readBinaryFromPathOrDataUrl(filePath)
          if (buffer.length > MAX_DOCX_BYTES) {
            parts.push({
              type: 'text',
              text: `【附件: ${name}】约 ${Math.round(buffer.length / 1024 / 1024)}MB，超过 ${MAX_DOCX_BYTES / 1024 / 1024}MB 解析上限，已跳过。请压缩或拆分后重试。`,
            })
          } else {
            const extracted = await extractDocxPlainText(buffer)
            if ('error' in extracted) {
              parts.push({
                type: 'text',
                text: `【附件: ${name}】Word 解析：${extracted.error}`,
              })
            } else {
              const raw = extracted.text
              const clipped =
                raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n…(已截断)` : raw
              parts.push({
                type: 'text',
                text: `【附件: ${name}】以下为从 .docx 抽取的纯文本，表格/复杂排版可能简化。\n${clipped}`,
              })
            }
          }
        } catch (e) {
          parts.push({
            type: 'text',
            text: `【附件: ${name}】（读取或解析 Word 失败：${e instanceof Error ? e.message : String(e)}）`,
          })
        }
      } else if (isPptxFile(mime, name)) {
        try {
          const { buffer } = await readBinaryFromPathOrDataUrl(filePath)
          if (buffer.length > MAX_PPTX_BYTES) {
            parts.push({
              type: 'text',
              text: `【附件: ${name}】约 ${Math.round(buffer.length / 1024 / 1024)}MB，超过 ${MAX_PPTX_BYTES / 1024 / 1024}MB 解析上限，已跳过。请压缩或拆分后重试。`,
            })
          } else {
            const extracted = await extractPptxPlainText(buffer)
            if ('error' in extracted) {
              parts.push({
                type: 'text',
                text: `【附件: ${name}】PPTX 解析：${extracted.error}`,
              })
            } else {
              const raw = extracted.text
              const clipped =
                raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n…(已截断)` : raw
              parts.push({
                type: 'text',
                text: `【附件: ${name}】以下为从 .pptx 按幻灯片顺序抽取的文本（图表/ SmartArt 等可能无文字）；含演讲者备注。\n${clipped}`,
              })
            }
          }
        } catch (e) {
          parts.push({
            type: 'text',
            text: `【附件: ${name}】（读取或解析 PowerPoint 失败：${e instanceof Error ? e.message : String(e)}）`,
          })
        }
      } else {
        parts.push({
          type: 'text',
          text: `【附件: ${name}】（非文本或未识别类型，未内联全文；可描述你需要从此文件了解的内容）`,
        })
      }
    }

    const imageParts = parts.filter((p) => p.type === 'image_url')
    const nonImageParts = parts.filter((p) => p.type !== 'image_url')
    /** 视觉模型普遍对「先图后文」更稳；纯图无字时补一句占位，避免部分网关拒收纯 image 块 */
    let orderedParts: ContentPart[] =
      role === 'user' ? [...imageParts, ...nonImageParts] : [...nonImageParts, ...imageParts]
    if (
      role === 'user' &&
      imageParts.length > 0 &&
      !orderedParts.some((p) => p.type === 'text' && (p.text ?? '').trim())
    ) {
      orderedParts = [...imageParts, { type: 'text', text: '请结合图片回答问题。' }, ...nonImageParts]
    }

    let convertedContent: string | ContentPart[]
    if (orderedParts.length === 0) {
      convertedContent = ''
    } else if (orderedParts.length === 1 && orderedParts[0].type === 'text') {
      convertedContent = orderedParts[0].text ?? ''
    } else {
      convertedContent = orderedParts
    }

    convertedMessages.push({
      role: message.role,
      content: convertedContent,
    })
  }
  return convertedMessages
}
