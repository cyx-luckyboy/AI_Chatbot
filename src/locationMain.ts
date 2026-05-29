import iconv from 'iconv-lite'
import type { UserLocationSource } from './userLocation'
import { isValidLocationText } from './userLocation'

export type DetectedLocation = {
  city: string
  region: string
  country: string
  latitude?: number
  longitude?: number
  source: UserLocationSource
}

type IpWhoJson = {
  success?: boolean
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
}

type IpApiJson = {
  status?: string
  city?: string
  regionName?: string
  country?: string
  lat?: number
  lon?: number
}

type UserAgentInfoJson = {
  country?: string
  province?: string
  city?: string
  latitude?: string
  longitude?: string
}

type IpApiCoJson = {
  city?: string
  region?: string
  country_name?: string
  latitude?: number
  longitude?: number
}

const FETCH_TIMEOUT_MS = 12_000

async function fetchBuffer(url: string, init?: RequestInit): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'vChat/1.0',
        Accept: 'application/json,text/plain,*/*',
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

function decodeBuffer(buf: Buffer, encoding: 'utf8' | 'gbk'): string {
  if (encoding === 'gbk') return iconv.decode(buf, 'gbk')
  return buf.toString('utf8')
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const buf = await fetchBuffer(url, init)
  return decodeBuffer(buf, 'utf8')
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init)
  return JSON.parse(text) as T
}

function stripAdminSuffix(name: string): string {
  return name.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区)$/u, '').trim()
}

function finalizeLocation(partial: {
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
}): DetectedLocation | null {
  let city = stripAdminSuffix(String(partial.city ?? '').trim())
  let region = stripAdminSuffix(String(partial.region ?? '').trim())
  const country = String(partial.country ?? '').trim()

  if (!city && region) city = region
  if (!region && city) region = city
  if (!city && !region) return null
  if (!isValidLocationText(city) || !isValidLocationText(region)) return null

  return {
    city,
    region,
    country: country || '中国',
    latitude: partial.latitude,
    longitude: partial.longitude,
    source: 'ip',
  }
}

function parsePconlineJson(text: string): DetectedLocation | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  const o = JSON.parse(m[0]) as { pro?: string; city?: string }
  return finalizeLocation({
    region: o.pro ?? '',
    city: o.city ?? '',
    country: '中国',
  })
}

/** 太平洋电脑网（响应多为 GBK，须按 GBK 解码） */
async function fetchPconlineIp(): Promise<DetectedLocation | null> {
  try {
    const buf = await fetchBuffer('https://whois.pconline.com.cn/ipJson.jsp?json=true')
    for (const enc of ['gbk', 'utf8'] as const) {
      try {
        const loc = parsePconlineJson(decodeBuffer(buf, enc))
        if (loc) return loc
      } catch {
        /* try next encoding */
      }
    }
    return null
  } catch (e) {
    console.warn('[location] pconline failed', e)
    return null
  }
}

async function fetchUserAgentInfoIp(): Promise<DetectedLocation | null> {
  try {
    const body = await fetchJson<UserAgentInfoJson>('https://ip.useragentinfo.com/json')
    return finalizeLocation({
      city: body.city ?? '',
      region: body.province ?? '',
      country: body.country ?? '',
      latitude: body.latitude ? Number(body.latitude) : undefined,
      longitude: body.longitude ? Number(body.longitude) : undefined,
    })
  } catch (e) {
    console.warn('[location] useragentinfo failed', e)
    return null
  }
}

async function fetchIpApiCo(): Promise<DetectedLocation | null> {
  try {
    const body = await fetchJson<IpApiCoJson>('https://ipapi.co/json/')
    return finalizeLocation({
      city: body.city ?? '',
      region: body.region ?? '',
      country: body.country_name ?? '',
      latitude: body.latitude,
      longitude: body.longitude,
    })
  } catch (e) {
    console.warn('[location] ipapi.co failed', e)
    return null
  }
}

async function fetchIpWho(): Promise<DetectedLocation | null> {
  try {
    const body = await fetchJson<IpWhoJson>('https://ipwho.is/?lang=zh')
    if (body.success === false) return null
    return finalizeLocation({
      city: body.city ?? '',
      region: body.region ?? '',
      country: body.country ?? '',
      latitude: body.latitude,
      longitude: body.longitude,
    })
  } catch (e) {
    console.warn('[location] ipwho.is failed', e)
    return null
  }
}

async function fetchIpApiCom(): Promise<DetectedLocation | null> {
  try {
    const body = await fetchJson<IpApiJson>(
      'https://ip-api.com/json/?fields=status,city,regionName,country,lat,lon&lang=zh-CN',
    )
    if (body.status !== 'success') return null
    return finalizeLocation({
      city: body.city ?? '',
      region: body.regionName ?? '',
      country: body.country ?? '',
      latitude: body.lat,
      longitude: body.lon,
    })
  } catch (e) {
    console.warn('[location] ip-api.com failed', e)
    return null
  }
}

/** 依次尝试多个源；优先 UTF-8 国内接口，pconline 用 GBK 解码 */
export async function fetchIpLocation(): Promise<DetectedLocation | null> {
  const providers = [
    fetchUserAgentInfoIp,
    fetchPconlineIp,
    fetchIpApiCo,
    fetchIpWho,
    fetchIpApiCom,
  ]
  const results: DetectedLocation[] = []
  for (const fn of providers) {
    const loc = await fn()
    if (!loc) continue
    results.push(loc)
    console.info('[location] IP candidate via', fn.name, loc.city, loc.region)
    /** 若多源一致则提前返回；否则继续收集 */
    const same = results.filter((r) => r.city === loc.city && r.region === loc.region).length
    if (same >= 2) return loc
  }
  if (!results.length) return null
  /** 优先返回带经纬度且非「北京」的结果（IP 库常误标北京） */
  const notBj = results.find((r) => r.city !== '北京' && r.region !== '北京')
  if (notBj) return notBj
  return results[0]
}

async function reverseGeocodeBigDataCloud(lat: number, lng: number): Promise<DetectedLocation | null> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lng))}&localityLanguage=zh`
    const body = await fetchJson<{
      city?: string
      locality?: string
      principalSubdivision?: string
      countryName?: string
    }>(url)
    const loc = finalizeLocation({
      city: body.city || body.locality || '',
      region: body.principalSubdivision || '',
      country: body.countryName || '',
      latitude: lat,
      longitude: lng,
    })
    if (!loc) return null
    return { ...loc, source: 'gps' }
  } catch (e) {
    console.warn('[location] bigdatacloud reverse failed', e)
    return null
  }
}

async function reverseGeocodeNominatim(lat: number, lng: number): Promise<DetectedLocation | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}&accept-language=zh-CN,en`
  try {
    const body = await fetchJson<{
      address?: {
        city?: string
        town?: string
        village?: string
        county?: string
        state?: string
        country?: string
      }
    }>(url, {
      headers: { 'User-Agent': 'vChat/1.0 (desktop assistant)' },
    })
    const a = body.address
    if (!a) return null
    const loc = finalizeLocation({
      city: a.city || a.town || a.village || a.county || '',
      region: a.state || '',
      country: a.country || '',
      latitude: lat,
      longitude: lng,
    })
    if (!loc) return null
    return { ...loc, source: 'gps' }
  } catch (e) {
    console.warn('[location] nominatim reverse failed', e)
    return null
  }
}

/** 根据经纬度反查城市（多源） */
export async function reverseGeocode(lat: number, lng: number): Promise<DetectedLocation | null> {
  for (const fn of [reverseGeocodeBigDataCloud, reverseGeocodeNominatim]) {
    const loc = await fn(lat, lng)
    if (loc) return loc
  }
  return null
}
