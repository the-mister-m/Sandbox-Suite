# SPEC — Phase 3.5 — 05 — Opus — Layers on the canvas

Written 2026-09-14. Runs after 3, beside 4. The canvas honours layers:
locked and hidden, active layer for new items, Adobe's item menu and
keys, insertAt, translate folded to left/top, and the layer and page
API lifted onto `frame._canvas`.

Contracts: scope sections 3.1, 3.3 (activeLayer), 3.4 (jobs 2, 4, 5
lines), 3.6, pick P5.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing else.
- Job 4 is writing the same helpers in tools.js against `doc()` and
  `patchSource`. When both land, yours on `frame._canvas` are the
  truth; job 4's receipt tells you which helpers to lift verbatim.
  Read its receipt if it exists when you start; if not, implement
  from scope 3.4 and name it.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-05.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 1, 3.1, 3.3, 3.4, 3.6, 5.
- canvas.js whole after job 3. About 35K. `closestTarget`,
  `onFilePointerDown/Move/Up`, `menuItems`, `onFileKeyDown`,
  `applyPatches`, `frame._canvas`.
- Docs/Reports/RECEIPT-phase3.5-04.md if present.

## Stage 1 — receipt outline. Check.

## Stage 2 — API on frame._canvas

`page()`, `setPage()`, `layers()`, `addLayer()`, `removeLayer()`,
`renameLayer()`, `setLayerFlag()`, `moveLayer()`, `mergeDown()`,
`moveToLayer()`, `layerOf()`, `activeLayer()`, `setActiveLayer()`,
`insertAt(html, {x,y}, ns)`, `selectAllOnLayer()`, `lockSelection()`,
`unlockAll()`, `hideSelection()`, `showAll()`. Multi-patch helpers use
`applyPatches` directly so each is one history entry. `applyPatches`
is exposed as `patchMany(patches)`. Check.

## Stage 3 — locked, hidden, active

- `closestTarget` stops at a `[data-cc-locked]` layer or element and
  returns null: no select, no drag, no menu. Marquee skips them.
- Hidden layers are `display: none` from the page block; nothing to
  do but skip them in marquee.
- `activeLayer` option per 3.3. Falls to the topmost unlocked layer.
  `insertAt` targets it; a locked or missing active layer refuses
  with status `layer locked`.
- Lock and hide on an item: `set-attr data-cc-locked` / `-hidden` on
  the element itself, plus `display:none` set-style for hidden.
  Check.

## Stage 4 — menu and keys

Canvas right-click on an item: Group, Ungroup, Isolate, Arrange ▸
(Bring to front, Bring forward, Send backward, Send to back), Lock,
Unlock all, Hide, Show all, Move to layer ▸ (one row per layer),
Duplicate, Delete. `menuItems()` returns this list; nested rows as
`[label, fn]` with a `[label, items]` shape for submenus — document
the shape in the receipt for tools. Keys: Cmd-2 lock selection,
Cmd-Opt-2 unlock all, Cmd-3 hide selection, Cmd-Opt-3 show all, Cmd-A
select all on active layer, Cmd-Shift-A deselect, Esc leaves isolate.
Isolate: `canvas.select {ids, isolate:true}` from tools or the menu
dims everything else with a guides-layer overlay and limits hit-
testing to the isolated subtree. Check.

## Stage 5 — translate folds to left/top

On pointer up after a drag of an absolutely positioned element, the
patch is `set-style {left, top, transform:""}` computed from the
start left/top plus the drag delta, instead of a translate. Elements
that are not absolutely positioned keep the translate path. Nudge
does the same. Check.

## Stage 6 — test and receipt

Docs/tests/phase35_05.py, headless: fixture copy; lock Art via
`setLayerFlag`; click a shape, selection empty; unlock; Cmd-3 on the
pull quote, it is display none and carries data-cc-hidden; Cmd-Opt-3;
`insertAt('<div style="…">x</div>', {x:100,y:100})` lands in the
active layer at left 100 top 100; drag the caption 30px right, its
style has left +30 and no transform; right-click a column frame, the
menu has every row in stage 4; Cmd-A selects the Text layer's
children. Run it. Receipt. Check.

## Done when

- Every name in 3.4 jobs 2, 4, 5 is on `frame._canvas`.
- A locked layer's children never select by click or marquee.
- A drag ends with left/top, no transform, for absolute elements.
- Every key and menu row in stage 4 works.
- phase35_05.py passes. node --check clean.
