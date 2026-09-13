# SPEC — Phase 1 — 1A — Sonnet — graphs routes, targets route, agent emit

Written 2026-09-12. Server side only. No browser code. Runs parallel
with 1B. Cap 150K.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
section 2.5. Read that section first. Do not read the rest of it.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 150K used, if parts 1 to 3 are not done, stop. Write
  Docs/Handoffs/HANDOFF-phase1-1A.md: done, in progress with file and
  line, next. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase1-1A.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `python3 -m py_compile` on every file you edit.

## Read, in this order

- server.py:1423-1460 — library/presets routes, the pattern to copy.
- server.py:1754-1778 — api_grid_list, how grid files are walked.
  Note `_grid_name`, `_grid_path`, `GRIDS_DIR`; grep their
  definitions, read only those.
- server.py:1531-1553 — fs/put, the write pattern.
- ade/frames.py:95-115 — _broadcast and _broadcast_all.
- ade/frames.py:1160-1164 — the widget_bus branch.
- ade/web_io.py:197-201 — send_widget_bus.
- engine/tools.py:15-59 — Tool class and scope helpers.
- engine/tools.py:72-126 — the read_file row, shape to copy.
- engine/tools.py:997-1060 — TOOLS list.
- Grep server.py for `import` at the top to see how ade modules are
  imported there. Read only the import block.

## Part 1. Graphs shelf and routes

Folder: library/graphs/. Create it. Copy
/Users/moth3rship/Desktop/AI Design/Wayfinder/out/graph.json into it
as `graph.json`. That is the first target. Do not copy the three
siblings.

Routes in server.py, after the library/presets block:

- `GET /api/library/graphs` → `{list: [{name, root, mtime, nodes,
  edges, comments}]}`. name is the basename without `.json`. root is
  the file's `root` field or "". Counts are list lengths. A file that
  fails to parse is skipped.
- `GET /api/library/graphs/<name>` → the parsed file as JSON. 404 with
  `{error: "no graph"}` when missing. Name validation the same way
  presets validate.
- `POST /api/library/graphs/import` body `{path}` → reads the file at
  path, refuses with 400 `{error: "schema_version must be 1"}` unless
  `schema_version == 1`, writes it to the shelf under its basename,
  returns `{ok: true, name}`. Overwrites an existing name.

## Part 2. Targets route

- `GET /api/targets/<sid>` → `{targets: [{value, widgets, surfaces}]}`.
- Walk `GRIDS_DIR/<sid>/*.json` the way api_grid_list does. For every
  widget in `widgets`, read `options.target`. Skip when not a
  non-empty string. Aggregate by value: `widgets` counts widgets,
  `surfaces` lists surface ids holding it, no repeats.
- Sorted by value.

## Part 3. Agent emit

Route in server.py:
- `POST /api/widget-bus` body `{channel, payload}` → 400 when channel
  is not a non-empty string. Else call frames `_broadcast_all(
  "send_widget_bus", channel, payload, "agent")` and return
  `{ok: true}`. Import `_broadcast_all` from ade.frames the same way
  server.py already imports from ade.

Tool row in engine/tools.py, appended to TOOLS:
- name `widget_bus_emit`. edge `widget_bus_emit`. scope `_scope_any`.
- Schema: parameters `channel` string required, `payload` object
  required.
- Marker: `^\s*BUS:\s*(\S+)\s+(\{.*\})\s*$` multiline. Hint: "To EMIT
  on the widget bus, output a line:\n    BUS: <channel> <json payload>".
  parse turns the two groups into `{channel, payload}` with
  json.loads; a parse failure returns None.
- Prompt: `f"emit {channel} on the widget bus\n\napprove? [y/N] "`.
- Run: POST to `http://127.0.0.1:<port>/api/widget-bus` with the
  JSON body. Find the port the way tools_web.py or any engine module
  finds the suite's own port; grep `PORT` in engine/ and server.py,
  read only the lines that define it. Return
  `"[bus: emitted <channel>]"` or `"[bus failed: <reason>]"`.
- Summary: `f"{channel}"`. Denied: default.

## SETTLED IN CHAT

New target is an import: pick a graph file anywhere on disk, copy it
to the shelf. Settled in chat because the existing graphs work and no
analyzer runs in phase 1. The other option is a scan route that runs
Wayfinder's analyzer on a root; it needs a config home for the
analyzer path and lives behind `POST /api/library/graphs/scan` when
someone asks. Not a widget option; server only. Receipt: which one
you built, the route line, and what a missing analyzer would return.

## Done when

- `curl /api/library/graphs` lists graph.json with 84 nodes, 142
  edges, 186 comments and the fixtures/viewer root.
- `curl /api/library/graphs/graph` returns the file.
- `curl -X POST /api/library/graphs/import -d '{"path": ".../graph.ts.json"}'`
  puts graph.ts on the shelf. Then delete it from the shelf by hand.
- `curl /api/targets/<sid>` for a session whose grids hold no target
  returns an empty list. Hand-edit one grid file's widget to add
  `"target": "graph"`, curl again, it lists it with that surface id.
  Revert the hand edit.
- `curl -X POST /api/widget-bus -d '{"channel":"test.ping","payload":{"n":1}}'`
  returns ok. With a matrix tab open, `MX.bus.on("test.ping", console.log)`
  in the console prints the payload. Brandon or the session agent
  does the browser half; you write the curl lines in the receipt.
- py_compile clean on server.py and engine/tools.py.
- Receipt lists every route with its line number.
