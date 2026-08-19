import { db } from '../../shared/db'
import type { MeetingRecordProps } from '../../shared/types'

const MEETING_RETURN_CONV_KEY = 'vchat-meeting-return-conv'
const MEETING_RETURN_PROVIDER_KEY = 'vchat-meeting-return-provider'

export function setMeetingReturnContext(conversationId: number, provider: string) {
  try {
    sessionStorage.setItem(MEETING_RETURN_CONV_KEY, String(conversationId))
    sessionStorage.setItem(MEETING_RETURN_PROVIDER_KEY, provider)
  } catch {
    /* ignore */
  }
}

export function clearMeetingReturnContext() {
  try {
    sessionStorage.removeItem(MEETING_RETURN_CONV_KEY)
    sessionStorage.removeItem(MEETING_RETURN_PROVIDER_KEY)
  } catch {
    /* ignore */
  }
}

export function readMeetingReturnConversationId(): number | undefined {
  try {
    const stored = sessionStorage.getItem(MEETING_RETURN_CONV_KEY)
    if (!stored) return undefined
    const n = parseInt(stored, 10)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}

export function readMeetingReturnProvider(): string | undefined {
  try {
    return sessionStorage.getItem(MEETING_RETURN_PROVIDER_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** 会议总结完成后，在关联对话中插入/更新录音卡片消息 */
export async function postMeetingCardToConversation(
  meeting: MeetingRecordProps,
  hintText: string,
): Promise<void> {
  const conversationId = meeting.conversationId
  const meetingId = meeting.id
  if (!conversationId || meetingId == null) return

  const now = new Date().toISOString()
  const all = await db.messages.where('conversationId').equals(conversationId).toArray()
  const existingAnswer = all.find((m) => m.type === 'answer' && m.meetingId === meetingId)

  if (existingAnswer?.id != null) {
    await db.messages.update(existingAnswer.id, {
      content: hintText,
      status: 'finished',
      updatedAt: now,
    })
  } else {
    await db.messages.add({
      content: hintText,
      conversationId,
      type: 'answer',
      status: 'finished',
      meetingId,
      createdAt: now,
      updatedAt: now,
    })
  }

  const title = meeting.title?.trim()
  const conv = await db.conversations.get(conversationId)
  const hasUserChat = all.some((m) => m.type === 'question')
  if (title && conv && !hasUserChat && !existingAnswer) {
    await db.conversations.update(conversationId, {
      title,
      updatedAt: now,
    })
  } else {
    await db.conversations.update(conversationId, { updatedAt: now })
  }
}
