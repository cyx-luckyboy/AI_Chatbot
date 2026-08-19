import type { TranslateTargetId } from '../../shared/types'

const TARGET_LABEL: Record<TranslateTargetId, { zh: string; en: string }> = {
  en: { zh: '英语', en: 'English' },
  'zh-Hans': { zh: '简体中文', en: 'Simplified Chinese' },
  'zh-Hant': { zh: '繁体中文', en: 'Traditional Chinese' },
}

/** 发给大模型的用户消息正文：要求只输出译文 */
export function buildTranslatePromptForModel(
  originalText: string,
  target: TranslateTargetId,
  uiLang: 'zh' | 'en',
): string {
  const langName = TARGET_LABEL[target][uiLang === 'zh' ? 'zh' : 'en']
  const body = originalText.trim()
  if (uiLang === 'zh') {
    return `请将下面文本翻译成${langName}。只输出译文，不要解释、不要添加标题或引号。\n\n---\n\n${body}`
  }
  return `Translate the following text into ${langName}. Output only the translation, with no explanation, heading, or quotation marks.\n\n---\n\n${body}`
}
