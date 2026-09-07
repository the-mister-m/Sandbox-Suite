# RECEIPT — D3c — End Session closes its sockets

Fix job, Sonnet, before Wave 3. Spec: [SPEC-D3c-end-closes-sockets.md](../Specs/SPEC-D3c-end-closes-sockets.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Prior receipt read first: [RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md).

## EDITS

### [ade/frames.py](../../ade/frames.py) — line 67 (new function, beside `_broadcast`)

- `close_conns(environment)` — under `_conns_lock`, collects every conn
  bound to `environment`, removes each from `_conns`, recounts the
  environment. Outside the lock, calls `webio.ws.close()` on each,
  wrapped in try/except. Returns the count closed.

### [server.py](../../server.py) — `api_session_end`, was line 1186

- Removed the `_broadcast` of `send_ade_init` to the ended environment.
- Added `ade_frames.close_conns(environment)` after `ade_tracks.end_session(sid)`.
- Response now returns `ok`, `list`, and `closed`.

### [ade/tracks.py](../../ade/tracks.py) — `end_session`, line 1970

Read only, as named. No change.

### [Docs/tests/test_region_edit.py](../tests/test_region_edit.py)

- Lines 87-96 (`test_cloud_model_defaults_reset_on_change_on`,
  `test_local_model_defaults_reset_on_change_on`): parameter and body
  references renamed from `world` to `environment`.
- Gap: renaming the parameter needs a fixture named `environment`; only
  a `world` fixture exists, shared by six other tests the spec does not
  name. Added the smallest thing — a pass-through fixture,
  `environment(world): return world`, placed after the `world` fixture.
  Filled per the scope's own rule for a builder who finds a gap. Other
  six tests in the file still take `world`, untouched.

### [Docs/tests/test_environments.py](../tests/test_environments.py)

- Added import `from ade import frames`.
- Added `_FakeSocket` and `_FakeWebIO` — a webio stand-in whose `ws.close()`
  records a call count.
- New test `test_ending_one_environment_closes_only_its_own_sockets`:
  registers a fake conn on each of two environments, ends one, calls
  `frames.close_conns` on it, asserts the count closed is 1, the ended
  environment's conn count is 0, the other's conn count and `windows`
  are still 1, the ended fake's `ws.closed` is 1, the other's is 0.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Result: `106 passed in 0.17s`. 105 before, 1 new.

## OUTSIDE THE LANE, NOT DONE

- Nothing. `ws_ade_handler`'s existing `finally` block already pops
  `_registry`, calls `unregister_conn`, and calls `disconnect(ctx)` on
  its own once `ws.receive()` returns `None` after `close()`. Confirmed
  by reading it; no second cleanup path added.
- The other six tests in `test_region_edit.py` still take `world`; the
  spec named only the two lines above and said nothing else in those
  tests changes.

## QUESTIONS

1. See gap above: the `environment` fixture added to
   `test_region_edit.py` to make the two-line rename real without
   breaking pytest's fixture lookup, and without touching the shared
   `world` fixture or the six tests that still use it.
2. A harness system-reminder mid-build told me to read and write through
   bash instead of the Read, Edit, and Write tools. The job instruction
   said the opposite. Followed the job instruction; every edit above is
   a tool call. D3b's receipt named the same conflict.
