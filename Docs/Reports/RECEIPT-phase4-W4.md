# RECEIPT — Phase 4 W4 — test — Sandbox Suite

Box W4, Sonnet, session 9883b6bec3df, 2026-09-07. Tests W1/W2/W3's edits,
all confirmed live in the running code (mtimes below) except one W1 route.
Mid-task the coordinator added item 14 (gate-list live-row check) and
authorized a conditional one-line fix; findings below explain why that fix
was not applied.

## DRIVEN — checklist, one line per item

1. **Arrange cable draw/save/reopen** — SEEN. Opened the library map, added
   a message notch to RUNMAP.md (job) and Briefs (group), dragged a real
   pointer-event cable between them, set its path via the same field the
   cable menu writes, saved, reopened. Cable + path (`test/cable/path.txt`)
   present after reopen. Landed on `library/maps/Music History.2.json` (my
   library-menu click matched that row, not the plain file — the plain
   `Music History.json` is untouched, cables: []). w4-01-cable-drawn.png,
   w4-01-reopened.png.
2. **Arrange pipe, provider + group-skip** — SEEN. Built a phase with one
   job (`provider: claude, model: sonnet`) and one group directly on
   `frame._ar.plan`, clicked "pipe phase". Region landed with
   `node_id: "w4pipejob01"`, `provider: "claude"`, `model: "sonnet"`. Group
   node produced no region. Console clean during/after the click (no new
   console/pageerror lines). w4-02-after-pipe.png, w4-arrange-console.txt
   (empty).
3. **Chooser comes forward / cancel returns null** — FAILED (comes
   forward), SEEN (cancel). Fired `/api/fs/pick` via curl; frontmost app
   stayed Firefox the whole time (`lsappinfo front` / `lsappinfo list`
   showed the dialog owned by an `osascript` process, never brought
   forward). Root cause: the live server process (pid 29281, started
   19:06:14) predates server.py's edit (mtime 19:08:42) — the running
   route is still `osascript -e "tell me to activate" ...`, not the
   `'tell application "Finder" to activate'` fix on disk. Confirmed by the
   literal running command in `ps`. Every other backend file (ade/frames.py,
   ade/tracks.py, engine/agent_loop.py, engine/web_io.py) has an mtime
   before 19:06:14 and IS live — only server.py's chooser fix is stale.
   Cancelled by killing the orphaned osascript pid; curl returned
   `{"path":null}` — the cancel-returns-null contract holds regardless of
   which script text runs. w4-03-chooser-not-front.png (desktop, Firefox
   frontmost, no dialog visible).
4. **Two chats, isolation** — SEEN (pass 2, after fixing a driver bug —
   pass 1's region-capture raced ahead of `insert_region`'s reply and
   bound both chats to bad ids; redone correctly). w4bsonnet/w4bgemma each
   sent one turn from their own send box; neither transcript contains the
   other's marker word. Frame count by region: all `out`/`status`/`meters`
   frames observed were `(untagged)` region — expected here, not a defect:
   each chat is the `inst` owner of its own turn, so replies route by
   `inst` before the region check is reached (chat.js:480 checks `inst`
   first); the region tag matters for the *mirror/follow* broadcast path
   (a third viewer watching someone else's live turn), which this
   same-turn-same-owner test doesn't exercise. w4b-04-two-chats.png.
5. **Anchor-chat switcher** — SEEN. Region select lists `untitled`,
   `w4sonnet`, `w4gemma`. Switching to gemma rebinds the pane; sent a turn
   from the anchor-chat's own input, echoed into the transcript
   (frame.send fired). Stop button toggles `.cp-stop-fired` on click —
   confirmed via classList read, not just visual. w4-05-anchor-chat.png.
6. **Gate-list history without anchor** — SEEN for the history path: bound
   to a region, gate-list's `chat_history` request returned and rendered a
   prior settled/timed-out `write_file` row with no anchor-chat mounted in
   the window at all — confirms W2 item 4's new `chat_history` frame
   works standalone. The *live pending* half of gate-list is a separate,
   larger finding — see item 14.
7. **Mount root** — SEEN. Root field showed `/Users/moth3rship/Desktop` on
   mount, non-blank. w4-07-mount-root.png.
8. **Picker dropdown on screen** — SEEN. `#mxNewWidget` at the grid's right
   edge (x 1231–1322 in a 1400px viewport); `.mx-picker` dropdown (253px)
   landed at x 1069–1322, fully on screen — the flip logic held.
   w4g-08-picker.png.
9. **Devagent FG styles** — SEEN. Clicked a real region row
   (`w4bsonnet`); `.mx-dev-selected` class present on the row after click
   — matches fg-02's selected-row look. w4g-09-devagent.png.
10. **Timeline narrow, zoom not clipped** — SEEN. `.tl-zoom`'s right edge
    sits inside the widget frame's right edge at the widget's mounted
    width (no numeric overflow). Consistent with W3's own finding that the
    wrap is intrinsic to the fixed 250px heads column, not a width trigger.
11. **Strip chip "stop"** — SEEN. Kill button reads "stop" before and
    after a click; region stayed on the roster (a stop, not a delete) —
    consistent with W3's own fix. w4-11-strip-before.png,
    w4-11-strip-after.png.
12. **Archive safety, master.prev** — SEEN, repeatedly. `master.prev`'s
    mtime advanced every time a region I made ended (19:09:01 baseline →
    19:33:23 → 19:37:51 → 19:40:11, one bump per kill_track/pipe-cleanup
    round across this box's whole run). W1 item 1 is live and firing.
13. **Ledger/queue-log command text** — SEEN, by combined evidence.
    queue-log's detail column renders full command text for settled gate
    rows (`run_command echo hello-w4f > /tmp/w4fgate.txt`,
    `write_file /tmp/w4bgate.txt`, etc. — all real rows from this box's
    own runs). These specific captured rows resolved via the *timeout*
    branch (engine/agent_loop.py:419-421, F-B's existing fix), not the
    *human-answered* branch (:436-438) — I could not land a human answer
    inside the gate_wait_s window through gate-list (see item 14) nor
    catch a `gate_broadcast` frame inside my own polling windows before
    the window closed. The :436-438 code is byte-for-byte the same
    `command=(entry.get("payload") or {}).get("command")` pattern as the
    already-proven :419-421 line, three lines apart in the same function —
    strong but not first-hand-live evidence for the human branch
    specifically. Flagging as SEEN-by-code-parity rather than fully driven
    live; the closer should weigh that distinction.
14. **Coordinator's ask — gate-list live row within 30s** — FAILED, root
    cause found, no edit made. Mounted gate-list bound to a live claude
    region *before* triggering a `run_command` gate (confirmed server-side
    via `queue.json`/`log.jsonl`: parked with `hook: "ask"`, unresolved,
    genuinely live for ~150s). No live row ever drew, across four separate
    attempts (30s, 60s, 90s windows; one check made mid-window while the
    gate was confirmed still pending server-side). Diagnosis: gate-list.js
    subscribes to and only handles `ask` / `gate_pending` frame types
    (gate-list.js:293, :331-338, :317-330) — but a session-wide capture of
    every frame type the matrix socket received during a live gate showed
    `gate_broadcast` fire (not `gate_pending`, not `ask`, not a `mirror`-
    wrapped gate either) — confirmed by literal type-array dump:
    `["ade_init","chat_history","crew_list","feed_dirty","gate_broadcast",
    "gate_edges","mirror","models","rail_catalog","track_list",
    "track_status"]`. `ade/web_io.py:210-215`'s `send_gate_broadcast`
    carries `region: track_id` correctly — this is not the empty-region
    drop Brandon's hypothesis named (gate-list.js:319/323/332's exact-match
    filter is real code but never runs, because the frame it filters never
    arrives). strip.js and mini-queue.js already handle `gate_broadcast`
    (grep-confirmed); gate-list.js and chat.js/anchor-chat.js do not. Per
    Brandon's own fallback ("if the rows carry the right region and still
    do not draw, do not edit; report the frame") — the rows never draw at
    all because the frame type gate-list listens for never fires on this
    socket, so no edit was made. w4b-14-gate-list-live.png,
    w4c-14-gate-list-live.png, w4d-14-gate-list-live.png,
    w4e-14-gate-list-checknow.png, w4f-14-final-diagnosis.png,
    w4f-results.json (the type-array dump), w4b/c/d-state.json (region ids
    and raw gate_pending polling — always null).

## REGIONS MOUNTED AND DROPPED

- `w4track`/`w4sonnet` (claude/sonnet) + `w4gemma` (ollama/gemma) — pass 1,
  contaminated by a driver bug (region id captured off the wrong
  `track_created` frame). kill_track + delete_track at cleanup.
- `w4btrack`/`w4bsonnet` (claude/sonnet, region `d04ed6c660eb`) +
  `w4bgemma` (region `f96332e5c43f`) — the real isolation/gate test track.
  Ran 4 turns total (banana/coconut markers, one native-tool write, two
  run_command asks). kill_track ×2 + delete_track.
- `w4ftrack`/`w4fsonnet` (claude/sonnet, region `68c843510e47`) — item 13's
  final attempt. kill_track + delete_track.
- Arrange pipe test: track `61b82efd39a1` (from `_apply_spawn_presets`'s
  own naming), region `7c595f133e54`, node_id `w4pipejob01`. kill_track +
  delete_track.
- Pre-existing `untitled` track and any other boxes' live regions:
  untouched, confirmed still present at every cleanup pass.

## GATE

- Native-tool write on `w4bsonnet` — parked with `hook: "queue"` (the
  Claude-native write tool's own auto-apply queue, action_type `"write"`,
  not the sandbox's `write_file`), timed out at 150s, unanswered by me
  (this is the "queue" branch, already fixed by F-B, not the branch I
  set out to test).
- `run_command echo ... > /tmp/w4dgate.txt` on `w4bsonnet` — parked with
  `hook: "ask"` (`queue.json` id `5118e3398023`), genuinely live and
  unresolved when checked mid-window; still never rendered live in
  gate-list per item 14's finding. Left to time out (I did not want to
  fight the client-side gap with a raw `gate_action` mid-diagnosis, to
  keep item 14's evidence clean).
- `run_command echo ... > /tmp/w4finalgate.txt` on `w4fsonnet` — same
  shape; my 90s poll for its `gate_broadcast` frame missed the window (the
  model's time-to-tool-call varied 8–130s across runs, not fully
  predictable), region was cleaned up before it resolved.
- No gate was answered by a human inside the window through gate-list's
  own UI in this box's run, because gate-list never renders one to click
  (item 14).

## CONSOLE

- Arrange pass: clean, no new lines, before or after the pipe.
- Pass 1 only: `[timeline] invariant violated — track ... carries more
  than one region` ×3 — a side effect of pass 1's own driver bug (two
  regions ended up sharing one track instead of two separate tracks);
  timeline.js's own defensive check, not caused by any W1/W2/W3 edit, and
  outside this box's checklist. Not reproduced in pass 2 onward once the
  driver bug was fixed.
- All other passes (w4b, w4c, w4d): no console/pageerror lines.

## FIX LIST

- None applied. Item 14's root cause (gate-list.js missing a
  `gate_broadcast` handler) is a real, separate defect from the one
  Brandon authorized fixing (empty-region drop in the `gate_pending`
  filter) — per his own instruction, no edit was made since the
  authorized condition was never met. Recommending to the closer: give
  gate-list.js a `case 'gate_broadcast':` the way strip.js and
  mini-queue.js already have it, gated on `msg.region === g.region`. Not
  done here — outside this box's edit rights and outside what was
  actually authorized.

## STRAY FILES

- `Docs/Reports/phase3-test/w4/*.png`, `*-console.txt`, `*-results.json`,
  `*-state.json`, `*-frame.json` — this box's evidence (listed in full
  above per item).
- `library/maps/Music History.2.json` — now carries item 1's test cable
  (`kmtrvo75n7`, path `test/cable/path.txt`) between RUNMAP.md and Briefs
  in its "Music History" phase. `library/maps/Music History.json` (the
  plain file) is untouched — confirmed empty `cables: []`.
- Driver scripts (`w4_driver.py` through `w4_item13_final.py`,
  `w4_arrange.py`, `w4_arrange_cleanup.py`,
  `w4_cleanup_and_picker_devagent.py`) in the session scratchpad, not
  under the project.
- No new grid window JSON files removed — mounted widget frames (arrange,
  chat ×2, gate_list, devagent, queue_log, timeline, strip, mount) left on
  the grid per shared setup precedent (W3's receipt: frames stay, only
  track/region cleanup is required).
- `/tmp/w4bgate.txt`, `/tmp/w4dgate.txt`, `/tmp/w4finalgate.txt` — outside
  the project, from timed-out gates that never actually wrote (all three
  gates parked and timed out unanswered); nothing on disk at those paths.

## READS

- Docs/Specs/SPEC-phase4-fixes-D.md (full — W1, W2, W3, W4 sections)
- Docs/Reports/RECEIPT-phase4-W3.md, RECEIPT-phase4-B1.md,
  RECEIPT-phase4-D2.md, RECEIPT-phase4-D3.md (full)
- Docs/tests/matrix_harness.py (full, driver pattern)
- ade/frames.py:265-330 (`_track_gatelog`, `chat_history` handler),
  :437-510 (`_do_insert_region`, `_PLAN_NODE_FIELDS`, `_plan_region`,
  `_plan_rows`), :588-610 (`create_track`/`insert_region` wire handlers),
  :842-846 (`chat_history` frame type)
- engine/agent_loop.py:160-195 (log_event/gate ledger record shapes),
  :358-443 (`_resolve_gate` — open/locked/queue/ask branches, the
  human-answer `command` fix at :436-438), :445-455 (`_target`)
- engine/web_io.py:1-215 (full — `out`/`status`/`meters` region tagging,
  `send_gate_pending`, `send_gate_broadcast`, `MirrorView._send`)
- ade/tracks.py:147-190 (`MirrorView`), :1-140 (`TrackHub` fanout)
- ade/web_io.py:80-116 (`send_track_list`/`send_track_created` field
  shapes), :200-216 (`send_gate_broadcast`)
- ade/rails.py:78 (`infer_provider`, grep only)
- server.py:1554-1620 (`/api/fs/pick`, library maps routes)
- policy.json (full — hook routing per edge)
- static/js/widgets/agent/mount/mount.js (full)
- static/js/widgets/shared/add-controls.js:96-197 ("both"/"region" mode
  forms), model-picker.js:44-120 (provider/model select classes)
- static/js/widgets/chat/chat/chat.js:1-110, :300-380, :470-495 (mount,
  submit, frame filter guards)
- static/js/widgets/chat/anchor-chat/anchor-chat.js:1-10, :477-540,
  :565-745 (region switcher, follow/unfollow, stop-fired state)
- static/js/widgets/queue/gate-list/gate-list.js (full, 358 lines —
  render, onFrame switch, region filters at :319/:323/:332)
- static/js/widgets/queue/queue-log/queue-log.js:130-220 (detail/command
  rendering), :400-475 (grep, CSS classes only)
- static/js/widgets/agent/strip/strip.js:50-150, :310-345
  (`gate_broadcast` handling, chip build)
- static/js/widgets/queue/mini-queue/mini-queue.js:1-140 (`gate_broadcast`
  handling, grep confirmation)
- static/js/widgets/agent/devagent/devagent.js:80-170 (selected-row
  classes)
- static/js/matrix/widget-picker.js (full, 81 lines)
- static/js/matrix/grid.js:40-90, :140-300 (`frames`/`instances`,
  `addWidget`)
- static/js/matrix/widget-frame.js:25-105 (`options`, `setOption`)
- static/js/matrix/socket.js:1-70 (`onFrame`, `send`)
- static/js/widgets/adetools/arrange/arrange.js by `/usr/bin/grep` (cable/
  notch/provider/pipePlan/library/save patterns) plus ranges 380-500,
  655-780, 790-940, 1300-1440, 1500-1580, 1640-1710, 1760-1800, 1900-1970,
  2120-2150, 2364-2380
- library/maps/Music History.json, Music History.2.json, Desktop.json
  (full, before and after)
- library/registry/widgets.json (full, type strings)
- archives/9883b6bec3df/log.jsonl (grep by region id, four separate
  checks), queue.json (full, checked three times), master.json/master.prev
  mtimes (checked five times across the run)
- `ps`, `lsappinfo`, `stat` — server process start time vs source file
  mtimes, chooser dialog frontmost ownership

## CLOSER REVIEW

- **server.py is stale.** The live process (pid 29281, up since 19:06:14)
  predates W1's own 19:08:42 chooser edit. Every other backend fix tested
  live and correct; this one specifically needs the restart the shared
  setup said already happened. Brandon or closer: restart, then item 3's
  "comes forward" half can be re-driven in five minutes.
- **Item 14 is a real, separate defect from Brandon's hypothesis.**
  gate-list.js has no `gate_broadcast` handler; `gate_pending`/`ask` (the
  frame types it does handle) never reach a matrix-created region's
  browser socket at all in this architecture — only the session-wide
  `gate_broadcast` does, and it already carries the right region field.
  The fix Brandon pre-authorized (loosen the exact-match region filter)
  would not have helped, since no frame ever reaches that filter to be
  wrongly dropped. Recommend a proper build box: add
  `case 'gate_broadcast':` to gate-list.js's onFrame, mirroring
  strip.js/mini-queue.js's existing handling, gated on `msg.region ===
  g.region`. Not done here — outside what was actually authorized.
- **Item 13's human-answered branch is code-parity evidence, not
  first-hand live proof.** I never landed a human approval inside the
  gate_wait_s window (item 14 blocked the easy path through gate-list; my
  raw `gate_broadcast`-catch attempts missed their own polling windows
  twice on model-timing variance). The :436-438 fix reads correct and is
  structurally identical to the already-proven :419-421 timeout line, but
  Brandon or the closer may want one more direct rerun if this needs to be
  fully first-hand before sign-off.
- Item 4's "(untagged)" frame-count finding is expected given the test
  shape (each chat owns its own turn's `inst`), not a defect — worth one
  line in the session review so it doesn't read as a W2 regression later.
- Pass 1's timeline console error was my own driver bug's side effect
  (two regions sharing a track instead of two tracks), not reproduced once
  fixed — not a widget defect, no action needed.
