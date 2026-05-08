import { defineStore } from 'pinia'
import { db } from '../db'
import { MessageProps, MessageStatus } from '../types'

export interface MessageStore {
  items: MessageProps[]
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
    async fetchMessagesByConversation(conversationId: number) {
      const raw = await db.messages.where({ conversationId }).toArray()
      const healed: MessageProps[] = []
      for (const m of raw) {
        if (m.type === 'answer' && (m.status === 'loading' || m.status === 'streaming')) {
          await db.messages.update(m.id, { status: 'finished' as MessageStatus })
          healed.push({ ...m, status: 'finished' })
        } else {
          healed.push(m)
        }
      }
      this.items = healed
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
    }
  },
  getters: {
    getLastQuestion: (state) => (conversationId: number) => {
      return state.items.findLast(item => item.conversationId === conversationId && item.type === 'question')
    },
  },
})