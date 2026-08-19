import type { AppConfig } from '../../shared/types'

/** 渲染进程侧粗判：所选模型厂商是否已在设置中填好 Key（与 createProvider 规则对齐，不含 .env 兜底） */
export function isProviderConfigReady(providerName: string, cfg: AppConfig): boolean {
  const c = cfg.providerConfigs[providerName] || {}
  const apiKey = (c.apiKey || '').trim()
  switch (providerName) {
    case 'qianfan':
      return !!(apiKey && (c.baseUrl || '').trim())
    case 'claude':
      return !!(apiKey && (c.baseUrl || '').trim())
    case 'dashscope':
    case 'deepseek':
    case 'kimi':
    case 'xiaomi':
    case 'minimax':
      return !!apiKey
    case 'openai':
    case 'aipaibox':
      return !!apiKey
    default:
      return !!apiKey
  }
}

export function pickFirstReadyProvider(
  providers: { id: number; name: string; models: string[] }[],
  cfg: AppConfig,
): string {
  for (const p of providers) {
    if (isProviderConfigReady(p.name, cfg) && p.models.length > 0) {
      return `${p.id}/${p.models[0]}`
    }
  }
  return providers[0] ? `${providers[0].id}/${providers[0].models[0]}` : ''
}
