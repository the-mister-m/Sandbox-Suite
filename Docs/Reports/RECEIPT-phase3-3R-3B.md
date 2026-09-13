# RECEIPT — Phase 3 — 3R redpen — job 3B, Canvas widget — 2026-09-12

Read: SPEC-phase3-3R-sonnet-redpen.md, SPEC-session-agent-phases1-3.md
section 2, RECEIPT-phase3-3B.md whole, SPEC-phase3-3B-opus-canvas-widget.md
whole, RECEIPT-phase3-3A.md CORE API, static/js/widgets/canvas/canvas/canvas.js
whole, static/matrix.html script list, library/registry/widgets.json,
static/js/widgets/test/pipes/pipes.js.

## CHECKS, EVERY RUN

- Every spec default in getOptions and onOption — PASS, all 8 keys
  (target, mode, zoom, selection, schematic, page, assetMode, backLink)
  in canvas.js:1396-1399, 1576-1589, 1543-1574
- Every mirror emit through MX.mirror, no raw MX.bus.emit of a family
  channel — PASS, zero `MX.bus.emit` hits in canvas.js; every emit is
  `cv.mirrors.<name>.emit(...)`
- Mirror receipts never re-emit — PASS, canvas.js:1474 select handler
  calls applySelection (320-324, paints only), canvas.js:1475 freeze
  handler calls applyFreeze (1593-1598, toggles class only)
- subscribe before first send — PASS, canvas.js:1443 subscribe is
  synchronous in mount; the only send (loadTarget→frame.send) runs
  inside the async `MX.canvasCore().then(...)` at 1465-1478
- off and dispose in unmount — PASS, canvas.js:1496-1507: detachListeners,
  closeMenu, mirrors.off(), ResizeObserver.disconnect(), blankIframe,
  frame._canvas/_canvasState cleared
- No module-level mutable state two instances would share — PASS with
  a note: canvas.js:1469 writes `MOD.optionControls` on every mount,
  which is module-level. Value is identical and idempotent every write
  (same select lists), so no cross-instance leak; all real per-instance
  state (`cv`) lives on `frame._canvasState`. Same pattern as 3A's
  documented pick. Not a fail.
- Registry row type matches registerWidget — PASS, widgets.json:26
  `"type": "canvas"` = canvas.js:1610 `MX.registerWidget("canvas", MOD)`
- Script tag present, ordered after core tags — PASS, matrix.html:55
  `canvas/canvas.js`, after kit/state/resolve/render/patch/canvas-core
  (49-54), before graph-core.js (56)
- node --check clean — PASS, ran directly, no errors

## CHECKS, JOB 3B

- No `document.` where iframe document should be — PASS, every hit
  listed below is host-DOM (the widget's own bar/tabs/iframe element),
  none touch canvas content:
  canvas.js:22,23,46 (style tag), 50 (bar button), 1285 (tab button),
  1334,1353,1356,1364,1368,1386 (bar/zoom/path/status spans),
  1426,1430,1435,1437 (wrap/tabBar/body/iframe). All canvas-content
  paths (matrixEl, viewport, paintSelection, openMenu, guides layer)
  use `cv.idoc` throughout.
- No sandbox attribute on the iframe — PASS, zero hits for `sandbox`
  in canvas.js
- setSelection emits canvas.select; State.on emits canvas.change;
  pointerdown emits canvas.focus; mode change emits canvas.mode — PASS,
  canvas.js:315, 1206/1010, 479/1016, 1311. Note: doc mode binds
  `mousedown` (742-755) not `pointerdown` for the focus emit, file mode
  binds `pointerdown` (1096-1107) — a small double-check, not a fail:
  ported from Code Canvas's original mousedown binding, payload shape
  unaffected, ids space respected.
- Export writes back-link meta only when backLink true — PASS,
  canvas.js:1250-1252
- File-mode commit patches the string without reloading the iframe —
  PASS, canvas.js:1067 (`onFilePointerUp`) and :970 (text edit) both
  call `patchSource` which mutates `cv.source` only, no `loadIframe`
  call in either path
- canClose asks when dirty — PASS, canvas.js:1481-1494, mirrors
  editor.js's Save/Discard/Cancel shape
- `frame._canvas` exposes every name in the CANVAS API section — PASS,
  canvas.js:1454-1463 has all 8: place, selected, freeze, redraw,
  state (getter), source, patchSource, mode

## RULED ITEMS, not re-litigated

- Pipes `canvas.select` check: confirmed pipes.js:45 still mirrors
  `graph.select` only, untouched, no `canvas.select` line anywhere in
  the file — matches the ruling that the builder's bus-listener proof
  stands in for it
- `canvas.select` gains `notes: true` (canvas.js:430): additive field
  on top of the pinned `{target, inst, ids}`, no field renamed or
  dropped — not a narrowing

## CONTRACT 2.7 — canvas family channels, checked against every emit site

- `canvas.select {target,inst,ids}` — canvas.js:315, plus :430 additive
  `notes` — PASS
- `canvas.focus {target,inst}` — canvas.js:479, :1016 — PASS
- `canvas.doc {target,inst,mode,path}` — canvas.js:1176, :1194 — PASS
- `canvas.change {target,inst}` — canvas.js:1206, :1010 — PASS
- `canvas.freeze {target,inst,on}` — canvas.js only listens (1475),
  never emits; contract says "Code widget asks; canvas obeys" — PASS
- `canvas.mode {target,inst,mode}` — canvas.js:1311 — PASS

No field renamed, none dropped, nothing narrowed.

## CONTRACT 2.8 — persisted keys, checked hardest

Required canvas-family base keys: target, mode, zoom, selection,
schematic. All five present in getOptions (canvas.js:1579-1588) and
onOption (1543-1574). Per-widget additions (page, assetMode, backLink)
are named in the 3B job spec's own defaults list — additive, not a
substitute for the base five. PASS, no narrowing.

## QUESTIONS for the session agent

- none

## MAY FIX applied

- none — nothing broken found

## Done when

Every check PASS. No FAIL lines.
