SESSION REVIEW — Sandbox Suite phase1-1R — 2026-09-12

EDITS
- [Docs/HOWTO-repipe.md](../HOWTO-repipe.md):24-25 — FIXED: target-read line list named pipes.js:43,91,138,153, which read `note`/`path`, not `target`; narrowed to the three lines that actually read `target` (18, 113, 200)

CHECKS

Routes, server.py
- PASS — server.py:1477 `GET /api/library/graphs` → `{list:[{name,root,mtime,nodes,edges,comments}]}`
- PASS — server.py:1507 `GET /api/library/graphs/<name>` → file as JSON
- PASS — server.py:1520 `POST /api/library/graphs/import` `{path}` → copies onto shelf
- PASS — server.py:1882 `GET /api/targets/<sid>` → `{targets:[{value,widgets,surfaces}]}`
- PASS — server.py:1552 `POST /api/widget-bus` `{channel,payload}` → `{ok:true}`
- PASS — server.py:1466-1470 `_graph_name` rejects `..`, `.`, `/`, `\`
- PASS — server.py:1535-1536 import refuses `schema_version != 1` with 400
- PASS — server.py:1904-1906 targets route skips empty/non-string `target`
- PASS — server.py:1559 imports `ade_frames` (server.py:28), calls `_broadcast_all("send_widget_bus", channel, payload, "agent")` — "agent" lands as `inst` in `send_widget_bus(self, channel, payload, inst)` (ade/web_io.py:197)
- PASS — `python3 -m py_compile server.py engine/tools.py` clean

Tool, engine/tools.py
- PASS — engine/tools.py:1197-1200 `widget_bus_emit` row appended to TOOLS; schema (engine/tools.py:1005-1019) requires `channel`, `payload`
- PASS — engine/tools.py:1022-1027 `_bus_parse` catches `ValueError` (superclass of `json.JSONDecodeError`), returns None, never throws

Helpers, static/js/widgets/shared/
- PASS — mirror.js:14-30 drops own inst (:17), drops target mismatch (:18), `off()` returns bus unsubscribe (:15, :28), `emit` sends `{remote:true}` (:26)
- PASS — target-option.js:29-43 `graphTargets` merges shelf + held targets with an `indexOf` dedupe guard (:38-40)
- PASS — module-ready.js:14-20 a rejected loader promise deletes `_pending[key]` via `.catch` (:18); `moduleReady` still returns the original (rejecting) promise to the caller
- PASS — widget-frame.js:161-208 select drawn only when `controls[key]` is a select (:164), boolean (:184) and text (:189) branches unchanged, New button only when `control.onNew` (:200)

Pipes widget
- PASS — pipes.js:164 `subscribe` runs during mount; both `frame.send` calls (:138, :153) are inside later click handlers, never during mount
- PASS — pipes.js:170-174 `unmount` calls `killMirrors` (both `.off()`); pipes.js:176-180 `onOption` re-makes both mirrors on `target` change
- PASS — pipes.js:198-204 `getOptions` returns exactly `target`, `path`, `note`
- PASS — pipes.js:37 `markDirty` called inside `pushLog`
- PASS — library/registry/widgets.json:21 type `pipes` matches pipes.js:59 `MX.registerWidget("pipes", ...)`; matrix.html:66 script tag sits after the three helper tags at matrix.html:46-48
- PASS — `node --check` clean on widget-frame.js, target-option.js, mirror.js, module-ready.js, pipes.js; `json.load` clean on widgets.json

HOWTO-repipe.md
- FIXED — Docs/HOWTO-repipe.md:24-25 (see EDITS above)
- PASS — every other file:line citation checked against the named file and matches: widgets.json:21, matrix.html:47-48/66, pipes.js:59/60/62-64/66/91/113/136-140/148-154/164/170/172/176/184-191/193-195/198-204/200, widget-frame.js:19-25/91-96/164-183/200-207, target-option.js:25-27/29-43/45-68, mirror.js:14-30/24-26/51-57, module-ready.js:14-20, monaco-readonly.js:35-55/70, grid.js:146-158, editor.js:545-548, engine/tools.py:997-1051/1197-1200, server.py:1462-1560/1466-1470/1552-1560/1423-1460, ade/web_io.py send_widget_bus, SPEC-session-agent-phases1-3.md:101-102, Docs/HOWTO-frames.md rows 49/50/92/94/101/103

QUESTIONS FOR THE SESSION AGENT
- Does the HOWTO-repipe.md fix above (narrowing the target-read line list) read right, or did you want the wider list kept as shorthand for "options read nearby"? (yes = keep my fix / no = revert)
- 1D's receipt asked the closer to confirm mirror.js's added `meta` argument collides with nothing — checked: pipes.js is still the only `MX.mirror` caller in the tree, so nothing collides today. Fine to close that item as no-conflict? (yes/no)

GOALS DONE
- All checks in SPEC-phase1-1R-sonnet-redpen.md run; one fix made under MAY FIX ("wrong line number in the HOWTO")

BRANDON'S TODOS
- Same as 1A/1D: restart the server, run the curl lines in RECEIPT-phase1-1A.md and RECEIPT-phase1-1D.md — this job did not touch that, per rule (no server start/stop)

CLOSER REVIEW
- Confirm the HOWTO fix — Brandon or closer
- Roll the two QUESTIONS above into the warm start if still open at close — closer
