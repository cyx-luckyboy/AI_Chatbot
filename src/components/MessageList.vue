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
                  @error="onAttachmentImageError(img.path, $event)"
                />
              </div>
              <div v-if="docAttachments(message).length" class="mb-2 flex flex-wrap gap-1.5">
                <span
                  v-for="d in docAttachments(message)"
                  :key="d.path"
                  class="inline-flex max-w-full items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs text-white/95"
                  :title="d.name"
                >
                  <Icon
                    :icon="docAttachmentIcon(d.name)"
                    width="16"
                    height="16"
                    class="shrink-0 opacity-95"
                  />
                  <span class="truncate">{{ d.name }}</span>
                </span>
              </div>
              <span
                v-if="message.webSearch"
                class="mb-1 inline-flex items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[11px] text-white/90"
              >
                <Icon icon="mdi:web" width="12" height="12" />
                {{ t('common.webSearchTag') }}
              </span>
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
            <template v-else>
              <div class="flex flex-col gap-2">
                <WebSearchReferencesBar :meta="message.webSearchMeta" />
                <div
                  v-if="message.imagePath || answerGeneratedImageSrc(message)"
                >
                  <img
                    v-if="answerGeneratedImageSrc(message)"
                    :src="answerGeneratedImageSrc(message)"
                    alt=""
                    class="max-h-[min(70vh,520px)] max-w-full rounded-lg border border-gray-300/80 object-contain dark:border-slate-600"
                    @error="onAnswerImageError(message, $event)"
                  />
                  <div v-if="message.imagePath" class="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="rounded-md bg-violet-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-800"
                      @click="saveGeneratedImageAs(message)"
                    >
                      {{ t('common.imageGenSaveAs') }}
                    </button>
                    <button
                      type="button"
                      class="rounded-md border border-violet-600 px-2.5 py-1 text-xs text-violet-800 hover:bg-violet-50 dark:border-violet-400 dark:text-violet-200 dark:hover:bg-violet-950/50"
                      @click="showGeneratedImageInFolder(message)"
                    >
                      {{ t('common.imageGenShowInFolder') }}
                    </button>
                  </div>
                </div>
                <p
                  v-if="isAnswerVisuallyEmpty(message)"
                  class="text-sm text-gray-500 dark:text-slate-400"
                >
                  {{ emptyAnswerHint(message) }}
                </p>
                <div
                  v-if="(message.content ?? '').trim()"
                  class="max-w-none text-sm text-slate-800 dark:text-slate-200 [&_pre]:p-0 [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_a]:text-blue-600 dark:[&_a]:text-sky-400 [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100"
                >
                  <VueMarkdown :key="`md-${message.id}`" :source="message.content" :plugins="plugins" />
                </div>
              </div>
            </template>
            <p
              v-if="message.pptBuildProgress && !message.exportPptPath"
              class="mt-2 flex items-center gap-2 text-xs text-orange-800 dark:text-orange-200"
            >
              <Icon icon="mdi:loading" class="h-4 w-4 shrink-0 animate-spin" />
              <span>{{ message.pptBuildProgress }}</span>
            </p>
            <div
              v-if="message.exportPptPath"
              class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-100"
            >
              <Icon icon="mdi:microsoft-powerpoint" class="h-5 w-5 shrink-0" />
              <span class="min-w-0 flex-1">{{ t('common.pptExportReady') }}</span>
              <button
                type="button"
                class="rounded-md bg-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-800"
                @click="savePptxAs(message)"
              >
                {{ t('common.pptExportSaveAs') }}
              </button>
              <button
                type="button"
                class="rounded-md border border-green-600 px-2.5 py-1 text-xs text-green-800 hover:bg-green-100 dark:border-green-500 dark:text-green-200 dark:hover:bg-green-900/50"
                @click="showPptxInFolder(message)"
              >
                {{ t('common.pptExportShowInFolder') }}
              </button>
            </div>
            <p
              v-if="message.exportPptWarning && message.exportPptPath"
              class="mt-2 text-xs text-amber-800 dark:text-amber-200"
            >
              {{ message.exportPptWarning }}
            </p>
            <p
              v-if="message.exportPptError && !message.exportPptPath"
              class="mt-2 text-xs text-red-600 dark:text-red-400"
            >
              {{ t('common.pptExportFailed') }} {{ message.exportPptError }}
            </p>
            <div
              v-if="showAnswerToolbar(message)"
              data-answer-toolbar
              class="mt-2 flex flex-wrap items-center gap-0.5 border-t border-gray-300/90 pt-2 dark:border-slate-600/90"
            >
              <button
                v-if="message.exportPptPath"
                type="button"
                class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-orange-700 outline-none hover:bg-orange-50 focus-visible:ring-2 focus-visible:ring-orange-400 dark:text-orange-300 dark:hover:bg-orange-950/50"
                :title="t('common.pptExportSaveAs')"
                @click="savePptxAs(message)"
              >
                <Icon icon="mdi:microsoft-powerpoint" class="h-[18px] w-[18px]" />
                <span class="hidden sm:inline">{{ t('common.pptExportDownload') }}</span>
              </button>
              <button
                v-if="isPptAnswer(message)"
                type="button"
                class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-violet-700 outline-none hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950/50"
                :disabled="reexportingPptId === message.id || !!message.pptBuildProgress"
                :title="t('common.pptReexport')"
                @click="reexportPpt(message)"
              >
                <Icon
                  :icon="reexportingPptId === message.id ? 'mdi:loading' : 'mdi:refresh'"
                  class="h-[18px] w-[18px]"
                  :class="reexportingPptId === message.id ? 'animate-spin' : ''"
                />
                <span class="hidden sm:inline">{{ t('common.pptReexport') }}</span>
              </button>
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
                class="inline-flex h-8 w-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-green-600/40 dark:focus-visible:ring-green-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                :class="
                  speakingMessageId === message.id
                    ? 'text-blue-600 hover:bg-blue-50 dark:text-sky-400 dark:hover:bg-slate-800'
                    : 'text-gray-500 hover:bg-gray-300/70 hover:text-gray-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                "
                :disabled="!plainBody(message) && speakingMessageId !== message.id"
                :title="speakingMessageId === message.id ? t('common.answerSpeakStop') : t('common.answerSpeak')"
                :aria-label="speakingMessageId === message.id ? t('common.answerSpeakStop') : t('common.answerSpeak')"
                :aria-pressed="speakingMessageId === message.id"
                @click="speakAnswer(message)"
              >
                <Icon
                  :icon="speakingMessageId === message.id ? 'material-symbols:graphic-eq' : 'mdi:volume-high'"
                  class="h-[18px] w-[18px]"
                />
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
import { nextTick, onUnmounted, ref, watch } from 'vue'
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
import { looksLikeImageGenerationPrompt } from '../imageGenPromptDetect'
import { markdownToPlainText } from '../markdownPlain'
import { useMessageStore } from '../stores/message'
import { buildPptxForAnswerMessage } from '../pptExportRenderer'
import WebSearchReferencesBar from './WebSearchReferencesBar.vue'

const props = withDefaults(
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

/** 当前正在朗读的助手消息 id；与 `speechSynthesis` 同步，用于切换图标与再次点击停止 */
const speakingMessageId = ref<number | null>(null)

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

watch(
  () => props.messages.map((m) => m.id).join(','),
  () => {
    shareOpenId.value = null
  },
)

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

function isAnswerVisuallyEmpty(m: MessageProps): boolean {
  if (m.type !== 'answer' || m.status === 'loading' || m.status === 'error') return false
  if (m.imagePath || m.exportPptPath) return false
  return !(m.content ?? '').trim()
}

function findQuestionForAnswer(answerId: number): MessageProps | undefined {
  const sorted = [...props.messages].sort((a, b) => a.id - b.id)
  const idx = sorted.findIndex((m) => m.id === answerId)
  if (idx <= 0) return undefined
  for (let i = idx - 1; i >= 0; i--) {
    if (sorted[i].type === 'question') return sorted[i]
    if (sorted[i].type === 'answer') break
  }
  return undefined
}

function emptyAnswerHint(m: MessageProps): string {
  const q = findQuestionForAnswer(m.id)
  if (q?.webSearch) return t('common.webSearchAnswerEmpty')
  if (q?.content && looksLikeImageGenerationPrompt(q.content) && !q.imageGenSize) {
    return t('common.imageGenChatModelHint')
  }
  return t('common.answerEmpty')
}

async function savePptxAs(m: MessageProps) {
  const p = m.exportPptPath
  if (!p) return
  try {
    const result = await window.electronAPI.savePptxExportAs(p)
    if (result.ok) return
    if (!result.cancelled && result.error) {
      console.error('[savePptxAs]', result.error)
    }
  } catch (e) {
    console.error('[savePptxAs]', e)
  }
}

function showPptxInFolder(m: MessageProps) {
  const p = m.exportPptPath
  if (p) void window.electronAPI.showPptxInFolder(p)
}

function isPptAnswer(m: MessageProps): boolean {
  if (m.type !== 'answer') return false
  const q = findQuestionForAnswer(m.id)
  return Boolean(q?.pptGenLength && (m.content ?? '').trim())
}

const reexportingPptId = ref<number | null>(null)

async function reexportPpt(m: MessageProps) {
  if (!isPptAnswer(m) || reexportingPptId.value != null) return
  const q = findQuestionForAnswer(m.id)
  if (!q) return
  reexportingPptId.value = m.id
  try {
    await buildPptxForAnswerMessage({
      answerId: m.id,
      markdown: (m.content ?? '').trim(),
      question: q,
      messageStore,
      t,
    })
  } finally {
    reexportingPptId.value = null
  }
}

const answerImageSrcMap = ref<Record<string, string>>({})

function answerGeneratedImageSrc(m: MessageProps): string {
  if (m.type !== 'answer' || !m.imagePath) return ''
  if (m.imagePath.startsWith('data:') || m.imagePath.startsWith('blob:')) return m.imagePath
  return answerImageSrcMap.value[m.imagePath] || safeLocalFileUrl(m.imagePath)
}

async function ensureAnswerImageDataUrl(stored: string) {
  if (!stored || stored.startsWith('data:') || stored.startsWith('blob:')) return
  if (answerImageSrcMap.value[stored]) return
  try {
    const dataUrl = await window.electronAPI.readLocalImageAsDataUrl(stored)
    answerImageSrcMap.value = { ...answerImageSrcMap.value, [stored]: dataUrl }
  } catch (e) {
    console.warn('[answer image preview]', stored, e)
  }
}

async function onAnswerImageError(m: MessageProps, ev: Event) {
  if (!m.imagePath || m.imagePath.startsWith('data:')) return
  await ensureAnswerImageDataUrl(m.imagePath)
  const dataUrl = answerImageSrcMap.value[m.imagePath]
  if (dataUrl) {
    const img = ev.target as HTMLImageElement | null
    if (img) img.src = dataUrl
  }
}

async function saveGeneratedImageAs(m: MessageProps) {
  const p = m.imagePath
  if (!p) return
  try {
    await window.electronAPI.saveGeneratedImageAs(p)
  } catch (e) {
    console.error('[saveGeneratedImageAs]', e)
  }
}

function showGeneratedImageInFolder(m: MessageProps) {
  const p = m.imagePath
  if (p) void window.electronAPI.showPptxInFolder(p)
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

function clearSpeakingIfMessage(id: number) {
  if (speakingMessageId.value === id) {
    speakingMessageId.value = null
  }
}

function speakAnswer(m: MessageProps) {
  if (m.type !== 'answer') return
  if (speakingMessageId.value === m.id) {
    window.speechSynthesis.cancel()
    speakingMessageId.value = null
    return
  }
  const text = plainBody(m)
  if (!text) return
  window.speechSynthesis.cancel()
  speakingMessageId.value = m.id
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLang()
  const mid = m.id
  u.onend = () => clearSpeakingIfMessage(mid)
  u.onerror = () => clearSpeakingIfMessage(mid)
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
  speakingMessageId.value = null
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

function docAttachmentIcon(name: string) {
  if (/\.pptx?$/i.test(name)) return 'mdi:microsoft-powerpoint'
  if (/\.docx?$/i.test(name)) return 'mdi:microsoft-word'
  if (/\.pdf$/i.test(name)) return 'mdi:file-pdf-box'
  return 'mdi:file-document-outline'
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

/** 本地附件预览：优先 data URL（与聊天背景一致，避免 safe-file 被 Chromium 规范化后裂图） */
const attachmentSrcMap = ref<Record<string, string>>({})

async function ensureAttachmentDataUrl(stored: string) {
  if (stored.startsWith('data:') || stored.startsWith('blob:')) return
  if (attachmentSrcMap.value[stored]) return
  try {
    const dataUrl = await window.electronAPI.readLocalImageAsDataUrl(stored)
    attachmentSrcMap.value = { ...attachmentSrcMap.value, [stored]: dataUrl }
  } catch (e) {
    console.warn('[attachment preview]', stored, e)
  }
}

watch(
  () => props.messages,
  (msgs) => {
    for (const m of msgs) {
      for (const img of imagePreviews(m)) {
        void ensureAttachmentDataUrl(img.path)
      }
      if (m.type === 'answer' && m.imagePath) {
        void ensureAnswerImageDataUrl(m.imagePath)
      }
    }
  },
  { immediate: true, deep: true },
)

/** 浏览器预览（browserElectronShim）会把附件存成 data URL；Electron 下为磁盘绝对路径 */
function attachmentImageSrc(stored: string) {
  if (stored.startsWith('data:') || stored.startsWith('blob:')) return stored
  return attachmentSrcMap.value[stored] || safeLocalFileUrl(stored)
}

async function onAttachmentImageError(stored: string, ev: Event) {
  if (stored.startsWith('data:') || stored.startsWith('blob:')) return
  await ensureAttachmentDataUrl(stored)
  const dataUrl = attachmentSrcMap.value[stored]
  if (dataUrl) {
    const img = ev.target as HTMLImageElement | null
    if (img) img.src = dataUrl
  }
}
const plugins = [ markdownItHighlightjs ]
const _ref = ref<HTMLDivElement>()
defineExpose({
  ref: _ref
})
</script>
  