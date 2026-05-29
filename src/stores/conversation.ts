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
      await db.transaction('rw', db.messages, db.conversations, async () => {
        await db.messages.where('conversationId').equals(id).delete()
        await db.conversations.delete(id)
      })
      const index = this.items.findIndex((item) => item.id === id)
      if (index > -1) {
        this.items.splice(index, 1)
      }
    },
    async renameConversation(id: number, title: string) {
      const trimmed = title.trim()
      if (!trimmed) return
      const now = new Date().toISOString()
      await db.conversations.update(id, { title: trimmed, updatedAt: now })
      const item = this.items.find((c) => c.id === id)
      if (item) {
        item.title = trimmed
        item.updatedAt = now
      }
    },
    async togglePinConversation(id: number) {
      const item = this.items.find((c) => c.id === id)
      if (!item) return
      const pinnedAt = item.pinnedAt ? undefined : new Date().toISOString()
      await db.conversations.update(id, { pinnedAt })
      item.pinnedAt = pinnedAt
    },
  },
  getters: {
    totalNumber: (state) => state.items.length,
    getConversationById: (state) => (id: number) => {
      return state.items.find((item) => item.id === id)
    },
    /** 置顶在前，其余按 updatedAt 降序 */
    sortedItems: (state) => {
      return [...state.items].sort((a, b) => {
        const ap = a.pinnedAt ? 1 : 0
        const bp = b.pinnedAt ? 1 : 0
        if (ap !== bp) return bp - ap
        if (a.pinnedAt && b.pinnedAt && a.pinnedAt !== b.pinnedAt) {
          return b.pinnedAt.localeCompare(a.pinnedAt)
        }
        return b.updatedAt.localeCompare(a.updatedAt)
      })
    },
  },
})