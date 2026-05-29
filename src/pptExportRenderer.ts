import type { MessageProps } from './types'
import type { useMessageStore } from './stores/message'
type MessageStore = ReturnType<typeof useMessageStore>

export async function buildPptxForAnswerMessage(options: {
  answerId: number
  markdown: string
  question: MessageProps
  messageStore: MessageStore
  t: (key: string, params?: Record<string, unknown>) => string
}): Promise<void> {
  const { answerId, markdown, question, messageStore, t } = options
  if (!question.pptGenLength || !markdown.trim()) return

  const suggestedName = question.content.trim()
  const quality = question.pptGenQuality ?? 'fast'

  const removeProgress = window.electronAPI.onPptBuildProgress((p) => {
    if (p.answerId !== undefined && p.answerId !== answerId) return
    const label =
      p.total > 0
        ? t('common.pptBuildingProgress', { current: p.current, total: p.total })
        : quality === 'premium'
          ? t('common.pptBuildingStart')
          : t('common.pptBuildingFast')
    void messageStore.updateMessage(answerId, { pptBuildProgress: label })
  })

  try {
    await messageStore.updateMessage(answerId, {
      pptBuildProgress:
        quality === 'premium' ? t('common.pptBuildingStart') : t('common.pptBuildingFast'),
      exportPptPath: undefined,
      exportPptError: undefined,
      exportPptWarning: undefined,
    })
    const result = await window.electronAPI.buildPptxFromMarkdown({
      markdown,
      suggestedName,
      answerId,
      quality,
    })
    if (result.ok) {
      await messageStore.updateMessage(answerId, {
        exportPptPath: result.path,
        exportPptError: undefined,
        exportPptWarning: result.warning,
        pptBuildProgress: undefined,
      })
    } else {
      await messageStore.updateMessage(answerId, {
        exportPptError: result.error,
        pptBuildProgress: undefined,
      })
    }
  } catch (e) {
    await messageStore.updateMessage(answerId, {
      exportPptError: e instanceof Error ? e.message : String(e),
      pptBuildProgress: undefined,
    })
  } finally {
    removeProgress()
  }
}
