# SPEC D3c — End Session closes its sockets

Fix job. Sonnet. Runs before Wave 3.

## Rule

Closing a window does not close a socket. Ending a session closes every
socket bound to that session's environment. Today End leaves them bound
and working against a halted environment.

## Lane

- server.py — api_session_end (line 1186), ws_ade_handler (line 1221)
- ade/frames.py — conn registry (lines 26 to 82)
- ade/tracks.py — end_session (line 1970), read only
- Docs/tests/test_region_edit.py — lines 88 and 94, rename only
- Docs/tests/test_environments.py — one new test

Nothing else. Do not touch ade/tracks.py logic, compiler, static.

## Change 1 — frames.py, close conns for an environment

Add one function beside _broadcast:

    def close_conns(environment)

- Under _conns_lock, collect every conn whose environment is that
  environment. Remove each from _conns. Recount the environment.
- Outside the lock, for each collected webio call webio.ws.close().
  Wrap each close in try/except; a dead socket must not stop the loop.
- Return the count closed.

## Change 2 — server.py, End calls it

In api_session_end, after ade_tracks.end_session(sid):

- Remove the _broadcast of send_ade_init to the ended environment. The
  sockets are about to close; nothing should be sent to them.
- Call ade_frames.close_conns(environment).
- Return jsonify with ok, list, and closed count.

ws_ade_handler already pops _registry and unregisters on exit. Closing
the raw socket makes ws.receive() return None, so its finally block runs
on its own. Confirm that in a test; do not add a second cleanup path.

## Change 3 — tests

- test_region_edit.py lines 88 and 94: rename the local variable world to
  environment. Nothing else in those tests changes.
- test_environments.py: one test. Register two environments, register a
  fake webio on each through ade_frames.register_conn, end one, assert
  close_conns removed only that environment's conn, the other's windows
  count is still 1, and the fake's close() was called once. A fake webio
  is an object with a ws attribute whose close() records a call.

## Comments

Label, function, state only. No contracts, no attribution.

## Done means

- All 13 test files pass. Run: python -m pytest Docs/tests -q
- Receipt at Docs/Reports/RECEIPT-D3c-end-closes-sockets.md. Same shape
  as RECEIPT-D3b-sockets.md. List every edit with file and line. List
  anything outside the lane, or nothing.
- One line appended to SESSIONLOG.md and INDEX.md for the spec and
  receipt. Ask before writing either.
