/**
 * 主进程：百度语音识别 token + server_api（避免渲染进程 CORS）
 * 文档：https://ai.baidu.com/ai-doc/SPEECH/Vk38lxily
 *
 * 网络策略：
 * - 全程硬超时，避免 UI 永远停在「识别中」
 * - 优先 Node https（可控超时）；失败再试 Electron net.fetch
 * - 兼容 Clash TUN（198.18.x）等代理导致的断连
 */

import { net } from 'electron'
import * as https from 'node:https'
import type { IncomingMessage } from 'node:http'

const TOKEN_TIMEOUT_MS = 12_000
const ASR_TIMEOUT_MS = 18_000

let tokenCache: { token: string; expireAt: number; apiKey: string } | null = null

function formatNetError(e: unknown, where: string): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string }; code?: string }
  const code = err?.cause?.code || err?.code || ''
  const detail = err?.cause?.message || err?.message || String(e)
  if (code === 'ENOTFOUND' || /getaddrinfo/i.test(detail)) {
    return `无法解析百度语音域名（DNS），请检查网络`
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    /timeout|ETIMEDOUT|other side closed|fetch failed/i.test(detail)
  ) {
    return `连接百度语音超时（若开了 Clash/VPN，请对 vop.baidu.com、aip.baidubce.com 设直连）`
  }
  return `${where}失败：${detail.slice(0, 160)}`
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ETIMEDOUT:${label}`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

function httpsRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(body != null ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
        },
        timeout: timeoutMs,
        // 部分代理环境下强制 IPv4 更稳
        family: 4,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') })
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('ETIMEDOUT'))
    })
    if (body) req.write(body)
    req.end()
  })
}

async function netFetchText(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  if (typeof net?.fetch !== 'function') {
    throw new Error('net.fetch unavailable')
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await net.fetch(url, {
      method,
      headers,
      body,
      signal: ac.signal,
    })
    const text = await res.text()
    return { status: res.status, text }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs: number },
): Promise<{ ok: boolean; status: number; text: string }> {
  const method = init.method ?? 'GET'
  const headers = init.headers ?? {}
  const where = url.includes('token') ? '获取Token' : '语音识别'
  const errors: string[] = []

  // 1) Node https：超时可控，不依赖 undici
  try {
    const r = await httpsRequest(url, method, headers, init.body, init.timeoutMs)
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: r.text }
  } catch (e) {
    errors.push(`https:${e instanceof Error ? e.message : String(e)}`)
  }

  // 2) Electron net.fetch：走系统代理/证书
  try {
    const r = await withTimeout(
      netFetchText(url, method, headers, init.body, init.timeoutMs),
      init.timeoutMs + 500,
      'net.fetch',
    )
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: r.text }
  } catch (e) {
    errors.push(`net:${e instanceof Error ? e.message : String(e)}`)
  }

  console.warn('[baiduAsr] fetch failed', where, errors.join(' | '))
  throw new Error(formatNetError(new Error(errors.join(' | ')), where))
}

async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.apiKey === apiKey && now < tokenCache.expireAt - 120_000) {
    return tokenCache.token
  }
  const url =
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`
  let data: {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  try {
    const res = await fetchText(url, { timeoutMs: TOKEN_TIMEOUT_MS })
    if (!res.ok) {
      throw new Error(`token HTTP ${res.status}: ${res.text.slice(0, 200)}`)
    }
    data = JSON.parse(res.text) as typeof data
  } catch (e) {
    tokenCache = null
    if (e instanceof Error && /连接百度|失败/.test(e.message)) throw e
    throw new Error(formatNetError(e, '获取Token'))
  }
  if (!data.access_token) {
    tokenCache = null
    throw new Error(data.error_description || data.error || '百度 Token 获取失败（请检查 API Key / Secret）')
  }
  const ttlMs = (data.expires_in ?? 2592000) * 1000
  tokenCache = {
    token: data.access_token,
    expireAt: now + ttlMs,
    apiKey,
  }
  return data.access_token
}

export interface BaiduAsrRecognizePayload {
  apiKey: string
  secretKey: string
  speechBase64: string
  /** WAV 文件字节长度（整段音频） */
  len: number
  /** 1537 普通话；1737 英文 */
  devPid: number
}

export interface BaiduAsrRecognizeResult {
  err_no: number
  err_msg?: string
  result?: string[]
  sn?: string
}

export async function baiduAsrRecognize(payload: BaiduAsrRecognizePayload): Promise<BaiduAsrRecognizeResult> {
  try {
    // 外层硬超时：防止任何路径把渲染进程卡死在「识别中」
    return await withTimeout(recognizeOnce(payload), ASR_TIMEOUT_MS + TOKEN_TIMEOUT_MS + 2000, 'asr-total')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[baiduAsr]', msg)
    return { err_no: -1, err_msg: formatNetError(e, '语音识别') }
  }
}

async function recognizeOnce(payload: BaiduAsrRecognizePayload): Promise<BaiduAsrRecognizeResult> {
  const token = await getAccessToken(payload.apiKey, payload.secretKey)
  const body = JSON.stringify({
    format: 'wav',
    rate: 16000,
    channel: 1,
    cuid: 'vchat-electron',
    token,
    speech: payload.speechBase64,
    len: payload.len,
    dev_pid: payload.devPid,
  })
  const res = await fetchText('https://vop.baidu.com/server_api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    timeoutMs: ASR_TIMEOUT_MS,
  })
  if (!res.ok) {
    return {
      err_no: -1,
      err_msg: `vop HTTP ${res.status}: ${res.text.slice(0, 200)}`,
    }
  }
  try {
    return JSON.parse(res.text) as BaiduAsrRecognizeResult
  } catch {
    return { err_no: -1, err_msg: `识别响应无法解析：${res.text.slice(0, 120)}` }
  }
}
