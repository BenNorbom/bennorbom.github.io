import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SITE_CONTENT } from '../../siteContent'
import { getOptimalPixelRatio } from '../../mobileMode'

interface PathwayMeta {
  id: string
  name: string
  region: string
  count: number
  color: string
  inactiveColor: string
  start: number
  end: number
}

interface DbsMeta {
  title: string
  isSyntheticNonPatient: boolean
  modelName: string
  units: string
  nFibers: number
  totalVisVertices: number
  pulseWidthsUs: number[]
  lead: {
    model: string
    radiusMm: number
    contactLengthMm: number
    contactSpacingMm: number
    shaftLengthMm: number
    tipPos: [number, number, number]
    c0Pos: [number, number, number]
    axisU: [number, number, number]
    contacts: [number, number, number][]
  }
  brainBounds: {
    min: [number, number, number]
    max: [number, number, number]
    center: [number, number, number]
  }
  pathways: PathwayMeta[]
}

interface ParsedAtlas {
  nFibers: number
  totalVisPts: number
  nContacts: number
  nPulseWidths: number
  nodeCounts: Uint16Array
  fiberXyz: Float32Array
  thresholdsMv: Uint16Array // length = 4 * 17 * nFibers
  cortexXyz: Float32Array
  cortexTris: Uint16Array
}

/** Convert stereotactic (x: Right+, y: Anterior+, z: Superior+) -> Three.js Y-up (x, z, -y) */
function mniToThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y)
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return [r, g, b]
}

function parseAtlasBinary(buf: ArrayBuffer): ParsedAtlas {
  const dv = new DataView(buf)
  const magic =
    String.fromCharCode(dv.getUint8(0)) +
    String.fromCharCode(dv.getUint8(1)) +
    String.fromCharCode(dv.getUint8(2)) +
    String.fromCharCode(dv.getUint8(3))
  if (magic !== 'DBSA') {
    throw new Error(`Invalid DBS atlas header: ${magic}`)
  }
  const nFibers = dv.getUint32(8, true)
  const totalVisPts = dv.getUint32(12, true)
  const nContacts = dv.getUint32(16, true)
  const nPulseWidths = dv.getUint32(20, true)
  const nCortexVerts = dv.getUint32(24, true)
  const nCortexTris = dv.getUint32(28, true)

  let offset = 32
  const nodeCounts = new Uint16Array(buf, offset, nFibers)
  offset += nFibers * 2
  if (offset % 4 !== 0) offset += 4 - (offset % 4)

  const fiberXyz = new Float32Array(buf, offset, totalVisPts * 3)
  offset += totalVisPts * 3 * 4

  const nThresh = nContacts * nPulseWidths * nFibers
  const thresholdsMv = new Uint16Array(buf, offset, nThresh)
  offset += nThresh * 2
  if (offset % 4 !== 0) offset += 4 - (offset % 4)

  const cortexXyz = new Float32Array(buf, offset, nCortexVerts * 3)
  offset += nCortexVerts * 3 * 4

  const cortexTris = new Uint16Array(buf, offset, nCortexTris * 3)

  return {
    nFibers,
    totalVisPts,
    nContacts,
    nPulseWidths,
    nodeCounts,
    fiberXyz,
    thresholdsMv,
    cortexXyz,
    cortexTris,
  }
}

export function mountDbsBrainSection(container: HTMLElement): () => void {
  const c = SITE_CONTENT.dbs

  container.innerHTML = `
    <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col gap-7">
      <!-- Section Header + Multi-Paragraph Research Narrative + Published Paper Card -->
      <div class="flex flex-col gap-5">
        <div class="space-y-3 max-w-4xl">
          <div data-edit-box style="${c.eyebrow.trim() ? '' : 'display:none'}" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-[11px] font-mono tracking-wider uppercase text-rose-300">
            <span data-edit-key="dbs.eyebrow">${c.eyebrow}</span>
          </div>
          <h2 data-edit-box data-edit-key="dbs.title" class="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            ${c.title}
          </h2>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <!-- Left: Editorial Research Explanation Card (8 cols) -->
          <div data-edit-box class="xl:col-span-8 rounded-2xl bg-slate-900/75 border border-slate-800/90 p-5 sm:p-7 shadow-lg">
            <div data-edit-key="dbs.description" class="text-sm sm:text-[15px] text-slate-200 leading-7 whitespace-pre-line">${c.description.trim()}</div>
          </div>

          <!-- Right: Published Journal Article Card & Atlas Notice (4 cols) -->
          <div class="xl:col-span-4 flex flex-col gap-4">
            <div class="rounded-2xl bg-slate-900/95 border border-slate-800 p-5 flex flex-col gap-3 shadow-lg">
              <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <span data-edit-box data-edit-key="dbs.paper.badge" class="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold">
                  ${c.paper.badge}
                </span>
                <span data-edit-box data-edit-key="dbs.paper.journal" class="text-slate-400">${c.paper.journal}</span>
              </div>
              <h3 data-edit-box data-edit-key="dbs.paper.title" class="text-base sm:text-lg font-bold text-slate-100 leading-snug">
                ${c.paper.title}
              </h3>
              <p data-edit-box data-edit-key="dbs.paper.authors" class="text-xs sm:text-sm text-slate-400 leading-relaxed">
                ${c.paper.authors}
              </p>
              <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                <span class="text-[11px] font-mono text-slate-400">DOI: ${c.paper.doi}</span>
                <a
                  id="dbsPaperLink"
                  href="${c.paper.url}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition shadow-[0_0_25px_-6px_rgba(225,29,72,0.75)]"
                >
                  <span data-edit-key="dbs.paper.buttonLabel">${c.paper.buttonLabel}</span>
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 17L17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                </a>
              </div>
            </div>

            <div data-edit-box style="${c.syntheticNotice.trim() ? '' : 'display:none'}" class="rounded-2xl bg-slate-900/60 border border-slate-800/80 px-4 py-3.5">
              <p data-edit-key="dbs.syntheticNotice" class="text-xs font-mono text-slate-400 leading-relaxed whitespace-pre-line">${c.syntheticNotice.trim()}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Interactive 3D DBS Visualization Workspace -->
      <div id="dbsWorkspace" class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <!-- Left/Main 3D Brain Viewport (8 cols) -->
        <div class="lg:col-span-8 rounded-2xl bg-[#070a12] border border-slate-800/90 overflow-hidden shadow-2xl flex flex-col">
          <!-- Camera & Display Toolbar -->
          <div class="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 bg-slate-950/90 border-b border-slate-800 text-xs">
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap max-w-full pb-0.5 sm:pb-0">
              <span class="font-semibold text-slate-400 mr-1 shrink-0">View:</span>
              <button type="button" data-dbs-cam="oblique" class="dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/40 font-medium">3D Oblique</button>
              <button type="button" data-dbs-cam="anterior" class="dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800">Coronal (Front)</button>
              <button type="button" data-dbs-cam="lateral" class="dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800">Sagittal (Left)</button>
              <button type="button" data-dbs-cam="superior" class="dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800">Axial (Top)</button>
              <button type="button" data-dbs-cam="zoom_lead" class="dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-200 border border-amber-500/30">Zoom Electrode</button>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input id="dbsCortexToggle" type="checkbox" checked class="rounded accent-sky-400" />
                <span>3D Brain Shell</span>
              </label>
            </div>
          </div>

          <!-- 3D Three.js Canvas Stage -->
          <div id="dbsStage" class="relative w-full h-[350px] sm:h-[520px] lg:h-[620px] flex-1 bg-[#070a12]">
            <canvas
              id="dbsCanvas"
              class="w-full h-full block cursor-grab active:cursor-grabbing"
              aria-label="Interactive 3D human brain white-matter tractography and single-electrode DBS activation viewer"
            ></canvas>

            <!-- Loading Indicator -->
            <div id="dbsLoadingOverlay" class="absolute inset-0 bg-[#070a12]/95 flex flex-col items-center justify-center gap-3 z-10 px-4 text-center">
              <div class="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin"></div>
              <p id="dbsLoadingText" class="text-xs font-mono text-slate-300">Loading 3,200 synthetic streamlines &amp; 217,600 CNN thresholds...</p>
            </div>

            <!-- Live Stimulation Telemetry HUD (Top Left) -->
            <div class="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 pointer-events-none bg-slate-950/85 backdrop-blur-md border border-slate-800/90 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 text-[11px] sm:text-xs space-y-0.5 sm:space-y-1 shadow-lg max-w-[calc(100%-20px)]">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ff2414] shadow-[0_0_10px_#ff2414] shrink-0"></span>
                <span id="dbsHudHeader" class="font-mono font-semibold text-white">Contact 1 · 3.00 V · 90 µs</span>
              </div>
              <div class="font-mono text-[10px] sm:text-[11px] text-slate-300">
                Activated Fibers:
                <span id="dbsHudCount" class="text-rose-400 font-bold">-- / 3200</span>
                (<span id="dbsHudPct" class="text-rose-300">--%</span>)
              </div>
              <div class="hidden sm:block text-[11px] text-slate-400">
                Drag to rotate 3D brain · Scroll to zoom · Right-drag to pan · Click contacts on lead
              </div>
              <div class="block sm:hidden text-[10px] text-slate-400">
                1-finger drag to rotate · Pinch to zoom · Tap lead contacts
              </div>
            </div>

            <!-- Anatomical Orientation Badge (Bottom Left) -->
            <div class="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 pointer-events-none bg-slate-950/80 backdrop-blur border border-slate-800/80 rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-[11px] font-mono text-slate-300 flex flex-wrap items-center gap-2 sm:gap-3 max-w-[calc(100%-20px)]">
              <span class="flex items-center gap-1.5"><span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ff2414] inline-block shrink-0"></span>Active Contact / Recruited Axon</span>
              <span class="hidden sm:flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block shrink-0"></span>Medtronic 3387 (Left Unilateral)</span>
            </div>
          </div>
        </div>

        <!-- Right Interactive Parameter & Pathway Control Panel (4 cols) -->
        <div class="lg:col-span-4 flex flex-col gap-3.5">
          <!-- Stimulation Parameters Card (Strictly Volts V + Contact + Pulse Width) -->
          <div class="rounded-2xl bg-slate-900/95 border border-slate-800 p-4 shadow-lg space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white">Stimulation Parameters</h3>
            </div>

            <!-- Active Contact Selector (0..3) -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400 font-medium">Active Electrode Contact</span>
                <span id="dbsContactCoords" class="font-mono text-[11px] text-slate-400">Unilateral Lead</span>
              </div>
              <div class="grid grid-cols-4 gap-1.5" role="group" aria-label="Active DBS contact">
                ${[0, 1, 2, 3]
                  .map(
                    idx => `
                  <button
                    type="button"
                    data-dbs-contact="${idx}"
                    class="dbs-contact-btn py-2 px-2 rounded-xl text-xs font-mono font-semibold transition border ${
                      idx === 1
                        ? 'bg-rose-500/25 text-rose-200 border-rose-500/60 shadow-[0_0_15px_-4px_rgba(244,63,94,0.5)]'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }"
                  >
                    C${idx}${idx === 0 ? ' (Tip)' : idx === 3 ? ' (Top)' : ''}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Stimulation Voltage (V) Slider + Exact Numeric Input -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <label for="dbsVoltageSlider" class="text-slate-300 font-medium">Stimulation Amplitude (Volts)</label>
                <div class="flex items-center gap-1">
                  <input
                    id="dbsVoltageInput"
                    type="number"
                    min="0"
                    max="10"
                    step="0.05"
                    value="3.00"
                    aria-label="Stimulation voltage in Volts"
                    class="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-xs font-bold text-rose-300 focus:outline-none focus:border-rose-500"
                  />
                  <span class="font-mono text-xs font-semibold text-slate-300">V</span>
                </div>
              </div>
              <input
                id="dbsVoltageSlider"
                type="range"
                min="0"
                max="10"
                step="0.05"
                value="3.00"
                class="dbs-range w-full"
              />
              <div class="flex justify-between text-[10px] font-mono text-slate-500">
                <span>0.0 V</span>
                <span>2.5 V</span>
                <span>5.0 V</span>
                <span>7.5 V</span>
                <span>10.0 V</span>
              </div>
            </div>

            <!-- Pulse Width (60 us to 500 us) -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <label for="dbsPwSlider" class="text-slate-300 font-medium">Pulse Width</label>
                <select
                  id="dbsPwSelect"
                  aria-label="Pulse width in microseconds"
                  class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs font-semibold text-sky-300 focus:outline-none focus:border-sky-500"
                ></select>
              </div>
              <input
                id="dbsPwSlider"
                type="range"
                min="0"
                max="16"
                step="1"
                value="2"
                class="w-full"
              />
              <div class="flex justify-between text-[10px] font-mono text-slate-500">
                <span>60 µs</span>
                <span>150 µs</span>
                <span>275 µs</span>
                <span>500 µs</span>
              </div>
            </div>

            <!-- ROI Focus Clipping Slider -->
            <div class="space-y-1 pt-1 border-t border-slate-800/80">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400">ROI Focus Sphere Around Lead</span>
                <span id="dbsRoiLabel" class="font-mono text-[11px] text-slate-300">Full Brain</span>
              </div>
              <input
                id="dbsRoiSlider"
                type="range"
                min="18"
                max="160"
                step="2"
                value="160"
                class="w-full"
              />
            </div>
          </div>

          <!-- Pathway Recruitment Breakdown & Color Mode Card -->
          <div class="rounded-2xl bg-slate-900/95 border border-slate-800 p-4 shadow-lg flex-1 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-white">White-Matter Pathways</h3>
              <div class="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
                <button
                  type="button"
                  id="dbsModePathwayBtn"
                  class="px-2.5 py-1 rounded-md font-medium transition text-slate-400 hover:text-slate-200"
                >
                  Pathway Colors
                </button>
                <button
                  type="button"
                  id="dbsModeClassicBtn"
                  class="px-2.5 py-1 rounded-md font-medium transition bg-slate-800 text-white"
                >
                  Red / Charcoal
                </button>
              </div>
            </div>

            <div id="dbsPathwayList" class="space-y-2 text-xs"></div>
          </div>
        </div>
      </div>
    </div>
  `

  const stage = container.querySelector<HTMLDivElement>('#dbsStage')!
  const workspace = container.querySelector<HTMLDivElement>('#dbsWorkspace')!
  const canvas = container.querySelector<HTMLCanvasElement>('#dbsCanvas')!
  const loadingOverlay = container.querySelector<HTMLDivElement>('#dbsLoadingOverlay')!
  const loadingText = container.querySelector<HTMLParagraphElement>('#dbsLoadingText')!

  const hudHeader = container.querySelector<HTMLSpanElement>('#dbsHudHeader')!
  const hudCount = container.querySelector<HTMLSpanElement>('#dbsHudCount')!
  const hudPct = container.querySelector<HTMLSpanElement>('#dbsHudPct')!
  const contactCoordsEl = container.querySelector<HTMLSpanElement>('#dbsContactCoords')!

  const voltageSlider = container.querySelector<HTMLInputElement>('#dbsVoltageSlider')!
  const voltageInput = container.querySelector<HTMLInputElement>('#dbsVoltageInput')!
  const pwSlider = container.querySelector<HTMLInputElement>('#dbsPwSlider')!
  const pwSelect = container.querySelector<HTMLSelectElement>('#dbsPwSelect')!
  const roiSlider = container.querySelector<HTMLInputElement>('#dbsRoiSlider')!
  const roiLabel = container.querySelector<HTMLSpanElement>('#dbsRoiLabel')!

  const cortexToggle = container.querySelector<HTMLInputElement>('#dbsCortexToggle')!
  const modePathwayBtn = container.querySelector<HTMLButtonElement>('#dbsModePathwayBtn')!
  const modeClassicBtn = container.querySelector<HTMLButtonElement>('#dbsModeClassicBtn')!
  const pathwayListEl = container.querySelector<HTMLDivElement>('#dbsPathwayList')!

  const contactBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('.dbs-contact-btn'))
  const camBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('.dbs-cam-btn'))

  // Three.js Scene Setup
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(getOptimalPixelRatio(2, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#070a12')

  const camera = new THREE.PerspectiveCamera(42, 16 / 10, 1.0, 1200.0)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 18
  controls.maxDistance = 460

  // Studio lighting for metallic Medtronic 3387 lead & glass cortex shell
  const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.9)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45)
  keyLight.position.set(-120, 180, 140)
  const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.85)
  rimLight.position.set(140, 80, -150)
  scene.add(ambientLight, keyLight, rimLight)

  // Simulation state
  let meta: DbsMeta | null = null
  let atlas: ParsedAtlas | null = null
  let activeContact = 1
  let voltageV = 3.0
  let pwIndex = 2 // 90 us default
  let roiRadiusMm = 160 // >= 158 means Full Brain (no clipping)
  let colorMode: 'pathway' | 'classic' = 'classic'
  const pathwayVisible: boolean[] = []

  // Scene objects populated once data loads
  let inactiveLines: THREE.LineSegments | null = null
  let activeLines: THREE.LineSegments | null = null
  let inactivePosAttr: THREE.BufferAttribute | null = null
  let inactiveColAttr: THREE.BufferAttribute | null = null
  let activePosAttr: THREE.BufferAttribute | null = null
  let activeColAttr: THREE.BufferAttribute | null = null

  // Precomputed segment topology per fiber for ultra-fast (< 1 ms) voltage slider updates
  let fiberSegStarts: Int32Array | null = null
  let fiberSegCounts: Uint16Array | null = null
  let fiberMinDistToLead: Float32Array | null = null
  let baseSegPositions: Float32Array | null = null
  let fiberPathwayIdx: Uint8Array | null = null

  let cortexGroup: THREE.Group | null = null
  const contactMeshes: THREE.Mesh[] = []
  let leadCenterThree = new THREE.Vector3(-12, -5, 13)
  let brainCenterThree = new THREE.Vector3(0, 10, 15)

  let inViewport = false
  let docVisible = !document.hidden
  let rafId = 0
  let needsRender = true

  function requestRender() {
    needsRender = true
    syncLoop()
  }

  function resize() {
    const w = Math.max(1, stage.clientWidth)
    const h = Math.max(1, stage.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    requestRender()
  }

  function setCameraPreset(preset: string) {
    camBtns.forEach(btn => {
      const active = btn.dataset.dbsCam === preset
      if (btn.dataset.dbsCam === 'zoom_lead') {
        btn.className = active
          ? 'dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/25 text-amber-100 border border-amber-400/60 font-medium'
          : 'dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-200 border border-amber-500/30'
      } else {
        btn.className = active
          ? 'dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/40 font-medium'
          : 'dbs-cam-btn shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
      }
    })

    if (preset === 'zoom_lead') {
      controls.target.copy(leadCenterThree)
      camera.position.copy(leadCenterThree).add(new THREE.Vector3(-48, 22, -44))
    } else if (preset === 'anterior') {
      controls.target.copy(brainCenterThree)
      camera.position.copy(brainCenterThree).add(new THREE.Vector3(0, 12, -255))
    } else if (preset === 'lateral') {
      controls.target.copy(brainCenterThree)
      camera.position.copy(brainCenterThree).add(new THREE.Vector3(-260, 15, 0))
    } else if (preset === 'superior') {
      controls.target.copy(brainCenterThree)
      camera.position.copy(brainCenterThree).add(new THREE.Vector3(0, 270, -4))
    } else {
      // 3D Oblique (shows both hemispheres, corpus callosum, descending brainstem, and unilateral left lead)
      controls.target.copy(brainCenterThree)
      camera.position.copy(brainCenterThree).add(new THREE.Vector3(-165, 98, -175))
    }
    controls.update()
    requestRender()
  }

  function buildMedtronicLead(lead: DbsMeta['lead']) {
    const group = new THREE.Group()
    const tip = mniToThree(...lead.tipPos)
    const c3Top = mniToThree(
      lead.tipPos[0] + lead.axisU[0] * lead.shaftLengthMm,
      lead.tipPos[1] + lead.axisU[1] * lead.shaftLengthMm,
      lead.tipPos[2] + lead.axisU[2] * lead.shaftLengthMm,
    )
    const dir = c3Top.clone().sub(tip).normalize()
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

    // Polyurethane insulated shaft
    const shaftLen = lead.shaftLengthMm - lead.radiusMm
    const shaftGeo = new THREE.CylinderGeometry(lead.radiusMm * 0.97, lead.radiusMm * 0.97, shaftLen, 32)
    const shaftMat = new THREE.MeshPhysicalMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    })
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat)
    const shaftCenter = tip.clone().addScaledVector(dir, lead.radiusMm + shaftLen / 2)
    shaftMesh.position.copy(shaftCenter)
    shaftMesh.quaternion.copy(quat)
    group.add(shaftMesh)

    // Hemispherical tip + 4 contacts (0, 1, 2, 3)
    contactMeshes.length = 0
    for (let k = 0; k < 4; k++) {
      const z0 = k * (lead.contactLengthMm + lead.contactSpacingMm)
      const cLen = lead.contactLengthMm
      const contactGroupGeo = new THREE.CylinderGeometry(lead.radiusMm * 1.03, lead.radiusMm * 1.03, cLen, 36)
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd8dee9,
        metalness: 0.85,
        roughness: 0.2,
      })
      const mesh = new THREE.Mesh(contactGroupGeo, mat)
      mesh.position.copy(tip).addScaledVector(dir, z0 + cLen / 2)
      mesh.quaternion.copy(quat)
      mesh.userData.contactIndex = k

      if (k === 0) {
        const domeGeo = new THREE.SphereGeometry(lead.radiusMm * 1.03, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
        const domeMesh = new THREE.Mesh(domeGeo, mat)
        domeMesh.rotation.x = Math.PI
        domeMesh.position.y = -cLen / 2 + 0.15
        mesh.add(domeMesh)
      }

      contactMeshes.push(mesh)
      group.add(mesh)
    }

    const c15 = lead.contacts[1]
    const c25 = lead.contacts[2]
    leadCenterThree = mniToThree(
      0.5 * (c15[0] + c25[0]),
      0.5 * (c15[1] + c25[1]),
      0.5 * (c15[2] + c25[2]),
    )

    scene.add(group)
  }

  function updateLeadVisuals() {
    if (!meta) return
    contactMeshes.forEach((mesh, k) => {
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (k === activeContact) {
        mat.color.setHex(0xdc000c)
        mat.emissive.setHex(0xc8000a)
        mat.emissiveIntensity = 0.85
        mat.metalness = 0.25
        mat.toneMapped = false
      } else {
        mat.color.setHex(0xd8dee9)
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
        mat.metalness = 0.85
        mat.toneMapped = true
      }
    })

    const cc = meta.lead.contacts[activeContact]
    contactCoordsEl.textContent = `(${cc[0].toFixed(1)}, ${cc[1].toFixed(1)}, ${cc[2].toFixed(1)}) mm`
  }

  function updateActivationBuffers() {
    if (
      !meta ||
      !atlas ||
      !inactivePosAttr ||
      !inactiveColAttr ||
      !activePosAttr ||
      !activeColAttr ||
      !fiberSegStarts ||
      !fiberSegCounts ||
      !baseSegPositions ||
      !fiberMinDistToLead ||
      !fiberPathwayIdx
    ) {
      return
    }

    const vMv = Math.round(voltageV * 1000)
    const lutBase = (activeContact * meta.pulseWidthsUs.length + pwIndex) * atlas.nFibers
    const useRoi = roiRadiusMm < 158

    const inPos = inactivePosAttr.array as Float32Array
    const inCol = inactiveColAttr.array as Float32Array
    const acPos = activePosAttr.array as Float32Array
    const acCol = activeColAttr.array as Float32Array

    let inVertCursor = 0
    let acVertCursor = 0

    const activePerPathway = new Int32Array(meta.pathways.length)
    let totalActive = 0
    let totalVisibleFibers = 0

    const pathwayActiveRgb = meta.pathways.map(p => hexToRgb01(p.color))
    const pathwayInactiveRgb = meta.pathways.map(p => hexToRgb01(p.inactiveColor))
    // Pure crimson red in linear RGB so after sRGB output encoding it renders as true, vivid Red (#e6000d) instead of orange
    const classicActiveRgb: [number, number, number] = [0.85, 0.0, 0.004]
    const classicInactiveRgb: [number, number, number] = [0.16, 0.19, 0.25]

    for (let f = 0; f < atlas.nFibers; f++) {
      const pIdx = fiberPathwayIdx[f]
      if (!pathwayVisible[pIdx]) continue
      if (useRoi && fiberMinDistToLead[f] > roiRadiusMm) continue

      totalVisibleFibers++
      const isAct = voltageV > 0 && atlas.thresholdsMv[lutBase + f] <= vMv
      const segStart = fiberSegStarts[f]
      const segCount = fiberSegCounts[f]
      const floatStart = segStart * 6
      const floatLen = segCount * 6

      if (isAct) {
        totalActive++
        activePerPathway[pIdx]++
        const [r, g, b] = colorMode === 'pathway' ? pathwayActiveRgb[pIdx] : classicActiveRgb
        const dstOffset = acVertCursor * 3
        acPos.set(baseSegPositions.subarray(floatStart, floatStart + floatLen), dstOffset)
        const nVerts = segCount * 2
        for (let v = 0; v < nVerts; v++) {
          const ci = dstOffset + v * 3
          acCol[ci] = r
          acCol[ci + 1] = g
          acCol[ci + 2] = b
        }
        acVertCursor += nVerts
      } else {
        const [r, g, b] = colorMode === 'pathway' ? pathwayInactiveRgb[pIdx] : classicInactiveRgb
        const dstOffset = inVertCursor * 3
        inPos.set(baseSegPositions.subarray(floatStart, floatStart + floatLen), dstOffset)
        const nVerts = segCount * 2
        for (let v = 0; v < nVerts; v++) {
          const ci = dstOffset + v * 3
          inCol[ci] = r
          inCol[ci + 1] = g
          inCol[ci + 2] = b
        }
        inVertCursor += nVerts
      }
    }

    inactiveLines!.geometry.setDrawRange(0, inVertCursor)
    inactivePosAttr.needsUpdate = true
    inactiveColAttr.needsUpdate = true

    activeLines!.geometry.setDrawRange(0, acVertCursor)
    activePosAttr.needsUpdate = true
    activeColAttr.needsUpdate = true

    // Update HUD & pathway bars
    const pwUs = meta.pulseWidthsUs[pwIndex]
    hudHeader.textContent = `Contact ${activeContact} · ${voltageV.toFixed(2)} V · ${pwUs} µs`
    hudCount.textContent = `${totalActive} / ${totalVisibleFibers}`
    hudPct.textContent = totalVisibleFibers > 0 ? `${((totalActive / totalVisibleFibers) * 100).toFixed(1)}%` : '0.0%'

    meta.pathways.forEach((p, idx) => {
      const countEl = pathwayListEl.querySelector<HTMLSpanElement>(`[data-pw-count="${p.id}"]`)
      const barEl = pathwayListEl.querySelector<HTMLDivElement>(`[data-pw-bar="${p.id}"]`)
      const act = activePerPathway[idx]
      const pct = (act / p.count) * 100
      if (countEl) countEl.textContent = `${act} / ${p.count} (${pct.toFixed(0)}%)`
      if (barEl) barEl.style.width = `${Math.min(100, pct).toFixed(1)}%`
    })

    updateLeadVisuals()
    requestRender()
  }

  // Load synthetic DBS atlas
  void (async () => {
    try {
      const [metaRes, binRes] = await Promise.all([
        fetch('./data/synthetic_dbs_meta.json'),
        fetch('./data/synthetic_dbs_atlas.bin'),
      ])
      if (!metaRes.ok || !binRes.ok) {
        throw new Error('Failed to load synthetic DBS atlas files.')
      }
      meta = (await metaRes.json()) as DbsMeta
      atlas = parseAtlasBinary(await binRes.arrayBuffer())

      // Populate Pulse Width dropdown
      pwSelect.innerHTML = meta.pulseWidthsUs
        .map((pw, idx) => `<option value="${idx}" ${idx === pwIndex ? 'selected' : ''}>${pw} µs</option>`)
        .join('')

      // Build pathway UI rows
      pathwayVisible.length = 0
      pathwayListEl.innerHTML = meta.pathways
        .map((p, idx) => {
          pathwayVisible.push(true)
          return `
            <div class="rounded-xl bg-slate-950/85 border border-slate-800/80 px-3 py-2 space-y-1">
              <div class="flex items-center justify-between gap-2">
                <label class="flex items-center gap-2 cursor-pointer min-w-0">
                  <input type="checkbox" data-pathway-toggle="${idx}" checked class="rounded accent-rose-500" />
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${p.color}"></span>
                  <span class="font-semibold text-slate-200 truncate">${p.name}</span>
                </label>
                <span data-pw-count="${p.id}" class="font-mono text-[11px] text-slate-300 shrink-0">0 / ${p.count}</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-slate-800/90 overflow-hidden">
                <div data-pw-bar="${p.id}" class="h-full rounded-full transition-all duration-150" style="width:0%; background:${p.color}"></div>
              </div>
            </div>
          `
        })
        .join('')

      pathwayListEl.querySelectorAll<HTMLInputElement>('[data-pathway-toggle]').forEach(chk => {
        chk.addEventListener('change', () => {
          const idx = Number(chk.dataset.pathwayToggle)
          pathwayVisible[idx] = chk.checked
          updateActivationBuffers()
        })
      })

      // Build 3D Glass Cortex Shell
      cortexGroup = new THREE.Group()
      const cortexGeo = new THREE.BufferGeometry()
      const cVerts = new Float32Array(atlas.cortexXyz.length)
      for (let i = 0; i < atlas.cortexXyz.length; i += 3) {
        const v = mniToThree(atlas.cortexXyz[i], atlas.cortexXyz[i + 1], atlas.cortexXyz[i + 2])
        cVerts[i] = v.x
        cVerts[i + 1] = v.y
        cVerts[i + 2] = v.z
      }
      cortexGeo.setAttribute('position', new THREE.BufferAttribute(cVerts, 3))
      cortexGeo.setIndex(new THREE.BufferAttribute(atlas.cortexTris, 1))
      cortexGeo.computeVertexNormals()

      const cortexBackMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        roughness: 0.35,
        metalness: 0.05,
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
        depthWrite: false,
      })
      const cortexFrontMat = new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        roughness: 0.25,
        metalness: 0.08,
        transparent: true,
        opacity: 0.09,
        side: THREE.FrontSide,
        depthWrite: false,
      })
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.028,
        depthWrite: false,
      })
      cortexGroup.add(
        new THREE.Mesh(cortexGeo, cortexBackMat),
        new THREE.Mesh(cortexGeo, cortexFrontMat),
        new THREE.Mesh(cortexGeo, wireMat),
      )
      cortexGroup.renderOrder = 4
      scene.add(cortexGroup)

      // Build Medtronic 3387 Lead
      buildMedtronicLead(meta.lead)
      brainCenterThree = mniToThree(...meta.brainBounds.center)

      // Precompute segment buffers for all 3,200 streamlines
      let totalSegments = 0
      for (let f = 0; f < atlas.nFibers; f++) {
        totalSegments += Math.max(0, atlas.nodeCounts[f] - 1)
      }

      fiberSegStarts = new Int32Array(atlas.nFibers)
      fiberSegCounts = new Uint16Array(atlas.nFibers)
      fiberMinDistToLead = new Float32Array(atlas.nFibers)
      fiberPathwayIdx = new Uint8Array(atlas.nFibers)
      baseSegPositions = new Float32Array(totalSegments * 6)

      meta.pathways.forEach((p, idx) => {
        for (let f = p.start; f < p.end; f++) fiberPathwayIdx![f] = idx
      })

      const leadMidX = 0.5 * (meta.lead.contacts[1][0] + meta.lead.contacts[2][0])
      const leadMidY = 0.5 * (meta.lead.contacts[1][1] + meta.lead.contacts[2][1])
      const leadMidZ = 0.5 * (meta.lead.contacts[1][2] + meta.lead.contacts[2][2])

      let ptCursor = 0
      let segCursor = 0
      for (let f = 0; f < atlas.nFibers; f++) {
        const nPts = atlas.nodeCounts[f]
        const nSegs = Math.max(0, nPts - 1)
        fiberSegStarts[f] = segCursor
        fiberSegCounts[f] = nSegs

        let minD2 = Infinity
        for (let k = 0; k < nSegs; k++) {
          const i0 = (ptCursor + k) * 3
          const i1 = (ptCursor + k + 1) * 3

          const x0 = atlas.fiberXyz[i0]
          const y0 = atlas.fiberXyz[i0 + 1]
          const z0 = atlas.fiberXyz[i0 + 2]
          const x1 = atlas.fiberXyz[i1]
          const y1 = atlas.fiberXyz[i1 + 1]
          const z1 = atlas.fiberXyz[i1 + 2]

          const dx = x0 - leadMidX
          const dy = y0 - leadMidY
          const dz = z0 - leadMidZ
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < minD2) minD2 = d2

          const o = (segCursor + k) * 6
          // Inline mniToThree: (x, z, -y)
          baseSegPositions[o] = x0
          baseSegPositions[o + 1] = z0
          baseSegPositions[o + 2] = -y0
          baseSegPositions[o + 3] = x1
          baseSegPositions[o + 4] = z1
          baseSegPositions[o + 5] = -y1
        }
        fiberMinDistToLead[f] = Math.sqrt(minD2)
        ptCursor += nPts
        segCursor += nSegs
      }

      const maxVerts = totalSegments * 2
      const inactiveGeo = new THREE.BufferGeometry()
      inactivePosAttr = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3)
      inactiveColAttr = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3)
      inactiveGeo.setAttribute('position', inactivePosAttr)
      inactiveGeo.setAttribute('color', inactiveColAttr)
      const inactiveMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.44,
        toneMapped: false,
      })
      inactiveLines = new THREE.LineSegments(inactiveGeo, inactiveMat)
      inactiveLines.frustumCulled = false
      inactiveLines.renderOrder = 1

      const activeGeo = new THREE.BufferGeometry()
      activePosAttr = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3)
      activeColAttr = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3)
      activeGeo.setAttribute('position', activePosAttr)
      activeGeo.setAttribute('color', activeColAttr)
      const activeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        toneMapped: false,
      })
      activeLines = new THREE.LineSegments(activeGeo, activeMat)
      activeLines.frustumCulled = false
      activeLines.renderOrder = 2

      scene.add(inactiveLines, activeLines)

      resize()
      setCameraPreset('oblique')
      updateActivationBuffers()
      loadingOverlay.classList.add('hidden')
    } catch (err) {
      loadingText.textContent = err instanceof Error ? err.message : 'Error loading DBS atlas.'
    }
  })()

  // UI Event Listeners
  function selectContact(cIdx: number) {
    activeContact = Math.max(0, Math.min(3, cIdx))
    contactBtns.forEach((btn, i) => {
      btn.className =
        i === activeContact
          ? 'dbs-contact-btn py-2 px-2 rounded-xl text-xs font-mono font-semibold transition border bg-rose-500/25 text-rose-200 border-rose-500/60 shadow-[0_0_15px_-4px_rgba(244,63,94,0.5)]'
          : 'dbs-contact-btn py-2 px-2 rounded-xl text-xs font-mono font-semibold transition border bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
    })
    updateActivationBuffers()
  }

  contactBtns.forEach(btn => {
    btn.addEventListener('click', () => selectContact(Number(btn.dataset.dbsContact || '0')))
  })

  // Raycast click on 3D electrode contacts!
  const raycaster = new THREE.Raycaster()
  const pointerDownPos = new THREE.Vector2()
  canvas.addEventListener('pointerdown', e => {
    pointerDownPos.set(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) return
    if (contactMeshes.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects(contactMeshes, true)
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object
      while (obj && obj.userData.contactIndex === undefined) obj = obj.parent
      if (obj && typeof obj.userData.contactIndex === 'number') {
        selectContact(obj.userData.contactIndex)
      }
    }
  })

  voltageSlider.addEventListener('input', () => {
    voltageV = Math.max(0, Math.min(10, Number(voltageSlider.value)))
    voltageInput.value = voltageV.toFixed(2)
    updateActivationBuffers()
  })

  const applyTypedVoltage = () => {
    const parsed = Number(voltageInput.value)
    if (!Number.isFinite(parsed)) return
    voltageV = Math.max(0, Math.min(10, parsed))
    voltageSlider.value = voltageV.toFixed(2)
    voltageInput.value = voltageV.toFixed(2)
    updateActivationBuffers()
  }
  voltageInput.addEventListener('change', applyTypedVoltage)
  voltageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') applyTypedVoltage()
  })

  pwSlider.addEventListener('input', () => {
    pwIndex = Number(pwSlider.value)
    pwSelect.value = String(pwIndex)
    updateActivationBuffers()
  })

  pwSelect.addEventListener('change', () => {
    pwIndex = Number(pwSelect.value)
    pwSlider.value = String(pwIndex)
    updateActivationBuffers()
  })

  roiSlider.addEventListener('input', () => {
    roiRadiusMm = Number(roiSlider.value)
    roiLabel.textContent = roiRadiusMm >= 158 ? 'Full Brain' : `${roiRadiusMm} mm`
    updateActivationBuffers()
  })

  cortexToggle.addEventListener('change', () => {
    if (cortexGroup) cortexGroup.visible = cortexToggle.checked
    requestRender()
  })

  modePathwayBtn.addEventListener('click', () => {
    colorMode = 'pathway'
    modePathwayBtn.className = 'px-2.5 py-1 rounded-md font-medium transition bg-slate-800 text-white'
    modeClassicBtn.className = 'px-2.5 py-1 rounded-md font-medium transition text-slate-400 hover:text-slate-200'
    updateActivationBuffers()
  })

  modeClassicBtn.addEventListener('click', () => {
    colorMode = 'classic'
    modeClassicBtn.className = 'px-2.5 py-1 rounded-md font-medium transition bg-slate-800 text-white'
    modePathwayBtn.className = 'px-2.5 py-1 rounded-md font-medium transition text-slate-400 hover:text-slate-200'
    updateActivationBuffers()
  })

  camBtns.forEach(btn => {
    btn.addEventListener('click', () => setCameraPreset(btn.dataset.dbsCam || 'oblique'))
  })

  controls.addEventListener('change', () => {
    needsRender = true
  })

  function shouldAnimate(): boolean {
    return inViewport && docVisible
  }

  function loop() {
    rafId = 0
    if (!shouldAnimate()) return
    const dampingMoved = controls.update()
    if (needsRender || dampingMoved) {
      renderer.render(scene, camera)
      needsRender = false
    }
    rafId = requestAnimationFrame(loop)
  }

  function syncLoop() {
    if (shouldAnimate() && !rafId) {
      rafId = requestAnimationFrame(loop)
    } else if (!shouldAnimate() && rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const resizeObs = new ResizeObserver(() => resize())
  resizeObs.observe(stage)

  const intersectionObs = new IntersectionObserver(
    entries => {
      for (const entry of entries) inViewport = entry.isIntersecting
      if (inViewport) needsRender = true
      syncLoop()
    },
    { threshold: 0.05 },
  )
  intersectionObs.observe(workspace)

  const onVisChange = () => {
    docVisible = !document.hidden
    syncLoop()
  }
  document.addEventListener('visibilitychange', onVisChange)

  // Expose programmatic hook for E2E verification
  ;(window as unknown as Record<string, unknown>).__dbsSim = {
    getState: () => ({
      activeContact,
      voltageV,
      pulseWidthUs: meta?.pulseWidthsUs[pwIndex] ?? null,
      hudCount: hudCount.textContent,
    }),
    setVoltage: (v: number) => {
      voltageSlider.value = v.toFixed(2)
      voltageSlider.dispatchEvent(new Event('input'))
    },
    setContact: (cIdx: number) => selectContact(cIdx),
  }

  return () => {
    if (rafId) cancelAnimationFrame(rafId)
    resizeObs.disconnect()
    intersectionObs.disconnect()
    document.removeEventListener('visibilitychange', onVisChange)
    controls.dispose()
    renderer.dispose()
  }
}
