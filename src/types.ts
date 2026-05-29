export interface ConversationProps {
  id: number;
  title: string;
  selectedModel: string;
  createdAt: string;
  updatedAt: string;
  providerId: number;
  /** ISO 时间；有值表示置顶，多条置顶按此字段降序 */
  pinnedAt?: string;
}
export interface ProviderProps {
  id: number;
  name: string;
  title?: string;
  desc?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  models: string[];
}
export type MessageStatus = 'loading' | 'streaming' | 'finished' | 'error'

export type TranslateTargetId = 'en' | 'zh-Hans' | 'zh-Hant'

/** PPT 生成篇幅 */
export type PptGenLengthId = 'short' | 'medium' | 'long'
/** fast：主题矢量排版，体积小、速度快；premium：封面/章节/结尾最多 4 张 AI 背景 */
export type PptGenQualityId = 'fast' | 'premium'
/** PPT 场景：通用 / 论文答辩 / 工作总结（后两者自动两阶段生成） */
export type PptGenScenarioId = 'general' | 'thesis' | 'work-summary'

/** 文生图尺寸（OpenAI 兼容） */
export type ImageGenSizeId = '1024x1024' | '1792x1024' | '1024x1792'

export type { JimengImageModelId } from './jimengModels'
import type { JimengImageModelId } from './jimengModels'

/** 已保存到 userData/attachments 或 images 的本地文件，供主进程读取并拼进模型上下文 */
export interface MessageAttachment {
  path: string;
  name: string;
}

export interface MessageProps {
  id: number;
  content: string;
  type: 'question' | 'answer';
  conversationId: number;
  status?: MessageStatus;
  createdAt: string;
  updatedAt: string;
  /** 兼容旧数据：首张图片预览；新消息可与 attachments 中首张图一致 */
  imagePath?: string;
  attachments?: MessageAttachment[];
  /** 存在时表示本条用户消息为「由模型翻译」请求；气泡仍展示原文 content */
  translateTarget?: TranslateTargetId;
  /** 存在时表示本条用户消息为「PPT 生成」请求；气泡仍展示用户输入的主题 */
  pptGenLength?: PptGenLengthId;
  pptGenQuality?: PptGenQualityId;
  pptGenScenario?: PptGenScenarioId;
  /** 存在时表示本条用户消息开启「联网搜索」 */
  webSearch?: boolean;
  /** 存在时表示本条用户消息为「文生图」请求 */
  imageGenSize?: ImageGenSizeId;
  /** 即梦文生图模型 req_key */
  imageGenModel?: JimengImageModelId;
  /** 助手回复：用户反馈（可选） */
  feedback?: 'like' | 'dislike';
  /** PPT 生成模式：主进程已生成的 .pptx 绝对路径 */
  exportPptPath?: string;
  /** PPT 生成失败时的错误说明 */
  exportPptError?: string;
  /** 正在生成 PPT（含背景图）时的进度文案 */
  pptBuildProgress?: string;
  /** PPT 已生成但背景图部分失败等提示 */
  exportPptWarning?: string;
  /** 联网搜索：本条助手回复使用的检索关键词与参考链接 */
  webSearchMeta?: WebSearchMeta;
}

export interface WebSearchSourceRef {
  title: string;
  url: string;
}

export interface WebSearchMeta {
  queries: string[];
  sources: WebSearchSourceRef[];
}

export type PptBuildProgressPayload = {
  answerId?: number
  current: number
  total: number
}

export type BuildPptxResult =
  | {
      ok: true
      path: string
      slideCount: number
      backgroundCount?: number
      backgroundFailed?: number
      warning?: string
    }
  | { ok: false; error: string }

export type SavePptxAsResult =
  | { ok: true; path: string }
  | { ok: false; cancelled?: boolean; error?: string }

/** 输入框提交：文本 + 待落盘的附件（均为 data URL） */
export interface MessageCreatePayload {
  text: string;
  uploads: { name: string; dataUrl?: string; storedPath?: string }[];
  /** 使用当前对话模型进行翻译：保存原文，向模型发送翻译指令；回复即为译文 */
  translateWithModel?: { target: TranslateTargetId };
  /** 使用当前对话模型生成 PPT 内容：保存用户主题，向模型发送生成指令；附件作为参考资料 */
  pptGenerateWithModel?: {
    length: PptGenLengthId
    quality?: PptGenQualityId
    scenario?: PptGenScenarioId
  };
  /** 文生图：调用即梦 API，不走对话模型流式 */
  generateImageWithModel?: { size: ImageGenSizeId; model?: JimengImageModelId };
  /** 联网搜索：主进程先由模型判断是否检索，再调 Tavily，最后流式回答 */
  webSearchWithModel?: boolean;
}

export type GenerateImageResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

/** 主进程 translate-text 返回 */
export type TranslateTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export interface ChatMessageProps {
  role: string;
  content: string;
  imagePath?: string;
  attachments?: MessageAttachment[];
}
export interface CreateChatProps {
  messages: ChatMessageProps[];
  providerName: string;
  selectedModel: string;
  messageId: number;
  webSearch?: boolean;
  uiLang?: 'zh' | 'en';
}

export interface UpdatgedStreamData {
  messageId: number;
  data: {
    is_end: boolean;
    result: string;
    is_error?: boolean;
    /** 为 true 时用 result 覆盖当前回复，而非追加（联网搜索进度提示） */
    replace?: boolean;
    /** 联网检索完成时附带，用于回答上方参考资料条 */
    webSearchMeta?: WebSearchMeta;
  }
}
export type OnUpdatedCallback = (data: UpdatgedStreamData) => void;

export interface MessageListInstance {
  ref: HTMLDivElement
}

export interface UniversalChunkProps {
  is_end: boolean;
  result: string;
}

export interface BaiduChunkProps {
  is_end: boolean;
  result: string;
}

export type AppTheme = 'light' | 'dark'

export interface AppConfig {
  language: 'zh' | 'en'
  fontSize: number
  providerConfigs: Record<string, Record<string, string>>
  /** 百度语音识别 https://console.bce.baidu.com/ai/ — 填写后语音输入走国内接口 */
  baiduAsrApiKey?: string
  baiduAsrSecretKey?: string
  /** 界面主题 */
  theme?: AppTheme
  /** 聊天主区域背景图（本机绝对路径，由主进程写入 userData） */
  chatBackgroundImagePath?: string
  /** 文生图模型名（须与中转分组在模型广场一致）；也可用 .env 的 IMAGE_GEN_MODEL */
  imageGenModel?: string
  /** 文生图后端：默认 jimeng；仅设为 openai 时改用 OpenAI 兼容接口（与对话模型无关） */
  imageGenBackend?: 'jimeng' | 'openai'
  /** 即梦文生图默认模型 req_key */
  imageGenJimengModel?: JimengImageModelId
  /** Tavily 联网搜索 API Key — https://tavily.com */
  tavilyApiKey?: string
  /** 是否将定位注入对话/联网搜索（默认开启） */
  locationEnabled?: boolean
  locationCity?: string
  locationRegion?: string
  locationCountry?: string
  locationLatitude?: number
  locationLongitude?: number
  locationSource?: 'manual' | 'ip' | 'gps' | ''
  locationUpdatedAt?: string
}

export const DEFAULT_CONFIG: AppConfig = {
  language: 'zh',
  fontSize: 14,
  providerConfigs: {},
  baiduAsrApiKey: '',
  baiduAsrSecretKey: '',
  theme: 'light',
  chatBackgroundImagePath: '',
  imageGenBackend: 'jimeng',
  imageGenJimengModel: 'jimeng_t2i_v40',
  tavilyApiKey: '',
  locationEnabled: true,
  locationCity: '',
  locationRegion: '',
  locationCountry: '',
  locationSource: '',
  locationUpdatedAt: '',
}