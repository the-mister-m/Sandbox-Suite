# SPEC — Phase 0 — Sonnet 5 — ordering fixes after the third redpen

Written 2026-09-12. Closes the four FAIL and two OBSERVED lines in
Docs/Reports/RECEIPT-phase0-opus3-rerun.md. The socket goodbye (G4) is
already fixed in server.py by the session agent; not your job. No tests.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. No tests. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at about 150k used, if Parts 1 to 3 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase0-sonnet5.md: done, in progress with
  file and line, next. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-sonnet5.md in the
  SESSION REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run node --check on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-opus3-rerun.md — blocks F and G, and the
  seven questions
- static/js/matrix/grid.js:125-145 — markDirty
- static/js/widgets/usertools/editor/editor.js — whole
- static/js/widgets/usertools/browser/browser.js:355-440 — register,
  setRoot, the tree reply
- static/js/matrix/session-panel.js — the Rename handler only, grep
  "Rename"
- Then, for Part 4, the mount function of each of: viewer.js,
  chat.js, terminal.js, queue.js, mini-queue.js. Grep "subscribe" and
  "send(" in each; read only the mount body.

## Part 1. Editor

- Any file arrival that adds a tab calls MX.grid.markDirty(frame).
  Delete userOpens and both places that touch it (:348, :371, :469-470).
- Opens made by a restore (applyTabsOption, :262) do not take focus.
  Add a flag on the widget state, `restoring`, set before the requests
  go out. While it is set, an arriving file adds its tab without
  showTab. When the last requested file has landed, clear the flag and
  showTab the mirrored `active` once.
- Untitled buffers travel. getOptions stops filtering them out. Each
  untitled tab rides as {untitled: true, name, text}. onOption for
  `tabs` creates an untitled tab from that shape with its text, or
  updates the text of one it already holds by name. Typing in an
  untitled buffer calls markDirty(frame); the two-second debounce is
  the rate. Saved-file tabs keep riding as path only.

## Part 2. Browser

- register() assigns frame._browserApply before setRoot() sends. Move
  the assignment above the send. The tree reply must find its listener.

## Part 3. Rename reaches the room

session-panel.js Rename handler
- After the POST succeeds: if the renamed id is MX.WINDOW_ID, set
  MX.grid.surfaceName and call MX.setSurfaceState(). Then emit
  MX.bus.emit("surface.name", {surface: id, name}, {remote: true}).

grid.js
- MX.bus.on("surface.name"): if payload.surface equals MX.WINDOW_ID,
  set surfaceName and call MX.setSurfaceState(). Register in init()
  next to the two mirror listeners.

grid.js markDirty
- One timer per frame, keyed by frame.id in a map, not one
  `_dirtyTimer` for the grid. Each timer saves and announces its own
  frame. markDirty() with no frame keeps a grid-level timer that only
  saves.

## Part 4. Listen before you send

For each of viewer, chat, terminal, queue, mini-queue: in mount, if
the widget subscribes to frames after its first frame.send, reorder
so subscribe comes first. Report per widget whether an edit was needed.

## Done when

- Editor: browser-opened files announce; restore never steals focus;
  untitled tabs and their text mirror and survive reload.
- Browser: root tree lands after a reload every time.
- Rename updates the corner in the renaming tab and any other tab on
  that surface.
- Two widgets changing inside two seconds both announce.
- Every widget subscribes before it sends.
- Receipt written. SESSIONLOG and INDEX lines added.
