# PROJECT SUMMARY



# MAP

- Docs/Scope/ — cleanup scope doc, Phase 2 build scope (SCOPE-phase2-build.md), Phase 3 session agent scope (SCOPE-phase3-session-agent.md), Phase 4 session agent scope (SCOPE-phase4-session-agent.md)
- Docs/Specs/ — build specs (A, B, B2, C, D-series: D1, D3a, D3b, D4, D5, D6, D7, D8; E-series: E1 through E14, Phase 3 session agent, SPEC-arrange-widget.md; Phase 4: SPEC-phase4-fixes-sonnet.md, SPEC-phase4-test-waves.md, SPEC-phase4-timeline-target.md, SPEC-phase4-fixes-B.md, SPEC-phase4-fixes-C.md, SPEC-phase4-arrange-maps.md, SPEC-phase4-fixes-D.md)
- Docs/Handoffs/ — session-to-session handoffs, Phase 3 handoff (HANDOFF-phase3.md)
- Docs/Reports/ — receipts, session reviews, E-series receipts (E1 through E14, E3b, E6b), Phase 3 redpen checklist, Phase 4 receipts (RECEIPT-phase4-* — S1 S1-rerun S2 S3, B1-B4, C1-C4, D1-D3, F-B–F-G, W1-W5) and SESSION-REVIEW-phase4-2026-09-07.md
- Docs/tests/ — test suite (moved from tests/): test_environments.py, test_sockets.py among others
- Docs/audit/ — read-only audit briefs; arrange-old/ holds arrange.js, region.js, cables.js parked for Phase 4
- Docs/reference/ide-panes/ — old pre-Phase-1 pane files, reference only
- Docs/Reports/phase3-test/ — Phase 3 test-pass specs and harness output
- Docs/HOWTO-frames.md — client-to-server and server-to-client ADE frame tables, drawn from ade/frames.py and ade/web_io.py
- Docs/tests/matrix_harness.py — headed Playwright test harness
- Mapdocs/rewrite phase maps/ — six phase map files
- Userdocs/ — Brandon's own docs
- engine/ — engine code, rebuilt by specs A/B/B2/C: tools.py, tools_web.py, settings.py, waypoint.py among others
- shells/ade/ — pre-Phase-1 ADE code, old, Phase 3 design reference
- hooks/ — ade_pretooluse_hook.py
- injections/ — models, presets (moved to library/presets/), skills, global/ (was preamble.md), session/ (was shells/), track/, region/ (context files)
- library/presets/ — settings presets (moved from injections/presets/)
- library/registry/ — widget and provider registries
- library/grids/ — server-side grid state, per session per window
- library/maps/ — archived doc generator maps (Music History.json, Music History.2.json, Desktop.json)
- static/ — suite.html, matrix.html placeholders; phase 2 JavaScript
- static/js/widgets/<name>/ — one folder per widget, shared/ holds cross-widget modules (F2 added root-browser.js, add-controls.js, settings-rows.js, derived.js); Phase 3 ports added strip, devagent, anchor-chat, gate-list, timeline, queue-log, ledger, changes, messenger, transcript; arrange/ added by F4, one file, plan read from and written to a doc generator project file; Phase 4's S3 regroups widget folders into chat, queue, usertools, agent, adetools, shared
- static/vendor/ — vendored libraries (Monaco, marked, DOMPurify, xterm)
- server.py — Flask, ADE socket, API routes
- speech.py — speech handling

Root files: .env, .sandbox_config.json, .sessions_index.json, global.json, log.jsonl, machines.json, policy.json, queue.json, requirements.txt, waypoint.jsonl

## INDEX SECTIONS

- DOCS — INDEX.md 
- WIKIS / EXTERNAL — INDEX.md 

# PROJECT RULES

- "spine" is a banned word; comments are label, function, state only.

# POINTERS

- Memory: /Users/moth3rship/Desktop/AI Design/Sandbox Suite/MEMORY.md
- Session log: /Users/moth3rship/Desktop/AI Design/Sandbox Suite/SESSIONLOG.md
- Index: /Users/moth3rship/Desktop/AI Design/Sandbox Suite/INDEX.md
- TODO: /Users/moth3rship/Desktop/AI Design/Sandbox Suite/TODO.md
- Mapdocs: /Users/moth3rship/Desktop/AI Design/Sandbox Suite/Mapdocs/rewrite phase maps/
- Sessions: /Users/moth3rship/Desktop/AI Design/Sandbox Suite/Docs/
- Map: see # MAP above
- Doc Generator/docs/ holds SPEC-map-arrange-skin.md; Doc Generator/src/shared/types.ts holds the shared PLAN JSON
