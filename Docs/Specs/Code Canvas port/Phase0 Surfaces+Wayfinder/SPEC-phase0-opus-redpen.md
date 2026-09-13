# SPEC — Phase 0 — Opus — headed redpen

Written 2026-09-12. Runs after Sonnet 1 and Sonnet 2 land. Tests A
through D headed, reports, fixes nothing.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Report only. No edits to suite code. Findings go in the receipt.
- "spine" is banned. No README. Never touch MEMORY.md or CLAUDE.md.
- The suite is running on port 5000. If it is not reachable, stop and
  say so in the receipt. Do not start it.
- Token rule: at about 150k used, if the B block below is not done,
  stop. Write Docs/Handoffs/HANDOFF-phase0-opus.md: steps passed,
  steps failed, next step. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-opus-redpen.md in the
  SESSION REVIEW shape, plus one PASS or FAIL line per step below with
  the screenshot path. One line each to SESSIONLOG.md and INDEX.md.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-sonnet1.md
- Docs/Reports/RECEIPT-phase0-sonnet2.md
- Docs/Specs/Code Canvas port/SPEC-phase0-sonnet1-surfaces.md
- Docs/Specs/Code Canvas port/SPEC-phase0-sonnet2-bus-mirror.md
- Docs/tests/matrix_harness.py — whole, 132 lines. The harness shape.
- static/js/matrix/grid.js and static/js/matrix/bus.js as landed.

## Harness

Write Docs/tests/phase0_redpen.py, headed Playwright, shaped like
matrix_harness.py. Screenshots and console dumps to
Docs/Reports/phase0-redpen/. Session: use the first row of
GET /api/sessions/open, or POST /api/sessions/new if none.
Widget types come from the registry the same way matrix_harness.py
finds them. Console must be clean at every step; any console error is
a FAIL for that step.

## A. Grid close

1. Open /matrix/<sid>. Add a blank surface from the session window.
2. Add editor. Open one file in it through the browser widget's
   right-click, so a tab exists.
3. Add browser. Expand one folder.
4. Add a third widget of any type. Close it with its × button.
5. PASS if the editor tab and the folder expansion survive, and
   document.querySelectorAll(".monaco-editor").length is unchanged.

## B. Surfaces

1. On the surface from A, note the URL. It carries ?s=.
2. Close the tab. Open the URL in a new tab. PASS if the same widgets
   in the same slots with the same options come back.
3. Session window: PASS if the Surfaces section lists it with its name.
4. Rename it. Reload. PASS if the new name shows.
5. Add surface from a template (save one first if none). PASS if a new
   Surface N appears with the template's widgets and the URL changed.
6. New blank surface. PASS if a new named row appears and the grid is
   empty.
7. Close a surface that is not this tab's. PASS if its row is gone and
   GET /api/grid/<sid> no longer lists it.
8. Close this tab's surface. PASS if the grid empties and the session
   window reopens.
9. Suite page /: PASS if the open sessions header reads name, saved,
   last, tracks, surfaces, and the cells sit under those words.
10. Suite page: PASS if the buttons are Select, Save, End and no other.
11. Suite page Select: PASS if a new tab opens at /matrix/<sid> with
    the session window up and GET /api/grid/<sid> did not gain a file.
12. Suite page last: do one thing in the matrix (send a chat line or
    add a widget). Reload the suite page. PASS if last moved.

## C. Beacon save

1. On a bound surface, add editor. Open a file through the browser
   widget's right-click. Do not touch any options panel.
2. Reload at once. PASS if the file tab returns.
3. Move a widget. Reload at once. PASS if the slot held.

## D. Bus and mirror

1. Two tabs, same URL with the same ?s=. Add a widget in tab one.
   PASS if it appears in tab two with no reload.
2. Move and resize in tab two. PASS if tab one follows.
3. Close a widget in tab one. PASS if it leaves tab two.
4. Open a file in tab one's editor. PASS if tab two's editor shows it.
5. In tab one's console: MX.bus.on("t", fn) in both tabs, then
   MX.bus.emit("t", {}, {remote: true}) in one. PASS if fn fired in both.
   Then emit without remote. PASS if fn fired in one only.
6. Two tabs, same session, two different surfaces. Open a file in the
   editor on surface one. Record whether the editor on surface two
   shows it. This is a claim under test, not a requirement. Report the
   result as OBSERVED, with what each widget on surface two did.
7. Reload tab one after a burst of changes in tab two. PASS if the
   layout matches tab two and no save loop shows in the network log
   (more than three PUTs to the grid route inside two seconds is a loop).

## Done when

- Every step has a PASS, FAIL, or OBSERVED line and a screenshot path.
- Failures list file and line where the harness saw it break, nothing
  more. No fixes.
- Receipt written. SESSIONLOG and INDEX lines added.
