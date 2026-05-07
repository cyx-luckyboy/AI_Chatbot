<template>
  <div class="message-input w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-1.5 pr-2 shadow-sm focus-within:border-green-700">
    <div v-if="pending.length" class="mb-2 flex flex-wrap gap-2 px-0.5">
      <div
        v-for="p in pending"
        :key="p.id"
        class="group relative inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 pr-7 text-xs text-gray-800"
      >
        <img
          v-if="isImageName(p.name)"
          :src="p.dataUrl"
          alt=""
          class="h-10 w-10 shrink-0 rounded object-cover"
        />
        <span class="max-w-[180px] truncate" :title="p.name">{{ p.name }}</span>
        <button
          type="button"
          :title="t('common.removeAttachment')"
          :aria-label="t('common.removeAttachment')"
          class="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
          @click.stop="removePending(p.id)"
        >
          <Icon icon="radix-icons:cross-2" width="12" height="12" />
        </button>
      </div>
    </div>
    <div class="flex items-end gap-2">
      <input
        ref="attachInput"
        type="file"
        class="hidden"
        multiple
        @change="onAttachChange"
      />

      <DropdownMenuRoot>
        <DropdownMenuTrigger
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-sky-200 bg-white text-sky-600 shadow-sm outline-none transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-800 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="disabled"
          :title="t('common.attachAddButton')"
          :aria-label="t('common.attachAddButton')"
        >
          <Icon icon="radix-icons:plus" width="22" height="22" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
            :side-offset="6"
            align="start"
          >
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100"
              @select="onPickAllFiles"
            >
              <Icon icon="mdi:folder-upload-outline" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.attachMenuAll') }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100"
              @select="onPickImagesOnly"
            >
              <Icon icon="radix-icons:image" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.attachMenuImages') }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <textarea
        class="min-h-[40px] min-w-0 flex-1 resize-y border-0 bg-white py-2 pl-0.5 pr-1 text-sm leading-snug text-gray-900 outline-none focus:ring-0 max-h-[200px]"
        v-model="model"
        :disabled="disabled"
        rows="1"
        @keydown="onTextareaKeydown"
      />
      <button
        type="button"
        :class="[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-2',
          voiceActive
            ? 'border-blue-600 bg-blue-600 text-white shadow-sm focus-visible:ring-blue-300'
            : 'border-gray-200 bg-gray-100 text-gray-700 hover:border-gray-300 hover:bg-white focus-visible:ring-gray-300',
        ]"
        :disabled="disabled || !voiceSupported"
        :title="!voiceSupported ? t('common.voiceInputUnsupported') : voiceActive ? t('common.voiceInputStop') : t('common.voiceInputStart')"
        :aria-pressed="voiceActive"
        :aria-label="voiceActive ? t('common.voiceInputStop') : t('common.voiceInputStart')"
        @click="toggleVoice"
      >
        <Icon icon="mdi:microphone" width="22" height="22" class="shrink-0" />
      </button>
      <Button icon-name="radix-icons:paper-plane" class="shrink-0" @click="onCreate" :disabled="disabled">
        {{ t('common.send') }}
      </Button>
    </div>
    <p v-if="voiceBaiduSecondClick" class="mt-1 max-w-full px-0.5 text-xs leading-snug text-sky-800">
      {{ t('common.voiceHint_baiduSecondClick') }}
    </p>
    <p v-if="voiceErrorText" class="mt-1.5 max-w-full px-0.5 text-xs leading-snug text-amber-800">
      {{ voiceErrorText }}
    </p>
    <p v-if="voiceErrorDetail" class="mt-0.5 max-w-full px-0.5 text-xs leading-snug text-amber-900/80">
      {{ voiceErrorDetail }}
    </p>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { useVoiceInput } from '../speech/useVoiceInput'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'radix-vue'
import Button from './Button.vue'
import type { MessageCreatePayload } from '../types'

const { t, locale } = useI18n()

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  create: [payload: MessageCreatePayload]
}>()

const model = defineModel<string>()
const attachInput = ref<HTMLInputElement | null>(null)

type Pending = { id: string; name: string; dataUrl: string }
const pending = ref<Pending[]>([])

const {
  supported: voiceSupported,
  active: voiceActive,
  toggle: toggleVoice,
  lastErrorCode: voiceLastError,
  lastErrorDetail: voiceLastDetail,
  baiduSecondClickHint: voiceBaiduSecondClick,
} = useVoiceInput(model, locale)

const voiceErrorText = computed(() => {
  const code = voiceLastError.value
  if (!code) return ''
  const key =
    (
      {
        network: 'common.voiceErr_network',
        'not-allowed': 'common.voiceErr_not_allowed',
        'service-not-allowed': 'common.voiceErr_service_not_allowed',
        'audio-capture': 'common.voiceErr_audio_capture',
        'language-not-supported': 'common.voiceErr_language_not_supported',
        baidu: 'common.voiceErr_baidu',
        'baidu-network': 'common.voiceErr_baidu_network',
        'baidu-empty': 'common.voiceErr_baidu_empty',
        'baidu-decode': 'common.voiceErr_baidu_decode',
        'baidu-no-result': 'common.voiceErr_baidu_no_result',
        'web-start-failed': 'common.voiceErr_web_start_failed',
        'voice-engine-unavailable': 'common.voiceErr_voice_engine_unavailable',
        'voice-empty-session': 'common.voiceErr_voice_empty_session',
        'voice-timeout-no-result': 'common.voiceErr_voice_timeout_no_result',
        'speech-other-error': 'common.voiceErr_speech_other_error',
        'voice-no-match': 'common.voiceErr_voice_no_match',
      } as Record<string, string>
    )[code] ?? 'common.voiceErr_unknown'
  return t(key)
})

const voiceErrorDetail = computed(() => {
  const code = voiceLastError.value
  if (!voiceLastDetail.value) return ''
  if (
    code === 'baidu' ||
    code === 'baidu-network' ||
    code === 'baidu-decode' ||
    code === 'baidu-no-result' ||
    code === 'web-start-failed' ||
    code === 'speech-other-error'
  ) {
    return voiceLastDetail.value
  }
  return ''
})

const MAX_FILES = 8
const MAX_BYTES = 14 * 1024 * 1024

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function isImageName(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

const openPicker = (accept: string) => {
  if (props.disabled || !attachInput.value) return
  attachInput.value.accept = accept
  nextTick(() => attachInput.value?.click())
}

// 勿在 template 中内联 any-or-image 的 accept 字面量，星号加斜杠会误结束注释
const ACCEPT_ALL = '*/*' as const

function onPickAllFiles() {
  openPicker(ACCEPT_ALL)
}

function onPickImagesOnly() {
  openPicker('image/*')
}

const onAttachChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const list = target.files
  if (!list?.length) return
  for (const file of Array.from(list)) {
    if (pending.value.length >= MAX_FILES) break
    if (file.size > MAX_BYTES) continue
    try {
      const dataUrl = await readAsDataUrl(file)
      pending.value.push({ id: uid(), name: file.name, dataUrl })
    } catch (e) {
      console.error('read file', e)
    }
  }
  target.value = ''
}

const removePending = (id: string) => {
  pending.value = pending.value.filter((p) => p.id !== id)
}

const onCreate = async () => {
  if (props.disabled) return
  if (voiceActive.value) await toggleVoice()
  const text = (model.value ?? '').trim()
  const uploads = pending.value.map(({ name, dataUrl }) => ({ name, dataUrl }))
  if (!text && uploads.length === 0) return
  emit('create', { text, uploads })
  pending.value = []
  model.value = ''
}

const onTextareaKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return
  if (e.shiftKey) return
  if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return
  e.preventDefault()
  onCreate()
}
</script>
