<template>
  <canvas
    ref="canvasRef"
    class="h-16 w-full cursor-pointer rounded-md bg-slate-100 dark:bg-slate-800"
    @click="onClick"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  peaks: number[]
  progress?: number
}>()

const emit = defineEmits<{ seek: [ratio: number] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  const w = rect.width
  const h = rect.height
  ctx.clearRect(0, 0, w, h)

  const peaks = props.peaks.length > 0 ? props.peaks : new Array(300).fill(0.05)
  const barW = w / peaks.length
  const mid = h / 2
  const progressX = (props.progress ?? 0) * w

  peaks.forEach((p, i) => {
    const x = i * barW
    const amp = Math.max(2, p * (h * 0.85))
    const played = x < progressX
    ctx.fillStyle = played ? '#16a34a' : '#94a3b8'
    ctx.fillRect(x, mid - amp / 2, Math.max(1, barW - 0.5), amp)
  })

  if (props.progress != null && props.progress > 0) {
    ctx.strokeStyle = '#15803d'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(progressX, 0)
    ctx.lineTo(progressX, h)
    ctx.stroke()
  }
}

function onClick(ev: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
  emit('seek', ratio)
}

let ro: ResizeObserver | null = null

onMounted(() => {
  draw()
  if (canvasRef.value) {
    ro = new ResizeObserver(() => draw())
    ro.observe(canvasRef.value)
  }
})

onUnmounted(() => {
  ro?.disconnect()
})

watch(() => [props.peaks, props.progress], draw, { deep: true })
</script>
