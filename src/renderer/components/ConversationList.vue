<template>
  <div class="conversation-list">
    <div
      v-for="item in items"
      :key="item.id"
      class="group relative border-t border-gray-300 dark:border-slate-600"
      :class="{
        'bg-gray-100 dark:bg-slate-800': !batchMode && store.selectedId === item.id,
        'bg-white dark:bg-slate-900/80': !batchMode && store.selectedId !== item.id,
        'bg-blue-50 dark:bg-blue-950/30': batchMode && selectedIds.has(item.id),
        'bg-white dark:bg-slate-900/80': batchMode && !selectedIds.has(item.id),
      }"
      @contextmenu.prevent="!batchMode && openMenu(item.id)"
    >
      <div
        class="flex cursor-pointer items-stretch gap-1 p-2 pr-1 hover:bg-gray-200/80 dark:hover:bg-slate-700/80"
        :class="!batchMode && store.selectedId === item.id ? 'hover:bg-gray-200 dark:hover:bg-slate-700' : ''"
        @click="batchMode ? toggleSelect(item.id) : onRowClick(item.id, $event)"
      >
        <!-- 批量选择复选框 -->
        <span
          v-if="batchMode"
          class="mt-1 flex shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          <span
            class="flex h-4 w-4 items-center justify-center rounded border-2 transition-colors"
            :class="
              selectedIds.has(item.id)
                ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400'
                : 'border-gray-400 bg-white dark:border-slate-500 dark:bg-slate-800'
            "
          >
            <Icon
              v-if="selectedIds.has(item.id)"
              icon="mdi:check"
              width="12"
              height="12"
              class="text-white"
            />
          </span>
        </span>
        <span
          v-else-if="item.pinnedAt"
          class="mt-1 shrink-0 text-gray-400 dark:text-slate-500"
          :title="t('common.conversationPin')"
        >
          <Icon icon="mdi:pin" width="14" height="14" />
        </span>
        <span v-else class="mt-1 w-3.5 shrink-0" aria-hidden="true" />

        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-1 text-sm leading-5 text-gray-500 dark:text-slate-400">
            <span class="truncate">{{ item.selectedModel }}</span>
            <span class="shrink-0">{{ dayjs(item.updatedAt).format('YYYY-MM-DD') }}</span>
          </div>
          <input
            v-if="renamingId === item.id"
            ref="renameInputRef"
            v-model="renamingTitle"
            type="text"
            class="mt-0.5 w-full rounded border border-green-600 bg-white px-1.5 py-0.5 text-sm font-semibold text-gray-900 outline-none ring-1 ring-green-600/30 dark:border-green-500 dark:bg-slate-900 dark:text-slate-100"
            :placeholder="t('common.conversationRenamePlaceholder')"
            @click.stop
            @keydown.enter.prevent="commitRename(item.id)"
            @keydown.escape.prevent="cancelRename"
            @blur="commitRename(item.id)"
          />
          <h2
            v-else
            class="truncate font-semibold leading-6 text-gray-900 dark:text-slate-100"
          >
            {{ item.title }}
          </h2>
        </div>

        <DropdownMenuRoot
          v-if="!batchMode"
          :open="openMenuId === item.id"
          @update:open="(v: boolean) => onMenuOpenChange(item.id, v)"
        >
          <DropdownMenuTrigger
            type="button"
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 outline-none hover:bg-gray-300/80 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-gray-400 group-hover:opacity-100 data-[state=open]:opacity-100 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-100 dark:focus-visible:ring-slate-500"
            :class="{ 'opacity-100': openMenuId === item.id }"
            :title="t('common.conversationMoreActions')"
            :aria-label="t('common.conversationMoreActions')"
            @click.stop
          >
            <Icon icon="radix-icons:dots-horizontal" width="18" height="18" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="z-[200] min-w-[10.5rem] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
              :side-offset="4"
              align="end"
              @click.stop
            >
              <DropdownMenuItem
                class="flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
                @select="onPin(item.id)"
              >
                <Icon
                  :icon="item.pinnedAt ? 'mdi:pin-off-outline' : 'mdi:pin-outline'"
                  width="16"
                  height="16"
                  class="shrink-0 text-gray-500"
                />
                <span>{{ item.pinnedAt ? t('common.conversationUnpin') : t('common.conversationPin') }}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                class="flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
                @select="startRename(item)"
              >
                <Icon icon="radix-icons:pencil-1" width="16" height="16" class="shrink-0 text-gray-500" />
                <span>{{ t('common.conversationRename') }}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                class="flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 outline-none data-[highlighted]:bg-red-50 dark:text-red-400 dark:data-[highlighted]:bg-red-950/40"
                @select="onDelete(item.id)"
              >
                <Icon icon="radix-icons:trash" width="16" height="16" class="shrink-0" />
                <span>{{ t('common.conversationDelete') }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Icon } from '@iconify/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'radix-vue'
import { useI18n } from 'vue-i18n'
import { ConversationProps } from '../../shared/types'
import { useConversationStore } from '../../domains/chat/stores/conversation'

const props = defineProps<{ items: ConversationProps[]; batchMode?: boolean }>()
const emit = defineEmits<{
  (e: 'update:selectedIds', ids: Set<number>): void
}>()

const router = useRouter()
const { t } = useI18n()
const store = useConversationStore()

const openMenuId = ref<number | null>(null)
const renamingId = ref<number | null>(null)
const renamingTitle = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const selectedIds = ref<Set<number>>(new Set())

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
  emit('update:selectedIds', next)
}

function selectAll() {
  const next = new Set(props.items.map((i) => i.id))
  selectedIds.value = next
  emit('update:selectedIds', next)
}

function deselectAll() {
  selectedIds.value = new Set()
  emit('update:selectedIds', new Set())
}

function clearSelection() {
  selectedIds.value = new Set()
}

defineExpose({ selectAll, deselectAll, clearSelection, selectedIds })

function openMenu(id: number) {
  openMenuId.value = id
}

function onMenuOpenChange(id: number, open: boolean) {
  openMenuId.value = open ? id : openMenuId.value === id ? null : openMenuId.value
}

function onRowClick(id: number, e: MouseEvent) {
  if (renamingId.value === id) return
  const target = e.target as HTMLElement
  if (target.closest('button') || target.closest('input')) return
  goToConversation(id)
}

const goToConversation = (id: number) => {
  router.push({ path: `/conversation/${id}` })
  store.selectedId = id
}

function startRename(item: ConversationProps) {
  openMenuId.value = null
  renamingId.value = item.id
  renamingTitle.value = item.title
  void nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function cancelRename() {
  renamingId.value = null
  renamingTitle.value = ''
}

async function commitRename(id: number) {
  if (renamingId.value !== id) return
  const title = renamingTitle.value.trim()
  renamingId.value = null
  renamingTitle.value = ''
  if (!title) return
  await store.renameConversation(id, title)
}

async function onPin(id: number) {
  openMenuId.value = null
  await store.togglePinConversation(id)
}

async function onDelete(id: number) {
  openMenuId.value = null
  if (!window.confirm(t('common.conversationDeleteConfirm'))) return
  await store.deleteConversation(id)
  if (store.selectedId === id) {
    store.selectedId = -1
    router.push('/')
  }
}

onMounted(() => {
  window.electronAPI.onDeleteConversation(async (id: number) => {
    await onDelete(id)
  })
})
</script>
