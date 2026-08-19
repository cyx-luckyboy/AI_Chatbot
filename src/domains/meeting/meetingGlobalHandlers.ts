import { db } from '../../shared/db'
import { postMeetingCardToConversation } from './meetingChatPost'
import { useMeetingStore } from './stores/meeting'
import { useConversationStore } from '../chat/stores/conversation'
import { i18n } from '../../shared/i18n/index'

export async function syncMeetingCardFromDb(meetingId: number): Promise<number | undefined> {
  const meeting = await db.meetings.get(meetingId)
  if (!meeting?.conversationId || meeting.id == null) return undefined
  const hint = i18n.global.t('meetings.chatCardHint')
  await postMeetingCardToConversation(meeting, hint)
  await useConversationStore().fetchConversations()
  return meeting.conversationId
}

/** 全局监听会议转写/总结，避免离开会议页后状态丢失；对话卡片仅在用户点击「返回对话」时写入 */
export function setupMeetingGlobalHandlers() {
  const meetingStore = useMeetingStore()

  const offAsr = window.electronAPI.onMeetingAsrResult((payload) => {
    if (payload.type !== 'FIN_TEXT') return
    void (async () => {
      const meeting = await db.meetings.get(payload.meetingId)
      if (!meeting) return
      const sep = meeting.transcript && !meeting.transcript.endsWith('\n') ? '\n' : ''
      await meetingStore.updateMeeting(payload.meetingId, {
        transcript: meeting.transcript + sep + payload.text,
        segments: [
          ...meeting.segments,
          {
            text: payload.text,
            startTime: payload.startTime,
            endTime: payload.endTime,
            isFinal: true,
          },
        ],
      })
    })()
  })

  const offDone = window.electronAPI.onMeetingSummaryDone((payload) => {
    void meetingStore.updateMeeting(payload.meetingId, {
      title: payload.title,
      summaryOverview: payload.overview,
      summarySections: payload.sections,
      status: 'completed',
      summaryError: undefined,
    })
  })

  const offErr = window.electronAPI.onMeetingSummaryError((payload) => {
    void meetingStore.updateMeeting(payload.meetingId, {
      status: 'summary_failed',
      summaryError: payload.error,
    })
  })

  return () => {
    offAsr()
    offDone()
    offErr()
  }
}
