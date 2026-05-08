<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
    <div
      class="shrink-0 border-b border-gray-300 bg-gray-200 px-3 py-2 flex items-center justify-between"
      v-if="conversationDisplay"
    >
      <h3 class="font-semibold text-gray-900">{{ conversationDisplay.title }}</h3>
      <span class="text-sm text-gray-500">{{ formatDateTime(conversationDisplay.updatedAt) }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto pt-2">
      <div class="mx-auto w-[80%]">
        <MessageList :messages="filteredMessages" ref="messageListRef" />
      </div>
    </div>
    <div class="shrink-0 flex items-center py-2">
      <div class="mx-auto w-[80%]">
        <MessageInput
          @create="sendNewMessage"
          v-model="inputValue"
          :disabled="isReplyInProgress"
        />
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import MessageInput from '../components/MessageInput.vue'
import MessageList from '../components/MessageList.vue'
import { useConversationStore } from '../stores/conversation'
import { useMessageStore } from '../stores/message'
import { useProviderStore } from '../stores/provider'
import { MessageProps, MessageListInstance, MessageStatus, MessageCreatePayload } from '../types'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../formatDateTime'
import { persistUploadsFromRenderer } from '../persistUploads'
import { serializeCreateChatProps } from '../ipcSerialize'
import { db } from '../db'
import type { ConversationProps } from '../types'
const inputValue = ref('')
let currentMessageListHeight = 0
const messageListRef = ref<MessageListInstance>()
const { t } = useI18n()
const route = useRoute()
const conversationStore = useConversationStore()
const messageStore = useMessageStore()
const provdierStore = useProviderStore()
const filteredMessages = computed(() => messageStore.items)

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
const sendedMessages = computed(() => filteredMessages.value
  .filter(message => message.status!== 'loading' && message.status !== 'error')
  .map((message) => {
    return {
      role: message.type === 'question' ? 'user' : 'assistant',
      content: message.content,
      ...(message.imagePath && { imagePath: message.imagePath }),
      ...(message.attachments?.length && { attachments: message.attachments }),
    }
  })
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
const sendNewMessage = async (payload: MessageCreatePayload) => {
  const text = payload.text.trim()
  if (!text && payload.uploads.length === 0) return
  const attachments = await persistUploadsFromRenderer(payload.uploads)
  if (!text && attachments.length === 0) return
  const firstImage = attachments.find((a) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name))
  const date = new Date().toISOString()
  await messageStore.createMessage({
    content: text,
    conversationId: conversationId.value,
    createdAt: date,
    updatedAt: date,
    type: 'question',
    ...(firstImage && { imagePath: firstImage.path }),
    ...(attachments.length > 0 && { attachments }),
  })
  inputValue.value = ''
  await creatingInitialMessage()
}
const messageScrollToBottom = async () => {
	await nextTick()
  if (messageListRef.value) {
    messageListRef.value.ref.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }
}
const creatingInitialMessage = async () => {
  const createdData: Omit<MessageProps, 'id'> = {
    content: '',
    conversationId: conversationId.value,
    type: 'answer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'loading'
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
        }),
      )
    }
  }
}

/** 按 messageId 累加流式片段，避免多会话/多次进入同页时串台 */
const streamBuffers = new Map<number, string>()
/** 串行处理 update-message，避免并发 await 读到旧的 currentMsg.status，把已是 finished 的回复写回 streaming */
let streamApplyChain: Promise<void> = Promise.resolve()
let removeUpdateListener: (() => void) | undefined

watch(() => route.params.id, async (newId: string) => {
  streamBuffers.clear()
  conversationId.value = parseInt(newId)
  await messageStore.fetchMessagesByConversation(conversationId.value)
  await messageScrollToBottom()
  currentMessageListHeight = 0
})

onMounted(async () => {
  await messageStore.fetchMessagesByConversation(conversationId.value)
  await messageScrollToBottom()
  if (initMessageId) {
    await creatingInitialMessage()
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
      const buf = streamBuffers.get(messageId)
      const prev = buf !== undefined ? buf : existing
      const next = prev + (data.result ?? '')
      let displayContent = next
      if (
        data.is_end &&
        conversationHasImageQuestion() &&
        (isTrivialAssistantReply(next) || !next.trim())
      ) {
        displayContent = t('common.visionImageReplyUnusable')
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
      })
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