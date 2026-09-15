# RECEIPT — Phase 3.5-Adobe — F3

Work order: [RECEIPT-phase3.5-F2.md](RECEIPT-phase3.5-F2.md), STUCK note (phase35_15.py line 3)

## SESSION REVIEW — Phase 3.5-Adobe F3 — 2026-09-14

EDITS
- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — `insertAt` now targets a layer whose plugin matches the insert's `ns`, creating one if none exists

STRAY FILES
- none

## STAGES

1. [x] Grepped `insertAt`/`activeLayer` in canvas.js, read only lines
   1690-1910 and 1125-1170 (runPatches/applyPatches) and 1517-1530
   (fileChildren/parentKeyOf).
2. [x] Added `insertLayer(cv, wantPlugin)` — activeLayer if its
   `data-cc-plugin` matches, else the topmost unlocked layer of that
   plugin, else null.
3. [x] Rewrote `insertAt` — `ns === "svg"` wants plugin `svg`, else
   `html`. No matching layer: build a `section[data-cc-layer]` (plugin
   `html`) or a `section` wrapping one `svg[data-od-id]` (plugin `svg`),
   named `"Layer " + (nodes.length + 1)`, same shape as `addLayer`. Both
   the layer-insert patch and the element-insert patch go into one
   `applyPatches(cv, patches)` array — one undo entry.
4. [x] `node --check` clean.
5. [x] Docs/tests/phase35_15.py --session 0d78d246515f: 4/4 PASS.
6. [x] Docs/tests/phase35_05.py: 9/9 PASS, stayed green.

## PICKS I MADE

- Did not call the existing `addLayer` — it runs its own `applyPatches`,
  which would split the create+insert into two undo steps. Inlined the
  same html shape instead, in the combined patch array.
- The new svg layer's inner `<svg>` gets an explicit `data-od-id` (a
  second `cv.patch.newId("el")`) so the element-insert patch's `parent`
  can address it directly — `doInsert` only auto-assigns ids to
  descendants after the layer patch has already run, and the two
  patches are built before either runs.
- Left `activeLayerEl` untouched — still used by the `activeLayer`
  getter (line ~2454) and `selectAllOnLayer` (line ~1883), neither of
  which is plugin-aware and neither was in scope.
- Did not set `cv.activeLayer` after creating a fallback layer — original
  code never set active layer on the old fallback path either; not asked.

## CONTRACT FIELDS ADDED

- 3.3 activeLayer empty falls to the topmost unlocked layer of matching plugin

## node --check

- canvas.js — clean.

## READ LEDGER

- static/js/widgets/codecanvas/canvas/canvas.js — lines 1690-1910
  (layerNodes/layerById/activeLayerEl/addLayer/placeHtmlAt/insertAt),
  1125-1170 (runPatches/applyPatches), 1517-1530 (fileChildren/
  parentKeyOf), grep hits for `insertAt`/`activeLayer`, once each (never
  opened whole)
- static/js/widgets/codecanvas/shared/patch.js — lines 440-500
  (doRemove/doInsert), once
- Docs/Reports/RECEIPT-phase3.5-F2.md — STUCK section, once
- Docs/tests/phase35_15.py, Docs/tests/phase35_05.py — run only, not read

## SUPERSEDED

None.
