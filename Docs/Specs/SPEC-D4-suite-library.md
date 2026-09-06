# SPEC D4 — Suite Page and Library

Wave 3. Front end plus its routes. Sonnet. Ceiling 150 thousand tokens.
Receipt before 250. Scope: Docs/Scope/SCOPE-phase2-build.md. Read it
first. Then Docs/Reports/RECEIPT-D3b-sockets.md for the route names.

```
WAVE 2   Job 3a ─ Job 3b  done
              │
         ┌────┴────┐
WAVE 3   [Job 4 YOU]  Job 5
         └────┬────┘
WAVE 4   Job 6 ─ Job 7 ─ Job 8
```

Job 5 runs beside you. Job 5 owns static/matrix.html and static/js/matrix/.
You do not touch those. You own static/suite.html and static/js/suite/.
Job 5 does not touch yours. server.py: you may add library routes only,
in one block, labeled.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language.
- Stay in your lane. Files below. Nothing else.
- Add nothing not in this spec or the scope. Library is where builders
  add tabs nobody asked for. The tab list below is the tab list.

## LANE

- static/suite.html, new
- static/js/suite/, new
- static/css/suite.css, new
- server.py: route "/" repoint, and one labeled block of library routes
- Docs/tests/test_suite_routes.py, new

## PART 1 — SUITE PAGE

Route "/" serves static/suite.html. The old index.html stays on disk,
unserved, until the closer decides.

The page holds:

- New: creates a session through the existing new-session frame path
  or a route you add, and opens a matrix window for it at
  /matrix/<sid>.
- Open: lists saved sessions from /api/ade-sessions. Pick one, it
  reloads and opens a matrix window.
- Open-sessions display: a window listing every live World from
  /api/sessions/open. Each row shows name, saved state, track count,
  and how many matrix windows are open on it. Each row has Start Matrix
  Window, Save, and End.
  Start opens /matrix/<sid> in a new browser window. Save calls the
  save route. End opens a modal with Save, End, Cancel. Save then End
  is two calls. Cancel closes the modal. Sessions recovered on boot
  appear here with zero windows.
- Global settings: a form over /api/global GET and POST, every one of
  the thirteen keys, editing global.json directly. An Update Default
  button opens a modal, "Are you sure?", Yes and No. Yes calls the
  route you add over save_global_defaults from Job 1 with the current
  session's values. No closes the modal. If no session is selected the
  button is disabled.
- Library entry point: a link or tab set to Part 2.

## PART 2 — LIBRARY

One page, tabs in this order, nothing more:

- Presets: list from the preset list route. A preset editor: a form
  over read and write for one preset, rename and delete beside it.
  After any write the list re-reads from the route, which re-reads from
  disk.
- Providers: rows from the provider registry. Ollama, Gemini, Claude,
  and two rows labeled cloud and docker with kind slot and nothing
  behind them. No buttons on slot rows.
- Saved sessions: from /api/ade-sessions, with Open and Delete.
- Session templates: from /api/session-templates, with Load into new
  session and Delete.
- Matrix templates: from the route Job 5 adds. If that route is not in
  Job 5's receipt when you start, draw the tab empty with the state
  comment "matrix templates route pending" and name it in your receipt.
- Model manager: rows from Router.list_models through the route that
  serves them today. Provider, model, version columns. Hide and unhide
  through global.json's models.hidden.
- Voices: the voices block of global.json, editable.
- Context files: a list of paths from injections/global, session, track,
  region, and models. Each opens in the browser for edit through the
  file read and save routes. Nothing is copied into the app.

## PART 3 — TESTS

Docs/tests/test_suite_routes.py: route "/" returns the suite page; the
library routes you added return their shapes; save_global_defaults
route writes and reads back.

## RECEIPT

Docs/Reports/RECEIPT-D4-suite-library.md. Sections: EDITS, DELETED,
TESTS, QUESTIONS, PHASE 3, STRAY FILES. Under PHASE 3 include anything
you noticed about a widget defaults page, without drawing one.
