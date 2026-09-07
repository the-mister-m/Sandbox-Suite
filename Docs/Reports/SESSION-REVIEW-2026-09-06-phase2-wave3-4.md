SESSION REVIEW — Sandbox Suite — 2026-09-06 15:42Z to 18:38Z

EDITS
- [Docs/Specs/SPEC-D3c-end-closes-sockets.md](../Specs/SPEC-D3c-end-closes-sockets.md) — End Session closes its sockets, spec
- [Docs/Reports/RECEIPT-D3c-end-closes-sockets.md](RECEIPT-D3c-end-closes-sockets.md) — Job D3c receipt, Sonnet
- [Docs/Reports/RECEIPT-D4-suite-library.md](RECEIPT-D4-suite-library.md) — Job 4 receipt, Sonnet
- [Docs/Reports/RECEIPT-D5-matrix.md](RECEIPT-D5-matrix.md) — Job 5 receipt, Opus
- [Docs/Reports/RECEIPT-D6-chat-queue.md](RECEIPT-D6-chat-queue.md) — Job 6 receipt, Opus
- [Docs/Reports/RECEIPT-D7-editor-terminal.md](RECEIPT-D7-editor-terminal.md) — Job 7 receipt, Sonnet
- [Docs/Reports/RECEIPT-D8-browser-viewer.md](RECEIPT-D8-browser-viewer.md) — Job 8 receipt, Sonnet
- [Docs/Specs/SPEC-D10-tabs-targets.md](../Specs/SPEC-D10-tabs-targets.md) — tabs, targets, settings trickle, spec
- [Docs/Reports/RECEIPT-D10-tabs-targets.md](RECEIPT-D10-tabs-targets.md) — Job 10 receipt, Opus, all eleven parts
- [Docs/Specs/SPEC-D11a-suite-controls.md](../Specs/SPEC-D11a-suite-controls.md) — suite controls, library hidden, spec
- [Docs/Reports/RECEIPT-D11a-suite-controls.md](RECEIPT-D11a-suite-controls.md) — Job D11a receipt, Sonnet
- [Docs/Specs/SPEC-D11b-mount-widget.md](../Specs/SPEC-D11b-mount-widget.md) — mount widget in, stub out, spec
- [Docs/Reports/RECEIPT-D11b-mount-widget.md](RECEIPT-D11b-mount-widget.md) — Job D11b receipt, Sonnet
- [Docs/Specs/SPEC-D11c-defaults-archive.md](../Specs/SPEC-D11c-defaults-archive.md) — widget defaults stripped, session settings archived, spec
- [Docs/Reports/RECEIPT-D11c-defaults-archive.md](RECEIPT-D11c-defaults-archive.md) — Job D11c receipt, Sonnet
- [Docs/audit/AUDIT-BRIEF-phase3.md](../audit/AUDIT-BRIEF-phase3.md) — read-only audit brief for the Phase 3 scope session, not yet sent
- [Docs/tests/test_region_edit.py](../tests/test_region_edit.py) — session agent: pass-through fixture removed, world renamed to environment
- [Docs/tests/test_presets.py](../tests/test_presets.py) — session agent: world renamed to environment
- [Docs/tests/test_change_modal.py](../tests/test_change_modal.py) — session agent: world renamed to environment

STRAY FILES
- Docs/Handoffs/HANDOFF-phase3.md — deleted in the working tree during this session. Git shows it deleted, not moved. Not recreated. The audit brief points at it. Six receipts (D4 through D10) carry Phase 3 sections that were to be copied into it before close; they were not, because the file is gone.
- Docs/Handoffs/HANDOFF-phase1-session-agent.md — also shows deleted in git. Not touched by this session.
- static/js/ade/arrange.js — still uses "world" as a canvas variable name. Old page, dies with it.
- library/grids/ — new folder from Job 10, grid state per session per window. Never pruned when a session ends.

GOALS DONE
- Wave 3 (Jobs 4, 5), Wave 4 (Jobs 6, 7, 8), Job 10, Jobs D11a, D11b, D11c built. Tests 105 to 252 passing.
- End Session closes its sockets. Environment is the only term in code outside the old page.
- One widget folder standard. Frames carry instance and region ids. One socket, many live regions. Tabs with one PTY each. Server-side save, pre-close hook, one Monaco loader, server-side grid state, session settings tier archived, widget defaults in global.json, vendored markdown, nested model picker, real controls on global settings, library hidden, stub gone, mount widget in.
- Redpen (Job 9) started by hand, stopped by Brandon partway. Things not working were not listed; Phase 3 picks them up with the old ADE UI as the design.
- Audit brief written. Agent not sent.

BRANDON'S TODOS
- Decide whether the Phase 3 handoff comes back from git or stays gone.
- Send the audit agent, Fable, Goto type, read-only, from the brief.
- Write Phase 3 specs after the audit report. Rule: port, not rebuild. One old ADE file per spec.
- Undecided, on purpose: matrix Load and Delete placement, swap on occupied drop, left and top resize handles, saved layout beating a carried grid, unhide for hidden models, ade_load and ade_new fate.
- Mount widget reads its new track id off the next track list. Two mounts at once could cross. Throwaway; fix if it bites.

CLOSER REVIEW
- Gets copy of review, not a contract.
- Handoff deletion: confirm with git whether it was Brandon's delete or a builder's. Do not restore unasked — Brandon.
- MEMORY.md warm start: Phase 2 build done through D11c, redpen stopped, audit brief written and unsent, Phase 3 is port-not-rebuild — closer.
- MEMORY.md durable facts to add: End closes sockets; one socket many regions; frames carry inst and region; widget folder standard; session tier archived beside master.json; widget defaults in global.json; set-to-default global page only; port-not-rebuild rule for Phase 3 — closer.
- CLAUDE.md map: add Docs/audit/, library/grids/, static/js/widgets/ per-widget folders; note shells/ and static/js/ade as old — closer.
- Worklog entry — closer, after Brandon's assignment.
- Ten receipts named the same harness conflict: a system reminder pushes bash reads and edits, the project rule says Read, Edit, Write tools. Every builder followed the project rule. Durable fact or not — closer.
