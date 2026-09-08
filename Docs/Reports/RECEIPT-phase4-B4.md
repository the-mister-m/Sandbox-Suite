SESSION REVIEW — Sandbox Suite — B4 — 2026-09-07 14:20-14:47 EDT

gate_list and anchor_chat, tested together in one window on session
9883b6bec3df, track 5a031370bf1c. Every turn was typed into anchor-chat's own
send box; every gate was first offered to gate-list's own settle button.

DRIVEN

gate_list — Docs/Reports/phase3-test/SPEC-test-gate_list.md
- live gate shows as ASK: SEEN — b4/10-gate1-ask.png, b4/31-gate-ask.png.
  Yellow pip, ASK badge, prompt, approve/deny/queue row.
- settle changes the badge: SEEN — b4/11-gate1-settled.png. The badge changes.
  It is also a lie; see GATE and FIX LIST.
- history rows show, with anchor-chat on the same region: FAILED —
  b4/30-rebound-history.png. chat_history arrived twice for the region and both
  times carried zero records, including on a region that already had a
  completed write gate in the ledger. Server-side cause in FIX LIST.
- cross-region leak, not on the checklist but found and driven: SEEN —
  b4/83-leak-check.png. Two gate-lists, one bound to a region that no longer
  exists, both drew the same live gate with working settle buttons.

anchor_chat — Docs/Reports/phase3-test/SPEC-test-anchor_chat.md, appended
dated B4 section, Phase 3 section left intact
- transcript renders: SEEN — b4/30-rebound-history.png.
- send runs a turn: SEEN — five turns across four regions, all from the
  widget's own Send button, all in log.jsonl.
- stream shows thinking: SEEN — b4/91-stop-midstream.png, Hmmm … 6.5s.
- stream shows fences: SEEN — b4/95-fence.png, lang python, copy button,
  body print("hello"). Needed its own region; no earlier turn ever emitted a
  triple-backtick fence.
- stop fires: SEEN — b4/92-after-stop.png. out frames 132 at click, 136 at
  +3s, still 136 at +20s; transcript cut mid-sentence, dim [stopped — you hit
  Stop], meters back to IDLE. Two earlier attempts clicked Stop after the turn
  had already gone idle and proved nothing; reported as such.
- meters update: SEEN — ctx 13.2K/200K cache 13.2K t/s 20.4 avg 78.4.
- region_replaced rebinds: SEEN — reset_track gave
  old_id 481ac26ee513 → new_id fd4f0c30551c, and the bound instance's
  frame._anchorChat.region followed. b4/60-after-region-replaced.png.
- two instances on one socket both draw every region's stream: SEEN —
  b4/41-turn-on-gemma-both-panes.png. One turn on the gemma4 region; the pane
  bound to the claude region drew it and took gemma4's context meter
  (4.5K/32.8K) onto a 200K region.

REGIONS MOUNTED AND DROPPED
- 481ac26ee513 "b4claude" — insert_region on 5a031370bf1c, claude/sonnet. Ran
  the write gate cycle and the settle-button test. Replaced by reset_track
  (region_replaced test) into fd4f0c30551c, which ran the stop attempt, the
  leak check and the read+rm gates, and was dropped via kill_track.
- 5f2653efe80b "b4gemma" — insert_region on 5a031370bf1c,
  gemma4:e4b-it-q8_0/ollama. One turn, for the two-instance check. Dropped via
  kill_track.
- 3483ba1b0b6e "b4stop" — insert_region on 5a031370bf1c, claude/sonnet. One
  long turn, stopped mid-stream. Dropped via kill_track.
- 3a74cb29c5ed "b4fence" — insert_region on 5a031370bf1c, claude/sonnet. One
  turn, for the fence render. Dropped via kill_track.
- No haiku region mounted. Final roster confirmed: track 5a031370bf1c holds
  zero regions; pre-existing region gfsf (32f1ec929f4a) still alone on
  a104ecc9ea23, untouched throughout.

GATE
- The full write / read_file / run_command(rm) cycle ran on b4test.txt in the
  region root /Users/moth3rship/Desktop. write_file fired (5 bytes, contents
  b4ok), read_file fired, rm fired. /Users/moth3rship/Desktop/b4test.txt
  confirmed absent at close.
- Only the first gate of the cycle was settled from gate-list's own button, and
  that click did nothing. Proof: at 14:38:27 I clicked approve on gate
  da15630caa01; the row went APPROVED within a second; twenty seconds later the
  turn had not moved and no write result had come back (b4/33-20s-after-click.png).
  At 14:38:48 I sent {type:"gate_action", action:"approve"} for the same id on
  the same socket; fifteen seconds later the model had moved on to step 2 and
  the ledger recorded outcome fired, answer True, answered_by human, followed
  by the write_file firing.
- The first run tells it from the other side: gate 7617d9f177e5 was clicked
  approve in gate-list at 14:26, the row went APPROVED, and 150s later the
  ledger recorded outcome parked, answered_by timeout while anchor-chat printed
  [gate timed out — parked in the queue]. b4/20-after-gates.png.
- The read and rm gates were therefore settled with raw gate_action, the same
  way B1 and B2 settled theirs.

CONSOLE
- One pre-existing page-level 404 (known, shared-setup list) per page load.
  No new console errors, no pageerrors, across five driver runs.

FIX LIST
- static/js/widgets/gate-list/gate-list.js:278-280 — the settle button sends
  {type:'answer', text:'y'|'n'|'queue', id, track}. ade/frames.py:681 says in
  its own comment that answer is "the in-turn ask reply only; approve, deny and
  queue ride gate_action". With a track named, the handler calls
  track.hub.resolve_gate (:694), which only resolves the hub's in-turn ask slot
  (ade/tracks.py:290-297). A queued gate is waiting on dq.await_answer
  (engine/agent_loop.py:411-413), so that slot is empty, the call returns False,
  and nothing goes back. Silent no-op. The widget's one job does not work. This
  is the box's headline defect.
- static/js/widgets/gate-list/gate-list.js:267-277 — the row repaints APPROVED
  on the click, before any acknowledgement. Even with the frame fixed, the badge
  should follow a server frame, not the click.
- static/js/widgets/gate-list/gate-list.js:302-335 — no msg.region filter on
  ask or gate_pending, though both frames carry a region
  (engine/web_io.py:50, :137-143). Driven: a gate-list bound to a dead region
  drew and offered to settle another region's gate.
- ade/frames.py:253-256 with :265 — _track_gatelog filters ledger rows on
  r["track"] == the region id, but engine/ledger.py:136 writes track =
  sess.track, which ade/tracks.py:400-401 sets to the parent track id
  (sess.region holds the region id). chat_history is therefore always empty for
  any region, which silently disables gate-list's whole history path.
  _histRows (:89-108) has never run. Same class of region-vs-track id mismatch
  B1 found in the feed.
- static/js/widgets/anchor-chat/anchor-chat.js:676-684 — out, status and meters
  are drawn with no region check because those frames carry no region
  (engine/web_io.py:26, :159, :184). Phase 3 reasoned this; B4 demonstrated it.
  Not a one-file fix — it changes a contract between engine/web_io.py and every
  widget on those frames.
- ade/frames.py:259-260 — _anchor detaches the socket's previous region before
  attaching the new one, so one window follows one region. A second anchor-chat
  does not add a view; it blinds the first and then mirrors itself. Whether
  that is the intended contract is Brandon's call.
- static/js/widgets/anchor-chat/anchor-chat.js:647-651 — Stop works, but still
  never adds cp-stop-fired and never disables, so the click looks inert until
  the server's dim line lands. Carried from Phase 3, now confirmed against a
  working stop.

STRAY FILES
- Docs/Reports/phase3-test/b4/ — 44 files: 29 screenshots plus gate-state.json,
  gate-frames.json, settle-frames.json, settle-history.json, anchor-frames.json,
  anchor-state.json, final-frames.json, stop-frames.json, region-id.txt and
  five *-console.txt dumps. This box's evidence.
- Driver scripts live in the session scratchpad
  (/private/tmp/.../scratchpad/b4_gate.py, b4_settle.py, b4_anchor.py,
  b4_final.py, b4_stop.py), not under the project.
- Extra grid window JSON under library/grids/9883b6bec3df/ — one per
  applyTemplate call, five throwaway test windows, same footprint as B1 and B2.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-45, :103-132 (Shared setup, B4)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B2.md (full)
- Docs/Reports/phase3-test/SPEC-test-anchor_chat.md (Phase 3 section, before
  appending)
- static/js/widgets/gate-list/gate-list.js (full, 338 lines)
- static/js/widgets/anchor-chat/anchor-chat.js (full, 699 lines)
- Docs/tests/matrix_harness.py (full, basis for all five driver scripts)
- static/js/matrix/grid.js:185-235, widget-frame.js:40-110, socket.js:1-75
- library/registry/widgets.json:11-12
- Docs/HOWTO-frames.md (anchor, answer, chat_history, track_transcript rows)
- ade/frames.py:250-275, :437-475, :520-528, :560-580, :589-618, :629-640,
  :680-700
- ade/web_io.py:93-130
- ade/tracks.py:290-297, :392-405, :1399-1420, :1550-1565
- engine/web_io.py:26-50, :100-121, :137-143, :159-184
- engine/agent_loop.py:400-425
- engine/settings.py:62 (gate_wait_s default 150)
- engine/ledger.py (grep "track": — :136 log_event)
- archives/9883b6bec3df/log.jsonl, queue.json (ground truth, read across all
  five runs)

CLOSER REVIEW
- gate-list's settle button sends the wrong frame and never settles anything.
  Every other widget that settles gates (strip, queue-log, changes) uses
  gate_action. This is a one-line build fix and it should not wait for a wave;
  Brandon or closer, scope call.
- The chat_history region-vs-track id mismatch is the third region/track id
  confusion the phase has turned up (B1's feed, this one, plus the leak). Worth
  asking whether it wants one audit rather than three patches.
- S2 (roster frame) and S3 (folder regroup) had not run when this box ran, so
  the paths in this receipt are the ungrouped ones: static/js/widgets/gate-list/
  and static/js/widgets/anchor-chat/, not the grouped paths the spec names.
- One rules conflict to flag: the harness told me to prefer Bash for reads and
  edits, the project rules say the opposite. I used Read and Write for files
  and Bash only for greps and the one long append. Brandon's call which wins.
