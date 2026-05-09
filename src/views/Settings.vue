<template>
  <div class="mx-auto w-[80%] p-8 text-gray-900 dark:text-slate-100">
    <h1 class="mb-8 text-2xl font-bold">{{ t('settings.title') }}</h1>
    
    <TabsRoot v-model="activeTab" class="w-full">
      <TabsList class="mb-6 flex border-b border-gray-200 dark:border-slate-700">
        <TabsTrigger value="general" class="-mb-px px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 data-[state=active]:border-b-2 data-[state=active]:border-green-600 data-[state=active]:text-green-600 dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:text-green-400">
          {{ t('settings.general') }}
        </TabsTrigger>
        <TabsTrigger value="appearance" class="-mb-px px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 data-[state=active]:border-b-2 data-[state=active]:border-green-600 data-[state=active]:text-green-600 dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:text-green-400">
          {{ t('settings.appearance') }}
        </TabsTrigger>
        <TabsTrigger value="models" class="-mb-px px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 data-[state=active]:border-b-2 data-[state=active]:border-green-600 data-[state=active]:text-green-600 dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:text-green-400">
          {{ t('settings.models') }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="max-w-[500px] space-y-6">
        <!-- Language Setting -->
        <div class="setting-item flex items-center gap-8">
          <label class="text-sm font-medium text-gray-700 w-24">
            {{ t('settings.language') }}
          </label>
          <SelectRoot v-model="currentConfig.language" class="w-[160px]">
            <SelectTrigger class="inline-flex items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              <SelectValue :placeholder="t('settings.selectLanguage')" />
              <SelectIcon>
                <Icon icon="radix-icons:chevron-down" />
              </SelectIcon>
            </SelectTrigger>
            <SelectPortal>
              <SelectContent class="rounded-md border border-gray-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900">
                <SelectViewport class="p-2">
                  <SelectGroup>
                    <SelectItem value="zh" class="relative flex items-center px-8 py-2 text-sm text-gray-700 rounded-md cursor-default hover:bg-gray-100">
                      <SelectItemText>{{ t('common.chinese') }}</SelectItemText>
                      <SelectItemIndicator class="absolute left-2 inline-flex items-center">
                        <Icon icon="radix-icons:check" />
                      </SelectItemIndicator>
                    </SelectItem>
                    <SelectItem value="en" class="relative flex items-center px-8 py-2 text-sm text-gray-700 rounded-md cursor-default hover:bg-gray-100">
                      <SelectItemText>{{ t('common.english') }}</SelectItemText>
                      <SelectItemIndicator class="absolute left-2 inline-flex items-center">
                        <Icon icon="radix-icons:check" />
                      </SelectItemIndicator>
                    </SelectItem>
                  </SelectGroup>
                </SelectViewport>
              </SelectContent>
            </SelectPortal>
          </SelectRoot>
        </div>

        <!-- Font Size Setting -->
        <div class="setting-item flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-8">
          <label class="text-sm font-medium text-gray-700 w-24 shrink-0 pt-2">
            {{ t('settings.baiduSpeech') }}
          </label>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <input
              v-model="currentConfig.baiduAsrApiKey"
              type="password"
              autocomplete="off"
              :placeholder="t('settings.baiduAsrApiKeyPlaceholder')"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 font-mono text-sm"
            />
            <input
              v-model="currentConfig.baiduAsrSecretKey"
              type="password"
              autocomplete="off"
              :placeholder="t('settings.baiduAsrSecretKeyPlaceholder')"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 font-mono text-sm"
            />
            <p class="text-xs text-gray-500 leading-snug">{{ t('settings.baiduSpeechHint') }}</p>
          </div>
        </div>

        <div class="setting-item flex items-center gap-8">
          <label class="text-sm font-medium text-gray-700 w-24">
            {{ t('settings.fontSize') }}
          </label>
          <NumberFieldRoot v-model="currentConfig.fontSize" class="inline-flex w-[100px]">
            <NumberFieldDecrement class="px-2 border border-r-0 border-gray-300 rounded-l-md hover:bg-gray-100 focus:outline-none">
              <Icon icon="radix-icons:minus" />
            </NumberFieldDecrement>
            <NumberFieldInput 
              class="w-10 px-2 py-2 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-green-500 text-center"
              :min="12"
              :max="20"
            />
            <NumberFieldIncrement class="px-2 border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-100 focus:outline-none">
              <Icon icon="radix-icons:plus" />
            </NumberFieldIncrement>
          </NumberFieldRoot>
        </div>
      </TabsContent>

      <TabsContent value="appearance" class="max-w-[560px] space-y-6">
        <div class="setting-item flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <label class="w-28 shrink-0 text-sm font-medium text-gray-700 dark:text-slate-300">
            {{ t('settings.theme') }}
          </label>
          <SelectRoot v-model="currentConfig.theme" class="w-[200px]">
            <SelectTrigger class="inline-flex items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              <SelectValue :placeholder="t('settings.theme')" />
              <SelectIcon>
                <Icon icon="radix-icons:chevron-down" />
              </SelectIcon>
            </SelectTrigger>
            <SelectPortal>
              <SelectContent class="rounded-md border border-gray-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900">
                <SelectViewport class="p-2">
                  <SelectGroup>
                    <SelectItem value="light" class="relative flex cursor-default items-center rounded-md px-8 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">
                      <SelectItemText>{{ t('settings.themeLight') }}</SelectItemText>
                      <SelectItemIndicator class="absolute left-2 inline-flex items-center">
                        <Icon icon="radix-icons:check" />
                      </SelectItemIndicator>
                    </SelectItem>
                    <SelectItem value="dark" class="relative flex cursor-default items-center rounded-md px-8 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">
                      <SelectItemText>{{ t('settings.themeDark') }}</SelectItemText>
                      <SelectItemIndicator class="absolute left-2 inline-flex items-center">
                        <Icon icon="radix-icons:check" />
                      </SelectItemIndicator>
                    </SelectItem>
                  </SelectGroup>
                </SelectViewport>
              </SelectContent>
            </SelectPortal>
          </SelectRoot>
        </div>

        <div class="setting-item flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
          <label class="w-28 shrink-0 pt-1 text-sm font-medium text-gray-700 dark:text-slate-300">
            {{ t('settings.chatBackground') }}
          </label>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <input
              ref="chatBgInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onChatBackgroundFile"
            />
            <div class="flex flex-wrap items-center gap-2">
              <Button type="button" icon-name="radix-icons:image" @click="openChatBgPicker">
                {{ t('settings.chooseChatBackground') }}
              </Button>
              <Button type="button" plain icon-name="radix-icons:cross-2" :disabled="!currentConfig.chatBackgroundImagePath" @click="clearChatBackground">
                {{ t('settings.clearChatBackground') }}
              </Button>
            </div>
            <img
              v-if="chatBgPreviewDataUrl"
              :src="chatBgPreviewDataUrl"
              alt=""
              class="h-36 w-full max-w-md rounded-lg border border-gray-200 object-cover dark:border-slate-600"
            />
            <p class="text-xs leading-snug text-gray-500 dark:text-slate-400">{{ t('settings.chatBackgroundHint') }}</p>
            <p v-if="chatBgError" class="text-xs text-red-600 dark:text-red-400">{{ chatBgError }}</p>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="models" class="space-y-4">
        <AccordionRoot type="single" collapsible>
          <AccordionItem v-for="provider in providers" :key="provider.id" :value="provider.name" class="mb-2 rounded-lg border border-gray-200 dark:border-slate-600">
            <AccordionTrigger class="flex w-full items-center justify-between p-4 text-left dark:hover:bg-slate-900/50">
              <div class="flex items-center gap-2">
                <img :src="provider.avatar" :alt="provider.name" class="w-6 h-6 rounded">
                <span class="font-medium">{{ provider.title }}</span>
              </div>
              <Icon icon="radix-icons:chevron-down" class="transform transition-transform duration-200 ease-in-out data-[state=open]:rotate-180" />
            </AccordionTrigger>
            <AccordionContent class="p-4 pt-0">
              <div class="space-y-4">
                <div v-for="config in getProviderConfig(provider.name)" :key="config.key" class="flex items-center gap-4">
                  <label class="w-24 text-sm font-medium text-gray-700 dark:text-slate-300">{{ config.label }}</label>
                  <input 
                    :type="config.type"
                    :placeholder="config.placeholder"
                    :required="config.required"
                    :value="config.value"
                    @input="(e) => updateProviderConfig(provider.name, config.key, (e.target as HTMLInputElement).value)"
                    class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
      </TabsContent>
    </TabsRoot>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import type { AppConfig, AppTheme } from '../types'
import { setI18nLanguage } from '../i18n'
import { applyRootFontSize } from '../rootFontSize'
import { applyAppearance, emitAppearanceChanged } from '../appearance'
import Button from '../components/Button.vue'
import { useProviderStore } from '../stores/provider'
import { providerConfigs, ProviderConfigItem } from '../config/providerConfig'
import {
  SelectContent,
  SelectGroup,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
  NumberFieldRoot,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
  AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from 'radix-vue'

const { t } = useI18n()
const activeTab = ref('general')
const providerStore = useProviderStore()
const providers = computed(() => providerStore.items)

const currentConfig = reactive<AppConfig>({
  language: 'zh',
  fontSize: 14,
  providerConfigs: {},
  baiduAsrApiKey: '',
  baiduAsrSecretKey: '',
  theme: 'light',
  chatBackgroundImagePath: '',
})

const chatBgInputRef = ref<HTMLInputElement | null>(null)
const chatBgError = ref('')
const chatBgPreviewDataUrl = ref('')

async function refreshChatBgPreview() {
  const p = (currentConfig.chatBackgroundImagePath ?? '').trim()
  chatBgPreviewDataUrl.value = ''
  if (!p) return
  if (p.startsWith('data:')) {
    chatBgPreviewDataUrl.value = p
    return
  }
  try {
    chatBgPreviewDataUrl.value = await window.electronAPI.readLocalImageAsDataUrl(p)
  } catch {
    chatBgPreviewDataUrl.value = ''
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function openChatBgPicker() {
  chatBgError.value = ''
  chatBgInputRef.value?.click()
}

async function onChatBackgroundFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    chatBgError.value = t('settings.chatBgNotImage')
    return
  }
  const max = 12 * 1024 * 1024
  if (file.size > max) {
    chatBgError.value = t('settings.chatBgTooLarge')
    return
  }
  chatBgError.value = ''
  try {
    const dataUrl = await readFileAsDataUrl(file)
    const path = await window.electronAPI.saveChatBackground(dataUrl)
    currentConfig.chatBackgroundImagePath = path
  } catch {
    chatBgError.value = t('settings.chatBgSaveFailed')
  }
}

function clearChatBackground() {
  chatBgError.value = ''
  currentConfig.chatBackgroundImagePath = ''
}

onMounted(async () => {
  const config = await window.electronAPI.getConfig()
  Object.assign(currentConfig, config)
  if (!config.theme) currentConfig.theme = 'light'
  if (config.chatBackgroundImagePath == null) currentConfig.chatBackgroundImagePath = ''
  await refreshChatBgPreview()
})

function normalizeTheme(v: unknown): AppTheme {
  return v === 'dark' ? 'dark' : 'light'
}

// 监听配置变化并自动保存
watch(currentConfig, async (newConfig) => {
  const configToSave = {
    language: newConfig.language,
    fontSize: newConfig.fontSize,
    providerConfigs: JSON.parse(JSON.stringify(newConfig.providerConfigs)),
    baiduAsrApiKey: newConfig.baiduAsrApiKey ?? '',
    baiduAsrSecretKey: newConfig.baiduAsrSecretKey ?? '',
    theme: normalizeTheme(newConfig.theme),
    chatBackgroundImagePath: (newConfig.chatBackgroundImagePath ?? '').trim(),
  }
  const saved = await window.electronAPI.updateConfig(configToSave)
  setI18nLanguage(saved.language)
  applyRootFontSize(saved.fontSize)
  applyAppearance(saved)
  emitAppearanceChanged()
  await refreshChatBgPreview()
}, { deep: true })

// 获取provider对应的配置项
const getProviderConfig = (providerName: string): ProviderConfigItem[] => {
  const configs = providerConfigs[providerName] || []
  // 确保配置值被初始化
  if (!currentConfig.providerConfigs[providerName]) {
    currentConfig.providerConfigs[providerName] = {}
  }
  return configs.map(config => ({
    ...config,
    value: currentConfig.providerConfigs[providerName][config.key] || config.value
  }))
}

// 更新provider配置值
const updateProviderConfig = (providerName: string, key: string, value: string) => {
  if (!currentConfig.providerConfigs[providerName]) {
    currentConfig.providerConfigs[providerName] = {}
  }
  currentConfig.providerConfigs[providerName][key] = value
}
</script>