# SPEC — Phase 3.5 — 07 — Sonnet — Object panel

Written 2026-09-14. Runs after 6. The inspector grows a Transform
group and extends Surface, Border and the image head.

Contracts: none new. Inspector controls as they stand in tools.js.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
- Stages below. Stage 1 writes the receipt outline. Cap 120K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-07.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, section 5.
- tools.js whole after job 6. About 25K. `STYLE_GROUPS`,
  `styleControlFor`, `numberUnitControl`, `renderInspector`.

## Stage 1 — receipt outline. Check.

## Stage 2 — Transform group

First group after the head: X, Y, W, H (px, from left/top/width/
height), a W:H lock toggle that writes the other when one changes,
Rotate (degrees; reads and writes `rotate(Ndeg)` inside `transform`,
preserving any other functions), Flip H / Flip V buttons (toggle
`scaleX(-1)` / `scaleY(-1)` the same way). Check.

## Stage 3 — Surface and Border

Surface gains `mixBlendMode` (select: normal, multiply, screen,
overlay, darken, lighten, difference) and keeps opacity. Border gains
`borderStyle` dashed/dotted already there; add `outlineOffset`? No.
Add stroke for SVG children: when the selected element is inside an
`<svg>`, the groups become Fill (fill, fill-opacity), Stroke (stroke,
stroke-width, stroke-dasharray, stroke-linecap, stroke-linejoin,
stroke-opacity), Transform (as stage 2, rotate around the element's
centre via `transform-origin: center` + `transform-box: fill-box`).
Written as inline style through set-style; SVG presentation
attributes are not touched. Check.

## Stage 4 — image head

For `img` and for a div whose only child is an img: Fit (select:
cover, contain, fill, none) → `objectFit`; Position (select: center,
top, bottom, left, right, and a free `x% y%` text) → `objectPosition`;
Crop: when the img sits in a frame div, W/H/X/Y of the img inside the
frame with the frame at `overflow:hidden`. Upload button: file input →
data url → set-attr `src` (folder mode is a later phase). Check.

## Stage 5 — test and receipt

Docs/tests/phase35_07.py, headless: fixture copy; select the pull
quote; Rotate 15 → transform contains rotate(15deg); Flip H → also
scaleX(-1); W:H lock, set W → H follows; opacity 0.5; blend
multiply; select the photo frame; Fit cover; select a rect in the
svg; stroke-width 4 → its style has it. Run it. Receipt. Check.

## Done when

- Every field reads the live value and writes one patch.
- Rotate never clobbers translate or scale already in transform.
- SVG children show the SVG groups, HTML ones the HTML groups.
- phase35_07.py passes. node --check clean.
