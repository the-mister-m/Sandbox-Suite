# SPEC — Phase 0 — Opus 3 — headed rerun after Sonnet 4

Written 2026-09-12. Proves widget insides mirror, and the three quiet
fixes. Reports, fixes nothing.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Report only. No edits to suite code. Findings go in the receipt.
- "spine" is banned. No README. Never touch MEMORY.md or CLAUDE.md.
- The suite is running on port 5000 with Sonnet 4's code. If it is
  not reachable, stop and say so in the receipt. Do not start it.
- Fence: record GET /api/grid/<sid> first. Every id in that list is
  off limits. Touch only surfaces you make. Sweep them all at the end
  and put both lists in the receipt.
- Token rule: at about 150k used, if block F is not done, stop. Write
  Docs/Handoffs/HANDOFF-phase0-opus3.md: steps passed, failed, next.
  Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-opus3-rerun.md in the
  SESSION REVIEW shape plus one PASS, FAIL, or OBSERVED line per step
  with a screenshot path. One line each to SESSIONLOG.md and INDEX.md.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-sonnet4.md — the per-widget key list
- Docs/Specs/Code Canvas port/SPEC-phase0-sonnet4-widget-mirror.md
- Docs/tests/phase0_rerun.py — reuse its helpers, fence, and sweep

## Harness

Docs/tests/phase0_rerun2.py, headed Playwright. Screenshots and console
to Docs/Reports/phase0-rerun2/. Session: first row of
GET /api/sessions/open. Console must be clean at every step.

## F. Widget insides mirror

Two tabs, same URL, same ?s=, for every step.

1. Editor. Open a file in tab one through the browser widget's
   right-click. PASS if tab two's editor shows the same tab within
   three seconds with no reload. Switch active tab in tab one. PASS if
   tab two follows. Close it in tab one. PASS if it leaves tab two.
2. Browser. Set a root and expand two nested folders in tab one. PASS
   if tab two shows the same root and both folders open.
3. Viewer. Open two files in tab one. PASS if tab two shows both.
   Close the background one in tab one. PASS if tab two drops it.
4. Chat. Pick a region in tab one. PASS if tab two's chat shows the
   same region.
5. Terminal. Open a second shell tab in tab one. PASS if tab two shows
   a second tab. Type `echo mirror` in tab one's active shell. Report
   OBSERVED whether the output appears in tab two's matching shell.
   That answers whether the shared-PTY pick holds.
6. Refresh test. After steps 1 to 5, reload tab two. PASS if every
   widget comes back with the state from step 5, from the file.
7. Cross surface. Tab three on a different surface of the same
   session. PASS if none of steps 1 to 5 changed anything on it.

## G. Quiet fixes

1. Corner line. Add a surface from Empty surface. PASS if the corner
   reads `live · <sid> · Empty surface` without reload. Rename it in
   the session window. Report OBSERVED whether the corner follows the
   rename without a reload.
2. Save failure. In tab one's console, override window.fetch to
   reject for the grid route, then move a widget. PASS if within about
   three seconds the corner ends with `· unsaved`. Restore fetch, move
   again. PASS if `· unsaved` clears.
3. Save retry. With fetch rejecting once then passing, move a widget.
   PASS if exactly two PUTs went out and the corner never showed unsaved.
4. Socket goodbye. Bound tab with widgets, Switch to another session
   in the session window. PASS if the console holds no WebSocket error
   and no server traceback appears in the response to any later call.
5. Save loop. Across all of F, no two-second window with more than
   three PUTs or POSTs to the grid route, the step's own writes
   excluded. PASS or FAIL.

## Done when

- Every step has a line and a screenshot path.
- Failures name the file and line the harness saw break, nothing more.
- Your surfaces are swept and the before and after lists match.
- Receipt written. SESSIONLOG and INDEX lines added.
