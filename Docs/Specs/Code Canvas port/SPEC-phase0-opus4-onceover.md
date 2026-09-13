# SPEC — Phase 0 — Opus 4 — last once-over

Written 2026-09-12. Runs after Sonnet 5. Reruns only what the third
redpen failed or observed, plus one full pass of the mirror to prove
nothing regressed. Reports, fixes nothing.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Report only. No edits to suite code. Findings go in the receipt.
- "spine" is banned. No README. Never touch MEMORY.md or CLAUDE.md.
- The suite is running on port 5000 with Sonnet 5's code and the
  server close fix. If it is not reachable, stop and say so. Do not
  start it.
- Fence and sweep exactly as Docs/tests/phase0_rerun.py does them.
  Both lists in the receipt.
- Session: use one that has a live region so chat and terminal steps
  can run. Opus 3 used e76d0d6f4e3e for that. Start no region.
- Token rule: at about 150k used, if block H is not done, stop. Write
  Docs/Handoffs/HANDOFF-phase0-opus4.md: steps passed, failed, next.
  Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-opus4-onceover.md in
  the SESSION REVIEW shape plus one PASS, FAIL, or OBSERVED line per
  step with a screenshot path. One line each to SESSIONLOG.md and
  INDEX.md.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-sonnet5.md
- Docs/Reports/RECEIPT-phase0-opus3-rerun.md — the four FAIL lines and
  two OBSERVED lines only
- Docs/tests/phase0_rerun2.py — reuse; write the new one as
  Docs/tests/phase0_onceover.py

## H. The six lines, rerun

Two tabs, one surface, same ?s=.

1. Open a file in tab one through the browser widget's right-click.
   PASS if tab two's editor shows the tab within three seconds.
2. With two files open in tab one, switch active. PASS if tab two's
   active matches and stays matched for five seconds.
3. New untitled buffer in tab one, type twenty characters, wait three
   seconds. PASS if tab two holds an untitled tab with the same text.
   Reload tab two. PASS if the untitled tab and its text come back.
4. Browser with a root and two nested folders open. Reload tab two.
   PASS if rows, nodes, and expanded all come back populated.
5. Rename this surface in the session window. PASS if tab one's corner
   shows the new name with no reload. PASS if tab two's corner shows it
   too.
6. Session switch in a bound tab. PASS if the console holds no
   WebSocket line at all.
7. Two widgets changed inside two seconds in tab one: open a file in
   the editor, then expand a folder in the browser. PASS if tab two
   shows both changes.

## I. Mirror regression, one pass

Same two tabs. Add a widget, move it, resize it, close it. Viewer two
files then close one. Chat pick a region. Terminal second shell.
PASS per step if tab two follows. One screenshot per step.

## J. Console

Zero errors, zero pageerrors across H and I, favicon and WebSocket
lines included. PASS or FAIL, with the dump path.

## Done when

- Every step has a line and a screenshot path.
- Failures name the file and line the harness saw break, nothing more.
- Surfaces swept, before and after lists match.
- Receipt written. SESSIONLOG and INDEX lines added.
