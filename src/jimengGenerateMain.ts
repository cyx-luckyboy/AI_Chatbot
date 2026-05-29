import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { configManager } from './config'
import {
  isVolcVisualSuccess,
  volcVisualPost,
  type VolcCredentials,
  type VolcVisualResponse,
} from './volcVisualApi'
import {
  DEFAULT_JIMENG_IMAGE_MODEL,
  resolveJimengImageModelId,
  type JimengImageModelId,
} from './jimengModels'
import type { GenerateImageResult, ImageGenSizeId } from './types'
const POLL_MS = 2000
const POLL_MAX_MS = 180_000

const JIMENG_AK_SK_GUIDE =
  '请到火山引擎控制台「访问控制 → 密钥管理」创建 IAM 访问密钥：Access Key ID（常见以 AKLT 开头）与 Secret Access Key 成对填入「设置 → 模型 → 即梦AI」。勿填即梦/方舟页面的 apikey-… 或 AI派的 sk-… 令牌。'

function resolveJimengCredentials(): VolcCredentials | null {
  const cfg = configManager.get()
  const jimeng = cfg.providerConfigs.jimeng || {}
  const accessKeyId = (
    jimeng.accessKeyId ||
    process.env.VOLC_ACCESSKEY ||
    process.env.VOLC_ACCESS_KEY_ID ||
    ''
  ).trim()
  const secretKey = (
    jimeng.secretKey ||
    process.env.VOLC_SECRETKEY ||
    process.env.VOLC_SECRET_KEY ||
    ''
  ).trim()
  if (!accessKeyId || !secretKey) return null
  return { accessKeyId, secretKey }
}

/** 在请求前拦截明显填错的密钥类型 */
export function validateJimengCredentials(creds: VolcCredentials): string | null {
  const ak = creds.accessKeyId.trim()
  const sk = creds.secretKey.trim()
  const wrongToken = (s: string) =>
    /^apikey-/i.test(s) || /^sk-/i.test(s) || /^Bearer\s+/i.test(s)

  if (wrongToken(ak) || wrongToken(sk)) {
    const apikeyVal = /^apikey-/i.test(ak) ? ak : /^apikey-/i.test(sk) ? sk : ''
    if (apikeyVal) {
      const preview = apikeyVal.length > 32 ? `${apikeyVal.slice(0, 32)}…` : apikeyVal
      return `当前填写的是 apikey 令牌（${preview}），不能用于本应用签名调用。${JIMENG_AK_SK_GUIDE}`
    }
    return `密钥类型不正确。${JIMENG_AK_SK_GUIDE}`
  }
  return null
}

/** 与 UI 三种比例对应；3.0 上限较低，4.0/4.6 支持 2K */
function jimengWidthHeight(
  size: ImageGenSizeId,
  modelId: JimengImageModelId,
): { width: number; height: number } {
  if (modelId === 'jimeng_t2i_v30') {
    switch (size) {
      case '1792x1024':
        return { width: 1664, height: 936 }
      case '1024x1792':
        return { width: 936, height: 1664 }
      default:
        return { width: 1328, height: 1328 }
    }
  }
  switch (size) {
    case '1792x1024':
      return { width: 2560, height: 1440 }
    case '1024x1792':
      return { width: 1440, height: 2560 }
    default:
      return { width: 2048, height: 2048 }
  }
}

function buildSubmitBody(
  reqKey: string,
  modelId: JimengImageModelId,
  prompt: string,
  width: number,
  height: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    req_key: reqKey,
    prompt,
    width,
    height,
    force_single: true,
  }
  if (modelId === 'jimeng_t2i_v30') {
    body.use_pre_llm = true
  } else {
    body.scale = 0.5
  }
  return body
}

function safeStem(prompt: string): string {
  return prompt.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 40) || 'image'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type SubmitData = { task_id?: string }
type ResultData = {
  status?: string
  binary_data_base64?: string[] | null
  image_urls?: string[] | null
}

async function downloadImageUrl(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const VOLC_ERROR_HINTS: Record<number, string> = {
  50400: '访问被拒绝：请确认已在火山引擎控制台开通「即梦AI / 智能视觉」服务，且 AK/SK 有效',
  50411: 'Access Key 无效，请检查「设置 → 模型 → 即梦AI」中的 Access Key ID',
  50413: '签名错误，请检查 Secret Access Key 是否与 Access Key ID 成对',
}

function translateVolcMessage(message: string): string | undefined {
  const m = message.trim()
  if (!m) return undefined
  if (/security token.*invalid/i.test(m)) {
    const token = m.match(/\[([^\]]+)\]/)?.[1] || ''
    if (/^apikey-/i.test(token)) {
      return `请求中的 apikey（${token}）无效：该类型不是 IAM Access Key。${JIMENG_AK_SK_GUIDE}`
    }
    return `安全令牌无效，请改用火山引擎 IAM 的 Access Key ID + Secret Access Key。${JIMENG_AK_SK_GUIDE}`
  }
  if (/SignatureDoesNotMatch|signature.*not.*match/i.test(m)) {
    return `签名不匹配，请核对 Secret Access Key 是否与 Access Key ID 成对、且无多余空格。`
  }
  if (/InvalidAccessKey|invalid.*access.*key/i.test(m)) {
    return `Access Key 无效。${JIMENG_AK_SK_GUIDE}`
  }
  return undefined
}

function formatVolcError(res: VolcVisualResponse<unknown>, fallback: string): string {
  const code = res.code
  if (code && VOLC_ERROR_HINTS[code]) return VOLC_ERROR_HINTS[code]
  if (res.message) {
    return translateVolcMessage(res.message) || res.message
  }
  if (code) return `${fallback}（错误码 ${code}）`
  return `${fallback}。${JIMENG_AK_SK_GUIDE}`
}

/** 火山引擎即梦 AI 文生图（异步任务） */
export async function generateImageJimeng(
  prompt: string,
  size: ImageGenSizeId,
  modelId?: JimengImageModelId,
): Promise<GenerateImageResult> {
  const trimmed = prompt.trim()
  if (!trimmed) return { ok: false, error: '提示词不能为空' }

  const creds = resolveJimengCredentials()
  if (!creds) {
    return {
      ok: false,
      error:
        '请先在「设置 → 模型 → 即梦AI」填写火山引擎 Access Key ID 与 Secret Access Key（或在 .env 设置 VOLC_ACCESSKEY / VOLC_SECRETKEY）',
    }
  }

  const credErr = validateJimengCredentials(creds)
  if (credErr) return { ok: false, error: credErr }

  const resolvedModel = resolveJimengImageModelId(
    modelId || configManager.get().imageGenJimengModel || DEFAULT_JIMENG_IMAGE_MODEL,
  )
  const reqKey = resolvedModel
  const { width, height } = jimengWidthHeight(size, resolvedModel)

  try {
    const submit = await volcVisualPost<SubmitData>(
      creds,
      'CVSync2AsyncSubmitTask',
      buildSubmitBody(reqKey, resolvedModel, trimmed, width, height),
    )

    if (!isVolcVisualSuccess(submit.code) || !submit.data?.task_id) {
      return { ok: false, error: formatVolcError(submit, '提交即梦任务失败') }
    }

    const taskId = submit.data.task_id
    const reqJson = JSON.stringify({ return_url: true })
    const deadline = Date.now() + POLL_MAX_MS

    while (Date.now() < deadline) {
      await sleep(POLL_MS)
      const poll = await volcVisualPost<ResultData>(creds, 'CVSync2AsyncGetResult', {
        req_key: reqKey,
        task_id: taskId,
        req_json: reqJson,
      })

      if (!isVolcVisualSuccess(poll.code)) {
        return { ok: false, error: formatVolcError(poll, '查询即梦任务失败') }
      }

      const status = poll.data?.status
      if (status === 'in_queue' || status === 'generating') continue
      if (status === 'not_found' || status === 'expired') {
        return { ok: false, error: `任务已过期或未找到（${status}），请重试` }
      }

      if (status === 'done') {
        const b64List = poll.data?.binary_data_base64?.filter(Boolean) ?? []
        const urlList = poll.data?.image_urls?.filter(Boolean) ?? []

        let buffer: Buffer | undefined
        if (b64List[0]) {
          buffer = Buffer.from(b64List[0], 'base64')
        } else if (urlList[0]) {
          buffer = await downloadImageUrl(urlList[0])
        }

        if (!buffer?.length) {
          return { ok: false, error: '即梦任务完成但未返回图片数据' }
        }

        const dir = path.join(app.getPath('userData'), 'generated-images')
        await fs.mkdir(dir, { recursive: true })
        const outPath = path.join(dir, `${safeStem(trimmed)}-${Date.now()}.png`)
        await fs.writeFile(outPath, buffer)
        return { ok: true, path: outPath }
      }

      return { ok: false, error: `未知任务状态：${status ?? 'unknown'}` }
    }

    return { ok: false, error: '即梦生成超时，请稍后重试' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[jimeng generate]', e)
    if (/SignatureDoesNotMatch|InvalidCredential|Access Key/i.test(msg)) {
      return { ok: false, error: `火山引擎鉴权失败，请检查 AK/SK 是否正确：${msg}` }
    }
    return { ok: false, error: msg }
  }
}

export function hasJimengCredentials(): boolean {
  return resolveJimengCredentials() !== null
}
