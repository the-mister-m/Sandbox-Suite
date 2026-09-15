# SPEC — Phase 3.5 — 08 — Opus — Rotate handle, resize handles

Written 2026-09-14. Runs after W1, beside 6. The selection chrome
gets working resize handles and a rotate handle, with snap.

Contracts: none new. Job 3's snap and zoom.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing else.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-08.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.3, 5.
- canvas.js whole after job 5. About 38K. `renderSelectedChrome`,
  the file pointer handlers, `snapPoint`, the zoom scale.

## Stage 1 — receipt outline. Check.

## Stage 2 — resize handles

The eight handles in `renderSelectedChrome` become interactive: a
pointer down on one starts a resize gesture on the single selected
element (multi-select resizes nothing). Writes left/top/width/height
per the handle direction on pointer up, one set-style. Shift holds
the aspect ratio. Snap applies to the moving edge. Works on SVG
children by writing x/y/width/height attributes via set-attr for
rect and image, cx/cy/rx/ry for ellipse, x1..y2 for line; path and
polygon get a CSS transform scale instead. Check.

## Stage 3 — rotate handle

A ninth handle above the top-centre one. Drag rotates around the
element's centre; the live preview writes `transform` on the element
and pointer up patches it (rotate replaces any existing rotate,
keeps the rest). Shift snaps to 15° steps. The angle shows as a
measure label while dragging. Check.

## Stage 4 — test and receipt

Docs/tests/phase35_08.py, headless: fixture copy; select the pull
quote; drag the se handle +40,+20 → width +40, height +20; Cmd-Z;
shift-drag the se handle → ratio held within 1px; drag the rotate
handle 90° clockwise → transform rotate(90deg) within 1°; shift-drag
to 50° → 45deg; select a rect in the svg; drag its e handle → width
attribute grew. Run it. Receipt. Check.

## Done when

- Every handle resizes the right edges; shift keeps ratio.
- Rotate writes a clean rotate() and the panel (job 7) reads it back.
- SVG shapes resize by attribute, not by CSS width.
- phase35_08.py passes. node --check clean.
