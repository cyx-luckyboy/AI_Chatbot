import type { TranslateTargetId } from '../../shared/types'

export async function translateLongText(
  text: string,
  target: TranslateTargetId,
  providerName: string,
  selectedModel: string,
  uiLang: 'zh' | 'en',
): Promise<string> {
  const res = await window.electronAPI.meetingTranslate({
    text,
    target,
    providerName,
    selectedModel,
    uiLang,
  })
  if (!res.ok) throw new Error(res.error)
  return res.text
}
