# RECEIPT — D3b — Socket binding, one gate vocabulary, route stubs

Job 3b, Wave 2. Spec: [SPEC-D3b-sockets.md](../Specs/SPEC-D3b-sockets.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Job 3a receipt read first: [RECEIPT-D3a-environments.md](RECEIPT-D3a-environments.md).
Transcript window: 2026-09-06 02:14 to 02:41 EDT.

## FOR JOB 4 AND JOB 5 — READ THIS FIRST

### The socket path

    /ws/ade/<sid>

One socket, one session, for the socket's lifetime. `<sid>` is the `id`
field from a row of `GET /api/sessions/open`. There is no session-less
socket path any more; `/ws/ade` is gone and returns 404.

On connect the handler looks the sid up in the environment registry.

- Unknown sid: the socket receives one frame and closes.

      {"type": "session_refused", "reason": "no open session <sid>"}

- Known but unhydrated (a session registered from a shutdown archive at
  boot): the handler hydrates it, then binds.
- Known: it binds.

After binding, the socket receives the same opening frames as before —
`models`, `crew_list`, `gate_edges`, `rail_catalog`, `ade_init` — and
`ade_init` carries that session's regions and tracks, nobody else's.

Every frame the socket sends dispatches against its bound environment.
Every broadcast reaches only the sockets bound to the same environment.
The exceptions, which still reach every open socket, are `reload`,
`feed_dirty`, and `tree_dirty` — suite-level events with no session to
route by.

### The window count

`environment_rows()` (behind `GET /api/sessions/open`) now returns a real
`windows` number: the count of sockets bound to that environment. It
rises on connect and falls on disconnect. A session listed with
`windows: 0` is open with nothing viewing it.

### The gate vocabulary

`gate_action` is the vocabulary. Send it, and nothing else, from a new
widget:

    {"type": "gate_action", "action": "approve" | "deny" | "queue", "id": "<gate id>"}

The `answer` form still works during Wave 4. `{"type": "answer", "id":
..., "text": "y" | "n" | "queue"}` is translated on the server into the
matching `gate_action`. The translation fires only when nothing was
waiting on that gate id in the region hub or the socket's own gate queue,
so the in-turn ask path is untouched. `frames.ANSWER_ACTIONS` is the map.
Job 6 removes the translation when chat is rebuilt. Do not build against
`answer`.

### The two page routes

- `GET /suite` serves `static/suite.html` — Job 4 writes that file.
- `GET /matrix/<sid>` serves `static/matrix.html` — Job 5 writes it.
- `GET /matrix` serves the same file with no session id; the page binds
  itself.

Both files exist as one-line placeholders so the routes answer today.
Overwrite them; the routes need no further change. Route `"/"` was not
touched — Job 4 repoints it.

## EDITS

### [ade/tracks.py](../../ade/tracks.py)

- `Environment` gained a `windows` field; `Environment.row()` returns it
  instead of a hardcoded 0.
- `environment_of_region`, `environment_of_track`, `get_region`, and
  `get_track` search the registry only. They no longer start from a
  current environment.
- Every function that takes an environment now requires one. No default,
  no fallback: `_ensure_session`, `create_track`, `_stamp_name`,
  `insert_region`, `_announce_new_track`, `session_started_ms`,
  `_move_floor`, `session_meta`, `set_plan`, `session_plan`,
  `_initiate_by_node`, `list_regions`, `list_tracks`, `_live_peers`,
  `closed_rows`, `stop_all_regions`, `save_session`, `autosave`,
  `save_template`, `save_session_template`, `_halt_live_environment`,
  `_reset_to_scratch`, `unsaved_summary`, `close`. On `create_track` and
  `insert_region` it is keyword-only, so no caller can pass it by
  accident of position.
- The functions that resolve their own environment by id —
  `_initiate_cable_walk`, `close_region`, `_archive_reset_transcript`,
  `_do_reset`, `_final_flush` — return empty instead of landing on a
  fallback when the id belongs to no environment.
- `reload_session`, `instantiate_template`, and `new_session` return the
  `Environment` instead of a region list, so a socket can bind to what
  they opened. `end_session(sid)` returns the environment it removed;
  its sid argument is required.
- `_fire_roster(environment)` — the roster listener is told which
  environment changed.

### [ade/frames.py](../../ade/frames.py)

- `_conns` is now one row per open socket, each row carrying the sender
  and the environment it is bound to. `register_conn(webio,
  environment)`, `unregister_conn(webio)`, `bind_conn(webio,
  environment)`, and `conn_count(environment)` maintain it and keep
  `Environment.windows` in step.
- `_broadcast(environment, method, *args)` reaches only the sockets bound
  to that environment. `_broadcast_all(method, *args)` is the suite-level
  fanout, used by `reload`, `feed_dirty`, and `tree_dirty`.
- `broadcast_gate` takes the environment that owns the region.
  `broadcast_track_status`, `broadcast_context_warn`, and
  `broadcast_region_replaced` resolve it from the region id.
  `broadcast_roster` takes it. `broadcast_human_mail` walks every live
  environment and reads each one's own waypoint store.
- `refuse(webio, reason)` — sends the refusal frame.
- `AdeCtx` carries `environment`. `_rebind_environment(ctx, environment)`
  moves a socket when `ade_load` or `ade_new` opens a session on it.
- `handle` dispatches every frame against `ctx.environment`. Two local
  helpers, `_roster()` and `_init()`, replace the thirteen repeated
  broadcast lines.
- `_do_create_track`, `_do_insert_region`, and `_do_duplicate_region`
  take the environment and name it on every tracks call.
- `wp_feed`, `wp_send`, and `wp_read` read and write the bound
  environment's waypoint store. `ade_load` reads the loaded
  environment's. None of the four touch the no-session store.
- `_do_gate_action(action, gid)` — one place where approve, deny, and
  queue happen. `gate_action` calls it. `answer` calls it through the
  translation.
- `ANSWER_ACTIONS` — the answer form's words mapped onto gate_action's.

### [ade/web_io.py](../../ade/web_io.py)

- `send_session_refused(reason)` — the refusal frame.
- `_names_map` reads closed rows from the environments its regions
  belong to, not from a current environment.

### [server.py](../../server.py)

- `@sock.route("/ws/ade/<sid>")` — looks the session up, refuses a
  missing one with one frame, hydrates a boot stub, binds the connection
  and its `AdeCtx` to that environment for its lifetime.
- `_gate_notifier` fans gate events to the environment that owns the
  region, not to every open tab.
- `GET /suite`, `GET /matrix`, `GET /matrix/<sid>` — new.
- `_all_live_regions()` — the suite-level sweep, used by
  `_waypoint_track_resolver` and `_end_all_sessions`.
- `_waypoint_track_prober` walks every environment's closed rows.
- `_ade_room_reporter` and the compiler's peers provider resolve the
  environment from the region id.
- `/api/end-all-turns` sums `stop_all_regions` over every live
  environment.
- `/api/sessions/<sid>/save` and `/api/sessions/<sid>/end` broadcast to
  the environment they acted on.

### [engine/waypoint.py](../../engine/waypoint.py)

- `store_for(*idents)` — the public form of the store resolver, so a
  caller that has a region id can read the right file.

### [engine/read_tool.py](../../engine/read_tool.py)

- `request_messages` reads `waypoint.store_for(caller).path` instead of
  the shared default store.

### [engine/compiler.py](../../engine/compiler.py)

- The peers provider is called with the region id it is building for, so
  the provider can resolve that region's environment. One line.

### [static/suite.html](../../static/suite.html), [static/matrix.html](../../static/matrix.html)

New, one placeholder line each, so the two routes answer before Wave 3
writes the pages.

### [Docs/tests/test_sockets.py](../tests/test_sockets.py)

New, 7 tests, offline.

### Tests updated for the required argument

[test_region_edit.py](../tests/test_region_edit.py),
[test_presets.py](../tests/test_presets.py),
[test_change_modal.py](../tests/test_change_modal.py) — each `world`
fixture now yields a real `Environment` and every call names it.
[test_environments.py](../tests/test_environments.py) — the four
`set_current_environment` calls are gone; the reload test reads its
regions off the returned environment.

### [Docs/Handoffs/HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)

Appended the "From Job 3b — sockets" block.

## DELETED

- `ade/tracks.py` — `current_environment()`. There is no current session.
- `ade/tracks.py` — `set_current_environment()`.
- `ade/tracks.py` — the module global `_current`.
- `ade/tracks.py` — `_environment(environment=None)`, the helper that
  turned a missing argument into the current environment.
- `ade/tracks.py` — the block in `end_session` that made the most
  recently registered remaining environment current, and built a fresh
  empty one when none remained. Every open session is equally live.
- `ade/tracks.py` — the `set_current_environment` calls in
  `reload_session`, `instantiate_template`, and `new_session`.
- `ade/frames.py` — `_frame_environment(msg)`, which read an environment
  off a frame's `sid` and fell back to the current one. The socket's
  bound environment replaces it.
- `server.py` — the websocket route `/ws/ade`. Replaced by
  `/ws/ade/<sid>`.
- `server.py` — the route `POST /api/ade-sessions/save`. It saved "the
  live ADE session" and had no session id to name one with.
  `POST /api/sessions/<sid>/save` from Job 3a does the same job with a
  sid. Named under QUESTIONS.
- No files deleted.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Count: 105 passed, 0 failed. 98 before, 7 new in `test_sockets.py`. Four
existing test files were edited for the required environment argument;
no existing assertion changed meaning.

Also checked: `import server` succeeds and the URL map carries
`/suite`, `/matrix`, `/matrix/<sid>`, and `/ws/ade/<sid>`.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. The spec names the socket path `/ws/ade/<sid>` and says nothing about
   keeping a session-less one. `/ws/ade` is gone. Old JavaScript in
   `static/js/ade` still opens it and now gets a 404. Job 4 and Job 5
   write the pages that open the new path; the old ADE page is broken
   until somebody repoints or retires it.
2. `POST /api/ade-sessions/save` was deleted rather than left returning
   an error. It read a current session that no longer exists.
   `POST /api/sessions/<sid>/save` is the replacement and predates this
   job. Nothing in `static/` was updated to match.
3. `reload_session`, `instantiate_template`, and `new_session` now return
   an `Environment` instead of a region list. The socket had no other way
   to learn what it should bind to after `ade_load` or `ade_new`. One
   assertion in `test_environments.py` reads regions off the returned
   environment instead.
4. `create_track` and `insert_region` take `environment` as a required
   keyword-only argument. Making it a leading positional would have
   reordered ten optional parameters and every caller.
5. `engine/compiler.py` is outside the lane. One line changed:
   `_peers_provider()` is now called as `_peers_provider(region_id)`.
   Without the id the provider cannot resolve a region's environment and
   the peers block would have had to be built from a fallback.
6. `static/suite.html` and `static/matrix.html` are outside the lane.
   Both are one placeholder line, written only so the two route stubs
   answer. Job 4 and Job 5 overwrite them.
7. Suite-level callers, named as the orders ask. Each acts across every
   live environment on purpose: `_waypoint_track_resolver` and
   `_waypoint_track_prober` in `server.py` (a receiver name or id has to
   be findable wherever it lives), `_end_all_sessions`,
   `/api/end-all-turns`, `broadcast_human_mail`, and the three suite-wide
   frames `reload`, `feed_dirty`, `tree_dirty`.
8. `broadcast_human_mail` reads each environment's own waypoint store and
   broadcasts per environment, rather than taking a session id. The
   nudger that calls it is handed a receiver id only, and
   `HUMAN_SENDER` belongs to no environment.
9. The `answer` translation runs only after the in-turn ask path declines
   the gate id. `answer` today resolves a blocking region-hub prompt,
   which `gate_action` does not do; translating unconditionally would
   have stalled every in-turn ask. Marked with a state comment.
10. Ending a session leaves the sockets that held it bound to a halted,
    unregistered environment. Nothing in the spec says whether End should
    close them. Left bound; appended to the handoff.
11. A harness system-reminder mid-build told me to do reads and writes
    through bash rather than the Read, Edit, and Write tools. The job
    instruction and Brandon's file-ownership rule say the opposite.
    Followed the instruction; every edit above is visible as a tool call.
    Jobs 1 and 3a hit the same conflict. Naming it a third time as
    required.

## PHASE 3

Appended in full to [HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)
under "From Job 3b — sockets". Summary:

- The old ADE page still opens `/ws/ade`. Repoint or retire is unanswered.
- The in-turn ask path and the daemon-queue gate path are two mechanisms
  behind one vocabulary.
- `reload`, `feed_dirty`, and `tree_dirty` still fan out to every socket.
- The ledger is one store shared by every session, repointed per turn, so
  a feed frame reads records written by every session.
- The three suite-wide routes act across every environment.
- An ended session's sockets stay bound to a halted environment.
- `ade_load` and `ade_new` move the socket that sent them.

## STRAY FILES

- `static/suite.html` and `static/matrix.html` are placeholders this job
  wrote for the route stubs. Job 4 and Job 5 overwrite them. Named under
  QUESTIONS.
- `Docs/tests/__pycache__` is pre-existing.
- 108 directories under `archives/` written by test runs in this window
  were removed. Each held no `master.json`. `archives/` is gitignored.
  212 remain, predating this job; `create_track` mints a session id and
  makes its archive directory before anything is written into it, which
  Job 3a already named.
