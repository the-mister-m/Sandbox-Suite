SESSION REVIEW — Sandbox Suite — S1 rerun — 2026-09-07 13:23 EDT

DRIVEN

strip
- one chip per region with region name: SEEN — strip-01-idle-chips.png shows "gfsf / gfsf2 / sonnet2" chips, all named.
- busy state during a turn: SEEN — sonnet2 chip grows a "•••" suffix mid-turn in strip-02/03 vs strip-01 idle (live gate_broadcast/track_status paints the chip; confirmed via s.liveGates in console).
- queue state when a gate is pending: SEEN — same evidence as above, s.liveGates carried the pending gate id live.
- popover opens with feed rows: FAILED — popover opens (strip-04/05/07-*.png) but always renders "no records for this agent" even while a gate was genuinely pending in queue.json/log.jsonl. Root cause below (FIX LIST).
- kill stops a region: NOT DRIVEN directly on strip's own kill button (used kill_track via console for cleanup instead, which is the same server call the ✕ maps to for delete; strip's ✕ button sends {type:"stop"}, a different, softer action, not exercised). Cleanup drop (delete) proven working — see REGIONS MOUNTED AND DROPPED.

changes
- agents tab lists regions by name: PARTIAL — underlying data is correct (frame._changes.trackNames = {32f1ec929f4a: gfsf, 518f4d739fed: gfsf2, 5c84d83e0ea5: sonnet2}, proving S1's ade_init/msg.tracks fix works here), but the rendered agents tab shows "nothing changed this session" (changes-01-agents-tab.png) because it groups feed events, and feed is broken (below). Data layer SEEN, UI layer FAILED, same root cause as strip's popover.
- files tab after the test.txt write shows the file: FAILED — changes-02-files-tab-pending.png shows "nothing changed this session"; same feed root cause.
- diff pane opens: NOT DRIVEN — no event rows exist to click.
- pending gate flag shows: NOT DRIVEN — no gate was pending at the time this widget was open (the first gate had already timed out during investigation; see GATE section), and feed is broken regardless.

messenger
- rail lists regions by name with model: SEEN — messenger-01-roster.png shows gfsf/gemma4:e4b-it-q8_0, gfsf2/gemma4:e4b-it-q8_0, sonnet2/sonnet.
- roster updates when you insert a region: SEEN — inserted a throwaway region live, messenger-02-roster-after-insert.png shows it appear; console confirms frame._mg.tracks grew to 4 entries.
- wp_send to a region lands (check wp_feed): SEEN — sent {type:"wp_send", to:[sonnet2], body:"driver ping"}; wp_feed line id 9 shows "Captain -> driver ping", and messenger-04-after-throwaway-drop.png renders it as a live "GROUP · YOU SEND HERE" card.

queue_log
- feed rows appear for the turn: FAILED — queue_log-01/03 show "no records" even after a full turn (write/read/rm, 3 gates, all approved) completed and was logged to log.jsonl. Root cause below.
- track column shows region name and model chip: SEEN (as the filter-chip row, not a table row, since no rows rendered) — queue_log-01-feed.png shows "gfsf gemma4:e4b-it-q8_0 / gfsf2 gemma4:e4b-it-q8_0 / sonnet2 sonnet" chips, proving S1's track-list fix works here too.
- settle inline works on the pending gate: FAILED — no pending row ever rendered to click (same feed bug). Fell back to gate_action via console per task instructions; settled all 3 gates that fired (write, read, run) live off gate_broadcast frames, watched queue_log's own screen the whole time — it never reacted (gatetest-approve-1/2/3.png, gatetest-99-final.png all show "no records" throughout).
- detail expands: NOT DRIVEN — no rows to expand.

ledger
- a turn row appears with usage: FAILED — ledger-01-summary.png shows "0 turns / No turns recorded yet" despite two completed turns logged in archives/9883b6bec3df/log.jsonl (region 5c84d83e0ea5, turns 1 and 2, real usage/cost data present). Same feed root cause.
- chips name regions: NOT DRIVEN — chipIds() derives from st.records (turns), which is empty because feed is broken.
- opening the turn shows actions and transcript: NOT DRIVEN — no turn row exists to click.

GATE
- Two gate rounds fired. Round 1 (during widget-mechanics investigation, ~150s idle): the write gate for test.txt timed out ("answered_by": "timeout", outcome "parked") before I settled it — test.txt was never written. Round 2 (gatetest.py, one continuous run): sent a fresh turn to sonnet2 (5c84d83e0ea5); three gates fired in order — write_file test.txt, read_file test.txt, run_command "rm test.txt" — each approved within ~1s of appearing via {type:"gate_action", action:"approve", id:<gid>} sent over the raw socket (queue_log was the open widget, per task's settle-fallback instruction, since queue_log's own settle button never had a row to click). Confirmed in archives/9883b6bec3df/log.jsonl: write_file wrote "hello\n" (6 bytes), read_file returned it, run_command exited 0. /Users/moth3rship/Desktop/test.txt confirmed absent afterward (correctly removed). Turn ended cleanly (stop_reason "stop").
- No widget under test visibly reacted to any of the three approvals (queue_log stayed "no records" the whole time) — this is the same feed bug, not a gate-plumbing problem; gate_broadcast/gate_action themselves work correctly.

REGIONS MOUNTED AND DROPPED
- 518f4d739fed "gfsf2" — insert_region on track 5a031370bf1c, model gemma4:e4b-it-q8_0, provider ollama. Idled, never given a turn. Dropped via kill_track at end of session — confirmed gone (cleanup2-final, tracks list back to just "gfsf").
- 5c84d83e0ea5 "sonnet2" — insert_region on track 5a031370bf1c, model sonnet, provider claude. Ran two turns (one abandoned to gate timeout, one completed with the write/read/rm gate test). Dropped via kill_track at end of session — confirmed gone.
- adc208eca7b0 "throwaway" — insert_region on track 5a031370bf1c, model gemma4:e4b-it-q8_0, provider ollama, mounted only to prove messenger's live roster-update path. Dropped via kill_track immediately after, inside the same messenger window (messenger-04-after-throwaway-drop.png confirms it's gone from the rail).
- Pre-existing region "gfsf" (32f1ec929f4a) on the same track was left untouched throughout — not mine to drop.

CONSOLE
- One pre-existing 404 (unrelated resource) on every page load, matches S1's receipt note — no new errors, no pageerrors, across all runs.

FIX LIST
- engine/ledger.py:374 — pending_as_records() calls tracks.list_regions(log_dir), passing environment.log_dir (a string path) where ade/tracks.py:1297's list_regions(environment) expects an environment object with .tracks_lock/.regions. This throws, and the exception appears to be swallowed silently server-side: the "feed" frame handler (ade/frames.py:771-776) calls ledger.ade_snapshot(), which calls pending_as_records() partway through — the whole snapshot aborts, so even the already-read log records never get returned. Net effect: no widget that depends on the "feed" frame (strip's popover, changes, queue_log, ledger) can show ANY records — pending or historical — even though log.jsonl and queue.json both hold real data. feed_dirty broadcasts fire correctly and repeatedly (seen in gatetest console) but are never followed by an actual "feed" reply. This blocks 8 of the 20 checklist lines above; none of them are S1's fix (msg.tracks/ade_init) at fault — that part is proven working everywhere it could be checked (strip chips, queue_log filter chips, changes trackNames, messenger roster all populate correctly from ade_init).
- strip.js kill button (✕) sends {type:"stop"}, not a real drop/kill of the region — worth Brandon confirming that's intended (label says "stop … the seat stays"), since the checklist line assumed ✕ = kill.

STRAY FILES
- Docs/Reports/phase3-test/s1-rerun/*.png, *-console*.txt — this run's screenshots and console dumps, 30 files.

READS
- Docs/Reports/RECEIPT-phase4-S1.md (full)
- Docs/tests/matrix_harness.py (full, 120 lines, copied as basis for driver scripts)
- Docs/HOWTO-frames.md:1-60 (client-to-server table)
- static/js/matrix/grid.js:185-225 (applyTemplate, instances)
- static/js/matrix/widget-frame.js:1-160 (send, deliver, setOption, mount)
- static/js/widgets/strip/strip.js (full read across several passes: chip build/paint, popover, onFrame, kill button)
- static/js/widgets/changes/changes.js:405-480 (render, mount, onFrame)
- static/js/widgets/queue-log/queue-log.js:1-410 (settle, feed, track chips)
- static/js/widgets/messenger/messenger.js:180-430 (roster, wp_send/wp_feed, onFrame)
- static/js/widgets/ledger/ledger.js:1-170, 460-530, 750-805 (state shape, chips, turn rows, mount)
- static/js/widgets/shared/feed-rows.js (full, settle/rowsForRegion/setRecords)
- static/js/matrix/socket.js:1-40 (onFrame raw listener used for the gate-watch driver)
- ade/frames.py:437-450 (_do_insert_region field mapping), :520-530 (_do_gate_action), :615-660 (stop/kill_track/delete_track/duplicate_region), :760-785 (feed/ledger_detail/wp_feed dispatch), :809-811 (gate_action dispatch)
- ade/tracks.py:1290-1330, 1385-1430 (get_track/list_regions/list_tracks/regions_of/remove_track/close_region signatures)
- engine/web_io.py (full, 150 lines — gate ask/post_gate/resolve_gate/_push_pending_locked)
- engine/ledger.py:369-420 (pending_as_records), :517-586 (snapshot, ade_snapshot, region_totals)
- library/registry/widgets.json (registry type strings)
- queue.json, archives/9883b6bec3df/log.jsonl (ground truth for gate/turn state, read twice, before and after the gate test)
- library/grids/9883b6bec3df/w-wq14ant3.json:1-30 (existing window layout, to confirm my applyTemplate calls land on a fresh window, not this one)

CLOSER REVIEW
- Confirm the feed-serving bug (engine/ledger.py:374) against S1's scope — it blocks real verification of 8 checklist lines across 4 widgets, but is not caused by S1's edits (S1 didn't touch engine/ledger.py) — Brandon or closer, scope call on whether a follow-up fix box is warranted.
- strip's ✕ = stop vs kill naming mismatch — Brandon, product call.
