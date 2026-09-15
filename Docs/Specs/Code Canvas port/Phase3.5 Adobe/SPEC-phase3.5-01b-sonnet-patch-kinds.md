# SPEC — Phase 3.5 — 01b — Sonnet — Patch kinds

Written 2026-09-14. Runs beside 1. patch.js grows three kinds and one
option on insert. Pure functions on Documents. No widget code.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md
section 3.2, pick P4.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/shared/patch.js. Nothing else.
  Every existing export and kind keeps its name and behaviour.
- Stages below. Stage 1 writes the receipt outline. Cap 100K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-01b.md with STAGES, PICKS I
  MADE, CONTRACT FIELDS ADDED, and a KINDS table: kind, fields,
  inverse, refusal cases. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` after every stage.

## Read

- The scope, sections 3.2, 5.
- patch.js whole. 10K. :41-45 KINDS, :256-267 setCssToken, :457-480
  doInsert, :484-505 applyToDoc.
- Docs/Specs/Code Canvas port/Phase3F File Mode/SPEC-phase3F-C-sonnet-patch-kinds.md
  — the shape of the last patch job and its test page.

## Stage 1 — receipt outline

Receipt with stages unchecked and the KINDS table filled from scope
3.2. Check.

## Stage 2 — set-attr

`doSetAttr(doc, patch)`: find the element; refuse when `name` starts
with `data-od-`; prior = getAttribute or null; null value removes,
else sets. Inverse set-attr with the prior. Check.

## Stage 3 — set-css-rule, remove-css-rule

- `styleBlock(doc, block, create)`: the `<style data-cc="<block>">`
  element in head, created and appended when `create` and absent.
- `doSetCssRule`: parse the block's text for a rule whose selector
  text, trimmed, equals `patch.selector`; replace its declarations;
  else append `selector { declarations }`. Prior declarations or null
  for the inverse. A regex on `selector\s*\{([^}]*)\}` is enough; no
  CSS parser.
- `doRemoveCssRule`: remove the rule; inverse set-css-rule with its
  declarations. Refuse when absent.
- Check.

## Stage 4 — insert with ns

When `patch.ns === "svg"`, build the template as
`<svg xmlns="http://www.w3.org/2000/svg">` + html + `</svg>` inside
the template, take the svg's first element child as the root, and
refuse unless exactly one. Everything else as today. Check.

## Stage 5 — test and receipt

Extend or copy Docs/tests/phase3F_patch.html to phase35_patch.html:
every new kind and its inverse round-trips; set-css-rule on a missing
block creates it; insert ns svg creates an element whose
`namespaceURI` is the SVG namespace; set-attr on a data-od- name is
refused. Run it. Receipt. Check.

## Done when

- `KINDS` has thirteen entries.
- Each new kind applies and its inverse restores the exact prior text.
- The ten old kinds pass phase3F_patch.html unchanged.
- node --check clean.
