import type pptxgen from 'pptxgenjs'
import type { ParsedPptSlide, PptChartData, PptSlideLayout } from './pptParseMarkdown'
import { getPptTheme, type PptTheme } from './pptThemes'

export type LayoutRenderCtx = {
  pptx: pptxgen
  slide: pptxgen.Slide
  data: ParsedPptSlide
  deckTitle: string
  theme: PptTheme
  /** 仅精美模式：封面/章节等关键页的 AI 背景图 */
  bgImagePath?: string
}

function applySlideBase(ctx: LayoutRenderCtx, hero = false) {
  const { slide, theme, bgImagePath } = ctx
  if (bgImagePath) {
    slide.background = { path: bgImagePath }
    slide.addShape(ctx.pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: '100%',
      h: '100%',
      fill: { color: theme.heroBg, transparency: 38 },
      line: { transparency: 100 },
    })
    return
  }
  slide.background = { color: hero ? theme.heroBg : theme.slideBg }
}

function addTopAccentBar(ctx: LayoutRenderCtx) {
  const { slide, theme, pptx } = ctx
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.08,
    fill: { color: theme.accent },
    line: { transparency: 100 },
  })
}

function addTitleBlock(
  ctx: LayoutRenderCtx,
  opts: { y?: number; h?: number; size?: number; color?: string; align?: 'left' | 'center' | 'right' } = {},
) {
  const { slide, data, theme } = ctx
  const layout = resolveSlideLayout(data)
  const onHero =
    !!ctx.bgImagePath || layout === 'cover' || layout === 'section' || layout === 'closing'
  slide.addText(data.title, {
    x: 0.55,
    y: opts.y ?? 0.45,
    w: 8.9,
    h: opts.h ?? 0.85,
    fontSize: opts.size ?? 28,
    bold: true,
    color: opts.color ?? (onHero ? theme.onHero : theme.title),
    align: opts.align ?? 'left',
    fontFace: theme.fontFace,
  })
}

function bulletTextOpts(theme: PptTheme, color?: string): pptxgen.TextPropsOptions {
  return {
    fontSize: 15,
    color: color ?? theme.body,
    fontFace: theme.fontFace,
    valign: 'top',
    bullet: true,
    lineSpacingMultiple: 1.15,
    paraSpaceAfter: 6,
  }
}

export function resolveSlideLayout(slide: ParsedPptSlide): PptSlideLayout {
  if (slide.layout) return slide.layout
  if (slide.isCover) return 'cover'
  if (/目录|contents|agenda/i.test(slide.title)) return 'toc'
  if (/谢谢|thank|q\s*&\s*a|结语|总结/i.test(slide.title)) return 'closing'
  if (slide.chart) return slide.chart.type === 'pie' ? 'chart-pie' : 'chart-bar'
  return 'bullets'
}

export function renderCover(ctx: LayoutRenderCtx) {
  applySlideBase(ctx, true)
  const { slide, data, theme, deckTitle } = ctx
  slide.addShape(ctx.pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.12,
    fill: { color: theme.accent },
    line: { transparency: 100 },
  })
  slide.addText(data.title || deckTitle, {
    x: 0.7,
    y: 2.0,
    w: 8.6,
    h: 1.3,
    fontSize: 40,
    bold: true,
    color: theme.onHero,
    align: 'center',
    fontFace: theme.fontFace,
  })
  const sub = data.bullets[0] || data.subtitle
  if (sub) {
    slide.addText(sub, {
      x: 0.7,
      y: 3.45,
      w: 8.6,
      h: 0.75,
      fontSize: 18,
      color: theme.onHero,
      align: 'center',
      fontFace: theme.fontFace,
      transparency: 8,
    })
  }
}

export function renderSection(ctx: LayoutRenderCtx) {
  applySlideBase(ctx, true)
  const { slide, theme } = ctx
  slide.addShape(ctx.pptx.ShapeType.rect, {
    x: 0.55,
    y: 2.35,
    w: 1.2,
    h: 0.12,
    fill: { color: theme.accent },
    line: { transparency: 100 },
  })
  slide.addText(ctx.data.title, {
    x: 0.55,
    y: 2.55,
    w: 8.9,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: theme.onHero,
    fontFace: theme.fontFace,
  })
  if (ctx.data.bullets[0]) {
    slide.addText(ctx.data.bullets[0], {
      x: 0.55,
      y: 3.85,
      w: 8.5,
      h: 0.6,
      fontSize: 16,
      color: theme.onHero,
      fontFace: theme.fontFace,
      transparency: 12,
    })
  }
}

export function renderClosing(ctx: LayoutRenderCtx) {
  applySlideBase(ctx, true)
  const { slide, data, theme } = ctx
  slide.addText(data.title, {
    x: 0.6,
    y: 2.35,
    w: 8.8,
    h: 1.1,
    fontSize: 38,
    bold: true,
    color: theme.onHero,
    align: 'center',
    fontFace: theme.fontFace,
  })
  const sub = data.bullets.join(' · ') || '谢谢聆听'
  slide.addText(sub, {
    x: 0.6,
    y: 3.55,
    w: 8.8,
    h: 0.7,
    fontSize: 16,
    color: theme.onHero,
    align: 'center',
    fontFace: theme.fontFace,
    transparency: 10,
  })
}

export function renderToc(ctx: LayoutRenderCtx) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx)
  const items = ctx.data.bullets.length ? ctx.data.bullets : ['（暂无目录项）']
  const mid = Math.ceil(items.length / 2)
  const col1 = items.slice(0, mid)
  const col2 = items.slice(mid)
  const opts = bulletTextOpts(ctx.theme)
  ctx.slide.addText(col1.join('\n'), { x: 0.65, y: 1.35, w: 4.2, h: 4.6, ...opts })
  if (col2.length) {
    ctx.slide.addText(col2.join('\n'), { x: 5.1, y: 1.35, w: 4.2, h: 4.6, ...opts })
  }
}

export function renderBullets(ctx: LayoutRenderCtx) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx)
  const body = ctx.data.bullets.length ? ctx.data.bullets : ['（本页无要点）']
  ctx.slide.addShape(ctx.pptx.ShapeType.rect, {
    x: 0.55,
    y: 1.22,
    w: 8.9,
    h: 4.55,
    fill: { color: ctx.theme.accentLight, transparency: ctx.theme.id === 'tech' ? 88 : 55 },
    line: { color: ctx.theme.accent, transparency: 85, width: 0.5 },
  })
  ctx.slide.addText(body.join('\n'), {
    x: 0.75,
    y: 1.38,
    w: 8.5,
    h: 4.25,
    ...bulletTextOpts(ctx.theme),
  })
}

export function renderTwoColumn(ctx: LayoutRenderCtx) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx)
  const items = ctx.data.bullets
  const mid = Math.ceil(items.length / 2) || 1
  const opts = bulletTextOpts(ctx.theme)
  const left = items.slice(0, mid)
  const right = items.slice(mid)
  ctx.slide.addText((left.length ? left : ['—']).join('\n'), {
    x: 0.65,
    y: 1.35,
    w: 4.15,
    h: 4.5,
    ...opts,
  })
  ctx.slide.addText((right.length ? right : ['—']).join('\n'), {
    x: 5.05,
    y: 1.35,
    w: 4.15,
    h: 4.5,
    ...opts,
  })
}

function chartSeries(chart: PptChartData) {
  return [
    {
      name: chart.title || '数据',
      labels: chart.labels,
      values: chart.values,
    },
  ]
}

export function renderTable(ctx: LayoutRenderCtx) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx)
  const table = ctx.data.table
  if (!table?.headers?.length) {
    renderBullets(ctx)
    return
  }
  const headerRow = table.headers.map((h) => ({
    text: h,
    options: { bold: true, color: ctx.theme.onHero, fill: { color: ctx.theme.accent } },
  }))
  const bodyRows = table.rows.map((row) =>
    row.map((cell) => ({ text: cell || '—', options: { color: ctx.theme.body } })),
  )
  ctx.slide.addTable([headerRow, ...bodyRows], {
    x: 0.55,
    y: 1.3,
    w: 8.9,
    h: 4.2,
    fontSize: 13,
    fontFace: ctx.theme.fontFace,
    border: { type: 'solid', color: ctx.theme.muted, pt: 0.5 },
    align: 'left',
    valign: 'middle',
  })
}

export function renderFlow(ctx: LayoutRenderCtx) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx)
  const steps = ctx.data.bullets.slice(0, 5)
  if (!steps.length) {
    renderBullets(ctx)
    return
  }
  const n = steps.length
  const boxW = Math.min(1.65, 8.2 / n)
  const gap = (8.9 - boxW * n) / (n + 1)
  const { slide, theme, pptx } = ctx
  steps.forEach((step, i) => {
    const x = 0.55 + gap + i * (boxW + gap)
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.0,
      w: boxW,
      h: 2.2,
      fill: { color: theme.accentLight },
      line: { color: theme.accent, width: 1 },
      rectRadius: 0.08,
    })
    slide.addText(`${i + 1}`, {
      x,
      y: 2.05,
      w: boxW,
      h: 0.45,
      fontSize: 14,
      bold: true,
      color: theme.accent,
      align: 'center',
      fontFace: theme.fontFace,
    })
    slide.addText(step, {
      x: x + 0.08,
      y: 2.55,
      w: boxW - 0.16,
      h: 1.55,
      fontSize: 11,
      color: theme.body,
      valign: 'top',
      align: 'center',
      fontFace: theme.fontFace,
    })
    if (i < n - 1) {
      slide.addText('→', {
        x: x + boxW + 0.02,
        y: 2.75,
        w: gap - 0.04,
        h: 0.5,
        fontSize: 18,
        color: theme.muted,
        align: 'center',
      })
    }
  })
}

export function renderImageRight(ctx: LayoutRenderCtx) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx, { y: 0.42 })
  const { slide, theme, pptx, data, bgImagePath } = ctx
  const body = data.bullets.length ? data.bullets : ['（要点）']
  slide.addText(body.join('\n'), {
    x: 0.6,
    y: 1.28,
    w: 4.85,
    h: 4.35,
    ...bulletTextOpts(theme),
  })
  if (bgImagePath) {
    slide.addImage({ path: bgImagePath, x: 5.55, y: 1.15, w: 4.0, h: 4.5 })
  } else {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.55,
      y: 1.15,
      w: 4.0,
      h: 4.5,
      fill: { color: theme.accentLight },
      line: { color: theme.accent, width: 1 },
      rectRadius: 0.06,
    })
    const hint = data.imagePrompt || '配图区域'
    slide.addText(hint, {
      x: 5.7,
      y: 2.85,
      w: 3.7,
      h: 1.2,
      fontSize: 12,
      color: theme.muted,
      align: 'center',
      fontFace: theme.fontFace,
    })
  }
}

export function renderChart(ctx: LayoutRenderCtx, pie: boolean) {
  applySlideBase(ctx)
  addTopAccentBar(ctx)
  addTitleBlock(ctx)
  const chart = ctx.data.chart
  if (!chart?.labels?.length) {
    renderBullets(ctx)
    return
  }
  const type = pie ? ctx.pptx.ChartType.pie : ctx.pptx.ChartType.bar
  ctx.slide.addChart(type, chartSeries(chart), {
    x: 0.85,
    y: 1.35,
    w: 8.3,
    h: 4.35,
    showTitle: false,
    showLegend: true,
    legendPos: 'b',
    chartColors: [ctx.theme.accent, ctx.theme.accentLight, '64748B', '94A3B8'],
  })
}

export function renderSlide(ctx: LayoutRenderCtx) {
  const layout = resolveSlideLayout(ctx.data)
  switch (layout) {
    case 'cover':
      renderCover(ctx)
      break
    case 'section':
      renderSection(ctx)
      break
    case 'closing':
      renderClosing(ctx)
      break
    case 'toc':
      renderToc(ctx)
      break
    case 'two-column':
      renderTwoColumn(ctx)
      break
    case 'chart-bar':
      renderChart(ctx, false)
      break
    case 'chart-pie':
      renderChart(ctx, true)
      break
    case 'table':
      renderTable(ctx)
      break
    case 'flow':
      renderFlow(ctx)
      break
    case 'image-right':
      renderImageRight(ctx)
      break
    default:
      renderBullets(ctx)
  }
}

export function buildLayoutContext(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  data: ParsedPptSlide,
  deckTitle: string,
  themeId: import('./pptThemes').PptThemeId,
  bgImagePath?: string,
): LayoutRenderCtx {
  return {
    pptx,
    slide,
    data,
    deckTitle,
    theme: getPptTheme(themeId),
    bgImagePath,
  }
}
