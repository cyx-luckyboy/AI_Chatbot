import './browserElectronShim'
import './iconifySetup'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from './App.vue'
import PetApp from '../domains/pet/ui/PetApp.vue'
import Home from './views/Home.vue'
import Conversation from './views/Conversation.vue'
import Settings from './views/Settings.vue'
import Meetings from '../domains/meeting/Meetings.vue'
import Workspace from '../domains/workspace/Workspace.vue'
import { useConversationStore } from '../domains/chat/stores/conversation'
import './index.css'
import 'highlight.js/styles/github-dark.min.css'
import { i18n } from '../shared/i18n/index'
import { RESTORE_ROUTE_AFTER_RELOAD_KEY } from '../shared/restoreRouteKey'

function isPetWindow(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('window') === 'pet'
  } catch {
    return false
  }
}

if (isPetWindow()) {
  const app = createApp(PetApp)
  app.mount('#app')
} else {
  const routes = [
    { path: '/', component: Home },
    { path: '/conversation/:id', component: Conversation },
    { path: '/meetings', component: Meetings },
    { path: '/workspace', component: Workspace },
    { path: '/settings', component: Settings },
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  router.beforeEach((to) => {
    const store = useConversationStore()
    if (to.path.startsWith('/conversation/')) {
      const id = parseInt(to.params.id as string, 10)
      if (Number.isFinite(id)) {
        store.selectedId = id
      }
    } else {
      store.selectedId = -1
    }
  })
  const pinia = createPinia()

  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.use(i18n)

  let routeToRestore = ''
  try {
    routeToRestore = sessionStorage.getItem(RESTORE_ROUTE_AFTER_RELOAD_KEY) ?? ''
    if (routeToRestore) {
      sessionStorage.removeItem(RESTORE_ROUTE_AFTER_RELOAD_KEY)
    }
  } catch {
    /* 隐私模式等 */
  }

  void (async () => {
    if (routeToRestore) {
      try {
        await router.replace(routeToRestore)
      } catch {
        await router.replace('/')
      }
    }
    app.mount('#app')
  })()
}
