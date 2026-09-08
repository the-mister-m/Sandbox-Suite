# SPEC test — mini_queue

## D1 — 2026-09-07

RENDER: mounted via `MX.grid.applyTemplate` at slot 1,1 6x8 on session
9883b6bec3df. Dark card, header "Mini Queue" plus instance id, a pill
("N pending" / "none pending") and a refresh button, an empty list body.
No console errors beyond the known page-level favicon 404.
Docs/Reports/phase3-test/d1/mq-01-mounted.png.

READ LINE CONFIRMED OR REFUTED: CONFIRMED. Mount sends `roster`, subscribes
`feed`, `gate_broadcast`, `ask`, `gate_pending`, `ade_init`, `track_list`,
then sends `feed`. Fills from the `feed` frame, tracks additional pending
gates via `gate_broadcast`/`ask`/`gate_pending`, all three real server
frames (grepped ade/frames.py, engine/web_io.py). Confirms sharing
`cq-queue`/gate-common.js with queue-log/gate-list/queue: same
`static/js/widgets/shared/gate-common.js` module (fmtTime, regionOf,
isPending, actionRecords, namesFrom, settleButtons), same
`static/css/matrix-chat-queue.css` targeting `.cq-queue`.

CHECKLIST
- pending rows only: SEEN — mq-03-pending-0.png through -3.png, one row
  at a time, each dropped the instant it settled before the next arrived.
- settle drops the row: SEEN — mq-settle-log.txt, four `approve` clicks
  on mini-queue's own approve button (write_file, read_file, run_command,
  send_message gates in order); mq-04-after-settles.png shows "no gate is
  waiting on you".
- refresh refills: SEEN as a no-op confirmation only — clicked the
  widget's own refresh button after the queue emptied
  (mq-05-after-refresh.png); text stayed "no gate is waiting on you",
  consistent with zero pending gates at that moment. Not driven against
  a populated queue; would need a second live gate held open to prove
  refresh re-pulls state rather than trusting cache. BLOCKER, minor.

GATE — full write/read/rm cycle on d1test.txt, region c5540782cd1c "d1mq"
(claude/sonnet, inherited session root /Users/moth3rship/Desktop, insert_region
on track 5a031370bf1c), all four gates settled from mini-queue's own
approve button:
- write_file d1test.txt, 6 chars ("hello\n"): approved, fired.
- read_file d1test.txt, 6 chars back: approved, fired.
- run_command `rm d1test.txt`, exit 0: approved, fired.
- send_message to Captain (agent's own confirmation reply): approved, fired.
File confirmed absent: `ls ~/Desktop/d1test.txt` → No such file or directory.

CONSOLE: one pre-existing page-level favicon 404 (known, shared-setup
list). No new console errors, no pageerrors.
Docs/Reports/phase3-test/d1/mq-console.txt.

FIX LIST
- None found. Widget matched its READ LINE and the checklist end to end.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40, :215-234 (Shared setup, D1)
- Docs/Specs/SPEC-phase4-timeline-target.md:39-40 (item 6)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (probe pattern)
- static/js/widgets/queue/mini-queue/mini-queue.js (full, 168 lines)
- static/js/widgets/shared/gate-common.js:1-106 (fmtTime, regionOf,
  isPending, target, actionRecords, namesFrom, settleButtons)
- static/css/matrix-chat-queue.css (grep, confirms `.cq-queue` shared class)
- Docs/tests/matrix_harness.py (full, basis for the driver script)
- static/js/matrix/grid.js:140-235 (addWidget, applyTemplate, _freeSlot)
- static/js/matrix/socket.js:1-75 (send/onFrame)
- ade/frames.py:446-461 (_do_insert_region, default-model confirm),
  :640-660 (kill_track/delete_track)
- library/registry/widgets.json:3 (mini_queue row)
- archives/9883b6bec3df/master.json (ground truth, track 5a031370bf1c
  roster before/after), archives/9883b6bec3df/log.jsonl (gate cycle,
  ground truth)

BLOCKERS
- Refresh-refills checklist line only proved the empty-state path (see
  above); a positive refill case would need a gate held open across a
  refresh click, not attempted here to stay inside the box's estimate.
