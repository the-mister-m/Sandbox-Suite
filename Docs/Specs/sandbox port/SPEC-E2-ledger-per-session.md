# SPEC E2 — ledger per session — Sandbox Suite

Model: sonnet. Wave 1. Receipt: Docs/Reports/RECEIPT-E2-ledger-per-session.md,
written before 200K tokens.

## What this is

The ledger log directory is one module global, repointed on every turn.
Two live sessions taking turns at once race it, and a record lands in the
other session's folder. The feed frame reads with no session filter, so
every window sees every session's records. This job makes the directory
resolve per record and the reads resolve per environment.

## Decisions, from Brandon

- Queue, Ledger, and Changes views must show one session's records.
- The wire does not change. Old and new views keep sending feed with inst.

## Read, in this order, nothing else

- engine/ledger.py, whole file. 21 KB.
- engine/waypoint.py lines 231 to 298 (store resolver pattern). 10 KB file.
- ade/tracks.py lines 854 to 872 (_emit_turn_record), 911 to 923
  (_point_stores_at), 994 to 999 (environment_of_region). 71 KB file.
- ade/frames.py lines 252 to 254 (_track_gatelog), 768 to 776 (feed,
  ledger_detail). 40 KB file.
- server.py lines 49 to 175 (_execute_queue_entry), 583 to 598
  (_open_rail_c_tool_record), 690 to 720 (record-tool-outcome). 62 KB file.

## Build

1. ledger gets a directory resolver hook, same shape as waypoint's store
   resolver. tracks.py registers one that maps a region id to its
   environment's log_dir. append uses the record's region to pick the
   path. Records with no region, or shell not ade, keep the old path.
2. set_ade_log_dir and its two callers in tracks.py go away.
3. snapshot, ade_snapshot, region_totals, detail, _find_record,
   _deny_orphan take a log_dir argument. The feed and ledger_detail frames
   pass ctx.environment.log_dir. _track_gatelog passes the region's
   environment.
4. pending_as_records filters to entries whose session is a region of the
   given environment. Regions are found through tracks.list_regions.
5. Blob reads stay by relative path. No change.

## Do not

- Do not change any record field or the record schema.
- Do not change the feed frame's shape or the inst echo.
- Do not touch the blob directory. That is E1.
- Do not touch any JavaScript.

## Acceptance

- Two live sessions, each takes turns at the same time. Each archive
  folder holds only its own turn and action records.
- A feed frame on one socket returns no records from the other session.
- A parked daemon entry for session A does not appear in session B's feed.

## Receipt

Edits by file and line. Any caller of the old global left standing,
listed, not fixed.
