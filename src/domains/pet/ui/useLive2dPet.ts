import * as PIXI from 'pixi.js'

export type Live2dPetVisualState = 'idle' | 'thinking' | 'speaking'

type Live2DModelType = {
  internalModel: {
    coreModel: {
      setParameterValueById: (id: string, value: number) => void
    }
  }
  anchor: { set: (x: number, y: number) => void }
  scale: { set: (x: number, y: number) => void }
  x: number
  y: number
  width: number
  height: number
  on: (event: string, fn: (...args: unknown[]) => void) => void
  destroy: () => void
  motion: (group: string, index?: number) => Promise<unknown>
}

let Live2DModelCtor: { from: (src: string) => Promise<Live2DModelType> } | null = null

async function loadCubismCore(): Promise<void> {
  if (typeof (window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore !== 'undefined') {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = './live2dcubismcore.min.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('无法加载 live2dcubismcore.min.js（请将 Cubism Core 放入 public/）'))
    document.head.appendChild(s)
  })
}

async function ensureLive2DModel() {
  if (Live2DModelCtor) return Live2DModelCtor
  await loadCubismCore()
  ;(window as unknown as { PIXI: typeof PIXI }).PIXI = PIXI
  // pixi-live2d-display registers itself onto PIXI
  const mod = await import('pixi-live2d-display/cubism4')
  Live2DModelCtor = mod.Live2DModel as unknown as typeof Live2DModelCtor
  try {
    ;(Live2DModelCtor as unknown as { registerTicker: (t: typeof PIXI.Ticker) => void }).registerTicker(
      PIXI.Ticker,
    )
  } catch {
    /* ignore */
  }
  return Live2DModelCtor!
}

const MODEL_CANDIDATES = [
  './live2d/hiyori/Hiyori.model3.json',
  './live2d/hiyori/hiyori_free_t08.model3.json',
  './live2d/haru/Haru.model3.json',
]

export function useLive2dPet() {
  let app: PIXI.Application | null = null
  let model: Live2DModelType | null = null
  let speaking = false
  let visualState: Live2dPetVisualState = 'idle'
  let thinkTicker: ((delta: number) => void) | null = null

  async function mount(host: HTMLElement) {
    destroy()
    const w = host.clientWidth || 320
    const h = host.clientHeight || 480
    app = new PIXI.Application({
      width: w,
      height: h,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    host.appendChild(app.view as HTMLCanvasElement)

    const Live2DModel = await ensureLive2DModel()

    let lastErr: unknown
    for (const src of MODEL_CANDIDATES) {
      try {
        model = await Live2DModel.from(src)
        lastErr = undefined
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!model) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('未找到 Live2D 模型，请将 Sample 放入 public/live2d/')
    }

    model.anchor.set(0.5, 0.5)
    const scale = Math.min((w * 0.9) / model.width, (h * 0.92) / model.height)
    model.scale.set(scale)
    model.x = w / 2
    model.y = h * 0.55
    app.stage.addChild(model as unknown as PIXI.DisplayObject)

    thinkTicker = () => {
      if (!model || speaking || visualState !== 'thinking') return
      const t = performance.now() / 1000
      try {
        model.internalModel.coreModel.setParameterValueById(
          'ParamAngleZ',
          Math.sin(t * 2) * 8,
        )
      } catch {
        /* model may lack param */
      }
    }
    app.ticker.add(thinkTicker)

    try {
      void model.motion('Idle')
    } catch {
      /* optional */
    }
  }

  function setState(state: Live2dPetVisualState) {
    visualState = state
    if (!model) return
    if (state === 'idle') {
      try {
        model.internalModel.coreModel.setParameterValueById('ParamAngleZ', 0)
      } catch {
        /* ignore */
      }
    }
  }

  function setSpeaking(v: boolean) {
    speaking = v
  }

  function setMouthOpen(v: number) {
    if (!model) return
    const clamped = Math.max(0, Math.min(1, v))
    try {
      model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', clamped)
    } catch {
      /* ignore */
    }
  }

  function tap() {
    if (!model) return
    try {
      void model.motion('TapBody')
    } catch {
      try {
        void model.motion('Tap')
      } catch {
        /* optional */
      }
    }
  }

  function destroy() {
    if (app && thinkTicker) {
      app.ticker.remove(thinkTicker)
    }
    thinkTicker = null
    if (model) {
      try {
        model.destroy()
      } catch {
        /* ignore */
      }
      model = null
    }
    if (app) {
      try {
        app.destroy(true, { children: true, texture: true, baseTexture: true })
      } catch {
        /* ignore */
      }
      app = null
    }
  }

  return { mount, destroy, setState, setSpeaking, setMouthOpen, tap }
}
