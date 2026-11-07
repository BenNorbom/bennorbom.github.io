import { SITE_CONTENT } from '../../siteContent'
import { BlackHoleRenderer } from './BlackHoleRenderer'
import { DURATION, GRAVITATIONAL_RADIUS_KM, AU_KM, SPIN, horizonRadius, clampTime } from './physics'
import { FLIGHT_CHAPTERS } from './flight'
import { detectMobileUser } from '../../mobileMode'

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

export function mountBlackHoleSection(container: HTMLElement): () => void {
  const c = SITE_CONTENT.blackHole

  container.innerHTML = `
    <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col gap-6">
      <!-- Section Heading -->
      <div class="space-y-2.5 max-w-4xl">
        <div data-edit-box style="${c.eyebrow.trim() ? '' : 'display:none'}" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-400/25 text-[11px] font-mono tracking-wider uppercase text-sky-300">
          <span data-edit-key="blackHole.eyebrow">${c.eyebrow}</span>
        </div>
        <h2 data-edit-box data-edit-key="blackHole.title" class="text-2xl sm:text-4xl font-bold tracking-tight text-white">
          ${c.title}
        </h2>
        <p data-edit-box data-edit-key="blackHole.description" class="text-sm sm:text-[15px] text-slate-300 leading-relaxed whitespace-pre-line">${c.description.trim()}</p>
      </div>

      <!-- Interactive Kerr Black Hole Viewport Card -->
      <div
        id="bhViewportShell"
        class="relative rounded-2xl overflow-hidden border border-slate-800/90 bg-[#040507] shadow-[0_25px_70px_-20px_rgba(14,165,233,0.22)] flex flex-col"
      >
        <!-- Top Simulation Bar -->
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/90 border-b border-slate-800/80 text-xs">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono font-semibold">KERR RK4</span>
            <span data-edit-key="blackHole.simTitle" class="font-semibold text-slate-100">${c.simTitle}</span>
            <span id="bhPhaseBadge" class="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700/80 font-mono text-[11px]">
              Distant Silhouette (35 M)
            </span>
          </div>

          <!-- Chapter Presets -->
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap max-w-full pb-0.5 sm:pb-0" role="group" aria-label="Orbital passage chapters">
            ${FLIGHT_CHAPTERS.map(
              (ch, idx) => `
              <button
                type="button"
                data-bh-chapter="${ch.time}"
                class="bh-chapter-btn shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
                  idx === 0
                    ? 'bg-sky-500/25 text-sky-200 border-sky-400/50'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800'
                }"
              >
                ${ch.shortLabel}
              </button>
            `,
            ).join('')}
          </div>
        </div>

        <!-- WebGL2 Ray-Traced Canvas Area -->
        <div id="bhStage" class="relative w-full h-[340px] sm:h-[560px] lg:h-[620px] bg-[#040507] select-none">
          <canvas
            id="bhCanvas"
            class="w-full h-full block cursor-grab active:cursor-grabbing"
            aria-label="Interactive real-time Kerr black hole ray-tracing simulation"
          ></canvas>

          <!-- WebGL Fallback Notice (hidden unless WebGL2 fails) -->
          <div id="bhErrorOverlay" class="hidden absolute inset-0 bg-slate-950/95 flex items-center justify-center p-6 text-center">
            <div class="max-w-md space-y-2">
              <p class="text-sm font-semibold text-rose-300">WebGL2 Float Buffer Required</p>
              <p id="bhErrorMessage" class="text-xs text-slate-400"></p>
            </div>
          </div>

          <!-- Relativistic Telemetry HUD (Top Left) -->
          <div class="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 pointer-events-none bg-slate-950/75 backdrop-blur-md border border-slate-800/80 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 text-[10px] sm:text-[11px] font-mono text-slate-300 space-y-0.5 sm:space-y-1">
            <div class="flex items-center justify-between gap-3 sm:gap-5">
              <span class="text-slate-400">Observer r / M</span>
              <span id="bhRadiusM" class="text-sky-300 font-semibold">35.00 M</span>
            </div>
            <div class="flex items-center justify-between gap-3 sm:gap-5">
              <span class="text-slate-400">Range (AU)</span>
              <span id="bhRadiusAu" class="text-slate-100">34.55 AU</span>
            </div>
            <div class="hidden sm:flex items-center justify-between gap-5">
              <span class="text-slate-400">Kerr Spin / Horizon</span>
              <span class="text-slate-200">+0.80 / ${horizonRadius(SPIN).toFixed(2)} M</span>
            </div>
          </div>

          <!-- Free-Look Hint & Reset Button (Top Right) -->
          <div class="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 flex items-center gap-1.5 sm:gap-2">
            <span class="hidden sm:inline-block pointer-events-none px-2.5 py-1 rounded-lg bg-slate-950/70 backdrop-blur border border-slate-800/80 text-[11px] text-slate-300">
              Drag to free-look
            </span>
            <button
              type="button"
              id="bhResetLookBtn"
              class="hidden px-2 sm:px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 text-[10px] sm:text-[11px] font-medium transition"
            >
              Recenter Camera
            </button>
            <button
              type="button"
              id="bhFullscreenBtn"
              class="px-2 sm:px-2.5 py-1 rounded-lg bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-[10px] sm:text-[11px] font-medium transition"
            >
              Fullscreen
            </button>
          </div>
        </div>

        <!-- Bottom Playback, Scrubber & Optical Controls -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 bg-slate-950/95 border-t border-slate-800/90 text-xs">
          <div class="flex items-center gap-3 flex-1">
            <button
              type="button"
              id="bhPlayPauseBtn"
              class="px-3.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 font-semibold transition min-w-[74px]"
            >
              Pause
            </button>
            <span id="bhTimeReadout" class="font-mono text-slate-300 whitespace-nowrap">02:20 / 05:00</span>
            <input
              id="bhTimeline"
              type="range"
              min="0"
              max="${DURATION}"
              step="0.25"
              value="140"
              aria-label="Black hole orbital passage timeline"
              class="flex-1 min-w-[120px]"
            />
          </div>

          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-2 text-slate-300">
              <span class="text-slate-400">Zoom</span>
              <input id="bhZoomSlider" type="range" min="0.55" max="1.45" step="0.02" value="1.00" class="w-20" />
            </label>

            <label class="flex items-center gap-2 text-slate-300">
              <span class="text-slate-400">Exposure</span>
              <input id="bhExposureSlider" type="range" min="0.55" max="1.65" step="0.05" value="1.00" class="w-20" />
            </label>

            <label class="flex items-center gap-1.5 text-slate-300">
              <span class="text-slate-400">Quality</span>
              <select
                id="bhQualitySelect"
                class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="0.36">Performance</option>
                <option value="0.54" selected>Balanced</option>
                <option value="0.78">High</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <!-- Download Standalone Black Hole Wallpaper Card -->
      <div
        id="wallpaper-download"
        class="scroll-mt-20 rounded-2xl bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-sky-950/40 border border-sky-500/25 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 shadow-lg"
      >
        <div class="space-y-1.5 max-w-3xl">
          <div data-edit-key="blackHole.download.badge" class="text-[11px] font-mono uppercase tracking-wider text-sky-300">
            ${c.download.badge}
          </div>
          <h2 data-edit-key="blackHole.download.title" class="text-lg sm:text-xl font-bold text-white">
            ${c.download.title}
          </h2>
          <p data-edit-key="blackHole.download.subtitle" class="text-xs sm:text-sm text-slate-300 leading-relaxed">
            ${c.download.subtitle}
          </p>
        </div>

        <div class="flex flex-col sm:items-end gap-1.5 shrink-0">
          <a
            id="bhWallpaperDownloadLink"
            href="${c.download.downloadUrl}"
            download="${c.download.fileName}"
            class="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-[0_0_30px_-5px_rgba(56,189,248,0.55)] transition"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span data-edit-key="blackHole.download.buttonLabel">${c.download.buttonLabel}</span>
          </a>
          <span data-edit-key="blackHole.download.fileSizeNote" class="text-[11px] font-mono text-slate-400">
            ${c.download.fileSizeNote}
          </span>
        </div>
      </div>
    </div>
  `

  const canvas = container.querySelector<HTMLCanvasElement>('#bhCanvas')!
  const stage = container.querySelector<HTMLDivElement>('#bhStage')!
  const shell = container.querySelector<HTMLDivElement>('#bhViewportShell')!
  const errOverlay = container.querySelector<HTMLDivElement>('#bhErrorOverlay')!
  const errMsg = container.querySelector<HTMLParagraphElement>('#bhErrorMessage')!
  const phaseBadge = container.querySelector<HTMLSpanElement>('#bhPhaseBadge')!
  const radiusMEl = container.querySelector<HTMLSpanElement>('#bhRadiusM')!
  const radiusAuEl = container.querySelector<HTMLSpanElement>('#bhRadiusAu')!
  const playPauseBtn = container.querySelector<HTMLButtonElement>('#bhPlayPauseBtn')!
  const timeline = container.querySelector<HTMLInputElement>('#bhTimeline')!
  const timeReadout = container.querySelector<HTMLSpanElement>('#bhTimeReadout')!
  const zoomSlider = container.querySelector<HTMLInputElement>('#bhZoomSlider')!
  const exposureSlider = container.querySelector<HTMLInputElement>('#bhExposureSlider')!
  const qualitySelect = container.querySelector<HTMLSelectElement>('#bhQualitySelect')!
  const resetLookBtn = container.querySelector<HTMLButtonElement>('#bhResetLookBtn')!
  const fullscreenBtn = container.querySelector<HTMLButtonElement>('#bhFullscreenBtn')!
  const chapterBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('.bh-chapter-btn'))

  let renderer: BlackHoleRenderer | null = null
  try {
    if (detectMobileUser().isMobile) {
      qualitySelect.value = '0.36'
    }
    renderer = new BlackHoleRenderer(canvas)
    renderer.scale = Number(qualitySelect.value)
    renderer.resize()
  } catch (err) {
    errOverlay.classList.remove('hidden')
    errMsg.textContent = err instanceof Error ? err.message : 'Unable to initialize WebGL2 Kerr shader.'
    return () => {}
  }

  // Start at t = 140s (approaching the dramatic near-disk skim so visitors immediately see dramatic relativistic lensing!)
  let orbitSeconds = 140
  let materialSeconds = 140
  let userPlaying = true
  let inViewport = true
  let docVisible = !document.hidden
  let rafId = 0
  let lastFrameMs = 0

  let lookYaw = 0
  let lookPitch = 0
  let zoom = 1
  let dragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragBaseYaw = 0
  let dragBasePitch = 0

  function syncChapterButtons() {
    const activeIdx = Math.min(FLIGHT_CHAPTERS.length - 1, Math.floor(orbitSeconds / 75))
    chapterBtns.forEach((btn, idx) => {
      if (idx === activeIdx) {
        btn.className =
          'bh-chapter-btn shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition border bg-sky-500/25 text-sky-200 border-sky-400/50'
      } else {
        btn.className =
          'bh-chapter-btn shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition border bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800'
      }
    })
  }

  function renderOnce() {
    if (!renderer) return
    renderer.setLook(lookYaw, lookPitch, zoom)
    const pose = renderer.render(orbitSeconds, materialSeconds)
    phaseBadge.textContent = pose.phase
    radiusMEl.textContent = `${pose.radius.toFixed(2)} M`
    radiusAuEl.textContent = `${((pose.radius * GRAVITATIONAL_RADIUS_KM) / AU_KM).toFixed(2)} AU`
    timeReadout.textContent = `${formatClock(orbitSeconds)} / ${formatClock(DURATION)}`
    timeline.value = orbitSeconds.toFixed(2)
    syncChapterButtons()
    const hasOffset = Math.abs(lookYaw) > 0.01 || Math.abs(lookPitch) > 0.01 || Math.abs(zoom - 1) > 0.02
    resetLookBtn.classList.toggle('hidden', !hasOffset)
  }

  function shouldAnimate(): boolean {
    return Boolean(renderer) && userPlaying && inViewport && docVisible
  }

  function loop(now: number) {
    rafId = 0
    if (!shouldAnimate()) {
      lastFrameMs = 0
      return
    }
    if (lastFrameMs > 0) {
      const dt = Math.min(0.1, Math.max(0, (now - lastFrameMs) / 1000))
      orbitSeconds = (orbitSeconds + dt) % DURATION
      materialSeconds += dt
    }
    lastFrameMs = now
    renderOnce()
    rafId = requestAnimationFrame(loop)
  }

  function syncLoop() {
    if (shouldAnimate() && !rafId) {
      lastFrameMs = 0
      rafId = requestAnimationFrame(loop)
    } else if (!shouldAnimate() && rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
      lastFrameMs = 0
    }
  }

  // Pointer free-look
  canvas.addEventListener('pointerdown', e => {
    dragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragBaseYaw = lookYaw
    dragBasePitch = lookPitch
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return
    const dx = (e.clientX - dragStartX) / Math.max(240, canvas.clientWidth)
    const dy = (e.clientY - dragStartY) / Math.max(240, canvas.clientHeight)
    lookYaw = Math.max(-1.6, Math.min(1.6, dragBaseYaw - dx * 2.1))
    lookPitch = Math.max(-1.05, Math.min(1.05, dragBasePitch - dy * 1.5))
    if (!shouldAnimate()) renderOnce()
  })
  const endDrag = () => {
    dragging = false
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)

  // Only zoom with mouse wheel in fullscreen or Ctrl+wheel so normal page scrolling is never hijacked!
  stage.addEventListener(
    'wheel',
    e => {
      if (!document.fullscreenElement && !e.ctrlKey) return
      e.preventDefault()
      zoom = Math.max(0.55, Math.min(1.45, zoom + Math.sign(e.deltaY) * 0.05))
      zoomSlider.value = zoom.toFixed(2)
      if (!shouldAnimate()) renderOnce()
    },
    { passive: false },
  )

  playPauseBtn.addEventListener('click', () => {
    userPlaying = !userPlaying
    playPauseBtn.textContent = userPlaying ? 'Pause' : 'Play'
    syncLoop()
  })

  timeline.addEventListener('input', () => {
    const t = clampTime(Number(timeline.value))
    orbitSeconds = t
    materialSeconds = t
    renderOnce()
  })

  chapterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = clampTime(Number(btn.dataset.bhChapter || '0'))
      orbitSeconds = t
      materialSeconds = t
      renderOnce()
    })
  })

  zoomSlider.addEventListener('input', () => {
    zoom = Number(zoomSlider.value)
    if (!shouldAnimate()) renderOnce()
  })

  exposureSlider.addEventListener('input', () => {
    renderer?.setExposure(Number(exposureSlider.value))
    if (!shouldAnimate()) renderOnce()
  })

  qualitySelect.addEventListener('change', () => {
    if (!renderer) return
    renderer.scale = Number(qualitySelect.value)
    renderer.resize()
    renderOnce()
  })

  resetLookBtn.addEventListener('click', () => {
    lookYaw = 0
    lookPitch = 0
    zoom = 1
    zoomSlider.value = '1.00'
    renderOnce()
  })

  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void shell.requestFullscreen()
    }
  })

  const onFullscreenChange = () => {
    const isFs = document.fullscreenElement === shell
    fullscreenBtn.textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen'
    stage.style.height = isFs ? 'calc(100vh - 96px)' : ''
    renderer?.resize()
    renderOnce()
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)

  const resizeObs = new ResizeObserver(() => {
    renderer?.resize()
    renderOnce()
  })
  resizeObs.observe(stage)

  const intersectionObs = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        inViewport = entry.isIntersecting
      }
      syncLoop()
    },
    { threshold: 0.05 },
  )
  intersectionObs.observe(shell)

  const onVisChange = () => {
    docVisible = !document.hidden
    syncLoop()
  }
  document.addEventListener('visibilitychange', onVisChange)

  renderOnce()
  syncLoop()

  // Expose lightweight test/inspection hook
  ;(window as unknown as Record<string, unknown>).__bhSim = {
    getOrbitSeconds: () => orbitSeconds,
    setOrbitSeconds: (t: number) => {
      orbitSeconds = clampTime(t)
      materialSeconds = orbitSeconds
      renderOnce()
    },
    isRunning: () => Boolean(rafId),
  }

  return () => {
    if (rafId) cancelAnimationFrame(rafId)
    resizeObs.disconnect()
    intersectionObs.disconnect()
    document.removeEventListener('visibilitychange', onVisChange)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    renderer?.dispose()
  }
}
