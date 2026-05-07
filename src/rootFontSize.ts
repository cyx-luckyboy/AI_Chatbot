/** 与设置里 NumberField 的 min/max 一致 */
const MIN = 12
const MAX = 20
const DEFAULT = 14

export function applyRootFontSize(px: number | undefined): void {
  const raw = Number(px)
  const n = Number.isFinite(raw) ? Math.round(raw) : DEFAULT
  const clamped = Math.min(MAX, Math.max(MIN, n))
  document.documentElement.style.fontSize = `${clamped}px`
}
