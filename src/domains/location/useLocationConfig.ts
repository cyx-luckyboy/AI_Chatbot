import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppConfig } from '../../shared/types'
import { formatLocationLabel, resolveUserLocation } from './userLocation'

export function useLocationConfig() {
  const { locale } = useI18n()
  const config = ref<AppConfig | null>(null)

  const lang = computed(() => (locale.value === 'zh' ? 'zh' : 'en') as 'zh' | 'en')

  const locationEnabled = computed(() => config.value?.locationEnabled !== false)

  const locationLabel = computed(() => {
    if (!config.value || config.value.locationEnabled === false) return ''
    return formatLocationLabel(resolveUserLocation(config.value), lang.value)
  })

  async function refresh() {
    config.value = await window.electronAPI.getConfig()
  }

  function onAppearanceChanged() {
    void refresh()
  }

  let offConfigChanged: (() => void) | undefined

  onMounted(() => {
    void refresh()
    window.addEventListener('vchat-appearance-changed', onAppearanceChanged)
    offConfigChanged = window.electronAPI.onConfigChanged?.(() => {
      void refresh()
    })
  })

  onUnmounted(() => {
    window.removeEventListener('vchat-appearance-changed', onAppearanceChanged)
    offConfigChanged?.()
  })

  return { config, locationEnabled, locationLabel, refresh }
}
