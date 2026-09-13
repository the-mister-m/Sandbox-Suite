# SPEC D10 — Tabs, targets, settings trickle

Build job. Opus. Runs after Wave 4, before the Job 9 redpen.
One builder. Lanes overlap too much to split.

## Terms

- Turn: one intake, process, output.
- Run: turns back to back, uninterrupted.
- Frame: one message on the socket. A type and some fields.
- Instance: one mounted widget in one matrix window.
- Environment: the live container for a session. Never "world".

## Read first

1. Docs/Scope/SCOPE-phase2-build.md
2. This spec
3. Receipts D1, D3b, D3c, D4, D5, D6, D7, D8 in Docs/Reports/

Grep before you read anything else.

## Part 1 — one widget folder standard

- Every widget lives in static/js/widgets/<name>/. Job 8's convention.
- Move the chat, queue, editor, terminal widgets from
  static/js/matrix/widgets/ into their own folders.
- Fix every loader and path that finds them. Grep for the old path
  until nothing answers.
- Registry entries point at the new paths.

## Part 2 — frames carry a target

- Every request a widget sends carries the instance id that sent it.
  Where a region is involved, the region id too.
- Every reply echoes the instance id it answers. The page routes the
  reply to that instance only.
- Frames to cover: file, term, open, save, ask, gate_pending, and any
  other reply a widget waits on. Job 8 already did tree; match it.
- A gate row never shows a blank region. ask and gate_pending carry the
  region id.

## Part 3 — one socket, many live regions

- Today a socket anchors one region and one mirror. Widen it so many
  instances in one window each stream their own region at once.
- Change ade/frames.py as needed. This is in the lane.
- Chat: every chat instance streams live. The live pill goes away or
  means "this instance is speaking," your call, named in the receipt.
- Terminal: every terminal tab streams its own PTY output live.

## Part 4 — tabs

- Editor, terminal, and viewer widgets each hold tabs.
- Open in Editor from the browser adds a tab to an editor instance. If
  no editor instance is open, mount one, then add the tab.
- Open in Viewer works the same way.
- Terminal: one PTY per tab. Many tabs per widget. New tab spawns a new
  PTY on the region the widget is bound to. Closing a tab ends its PTY.
- Tab state (open tabs, active tab) is part of grid state, Part 8.

## Part 5 — save is server-side only

- Editor sends content and path to the server. Server checks the gate,
  writes or refuses, replies with the outcome.
- Remove the local browser write. No file picker on save.
- A refused save leaves the buffer dirty and says why.

## Part 6 — pre-close hook

- The grid asks an instance before removing it. The instance may
  refuse. Removal happens only after the instance says yes.
- Editor's exit modal (Save, Discard, Cancel) wires to it. Cancel keeps
  the instance. Discard removes it. Save runs Part 5 then removes it.
- Terminal: closing an instance with live PTYs asks once.

## Part 7 — one Monaco loader

- Job 8's loader survives. Job 7's is removed. Editor imports Job 8's.
- Chat code blocks render through the read-only Monaco path.

## Part 8 — layout persists

- Grid state (widgets, positions, sizes, options, tab state) is stored
  server-side per session per window. Route you add.
- On open, a window restores its grid from the server. The browser tab
  storage key from Job 5 goes away.
- A window with no stored grid starts blank.

## Part 9 — settings trickle

- Session tier: seeded from global when a session is created. Editable
  live. Switchable mid-session. Route you add serves and writes it.
- Voice reads the session tier. Update Default's "current session
  values" read the session tier.
- Set-to-default lives on the global page only. Nowhere else.
- New sessions inherit from global, never from another session.
- Widget defaults: a section in global.json, one entry per widget type.
  The registry reads it. Widgets stop carrying their own defaults. Same
  tiers, same trickle: global to session to widget.
- engine/settings.py is in the lane for this part.

## Part 10 — vendor the markdown libraries

- Download marked 12.0.2 and DOMPurify 3.0.11 into static/vendor/.
- Chat loads them from there. No CDN tag remains.

## Part 11 — model picker

- Anywhere a model is picked: provider, then model, then version.
  Nested, not one flat list.
- The model manager on the suite page keeps its table. Hide and unhide
  stay as they are. Do not touch the provider's hidden filter.

## Rules

- Read, Edit, Write tools for every read and edit. Bash runs pytest
  only. If a system reminder says otherwise, follow this and name the
  conflict once in the receipt.
- Comments: label, function, state only.
- "world" is banned from code. "spine" is banned everywhere.
- Widget registry field is "type".
- Every environment argument is required. No current session, no
  default environment.
- Do not touch the old ADE page under static/js/ade/.
- Do not touch engine/daemon_queue.py.
- Anything outside the parts above: do not change it. Write it in the
  receipt under "Outside the lane, not done."
- Do not invent features. Do not tidy nearby code.

## Done means

- python3 -m pytest Docs/tests -q passes. Add tests for Parts 2, 3, 5,
  6, 8, 9. Paste the final summary line in the receipt.
- Receipt at Docs/Reports/RECEIPT-D10-tabs-targets.md, same shape as
  the D8 receipt. Every edit with file and line. Every decision you had
  to make, numbered.
- One line each appended to SESSIONLOG.md and INDEX.md. Write them; the
  session agent authorized both.
