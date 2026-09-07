# RECEIPT — D4 — Suite Page and Library

Job 4, Wave 3. Spec: [SPEC-D4-suite-library.md](../Specs/SPEC-D4-suite-library.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Read first: [RECEIPT-D1-settings.md](RECEIPT-D1-settings.md),
[RECEIPT-D3a-environments.md](RECEIPT-D3a-environments.md),
[RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md),
[RECEIPT-D3c-end-closes-sockets.md](RECEIPT-D3c-end-closes-sockets.md).

## EDITS

### [server.py](../../server.py) — line 426, route "/" repoint

- `index()` now returns `_serve_skinned("static/suite.html")`
  unconditionally. Dropped the `room` query check that served
  `static/index.html`; that file stays on disk, unserved, per spec.
  `static/control.html`, the prior default, is also unserved now —
  the spec names only `index.html` as the file left for the closer,
  but `control.html` was the old splash this route served and is the
  same kind of leftover. Named here since it wasn't named in the spec.

### [server.py](../../server.py) — line 1303, one labeled block, "library routes — Job 4, Suite Page and Library"

Inserted after Job 5's `/api/widget-registry` block, before
`agent_respond_safe`. Nothing else in server.py touched or reordered.

- `POST /api/sessions/new` (1306) — `ade_tracks.new_session()`, returns `sid`.
- `POST /api/sessions/<sid>/open` (1312) — `ade_tracks.reload_session(sid)`,
  404 on miss. Registers a saved/archived session so a matrix window's
  socket can bind to it.
- `POST /api/global/update-default` (1320) — `engine_settings.save_global_defaults(body)`.
- `GET /api/library/presets` (1327), `GET .../presets/<name>` (1332),
  `POST .../presets/<name>` (1338), `DELETE .../presets/<name>` (1349),
  `POST .../presets/<name>/rename` (1357) — thin wrappers over
  `engine_settings.list_presets/read_preset/write_preset/delete_preset/rename_preset`.
- `GET /api/library/providers` (1366) — `engine_settings.load_provider_registry()`.
- `GET /api/library/models` (1371) — `client.list_models()` plus
  `global.json`'s `models.hidden`.
- `POST /api/session-templates/<tid>/load` (1377) — `ade_tracks.instantiate_template(tid)`,
  404 on miss.
- `DELETE /api/session-templates/<tid>` (1385) — checks the master's
  `kind` is `SESSION_TEMPLATE_KIND` before removing the directory, 404
  or 400 otherwise. Mirrors the existing `/api/ade-templates/<tid>`
  DELETE, which only accepts `TEMPLATE_KIND` and would 400 a session
  template.
- `_CONTEXT_KINDS` (1401), `GET /api/library/context-files` (1405) —
  lists files under `injections/global`, `session`, `track`, `region`,
  `models`.
- `POST /api/fs/write` (1419) — saves text to an existing file path.
  No route for this existed; `GET /api/fs/read` did.

### [static/suite.html](../../static/suite.html)

Rewritten in full, replacing Job 3b's placeholder. Two views toggled by
a nav button (Suite / Library), an End-session modal, an Update-Default
modal. Loads the skin link (kept for `_serve_skinned`'s swap) plus
`static/css/suite.css` and the four scripts below.

### [static/css/suite.css](../../static/css/suite.css), new

Layout and widget styling built on the skin CSS variables already
defined in both `static/css/skins/*.css` files (`--surface-*`,
`--text-*`, `--border`, `--accent*`, spacing and radius tokens), so the
page follows whichever skin `global.json` names.

### [static/js/suite/api.js](../../static/js/suite/api.js), new

One fetch wrapper per route used by the page, including Job 5's
`/api/matrix-templates` (list only) and `/api/widget-registry` (not
called from this page — the widget picker is Job 5's/Job 6-8's).

### [static/js/suite/suite.js](../../static/js/suite/suite.js), new

Suite Page: New, Open (lists saved sessions, opens a matrix window on
pick), the open-sessions table (Start Matrix Window / Save / End, End
routes through the three-button modal), the thirteen-key global-settings
form, and the Update-Default modal.

### [static/js/suite/library.js](../../static/js/suite/library.js), new

The eight Library tabs in spec order: Presets (list + editor + rename +
delete), Providers, Saved Sessions, Session Templates, Matrix Templates,
Model Manager (hide/unhide writes `global.json` via the existing
`/api/global` route), Voices (the `voices` block of `global.json`),
Context Files (list, open, edit, save through `/api/fs/read` and the new
`/api/fs/write`).

### [static/js/suite/main.js](../../static/js/suite/main.js), new

Boots both modules, switches the two top-level views.

### [Docs/tests/test_suite_routes.py](../tests/test_suite_routes.py), new

12 tests: route "/" and "/suite" serve the page; sessions/new registers
and lists; sessions/<sid>/open 404s on an unknown sid; the preset
routes round-trip (write, list, read, rename, delete); providers list
the five registry rows; models route carries `list` and `hidden`;
context-files lists the `global` folder; fs/write then fs/read
round-trips; a session template loads into a new session then deletes,
and a second load 404s; deleting an unknown session template 404s;
`save_global_defaults` writes through `/api/global/update-default` and
reads back through `/api/global`.

## DELETED

- Nothing. The `room`-query branch in `index()` was removed, not a file.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Result: `126 passed in 0.19s`. 106 before this job's tests were added;
the other 8 beyond my 12 are Job 5's, added concurrently in the shared
worktree.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. Job 5's `/api/matrix-templates` and `/api/widget-registry` routes
   were already in server.py when I reached Part 2 of the spec (Job 5
   runs beside me). The spec says to draw the Matrix Templates tab
   empty with "matrix templates route pending" if the route isn't in
   Job 5's receipt yet — no D5 receipt existed, but the route itself
   did. Used the live route; `library.js`'s `renderMatrixTemplates`
   still falls back to the pending message if the route is missing or
   errors, so the tab degrades correctly if Job 5's block moves later.
2. "Update Default... with the current session's values" (spec Part 1):
   no Environment field or route carries a session's settings bag today
   — `ade/tracks.py`'s `Environment` has no settings tier, and no job
   before this one built a GET route for one. That storage is outside
   my lane (`ade/tracks.py` isn't in it) and unbuilt elsewhere. Smallest
   fill: "current session" means whichever open session's row is
   selected in the Open Sessions table (a click, tracked in `suite.js`
   only, gates the button's disabled state per spec); "its values" are
   read from the same 13-key Global Settings form already on the page,
   since that is the only session-shaped settings surface that exists.
   Yes posts those 13 values to `/api/global/update-default`. A real
   per-session settings bag is Phase 3 work.
3. No HTTP route served `Router.list_models()` before this job — only
   the socket's `models` frame did (`server.py` line ~1240,
   `webio.send_models(client.list_models(), client.model)`). The spec
   says "through the route that serves them today," naming one that
   didn't exist. Added `GET /api/library/models` as the smallest fill.
4. `Router.list_models()` already drops hidden ids
   (`engine/providers.py` line 1228, `if r["id"] not in hidden`), so a
   model hidden once cannot reappear in the manager to be unhidden —
   the route never sees it. Fixing that means touching
   `engine/providers.py`, which is outside this job's lane. Named here,
   not fixed.
5. No delete route existed for a session template (`SESSION_TEMPLATE_KIND`);
   the existing `/api/ade-templates/<tid>` DELETE checks for
   `TEMPLATE_KIND` only and 400s a session template. Added
   `DELETE /api/session-templates/<tid>` as its own route rather than
   widening the existing one, since the existing one is outside this
   job's block and the spec says add new blocks, not reorder or widen
   old ones.
6. A harness system-reminder mid-build told me to read and write
   through bash instead of the Read, Edit, and Write tools. The job
   instruction said the opposite. Followed the job instruction; every
   edit above is a tool call. D1, D3a, D3b, and D3c each named the same
   conflict.

## PHASE 3

- Widget defaults page: `library.js`'s tabs stop at Model Manager,
  Voices, and Context Files — there is no "new widget instance
  defaults" tab anywhere in this spec, and none was added. Worth a
  Phase 3 page once widget options persist (Job 1's handoff already
  flagged that widget options don't persist and don't ride a matrix
  template).
- The Global Settings form on the Suite Page and a per-session settings
  form (Phase 3, per the redpen checklist under Settings) will likely
  overlap once the latter exists — see QUESTIONS 2.

## STRAY FILES

- None. `Docs/tests/__pycache__` is pre-existing.
