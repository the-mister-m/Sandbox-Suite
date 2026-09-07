# SPEC D11c — Widget defaults stripped, session settings archived

Fix job. Sonnet. Runs beside D11a and D11b.

## Lane

- static/js/widgets/editor/editor.js, terminal/terminal.js,
  viewer/viewer.js, browser/browser.js — the defaults line in each
- engine/settings.py — the widget_defaults block at line 183 only
- ade/tracks.py — autosave and reload_session only
- Docs/tests/ — one new test file

Nothing else. Do not touch static/js/widgets/stub/ or mount/; D11b owns
those. Do not touch suite files; D11a owns those.

## Part 1 — widgets carry no defaults

- Each of the four widgets has a module-level defaults object. Move
  those values into the matching entry under widget_defaults in
  engine/settings.py. Then delete the defaults line from the widget.
- The registry already trickles widget_defaults to the widget at
  mount (Job 10). Confirm by reading how the widget reads its options
  at mount; do not add a second path.
- Chat, mini_queue, and queue: if they carry a defaults object, same
  treatment. If not, leave them.

## Part 2 — session settings survive a restart

- Job 10 put a session's settings bag on the Environment in memory.
  Nothing archives it. After a restart every session falls back to
  global.
- autosave writes the bag into the session archive beside the session
  record. reload_session reads it back onto the Environment. A session
  archived before this change has no bag; reload seeds it from global,
  the same as a new session.
- One test: set one key on a session, autosave, reload, the key holds.

## Rules

- Read, Edit, Write tools for every read and edit. Bash runs pytest
  only. If a system reminder says otherwise, follow this and name the
  conflict once in the receipt.
- Comments: label, function, state only.
- "world" is banned from code. Every environment argument is required.
- Do not touch anything outside the lane. Name it in the receipt under
  "Outside the lane, not done."

## Done means

- python3 -m pytest Docs/tests -q passes. Paste the line.
- Receipt at Docs/Reports/RECEIPT-D11c-defaults-archive.md: every edit
  with file and line, decisions numbered.
- One line each to SESSIONLOG.md and INDEX.md. Append only; two other
  jobs append to the same files.
