# RECEIPT — D3a — Environments per session, list, save, end, autosave on shutdown

Job 3a, Wave 2. Spec: [SPEC-D3a-worlds.md](../Specs/SPEC-D3a-worlds.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Job 1 receipt read first: [RECEIPT-D1-settings.md](RECEIPT-D1-settings.md).
Transcript window: 2026-09-06 01:55 to 02:08 EDT.

## FOR JOB 3B — THE REGISTRY AND THE ROUTES

Read this section first.

The environment registry lives in [ade/tracks.py](../../ade/tracks.py).

- `Environment` — one session. Fields: `regions` (dict id to Region), `tracks`
  (dict id to Track), `closed_rows` (list), `tracks_lock`, `session`
  (dict: id, name, saved, created, plan), `session_lock`, `archive_lock`,
  `log_dir`, `waypoint_path`, `floor_ms`, `shutdown`, `hydrated`,
  `archived_tracks`. Methods: `sid()`, `_point_stores_at(sid)`, `halt()`,
  `row()`, `save_on_shutdown()`.
- Registry functions: `register_environment(environment)`, `unregister_environment(sid)`,
  `get_environment(sid)`, `list_environments()`, `environment_rows()`, `current_environment()`,
  `set_current_environment(environment)`, `environment_of_region(region_id)`,
  `environment_of_track(track_id)`.
- `environment_rows()` returns one row per live environment: `id`, `name`, `saved`,
  `created`, `tracks`, `windows`. **`windows` is hardcoded 0. Job 3b
  fills it** — the count belongs in `Environment.row()`.
- A `Region` and a `Track` each carry a `.environment` back-pointer.
- `current_environment()` is the fallback for every caller that does not name a
  environment. Job 3b replaces that fallback for socket-bound calls.

Session routes in [server.py](../../server.py):

- `GET  /api/sessions/open` — `{"list": environment_rows()}`
- `POST /api/sessions/<sid>/save` — body `{"name": "..."}`, name optional,
  falls back to the environment's existing name
- `POST /api/sessions/<sid>/end` — returns `{"ok": true, "list": [...]}`
- `GET  /api/session-templates` — `list_session_templates()` from Job 1
- Unknown sid returns 404 on both POST routes.

## EDITS

### [ade/tracks.py](../../ade/tracks.py)

New: `Environment`, `_environments`, `_environments_lock`, `_current`, `register_environment`,
`unregister_environment`, `get_environment`, `list_environments`, `environment_rows`,
`current_environment`, `set_current_environment`, `_environment`, `environment_of_region`,
`environment_of_track`, `_fill_environment`, `save_all_on_shutdown`,
`register_open_archives`.

Deleted as a module function, now a `Environment` method: `_point_stores_at`.
Deleted module globals: `_regions`, `_tracks`, `_tracks_lock`,
`_closed_rows`, `_session`, `_session_lock`, `_archive_lock`,
`_session_floor_ms`.

Functions that gained a `environment` argument (all optional, default the
current environment):

- `_ensure_session(environment=None)`
- `create_track(..., environment=None)`
- `_stamp_name(name, environment=None)`
- `insert_region(..., environment=None)` — defaults to the environment owning
  `track_id`
- `_announce_new_track(track, environment=None)`
- `session_started_ms(environment=None)`
- `_move_floor(ms, environment=None)`
- `session_meta(environment=None)`
- `set_plan(plan, environment=None)`
- `session_plan(environment=None)`
- `_initiate_by_node(environment=None)`
- `list_regions(environment=None)`
- `list_tracks(environment=None)`
- `_live_peers(environment=None)`
- `closed_rows(environment=None)`
- `stop_all_regions(environment=None)`
- `_halt_live_environment(environment=None)`
- `autosave(environment=None)`
- `save_session(name, environment=None)`
- `save_template(name, environment=None)`
- `save_session_template(name, environment=None)`
- `_reset_to_scratch(environment=None)`
- `unsaved_summary(environment=None)`
- `_write_archive(environment, sid, name, created, saved=True, shutdown=False)`
  — environment is first and required; it had no callers outside this file
- `end_session(sid=None)` — takes a session id, not an environment

Functions that find their environment by id and kept their signature:
`get_region`, `get_track`, `track_of`, `regions_of`, `remove_region`,
`remove_track`, `close_region`, `_archive_reset_transcript`, `_do_reset`,
`_final_flush`, `_initiate_cable_walk`, `initiate_targets`,
`initiate_deliveries`, `set_muted`, `display_name`, `attach`, `detach`,
`stop_region`, `reset_region`.

Behavior changes:

- `new_session()` builds and registers a fresh `Environment` beside every environment
  already live. It no longer wipes the live environment.
- `reload_session(sid)` builds a `Environment` from the archive, registers it,
  and makes it current. It no longer halts other environments. If that sid is
  already live and hydrated it is returned as is.
- `instantiate_template(tid)` builds and registers a new `Environment` the same
  way. It no longer halts other environments.
- `end_session(sid)` autosaves, halts, terminates queue sessions, and
  removes the environment from the registry.
- `_reset_to_scratch(environment)` clears one environment in place and unregisters it.
- `Region.take_turn` calls `autosave(self.environment)`.
- `Region._emit_turn_record` points the ledger at its own environment's
  `log_dir` before appending, so two live environments write to two archives.
- `ARCHIVE_SCHEMA` 5 to 6. Masters gain `shutdown` and `saved`.
  `_read_master` fills both with `False`/`True` for schema under 6; the
  schema-1 migration step is untouched.

### [ade/frames.py](../../ade/frames.py)

- `_frame_environment(msg)` — new. A session frame names its environment with `sid`;
  absent means the current one.
- `ade_save` — resolves an environment and passes it to `set_plan`,
  `save_session_template`, `save_template`, `save_session`,
  `session_meta`, `list_regions`, `list_tracks`.
- `ade_end` — resolves an environment, passes it to `set_plan`, and calls
  `end_session(environment.sid())`.
- `ade_new` and `ade_load` unchanged in text; they now create and register
  an environment through the tracks functions above.

### [server.py](../../server.py)

- `/api/sessions/open`, `/api/sessions/<sid>/save`,
  `/api/sessions/<sid>/end`, `/api/session-templates` — new.
- `/api/ade-sessions` — now skips `SESSION_TEMPLATE_KIND` as well as
  `TEMPLATE_KIND`, so Job 1's session templates stop showing up as saved
  sessions.
- `/api/ade-sessions/<sid>` DELETE — refuses any sid in the registry
  instead of only the one live session.
- boot — `ade_tracks.register_open_archives()` runs before the atexit
  hook is registered.
- `_shutdown_children` — calls `ade_tracks.save_all_on_shutdown()` first.
  The SIGTERM handler already routes through it.

### [Docs/tests/test_environments.py](../tests/test_environments.py)

New, 10 tests, offline.

### [Docs/Handoffs/HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)

Appended the "From Job 3a" block.

## DELETED

- `ade/tracks.py` module globals `_regions`, `_tracks`, `_tracks_lock`,
  `_closed_rows`, `_session`, `_session_lock`, `_archive_lock`,
  `_session_floor_ms`. All are now `Environment` fields.
- `ade/tracks.py` module function `_point_stores_at`. Now a `Environment`
  method with the same name.
- No files deleted.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Count: 97 passed, 0 failed. 10 of them are new in this job. No existing
test was changed.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. The spec says every function takes an environment "or looks it up by session
   id." Out-of-lane callers (`engine/tools.py`, `ade/web_io.py`,
   `engine/compiler.py`, `static/`) call these functions with the old
   signatures. Every added environment argument is therefore optional and
   defaults to `current_environment()`. `current_environment()` builds an empty
   `Environment` on first use. That fallback is the seam Job 3b replaces.
2. `waypoint.repoint` replays the whole file, so it cannot be called per
   turn. Only the ledger directory is repointed per turn record. Two live
   environments share one waypoint store between repoints, so mail written by
   environment B lands in environment A's file if A was activated last. Region ids do
   not collide, so no message is misdelivered — only misfiled. A proper
   per-environment waypoint store is a bigger change than this spec allows.
3. Boot registration does not build `Region` objects. It registers a
   `Environment` carrying the session record and the archive's track count, with
   `hydrated=False`. `reload_session(sid)` hydrates it in place on first
   use. The alternative — hydrating every shutdown archive at boot — would
   call `al.router.claude_reattach` for every cloud region on every start.
   `environment_rows()` reports `archived_tracks` for an unhydrated environment.
4. Archive masters gained a `saved` flag alongside `shutdown`. Without it
   an environment saved on the way down could not come back marked unsaved, and
   the spec asks that "a session that was never named stays unnamed."
5. `end_session` now takes a session id. It had no argument and one
   caller shape. The `ade_end` frame and the end route both pass one.
6. When the current environment ends, the most recently registered remaining
   environment becomes current; if none remain, a fresh empty `Environment` does.
   Nothing in the spec says which environment a socketless caller should land
   on. Job 3b binds sockets and makes this moot.
7. `/api/sessions/<sid>/save` takes an optional name. The spec says "save
   _session on that World" without naming the payload. An empty name
   reuses the environment's existing name, so Save on an already-named session
   works with an empty body.
8. A harness system-reminder mid-build told me to do reads and writes
   through bash rather than the Read, Edit, and Write tools. The job
   instruction and Brandon's file-ownership rule say the opposite.
   Followed the instruction; every edit above is visible as a tool call.
   Job 1 hit the same conflict. Naming it again as required.

## PHASE 3

Appended in full to [HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)
under "From Job 3a". Summary:

- One waypoint store serves every live environment. Per-environment mail is unanswered.
- `current_environment()` as the fallback for unbound callers survives Job 3b
  only for HTTP routes that name no session. Whether every route should
  require a session id is unanswered.
- A boot-registered environment is a stub until something reloads it. Whether
  the Suite Page should show that difference is unanswered.
- Job 1's parked change-modal record still lives in module memory in
  `frames.py`, not on an environment. Two environments share one parking area.
- `archives/` holds session archives, matrix templates, and session
  templates in one flat folder keyed by id. Three kinds, one namespace.
- Nothing prunes an archive whose environment was ended without a save.

## STRAY FILES

- Twenty-one directories under `archives/` written by test runs in this
  window were removed. Each held only `log.jsonl` or `waypoint.jsonl` and
  no `master.json`. `archives/` is gitignored.
- 241 empty directories under `archives/` predate this job and were left
  alone. `create_track` mints a session id and makes its archive
  directory before anything is written to it; that is pre-existing
  behavior, unchanged by this job.
- `Docs/tests/__pycache__` is pre-existing.

## FIX PASS, waypoint isolation

## EDITS

- [engine/waypoint.py](../../engine/waypoint.py) — removed `repoint` (dead,
  full-file replay). Added `new_store(path)` and a `set_store_resolver(fn)`
  seam; `append_message`, `append_denied`, `collect`, `peek`, `has_mail`,
  `dead_letter_all` now resolve a store by sender/receiver id instead of
  always using `default`.
- [ade/tracks.py](../../ade/tracks.py) — `Environment` gets a `waypoint`
  field: `_point_stores_at` builds it with `waypoint.new_store` instead of
  repointing the shared one; `register_open_archives` does the same for a
  boot stub. Registered `_environment_waypoint` as the store resolver.
  `drain_messages`, `run_pump`, `_announce_new_track`, `set_muted`,
  `close_region`, `_do_reset` call their own environment's `.waypoint`
  directly instead of the module-level functions.
- [Docs/tests/test_environments.py](../tests/test_environments.py) — new
  test, two live environments each write one message; each `waypoint_path`
  file holds only its own.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Count: 98 passed, 0 failed (97 before, one new here).

Left alone: `ade/frames.py`'s `HUMAN_SENDER`-only waypoint reads (`peek`,
`display_lines`, `waiting_counts`, `collect` for `wp_read`) and
`engine/read_tool.py`'s `request_messages` still read the shared `default`
store, since none of them carry a resolvable region id and fixing that
needs either a session-aware socket frame or the current-environment
notion this job was told not to write. Flagging for the next job.
