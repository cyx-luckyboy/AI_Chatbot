<template>
<div class="h-[10%] bg-gray-200 border-b border-gray-300 flex items-center px-3 justify-between" v-if="conversation">
  <h3 class="font-semibold  text-gray-900">{{ conversation.title }}</h3>
  <span class="text-sm text-gray-500">{{ formatDateTime(conversation.updatedAt) }}</span>
</div>
<div class="w-[80%] mx-auto h-[75%] overflow-y-auto pt-2">
  <MessageList :messages="filteredMessages" ref="messageListRef"/>
</div>
<div class="w-[80%] mx-auto h-[15%] flex items-center">
  <MessageInput  @create="sendNewMessage" v-model="inputValue" :disabled="messageStore.isMessageLoading"/>
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
import { formatDateTime } from '../formatDateTime'
import { persistUploadsFromRenderer } from '../persistUploads'
import { serializeCreateChatProps } from '../ipcSerialize'
const inputValue = ref('')
let currentMessageListHeight = 0
const messageListRef = ref<MessageListInstance>()
const route = useRoute()
const conversationStore = useConversationStore()
const messageStore = useMessageStore()
const provdierStore = useProviderStore()
const filteredMessages = computed(() => messageStore.items)
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
const conversation = computed(() => conversationStore.getConversationById(conversationId.value))
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
  creatingInitialMessage()
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
  if (conversation.value) {
    const provider = provdierStore.getProviderById(conversation.value.providerId)
    if (provider) {
      await window.electronAPI.startChat(
        serializeCreateChatProps({
          messageId: newMessageId,
          providerName: provider.name,
          selectedModel: conversation.value.selectedModel,
          messages: sendedMessages.value,
        }),
      )
    }
  }
}

/** 按 messageId 累加流式片段，避免多会话/多次进入同页时串台 */
const streamBuffers = new Map<number, string>()
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
  removeUpdateListener = window.electronAPI.onUpdateMessage(async (streamData) => {
    const { messageId, data } = streamData
    // buffer 在 is_end 后会删掉；若再来一包空的结束帧，应用库里已有正文拼接，避免把回复清空
    const existing =
      messageStore.items.find((m) => m.id === messageId)?.content ?? ''
    const buf = streamBuffers.get(messageId)
    const prev = buf !== undefined ? buf : existing
    const next = prev + (data.result ?? '')
    streamBuffers.set(messageId, next)
    const getMessageStatus = (d: { is_error?: boolean; is_end?: boolean }): MessageStatus => {
      if (d.is_error) return 'error'
      if (d.is_end) return 'finished'
      return 'streaming'
    }
    await messageStore.updateMessage(messageId, {
      content: next,
      status: getMessageStatus(data),
      updatedAt: new Date().toISOString(),
    })
    await nextTick()
    await checkAndScrollToBottom()
    if (data.is_end) {
      streamBuffers.delete(messageId)
    }
  })
})

onUnmounted(() => {
  removeUpdateListener?.()
})
</script>