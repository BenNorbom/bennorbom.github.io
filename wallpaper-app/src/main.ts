import { BlackHoleRenderer } from './BlackHoleRenderer'
import { DURATION } from './physics'

declare global {
  interface Window {
    __bhWallpaperReady?: boolean
    bhWallpaperDesktop?: {
      onWallpaperPause(listener: (paused: boolean) => void): () => void
    }
  }
}

const params = new URLSearchParams(location.search)
const testing = params.get('test') === '1'
const initialTime = Number(params.get('time'))

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const renderer = new BlackHoleRenderer(canvas)
renderer.setQualityTier(0.5)

let orbitSeconds = Number.isFinite(initialTime) && initialTime >= 0 ? initialTime % DURATION : 0
let materialSeconds = orbitSeconds
let pausedByCover = false
let contextLost = false
let rafId = 0
let lastStamp = 0
const frameTimes: number[] = []
let cooldown = 0
let slowCount = 0
let fastCount = 0

window.addEventListener('resize', () => renderer.resize())
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => renderer.resize()).observe(canvas)
}

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault()
  contextLost = true
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
})

canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false
  renderer.resize()
  renderer.render(orbitSeconds, materialSeconds)
  if (!pausedByCover && !testing && !rafId) {
    lastStamp = 0
    rafId = requestAnimationFrame(tick)
  }
})

renderer.render(orbitSeconds, materialSeconds)
window.__bhWallpaperReady = true

function tick(now: number) {
  rafId = 0
  if (pausedByCover || testing || contextLost) return
  if (lastStamp > 0) {
    const dtMs = now - lastStamp
    if (dtMs > 0 && dtMs < 250) {
      const dt = dtMs / 1000
      orbitSeconds = (orbitSeconds + dt) % DURATION
      materialSeconds += dt

      frameTimes.push(dtMs)
      if (frameTimes.length >= 45) {
        const sorted = [...frameTimes].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        frameTimes.length = 0
        if (cooldown > 0) {
          cooldown--
        } else {
          slowCount = median > 43 ? slowCount + 1 : 0
          fastCount = median < 35 ? fastCount + 1 : 0
          if (slowCount >= 2 && renderer.scale > 0.25) {
            renderer.setQualityTier(Math.max(0.25, renderer.scale - 0.05))
            slowCount = 0
            cooldown = 2
          } else if (fastCount >= 5 && renderer.scale < 0.75) {
            renderer.setQualityTier(Math.min(0.75, renderer.scale + 0.05))
            fastCount = 0
            cooldown = 3
          }
        }
      }
    }
  }
  lastStamp = now
  renderer.render(orbitSeconds, materialSeconds)
  rafId = requestAnimationFrame(tick)
}

function setPaused(paused: boolean) {
  pausedByCover = paused
  if (paused) {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    lastStamp = 0
  } else if (!rafId && !testing && !contextLost) {
    lastStamp = 0
    rafId = requestAnimationFrame(tick)
  }
}

if (window.bhWallpaperDesktop) {
  window.bhWallpaperDesktop.onWallpaperPause(setPaused)
} else if (!testing) {
  rafId = requestAnimationFrame(tick)
}
