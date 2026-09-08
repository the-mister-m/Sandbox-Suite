SESSION REVIEW — Sandbox Suite — B2 — 2026-09-07 ~13:51-14:20 EDT

DRIVEN

messenger
- roster updates on track_list: SEEN (inherited S1-rerun; re-confirmed
  live — insert grew the rail, messenger-02-roster-after-insert.png).
- send lands on the waypoint: SEEN (inherited S1-rerun; re-confirmed —
  messenger-20-cards-two-groups.png).
- mute toggles: SEEN, with a real gap — messenger-10 shows the row
  struck through within 500ms of the click, but the click handler
  itself (messenger.js:373-383) never re-renders and wp_mute never
  re-broadcasts track_list server-side (ade/frames.py:794-798); the
  update rode in on incidental concurrent session activity, not a
  guaranteed refresh. See FIX LIST.
- read marks: SEEN — messenger-42/43/44, Captain's unread count went
  2 -> 1 after clicking "mark read" + forcing wp_feed. Same
  no-auto-refresh gap as mute.
- cards group by participants: SEEN — messenger-20-cards-two-groups.png,
  6 distinct cards each keyed by their own participant set, never
  merged across different recipient lists.

Full detail: Docs/Reports/phase3-test/SPEC-test-messenger.md.

queue_log
- feed rows appear: SEEN — 43 real records on mount (queuelog-01),
  B1's feed fix holds here too.
- settle inline: SEEN — full write_file/read_file/run_command gate
  cycle on a live claude region, every gate approved by clicking
  queue_log's own inline approve button (queuelog-51/71/81). Confirmed
  against log.jsonl and disk (test.txt written then removed, rm exit
  0).
- detail expands: SEEN — queuelog-90-detail-expand-clean.png, with a
  minor gap (input panel shows queue_id, not the command text — FIX
  LIST).
- column order and width survive a reload: SEEN — reorder and a
  60px resize both held after page.reload() in the same session
  (queuelog-20/21/30, and again confirmed together in
  queuelog-resize-console.txt).

Full detail: Docs/Reports/phase3-test/SPEC-test-queue_log.md.

REGIONS MOUNTED AND DROPPED
- b063adc1befc "gemma4b2" — insert_region on track 5a031370bf1c, model
  gemma4:e4b-it-q8_0, provider ollama. Used for messenger's roster/mute
  tests and as a cards/read-mark participant. Dropped via kill_track
  at end of session — confirmed gone (cleanup-01-after-drop.png).
- 90db982504a6 "sonnetb2" — insert_region on track 5a031370bf1c, model
  sonnet, provider claude. Ran the send_message-to-Captain turn (for
  messenger's read-mark test) and the full write_file/read_file/
  run_command gate cycle (for queue_log's settle-inline test, three
  turns total — the model needed explicit single-tool nudges to
  progress past repeated write_file retries). Dropped via kill_track
  at end of session — confirmed gone.
- Pre-existing region gfsf (32f1ec929f4a) left untouched throughout —
  confirmed still present alone on 5a031370bf1c at close. A third
  region "b3claude2" (9f2051a42f39) was visible mid-session on the
  same track/session, not mine — left alone, gone by the time of the
  cleanup check (another box's mount).

GATE
- messenger: sonnetb2 called send_message(receivers=["Captain",
  "b063adc1befc"], body="Sonnet here...") and gemma4b2 called
  send_message(receivers=["Captain"], body="Message received,
  Captain..."); both approved via {type:"gate_action", action:
  "approve"} over the raw socket (messenger has no inline settle UI of
  its own), confirmed landing as unread mail to Captain and then
  clearing via the "mark read" control + forced wp_feed.
- queue_log: sonnetb2 given a turn to write test.txt, read it back,
  then rm it. Three gates fired in order — write_file (6 bytes),
  read_file (6 bytes back), run_command "rm test.txt" (exit 0) — each
  approved by clicking queue_log's own inline "approve" button, per
  the task's settle-inline instruction. Took three separate turns and
  explicit nudges (the model kept re-issuing write_file instead of
  progressing on its own); every gate that ultimately fired is real
  and confirmed in archives/9883b6bec3df/log.jsonl.
  /Users/moth3rship/Desktop/test.txt confirmed absent afterward.

CONSOLE
- One pre-existing page-level 404 (known, shared setup list) on every
  load. No new console errors or pageerrors across either widget's
  full driver sequence.

FIX LIST
- static/js/widgets/messenger/messenger.js:373-383 (mute) and :257-260
  (mark read) — neither click handler locally re-renders or re-fetches;
  both rely on some track_list/wp_feed arriving from elsewhere. wp_mute's
  server handler (ade/frames.py:794-798) never re-broadcasts track_list
  the way insert_region/kill_track/stop do. On a quiet session either
  control could sit visually unconfirmed indefinitely.
- static/js/widgets/queue-log/queue-log.js:557-558 — mounts and
  requests `{type:"feed"}` once, never subscribes to `feed_dirty`. A
  new pending gate from any region will not appear until the widget is
  told to re-fetch. Same shape as B1's changes.js finding.
- static/js/widgets/queue-log/queue-log.js:185-198 (`inputText`) — the
  detail panel for a merged run_command record shows `queue_id: <id>`
  instead of the actual command text.
- Not this box's bug, timing note for future driver scripts on this
  session: turns ran ~150-160s each (log.jsonl `duration_ms`); a
  claude region needed explicit single-tool nudges to move past a
  write_file retry loop rather than completing a three-step
  instruction unattended.

STRAY FILES
- Docs/Reports/phase3-test/b2/*.png, *-console*.txt — 58 files, this
  box's screenshots and console dumps across both widgets (several
  named `*-gatesN-*`/`*-part2-*` reflect the three driver attempts
  needed to land queue_log's gate cycle correctly, documented rather
  than deleted).
- Driver scripts themselves live in the session scratchpad
  (/private/tmp/.../scratchpad/b2_*.py), not under the project.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-90 (Shared setup, B2)
- Docs/Reports/RECEIPT-phase4-S1-rerun.md (full)
- Docs/Reports/RECEIPT-phase4-B1.md (full)
- static/js/widgets/messenger/messenger.js (full, 431 lines)
- static/js/widgets/queue-log/queue-log.js (full, 595 lines)
- static/js/widgets/shared/feed-rows.js (full)
- ade/frames.py:437-475 (_do_insert_region/_do_duplicate_region),
  :615-666 (stop/kill_track/delete_track), :775-811 (feed/wp_feed/
  wp_send/wp_mute/wp_read/gate_action dispatch), :160-183 (mark_dirty/
  feed_dirty broadcast)
- ade/tracks.py:1347-1362 (set_muted)
- engine/waypoint.py (full, 236 lines)
- engine/ledger.py:369-420 (pending_as_records, the B1 fix, re-read)
- engine/tools.py:600-660 (send_message tool schema/gating)
- engine/read_tool.py:439-460 (send_message runtime)
- server.py:205-260 (waypoint nudger/prober/resolver — "Captain"
  resolution)
- static/js/matrix/socket.js:1-60, static/js/matrix/grid.js:185-232
  (applyTemplate, instances/frames, onFrame)
- Docs/tests/matrix_harness.py (full, basis for driver scripts)
- library/grids/9883b6bec3df/w-wq14ant3.json:1-60 (confirmed my
  applyTemplate calls land on fresh per-tab windows, not Brandon's)
- queue.json, archives/9883b6bec3df/log.jsonl (ground truth, read
  repeatedly across all driver attempts for both widgets)

CLOSER REVIEW
- messenger mute/read-mark no-auto-refresh gap and queue_log's
  feed-once-at-mount gap are the same class of bug B1 already flagged
  in changes.js — three widgets now show it; Brandon or closer, scope
  call on whether this becomes one shared follow-up fix box rather
  than three separate ones.
- queue_log's detail panel showing queue_id instead of the run command
  text — minor, real, worth a line in a future fix pass.
