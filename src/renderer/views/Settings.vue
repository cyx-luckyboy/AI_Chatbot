<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-slate-50 dark:bg-slate-950">
  <div class="mx-auto w-[80%] max-w-3xl p-8 pb-16 text-gray-900 dark:text-slate-100">
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
        <TabsTrigger value="plugins" class="-mb-px px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 data-[state=active]:border-b-2 data-[state=active]:border-green-600 data-[state=active]:text-green-600 dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:text-green-400">
          {{ t('settings.plugins') }}
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
              v-model="currentConfig.baiduAsrAppId"
              type="text"
              autocomplete="off"
              :placeholder="t('settings.baiduAsrAppIdPlaceholder')"
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

        <div class="setting-item flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-8">
          <label class="text-sm font-medium text-gray-700 w-24 shrink-0 pt-2">
            {{ t('settings.webSearch') }}
          </label>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <input
              v-model="currentConfig.tavilyApiKey"
              type="password"
              autocomplete="off"
              :placeholder="t('settings.tavilyApiKeyPlaceholder')"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            <p class="text-xs text-gray-500 leading-snug dark:text-slate-400">{{ t('settings.webSearchHint') }}</p>
          </div>
        </div>

        <div class="setting-item flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-8">
          <label class="text-sm font-medium text-gray-700 w-24 shrink-0 pt-2 dark:text-slate-300">
            {{ t('settings.agentEditor') }}
          </label>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <input
              v-model="currentConfig.agentEditorCommand"
              type="text"
              autocomplete="off"
              :placeholder="t('settings.agentEditorPlaceholder')"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
            />
            <p class="text-xs text-gray-500 leading-snug dark:text-slate-400">{{ t('settings.agentEditorHint') }}</p>
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
            {{ t('settings.desktopPet') }}
          </label>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <input v-model="currentConfig.desktopPetEnabled" type="checkbox" class="rounded border-gray-300" />
              {{ t('settings.desktopPetEnabled') }}
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <input
                v-model="currentConfig.desktopPetAutoSpeak"
                type="checkbox"
                class="rounded border-gray-300"
                :disabled="!currentConfig.desktopPetEnabled"
              />
              {{ t('settings.desktopPetAutoSpeak') }}
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <input
                v-model="currentConfig.nailongTtsEnabled"
                type="checkbox"
                class="rounded border-gray-300"
                :disabled="!currentConfig.desktopPetEnabled"
              />
              {{ t('settings.nailongTtsEnabled') }}
            </label>
            <input
              v-model="currentConfig.nailongTtsBaseUrl"
              type="text"
              class="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-900"
              :disabled="!currentConfig.desktopPetEnabled || !currentConfig.nailongTtsEnabled"
              :placeholder="t('settings.nailongTtsBaseUrl')"
            />
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                plain
                :disabled="!currentConfig.nailongTtsEnabled"
                @click="pingNailongTts"
              >
                {{ t('settings.nailongTtsPing') }}
              </Button>
              <Button type="button" plain @click="refreshTtsLogs">
                {{ t('settings.nailongTtsLogsRefresh') }}
              </Button>
              <Button type="button" plain @click="clearTtsLogs">
                {{ t('settings.nailongTtsLogsClear') }}
              </Button>
              <span v-if="nailongTtsPingMsg" class="text-xs text-gray-500 dark:text-slate-400">{{ nailongTtsPingMsg }}</span>
            </div>
            <p class="text-xs leading-snug text-gray-500 dark:text-slate-400">{{ t('settings.nailongTtsHint') }}</p>
            <div class="rounded-md border border-gray-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60">
              <div class="flex items-center justify-between border-b border-gray-200 px-2 py-1 dark:border-slate-700">
                <span class="text-xs font-medium text-gray-600 dark:text-slate-300">{{ t('settings.nailongTtsLogs') }}</span>
                <span class="text-[10px] text-gray-400">{{ ttsLogs.length }}</span>
              </div>
              <div
                ref="ttsLogBoxRef"
                class="max-h-48 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-relaxed text-gray-700 dark:text-slate-300"
              >
                <p v-if="!ttsLogs.length" class="text-gray-400 dark:text-slate-500">{{ t('settings.nailongTtsLogsEmpty') }}</p>
                <p
                  v-for="row in ttsLogs"
                  :key="row.id"
                  class="whitespace-pre-wrap break-all"
                  :class="{
                    'text-emerald-700 dark:text-emerald-400': row.level === 'ok',
                    'text-amber-700 dark:text-amber-300': row.level === 'warn',
                    'text-red-600 dark:text-red-400': row.level === 'error',
                  }"
                >
                  {{ formatTtsLogLine(row) }}
                </p>
              </div>
            </div>
            <p class="text-xs leading-snug text-gray-500 dark:text-slate-400">{{ t('settings.desktopPetHint') }}</p>
          </div>
        </div>

        <SettingsServicesPanel />

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

      <TabsContent value="models" class="space-y-4 pb-4">
        <AccordionRoot type="single" collapsible class="pb-2">
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

      <TabsContent value="plugins" class="max-w-[640px] space-y-4 pb-4">
        <p class="text-sm text-slate-600 dark:text-slate-400">{{ t('settings.pluginsHint') }}</p>
        <div
          v-for="plugin in pluginList"
          :key="plugin.name"
          class="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900"
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium text-slate-900 dark:text-slate-100">{{ t(plugin.titleKey) }}</div>
            <p class="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{{ t(plugin.descKey) }}</p>
            <p class="mt-1 font-mono text-[10px] text-slate-400">{{ plugin.name }}</p>
          </div>
          <label class="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              class="rounded border-gray-300"
              :checked="isPluginEnabled(plugin.name)"
              @change="togglePlugin(plugin.name, ($event.target as HTMLInputElement).checked)"
            />
            {{ t('settings.pluginEnabled') }}
          </label>
        </div>
      </TabsContent>
    </TabsRoot>
  </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, onUnmounted, watch, ref, computed, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import type { AppConfig, AppTheme } from '../../shared/types'
import { setI18nLanguage } from '../../shared/i18n/index'
import { applyRootFontSize } from '../../shared/rootFontSize'
import { applyAppearance, emitAppearanceChanged } from '../../shared/appearance'
import Button from '../components/Button.vue'
import SettingsServicesPanel from '../components/SettingsServicesPanel.vue'
import { useProviderStore } from '../../domains/chat/stores/provider'
import { providerConfigs, ProviderConfigItem } from '../../shared/config/providerConfig'
import { PROVIDER_PLUGIN_META, isProviderPluginEnabled } from '../../domains/workspace/providerPlugins'
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
  baiduAsrAppId: '',
  tavilyApiKey: '',
  theme: 'light',
  chatBackgroundImagePath: '',
  desktopPetEnabled: false,
  desktopPetAutoSpeak: true,
  nailongTtsEnabled: true,
  nailongTtsBaseUrl: 'http://127.0.0.1:9880',
  agentEditorCommand: 'code',
  enabledProviders: [] as string[],
})

const pluginList = PROVIDER_PLUGIN_META

function isPluginEnabled(name: string): boolean {
  return isProviderPluginEnabled(name, currentConfig as AppConfig)
}

function togglePlugin(name: string, enabled: boolean) {
  const allNames = PROVIDER_PLUGIN_META.map((p) => p.name)
  let next = [...(currentConfig.enabledProviders || [])]
  // 空数组表示「全部启用」；首次关闭某一项时，展开为「除该项外全部启用」
  if (next.length === 0) {
    next = enabled ? [] : allNames.filter((n) => n !== name)
  } else if (enabled) {
    if (!next.includes(name)) next.push(name)
  } else {
    next = next.filter((n) => n !== name)
  }
  // 若又全选，写回空数组表示默认全部启用
  if (next.length === allNames.length) next = []
  currentConfig.enabledProviders = next
}

const chatBgInputRef = ref<HTMLInputElement | null>(null)
const chatBgError = ref('')
const chatBgPreviewDataUrl = ref('')
const nailongTtsPingMsg = ref('')
const ttsLogBoxRef = ref<HTMLElement | null>(null)
type TtsLogRow = {
  id: string
  at: string
  level: 'info' | 'ok' | 'warn' | 'error'
  stage: string
  message: string
  ms?: number
  engine?: 'nailong' | 'system'
  textPreview?: string
}
const ttsLogs = ref<TtsLogRow[]>([])
let unsubTtsLog: (() => void) | null = null

function formatTtsLogLine(row: TtsLogRow): string {
  const time = row.at.includes('T') ? row.at.slice(11, 19) : row.at
  const ms = row.ms != null ? ` ${row.ms}ms` : ''
  const eng = row.engine ? `/${row.engine}` : ''
  const preview = row.textPreview ? ` 「${row.textPreview}」` : ''
  return `${time} [${row.stage}${eng}] ${row.message}${ms}${preview}`
}

async function refreshTtsLogs() {
  try {
    const r = await window.electronAPI.petTtsLogs()
    ttsLogs.value = r.logs || []
    await nextTick()
    const el = ttsLogBoxRef.value
    if (el) el.scrollTop = el.scrollHeight
  } catch {
    /* ignore */
  }
}

async function clearTtsLogs() {
  try {
    await window.electronAPI.petTtsLogsClear()
    ttsLogs.value = []
  } catch {
    /* ignore */
  }
}

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
  if (config.tavilyApiKey == null) currentConfig.tavilyApiKey = ''
  if (config.desktopPetEnabled == null) currentConfig.desktopPetEnabled = false
  if (config.desktopPetAutoSpeak == null) currentConfig.desktopPetAutoSpeak = true
  if (config.nailongTtsEnabled == null) currentConfig.nailongTtsEnabled = true
  if (!config.nailongTtsBaseUrl) currentConfig.nailongTtsBaseUrl = 'http://127.0.0.1:9880'
  if (config.agentEditorCommand == null) currentConfig.agentEditorCommand = 'code'
  if (!Array.isArray(config.enabledProviders)) currentConfig.enabledProviders = []
  await refreshChatBgPreview()
  await refreshTtsLogs()
  unsubTtsLog = window.electronAPI.onPetTtsLog((entry) => {
    ttsLogs.value = [...ttsLogs.value, entry].slice(-80)
    void nextTick(() => {
      const el = ttsLogBoxRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  })
  window.electronAPI.onConfigChanged(() => {
    void (async () => {
      const latest = await window.electronAPI.getConfig()
      currentConfig.desktopPetEnabled = Boolean(latest.desktopPetEnabled)
      currentConfig.desktopPetAutoSpeak = latest.desktopPetAutoSpeak !== false
      currentConfig.nailongTtsEnabled = latest.nailongTtsEnabled !== false
      currentConfig.nailongTtsBaseUrl = latest.nailongTtsBaseUrl || 'http://127.0.0.1:9880'
    })()
  })
})

onUnmounted(() => {
  unsubTtsLog?.()
  unsubTtsLog = null
})

async function pingNailongTts() {
  nailongTtsPingMsg.value = '…'
  try {
    const r = await window.electronAPI.petTtsPing()
    const lat = r.latencyMs != null ? ` ${r.latencyMs}ms` : ''
    nailongTtsPingMsg.value = r.ok
      ? `${t('settings.nailongTtsPingOk')} (${r.baseUrl})${lat}`
      : `${t('settings.nailongTtsPingFail')} (${r.baseUrl})${lat}`
    await refreshTtsLogs()
  } catch {
    nailongTtsPingMsg.value = t('settings.nailongTtsPingFail')
  }
}

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
    baiduAsrAppId: newConfig.baiduAsrAppId ?? '',
    tavilyApiKey: (newConfig.tavilyApiKey ?? '').trim(),
    theme: normalizeTheme(newConfig.theme),
    chatBackgroundImagePath: (newConfig.chatBackgroundImagePath ?? '').trim(),
    imageGenBackend: newConfig.imageGenBackend,
    imageGenModel: newConfig.imageGenModel,
    imageGenJimengModel: newConfig.imageGenJimengModel,
    desktopPetEnabled: Boolean(newConfig.desktopPetEnabled),
    desktopPetAutoSpeak: newConfig.desktopPetAutoSpeak !== false,
    nailongTtsEnabled: newConfig.nailongTtsEnabled !== false,
    nailongTtsBaseUrl: (newConfig.nailongTtsBaseUrl || 'http://127.0.0.1:9880').trim(),
    agentEditorCommand: (newConfig.agentEditorCommand ?? 'code').trim() || 'code',
    enabledProviders: Array.isArray(newConfig.enabledProviders) ? [...newConfig.enabledProviders] : [],
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