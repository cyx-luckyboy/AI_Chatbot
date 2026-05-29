import crypto from 'crypto'
import https from 'https'

const VISUAL_HOST = 'visual.volcengineapi.com'
const VISUAL_REGION = 'cn-north-1'
const VISUAL_SERVICE = 'cv'
const API_VERSION = '2022-08-31'

export type VolcCredentials = {
  accessKeyId: string
  secretKey: string
}

export type VolcVisualResponse<T> = {
  code: number
  message?: string
  data?: T
  status?: number
  requestId?: string
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function signingKey(secretKey: string, shortDate: string): Buffer {
  const kDate = hmacSha256(secretKey, shortDate)
  const kRegion = hmacSha256(kDate, VISUAL_REGION)
  const kService = hmacSha256(kRegion, VISUAL_SERVICE)
  return hmacSha256(kService, 'request')
}

function formatXDate(d = new Date()): string {
  return d.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '')
}

function buildSignedRequest(
  creds: VolcCredentials,
  action: string,
  body: string,
): { url: string; headers: Record<string, string> } {
  const xDate = formatXDate()
  const shortDate = xDate.slice(0, 8)
  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(API_VERSION)}`
  const canonicalQuery = `Action=${action}&Version=${API_VERSION}`
  const contentHash = sha256Hex(body)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Host: VISUAL_HOST,
    'X-Content-Sha256': contentHash,
    'X-Date': xDate,
  }

  const signedHeaderKeys = ['content-type', 'host', 'x-content-sha256', 'x-date']
  const signedHeaders = signedHeaderKeys.join(';')
  const canonicalHeaders =
    `content-type:${headers['Content-Type']}\n` +
    `host:${headers.Host}\n` +
    `x-content-sha256:${headers['X-Content-Sha256']}\n` +
    `x-date:${headers['X-Date']}\n`

  const canonicalRequest = [
    'POST',
    '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join('\n')

  const credentialScope = `${shortDate}/${VISUAL_REGION}/${VISUAL_SERVICE}/request`
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(signingKey(creds.secretKey, shortDate), stringToSign).toString('hex')

  headers.Authorization = `HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { url: `https://${VISUAL_HOST}/?${query}`, headers }
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v)
      if (!Number.isNaN(n)) return n
    }
  }
  return undefined
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

/** 统一解析 Visual / TOP 等多种 JSON 响应形态 */
export function normalizeVolcVisualResponse<T>(
  raw: unknown,
  httpStatus: number,
  rawText: string,
): VolcVisualResponse<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error(rawText.slice(0, 400) || `HTTP ${httpStatus}`)
  }

  const o = raw as Record<string, unknown>
  const meta = o.ResponseMetadata as Record<string, unknown> | undefined
  if (meta && typeof meta === 'object') {
    const err = meta.Error as Record<string, unknown> | undefined
    if (err) {
      const codeStr = pickString(err.Code, err.code)
      const numericFromCode = codeStr && /^\d+$/.test(codeStr) ? Number(codeStr) : undefined
      return {
        code: pickNumber(err.CodeN, numericFromCode) ?? 40000,
        message:
          pickString(err.Message, err.message) ||
          codeStr ||
          '火山引擎接口鉴权或参数错误',
        status: httpStatus,
        requestId: pickString(meta.RequestId),
      }
    }
  }

  const code = pickNumber(o.code, o.Code, o.status, o.Status)
  const message = pickString(o.message, o.Message, o.error_message, o.ErrorMessage)
  const data = (o.data ?? o.Data) as T | undefined
  const requestId = pickString(o.request_id, o.RequestId)

  if (code !== undefined) {
    return {
      code,
      message,
      data,
      status: pickNumber(o.status, o.Status) ?? code,
      requestId,
    }
  }

  console.error('[volc visual] unexpected response:', rawText.slice(0, 1200))
  return {
    code: httpStatus >= 400 ? httpStatus : 0,
    message: message || rawText.slice(0, 300) || `HTTP ${httpStatus}`,
    data,
    status: httpStatus,
    requestId,
  }
}

export function isVolcVisualSuccess(code: number | undefined): boolean {
  return code === 10000
}

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const { Host: _host, ...outHeaders } = headers
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          ...outHeaders,
          'Content-Length': String(Buffer.byteLength(body)),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') })
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function volcVisualPost<T>(
  creds: VolcCredentials,
  action: string,
  body: Record<string, unknown>,
): Promise<VolcVisualResponse<T>> {
  const bodyStr = JSON.stringify(body)
  const { url, headers } = buildSignedRequest(creds, action, bodyStr)
  const { status, text } = await httpsPost(url, headers, bodyStr)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(text.slice(0, 500) || `HTTP ${status}`)
  }

  return normalizeVolcVisualResponse<T>(parsed, status, text)
}
