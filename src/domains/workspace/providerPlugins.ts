import type { AppConfig, ProviderProps } from '../../shared/types'
import { isProviderConfigReady } from './providerConfigReady'

/** 空数组 = 全部启用（兼容旧配置） */
export function isProviderPluginEnabled(providerName: string, cfg: AppConfig): boolean {
  const list = cfg.enabledProviders
  if (!list || list.length === 0) return true
  return list.includes(providerName)
}

export function filterEnabledReadyProviders(
  providers: ProviderProps[],
  cfg: AppConfig,
): ProviderProps[] {
  return providers.filter(
    (p) => isProviderPluginEnabled(p.name, cfg) && isProviderConfigReady(p.name, cfg),
  )
}

export const PROVIDER_PLUGIN_META: {
  name: string
  titleKey: string
  descKey: string
}[] = [
  { name: 'openai', titleKey: 'settings.pluginOpenai', descKey: 'settings.pluginOpenaiDesc' },
  { name: 'claude', titleKey: 'settings.pluginClaude', descKey: 'settings.pluginClaudeDesc' },
  { name: 'aipaibox', titleKey: 'settings.pluginAipaibox', descKey: 'settings.pluginAipaiboxDesc' },
  { name: 'deepseek', titleKey: 'settings.pluginDeepseek', descKey: 'settings.pluginDeepseekDesc' },
  { name: 'dashscope', titleKey: 'settings.pluginDashscope', descKey: 'settings.pluginDashscopeDesc' },
  { name: 'kimi', titleKey: 'settings.pluginKimi', descKey: 'settings.pluginKimiDesc' },
  { name: 'qianfan', titleKey: 'settings.pluginQianfan', descKey: 'settings.pluginQianfanDesc' },
  { name: 'xiaomi', titleKey: 'settings.pluginXiaomi', descKey: 'settings.pluginXiaomiDesc' },
  { name: 'minimax', titleKey: 'settings.pluginMinimax', descKey: 'settings.pluginMinimaxDesc' },
]
