SESSION REVIEW — Sandbox Suite phase1-1A — 2026-09-12

EDITS
- library/graphs/graph.json — new: copied from /Users/moth3rship/Desktop/AI Design/Wayfinder/out/graph.json, 84 nodes, 142 edges, 186 comments, root fixtures/viewer
- server.py:1462-1547 — GRAPHS_DIR, _graph_name, _graph_path, GET /api/library/graphs, GET /api/library/graphs/<name>, POST /api/library/graphs/import
- server.py:1552-1560 — POST /api/widget-bus, calls ade_frames._broadcast_all("send_widget_bus", channel, payload, "agent")
- server.py:1883-1913 — GET /api/targets/<sid>, walks GRIDS_DIR/<sid>/*.json like api_grid_list
- engine/tools.py:4-8 — added `import urllib.request`
- engine/tools.py:997-1051 — _SUITE_PORT, _BUS_MARKER, _BUS_HINT, _BUS_SCHEMA, _bus_parse, _bus_prompt, _bus_run, _bus_summary
- engine/tools.py:1197-1200 — Tool row `widget_bus_emit` appended to TOOLS

STRAY FILES
- none

GOALS DONE
- Part 1 graphs shelf and routes
- Part 2 targets route
- Part 3 agent emit (route + tool)

PICKS I MADE
- New target is the import route (copy a file onto the shelf), per
  SETTLED IN CHAT. No scan route built. A missing analyzer is moot in
  phase 1 — there is no scan route to hit one; nothing returns an
  analyzer-not-found error because nothing calls an analyzer.
- No PORT constant exists anywhere in engine/ or server.py for the
  suite's own server — only server.py:2021 `app.run(port=5000,
  threaded=True)`. Hardcoded `_SUITE_PORT = 5000` in tools.py with a
  comment pointing at that line. If the suite ever binds a different
  port this breaks; there was nothing else to read.
- `/api/library/graphs/<name>` and the import route's basename both
  run through `_graph_name`, a local copy of settings.py's
  `_safe_name` (no slash, no backslash, not "." or ".."). Not
  imported from engine_settings since that name is private to that
  module; server.py already keeps its own `_grid_name` the same way.
- Import route takes the path literally (expanduser + abspath, no
  workspace-root restriction) — matches "pick a graph file anywhere
  on disk" in SETTLED IN CHAT. fs/put restricts to SUITE_ROOT; this
  route doesn't, on purpose.
- Bad name on `/api/library/graphs/<name>` returns 404 `{error: "no
  graph"}`, same as missing — spec only named the missing case.
- `targets` surfaces list is sorted for determinism; spec said "no
  repeats," not an order.
- 1B's receipt (already landed) assumed my import route returns
  `{ok: true, name}` — that's what got built, so 1B's target-option.js
  needs no change on that account.

TESTS RUN
- py_compile clean on server.py and engine/tools.py.
- Offline (no server start, per rule): replicated the list/import/
  targets route bodies as standalone Python against the real
  library/graphs/ shelf and a temp grids dir.
  - Listing library/graphs/ returns graph.json's fields exactly:
    84 nodes, 142 edges, 186 comments, root .../fixtures/viewer.
  - Ran the import logic against Wayfinder's graph.ts.json: landed as
    library/graphs/graph.ts.json, name "graph.ts". Deleted it after,
    shelf back to just graph.json.
  - Targets aggregation on two fake surface files (three widgets, two
    sharing target "graph", one "other", one empty, one missing
    options.target): returned
    `[{"value":"graph","widgets":2,"surfaces":["surfaceA","surfaceB"]},
    {"value":"other","widgets":1,"surfaces":["surfaceB"]}]` — matches
    spec's aggregation rule.
- Did not curl the live routes: the suite server was already running
  on :5000 from before this job started, and the rule says don't
  start or stop it — its running process doesn't have this code
  loaded. Curl lines for whoever restarts it:
  - `curl localhost:5000/api/library/graphs`
  - `curl localhost:5000/api/library/graphs/graph`
  - `curl -X POST localhost:5000/api/library/graphs/import -d '{"path":"/Users/moth3rship/Desktop/AI Design/Wayfinder/out/graph.ts.json"}'`
    then delete library/graphs/graph.ts.json by hand
  - `curl localhost:5000/api/targets/<a real sid>`
  - `curl -X POST localhost:5000/api/widget-bus -d '{"channel":"test.ping","payload":{"n":1}}'`
    — with a matrix tab open, `MX.bus.on("test.ping", console.log)` in
    the console should print the payload. Browser half is Brandon's or
    the session agent's, per spec.

BRANDON'S TODOS
- Restart the server, run the curl lines above, confirm the browser
  half of the widget-bus test.

CLOSER REVIEW
- No conflict found with 1B's receipt — confirm and close.
- action: restart + curl-verify the five routes above — Brandon or session agent.
