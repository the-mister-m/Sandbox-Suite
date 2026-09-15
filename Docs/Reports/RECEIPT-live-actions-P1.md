SESSION REVIEW — Sandbox Suite (Live Actions P1) — 2026-09-14

EDITS
- [engine/ledger.py:451](../../engine/ledger.py#L451) — new `_pair_claude_gates`, matches region/turn/tool-name/target, nearest gate before the open record
- [engine/ledger.py:558](../../engine/ledger.py#L558) — `snapshot` calls `_pair_claude_gates` after `_pair_tool_use`
- [engine/settings.py:474](../../engine/settings.py#L474) — `merge_gates` Row added to `queue`
- [engine/settings.py:476](../../engine/settings.py#L476) — `mini_queue` gets its first Row, `merge_gates`
- [engine/settings.py:479](../../engine/settings.py#L479) — `queue_log` widget-type block added (didn't exist before), `merge_gates` Row
- [engine/settings.py:189](../../engine/settings.py#L189) — `queue_log` added to `GLOBAL_DEFAULTS.widget_defaults` (test `test_widget_defaults_live_in_global_json` requires one entry per widget type)
- [static/js/widgets/shared/gate-common.js:57](../../static/js/widgets/shared/gate-common.js#L57) — `actionRecords(msg, mergeGates)` — off skips the merged-gate filter and the hook/answer flatten
- [static/js/widgets/queue/queue/queue.js:144](../../static/js/widgets/queue/queue/queue.js#L144) — feed passes `frame.options.merge_gates`; `onOption` rebuilds and re-renders on toggle
- [static/js/widgets/queue/mini-queue/mini-queue.js:60](../../static/js/widgets/queue/mini-queue/mini-queue.js#L60) — new `applyFeed`, feed and `onOption` both route through it with `frame.options.merge_gates`
- [static/js/widgets/queue/queue-log/queue-log.js:339](../../static/js/widgets/queue/queue-log/queue-log.js#L339) — `render` gates its own filter/flatten on `frame.options.merge_gates`
- [static/js/widgets/queue/queue-log/queue-log.js:611](../../static/js/widgets/queue/queue-log/queue-log.js#L611) — `onOption` re-renders on `merge_gates` change
- [Docs/tests/test_chat_queue.py:47](../tests/test_chat_queue.py#L47) — `queue` widget row set now includes `merge_gates`
- [Docs/tests/test_session_widget.py:83](../tests/test_session_widget.py#L83) — same, `widget_defaults("queue")` expected set updated

STRAY FILES
- none

GOALS DONE
- Claude-rail gate + tool record now merge into one row, colored by gate outcome, in queue-log/queue/mini-queue.
- `merge_gates` checkbox, default true, on all three; off restores the merged gate as its own row.
- gate-list.js, changes.js, ledger widget, anchor-chat.js untouched (verified via git diff — no changes).

VERIFICATION (against archives/535520fb3872/log.jsonl, read-only)
- 52 gate records total. Before fix: 49 unmerged. After fix: 1 unmerged (the one `ask`-hook gate that timed out before any open record was written — correctly stays a gate row, matches "denied/locked gates have no tool row").
- 48 of 48 `claude_hook_result:*` rows now carry `gate_id`/`gate_hook`/`gate_answer`.
- Native pairing unchanged: 3 rows carried `gate_id` before and after, same record ids (`list_files` gate-stamped rows).
- `node --check` clean on all four touched JS files. `python3 -m py_compile` clean on ledger.py/settings.py/server.py (server.py untouched by me, compiled as a sanity check only).
- Full Docs/tests/ run (ledger/settings/widget/queue keyword filter): same 47 pre-existing failures before and after my changes (diffed against `git stash` baseline) — no regressions. The two new failures caused by the widened `queue` option set were the two hardcoded-set tests, now updated.

NEEDS A RESTART
- None of this is server-restart-gated: `_pair_claude_gates` runs inside `snapshot()`, read on every feed request. `merge_gates` defaults are read by new widget instances immediately; an already-mounted queue_log/queue/mini_queue instance picks up the new default option only on remount (existing instances keep whatever `options` they were saved with, same as any other widget-option default change).

SKIPPED / NOT DONE
- mini-queue: wired `merge_gates` through the same `G.actionRecords` path as the other two, but per scope its effect is inert — mini-queue only shows pending rows, and a merged gate is by definition resolved (never pending), so toggling it there changes nothing observable. Confirmed by design, not tested live (no browser run).
- Not run in a live browser / not verified against a live session — no server restart, no process kills, per scope.

CLOSER REVIEW
- Gets copy of review, not a contract.
- Confirm `merge_gates` default (true) matches what Brandon wants surfaced first — closer/Brandon.
- Decide whether the mini-queue no-op wiring is worth keeping or should be dropped as dead weight — closer/Brandon.
