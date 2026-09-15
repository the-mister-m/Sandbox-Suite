# SCOPE — Live Actions P2 — Chat Live Actions

Written 2026-09-14. Builder: Sonnet Goto.

## GOAL

anchor-chat shows tool action cards (with the existing expand arrows) as soon as the gate decides, mid-turn.
Card updates in place when the result lands. Both rails.
Waiting gate: approve/deny inside the card, reusing the existing gate buttons.

## WHY (found in the open session, archives/535520fb3872/)

- anchor-chat's only live tool input is `mirror` kind `tool` (anchor-chat.js:921).
- Only engine/agent_loop.py:603 sends it — native rail only.
- Claude CLI rail: 98 hook records in the ledger, 0 live tool rows sent. Hook routes write the ledger only.

## LINES

- server.py:608-694 — resolve-hook. open / locked / queue / ask branches.
- server.py:697-729 — record-tool-outcome. Result lands here with tool_use_id, tool_response.
- server.py:659-664, 673-674 — `dq.park` calls; capture the returned entry for its gate id.
- ade/tracks.py:236-243, 267-268 — `TrackHub._fanout`, `TrackHub.tool`. Reach via `region.hub.tool(row)`.
- ade/tracks.py:178-179 — `MirrorView.tool` → `mirror` frame kind `tool`.
- engine/agent_loop.py:596-603 — native tool row shape: name, target, args, gate, ts, result.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:784-798 — `appendTool`, append-only today.
- static/js/widgets/chat/anchor-chat/anchor-chat.js:913-924 — mirror switch.
- static/js/widgets/shared/gate-common.js:94 — gate buttons sending `gate_action`. Reuse.
- static/js/widgets/queue/mini-queue/mini-queue.js:135-140 — `gate_broadcast` resolved frame exists.
- MX.turns.makeToolBlock — grep its file; check gate color names it accepts.

## WHAT NEEDS TO HAPPEN

1. Claude rail, after the gate decides, push a row through `region.hub.tool(row)`:
   - same shape as agent_loop.py:596-603, plus `id` = tool_use_id.
   - gate color from hook: open → pre-permitted, ask approved → asked/approved, locked/denied → denied, queue → pending.
   - use the color names makeToolBlock / the ledger legend already use. Do not invent new ones.
2. record-tool-outcome pushes the same `id` with `result` (tool_response as text).
3. Pending (queue, or ask while waiting): row carries the gate entry id and pending color.
4. anchor-chat `appendTool`: if a card with that `id` exists, update it in place; else append. Rows without `id` append as today.
5. Pending card shows approve/deny from gate-common.js. Card flips color when the gate settles.
   - If this needs more than reusing gate-common.js plus an existing settle frame: STOP, skip step 5, report why.
6. Native rail: agent_loop.py:603 unchanged.

## KNOWN LIMIT — REPORT, DO NOT FIX

- `renderTranscript` clears the pane on follow/join. Claude transcripts hold no tool rows, so live cards vanish on re-follow.

## DO NOT

- Touch providers.py stream parsing, ledger widget, queue widgets, changes.
- Restart the server or kill processes. List what needs a restart in the receipt.
- Commit. Invent card layouts beyond the existing tool block.

## RULES

- Code comments: label, function, state only. Short. "spine" is a banned word.
- Leave receipt: Docs/Reports/RECEIPT-live-actions-P2.md, session review format from ~/.claude/CLAUDE.md.
- Append one line each to INDEX.md and SESSIONLOG.md. Re-read before editing; other builders run in parallel.
