SESSION REVIEW — Sandbox Suite — S2 — 2026-09-07 15:06-15:20 EDT

EDITS
- ade/frames.py:557-559 — F2, `if t == "roster": _roster(); return` added
  before the `create_track` branch in `handle()`.
- ade/frames.py:322 — F6, `root=msg.get("root")` (dropped `or rt.WORKSPACE_ROOT`).
- server.py:1768-1774 — F7, `msg = None` init before the inner try, and the
  frame-error log line now reads `[frame error — skipped: <type>: <e>]`,
  type pulled from `msg` when it parsed to a dict.
- static/js/widgets/strip/strip.js:314 — `frame.send({ type: "roster", inst: frame.id })`
  after subscribe.
- static/js/widgets/changes/changes.js:450 — same, after subscribe.
- static/js/widgets/messenger/messenger.js:407 — same, after subscribe.
- static/js/widgets/queue-log/queue-log.js:558 — same, after subscribe.
- static/js/widgets/ledger/ledger.js:783 — same, after subscribe.
- static/js/widgets/timeline/timeline.js:1310 — same, after subscribe.
- static/js/widgets/devagent/devagent.js:448 — same, after subscribe.
- static/js/widgets/arrange/arrange.js:587 — same, after subscribe.
- static/js/widgets/chat/chat.js:416 — same, after subscribe.
- static/js/widgets/terminal/terminal.js:311 — same, after subscribe.
- static/js/widgets/queue/queue.js:125 — same, after subscribe.
- static/js/widgets/mini-queue/mini-queue.js:101 — same, after subscribe.

HARNESS
- Driver: scratchpad-copy of Docs/tests/matrix_harness.py, extended with
  page.evaluate steps (mount call reused, frames captured via
  `MX.socket.onFrame`). Session 9883b6bec3df, one page, sequential cold
  mounts.
- Cold bind, timeline: first paint (`.th-name`) showed all five of the
  session's existing track lanes — test, JHJKHKL, jj, kljoiu, lkj; — with
  no region mounted by me. F2's roster send confirmed live.
- Cold bind, strip: a chip rendered for the session's existing region
  (32f1ec929f4a / gfsf) on cold mount.
- Cold bind, chat: region picker listed "gfsf" on cold mount.
- Console: one pre-existing 404 (favicon, shared-setup known list), no new
  errors across the three cold mounts.
- Add form (mount widget, mode "both"): filled track name "s2test", region
  name "s2region", root field left disabled/untouched (inherited), model
  defaulted to ollama/gemma4/e4b-it-q8_0. Clicked "+ track + region".
  Server created track 931fc1e3400e and region e8d87cf22e69, both with
  `root: "/Users/moth3rship/Desktop"` — pulled from `environment.root`
  (F6), not hardcoded. Timeline lane head for "s2test" showed
  "…/moth3rship/Desktop" (title: full path), matching.
- Caveat: this session's `environment.root` and the module-level
  `rt.WORKSPACE_ROOT` default both currently resolve to
  `/Users/moth3rship/Desktop`, so the lane-head text can't visually tell
  the old bug (always `rt.WORKSPACE_ROOT`) from the fix (falls back to
  `environment.root`) in this session — they coincide. Confirmed the code
  path directly instead: the create_track/insert_region frames I sent
  carried no `root` key, and the resulting track/region rows both came
  back with `root` populated from `environment.root`, matching F6's
  intent (see BLOCKERS).
- Dropped the test region with `kill_track` (region e8d87cf22e69) —
  confirmed via `track_removed` frame and a fresh track_list showing only
  "gfsf" as a region. `kill_track` only drops the region, not its track
  container, so the empty "s2test" track shell was left behind; sent
  `delete_track` for 931fc1e3400e to remove it too. Final track_list rows:
  test, JHJKHKL, jj, kljoiu, lkj; (regions: gfsf only) — matches the
  session's state before the harness ran.
- No harness for F7, per spec (nothing to visually confirm; next real
  frame error will carry its type).

STRAY FILES
- Docs/Reports/phase3-test/s2/ — s2-01 through s2-07 screenshots,
  s2-report.json, s2-cleanup-report.json, s2-console.txt (this box's
  harness output).
- library/grids/9883b6bec3df/w-05jq4yon.json, w-e567b2j8.json — throwaway
  grid windows from the two driver-script page loads (harness run,
  cleanup run). Same footprint pattern as prior boxes' driver runs.

GOALS DONE
- F2: server `roster` handler added; all twelve listed widgets send it on
  mount; cold bind confirmed live on timeline, strip, chat.
- F6: `create_track`/`insert_region` with no `root` key now resolve to
  `environment.root`, confirmed via the created track/region rows.
- F7: frame-error log line now includes the frame type.

BLOCKERS
- F6 harness caveat above: session root and `rt.WORKSPACE_ROOT` coincide
  in this session (both `/Users/moth3rship/Desktop`), so the lane-head
  text alone doesn't prove the fix over the old behavior — proof is the
  frame-level check (no `root` sent, row `root` came back from
  `environment.root`) documented above.

READS
- Docs/Specs/SPEC-phase4-fixes-sonnet.md:7-30, 77-133 (Shared setup,
  Server naming, S2)
- ade/frames.py:540-559 (handle, _roster/_init closures, roster branch)
- ade/frames.py:315-326 (_do_create_track, F6 root line)
- ade/tracks.py:1421-1436 (close_region), :1100-1110 (create_track root
  fallback, read earlier this session)
- server.py:1760-1777 (ws loop, F7 error line)
- static/js/widgets/{strip,changes,messenger,queue-log,ledger,timeline,
  devagent,arrange,chat,terminal,queue,mini-queue}/*.js — subscribe/mount
  regions, one file each
- static/js/widgets/shared/add-controls.js (full, 194 lines) — mode
  "both" form, root-field inherit/override behavior
- static/js/widgets/mount/mount.js (full, 32 lines)
- static/js/widgets/shared/model-picker.js:1-80 (default selection)
- static/js/matrix/socket.js:1-70 (send/onFrame)
- static/js/widgets/chat/chat.js:258-289, :330-340 (renderHead, picker)
- static/js/widgets/strip/strip.js:1-60 (buildChip)
- static/js/widgets/timeline/timeline.js:480-516 (rootLine, lane head)
- engine/read_tool.py:1-45 (WORKSPACE_ROOT default)
- Docs/Reports/RECEIPT-phase4-B1.md (full) — driver-script precedent
- Docs/Reports/RECEIPT-phase4-S1.md (full) — receipt shape
- Docs/tests/matrix_harness.py (full, basis for the driver script)
- archives/9883b6bec3df/master.json — session's workspace_root field

CLOSER REVIEW
- F6 visual proof is frame-level, not lane-head-text-level, because this
  session's root and the global workspace-root default coincide — worth
  flagging if a later box needs a session whose root actually differs, to
  get the visual confirmation too.
