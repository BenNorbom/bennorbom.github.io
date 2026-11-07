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
        <a href="#about-section" class="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition">
          About Me
        </a>
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
          href="${identity.githubUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition"
          aria-label="GitHub Profile"
        >
          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
          <span class="hidden sm:inline">GitHub</span>
        </a>
        <a
          href="${identity.linkedinUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0a66c2]/20 hover:bg-[#0a66c2]/30 text-sky-200 border border-[#0a66c2]/45 transition"
          aria-label="LinkedIn Profile"
        >
          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          <span class="hidden sm:inline">LinkedIn</span>
        </a>
        <a
          href="${dbs.paper.url}"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/35 transition"
        >
          <span data-edit-key="nav.paperButton">${nav.paperButton}</span> &nearr;
        </a>
        <a
          href="#wallpaper-download"
          class="hidden xl:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 font-semibold transition"
        >
          <span data-edit-key="nav.wallpaperButton">${nav.wallpaperButton}</span> &darr;
        </a>
      </nav>
    </div>
  </header>

  <main>
    <!-- About Me & Personal Identity Hero Section -->
    <section id="about-section" class="scroll-mt-16 border-b border-slate-800/60 bg-[radial-gradient(ellipse_at_top_left,rgba(244,63,94,0.08),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.08),transparent_55%)]">
      <div class="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-5">
        <div class="space-y-1.5 max-w-4xl">
          <div data-edit-box style="${hero.eyebrow.trim() ? '' : 'display:none'}" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-[11px] font-mono tracking-wider uppercase text-slate-300">
            <span data-edit-key="hero.eyebrow">${hero.eyebrow}</span>
          </div>
          <h1 data-edit-box data-edit-key="hero.heading" class="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            ${hero.heading}
          </h1>
          <p data-edit-box style="${hero.subheading.trim() ? '' : 'display:none'}" data-edit-key="hero.subheading" class="text-base sm:text-lg text-slate-200 font-medium whitespace-pre-line">${hero.subheading.trim()}</p>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <!-- Left: About Me Bio Card (8 cols — matches left-side text boxes & viewports below) -->
          <div data-edit-box style="${hero.description.trim() ? '' : 'display:none'}" class="xl:col-span-8 rounded-2xl bg-slate-900/75 border border-slate-800/90 p-5 sm:p-7 shadow-lg space-y-2.5">
            <h2 data-edit-key="hero.aboutTitle" class="text-base sm:text-lg font-bold tracking-tight text-white">${hero.aboutTitle.trim()}</h2>
            <p data-edit-key="hero.description" class="text-sm sm:text-[15px] text-slate-200 leading-7 whitespace-pre-line">${hero.description.trim()}</p>
          </div>

          <!-- Right: Attached Links Stacked Vertically (4 cols) -->
          <div class="xl:col-span-4 flex flex-col gap-2.5 w-full">
            <a
              href="${identity.githubUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-800 text-xs sm:text-sm font-semibold transition shadow-sm"
            >
              <span class="inline-flex items-center gap-2.5">
                <svg class="w-4 h-4 fill-current text-slate-200" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                </svg>
                <span>GitHub</span>
              </span>
              <span>&nearr;</span>
            </a>
            <a
              href="${identity.linkedinUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0a66c2]/20 hover:bg-[#0a66c2]/30 text-sky-100 border border-[#0a66c2]/45 text-xs sm:text-sm font-semibold transition shadow-sm"
            >
              <span class="inline-flex items-center gap-2.5">
                <svg class="w-4 h-4 fill-current text-[#38bdf8]" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <span>LinkedIn</span>
              </span>
              <span>&nearr;</span>
            </a>
            <a
              href="#dbs-section"
              class="flex items-center justify-between px-4 py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/35 text-xs sm:text-sm font-semibold transition shadow-sm"
            >
              <span>1. DBS Research &amp; 3D Brain</span>
              <span>&darr;</span>
            </a>
            <a
              href="#blackhole-section"
              class="flex items-center justify-between px-4 py-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/35 text-xs sm:text-sm font-semibold transition shadow-sm"
            >
              <span>2. Black Hole Simulation</span>
              <span>&darr;</span>
            </a>
            <a
              href="#project64-section"
              class="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35 text-xs sm:text-sm font-semibold transition shadow-sm"
            >
              <span>3. Project 64 Planner</span>
              <span>&darr;</span>
            </a>
          </div>
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
        <a href="${identity.linkedinUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-sky-300 transition">
          LinkedIn
        </a>
      </div>
    </div>
  </footer>
`

mountDbsBrainSection(document.querySelector<HTMLElement>('#dbs-section')!)
mountBlackHoleSection(document.querySelector<HTMLElement>('#blackhole-section')!)
mountProject64Section(document.querySelector<HTMLElement>('#project64-section')!)
mountLiveTextEditor()
