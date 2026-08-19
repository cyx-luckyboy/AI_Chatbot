import Dexie, { type EntityTable } from 'dexie'
import { ProviderProps, ConversationProps, MessageProps, MeetingRecordProps } from './types'

/** 首次启动写入；之后按 name 合并更新元数据（均在「设置 → 模型」中配 Key） */
const SEED_PROVIDERS: Omit<ProviderProps, 'id'>[] = [
  {
    name: 'qianfan',
    title: '百度千帆',
    desc: 'OpenAI 兼容或自建网关：填写 API Key 与 Base URL',
    models: ['ERNIE-4.0-8K', 'ERNIE-3.5-8K', 'ERNIE-Speed-128K'],
    avatar: 'https://aip-static.cdn.bcebos.com/landing/product/ernie-bote321e5.png',
    createdAt: '2026-05-07',
    updatedAt: '2026-05-07',
  },
  {
    name: 'dashscope',
    title: '阿里灵积',
    desc: '通义千问兼容模式：Base URL 可留空，默认官方 compatible-mode',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-vl-plus'],
    avatar: 'https://qph.cf2.poecdn.net/main-thumb-pb-4160791-200-qlqunomdvkyitpedtghnhsgjlutapgfl.jpeg',
    createdAt: '2026-05-07',
    updatedAt: '2026-05-07',
  },
  {
    name: 'deepseek',
    title: 'DeepSeek',
    desc: 'Base URL 可留空，默认 https://api.deepseek.com',
    models: ['deepseek-chat'],
    avatar: 'https://qph.cf2.poecdn.net/main-thumb-pb-4981273-200-phhqenmywlkiybehuaqvsxpfekviajex.jpeg',
    createdAt: '2026-05-07',
    updatedAt: '2026-05-07',
  },
  {
    name: 'claude',
    title: 'Claude',
    desc: 'Anthropic Messages：填写完整 Base URL（仅 host 时会补 /v1/messages）',
    models: ['claude-4.6-sonnet'],
    avatar: 'https://www.anthropic.com/images/icons/apple-touch-icon.png',
    createdAt: '2026-05-07',
    updatedAt: '2026-05-07',
  },
  {
    name: 'kimi',
    title: 'Kimi',
    desc: 'Moonshot 开放平台：Base URL 可留空，默认 https://api.moonshot.cn',
    models: ['kimi-k2-0711-preview', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    avatar: 'https://platform.moonshot.cn/favicon.ico',
    createdAt: '2026-05-07',
    updatedAt: '2026-05-07',
  },
  {
    name: 'xiaomi',
    title: '小米 MiMo',
    desc: 'Xiaomi MiMo OpenAI 兼容：Base URL 可留空，默认 https://api.xiaomimimo.com',
    models: ['mimo-v2.5-pro', 'mimo-v2-flash'],
    avatar: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/xiaomi.svg',
    createdAt: '2026-05-08',
    updatedAt: '2026-05-08',
  },
  {
    name: 'minimax',
    title: 'MiniMax',
    desc: 'OpenAI 兼容：Base URL 可留空，默认 https://api.minimax.io；国内可选用 https://api.minimaxi.com',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.1'],
    avatar: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/minimax.svg',
    createdAt: '2026-05-08',
    updatedAt: '2026-05-08',
  },
  {
    name: 'openai',
    title: 'ChatGPT',
    desc: 'OpenAI 官方 API：Key 可来自设置或 OPENAI_API_KEY；Base 可留空，默认 https://api.openai.com',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    avatar: 'https://openai.com/favicon.ico',
    createdAt: '2026-05-08',
    updatedAt: '2026-05-08',
  },
  {
    name: 'aipaibox',
    title: 'AI派中转',
    desc: 'OpenAI 兼容中转：在 api.aipaibox.com 创建令牌（sk-…）；Base 可留空，默认 https://api.aipaibox.com；模型名须与令牌分组在模型广场一致',
    models: [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-6-thinking',
      'claude-opus-4-7',
      'claude-opus-4-7-thinking',
    ],
    avatar: 'https://api.aipaibox.com/favicon.ico',
    createdAt: '2026-05-16',
    updatedAt: '2026-05-16',
  },
  {
    name: 'jimeng',
    title: '即梦AI',
    desc: '火山引擎即梦文生图 4.0：在「访问控制→密钥管理」创建 IAM 的 AK/SK（非 apikey- 令牌），仅用于「图像生成」',
    models: ['jimeng_t2i_v46', 'jimeng_t2i_v40', 'jimeng_t2i_v30'],
    avatar: 'https://www.volcengine.com/favicon.ico',
    createdAt: '2026-05-18',
    updatedAt: '2026-05-18',
  },
]

export const db = new Dexie('vChatDatabase') as Dexie & {
  providers: EntityTable<ProviderProps, 'id'>
  conversations: EntityTable<ConversationProps, 'id'>
  messages: EntityTable<MessageProps, 'id'>
  meetings: EntityTable<MeetingRecordProps, 'id'>
}

db.version(1).stores({
  providers: '++id, name',
  conversations: '++id, providerId',
  messages: '++id, conversationId',
})

db.version(2).stores({
  providers: '++id, name',
  conversations: '++id, providerId',
  messages: '++id, conversationId',
  meetings: '++id, status, createdAt',
})

db.version(3).stores({
  providers: '++id, name',
  conversations: '++id, providerId',
  messages: '++id, conversationId, meetingId',
  meetings: '++id, status, createdAt, conversationId',
})

export const initProviders = async () => {
  const count = await db.providers.count()
  if (count === 0) {
    await db.providers.bulkAdd(SEED_PROVIDERS)
    return
  }
  const existingNames = new Set((await db.providers.toArray()).map((p) => p.name))
  for (const p of SEED_PROVIDERS) {
    if (!existingNames.has(p.name)) {
      await db.providers.add(p)
    } else {
      const row = await db.providers.where('name').equals(p.name).first()
      if (row?.id != null) {
        await db.providers.update(row.id, {
          title: p.title,
          desc: p.desc,
          models: p.models,
          avatar: p.avatar,
          updatedAt: p.updatedAt,
        })
      }
    }
  }
}
