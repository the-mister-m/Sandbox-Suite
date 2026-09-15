# STICKY — Phase 3.5-Adobe — decisions held this session

2026-09-14. Session agent fable (region untitled.2). Folds into the
session review at close.

## Brandon's rulings

- Phase name: 3.5-Adobe.
- Target: InDesign (layout) + Illustrator (vector). No raster. No 3D.
  Pen tool, raster, 3D go to the Phase 4 scope later.
- The .json and doc mode are removed completely. HTML is the document.
  Git holds the fallback. (Confirms the 2026-09-13 ruling in
  SCOPE-phase3F-file-mode.md section 1.)
- Page size in pixels.
- Backdrop image is manual: place it, send it back. No special slot.
- Named layers, fluid: drag between parents and children, buttons for
  the same, right-click for everything Adobe puts on right-click, keys.
- Layer kinds are called `plugin`. Consistent across every codecanvas
  widget. `kind` stays the word for patch kinds.
- Threading (text overflow frame to frame) is its own job. Magazine
  columns are the use case.
- Masters: yes.
- Everything from the small and medium lists. Plus the "next fruit":
  gradients, eyedropper, select same, isolation, numeric transform,
  paragraph panel, drop cap, text wrap, object styles, blend, clip,
  text on path.
- Kit library is gone with doc mode. A snippets drawer replaces it.
- One scope for the session agent, one spec per job.
- Subagents are GoTo with model overrides. Session agent picks models.
- Code comments: label, function, state. "spine" banned.
- Agents sized ~120K target, ~180K hard cap. Small jobs.
- Headless tests inside each job. Headed walks only at big seams.
- Redpen at seams and before anything that builds on a job.
- Fixes under 4K stay with the session agent; larger get a fix agent.
- Every subagent prewrites a receipt with its stage outline and updates
  it as it goes. Test agents get a loop guard.
- Fixture: one magazine page with everything piped in.

## Session agent picks (red-pennable)

- Page geometry as CSS custom properties on :root in a
  `<style data-cc="page">` block.
- Layers are `body > section[data-cc-layer]`. Attributes carry name,
  plugin, locked, hidden.
- Everything this phase adds is prefixed `data-cc-`. `data-od-` stays
  for ids and groups from the Open Design port.
- Job 1b added: patch kinds `set-attr`, `set-css-rule`,
  `remove-css-rule`, SVG-aware `insert`. One sonnet on patch.js.
- Masters are a separate `.master.html` file linked from the page.
- Pages are files. Targets tabs are the page list.

## Paths

- Scope: Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md
- Specs: Docs/Specs/Code Canvas port/Phase3.5 Adobe/
- Receipts: Docs/Reports/RECEIPT-phase3.5-<job>.md
- Handoffs: Docs/Handoffs/HANDOFF-phase3.5-<job>.md
- Tests: Docs/tests/phase35_<job>.py
- Fixture: Docs/scratchpad/phase35-magazine.html
