# SCOPE — Live Actions P3 — Ledger Live

Written 2026-09-14. Builder: Sonnet Goto.

## GOAL

Ledger widget shows the running turn's actions as they land.
When the turn ends it becomes the normal totals row, collapsed, expandable (today's view).
A turn opened by hand stays open when later turns end — no reset.
Expanded action sub-rows show the Write/Edit diff and Bash input/output.

## WHY

- Turn record is appended only after the turn finishes (ade/tracks.py:792-794).
- Widget rows come only from `kind === 'turn'` (ledger.js:76, 461). Running turn is invisible.
- Actions already arrive live in the feed with region + turn set.

## LINES

- static/js/widgets/adetools/ledger/ledger.js:69-96 — `reduceActions`, `allTurns`, `sameTurn`, `matchedActions`.
- static/js/widgets/adetools/ledger/ledger.js:461-513 — turn rows, `st.open[t.id]`, click toggles.
- static/js/widgets/adetools/ledger/ledger.js:574-609 — `subRowsFor`, `ioBox` input/output.
- static/js/widgets/adetools/ledger/ledger.js:802-826 — `onFrame`, feed handler.
- static/js/widgets/adetools/changes/changes.js:233-270, 359-400 — `diffLines`, `renderDiffBody`. Reuse without changing changes behavior.
- static/js/widgets/adetools/changes/changes.js:283, 491-495 — `ledger_detail` request for blob fields.
- engine/ledger.py:451-473 — `_pair_tool_use`. Open record (holds `tool_input`) merges into result record.
- engine/ledger.py:479-514 — `_translate_rail_c_write`: sets payload.path, payload.prior, result.

## WHAT NEEDS TO HAPPEN

1. Live turn row: actions whose region+turn has no turn record yet render as a row marked live.
   - Cells with no data yet show "—". Actions column counts matched actions.
2. Open state keyed by region+turn, not record id, so live → finished keeps its identity.
   - Live row renders open.
   - When its turn record arrives: collapse that turn once.
   - Never change open state of any other turn.
3. Sub-row expand, Write/Edit: diff of payload.prior vs result, reusing changes.js diff logic.
   - Blob fields: fetch through `ledger_detail` like changes.js:283.
4. Sub-row expand, Bash: input = the command, output = tool_response / result.
   - If the command does not survive `_pair_tool_use`, carry `tool_input` onto the result record there. Nothing else in ledger.py.
5. Other action types: keep today's input/output boxes.

## DO NOT

- Touch per-call cost / `_call` (P4, tonight), transcript fetch (ledger.js:628-630, being looked at separately).
- Change changes.js visible behavior. Touch queue widgets, anchor-chat, server routes.
- Restart the server or kill processes. List what needs a restart in the receipt.
- Commit. Invent columns, colors, or sort behavior.

## RULES

- Code comments: label, function, state only. Short. "spine" is a banned word.
- Leave receipt: Docs/Reports/RECEIPT-live-actions-P3.md, session review format from ~/.claude/CLAUDE.md.
- Append one line each to INDEX.md and SESSIONLOG.md. Re-read before editing; other builders run in parallel.
- engine/ledger.py is shared with P1 (P1 touches `_pair_gates` and `snapshot`). Edit only `_pair_tool_use`; re-read on conflict.
