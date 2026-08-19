import fs from 'fs/promises'
import path from 'path'
import pptxgen from 'pptxgenjs'
import { normalizePptDeck, repairPptMarkdown } from './pptNormalize'
import { parsePptMarkdown, resolvePptExportFileName } from './pptParseMarkdown'
import { buildLayoutContext, renderSlide } from './pptLayouts'
import { generatePremiumSlideBackgrounds } from './pptSlideBackgrounds'
import { hasJimengCredentials } from '../jimengGenerateMain'
import type { PptGenQualityId } from '../../../shared/types'

function safeFileStem(name: string): string {
  const s = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80)
  return s || 'presentation'
}

export type WritePptxOptions = {
  quality?: PptGenQualityId
  onBackgroundProgress?: (current: number, total: number) => void
}

export type WritePptxResult = {
  path: string
  slideCount: number
  backgroundCount: number
  backgroundFailed: number
}

export async function writePptxFromMarkdown(
  markdown: string,
  destDir: string,
  suggestedName?: string,
  options?: WritePptxOptions,
): Promise<WritePptxResult> {
  const repaired = repairPptMarkdown(markdown)
  const parsed = parsePptMarkdown(repaired)
  const { deckTitle, themeId } = parsed
  const slides = normalizePptDeck(parsed).slides
  const quality = options?.quality ?? 'fast'
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'vChat'
  pptx.title = deckTitle

  let backgroundPaths: (string | undefined)[] = slides.map(() => undefined)
  let backgroundCount = 0
  let backgroundFailed = 0

  const usePremiumBg =
    quality === 'premium' && hasJimengCredentials() && slides.length > 0

  if (usePremiumBg) {
    const bg = await generatePremiumSlideBackgrounds(
      deckTitle,
      slides,
      options?.onBackgroundProgress,
    )
    backgroundPaths = bg.paths
    backgroundCount = bg.generated
    backgroundFailed = bg.failed
  }

  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i]
    const s = pptx.addSlide()
    if (slideData.notes) s.addNotes(slideData.notes)

    const ctx = buildLayoutContext(
      pptx,
      s,
      slideData,
      deckTitle,
      themeId,
      backgroundPaths[i],
    )
    renderSlide(ctx)
  }

  await fs.mkdir(destDir, { recursive: true })
  const stem = safeFileStem(resolvePptExportFileName(deckTitle, suggestedName))
  const fileName = `${stem}-${Date.now()}.pptx`
  const outPath = path.join(destDir, fileName)
  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  await fs.writeFile(outPath, buf)
  return { path: outPath, slideCount: slides.length, backgroundCount, backgroundFailed }
}
