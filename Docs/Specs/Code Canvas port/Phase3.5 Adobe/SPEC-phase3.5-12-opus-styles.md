# SPEC — Phase 3.5 — 12 — Opus — Text and object styles

Written 2026-09-14. Runs after 11. Named styles live in the file.
Apply one to many; edit it once; everything updates.

Contracts: scope sections 3.1 (styles block), 3.2 (set-css-rule),
3.4 (job 12 line), pick P6.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
  The four API names in 3.4 job 12 are helpers on the bound canvas,
  named in the receipt for a later lift.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-12.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.1, 3.2, 3.4, 5.
- tools.js whole after job 11. About 33K. The inspector, the
  Paragraph group, `styleControlFor`.
- patch.js — the 1b KINDS table: set-css-rule, remove-css-rule.

## Stage 1 — receipt outline. Check.

## Stage 2 — read and write styles

`styles(a)`: parse the styles block text for `.cc-style-<name>` rules
and their kind comment. `setStyle(name, kind, declarations)` →
set-css-rule with the comment line kept above the rule (write the
comment inside the declarations' preceding text; if set-css-rule
cannot carry it, store kind as a custom property `--cc-kind: paragraph`
inside the rule instead and name that in the receipt).
`removeStyle(name)` → remove-css-rule plus one set-attr per element
carrying the class, in one `patchMany`. `applyStyle(ids, name)` →
set-attr class per id, replacing any other `cc-style-*` class of the
same kind. Check.

## Stage 3 — Styles panel

A "Styles" group at the top of the inspector, always visible in
canvas mode: three tabs — Paragraph, Character, Object. Each lists
its styles; click applies to the selection; a "+" makes a new style
from the selected element's inline style of the matching property
set (paragraph: the Paragraph group's props; character: font, size,
weight, style, color, letterSpacing; object: fill, border, opacity,
borderRadius, boxShadow, blend); double-click renames; right-click:
Edit (opens the matching inspector groups bound to the rule instead
of the element — every write is set-css-rule), Redefine from
selection, Delete, Select all using. A style's row shows a dot when
the selected element carries it, and a "+" mark when the element has
inline overrides beyond it; "Clear overrides" removes those inline
props. Check.

## Stage 4 — test and receipt

Docs/tests/phase35_12.py, headless: fixture copy; select column frame
1; + paragraph style "Body2" → the rule exists with its props; apply
to frames 2 and 3; Edit Body2, font serif → all three compute serif;
select frame 2, set inline color red → row shows "+"; Clear overrides
→ color gone; Delete Body2 → rule gone, classes gone; Cmd-Z chain
restores. Run it. Receipt. Check.

## Done when

- Every helper in 3.4 job 12 exists with that name.
- Editing a style changes every element carrying it in one undo step.
- Deleting a style leaves no dangling class.
- phase35_12.py passes. node --check clean.
