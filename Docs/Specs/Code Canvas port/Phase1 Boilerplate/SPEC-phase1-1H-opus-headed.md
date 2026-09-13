# SPEC — Phase 1 — 1H — Opus — headed test, phase gate

Written 2026-09-12. Headed Playwright against the running suite. Cap
120K. Every line below is PASS or FAIL with a screenshot. A FAIL that
is one obvious line is fixed and rerun; anything bigger is a FAIL
with file:line and the phase stays open.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Never touch MEMORY.md or CLAUDE.md. Do not stop the server. If it
  is not running, say so in the receipt and stop.
- Receipt: Docs/Reports/RECEIPT-phase1-1H.md. One line per test, PASS
  or FAIL, screenshot path. FIXES section with file:line for any
  one-line fix. Screenshots and console dumps to
  Docs/Reports/phase1-headed/. One line each to SESSIONLOG.md and
  INDEX.md.
- Zero pageerrors is a test line of its own.

## Read

- Docs/tests/matrix_harness.py — head and the helper names. Copy its
  launch pattern into Docs/tests/phase1_headed.py.
- Docs/Reports/RECEIPT-phase1-1R.md — whole.
- Docs/HOWTO-repipe.md — whole.
- Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
  section 6, the phase 1 paragraph.

## Tests, in order

1. Open a session in the matrix. Mount Pipes. Options panel shows
   `target` as a select with "graph" in it and a New button.
2. Pick "graph". Load target shows 84 nodes, 142 edges.
3. New surface from the session window. Mount Pipes there. Pick
   "graph" too. Reopen either panel: one "graph" entry, not two.
4. On surface two, set Pipes' target by hand to "other" through the
   text of the select's current value if the panel allows, else
   through `f.setOption("target", "other")` in the console. Reopen
   surface one's panel: "other" is listed.
5. Close surface two from the session window. Reopen surface one's
   panel: "other" is gone.
6. Second tab on surface one. Emit in tab one. Tab two's log shows
   the line with `remote`.
7. Two Pipes on surface one, same target. Emit in one, the other logs
   it without `remote`. Change the second's target, Emit again,
   nothing lands.
8. Open a file by path. First 200 chars shown. Save. `ok` shown.
   Reopen, the appended line is there. Remove the appended line by
   hand afterwards and note the file in the receipt.
9. curl the widget-bus route with channel `pipes.ping`, target
   `graph`. Every Pipes on target graph logs it. Pipes on another
   target does not.
10. Reload the tab. Pipes comes back with the same target, path, note.
11. Zero pageerrors across all of the above.

## Done when

- Every line PASS or FAIL with a screenshot.
- Test script saved at Docs/tests/phase1_headed.py.
- Receipt names any state left behind (surfaces, files).
