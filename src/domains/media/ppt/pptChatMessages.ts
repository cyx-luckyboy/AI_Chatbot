import { buildPptFillPromptForModel, buildPptOutlinePromptForModel } from './pptScenarioPrompts'
import { buildPptGeneratePromptForModel } from './pptGeneratePrompt'
import { buildTranslatePromptForModel } from '../translatePrompt'
import type { ChatMessageProps, MessageProps, PptGenScenarioId } from '../../../shared/types'

export type PptChatPromptMode =
  | { kind: 'single' }
  | { kind: 'outline' }
  | { kind: 'fill'; outline: string }

export function resolvePptScenario(message: MessageProps): PptGenScenarioId {
  return message.pptGenScenario ?? 'general'
}

export function pptPromptForQuestion(
  message: MessageProps,
  uiLang: 'zh' | 'en',
  mode: PptChatPromptMode,
): string {
  const length = message.pptGenLength ?? 'medium'
  const scenario = resolvePptScenario(message)
  const topic = message.content

  if (mode.kind === 'fill') {
    return buildPptFillPromptForModel(topic, mode.outline, length, scenario, uiLang)
  }
  if (mode.kind === 'outline') {
    return buildPptOutlinePromptForModel(topic, length, scenario, uiLang)
  }
  return buildPptGeneratePromptForModel(topic, length, uiLang, scenario)
}

export function buildChatMessagesForConversation(
  messages: MessageProps[],
  uiLang: 'zh' | 'en',
  pptOverride?: { questionId: number; mode: PptChatPromptMode },
): ChatMessageProps[] {
  return messages
    .filter((m) => m.status !== 'loading' && m.status !== 'error')
    .map((m) => {
      let content = m.content
      if (m.type === 'question' && m.translateTarget) {
        content = buildTranslatePromptForModel(m.content, m.translateTarget, uiLang)
      } else if (m.type === 'question' && m.pptGenLength) {
        if (pptOverride && m.id === pptOverride.questionId) {
          content = pptPromptForQuestion(m, uiLang, pptOverride.mode)
        } else {
          content = pptPromptForQuestion(m, uiLang, { kind: 'single' })
        }
      }
      const row: ChatMessageProps = {
        role: m.type === 'question' ? 'user' : 'assistant',
        content,
      }
      if (m.imagePath) row.imagePath = m.imagePath
      if (m.attachments?.length) row.attachments = m.attachments
      return row
    })
}
