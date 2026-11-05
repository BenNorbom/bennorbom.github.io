import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs/promises'
import path from 'node:path'

function formatSiteContentTs(content: Record<string, unknown>, enableLiveEditor = true): string {
  const jsonStr = JSON.stringify(content, null, 2)
  return `/**
 * ============================================================================
 * SITE TEXT & LINKS CONFIGURATION — EDIT HERE OR DIRECTLY ON THE WEBSITE
 * ============================================================================
 * Every heading, subtitle, concise description, button label, external link,
 * and download path on the website is stored here.
 *
 * You can edit this text in two ways:
 *   1. Directly on the website itself: click "Edit Website Text" in the
 *      bottom-right corner of the page, click any text, and type — your edits
 *      are automatically saved directly back into this file on disk!
 *   2. Manually right here in src/siteContent.ts in any text editor.
 *
 * Set ENABLE_LIVE_TEXT_EDITOR = false when you are ready to deploy publicly
 * (it also automatically disables itself in production builds).
 */

export const ENABLE_LIVE_TEXT_EDITOR = ${enableLiveEditor ? 'true' : 'false'}

export interface SiteContentData {
  identity: {
    fullName: string
    citationName: string
    siteTitle: string
    tagline: string
    shortBio: string
    siteUrl: string
    githubUrl: string
  }
  hero: {
    eyebrow: string
    heading: string
    subheading: string
    description: string
  }
  nav: {
    dbsResearch: string
    blackHole: string
    project64: string
    paperButton: string
    wallpaperButton: string
  }
  dbs: {
    eyebrow: string
    title: string
    description: string
    syntheticNotice: string
    paper: {
      badge: string
      journal: string
      title: string
      authors: string
      doi: string
      url: string
      buttonLabel: string
    }
  }
  blackHole: {
    eyebrow: string
    title: string
    simTitle: string
    description: string
    download: {
      badge: string
      title: string
      subtitle: string
      buttonLabel: string
      fileName: string
      downloadUrl: string
      fileSizeNote: string
    }
  }
  project64: {
    eyebrow: string
    title: string
    description: string
    resetButtonLabel: string
  }
  footer: {
    copyrightName: string
    note: string
  }
}

export const SITE_CONTENT: SiteContentData = ${jsonStr}
`
}

function liveTextSavePlugin(): Plugin {
  let lastBrowserSaveTime = 0

  return {
    name: 'live-text-save-plugin',
    handleHotUpdate(ctx) {
      if (ctx.file.replace(/\\/g, '/').endsWith('/src/siteContent.ts')) {
        // When saved from the in-browser live text editor, suppress full-page HMR reload so cursor & simulations stay uninterrupted
        if (Date.now() - lastBrowserSaveTime < 4000) {
          return []
        }
      }
      return undefined
    },
    configureServer(server) {
      server.middlewares.use('/__save-site-content', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }))
          return
        }
        const chunks: Buffer[] = []
        req.on('data', chunk => chunks.push(Buffer.from(chunk)))
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (!body || typeof body.content !== 'object' || body.content === null) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: 'Invalid content payload' }))
              return
            }
            const targetFile = path.resolve(server.config.root, 'src', 'siteContent.ts')
            const formatted = formatSiteContentTs(
              body.content as Record<string, unknown>,
              body.enableLiveEditor !== false,
            )
            lastBrowserSaveTime = Date.now()
            await fs.writeFile(targetFile, formatted, 'utf8')
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true, file: 'src/siteContent.ts', savedAt: new Date().toISOString() }))
          } catch (err) {
            res.statusCode = 500
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Failed to write src/siteContent.ts',
              }),
            )
          }
        })
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), liveTextSavePlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
})
