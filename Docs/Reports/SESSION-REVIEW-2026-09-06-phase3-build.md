SESSION REVIEW — Sandbox Suite — 2026-09-06 17:57 to 18:52 (6:52pm per Brandon)

Phase 3 build. Six waves, seventeen Goto builders, Sonnet unless noted. Session agent Fable. Gate rule: builders read their spec and its read list only. Brandon's mid-build rule: one-line fixes under 100 tokens by the session agent, anything bigger goes to a job that reads the file anyway.

EDITS — session agent
- [server.py](../../server.py) — queue custody tuple carries region, two sites; live-region helper walks live environments
- [ade/tracks.py](../../ade/tracks.py) — archive stamps the session's own root, global as fallback
- [static/js/matrix/session-panel.js](../../static/js/matrix/session-panel.js) — rung mounts in the real corner bar; session context read through the fs read route
- [static/js/widgets/changes/changes.js](../../static/js/widgets/changes/changes.js) — open-ledger event fires on document
- [static/matrix.html](../../static/matrix.html) — seven script tags for Wave 3 widgets and the two shared modules
- [Docs/Specs/SPEC-E3-lifecycle.md](../Specs/SPEC-E3-lifecycle.md) — Brandon's decision under item 6

EDITS — builders, by receipt
- [RECEIPT-E1-session-root.md](RECEIPT-E1-session-root.md) — root on the environment
- [RECEIPT-E2-ledger-per-session.md](RECEIPT-E2-ledger-per-session.md) — ledger directory per session
- [RECEIPT-E3-lifecycle.md](RECEIPT-E3-lifecycle.md) — shutdown modal, timestamps, end closes sockets
- [RECEIPT-E3b-ask-timeout.md](RECEIPT-E3b-ask-timeout.md) — ask times out on gate wait, reads as no
- [RECEIPT-E4-archives-context.md](RECEIPT-E4-archives-context.md) — archives toggle, transcripts route, context follows reset
- [RECEIPT-E5-matrix-chrome.md](RECEIPT-E5-matrix-chrome.md) — strip widget, picker columns, session rung, shared feed-rows
- [RECEIPT-E6-devagent.md](RECEIPT-E6-devagent.md) — devagent widget
- [RECEIPT-E6b-devagent-listener.md](RECEIPT-E6b-devagent-listener.md) — devagent listens for open events
- [RECEIPT-E7-chat-gatelist.md](RECEIPT-E7-chat-gatelist.md) — anchor chat, gate list, shared turns
- [RECEIPT-E8-timeline.md](RECEIPT-E8-timeline.md) — timeline widget, Opus
- [RECEIPT-E9-queue.md](RECEIPT-E9-queue.md) — queue log widget
- [RECEIPT-E10-ledger.md](RECEIPT-E10-ledger.md) — ledger widget
- [RECEIPT-E11-changes.md](RECEIPT-E11-changes.md) — changes widget
- [RECEIPT-E12-messenger.md](RECEIPT-E12-messenger.md) — messenger widget
- [RECEIPT-E13-transcript.md](RECEIPT-E13-transcript.md) — transcript widget, Suite page transcripts button
- [RECEIPT-E14-retire.md](RECEIPT-E14-retire.md) — old ADE pages, routes, and scripts retired; redpen checklist

STRAY FILES
- [Docs/audit/arrange-old/](../audit/arrange-old/) — arrange.js, region.js, cables.js parked by E14 for Phase 4, intended
- none other

GOALS DONE
- Wave 1: session root and ledger per session
- Wave 2: lifecycle and archives plus context
- Wave 3: chrome, devagent, chat and gate list
- Wave 4: timeline, queue log, ledger, changes, messenger, ask timeout
- Wave 5: transcript, devagent listener
- Wave 6: retire and checklist
- Every Python file touched compiles. Every JavaScript file written passed node check.
- Nothing run live. No server started, no browser opened, test suite not run.

BRANDON'S TODOS
- Run [CHECKLIST-phase3-redpen.md](CHECKLIST-phase3-redpen.md) by hand after driving. Parked by Brandon at close.
- Decide what a timeline lane draws when a track has more than one region
- Decide which Session corner button lives: Phase 2 panel or the new rung
- Decide follow mode's home: anchor chat mode or its own widget
- Dot and badge styles missing on the matrix page for messenger and strip; matrix does not load ade.css
- New context file save resolves against the session root, not the project root; breaks only when the roots diverge
- Ask timeout returns empty text where the spec said the text queue; same result as no
- Picker column shape and claude_mode plus claude_partial on devagent, decide after driving
- Nothing committed; 124 changed paths on main
- Arrange is Phase 4, from Docs/audit/arrange-old

CLOSER REVIEW
- Gets copy of review, not a contract.
- Verify the seventeen builder lines in INDEX.md and SESSIONLOG.md; add this review, the checklist, and arrange-old — closer
- SESSIONLOG.md session entry — closer
- MEMORY.md warm start: Phase 3 built, unrun, redpen parked, Arrange to Phase 4 — closer
- CLAUDE.md map: static/js/ade gone, Docs/audit/arrange-old, widgets list, E-series specs and receipts — closer
- Worklog close, Brandon assigned at 6:52pm — closer
- E14 receipt read overrun, logged by the builder, no action — closer notes
- Confirm ledger.js reads names from the tracks array of track_list, not rows — closer, optional
