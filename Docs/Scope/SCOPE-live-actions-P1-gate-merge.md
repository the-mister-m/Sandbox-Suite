# SCOPE — Live Actions P1 — Gate Merge

Written 2026-09-14. Builder: Sonnet Goto.

## GOAL

A gated action shows as ONE row, colored by gate outcome, in queue-log, queue, mini-queue.
Toggle in widget options, default on. gate-list stays gates-only — do not touch it.

## WHY (found in the open session, archives/535520fb3872/log.jsonl)

- Claude CLI rail writes a gate record AND a tool record per call. They never pair.
- Gate record edge is the tool name (`Write`); tool record action_type is `claude_hook:Write`.
- `_pair_gates` needs `E.action_type == G.edge`, so all 52 gates in that session stayed unmerged.
- Native rail already pairs through `gate_id` stamps (engine/agent_loop.py:164-169).

## LINES

- engine/ledger.py:427-448 — `_pair_gates`. Native pairing. Leave native behavior unchanged.
- engine/ledger.py:451-473 — `_pair_tool_use`. Claude open record merges into its result record.
- engine/ledger.py:517-527 — `snapshot`. Order is `_pair_gates` then `_pair_tool_use`.
- server.py:645-694 — resolve-hook. Shows gate record and open record write order per hook level.
- engine/agent_loop.py:139-191 — `_record_event`. Gate record fields: edge, payload.target, answer, hook.
- static/js/widgets/queue/queue-log/queue-log.js:347-350 — filters merged gates, overlays gate_hook/gate_answer.
- static/js/widgets/queue/queue/queue.js:144-152 — feed through `G.actionRecords`.
- static/js/widgets/queue/mini-queue/mini-queue.js:120-133 — feed through `G.actionRecords`, pending only.
- static/js/widgets/shared/gate-common.js — `actionRecords`. Grep it; check whether it already drops merged gates.
- static/js/matrix/widget-frame.js:19-32, 170-195 — option defaults and checkbox rendering.
- engine/settings.py:465-530 — per-type widget option rows and defaults.

## WHAT NEEDS TO HAPPEN

1. Server pairing: each Claude gate record merges into the surviving Claude tool row.
   - Surviving row = the `claude_hook_result:*` record after `_pair_tool_use`.
   - Match on region, turn, tool name (gate edge), target. Nearest gate before the open record.
   - Set on the surviving row: `gate_id`, `gate_hook`, `gate_answer`. Set `merged` on the gate.
   - Denied/locked gates have no tool row. They stay as gate rows.
   - Verify against archives/535520fb3872/log.jsonl before and after: count of unmerged gates.
2. Option `merge_gates`, checkbox, default true, on queue_log, queue, mini_queue.
   - On: hide merged gate rows (today's queue-log behavior).
   - Off: show merged gate rows as their own rows again.
   - Follow how existing options (claude_cache_ttl, claude_exclude_dynamic) are declared and applied.
3. mini-queue shows pending only. Pending gates are never merged. Wire the toggle anyway; report the effect.

## DO NOT

- Touch gate-list, changes, ledger widget, anchor-chat.
- Change native-rail pairing results. Prove it with a native record check in the receipt.
- Restart the server or kill processes. List what needs a restart in the receipt.
- Commit. Invent options, colors, or UI beyond the one checkbox.

## RULES

- Code comments: label, function, state only. Short. "spine" is a banned word.
- Leave receipt: Docs/Reports/RECEIPT-live-actions-P1.md, session review format from ~/.claude/CLAUDE.md.
- Append one line each to INDEX.md and SESSIONLOG.md. Re-read before editing; other builders run in parallel.
- engine/ledger.py is shared with P3 (P3 touches `_pair_tool_use` body only). Edit only your functions; re-read on conflict.
