import { defineStore } from 'pinia'
import { db } from '../../../shared/db'
import type { MeetingRecordProps } from '../../../shared/types'

/** IndexedDB 不接受 Vue/Pinia Proxy，须 JSON 往返为纯对象 */
function plainForDexie<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface MeetingStoreState {
  items: MeetingRecordProps[]
  selectedId: number | null
  isRecording: boolean
  recordingMeetingId: number | null
}

export const useMeetingStore = defineStore('meeting', {
  state: (): MeetingStoreState => ({
    items: [],
    selectedId: null,
    isRecording: false,
    recordingMeetingId: null,
  }),
  getters: {
    sortedItems: (state) =>
      [...state.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    selectedMeeting: (state) => {
      if (state.selectedId == null) return null
      return state.items.find((m) => m.id === state.selectedId) ?? null
    },
  },
  actions: {
    async fetchMeetings() {
      this.items = await db.meetings.toArray()
    },
    async createMeeting(data: Omit<MeetingRecordProps, 'id'>) {
      const id = await db.meetings.add(plainForDexie(data) as MeetingRecordProps)
      this.items = await db.meetings.toArray()
      return id as number
    },
    async updateMeeting(id: number, patch: Partial<MeetingRecordProps>) {
      const now = new Date().toISOString()
      const item = this.items.find((m) => m.id === id)
      if (item) Object.assign(item, patch, { updatedAt: now })
      const toSave = plainForDexie({ ...patch, updatedAt: now })
      await db.meetings.update(id, toSave)
    },
    async deleteMeeting(id: number) {
      const item = this.items.find((m) => m.id === id)
      if (item?.audioFileName) {
        await window.electronAPI.meetingDeleteAudio({ audioFileName: item.audioFileName })
      }
      await db.meetings.delete(id)
      this.items = this.items.filter((m) => m.id !== id)
      if (this.selectedId === id) {
        this.selectedId = this.sortedItems[0]?.id ?? null
      }
    },
    async renameMeeting(id: number, title: string) {
      const trimmed = title.trim()
      if (!trimmed) return
      await this.updateMeeting(id, { title: trimmed.slice(0, 100) })
    },
    selectMeeting(id: number | null) {
      this.selectedId = id
    },
    setRecording(active: boolean, meetingId: number | null = null) {
      this.isRecording = active
      this.recordingMeetingId = meetingId
    },
    async findIncompleteRecording(): Promise<MeetingRecordProps | null> {
      const row = await db.meetings.where('status').equals('recording').first()
      return row ?? null
    },
    async discardIncompleteRecording(id: number) {
      await window.electronAPI.meetingAsrAbort({ meetingId: id })
      await this.deleteMeeting(id)
    },
  },
})
