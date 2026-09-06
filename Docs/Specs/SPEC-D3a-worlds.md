# SPEC D3a — Worlds per session, list, save, end, autosave on shutdown

Wave 2, first half. Server. Opus. Ceiling 180 thousand tokens. Receipt
before 250. Scope: Docs/Scope/SCOPE-phase2-build.md. Read it first.

```
WAVE 1   Job 1  done
              │
WAVE 2   [Job 3a  YOU]
              │
         Job 3b
              │
WAVE 3   Job 4 ─ Job 5
              │
WAVE 4   Job 6 ─ Job 7 ─ Job 8
```

Nothing runs beside you. Job 3b follows you and binds sockets to your
worlds. Job 4 reads your list route. Job 5 opens matrix windows against
your session ids.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language. No death words for agents.
- Stay in your lane. Move the globals. Change nothing else about how a
  track or region behaves.
- Add nothing not in this spec or the scope. Smallest thing, named in
  the receipt.
- Phase 3 decisions go in the receipt under PHASE 3.

## LANE

- ade/tracks.py
- ade/frames.py, session frames only: ade_new, ade_load, ade_save,
  ade_end
- server.py, the session routes only, listed below
- Docs/tests/test_worlds.py, new

## WHAT EXISTS

One live world. _regions, _tracks, _closed_rows, _session, and
_tracks_lock are module globals in ade/tracks.py. _point_stores_at
repoints the log and waypoint stores at archives/<session id>/ or back
to the suite root. reload_session halts the live world and swaps all of
it. _reset_to_scratch clears it. autosave is a no-op until save_session
has run once. unsaved_summary and close have zero callers, so an unsaved
session with live tracks is lost on a clean shutdown. server.py's
shutdown hook stops provider subprocesses only.

## PART 1 — A WORLD PER SESSION

Wrap the module globals in a World class: regions, tracks, closed rows,
session record, lock, and the store paths. Add a module-level registry:
a dict of session id to World, with its own lock. Every function in
tracks.py that reads a module global takes a world instead, or looks it
up by session id. Keep every function name. Keep every signature except
for the added world or session id argument. Do not rename, reorder, or
merge functions.

new_session creates a World and registers it. reload_session creates a
World from an archive and registers it. end_session autosaves, halts,
and removes the World from the registry. The scratch reset becomes
per-World.

Stores: each World owns its log and waypoint paths. _point_stores_at
becomes a World method. The ledger and waypoint modules keep their
set-directory seams; the World calls them with its own directory. If
two Worlds are live, each writes to its own archive folder. The suite
root log is for no session.

## PART 2 — LIST, SAVE, END ROUTES

server.py, replace or add:

- GET /api/sessions/open: every live World. Row: id, name, saved,
  created, track count, window count. Window count is zero until Job 3b
  binds sockets; Job 3b fills it.
- POST /api/sessions/<sid>/save: save_session on that World.
- POST /api/sessions/<sid>/end: end_session on that World. The client
  shows Save, End, Cancel before calling this. Save then End is two
  calls.
- GET /api/session-templates: list_session_templates from Job 1.
- The existing /api/ade-sessions, /api/ade-templates, and
  /api/ade-sessions/save routes keep working against the registry.

## PART 3 — AUTOSAVE ON SHUTDOWN

On shutdown every live World autosaves, saved before or not. Extend the
shutdown hook in server.py to walk the registry and call a save that
does not require a prior save_session. Name it save_on_shutdown on the
World. It writes the archive with saved set as it was, so a session that
was never named stays unnamed but is not lost.

On boot, walk archives/ for any session archive whose shutdown flag is
set and register it as a live World in the registry with no sockets.
Add a shutdown flag to the archive master record, written by
save_on_shutdown and cleared by the next ordinary save. Bump the archive
schema by one and give the old schema a no-op migration step.

No windows open. No reconnect. The Suite Page's open-sessions display
lists it. Job 4 draws that display.

## PART 4 — TESTS

Docs/tests/test_worlds.py, offline:

- Two Worlds live, one region each. Each World's region list has one
  entry. Each World's log path differs.
- end_session on one World leaves the other untouched.
- save_on_shutdown on an unnamed World writes an archive with the
  shutdown flag. Boot registration lists it.
- Existing tests still pass. Run the whole suite.

## RECEIPT

Docs/Reports/RECEIPT-D3a-worlds.md. Sections: EDITS, DELETED, TESTS with
command and count, QUESTIONS, PHASE 3, STRAY FILES. Under EDITS list
every function that gained a world argument. Job 3b reads that list.
