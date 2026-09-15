# SPEC — Phase 3.5 — 09 — Opus — SVG layer

Written 2026-09-14. Runs after 7 and 8. An svg-plugin layer holds one
<svg>; shapes insert into it, select, drag, inspect and save.

Contracts: scope sections 3.1 (svg layer), 3.2 (insert ns), 3.4 (job
9 line), 3.6, pick P10.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js and
  canvas/canvas.js. Nothing else. Nobody else owns them while you run.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-09.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 1, 3.1, 3.2, 3.4, 3.6, 5.
- canvas.js: `closestTarget`, `insertAt`, the drag handlers, `stableId`
  use. About 12K of it.
- tools.js: the snippets drawer (job 15), the SVG groups job 7 added,
  the layers helpers. About 12K.
- patch.js `doInsert` after 1b.

## Stage 1 — receipt outline. Check.

## Stage 2 — canvas: svg children as first-class

- `svgOf(layerId)` on `frame._canvas`.
- `insertAt` with `ns:"svg"` targets the active layer's `<svg>` and
  converts page px to viewBox units (they are 1:1 when the viewBox
  matches the page; compute anyway).
- Drag of an SVG child writes a CSS transform translate, then on
  pointer up folds it: rect/image → x/y attrs; ellipse → cx/cy; line
  → x1..y2; path/polygon keep a translate in `transform` attribute
  (not style), so the file stays valid SVG. Via set-attr.
- Marquee and click hit SVG children through `closestTarget`
  unchanged; verify and fix any `parentElement` assumption that
  breaks on `<svg>`.
- Selection chrome on SVG children uses `getBoundingClientRect`,
  which works. Check.

## Stage 3 — tools: snippets and inspector

- Snippets drawer gains a "Shapes" set: rect, ellipse, line,
  polygon (a triangle), path (a curve). Drop → `insertAt(html, at,
  "svg")`. When the active layer is not svg, status `active layer is
  not svg` and nothing inserts.
- Inspector for a path: the `d` attribute as a textarea, written by
  set-attr on a 500ms pause. Polygon `points` the same.
- Layers panel: `+ Layer` asks html or svg (a select beside the
  button). Check.

## Stage 4 — test and receipt

Docs/tests/phase35_09.py, headless: fixture copy; Art active; drop a
rect at 200,200 → an `<rect>` in the svg with x 200 y 200, namespace
SVG; click it, selected; drag 50 right → x 250, no style transform;
fill red via inspector → style fill red; edit the fixture path's d →
attribute changed; Text active, drop a rect → refused with status;
save; reload; the rect is there. Run it. Receipt. Check.

## Done when

- Inserted shapes are real SVG elements in the SVG namespace.
- Drag on shapes ends in attributes, not CSS position.
- The saved file is valid SVG inside valid HTML.
- phase35_09.py passes. node --check clean on both files.
