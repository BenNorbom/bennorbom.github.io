import { ENABLE_LIVE_TEXT_EDITOR, SITE_CONTENT, type SiteContentData } from './siteContent'

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: string): void {
  const parts = dotPath.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (typeof cur[key] !== 'object' || cur[key] === null) {
      cur[key] = {}
    }
    cur = cur[key] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}

function getNestedValue(obj: Record<string, unknown>, dotPath: string): string {
  const parts = dotPath.split('.')
  let cur: unknown = obj
  for (const key of parts) {
    if (typeof cur !== 'object' || cur === null) return ''
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'string' ? cur : ''
}

export function formatAuthorsHtml(authorsText: string): string {
  return authorsText
}

/**
 * Hides any editable text element (and its outer `[data-edit-box]` container if present)
 * whenever its text is empty.
 */
export function syncEmptyTextBoxes(content: SiteContentData, showEmptyInEditMode = false): void {
  document.querySelectorAll<HTMLElement>('[data-edit-key]').forEach(el => {
    const key = el.dataset.editKey!
    const val = getNestedValue(content as unknown as Record<string, unknown>, key).trim()
    const box = el.closest<HTMLElement>('[data-edit-box]') || el
    const shouldHide = val.length === 0 && !showEmptyInEditMode
    box.classList.toggle('hidden', shouldHide)
    box.style.display = shouldHide ? 'none' : ''
  })
}

export function mountLiveTextEditor(): void {
  const workingCopy: SiteContentData = structuredClone(SITE_CONTENT)
  // Always hide empty text boxes immediately on page load (both in dev and prod)
  syncEmptyTextBoxes(workingCopy, false)

  // Only mount the floating editor bar when enabled and running locally
  if (!ENABLE_LIVE_TEXT_EDITOR || import.meta.env.PROD) return

  let editMode = false
  let showHiddenEmpty = false
  let saveTimer: number | null = null
  let isSaving = false

  // Inject styling for editable text elements when Edit Mode is active
  const style = document.createElement('style')
  style.textContent = `
    body.live-text-edit-mode [data-edit-key] {
      outline: 1.5px dashed rgba(56, 189, 248, 0.55);
      outline-offset: 3px;
      border-radius: 4px;
      cursor: text !important;
      min-width: 24px;
      min-height: 1em;
      transition: outline-color 0.15s ease, background-color 0.15s ease;
    }
    body.live-text-edit-mode [data-edit-key]:hover {
      outline-color: rgba(56, 189, 248, 0.95);
      background-color: rgba(56, 189, 248, 0.08);
    }
    body.live-text-edit-mode [data-edit-key]:focus {
      outline: 2px solid #38bdf8;
      outline-offset: 4px;
      background-color: rgba(15, 23, 42, 0.85);
    }
  `
  document.head.appendChild(style)

  const bar = document.createElement('div')
  bar.id = 'liveTextEditorBar'
  bar.className =
    'fixed bottom-4 right-4 z-[9999] flex flex-wrap items-center gap-2 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-sky-500/40 px-3.5 py-2.5 shadow-[0_15px_40px_-10px_rgba(14,165,233,0.45)] text-xs text-slate-200'
  bar.innerHTML = `
    <button
      type="button"
      id="liveEditToggleBtn"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition cursor-pointer"
    >
      <span>&#9998;</span>
      <span id="liveEditToggleLabel">Edit Website Text</span>
    </button>
    <button
      type="button"
      id="liveEditSaveBtn"
      class="hidden items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 font-semibold transition cursor-pointer"
    >
      Save to Disk
    </button>
    <button
      type="button"
      id="liveEditShowEmptyBtn"
      class="hidden items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition cursor-pointer"
    >
      Show Removed Boxes
    </button>
    <span id="liveEditStatus" class="font-mono text-[11px] text-slate-400 px-1">
      Dev Tool &middot; Saves to src/siteContent.ts
    </span>
  `
  document.body.appendChild(bar)

  const toggleBtn = bar.querySelector<HTMLButtonElement>('#liveEditToggleBtn')!
  const toggleLabel = bar.querySelector<HTMLSpanElement>('#liveEditToggleLabel')!
  const saveBtn = bar.querySelector<HTMLButtonElement>('#liveEditSaveBtn')!
  const showEmptyBtn = bar.querySelector<HTMLButtonElement>('#liveEditShowEmptyBtn')!
  const statusEl = bar.querySelector<HTMLSpanElement>('#liveEditStatus')!

  async function saveToDisk(): Promise<boolean> {
    if (isSaving) return false
    isSaving = true
    statusEl.textContent = 'Saving to src/siteContent.ts...'
    statusEl.className = 'font-mono text-[11px] text-amber-300 px-1'

    try {
      const res = await fetch('/__save-site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: workingCopy,
          enableLiveEditor: true,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      statusEl.textContent = `\u2713 Saved to src/siteContent.ts (${timeStr})`
      statusEl.className = 'font-mono text-[11px] text-emerald-300 px-1'
      return true
    } catch (err) {
      statusEl.textContent = `Save error: ${err instanceof Error ? err.message : 'Failed'}`
      statusEl.className = 'font-mono text-[11px] text-rose-400 px-1'
      return false
    } finally {
      isSaving = false
    }
  }

  function scheduleSave() {
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    statusEl.textContent = 'Unsaved edits...'
    statusEl.className = 'font-mono text-[11px] text-sky-300 px-1'
    saveTimer = window.setTimeout(() => {
      saveTimer = null
      void saveToDisk()
    }, 450)
  }

  function applyEditMode(enabled: boolean) {
    editMode = enabled
    if (!enabled) showHiddenEmpty = false
    document.body.classList.toggle('live-text-edit-mode', enabled)
    const editableEls = document.querySelectorAll<HTMLElement>('[data-edit-key]')
    editableEls.forEach(el => {
      const key = el.dataset.editKey!
      if (enabled) {
        el.setAttribute('contenteditable', 'true')
        el.setAttribute('spellcheck', 'true')
        if (key === 'dbs.paper.authors') {
          el.textContent = getNestedValue(workingCopy as unknown as Record<string, unknown>, key)
        }
      } else {
        el.removeAttribute('contenteditable')
        el.removeAttribute('spellcheck')
        if (key === 'dbs.paper.authors') {
          el.innerHTML = formatAuthorsHtml(getNestedValue(workingCopy as unknown as Record<string, unknown>, key))
        }
      }
    })

    syncEmptyTextBoxes(workingCopy, enabled && showHiddenEmpty)

    if (enabled) {
      toggleLabel.textContent = 'Done Editing'
      toggleBtn.className =
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition cursor-pointer'
      saveBtn.classList.remove('hidden')
      saveBtn.classList.add('inline-flex')
      showEmptyBtn.classList.remove('hidden')
      showEmptyBtn.classList.add('inline-flex')
      showEmptyBtn.textContent = showHiddenEmpty ? 'Hide Empty Boxes' : 'Show Removed Boxes'
      statusEl.textContent = 'Click any outlined text to edit (empty boxes auto-remove)'
      statusEl.className = 'font-mono text-[11px] text-sky-300 px-1'
    } else {
      toggleLabel.textContent = 'Edit Website Text'
      toggleBtn.className =
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition cursor-pointer'
      saveBtn.classList.add('hidden')
      saveBtn.classList.remove('inline-flex')
      showEmptyBtn.classList.add('hidden')
      showEmptyBtn.classList.remove('inline-flex')
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer)
        saveTimer = null
        void saveToDisk()
      }
    }
  }

  toggleBtn.addEventListener('click', () => {
    applyEditMode(!editMode)
  })

  saveBtn.addEventListener('click', () => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
    void saveToDisk()
  })

  showEmptyBtn.addEventListener('click', () => {
    showHiddenEmpty = !showHiddenEmpty
    showEmptyBtn.textContent = showHiddenEmpty ? 'Hide Empty Boxes' : 'Show Removed Boxes'
    syncEmptyTextBoxes(workingCopy, editMode && showHiddenEmpty)
  })

  // Prevent links/buttons containing editable text from navigating away while Edit Mode is active
  document.addEventListener(
    'click',
    e => {
      if (!editMode) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const editable = target.closest<HTMLElement>('[data-edit-key]')
      if (!editable) return
      const linkOrBtn = editable.closest('a, button')
      if (linkOrBtn && !bar.contains(linkOrBtn)) {
        e.preventDefault()
        e.stopPropagation()
        editable.focus()
      }
    },
    true,
  )

  // Listen for typing in any [data-edit-key] element (preserving multi-paragraph line breaks via innerText)
  document.addEventListener('input', e => {
    if (!editMode) return
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-edit-key]')
    if (!target) return
    const key = target.dataset.editKey
    if (!key) return

    const rawText = target.innerText ?? target.textContent ?? ''
    const newVal = rawText
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    setNestedValue(workingCopy as unknown as Record<string, unknown>, key, newVal)

    // Sync any other elements on the page bound to the same key
    document.querySelectorAll<HTMLElement>(`[data-edit-key="${key}"]`).forEach(other => {
      if (other !== target) {
        other.textContent = newVal
      }
    })

    scheduleSave()
  })

  // When blurring out of an emptied text box in Edit Mode, immediately remove/hide its box unless Show Removed Boxes is toggled on
  document.addEventListener('focusout', e => {
    if (!editMode) return
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-edit-key]')
    if (!target) return
    const key = target.dataset.editKey
    if (!key) return
    const val = getNestedValue(workingCopy as unknown as Record<string, unknown>, key).trim()
    if (val.length === 0 && !showHiddenEmpty) {
      const box = target.closest<HTMLElement>('[data-edit-box]') || target
      box.classList.add('hidden')
      box.style.display = 'none'
    }
  })

  // Ctrl+S shortcut while in Edit Mode
  document.addEventListener('keydown', e => {
    if (!editMode) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer)
        saveTimer = null
      }
      void saveToDisk()
    }
  })

  // Expose programmatic hook for E2E verification
  ;(window as unknown as Record<string, unknown>).__liveTextEditor = {
    isEditMode: () => editMode,
    setEditMode: (on: boolean) => applyEditMode(on),
    getContent: () => workingCopy,
    saveToDisk,
  }
}
