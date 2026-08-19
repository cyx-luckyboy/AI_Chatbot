/** chat=日常对话；workspace=工作台 Agent；pet=桌宠（后两者不进日常会话列表） */
export type ConversationKind = 'chat' | 'workspace' | 'pet'

export interface ConversationProps {
  id: number;
  title: string;
  selectedModel: string;
  createdAt: string;
  updatedAt: string;
  providerId: number;
  /** ISO 时间；有值表示置顶，多条置顶按此字段降序 */
  pinnedAt?: string;
  /** 缺省视为日常 chat */
  kind?: ConversationKind;
  /** 已由模型根据对话内容生成标题 */
  titleAiGenerated?: boolean;
}

export interface SuggestConversationTitlePayload {
  providerName: string
  selectedModel: string
  uiLang: 'zh' | 'en'
  messages: { role: 'user' | 'assistant'; content: string }[]
}

export type SuggestConversationTitleResult =
  | { ok: true; title: string; source: 'ai' | 'fallback'; error?: string }
  | { ok: false; error: string }
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

export type { JimengImageModelId } from '../domains/media/jimengModels'
import type { JimengImageModelId } from '../domains/media/jimengModels'

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
  /** 存在时表示本条用户消息开启「本机 Agent」（文件/命令工具） */
  agentMode?: boolean;
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
  /** 关联会议记录：在对话中展示录音卡片，点击可查看转写与总结 */
  meetingId?: number;
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
  /** 本机 Agent：主进程在授权工作区内读写文件、执行白名单命令 */
  agentWithModel?: boolean;
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
  /** 本机文件/命令 Agent 模式 */
  agentMode?: boolean;
  uiLang?: 'zh' | 'en';
  /** 工作台当前打开的文件与光标位置（1-based 行/列） */
  editorContext?: {
    path: string
    line: number
    column: number
  }
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

export type MeetingStatus =
  | 'recording'
  | 'transcribed'
  | 'completed'
  | 'summary_failed'

export interface TranscriptSegment {
  text: string
  startTime?: number
  endTime?: number
  isFinal: boolean
}

export interface SummarySection {
  heading: string
  bullets: string[]
}

export interface MeetingRecordProps {
  id?: number
  title: string
  status: MeetingStatus
  transcript: string
  segments: TranscriptSegment[]
  summaryOverview?: string
  summarySections?: SummarySection[]
  audioFileName: string
  durationMs: number
  waveformPeaks: number[]
  providerId: number
  selectedModel: string
  summaryError?: string
  /** 从对话入口发起的会议，总结完成后会在该对话插入录音卡片 */
  conversationId?: number
  createdAt: string
  updatedAt: string
}

export type MeetingAsrResultType = 'MID_TEXT' | 'FIN_TEXT'

export interface MeetingAsrResultPayload {
  meetingId: number
  type: MeetingAsrResultType
  text: string
  startTime?: number
  endTime?: number
}

export interface MeetingAsrStartPayload {
  meetingId: number
  devPid?: number
}

export type MeetingAsrStartResult =
  | { ok: true; sn: string }
  | { ok: false; error: string }

export interface MeetingAsrStopPayload {
  meetingId: number
}

export type MeetingAsrStopResult =
  | { ok: true; durationMs: number; waveformPeaks: number[]; audioFileName: string }
  | { ok: false; error: string }

export interface MeetingSummarizePayload {
  meetingId: number
  providerName: string
  selectedModel: string
  transcript: string
}

export interface MeetingTranslatePayload {
  text: string
  target: TranslateTargetId
  providerName: string
  selectedModel: string
  uiLang: 'zh' | 'en'
}

export interface MeetingSummaryDonePayload {
  meetingId: number
  title: string
  overview: string
  sections: SummarySection[]
}

export interface AppConfig {
  language: 'zh' | 'en'
  fontSize: number
  providerConfigs: Record<string, Record<string, string>>
  /** 百度语音识别 https://console.bce.baidu.com/ai/ — 填写后语音输入走国内接口 */
  baiduAsrApiKey?: string
  baiduAsrSecretKey?: string
  /** 百度实时语音识别 AppID（会议记录 WebSocket 必填） */
  baiduAsrAppId?: string
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
  /** 是否显示 Live2D 透明桌宠窗 */
  desktopPetEnabled?: boolean
  /** 桌宠窗在助手回复完成后用系统朗读播报 */
  desktopPetAutoSpeak?: boolean
  /** 使用本地奶龙 TTS（GPT-SoVITS / 代理），需自行启动服务 */
  nailongTtsEnabled?: boolean
  /** 本地奶龙 TTS 根地址，默认 http://127.0.0.1:9880 */
  nailongTtsBaseUrl?: string
  /** 桌宠专用对话会话 id（IndexedDB conversations） */
  petConversationId?: number
  /** 工作台 Agent 对话会话 id */
  workspaceConversationId?: number
  /** 本机 Agent 默认工作区（绝对路径）；工具只能访问该目录内文件 */
  agentWorkspacePath?: string
  /** 本机 Agent 模式保持开启（发送后不自动退出） */
  agentModeEnabled?: boolean
  /**
   * 本机 Agent「用编辑器打开」命令（PATH 中的 CLI）。
   * 例如：code（VS Code）、cursor、idea64。留空则自动尝试 code / cursor。
   */
  agentEditorCommand?: string
  /**
   * 已启用的模型供应商插件（name 列表）。
   * 空或缺省：全部视为启用（兼容旧配置）。
   */
  enabledProviders?: string[]
}

/** 主进程 → 桌宠窗：驱动状态机 / 朗读 */
export type PetAvatarState = 'idle' | 'thinking' | 'speaking'

export interface PetAvatarEvent {
  state: PetAvatarState
  /** speaking 时的纯文本（已尽量去 Markdown） */
  text?: string
  messageId?: number
  isError?: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  language: 'zh',
  fontSize: 14,
  providerConfigs: {},
  baiduAsrApiKey: '',
  baiduAsrSecretKey: '',
  baiduAsrAppId: '',
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
  desktopPetEnabled: false,
  desktopPetAutoSpeak: true,
  /** 桌宠默认走本地奶龙音色；服务未开时自动回退系统语音 */
  nailongTtsEnabled: true,
  nailongTtsBaseUrl: 'http://127.0.0.1:9880',
  agentWorkspacePath: '',
  agentModeEnabled: false,
  agentEditorCommand: 'code',
  enabledProviders: [],
}