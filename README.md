# Benjamin Norbom — Interactive Portfolio & Simulations

Official interactive website showcasing **Benjamin Norbom**'s research, visualization software, autonomous hardware, and real-time physics simulations:

1. **Asterion — Real-Time Kerr Black Hole Ray-Tracing Simulation & Downloadable Windows Wallpaper**
   - WebGL2 4th-order Runge-Kutta geodesic ray tracing in Kerr spacetime (`a/M = +0.80`) along an elliptical passage skimming `0.55 M` above the accretion disk.
   - Includes a standalone **Black Hole Wallpaper** Windows 10/11 installer (`release-assets/Black-Hole-Wallpaper-1.0.0-setup.exe`) containing *only* the live desktop wallpaper + system-tray/lock-screen controls (no extra app menu or unrelated scenes, and zero modifications needed in your private `FlyBy` repo).
2. **Deep Brain Stimulation (DBS) Research & Interactive 3D Synthetic Brain Visualizer**
   - Direct link to your peer-reviewed article in *Deep Brain Stimulation* (`https://doi.org/10.1016/j.jdbs.2026.08.003`).
   - 100% synthetic, non-patient whole-brain white-matter tractography (`3,200` streamlines across 6 major human pathways + 3D cortical/brainstem shell) with **one unilateral Medtronic 3387 electrode**.
   - Powered by **217,600 real `cnn_103_class` predictions** across all **4 contacts (`0–3`)** and **17 pulse widths (`60–500 µs`)**, controlled strictly in **Volts (`V`)**.
3. **Project 64 — Autonomous Chessboard & Real-Time Movement Planner**
   - Full interactive 3D simulator for the under-board XY gantry + 12V electromagnet + 32-slot side graveyards + half-square lattice router + square-edge neighbor nudging.

---

## Editing Website Text (`src/siteContent.ts`)

All visible titles, subtitles, concise descriptions, paper citations, and download labels live in a single file:

- [`src/siteContent.ts`](./src/siteContent.ts)

Edit any string in `src/siteContent.ts` and save — Vite updates the browser immediately.

---

## Local Development & Preview

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` in your browser. To build the production static site into `dist/`:

```powershell
npm run build
```

---

## Launching for Free (Hosting Comparison & 1-Command Deploy)

- **Recommended Option A — GitHub Pages + GitHub Releases (100% Free, Single Account):**
  - Creating the public repository `BenNorbom/BenNorbom.github.io` hosts the site at **`https://bennorbom.github.io/`** via `.github/workflows/deploy.yml`, and **GitHub Releases** on that same repo hosts the ~106 MB `Black-Hole-Wallpaper-1.0.0-setup.exe` installer for free (up to 2 GB per file, unlimited public downloads) while keeping `BenNorbom/FlyBy` completely private.
  - Whenever you finish reviewing and editing your text, run:
    ```powershell
    .\deploy-to-github.ps1
    ```
- **Option B — Cloudflare Pages + GitHub Releases (Also 100% Free):**
  - Cloudflare Pages offers unlimited static bandwidth on a global CDN (`benjamin-norbom.pages.dev` or a custom domain like `benjaminnorbom.com`), paired with the same GitHub Release URL for the >25 MB `.exe` wallpaper installer.
