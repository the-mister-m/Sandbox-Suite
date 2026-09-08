SESSION REVIEW — Sandbox Suite — W2 — 2026-09-07 (run timestamps from log.jsonl, gate row 19:13:58)

EDITS
- engine/web_io.py:24 — `WebIO.region`, the region this socket streams as a hub
  member, "" until set.
- engine/web_io.py:26-29, :161-163, :187-189 — `out`, `meters` and `status`
  frames carry `region`.
- ade/frames.py:842-846 — new client frame `chat_history` inside `handle()`,
  next to `transcript`; replies `send_chat_history(track.id,
  _track_gatelog(track.id))`. Unknown or closed region: no reply.
- static/js/widgets/chat/chat/chat.js:483-485 — raw `out`, `status`, `meters`
  dropped unless the frame's `region` equals the bound one; `speak` and `audio`
  keep the old lenient guard.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:1-10 — header comment:
  switcher, follow/unfollow, no anchor.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:393-397 — `.cp-head`,
  `.cp-pick`, `.cp-live` styles.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:481-499 — `_bind` sends
  `unfollow` for the region it leaves, `follow` and `transcript` for the new
  one. The `anchor` send is gone from the file.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:500-521 — `_renderHead`,
  region select fed by `MX.gates.regionRows`, live pill.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:530-539, :615 — head row
  with the select, above the script.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:700-709 — Stop adds
  `cp-stop-fired` and disables the button.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:711-716 — subscribe adds
  ade_init, track_list, transcript, mirror, track_removed; roster asked on mount.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:719-724 — unmount sends
  `unfollow`.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:737-746 — a dim `out`
  clears the fired state.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:748-763 — roster frames fill
  the select, first region auto-binds when none is set; `mirror` frames drive the
  live stream, filtered on `msg.track`.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:767-800 — raw out, status,
  meters filtered on region; transcript, track_removed, region_replaced rebind.
- static/js/widgets/queue/gate-list/gate-list.js:224-228 — `_askHistory` sends
  the `chat_history` frame.
- static/js/widgets/queue/gate-list/gate-list.js:295, :309, :349 — asked on
  mount, on region change, on region_replaced.

HARNESS
- Drivers in session scratchpad: w2_proof.py, w2_hist.py, w2_gate.py. Headed,
  Chrome, session 9883b6bec3df, MX.grid.addWidget only.
- Run 1 — track 952b8011cf10 "w2track", region 7bc404eeb8ab "w2claude"
  (claude/sonnet). anchor_chat mounted, region picked from its new select.
  Select options read back: "— region —", 07ef4d527e34 untitled, 7bc404eeb8ab
  w2claude. After the pick: bound and following 7bc404eeb8ab, pill "live",
  1 `transcript` frame and 1 mirror transcript for that id, 0 `anchor` frames,
  1 `follow`. One turn sent from the widget's Send button, stream ran (mirror
  out frames), Stop clicked: `cp-stop-fired` present on the button, out frames
  10 at the click and 12 at +6s. Screens 10-region-picked, 20-streaming,
  30-stop-fired, 31-after-stop.
- Run 2 — gate_list bound to 38b6279c67cc, a region closed by an earlier box
  that still has ledger actions: no `chat_history` reply at all, because
  `tracks.get_region` returns None. The frame does not serve dead regions.
- Run 3 — track b5a89087251a "w2gate", region a698513dcddd "w2g1"
  (claude/sonnet). anchor_chat picked the region, gate_list bound to the same
  one, turn asked for a write. `chat_history` sent 2 times, 0 `anchor` frames
  the whole run; the reply after the write carried 2 records and the widget drew
  the row "19:13:58 write_file w2proof.txt". History reaches gate-list with no
  anchor anywhere — SEEN, 92-history-rows.png.
- Cleanup: both widgets removed, both regions ended with kill_track, both tracks
  deleted. Final roster in each run: 07ef4d527e34 "untitled" only, the
  pre-existing region.

WHAT STILL REFERENCES _anchor AND _detach
- ade/frames.py:272 `_anchor` def, called at :596 (create_track), :608
  (insert_region), :619 (the `anchor` client frame, which no widget now sends),
  :691 (duplicate_region).
- ade/frames.py:283 `_detach` def, called at :273 (inside `_anchor`), :321
  (disconnect), :656 (kill_track), :670 (delete_track), :774 (ade_load), :791
  (ade_new), :800 (end session).
- So creating a track or region still makes that socket a hub member and still
  detaches whatever it was on. With `WebIO.region` never assigned, that member
  path now sends `region: ""` and both chat and anchor-chat drop it — which is
  the D3 doubling fix. No widget in static/js sends the `anchor` frame any more.

BLOCKERS
- Item 1 cannot fully land from engine/web_io.py alone. The region lives on
  `TrackHub` (ade/tracks.py:193 `region_id`) and `_fanout` passes it only for
  `term` (:248-249). Nothing assigns `WebIO.region`, so member-path out, status
  and meters carry "". For that path to show, `TrackHub.add` or `_anchor` has to
  set it — ade/tracks.py is W1's file, so I left it. Brandon's call.
- The write gate never appeared in gate-list's live path: no `.cq-settle`
  buttons in 180s, the write stayed parked (log.jsonl tail: kind `queue`,
  outcome None) and w2proof.txt was never written. The history path drew the
  same gate fine. That is B4's settle defect area, not one of my five items.
- gate-list does not filter `chat_history` on `msg.id`, so two gate-lists on one
  socket bound to different regions would each take the other's reply. Not in
  the five items; left alone.

STRAY FILES
- Docs/Reports/phase3-test/w2/ — 11 screenshots plus console.txt, console-hist.txt,
  console-gate.txt, log.txt. This box's evidence.
- library/grids/9883b6bec3df/ — throwaway window files from the three runs.
- Drivers stayed in the session scratchpad, not under the project.

GOALS DONE
- anchor-chat is a region switcher on follow/mirror, no anchor frame.
- chat and anchor-chat drop out, status and meters that are not their region's.
- gate-list gets its history from a client `chat_history` frame.
- Every read logged, every edit through the Edit tool, syntax checked
  (ast.parse on both python files, node --check on all three js files).

READS
- Docs/Specs/SPEC-phase4-fixes-D.md:1-118
- Docs/Reports/RECEIPT-phase4-B4.md:84-124, RECEIPT-phase4-D3.md:26-61,
  RECEIPT-phase4-F-B.md:1-30
- Docs/HOWTO-frames.md (client and server tables, grep)
- engine/web_io.py:1-40, :155-186
- ade/frames.py:265-330, :826-850, structure grep
- ade/tracks.py:140-300, :1610-1645
- ade/web_io.py:101-132
- server.py:385-405
- static/js/widgets/chat/chat/chat.js:216-345, :400-504
- static/js/widgets/chat/anchor-chat/anchor-chat.js:1-12, :384-470, :466-699
- static/js/widgets/queue/gate-list/gate-list.js:260-348
- static/js/widgets/shared/gate-common.js:60-108
- static/js/widgets/shared/add-controls.js:105-160
- static/js/matrix/grid.js:145-200, socket.js:1-60, widget-frame.js:98-155
- static/js/widgets/adetools/timeline/timeline.js:388-405
- Docs/tests/matrix_harness.py (full), policy.json head, log.jsonl tail

CLOSER REVIEW
- Rule conflict, raised at the start and unresolved: the bypass-mode notice told
  me to read and edit through Bash; Brandon's rules say Read/Edit so the edits
  show. I followed Brandon's rules. — Brandon
- `WebIO.region` has no writer. Decide whether TrackHub sets it or the member
  path stays dark. — Brandon
- Live gate rows never drew in gate-list during a real write gate. — closer, to
  hand to W4's retest.
