SESSION REVIEW — Sandbox Suite — 2026-09-05 23:02 to 2026-09-06 01:36 EDT (03:02Z to 05:36Z), grepped from transcript 3ca11b95-04a0-448a-b8e6-33fdc4715c17.jsonl

Session type: Phase 2 scoping. No code touched. Chat and greps until the
gate opened, then ten docs written.

EDITS
- [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md) — session agent scope: wave map, job table with models, tree state, every decision, receipt format, redpen checklist
- [SPEC-D1-settings.md](../Specs/SPEC-D1-settings.md) — session and widget tiers, preset rules, change modal, session templates, registries, context loader
- [SPEC-D3a-worlds.md](../Specs/SPEC-D3a-worlds.md) — world per session, list, save, end, autosave on shutdown, boot recovery
- [SPEC-D3b-sockets.md](../Specs/SPEC-D3b-sockets.md) — socket per session, one gate vocabulary, route stubs, window count
- [SPEC-D4-suite-library.md](../Specs/SPEC-D4-suite-library.md) — Suite Page, open-sessions display, Update Default, library tabs
- [SPEC-D5-matrix.md](../Specs/SPEC-D5-matrix.md) — matrix window, grid, Session and New Widget corners, widget frame, stub, matrix templates
- [SPEC-D6-chat-queue.md](../Specs/SPEC-D6-chat-queue.md) — chat, mini queue with skip rule, queue
- [SPEC-D7-editor-terminal.md](../Specs/SPEC-D7-editor-terminal.md) — editor and terminal
- [SPEC-D8-browser-viewer.md](../Specs/SPEC-D8-browser-viewer.md) — browser, viewer, shared read-only Monaco
- [HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md) — parked Phase 3 decisions, what Phase 2 pipes in, old ADE code on disk

STRAY FILES
- None.

GREPS RUN, NO EDITS
- Settings and context layer names in engine. Providers. Widgets. Library. Mapdocs. Old project reset path. Daemon queue callers and shell references. Six soft reads. Reset helpers. Provenance. Global keys. Region rows by block.

GOALS DONE
- Discrepancies between the cleanup scope and the Phase 1 receipts named.
- Phase 2 scoped by gap risk, drift risk, blast radius, in waves.
- Every open question answered by Brandon before the gate opened.
- Ten docs written with nothing added beyond what was discussed. Two additions of mine caught and removed, then one restored on Brandon's ask with the Session panel switch.

DECISIONS MADE THIS SESSION, FOR MEMORY
- Five settings tiers. Session inherits global, every key overrides. Update Default button with an Are you sure modal.
- One source per key. No resolver, no provenance, no live file reads at spawn.
- Preset rules: save one write, load one copy, delete one file, none check region state.
- Change modal: Reset Region, Rewrite Cache, Cancel. Fires on save, load, and setting change when reset-on-change is off. Rewrite Cache keeps the transcript; cloud rewrites cold.
- Session templates hold tracks and a map data slot, no regions. Matrix templates hold one window's grid and widgets. Both exist.
- Many sessions, many matrix windows per session across screens. Grid state lives with the window.
- Autosave on shutdown. Recovered sessions appear in the open-sessions display, no reconnect.
- Voice on session. Speech options on chat widget. One chat speaks at a time.
- Mini queue is its own widget, built now, skipped if nothing is attached to chat.
- Viewer renders the full list. Monaco colors code.
- Models: Opus on Jobs 1, 3a, 3b, 5, 6. Sonnet on 4, 7, 8. Redpen in session.
- Session agent spawns builders as Goto with model override only. Builders stay in lanes.
- Tools stay in mind for Phase 3 and 4. Skills later.

BRANDON'S TODOS
- Fix the session preset naming in his own notes; now session template.

CLOSER REVIEW
- Gets copy of review, not a contract.
- INDEX.md entries for the ten docs — closer
- SESSIONLOG.md entry for this session — closer
- MEMORY.md warm start rewritten to Phase 2 build, next move: spawn Job 1 from SCOPE-phase2-build.md — closer
- CLAUDE.md map: Docs/Handoffs now has HANDOFF-phase3.md; Docs/Specs has D-series — closer
- Worklog entry — closer
- Rule conflict to record: harness asked for Bash writes, Brandon's rule says dedicated tools; Brandon's rule followed — closer
