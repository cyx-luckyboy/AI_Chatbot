export type TavilySearchHit = {
  title: string
  url: string
  content: string
}

export type TavilySearchResult =
  | { ok: true; hits: TavilySearchHit[]; answer?: string }
  | { ok: false; error: string }

/** Tavily Search API — https://docs.tavily.com/docs/tavily-api/rest_api */
export async function tavilySearch(query: string, apiKey: string): Promise<TavilySearchResult> {
  const q = query.trim()
  if (!q) return { ok: false, error: '搜索关键词为空' }
  if (!apiKey.trim()) return { ok: false, error: '未配置 Tavily API Key' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query: q,
        search_depth: 'basic',
        max_results: 6,
        include_answer: true,
      }),
    })
    const body = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[]
      answer?: string
      detail?: { error?: string }
      error?: string
    }
    if (!res.ok) {
      const msg = body.detail?.error || body.error || res.statusText
      return { ok: false, error: `Tavily ${res.status}: ${msg}` }
    }
    const hits: TavilySearchHit[] = (body.results ?? [])
      .map((r) => ({
        title: String(r.title ?? '').trim() || '（无标题）',
        url: String(r.url ?? '').trim(),
        content: String(r.content ?? '').trim(),
      }))
      .filter((h) => h.content || h.url)
    return { ok: true, hits, answer: body.answer?.trim() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/abort/i.test(msg)) {
      return { ok: false, error: '请求超时（45s）' }
    }
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}
