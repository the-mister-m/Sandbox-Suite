# SPEC — Phase 3.5 — W — Opus — Headed walks

Written 2026-09-14. Runs three times: W1 after R2 green (layers seam),
W2 after R3 green (svg seam), W3 after 17 (everything). Headed
Playwright, screenshots, a human-readable record. Reports, never
edits code.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- You own Docs/tests/phase35_W<n>.py and Docs/Reports/phase35-W<n>/.
  Nothing else. Fixtures are copies in Docs/scratchpad, never the
  originals; copy at start, restore at teardown.
- Cap 150K. Receipt Docs/Reports/RECEIPT-phase3.5-W<n>.md. One line
  each to SESSIONLOG.md and INDEX.md.
- Loop guard: the receipt lists every walk line unchecked before the
  first run. Each line gets two attempts; FAIL is recorded with its
  shot and the run continues. The whole walk runs at most twice. The
  second run is the last, whatever it shows. Never edit the harness
  to make a line pass; record what it does.

## Read

- The scope, sections 3, 5, 6.
- Docs/tests/phase3F_headed.py — the harness shape: launch, console
  capture, record/shot per line, teardown. Copy its helpers.
- The receipts of the jobs the walk covers — PICKS I MADE only.

## The walks

W1 — layers (scope 6 lines 1, 2, 4, 5, 6, 13, 14, 15; snippets and
page setup included).

W2 — svg (lines 1, 8, 9, 13, 14, 15; object panel and rotate handle
included).

W3 — everything: scope section 6, all fifteen lines, in order.

## Stages

1. Receipt outline with the lines unchecked. Copy fixtures.
2. Write the harness. One function per line, `record` + `shot` each.
3. Run. Console and pageerrors captured whole.
4. Second run only if any line failed; both records kept.
5. Receipt: per line PASS/FAIL, shot name, note; console summary;
   verdict GREEN or the failing line numbers. Restore fixtures.

## Done when

- Every line has a record and a shot.
- The receipt reads as a walk a person could repeat by hand.
- Fixtures are byte-identical to before the run.
