<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.22] dark:opacity-[0.12]"
      :style="wallpaperStyle"
    />
    <div
      class="relative z-10 flex min-h-0 flex-1 flex-col"
    >
    <div
      class="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-200/90 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
      v-if="conversationDisplay"
    >
      <h3 class="font-semibold text-gray-900 dark:text-slate-100">{{ conversationDisplay.title }}</h3>
      <span class="text-sm text-gray-500 dark:text-slate-400">{{ formatDateTime(conversationDisplay.updatedAt) }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto bg-transparent pt-2">
      <div class="mx-auto w-[80%]">
        <MessageList
          :key="conversationId"
          :messages="filteredMessages"
          :regenerate-disabled="isReplyInProgress"
          ref="messageListRef"
          @regenerate="onRegenerateAnswer"
          @quote="onQuoteFromMessage"
        />
      </div>
    </div>
    <div class="shrink-0 flex items-center border-t border-slate-200 bg-slate-100 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div class="mx-auto w-[80%]">
        <MessageInput
          ref="messageInputRef"
          @create="sendNewMessage"
          v-model="inputValue"
          :disabled="isReplyInProgress"
        />
      </div>
    </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MessageInput from '../components/MessageInput.vue'
import MessageList from '../components/MessageList.vue'
import { useChatWallpaperLayer } from '../useChatWallpaperLayer'
import { useConversationStore } from '../stores/conversation'
import { isPendingImageGenerationAnswer, useMessageStore } from '../stores/message'
import { useProviderStore } from '../stores/provider'
import {
  MessageProps,
  MessageListInstance,
  MessageStatus,
  MessageCreatePayload,
  ImageGenSizeId,
  JimengImageModelId,
} from '../types'
import { DEFAULT_JIMENG_IMAGE_MODEL, resolveJimengImageModelId } from '../jimengModels'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../formatDateTime'
import { persistUploadsFromRenderer } from '../persistUploads'
import { serializeCreateChatProps } from '../ipcSerialize'
import { buildTranslatePromptForModel } from '../translatePrompt'
import { buildPptxForAnswerMessage } from '../pptExportRenderer'
import {
  buildChatMessagesForConversation,
  type PptChatPromptMode,
} from '../pptChatMessages'
import { pptScenarioUsesTwoStage } from '../pptScenarioPrompts'
import { looksLikeImageGenerationPrompt } from '../imageGenPromptDetect'
import { db } from '../db'
import type { ConversationProps } from '../types'
const { wallpaperStyle } = useChatWallpaperLayer()

const inputValue = ref('')
const messageInputRef = ref<{ focusInput: () => void } | null>(null)
let currentMessageListHeight = 0
const messageListRef = ref<MessageListInstance>()
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const messageStore = useMessageStore()
const provdierStore = useProviderStore()
const filteredMessages = computed(() =>
  messageStore.items.filter((m) => m.conversationId === conversationId.value),
)

function conversationHasImageQuestion(): boolean {
  const cid = conversationId.value
  return messageStore.items.some((m) => {
    if (m.conversationId !== cid || m.type !== 'question') return false
    if (m.imagePath) return true
    if (m.attachments?.some((a) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name))) return true
    if (m.attachments?.some((a) => a.path.startsWith('data:image/'))) return true
    return false
  })
}

function isTrivialAssistantReply(text: string): boolean {
  const s = text.trim()
  if (s.length === 0) return true
  return s.length <= 8 && /^[.。…·\s]+$/.test(s)
}
/** Pinia getter 若返回函数并在模板里调用，部分情况下不会订阅 items，首轮结束后 disabled 仍为 true，无法二次发送 */
const isReplyInProgress = computed(() => {
  const cid = conversationId.value
  return messageStore.items.some(
    (item) =>
      item.conversationId === cid &&
      (item.status === 'loading' || item.status === 'streaming'),
  )
})
const pptChatOverride = ref<{ questionId: number; mode: PptChatPromptMode } | null>(null)
const pptPipelinePending = ref<{
  answerId: number
  questionId: number
  phase: 'outline' | 'fill'
} | null>(null)

const sendedMessages = computed(() =>
  buildChatMessagesForConversation(
    filteredMessages.value,
    locale.value === 'zh' ? 'zh' : 'en',
    pptChatOverride.value ?? undefined,
  ),
)
let conversationId = ref(parseInt(route.params.id as string))
const initMessageId = parseInt(route.query.init as string)
/** store 可能被并发 fetch 短暂清空时，从 IndexedDB 兜底，避免标题缺失且 creatingInitialMessage 跳过 startChat */
const conversationDisplay = ref<ConversationProps | null>(null)
watch(
  () => [conversationId.value, conversationStore.items] as const,
  async ([cid]) => {
    let row = conversationStore.getConversationById(cid)
    if (!row && Number.isFinite(cid)) {
      row = (await db.conversations.get(cid)) ?? null
    }
    conversationDisplay.value = row
  },
  { immediate: true, deep: true },
)
const lastQuestion = computed(() => messageStore.getLastQuestion(conversationId.value))
async function tryStartPendingImageGeneration(answerId: number): Promise<boolean> {
  const answer = messageStore.items.find((m) => m.id === answerId)
  const q = findQuestionForAnswer(answerId)
  if (!q?.imageGenSize || !q.content.trim()) return false
  if (answer?.imagePath) return false
  const sorted = [...messageStore.items]
    .filter((m) => m.conversationId === conversationId.value)
    .sort((a, b) => a.id - b.id)
  if (answer && !isPendingImageGenerationAnswer(sorted, answer)) return false
  if (answer && answer.status !== 'loading') {
    await messageStore.updateMessage(answerId, {
      status: 'loading',
      content: '',
      updatedAt: new Date().toISOString(),
    })
  }
  void runImageGeneration(
    answerId,
    q.content.trim(),
    q.imageGenSize,
    q.imageGenModel,
  )
  return true
}

async function resumePendingImageGenerations() {
  const sorted = [...messageStore.items]
    .filter((m) => m.conversationId === conversationId.value)
    .sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.type !== 'answer') continue
    if (!isPendingImageGenerationAnswer(sorted, m)) continue
    await tryStartPendingImageGeneration(m.id)
    return
  }
}

async function runImageGeneration(
  answerId: number,
  prompt: string,
  size: ImageGenSizeId,
  model?: JimengImageModelId,
) {
  try {
    const result = await window.electronAPI.generateImage({
      prompt,
      size,
      model: resolveJimengImageModelId(model),
    })
    if (result.ok) {
      await messageStore.updateMessage(answerId, {
        content: t('common.imageGenSuccess'),
        imagePath: result.path,
        status: 'finished',
        updatedAt: new Date().toISOString(),
      })
    } else {
      await messageStore.updateMessage(answerId, {
        content: result.error,
        status: 'error',
        updatedAt: new Date().toISOString(),
      })
    }
  } catch (e) {
    await messageStore.updateMessage(answerId, {
      content: e instanceof Error ? e.message : String(e),
      status: 'error',
      updatedAt: new Date().toISOString(),
    })
  }
  await messageScrollToBottom()
}

const sendNewMessage = async (payload: MessageCreatePayload) => {
  const text = payload.text.trim()
  if (payload.generateImageWithModel) {
    if (!text) return
    const date = new Date().toISOString()
    await messageStore.createMessage({
      content: text,
      conversationId: conversationId.value,
      createdAt: date,
      updatedAt: date,
      type: 'question',
      imageGenSize: payload.generateImageWithModel.size,
      imageGenModel: resolveJimengImageModelId(payload.generateImageWithModel.model),
    })
    const answerId = await messageStore.createMessage({
      content: '',
      conversationId: conversationId.value,
      createdAt: date,
      updatedAt: date,
      type: 'answer',
      status: 'loading',
    })
    inputValue.value = ''
    void runImageGeneration(
      answerId,
      text,
      payload.generateImageWithModel.size,
      payload.generateImageWithModel.model,
    )
    return
  }
  if (!text && payload.uploads.length === 0) return
  const attachments = await persistUploadsFromRenderer(payload.uploads)
  if (!text && attachments.length === 0) return
  const firstImage = attachments.find((a) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name))
  const date = new Date().toISOString()
  const pptScenario = payload.pptGenerateWithModel?.scenario ?? 'general'
  const questionId = await messageStore.createMessage({
    content: text,
    conversationId: conversationId.value,
    createdAt: date,
    updatedAt: date,
    type: 'question',
    ...(firstImage && { imagePath: firstImage.path }),
    ...(attachments.length > 0 && { attachments }),
    ...(payload.translateWithModel && { translateTarget: payload.translateWithModel.target }),
    ...(payload.pptGenerateWithModel && {
      pptGenLength: payload.pptGenerateWithModel.length,
      pptGenQuality: payload.pptGenerateWithModel.quality ?? 'fast',
      pptGenScenario: pptScenario,
    }),
    ...(payload.webSearchWithModel && { webSearch: true }),
  })
  if (payload.pptGenerateWithModel && pptScenarioUsesTwoStage(pptScenario)) {
    pptChatOverride.value = { questionId, mode: { kind: 'outline' } }
  } else {
    pptChatOverride.value = null
    pptPipelinePending.value = null
  }
  inputValue.value = ''
  const answerId = await creatingInitialMessage()
  if (payload.pptGenerateWithModel && pptScenarioUsesTwoStage(pptScenario)) {
    pptPipelinePending.value = { answerId, questionId, phase: 'outline' }
  }
}
const messageScrollToBottom = async () => {
	await nextTick()
  if (messageListRef.value) {
    messageListRef.value.ref.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }
}
function onQuoteFromMessage(quotedMarkdown: string) {
  const q = quotedMarkdown.trim()
  if (!q) return
  const cur = inputValue.value.trim()
  inputValue.value = cur ? `${cur}\n\n${q}\n\n` : `${q}\n\n`
  void nextTick(() => messageInputRef.value?.focusInput())
}

const onRegenerateAnswer = async (answerMessageId: number) => {
  if (isReplyInProgress.value) return
  const msg = messageStore.items.find((m) => m.id === answerMessageId)
  if (!msg || msg.type !== 'answer' || msg.conversationId !== conversationId.value) return
  const q = findQuestionForAnswer(answerMessageId)
  streamBuffers.clear()
  await messageStore.deleteMessageAndFollowing(conversationId.value, answerMessageId)
  if (
    q?.content.trim() &&
    (q.imageGenSize || (!q.imageGenSize && looksLikeImageGenerationPrompt(q.content)))
  ) {
    const date = new Date().toISOString()
    const answerId = await messageStore.createMessage({
      content: '',
      conversationId: conversationId.value,
      createdAt: date,
      updatedAt: date,
      type: 'answer',
      status: 'loading',
    })
    void runImageGeneration(
      answerId,
      q.content.trim(),
      q.imageGenSize ?? '1024x1024',
      q.imageGenModel ?? DEFAULT_JIMENG_IMAGE_MODEL,
    )
    return
  }
  if (q?.pptGenLength) {
    const scenario = q.pptGenScenario ?? 'general'
    if (pptScenarioUsesTwoStage(scenario)) {
      pptChatOverride.value = { questionId: q.id, mode: { kind: 'outline' } }
    } else {
      pptChatOverride.value = null
      pptPipelinePending.value = null
    }
  }
  const answerId = await creatingInitialMessage({ webSearch: Boolean(q?.webSearch) })
  if (q?.pptGenLength && pptScenarioUsesTwoStage(q.pptGenScenario ?? 'general')) {
    pptPipelinePending.value = { answerId, questionId: q.id, phase: 'outline' }
  }
}

function findQuestionForAnswer(answerId: number): MessageProps | undefined {
  const sorted = [...messageStore.items]
    .filter((m) => m.conversationId === conversationId.value)
    .sort((a, b) => a.id - b.id)
  const idx = sorted.findIndex((m) => m.id === answerId)
  if (idx <= 0) return undefined
  for (let i = idx - 1; i >= 0; i--) {
    if (sorted[i].type === 'question') return sorted[i]
    if (sorted[i].type === 'answer') break
  }
  return undefined
}

async function tryBuildPptxExport(answerId: number, markdown: string) {
  const q = findQuestionForAnswer(answerId)
  if (!q?.pptGenLength || !markdown.trim()) return
  await buildPptxForAnswerMessage({
    answerId,
    markdown,
    question: q,
    messageStore,
    t,
  })
}

async function startPptFillStage(answerId: number, question: MessageProps, outline: string) {
  pptChatOverride.value = { questionId: question.id, mode: { kind: 'fill', outline } }
  streamBuffers.delete(answerId)
  await messageStore.updateMessage(answerId, {
    status: 'loading',
    updatedAt: new Date().toISOString(),
  })
  const conv =
    conversationStore.getConversationById(conversationId.value) ??
    (await db.conversations.get(conversationId.value))
  if (!conv) return
  const provider = provdierStore.getProviderById(conv.providerId)
  if (!provider) return
  await window.electronAPI.startChat(
    serializeCreateChatProps({
      messageId: answerId,
      providerName: provider.name,
      selectedModel: conv.selectedModel,
      messages: buildChatMessagesForConversation(
        messageStore.items.filter((m) => m.conversationId === conversationId.value),
        locale.value === 'zh' ? 'zh' : 'en',
        pptChatOverride.value ?? undefined,
      ),
    }),
  )
}

function resolveWebSearchForChat(opts?: { forAnswerId?: number; webSearch?: boolean }): boolean {
  if (opts?.webSearch !== undefined) return opts.webSearch
  const q =
    opts?.forAnswerId != null
      ? findQuestionForAnswer(opts.forAnswerId)
      : messageStore.getLastQuestion(conversationId.value)
  return Boolean(q?.webSearch)
}

const creatingInitialMessage = async (opts?: {
  forAnswerId?: number
  webSearch?: boolean
}): Promise<number> => {
  const createdData: Omit<MessageProps, 'id'> = {
    content: '',
    conversationId: conversationId.value,
    type: 'answer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'loading',
  }
  const newMessageId = await messageStore.createMessage(createdData)
  await messageScrollToBottom()
  const conv =
    conversationStore.getConversationById(conversationId.value) ??
    (await db.conversations.get(conversationId.value))
  if (conv) {
    const provider = provdierStore.getProviderById(conv.providerId)
    if (provider) {
      await window.electronAPI.startChat(
        serializeCreateChatProps({
          messageId: newMessageId,
          providerName: provider.name,
          selectedModel: conv.selectedModel,
          messages: sendedMessages.value,
          webSearch: resolveWebSearchForChat(opts),
          uiLang: locale.value === 'zh' ? 'zh' : 'en',
        }),
      )
    }
  }
  return newMessageId
}

/** 按 messageId 累加流式片段，避免多会话/多次进入同页时串台 */
const streamBuffers = new Map<number, string>()
/** 串行处理 update-message，避免并发 await 读到旧的 currentMsg.status，把已是 finished 的回复写回 streaming */
let streamApplyChain: Promise<void> = Promise.resolve()
let removeUpdateListener: (() => void) | undefined

watch(() => route.params.id, async (newId: string) => {
  streamBuffers.clear()
  pptChatOverride.value = null
  pptPipelinePending.value = null
  conversationId.value = parseInt(newId)
  await messageStore.fetchMessagesByConversation(conversationId.value)
  await messageScrollToBottom()
  currentMessageListHeight = 0
})

onMounted(async () => {
  await messageStore.fetchMessagesByConversation(conversationId.value)
  await messageScrollToBottom()
  if (initMessageId) {
    const initQ = messageStore.items.find((m) => m.id === initMessageId)
    const initScenario = initQ?.pptGenScenario ?? 'general'
    if (initQ?.pptGenLength && pptScenarioUsesTwoStage(initScenario)) {
      pptChatOverride.value = { questionId: initQ.id, mode: { kind: 'outline' } }
    }
    const answerId = await creatingInitialMessage()
    if (initQ?.pptGenLength && pptScenarioUsesTwoStage(initScenario)) {
      pptPipelinePending.value = { answerId, questionId: initQ.id, phase: 'outline' }
    }
  }
  const imageGenAnswerRaw = route.query.imageGenAnswer
  if (imageGenAnswerRaw) {
    const answerId = parseInt(String(imageGenAnswerRaw), 10)
    if (Number.isFinite(answerId)) {
      await tryStartPendingImageGeneration(answerId)
    }
    const nextQuery = { ...route.query }
    delete nextQuery.imageGenAnswer
    await router.replace({ path: route.path, query: nextQuery })
  } else {
    await resumePendingImageGenerations()
  }
  const checkAndScrollToBottom = async () => {
    if (messageListRef.value) {
      const newHeight = messageListRef.value.ref.clientHeight
      if (newHeight > currentMessageListHeight) {
        currentMessageListHeight = newHeight
        await messageScrollToBottom()
      }
    }
  }
  removeUpdateListener = window.electronAPI.onUpdateMessage((streamData) => {
    streamApplyChain = streamApplyChain.then(async () => {
      try {
      const { messageId, data } = streamData
      // buffer 在 is_end 后会删掉；若再来一包空的结束帧，应用库里已有正文拼接，避免把回复清空
      const existing =
        messageStore.items.find((m) => m.id === messageId)?.content ?? ''
      if (data.replace) streamBuffers.delete(messageId)
      const buf = streamBuffers.get(messageId)
      const prev = buf !== undefined ? buf : existing
      const next = data.replace ? (data.result ?? '') : prev + (data.result ?? '')
      const streamMsg = messageStore.items.find((m) => m.id === messageId)
      let displayContent = next
      if (
        data.is_end &&
        conversationHasImageQuestion() &&
        (isTrivialAssistantReply(next) || !next.trim())
      ) {
        displayContent = t('common.visionImageReplyUnusable')
      } else if (data.is_end && !next.trim() && streamMsg?.type === 'answer') {
        const q = findQuestionForAnswer(messageId)
        if (q?.content && looksLikeImageGenerationPrompt(q.content) && !q.imageGenSize) {
          displayContent = t('common.imageGenChatModelHint')
        }
      }
      if (!data.is_end) {
        streamBuffers.set(messageId, next)
      } else {
        streamBuffers.delete(messageId)
      }
      const getMessageStatus = (d: { is_error?: boolean; is_end?: boolean }): MessageStatus => {
        if (d.is_error) return 'error'
        if (d.is_end) return 'finished'
        return 'streaming'
      }
      const computedStatus = getMessageStatus(data)
      const currentMsg = messageStore.items.find((m) => m.id === messageId)
      /** 部分 OpenAI 兼容接口在正文结束后仍会推送 choices 为空的尾随帧，is_end 为 false，会把已是 finished 的回复错误改回 streaming */
      let status: MessageStatus = computedStatus
      if (
        (currentMsg?.status === 'finished' || currentMsg?.status === 'error') &&
        computedStatus === 'streaming'
      ) {
        status = currentMsg.status
      }
      await messageStore.updateMessage(messageId, {
        content: displayContent,
        status,
        updatedAt: new Date().toISOString(),
        ...(data.webSearchMeta && { webSearchMeta: data.webSearchMeta }),
      })
      if (status === 'finished' && data.is_end && currentMsg?.type === 'answer') {
        const q = findQuestionForAnswer(messageId)
        const scenario = q?.pptGenScenario ?? 'general'
        if (q?.pptGenLength && pptScenarioUsesTwoStage(scenario) && displayContent.trim()) {
          const pl = pptPipelinePending.value
          if (pl && pl.answerId === messageId && pl.phase === 'outline') {
            pptPipelinePending.value = { ...pl, phase: 'fill' }
            await messageStore.updateMessage(messageId, {
              content: `${displayContent.trim()}\n\n---\n\n${t('common.pptStage2Hint')}`,
              status: 'loading',
              updatedAt: new Date().toISOString(),
            })
            void startPptFillStage(messageId, q, displayContent.trim())
            await nextTick()
            await checkAndScrollToBottom()
            return
          }
          if (pl && pl.phase === 'fill') {
            pptChatOverride.value = null
            pptPipelinePending.value = null
          }
        }
        void tryBuildPptxExport(messageId, displayContent)
      }
      await nextTick()
      await checkAndScrollToBottom()
      } catch (e) {
        console.error('update-message handler', e)
      }
    })
  })
})

onUnmounted(() => {
  removeUpdateListener?.()
})
</script>