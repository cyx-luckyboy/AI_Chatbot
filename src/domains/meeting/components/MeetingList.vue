<template>
  <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="group flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors"
      :class="
        selectedId === item.id
          ? 'bg-green-100 dark:bg-green-900/30'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
      "
      @click="emit('select', item.id!)"
    >
      <span v-if="editingId !== item.id" class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
        {{ item.title }}
      </span>
      <input
        v-else
        ref="editInputRef"
        v-model="editTitle"
        class="w-full rounded border border-green-500 bg-white px-2 py-0.5 text-sm dark:bg-slate-800"
        @keydown.enter="commitEdit(item.id!)"
        @keydown.escape="cancelEdit"
        @blur="commitEdit(item.id!)"
        @click.stop
      />
      <span class="text-xs text-slate-500 dark:text-slate-400">
        {{ formatDate(item.createdAt) }} · {{ formatDuration(item.durationMs) }}
        <span v-if="item.status === 'recording'" class="ml-1 text-red-500">{{ t('meetings.recording') }}</span>
      </span>
      <div class="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          @click.stop="startEdit(item)"
        >
          {{ t('meetings.rename') }}
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          @click.stop="confirmDelete(item.id!)"
        >
          {{ t('meetings.delete') }}
        </button>
      </div>
    </button>
    <p v-if="items.length === 0" class="px-3 py-8 text-center text-sm text-slate-400">
      {{ t('meetings.emptyList') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { MeetingRecordProps } from '../../../shared/types'

defineProps<{
  items: MeetingRecordProps[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  rename: [id: number, title: string]
  delete: [id: number]
}>()

const { t } = useI18n()
const editingId = ref<number | null>(null)
const editTitle = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

function formatDate(iso: string) {
  return dayjs(iso).format('YYYY-MM-DD HH:mm')
}

function formatDuration(ms: number) {
  const s = Math.floor((ms || 0) / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function startEdit(item: MeetingRecordProps) {
  editingId.value = item.id ?? null
  editTitle.value = item.title
  void nextTick(() => editInputRef.value?.focus())
}

function cancelEdit() {
  editingId.value = null
}

function commitEdit(id: number) {
  const title = editTitle.value.trim()
  editingId.value = null
  if (title) emit('rename', id, title)
}

function confirmDelete(id: number) {
  if (window.confirm(t('meetings.deleteConfirm'))) {
    emit('delete', id)
  }
}
</script>
