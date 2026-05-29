import type { ChatMessageProps, CreateChatProps } from './types'

/** 构造可经 JSON / IPC 传递的纯对象，避免 Pinia/Vue Proxy 触发 DataCloneError */
export function plainChatMessages(messages: ChatMessageProps[]): ChatMessageProps[] {
  return messages.map((m) => {
    const row: ChatMessageProps = {
      role: String(m.role),
      content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
    }
    if (m.imagePath != null && String(m.imagePath).length > 0) {
      row.imagePath = String(m.imagePath)
    }
    if (m.attachments?.length) {
      row.attachments = m.attachments.map((a) => ({
        path: String(a.path),
        name: String(a.name),
      }))
    }
    return row
  })
}

export function serializeCreateChatProps(data: CreateChatProps): CreateChatProps {
  return {
    messageId: Number(data.messageId),
    providerName: String(data.providerName),
    selectedModel: String(data.selectedModel),
    messages: plainChatMessages(data.messages),
    ...(data.webSearch && { webSearch: true }),
    ...(data.uiLang && { uiLang: data.uiLang }),
  }
}
