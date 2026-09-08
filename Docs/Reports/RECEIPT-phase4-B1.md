SESSION REVIEW — Sandbox Suite — B1 — 2026-09-07 13:31-13:50 EDT

FEED FIX
- Confirmed live and working. Server-side fix (ade/tracks.py
  region_ids_of_log_dir, engine/ledger.py:374) holds — both strip's
  popover and changes' tree now render real feed rows and pending
  gates, where S1-rerun saw "no records for this agent" across the
  board.

DRIVEN
- strip — popover opens with feed rows: SEEN — strip-11-pending-gate-1.png,
  strip-06-popover-refreshed.png (was FAILED in S1-rerun).
- strip — kill stops the region (soft stop, not a real kill): SEEN — strip-21-after-kill-click.png,
  chip stayed after ✕ click (was NOT DRIVEN in S1-rerun).
- strip — one chip per region / busy / queue states: SEEN (inherited from
  S1-rerun, re-confirmed live here).
- changes — files and agents grouping: SEEN with a real bug — see FIX LIST
  (changes-10, changes-40).
- changes — diff pane: SEEN (changes-10-pending-before-approve.png).
- changes — pending gate flag: SEEN (was NOT DRIVEN) — changes-30-pending-flag-forced-refresh.png,
  required a manually forced feed re-send to catch (see FIX LIST).
- changes — jump to ledger row: mechanism SEEN (event fired, listener
  present), row focus NOT VISUALLY CONFIRMED at screenshot resolution.

Full detail: Docs/Reports/phase3-test/SPEC-test-strip.md,
Docs/Reports/phase3-test/SPEC-test-changes.md.

REGIONS MOUNTED AND DROPPED
- b4071bdf83d3 "gemma4t" (strip run) — gemma4:e4b-it-q8_0/ollama on
  5a031370bf1c. Idled, dropped via kill_track.
- faed240b2643 "sonnet3" (strip run) — sonnet/claude on 5a031370bf1c.
  Ran the write-gate cycle (write test.txt approved and applied via
  strip's popover settle button); a redundant second write_file gate
  in the same turn timed out unapproved. Dropped via kill_track.
- 55b0c251e410 "gemma4c" (changes run) — gemma4:e4b-it-q8_0/ollama on
  5a031370bf1c. Idled, dropped via kill_track.
- d248cb53bb94 "sonnetc" (changes run) — sonnet/claude on 5a031370bf1c.
  Ran two turns: full write/read/rm gate cycle on test.txt (all three
  approved via raw gate_action, file confirmed removed from disk), then
  a second turn writing test2.txt (approved, then manually cleaned up
  by me since that turn was write-only). Dropped via kill_track.
- Pre-existing region gfsf (32f1ec929f4a) on track a104ecc9ea23 left
  untouched throughout — confirmed still present and alone on 5a031370bf1c
  at close.

GATE
- strip run: write test.txt gate — approved via strip's own popover
  approve button, file written (6 bytes). A second, redundant write_file
  gate in the same turn timed out (`answered_by: timeout`) before I could
  catch it.
- changes run 1: full write/read_file/run_command(rm) cycle on test.txt —
  all three approved via {type:"gate_action", action:"approve"} sent
  fast off captured gate_broadcast frames. Confirmed in log.jsonl: write
  fired (6 bytes), read fired, `rm test.txt` exit 0. File confirmed
  absent from disk afterward.
- changes run 2: write test2.txt gate — approved same way, file appeared
  (7 bytes) and was removed by me directly (this turn was write-only by
  design, to catch the pending flag mid-flight).

CONSOLE
- One pre-existing 404 (page-level favicon, per shared-setup known list)
  on every load. No new console errors, no pageerrors, across five
  driver runs.

FIX LIST
- static/js/widgets/changes/changes.js:160 — `reduceEvents()` only
  matches `r.action_type === "write"` (the Claude-native-tool shape
  produced by engine/ledger.py:514's `_translate_rail_c_write`). The
  sandbox's own direct write path logs `action_type: "write_file"` and
  is never recognized — a completed write done that way vanishes from
  changes' tree the instant its gate resolves, even though it renders
  correctly while still pending (pending records use a separately-shaped
  action_type "write"). Confirmed live with test2.txt.
- static/js/widgets/changes/changes.js:449-450 — mount sends
  `{type:"feed"}` once and never subscribes to `feed_dirty` (contrast
  strip.js:313). Changes' tree is frozen at mount time; a live pending
  gate or new write only shows up after a manual `frame.send({type:
  "feed"})` or a remount, not on its own.
- strip.js — ✕ button sends `{type:"stop"}`, a soft stop, not a kill (S1-rerun
  already flagged this; now directly driven and confirmed).
- Not this box's bug, worth a note: a redundant no-op write_file gate
  fired mid-turn on the strip run and timed out because nothing was
  watching it — not a widget defect, just a real turn behavior seen
  along the way.

STRAY FILES
- Docs/Reports/phase3-test/b1/*.png, *-console*.txt, *-frames-seen.txt —
  this box's screenshots, console dumps, and captured-frame logs.
- Extra grid window JSON files under library/grids/9883b6bec3df/ from
  each applyTemplate call in the driver scripts (throwaway test windows,
  same footprint as S1-rerun).

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40 (Shared setup, B1)
- Docs/Reports/RECEIPT-phase4-S1-rerun.md (full)
- static/js/widgets/strip/strip.js (full, 368 lines)
- static/js/widgets/changes/changes.js (full, 484 lines)
- static/js/widgets/ledger/ledger.js:770-795 (mx:open-ledger listener)
- Docs/tests/matrix_harness.py (full, basis for driver scripts)
- static/js/matrix/grid.js:185-232 (applyTemplate, instances, frames)
- static/js/matrix/widget-frame.js:1-60 (send/subscribe/deliver)
- static/js/matrix/socket.js:1-60 (onFrame/send)
- ade/frames.py:437-450 (_do_insert_region), :615-632 (stop/kill_track)
- ade/tracks.py:1023-1030 (region_ids_of_log_dir), :1421-1450 (close_region)
- engine/ledger.py:369-385 (pending_as_records, feed fix), :396-460
  (_pair_gates/_pair_tool_use), :460-515 (_translate_rail_c_write)
- queue.json, archives/9883b6bec3df/log.jsonl, archives/9883b6bec3df/master.json
  (ground truth, read repeatedly across all five driver rounds)

CLOSER REVIEW
- changes.js's write_file-vs-write recognition gap and its
  feed-once-at-mount behavior — both real, both worth a follow-up build
  box; Brandon or closer, scope call on priority.
- strip's ✕ = stop, not kill — same open product question S1-rerun
  raised, still unresolved.
