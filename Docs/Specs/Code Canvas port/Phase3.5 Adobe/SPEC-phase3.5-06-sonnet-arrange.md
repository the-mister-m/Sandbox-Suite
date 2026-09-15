# SPEC — Phase 3.5 — 06 — Sonnet — Arrange

Written 2026-09-14. Runs after W1, beside 8. An Arrange group in the
tools tab: align, distribute, eyedropper, select same.

Contracts: scope section 3.4 (job 6 line).

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
  The four API names in 3.4 job 6 are implemented here as helpers on
  the bound canvas and named in the receipt for a later lift.
- Stages below. Stage 1 writes the receipt outline. Cap 120K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-06.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.4, 5.
- tools.js whole after job 4. About 22K. The inspector renderer, the
  layers helpers.
- canvas.js `frame._canvas` block only — `patchMany`, `selected`,
  `doc`, `page`. Read only.

## Stage 1 — receipt outline. Check.

## Stage 2 — align and distribute

A group "Arrange" at the top of the inspector when 2+ selected (align
to page works with 1). Buttons: align left, center, right, top,
middle, bottom; a toggle "to page" / "to selection"; distribute
horizontal, vertical (3+ selected). Rects from `getBoundingClientRect`
of each element divided by the zoom scale; page rect from `page()`.
Writes `set-style {left, top}` per element in one `patchMany`.
Elements not absolutely positioned are skipped and the status reads
`align needs absolute`. Check.

## Stage 3 — eyedropper and select same

- Eyedropper: a button that arms; the next click on the canvas
  (listen on the bound canvas's `doc()` once) copies that element's
  inline style for fill/backgroundColor, color, border, opacity,
  fontFamily, fontSize, fontWeight, and for SVG children fill, stroke,
  stroke-width, onto every selected element. One `patchMany`.
- Select same: three buttons — fill, stroke, style (same class list).
  Walks every element in unlocked layers; emits `canvas.select`.
  Check.

## Stage 4 — test and receipt

Docs/tests/phase35_06.py, headless: fixture copy; select the three
column frames; align top — their tops match; distribute horizontal —
gaps equal within 1px; Cmd-Z; eyedrop the pull quote onto the
caption — the caption's font matches; select same fill on a rect —
every rect with that fill is selected. Run it. Receipt. Check.

## Done when

- Every button in stages 2 and 3 works on the fixture.
- One undo reverts one button press.
- phase35_06.py passes. node --check clean.
