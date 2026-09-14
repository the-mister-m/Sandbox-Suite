# SPEC — Phase 3F — H — Opus — Headed walk

Written 2026-09-13. Starts after E is green through R. A Playwright
walk of the whole phase against the running server, on copies of
Brandon's file, never the original.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md
section 6 is the walk. Sections 3.1 to 3.7 are what each line proves.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- You own Docs/tests/phase3F_headed.py and Docs/Reports/phase3F-headed/.
  You edit no widget file. A failing line is a FAIL row with the
  console text and a screenshot, not a fix.
- Never open, edit or save /Users/moth3rship/Desktop/AI Design/School
  stuff/Music History/Mock CodecanvasV3/9-1 codecanvas specs/TEST/
  nirvana-canvas.html. Copy it to Docs/scratchpad/nirvana-copy.html
  first and walk the copy. Write a second small page,
  Docs/scratchpad/second.html, with five nested elements.
- Do not start or stop the server. If it is not up, say so and stop.
- Cap 250K. Stages below with checkmarks in the receipt.
- Receipt at Docs/Reports/RECEIPT-phase3F-H.md: SESSION REVIEW shape,
  STAGES, a LINES table (line, PASS or FAIL, screenshot, console), and
  FAILS with the file and function each points at. One line each to
  SESSIONLOG.md and INDEX.md.

## Read

- The scope, whole.
- Docs/tests/phase3_headed.py — whole. Your pattern: launch, surface
  create, widget add, options, screenshot, console capture, teardown.
- The five job receipts, EDITS and CONTRACT FIELDS ADDED sections.

## Stage 1 — harness

Copy the Phase 3 harness shape. Fixtures per the rules above. A
`record(n, label, ok, shot, console)` per line. Every surface the
run creates is removed at the end. Check stage 1.

## Stage 2 — lines 1 to 3

Scope section 6 lines 1 to 3: canvas opens preview with no target,
Targets binds and adds the copy, tab appears, page draws, clicks do
nothing, second file adds, two tabs, switch and back. Screenshot each.
Check stage 2.

## Stage 3 — lines 4 to 6

Canvas mode, click, inspector, layers lit; shift-click, cmd-G, group
row; cmd-[, cmd-Z twice. Assert the group id is in both the iframe's
body and in `frame._canvas.source()` through `page.evaluate`, and
absent from both after undo. Check stage 3.

## Stage 4 — lines 7 to 10

Text edit, switch, back, edit present, cmd-Z; save, read the file on
disk, assert `data-od-id` count > 0 and the group after redo; reload,
two tabs, preview, same active; console clean across the run. Check
stage 4.

## Stage 5 — receipt

LINES table, screenshots and console dumps in Docs/Reports/phase3F-
headed/, teardown confirmed. Check stage 5.

## Done when

- Ten lines, each PASS or FAIL with evidence.
- Fixtures left in Docs/scratchpad, named in the receipt.
- The original nirvana file untouched: its mtime in the receipt,
  before and after.
