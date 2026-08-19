import { defineStore } from 'pinia'
import { db } from '../../../shared/db'
import { MessageProps, MessageStatus } from '../../../shared/types'

export interface MessageStore {
  items: MessageProps[]
}

function questionBeforeAnswer(sorted: MessageProps[], answerIndex: number): MessageProps | undefined {
  for (let i = answerIndex - 1; i >= 0; i--) {
    if (sorted[i].type === 'question') return sorted[i]
    if (sorted[i].type === 'answer') break
  }
  return undefined
}

/** 会议卡片不是流式对话回复，不应阻塞输入框 */
export function isActiveChatReply(message: MessageProps): boolean {
  if (message.type !== 'answer') return false
  if (message.meetingId != null) return false
  return message.status === 'loading' || message.status === 'streaming'
}

/** 即梦出图任务：助手 loading 不应被「愈合」为 finished，否则首轮不会触发 runImageGeneration */
export function isPendingImageGenerationAnswer(sorted: MessageProps[], answer: MessageProps): boolean {
  if (answer.type !== 'answer') return false
  const idx = sorted.findIndex((m) => m.id === answer.id)
  if (idx < 0) return false
  const q = questionBeforeAnswer(sorted, idx)
  if (!q?.imageGenSize) return false
  if (answer.imagePath) return false
  if (answer.status === 'error') return false
  if (answer.status === 'loading' || answer.status === 'streaming') return true
  return answer.status === 'finished' && !(answer.content ?? '').trim()
}

export const useMessageStore = defineStore('message', {
  state: (): MessageStore => {
    return {
      items: []
    }
  },
  actions: {
    /**
     * 从 IndexedDB 加载会话消息。
     * 若上次退出时助手回复仍停留在 loading/streaming（异常中断、尾随 SSE 帧写库错误等），此处统一标为 finished，
     * 否则会话页会认为仍有未完成的助手回复，输入框永久禁用。
     */
    /**
     * @returns 被标为 finished 的助手消息 id（离开页面后主进程仍可能推送流式帧，渲染层应忽略）
     */
    async fetchMessagesByConversation(conversationId: number): Promise<number[]> {
      const raw = await db.messages.where({ conversationId }).sortBy('id')
      const healed: MessageProps[] = []
      const sealedStreamIds: number[] = []
      for (const m of raw) {
        if (m.type === 'answer' && (m.status === 'loading' || m.status === 'streaming')) {
          if (m.meetingId != null) {
            await db.messages.update(m.id, { status: 'finished' as MessageStatus })
            healed.push({ ...m, status: 'finished' })
            continue
          }
          if (isPendingImageGenerationAnswer(raw, m)) {
            healed.push(m)
            continue
          }
          if (m.id != null) sealedStreamIds.push(m.id)
          const content = String(m.content || '').trim()
          const trivial = !content || (content.length <= 8 && /^[.。…·\s]+$/.test(content))
          const patch: Partial<MessageProps> = {
            status: trivial ? ('error' as MessageStatus) : ('finished' as MessageStatus),
          }
          if (trivial) {
            patch.content =
              '上次回复未完成（模型卡住或只返回了无效内容）。请换模型后重新发送，或点击重新生成。'
          }
          await db.messages.update(m.id, patch)
          healed.push({ ...m, ...patch })
        } else {
          healed.push(m)
        }
      }
      this.items = healed
      return sealedStreamIds
    },
    async createMessage(createdData: Omit<MessageProps, 'id'>) {
      const newMessageId = await db.messages.add(createdData)
      this.items.push( { id: newMessageId, ...createdData })
      return newMessageId
    },
    async updateMessage(messageId: number, updatedData: Partial<MessageProps>) {
      await db.messages.update(messageId, updatedData)
      const index = this.items.findIndex(item => item.id === messageId)
      if (index !== -1) {
        this.items[index] = { ...this.items[index], ...updatedData }
      }
    },
    /** 移除助手消息的反馈标记（IndexedDB 不支持用 undefined 删除字段时用 put 覆盖） */
    async clearMessageFeedback(messageId: number) {
      const row = await db.messages.get(messageId)
      if (!row) return
      const next = { ...row } as MessageProps & { feedback?: 'like' | 'dislike' }
      delete next.feedback
      await db.messages.put(next)
      const index = this.items.findIndex((item) => item.id === messageId)
      if (index !== -1) {
        const cur = { ...this.items[index] }
        delete (cur as MessageProps & { feedback?: unknown }).feedback
        this.items[index] = cur
      }
    },
    /** 删除单条消息 */
    async deleteMessage(messageId: number) {
      await db.messages.delete(messageId)
      const index = this.items.findIndex((item) => item.id === messageId)
      if (index !== -1) this.items.splice(index, 1)
    },
    /** 批量删除多条消息 */
    async deleteManyMessages(messageIds: number[]) {
      await db.transaction('rw', db.messages, async () => {
        for (const id of messageIds) {
          await db.messages.delete(id)
        }
      })
      this.items = this.items.filter((item) => !messageIds.includes(item.id))
    },
    /** 删除本条及之后同会话消息（用于重新生成某条助手回复） */
    async deleteMessageAndFollowing(conversationId: number, fromMessageId: number) {
      const sorted = await db.messages.where({ conversationId }).sortBy('id')
      const idx = sorted.findIndex((m) => m.id === fromMessageId)
      if (idx === -1) return
      const tail = sorted.slice(idx)
      for (const m of tail) {
        await db.messages.delete(m.id)
      }
      await this.fetchMessagesByConversation(conversationId)
    },
  },
  getters: {
    getLastQuestion: (state) => (conversationId: number) => {
      return state.items.findLast(item => item.conversationId === conversationId && item.type === 'question')
    },
  },
})