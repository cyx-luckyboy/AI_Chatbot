import type { ChildProcess } from 'node:child_process'

type ChatSession = {
  messageId: number
  aborted: boolean
  children: Set<ChildProcess>
}

let active: ChatSession | null = null

export function beginChatSession(messageId: number): void {
  // 新会话开始时清掉旧的；若旧子进程还在则尽量杀掉
  if (active && active.messageId !== messageId) {
    abortChatSession(active.messageId)
  }
  active = {
    messageId,
    aborted: false,
    children: new Set(),
  }
}

export function getActiveChatMessageId(): number | null {
  return active?.messageId ?? null
}

export function isChatAborted(messageId?: number): boolean {
  if (!active) return false
  if (messageId != null && active.messageId !== messageId) return false
  return active.aborted
}

export function registerChatChild(child: ChildProcess): void {
  if (!active) return
  active.children.add(child)
  const clear = () => active?.children.delete(child)
  child.once('close', clear)
  child.once('error', clear)
  if (active.aborted) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
  }
}

export function abortChatSession(messageId?: number): { ok: boolean; messageId: number | null } {
  if (!active) return { ok: false, messageId: null }
  if (messageId != null && active.messageId !== messageId) {
    return { ok: false, messageId: active.messageId }
  }
  active.aborted = true
  const id = active.messageId
  for (const child of active.children) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
  }
  active.children.clear()
  return { ok: true, messageId: id }
}

export function endChatSession(messageId: number): void {
  if (active?.messageId === messageId) {
    active = null
  }
}

export class ChatAbortedError extends Error {
  constructor(message = 'CHAT_ABORTED') {
    super(message)
    this.name = 'ChatAbortedError'
  }
}

export function throwIfChatAborted(messageId: number): void {
  if (isChatAborted(messageId)) throw new ChatAbortedError()
}
