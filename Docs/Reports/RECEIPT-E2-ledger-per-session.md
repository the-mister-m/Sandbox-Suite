RECEIPT — E2 ledger per session — Sandbox Suite — start not captured (missed) to 2026-09-06 18:04 EDT

EDITS
- engine/ledger.py — removed `_ade_log_dir` global and `set_ade_log_dir`; added `_log_dir_resolver`/`set_log_dir_resolver`/`_log_dir_for_region`
- engine/ledger.py — `_log_path_for(shell, log_dir=None)` now takes an explicit log_dir
- engine/ledger.py — `append()` resolves log_dir from the record's region via the resolver hook (shell must be ade)
- engine/ledger.py — `_scan_log`, `read_log`, `snapshot`, `ade_snapshot`, `region_totals`, `detail`, `_find_record`, `_deny_orphan` take a `log_dir` argument, default None (old path)
- engine/ledger.py — `pending_as_records(log_dir=None)` filters entries by `e.get("session")` against `tracks.list_regions(log_dir)` when log_dir is given
- ade/tracks.py — `_emit_turn_record` no longer calls `set_ade_log_dir`
- ade/tracks.py — `_point_stores_at` no longer calls `set_ade_log_dir`
- ade/tracks.py — added `_region_log_dir` and registered it via `ledger.set_log_dir_resolver`
- ade/tracks.py — added `list_regions(log_dir)`, returns region ids of the environment owning that log_dir
- ade/frames.py — `_track_gatelog` resolves the region's environment and passes its log_dir to `ade_snapshot`
- ade/frames.py — `feed` handler passes `ctx.environment.log_dir` to `ade_snapshot` and `region_totals`
- ade/frames.py — `ledger_detail` handler passes `ctx.environment.log_dir` to `detail`
- ade/frames.py — `_do_gate_action` takes `log_dir`, forwards to `_deny_orphan`; `gate_action` handler passes `ctx.environment.log_dir`

STRAY FILES
- none

GOALS DONE
- ledger directory resolver hook added, tracks.py registers region-to-log_dir mapping, same shape as waypoint's store resolver
- set_ade_log_dir and its two tracks.py callers removed
- snapshot, ade_snapshot, region_totals, detail, _find_record, _deny_orphan take log_dir; feed/ledger_detail pass ctx.environment.log_dir; _track_gatelog passes the region's environment
- pending_as_records filters to entries whose session is a region of the given environment, via tracks.list_regions
- blob directory untouched, no JS touched, no record field/schema changed, feed frame shape and inst echo untouched

GOALS NOT DONE
- none

DECISIONS MADE
- pending_as_records filter field: used entry's "session" key (literal spec wording "entries whose session is a region") — options seen: filter on "region" key instead (also present on entries) — undo path: swap `e.get("session")` for `e.get("region")` in engine/ledger.py pending_as_records, one line
- tracks.list_regions(log_dir) signature: takes a log_dir and finds the owning environment by scanning list_environments() — options seen: taking an environment object directly, but pending_as_records has no environment object, only log_dir threaded through from the feed/detail call sites — undo path: change signature and the one call site in pending_as_records
- import of ade.tracks inside pending_as_records is local/lazy (matches the existing local import of engine.daemon_queue in the same function) to avoid a circular import, since ade/tracks.py imports engine.ledger at module level — undo path: none needed, this is the only workable shape

READS BEYOND THE LIST
- ade/frames.py lines 505-534 — needed to see `_do_gate_action`'s body and its caller at the old line 523/807 (`gate_action` handler) to wire ctx.environment.log_dir through to `_deny_orphan`; not fixing this caller would have left ade gate-denial of orphaned records silently falling back to the old shared-file lookup
- ade/frames.py lines 798-810 (now 798-812) — confirmed `ctx.environment` is in scope at the `gate_action` handler before editing it

BLOCKERS FOR LATER WAVES
- server.py `_execute_queue_entry` (lines 49-175, read-only per spec) builds its custody dict as `{k: entry.get(k) for k in ("machine","session","shell","root","driver","seat","vessel","source","track","turn")}` — it never copies "region" from the queue entry. Every action_record built there gets `region=None`, so `append()` falls back to the old shared LOG_PATH for all queue-fired actions (write/run/fetch/send/reset), regardless of which session's environment fired them. Spec's Build section names no server.py edits, so left as-is. This blocks the acceptance criterion "each archive folder holds only its own turn and action records" for queue-fired actions specifically — worth a follow-up spec.

PHASE 3 SURFACED
- see BLOCKER above — queue-fired action records (server.py `_execute_queue_entry`) do not carry region and won't be split per session until that custody dict is fixed

BRANDON'S TODOS
- none

CLOSER REVIEW
- confirm the server.py custody-dict gap (queue-fired actions missing region) against acceptance criteria and decide whether it needs its own follow-up spec — Brandon
- verify pending_as_records's "session" vs "region" filter choice against Brandon's intent — Brandon
