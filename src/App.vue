<template>
  <div class="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div
      v-if="showCustomTitleBar"
      class="flex h-11 shrink-0 items-stretch border-b border-gray-200 bg-gray-50 text-gray-900 select-none box-border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div class="title-drag-region flex min-w-0 flex-1 items-center gap-2 px-3">
        <img
          :src="`${baseUrl}pig.ico`"
          alt=""
          class="h-8 w-8 shrink-0 pointer-events-none"
          draggable="false"
        />
        <span class="text-2xl font-bold leading-none">{{ APP_DISPLAY_NAME }}</span>
      </div>
      <div class="title-no-drag-region flex shrink-0">
        <button
          type="button"
          class="inline-flex h-full w-11 items-center justify-center text-gray-700 hover:bg-gray-200 active:bg-gray-300 dark:text-slate-200 dark:hover:bg-slate-800"
          title="最小化"
          aria-label="最小化"
          @click="windowMinimize"
        >
          <Icon icon="mdi:window-minimize" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="inline-flex h-full w-11 items-center justify-center text-gray-700 hover:bg-gray-200 active:bg-gray-300 dark:text-slate-200 dark:hover:bg-slate-800"
          title="最大化"
          aria-label="最大化"
          @click="windowToggleMaximize"
        >
          <Icon :icon="isWindowMaximized ? 'mdi:window-restore' : 'mdi:window-maximize'" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="inline-flex h-full w-11 items-center justify-center text-gray-700 hover:bg-red-500 hover:text-white active:bg-red-600 dark:text-slate-200 dark:hover:bg-red-600"
          title="关闭"
          aria-label="关闭"
          @click="windowClose"
        >
          <Icon icon="mdi:window-close" class="h-4 w-4" />
        </button>
      </div>
    </div>
    <div class="flex min-h-0 flex-1 items-stretch justify-between">
    <div
      class="flex h-full min-h-0 flex-col overflow-hidden border-r border-gray-300 bg-gray-200 transition-[width] duration-200 ease-out dark:border-slate-700 dark:bg-slate-900"
      :class="sidebarCollapsed ? 'w-0 min-w-0 border-r-0' : 'w-[300px] shrink-0'"
    >
      <div
        v-if="!sidebarCollapsed"
        ref="expandedSidebarSearchRootRef"
        class="flex shrink-0 flex-col"
      >
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-300 bg-gray-100 px-2 py-2 dark:border-slate-600 dark:bg-slate-900"
        >
          <span class="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-slate-100">{{ APP_DISPLAY_NAME }}</span>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-400 dark:hover:bg-slate-800 dark:focus-visible:ring-green-500/40"
              :title="t('common.searchConversations')"
              :aria-label="t('common.searchConversations')"
              :aria-expanded="searchPanelOpen"
              @click.stop="toggleSearchPanel"
            >
              <Icon icon="radix-icons:magnifying-glass" class="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-400 dark:hover:bg-slate-800 dark:focus-visible:ring-green-500/40"
              :title="t('common.collapseSidebar')"
              :aria-label="t('common.collapseSidebar')"
              @click="sidebarCollapsed = true"
            >
              <Icon icon="mdi:arrow-collapse-left" class="h-5 w-5" />
            </button>
          </div>
        </div>
        <div
          v-show="searchPanelOpen"
          class="shrink-0 border-b border-gray-300 px-2 py-2 dark:border-slate-600"
        >
          <input
            ref="searchInputRef"
            v-model="conversationSearchQuery"
            type="search"
            autocomplete="off"
            class="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-green-600 focus:ring-1 focus:ring-green-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-green-500 dark:focus:ring-green-500"
            :placeholder="t('common.searchConversationsPlaceholder')"
            @keydown.escape.prevent="closeSearchPanel"
          />
        </div>
      </div>
      <div v-show="!sidebarCollapsed && !showSearchBrowser" class="min-h-0 flex-1 overflow-y-auto">
        <ConversationList :items="filteredItems"/>
      </div>
      <div v-show="!sidebarCollapsed" class="grid shrink-0 grid-cols-2 gap-2 border-t border-gray-300 p-2 dark:border-slate-600">
        <RouterLink to="/" custom v-slot="{ navigate }">
          <Button icon-name="radix-icons:chat-bubble" class="w-full" type="button" @click="navigate">
            {{ t('common.newChat') }}
          </Button>
        </RouterLink>
        <RouterLink to="/settings" custom v-slot="{ navigate }">
          <Button icon-name="radix-icons:gear" plain class="w-full" type="button" @click="navigate">
            {{ t('common.settings') }}
          </Button>
        </RouterLink>
      </div>
    </div>
    <div class="h-full flex-1 flex min-h-0 min-w-0 flex-col">
      <header
        class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
      >
        <div class="relative flex min-w-0 shrink-0 items-center gap-2">
          <div v-if="sidebarCollapsed" class="relative flex shrink-0 items-center">
            <div
              class="inline-flex items-center gap-0.5 rounded-full border border-gray-300 bg-white px-1 py-0.5 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:shadow-none"
            >
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-700 outline-none hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus-visible:ring-green-500/40"
                :title="t('common.expandSidebar')"
                :aria-label="t('common.expandSidebar')"
                @click="sidebarCollapsed = false"
              >
                <Icon icon="mdi:dock-left" class="h-5 w-5" />
              </button>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-700 outline-none hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus-visible:ring-green-500/40"
                :title="t('common.newChat')"
                :aria-label="t('common.newChat')"
                @click="goNewChatFromCollapsed"
              >
                <Icon icon="mdi:plus-circle-outline" class="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
        <LocationBadge :locating="locationAutoDetecting" />
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-amber-500 shadow-sm outline-none transition-colors hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-slate-600 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700 dark:focus-visible:ring-amber-500"
          :title="isDark ? t('settings.themeSwitchToLight') : t('settings.themeSwitchToDark')"
          :aria-label="isDark ? t('settings.themeSwitchToLight') : t('settings.themeSwitchToDark')"
          @click="toggleTheme"
        >
          <Icon :icon="isDark ? 'mdi:weather-night' : 'mdi:white-balance-sunny'" class="h-5 w-5" />
        </button>
        <Button
          type="button"
          plain
          size="small"
          icon-name="radix-icons:reload"
          class="!shadow-none"
          @click="reloadApp"
        >
          {{ t('common.reloadApp') }}
        </Button>
        </div>
      </header>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
        <div
          v-if="showSearchBrowser"
          ref="searchBrowserPanelRef"
          class="flex min-h-0 flex-1 flex-row overflow-hidden"
        >
          <div
            class="flex w-[min(42%,22rem)] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          >
            <div class="shrink-0 border-b border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 dark:border-slate-700 dark:text-slate-400">
              {{ t('common.searchResultsTitle') }}
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto">
              <p
                v-if="filteredItems.length === 0"
                class="px-3 py-6 text-center text-sm text-gray-500 dark:text-slate-400"
              >
                {{ t('common.searchNoResults') }}
              </p>
              <button
                v-for="c in filteredItems"
                :key="c.id"
                type="button"
                class="flex w-full gap-2 border-b border-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/80"
                :class="
                  searchPreviewConversationId === c.id
                    ? 'bg-gray-100 dark:bg-slate-800'
                    : 'bg-transparent'
                "
                @click="searchPreviewConversationId = c.id"
              >
                <span class="mt-0.5 shrink-0 text-gray-400 dark:text-slate-500" aria-hidden="true">
                  <Icon icon="radix-icons:chat-bubble" class="h-4 w-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-start justify-between gap-2">
                    <span class="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{{ c.title }}</span>
                    <span class="shrink-0 text-xs text-gray-400 dark:text-slate-500">{{ searchResultDate(c.updatedAt) }}</span>
                  </span>
                  <span class="mt-1 max-h-10 overflow-hidden break-all text-xs leading-snug text-gray-600 dark:text-slate-400">
                    <template
                      v-for="(part, pi) in splitSnippetHighlight(searchResultSnippet(c), conversationSearchQuery.trim())"
                      :key="pi"
                    >
                      <mark
                        v-if="part.mark"
                        class="rounded bg-amber-200 px-0.5 text-gray-900 dark:bg-amber-900/50 dark:text-amber-100"
                      >{{ part.text }}</mark>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </span>
                </span>
              </button>
            </div>
          </div>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
            <template v-if="searchPreviewConversationId != null">
              <div class="shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <h2 class="truncate text-base font-semibold text-gray-900 dark:text-slate-100">
                  {{ searchPreviewConversation?.title }}
                </h2>
                <p class="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  {{ searchPreviewConversation?.selectedModel }} · {{ formatDateTime(searchPreviewConversation?.updatedAt) }}
                </p>
                <button
                  type="button"
                  class="mt-3 inline-flex items-center gap-1.5 rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
                  @click="openSearchPreviewConversation"
                >
                  <Icon icon="radix-icons:arrow-right" class="h-4 w-4" />
                  {{ t('common.searchOpenConversation') }}
                </button>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <p v-if="searchPreviewRows.length === 0" class="text-sm text-gray-500 dark:text-slate-400">
                  {{ t('common.searchMatchMeta') }}
                </p>
                <div v-for="row in searchPreviewRows" :key="row.id" class="mb-4 border-b border-gray-200 pb-3 last:border-0 dark:border-slate-800">
                  <div class="mb-1 text-xs font-medium text-green-700 dark:text-green-400">{{ row.roleLabel }}</div>
                  <div class="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-slate-200">
                    <template
                      v-for="(part, pi) in splitSnippetHighlight(row.excerpt, conversationSearchQuery.trim())"
                      :key="pi"
                    >
                      <mark
                        v-if="part.mark"
                        class="rounded bg-amber-200 px-0.5 text-gray-900 dark:bg-amber-900/50 dark:text-amber-100"
                      >{{ part.text }}</mark>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </div>
                </div>
              </div>
            </template>
            <div
              v-else
              class="flex flex-1 items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-slate-400"
            >
              {{ t('common.searchPickConversation') }}
            </div>
          </div>
        </div>
        <RouterView v-else class="flex min-h-0 flex-1 flex-col" />
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { initI18n } from './i18n'
import { db, initProviders } from './db'
import { useConversationStore } from './stores/conversation'
import { useProviderStore } from './stores/provider'
import type { ConversationProps } from './types'
import { formatDateTime } from './formatDateTime'
import ConversationList from './components/ConversationList.vue'
import LocationBadge from './components/LocationBadge.vue'
import Button from './components/Button.vue'
import { useRouter } from 'vue-router'
import { APP_DISPLAY_NAME } from './appMeta'
import { Icon } from '@iconify/vue'
import { applyAppearance, emitAppearanceChanged } from './appearance'
import { RESTORE_ROUTE_AFTER_RELOAD_KEY } from './restoreRouteKey'

const SIDEBAR_COLLAPSED_KEY = 'vchat-sidebar-collapsed'

const baseUrl = import.meta.env.BASE_URL
/** 用 computed 读取，避免仅模块初始化时 electronEnv 尚未就绪；Windows 无边框依赖此项显示拖动区与窗口按钮 */
const showCustomTitleBar = computed(
  () => typeof window !== 'undefined' && window.electronEnv?.platform === 'win32',
)
const isWindowMaximized = ref(false)
const isDark = ref(false)

const windowMinimize = () => window.electronAPI.windowMinimize()
const windowToggleMaximize = () => window.electronAPI.windowToggleMaximize()
const windowClose = () => window.electronAPI.windowClose()

const router = useRouter()
const { t, locale } = useI18n()
const conversationStore = useConversationStore()
const provdierStore = useProviderStore()

const locationAutoDetecting = ref(false)
const sidebarCollapsed = ref(false)
const searchPanelOpen = ref(false)
const conversationSearchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

/** 消息正文命中的会话 id（IndexedDB 扫描，防抖更新；勿用响应式 Map 以免 ref 回调式更新死循环） */
const messageMatchedConversationIds = ref<Set<number>>(new Set())
/** 每条会话首条命中消息的摘要（用于左侧结果列表） */
const messageSearchSnippets = ref<Record<number, string>>({})
let messageSearchSeq = 0
let messageSearchDebounce: ReturnType<typeof setTimeout> | undefined

const MESSAGE_SEARCH_DEBOUNCE_MS = 280

const showSearchBrowser = computed(
  () => searchPanelOpen.value && Boolean(conversationSearchQuery.value.trim()),
)

const searchBrowserPanelRef = ref<HTMLElement | null>(null)
const searchPreviewConversationId = ref<number | null>(null)
const searchPreviewRows = ref<{ id: number; roleLabel: string; excerpt: string }[]>([])

const searchPreviewConversation = computed(() => {
  const id = searchPreviewConversationId.value
  if (id == null) return null as ConversationProps | null
  return conversationStore.getConversationById(id) ?? null
})

function searchResultDate(iso: string): string {
  const d = dayjs(iso)
  if (!d.isValid()) return ''
  return locale.value.startsWith('zh') ? d.format('M月D日') : d.format('MMM D')
}

function searchResultSnippet(c: ConversationProps): string {
  const fromMsg = messageSearchSnippets.value[c.id]
  if (fromMsg) return fromMsg
  const q = conversationSearchQuery.value.trim().toLowerCase()
  const title = (c.title ?? '').toLowerCase()
  if (q && title.includes(q)) return c.title
  const model = (c.selectedModel ?? '').toLowerCase()
  if (q && model.includes(q)) return `${c.selectedModel} ${t('common.searchMatchMeta')}`
  return ''
}

function splitSnippetHighlight(
  snippet: string,
  query: string,
): { text: string; mark?: boolean }[] {
  const q = query.trim()
  if (!q || !snippet) return [{ text: snippet || '' }]
  const lower = snippet.toLowerCase()
  const idx = lower.indexOf(q.toLowerCase())
  if (idx === -1) return [{ text: snippet }]
  const parts: { text: string; mark?: boolean }[] = []
  if (idx > 0) parts.push({ text: snippet.slice(0, idx) })
  parts.push({ text: snippet.slice(idx, idx + q.length), mark: true })
  if (idx + q.length < snippet.length) parts.push({ text: snippet.slice(idx + q.length) })
  return parts
}

function excerptAround(content: string, queryRaw: string): string {
  const q = queryRaw.trim().toLowerCase()
  if (!q) return content.slice(0, 160) + (content.length > 160 ? '…' : '')
  const lower = content.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return content.slice(0, 160) + (content.length > 160 ? '…' : '')
  const pad = 72
  const ql = queryRaw.trim().length
  const start = Math.max(0, idx - pad)
  const end = Math.min(content.length, idx + ql + pad)
  let s = content.slice(start, end)
  if (start > 0) s = `…${s}`
  if (end < content.length) s = `${s}…`
  return s
}

async function runMessageBodySearch(trimmed: string) {
  const q = trimmed.toLowerCase()
  const seq = ++messageSearchSeq
  if (!q) {
    messageMatchedConversationIds.value = new Set()
    messageSearchSnippets.value = {}
    return
  }
  try {
    const rows = await db.messages.toArray()
    if (seq !== messageSearchSeq) return
    const ids = new Set<number>()
    const snippets: Record<number, string> = {}
    for (const m of rows) {
      const content = m.content ?? ''
      const lower = content.toLowerCase()
      if (!lower.includes(q)) continue
      ids.add(m.conversationId)
      if (snippets[m.conversationId] === undefined) {
        snippets[m.conversationId] = excerptAround(content, trimmed)
      }
    }
    if (seq !== messageSearchSeq) return
    messageMatchedConversationIds.value = ids
    messageSearchSnippets.value = snippets
  } catch {
    if (seq === messageSearchSeq) {
      messageMatchedConversationIds.value = new Set()
      messageSearchSnippets.value = {}
    }
  }
}

function scheduleMessageBodySearch() {
  if (messageSearchDebounce !== undefined) {
    clearTimeout(messageSearchDebounce)
    messageSearchDebounce = undefined
  }
  const trimmed = conversationSearchQuery.value.trim()
  if (!trimmed) {
    messageMatchedConversationIds.value = new Set()
    messageSearchSnippets.value = {}
    return
  }
  messageSearchDebounce = setTimeout(() => {
    messageSearchDebounce = undefined
    void runMessageBodySearch(trimmed)
  }, MESSAGE_SEARCH_DEBOUNCE_MS)
}

const filteredItems = computed(() => {
  const q = conversationSearchQuery.value.trim().toLowerCase()
  if (!q) return conversationStore.sortedItems
  const fromMessages = messageMatchedConversationIds.value
  return conversationStore.sortedItems.filter((c) => {
    const title = (c.title ?? '').toLowerCase()
    const model = (c.selectedModel ?? '').toLowerCase()
    return title.includes(q) || model.includes(q) || fromMessages.has(c.id)
  })
})

async function loadSearchPreviewRows() {
  if (!showSearchBrowser.value) {
    searchPreviewRows.value = []
    return
  }
  const id = searchPreviewConversationId.value
  const qRaw = conversationSearchQuery.value.trim()
  if (id == null || !qRaw) {
    searchPreviewRows.value = []
    return
  }
  const ql = qRaw.toLowerCase()
  try {
    const msgs = (await db.messages.where('conversationId').equals(id).toArray()).sort((a, b) => a.id - b.id)
    const rows: { id: number; roleLabel: string; excerpt: string }[] = []
    for (const m of msgs) {
      if (!(m.content ?? '').toLowerCase().includes(ql)) continue
      rows.push({
        id: m.id,
        roleLabel: m.type === 'question' ? t('common.searchRoleUser') : t('common.searchRoleAssistant'),
        excerpt: excerptAround(m.content ?? '', qRaw),
      })
    }
    searchPreviewRows.value = rows
  } catch {
    searchPreviewRows.value = []
  }
}

function openSearchPreviewConversation() {
  const id = searchPreviewConversationId.value
  if (id == null) return
  closeSearchPanel()
  void router.push(`/conversation/${id}`)
}

watch(filteredItems, (items) => {
  if (!searchPanelOpen.value || !conversationSearchQuery.value.trim()) return
  if (items.length === 0) {
    searchPreviewConversationId.value = null
    return
  }
  const cur = searchPreviewConversationId.value
  if (cur == null || !items.some((c) => c.id === cur)) {
    searchPreviewConversationId.value = items[0].id
  }
})

watch(
  () => [searchPreviewConversationId.value, conversationSearchQuery.value, showSearchBrowser.value] as const,
  () => {
    void loadSearchPreviewRows()
  },
)

const expandedSidebarSearchRootRef = ref<HTMLElement | null>(null)

const closeSearchPanel = () => {
  searchPanelOpen.value = false
  conversationSearchQuery.value = ''
  messageMatchedConversationIds.value = new Set()
  messageSearchSnippets.value = {}
  searchPreviewConversationId.value = null
  searchPreviewRows.value = []
  if (messageSearchDebounce !== undefined) {
    clearTimeout(messageSearchDebounce)
    messageSearchDebounce = undefined
  }
  messageSearchSeq += 1
}

const toggleSearchPanel = () => {
  if (searchPanelOpen.value) {
    closeSearchPanel()
  } else {
    searchPanelOpen.value = true
  }
}

const goNewChatFromCollapsed = () => {
  void router.push('/')
}

function onPointerDownOutsideSearch(e: PointerEvent) {
  if (!searchPanelOpen.value) return
  const t = e.target as Node
  if (expandedSidebarSearchRootRef.value?.contains(t)) return
  if (searchBrowserPanelRef.value?.contains(t)) return
  closeSearchPanel()
}

watch(searchPanelOpen, (open) => {
  if (open) {
    void nextTick(() => searchInputRef.value?.focus())
    document.addEventListener('pointerdown', onPointerDownOutsideSearch, true)
  } else {
    document.removeEventListener('pointerdown', onPointerDownOutsideSearch, true)
  }
})

watch(conversationSearchQuery, () => {
  scheduleMessageBodySearch()
})

watch(
  () => conversationStore.items,
  () => {
    if (conversationSearchQuery.value.trim()) scheduleMessageBodySearch()
  },
  { deep: true },
)

watch(sidebarCollapsed, (collapsed) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* 隐私模式等 */
  }
  /** 收起后边栏内搜索框被卸载，同步关闭以免状态悬空 */
  if (collapsed) {
    closeSearchPanel()
  }
})

/**
 * 整页重载以解除主进程流式卡死、IndexedDB 中 loading 等状态；
 * 重载前保存当前路径，启动后自动回到原页面（见 `restoreRouteKey` + `renderer.ts`）。
 */
const reloadApp = () => {
  try {
    const r = router.currentRoute.value
    /** 会话页去掉查询串（如 `?init=`），避免重载后再次执行首轮 `creatingInitialMessage` */
    const toSave = r.path.startsWith('/conversation/') ? r.path : r.fullPath
    sessionStorage.setItem(RESTORE_ROUTE_AFTER_RELOAD_KEY, toSave)
  } catch {
    /* 忽略 */
  }
  window.location.reload()
}

const toggleTheme = async () => {
  const next = isDark.value ? 'light' : 'dark'
  const saved = await window.electronAPI.updateConfig({ theme: next })
  isDark.value = (saved.theme ?? 'light') === 'dark'
  applyAppearance(saved)
  emitAppearanceChanged()
}

// 监听菜单事件
window.electronAPI.onMenuNewConversation(() => {
  router.push('/')
})

window.electronAPI.onMenuOpenSettings(() => {
  router.push('/settings')
})

let offWindowMaximized: (() => void) | undefined

onMounted(async () => {
  try {
    sidebarCollapsed.value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    /* ignore */
  }
  isWindowMaximized.value = await window.electronAPI.isWindowMaximized()
  offWindowMaximized = window.electronAPI.onWindowMaximizedState((v: boolean) => {
    isWindowMaximized.value = v
  })
  await initI18n()
  const cfg = await window.electronAPI.getConfig()
  isDark.value = (cfg.theme ?? 'light') === 'dark'
  await initProviders()
  await conversationStore.fetchConversations()
  await provdierStore.fetchProviders()
  locationAutoDetecting.value = true
  try {
    await window.electronAPI.autoDetectLocation()
    emitAppearanceChanged()
  } catch {
    /* 定位失败时保留已有配置 */
  } finally {
    locationAutoDetecting.value = false
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDownOutsideSearch, true)
  if (messageSearchDebounce !== undefined) clearTimeout(messageSearchDebounce)
  messageSearchSeq += 1
  offWindowMaximized?.()
})
</script>