import { BaseProvider } from './BaseProvider'
import { ClaudeDirectProvider } from './ClaudeDirectProvider'
import { OpenAIProvider } from './OpenAIProvider'
import { configManager } from '../config'

const DASHSCOPE_OPENAI_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEEPSEEK_OPENAI_BASE = 'https://api.deepseek.com'
const KIMI_OPENAI_BASE = 'https://api.moonshot.cn'

function pickBaseUrl(config: Record<string, string>, fallback: string): string {
  const u = config.baseUrl?.trim()
  return u || fallback
}

export function createProvider(providerName: string): BaseProvider {
  const config = configManager.get()
  const c = config.providerConfigs[providerName] || {}
  const apiKey = (c.apiKey || '').trim()

  switch (providerName) {
    case 'qianfan': {
      if (!apiKey) throw new Error('百度千帆：请在设置中填写 API Key')
      const baseUrl = (c.baseUrl || '').trim()
      if (!baseUrl) throw new Error('百度千帆：请填写 Base URL（OpenAI 兼容网关地址）')
      return new OpenAIProvider(apiKey, baseUrl)
    }
    case 'dashscope': {
      if (!apiKey) throw new Error('阿里灵积：请在设置中填写 API Key')
      return new OpenAIProvider(apiKey, pickBaseUrl(c, DASHSCOPE_OPENAI_BASE))
    }
    case 'deepseek': {
      if (!apiKey) throw new Error('DeepSeek：请在设置中填写 API Key')
      return new OpenAIProvider(apiKey, pickBaseUrl(c, DEEPSEEK_OPENAI_BASE))
    }
    case 'kimi': {
      if (!apiKey) throw new Error('Kimi：请在设置中填写 API Key')
      return new OpenAIProvider(apiKey, pickBaseUrl(c, KIMI_OPENAI_BASE))
    }
    case 'claude': {
      const key = apiKey || process.env.ANTHROPIC_API_KEY || ''
      const baseUrl = (c.baseUrl || process.env.ANTHROPIC_BASE_URL || '').trim()
      if (!key || !baseUrl) {
        throw new Error(
          'Claude：请在「设置」填写 API Key 与 Base URL，或在 .env 中设置 ANTHROPIC_API_KEY、ANTHROPIC_BASE_URL',
        )
      }
      return new ClaudeDirectProvider(key, baseUrl)
    }
    default:
      throw new Error(`不支持的厂商: ${providerName}`)
  }
}
