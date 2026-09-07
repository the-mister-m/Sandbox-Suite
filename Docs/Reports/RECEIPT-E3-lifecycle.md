RECEIPT — E3 lifecycle — Sandbox Suite — Sun Sep 6 18:06:04 EDT 2026 to Sun Sep 6 18:14:22 EDT 2026

EDITS
- [server.py](../../server.py) — deleted `_sessions_snapshot` and the bare `/api/sessions` route (nothing outside static calls it)
- [server.py](../../server.py) — `/api/shutdown-suite` takes a `sessions` body (id, name, save), saves-or-drops and ends each, closes its sockets, then hand-calls `_shutdown_children` before the exit timer
- [server.py](../../server.py) — `/api/session-settings/<sid>` POST route calls `ade_tracks.write_session_settings(environment)` after writing the bag
- [ade/tracks.py](../../ade/tracks.py) — `Environment.session` carries `saved_ts`; `row()` returns it; `save_session`/`autosave` stamp it; `_fill_environment` carries it from the archive; `_reset_to_scratch` clears it
- [ade/tracks.py](../../ade/tracks.py) — new `write_session_settings(environment)`, the settings.json write factored out of `autosave` into one function both call
- [ade/frames.py](../../ade/frames.py) — `ade_end` calls `close_conns(environment)` after `end_session`, removed the trailing `_init()` broadcast
- [static/js/suite/api.js](../../static/js/suite/api.js) — added `shutdownSuite`
- [static/js/suite/suite.js](../../static/js/suite/suite.js) — open-sessions table and saved-sessions list show date/time from `saved_ts`; added a Shutdown Suite button and modal (name field, save checkbox, timestamp per live session; Archive-and-shut-down / Cancel), built in JS since no shutdown button existed in the page markup yet (Decision 1)

STRAY FILES
- none

GOALS DONE
- Shutdown modal: one line per live session, name prefilled or blank, save checkbox checked by default, date/time; Archive-and-shut-down / Cancel; checked sessions archived under their name, unchecked dropped, blank names get the session id
- Timestamps: environment_rows and the archived session list both carry saved_ts; Suite page shows date/time everywhere sessions are listed, including the modal
- ade_end frame closes the environment's sockets, no more init broadcast after
- Session settings write route persists settings.json the moment it is written, same function autosave uses
- Sessions route: grepped static for a bare `/api/sessions` call, found none, deleted the route and `_sessions_snapshot`

GOALS NOT DONE
- In-turn ask / gate_wait_s timeout (build item 6) — see BLOCKERS

DECISIONS MADE
- Shutdown Suite button and modal built entirely in JS (DOM created and appended in suite.js) instead of assuming ids in an unread HTML template — suite.html isn't on the read list and isn't one of the four fallback reads. Undo: delete the `buildShutdownModal`/`openShutdownModal`/`buildShutdownButton` block and the `buildShutdownButton()` call in `init()`.
- `/api/shutdown-suite` still calls `_end_all_sessions()` (model unload, ollama kill) after the new per-session loop — spec didn't mention removing it and the region loop inside it is a no-op once the listed sessions are already ended. Undo: drop that call and merge `{"suite": "going dark"}` into an empty dict instead.
- Unchecked-save sessions are "ended without archive" by setting `environment.session["saved"] = False` right before `end_session`, so `autosave`'s existing early-return (on saved == False) skips the write, rather than adding a new no-archive path to `end_session`. Undo: revert that one `with environment.session_lock` block in the route.

READS BEYOND THE LIST
- none — the four fallback files were not needed; the shutdown-modal HTML question was resolved by building the modal in JS instead (see Decision 1) rather than reading a fifth file

BLOCKERS FOR LATER WAVES
- Build item 6 (TrackHub.ask timeout, falls to the text queue on gate_wait_s) not built. Grepped engine for every caller of `.ask(`: one hit, engine/agent_loop.py:402, `ans = sess.io.ask(prompt).strip().lower() in ("y", "yes")`. That caller does not park on the queue result — it blocks for a plain yes/no string and immediately computes a bool, inside the `if not dq.has_notifier():` branch (the `else` branch already parks via `dq.park(...)`). Per the spec's own instruction ("if any caller does not park on it, stop and list it as a blocker. Do not guess"), stopped here. Whoever picks this up needs Brandon's call on what "falls to the queue" should do to a caller built for a synchronous answer.

PHASE 3 SURFACED
- none

BRANDON'S TODOS
- none

CLOSER REVIEW
- Decide build item 6 (in-turn ask timeout) — Brandon
- Confirm the shutdown-suite button/modal look right against the actual page (no HTML template was read or touched) — Brandon
