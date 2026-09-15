# SPEC — Phase 3.5 — 10 — Opus — SVG draw tools

Written 2026-09-14. Runs after 9. Draw shapes by dragging on the
canvas; gradients; clipping masks; text on a path.

Contracts: scope section 3.3 (tool option).

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing else.
  The gradient editor and mask buttons are canvas menu rows and bar
  buttons, not inspector fields, so tools.js is not touched.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-10.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.3, 3.4, 5.
- canvas.js whole after job 9. About 42K. `insertAt`, the pointer
  handlers, `menuItems`, the bar.

## Stage 1 — receipt outline. Check.

## Stage 2 — draw tools

`tool` option per 3.3. Bar: a tool strip — select, rect, ellipse,
line, text, image — keys V, M, L, \, T, I when nothing is being
edited. With a shape tool active, pointer down on the page starts a
draw: a live preview in the guides layer, pointer up inserts via
`insertAt` on the active layer (`ns:"svg"` for shapes; a text tool
inserts an absolutely positioned div with contenteditable focus; an
image tool inserts a frame div with a placeholder img and opens the
upload). Shift constrains to square / circle / 45°. Esc cancels. The
tool returns to select after one draw unless Shift was held at
pointer up. Check.

## Stage 3 — gradients

Menu row "Gradient…" on an SVG child: writes a `<defs>` (created once
per svg) with a `<linearGradient id>` of two stops from the current
fill to white, and sets `fill="url(#id)"`. A small popover in the
guides layer edits: angle, stop colours, stop positions, add/remove
stop, linear/radial. Every change is one patch (replace-outer-html on
the gradient element). Check.

## Stage 4 — clipping mask and text on path

- Menu row "Make clipping mask" with exactly two selected in the same
  svg: the topmost becomes a `<clipPath id>` in defs, the other gets
  `clip-path="url(#id)"`. "Release clipping mask" reverses. Both one
  history entry.
- Menu row "Text on path" with one `<text>` and one path/ellipse
  selected: the text moves into a `<textPath href="#pathId">`. Path
  gets an id if it lacks one. "Release" reverses. Check.

## Stage 5 — test and receipt

Docs/tests/phase35_10.py, headless: fixture copy; Art active; press M;
drag 100,100 → 300,250 → a rect at 100,100 200×150; shift-drag →
square; press L, drag → a line; select the rect → Gradient… → fill
is url(#…) and defs has two stops; draw an ellipse over the fixture
rect, select both → Make clipping mask → the rect has clip-path;
Release; Cmd-Z chain restores. Run it. Receipt. Check.

## Done when

- Every tool draws one shape per drag and returns to select.
- Gradient, mask and text-on-path each are one undo step and their
  release restores the exact prior markup.
- phase35_10.py passes. node --check clean.
