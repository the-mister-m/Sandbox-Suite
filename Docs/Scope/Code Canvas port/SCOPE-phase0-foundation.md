# SCOPE — Phase 0 — foundation before the ports

Written 2026-09-11. Read briefs for a fresh session. Every line ref is from
code read this session. Nothing here is built yet.

Phase 0 is six jobs. None depend on Code Canvas, Wayfinder, or Open Design
code. All six are Sandbox Suite work plus one shell command.

- A. Grid close rebuild (the "reload" bug)
- B. Window resume (URL, picker, forget)
- C. Beacon save (durability across refresh)
- D. Bus (client now, server frame now, fifteen lines)
- E. Graph seed (run Wayfinder's analyzer on Sandbox Suite by hand)
- G. Graphs folder, list route, spawn route (about thirty lines)

F is the vendor check. Done this session. Results at the bottom.

Read budget for the whole phase: about 60KB of suite code. Nothing else.

---

## A. Grid close rebuild

WHAT IS WRONG
Closing any widget rebuilds every widget. Survivors remount from saved
options and lose live state. No window reload happens anywhere.

READ, in this order
- static/js/matrix/grid.js:149-163 — addWidget. Already fixed. The comment
  at 158-160 names the bug. This is the pattern to copy.
- static/js/matrix/grid.js:166-183 — removeWidget. Both branches call
  render(). Neither unmounts survivors first.
- static/js/matrix/grid.js:185-192 — unmountAll. What a proper teardown does.
- static/js/matrix/grid.js:239-245 — render. Empties el, rebuilds all.
- static/js/matrix/grid.js:247-306 — _build. el.dataset.instance is the
  hook for finding one widget's element.
- static/js/matrix/widget-frame.js:80-89 — unmount.
- Docs/tests/matrix_harness.py — head only, to see how a headed test is
  shaped. Size not measured this session.

CONFIRMED
render() has four callers: bindSession, rebind, applyTemplate, removeWidget.
The first three call unmountAll first and mean a full rebuild. removeWidget
is the only wrong one.

EDIT
- removeWidget, both branches: after unmount, remove the one element by
  `[data-instance="<id>"]`, filter instances, save. No render().

TEST, headed
- Mount editor with one tab open. Mount browser with one folder expanded.
  Add a third widget. Close the third. Assert the tab and the expansion
  survive. Assert no duplicate Monaco instances.

DONE WHEN
- No render() call inside removeWidget. Test passes.

---

## B. Window resume

WHAT IS WRONG
Window id lives in sessionStorage, which dies with the tab. The grid file
on the server survives but nothing can reopen it. Session picker shows a
window count and no way in.

READ, in this order
- static/js/matrix/grid.js:13-28 — windowId, WINDOW_ID const, gridUrl.
  WINDOW_ID is a const. It must become adoptable.
- static/js/matrix/grid.js:56-72 — load. :108-115 — bindSession.
- static/js/matrix/main.js:13-16 — sidFromPath. :41-50 — bind, including
  history.replaceState. The URL is where the window id goes.
- static/js/matrix/session-panel.js:9-17 — openSessions. :41-52 —
  sessionRow, the windows count. :56-78 — openPicker. :150-159 — the open
  sessions list inside the full panel.
- server.py:1704-1777 — GRIDS_DIR, _grid_name, _grid_path, GET, PUT/POST,
  DELETE for one grid. No list route exists.
- server.py:1242-1246 — /api/sessions/open, where row.windows is counted.

EDIT
- server.py: GET /api/grid/<sid> lists window ids under that session's
  folder with mtime and widget count. Reuse _grid_name and _grid_path.
- grid.js: WINDOW_ID becomes a let. MX.grid.adoptWindow(id) writes
  sessionStorage and the var. gridUrl reads the var.
- main.js: read ?w= from the URL before bind. If present, adopt it. bind's
  replaceState writes /matrix/<sid>?w=<window>.
- session-panel.js: sessionRow expands into that session's windows. Each
  row: Resume (adopt, then onBound) and Forget (DELETE the grid).

TEST
- Add widgets. Copy the URL. Close the tab. Open the URL. Identical grid.
- Picker lists windows per session. Resume adopts one. Forget removes it.

DONE WHEN
- URL round trip is identical. Picker shows and adopts windows.

WHAT CAN STILL BREAK RESUME
- Only a widget whose getOptions does not return its restorable state.
  That is per widget work, not phase 0.

---

## C. Beacon save

WHAT IS WRONG
Widget state reaches the server only on add, remove, move, resize, or
setOption. A refresh between those loses whatever getOptions would have
reported.

READ
- static/js/matrix/grid.js:74-82 — save.
- static/js/matrix/widget-frame.js:98-106 — setOption, the existing
  save trigger and its comment.
- server.py:1752-1765 — the PUT/POST route. sendBeacon sends POST. The
  route accepts it.

EDIT
- grid.save gains a beacon path: navigator.sendBeacon(gridUrl, Blob of
  the JSON body with type application/json).
- window pagehide listener calls the beacon save.
- MX.grid.markDirty(): a widget calls it on internal change. Debounced
  two seconds, then a normal save. Optional, small.

TEST
- Open a file through the browser widget's context menu, which does not
  go through setOption. Refresh. The tab returns.

DONE WHEN
- Refresh after any widget change restores it.

BLAST RADIUS
- One file per window, overwritten with that window's current state.

---

## D. Bus

WHAT IT IS
Channel plus payload. Local dispatch always. Optional remote hop through
the session socket so two matrix windows on one session share it.

READ
- ade/frames.py:95-110 — _broadcast (environment) and _broadcast_all
  (suite). The bus uses _broadcast.
- ade/frames.py:561-597 — handle() head, the ctx shape.
- ade/frames.py:814-819 — wp_mute. The smallest frame. Copy its shape.
- ade/web_io.py — send_tree_dirty, near line 177. The send pattern.
- static/js/matrix/grid.js:41-46 — onFrame fanout to frames.
- static/js/matrix/widget-frame.js:43-60 — subscribe and deliver.
- static/matrix.html — script order. bus.js loads after socket.js,
  before grid.js. Not read this session; check it.
- Docs/HOWTO-frames.md — add one row to each table.

EDIT, server, about ten lines
- frames.py handle(): one elif for "widget_bus". Read channel, payload,
  inst. If channel, _broadcast(ctx.environment, "send_widget_bus",
  channel, payload, inst).
- web_io.py: send_widget_bus(channel, payload, inst). Same lock, same
  json.dumps shape as send_tree_dirty, with type "widget_bus".

EDIT, client, about forty lines
- static/js/matrix/bus.js: MX.bus with on(channel, fn), off, and
  emit(channel, payload, opts). emit dispatches locally. With
  opts.remote it also sends {type:"widget_bus", channel, payload,
  inst: MX.WINDOW_ID} on the socket.
- One MX.socket.onFrame listener: a widget_bus frame whose inst is not
  this window dispatches locally.
- Register the script in matrix.html.

TEST
- Two matrix windows, one session. Emit in one with remote. Listener
  fires in both. Emit without remote. Fires in one.

DONE WHEN
- Both tests pass. HOWTO rows added.

---

## E. Graph seed

WHAT IT IS
graph.json for Sandbox Suite, made by Wayfinder's analyzer, dropped where
the phase 1 graph widgets will read it.

READ
- Wayfinder/out/ts/analyzer/index.js:131-152 — CLI usage:
  node out/ts/analyzer/index.js <root-folder> [out-file] [--config <path>]
- Wayfinder/configs/ — one wayfinder.json for the ignore shape.

DO
- Write configs/sandbox-suite.wayfinder.json in Wayfinder with ignores
  for static/vendor, library/grids, node_modules, .git, Docs.
- npm run build in Wayfinder if out/ts is older than TS port.
- Run the analyzer with root = Sandbox Suite and out-file =
  Sandbox Suite/library/graphs/sandbox-suite.graph.json. The graphs
  folder is new, made by G. Not library/maps: that folder's list route
  reads the doc generator's envelope (source, root, archived_at, doc)
  and a raw graph.json has none of those keys.
- Note node and edge counts in SESSIONLOG.

DONE WHEN
- The file exists and loads. Counts logged.

---

## G. Graphs folder, list route, spawn route

WHAT IT IS
A home for graph.json files with a list route the phase 1 widgets read,
and a scan route that runs the analyzer on request.

READ
- server.py:1614-1625 — api_library_maps. Copy its shape for graphs.
- server.py:1596-1612 — _maps_row, to see why graphs need their own.
- server.py:8 — subprocess is already imported. :441, :1577, :1698 —
  three existing subprocess calls, the pattern to match.
- .sandbox_config.json — where a Wayfinder path would live. Not read
  this session; check its shape.
- Wayfinder/out/ts/analyzer/index.js:131-152 — CLI usage.

EDIT, about thirty lines
- GRAPHS_DIR = library/graphs. Make on demand.
- GET /api/library/graphs: list .json files with name, path, mtime,
  and node and edge counts read from the file.
- POST /api/library/graphs/scan: body has root, name, optional config.
  Resolve the analyzer path from config. subprocess.run node with root,
  out-file under GRAPHS_DIR, and the config flag. Return the list row
  or the stderr on failure.
- Config: one key, wayfinder_dir, pointing at the Wayfinder folder.

TEST
- POST scan with root = Sandbox Suite. File appears. GET lists it with
  counts. Bad root returns an error, not a crash.

DONE WHEN
- Both routes answer. The seed from E was made through the scan route
  or by hand, either is fine.

---

## F. Vendor check, done 2026-09-11

- TS port/tsconfig.json: module esnext, target ES2022, moduleResolution
  bundler. package.json type is module. Compiled output is ES modules.
- out/ts/app/{index,reach,filters,layout,map}.js exist, built 2026-09-08.
- Grep for node: imports and require() across those five: zero hits.
- map.ts imports viewcube as a type only. Erased at build. Confirm the
  compiled map.js import line at vendor time.
- Vendoring means: copy those five files to static/vendor/wayfinder/.
  The widget does a dynamic import at mount. No suite build step.
- Analyzer stays in Wayfinder. Never vendored.

---

## Blast radius, confirmed 2026-09-12 00:25

- WINDOW_ID has two consumers: grid.js:446 exports it as MX.WINDOW_ID,
  main.js:30 prints it in the state line. adoptWindow must update both
  the module var and MX.WINDOW_ID. Nothing else reads it.
- /api/grid is called from grid.js only (:59 load, :77 save). Server has
  three routes at :1740, :1752, :1767. A new GET /api/grid/<sid> is a
  distinct pattern, no collision.
- static/matrix.html:26-64 is the script list. bus.js goes after
  socket.js at line 27 and before widget-frame.js at line 29.
- No widget_bus or MX.bus name exists anywhere in static/js, ade, or
  server.py.
- frames.py handle(ctx, msg): ctx.webio and ctx.environment are the two
  fields used. _broadcast(environment, method, *args) at :95-104 fans to
  sockets bound to that environment only. The bus frame uses exactly
  this.
- .sandbox_config.json does not exist at the repo root. CLAUDE.md's root
  file list is stale on that point. wayfinder_dir goes in global.json or
  an environment variable. global.json shape not read this session.

## Not phase 0

- Any Wayfinder widget. Any Code Canvas widget. Any Open Design port.
- Per-widget getOptions audits. Per widget, as each is touched.
- Agent hands on the graph. Needs a script or frame. Later.
