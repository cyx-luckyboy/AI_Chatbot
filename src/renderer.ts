import './browserElectronShim'
import './iconifySetup'

/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Conversation from './views/Conversation.vue'
import Settings from './views/Settings.vue'
import { useConversationStore } from './stores/conversation'
import './index.css'
import 'highlight.js/styles/github-dark.min.css'
import { i18n } from './i18n'
import { RESTORE_ROUTE_AFTER_RELOAD_KEY } from './restoreRouteKey'

const routes = [
  { path: '/', component: Home },
  { path: '/conversation/:id', component: Conversation },
  { path: '/settings', component: Settings }
]
const router = createRouter({
  history: createMemoryHistory(),
  routes
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