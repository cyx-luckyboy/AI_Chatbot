/**
 * 主进程：百度语音识别 token + server_api（避免渲染进程 CORS）
 * 文档：https://ai.baidu.com/ai-doc/SPEECH/Vk38lxily
 */

let tokenCache: { token: string; expireAt: number } | null = null

async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  const now = Date.now()
  if (tokenCache && now < tokenCache.expireAt - 120_000) {
    return tokenCache.token
  }
  const url =
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`token HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || '百度 Token 获取失败')
  }
  const ttlMs = (data.expires_in ?? 2592000) * 1000
  tokenCache = {
    token: data.access_token,
    expireAt: now + ttlMs,
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
  const token = await getAccessToken(payload.apiKey, payload.secretKey)
  const body = {
    format: 'wav',
    rate: 16000,
    channel: 1,
    cuid: 'vchat-electron',
    token,
    speech: payload.speechBase64,
    len: payload.len,
    dev_pid: payload.devPid,
  }
  const res = await fetch('https://vop.baidu.com/server_api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`vop HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as BaiduAsrRecognizeResult
  return json
}
