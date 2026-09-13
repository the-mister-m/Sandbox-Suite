SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Sonnet 1 — 2026-09-12

EDITS
- [static/js/matrix/grid.js](../../static/js/matrix/grid.js) — removeWidget drops render(), surface adopt/name/newSurface/unbindSurface, beacon save, markDirty
- [server.py](../../server.py) — GET /api/grid/<sid> surface list, POST /api/grid/<sid>/<surface_id>/name, api_sessions_open gains surfaces + last
- [ade/tracks.py](../../ade/tracks.py) — Environment.last_ts, row() emits it, ticked at turn end in take_turn
- [ade/frames.py](../../ade/frames.py) — handle() stamps ctx.environment.last_ts on every client frame
- [static/js/matrix/main.js](../../static/js/matrix/main.js) — ?s= surface param read at boot, blank-grid-plus-panel path when absent, replaceState carries ?s=
- [static/js/matrix/session-panel.js](../../static/js/matrix/session-panel.js) — Surface templates heading, Add surface / New blank surface, new Surfaces section (Open/Rename/Close)
- [static/suite.html](../../static/suite.html) — header row: name, saved, last, tracks, surfaces
- [static/js/suite/suite.js](../../static/js/suite/suite.js) — renderOpenSessions: last/surfaces cells, Select/Save/End buttons, Select opens the matrix tab

STRAY FILES
- none

GOALS DONE
- Job A — grid close: removeWidget both branches drop the one element, no render()
- Job B — surfaces: grid.js, server.py, tracks.py/frames.py last_ts, main.js ?s=, session-panel.js Surfaces section, suite page five columns
- Job C — beacon save: save(opts.beacon) via sendBeacon, pagehide listener, markDirty two-second debounce

BRANDON'S TODOS
- none raised this session

CLOSER REVIEW
- Gets copy of review, not a contract.
- Read the four picks below and confirm or correct — Brandon / closer

PICKS I MADE (brief was silent or ambiguous)
- session-panel.js's "Add surface" / "New blank surface" handlers set `MX.grid.sid = sid` before calling newSurface — the brief's newSurface spec doesn't set sid, but save() no-ops without it, and nothing else in the brief wires that assignment in.
- newSurface() calls unmountAll() + render() in addition to the brief's literal list (new id, adopt, name, instances empty, save) — needed so a tab with a surface already open doesn't leak mounted widgets when switching to a fresh one.
- server.py's api_sessions_open sets `row["last"] = row.get("last_ts")`, reading the value already placed on each row by tracks.py's row(), rather than a second ade_tracks.get_environment(sid) lookup the brief's wording ("environment.last_ts") suggested — same value, one less lookup.
- main.js exposes the URL-rewrite helper as `MX.replaceMatrixUrl` so session-panel.js's Open/Add-surface/New-blank-surface buttons can also write ?s=; the brief lists replaceState in both files without saying how it's shared.
