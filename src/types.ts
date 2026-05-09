export interface ConversationProps {
  id: number;
  title: string;
  selectedModel: string;
  createdAt: string;
  updatedAt: string;
  providerId: number;
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
  /** 助手回复：用户反馈（可选） */
  feedback?: 'like' | 'dislike';
}

/** 输入框提交：文本 + 待落盘的附件（均为 data URL） */
export interface MessageCreatePayload {
  text: string;
  uploads: { dataUrl: string; name: string }[];
  /** 使用当前对话模型进行翻译：保存原文，向模型发送翻译指令；回复即为译文 */
  translateWithModel?: { target: TranslateTargetId };
}

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
}

export interface UpdatgedStreamData {
  messageId: number;
  data: {
    is_end: boolean;
    result: string;
    is_error?: boolean;
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
}

export const DEFAULT_CONFIG: AppConfig = {
  language: 'zh',
  fontSize: 14,
  providerConfigs: {},
  baiduAsrApiKey: '',
  baiduAsrSecretKey: '',
  theme: 'light',
  chatBackgroundImagePath: '',
}