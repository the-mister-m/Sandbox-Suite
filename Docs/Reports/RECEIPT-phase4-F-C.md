SESSION REVIEW — Sandbox Suite — F-C — 2026-09-07 15:1x-15:42 EDT

EDITS
- static/js/widgets/changes/changes.js:160 — accept `action_type === "write_file"` alongside `"write"`
- static/js/widgets/changes/changes.js:174-179 — `nameOf()` falls back to `c.names[region]` (closed rows) before the raw id
- static/js/widgets/changes/changes.js:433 — add `names: {}`, `feedDirtyTimer: null` to instance state
- static/js/widgets/changes/changes.js:451 — subscribe adds `feed_dirty`
- static/js/widgets/changes/changes.js:459 — unmount clears `feedDirtyTimer`
- static/js/widgets/changes/changes.js:471 — merge `msg.names` into `c.names` on ade_init/track_list
- static/js/widgets/changes/changes.js:475-480 — `feed_dirty` handler, re-sends `feed` debounced 1s
- static/js/widgets/strip/strip.js:118 — `paintChip()` name falls back to `s.names[id]` before the raw id
- static/js/widgets/strip/strip.js:301 — add `names: {}` to instance state
- static/js/widgets/strip/strip.js:331 — merge `msg.names` into `s.names` on ade_init/track_list
- static/js/widgets/messenger/messenger.js:141 — add `closedNames: {}` to instance state
- static/js/widgets/messenger/messenger.js:153 — `nameOf()` falls back to `s.closedNames[id]` before the raw id
- static/js/widgets/messenger/messenger.js:261 — `markRead()` also sends `wp_feed` after `wp_read`
- static/js/widgets/messenger/messenger.js:424 — merge `msg.names` into `s.closedNames` on ade_init/track_list
- static/js/widgets/queue-log/queue-log.js:190 — `inputText()` returns `payload.command` first when present
- static/js/widgets/queue-log/queue-log.js:235-238 — `nameOf()` falls back to `st.names[regionId]` before the raw id
- static/js/widgets/queue-log/queue-log.js:532 — add `names: {}`, `feedDirtyTimer: null` to instance state
- static/js/widgets/queue-log/queue-log.js:560 — subscribe adds `feed_dirty`
- static/js/widgets/queue-log/queue-log.js:567 — unmount clears `feedDirtyTimer`
- static/js/widgets/queue-log/queue-log.js:578 — merge `msg.names` into `st.names`
- static/js/widgets/queue-log/queue-log.js:582-587 — `feed_dirty` handler, re-sends `feed` debounced 1s
- static/js/widgets/ledger/ledger.js:146-150 — `trackName()` falls back to `st.names[id]` before the raw id
- static/js/widgets/ledger/ledger.js:222 — add `names: {}`, `feedDirtyTimer: null` to instance state
- static/js/widgets/ledger/ledger.js:785 — subscribe adds `feed_dirty`
- static/js/widgets/ledger/ledger.js:798 — unmount clears `feedDirtyTimer`
- static/js/widgets/ledger/ledger.js:810 — merge `msg.names` into `st.names`
- static/js/widgets/ledger/ledger.js:812-817 — `feed_dirty` handler, re-sends `feed` debounced 1s
- Item 6 (model selector): investigated only, no edit. static/js/widgets/shared/settings-rows.js was the only file I was authorized to touch for this item; its `modelDisplay()` (lines 210-214) is dead code, never called. The live bug is in devagent.js:208-212 (`modelDisplay` shows the bare alias, e.g. "claude / sonnet") and static/js/widgets/shared/model-picker.js (`fill()` draws the version select as "—" for an alias row) — neither is in F-C's authorized file list. Not fixed; coordinator confirmed a separate box owns this.

HARNESS
Driver: scratchpad fc_driver.py (copied/extended from Docs/tests/matrix_harness.py) +
a short follow-up fc_messenger_retest.py. Mounted strip, changes, queue_log,
messenger, ledger on session 9883b6bec3df. Inserted one region, a17e153a3ebc
"fc1", claude/sonnet, on track 5a031370bf1c. One turn: write_file fc_test.txt,
run_command `pwd`, send_message to Captain — three gates, all approved via raw
`gate_action` off captured `gate_broadcast` frames (ids ff5c035020ab,
9f5a4a3d5fe7, 2f6e7cbe777b). gfsf (32f1ec929f4a) on a104ecc9ea23 confirmed
untouched throughout; final roster after kill held only gfsf.

- changes write_file: SEEN — Docs/Reports/phase3-test/fc/10-changes-after-write.png.
  Tree showed "fc_test.txt / write_file / fc1" immediately after the write gate
  resolved, via the new feed_dirty subscribe, no remount, no manual feed re-send.
- queue-log detail / payload.command: DRIVEN, F-B's server change confirmed
  live. Clicked the run_command row; detail box read
  "INPUT command: pwd / OUTPUT 36 B [exit 0] /Users/moth3rship/Desktop" —
  the real command text, not a queue_id. Docs/Reports/phase3-test/fc/21-queue-log-detail.png.
- messenger read mark: SEEN, on a second pass. fc_driver.py's own poll loop
  exited (it counted `gate_broadcast` entries and stopped at the write+run
  gates) before the send_message gate had fired, so its messenger click found
  no unread card yet — noted honestly rather than reported as passing. The
  message had landed by the time the script reached kill_track, so a short
  follow-up script (fc_messenger_retest.py) reopened messenger alone, found
  the "fc1 / fc read-mark test" card (region already closed by then — also
  confirms the closed-name fix for messenger), clicked it, clicked mark-read:
  wp_feed frame count went 1 to 2 (the resend from messenger.js:261), unread
  badge cleared. Docs/Reports/phase3-test/fc/30b through 32b.
- kill a region, name stays: DRIVEN for changes and ledger — post-kill
  ade_init/track_list carried `names["a17e153a3ebc"] = "fc1"`
  (confirmed in frames-seen.json), and both changes' tree and ledger's
  per-track filter list still read "fc1", not the raw id.
  Docs/Reports/phase3-test/fc/41-changes-after-kill.png, 42-ledger-after-kill.png.
  strip: NOT VISIBLE — strip only ever draws a chip for ids present in the
  live `s.tracks` rows (renderStrip's `want` list), so a closed region has no
  chip to paint a name onto at all; this is strip's existing design, not a gap
  in the item 2 fix — the same `s.names` fallback is wired and would resolve
  correctly if a chip existed. Docs/Reports/phase3-test/fc/40-strip-after-kill.png
  shows only gfsf, as expected.
- Item 6 model picker: hands off per coordinator, not driven.
- Console: one pre-existing 404 (known, shared-setup list) across both script
  runs, no new console errors, no pageerrors.

STRAY FILES
- /Users/moth3rship/Desktop/fc_test.txt — written by the approved write_file
  gate (confirmed on disk, 8 bytes, "fc test"), removed after verification.
- library/grids/9883b6bec3df/w-96zfnnmu.json, w-s159oh5j.json — throwaway grid
  window files, one per script page load.
- Docs/Reports/phase3-test/fc/*.png, console*.txt, frames-seen.json — this
  box's harness screenshots, console dumps, and captured-frame log.

GOALS DONE
- Items 1-5 of F-C fixed and confirmed live against a real claude/sonnet turn.
- Item 6 looked at, confirmed wrong (bare alias / dash, not resolved id),
  correctly left unfixed per scope and coordinator instruction.

BLOCKERS
- Item 6's real fix locations (devagent.js, static/js/widgets/shared/model-picker.js)
  are outside F-C's authorized edit list — flagged, not touched, coordinator
  says a separate box owns it.

READS
- Docs/Specs/SPEC-phase4-fixes-B.md:1-98 (Shared setup, F-C, After)
- Docs/Reports/RECEIPT-phase4-S1.md (full, shape reference)
- Docs/Reports/RECEIPT-phase4-B1.md (full), RECEIPT-phase4-B4.md:1-120 (driving mechanics, gate/kill patterns)
- static/js/widgets/changes/changes.js (full read across edits, ~90-480)
- static/js/widgets/strip/strip.js (~1-340)
- static/js/widgets/messenger/messenger.js (~130-430)
- static/js/widgets/queue-log/queue-log.js (~125-590)
- static/js/widgets/ledger/ledger.js (~140-820)
- static/js/widgets/shared/settings-rows.js:195-235
- static/js/widgets/shared/model-picker.js (full, 139 lines)
- static/js/widgets/devagent/devagent.js:190-215
- static/js/widgets/timeline/timeline.js:265,353-377,1020-1090,1310-1340 (grep + spot reads)
- engine/providers.py:77-90,225-245,490-542,1219-1238
- server.py:1446-1450
- ade/frames.py:437-450,565-632,583-617,787-817 (insert_region, kill_track, user, wp_*, gate_action)
- ade/web_io.py:81-108,197-217 (send_track_created, send_gate_broadcast, names in track rows)
- engine/tools.py:600-660 (send_message tool)
- engine/read_tool.py:439-450 (send_message)
- engine/waypoint.py:1-95 (append_message, track prober/resolver)
- server.py:227-238 (_waypoint_track_prober — Captain always "live")
- ade/tracks.py:1289-1296 (display_name), :39 (HUMAN_SENDER)
- library/registry/widgets.json:10-18 (widget type strings)
- Docs/tests/matrix_harness.py (full, 132 lines, base for the driver)
- Docs/Reports/phase3-test/fc/frames-seen.json (harness output, own capture)

CLOSER REVIEW
- Item 6 scope call already made by coordinator (separate box) — nothing left
  to decide here.
- strip's closed-name behavior (no chip at all post-kill, data path proven
  correct via frames-seen.json) — worth a note if Brandon expects a visible
  "gone" chip in strip the way changes/ledger keep a row; not in this spec's
  scope to add.
