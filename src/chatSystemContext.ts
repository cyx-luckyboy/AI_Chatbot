import { buildSystemClockContext } from './chatClockContext'
import { configManager } from './config'
import { buildSystemLocationContext } from './userLocation'
import type { ChatMessageProps } from './types'

/** 发往模型的系统上下文：本地时间 + 用户定位（若启用） */
export function buildChatSystemContexts(): ChatMessageProps[] {
  const cfg = configManager.get()
  const out: ChatMessageProps[] = [buildSystemClockContext()]
  const loc = buildSystemLocationContext(cfg)
  if (loc) out.push(loc)
  return out
}
