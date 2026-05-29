<template>
  <div class="relative mx-auto h-full w-[80%]">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-0 rounded-lg bg-cover bg-center bg-no-repeat opacity-[0.22] dark:opacity-[0.12]"
      :style="wallpaperStyle"
    />
    <div class="relative z-10 flex h-full flex-col">
    <div
      class="flex h-[85%] flex-col items-center justify-center gap-8 overflow-y-auto bg-slate-100 px-4 py-8 dark:bg-slate-950"
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
        <ProviderSelect :items="providers" v-model="currentProvider"/>
      </div>
    </div>
    <div class="flex h-[15%] items-center border-t border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
      <MessageInput @create="createConversation" :disabled="currentProvider === ''"/>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { db } from '../db'
import { useConversationStore } from '../stores/conversation'
import { useProviderStore } from '../stores/provider'
import ProviderSelect from '../components/ProviderSelect.vue'
import MessageInput from '../components/MessageInput.vue'
import { resolveJimengImageModelId } from '../jimengModels'
import type { MessageCreatePayload } from '../types'
import { useChatWallpaperLayer } from '../useChatWallpaperLayer'
import { persistUploadsFromRenderer } from '../persistUploads'
import { APP_DISPLAY_NAME } from '../appMeta'

const baseUrl = import.meta.env.BASE_URL
const { t } = useI18n()
const { wallpaperStyle } = useChatWallpaperLayer()
const currentProvider = ref('')
const router = useRouter()
const conversationStore = useConversationStore()
const providerStore = useProviderStore()
const providers = computed(() => providerStore.items)
const modelInfo = computed(() => {
  const [ providerId, selectedModel ] = currentProvider.value.split('/')
  return {
    providerId: parseInt(providerId),
    selectedModel
  }
})
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