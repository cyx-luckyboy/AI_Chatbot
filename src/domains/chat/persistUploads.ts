import type { MessageAttachment, MessageCreatePayload } from '../../shared/types'

export async function persistUploadsFromRenderer(
  uploads: MessageCreatePayload['uploads'],
): Promise<MessageAttachment[]> {
  const out: MessageAttachment[] = []
  for (const u of uploads) {
    try {
      const savedPath = u.storedPath
        ? u.storedPath
        : await window.electronAPI.saveUserAttachment(u.dataUrl!, u.name)
      out.push({ path: savedPath, name: u.name })
    } catch (e) {
      console.error('saveUserAttachment', e)
    }
  }
  return out
}
