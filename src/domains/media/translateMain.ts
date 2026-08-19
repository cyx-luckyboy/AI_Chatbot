import type { TranslateTargetId, TranslateTextResult } from '../../shared/types'

const LIBRE_TRANSLATE_URLS = ['https://libretranslate.com/translate', 'https://libretranslate.de/translate']

function mapTranslateTargetToLibre(target: TranslateTargetId): string {
  if (target === 'en') return 'en'
  if (target === 'zh-Hans') return 'zh'
  return 'zt'
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function translateLibre(text: string, target: TranslateTargetId): Promise<string | null> {
  const ltTarget = mapTranslateTargetToLibre(target)
  const body = JSON.stringify({
    q: text,
    source: 'auto',
    target: ltTarget,
    format: 'text',
  })
  for (const url of LIBRE_TRANSLATE_URLS) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      })
      if (!res.ok) continue
      const data = (await res.json()) as { translatedText?: string }
      if (typeof data.translatedText === 'string' && data.translatedText.length > 0) {
        return data.translatedText
      }
    } catch {
      /* try next endpoint */
    }
  }
  return null
}

/** Lingva（Google 翻译前端镜像），GET 适合较短文本；部分实例对繁体目标码返回 400，繁体仅走 Libre/MyMemory */
async function translateLingva(text: string, target: TranslateTargetId): Promise<string | null> {
  if (text.length > 1600) return null
  if (target === 'zh-Hant') return null
  const tgt = target === 'en' ? 'en' : 'zh'
  const encoded = encodeURIComponent(text)
  const bases = ['https://lingva.ml', 'https://translate.plausibility.cloud']
  for (const base of bases) {
    try {
      const url = `${base}/api/v1/auto/${tgt}/${encoded}`
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const data = (await res.json()) as { translation?: string }
      const out = data.translation?.trim()
      if (out) return out
    } catch {
      /* next mirror */
    }
  }
  return null
}

/** MyMemory 免费接口作后备 */
async function translateMyMemory(text: string, target: TranslateTargetId): Promise<string | null> {
  const langpair =
    target === 'en' ? 'auto|en' : target === 'zh-Hans' ? 'auto|zh-CN' : 'auto|zh-TW'
  const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`
  try {
    const res = await fetchWithTimeout(u, {})
    if (!res.ok) return null
    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
    }
    const t = data.responseData?.translatedText?.trim()
    if (t && data.responseStatus === 200) return t
  } catch {
    /* noop */
  }
  return null
}

export async function translateTextMain(text: string, target: TranslateTargetId): Promise<TranslateTextResult> {
  const raw = text.trim()
  if (!raw) return { ok: false, error: 'EMPTY' }

  let out = await translateLibre(raw, target)
  if (!out) out = await translateLingva(raw, target)
  if (!out) out = await translateMyMemory(raw, target)
  if (!out?.trim()) {
    return { ok: false, error: 'FAILED' }
  }
  return { ok: true, text: out.trim() }
}
