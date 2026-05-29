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

const xiaomiFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: '小米 MiMo API Key（开放平台发放）' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://api.xiaomimimo.com',
  },
];

const minimaxFields: ProviderConfigItem[] = [
  { ...apiKeyBaseUrlConfig[0], placeholder: 'MiniMax API Key（Bearer，见开放平台账户）' },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://api.minimax.io；国内可填 https://api.minimaxi.com',
  },
];

const openaiFields: ProviderConfigItem[] = [
  {
    ...apiKeyBaseUrlConfig[0],
    placeholder: 'OpenAI API Key（sk-…）；可与 .env 中 OPENAI_API_KEY 一致',
  },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://api.openai.com；代理或 Azure 时填写对应根地址',
  },
];

const jimengFields: ProviderConfigItem[] = [
  {
    key: 'accessKeyId',
    label: 'Access Key ID',
    value: '',
    type: 'password',
    required: true,
    placeholder: 'IAM 密钥（常见 AKLT 开头）；勿填 apikey- 或 sk- 令牌',
  },
  {
    key: 'secretKey',
    label: 'Secret Access Key',
    value: '',
    type: 'password',
    required: true,
    placeholder: '与 Access Key ID 成对；控制台创建密钥时仅显示一次',
  },
]

const aipaiboxFields: ProviderConfigItem[] = [
  {
    ...apiKeyBaseUrlConfig[0],
    placeholder: 'AI派令牌 API Key（sk-…，在 api.aipaibox.com 令牌管理创建）',
  },
  {
    ...apiKeyBaseUrlConfig[1],
    placeholder: '可留空，默认 https://api.aipaibox.com（请求会自动补 /v1）',
  },
];

export const providerConfigs: Record<string, ProviderConfigItem[]> = {
  qianfan: qianfanFields,
  dashscope: dashscopeFields,
  deepseek: deepseekFields,
  claude: claudeFields,
  kimi: kimiFields,
  xiaomi: xiaomiFields,
  minimax: minimaxFields,
  openai: openaiFields,
  aipaibox: aipaiboxFields,
  jimeng: jimengFields,
};
