<template>
  <div
    v-if="meta && meta.sources.length > 0"
    class="mb-2 rounded-md border border-gray-200/90 bg-gray-50/80 dark:border-slate-600 dark:bg-slate-800/50"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs text-gray-500 outline-none hover:bg-gray-100/80 dark:text-slate-400 dark:hover:bg-slate-700/50"
      @click="expanded = !expanded"
    >
      <span>{{ summaryLine }}</span>
      <Icon
        :icon="expanded ? 'radix-icons:chevron-up' : 'radix-icons:chevron-right'"
        width="14"
        height="14"
        class="shrink-0 text-gray-400"
      />
    </button>
    <div v-show="expanded" class="border-t border-gray-200/80 px-2.5 pb-2.5 pt-2 dark:border-slate-600">
      <p v-if="queriesLine" class="mb-2 text-xs leading-relaxed text-gray-400 dark:text-slate-500">
        {{ queriesLine }}
      </p>
      <ul class="max-h-[min(40vh,280px)] space-y-2 overflow-y-auto">
        <li v-for="(s, i) in meta.sources" :key="`${s.url}-${i}`">
          <button
            type="button"
            class="group flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left outline-none hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-sky-400/50 dark:hover:bg-slate-700/60"
            @click="openSource(s.url)"
          >
            <img
              :src="faviconUrl(s.url)"
              alt=""
              width="16"
              height="16"
              class="mt-0.5 shrink-0 rounded-sm bg-white object-contain dark:bg-slate-900"
              @error="onFaviconError($event)"
            />
            <span
              class="min-w-0 flex-1 text-sm leading-snug text-blue-600 group-hover:underline dark:text-sky-400"
            >
              {{ s.title }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import type { WebSearchMeta } from '../types'

const props = defineProps<{
  meta: WebSearchMeta | undefined
}>()

const { t } = useI18n()
const expanded = ref(true)

const summaryLine = computed(() => {
  const m = props.meta
  if (!m) return ''
  const kc = m.queries.length
  const sc = m.sources.length
  return t('common.webSearchRefsSummary', { keywordCount: kc, sourceCount: sc })
})

const queriesLine = computed(() => {
  const qs = props.meta?.queries?.filter((q) => q.trim()) ?? []
  if (!qs.length) return ''
  return qs.map((q) => `「${q}」`).join('、')
})

function faviconUrl(url: string) {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return ''
  }
}

function onFaviconError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.visibility = 'hidden'
}

async function openSource(url: string) {
  const u = url.trim()
  if (!u) return
  try {
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(u)
    } else {
      window.open(u, '_blank', 'noopener,noreferrer')
    }
  } catch (e) {
    console.error('[webSearch] open url', e)
  }
}
</script>
