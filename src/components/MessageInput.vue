<template>
  <div
    class="message-input w-full bg-white shadow-sm dark:bg-slate-900"
    :class="
      imageGenMode
        ? 'rounded-2xl border border-sky-200/90 py-2 pl-2 pr-2 ring-1 ring-sky-100/80 focus-within:border-sky-300 focus-within:ring-sky-200/60 dark:border-sky-800/80 dark:ring-sky-950/50 dark:focus-within:border-sky-600'
        : 'rounded-lg border border-gray-300 py-1.5 pl-1.5 pr-2 focus-within:border-green-700 dark:border-slate-600 dark:focus-within:border-green-500'
    "
  >
    <div v-if="pptGenMode" class="mb-2 flex flex-wrap items-center gap-2 px-0.5">
      <div class="inline-flex items-center gap-1.5 rounded-md bg-orange-100 px-2 py-1.5 pl-2.5 text-sm text-orange-950 dark:bg-orange-950/50 dark:text-orange-100">
        <Icon icon="mdi:microsoft-powerpoint" class="h-4 w-4 shrink-0" />
        <span class="font-medium">{{ t('common.pptGenTag') }}</span>
        <button
          type="button"
          class="ml-0.5 flex h-5 w-5 items-center justify-center rounded hover:bg-orange-200/80 dark:hover:bg-orange-900/60"
          :title="t('common.pptGenClose')"
          :aria-label="t('common.pptGenClose')"
          @click="pptGenMode = false"
        >
          <Icon icon="radix-icons:cross-2" width="14" height="14" />
        </button>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm text-gray-800 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        :disabled="disabled"
        @click="onPickPptReferenceFiles"
      >
        <Icon icon="radix-icons:paperclip" width="16" height="16" class="shrink-0 text-gray-500" />
        <span>{{ t('common.pptGenUpload') }}</span>
      </button>
      <DropdownMenuRoot v-model:open="pptLengthMenuOpen">
        <DropdownMenuTrigger
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm text-gray-800 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Icon icon="material-symbols:segment" width="16" height="16" class="shrink-0 text-gray-500" />
          <span>{{ t('common.pptGenLength') }}</span>
          <span class="text-gray-600 dark:text-slate-400">{{ currentPptLengthLabel }}</span>
          <Icon
            :icon="pptLengthMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
            width="16"
            height="16"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
            side="top"
            :side-offset="6"
            align="start"
          >
            <DropdownMenuItem
              v-for="opt in pptLengthOptions"
              :key="opt.id"
              class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="pptGenLength = opt.id"
            >
              <span>{{ t(opt.labelKey) }}</span>
              <Icon
                v-if="pptGenLength === opt.id"
                icon="radix-icons:check"
                width="16"
                height="16"
                class="text-green-700"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <DropdownMenuRoot v-model:open="pptQualityMenuOpen">
        <DropdownMenuTrigger
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm text-gray-800 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Icon icon="material-symbols:high-quality" width="16" height="16" class="shrink-0 text-gray-500" />
          <span>{{ t('common.pptGenQuality') }}</span>
          <span class="text-gray-600 dark:text-slate-400">{{ currentPptQualityLabel }}</span>
          <Icon
            :icon="pptQualityMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
            width="16"
            height="16"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
            side="top"
            :side-offset="6"
            align="start"
          >
            <DropdownMenuItem
              v-for="opt in pptQualityOptions"
              :key="opt.id"
              class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="pptGenQuality = opt.id"
            >
              <span>{{ t(opt.labelKey) }}</span>
              <Icon
                v-if="pptGenQuality === opt.id"
                icon="radix-icons:check"
                width="16"
                height="16"
                class="text-green-700"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <DropdownMenuRoot v-model:open="pptScenarioMenuOpen">
        <DropdownMenuTrigger
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm text-gray-800 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Icon icon="mdi:file-document-outline" width="16" height="16" class="shrink-0 text-gray-500" />
          <span>{{ t('common.pptGenScenario') }}</span>
          <span class="text-gray-600 dark:text-slate-400">{{ currentPptScenarioLabel }}</span>
          <Icon
            :icon="pptScenarioMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
            width="16"
            height="16"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
            side="top"
            :side-offset="6"
            align="start"
          >
            <DropdownMenuItem
              v-for="opt in pptScenarioOptions"
              :key="opt.id"
              class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="pptGenScenario = opt.id"
            >
              <span>{{ t(opt.labelKey) }}</span>
              <Icon
                v-if="pptGenScenario === opt.id"
                icon="radix-icons:check"
                width="16"
                height="16"
                class="text-green-700"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <div v-if="pending.length" class="flex w-full basis-full flex-wrap gap-2 pt-0.5">
        <div
          v-for="p in pending"
          :key="p.id"
          class="group relative inline-flex max-w-full items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50/90 py-1 pl-2 pr-7 text-xs text-orange-950 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-100"
        >
          <img
            v-if="isImageName(p.name) && p.dataUrl"
            :src="p.dataUrl"
            alt=""
            class="h-9 w-9 shrink-0 rounded object-cover"
          />
          <Icon
            v-else
            :icon="attachmentFileIcon(p.name)"
            width="18"
            height="18"
            class="shrink-0"
            :class="isPptxName(p.name) ? 'text-orange-700 dark:text-orange-300' : 'text-gray-600 dark:text-slate-400'"
          />
          <span class="max-w-[200px] truncate font-medium" :title="p.name">{{ p.name }}</span>
          <button
            type="button"
            :title="t('common.removeAttachment')"
            :aria-label="t('common.removeAttachment')"
            class="absolute right-0.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-orange-800/70 text-white opacity-90 hover:bg-orange-900 dark:bg-orange-950/80"
            @click.stop="removePending(p.id)"
          >
            <Icon icon="radix-icons:cross-2" width="12" height="12" />
          </button>
        </div>
      </div>
    </div>
    <div v-if="webSearchMode" class="mb-2 flex flex-wrap items-center gap-2 px-0.5">
      <div class="inline-flex items-center gap-1.5 rounded-md bg-violet-100 px-2 py-1.5 pl-2.5 text-sm text-violet-950 dark:bg-violet-950/50 dark:text-violet-100">
        <Icon icon="mdi:web" class="h-4 w-4 shrink-0" />
        <span class="font-medium">{{ t('common.webSearchTag') }}</span>
        <button
          type="button"
          class="ml-0.5 flex h-5 w-5 items-center justify-center rounded hover:bg-violet-200/80 dark:hover:bg-violet-900/60"
          :title="t('common.webSearchClose')"
          :aria-label="t('common.webSearchClose')"
          @click="webSearchMode = false"
        >
          <Icon icon="radix-icons:cross-2" width="14" height="14" />
        </button>
      </div>
      <span class="text-xs text-violet-800/90 dark:text-violet-200/80">{{ t('common.webSearchHint') }}</span>
    </div>
    <div v-if="translateMode" class="mb-2 flex flex-wrap items-center gap-2 px-0.5">
      <div class="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2 py-1.5 pl-2.5 text-sm text-sky-900 dark:bg-sky-950/80 dark:text-sky-100">
        <Icon icon="material-symbols:translate" class="h-4 w-4 shrink-0" />
        <span class="font-medium">{{ t('common.translateTag') }}</span>
        <button
          type="button"
          class="ml-0.5 flex h-5 w-5 items-center justify-center rounded hover:bg-sky-200/80"
          :title="t('common.translateClose')"
          :aria-label="t('common.translateClose')"
          @click="translateMode = false"
        >
          <Icon icon="radix-icons:cross-2" width="14" height="14" />
        </button>
      </div>
      <DropdownMenuRoot v-model:open="langMenuOpen">
        <DropdownMenuTrigger
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm text-gray-800 outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300"
        >
          <span>{{ t('common.translateToPrefix') }} {{ currentTranslateLabel }}</span>
          <Icon
            :icon="langMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
            width="16"
            height="16"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
            side="top"
            :side-offset="6"
            align="start"
          >
            <div class="px-2 py-1.5 text-xs text-gray-500">{{ t('common.translateToPrefix') }}</div>
            <DropdownMenuItem
              v-for="opt in translateLangOptions"
              :key="opt.id"
              class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100"
              @select="translateTarget = opt.id"
            >
              <span>{{ t(opt.labelKey) }}</span>
              <Icon
                v-if="translateTarget === opt.id"
                icon="radix-icons:check"
                width="16"
                height="16"
                class="text-green-700"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
    <div v-if="pending.length && !pptGenMode" class="mb-2 flex flex-wrap gap-2 px-0.5">
      <div
        v-for="p in pending"
        :key="p.id"
        class="group relative inline-flex items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 pr-7 text-xs text-gray-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        <img
          v-if="isImageName(p.name) && p.dataUrl"
          :src="p.dataUrl"
          alt=""
          class="h-10 w-10 shrink-0 rounded object-cover"
        />
        <Icon
          v-else
          :icon="attachmentFileIcon(p.name)"
          width="18"
          height="18"
          class="shrink-0 text-gray-500 dark:text-slate-400"
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
    <input
      ref="attachInput"
      type="file"
      class="hidden"
      multiple
      @change="onAttachChange"
    />

    <div v-if="imageGenMode" class="flex flex-col gap-2 px-0.5">
      <textarea
        ref="textareaRef"
        class="max-h-[200px] min-h-[72px] w-full resize-y border-0 bg-transparent px-1 py-1 text-sm leading-relaxed text-gray-900 outline-none focus:ring-0 dark:text-slate-100"
        v-model="model"
        :disabled="disabled"
        :placeholder="inputPlaceholder"
        rows="2"
        @keydown="onTextareaKeydown"
      />
      <div class="flex flex-wrap items-center gap-1.5">
        <div
          class="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 py-1 pl-2.5 pr-1 text-sm font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-100"
        >
          <Icon icon="mdi:image-outline" class="h-4 w-4 shrink-0" />
          <span>{{ t('common.imageGenTag') }}</span>
          <button
            type="button"
            class="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-sky-700 hover:bg-sky-200/80 dark:text-sky-200 dark:hover:bg-sky-900/60"
            :title="t('common.imageGenClose')"
            :aria-label="t('common.imageGenClose')"
            @click="imageGenMode = false"
          >
            <Icon icon="radix-icons:cross-2" width="14" height="14" />
          </button>
        </div>
        <button
          type="button"
          :class="imageGenToolBtnClass"
          :disabled="disabled"
          @click="onPickImageReference"
        >
          <Icon icon="radix-icons:paperclip" width="16" height="16" class="shrink-0 text-gray-500" />
          <span>{{ t('common.imageGenReference') }}</span>
        </button>
        <DropdownMenuRoot v-model:open="imageModelMenuOpen">
          <DropdownMenuTrigger type="button" :class="imageGenToolBtnClass" :disabled="disabled">
            <Icon icon="mdi:creation" width="16" height="16" class="shrink-0 text-gray-500" />
            <span>{{ currentImageModelLabel }}</span>
            <Icon
              :icon="imageModelMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
              width="16"
              height="16"
              class="text-gray-400"
            />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
              side="top"
              :side-offset="6"
              align="start"
            >
              <DropdownMenuItem
                v-for="opt in jimengImageModelOptions"
                :key="opt.id"
                class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
                @select="imageGenModel = opt.id"
              >
                <span>{{ t(opt.labelKey) }}</span>
                <Icon
                  v-if="imageGenModel === opt.id"
                  icon="radix-icons:check"
                  width="16"
                  height="16"
                  class="text-green-700"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <DropdownMenuRoot v-model:open="imageSizeMenuOpen">
          <DropdownMenuTrigger type="button" :class="imageGenToolBtnClass" :disabled="disabled">
            <Icon icon="material-symbols:aspect-ratio" width="16" height="16" class="shrink-0 text-gray-500" />
            <span>{{ t('common.imageGenRatio') }}</span>
            <Icon
              :icon="imageSizeMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
              width="16"
              height="16"
              class="text-gray-400"
            />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
              side="top"
              :side-offset="6"
              align="start"
            >
              <DropdownMenuItem
                v-for="opt in imageSizeOptions"
                :key="opt.id"
                class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
                @select="imageGenSize = opt.id"
              >
                <span>{{ t(opt.labelKey) }}</span>
                <Icon
                  v-if="imageGenSize === opt.id"
                  icon="radix-icons:check"
                  width="16"
                  height="16"
                  class="text-green-700"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <DropdownMenuRoot v-model:open="imageStyleMenuOpen">
          <DropdownMenuTrigger type="button" :class="imageGenToolBtnClass" :disabled="disabled">
            <Icon icon="mdi:palette-outline" width="16" height="16" class="shrink-0 text-gray-500" />
            <span>{{ t('common.imageGenStyle') }}</span>
            <Icon
              :icon="imageStyleMenuOpen ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
              width="16"
              height="16"
              class="text-gray-400"
            />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
              side="top"
              :side-offset="6"
              align="start"
            >
              <DropdownMenuItem
                class="flex cursor-default select-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
                @select="imageGenStyle = 'default'"
              >
                <span>{{ t('common.imageGenStyleDefault') }}</span>
                <Icon
                  v-if="imageGenStyle === 'default'"
                  icon="radix-icons:check"
                  width="16"
                  height="16"
                  class="text-green-700"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <button
          type="button"
          :class="imageGenToolBtnClass"
          :disabled="disabled"
          :title="t('common.imageGenTemplateSoon')"
          @click="onImageGenTemplateClick"
        >
          <Icon icon="mdi:view-dashboard-outline" width="16" height="16" class="shrink-0 text-gray-500" />
          <span>{{ t('common.imageGenTemplate') }}</span>
        </button>
        <div class="min-w-2 flex-1" />
        <button
          type="button"
          :class="[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-2',
            voiceActive
              ? 'border-sky-500 bg-sky-500 text-white focus-visible:ring-sky-300'
              : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-50 focus-visible:ring-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
          ]"
          :disabled="disabled || !voiceSupported"
          :title="!voiceSupported ? t('common.voiceInputUnsupported') : voiceActive ? t('common.voiceInputStop') : t('common.voiceInputStart')"
          :aria-pressed="voiceActive"
          :aria-label="voiceActive ? t('common.voiceInputStop') : t('common.voiceInputStart')"
          @click="toggleVoice"
        >
          <Icon icon="mdi:microphone" width="20" height="20" />
        </button>
        <Button icon-name="radix-icons:paper-plane" class="shrink-0" @click="onCreate" :disabled="disabled">
          {{ t('common.send') }}
        </Button>
      </div>
    </div>

    <div v-else class="flex items-end gap-2">
      <DropdownMenuRoot v-if="!translateMode && !pptGenMode && !webSearchMode">
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
            class="z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
            :side-offset="6"
            align="start"
          >
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="onPickAllFiles"
            >
              <Icon icon="mdi:folder-upload-outline" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.attachMenuAll') }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="enableImageGenMode"
            >
              <Icon icon="radix-icons:image" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.attachMenuImageGen') }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="enablePptGenMode"
            >
              <Icon icon="mdi:microsoft-powerpoint" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.attachMenuPptGen') }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="enableWebSearchMode"
            >
              <Icon icon="mdi:web" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.webSearchTag') }}</span>
            </DropdownMenuItem>
            <div class="mx-2 my-1 h-px bg-gray-200 dark:bg-slate-600" role="separator" />
            <DropdownMenuItem
              class="flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-gray-800 outline-none data-[highlighted]:bg-gray-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              @select="enableTranslateMode"
            >
              <Icon icon="material-symbols:translate" width="20" height="20" class="shrink-0 text-gray-500" />
              <span>{{ t('common.attachMenuTranslate') }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <textarea
        ref="textareaRef"
        class="max-h-[200px] min-h-[40px] min-w-0 flex-1 resize-y border-0 bg-white py-2 pl-0.5 pr-1 text-sm leading-snug text-gray-900 outline-none focus:ring-0 dark:bg-slate-900 dark:text-slate-100"
        v-model="model"
        :disabled="disabled"
        :placeholder="inputPlaceholder"
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
    <div
      v-if="!translateMode && !pptGenMode && !imageGenMode && !webSearchMode"
      class="mt-1 flex flex-wrap items-center gap-1 border-t border-gray-100 px-0.5 pt-1.5 dark:border-slate-700"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 outline-none hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-sky-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :disabled="disabled"
        @click="enableImageGenMode"
      >
        <Icon icon="radix-icons:image" width="16" height="16" />
        <span>{{ t('common.imageGenTag') }}</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 outline-none hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-sky-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :disabled="disabled"
        @click="enablePptGenMode"
      >
        <Icon icon="mdi:microsoft-powerpoint" width="16" height="16" />
        <span>{{ t('common.pptGenTag') }}</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 outline-none hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-sky-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :disabled="disabled"
        @click="enableWebSearchMode"
      >
        <Icon icon="mdi:web" width="16" height="16" />
        <span>{{ t('common.webSearchTag') }}</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 outline-none hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-sky-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :disabled="disabled"
        @click="enableTranslateMode"
      >
        <Icon icon="material-symbols:translate" width="16" height="16" />
        <span>{{ t('common.translate') }}</span>
      </button>
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
    <p v-if="pptGenHint" class="mt-1 max-w-full px-0.5 text-xs leading-snug text-amber-800 dark:text-amber-200">
      {{ pptGenHint }}
    </p>
    <p v-if="imageGenHint" class="mt-1 max-w-full px-0.5 text-xs leading-snug text-amber-800 dark:text-amber-200">
      {{ imageGenHint }}
    </p>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
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
import { looksLikeImageGenerationPrompt } from '../imageGenPromptDetect'
import {
  DEFAULT_JIMENG_IMAGE_MODEL,
  JIMENG_IMAGE_MODELS,
  type JimengImageModelId,
} from '../jimengModels'
import {
  MAX_IMPORT_ATTACHMENT_BYTES,
  MAX_INLINE_ATTACHMENT_BYTES,
} from '../attachmentLimits'
import type {
  ImageGenSizeId,
  MessageCreatePayload,
  PptGenLengthId,
  PptGenQualityId,
  PptGenScenarioId,
  TranslateTargetId,
} from '../types'

const { t, locale } = useI18n()

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  create: [payload: MessageCreatePayload]
}>()

const model = defineModel<string>()
const attachInput = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const translateMode = ref(false)
const webSearchMode = ref(false)
const pptGenMode = ref(false)
const imageGenMode = ref(false)
const imageGenSize = ref<ImageGenSizeId>('1024x1024')
const imageGenModel = ref<JimengImageModelId>(DEFAULT_JIMENG_IMAGE_MODEL)
const imageSizeMenuOpen = ref(false)
const imageModelMenuOpen = ref(false)
const jimengImageModelOptions = JIMENG_IMAGE_MODELS
const imageStyleMenuOpen = ref(false)
const imageGenStyle = ref<'default'>('default')
const imageGenHint = ref('')

const imageGenToolBtnClass =
  'inline-flex items-center gap-1.5 rounded-lg bg-gray-100/90 px-2.5 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-200/90 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-40 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700'
const translateTarget = ref<TranslateTargetId>('zh-Hans')
const pptGenLength = ref<PptGenLengthId>('medium')
const pptGenQuality = ref<PptGenQualityId>('fast')
const pptGenScenario = ref<PptGenScenarioId>('thesis')
const langMenuOpen = ref(false)
const pptLengthMenuOpen = ref(false)
const pptQualityMenuOpen = ref(false)
const pptScenarioMenuOpen = ref(false)
const pptGenHint = ref('')

const translateLangOptions = [
  { id: 'en' as const, labelKey: 'common.translateLangEnglish' as const },
  { id: 'zh-Hans' as const, labelKey: 'common.translateLangZhHans' as const },
  { id: 'zh-Hant' as const, labelKey: 'common.translateLangZhHant' as const },
]

const currentTranslateLabel = computed(() => {
  const opt = translateLangOptions.find((o) => o.id === translateTarget.value)
  return opt ? t(opt.labelKey) : ''
})

const pptLengthOptions = [
  { id: 'short' as const, labelKey: 'common.pptGenLengthShort' as const },
  { id: 'medium' as const, labelKey: 'common.pptGenLengthMedium' as const },
  { id: 'long' as const, labelKey: 'common.pptGenLengthLong' as const },
]

const currentPptLengthLabel = computed(() => {
  const opt = pptLengthOptions.find((o) => o.id === pptGenLength.value)
  return opt ? t(opt.labelKey) : ''
})

const pptQualityOptions = [
  { id: 'fast' as const, labelKey: 'common.pptGenQualityFast' as const },
  { id: 'premium' as const, labelKey: 'common.pptGenQualityPremium' as const },
]

const currentPptQualityLabel = computed(() => {
  const opt = pptQualityOptions.find((o) => o.id === pptGenQuality.value)
  return opt ? t(opt.labelKey) : ''
})

const pptScenarioOptions = [
  { id: 'thesis' as const, labelKey: 'common.pptGenScenarioThesis' as const },
  { id: 'work-summary' as const, labelKey: 'common.pptGenScenarioWork' as const },
  { id: 'general' as const, labelKey: 'common.pptGenScenarioGeneral' as const },
]

const currentPptScenarioLabel = computed(() => {
  const opt = pptScenarioOptions.find((o) => o.id === pptGenScenario.value)
  return opt ? t(opt.labelKey) : ''
})

const imageSizeOptions = [
  { id: '1024x1024' as const, labelKey: 'common.imageGenSizeSquare' as const },
  { id: '1792x1024' as const, labelKey: 'common.imageGenSizeLandscape' as const },
  { id: '1024x1792' as const, labelKey: 'common.imageGenSizePortrait' as const },
]

const currentImageSizeLabel = computed(() => {
  const opt = imageSizeOptions.find((o) => o.id === imageGenSize.value)
  return opt ? t(opt.labelKey) : ''
})

const currentImageModelLabel = computed(() => {
  const opt = jimengImageModelOptions.find((o) => o.id === imageGenModel.value)
  return opt ? t(opt.labelKey) : ''
})

const inputPlaceholder = computed(() => {
  if (translateMode.value) return t('common.translatePlaceholder')
  if (webSearchMode.value) return t('common.webSearchPlaceholder')
  if (pptGenMode.value) return t('common.pptGenPlaceholder')
  if (imageGenMode.value) return t('common.imageGenPlaceholder')
  return undefined
})

function exitSpecialModes() {
  translateMode.value = false
  webSearchMode.value = false
  pptGenMode.value = false
  imageGenMode.value = false
}

watch(translateMode, (on) => {
  if (on) {
    webSearchMode.value = false
    pptGenMode.value = false
    imageGenMode.value = false
    pending.value = []
  }
})

watch(webSearchMode, (on) => {
  if (on) {
    translateMode.value = false
    pptGenMode.value = false
    imageGenMode.value = false
  }
})

watch(pptGenMode, (on) => {
  if (on) {
    translateMode.value = false
    webSearchMode.value = false
    imageGenMode.value = false
    pptGenHint.value = ''
  }
})

watch(imageGenMode, (on) => {
  if (on) {
    translateMode.value = false
    webSearchMode.value = false
    pptGenMode.value = false
    imageGenHint.value = ''
  } else {
    imageGenHint.value = ''
  }
})

type Pending = { id: string; name: string; dataUrl?: string; storedPath?: string }
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

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function isImageName(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
}

function isPptxName(name: string) {
  return /\.pptx$/i.test(name)
}

function isLegacyPptName(name: string) {
  return /\.ppt$/i.test(name) && !isPptxName(name)
}

function attachmentFileIcon(name: string) {
  if (isPptxName(name) || isLegacyPptName(name)) return 'mdi:microsoft-powerpoint'
  if (/\.docx?$/i.test(name)) return 'mdi:microsoft-word'
  if (/\.pdf$/i.test(name)) return 'mdi:file-pdf-box'
  if (/\.(xlsx?|csv)$/i.test(name)) return 'mdi:microsoft-excel'
  return 'mdi:file-document-outline'
}

function topicFromAttachmentName(name: string) {
  return name.replace(/\.[^.]+$/, '').trim() || name
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

// 勿在 template 中内联 */* 的 accept 字面量，星号加斜杠会误结束注释
const ACCEPT_ALL = '*/*' as const
const ACCEPT_PPT_REFERENCE =
  '.pptx,.docx,.pdf,.txt,.md,.doc,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf' as const

function onPickAllFiles() {
  openPicker(ACCEPT_ALL)
}

function enableWebSearchMode() {
  exitSpecialModes()
  webSearchMode.value = true
  void nextTick(() => textareaRef.value?.focus())
}

function enableTranslateMode() {
  pending.value = []
  pptGenMode.value = false
  imageGenMode.value = false
  webSearchMode.value = false
  translateMode.value = true
}

function enablePptGenMode() {
  translateMode.value = false
  imageGenMode.value = false
  pptGenMode.value = true
  pptGenHint.value = ''
  void nextTick(() => textareaRef.value?.focus())
}

function enableImageGenMode() {
  exitSpecialModes()
  imageGenMode.value = true
  imageGenHint.value = ''
  void nextTick(() => textareaRef.value?.focus())
}

function onPickPptReferenceFiles() {
  openPicker(ACCEPT_PPT_REFERENCE)
}

function onPickImageReference() {
  openPicker('image/*')
}

function onImageGenTemplateClick() {
  imageGenHint.value = t('common.imageGenTemplateSoon')
}

function fileLocalPath(file: File): string | undefined {
  try {
    const p = window.electronAPI.getPathForFile?.(file)
    return p && p.length > 0 ? p : undefined
  } catch {
    return undefined
  }
}

const onAttachChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const list = target.files
  if (!list?.length) return
  const inlineMaxMb = Math.round(MAX_INLINE_ATTACHMENT_BYTES / 1024 / 1024)
  const importMaxMb = Math.round(MAX_IMPORT_ATTACHMENT_BYTES / 1024 / 1024)
  let hint = ''
  for (const file of Array.from(list)) {
    if (pending.value.length >= MAX_FILES) {
      hint = t('common.attachMaxFiles', { n: MAX_FILES })
      break
    }
    if (pptGenMode.value && isLegacyPptName(file.name)) {
      hint = t('common.pptGenLegacyPpt')
      continue
    }
    if (file.size > MAX_IMPORT_ATTACHMENT_BYTES) {
      hint = t('common.attachTooLarge', { name: file.name, mb: importMaxMb })
      continue
    }

    const localPath = fileLocalPath(file)
    const useImport =
      localPath &&
      typeof window.electronAPI.importUserAttachment === 'function' &&
      file.size > MAX_INLINE_ATTACHMENT_BYTES

    if (useImport) {
      try {
        const storedPath = await window.electronAPI.importUserAttachment(localPath, file.name)
        pending.value.push({ id: uid(), name: file.name, storedPath })
        if (pptGenMode.value) pptGenHint.value = ''
      } catch (e) {
        console.error('import attachment', e)
        const msg = e instanceof Error ? e.message : String(e)
        hint =
          msg === 'too_large'
            ? t('common.attachTooLarge', { name: file.name, mb: importMaxMb })
            : t('common.attachReadFailed', { name: file.name })
      }
      continue
    }

    if (file.size > MAX_INLINE_ATTACHMENT_BYTES) {
      hint = t('common.attachTooLarge', { name: file.name, mb: inlineMaxMb })
      continue
    }

    try {
      const dataUrl = await readAsDataUrl(file)
      pending.value.push({ id: uid(), name: file.name, dataUrl })
      if (pptGenMode.value) pptGenHint.value = ''
    } catch (e) {
      console.error('read file', e)
      hint = t('common.attachReadFailed', { name: file.name })
    }
  }
  if (hint) {
    if (pptGenMode.value) pptGenHint.value = hint
    else imageGenHint.value = hint
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
  const uploads = pending.value.map(({ name, dataUrl, storedPath }) =>
    storedPath ? { name, storedPath } : { name, dataUrl: dataUrl! },
  )
  if (imageGenMode.value) {
    if (!text) {
      imageGenHint.value = t('common.imageGenNeedPrompt')
      return
    }
    imageGenHint.value = ''
    imageSizeMenuOpen.value = false
    imageModelMenuOpen.value = false
    emit('create', {
      text,
      uploads: [],
      generateImageWithModel: { size: imageGenSize.value, model: imageGenModel.value },
    })
  } else if (pptGenMode.value) {
    if (!text && uploads.length === 0) {
      pptGenHint.value = t('common.pptGenNeedTopicOrFile')
      return
    }
    const sendText = text || topicFromAttachmentName(uploads[0].name)
    pptGenHint.value = ''
    pptLengthMenuOpen.value = false
    emit('create', {
      text: sendText,
      uploads,
      pptGenerateWithModel: {
        length: pptGenLength.value,
        quality: pptGenQuality.value,
        scenario: pptGenScenario.value,
      },
    })
  } else if (translateMode.value) {
    if (!text && uploads.length === 0) return
    langMenuOpen.value = false
    emit('create', {
      text,
      uploads: [],
      translateWithModel: { target: translateTarget.value },
    })
  } else if (webSearchMode.value) {
    if (!text) return
    emit('create', {
      text,
      uploads,
      webSearchWithModel: true,
    })
  } else {
    if (!text && uploads.length === 0) return
    if (text && uploads.length === 0 && looksLikeImageGenerationPrompt(text)) {
      imageGenHint.value = ''
      emit('create', {
        text,
        uploads: [],
        generateImageWithModel: { size: imageGenSize.value, model: imageGenModel.value },
      })
    } else {
      emit('create', { text, uploads })
    }
  }

  pending.value = []
  model.value = ''
}

const onTextareaKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return
  if (e.shiftKey) return
  if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return
  e.preventDefault()
  void onCreate()
}

function focusInput() {
  textareaRef.value?.focus()
}

defineExpose({ focusInput })
</script>
