import { SITE_CONTENT } from '../../siteContent'
import { initProject64Engine } from './p64Engine.js'

export function mountProject64Section(container: HTMLElement): () => void {
  const c = SITE_CONTENT.project64

  container.innerHTML = `
    <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-14 flex flex-col gap-5">
      <!-- Section Heading -->
      <div class="space-y-2.5 max-w-4xl">
        <div data-edit-box style="${c.eyebrow.trim() ? '' : 'display:none'}" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono tracking-wider uppercase text-emerald-300">
          <span data-edit-key="project64.eyebrow">${c.eyebrow}</span>
        </div>
        <h2 data-edit-box data-edit-key="project64.title" class="text-2xl sm:text-4xl font-bold tracking-tight text-white">
          ${c.title}
        </h2>
        <p data-edit-box data-edit-key="project64.description" class="text-sm sm:text-[15px] text-slate-300 leading-relaxed whitespace-pre-line">${c.description.trim()}</p>
      </div>

      <!-- Status & Reset Board Bar -->
      <div id="p64Workspace" class="flex flex-col gap-3.5">
        <div class="bg-slate-900/95 border border-slate-800 rounded-2xl p-3.5 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              PROJECT 64 · ESP32 GANTRY PLANNER
            </span>
            <span
              data-p64-id="turnBadge"
              class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40"
            >
              Turn: White
            </span>
            <span class="text-xs text-slate-400 hidden sm:inline">
              Click any legal piece on the 3D board or 2D grid, then click a highlighted target square.
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              id="p64MagnetResetBtn"
              class="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/35 transition cursor-pointer"
            >
              <span data-edit-key="project64.resetButtonLabel">${c.resetButtonLabel}</span>
            </button>
          </div>
        </div>

        <!-- Main Simulator Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <!-- 3D Gantry & Chessboard Viewport (8 cols) -->
          <div class="lg:col-span-8 bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <!-- Camera & Layer Toolbar -->
            <div class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/90 text-xs">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-semibold text-slate-400 mr-1">Camera:</span>
                <button type="button" data-p64-cam="white" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700">White POV</button>
                <button type="button" data-p64-cam="black" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700">Black POV</button>
                <button type="button" data-p64-cam="top" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700">Top-Down</button>
                <button type="button" data-p64-cam="under" class="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 border border-amber-500/30">Under-Board Gantry</button>
                <button type="button" data-p64-cam="side" class="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700">Side Profile</button>
                <div class="inline-flex items-center rounded-lg border border-slate-700 overflow-hidden ml-1">
                  <button type="button" id="p64ZoomInBtn" title="Zoom In" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono">+</button>
                  <button type="button" id="p64ZoomOutBtn" title="Zoom Out" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono border-l border-slate-700">&minus;</button>
                </div>
              </div>
            </div>

            <!-- 3D Canvas Stage -->
            <div class="relative w-full h-[520px] sm:h-[600px] flex-1 bg-slate-950">
              <canvas
                data-p64-id="boardCanvas"
                class="w-full h-full block cursor-grab active:cursor-grabbing"
                aria-label="Interactive Project 64 3D chessboard and under-board XY gantry simulator"
              ></canvas>

              <!-- Live Hardware Telemetry HUD -->
              <div class="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md border border-slate-800/90 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 pointer-events-none flex flex-col gap-1 max-w-sm shadow-lg">
                <div class="flex items-center justify-between gap-4">
                  <div class="flex items-center gap-2">
                    <span data-p64-id="magnetIndicator" class="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                    <span data-p64-id="magnetStatusText" class="font-semibold">12V Magnet: OFF</span>
                  </div>
                  <span data-p64-id="hoverSquareBadge" class="font-mono text-sky-400">Square: --</span>
                </div>
                <div data-p64-id="hudStepText" class="text-slate-300 font-medium">Ready — Click any White or Black piece to move</div>
                <div data-p64-id="hudCoordsText" class="text-slate-400 font-mono text-[11px]">Gantry X: 240.0 mm | Y: 240.0 mm</div>
              </div>

              <!-- Playback Controls Overlay -->
              <div class="absolute top-3 right-3 bg-slate-950/85 backdrop-blur border border-slate-800 rounded-xl p-1.5 text-xs flex items-center gap-1.5">
                <button
                  type="button"
                  data-p64-id="pauseBtn"
                  id="p64PauseBtn"
                  class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium"
                >
                  Pause
                </button>
                <button
                  type="button"
                  id="p64SkipBtn"
                  class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium"
                >
                  Finish Instantly
                </button>
              </div>

              <!-- Legend Overlay -->
              <div class="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 pointer-events-none flex flex-wrap items-center gap-3">
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span>Planned Route</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>Square-Edge Nudge</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>Restore Center</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>12V Magnet ON</span>
              </div>
            </div>
          </div>

          <!-- Right Sidebar: 2D Controller, Hardware Parameters & Command Queue (4 cols) -->
          <div class="lg:col-span-4 flex flex-col gap-3.5">
            <!-- 2D Quick-Click Board & Algebraic Input -->
            <div class="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-white">Interactive Piece Controller</h3>
                  <p class="text-[11px] text-slate-400">Click pieces in 3D or on this 2D grid</p>
                </div>
                <button
                  type="button"
                  id="p64DeselectBtn"
                  class="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Deselect
                </button>
              </div>

              <div class="flex items-center justify-center py-0.5">
                <div
                  data-p64-id="miniBoardGrid"
                  class="grid grid-cols-8 border-2 border-slate-700 rounded-lg overflow-hidden w-full max-w-[268px] aspect-square"
                ></div>
              </div>

              <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
                <input
                  data-p64-id="algebraicInput"
                  type="text"
                  placeholder="e.g. g1f3, e2e4, c1g5"
                  aria-label="Algebraic chess move"
                  class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  id="p64RunAlgebraicBtn"
                  class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition"
                >
                  Run Move
                </button>
                <select
                  data-p64-id="promoSelect"
                  aria-label="Promotion piece"
                  class="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="Q">Promote: Queen (Q)</option>
                  <option value="R">Promote: Rook (R)</option>
                  <option value="B">Promote: Bishop (B)</option>
                  <option value="N">Promote: Knight (N)</option>
                </select>
              </div>
            </div>

            <!-- Hardware Dimensions (Fixed Defaults) & Gantry Speed Control -->
            <div class="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-white">Hardware &amp; Nudge Parameters</h3>
              </div>

              <div class="grid grid-cols-3 gap-2 text-xs">
                <div class="rounded-xl bg-slate-950/80 border border-slate-800/80 px-2.5 py-2 flex flex-col gap-0.5">
                  <span class="text-slate-400 text-[11px]">Square Size</span>
                  <span data-p64-id="lblSquareMm" class="font-mono font-semibold text-slate-200">60 mm</span>
                </div>

                <div class="rounded-xl bg-slate-950/80 border border-slate-800/80 px-2.5 py-2 flex flex-col gap-0.5">
                  <span class="text-slate-400 text-[11px]">Piece Base &Oslash;</span>
                  <span class="font-mono font-semibold text-slate-200">28 / 34 / 36</span>
                </div>

                <div class="rounded-xl bg-slate-950/80 border border-slate-800/80 px-2.5 py-2 flex flex-col gap-0.5">
                  <span class="text-slate-400 text-[11px]">Edge Margin</span>
                  <span data-p64-id="lblEdgeMargin" class="font-mono font-semibold text-slate-200">1 mm</span>
                </div>
              </div>

              <div class="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80 text-xs">
                <div class="flex justify-between items-center">
                  <label for="p64SpeedSlider" class="text-slate-300 font-medium">Gantry Speed</label>
                  <span data-p64-id="lblSimSpeed" class="font-mono font-semibold text-emerald-300">1.2x</span>
                </div>
                <input id="p64SpeedSlider" type="range" min="0.4" max="3.5" step="0.2" value="1.2" class="p64-range w-full" />
              </div>
            </div>

            <!-- Gantry Execution Queue -->
            <div class="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-lg flex-1 flex flex-col min-h-[210px] max-h-[260px]">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-white">Gantry Execution Queue (ESP32 Core 1)</h3>
                <span data-p64-id="cmdCountBadge" class="px-2 py-0.5 text-xs rounded bg-slate-800 text-emerald-300 font-mono">0 cmds</span>
              </div>
              <div
                data-p64-id="cmdLogContainer"
                class="custom-scroll overflow-y-auto flex-1 flex flex-col gap-1.5 pr-1 text-xs font-mono"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  const workspace = container.querySelector<HTMLDivElement>('#p64Workspace')!
  const engine = initProject64Engine(workspace)

  // Bind buttons & inputs cleanly
  workspace.querySelectorAll<HTMLButtonElement>('[data-p64-cam]').forEach(btn => {
    btn.addEventListener('click', () => engine.setCameraPreset(btn.dataset.p64Cam!))
  })

  workspace.querySelector('#p64MagnetResetBtn')!.addEventListener('click', () => engine.resetBoardWithMagnet())
  workspace.querySelector('#p64PauseBtn')!.addEventListener('click', () => engine.togglePause())
  workspace.querySelector('#p64SkipBtn')!.addEventListener('click', () => engine.skipCurrentAnimation())
  workspace.querySelector('#p64DeselectBtn')!.addEventListener('click', () => engine.clearSelection())
  workspace.querySelector('#p64RunAlgebraicBtn')!.addEventListener('click', () => engine.executeAlgebraicInput())
  workspace.querySelector('#p64ZoomInBtn')!.addEventListener('click', () => engine.zoomBy(-1.6))
  workspace.querySelector('#p64ZoomOutBtn')!.addEventListener('click', () => engine.zoomBy(1.6))

  const algInput = workspace.querySelector<HTMLInputElement>('[data-p64-id="algebraicInput"]')!
  algInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') engine.executeAlgebraicInput()
  })

  const speedSlider = workspace.querySelector<HTMLInputElement>('#p64SpeedSlider')!
  speedSlider.addEventListener('input', () => engine.updateParam('simSpeed', speedSlider.value))

  // Viewport auto-pause so offscreen Project 64 takes 0% CPU/GPU
  let inView = false
  let docVisible = !document.hidden
  const syncActive = () => engine.setViewportActive(inView && docVisible)

  const intersectionObs = new IntersectionObserver(
    entries => {
      for (const entry of entries) inView = entry.isIntersecting
      syncActive()
    },
    { threshold: 0.05 },
  )
  intersectionObs.observe(workspace)

  const onVisChange = () => {
    docVisible = !document.hidden
    syncActive()
  }
  document.addEventListener('visibilitychange', onVisChange)

  // Expose programmatic hook for E2E verification
  ;(window as unknown as Record<string, unknown>).__p64Sim = engine

  return () => {
    intersectionObs.disconnect()
    document.removeEventListener('visibilitychange', onVisChange)
    engine.dispose()
  }
}
