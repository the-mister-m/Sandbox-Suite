# SPEC — Phase 0 — Opus 2 — headed rerun after Sonnet 3

Written 2026-09-12. Reruns block D and the steps Sonnet 3 changed.
Reports, fixes nothing.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Report only. No edits to suite code. Findings go in the receipt.
- "spine" is banned. No README. Never touch MEMORY.md or CLAUDE.md.
- The suite is running on port 5000 with Sonnet 3's code. If it is
  not reachable, stop and say so in the receipt. Do not start it.
- Fence: record GET /api/grid/<sid> before you begin. Every id in that
  list is off limits. Close, rename, delete only surfaces you made.
- Sweep: at the end, DELETE every surface you made. Put the before and
  after lists in the receipt. The folder ends as it began.
- Token rule: at about 150k used, if block D is not done, stop. Write
  Docs/Handoffs/HANDOFF-phase0-opus2.md: steps passed, failed, next.
  Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-opus2-rerun.md in the
  SESSION REVIEW shape plus one PASS, FAIL, or OBSERVED line per step
  with a screenshot path. One line each to SESSIONLOG.md and INDEX.md.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-sonnet3.md
- Docs/Specs/Code Canvas port/SPEC-phase0-sonnet3-fixes.md
- Docs/Reports/RECEIPT-phase0-opus-redpen.md — block D and D7b only
- Docs/tests/phase0_redpen.py — the first harness. Reuse its helpers.

## Harness

Docs/tests/phase0_rerun.py, headed Playwright. Screenshots and console
to Docs/Reports/phase0-rerun/. Session: first row of
GET /api/sessions/open. Console must be clean at every step. The
favicon 404 is now a FAIL if it appears.

## E. Sonnet 3 changes

1. Session window, Surface templates: PASS if the first row reads
   Empty surface with Add surface and no Delete, and no New blank
   surface button exists anywhere in the panel.
2. Add surface from Empty surface twice. PASS if the names are
   Empty surface and Empty surface 2, and both grids are empty.
3. Save a template, add from it twice. PASS if names are the template
   name and the template name plus " 2".
4. Two sessions open (POST /api/sessions/new if only one). In a bound
   tab with widgets, Switch to the other session in the session window.
   PASS if the grid empties, the URL is /matrix/<other sid> with no ?s=,
   the session window is open for the other session, and no file was
   written under the other session's grid folder.
5. State line at the corner reads "surface", not "window". PASS or FAIL.
6. GET /favicon.ico returns 204. PASS or FAIL.

## D. Bus and mirror, rerun

1. Two tabs, same URL with the same ?s=. Add a widget in tab one.
   PASS if it appears in tab two with no reload.
2. Move and resize in tab two. PASS if tab one follows.
3. Close a widget in tab one. PASS if it leaves tab two.
4. Open a file in tab one's editor through the browser widget's
   right-click. Report OBSERVED whether tab two's editor shows it, and
   whether the editor's open file rides on setOption or on getOptions
   only. That answers whether widget insides mirror yet.
5. MX.bus.on("t", fn) in both tabs, emit with remote in one. PASS if
   fn fired in both. Emit without remote. PASS if fired in one only.
   Also PASS if MX.TAB_ID differs between the tabs and MX.WINDOW_ID
   matches.
6. Two tabs, one session, two surfaces. Add a widget on surface one.
   PASS if surface two did not change.
7. Burst in tab two: add three widgets, move one. Reload tab one.
   PASS if tab one shows tab two's layout after reload, and the file
   on disk matches tab two's snapshot. This is the D7b check: the
   reloading tab's beacon must not overwrite the newer file.
8. No save loop: across step 7, no two-second window with more than
   three PUTs or POSTs to the grid route, the burst's own writes excluded.

## Done when

- Every step has a line and a screenshot path.
- Failures name the file and line the harness saw break, nothing more.
- Your surfaces are swept and the before and after lists match.
- Receipt written. SESSIONLOG and INDEX lines added.
