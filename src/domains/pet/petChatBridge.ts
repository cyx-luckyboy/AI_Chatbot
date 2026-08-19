import type { UpdatgedStreamData } from '../../shared/types'
import { markdownToPlainText } from '../chat/markdownPlain'
import { sendPetAvatarEvent } from './petWindowMain'

const accByMessageId = new Map<number, string>()
/** 已交给桌宠朗读的消息：忽略其后的空结束帧 / 尾随 thinking，避免打断奶龙 TTS 并回退系统音 */
const spokenMessageIds = new Set<number>()

function isTrivialSpeakText(text: string): boolean {
  const s = text.trim()
  if (!s) return true
  return s.length <= 8 && /^[.。…·\s]+$/.test(s)
}

/** start-chat 入口：进入思考态 */
export function notifyPetChatStarted(messageId: number) {
  accByMessageId.set(messageId, '')
  spokenMessageIds.delete(messageId)
  sendPetAvatarEvent({ state: 'thinking', messageId })
}

/** 旁路 update-message：累计正文，结束时交给桌宠朗读 */
export function notifyPetFromChatChunk(messageId: number, data: UpdatgedStreamData['data']) {
  if (spokenMessageIds.has(messageId)) {
    return
  }

  if (data.is_error) {
    accByMessageId.delete(messageId)
    spokenMessageIds.add(messageId)
    sendPetAvatarEvent({ state: 'idle', messageId, isError: true })
    return
  }

  // 联网搜索等中间状态（replace 且未结束）不写入朗读缓冲，避免污染最终正文
  if (data.replace && !data.is_end) {
    sendPetAvatarEvent({ state: 'thinking', messageId })
    return
  }

  if (data.replace && typeof data.result === 'string') {
    accByMessageId.set(messageId, data.result)
  } else if (typeof data.result === 'string' && data.result) {
    accByMessageId.set(messageId, (accByMessageId.get(messageId) ?? '') + data.result)
  }

  if (!data.is_end) {
    sendPetAvatarEvent({ state: 'thinking', messageId })
    return
  }

  const raw = accByMessageId.get(messageId) ?? data.result ?? ''
  accByMessageId.delete(messageId)
  const text = markdownToPlainText(raw)
  spokenMessageIds.add(messageId)
  if (!text || isTrivialSpeakText(text)) {
    sendPetAvatarEvent({ state: 'idle', messageId, isError: true })
    return
  }
  sendPetAvatarEvent({ state: 'speaking', messageId, text })
}

/** 渲染进程封存卡住的流式消息时，强制桌宠回 idle */
export function notifyPetForceIdle(messageId?: number) {
  if (typeof messageId === 'number') {
    spokenMessageIds.add(messageId)
    accByMessageId.delete(messageId)
  }
  sendPetAvatarEvent({ state: 'idle', messageId, isError: true })
}
