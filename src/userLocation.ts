import type { AppConfig, ChatMessageProps } from './types'

export type UserLocationSource = 'manual' | 'ip' | 'gps' | ''

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/
/** 常见 UTF-8 误读 GBK 后的乱码特征 */
const MOJIBAKE_RE = /[ÃÂÅæåéèêëìíîïðñòóôõöøùúûüýþÿ]{2,}|锟斤拷|\uFFFD/

/** 城市/省份名是否可读（过滤乱码与替换符） */
export function isValidLocationText(s: string): boolean {
  const t = String(s ?? '').trim()
  if (!t) return true
  if (MOJIBAKE_RE.test(t)) return false
  if (CJK_RE.test(t)) return true
  if (/^[a-zA-Z\s·,\.-]{2,}$/.test(t)) return true
  return false
}

/** 清理 config 中已损坏的定位字段 */
export function sanitizeLocationFields(cfg: AppConfig): AppConfig {
  const city = (cfg.locationCity ?? '').trim()
  const region = (cfg.locationRegion ?? '').trim()
  const badCity = city && !isValidLocationText(city)
  const badRegion = region && !isValidLocationText(region)
  if (!badCity && !badRegion) return cfg
  return {
    ...cfg,
    ...(badCity ? { locationCity: '' } : {}),
    ...(badRegion ? { locationRegion: '' } : {}),
    ...(badCity || badRegion ? { locationUpdatedAt: '' } : {}),
  }
}

export type ResolvedUserLocation = {
  city: string
  region: string
  country: string
  latitude?: number
  longitude?: number
  source: UserLocationSource
  updatedAt?: string
}

export function resolveUserLocation(cfg: AppConfig): ResolvedUserLocation | null {
  if (cfg.locationEnabled === false) return null
  const city = (cfg.locationCity ?? '').trim()
  const region = (cfg.locationRegion ?? '').trim()
  const country = (cfg.locationCountry ?? '').trim()
  if (!city && !region && cfg.locationLatitude == null) return null
  return {
    city,
    region,
    country,
    latitude: cfg.locationLatitude,
    longitude: cfg.locationLongitude,
    source: (cfg.locationSource as UserLocationSource) ?? '',
    updatedAt: cfg.locationUpdatedAt,
  }
}

/** 输入框旁、设置页展示用 */
export function formatLocationLabel(loc: ResolvedUserLocation | null, lang: 'zh' | 'en'): string {
  if (!loc) return ''
  const parts: string[] = []
  if (loc.city) parts.push(loc.city)
  else if (loc.region) parts.push(loc.region)
  if (loc.region && loc.city && !parts.includes(loc.region)) {
    parts.push(loc.region)
  }
  if (!parts.length && loc.latitude != null && loc.longitude != null) {
    return lang === 'zh'
      ? `${loc.latitude.toFixed(2)}°, ${loc.longitude.toFixed(2)}°`
      : `${loc.latitude.toFixed(2)}°, ${loc.longitude.toFixed(2)}°`
  }
  return parts.join(lang === 'zh' ? ' · ' : ', ')
}

export function buildSystemLocationContext(cfg: AppConfig): ChatMessageProps | null {
  const loc = resolveUserLocation(cfg)
  if (!loc) return null

  const label = formatLocationLabel(loc, 'zh') || loc.city || loc.region
  const coord =
    loc.latitude != null && loc.longitude != null
      ? `坐标约：${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
      : ''
  const sourceNote =
    loc.source === 'manual'
      ? '用户手动设置'
      : loc.source === 'gps'
        ? '设备 GPS'
        : loc.source === 'ip'
          ? 'IP 大致定位'
          : '未知来源'

  const content = [
    '以下为当前用户的大致地理位置（供回答本地天气、同城新闻、周边服务等问题时参考；若与用户描述不符，以用户说明为准）。',
    '若用户询问今日/实时天气、新闻、股价等，应结合下方地区联网检索后回答；勿声称无法获知用户所在城市。',
    `地区：${label}${loc.country && !label.includes(loc.country) ? `（${loc.country}）` : ''}`,
    coord,
    `定位方式：${sourceNote}`,
    loc.updatedAt ? `更新时间：${loc.updatedAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { role: 'system', content }
}

const LOCAL_HINT_RE =
  /天气|新闻|附近|周边|本地|同城|限行|地铁|公交|疫情|核酸|外卖|打车|房价|招聘|today|weather|news|nearby|local/i

/** 联网检索时给关键词补上城市，便于本地结果 */
export function enrichSearchQueryWithLocation(query: string, cfg: AppConfig): string {
  const loc = resolveUserLocation(cfg)
  if (!loc?.city) return query
  const q = query.trim()
  if (!q) return q
  if (loc.city && q.includes(loc.city)) return q
  if (loc.region && q.includes(loc.region)) return q
  if (!LOCAL_HINT_RE.test(q)) return q
  return `${q} ${loc.city}`
}
