# SPEC E4 — archives and context — Sandbox Suite

Model: sonnet. Wave 2. Receipt: Docs/Reports/RECEIPT-E4-archives-context.md,
written before 200K tokens.

## What this is

Three backend pieces the transcript widget and devagent need. A global
toggle for archives as the library home. A transcript route that lists
live and retired regions per session. Region context files that follow a
region through a reset.

## Decisions, from Brandon

- The toggle is a global setting that session settings can override.
  Never track or region.
- Transcripts are saved on our side. Claude Code keeps them thirty days,
  the other providers do not keep them this way.
- Region context files live one per region id under injections/region.

## Read, in this order, nothing else

- engine/settings.py lines 144 to 200 (global tier), 361 to 450 (session
  tier). Full file is larger, stop at 450.
- engine/compiler.py lines 238 to 248 (track_layer, region_layer). 
- ade/tracks.py lines 1465 to 1532 (_do_reset), 1430 to 1448
  (_archive_reset_transcript). 71 KB file.
- server.py lines 1007 to 1097 (retired chats routes), 1164 to 1167
  (sessions open). 62 KB file.

## Build

1. Toggle. One global key, library_archives, bool, default true, in the
   global defaults. One session row mirroring it in the session path map
   so session_effective resolves it. Nothing reads it yet in this job.
2. Transcript route. GET /api/transcripts with an optional sid. Returns
   sessions, each with regions, each region with live true or false and
   its cache list, the same cache shape the retired route returns. Live
   comes from the environment registry, retired from the archive. With a
   sid, one session. The old retired routes stay untouched.
3. Context follows reset. In _do_reset, after the fresh region exists,
   if injections/region/<old id>.md exists, copy it to <new id>.md. The
   old file stays. Same for nothing else.

## Do not

- Do not draw any UI. The Suite page reads the toggle in E13.
- Do not touch track context files. Track ids survive a reset.
- Do not change the archive schema.

## Acceptance

- Global toggle off, session override on, session_effective says on.
- Two live sessions, one with a retired region. The route with each sid
  returns that session only, live regions flagged, caches listed.
- Reset a region that has a context file. The new id has the same file.

## Receipt

Edits by file and line. The toggle's key name and where it lives.
