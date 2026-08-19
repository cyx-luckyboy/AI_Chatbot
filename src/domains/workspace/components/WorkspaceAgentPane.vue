<template>
  <div class="relative flex h-full min-h-0 flex-col border-l border-slate-200 dark:border-slate-700">
    <div class="flex shrink-0 items-center gap-1.5 border-b border-slate-200 px-2 py-2 dark:border-slate-700">
      <span class="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">
        {{ t('workspace.agentTitle') }}
      </span>
      <div class="min-w-0 flex-1">
        <ProviderSelect :items="readyProviders" v-model="providerModel" :disabled="replying" />
      </div>
      <button
        type="button"
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        :title="t('workspace.newChat')"
        :aria-label="t('workspace.newChat')"
        :disabled="replying"
        @click="newChat"
      >
        <Icon icon="mdi:plus" class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        :class="historyOpen ? 'bg-slate-100 dark:bg-slate-800' : ''"
        :title="t('workspace.history')"
        :aria-label="t('workspace.history')"
        @click="toggleHistory"
      >
        <Icon icon="mdi:history" class="h-4 w-4" />
      </button>
    </div>
    <div
      class="shrink-0 truncate border-b border-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400"
      :title="editorFocusTitle || undefined"
    >
      {{ editorFocusLabel }}
    </div>

    <div
      v-if="historyOpen"
      class="absolute inset-x-0 top-[41px] z-20 max-h-[45%] overflow-y-auto border-b border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900"
    >
      <div class="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 dark:border-slate-800">
        <span class="text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {{ t('workspace.history') }}
        </span>
        <button
          type="button"
          class="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          @click="historyOpen = false"
        >
          {{ t('workspace.historyClose') }}
        </button>
      </div>
      <p v-if="!historyItems.length" class="px-3 py-4 text-center text-[11px] text-slate-400">
        {{ t('workspace.historyEmpty') }}
      </p>
      <button
        v-for="c in historyItems"
        :key="c.id"
        type="button"
        class="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/80"
        :class="c.id === conversationId ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''"
        @click="openHistory(c.id)"
      >
        <span class="truncate text-xs text-slate-800 dark:text-slate-100">{{ c.title }}</span>
        <span class="text-[10px] text-slate-400">{{ formatTime(c.updatedAt) }}</span>
      </button>
    </div>

    <div ref="scrollRef" class="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2">
      <p v-if="!readyProviders.length" class="text-xs text-amber-700 dark:text-amber-300">
        {{ t('workspace.noProvider') }}
        <RouterLink to="/settings" class="underline">{{ t('workspace.goSettings') }}</RouterLink>
      </p>
      <div
        v-for="m in displayMessages"
        :key="m.id"
        class="rounded-lg px-2.5 py-2 text-xs leading-relaxed"
        :class="
          m.type === 'question'
            ? 'ml-4 bg-emerald-600 text-white'
            : 'mr-2 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
        "
      >
        <div class="whitespace-pre-wrap break-words">{{ m.content || (m.status === 'loading' ? '…' : '') }}</div>
      </div>
    </div>
    <div class="shrink-0 border-t border-slate-200 p-2 dark:border-slate-700">
      <div class="mb-1 flex items-center justify-between gap-2">
        <span class="text-[10px] text-emerald-700 dark:text-emerald-400">{{ t('common.agentTag') }}</span>
        <button
          v-if="replying"
          type="button"
          class="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700"
          @click="stop"
        >
          {{ t('common.stopGenerating') }}
        </button>
      </div>
      <textarea
        v-model="input"
        rows="3"
        class="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        :placeholder="t('workspace.agentPlaceholder')"
        :disabled="replying || !readyProviders.length"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="mt-1.5 w-full rounded-md bg-emerald-600 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        :disabled="replying || !input.trim() || !readyProviders.length"
        @click="send"
      >
        {{ t('common.send') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import ProviderSelect from '../../../renderer/components/ProviderSelect.vue'
import { useProviderStore } from '../../chat/stores/provider'
import { useConversationStore } from '../../chat/stores/conversation'
import { isActiveChatReply, useMessageStore } from '../../chat/stores/message'
import { filterEnabledReadyProviders } from '../providerPlugins'
import { pickFirstReadyProvider } from '../providerConfigReady'
import { serializeCreateChatProps } from '../../../shared/ipcSerialize'
import { buildChatMessagesForConversation } from '../../media/ppt/pptChatMessages'
import { db } from '../../../shared/db'
import type { AppConfig, MessageProps, UpdatgedStreamData } from '../../../shared/types'

const props = defineProps<{
  editorContext?: { path: string; line: number; column: number }
}>()

const { t, locale } = useI18n()
const providerStore = useProviderStore()
const conversationStore = useConversationStore()
const messageStore = useMessageStore()

const input = ref('')
const providerModel = ref('')
const conversationId = ref(0)
const appConfig = ref<AppConfig | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const historyOpen = ref(false)
const streamBuffers = new Map<number, string>()
/** 正在请求 AI 标题的会话，避免重复打模型 */
const titleInflight = new Set<number>()
let removeUpdate: (() => void) | undefined

function fileBaseName(p: string) {
  const s = String(p || '').replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}

const editorFocusLabel = computed(() => {
  const ec = props.editorContext
  if (!ec?.path) return t('workspace.editorFocusNone')
  return t('workspace.editorFocus', {
    file: fileBaseName(ec.path),
    line: Math.max(1, ec.line || 1),
    column: Math.max(1, ec.column || 1),
  })
})

const editorFocusTitle = computed(() => {
  const ec = props.editorContext
  if (!ec?.path) return ''
  return `${ec.path} · L${Math.max(1, ec.line || 1)}:${Math.max(1, ec.column || 1)}`
})

const readyProviders = computed(() => {
  if (!appConfig.value) return []
  return filterEnabledReadyProviders(providerStore.items, appConfig.value)
})

const defaultTitle = computed(() => t('workspace.conversationTitle'))

function isDefaultWorkspaceTitle(title: string | undefined) {
  const t0 = (title || '').trim()
  return !t0 || t0 === defaultTitle.value || t0 === '工作台 Agent' || t0 === 'Workspace agent'
}

function needsAiTitle(c: { id: number; title: string; titleAiGenerated?: boolean }) {
  if (c.titleAiGenerated) return false
  return true
}

const historyItems = computed(() =>
  conversationStore.sortedItems.filter((c) => c.kind === 'workspace'),
)

const displayMessages = computed(() =>
  messageStore.items
    .filter((m) => m.conversationId === conversationId.value)
    .sort((a, b) => a.id - b.id)
    .slice(-40),
)

const replying = computed(() =>
  messageStore.items.some(
    (m) => m.conversationId === conversationId.value && isActiveChatReply(m),
  ),
)

async function loadConfig() {
  appConfig.value = await window.electronAPI.getConfig()
}

async function markWorkspaceKind(id: number) {
  const row = conversationStore.getConversationById(id)
  if (row?.kind === 'workspace') return
  await db.conversations.update(id, { kind: 'workspace' })
  if (row) row.kind = 'workspace'
}

function pickProviderPair(cfg: AppConfig): { providerId: number; selectedModel: string } {
  const pick = pickFirstReadyProvider(filterEnabledReadyProviders(providerStore.items, cfg), cfg)
  const [pidStr, model] = pick.split('/')
  return {
    providerId: parseInt(pidStr, 10) || providerStore.items[0]?.id || 1,
    selectedModel: model || providerStore.items[0]?.models[0] || 'gpt-4o-mini',
  }
}

async function createWorkspaceConversation(): Promise<number> {
  const cfg = appConfig.value!
  const pair = pickProviderPair(cfg)
  const now = new Date().toISOString()
  const id = await conversationStore.createConversation({
    title: defaultTitle.value,
    selectedModel: pair.selectedModel,
    providerId: pair.providerId,
    createdAt: now,
    updatedAt: now,
    kind: 'workspace',
  })
  providerModel.value = `${pair.providerId}/${pair.selectedModel}`
  return id
}

async function switchToConversation(id: number) {
  conversationId.value = id
  await markWorkspaceKind(id)
  await window.electronAPI.updateConfig({ workspaceConversationId: id })
  const exists = conversationStore.getConversationById(id)
  if (exists) syncProviderModelFromConv(exists.providerId, exists.selectedModel)
  await messageStore.fetchMessagesByConversation(id)
  await scrollBottom()
}

async function ensureConversation() {
  await providerStore.fetchProviders()
  await conversationStore.fetchConversations()
  await loadConfig()
  const cfg = appConfig.value!
  let id = Number(cfg.workspaceConversationId)
  if (Number.isFinite(id) && id > 0) {
    const exists = conversationStore.getConversationById(id)
    if (exists) {
      await switchToConversation(id)
      return
    }
  }
  id = await createWorkspaceConversation()
  await switchToConversation(id)
}

async function newChat() {
  if (replying.value) return
  historyOpen.value = false
  await loadConfig()
  const id = await createWorkspaceConversation()
  await switchToConversation(id)
  input.value = ''
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) void backfillHistoryTitles()
}

async function openHistory(id: number) {
  if (id === conversationId.value) {
    historyOpen.value = false
    return
  }
  if (replying.value) return
  historyOpen.value = false
  await switchToConversation(id)
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function syncProviderModelFromConv(providerId: number, selectedModel: string) {
  providerModel.value = `${providerId}/${selectedModel}`
}

function resolveProviderForTitle(convId: number): { providerName: string; selectedModel: string } | null {
  const conv = conversationStore.getConversationById(convId)
  const [pidStr, modelFromUi] = providerModel.value.split('/')
  const providerId = conv?.providerId ?? parseInt(pidStr, 10)
  const selectedModel = conv?.selectedModel || modelFromUi
  const provider = providerStore.items.find((p) => p.id === providerId)
  if (!provider || !selectedModel) return null
  return { providerName: provider.name, selectedModel }
}

function buildTitleMessages(
  msgs: { type?: string; content?: string }[],
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of msgs) {
    const content = String(m.content || '').trim()
    if (!content) continue
    if (m.type === 'question') out.push({ role: 'user', content })
    else if (m.type === 'answer') out.push({ role: 'assistant', content: content.slice(0, 500) })
    if (out.length >= 4) break
  }
  return out
}

async function applyAiTitle(targetId: number, messages: { role: 'user' | 'assistant'; content: string }[]) {
  if (titleInflight.has(targetId)) return
  const conv = conversationStore.getConversationById(targetId)
  if (!conv || conv.titleAiGenerated) return
  if (!messages.some((m) => m.role === 'user')) return

  const pair = resolveProviderForTitle(targetId)
  if (!pair) return

  titleInflight.add(targetId)
  try {
    const res = await window.electronAPI.suggestConversationTitle({
      providerName: pair.providerName,
      selectedModel: pair.selectedModel,
      uiLang: locale.value === 'zh' ? 'zh' : 'en',
      messages,
    })
    if (!res.ok || !res.title?.trim()) return
    // 若用户已手动改名且不是默认/临时首句，则不覆盖
    const latest = conversationStore.getConversationById(targetId)
    if (!latest || latest.titleAiGenerated) return
    await conversationStore.renameConversation(targetId, res.title.trim(), { aiGenerated: true })
  } finally {
    titleInflight.delete(targetId)
  }
}

async function maybeAiTitleAfterReply(finishedMessageId: number) {
  const msg = messageStore.items.find((m) => m.id === finishedMessageId)
  if (!msg || msg.conversationId !== conversationId.value) return
  const conv = conversationStore.getConversationById(conversationId.value)
  if (!conv || !needsAiTitle(conv)) return
  const messages = buildTitleMessages(
    messageStore.items
      .filter((m) => m.conversationId === conversationId.value)
      .sort((a, b) => a.id - b.id),
  )
  await applyAiTitle(conversationId.value, messages)
}

async function backfillHistoryTitles() {
  // 把仍是默认标题、且尚未标记 kind 的旧会话收进工作台历史
  for (const c of conversationStore.items) {
    if (c.kind === 'pet' || c.kind === 'workspace') continue
    if (isDefaultWorkspaceTitle(c.title)) await markWorkspaceKind(c.id)
  }

  const targets = historyItems.value.filter((c) => needsAiTitle(c)).slice(0, 8)
  for (const c of targets) {
    if (titleInflight.has(c.id)) continue
    try {
      const rows = (await db.messages.where('conversationId').equals(c.id).toArray()).sort(
        (a, b) => a.id - b.id,
      )
      const messages = buildTitleMessages(rows)
      if (!messages.length) continue
      if (isDefaultWorkspaceTitle(c.title)) {
        const interim = messages
          .find((m) => m.role === 'user')
          ?.content.replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
        if (interim) await conversationStore.renameConversation(c.id, interim)
      }
      await applyAiTitle(c.id, messages)
    } catch {
      /* ignore single failure */
    }
  }
}

async function maybeRenameFromFirstQuestion(text: string) {
  const conv = conversationStore.getConversationById(conversationId.value)
  if (!conv || conv.titleAiGenerated) return
  if (!isDefaultWorkspaceTitle(conv.title)) return
  const title = text.replace(/\s+/g, ' ').trim().slice(0, 40)
  if (title) await conversationStore.renameConversation(conversationId.value, title)
}

watch(providerModel, async (v) => {
  if (!conversationId.value || !v) return
  const [pidStr, model] = v.split('/')
  const providerId = parseInt(pidStr, 10)
  if (!Number.isFinite(providerId) || !model) return
  await conversationStore.updateConversationModel(conversationId.value, providerId, model)
})

watch(readyProviders, (list) => {
  if (!list.length) return
  if (!providerModel.value) {
    const cfg = appConfig.value
    if (cfg) providerModel.value = pickFirstReadyProvider(list, cfg)
  }
})

async function scrollBottom() {
  await nextTick()
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || replying.value || !conversationId.value) return
  const [pidStr, model] = providerModel.value.split('/')
  const providerId = parseInt(pidStr, 10)
  const provider = providerStore.items.find((p) => p.id === providerId)
  if (!provider || !model) return

  const date = new Date().toISOString()
  await messageStore.createMessage({
    content: text,
    conversationId: conversationId.value,
    createdAt: date,
    updatedAt: date,
    type: 'question',
    agentMode: true,
  })
  input.value = ''
  await maybeRenameFromFirstQuestion(text)

  const answerId = await messageStore.createMessage({
    content: '',
    conversationId: conversationId.value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: 'answer',
    status: 'loading',
  })
  streamBuffers.set(answerId, '')
  await scrollBottom()

  const history = buildChatMessagesForConversation(
    messageStore.items.filter(
      (m) =>
        m.conversationId === conversationId.value &&
        !(m.type === 'answer' && (m.status === 'loading' || m.status === 'streaming')),
    ),
    locale.value === 'zh' ? 'zh' : 'en',
  )
  await window.electronAPI.startChat(
    serializeCreateChatProps({
      messageId: answerId,
      providerName: provider.name,
      selectedModel: model,
      messages: history,
      agentMode: true,
      uiLang: locale.value === 'zh' ? 'zh' : 'en',
      ...(props.editorContext?.path
        ? {
            editorContext: {
              path: props.editorContext.path,
              line: Math.max(1, props.editorContext.line || 1),
              column: Math.max(1, props.editorContext.column || 1),
            },
          }
        : {}),
    }),
  )
}

async function stop() {
  const active = messageStore.items.find(
    (m) => m.conversationId === conversationId.value && isActiveChatReply(m),
  )
  await window.electronAPI.abortChat(active ? { messageId: active.id } : undefined)
  const now = new Date().toISOString()
  for (const item of messageStore.items) {
    if (item.conversationId !== conversationId.value || !isActiveChatReply(item)) continue
    const body = (item.content || '').trim()
    const note = t('common.generationStopped')
    await messageStore.updateMessage(item.id, {
      status: 'finished',
      content: body ? `${body}\n\n_${note}_` : note,
      updatedAt: now,
    })
    streamBuffers.delete(item.id)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.isComposing) return
  e.preventDefault()
  void send()
}

function onUpdateMessage(payload: UpdatgedStreamData) {
  const { messageId, data } = payload
  const msg = messageStore.items.find((m) => m.id === messageId)
  if (!msg || msg.conversationId !== conversationId.value) return
  void (async () => {
    let buf = streamBuffers.get(messageId) ?? msg.content ?? ''
    if (data.replace) buf = data.result || ''
    else if (data.result) buf += data.result
    streamBuffers.set(messageId, buf)
    const status: MessageProps['status'] = data.is_end
      ? data.is_error
        ? 'error'
        : 'finished'
      : 'streaming'
    await messageStore.updateMessage(messageId, {
      content: buf,
      status,
      updatedAt: new Date().toISOString(),
    })
    await scrollBottom()
    if (data.is_end && !data.is_error) {
      void maybeAiTitleAfterReply(messageId)
    }
  })()
}

onMounted(async () => {
  await ensureConversation()
  removeUpdate = window.electronAPI.onUpdateMessage(onUpdateMessage)
  window.electronAPI.onConfigChanged(() => {
    void loadConfig()
  })
  void backfillHistoryTitles()
})

onUnmounted(() => {
  removeUpdate?.()
})
</script>
