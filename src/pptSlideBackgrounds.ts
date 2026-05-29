import { configManager } from './config'
import { generateImageJimeng, hasJimengCredentials } from './jimengGenerateMain'
import { DEFAULT_JIMENG_IMAGE_MODEL, resolveJimengImageModelId } from './jimengModels'
import type { ParsedPptSlide } from './pptParseMarkdown'
import { resolveSlideLayout } from './pptLayouts'

/** 精美模式最多生成的 AI 背景张数（控制体积与耗时） */
export const MAX_PREMIUM_PPT_BACKGROUNDS = 4

export function buildSlideBackgroundPrompt(deckTitle: string, slide: ParsedPptSlide): string {
  const custom = slide.backgroundPrompt?.trim()
  if (custom) {
    const suffix =
      /16\s*:\s*9|无文字|no text/i.test(custom) ? '' : '，16:9 宽屏，无文字无水印'
    return `${custom}${suffix}`
  }
  const theme = deckTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim().slice(0, 48) || 'presentation'
  const title = slide.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim().slice(0, 64) || 'slide'
  return `专业 PPT 幻灯片背景，主题「${theme}」，「${title}」，抽象商务风格，16:9，无文字无 logo`
}

/** 仅封面、章节过渡、结尾页在精美模式下生成 AI 背景 */
export function premiumBackgroundSlideIndices(slides: ParsedPptSlide[]): number[] {
  const indices: number[] = []
  for (let i = 0; i < slides.length; i++) {
    const layout = resolveSlideLayout(slides[i])
    if (layout === 'cover' || layout === 'section' || layout === 'closing') {
      indices.push(i)
    }
  }
  return indices.slice(0, MAX_PREMIUM_PPT_BACKGROUNDS)
}

export type SlideBackgroundPaths = (string | undefined)[]

export async function generatePremiumSlideBackgrounds(
  deckTitle: string,
  slides: ParsedPptSlide[],
  onProgress?: (current: number, total: number) => void,
): Promise<{ paths: SlideBackgroundPaths; generated: number; failed: number }> {
  const paths: SlideBackgroundPaths = slides.map(() => undefined)
  if (!hasJimengCredentials() || !slides.length) {
    return { paths, generated: 0, failed: 0 }
  }

  const indices = premiumBackgroundSlideIndices(slides)
  if (!indices.length) return { paths, generated: 0, failed: 0 }

  const modelId = resolveJimengImageModelId(
    configManager.get().imageGenJimengModel || DEFAULT_JIMENG_IMAGE_MODEL,
  )
  let generated = 0
  let failed = 0

  for (let j = 0; j < indices.length; j++) {
    const i = indices[j]
    onProgress?.(j + 1, indices.length)
    const prompt = buildSlideBackgroundPrompt(deckTitle, slides[i])
    const result = await generateImageJimeng(prompt, '1792x1024', modelId)
    if (result.ok) {
      paths[i] = result.path
      generated++
    } else {
      failed++
      console.warn(`[ppt background] slide ${i + 1} failed:`, result.error)
    }
  }

  return { paths, generated, failed }
}
