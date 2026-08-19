<template>
  <div class="provider-select w-full">
    <SelectRoot
      :model-value="currentModel || undefined"
      :disabled="disabled"
      @update:model-value="onModelUpdate"
    >
      <SelectTrigger
        class="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white py-1.5 px-3 shadow-sm outline-none data-[placeholder]:text-gray-400 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:data-[placeholder]:text-slate-500"
      >
        <SelectValue :placeholder="t('provider.selectModel')" />
        <Icon
          icon="radix-icons:chevron-down"
          class="h-5 w-5"
        />
      </SelectTrigger>
      <SelectPortal>
        <SelectContent class="z-[100] rounded-md border border-gray-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-900">
          <SelectViewport class="p-2">
            <div v-for="provider in items" :key="provider.id">
              <SelectLabel class="flex h-7 items-center px-6 text-gray-500 dark:text-slate-400">
                <img :src="provider.avatar" :alt="provider.name" class="h-5 w-5 mr-2 rounded">
                {{provider.title}}
              </SelectLabel>
              <SelectGroup>
                <SelectItem 
                  v-for="(model, index) in provider.models" :key="index" :value="`${provider.id}/${model}`"
                  class="outline-none rounded flex items-center h-7 px-6 relative
                    text-green-700 cursor-pointer
                    data-[highlighted]:bg-green-700 data-[highlighted]:text-white
                  "
                >
                  <SelectItemIndicator class=" absolute left-2 w-6">
                    <Icon icon="radix-icons:check" />
                  </SelectItemIndicator>
                  <SelectItemText>{{model}}</SelectItemText>
                </SelectItem>
              </SelectGroup>
              <SelectSeparator class="my-2 h-px bg-gray-300 dark:bg-slate-600" />
            </div>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>
  
<script lang="ts" setup>
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectPortal,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'radix-vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { ProviderProps } from '../../shared/types'

const { t } = useI18n()
withDefaults(
  defineProps<{ items: ProviderProps[]; disabled?: boolean }>(),
  { disabled: false },
)
const currentModel = defineModel<string>({ default: '' })

function onModelUpdate(value: string | undefined) {
  currentModel.value = value ?? ''
}
</script>