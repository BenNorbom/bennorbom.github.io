#!/usr/bin/env python3
"""
Extract the Project 64 movement planner & 3D simulator engine from
`Project64/movement_algorithm/simulator/index.html` into a clean, scoped ES module
`src/simulations/project64/p64Engine.js` with viewport auto-pause and zero global leaks.
"""

import os

SRC_HTML = r"c:\Users\benbe\OneDrive\Documents\Project64\movement_algorithm\simulator\index.html"
OUT_DIR = r"c:\Users\benbe\OneDrive\Documents\Website\src\simulations\project64"

os.makedirs(OUT_DIR, exist_ok=True)

with open(SRC_HTML, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Extract script lines between <script> (line 235, 0-indexed 234) and </script> (line 2262, 0-indexed 2261)
start_idx = next(i for i, l in enumerate(lines) if l.strip() == "<script>") + 1
end_idx = next(i for i, l in enumerate(lines) if l.strip() == "</script>")
body = "".join(lines[start_idx:end_idx])

# 1. Replace `document.getElementById(` with scoped `getEl(`
body = body.replace("document.getElementById(", "getEl(")

# 1b. Replace inline `onclick="selectSquareOrMove(${c}, ${r})"` in 2D mini-board with data attributes for ES module scoping
old_miniboard_btn = 'onclick="selectSquareOrMove(${c}, ${r})"'
new_miniboard_btn = 'type="button" data-p64-col="${c}" data-p64-row="${r}"'
assert old_miniboard_btn in body, "Expected mini-board onclick snippet"
body = body.replace(old_miniboard_btn, new_miniboard_btn)

# 2. Prevent outer-window scroll jump in renderCommandLog()
old_scroll = "if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });"
new_scroll = "if (activeRow && container) { container.scrollTop = Math.max(0, activeRow.offsetTop - container.offsetTop - 48); }"
assert old_scroll in body, "Expected scrollIntoView snippet"
body = body.replace(old_scroll, new_scroll)

# 3. Make mouse wheel zoom require Ctrl key or fullscreen so normal page scrolling works naturally
old_wheel = """    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      camera.distance = Math.max(7.5, Math.min(26.0, camera.distance + e.deltaY * 0.008));
    }, { passive: false });"""

new_wheel = """    canvas.addEventListener('wheel', e => {
      if (!e.ctrlKey && !document.fullscreenElement) return;
      e.preventDefault();
      camera.distance = Math.max(7.5, Math.min(26.0, camera.distance + e.deltaY * 0.008));
    }, { passive: false });"""
assert old_wheel in body, "Expected wheel handler snippet"
body = body.replace(old_wheel, new_wheel)

# 4. Replace uncontrolled tail `requestAnimationFrame(animate)` with managed viewport-aware lifecycle
old_tail = """      requestAnimationFrame(animate);
    }

    resetBoardStandard();
    requestAnimationFrame(animate);"""

new_tail = """      if (viewportActive && !disposed) {
        rafId = requestAnimationFrame(animate);
      } else {
        rafId = 0;
      }
    }

    let rafId = 0;
    let viewportActive = false;
    let disposed = false;

    function syncAnimation() {
      if (viewportActive && !disposed && !rafId) {
        lastFrameTime = performance.now();
        rafId = requestAnimationFrame(animate);
      } else if ((!viewportActive || disposed) && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    const miniBoardEl = getEl('miniBoardGrid');
    if (miniBoardEl) {
      miniBoardEl.addEventListener('click', e => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-p64-col]') : null;
        if (!btn) return;
        const col = Number(btn.getAttribute('data-p64-col'));
        const row = Number(btn.getAttribute('data-p64-row'));
        if (Number.isFinite(col) && Number.isFinite(row)) {
          selectSquareOrMove(col, row);
          if (!rafId) animate(performance.now());
        }
      });
    }

    resetBoardStandard();
    // Render one crisp initial frame immediately even before scrolled into view
    animate(performance.now());
    if (!viewportActive && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    return {
      runScenario,
      resetBoardStandard,
      resetBoardWithMagnet,
      setCameraPreset,
      toggleRuleMode,
      toggleXray,
      toggleRadii,
      togglePause,
      skipCurrentAnimation,
      clearSelection,
      executeAlgebraicInput,
      updateParam,
      zoomBy(delta) {
        camera.distance = Math.max(7.5, Math.min(26.0, camera.distance + delta));
        if (!rafId) animate(performance.now());
      },
      setViewportActive(active) {
        viewportActive = Boolean(active);
        syncAnimation();
      },
      isAnimating() {
        return Boolean(rafId);
      },
      getState() {
        return {
          commandCount: commandQueue.length,
          activeCmdIndex,
          gantry: { ...gantry },
          pieceCount: pieces.length,
        };
      },
      dispose() {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      },
    };"""

assert old_tail in body, "Expected tail animation loop"
body = body.replace(old_tail, new_tail)

module_src = f"""// Auto-generated scoped module from Project64/movement_algorithm/simulator/index.html
// Preserves 100% of Project 64's movement planner, half-square lattice A* router,
// square-edge neighbor nudging, legal chess engine, and 3D gantry renderer.

export function initProject64Engine(root) {{
  const getEl = (id) => root.querySelector(`[data-p64-id="${{id}}"]`) || root.querySelector(`#${{id}}`);
{body}
}}
"""

out_js = os.path.join(OUT_DIR, "p64Engine.js")
with open(out_js, "w", encoding="utf-8") as f:
    f.write(module_src)

print(f"Generated {out_js} ({len(module_src)} bytes)")
