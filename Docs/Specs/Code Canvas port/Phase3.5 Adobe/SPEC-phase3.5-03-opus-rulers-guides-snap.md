# SPEC — Phase 3.5 — 03 — Opus — Rulers, guides, snap, zoom

Written 2026-09-14. Runs after R1 green, beside 2. The canvas gets
rulers, draggable guides, margin and column lines, snap to grid /
guides / object edges, and zoom back for file mode.

Contracts: scope sections 3.1 (guides on body), 3.3, 3.4 (job 3
line), picks P1, P8.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing else.
- Everything you draw lives in the guides layer
  (`[data-od-edit-guides-layer]`) or a sibling host node you create
  with `data-od-edit-bridge="rulers"`, so patch.js skips it and it is
  never saved.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-03.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 1, 3.1, 3.3, 3.4, 5.
- canvas.js whole after job 1. About 30K. The file pointer handlers,
  `renderReferenceGuides`, `ensureGuidesLayer`, `fileNudge`,
  `onOption`, `getOptions`, MOD.defaults.
- canvas-core.js :170-240 — the guides stylesheet.

## Stage 1 — receipt outline. Check.

## Stage 2 — zoom for file mode

`zoomPct` option returns, 25–400. The iframe's `documentElement` gets
`zoom` via CSS `transform: scale()` on body with `transform-origin: 0
0`, and the guides layer compensates: every rect you read from the
live document is divided by the scale before drawing chrome, and
every pointer delta is divided before it becomes a translate. Bar:
− % + Fit. Cmd-+ / Cmd-− / Cmd-0, Cmd-wheel around the pointer, Space
+ drag pans. Check.

## Stage 3 — rulers, margins, columns

- Two ruler strips, top and left, 20px, in a host node, ticks every
  grid step, numbers every 100px, in page px regardless of zoom.
- Margin rectangle and column rectangles read from `page()` (compute
  it here from `:root`; job 2 is doing the same in tools; agree on
  the token names from 3.1). Drawn as thin lines in the guides layer
  when `showMargins` / `showColumns`.
- Options `rulers`, `showMargins`, `showColumns`, `showGuides` per
  3.3, with bar toggles under ⚙ only. Check.

## Stage 4 — guides

- Pointer down on the top ruler and drag into the page creates a
  horizontal guide; left ruler a vertical one. Drop writes
  `data-cc-guides` on body via `set-attr` (job 1b). A guide can be
  dragged; dragging it back onto its ruler removes it.
- `guides()`, `addGuide`, `removeGuide` on `frame._canvas`.
- Drawn as lines in the guides layer when `showGuides`. Check.

## Stage 5 — snap

- `snapPoint({x,y})`: for each axis, the nearest of grid step (when
  `snapTo` has grid), guide (guides), sibling edges and centres
  (objects) within 6 page px; else the input.
- During a drag, the translate is snapped so the element's left/top
  edge lands on the snap; a snapped edge draws a bright line for the
  duration. Nudge is not snapped.
- `snap` and `snapTo` options per 3.3. ⚙ rows and a bar toggle
  "snap". Check.

## Stage 6 — test and receipt

Docs/tests/phase35_03.py, headless: fixture copy; canvas mode; zoom to
50%, an element's chrome rect matches its bounding rect × 0.5; drag
from the top ruler to y=300, `data-cc-guides` contains `h:300`; drag
the pull quote to y=297, it lands at 300; snap off, it lands at 297;
Cmd-Z restores; reload, the guide persists. Run it. Receipt. Check.

## Done when

- Rulers read true page px at every zoom.
- A guide survives save and reload.
- Snap lands within 1px of grid, guide and sibling edges.
- Nothing you drew appears in the saved file.
- phase35_03.py passes. node --check clean.
