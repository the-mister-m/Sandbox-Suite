SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Sonnet 3 fixes — 2026-09-12 (timestamps: ask Brandon)

EDITS
- [static/js/matrix/grid.js](../../static/js/matrix/grid.js) — MX.TAB_ID added; newSurface(base) async with unique-name lookup; rebind() deleted
- [static/js/matrix/bus.js](../../static/js/matrix/bus.js) — stamps and drops frames on MX.TAB_ID instead of MX.WINDOW_ID
- [static/js/matrix/main.js](../../static/js/matrix/main.js) — bind(sid) branches on grid.sid (bindSession / no-op / unbind+picker); state line reads "surface"
- [static/js/matrix/session-panel.js](../../static/js/matrix/session-panel.js) — fixed "Empty surface" first row with Add surface only; "New blank surface" button removed
- [server.py](../../server.py) — /favicon.ico route returns 204

STRAY FILES
- none

GOALS DONE
- Part 1 — tab id (MX.TAB_ID) split from surface id (MX.WINDOW_ID); bus gates on TAB_ID, mirror gates on WINDOW_ID
- Part 2 — Empty surface fixed row, no Delete, no blank button; newSurface names collision-checked against GET /api/grid/<sid>
- Part 3 — bind(sid): same sid no-ops, null sid binds as before, a real switch unbinds the surface, replaceStates to /matrix/<sid> with no ?s=, opens the session picker; rebind deleted (bind was its only caller)
- Part 4 — /favicon.ico answers 204
- Part 5 — 15 test surface files removed from library/grids/85b19c53d41a/, 5 remain

library/grids/85b19c53d41a/ after sweep
- w-88ebk2bl.json
- w-8924kcue.json
- w-fzsn00w1.json
- w-ywzvtxv8.json
- w-zvc46lwr.json

PICKS I MADE
- TAB_ID declared and exported right next to WINDOW_ID in grid.js, not at the file's bottom export block — it needs to exist before any bus frame goes out
- Added `_uniqueSurfaceName(base)` as its own grid.js method rather than inlining the fetch into newSurface
- Kept the "none saved" dim-text row under the template list when no templates exist; it sits below the fixed Empty surface row now, not in place of it
- main.js bind(sid): added an explicit `if (sid === MX.grid.sid) return` no-op guard rather than folding it into the branch below
- For the no-surface-yet URL, wrote a plain inline `history.replaceState` rather than extending the shared `replaceMatrixUrl` helper, since that helper always takes a surface id and session-panel.js still needs that form
- /favicon.ico route placed in server.py right after the page routes (index/suite/matrix), before `_pkill`

BRANDON'S TODOS
- none

CLOSER REVIEW
- Gets copy of review, not a contract.
- Opus reruns the redpen against Parts 1-3 — Brandon
