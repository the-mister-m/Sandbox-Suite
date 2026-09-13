# SPEC — Phase 0 — Sonnet 1 — grid close, surfaces, beacon save

Written 2026-09-12. Jobs A, B, C from Docs/Scope/Code Canvas port/SCOPE-phase0-foundation.md,
with B reshaped by Brandon into surfaces. No tests. Opus tests after.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. No tests. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at about 150k used, if job B below is not done, stop.
  Write Docs/Handoffs/HANDOFF-phase0-sonnet1.md: done, in progress
  with file and line, next. Leave the receipt. A fresh agent resumes.
- Receipt at close: Docs/Reports/RECEIPT-phase0-sonnet1.md in the
  SESSION REVIEW shape from the global rules. Add one line each to
  SESSIONLOG.md and INDEX.md.

## Words

- Surface: one saved layout for one session. Was "window" in code.
  File: library/grids/<sid>/<surface_id>.json. Keep the id scheme.
  Add a `name` field. Default "Surface N", N = count of that session's
  files plus one at creation.
- Session window: the matrix Session panel, session-panel.js `open()`.
- Suite page: static/suite.html and static/js/suite/suite.js.

## Read, in this order

- static/js/matrix/grid.js — whole file, 447 lines
- static/js/matrix/widget-frame.js:80-106 — unmount, getOptions, setOption
- static/js/matrix/main.js — whole file, 78 lines
- static/js/matrix/session-panel.js:1-166 — picker and open()
- static/js/suite/suite.js:475-510 — renderOpenSessions, selectSession
- static/suite.html:27 — the open sessions header row
- server.py:1704-1777 — grid routes; :1242-1244 — api_sessions_open
- ade/tracks.py:948-957 — row(); :1000-1003 — environment_rows
- ade/frames.py:561-566 — handle() head

## A. Grid close

grid.js removeWidget, both branches. After unmount: remove the one
element `[data-instance="<id>"]` from this.el, filter instances, save.
No render() call remains in removeWidget. addWidget at :149-163 is the
pattern.

## B. Surfaces

grid.js
- WINDOW_ID becomes `let`. Add `MX.grid.adoptSurface(id)`: sets the
  var, MX.WINDOW_ID, and sessionStorage "mx.window". gridUrl reads the var.
- Add `MX.grid.surfaceName` (string) loaded from the file, saved in the
  body. save() body: cols, rows, name, widgets.
- Add `MX.grid.newSurface(name)`: new id "w-" + random, adopt, set name,
  instances empty, save. Returns the id.
- Add `MX.grid.unbindSurface()`: unmountAll, sid null, instances empty.

server.py
- `_grid_body` keeps `name` (string, default "").
- GET /api/grid/<sid> — lists that session's surfaces:
  `{"list": [{id, name, mtime, widgets}]}` where widgets is the count.
  Reuse _grid_name. Missing folder returns an empty list.
- POST /api/grid/<sid>/<surface_id>/name — body {name}. Rewrites the
  file's name field only. 404 if no file.
- Existing DELETE is close-for-good. Unchanged.
- api_sessions_open: after environment_rows(), add to each row
  `surfaces` = count of .json files under GRIDS_DIR/<sid>, 0 if none.
  Add `last` = environment.last_ts (see below).

ade/tracks.py and ade/frames.py — "last"
- Environment gains `last_ts`, ISO string, None at start. row() emits it.
- frames.py handle(): first line stamps `ctx.environment.last_ts` with
  the same ISO helper tracks.py uses (`_now_iso`). Every client frame ticks it.
- tracks.py: where an agent turn ends for the environment (grep
  `turn_end` and `transcript` fanout near :258-266), tick it there too.
  One comment per tick: `# state: last touch`.

main.js
- Read `?s=` from location.search before bind. If present,
  adoptSurface(s) then bind(sid) which calls grid.bindSession.
- If absent: bind the socket only, showBlank(false), leave the grid
  unbound (grid.sid stays null so save() no-ops), and open
  MX.sessionPanel.open(bind) at once. Nothing is written until the user
  picks or adds a surface.
- Whenever a surface is adopted and bound, replaceState writes
  `/matrix/<sid>?s=<surface_id>`.
- bind(sid) for a session switch keeps today's rebind path.

session-panel.js open()
- Rename heading "Matrix templates" to "Surface templates". Each row:
  "Add surface" — newSurface(templateName), applyTemplate(tpl),
  replaceState, close panel. Delete stays.
- Add button "New blank surface" — newSurface("Surface N"), replaceState,
  close panel.
- New section "Surfaces" from GET /api/grid/<sid>. Each row: name,
  widget count, three buttons:
  - Open — adoptSurface(id), grid.bindSession(sid), replaceState, close.
  - Rename — ui().prompt, POST name route, refresh the section.
  - Close — ui().modal confirm, DELETE. If it is this tab's surface,
    unbindSurface() and reopen the panel. Otherwise refresh the section.
- "Open sessions" section stays as is.

suite.html:27 header — name, saved, last, tracks, surfaces, blank.

suite.js renderOpenSessions
- Cells: name, saved, last (row.last as toLocaleString or ""),
  tracks, surfaces.
- Buttons: Select, Save, End. Remove Start Matrix Window.
- Select: selectSession(row.id) as today, then
  window.open(`/matrix/${row.id}`, "_blank").

## C. Beacon save

grid.js
- save(opts): if opts && opts.beacon, navigator.sendBeacon(gridUrl,
  new Blob([json], {type: "application/json"})). Else today's PUT.
- window "pagehide" listener: MX.grid.save({beacon: true}).
- MX.grid.markDirty(): debounce two seconds, then save(). Widgets may
  call it on internal change. No widget edits in this job.

## Done when

- removeWidget has no render().
- GET /api/grid/<sid> lists surfaces with names. Rename and Close work
  from the session window. Add from template and New blank surface make
  a named file. URL carries ?s=.
- Suite page shows five columns aligned, three buttons, Select opens a
  blank matrix tab with the session window up.
- pagehide fires a beacon save.
- Receipt written. SESSIONLOG and INDEX lines added.
