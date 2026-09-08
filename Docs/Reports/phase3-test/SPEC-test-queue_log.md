SPEC test — queue_log — Phase 4 B2

RENDER
- Mounts clean via applyTemplate, no console errors beyond the known
  page-level 404. Screenshots: b2/queuelog-01-feed-on-mount.png through
  b2/cleanup-01-after-drop.png.

READ LINE CONFIRMED OR REFUTED
- "track column names regions, model and provider chips fill, cache
  toggles show on claude regions" — CONFIRMED (queuelog-01, queuelog-70:
  gfsf/gemma4b2/sonnetb2 track chips with model names; sonnetb2's
  provider:claude chip carries the 5m/1h cache-TTL toggle and trim
  toggle, gemma4b2/gfsf do not).
- "column drag and resize persist in localStorage" — CONFIRMED.
- feed-serving bug from S1-rerun (engine/ledger.py:374) — CONFIRMED
  fixed, inherited from B1: 43 real records rendered on first mount,
  no "no records" state anywhere in this run.

CHECKLIST
- feed rows appear: SEEN — queuelog-01-feed-on-mount.png, 43 records on
  mount (`frame._ql.records.length`), matching B1's fix.
- settle inline: SEEN — a real write_file/read_file/run_command gate
  cycle on a live claude region (sonnetb2), each approved by clicking
  queue_log's own inline "approve" button (not the raw socket).
  queuelog-51/71/81 show each gate moving from pending (yellow, "—
  waiting on you") to fired (blue). Confirmed against ground truth:
  archives/9883b6bec3df/log.jsonl shows write_file (6 bytes),
  read_file (6 bytes back), run_command "rm test.txt" (exit 0) all
  outcome "fired"; /Users/moth3rship/Desktop/test.txt confirmed absent
  on disk afterward.
- detail expands: SEEN — queuelog-90-detail-expand-clean.png, clicking
  the settled run_command row opens the input/output panel. Minor gap:
  the input panel shows only `queue_id: 6444148f2317`, not the actual
  command text (`rm test.txt`) — see FIX LIST.
- column order and width survive a reload: SEEN — dragged the `model`
  header before `time` (queuelog-20/40-after-reorder.png) and resized
  `time` +60px (default 62 -> 122, queuelog-21-after-resize.png);
  localStorage `ade.queuelog.cols` held both changes; after
  `page.reload()` in the same browser session both the new order and
  the new width were still applied on remount (queuelog-30-after-reload.png,
  cols read back from `frame._ql.cols` matched exactly).

CONSOLE
- One pre-existing page-level 404 on load (known, shared setup list).
  No new console errors or pageerrors across the full driver sequence
  (mount, gate cycle, reorder, resize, reload, cleanup).

FIX LIST
- Driving note, not a widget bug: pending gate rows carry a short edge
  label (`write`/`read`/`run`) while the same action once fired
  relabels to the tool's long form (`write_file`/`read_file`/
  `run_command`) — this is the same shape B1 already flagged for
  changes.js's `reduceEvents()`. queue_log itself renders both forms
  correctly; it only tripped up this driver's first two attempts at
  matching rows by label.
- Turns on this session ran ~150-160s each (observed repeatedly in
  log.jsonl `duration_ms`), well past a casual poll window. Not a
  widget issue, just a real timing property of this session worth
  the next box knowing about before budgeting driver polls.
- The claude region (sonnetb2) needed three separate explicit
  single-tool nudges to get through write -> read -> run_command; left
  to one combined instruction it kept re-issuing write_file on
  test.txt without ever progressing. Model behavior, not the widget's
  fault, noted for context on any future scripted gate test on this
  session.
- static/js/widgets/queue-log/queue-log.js:185-198 (`inputText`) — for
  a merged run_command record, the detail panel's input box falls
  through to showing `queue_id: <id>` (from the generic key-dump
  branch) instead of the command text captured in the pending record's
  `prompt`/`payload.command`. Worth checking whether `ledger_detail`'s
  response for a `run` action actually carries the command anywhere
  `inputText` looks.
- queue_log mounts with `frame.subscribe(["track_list","ade_init","feed",
  "ledger_detail"])` and requests `{type:"feed"}` once at mount
  (queue-log.js:557-558) — it never subscribes to `feed_dirty`. A new
  pending gate or a fresh record from any region will not appear on
  its own; every poll in this driver had to force `frame.send({type:
  "feed"})` by hand. Same shape as B1's changes.js finding — worth a
  matching fix (`feedRows.settle` itself already re-requests feed
  twice after a settle, so the settle-inline checklist line is not
  blocked by this, only "new record shows up live" is).

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40 (Shared setup, B2)
- Docs/Reports/RECEIPT-phase4-S1-rerun.md (full)
- Docs/Reports/RECEIPT-phase4-B1.md (full)
- static/js/widgets/queue-log/queue-log.js (full, 595 lines)
- static/js/widgets/shared/feed-rows.js (full — settle() re-request
  pattern)
- ade/frames.py:775-811 (feed/wp_feed/gate_action dispatch)
- ade/frames.py:437-450 (_do_insert_region), :615-666 (kill_track)
- engine/ledger.py:369-420 (pending_as_records, the B1 fix)
- queue.json (read repeatedly across all driver attempts, ground
  truth for which gates were actually pending vs already
  resolved/timed-out)
- archives/9883b6bec3df/log.jsonl (ground truth for the write/read/run
  cycle, read repeatedly)

BLOCKERS
- None outstanding. Three driver attempts were needed before the gate
  cycle actually landed clean (see FIX LIST timing/label notes above)
  — all three false starts are documented rather than hidden, no
  widget defect behind any of them.

## W4 — 2026-09-07

- Command text in the detail column (W1 item 2's fix): SEEN by combined
  evidence. Real settled rows from this box's own gates
  (`run_command echo ... > /tmp/w4fgate.txt`, `write_file
  /tmp/w4bgate.txt`) render full command text in the detail column. All
  captured rows resolved via the timeout branch (F-B's existing fix,
  agent_loop.py:419-421), not the human-answered branch (:436-438) — I
  could not land a human answer inside the gate_wait_s window (blocked by
  gate-list's missing `gate_broadcast` handler, see SPEC-test-gate_list.md
  W4). The human branch is byte-identical in pattern to the proven timeout
  branch but not independently driven live. Full detail:
  RECEIPT-phase4-W4.md item 13.
