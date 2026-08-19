import * as THREE from 'three'

export type ThreePetVisualState = 'idle' | 'thinking' | 'speaking'
export type ThreePetAction = 'idle' | 'jump' | 'spin' | 'wave' | 'happy' | 'shake' | 'walk'

/** Codex v2 精灵表：https://github.com/erich207/nailong-codex-pet */
const SHEET = './pet/nailong/codex/spritesheet.webp'
const COLS = 8
const ROWS = 11

const STATE_ROWS: Record<string, { row: number; frames: number }> = {
  idle: { row: 0, frames: 7 },
  'running-right': { row: 1, frames: 8 },
  'running-left': { row: 2, frames: 8 },
  waving: { row: 3, frames: 4 },
  jumping: { row: 4, frames: 5 },
  failed: { row: 5, frames: 8 },
  waiting: { row: 6, frames: 6 },
  running: { row: 7, frames: 6 },
  review: { row: 8, frames: 6 },
  lookA: { row: 9, frames: 8 },
  lookB: { row: 10, frames: 8 },
}

function actionToClip(action: ThreePetAction, visual: ThreePetVisualState): keyof typeof STATE_ROWS {
  if (action === 'jump' || action === 'happy') return 'jumping'
  if (action === 'wave') return 'waving'
  if (action === 'walk') return 'running-right'
  if (action === 'shake') return 'failed'
  if (action === 'spin') return 'lookA'
  if (visual === 'thinking') return 'waiting'
  if (visual === 'speaking') return 'waving'
  return 'idle'
}

/**
 * 使用 GitHub 开源奶龙 Codex 精灵表（别人做好的动画），Three.js 广告牌 + 轻微立体透视。
 */
export function useThreeNailongPet() {
  let renderer: THREE.WebGLRenderer | null = null
  let scene: THREE.Scene | null = null
  let camera: THREE.PerspectiveCamera | null = null
  let mesh: THREE.Mesh | null = null
  let material: THREE.MeshBasicMaterial | null = null
  let bubble: HTMLDivElement | null = null
  let raf = 0
  let visualState: ThreePetVisualState = 'idle'
  let speaking = false
  let action: ThreePetAction = 'idle'
  let actionUntil = 0
  let frame = 0
  let frameAcc = 0
  let autoActionTimer: ReturnType<typeof setInterval> | undefined
  let clock = new THREE.Clock()

  function showBubble(text: string, ms = 2800) {
    if (!bubble) return
    bubble.textContent = text
    bubble.classList.add('is-show')
    window.setTimeout(() => bubble?.classList.remove('is-show'), ms)
  }

  function playAction(a: ThreePetAction, ms = 900) {
    action = a
    actionUntil = performance.now() + ms
    frame = 0
    frameAcc = 0
  }

  function setState(state: ThreePetVisualState) {
    visualState = state
    if (state === 'thinking') playAction('shake', 1000)
    else if (state === 'speaking') playAction('wave', 1200)
  }

  function setSpeaking(v: boolean) {
    speaking = v
  }

  function setMouthOpen(_v: number) {
    /* 精灵表无独立口型层；说话态用 waving 行表达 */
  }

  function tap(opts?: { line?: string }) {
    const acts: ThreePetAction[] = ['jump', 'wave', 'happy', 'walk', 'spin']
    playAction(acts[Math.floor(Math.random() * acts.length)], 1200)
    if (opts?.line) showBubble(opts.line, 2800)
  }

  function currentClip() {
    const now = performance.now()
    if (now > actionUntil && action !== 'idle') action = 'idle'
    const key = actionToClip(action, visualState)
    return STATE_ROWS[key]
  }

  function applyFrame(col: number, row: number) {
    if (!material?.map) return
    const map = material.map
    map.repeat.set(1 / COLS, 1 / ROWS)
    map.offset.set(col / COLS, 1 - (row + 1) / ROWS)
    map.needsUpdate = true
  }

  function animate() {
    raf = requestAnimationFrame(animate)
    if (!renderer || !scene || !camera || !mesh) return
    const dt = clock.getDelta()
    const clip = currentClip()
    const fps = speaking || action !== 'idle' ? 10 : 7
    frameAcc += dt
    if (frameAcc >= 1 / fps) {
      frameAcc = 0
      frame = (frame + 1) % clip.frames
      applyFrame(frame, clip.row)
    }

    const t = clock.elapsedTime
    mesh.position.y = Math.sin(t * 2.2) * 0.06
    mesh.rotation.y = Math.sin(t * 0.55) * 0.22
    mesh.rotation.x = 0.06 + Math.sin(t * 0.8) * 0.03
    if (action === 'jump' || action === 'happy') {
      const p = Math.max(0, (actionUntil - performance.now()) / 900)
      mesh.position.y += Math.sin((1 - p) * Math.PI) * 0.25
    }
    renderer.render(scene, camera)
  }

  async function mount(host: HTMLElement) {
    destroy()
    host.innerHTML = ''
    host.style.position = 'relative'

    bubble = document.createElement('div')
    bubble.className = 'nailong-bubble'
    host.appendChild(bubble)

    const w = host.clientWidth || 320
    const h = host.clientHeight || 400

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100)
    camera.position.set(0, 0.2, 2.6)
    camera.lookAt(0, 0.05, 0)

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h)
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
    scene.add(hemi)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 48),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.16 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.55
    scene.add(ground)

    const loader = new THREE.TextureLoader()
    const tex = await loader.loadAsync(SHEET)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.LinearFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping

    material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), material)
    mesh.position.y = 0.05
    scene.add(mesh)
    applyFrame(0, 0)

    clock = new THREE.Clock()
    animate()

    autoActionTimer = setInterval(() => {
      if (speaking || visualState !== 'idle') return
      const acts: ThreePetAction[] = ['wave', 'jump', 'walk', 'happy', 'spin']
      playAction(acts[Math.floor(Math.random() * acts.length)], 1400)
    }, 8000)
  }

  function destroy() {
    cancelAnimationFrame(raf)
    raf = 0
    if (autoActionTimer) clearInterval(autoActionTimer)
    autoActionTimer = undefined
    if (renderer) {
      renderer.dispose()
      renderer.domElement.remove()
    }
    material?.map?.dispose()
    material?.dispose()
    renderer = null
    scene = null
    camera = null
    mesh = null
    material = null
    bubble?.remove()
    bubble = null
  }

  return { mount, destroy, setState, setSpeaking, setMouthOpen, tap, showBubble, playAction }
}
