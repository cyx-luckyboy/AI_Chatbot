import type { ParsedPptDeck, ParsedPptSlide, PptSlideLayout } from './pptParseMarkdown'

const MAX_BULLET_CHARS = 140
const MAX_BULLETS_PER_SLIDE = 8
const MAX_TITLE_CHARS = 100

export function trimBulletText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= MAX_BULLET_CHARS) return t
  return `${t.slice(0, MAX_BULLET_CHARS - 1)}…`
}

/** 导出前压缩要点，避免单页文字过多撑版 */
export function normalizePptDeck(deck: ParsedPptDeck): ParsedPptDeck {
  for (const slide of deck.slides) {
    if (slide.title.length > MAX_TITLE_CHARS) {
      slide.title = `${slide.title.slice(0, MAX_TITLE_CHARS - 1)}…`
    }
    slide.bullets = slide.bullets.map(trimBulletText).filter(Boolean).slice(0, MAX_BULLETS_PER_SLIDE)
    if (slide.subtitle && slide.subtitle.length > 80) {
      slide.subtitle = `${slide.subtitle.slice(0, 79)}…`
    }
  }
  return deck
}

function inferLayoutFromTitle(title: string): PptSlideLayout | undefined {
  if (/封面|cover/i.test(title)) return 'cover'
  if (/目录|contents|agenda/i.test(title)) return 'toc'
  if (/谢谢|致谢|结语|q\s*&\s*a|closing/i.test(title)) return 'closing'
  if (/^第.+章|^chapter\s+\d/i.test(title)) return 'section'
  if (/流程|步骤|架构|技术路线|实现路径/i.test(title)) return 'flow'
  if (/对比|表格|数据|指标|实验结果|性能/i.test(title)) return 'table'
  if (/图文|示意图|架构图|效果展示/i.test(title)) return 'image-right'
  return undefined
}

/** 为缺少【版式】的页面补全版式行（规则推断，无需二次调用模型） */
export function repairPptMarkdown(markdown: string): string {
  let md = markdown.trim()
  if (md.startsWith('```')) {
    md = md.replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  }
  if (!/^【主题】/m.test(md) && !/^Theme\s*:/im.test(md)) {
    if (/答辩|学位论文|thesis|defense/i.test(md)) {
      md = `【主题】campus\n\n${md}`
    } else if (/工作总结|述职|work\s+summary|quarterly/i.test(md)) {
      md = `【主题】business\n\n${md}`
    }
  }

  const parts = md.split(/\n(?=##\s)/)
  if (parts.length <= 1) return md

  const out: string[] = [parts[0].trim()]
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i].trim()
    if (!block.startsWith('##')) {
      out.push(block)
      continue
    }
    const lines = block.split('\n')
    const heading = lines[0] ?? ''
    const body = lines.slice(1).join('\n')
    const hasLayout = /【版式】|【布局】|^Layout\s*:/im.test(body)
    if (hasLayout) {
      out.push(block)
      continue
    }
    const titleMatch = heading.replace(/^##\s*/, '').replace(/^第\s*\d+\s*页\s*[：:]\s*/i, '')
    const layout = inferLayoutFromTitle(titleMatch)
    if (layout) {
      out.push(`${heading}\n【版式】${layout}\n${body}`.trim())
    } else {
      out.push(block)
    }
  }
  return out.join('\n\n')
}
