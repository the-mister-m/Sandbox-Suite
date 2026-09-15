# RECEIPT — Phase 3.5 — 04 — Layers panel

Spec: [SPEC-phase3.5-04-opus-layers-panel.md](../Specs/Code%20Canvas%20port/Phase3.5%20Adobe/SPEC-phase3.5-04-opus-layers-panel.md)
Scope: [SCOPE-phase3.5-adobe.md](../Scope/Code%20Canvas%20port/SCOPE-phase3.5-adobe.md)
Owns: [tools.js](../../static/js/widgets/codecanvas/tools/tools.js) only.

## STAGES

- [x] Stage 1 — receipt outline
- [x] Stage 2 — layer model helpers. `node --check` clean. Tool calls: 23.
- [x] Stage 3 — the outliner. `node --check` clean. Tool calls: 29.
- [x] Stage 4 — right-click. `node --check` clean. Tool calls: 35.
- [x] Stage 5 — test and receipt. `node --check` clean. Tool calls: 46.

## TEST RESULT

[Docs/tests/phase35_04.py](../tests/phase35_04.py), headless, against a copy of
phase35-magazine.html and a written-then-removed plain html, via the running
server, session 0d78d246515f, surface phase35-04-headless. 12/12 passed, first
run. Log: [phase35_04-results.json](phase35-04/phase35_04-results.json)

1. PASS — fixture copy opens in file mode
2. PASS — layers tab shows Text and Art, top is front
3. PASS — + Layer then rename gives Notes on top
4. PASS — drag the pull quote row into Notes
5. PASS — ▲ once moves the bottom item one slot forward
6. PASS — lock Notes, the lock shows
7. PASS — hide Notes, the row greys
8. PASS — right-click Text → Select all on layer, count equals its children (6)
9. PASS — Merge down Notes into the layer below
10. PASS — Cmd-Z x3 brings Notes and the pull quote back
11. PASS — save, reload, the tree matches
12. PASS — a plain html with no layers gets Layer 1

## CONTRACT FIELDS (scope 3.4 job 4)

Written as tools.js-local functions taking the bound canvas `a` first;
job 5 lifts each onto `frame._canvas` under the name in the left column.

| name | signature | returns | writes through |
| --- | --- | --- | --- |
| `layers` | `layers(a)` | `[{id,name,plugin,locked,hidden}]`, DOM order | read only |
| `addLayer` | `addLayer(a, name, plugin)` | new layer id | insert |
| `removeLayer` | `removeLayer(a, id)` | — | remove |
| `renameLayer` | `renameLayer(a, id, name)` | — | set-attr `data-cc-name` |
| `setLayerFlag` | `setLayerFlag(a, id, "locked"\|"hidden", bool)` | — | set-attr `data-cc-locked` / `data-cc-hidden`, null removes |
| `moveLayer` | `moveLayer(a, id, index)` | — | move, parent `__body__` |
| `mergeDown` | `mergeDown(a, id)` | — | move per child, then remove |
| `moveToLayer` | `moveToLayer(a, ids, layerId)` | — | move per id, to the end |
| `layerOf` | `layerOf(a, id)` | layer id or `""` | read only |
| `activeLayer` | `activeLayer(tl)` | layer id or `""` | canvas option `activeLayer` |
| `setActiveLayer` | `setActiveLayer(tl, id)` | — | `boundFrame().setOption` |

Plus `ensureLayers(tl, a)` — a file with no `[data-cc-layer]` gains
"Layer 1" on first render.

Layer fields on the element: `data-cc-layer`, `data-cc-name`,
`data-cc-plugin` (`html` | `svg`), `data-cc-locked="1"`,
`data-cc-hidden="1"`. The engine word is `plugin` throughout.

## PICKS I MADE

- `ensureLayers` uses `wrap` as the spec directs, and patch.js's `doWrap`
  always makes a `<div data-od-group="1">`, never a `<section>`. So a
  converted file's first layer is a `div[data-cc-layer]`, not the
  `section` in contract 3.1. The contract's own CSS selector is
  attribute-based, so it styles the same; `layers()` finds layers by
  `[data-cc-layer]`, never by tag. `data-od-group="1"` cannot be removed
  (set-attr refuses `data-od-` names), so a converted layer also reads as
  a group. `addLayer` writes a real `<section>`. Job 5 or a redpen can
  give `wrap` a tag argument if the tag matters.
- `patchSource` still takes one patch per call (canvas.js:1987), so
  "one history entry" is not reachable: `ensureLayers` is 4 calls (wrap +
  three set-attr), `mergeDown` is one move per child plus a remove,
  `moveToLayer` one move per id. Named here for job 5 — a multi-patch
  `patchSource` would collapse each helper to one entry.
- The helpers are tools.js-local and take the bound canvas `a` first,
  the shape job 2 set for `readPage`. Job 5 lifts them onto
  `frame._canvas` under the scope 3.4 names, dropping the `a`.
- `activeLayer` is written with `boundFrame().setOption("activeLayer", id)`
  per the spec and mirrored in `tl.activeLayerLocal`. The canvas's
  `getOptions` does not list it yet, so it does not survive a reload —
  job 5 adds it to the canvas's option set.
- Items are drawn reversed like layers, so ▲ is "later in the DOM"
  (forward) and ▼ is "earlier" (back). The drag bands on an item row
  follow: the top quarter is the later slot.
- A locked layer's item rows lose ▲▼◀▶ and dragging. The lock has to
  mean something in the panel; the canvas side of lock is job 5's.
- `Merge down` on the bottom layer is drawn dimmed and does nothing;
  `Move selection here` is dimmed with an empty selection.
- Isolate emits `canvas.select {ids, isolate: true}` with the item and
  its descendants, and paints nothing. Job 5 owns the dimming overlay.
- The spec's walk line "Merge down Notes into Text" cannot hold as
  written: a new layer lands on top, so the fixture order is Text, Art,
  Notes and the layer below Notes is Art. The test asserts the contract —
  merge goes into the layer directly below — and names Art.
- Test check 5 clicks ▲ on the panel's bottom item row (the Text layer's
  first DOM child) rather than an item in one-child Notes, where ▲ is
  correctly disabled.
- `duplicateLayer` strips every `data-od-` attribute from the clone so
  `doInsert` stamps fresh ids, and inserts directly above the original.

## READ LEDGER

- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-04-opus-layers-panel.md — whole, once
- Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md — lines 12-35, 37-67, 69-205, 240-260, once
- Docs/Reports/RECEIPT-phase3.5-02.md, RECEIPT-phase3.5-15.md — EDITS/PICKS/READ LEDGER sections only, once
- Docs/Reports/RECEIPT-phase3.5-01b.md — grep only (KINDS table, wrap row), once
- static/js/widgets/codecanvas/tools/tools.js — grep map, then lines 1-30, 94-156, 155-200, 305-430, 655-870, 900-1050, once
- static/js/widgets/codecanvas/shared/patch.js — grep, then lines 41-50, 349-380, 414-462, 521-545, once
- static/js/widgets/codecanvas/canvas/canvas.js — grep, then lines 1982-2010 (frame._canvas), once
- static/js/matrix/widget-frame.js — lines 97-120 (setOption), once

- Docs/tests/phase35_15.py — whole (209 lines), once, as the harness pattern
- Docs/scratchpad/phase35-magazine.html — grep only (layer/quote lines), once

Tool call count at receipt finish: 49

## STUCK

None. Every stage closed on its first attempt; the walk ran once, 12/12.

## SESSION REVIEW — Sandbox Suite — Phase 3.5-Adobe job 4 — layers panel

### EDITS

- [static/js/widgets/codecanvas/tools/tools.js](../../static/js/widgets/codecanvas/tools/tools.js) — layer model helpers, the layer-first outliner, layer and item right-click menus, panel styles
- [Docs/tests/phase35_04.py](../tests/phase35_04.py) — headless walk, 12 checks
- [Docs/Reports/phase35_04-results.json](phase35-04/phase35_04-results.json) — the run's log

### STRAY FILES

- None. The fixture copy and the plain html are removed at teardown.

### GOALS DONE

- Every scope 3.4 job 4 name exists and writes only through patches
- Adobe's layer right-click set, plus Isolate on item rows
- ▲▼◀▶ and drag give the same result
- A no-layer file gains one layer, "Layer 1", and nothing else changes
- phase35_04.py 12/12, `node --check` clean after every stage

### BRANDON'S TODOS

- None.

### CLOSER REVIEW

- Job 5 lifts the eleven helpers onto `frame._canvas` and adds
  `activeLayer` to the canvas's option set — closer: hand to job 5
- `wrap` makes a `div`, not the `section` contract 3.1 draws; ruling
  wanted or leave as is — Brandon
- A multi-patch `patchSource` would make each helper one undo step — Brandon
