/** 火山即梦 Visual API 文生图 req_key（与控制台开通的服务对应） */
export type JimengImageModelId = 'jimeng_t2i_v30' | 'jimeng_t2i_v40' | 'jimeng_t2i_v46'

export type JimengImageModelOption = {
  id: JimengImageModelId
  reqKey: JimengImageModelId
  labelKey:
    | 'common.imageGenModel30'
    | 'common.imageGenModel40'
    | 'common.imageGenModel46'
}

export const JIMENG_IMAGE_MODELS: JimengImageModelOption[] = [
  { id: 'jimeng_t2i_v46', reqKey: 'jimeng_t2i_v46', labelKey: 'common.imageGenModel46' },
  { id: 'jimeng_t2i_v40', reqKey: 'jimeng_t2i_v40', labelKey: 'common.imageGenModel40' },
  { id: 'jimeng_t2i_v30', reqKey: 'jimeng_t2i_v30', labelKey: 'common.imageGenModel30' },
]

export const DEFAULT_JIMENG_IMAGE_MODEL: JimengImageModelId = 'jimeng_t2i_v40'

export function resolveJimengImageModelId(raw?: string | null): JimengImageModelId {
  const id = (raw || '').trim() as JimengImageModelId
  if (JIMENG_IMAGE_MODELS.some((m) => m.id === id)) return id
  return DEFAULT_JIMENG_IMAGE_MODEL
}

export function jimengReqKeyForModel(modelId: JimengImageModelId): string {
  return resolveJimengImageModelId(modelId)
}
