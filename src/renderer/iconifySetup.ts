import { addAPIProvider } from '@iconify/vue'

/** 避免默认 api.unisvg.com 在部分网络下连接被重置 */
addAPIProvider('', {
  resources: ['https://api.iconify.design'],
})
