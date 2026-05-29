import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { AppConfig, DEFAULT_CONFIG } from './types'
import { sanitizeLocationFields } from './userLocation'

const configPath = path.join(app.getPath('userData'), 'config.json')
let config = { ...DEFAULT_CONFIG }

/** 从 .env 补全厂商配置（仅当设置里对应项为空时写入） */
function applyEnvProviderDefaults(cfg: AppConfig): AppConfig {
  const providerConfigs = { ...cfg.providerConfigs }
  let changed = false
  let out: AppConfig = { ...cfg, providerConfigs }

  const aiKey = (process.env.AIPAIBOX_API_KEY || '').trim()
  const aiBase = (process.env.AIPAIBOX_BASE_URL || '').trim()
  if (aiKey || aiBase) {
    const prev = providerConfigs.aipaibox || {}
    const next: Record<string, string> = { ...prev }
    if (aiKey && !(prev.apiKey || '').trim()) {
      next.apiKey = aiKey
      changed = true
    }
    if (aiBase && !(prev.baseUrl || '').trim()) {
      next.baseUrl = aiBase
      changed = true
    }
    if (changed) providerConfigs.aipaibox = next
  }

  const volcAk = (process.env.VOLC_ACCESSKEY || process.env.VOLC_ACCESS_KEY_ID || '').trim()
  const volcSk = (process.env.VOLC_SECRETKEY || process.env.VOLC_SECRET_KEY || '').trim()
  if (volcAk || volcSk) {
    const prev = providerConfigs.jimeng || {}
    const next: Record<string, string> = { ...prev }
    let jimengChanged = false
    if (volcAk && !(prev.accessKeyId || '').trim()) {
      next.accessKeyId = volcAk
      jimengChanged = true
    }
    if (volcSk && !(prev.secretKey || '').trim()) {
      next.secretKey = volcSk
      jimengChanged = true
    }
    if (jimengChanged) {
      providerConfigs.jimeng = next
      changed = true
    }
  }

  const tavilyKey = (process.env.TAVILY_API_KEY || '').trim()
  if (tavilyKey && !(cfg.tavilyApiKey || '').trim()) {
    out = { ...out, tavilyApiKey: tavilyKey }
    changed = true
  }

  if (!changed) return cfg
  return { ...out, providerConfigs }
}

export const configManager = {
  async load() {
    try {
      const data = await fs.readFile(configPath, 'utf-8')
      const raw = { ...DEFAULT_CONFIG, ...JSON.parse(data) } as AppConfig
      const parsed = sanitizeLocationFields(raw)
      const merged = applyEnvProviderDefaults(parsed)
      const envFilled =
        merged.providerConfigs.aipaibox?.apiKey !== parsed.providerConfigs?.aipaibox?.apiKey ||
        merged.providerConfigs.aipaibox?.baseUrl !== parsed.providerConfigs?.aipaibox?.baseUrl ||
        merged.providerConfigs.jimeng?.accessKeyId !== parsed.providerConfigs?.jimeng?.accessKeyId ||
        merged.providerConfigs.jimeng?.secretKey !== parsed.providerConfigs?.jimeng?.secretKey ||
        merged.tavilyApiKey !== parsed.tavilyApiKey
      const locationCleaned =
        (raw.locationCity ?? '').trim() !== (parsed.locationCity ?? '').trim() ||
        (raw.locationRegion ?? '').trim() !== (parsed.locationRegion ?? '').trim()
      config = merged
      if (envFilled || locationCleaned) await this.save()
    } catch {
      config = applyEnvProviderDefaults({ ...DEFAULT_CONFIG })
      await this.save()
    }
    return config
  },

  async save() {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
    return config
  },

  async update(newConfig: Partial<AppConfig>) {
    config = {
      ...config,
      ...newConfig,
      providerConfigs: {
        ...config.providerConfigs,
        ...(newConfig.providerConfigs ?? {}),
      },
    }
    await this.save()
    return config
  },

  get() {
    return config
  }
} 