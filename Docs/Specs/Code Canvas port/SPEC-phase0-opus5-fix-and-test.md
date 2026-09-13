# SPEC — Phase 0 — Opus 5 — three fixes, then the headed proof

Written 2026-09-12. Last round. You fix and you test. Budget 250k.

## Rules

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" is banned. No README.
- Never touch MEMORY.md or CLAUDE.md.
- You may restart the server, once, after your edits: kill the
  server.py pid, `nohup python3 server.py > Docs/Reports/server-restart.log 2>&1 &`,
  wait five seconds, curl /favicon.ico expects 204.
- Fence and sweep as Docs/tests/phase0_rerun.py does. Both lists in
  the receipt. Use session e76d0d6f4e3e for chat and terminal steps.
  Start no region.
- At 200k used, stop wherever you are, write the receipt with what
  passed and what did not, and close.
- Receipt: Docs/Reports/RECEIPT-phase0-opus5-final.md, SESSION REVIEW
  shape, one PASS or FAIL line per step with screenshot path, a PICKS
  I MADE section. One line each to SESSIONLOG.md and INDEX.md.

## Read

- Docs/Reports/RECEIPT-phase0-opus4-onceover.md — H2, H4, J only
- static/js/matrix/socket.js — whole
- static/js/matrix/grid.js — save() and markDirty() only
- static/js/widgets/usertools/editor/editor.js — applyTabsOption and
  the file-arrival handler only, grep "restoring" and "markDirty"
- Docs/tests/phase0_onceover.py — reuse its helpers

## Fix 1. Socket holds frames until open

socket.js send(): if the socket is not yet OPEN but a bind is in
flight, push the object onto a queue and return true. On ws.onopen,
flush the queue in order, then clear it. A close or a new bind
discards the queue. Nothing else changes.

## Fix 2. Editor does not echo a mirror

editor.js: a file arrival that lands while `restoring` is set does
not call markDirty. Only arrivals the user caused announce. Keep the
flag set until the last requested file has landed, as it is now.

## Fix 3. No retry while unloading

grid.js: a `pagehide` listener already exists. Set
`MX.grid._unloading = true` there. save()'s retry path skips the retry
and the unsaved flag when _unloading is set.

## Test, headed, Docs/tests/phase0_final.py

Two tabs, one surface, same ?s=.

1. Open a file in tab one via the browser widget's right-click. Open
   a second. Switch active to the first. PASS if tab two holds both
   tabs and the same active after five seconds, and tab one still
   holds both.
2. Browser with a root and two nested folders open. Reload tab two.
   PASS if rows and nodes are populated and expanded holds both.
3. Reload tab two after a burst of three moves in tab one. PASS if the
   console holds no ERR_ABORTED retry pairs: at most one aborted PUT
   per save, never two for the same body.
4. Session switch in a bound tab, three times. PASS if the console
   holds zero WebSocket lines.
5. Mirror pass: add, move, resize, close a widget; viewer two files
   then close one; chat pick a region; terminal second shell. PASS
   per step if tab two follows.
6. Console across all steps: zero errors, zero pageerrors. PASS or FAIL.

## Done when

- Every step has a line and a screenshot path.
- Surfaces swept, lists match.
- Receipt written. SESSIONLOG and INDEX lines added.
