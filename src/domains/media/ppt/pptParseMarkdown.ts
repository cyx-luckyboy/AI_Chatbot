import { resolvePptThemeId, type PptThemeId } from './pptThemes'

export type PptSlideLayout =
  | 'cover'
  | 'toc'
  | 'bullets'
  | 'two-column'
  | 'section'
  | 'chart-bar'
  | 'chart-pie'
  | 'table'
  | 'flow'
  | 'image-right'
  | 'closing'

export type PptTableData = {
  headers: string[]
  rows: string[][]
}

export type PptChartData = {
  type: 'bar' | 'pie'
  labels: string[]
  values: number[]
  title?: string
}

export interface ParsedPptSlide {
  title: string
  bullets: string[]
  notes?: string
  backgroundPrompt?: string
  layout?: PptSlideLayout
  chart?: PptChartData
  table?: PptTableData
  imagePrompt?: string
  subtitle?: string
  isCover?: boolean
}

export interface ParsedPptDeck {
  deckTitle: string
  themeId: PptThemeId
  slides: ParsedPptSlide[]
}

const SLIDE_HEADING_RE =
  /^##\s*(?:(?:第\s*(\d+)\s*页|Slide\s*(\d+))\s*[：:]\s*)?(.+?)\s*$/i

const LAYOUT_ALIASES: Record<string, PptSlideLayout> = {
  cover: 'cover',
  封面: 'cover',
  toc: 'toc',
  目录: 'toc',
  bullets: 'bullets',
  要点: 'bullets',
  正文: 'bullets',
  'two-column': 'two-column',
  双栏: 'two-column',
  section: 'section',
  章节: 'section',
  过渡: 'section',
  'chart-bar': 'chart-bar',
  柱状图: 'chart-bar',
  bar: 'chart-bar',
  'chart-pie': 'chart-pie',
  饼图: 'chart-pie',
  pie: 'chart-pie',
  closing: 'closing',
  结尾: 'closing',
  致谢: 'closing',
  table: 'table',
  表格: 'table',
  flow: 'flow',
  流程: 'flow',
  步骤: 'flow',
  'image-right': 'image-right',
  图文: 'image-right',
  配图: 'image-right',
}

function stripMdInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function parseLayout(raw: string): PptSlideLayout | undefined {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-')
  return LAYOUT_ALIASES[key] ?? LAYOUT_ALIASES[raw.trim()]
}

function parseChartJson(raw: string): PptChartData | undefined {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const labels = Array.isArray(o.labels) ? o.labels.map(String) : []
    const values = Array.isArray(o.values)
      ? o.values.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
      : []
    if (!labels.length || labels.length !== values.length) return undefined
    const typeRaw = String(o.type || o.chart || 'bar').toLowerCase()
    const type: 'bar' | 'pie' = typeRaw.includes('pie') ? 'pie' : 'bar'
    return {
      type,
      labels,
      values,
      title: o.title ? String(o.title) : undefined,
    }
  } catch {
    return undefined
  }
}

const BACKGROUND_LINE_RE = /^【背景】|^【背景图】|^Background\s*(?:image)?:/i
const LAYOUT_LINE_RE = /^【版式】|^【布局】|^Layout\s*:/i
const CHART_LINE_RE = /^【图表】|^Chart\s*:/i
const THEME_LINE_RE = /^【主题】|^Theme\s*:/i
const SUBTITLE_LINE_RE = /^【副标题】|^Subtitle\s*:/i
const IMAGE_LINE_RE = /^【配图】|^【插图】|^Image\s*:/i

function parseTableFromBullets(bullets: string[]): PptTableData | undefined {
  if (bullets.length < 2) return undefined
  const pipeRows = bullets.filter((b) => b.includes('|'))
  if (pipeRows.length >= 2) {
    const rows = pipeRows.map((line) =>
      line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean),
    )
    const width = Math.max(...rows.map((r) => r.length))
    if (width >= 2) {
      const normalized = rows.map((r) => {
        while (r.length < width) r.push('')
        return r.slice(0, width)
      })
      return { headers: normalized[0], rows: normalized.slice(1) }
    }
  }
  const kv = bullets
    .map((b) => {
      const m = b.match(/^(.+?)[：:]\s*(.+)$/)
      return m ? ([m[1].trim(), m[2].trim()] as const) : null
    })
    .filter(Boolean) as [string, string][]
  if (kv.length >= 2) {
    return {
      headers: ['项目', '说明'],
      rows: kv.map(([k, v]) => [k, v]),
    }
  }
  return undefined
}

function parseSlideBody(block: string): {
  bullets: string[]
  notes?: string
  backgroundPrompt?: string
  layout?: PptSlideLayout
  chart?: PptChartData
  subtitle?: string
  imagePrompt?: string
} {
  const bullets: string[] = []
  const noteLines: string[] = []
  let backgroundPrompt: string | undefined
  let layout: PptSlideLayout | undefined
  let chart: PptChartData | undefined
  let subtitle: string | undefined
  let imagePrompt: string | undefined
  let inNotes = false

  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (BACKGROUND_LINE_RE.test(line)) {
      inNotes = false
      const rest = line
        .replace(/^【背景】\s*|^【背景图】\s*|^Background\s*(?:image)?:\s*/i, '')
        .trim()
      if (rest) backgroundPrompt = rest
      continue
    }
    if (LAYOUT_LINE_RE.test(line)) {
      inNotes = false
      const rest = line.replace(/^【版式】\s*|^【布局】\s*|^Layout\s*:\s*/i, '').trim()
      const parsed = parseLayout(rest)
      if (parsed) layout = parsed
      continue
    }
    if (CHART_LINE_RE.test(line)) {
      inNotes = false
      const rest = line.replace(/^【图表】\s*|^Chart\s*:\s*/i, '').trim()
      const parsed = parseChartJson(rest)
      if (parsed) chart = parsed
      continue
    }
    if (THEME_LINE_RE.test(line)) {
      continue
    }
    if (SUBTITLE_LINE_RE.test(line)) {
      inNotes = false
      subtitle = line.replace(/^【副标题】\s*|^Subtitle\s*:\s*/i, '').trim()
      continue
    }
    if (IMAGE_LINE_RE.test(line)) {
      inNotes = false
      imagePrompt = line.replace(/^【配图】\s*|^【插图】\s*|^Image\s*:\s*/i, '').trim()
      continue
    }
    if (/^【备注】|^演讲者备注|^Speaker notes?:/i.test(line)) {
      inNotes = true
      const rest = line.replace(/^【备注】\s*|^演讲者备注[：:]?\s*|^Speaker notes?:\s*/i, '').trim()
      if (rest) noteLines.push(rest)
      continue
    }
    if (inNotes) {
      noteLines.push(line)
      continue
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/) ?? line.match(/^\d+[.)]\s+(.+)$/)
    if (bullet) {
      bullets.push(stripMdInline(bullet[1]))
      continue
    }
    if (/^页面类型[：:]/i.test(line)) continue
    if (line.length > 0 && !line.startsWith('#')) {
      bullets.push(stripMdInline(line))
    }
  }

  return {
    bullets,
    notes: noteLines.length ? noteLines.join('\n') : undefined,
    backgroundPrompt,
    layout,
    chart,
    subtitle,
    imagePrompt,
  }
}

function parseDeckTheme(md: string): PptThemeId {
  const m = /^【主题】\s*(.+)$/im.exec(md) || /^Theme\s*:\s*(.+)$/im.exec(md)
  if (m) return resolvePptThemeId(m[1])
  return 'business'
}

function inferLayout(
  slide: ParsedPptSlide,
  index: number,
  total: number,
): PptSlideLayout | undefined {
  if (slide.layout) return slide.layout
  if (slide.chart) return slide.chart.type === 'pie' ? 'chart-pie' : 'chart-bar'
  if (slide.isCover) return 'cover'
  if (/目录|contents|agenda|outline/i.test(slide.title)) return 'toc'
  if (index === total - 1 && /谢谢|thank|q\s*&\s*a|结语|致谢/i.test(slide.title)) return 'closing'
  if (
    slide.bullets.length <= 1 &&
    /^第.+章|^chapter\s+\d|^\d+[.、]\s*\S+$|^part\s+\d/i.test(slide.title)
  ) {
    return 'section'
  }
  if (/流程|步骤|架构|技术路线/i.test(slide.title) && slide.bullets.length >= 3 && slide.bullets.length <= 6) {
    return 'flow'
  }
  if (/对比|表格|数据|指标|实验/i.test(slide.title) || parseTableFromBullets(slide.bullets)) {
    return 'table'
  }
  if (/图文|示意图|效果/i.test(slide.title) || slide.imagePrompt) {
    return 'image-right'
  }
  if (slide.bullets.length >= 7) return 'two-column'
  return undefined
}

const GENERIC_DECK_TITLE_RE = /^(演示文稿|presentation|untitled)$/i

/** 导出 .pptx 文件名：优先用模型输出的 # 总标题（文档主题），否则用用户输入主题 */
export function resolvePptExportFileName(deckTitle: string, userTopic?: string): string {
  const fromDeck = deckTitle.trim()
  const fromUser = (userTopic || '').trim()
  if (fromDeck && !GENERIC_DECK_TITLE_RE.test(fromDeck)) return fromDeck
  if (fromUser) return fromUser
  return fromDeck || 'presentation'
}

/** 将模型输出的 Markdown 解析为幻灯片结构 */
export function parsePptMarkdown(markdown: string): ParsedPptDeck {
  const md = markdown.trim()
  let deckTitle = '演示文稿'
  const titleMatch = /^#\s+(.+)$/m.exec(md)
  if (titleMatch) deckTitle = stripMdInline(titleMatch[1])
  const themeId = parseDeckTheme(md)

  const slides: ParsedPptSlide[] = []
  const parts = md.split(/\n(?=##\s)/)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed.startsWith('##')) continue
    const firstLine = trimmed.split('\n')[0] ?? ''
    const hm = SLIDE_HEADING_RE.exec(firstLine)
    if (!hm) continue
    const slideTitle = stripMdInline(hm[3] || firstLine.replace(/^##\s*/, ''))
    const body = trimmed.slice(firstLine.length).trim()
    const { bullets, notes, backgroundPrompt, layout, chart, subtitle, imagePrompt } =
      parseSlideBody(body)
    const isCover = layout === 'cover' || /封面|cover/i.test(slideTitle) || slides.length === 0
    slides.push({
      title: slideTitle,
      bullets,
      notes,
      backgroundPrompt,
      layout,
      chart,
      imagePrompt,
      subtitle,
      isCover,
    })
  }

  if (!slides.length) {
    const paras = md
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#'))
    if (paras.length) {
      slides.push({
        title: deckTitle,
        bullets: paras.slice(0, 8).map(stripMdInline),
        layout: 'cover',
        isCover: true,
      })
      for (const p of paras.slice(1, 12)) {
        const lines = p.split('\n').map((l) => l.trim()).filter(Boolean)
        slides.push({
          title: stripMdInline(lines[0] ?? '内容'),
          bullets: lines.slice(1).map(stripMdInline).filter(Boolean),
          layout: 'bullets',
        })
      }
    } else {
      slides.push({ title: deckTitle, bullets: ['暂无内容'], layout: 'cover', isCover: true })
    }
  }

  const total = slides.length
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    const inferred = inferLayout(s, i, total)
    s.layout = inferred ?? 'bullets'
    if (s.chart && !s.layout.startsWith('chart')) {
      s.layout = s.chart.type === 'pie' ? 'chart-pie' : 'chart-bar'
    }
    if (s.layout === 'table' && !s.table) {
      s.table = parseTableFromBullets(s.bullets)
      if (!s.table) s.layout = 'bullets'
    }
  }

  return { deckTitle, themeId, slides }
}
