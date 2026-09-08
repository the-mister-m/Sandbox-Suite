# SPEC-test-strip — B1

## RENDER
strip-01-idle-chips.png, strip-11-pending-gate-1.png, strip-12-after-settle-1.png,
strip-22-after-drop-both.png under Docs/Reports/phase3-test/b1/.

## READ LINE CONFIRMED OR REFUTED
CONFIRMED. Chips are region rows, gates key by region (chip dataset.track
is the region id, buildChip/paintChip key off it). Kill (X) sends
`{type:"stop", track:<region id>}` — confirmed by driving it: chip stayed
after click, region unaffected, only `kill_track` removed it. `track_status`
and `gate_broadcast` both arrived live during the driven turn.

## CHECKLIST
- one chip per region: SEEN (inherited from S1-rerun, re-confirmed here —
  strip-01-idle-chips.png shows gfsf/gemma4t/sonnet3, three chips for three
  regions).
- popover opens with feed rows: SEEN (was FAILED in S1-rerun; feed fix
  confirmed live). strip-06-popover-refreshed.png and
  strip-11-pending-gate-1.png show real rows — "13:35:13 write test.txt"
  with approve/deny/queue buttons, then a second row "13:35:18 write_file
  test.txt" appearing above it as the turn progressed.
- kill stops the region: SEEN (was NOT DRIVEN). Clicked the chip's ✕ on
  sonnet3 (strip-21-after-kill-click.png) — chip remained, region kept
  running; confirms label "stop … the seat stays", not a real kill. Real
  drop proven separately via `kill_track` (strip-22-after-drop-both.png,
  only gfsf remains).
- busy state during a turn: SEEN (inherited, re-confirmed — popover header
  cycled "working" → "waiting" → "thinking" across strip-11/strip-12).
- queue state on a pending gate: SEEN (inherited, re-confirmed — "waiting"
  header text and pending row with approve/deny/queue while the write gate
  sat unresolved).

## CONSOLE
One pre-existing 404 (page-level favicon, per shared-setup known list), no
new errors, no pageerrors, across all three driver runs
(strip-console.txt, strip-console-2.txt).

## FIX LIST
- A second, redundant `write_file test.txt` gate fired mid-turn-2 (model
  re-tried a no-op overwrite) and timed out unapproved (`answered_by:
  timeout`, archives/9883b6bec3df/log.jsonl id d3a7948bbae7) — not a
  strip bug, feed/popover rendering was never exercised against it in
  this run; noting for whoever looks at the double-write behavior.
- Confirmed not-a-bug: strip's ✕ = `stop`, not kill — same finding as
  S1-rerun, now directly driven.

## READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40 (Shared setup, B1)
- Docs/Reports/RECEIPT-phase4-S1-rerun.md (full)
- static/js/widgets/strip/strip.js (full, 368 lines)
- Docs/tests/matrix_harness.py (full, basis for driver scripts)
- static/js/matrix/grid.js:185-232 (applyTemplate, instances, frames)
- static/js/matrix/widget-frame.js:1-60 (send/subscribe/deliver)
- static/js/matrix/socket.js:1-60 (onFrame/send)
- ade/frames.py:437-450 (_do_insert_region), :615-632 (stop/kill_track)
- engine/ledger.py:369-385 (pending_as_records, feed fix confirmed)
- ade/tracks.py:1023-1030 (region_ids_of_log_dir, feed fix confirmed)
- queue.json, archives/9883b6bec3df/log.jsonl (ground truth, read three
  times across the three driver runs)
- archives/9883b6bec3df/master.json:1-60 (track/region layout before
  driving)

## BLOCKERS
None. Read/rm legs of the write-read-rm gate chain were not reached in
this run (turn 2 ended after the second write gate timed out, before
issuing check_read or run_command) — write leg is fully proven end to
end (gate → approve → file on disk), read/rm are NOT DRIVEN here. Given
the strip checklist itself does not require the read/rm legs (that
belongs to changes' pending-gate-flag line, next), not spending further
budget chasing it for strip.

## W4 — 2026-09-07

- Chip label "stop" (W3's fix): SEEN again post-restart. Kill button reads
  "stop" before and after a click; region stayed on the roster (a stop,
  not a delete). Full detail: RECEIPT-phase4-W4.md.
