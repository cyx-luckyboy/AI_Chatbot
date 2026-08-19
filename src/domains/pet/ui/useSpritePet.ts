export type SpritePetVisualState = 'idle' | 'thinking' | 'speaking'
export type SpritePetAction = 'idle' | 'jump' | 'spin' | 'wave' | 'lean' | 'happy' | 'shake' | 'walk'

const P1 = './pet/nailong/p1.png'
const P2 = './pet/nailong/p2.png'

/**
 * 完整奶龙人设：PNG 头部 + CSS 躯干/四肢/翅膀/尾巴，带动作。
 * 头素材来自 nailong-desktop-pet。
 */
export function useSpritePet() {
  let root: HTMLDivElement | null = null
  let faceOpen: HTMLImageElement | null = null
  let faceBlink: HTMLImageElement | null = null
  let bubble: HTMLDivElement | null = null
  let visualState: SpritePetVisualState = 'idle'
  let speaking = false
  let expressionTimer: ReturnType<typeof setTimeout> | undefined
  let idleTimer: ReturnType<typeof setInterval> | undefined
  let actionTimer: ReturnType<typeof setTimeout> | undefined
  let autoActionTimer: ReturnType<typeof setInterval> | undefined

  function showBlink(on: boolean) {
    if (!faceOpen || !faceBlink) return
    faceOpen.style.opacity = on ? '0' : '1'
    faceBlink.style.opacity = on ? '1' : '0'
  }

  function flashExpression(ms = 700) {
    if (expressionTimer) clearTimeout(expressionTimer)
    showBlink(true)
    expressionTimer = setTimeout(() => {
      if (!speaking && visualState !== 'thinking') showBlink(false)
      expressionTimer = undefined
    }, ms)
  }

  function clearActionClass() {
    if (!root) return
    root.classList.remove(
      'act-jump',
      'act-spin',
      'act-wave',
      'act-lean',
      'act-happy',
      'act-shake',
      'act-walk',
    )
  }

  function playAction(action: SpritePetAction, ms = 800) {
    if (!root || action === 'idle') return
    clearActionClass()
    void root.offsetWidth
    root.classList.add(`act-${action}`)
    if (actionTimer) clearTimeout(actionTimer)
    actionTimer = setTimeout(() => {
      clearActionClass()
      actionTimer = undefined
    }, ms)
  }

  function showBubble(text: string, ms = 2800) {
    if (!bubble) return
    bubble.textContent = text
    bubble.classList.add('is-show')
    window.setTimeout(() => bubble?.classList.remove('is-show'), ms)
  }

  function el(tag: string, className: string, parent?: HTMLElement): HTMLElement {
    const n = document.createElement(tag)
    n.className = className
    parent?.appendChild(n)
    return n
  }

  async function mount(host: HTMLElement) {
    destroy()
    host.innerHTML = ''

    root = el('div', 'nailong-figure', host) as HTMLDivElement
    bubble = el('div', 'nailong-bubble', root) as HTMLDivElement
    bubble.setAttribute('aria-live', 'polite')

    const scene = el('div', 'nailong-scene', root)
    el('div', 'nailong-floor', scene)
    el('div', 'nailong-shadow', scene)

    const character = el('div', 'nailong-character', scene)

    // 翅膀（在身后）
    const wings = el('div', 'nailong-wings', character)
    el('div', 'nailong-wing nailong-wing-l', wings)
    el('div', 'nailong-wing nailong-wing-r', wings)

    // 尾巴
    el('div', 'nailong-tail', character)

    // 身体组
    const torsoWrap = el('div', 'nailong-torso-wrap', character)
    const torso = el('div', 'nailong-torso', torsoWrap)
    el('div', 'nailong-belly', torso)

    // 手臂
    const armL = el('div', 'nailong-arm nailong-arm-l', torsoWrap)
    el('div', 'nailong-hand', armL)
    const armR = el('div', 'nailong-arm nailong-arm-r', torsoWrap)
    el('div', 'nailong-hand', armR)

    // 头（PNG）
    const head = el('div', 'nailong-head', torsoWrap)
    faceOpen = document.createElement('img')
    faceOpen.className = 'nailong-face nailong-face-open'
    faceOpen.alt = 'nailong'
    faceOpen.draggable = false
    faceOpen.src = P1
    faceBlink = document.createElement('img')
    faceBlink.className = 'nailong-face nailong-face-blink'
    faceBlink.alt = ''
    faceBlink.draggable = false
    faceBlink.src = P2
    faceBlink.style.opacity = '0'
    head.appendChild(faceOpen)
    head.appendChild(faceBlink)
    el('div', 'nailong-head-shine', head)

    // 腿
    const legs = el('div', 'nailong-legs', character)
    const legL = el('div', 'nailong-leg nailong-leg-l', legs)
    el('div', 'nailong-foot', legL)
    const legR = el('div', 'nailong-leg nailong-leg-r', legs)
    el('div', 'nailong-foot', legR)

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        faceOpen!.onload = () => resolve()
        faceOpen!.onerror = () => reject(new Error('无法加载 pet/nailong/p1.png'))
      }),
      new Promise<void>((resolve, reject) => {
        faceBlink!.onload = () => resolve()
        faceBlink!.onerror = () => reject(new Error('无法加载 pet/nailong/p2.png'))
      }),
    ])

    idleTimer = setInterval(() => {
      if (speaking || visualState === 'thinking') return
      flashExpression(480 + Math.random() * 320)
    }, 4200 + Math.random() * 3200)

    const autoActions: SpritePetAction[] = ['wave', 'walk', 'jump', 'happy', 'lean']
    autoActionTimer = setInterval(() => {
      if (speaking || visualState !== 'idle') return
      const a = autoActions[Math.floor(Math.random() * autoActions.length)]
      playAction(a, a === 'walk' ? 1400 : a === 'spin' ? 950 : 850)
    }, 7000 + Math.random() * 5000)
  }

  function setState(state: SpritePetVisualState) {
    visualState = state
    root?.classList.toggle('is-thinking', state === 'thinking')
    root?.classList.toggle('is-speaking', state === 'speaking')
    if (state === 'thinking') {
      showBlink(true)
      playAction('shake', 1000)
    } else if (state === 'speaking') {
      playAction('happy', 900)
    } else if (state === 'idle' && !speaking) {
      showBlink(false)
    }
  }

  function setSpeaking(v: boolean) {
    speaking = v
    root?.classList.toggle('is-speaking', v)
  }

  function setMouthOpen(v: number) {
    if (!speaking) return
    showBlink(v > 0.4)
  }

  function tap(opts?: { line?: string }) {
    const actions: SpritePetAction[] = ['jump', 'wave', 'happy', 'spin', 'walk']
    const a = actions[Math.floor(Math.random() * actions.length)]
    playAction(a, a === 'walk' ? 1200 : a === 'spin' ? 950 : 800)
    flashExpression(700)
    if (opts?.line) showBubble(opts.line, 2800)
  }

  function destroy() {
    if (expressionTimer) clearTimeout(expressionTimer)
    if (idleTimer) clearInterval(idleTimer)
    if (actionTimer) clearTimeout(actionTimer)
    if (autoActionTimer) clearInterval(autoActionTimer)
    expressionTimer = undefined
    idleTimer = undefined
    actionTimer = undefined
    autoActionTimer = undefined
    root?.remove()
    root = null
    faceOpen = null
    faceBlink = null
    bubble = null
    speaking = false
    visualState = 'idle'
  }

  return { mount, destroy, setState, setSpeaking, setMouthOpen, tap, showBubble, playAction }
}
