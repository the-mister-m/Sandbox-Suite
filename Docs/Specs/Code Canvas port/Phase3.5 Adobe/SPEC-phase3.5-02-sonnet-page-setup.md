# SPEC — Phase 3.5 — 02 — Sonnet — Page setup

Written 2026-09-14. Runs after R1 green, beside 3. The pages tab
returns for HTML: page size, margins, columns, bleed, grid. Writes
the page block through set-css-token and set-css-rule.

Contracts: scope sections 3.1 (page block), 3.2, 3.4 (job 2 line),
3.5, pick P1.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. The two canvas
  API lines (`page()`, `setPage()`) are yours too, but they live in
  canvas.js which job 3 owns right now — so you implement them inside
  tools.js as helpers on the bound canvas's `doc()` and `patchSource`,
  and name in your receipt that job 5 should lift them onto
  `frame._canvas`. Do not edit canvas.js.
- Stages below. Stage 1 writes the receipt outline. Cap 120K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-02.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 1, 3.1, 3.2, 3.4, 3.5, 5.
- tools.js whole after job 1. About 15K. The `page` section stub, the
  file inspector, `numberUnitControl`, `selectField`.
- patch.js :256-267 and the 1b receipt's KINDS table — set-css-token
  and set-css-rule shapes.

## Stage 1 — receipt outline. Check.

## Stage 2 — read the page

`readPage(a)`: `getComputedStyle(doc.documentElement)` for each
`--cc-*` in scope 3.1; numbers in px, columns unitless. When the page
block is absent, return defaults and set `missing: true`. Check.

## Stage 3 — the pages tab

Section `page`, label "pages", file mode:
- Size: select `Letter 816×1056`, `Tabloid 1056×1632`, `A4 794×1123`,
  `A3 1123×1587`, `Custom`; W and H number fields (px), live when
  Custom, read-only mirrors otherwise.
- Margins: four number fields plus a "link" checkbox that writes all
  four from the first.
- Columns: count (int) and gutter (px). Bleed (px). Grid (px).
- Each write is one `set-css-token` on the matching `--cc-*` token.
  When `missing`, the first write is one `set-css-rule {block:"page",
  selector:":root", declarations: <all defaults with the new value>}`
  followed by the body and layer rules from 3.1, in one
  `applyPatches` call if the canvas exposes a multi-patch path, else
  three patchSource calls named in the receipt.
- Number fields write on a 500ms pause or blur, selects on change,
  exactly as the inspector's controls do. Reuse them.
- Check.

## Stage 4 — test and receipt

Docs/tests/phase35_02.py, headless: open the fixture copy; pages tab;
set A4; the body's computed width is 794px; set columns 2; the token
reads 2; reload; both persist; open a plain html with no page block;
set Letter; the block now exists with all tokens. Run it. Receipt.
Check.

## Done when

- Every field in stage 3 reads the live value and writes one patch.
- A file with no page block gains one on the first write, correctly.
- Undo after any field reverts the token.
- phase35_02.py passes. node --check clean.
