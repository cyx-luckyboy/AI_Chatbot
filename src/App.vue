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
    <div class="h-full flex-1 flex min-h-0 min-w-0 flex-col">
      <header
        class="flex shrink-0 items-center justify-end gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"
      >
        <Button
          type="button"
          plain
          size="small"
          icon-name="radix-icons:reload"
          class="!shadow-none"
          @click="reloadApp"
        >
          {{ t('common.reloadApp') }}
        </Button>
      </header>
      <div class="min-h-0 flex-1 overflow-hidden">
        <RouterView />
      </div>
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

const reloadApp = () => {
  window.location.reload()
}

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