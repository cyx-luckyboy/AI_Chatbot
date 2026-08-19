<template>
  <div class="relative mx-auto flex h-full min-h-0 w-[80%] flex-col">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-0 rounded-lg bg-cover bg-center bg-no-repeat opacity-[0.22] dark:opacity-[0.12]"
      :style="wallpaperStyle"
    />
    <div class="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto bg-slate-100 px-4 py-8 dark:bg-slate-950"
    >
      <div class="flex w-full max-w-md shrink-0 flex-col items-center text-center">
        <img
          :src="`${baseUrl}pig.ico`"
          alt=""
          class="h-16 w-16 shrink-0 select-none pointer-events-none"
          draggable="false"
        />
        <h1 class="mt-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">
          {{ APP_DISPLAY_NAME }}
        </h1>
        <p class="mt-2 text-base font-bold text-gray-800 dark:text-slate-200">
          {{ t('common.homeSelectModelHint') }}
        </p>
      </div>
      <div class="w-full max-w-md shrink-0">
        <ProviderSelect :items="providers" v-model="currentProvider" />
      </div>
    </div>
    <div class="relative z-20 shrink-0 border-t border-slate-200 bg-slate-100 py-2 dark:border-slate-800 dark:bg-slate-950">
      <MessageInput
        @create="createConversation"
        @open-meetings="openMeetings"
        :disabled="!modelReady"
      />
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { db } from '../../shared/db'
import { useConversationStore } from '../../domains/chat/stores/conversation'
import { useProviderStore } from '../../domains/chat/stores/provider'
import ProviderSelect from '../components/ProviderSelect.vue'
import MessageInput from '../components/MessageInput.vue'
import { resolveJimengImageModelId } from '../../domains/media/jimengModels'
import type { MessageCreatePayload } from '../../shared/types'
import { useChatWallpaperLayer } from '../../domains/chat/useChatWallpaperLayer'
import { persistUploadsFromRenderer } from '../../domains/chat/persistUploads'
import { APP_DISPLAY_NAME } from '../../shared/appMeta'
import { clearMeetingReturnContext } from '../../domains/meeting/meetingChatPost'
import { pickFirstReadyProvider } from '../../domains/workspace/providerConfigReady'

const HOME_PROVIDER_KEY = 'vchat-home-provider'

const baseUrl = import.meta.env.BASE_URL
const { t } = useI18n()
const { wallpaperStyle } = useChatWallpaperLayer()
const currentProvider = ref('')
const router = useRouter()
const conversationStore = useConversationStore()
const providerStore = useProviderStore()
const providers = computed(() => providerStore.items)
function parseProviderString(value: string): { providerId: number; selectedModel: string } | null {
  const slash = value.indexOf('/')
  if (slash <= 0) return null
  const providerId = parseInt(value.slice(0, slash), 10)
  const selectedModel = value.slice(slash + 1).trim()
  if (!Number.isFinite(providerId) || !selectedModel) return null
  if (!providerStore.getProviderById(providerId)) return null
  return { providerId, selectedModel }
}

const modelReady = computed(() => parseProviderString(currentProvider.value) !== null)

const modelInfo = computed(() => {
  const parsed = parseProviderString(currentProvider.value)
  return parsed ?? { providerId: NaN, selectedModel: '' }
})

async function resolveHomeProvider(): Promise<string> {
  if (providers.value.length === 0) {
    await providerStore.fetchProviders()
  }
  try {
    const stored = localStorage.getItem(HOME_PROVIDER_KEY)?.trim()
    if (stored && parseProviderString(stored)) return stored
  } catch {
    /* ignore */
  }
  const cfg = await window.electronAPI.getConfig()
  return pickFirstReadyProvider(providers.value, cfg)
}

onMounted(async () => {
  const initial = await resolveHomeProvider()
  if (initial && parseProviderString(initial)) {
    currentProvider.value = initial
  }
})

watch(currentProvider, (value) => {
  if (!parseProviderString(value)) return
  try {
    localStorage.setItem(HOME_PROVIDER_KEY, value)
  } catch {
    /* ignore */
  }
})

async function openMeetings() {
  if (!modelReady.value) return
  clearMeetingReturnContext()
  router.push({
    path: '/meetings',
    query: { provider: currentProvider.value },
  })
}

const createConversation = async (payload: MessageCreatePayload) => {
  const text = payload.text.trim()
  if (payload.generateImageWithModel) {
    if (!text) return
    const { providerId, selectedModel } = modelInfo.value
    const currentDate = new Date().toISOString()
    const conversationId = await conversationStore.createConversation({
      title: text.slice(0, 48) || t('common.imageGenTitle'),
      providerId,
      selectedModel,
      createdAt: currentDate,
      updatedAt: currentDate,
    })
    await db.messages.add({
      content: text,
      conversationId,
      createdAt: currentDate,
      updatedAt: currentDate,
      type: 'question',
      imageGenSize: payload.generateImageWithModel.size,
      imageGenModel: resolveJimengImageModelId(payload.generateImageWithModel.model),
    })
    const answerId = await db.messages.add({
      content: '',
      conversationId,
      createdAt: currentDate,
      updatedAt: currentDate,
      type: 'answer',
      status: 'loading',
    })
    conversationStore.selectedId = conversationId
    router.push(`/conversation/${conversationId}?imageGenAnswer=${answerId}`)
    return
  }
  if (!text && payload.uploads.length === 0) return
  const attachments = await persistUploadsFromRenderer(payload.uploads)
  if (!text && attachments.length === 0) return
  const firstImage = attachments.find((a) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name))
  const { providerId, selectedModel } = modelInfo.value
  const currentDate = new Date().toISOString()
  const conversationId = await conversationStore.createConversation({
    title:
      text ||
      (payload.webSearchWithModel
        ? t('common.webSearchTitle')
        : payload.pptGenerateWithModel
        ? t('common.pptGenTitle')
        : payload.generateImageWithModel
          ? t('common.imageGenTitle')
          : firstImage
          ? t('common.imageOnlyTitle')
          : attachments.length
            ? t('common.attachmentOnlyTitle')
            : t('common.imageOnlyTitle')),
    providerId,
    selectedModel,
    createdAt: currentDate,
    updatedAt: currentDate
  })
  const newMessageId = await db.messages.add({
    content: text,
    conversationId,
    createdAt: currentDate,
    updatedAt: currentDate,
    type: 'question',
    ...(firstImage && { imagePath: firstImage.path }),
    ...(attachments.length > 0 && { attachments }),
    ...(payload.translateWithModel && { translateTarget: payload.translateWithModel.target }),
    ...(payload.pptGenerateWithModel && {
      pptGenLength: payload.pptGenerateWithModel.length,
      pptGenQuality: payload.pptGenerateWithModel.quality ?? 'fast',
      pptGenScenario: payload.pptGenerateWithModel.scenario ?? 'thesis',
    }),
    ...(payload.webSearchWithModel && { webSearch: true }),
  })
  conversationStore.selectedId = conversationId
  router.push(`/conversation/${conversationId}?init=${newMessageId}`)
}
</script>