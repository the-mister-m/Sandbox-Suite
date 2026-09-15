# SPEC — Phase 3.5 — 04 — Opus — Layers panel

Written 2026-09-14. Runs after 2 and 15, beside 5. The Layers tab
becomes a layer-first outliner with Adobe's right-click set. The layer
API lands here as helpers on the bound canvas's doc and patchSource;
job 5 lifts them onto `frame._canvas`.

Contracts: scope sections 3.1 (layers), 3.2, 3.4 (job 4 line), 3.6,
picks P2, P3.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
  Do not edit canvas.js; job 5 owns it now.
- The word is `plugin`. Never kind, type, engine.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-04.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 1, 3.1, 3.2, 3.4, 3.6, 5.
- tools.js whole after jobs 2 and 15. About 18K. The file layers
  renderer, `openLayerMenu`, `fileSelect`, the drop handlers.
- patch.js — the 1b KINDS table in its receipt. wrap, move, insert,
  remove, set-attr.

## Stage 1 — receipt outline. Check.

## Stage 2 — layer model helpers

In tools.js, on the bound canvas `a`:
- `ensureLayers(a)`: when body has no `section[data-cc-layer]`, wrap
  every non-host body child in one via `wrap` with a fresh
  `ly_` id, then `set-attr` name "Layer 1" and plugin "html". One
  history entry.
- `layers(a)`, `addLayer(a, name, plugin)` (insert an empty section,
  svg plugin gets its `<svg viewBox="0 0 W H">` from `page()`),
  `removeLayer`, `renameLayer`, `setLayerFlag`, `moveLayer` (move among
  body children), `mergeDown` (move every child into the layer below
  then remove), `moveToLayer(ids, layerId)` (move each to the end of
  the target), `layerOf(id)`. Exactly the names in scope 3.4 job 4.
- Every helper is patches through `a.patchSource`, one call per
  helper where the canvas exposes only single-patch apply; name that
  in the receipt for job 5. Check.

## Stage 3 — the outliner

- Rows: a layer row (name, plugin badge, eye, lock, active dot),
  then its items indented. Layer rows first-is-bottom in the DOM but
  drawn top-is-front, like Adobe. Items keep DOM order drawn reversed
  the same way.
- Active layer: click a layer row sets it; the dot marks it. Stored
  on the canvas option `activeLayer` via `boundFrame().setOption`.
- Per item row: ▲ ▼ (move among siblings), ◀ (outdent: move to after
  its parent), ▶ (indent: move into the previous sibling as last
  child). Disabled when impossible.
- Drag: rows onto rows as today; a row onto a layer row moves it into
  that layer at the end; top/bottom quarter on a layer row reorders
  layers.
- Double-click a layer name to rename inline. Enter commits, Esc
  cancels.
- Head buttons: + Layer, Group, Ungroup. Check.

## Stage 4 — right-click

Layer row: New layer, Duplicate layer, Delete layer, Rename, Lock /
Unlock, Hide / Show, Merge down, Select all on layer, Move selection
here. Item row: the canvas's `menuItems()` plus Isolate (select the
item and its descendants only, dim the rest via a guides-layer
overlay — read-only here; job 5 owns the canvas side, so emit
`canvas.select {ids, isolate: true}` and let job 5 paint). Keys are
job 5's. Check.

## Stage 5 — test and receipt

Docs/tests/phase35_04.py, headless: fixture copy; layers tab shows
Text and Art; + Layer "Notes"; rename it; drag the pull quote row into
Notes; ▲ once; lock Notes, the lock shows; hide, the row greys; right-
click Text → Select all on layer, the selection count equals its
children; Merge down Notes into Text; Cmd-Z x3; save; reload; the
tree matches. A plain html with no layers gets "Layer 1" on first
render. Run it. Receipt. Check.

## Done when

- Every helper in 3.4 job 4 exists with that name and writes only
  through patches.
- Every right-click line in stage 4 does what it says.
- ▲▼◀▶ and drag give the same result as each other.
- A no-layer file gains one layer and nothing else changes.
- phase35_04.py passes. node --check clean.
