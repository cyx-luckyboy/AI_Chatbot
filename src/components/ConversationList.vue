<template>
  <div class="conversation-list">
    <div 
      class="item cursor-pointer border-t border-gray-300 p-2 dark:border-slate-600"
      :class="{
        'bg-gray-100 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700': store.selectedId === item.id,
        'bg-white hover:bg-gray-200 dark:bg-slate-900/80 dark:hover:bg-slate-800': store.selectedId !== item.id,
      }"
      v-for="item in items"
      :key="item.id"
      @contextmenu.prevent="showContextMenu(item.id)"
    >
     <a @click.prevent="goToConversation(item.id)">
      <div class="flex items-center justify-between text-sm leading-5 text-gray-500 dark:text-slate-400">
        <span>{{item.selectedModel}}</span>
        <span>{{dayjs(item.updatedAt).format('YYYY-MM-DD')}}</span>
      </div>
      <h2 class="truncate font-semibold leading-6 text-gray-900 dark:text-slate-100">{{item.title}}</h2>
    </a>
    </div>
  </div>
</template>
  
<script lang="ts" setup>
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { onMounted } from 'vue'
import { ConversationProps } from '../types'
import { useConversationStore } from '../stores/conversation'

defineProps<{ items: ConversationProps[] }>()
const router = useRouter()
const store = useConversationStore()

const showContextMenu = (id: number) => {
  window.electronAPI.showContextMenu(id)
}

onMounted(() => {
  window.electronAPI.onDeleteConversation(async (id: number) => {
    await store.deleteConversation(id)
    if (store.selectedId === id) {
      store.selectedId = -1
      router.push('/')
    }
  })
})

const goToConversation = (id: number) => {
  router.push({ path: `/conversation/${id}`})
  store.selectedId = id
}
</script>
  