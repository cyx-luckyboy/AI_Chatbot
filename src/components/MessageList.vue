<template>
  <div class="message-list" ref="_ref">
    <div class="message-item mb-3" v-for="message in messages" :key="message.id">
      <div class="flex" :class="{'justify-end': message.type === 'question'}">
        <div>
          <div class="text-sm text-gray-500 mb-2" :class="{'text-right': message.type === 'question'}">
            {{ formatDateTime(message.createdAt) }}
          </div>
          <div class="message-question bg-green-700 text-white p-2 rounded-md" v-if="message.type === 'question'">
            <div v-if="imagePreviews(message).length" class="mb-2 flex flex-wrap gap-2">
              <img
                v-for="img in imagePreviews(message)"
                :key="img.path"
                :src="`safe-file://${img.path}`"
                alt=""
                class="h-24 w-24 max-w-full object-cover rounded border border-white/20"
              />
            </div>
            <div v-if="docAttachments(message).length" class="mb-2 flex flex-wrap gap-1">
              <span
                v-for="d in docAttachments(message)"
                :key="d.path"
                class="rounded bg-white/15 px-2 py-0.5 text-xs text-white/95"
                :title="d.name"
              >{{ d.name }}</span>
            </div>
            <span class="whitespace-pre-wrap">{{ message.content }}</span>
          </div>
          <div 
            class="message-answer p-2 rounded-md" 
            v-else
            :class="{'bg-red-100 text-red-700': message.status === 'error', 'bg-gray-200 text-gray-700': message.status !== 'error'}"
          >
            <template v-if="message.status === 'loading'">
              <Icon icon="eos-icons:three-dots-loading"></Icon>
            </template>
            <template v-else-if="message.status === 'error'">
              <span>{{message.content}}</span>
            </template>
            <div
              v-else
              class="max-w-none text-sm text-slate-800 [&_pre]:p-0 [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2"
            >
              <vue-markdown :source="message.content" :plugins="plugins"/>
            </div>
          </div>
        </div>
      </div>
    </div>    
  </div>
</template>
  
<script lang="ts" setup>
import { ref } from 'vue'
import { formatDateTime } from '../formatDateTime'
import { Icon } from '@iconify/vue'
import VueMarkdown from 'vue-markdown-render'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import type { MessageAttachment, MessageProps } from '../types'

defineProps<{ messages: MessageProps[] }>()

function imagePreviews(m: MessageProps): MessageAttachment[] {
  const from = (m.attachments ?? []).filter((a) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name))
  if (from.length) return from
  if (m.imagePath) return [{ path: m.imagePath, name: pathBasename(m.imagePath) }]
  return []
}

function docAttachments(m: MessageProps): MessageAttachment[] {
  return (m.attachments ?? []).filter((a) => !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name))
}

function pathBasename(p: string) {
  const s = p.replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : p
}
const plugins = [ markdownItHighlightjs ]
const _ref = ref<HTMLDivElement>()
defineExpose({
  ref: _ref
})
</script>
  