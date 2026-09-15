SESSION REVIEW — Sandbox Suite — 2026-09-15T01:04Z to 01:56Z (21:04–21:56 local, 2026-09-14)

EDITS
- [SCOPE-live-actions-P1-gate-merge.md](../Scope/SCOPE-live-actions-P1-gate-merge.md) — P1 scope, session agent
- [SCOPE-live-actions-P2-chat-live-actions.md](../Scope/SCOPE-live-actions-P2-chat-live-actions.md) — P2 scope, session agent
- [SCOPE-live-actions-P3-ledger-live.md](../Scope/SCOPE-live-actions-P3-ledger-live.md) — P3 scope, session agent
- [engine/ledger.py:451](../../engine/ledger.py#L451) — P1 `_pair_claude_gates`, Claude gates merge into their tool row
- [engine/settings.py:471](../../engine/settings.py#L471) — P1 `merge_gates` option rows, default on
- [gate-common.js:57](../../static/js/widgets/shared/gate-common.js#L57) — P1 `actionRecords` takes the toggle
- [queue.js](../../static/js/widgets/queue/queue/queue.js) / [mini-queue.js](../../static/js/widgets/queue/mini-queue/mini-queue.js) / [queue-log.js:346](../../static/js/widgets/queue/queue-log/queue-log.js#L346) — P1 toggle wired
- [test_chat_queue.py:47](../tests/test_chat_queue.py#L47) / [test_session_widget.py:84](../tests/test_session_widget.py#L84) — P1 option-set assertions updated
- [server.py:608](../../server.py#L608) — P2 `_live_tool_row`, resolve-hook and record-tool-outcome push live cards
- [turns.js:120](../../static/js/widgets/shared/turns.js#L120) — P2 approve/deny on pending cards, `updateToolBlock`
- [anchor-chat.js:758](../../static/js/widgets/chat/anchor-chat/anchor-chat.js#L758) — P2 cards update in place by id
- [ledger.js:98](../../static/js/widgets/adetools/ledger/ledger.js#L98) — P3 live turn row, region+turn open state, diff and Bash sub-rows
- [engine/ledger.py:507](../../engine/ledger.py#L507) — P3 `tool_input` carried onto merged record
- [RECEIPT-live-actions-P1.md](RECEIPT-live-actions-P1.md) / [RECEIPT-live-actions-P2.md](RECEIPT-live-actions-P2.md) / [RECEIPT-live-actions-P3.md](RECEIPT-live-actions-P3.md) — builder receipts
- [INDEX.md](../../INDEX.md) / [SESSIONLOG.md](../../SESSIONLOG.md) / [TODO.md](../../TODO.md) — docset

STRAY FILES
- [library/grids/535520fb3872/](../../library/grids/535520fb3872/) — empty grid folder, present at session start
- [library/matrix-templates/basic chat 1.json](../../library/matrix-templates/basic%20chat%201.json) — matrix template, appeared mid-session from the app, not an agent write

GOALS DONE
- Traced anchor-chat vs queue: two pipes. Queue reads ledger `feed`; anchor-chat reads `mirror` tool rows, sent only by the native loop.
- Proved from open session 535520fb3872: 98 Claude hook records in the ledger, 0 live tool rows to chat.
- Traced ledger, changes, queue-log: one `feed`, three filters; turn records land only at turn end.
- Found Claude gates never paired (edge `Write` vs `claude_hook:Write`) — the queue's double rows.
- P1 gate merge, P2 chat live actions, P3 ledger live: scoped, built by three Sonnet Gotos in parallel, every diff line reviewed by the session agent.
- Ledger transcript issue — had to check into it after the build scopes. Lead found: [ledger.js:628-630](../../static/js/widgets/adetools/ledger/ledger.js#L628-L630) fetches a region's transcript once and never refreshes; turns ending later show "no transcript for this turn". Server side and `_turn` stamps verified fine. Fix drafted in session (clear cache when a newer turn record lands), not applied.
- Transcript widget "loads nothing" — lead found: regions closed in an unsaved session lose their transcript. `autosave` returns early when unsaved ([tracks.py:1750](../../ade/tracks.py#L1750)), close drops the region ([tracks.py:1448](../../ade/tracks.py#L1448)), `_write_archive` flushes open regions only ([tracks.py:1703](../../ade/tracks.py#L1703)). Proof: region 57ea81faf7dc in session 0d78d246515f, 4 turns in ledger, no .jsonl. Widget and routes verified working.

BRANDON'S TODOS
- Restart the server once; browser-test P1, P2, P3. Nothing was run headed.
- Rule on P2 stale cards: queued approve and ask timeout leave the card yellow; a result with no card makes a blank "tool" card.
- Rule on P3: live row sorts to the bottom (no `started`); sub-row open key still `t.id`, resets at turn end; diff recomputed every render.
- P4 tonight: per-call $ mid-turn — rows collected at [providers.py:699](../../engine/providers.py#L699), never sent; `_call` never filled.
- Apply the ledger transcript cache fix, now that P3 has landed.
- Rule on lost transcripts for regions closed before a session is saved; `remove_track` callers not traced.
- mini-queue `merge_gates` toggle is inert (pending only) — keep or drop.

CLOSER REVIEW
- Gets copy of review, not a contract.
- P1 ran `git stash` for a test baseline while P2/P3 were editing; session agent verified stash list empty, P2/P3 edits intact, no conflict markers — closer
- P1 receipt says no restart needed; wrong — server runs without reloader ([server.py:2325](../../server.py#L2325)) — closer
- P2 edited turns.js, not listed in its scope; shared by transcript turn blocks, checked unaffected — closer
- P1 edited two test files outside scope; required by the new option — closer
- CLAUDE.md map: Docs/Scope/ live-actions scopes, Docs/Reports/ live-actions receipts and this review — closer
- MEMORY.md warm start for Live Actions (P1–P3 built untested, P4 tonight, two transcript leads) — closer
- Finish the worklog — closer
