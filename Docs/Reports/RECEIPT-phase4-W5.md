SESSION REVIEW — Sandbox Suite — W5 — 2026-09-07 (timestamps: grep transcript)

EDITS
- engine/web_io.py:22-24 — removed the `self.region` attribute (nothing else
  read it); `out()` body neutered to `pass` (was the raw member send).
- engine/web_io.py:157 — `meters()` body neutered to `pass`.
- engine/web_io.py:182 — `status()` body neutered to `pass`.
- ade/frames.py:610-619 (pre-edit numbering) — removed the `elif t ==
  "anchor":` client-frame branch; no widget sends it.
- ade/frames.py:272 — `_anchor` renamed to `_join_hub`.
- ade/frames.py:596, 608, 680 — the three remaining callers updated to
  `_join_hub`.
- static/js/widgets/chat/chat/chat.js:480-485 — removed the dead
  socket-level `out`/`status`/`meters` branches and their region guard;
  kept `speak`/`audio`. The mirror-kind branch (:469-478) is untouched and
  still carries the stream.
- static/js/widgets/chat/anchor-chat/anchor-chat.js: removed the dead
  `case 'out'`/`'status'`/`'meters'` switch branches (formerly :773-785);
  this file has no `speak`/`audio` cases to preserve.
- static/js/widgets/queue/gate-list/gate-list.js:293 — added
  `gate_broadcast` to the subscribe list.
- static/js/widgets/queue/gate-list/gate-list.js:339-350 — added
  `case 'gate_broadcast':`, filtered on `g.region`, mirroring mini-queue.js's
  smaller handler (push/update on non-resolved `kind`, settle on
  `kind: 'resolved'`).

ITEM 1 — what rides hub membership besides out/status/meters, and stays
- `ask` (`TrackHub.ask` → `_send`), `gate_pending` (per-`WebIO` push, not
  hub-fanned), `term`, `speak` (`audio` is a branch inside `speak`), plus
  `on_write`, `turn_start`, and `event` — all still fanned by
  `TrackHub._fanout` (ade/tracks.py:233-265), unedited.
- No edit was needed in ade/tracks.py: `TrackHub.out/meters/status` still
  call `_fanout`, which still reaches both `_members` and `_mirrors`;
  neutering the three methods on `engine/web_io.py`'s `WebIO` (the
  `_members` side) is sufficient because `MirrorView` (the `_mirrors` side,
  ade/tracks.py:147-189) is a separate class, untouched, and still sends
  the wrapped `mirror` frame.

HARNESS
- Driver: scratchpad w5_headed_proof.py, headed, session 9883b6bec3df.
- Created w5sonnet (claude/sonnet, region 961489cf889e) and w5gemma
  (ollama/gemma4:e4b-it-q8_0, region cdd672570cd6) via raw `create_track`
  frames (`MX.socket.send`, no applyTemplate).
- Mounted two `chat` instances via `MX.grid.addWidget`, bound one per
  region, one turn each from each widget's own send box
  ("banana-w5-marker" / "coconut-w5-marker"). Sonnet reached idle; gemma
  (local ollama) was still mid-turn when the 90s wait timed out — not a
  defect, just slower local inference; screenshot w5-01-two-chats.png.
- Isolation: neither chat's transcript contains the other's marker text
  (`no_bleed=True`).
- Frame-log check across the whole run: `raw_out_status_meters_frames=0`,
  `mirror_out_status_meters_frames=189` — the raw duplicate is gone, mirror
  carries the stream, matching Brandon's decision.
- Mounted `gate_list`, bound to the sonnet region. Sent a turn instructing
  a `run_command` write. A live parked row ("run $ echo hello-w5 >
  /tmp/w5gate...", ASK badge) drew inside 30s (w5-02-gate-list.png) —
  this is item 6: gate-list only received a `gate_broadcast` frame for
  this park (no `ask`/`gate_pending` fired on this path, same as W4's
  finding), and the new case is what put the row on screen. Clicked the
  row's own `approve` button; it settled to ANSWERED (w5-03-gate-settled.png,
  `settled_from_button=True`).
- Mounted `terminal`, selected the sonnet region, "New Tab", typed
  `echo w5-term-check` into the real PTY — output landed
  (w5-04-terminal.png, `terminal_output_landed=True`).
- Cleanup: `removeWidget` on all four mounted instances, `kill_track` on
  both regions, `delete_track` on both tracks. Reconnected headless after
  and requested `roster`: live `track_list` is `["untitled"]` only — both
  w5 tracks gone from the live list (they still appear in the historical
  closed-names map, same as every prior box's cleaned-up tracks, e.g.
  w4sonnet, w2claude — expected, not a leak). `untitled` untouched.
- Console: one pre-existing 404 (shared-setup list), no new console or
  page errors.
- Evidence: scratchpad/w5-01..04-*.png, w5-console.txt.

CHOOSER (curl /api/fs/pick, lsappinfo, cancel)
- Fired `curl http://127.0.0.1:5000/api/fs/pick` in the background, then
  `screencapture -x` while the call was pending: no dialog visible
  anywhere on screen (w5-fspick-screenshot.png) — desktop/Firefox only.
- `lsappinfo front` / `lsappinfo list`: Finder's ASN does show "(in front)"
  (the `activate` line does what it says), but the actual `choose file`
  panel is owned by a separate process group, "Open and Save Panel Service
  (osascript)" — a subordinate of the `osascript` process, not of Finder —
  so activating Finder does not bring the panel forward. Same failure
  shape W4 found post-restart; server.py's chooser route (W1's file) is
  unchanged by this box and was not edited here.
- FAILED (comes forward). Cancelled by killing the orphaned `osascript`
  pid (32101); curl then returned `{"path":null}` — SEEN (cancel-returns-null
  holds).

STRAY FILES
- Docs/Reports/phase3-test/ — no new folder made by this box; screenshots
  and console dump live in scratchpad (see HARNESS) per the coordinator's
  own driver location, not moved into the project.
- library/grids/9883b6bec3df/ — no new grid-window files expected (widgets
  were removed at cleanup); not separately checked beyond the roster
  verification above.
- Driver script and screenshots stayed in the session scratchpad, not
  under the project: w5_headed_proof.py, w5-*.png, w5-console.txt,
  w5-fspick-*.{json,png}.

GOALS DONE
- Raw member fan-out for out/status/meters deleted; mirror confirmed as
  the sole carrier (0 raw frames observed, 189 mirror frames observed).
- `anchor` client frame removed; `_anchor` renamed `_join_hub`, all three
  callers updated; `_detach` untouched (still used by disconnect,
  kill_track, delete_track, ade_load, ade_new, end session).
- Dead client-side out/status/meters branches removed from chat.js and
  anchor-chat.js; speak/audio kept where present.
- gate-list.js's missing `gate_broadcast` case (W4's item 14 finding)
  fixed and driven live: a parked write gate drew inside 30s and settled
  from the widget's own button.
- Every read logged, every edit through the Edit tool, syntax checked
  (ast.parse on both Python files, node --check on all three JS files).

WHAT STILL REFERENCES THE OLD ANCHOR WORD
- Nothing. `grep -rn "_anchor\b\|'anchor'\|\"anchor\""` across ade/,
  engine/, server.py, and static/js/ returns no hits outside the unrelated
  `anchor-chat`/`anchor_chat` widget name (a different word, the widget's
  own name, not the removed frame/function). `ctx.anchored` (the
  attribute tracking which track a socket is bound to) stays — a
  different word, not touched by this box's scope.

BLOCKERS
- None on the five W5 items or item 6.
- Chooser-forward (curl/lsappinfo) is still broken post-restart, same
  shape W4 found; the fix is in server.py, outside this box's files —
  flagging for the closer/Brandon, not fixed here.
- Gemma's proof turn did not reach idle inside the 90s window this driver
  used (local ollama inference, not a code defect) — isolation and
  no-doubling were both still confirmed from the frames that did arrive.

READS
- Docs/Specs/SPEC-phase4-fixes-D.md:1-166 (Shared setup, W5)
- Docs/Reports/RECEIPT-phase4-W2.md:68-120 (WHAT STILL REFERENCES, BLOCKERS,
  READS)
- Docs/Reports/RECEIPT-phase4-W4.md:1-30, 80-209 (item 14 gate_broadcast
  diagnosis, region/track ids, fix list)
- Docs/Reports/RECEIPT-phase4-F-B.md (shape reference)
- static/js/widgets/agent/strip/strip.js:300-368
- static/js/widgets/queue/mini-queue/mini-queue.js:85-155
- static/js/widgets/queue/gate-list/gate-list.js:1-357 (full)
- engine/web_io.py:1-225 (full)
- ade/frames.py:100-140, 260-330, 561-700 (grep + read around each edit)
- ade/tracks.py:84-300, 1098-1116 (TrackHub, MirrorView, create_track)
- ade/web_io.py:1-56, 200-225 (`_region_row`, `send_gate_broadcast`)
- server.py:175-207 (`_gate_notifier`, `broadcast_gate`), 1545-1571
  (`/api/fs/pick`)
- static/js/widgets/chat/chat/chat.js:460-505
- static/js/widgets/chat/anchor-chat/anchor-chat.js:730-804
- static/js/widgets/usertools/terminal/terminal.js:1-200
- static/js/widgets/agent/mount/mount.js (full)
- static/js/matrix/socket.js (full), widget-frame.js:90-110, grid.js:140-303
- library/registry/widgets.json

CLOSER REVIEW
- Chooser-forward defect (W1's server.py) is still open across two boxes'
  proof runs now (W4, W5) — worth a direct fix pass rather than a third
  re-proof. Brandon's/closer's call.
- Item 7 note from F-B receipt (command missing on the direct-answer gate
  branch) is unrelated to this box, not re-checked here.
