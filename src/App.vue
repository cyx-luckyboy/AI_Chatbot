<template>
  <div class=" flex items-center justify-between h-screen">
    <div class=" w-[300px] bg-gray-200 h-full border-r border-gray-300">
      <div class="h-[90%] overflow-y-auto">
        <ConversationList :items="items"/>
      </div>
      <div class="h-[10%] grid grid-cols-2 gap-2 p-2">
        <RouterLink to="/" custom v-slot="{ navigate }">
          <Button icon-name="radix-icons:chat-bubble" class="w-full" type="button" @click="navigate">
            {{ t('common.newChat') }}
          </Button>
        </RouterLink>
        <RouterLink to="/settings" custom v-slot="{ navigate }">
          <Button icon-name="radix-icons:gear" plain class="w-full" type="button" @click="navigate">
            {{ t('common.settings') }}
          </Button>
        </RouterLink>
      </div>
    </div>
    <div class="h-full flex-1">
      <RouterView/>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { initI18n } from './i18n'
import { initProviders } from './db'
import { useConversationStore } from './stores/conversation'
import { useProviderStore } from './stores/provider'
import ConversationList from './components/ConversationList.vue'
import Button from './components/Button.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const conversationStore = useConversationStore()
const provdierStore = useProviderStore()
const items = computed(() => conversationStore.items)

// 监听菜单事件
window.electronAPI.onMenuNewConversation(() => {
  router.push('/')
})

window.electronAPI.onMenuOpenSettings(() => {
  router.push('/settings')
})

onMounted(async () => {
  await initI18n()
  await initProviders()
  // 获取最初需要的数据
  conversationStore.fetchConversations()
  provdierStore.fetchProviders()
})
</script>