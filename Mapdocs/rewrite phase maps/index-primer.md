# INDEX PRIMER — rewrite phase maps

Written by: session agent (Fable). Date: 2026-09-05. Status: DRAFT, unfrozen.
Purpose: link matrix. Points a phase agent at the exact lines of the v2-sweep
mapdocs and the code folders it needs. Restates nothing.

Flags and discrepancies against this primer go in each agent's receipt
(docs/reports/), not here. Brandon reconciles next session.

## SOURCE MAPDOCS (mapdocs/v2-sweep/, dated 2026-08-19/20)

lane1-engine.md (124 lines) — engine/
- COMPONENTS 9-37 · CONNECTIONS 39-57 · EVENT STREAM 59-76
- EMITTED TEXT 78-87 · DEAD 89-94 · UNKNOWNS 96-103

lane2-shells-server.md (476 lines) — server.py + shells/
- COMPONENTS 19-134: server.py 21-60 · turn_gate 62-67 · ide 69-73 ·
  daemon 75-80 · conference 82-91 · terminal 93-98 · ade 100-134
- CONNECTIONS 138-250: HTTP routes 140-161 · websockets 163-186 ·
  crossings 188-250
- EVENT STREAM 254-336 · EMITTED TEXT 340-373 · DEAD 377-410 · UNKNOWNS 414-442

lane3-ade-frontend.md (335 lines) — static/ade.html, static/js/ade/, ade.css
- COMPONENTS 12-124 · CONNECTIONS 126-181 · EVENT STREAM 183-253
- EMITTED TEXT 255-279 · DEAD 281-297 · UNKNOWNS 299-315

lane4-panes-static.md (133 lines) — static/js/panes/, shell.js, control,
gatematrix, globalflags, killswitch, index.html, control.html, css, vendor
- COMPONENTS 7-42: panes 9-19 · shared js 21-26 · html 28-32 · css 34-37 ·
  vendor 39-42
- CONNECTIONS 44-68 · EVENT STREAM 70-86 · EMITTED TEXT 88-97
- DEAD 99-104 · UNKNOWNS 106-112

lane5-injections-state.md (244 lines) — injections/, hooks/, channels/, root state
- COMPONENTS 15-47 · CONNECTIONS 51-100: compiler 53-69 · presets 71-75 ·
  hook 77 · channels 79-84 · global.json 86 · policy 88 · queue 90 ·
  waypoint 92 · log 94 · sandbox_config 96 · sessions_index 98 · machines 100
- EVENT STREAM 104-156 · EMITTED TEXT 160-187 · DEAD 191-201 · UNKNOWNS 205-217

## READING MATRIX (mapdoc lines per phase agent)

Phase 1, Engine → phase1-engine-map.md
- lane1 9-103 (all sections)
- lane5 51-75, 86-100, 160-187
- lane2 100-134, 188-233
- lane3 105-121 (track menu, region shape)

Phase 2, IDE widgets → phase2-widgets-map.md
- lane4 7-112 (all sections)
- lane2 62-98, 140-177, 273-309, 377-410
- lane1 24-30, 59-76

Phase 3, ADE → phase3-ade-map.md
- lane3 12-315 (all sections)
- lane2 100-134, 178-186, 254-336, 377-410
- lane5 77
- lane1 17-19

Phase 4, New editions → phase4-editions-map.md
- lane1 35
- lane3 66-79, 113-121
- lane4 14, 16

Library → library-map.md
- lane5 15-27, 51-75, 160-187
- lane2 82-91, 152-158
- lane1 20-23, 31-32, 35-36
- lane3 66-79, 105-111

## CODE FOLDERS PER PHASE

- Phase 1: engine/, injections/presets/, shells/ade/tracks.py, shells/ade/frames.py,
  shells/ade/rails.py, static/js/ade/tracksettings.js, static/js/ade/region.js,
  server.py (settings and policy routes), global.json, policy.json
- Phase 2: static/js/shell.js, static/js/panes/, static/js/killswitch.js,
  static/js/globalflags.js, static/js/gatematrix.js, static/index.html,
  static/control.html, static/js/control.js, shells/ide/, shells/daemon/,
  shells/turn_gate.py, server.py (ws handlers), engine/ledger.py,
  engine/daemon_queue.py, engine/waypoint.py, engine/policy.py
- Phase 3: static/ade.html, static/ade-ledger.html, static/ade-arrange.html,
  static/js/ade/, static/css/ade.css, shells/ade/, server.py (ADE portions),
  hooks/ade_pretooluse_hook.py
- Phase 4: engine/worker.py, engine/worker_transports.py,
  static/js/panes/editor.js, static/js/panes/preview.js,
  static/js/ade/arrange.js, arrangewin.js, region.js, cables.js
- Library: injections/, agent/, engine/compiler.py, engine/settings_stack.py,
  engine/providers.py, engine/ollama_provider.py, engine/codex_provider.py,
  engine/channel_registry.py, hooks/, channels/, shells/ade/tracks.py
  (save/template/archive), shells/conference/persistence.py,
  engine/agent_loop.py (sessions), server.py (saves/rooms/ade-sessions routes)

## OUTPUTS

- Maps: mapdocs/rewrite phase maps/<name>.md (names above)
- Receipts: docs/reports/RECEIPT-<name>-2026-09-05.md

## BLACKOUT

mapdocs/ outside the lines above · docs/ (all) · archive/ · archives/ ·
MEMORY.md · SESSIONLOG.md · INDEX.md · TODO.md · CLAUDE.md
