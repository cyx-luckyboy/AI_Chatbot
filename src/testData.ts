import { MessageProps, ConversationProps, ProviderProps } from './types'
export const messages: MessageProps[] = [
  { id: 1, content: '什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'question', conversationId: 1 },
  { id: 2, content: '你的说法很请正确，理解的很不错,你的说法很请正确，理解的很不错', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'answer', conversationId: 1 },
  { id: 3, content: '请告诉我更多', createdAt: '2024-07-03',updatedAt: '2024-07-03',  type: 'question', conversationId: 1 },
  { id: 4, content: '你的说法很请正确，理解的很不错,你的说法很请正确，理解的很不错', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'answer', conversationId: 1 },
  { id: 5, content: '还有更多的信息吗', createdAt: '2024-07-03', type: 'question', updatedAt: '2024-07-03', conversationId: 1 },
  { id: 6, content: '', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'answer', status: 'loading', conversationId: 1 },
  { id: 7, content: '2 什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'question', conversationId: 2 },
  { id: 8, content: '你的说法很请正确', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'answer', conversationId: 2 },
  { id: 9, content: '请告诉我更多', createdAt: '2024-07-03',updatedAt: '2024-07-03',  type: 'question', conversationId: 2 },
  { id: 10, content: '你的说法很请正确，理解的很不错,你的说法很请正确，理解的很不错', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'answer', conversationId: 2 },
  { id: 11, content: '3 还有更多的信息吗', createdAt: '2024-07-03', type: 'question', updatedAt: '2024-07-03', conversationId: 3 },
  { id: 12, content: '', createdAt: '2024-07-03', updatedAt: '2024-07-03', type: 'answer', status: 'loading', conversationId: 3 },
]
export const conversations: ConversationProps[] = [
  { id: 1, selectedModel: 'claude-4.6-sonnet', title: '1 什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 2, selectedModel: 'claude-4.6-sonnet', title: '2 什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 3, selectedModel: 'claude-4.6-sonnet', title: '3 什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 4, selectedModel: 'claude-4.6-sonnet', title: '什么是光合作用, 你的说法很请正确，理解的很不错', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 5, selectedModel: 'claude-4.6-sonnet', title: '什么是光合作用1', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 6, selectedModel: 'claude-4.6-sonnet', title: '什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 7, selectedModel: 'claude-4.6-sonnet', title: '什么是光合作用', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4},
  { id: 8, selectedModel: 'claude-4.6-sonnet', title: '什么是光合作用, 你的说法很请正确，理解的很不错', createdAt: '2024-07-03', updatedAt: '2024-07-03', providerId: 4}
]

/** 均在「设置 → 模型」中配置 API Key + Base URL（部分厂商 Base URL 可留空使用默认） */
export const providers: ProviderProps[] = [
  {
    id: 1,
    name: 'qianfan',
    title: '百度千帆',
    desc: 'OpenAI 兼容或自建网关：填写 API Key 与 Base URL',
    models: ['ERNIE-4.0-8K', 'ERNIE-3.5-8K', 'ERNIE-Speed-128K'],
    avatar: 'https://aip-static.cdn.bcebos.com/landing/product/ernie-bote321e5.png',
    createdAt: '2024-07-03',
    updatedAt: '2024-07-03',
  },
  {
    id: 2,
    name: 'dashscope',
    title: '阿里灵积',
    desc: '通义千问兼容模式：Base URL 可留空，默认官方 compatible-mode',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-vl-plus'],
    avatar: 'https://qph.cf2.poecdn.net/main-thumb-pb-4160791-200-qlqunomdvkyitpedtghnhsgjlutapgfl.jpeg',
    createdAt: '2024-07-03',
    updatedAt: '2024-07-03',
  },
  {
    id: 3,
    name: 'deepseek',
    title: 'DeepSeek',
    desc: 'Base URL 可留空，默认 https://api.deepseek.com',
    models: ['deepseek-chat'],
    avatar: 'https://qph.cf2.poecdn.net/main-thumb-pb-4981273-200-phhqenmywlkiybehuaqvsxpfekviajex.jpeg',
    createdAt: '2024-12-27',
    updatedAt: '2024-12-27',
  },
  {
    id: 4,
    name: 'claude',
    title: 'Claude',
    desc: 'Anthropic Messages：填写完整 Base URL（仅 host 时会补 /v1/messages）',
    models: ['claude-4.6-sonnet'],
    avatar: 'https://www.anthropic.com/images/icons/apple-touch-icon.png',
    createdAt: '2026-05-03',
    updatedAt: '2026-05-03',
  },
  {
    id: 5,
    name: 'kimi',
    title: 'Kimi',
    desc: 'Moonshot 开放平台：Base URL 可留空，默认 https://api.moonshot.cn',
    models: ['kimi-k2-0711-preview', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    avatar: 'https://platform.moonshot.cn/favicon.ico',
    createdAt: '2026-05-04',
    updatedAt: '2026-05-04',
  },
]
