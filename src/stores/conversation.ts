import { defineStore } from 'pinia'
import { db } from '../db'
import { ConversationProps } from '../types'

export interface ConversationStore {
  items: ConversationProps[];
  selectedId: number;
}

let fetchConversationsInflight: Promise<void> | null = null

export const useConversationStore = defineStore('conversation', {
  state: (): ConversationStore => {
    return {
      items: [],
      selectedId: -1
    }
  },
  actions: {
    /** 合并并发调用，避免多处几乎同时 toArray 完成后以错误顺序覆盖 items */
    async fetchConversations() {
      if (!fetchConversationsInflight) {
        fetchConversationsInflight = (async () => {
          this.items = await db.conversations.toArray()
        })().finally(() => {
          fetchConversationsInflight = null
        })
      }
      await fetchConversationsInflight
    },
    async createConversation(createdData: Omit<ConversationProps, 'id'>) {
      const newCId = await db.conversations.add(createdData)
      // 全量同步，避免与 App 首屏 fetch 交错时用 push 后被旧快照覆盖导致会话丢失
      this.items = await db.conversations.toArray()
      return newCId
    },
    async deleteConversation(id: number) {
      await db.conversations.delete(id)
      const index = this.items.findIndex(item => item.id === id)
      if (index > -1) {
        this.items.splice(index, 1)
      }
    }
  },
  getters: {
    totalNumber: (state) => state.items.length,
    getConversationById: (state) => (id: number) => {
      return state.items.find(item => item.id === id)
    }
  }
})