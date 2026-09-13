# SPEC — Phase 0 — Sonnet 3 — fixes after the first redpen

Written 2026-09-12. Fixes from Docs/Reports/RECEIPT-phase0-opus-redpen.md
plus four changes Brandon set after reading it. No tests. Opus reruns after.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. No tests. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at about 150k used, if parts 1 and 2 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase0-sonnet3.md: done, in progress with
  file and line, next. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-sonnet3.md in the
  SESSION REVIEW shape, with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run node --check and python3 -m py_compile on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-opus-redpen.md — block D and the questions
- static/js/matrix/bus.js — whole
- static/js/matrix/grid.js:1-60 — ids, adoptSurface, init;
  :120-180 — _announce and the two mirror receivers; :220-245 — newSurface
- static/js/matrix/main.js — whole
- static/js/matrix/session-panel.js:1-260 — picker, open(), surfaces section
- server.py:1749-1830 — grid routes

## Part 1. Tab id, the D fix

One value was doing two jobs: which surface this tab shows, and which
tab this is. Split them.

grid.js
- New `const TAB_ID = "t-" + Math.random().toString(36).slice(2, 10)`.
  Export `MX.TAB_ID`. Never stored, never adopted, new per page load.
- WINDOW_ID stays the surface id. adoptSurface unchanged.
- `_announce`, markDirty, and the two mirror receivers keep using
  MX.WINDOW_ID for `payload.surface`. That is the surface gate.

bus.js
- Line 40: stamp `inst: MX.TAB_ID`.
- Line 47: drop when `msg.inst === MX.TAB_ID`.

widget-frame.js
- setOption's emit: payload.surface stays MX.WINDOW_ID. No change
  unless it stamps inst; if so, MX.TAB_ID.

main.js
- State line: "window" becomes "surface".

## Part 2. Empty surface, naming, no blank button

session-panel.js, Surface templates section
- First row is fixed: label "Empty surface", one button Add surface,
  no Delete. It is not a file. Adding it makes a surface with no widgets.
- Remove the "New blank surface" button.
- Template rows below it keep Add surface and Delete.

grid.js newSurface(base)
- Becomes async. Fetches GET /api/grid/<sid>, collects names. Name is
  `base` if unused, else `base + " " + n` with the smallest n from 2 up
  that is unused. "Empty surface", "Empty surface 2", "redpen-tpl 3".
- Callers in session-panel.js await it.

## Part 3. Session switch picks a surface

Today a Switch in the session window calls bind(sid), which calls
grid.rebind and carries the current layout into the new session.
Brandon: the window must let the user pick.

main.js bind(sid)
- If grid.sid is null: as today, bindSession.
- If grid.sid is set and sid differs: MX.socket.bind(sid),
  grid.unbindSurface(), replaceState to `/matrix/<sid>` with no ?s=,
  then MX.sessionPanel.open(bind) so the user picks or adds.
- If sid equals grid.sid: no-op.
- grep rebind; if bind was its only caller, delete it.

## Part 4. Favicon

server.py
- `@app.route("/favicon.ico")` returning `("", 204)`. Two lines. No image.

## Part 5. Sweep the test surfaces

Session 85b19c53d41a. Remove these fifteen files from
library/grids/85b19c53d41a/ with one rm in bash, then ls the folder
into the receipt:
w-42vstyrx w-4ergm1ot w-bpuvceic w-dwbi3zqo w-gb5mwkd5 w-hi3ckedf
w-l1zb7pob w-mr62zhrk w-q7jmgm27 w-tcb1azwq w-v8cr7vk2 w-wiwk1qxp
w-y81snqyf w-za571yuv w-zzl43bho
Touch nothing else in that folder.

## Done when

- MX.TAB_ID exists, bus stamps and drops on it, mirror gates on
  MX.WINDOW_ID.
- Empty surface is a fixed first row. New blank surface button is gone.
  Names repeat with a number.
- Switch unbinds the grid and opens the session window for the new sid.
- /favicon.ico answers 204.
- Fifteen files gone, five remain in that folder.
- Receipt written. SESSIONLOG and INDEX lines added.
