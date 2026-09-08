SESSION REVIEW — Sandbox Suite — F-B — 2026-09-07 (timestamps below from log.jsonl / harness output)

EDITS
- static/js/widgets/gate-list/gate-list.js:267-279 — settle click sends
  `gate_action` (action, id, inst, region) instead of `answer`.
- static/js/widgets/gate-list/gate-list.js:181-194, 308-330 — click marks the
  row `awaiting` (shows "sent…", buttons removed) instead of guessing
  settled/outcome; cleared on the next `gate_pending` or `chat_history`.
- static/js/widgets/gate-list/gate-list.js:308-330 — `gate_pending` and `ask`
  drop rows whose `region` differs from the bound `g.region`.
- ade/frames.py:256 — `_track_gatelog` filter `r.get("track")` → `r.get("region")`.
- ade/tracks.py:1394-1397 — `remove_track` appends each popped region's
  `index_entry()` to `environment.closed_rows`.
- ade/frames.py:798-802 — `wp_mute` now calls `broadcast_roster(ctx.environment)`
  after `set_muted`.
- engine/agent_loop.py:181-183 — gate payload adds `"command": data.get("command")`.
- engine/agent_loop.py:396-397, 418-419, 424-425 — the three `log_event(...,
  queue_id=entry["id"]...)` call sites now also pass
  `command=(entry.get("payload") or {}).get("command")`, making the key
  reachable (confirmed via engine/daemon_queue.py:37-38 `_target_key` and
  `park()`:246 `entry["payload"] = payload`).

HARNESS
- Driver: scratchpad fb_driver.py (below), headed, session 9883b6bec3df,
  track 5a031370bf1c.
- Mounted anchor_chat, two gate_list instances, messenger. Inserted region
  fc32b0e75ba5 "fbsonnet" (claude/sonnet) on 5a031370bf1c. Bound anchor_chat
  and gate_list #1 to it; gate_list #2 bound to a nonexistent dead region id.
- Turn: write_file fbtest.txt. Gate 7c37f414517b appeared in gate_list #1 only
  — gate_list #2 stayed at 0 gates throughout (region filter, item 2 — SEEN).
- Settled from gate_list #1's own approve button (not raw gate_action) —
  CLICKED gate-list approve, 15:39:42. log.jsonl:
  `{"ts": 1788809982347, "kind": "gate", "action": "write_file",
  "target": "fbtest.txt", "answer": true, "hook": "ask",
  "answered_by": "human", "rec": "c3ee0d72dae6"}` — ledger confirms
  answered_by human via the widget's own button (item 1 fix — SEEN).
- gate_list #1 row went settled after the click, badge fed by the next
  `gate_pending` reconcile (item 3 — SEEN; outcome shows "unknown", the
  existing `_reconcileGates` fallback label, since the widget no longer
  guesses outcome client-side).
- Messenger mute: before-click `{"muted": false}`, single click on
  `.mg-btn.m`, after-click `{"muted": true, "rowMutedClassPresent": true}` —
  repainted from the roster broadcast alone, no second frame sent by hand
  (item 6 — SEEN).
- Killed fc32b0e75ba5 via kill_track. Roster after kill:
  `["32f1ec929f4a"]` — only gfsf remains, untouched throughout.
- Console: one pre-existing 404 (known, shared-setup list), no new console
  or page errors.
- Item 7 (command in gate payload) was not exercised live: the harness's
  gate settled inside `gate_wait_s` via the direct human-answer branch
  (engine/agent_loop.py ~432), which has never carried `queue_id` (and so
  never carries `command` either) — that gap predates this box and is
  outside item 7's scope. The three branches item 7 touched (queue/timeout/
  disconnect) were confirmed by read, not driven, since none of those fired
  this turn.
- Evidence: Docs/Reports/phase3-test/fb/ — 7 screenshots (01, 02, 10, 11,
  12, 20, 30), fb-frames.json, fb-console.txt, fb-state.json.

STRAY FILES
- Docs/Reports/phase3-test/fb/ — this box's screenshots, frame dump,
  console dump, state json.
- library/grids/9883b6bec3df/w-*.json — five throwaway grid-window files
  from applyTemplate calls (same footprint as prior boxes).
- Driver script in session scratchpad, not under the project:
  scratchpad/fb_driver.py.

GOALS DONE
- All 7 F-B fix items applied and syntax-checked.
- Harness lines driven: fresh-region settle via widget button with
  answered_by human confirmed, dead-region gate-list shows nothing,
  messenger mute repaints off the roster broadcast alone, region mounted
  and dropped, gfsf untouched.

BLOCKERS
- None on the 7 items. Item 7's fix is real but unverified live (see
  HARNESS note above) — the direct-answer branch that fired in this test
  never had queue_id/command wiring before or after this box's edits.

READS
- Docs/Specs/SPEC-phase4-fixes-B.md (Shared setup, F-B)
- static/js/widgets/gate-list/gate-list.js (full, then re-read after each edit)
- static/js/widgets/shared/gate-common.js:1-106
- engine/web_io.py:30-145
- ade/frames.py:115-140, 248-260, 315-400, 437-451, 571-620, 780-810
- ade/tracks.py:1368-1445
- engine/agent_loop.py:112-193, 357-440
- engine/daemon_queue.py:25-120, 221-295 (grep for entry shape)
- static/js/widgets/messenger/messenger.js:195-230, 316-420
- static/js/matrix/socket.js:1-90, widget-frame.js:1-130, grid.js:140-240
- library/registry/widgets.json (gate_list, messenger type strings)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md, RECEIPT-phase4-S1.md (full)
- Prior scratchpad drivers b4_gate.py, b4_settle.py (harness pattern reference)
- log.jsonl (grep, post-harness, gate record confirmation)

CLOSER REVIEW
- Item 7's command-in-payload fix stands on the queue/timeout/disconnect
  branches only; the direct-answer branch (agent_loop.py ~432) has no
  queue_id at all, so a queue-log detail view will still show no command
  for a gate settled inside the wait window. Whether that's worth a
  follow-up is Brandon's or the closer's call.
- F-C reads `payload.command` per the spec; confirm with F-C's receipt that
  their queue-log read lines up with the field shape landed here
  (`payload: {target, queue_id, command}`).
