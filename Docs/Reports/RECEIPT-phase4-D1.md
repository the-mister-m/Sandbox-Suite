SESSION REVIEW — Sandbox Suite — D1 — 2026-09-07 17:28-17:39 EDT

mini_queue then mount, tested in sequence on session 9883b6bec3df,
track 5a031370bf1c. Receipt for mini-queue written before mount started.

DRIVEN

mini_queue — Docs/Reports/phase3-test/SPEC-test-mini_queue.md
- pending rows only: SEEN — d1/mq-03-pending-0.png through -3.png, one
  row at a time, prior row gone before the next arrived.
- settle drops the row: SEEN — d1/mq-settle-log.txt, four approve clicks
  from mini-queue's own button (write_file, read_file, run_command,
  send_message), d1/mq-04-after-settles.png shows "no gate is waiting
  on you".
- refresh refills: SEEN only as an empty-state no-op — see BLOCKERS.

mount — Docs/Reports/phase3-test/SPEC-test-mount.md
- track plus region mount in one click with the inherited root: SEEN,
  with a real bug — the root field never shows the session root (see
  FIX LIST); the server-side inheritance itself still worked.
- region appears in timeline and devagent without a remount: SEEN —
  d1/mount-03-check-timeline-devagent.png, DOM markers tagged before the
  click were still present after, confirming neither widget was
  replaced.
- TARGET ITEM 6: mount still earns its slot — it is the only widget
  that produces a running track+region pair, provider and model chosen
  inline, in one click. Timeline's new "+ track" makes a bare track;
  devagent's region form needs a track to exist first.

REGIONS AND TRACKS MOUNTED AND DROPPED
- c5540782cd1c "d1mq" — insert_region on the shared track 5a031370bf1c,
  claude/sonnet, root inherited (session root, no root sent). Ran the
  full write/read/rm gate cycle on d1test.txt, all four gates (write,
  read, rm, the agent's own reply) settled from mini-queue's own approve
  button. File confirmed absent afterward. Dropped via kill_track
  (region only — 5a031370bf1c and gfsf were left alone).
- 6e48991f9172 "d1mount" / 786413b30ae8 "d1mountr" — a brand-new track
  mount's one button creates on its own (mode "both" never targets an
  existing track); ollama/gemma4:e4b-it-q8_0, the model picker's own
  default, root inherited to the session root server-side. Dropped via
  kill_track (region) then delete_track (the new track).
- Pre-existing region gfsf (32f1ec929f4a) on track a104ecc9ea23 left
  untouched throughout. Live roster confirmed clean at close: gfsf only.

GATE
- mini_queue run: write d1test.txt (6 chars "hello"), read_file (6 chars
  back), run_command `rm d1test.txt` (exit 0), send_message (agent's own
  confirmation) — all four approved via mini-queue's own approve button,
  in order, one row visible at a time. File confirmed absent from disk.
- mount run: no gate — create_track/insert_region need no gate.

CONSOLE
- One pre-existing page-level favicon 404 (known, shared-setup list) on
  every load. No new console errors, no pageerrors, across both runs.

FIX LIST
- static/js/widgets/agent/mount/mount.js — never fetches
  `/api/session-settings/<sid>` and never calls the shared add-controls'
  `ctrl.refresh()`, unlike devagent.js:441-447. Root field stays blank
  forever; the actual root inheritance still works server-side, the UI
  just never shows it.
- Not a bug: mount's model picker defaults to whatever
  `MX.mountModelPicker({})` resolves first (ollama/gemma4 here) with no
  UI hint that it's a default rather than a deliberate choice.

STRAY FILES
- Docs/Reports/phase3-test/d1/*.png, *-frames*.json, *-console.txt,
  *-summary.json, *-settle-log.txt, *-region-id.txt — this box's
  evidence.
- Driver scripts in the session scratchpad (d1_miniqueue.py, d1_mount.py),
  not under the project.
- Two more throwaway grid window JSON files added to
  library/grids/9883b6bec3df/ (same footprint B1/B4 left; ~114 untracked
  files in that folder predate this box).

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40, :215-234 (Shared setup, D1)
- Docs/Specs/SPEC-phase4-timeline-target.md (full, item 6 at :39-40)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (probe pattern)
- static/js/widgets/queue/mini-queue/mini-queue.js (full, 168 lines)
- static/js/widgets/agent/mount/mount.js (full, 32 lines)
- static/js/widgets/shared/gate-common.js (full, 106 lines)
- static/js/widgets/shared/add-controls.js (full, 194 lines)
- static/js/widgets/agent/devagent/devagent.js:140-150, :380-450
- static/js/widgets/adetools/timeline/timeline.js:1270-1325 (confirms
  C2's "+ track" BUILD landed)
- Docs/tests/matrix_harness.py (full, basis for both driver scripts)
- static/js/matrix/grid.js:140-235, static/js/matrix/socket.js:1-75
- ade/frames.py:446-461 (_do_insert_region), :640-673 (kill_track vs
  delete_track — kill_track/close_track takes a region id despite the
  name, delete_track takes a track id and removes every region on it)
- server.py:1678 (`/api/session-settings/<sid>`)
- library/registry/widgets.json:3, :9
- archives/9883b6bec3df/master.json — snapshot only, confirmed stale
  against a live `roster` call at close (still listed dropped regions);
  live socket roster is ground truth, not this file, on this session.

CLOSER REVIEW
- mount's blank root field vs. devagent's working one — same class of
  "one widget skips the fetch-and-refresh the sibling widget does" gap;
  one-line parity fix, not a design question.
- master.json lagged the live roster on this session; worth a note if
  a future box trusts it as ground truth without cross-checking a live
  `roster` send.
- mini-queue's "refresh refills" line only got an empty-state proof, not
  a populated one — low priority, flagged in the SPEC-test file.
