# SPEC E1 — session root — Sandbox Suite

Model: sonnet. Wave 1. Receipt: Docs/Reports/RECEIPT-E1-session-root.md,
written before 200K tokens.

## What this is

Root becomes a cascade with four rungs. Global, the process default.
Session, one per environment, set from the file browser, cascading to
every track and region in that session. Track, may diverge. Region, may
diverge. Today the session rung does not exist and the global stands in
for it. This job adds the session rung and moves every caller off the
global.

## Decisions, from Brandon

- Global default is ~/Desktop. It stays changeable later. Not this job.
- Session root is controlled by the file browser button. Setting it
  changes every track and region in that session.
- Track and region roots may diverge from the session root.

## Read, in this order, nothing else

- engine/read_tool.py lines 18 to 70 (root globals, resolve). 22 KB file.
- engine/agent_loop.py lines 40 to 70 (persisted root). 21 KB file.
- ade/tracks.py lines 879 to 960 (Environment), 1053 to 1135
  (create_track, insert_region), 1624 to 1651 (_write_archive), 1916 to
  1968 (reload_session, instantiate_template), 2043 to 2077
  (register_open_archives). 71 KB file.
- ade/frames.py lines 16 to 21 (_human_path), 807 to 972 (file frames,
  setroot). 40 KB file.
- engine/ledger.py lines 95 to 126 (write_blob, custody). 21 KB file.
- server.py lines 1622 to 1700 (socket handler, boot). 62 KB file.

## Build

1. Environment gets a root field, seeded from read_tool.WORKSPACE_ROOT at
   construction. Archive master carries it under workspace_root already;
   reload_session and register_open_archives read it into the environment
   instead of calling set_and_persist_root. The global never moves on a
   load.
2. The setroot frame writes ctx.environment.root, then applies a root edit
   to every region in that environment, as it does today. The broadcast
   reload stays. The global is untouched.
3. create_track and insert_region fall back to environment.root, not
   WORKSPACE_ROOT, when no root is given.
4. _human_path takes the environment and resolves relative paths from
   environment.root. Every file frame in frames.py passes ctx.environment.
5. ledger.custody stamps sess.root when present, else the global. The
   turn record already overrides it in tracks.py; action records now match.
6. write_blob takes a directory. Records written for an ade region put
   blobs under that session's archive directory in a logs folder. Blob
   paths in records stay relative to SUITE_ROOT so _read_blob still works.
7. tracks.py line 1927: remove the set_and_persist_root call.

## Do not

- Do not change the global root, its default, or its persistence file.
- Do not touch the ledger log directory. That is E2.
- Do not add a settings row for root. It is a field on the environment.
- Do not touch any JavaScript.

## Acceptance

- Two live sessions with different roots. A relative tree frame on each
  socket lists its own root.
- Loading an archived session does not move the other session's root.
- A new region with no root lands on the session root.
- An action record's root field matches the region that fired it.

## Receipt

Edits by file and line. What was left. Any place a caller still reads
WORKSPACE_ROOT for an ade region, listed, not fixed.
