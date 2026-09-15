# SPEC — Phase 3.5 — 11 — Sonnet — Paragraph panel and columns

Written 2026-09-14. Runs after W2, beside 13. The inspector's Text
group grows into a Paragraph panel, and a frame can have columns.

Contracts: none new.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
- Stages below. Stage 1 writes the receipt outline. Cap 120K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-11.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, section 5.
- tools.js whole after job 9. About 30K. `STYLE_GROUPS`,
  `styleControlFor`, `renderInspector`.

## Stage 1 — receipt outline. Check.

## Stage 2 — Paragraph group

Replaces the Text group for text and container kinds: fontFamily,
fontSize, fontWeight, fontStyle (normal/italic), color, textAlign
(adds justify), lineHeight, letterSpacing, wordSpacing, textIndent,
marginTop and marginBottom labelled "space before / after",
hyphens (select none/auto; `lang` attr set to `en` via set-attr when
auto is chosen and lang is absent), textTransform. Drop cap: a
checkbox that writes `::first-letter` rules via set-css-rule on a
class `.cc-dropcap` in the styles block (float left, font-size 3em,
line-height 1, padding-right 0.1em) and toggles that class with
set-attr `class`. Check.

## Stage 3 — Columns group

For a container kind: columnCount, columnGap, columnRule (width,
style, color as three controls writing one shorthand), columnFill
(balance/auto). Check.

## Stage 4 — text wrap

Surface gains "Wrap text around" for an absolutely positioned image
or shape frame: a select none / box / circle writing `shape-outside`
(`margin-box` / `circle()`) and `float: left` on the frame, and a
`shapeMargin` number. Note in the receipt that wrap only affects
text in the same flow container; frames are absolute, so this works
inside a column frame that holds an inline image, not across frames.
Check.

## Stage 5 — test and receipt

Docs/tests/phase35_11.py, headless: fixture copy; select column frame
1; columns 2, gap 24 → computed columnCount 2; drop cap on → the
class is present and the rule exists; hyphens auto → lang en on the
element; text-indent 2em; Cmd-Z x4 reverts each. Run it. Receipt.
Check.

## Done when

- Every field reads live and writes one patch.
- Drop cap adds the rule once and never duplicates it.
- phase35_11.py passes. node --check clean.
