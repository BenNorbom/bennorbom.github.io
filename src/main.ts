import './style.css'
import { SITE_CONTENT } from './siteContent'
import { mountDbsBrainSection } from './simulations/dbs/DbsBrainSection'
import { mountBlackHoleSection } from './simulations/blackhole/BlackHoleSection'
import { mountProject64Section } from './simulations/project64/Project64Section'
import { mountLiveTextEditor } from './liveTextEditor'

const app = document.querySelector<HTMLDivElement>('#app')!
const { identity, hero, nav, dbs, blackHole, footer } = SITE_CONTENT

app.innerHTML = `
  <!-- Sticky Glassmorphic Navigation Bar -->
  <header class="sticky top-0 z-50 backdrop-blur-xl bg-[#05070d]/85 border-b border-slate-800/80">
    <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
      <a href="#dbs-section" class="flex items-center gap-2.5 group">
        <span class="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500/25 via-indigo-500/20 to-sky-400/25 border border-slate-700/80 flex items-center justify-center font-mono text-xs font-bold text-white group-hover:border-rose-400/60 transition">
          BN
        </span>
        <div class="flex flex-col">
          <span data-edit-box data-edit-key="identity.fullName" class="font-display font-bold text-sm sm:text-base tracking-tight text-white">
            ${identity.fullName}
          </span>
          <span data-edit-box data-edit-key="identity.tagline" class="hidden md:inline text-[10px] font-mono text-slate-400">
            ${identity.tagline}
          </span>
        </div>
      </a>

      <nav aria-label="Primary sections" class="flex items-center gap-1.5 sm:gap-2 text-xs font-medium">
        <a href="#dbs-section" class="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition">
          <span data-edit-key="nav.dbsResearch">${nav.dbsResearch}</span>
        </a>
        <a href="#blackhole-section" class="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition">
          <span data-edit-key="nav.blackHole">${nav.blackHole}</span>
        </a>
        <a href="#project64-section" class="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition">
          <span data-edit-key="nav.project64">${nav.project64}</span>
        </a>
        <a
          href="${dbs.paper.url}"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/35 transition"
        >
          <span data-edit-key="nav.paperButton">${nav.paperButton}</span> &nearr;
        </a>
        <a
          href="#wallpaper-download"
          class="hidden lg:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 font-semibold transition"
        >
          <span data-edit-key="nav.wallpaperButton">${nav.wallpaperButton}</span> &darr;
        </a>
      </nav>
    </div>
  </header>

  <main>
    <!-- Personal Identity Hero Banner -->
    <section class="border-b border-slate-800/60 bg-[radial-gradient(ellipse_at_top_left,rgba(244,63,94,0.08),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.08),transparent_55%)]">
      <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="space-y-2 max-w-3xl">
          <div data-edit-box style="${hero.eyebrow.trim() ? '' : 'display:none'}" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-[11px] font-mono tracking-wider uppercase text-slate-300">
            <span data-edit-key="hero.eyebrow">${hero.eyebrow}</span>
          </div>
          <h1 data-edit-box data-edit-key="hero.heading" class="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            ${hero.heading}
          </h1>
          <p data-edit-box style="${hero.subheading.trim() ? '' : 'display:none'}" data-edit-key="hero.subheading" class="text-base sm:text-lg text-slate-200 font-medium whitespace-pre-line">${hero.subheading.trim()}</p>
          <p data-edit-box style="${hero.description.trim() ? '' : 'display:none'}" data-edit-key="hero.description" class="text-sm text-slate-400 leading-relaxed max-w-2xl whitespace-pre-line">${hero.description.trim()}</p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <a
            href="#dbs-section"
            class="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/35 text-xs sm:text-sm font-semibold transition"
          >
            1. DBS Research &amp; 3D Brain &darr;
          </a>
          <a
            href="#blackhole-section"
            class="px-4 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/35 text-xs sm:text-sm font-semibold transition"
          >
            2. Black Hole Simulation &darr;
          </a>
          <a
            href="#project64-section"
            class="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35 text-xs sm:text-sm font-semibold transition"
          >
            3. Project 64 Planner &darr;
          </a>
        </div>
      </div>
    </section>

    <!-- 1. DBS Research + Interactive 3D Synthetic Human Brain Visualizer -->
    <section id="dbs-section" class="scroll-mt-16 relative border-b border-slate-800/70 bg-[radial-gradient(ellipse_at_top_right,rgba(244,63,94,0.07),transparent_58%)]"></section>

    <!-- 2. Real-Time Kerr Black Hole Simulation + Wallpaper Download -->
    <section id="blackhole-section" class="scroll-mt-16 relative border-b border-slate-800/70 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.09),transparent_60%)]"></section>

    <!-- 3. Project 64 Autonomous Chessboard & Movement Planner -->
    <section id="project64-section" class="scroll-mt-16 relative bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.07),transparent_58%)]"></section>
  </main>

  <!-- Minimalist Footer -->
  <footer class="border-t border-slate-800/80 bg-slate-950/90">
    <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
      <div class="space-y-1">
        <p class="font-semibold text-slate-200">
          &copy; ${new Date().getFullYear()} <span data-edit-key="footer.copyrightName">${footer.copyrightName}</span>
        </p>
        <p data-edit-box data-edit-key="footer.note" class="whitespace-pre-line">${footer.note}</p>
      </div>
      <div class="flex flex-wrap items-center gap-4 font-mono text-[11px]">
        <a href="${dbs.paper.url}" target="_blank" rel="noopener noreferrer" class="hover:text-rose-300 transition">
          DBS Paper (DOI: ${dbs.paper.doi})
        </a>
        <a href="${blackHole.download.downloadUrl}" download="${blackHole.download.fileName}" class="hover:text-sky-300 transition">
          Black Hole Wallpaper (.exe)
        </a>
        <a href="${identity.githubUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-white transition">
          GitHub
        </a>
      </div>
    </div>
  </footer>
`

mountDbsBrainSection(document.querySelector<HTMLElement>('#dbs-section')!)
mountBlackHoleSection(document.querySelector<HTMLElement>('#blackhole-section')!)
mountProject64Section(document.querySelector<HTMLElement>('#project64-section')!)
mountLiveTextEditor()
