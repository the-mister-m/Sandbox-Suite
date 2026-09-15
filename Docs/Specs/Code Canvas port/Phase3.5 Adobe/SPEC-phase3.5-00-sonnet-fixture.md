# SPEC — Phase 3.5 — 00 — Sonnet — Fixture

Written 2026-09-14. Runs first, alone. Writes the magazine page every
test in this phase uses, and its master file. No widget code.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md
section 3.1, picks P1, P2, P3, P6, P7.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- You own Docs/scratchpad/phase35-magazine.html and
  Docs/scratchpad/spread.master.html. Nothing else.
- No JavaScript in either file. No external requests. Fonts are
  system stacks. The photo is an inline SVG placeholder drawn as a
  `<img src="data:image/svg+xml,…">` so no asset folder is needed.
- Stages below. Stage 1 writes the receipt outline first. Cap 60K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-00.md. One line each to
  SESSIONLOG.md and INDEX.md.

## Read

- The scope, sections 1, 3.1, 6.
- Docs/scratchpad/phase3F-fixture.html — the previous fixture's shape.

## Stage 1 — receipt outline

Receipt with every stage unchecked and a table of every element the
fixture will contain: element, layer, data-cc attributes. Check.

## Stage 2 — phase35-magazine.html

Exactly the document shape in scope 3.1. Letter size in px (816 ×
1056), 48px margins, 3 columns, 16px gutter.

- `<style data-cc="page">` per 3.1. `<style data-cc="styles">` holding
  three rules: `.cc-style-body`, `.cc-style-headline`,
  `.cc-style-caption`, each with the kind comment line.
- `<link rel="cc-master" href="spread.master.html">`.
  `<meta name="cc-page-number" content="1">`.
- `body data-cc-guides="v:120;h:300"`.
- Layer "Text", plugin html, containing: a masthead h1 (class
  cc-style-headline), three column frames of running copy (class
  cc-style-body, about 120 words each, `data-cc-story="lead"` and
  `data-cc-thread` 1 2 3), a pull quote blockquote, a caption p (class
  cc-style-caption), an image frame div holding the placeholder img
  with `object-fit: cover`.
- Layer "Art", plugin svg, one `<svg viewBox="0 0 816 1056">` holding
  a rect, an ellipse, a line, a polygon and a path with a `d` of at
  least four commands. Fill and stroke on each.
- Every element positioned absolute with left, top, width, height
  inline. Nothing overlaps the margins except the masthead.
- No `data-od-id` anywhere. The canvas stamps them.
- Check.

## Stage 3 — spread.master.html

A full document with the same page block, one layer "Master", plugin
html, holding a footer p at the bottom margin with the magazine name
and a span `data-cc-var="page-number"`. Check.

## Stage 4 — verify and receipt

Open both in a browser through the server's /raw/ route if the server
is up, else with a file:// open, and screenshot to
Docs/Reports/phase35-00/. Both render, no console errors, every element
visible. Receipt. Check.

## Done when

- Both files parse as full documents (doctype first).
- The fixture matches 3.1 line for line: one page block, one styles
  block, one link, one meta, guides on body, two layer sections in the
  order Text then Art, one svg in Art.
- Three column frames share a story and number 1, 2, 3.
- Screenshots exist and show a page that reads as a magazine page.
