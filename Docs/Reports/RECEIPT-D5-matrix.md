# RECEIPT — D5 — Matrix Window, Widget Frame, Matrix Templates

Job 5, Wave 3. Spec: [SPEC-D5-matrix.md](../Specs/SPEC-D5-matrix.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Receipts read first: [RECEIPT-D1-settings.md](RECEIPT-D1-settings.md),
[RECEIPT-D3a-environments.md](RECEIPT-D3a-environments.md),
[RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md),
[RECEIPT-D3c-end-closes-sockets.md](RECEIPT-D3c-end-closes-sockets.md).
Transcript window: 2026-09-06 12:12 to 12:32 EDT.

## FOR WAVE 4 — READ THIS FIRST

### The frame contract, four lines

    mount(frame)        the frame is live; build into frame.host
    unmount(frame)      tear down; the frame drops options and subscriptions
    onFrame(frame, msg) one incoming socket frame, filtered to what you asked for
    getOptions(frame)   this instance's options, as a plain object

The frame a widget receives carries `host` (element), `sid` (bound
session id), `id` (instance id), `type`, `options` (per instance),
`send(obj)` (one socket frame out), and `subscribe(types)` — an array of
frame type strings, or `"*"`. A widget that never calls `subscribe`
receives nothing. Optional on a module: `onOption(frame, key, value)` and
a `defaults` object, used only where `widget_defaults(type)` is empty.

Copy [static/js/matrix/widgets/stub.js](../../static/js/matrix/widgets/stub.js)
to start a widget. Register with `MX.registerWidget("<type>", { ... })` and
add one `<script>` line to [static/matrix.html](../../static/matrix.html).
Options are per instance; closing a widget discards them.

### The matrix template routes

    GET    /api/matrix-templates            {"list": ["<name>", ...]}
    GET    /api/matrix-templates/<name>     {"template": {name, grid, widgets}}
    POST   /api/matrix-templates/<name>     body {grid, widgets} -> {"ok": true, "name"}
    DELETE /api/matrix-templates/<name>     {"ok": true, "name"}

Job 4's library matrix-templates tab draws from `GET /api/matrix-templates`.
Files land in `library/matrix-templates/<name>.json`. A widget row is
`{type, slot: {col, row, w, h}, options}`; everything else in a posted
body is dropped on write.

    GET    /api/widget-registry             {"list": [registry rows], "defaults": {type: {...}}}

## EDITS

### [server.py](../../server.py) — lines 1199 to 1301, one labeled block

Added after `/api/session-templates`, before `agent_respond_safe`. Nothing
already in the file was reordered, reformatted, or renamed.

- line 1201 `MATRIX_TEMPLATES_DIR` — `library/matrix-templates`.
- line 1204 `_matrix_template_name` — same name rule as presets: no
  separator, not `.` or `..`.
- line 1211 `_matrix_template_path`.
- line 1215 `_matrix_template_body` — keeps `grid` and a `widgets` list of
  `{type, slot, options}`, drops the rest.
- line 1235 `api_matrix_templates` — list.
- line 1245 `api_matrix_template_read` — read, 404 on missing.
- line 1262 `api_matrix_template_write` — write, 400 on a bad name or body.
- line 1280 `api_matrix_template_delete` — delete, 404 on missing.
- line 1292 `api_widget_registry` — registry rows plus
  `widget_defaults(type)` per type.

### [library/registry/widgets.json](../../library/registry/widgets.json)

- The `"rows"` field is gone from every row. It carried the same value as
  `"type"` in all seven rows, so the rename collapsed the two into `type`.
- Added `{"type": "stub", "label": "Stub"}`. Job 9 removes it.

### [static/matrix.html](../../static/matrix.html) — overwrote the D3b placeholder

Grid host, blank-window host, the two corner buttons, the socket state
line, and ten script tags.

### [static/css/matrix.css](../../static/css/matrix.css) — new, 268 lines

Grid, widget chrome, drag edges, options panel, overlay panels and modals.
Skin variables with literal fallbacks.

### static/js/matrix/ — new

- [registry.js](../../static/js/matrix/registry.js) — `MX.registerWidget`,
  `MX.widgetModule`, `MX.registryRows`, `MX.widgetLabel`,
  `MX.widgetDefaults`, `MX.loadRegistry` over `/api/widget-registry`.
- [socket.js](../../static/js/matrix/socket.js) — one socket at
  `/ws/ade/<sid>`. `bind(sid)` closes any open socket first. `session_refused`
  is caught before dispatch and drops the window back to the picker.
- [ui.js](../../static/js/matrix/ui.js) — overlay, three-button modal,
  name prompt.
- [widget-frame.js](../../static/js/matrix/widget-frame.js) — the frame,
  the per-instance options panel, `startingOptions(type)`.
- [grid.js](../../static/js/matrix/grid.js) — 12x12 slot grid, right,
  bottom and corner border drags to resize, move button lifts and drops
  into a slot (a drop onto an occupied slot swaps the two), first-free
  placement for a new widget, per-window persistence, `toTemplate` and
  `applyTemplate`.
- [templates.js](../../static/js/matrix/templates.js) — list, read, write,
  delete against the four routes.
- [session-panel.js](../../static/js/matrix/session-panel.js) — the
  Session corner panel: bound session with Save, Save Session Template,
  Save Matrix Template, End; the End modal with Save, End, Cancel; the
  matrix template list; every open session with its window count, click to
  switch. The blank window's picker is the same list plus New Session.
- [widget-picker.js](../../static/js/matrix/widget-picker.js) — the New
  Widget page, one entry per registry row. A type with no module reads
  "not built" and is disabled.
- [widgets/stub.js](../../static/js/matrix/widgets/stub.js) — the stub.
- [main.js](../../static/js/matrix/main.js) — boot, `/matrix/<sid>` parse,
  bind and rebind, the two corner button handlers.

### [library/matrix-templates/](../../library/matrix-templates/) — new folder

Holds `PLACEHOLDER.md` so the folder exists before the first write.

### [Docs/tests/test_matrix_templates.py](../tests/test_matrix_templates.py) — new, 8 tests

Write, list, read, delete through the routes, plus name refusal, body
refusal, junk-field dropping, and the widget registry route.

### [Docs/tests/test_session_widget.py](../tests/test_session_widget.py) — lines 97 to 108

`test_widget_registry_seeds_every_type` follows the registry rename: the
type list gains `stub`, `row["rows"]` is gone, and the WIDGET_ROWS check
runs over every type but `stub`, which carries no widget rows.

### [Docs/Handoffs/HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)

Appended the "From Job 5" block.

## DELETED

- The `"rows"` field in `library/registry/widgets.json`, seven rows.
  Renamed into `"type"`, which already held the same value.
- The one-line `static/matrix.html` placeholder D3b wrote. Overwritten,
  as that receipt asked.
- No files deleted.

## TESTS

Command: `python3 -m pytest Docs/tests -q`

    114 passed in 0.15s

106 before, 8 new in `test_matrix_templates.py`. One existing test file
changed, `test_session_widget.py`, for the registry rename the spec
ordered. Every `.js` file under `static/js/matrix/` passes `node --check`.
`server.app.url_map` carries all five new routes.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. The lane says "server.py: one labeled block, matrix template routes
   only." Part 1 of the spec says the widget selection page reads the
   registry "through a route you add or the settings route that exposes
   it," and no settings route exposes it. `GET /api/widget-registry` went
   into the same labeled block. It is the only route in that block that is
   not a matrix template route.
2. A blank window's New Session entry calls `POST /api/sessions/new`. That
   route does not exist. Job 4's spec lets Job 4 add a new-session route
   or use the frame path; the frame path needs a socket, and a blank
   window has none. On a non-200 the entry says the route is not in place
   and points at the Suite Page — the same shape Job 4's spec uses for my
   matrix template route. If Job 4 named the route something else, one
   line in `session-panel.js` changes.
3. Where Load and Delete for a matrix template live. The spec names Save
   Matrix Template on the Session panel and says loading replaces the
   grid, without naming the control. Both sit under a "Matrix templates"
   heading in the Session panel. No third corner button was added.
4. `widget_defaults("stub")` is `{}` — `WIDGET_ROWS` has no `stub` entry,
   and `engine/settings.py` is outside the lane. A widget module may
   therefore carry its own `defaults` object, which the frame uses only
   where the registry gives nothing. The stub carries `{note, echo}` so
   an option change is visible and demonstrably gone after a remount.
   Wherever `widget_defaults` is non-empty, it still wins outright.
5. The grid is a fixed 12 by 12. The spec says every border drags and does
   not name a cell count. Resize is right, bottom, and corner drags on
   each widget, which is where two widgets meet. Left and top edges are
   not separate handles; the widget above or to the left owns that border.
6. A drop onto an occupied slot swaps the two widgets. The spec says a
   drop lands the widget in a new slot and does not say what happens to an
   occupant. A swap is the smallest rule that never loses a widget.
7. Switching sessions carries the grid to the new session id only when
   that session has no saved layout for this window. If it has one, the
   saved layout wins. The spec says the grid stays and every widget
   rebinds; it also says a layout is stored per session id per window.
   Those two collide on the first switch and the stored layout was given
   the win.
8. Grid state is `localStorage`, keyed `mx.grid.<sid>.<windowId>` with the
   window id in `sessionStorage`. The spec says persist in the browser
   under a key including the session id; a window id had to be added or
   two windows on one session would share one layout.
9. The stub's "Ask feed" button sends `{"type": "feed", "limit": 5}` — a
   real, read-only frame — so send, subscribe, and onFrame are all
   exercised by hand in Job 9. No new frame type was invented.
10. A harness system-reminder mid-build told me to do reads and writes
    through bash rather than the Read, Edit, and Write tools. The job
    instruction says the opposite. Followed the job instruction; every
    edit above is a tool call. Jobs 1, 3a, 3b, and 3c named the same
    conflict.

## OUTSIDE THE LANE, NOT DONE

- `engine/settings.py` — `WIDGET_ROWS` has no `stub` group, so
  `widget_defaults("stub")` is empty. Not added; the module-side
  `defaults` fallback in question 4 covers it and the stub leaves at Job 9.
- `POST /api/sessions/new` — not added. Job 4 owns the new-session path.
- `ade/frames.py` — `ade_load` and `ade_new` untouched, as instructed.
  The matrix window binds through `/matrix/<sid>` and never sends either.
- `static/js/ade/` — still opens the retired `/ws/ade`. D3b's question 1.
- `library/registry/providers.json` — untouched; only the widget registry
  carried the `rows` field.
- Job 4 edited `server.py` in the same window. My block was added whole
  after `/api/session-templates` and verified present at line 1199 after
  their writes. Nothing of theirs was reordered or reformatted.

## PHASE 3

Appended in full to [HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)
under "From Job 5". Summary:

- Grid state never reaches the server; a window on a second machine starts
  empty.
- A matrix template is the only place a widget instance's options survive
  a remount.
- Five of the seven real widget types have no widget rows, so they start
  from module defaults until Phase 3 gives them rows.
- The New Session entry depends on a route Job 4 may or may not add.
- Matrix template Load and Delete live in the Session panel by choice.
- End closes this window's socket; the window shows `closed` and keeps its
  grid rather than returning to the picker.
- The `stub` registry row leaves at Job 9.

## STRAY FILES

- `library/matrix-templates/PLACEHOLDER.md` — written on purpose, so the
  new folder exists in the tree before the first template is saved.
- The matrix template tests redirect `server.MATRIX_TEMPLATES_DIR` at
  `tmp_path`, so no template file was written into `library/`.
- No new directories under `archives/` in this window.
- `Docs/tests/__pycache__` is pre-existing.
