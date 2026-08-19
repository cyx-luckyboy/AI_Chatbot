import { nextTick } from 'vue'
import type { Router } from 'vue-router'
import { db } from '../../shared/db'
import { NAILONG_PET_SYSTEM_PROMPT, wantsPetWebSearch } from './petChatPersona'
import { buildChatMessagesForConversation } from '../media/ppt/pptChatMessages'
import { isProviderConfigReady, pickFirstReadyProvider } from '../workspace/providerConfigReady'
import { useConversationStore } from '../chat/stores/conversation'
import { useMessageStore } from '../chat/stores/message'
import { useProviderStore } from '../chat/stores/provider'
import { i18n } from '../../shared/i18n/index'
import type { AppConfig, ChatMessageProps, ConversationProps } from '../../shared/types'

function serializeCreateChatProps<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T
}

export function withNailongPersona(messages: ChatMessageProps[]): ChatMessageProps[] {
  const hasPersona = messages.some(
    (m) => m.role === 'system' && String(m.content || '').includes('「奶龙」'),
  )
  if (hasPersona) return messages
  return [{ role: 'system', content: NAILONG_PET_SYSTEM_PROMPT }, ...messages]
}

export async function isPetConversationId(conversationId: number): Promise<boolean> {
  try {
    const cfg = await window.electronAPI.getConfig()
    return Number(cfg.petConversationId) === conversationId
  } catch {
    return false
  }
}

function parseReadyProvider(
  ready: string,
): { providerId: number; selectedModel: string } | null {
  const slash = ready.indexOf('/')
  if (slash <= 0) return null
  const providerId = parseInt(ready.slice(0, slash), 10)
  const selectedModel = ready.slice(slash + 1).trim()
  if (!Number.isFinite(providerId) || !selectedModel) return null
  return { providerId, selectedModel }
}

async function resolveReadyProviderPair(
  providerStore: ReturnType<typeof useProviderStore>,
  cfg: AppConfig,
): Promise<{ providerId: number; selectedModel: string }> {
  await providerStore.fetchProviders()
  const ready = pickFirstReadyProvider(providerStore.items, cfg)
  const pair = parseReadyProvider(ready)
  if (!pair) {
    throw new Error(i18n.global.t('settings.petChatNoReadyProvider'))
  }
  const provider = providerStore.getProviderById(pair.providerId)
  if (!provider || !isProviderConfigReady(provider.name, cfg)) {
    throw new Error(i18n.global.t('settings.petChatNoReadyProvider'))
  }
  return pair
}

/** 奶龙会话若绑在无 Key 的厂商上，自动切到已配置的供应商 */
async function ensurePetConversationProvider(
  conversationId: number,
  row: ConversationProps,
  providerStore: ReturnType<typeof useProviderStore>,
  cfg: AppConfig,
): Promise<ConversationProps> {
  const provider = providerStore.getProviderById(row.providerId)
  if (provider && isProviderConfigReady(provider.name, cfg) && row.selectedModel) {
    return row
  }
  const pair = await resolveReadyProviderPair(providerStore, cfg)
  const now = new Date().toISOString()
  await db.conversations.update(conversationId, {
    providerId: pair.providerId,
    selectedModel: pair.selectedModel,
    updatedAt: now,
  })
  const conversationStore = useConversationStore()
  await conversationStore.fetchConversations()
  return (
    (await db.conversations.get(conversationId)) ?? {
      ...row,
      providerId: pair.providerId,
      selectedModel: pair.selectedModel,
      updatedAt: now,
    }
  )
}

async function ensurePetConversationId(): Promise<number> {
  const conversationStore = useConversationStore()
  const providerStore = useProviderStore()
  const cfg = await window.electronAPI.getConfig()
  const existingId = Number(cfg.petConversationId)
  if (Number.isFinite(existingId) && existingId > 0) {
    const row = await db.conversations.get(existingId)
    if (row) {
      if (row.kind !== 'pet') {
        await db.conversations.update(existingId, { kind: 'pet' })
        const cached = conversationStore.getConversationById(existingId)
        if (cached) cached.kind = 'pet'
      }
      await ensurePetConversationProvider(existingId, row, providerStore, cfg)
      return existingId
    }
  }

  const pair = await resolveReadyProviderPair(providerStore, cfg)
  const now = new Date().toISOString()
  const title = i18n.global.t('settings.petChatConversationTitle')
  const id = await conversationStore.createConversation({
    title,
    providerId: pair.providerId,
    selectedModel: pair.selectedModel,
    createdAt: now,
    updatedAt: now,
    kind: 'pet',
  })
  await window.electronAPI.updateConfig({ petConversationId: id })
  return id
}

/**
 * 桌宠提问：写入「奶龙」会话并走与主窗相同的 start-chat / 联网搜索管线。
 */
export async function handlePetChatAsk(
  router: Router,
  payload: { text?: string; forceSearch?: boolean },
): Promise<{ ok: boolean; error?: string; conversationId?: number; webSearch?: boolean }> {
  const text = String(payload?.text || '').trim()
  if (!text) return { ok: false, error: 'empty' }

  try {
    const conversationStore = useConversationStore()
    const messageStore = useMessageStore()
    const providerStore = useProviderStore()

    const conversationId = await ensurePetConversationId()
    const webSearch = wantsPetWebSearch(text, Boolean(payload.forceSearch))
    const now = new Date().toISOString()

    const questionId = await messageStore.createMessage({
      content: text,
      conversationId,
      createdAt: now,
      updatedAt: now,
      type: 'question',
      ...(webSearch ? { webSearch: true } : {}),
    })

    conversationStore.selectedId = conversationId
    const path = `/conversation/${conversationId}`
    const onSame = router.currentRoute.value.path === path

    if (!onSame) {
      await router.push({ path, query: { init: String(questionId) } })
      return { ok: true, conversationId, webSearch }
    }

    const answerId = await messageStore.createMessage({
      content: '',
      conversationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'answer',
      status: 'loading',
    })
    await nextTick()

    const convRaw =
      conversationStore.getConversationById(conversationId) ?? (await db.conversations.get(conversationId))
    if (!convRaw) return { ok: false, error: 'no_conversation' }
    const cfg = await window.electronAPI.getConfig()
    const conv = await ensurePetConversationProvider(conversationId, convRaw, providerStore, cfg)
    const provider = providerStore.getProviderById(conv.providerId)
    if (!provider) return { ok: false, error: 'no_provider' }
    if (!isProviderConfigReady(provider.name, cfg)) {
      return { ok: false, error: i18n.global.t('settings.petChatNoReadyProvider') }
    }

    const uiLang = i18n.global.locale.value === 'en' ? 'en' : 'zh'
    const history = messageStore.items.filter((m) => m.conversationId === conversationId)
    const messages = withNailongPersona(buildChatMessagesForConversation(history, uiLang))

    await window.electronAPI.startChat(
      serializeCreateChatProps({
        messageId: answerId,
        providerName: provider.name,
        selectedModel: conv.selectedModel,
        messages,
        webSearch,
        uiLang,
      }),
    )
    return { ok: true, conversationId, webSearch }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function setupPetChatGlobalHandlers(router: Router) {
  return window.electronAPI.onPetChatAsk((payload) => {
    void handlePetChatAsk(router, payload).then((r) => {
      void window.electronAPI.petChatAskResult({
        ...r,
        requestId: payload.requestId,
      })
    })
  })
}
