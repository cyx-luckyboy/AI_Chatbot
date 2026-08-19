<template>
  <button
    v-if="locationEnabled && locationLabel"
    type="button"
    class="inline-flex max-w-[11rem] cursor-default items-center gap-1 truncate rounded-md border border-emerald-200/80 bg-emerald-50/90 px-2 py-1 text-xs font-medium text-emerald-800 outline-none dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200"
    :title="t('common.locationAutoHint')"
    :disabled="locating"
  >
    <Icon icon="mdi:map-marker" class="h-4 w-4 shrink-0" />
    <span class="truncate">{{ locationLabel }}</span>
  </button>
  <span
    v-else-if="locationEnabled && locating"
    class="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
  >
    <Icon icon="mdi:map-marker-outline" class="h-4 w-4 shrink-0 animate-pulse" />
    <span>{{ t('common.locationDetecting') }}</span>
  </span>
</template>

<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useLocationConfig } from './useLocationConfig'

defineProps<{
  locating?: boolean
}>()

const { t } = useI18n()
const { locationEnabled, locationLabel } = useLocationConfig()
</script>
