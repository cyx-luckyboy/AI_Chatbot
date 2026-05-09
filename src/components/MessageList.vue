<template>
  <div class="message-list" ref="_ref">
    <div class="message-item mb-3" v-for="message in messages" :key="message.id">
      <div class="flex" :class="{'justify-end': message.type === 'question'}">
        <div>
          <div class="mb-2 text-sm text-gray-500 dark:text-slate-400" :class="{'text-right': message.type === 'question'}">
            {{ formatDateTime(message.createdAt) }}
          </div>
          <div
            v-if="message.type === 'question'"
            class="flex w-full flex-col items-end gap-1"
          >
            <div
              class="message-question max-w-full rounded-md bg-green-700 p-2 text-white dark:bg-green-800"
              :ref="(el) => setQuestionCaptureRoot(message.id, el)"
            >
              <div v-if="imagePreviews(message).length" class="mb-2 flex flex-wrap gap-2">
                <img
                  v-for="img in imagePreviews(message)"
                  :key="img.path"
                  :src="attachmentImageSrc(img.path)"
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
              v-if="showQuestionToolbar(message)"
              class="mt-0.5 flex flex-wrap justify-end gap-0.5"
            >
              <DropdownMenuRoot
                :open="shareOpenId === message.id"
                @update:open="(v: boolean) => onShareMenuOpen(message.id, v)"
              >
                <DropdownMenuTrigger
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 outline-none hover:bg-gray-200/90 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-green-600/40 data-[state=open]:bg-gray-200 data-[state=open]:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:data-[state=open]:bg-slate-700 dark:data-[state=open]:text-slate-100 dark:focus-visible:ring-green-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!hasQuestionExportPayload(message)"
                  :title="t('common.answerShare')"
                  :aria-label="t('common.answerShare')"
                >
                  <Icon icon="material-symbols:ios-share" class="h-[18px] w-[18px]" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    class="z-[100] min-w-[11rem] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                    side="top"
                    :side-offset="6"
                    align="end"
                  >
                    <DropdownMenuItem
                      class="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
                      @select="() => exportQuestionImage(message)"
                    >
                      {{ t('common.answerExportImage') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      class="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
                      @select="() => exportQuestionDocument(message)"
                    >
                      {{ t('common.answerExportDocument') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 outline-none hover:bg-gray-200/90 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:focus-visible:ring-green-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!buildQuotedBlock(message).trim()"
                :title="t('common.questionQuote')"
                :aria-label="t('common.questionQuote')"
                @click="emitQuote(message)"
              >
                <Icon icon="material-symbols:reply-rounded" class="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
          <div 
            class="message-answer p-2 rounded-md" 
            v-else
            :ref="(el) => setExportCaptureRoot(message.id, el)"
            :class="{
              'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300': message.status === 'error',
              'bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-slate-200': message.status !== 'error',
            }"
          >
            <template v-if="message.status === 'loading'">
              <Icon icon="eos-icons:three-dots-loading"></Icon>
            </template>
            <template v-else-if="message.status === 'error'">
              <span>{{message.content}}</span>
            </template>
            <div
              v-else
              class="max-w-none text-sm text-slate-800 dark:text-slate-200 [&_pre]:p-0 [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_a]:text-blue-600 dark:[&_a]:text-sky-400 [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100"
            >
              <vue-markdown :source="message.content" :plugins="plugins"/>
            </div>
            <div
              v-if="showAnswerToolbar(message)"
              data-answer-toolbar
              class="mt-2 flex flex-wrap items-center gap-0.5 border-t border-gray-300/90 pt-2 dark:border-slate-600/90"
            >
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-green-600/40 dark:focus-visible:ring-green-500/40"
                :class="
                  copiedMessageId === message.id
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500 hover:bg-gray-300/70 hover:text-gray-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                "
                :title="copiedMessageId === message.id ? t('common.answerCopied') : t('common.answerCopy')"
                :aria-label="copiedMessageId === message.id ? t('common.answerCopied') : t('common.answerCopy')"
                @click="copyAnswer(message)"
              >
                <Icon
                  :icon="copiedMessageId === message.id ? 'mdi:check' : 'radix-icons:copy'"
                  class="h-[18px] w-[18px]"
                />
              </button>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 outline-none hover:bg-gray-300/70 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:focus-visible:ring-green-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!plainBody(message)"
                :title="t('common.answerSpeak')"
                :aria-label="t('common.answerSpeak')"
                @click="speakAnswer(message)"
              >
                <Icon icon="mdi:volume-high" class="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md outline-none hover:bg-gray-300/70 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:hover:bg-slate-700 dark:focus-visible:ring-green-500/40"
                :class="
                  message.feedback === 'like'
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100'
                "
                :title="t('common.answerLike')"
                :aria-label="t('common.answerLike')"
                :aria-pressed="message.feedback === 'like'"
                @click="toggleFeedback(message, 'like')"
              >
                <Icon
                  :icon="message.feedback === 'like' ? 'mdi:thumb-up' : 'mdi:thumb-up-outline'"
                  class="h-[18px] w-[18px]"
                />
              </button>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md outline-none hover:bg-gray-300/70 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:hover:bg-slate-700 dark:focus-visible:ring-green-500/40"
                :class="
                  message.feedback === 'dislike'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100'
                "
                :title="t('common.answerDislike')"
                :aria-label="t('common.answerDislike')"
                :aria-pressed="message.feedback === 'dislike'"
                @click="toggleFeedback(message, 'dislike')"
              >
                <Icon
                  :icon="message.feedback === 'dislike' ? 'mdi:thumb-down' : 'mdi:thumb-down-outline'"
                  class="h-[18px] w-[18px]"
                />
              </button>
              <DropdownMenuRoot
                :open="shareOpenId === message.id"
                @update:open="(v: boolean) => onShareMenuOpen(message.id, v)"
              >
                <DropdownMenuTrigger
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 outline-none hover:bg-gray-300/70 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-green-600/40 data-[state=open]:bg-gray-300/80 data-[state=open]:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:data-[state=open]:bg-slate-700 dark:data-[state=open]:text-slate-100 dark:focus-visible:ring-green-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!hasExportableBody(message)"
                  :title="t('common.answerShare')"
                  :aria-label="t('common.answerShare')"
                >
                  <Icon icon="material-symbols:ios-share" class="h-[18px] w-[18px]" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    class="z-[100] min-w-[11rem] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                    side="top"
                    :side-offset="6"
                    align="start"
                  >
                    <DropdownMenuItem
                      class="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
                      @select="() => exportAnswerImage(message)"
                    >
                      {{ t('common.answerExportImage') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      class="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
                      @select="() => exportAnswerDocument(message)"
                    >
                      {{ t('common.answerExportDocument') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 outline-none hover:bg-gray-300/70 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-green-600/40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:focus-visible:ring-green-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="regenerateDisabled"
                :title="regenerateDisabled ? t('common.answerRegenerateWait') : t('common.answerRegenerate')"
                :aria-label="t('common.answerRegenerate')"
                @click="emitRegenerate(message)"
              >
                <Icon icon="mdi:refresh" class="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>    
  </div>
</template>
  
<script lang="ts" setup>
import { nextTick, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import html2canvas from 'html2canvas'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'radix-vue'
import { formatDateTime } from '../formatDateTime'
import { Icon } from '@iconify/vue'
import VueMarkdown from 'vue-markdown-render'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import type { MessageAttachment, MessageProps } from '../types'
import { markdownToPlainText } from '../markdownPlain'
import { useMessageStore } from '../stores/message'

withDefaults(
  defineProps<{
    messages: MessageProps[]
    /** 有进行中的流式/加载回复时禁止重新生成 */
    regenerateDisabled?: boolean
  }>(),
  { regenerateDisabled: false },
)

const emit = defineEmits<{
  regenerate: [messageId: number]
  /** Markdown 引用块（含 `> ` 前缀），填入输入框继续回复 */
  quote: [quotedMarkdown: string]
}>()

const { t, locale } = useI18n()
const messageStore = useMessageStore()

const copiedMessageId = ref<number | null>(null)
let copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined

const COPY_FEEDBACK_MS = 2000

/**
 * 导出截图用 DOM 引用必须放在非响应式容器里：`:ref` 会在每次渲染时执行，
 * 若在这里改 `ref`/`shallowRef` 会触发重渲染 → 再次执行 ref → 无限循环（Maximum recursive updates）。
 */
const exportCaptureRootById = new Map<number, HTMLElement>()
function setExportCaptureRoot(id: number, el: unknown) {
  if (el instanceof HTMLElement) {
    if (exportCaptureRootById.get(id) === el) return
    exportCaptureRootById.set(id, el)
  } else {
    exportCaptureRootById.delete(id)
  }
}

const questionCaptureRootById = new Map<number, HTMLElement>()
function setQuestionCaptureRoot(id: number, el: unknown) {
  if (el instanceof HTMLElement) {
    if (questionCaptureRootById.get(id) === el) return
    questionCaptureRootById.set(id, el)
  } else {
    questionCaptureRootById.delete(id)
  }
}

const shareOpenId = ref<number | null>(null)
function onShareMenuOpen(messageId: number, open: boolean) {
  if (open) shareOpenId.value = messageId
  else if (shareOpenId.value === messageId) shareOpenId.value = null
}

function hasExportableBody(m: MessageProps): boolean {
  return Boolean((m.content ?? '').trim())
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportAnswerImage(m: MessageProps) {
  const root = exportCaptureRootById.get(m.id)
  if (!root || !hasExportableBody(m)) return
  const toolbar = root.querySelector('[data-answer-toolbar]') as HTMLElement | null
  const prevDisplay = toolbar?.style.display
  if (toolbar) toolbar.style.display = 'none'
  await nextTick()
  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    })
    await new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
          triggerBrowserDownload(blob, `assistant-reply-${m.id}-${stamp}.png`)
        }
        resolve()
      }, 'image/png')
    })
  } catch (e) {
    console.error('[export image]', e)
  } finally {
    if (toolbar) toolbar.style.display = prevDisplay ?? ''
  }
}

function exportAnswerDocument(m: MessageProps) {
  const raw = (m.content ?? '').trim()
  if (!raw) return
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const blob = new Blob(['\ufeff' + raw], { type: 'text/markdown;charset=utf-8' })
  triggerBrowserDownload(blob, `assistant-reply-${m.id}-${stamp}.md`)
}

function showQuestionToolbar(m: MessageProps): boolean {
  return m.type === 'question' && hasQuestionToolbarContent(m)
}

function hasQuestionToolbarContent(m: MessageProps): boolean {
  return (
    Boolean((m.content ?? '').trim()) ||
    imagePreviews(m).length > 0 ||
    docAttachments(m).length > 0
  )
}

function questionMarkdownForExport(m: MessageProps): string {
  const raw = (m.content ?? '').trim()
  if (raw) return raw
  const lines: string[] = []
  for (const d of docAttachments(m)) lines.push(`- [附件] ${d.name}`)
  if (imagePreviews(m).length) lines.push(`- ${t('common.quotePlaceholderImage')}`)
  return lines.join('\n')
}

function hasQuestionExportPayload(m: MessageProps): boolean {
  return Boolean(questionMarkdownForExport(m).trim())
}

async function exportQuestionImage(m: MessageProps) {
  const root = questionCaptureRootById.get(m.id)
  if (!root || m.type !== 'question' || !hasQuestionExportPayload(m)) return
  await nextTick()
  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    })
    await new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
          triggerBrowserDownload(blob, `my-message-${m.id}-${stamp}.png`)
        }
        resolve()
      }, 'image/png')
    })
  } catch (e) {
    console.error('[export question image]', e)
  }
}

function exportQuestionDocument(m: MessageProps) {
  const body = questionMarkdownForExport(m).trim()
  if (!body) return
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const blob = new Blob(['\ufeff' + body], { type: 'text/markdown;charset=utf-8' })
  triggerBrowserDownload(blob, `my-message-${m.id}-${stamp}.md`)
}

/** 生成填入输入框的引用块（Markdown） */
function buildQuotedBlock(m: MessageProps): string {
  const raw = (m.content ?? '').trim()
  if (raw) return raw.split('\n').map((line) => `> ${line}`).join('\n')
  const lines: string[] = []
  for (const d of docAttachments(m)) lines.push(`> [附件] ${d.name}`)
  if (imagePreviews(m).length) lines.push(`> ${t('common.quotePlaceholderImage')}`)
  return lines.join('\n')
}

function emitQuote(m: MessageProps) {
  if (m.type !== 'question') return
  const block = buildQuotedBlock(m)
  if (!block.trim()) return
  emit('quote', block)
}

function showAnswerToolbar(m: MessageProps): boolean {
  return m.type === 'answer' && (m.status === 'finished' || m.status === 'error')
}

function plainBody(m: MessageProps): string {
  return markdownToPlainText(m.content ?? '').trim()
}

async function copyAnswer(m: MessageProps) {
  const text = plainBody(m)
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    if (copyFeedbackTimer !== undefined) clearTimeout(copyFeedbackTimer)
    copiedMessageId.value = m.id
    copyFeedbackTimer = setTimeout(() => {
      copiedMessageId.value = null
      copyFeedbackTimer = undefined
    }, COPY_FEEDBACK_MS)
  } catch {
    /* 忽略 */
  }
}

function speechLang(): string {
  const l = locale.value
  return l.startsWith('zh') ? 'zh-CN' : 'en-US'
}

function speakAnswer(m: MessageProps) {
  const text = plainBody(m)
  if (!text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLang()
  window.speechSynthesis.speak(u)
}

async function toggleFeedback(m: MessageProps, kind: 'like' | 'dislike') {
  if (m.type !== 'answer') return
  if (m.feedback === kind) {
    await messageStore.clearMessageFeedback(m.id)
  } else {
    await messageStore.updateMessage(m.id, { feedback: kind })
  }
}

function emitRegenerate(m: MessageProps) {
  if (m.type !== 'answer') return
  emit('regenerate', m.id)
}

onUnmounted(() => {
  window.speechSynthesis.cancel()
  if (copyFeedbackTimer !== undefined) clearTimeout(copyFeedbackTimer)
})

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

/**
 * 必须用 `safe-file:///` 把编码后的绝对路径放在 pathname 里。
 * 双斜杠 `safe-file://encode(path)` 会把 path 当成 host，Chromium 请求异常 → 裂图、模型也读不到同一文件。
 */
function safeLocalFileUrl(absPath: string) {
  return `safe-file:///${encodeURIComponent(absPath)}`
}

/** 浏览器预览（browserElectronShim）会把附件存成 data URL；Electron 下为磁盘绝对路径 */
function attachmentImageSrc(stored: string) {
  if (stored.startsWith('data:') || stored.startsWith('blob:')) return stored
  return safeLocalFileUrl(stored)
}
const plugins = [ markdownItHighlightjs ]
const _ref = ref<HTMLDivElement>()
defineExpose({
  ref: _ref
})
</script>
  