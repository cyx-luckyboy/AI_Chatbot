export interface ProviderConfigItem {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'password' | 'number';
  required?: boolean;
  placeholder?: string;
}

export const apiKeyBaseUrlConfig: ProviderConfigItem[] = [
  {
    key: 'apiKey',
    label: 'API Key',
    value: '',
    type: 'password',
    required: true,
    placeholder: '请输入 API Key',
  },
  {
    key: 'baseUrl',
    label: 'Base URL',
    value: '',
    type: 'text',
    required: false,
    placeholder: 'OpenAI 兼容根地址，可留空使用官方默认',
  },
];

const qianfanFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: '千帆 / 网关下发的 API Key' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: 'OpenAI 兼容 Base，如自建代理；无则填官方兼容地址',
  },
];

const dashscopeFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: 'DashScope API-Key' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
];

const deepseekFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: 'DeepSeek API Key' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://api.deepseek.com',
  },
];

const claudeFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: 'x-api-key 或网关密钥；可与 .env 中 ANTHROPIC_API_KEY 一致' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '完整 URL 或仅 host；可与 ANTHROPIC_BASE_URL 一致',
  },
];

const kimiFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: 'Moonshot / Kimi API Key' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://api.moonshot.cn',
  },
];

export const providerConfigs: Record<string, ProviderConfigItem[]> = {
  qianfan: qianfanFields,
  dashscope: dashscopeFields,
  deepseek: deepseekFields,
  claude: claudeFields,
  kimi: kimiFields,
};
