# SPEC — Phase 0 — Sonnet 4 — widget insides mirror, plus three quiet fixes

Written 2026-09-12. Closes D4 from Docs/Reports/RECEIPT-phase0-opus2-rerun.md
and its questions 1, 2, 4, 5. No tests. Opus reruns after.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. No tests. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at about 150k used, if Part 1 is not done for all seven
  widgets, stop. Write Docs/Handoffs/HANDOFF-phase0-sonnet4.md: widgets
  done, widget in progress with file and line, next. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-sonnet4.md in the
  SESSION REVIEW shape, with a PICKS I MADE section and one line per
  widget naming the keys it now round-trips. One line each to
  SESSIONLOG.md and INDEX.md.
- Run node --check on every file you edit.

## The rule every widget follows

A widget's getOptions is its whole restorable state. Whatever keys it
emits, its onOption must accept back and apply, one key at a time.
Whenever that state changes from inside the widget, not from the
options panel, the widget calls `MX.grid.markDirty(frame)`. That is
the entire contract. The frame and grid do the rest: save after two
seconds, and mirror to any other tab on the same surface.

## Read, in this order

- static/js/matrix/widget-frame.js:91-130 — getOptions, setOption,
  applyOptions
- static/js/matrix/grid.js:105-120 — markDirty
- Docs/Reports/RECEIPT-phase0-opus2-rerun.md — D4 and questions 1, 2, 4, 5
- Then each widget file below, whole, one at a time. Edit it before
  reading the next.

## Part 1. Seven widgets

For each: read getOptions. List its keys. Make onOption apply every
one of those keys (add onOption where missing). Find every place the
widget changes one of those values on its own and call
`MX.grid.markDirty(frame)` there. Leave the rest of the file alone.

- static/js/widgets/usertools/editor/editor.js — getOptions :461 emits
  tabs and active; onOption :457 reads showPreview only. Opening,
  closing, switching a tab is an internal change.
- static/js/widgets/usertools/viewer/viewer.js — getOptions :404,
  onOption :391. Check every key round-trips.
- static/js/widgets/chat/chat/chat.js — getOptions :497, onOption :488.
  Check every key round-trips.
- static/js/widgets/usertools/browser/browser.js — getOptions :383, no
  onOption. Expanded folders and the current path are the state.
- static/js/widgets/usertools/terminal/terminal.js — getOptions :364,
  no onOption. Apply what can be applied; a live pty is not restorable
  and stays out.
- static/js/widgets/queue/queue/queue.js — getOptions :165, no onOption.
- static/js/widgets/queue/mini-queue/mini-queue.js — getOptions :164,
  no onOption.

If applying a key means rebuilding part of the widget's DOM, do it in
onOption for that key. Never call frame.setOption from inside onOption.

## Part 2. Save failure is visible

grid.js save(), the fetch path
- On catch or on a non-ok response: retry once after one second. If
  that fails too, set `this.saveFailed = true` and call
  `MX.setSurfaceState()` (Part 3). A later successful save clears it
  and calls it again.

## Part 3. Corner line hears the surface

main.js
- Split setState so the text builder is its own function
  `MX.setSurfaceState()` that reads MX.socket.state(), MX.socket.sid(),
  MX.WINDOW_ID, MX.grid.surfaceName, and MX.grid.saveFailed. Line reads
  `<state> · <sid> · <surface name> · unsaved` with the last part only
  when saveFailed.
- grid.js adoptSurface, newSurface, unbindSurface, and the name load
  in load() call MX.setSurfaceState() when it exists.

## Part 4. Clean socket goodbye

socket.js bind() and close()
- Before old.close(), null out old.onmessage, old.onclose, old.onerror
  so nothing fires on the dead socket, then close with code 1000.
- Read server.py's websocket handler for /ws/ade (grep "ws/ade") and
  ade/frames.py for the close path. If the server keeps sending after
  the client's close frame, make the server's send catch the closed
  state and stop. Two or three lines. Report what you found either way.

## Done when

- Each of the seven widgets round-trips every getOptions key through
  onOption and calls markDirty on internal change.
- A failed save retries once, then shows "unsaved" in the corner.
- The corner line updates on adopt, new, unbind, and load.
- Session switch produces no console error.
- Receipt written with the per-widget key list. SESSIONLOG and INDEX
  lines added.
