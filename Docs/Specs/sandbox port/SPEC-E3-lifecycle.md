# SPEC E3 — lifecycle — Sandbox Suite

Model: sonnet. Wave 2. Receipt: Docs/Reports/RECEIPT-E3-lifecycle.md,
written before 200K tokens.

## What this is

Six fixes to how sessions start, save, and end. Each is one function or
one route. They share files, so they are one job. Nothing here adds a
feature beyond the shutdown modal.

## Decisions, from Brandon

- Shutdown Suite opens a modal. One line per live session: a name field
  prefilled with the current name or blank, a save checkbox checked by
  default, date and time. Two buttons: Archive and shut down, Cancel.
  Checked sessions are archived under their name. Unchecked are dropped.
  Blank names get the session id.
- Date and time show on every saved session wherever it is listed.
- Ending a session closes every socket bound to it, on every path.
- Session settings persist the moment they are written.
- An in-turn ask with nobody to answer falls to the queue after gate wait.

## Read, in this order, nothing else

- server.py lines 389 to 394 (_sessions_snapshot), 476 to 541 (end and
  shutdown routes), 723 to 726 (sessions route), 974 to 1003
  (ade-sessions list), 1164 to 1194 (open, save, end), 1577 to 1604
  (session settings), 1681 to 1732 (boot, atexit). 62 KB file.
- ade/tracks.py lines 190 to 287 (TrackHub), 925 to 958 (halt,
  save_on_shutdown), 988 to 991 (environment_rows), 1685 to 1712
  (save_session, autosave), 2004 to 2041 (end_session,
  save_all_on_shutdown). 71 KB file.
- ade/frames.py lines 62 to 80 (close_conns), 761 to 767 (ade_end). 40 KB.
- engine/web_io.py lines 35 to 58 (ask). 9 KB file.
- static/js/suite/suite.js, 15 KB, the Suite page controls including the
  Shutdown Suite button and the session lists.
- static/js/suite/api.js, 3 KB, its fetch helpers.

## Build

1. Shutdown. The route takes a body: a list of session id, name, save.
   Sessions with save false are ended without archive. Sessions with save
   true are saved under the name. Then the existing shutdown children
   function runs, then the exit timer. os._exit skips atexit, so the
   function is called by hand before it. The Suite page button opens the
   modal, fetches open sessions, posts the list.
2. Timestamps. environment_rows and the archived session list both carry
   saved_ts. Every place the Suite page lists sessions shows date and
   time from it. The modal shows it too.
3. ade_end frame. After end_session, call close_conns on the environment.
   Remove the init broadcast that follows.
4. Session settings write route. After writing the bag, write
   settings.json beside the session record. Factor the write out of
   autosave into one function both call.
5. Sessions route. grep static for /api/sessions with no suffix. If
   nothing calls it, delete the route and _sessions_snapshot. If something
   does, list it in the receipt and leave the route.
6. In-turn ask. TrackHub.ask waits on its queue with a timeout of the
   region's gate_wait_s setting. On timeout it returns the text queue.
   Before building, grep engine for every caller of .ask( and confirm
   what each does with the text queue. If any caller does not park on it,
   stop and list it as a blocker. Do not guess.
   Decided 2026-09-06, Brandon: the turn blocks until the queue answers
   or gate_wait_s runs out. Timeout is a closed gate, a no. Nothing
   parks. The caller in engine/agent_loop.py keeps its yes-or-no
   contract, since the text queue is not yes. Built as a Wave 4
   follow-up, this item only.

## Do not

- Do not merge the two gate mechanisms.
- Do not change how End behaves on the HTTP route beyond timestamps.
- Do not add a per-row skip beyond the checkbox. All-or-nothing is the
  easy switch Brandon may ask for later, not this build.
- Do not touch any widget.

## Acceptance

- Shutdown with two unsaved sessions, one checked, one not. Restart. The
  checked one is listed with its name and a timestamp. The other is gone.
- ade_end from a window closes that window's socket.
- Write a session setting, restart with no turn taken. The value is back.
- A region with no window hits an ask gate and parks after gate wait.

## Receipt

Edits by file and line. The ask callers and what each does with queue.
Whether the sessions route was deleted or kept, and why.
