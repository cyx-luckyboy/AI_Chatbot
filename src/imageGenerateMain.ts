import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { configManager } from './config'
import { normalizeOpenAICompatibleBaseURL } from './helper'
import { generateImageJimeng } from './jimengGenerateMain'
import type { JimengImageModelId } from './jimengModels'
import type { GenerateImageResult, ImageGenSizeId } from './types'

export type { GenerateImageResult as GenerateImageMainResult }

/** 按常见中转可用性排序；可通过 IMAGE_GEN_MODEL 或 config.imageGenModel 覆盖首选项 */
const DEFAULT_IMAGE_MODEL_CANDIDATES = ['dall-e-3', 'dall-e-2', 'gpt-image-1', 'gpt-image-2']

type ImageGenProfile = { label: string; apiKey: string; baseUrl: string }

function resolveImageModels(): string[] {
  const cfg = configManager.get()
  const fromCfg = (cfg.imageGenModel || '').trim()
  const fromEnvList = (process.env.IMAGE_GEN_MODELS || '').trim()
  const fromEnvSingle = (process.env.IMAGE_GEN_MODEL || '').trim()

  if (fromCfg) return [fromCfg]
  if (fromEnvList) return fromEnvList.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  if (fromEnvSingle) return [fromEnvSingle]
  return [...DEFAULT_IMAGE_MODEL_CANDIDATES]
}

function resolveImageProfiles(): ImageGenProfile[] {
  const cfg = configManager.get()
  const aipaibox = cfg.providerConfigs.aipaibox || {}
  const openai = cfg.providerConfigs.openai || {}

  const aipKey = (aipaibox.apiKey || process.env.AIPAIBOX_API_KEY || '').trim()
  const aipBase = normalizeOpenAICompatibleBaseURL(
    (aipaibox.baseUrl || process.env.AIPAIBOX_BASE_URL || 'https://api.aipaibox.com').trim(),
  )
  const oaiKey = (openai.apiKey || process.env.OPENAI_API_KEY || '').trim()
  const oaiBase = normalizeOpenAICompatibleBaseURL(
    (openai.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com').trim(),
  )

  const force = (process.env.IMAGE_GEN_PROVIDER || '').trim().toLowerCase()
  if (force === 'openai' && oaiKey) {
    return [{ label: 'OpenAI', apiKey: oaiKey, baseUrl: oaiBase }]
  }
  if (force === 'aipaibox' && aipKey) {
    return [{ label: 'AI派', apiKey: aipKey, baseUrl: aipBase }]
  }

  const profiles: ImageGenProfile[] = []
  if (aipKey) profiles.push({ label: 'AI派', apiKey: aipKey, baseUrl: aipBase })
  if (oaiKey && oaiKey !== aipKey) {
    profiles.push({ label: 'OpenAI', apiKey: oaiKey, baseUrl: oaiBase })
  } else if (!aipKey && oaiKey) {
    profiles.push({ label: 'OpenAI', apiKey: oaiKey, baseUrl: oaiBase })
  }
  return profiles
}

function sizeForModel(model: string, size: ImageGenSizeId): string {
  if (model.toLowerCase().includes('dall-e-2')) return '1024x1024'
  return size
}

function safeStem(prompt: string): string {
  return prompt.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 40) || 'image'
}

function extractErrorMessage(raw: string, data: { error?: { message?: string } }): string {
  return data.error?.message || raw.slice(0, 500) || '未知错误'
}

function isRetryableModelError(msg: string, status: number): boolean {
  const lower = msg.toLowerCase()
  if (/no available channel/i.test(msg)) return true
  if (/model.*not found|does not exist|unknown model|invalid model/i.test(lower)) return true
  if (/not supported|unsupported/i.test(lower) && /model/i.test(lower)) return true
  if (status === 404 || status === 503) return true
  return false
}

function formatImageGenError(lastError: string, tried: string[], hadOpenAiFallback: boolean): string {
  if (/no available channel/i.test(lastError)) {
    let msg =
      `当前令牌分组未开通绘图通道（已尝试：${tried.join('、')}）。\n\n` +
      `常见原因：AI派 令牌只勾选了 Claude 对话模型，未包含 dall-e-3 等图像模型。\n\n` +
      `解决办法：\n` +
      `1. 登录 api.aipaibox.com → 模型广场 → 为分组勾选 dall-e-3（或新建含图像模型的令牌）\n` +
      `2. 在「设置 → 模型 → ChatGPT/OpenAI」填写官方 Key，文生图会自动回退到 OpenAI\n` +
      `3. 在 .env 设置 IMAGE_GEN_MODEL=分组内实际可用的模型名`
    if (!hadOpenAiFallback) {
      msg += `\n4. 若只用 OpenAI 出图，可设 IMAGE_GEN_PROVIDER=openai`
    }
    return `${msg}\n\n接口返回：${lastError}`
  }
  if (tried.length > 1) {
    return `绘图失败（已尝试：${tried.join('、')}）：${lastError}`
  }
  return lastError
}

async function downloadImageUrl(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

type ImageApiResponse = {
  data?: { b64_json?: string; url?: string }[]
  error?: { message?: string }
}

async function requestOneImage(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  size: ImageGenSizeId,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string; status: number }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: sizeForModel(model, size),
      n: 1,
      response_format: 'b64_json',
    }),
  })
  const raw = await res.text()
  let data: ImageApiResponse
  try {
    data = JSON.parse(raw) as ImageApiResponse
  } catch {
    return { ok: false, error: raw.slice(0, 500) || `HTTP ${res.status}`, status: res.status }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: extractErrorMessage(raw, data),
      status: res.status,
    }
  }
  const item = data.data?.[0]
  if (!item) return { ok: false, error: '接口未返回图片数据', status: res.status }

  if (item.b64_json) {
    return { ok: true, buffer: Buffer.from(item.b64_json, 'base64') }
  }
  if (item.url) {
    return { ok: true, buffer: await downloadImageUrl(item.url) }
  }
  return { ok: false, error: '返回格式不支持（无 b64_json 或 url）', status: res.status }
}

function shouldUseOpenAiImageBackend(): boolean {
  return (process.env.IMAGE_GEN_BACKEND || '').trim().toLowerCase() === 'openai'
}

/** 文生图：固定即梦 4.0（与当前对话模型无关）；仅 IMAGE_GEN_BACKEND=openai 时走兼容接口 */
export async function generateImageMain(
  prompt: string,
  size: ImageGenSizeId,
  model?: JimengImageModelId,
): Promise<GenerateImageResult> {
  if (shouldUseOpenAiImageBackend()) {
    return generateImageOpenAiCompat(prompt, size)
  }
  return generateImageJimeng(prompt, size, model)
}

/** OpenAI 兼容 images/generations */
async function generateImageOpenAiCompat(
  prompt: string,
  size: ImageGenSizeId,
): Promise<GenerateImageResult> {
  const trimmed = prompt.trim()
  if (!trimmed) return { ok: false, error: '提示词不能为空' }

  const profiles = resolveImageProfiles()
  const models = resolveImageModels()
  if (profiles.length === 0) {
    return {
      ok: false,
      error: '请先在「设置 → 模型」配置 AI派中转 或 OpenAI 的 API Key（也可在 .env 设置 AIPAIBOX_API_KEY）',
    }
  }

  const tried: string[] = []
  let lastError = '绘图请求失败'
  const hadOpenAiFallback = profiles.some((p) => p.label === 'OpenAI')

  try {
    for (const profile of profiles) {
      const endpoint = `${profile.baseUrl.replace(/\/+$/, '')}/images/generations`
      for (const model of models) {
        tried.push(`${profile.label}/${model}`)
        const result = await requestOneImage(endpoint, profile.apiKey, model, trimmed, size)
        if (result.ok) {
          const dir = path.join(app.getPath('userData'), 'generated-images')
          await fs.mkdir(dir, { recursive: true })
          const fileName = `${safeStem(trimmed)}-${Date.now()}.png`
          const outPath = path.join(dir, fileName)
          await fs.writeFile(outPath, result.buffer)
          return { ok: true, path: outPath }
        }
        lastError = result.error
        if (!isRetryableModelError(result.error, result.status)) {
          return { ok: false, error: formatImageGenError(lastError, tried, hadOpenAiFallback) }
        }
      }
    }

    return { ok: false, error: formatImageGenError(lastError, tried, hadOpenAiFallback) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-image]', e)
    return {
      ok: false,
      error: formatImageGenError(msg, tried.length ? tried : models.map((m) => `?/${m}`), hadOpenAiFallback),
    }
  }
}
