# PROJECT SUMMARY



# MAP

- Docs/Scope/ — cleanup scope doc, Phase 2 build scope (SCOPE-phase2-build.md), Phase 3 session agent scope (SCOPE-phase3-session-agent.md), Phase 4 session agent scope (SCOPE-phase4-session-agent.md); two subfolders: Code Canvas port/ (phase 0 briefs plus phases 1 to 6 scopes, written 2026-09-12; SEAM-phase0-phase1-targets.md written unasked mid-phase-0, Brandon has not ruled on it; SCOPE-phase3F-file-mode.md — Phase3F file mode scope, 2026-09-13) and sandbox port/ (the earlier phase scopes above, moved there by Brandon); Code Canvas port's phase 1-6 scopes renumbered into the four-phase structure — SCOPE-phase2-graph-widgets.md, SCOPE-phase3a-tools-canvas.md, SCOPE-phase3b-code-annotate.md, SCOPE-phase4-motion-3d.md, SCOPE-old-phase4-6-motion-agent-threejs.md (superseded)
- Docs/Specs/ — build specs (A, B, B2, C, D-series: D1, D3a, D3b, D4, D5, D6, D7, D8; E-series: E1 through E14, Phase 3 session agent, SPEC-arrange-widget.md; Phase 4: SPEC-phase4-fixes-sonnet.md, SPEC-phase4-test-waves.md, SPEC-phase4-timeline-target.md, SPEC-phase4-fixes-B.md, SPEC-phase4-fixes-C.md, SPEC-phase4-arrange-maps.md, SPEC-phase4-fixes-D.md); Code Canvas port/ — ten phase 0 briefs (sonnet1-surfaces through opus5-fix-and-test), seven in Phase0 Surfaces+Wayfinder/ subfolder, three at top level; SPEC-session-agent-phases1-3.md plus three phase folders for phases 1 to 3 (Phase1 Boilerplate/, Phase2 Graph Widgets/, Phase3 Canvas 2D/), seventeen job specs total; Phase3F File Mode/ — job specs A, B, C, D, E, R, H, K plus SPEC-phase3F-K-sonnet-code-file-mode.md, 2026-09-13
- Docs/Handoffs/ — session-to-session handoffs, Phase 3 handoff (HANDOFF-phase3.md)
- Docs/Reports/ — receipts, session reviews, E-series receipts (E1 through E14, E3b, E6b), Phase 3 redpen checklist, Phase 4 receipts (RECEIPT-phase4-* — S1 S1-rerun S2 S3, B1-B4, C1-C4, D1-D3, F-B–F-G, W1-W5) and SESSION-REVIEW-phase4-2026-09-07.md; phase0-redpen/, phase0-rerun/, phase0-rerun2/, phase0-onceover/, phase0-final/ — one screenshot/console-dump folder per phase 0 redpen; Code Canvas port phases 1-3 receipts (RECEIPT-phase1-*, RECEIPT-phase2-*, RECEIPT-phase3-*) and SESSION-REVIEW-2026-09-12-phases1-3-build.md; phase1-headed/, phase2-headed/, phase2-headed-rerun/, phase2-2H-fix/, phase3-3A/, phase3-3B/, phase3-3C/, phase3-headed/, phase3-3H-fix2/ — one screenshot/console-dump folder per headed run; RECEIPT-phase3F-A through P, R-A through R-E and SESSION-REVIEW-2026-09-13-phase3F-file-mode.md — Phase3F file mode receipts and review; phase3F-headed/, phase3F-headed-keys/, phase3F-headed-tools/, phase3F-headed-code/, phase3F-headed-drag/, phase3-headed-3F/ — one evidence folder per Phase3F headed run, 2026-09-13
- Docs/tests/ — test suite (moved from tests/): test_environments.py, test_sockets.py among others; phase0_redpen.py, phase0_rerun.py, phase0_rerun2.py, phase0_onceover.py, phase0_final.py, phase0_socket_goodbye.py, phase0_raw_close.py — phase 0 headed harnesses; phase1_headed.py, phase2_headed.py, phase3_3A_core.py, phase3_3B_canvas.py, phase3_3C_tools.py, phase3_headed.py — Code Canvas port phases 1-3 headed harnesses; phase3F_headed.py, phase3F_headed_keys.py, phase3F_headed_tools.py, phase3F_headed_code.py, phase3F_headed_drag.py, phase3_headed_trace.py — Phase3F file mode headed harnesses, 2026-09-13
- Docs/audit/ — read-only audit briefs; arrange-old/ holds arrange.js, region.js, cables.js parked for Phase 4
- Docs/reference/ide-panes/ — old pre-Phase-1 pane files, reference only
- Docs/Reports/phase3-test/ — Phase 3 test-pass specs and harness output
- Docs/HOWTO-frames.md — client-to-server and server-to-client ADE frame tables, drawn from ade/frames.py and ade/web_io.py
- Docs/HOWTO-repipe.md — pipes test widget repipe instructions, Phase 1 (1D)
- Docs/tests/matrix_harness.py — headed Playwright test harness
- Docs/stickies/ — session-long agent notes, folded into the session review at close
- Docs/scratchpad/ — phase3F-fixture.html, phase3F-fixture-2.html — plain-HTML fixtures for the Phase3F headed walks, 2026-09-13
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
- library/graphs/ — graph.json, first target seeded, Code Canvas port Phase 1
- static/ — suite.html, matrix.html placeholders; phase 2 JavaScript
- static/js/widgets/<name>/ — one folder per widget, shared/ holds cross-widget modules (F2 added root-browser.js, add-controls.js, settings-rows.js, derived.js); Phase 3 ports added strip, devagent, anchor-chat, gate-list, timeline, queue-log, ledger, changes, messenger, transcript; arrange/ added by F4, one file, plan read from and written to a doc generator project file; Phase 4's S3 regroups widget folders into chat, queue, usertools, agent, adetools, shared; Code Canvas port added wayfinder/ (shared, cards, force, stack, files) and codecanvas/ (shared, canvas, tools, code), renamed from graph/ and canvas/ 2026-09-13, picker groups match folder names; codecanvas/targets/ — Targets widget, Phase3F job A, 2026-09-13
- static/js/matrix/bus.js — MX.bus: on/off/emit, carries surface.layout/surface.widget/surface.name over one widget_bus frame, drops frames stamped with its own tab id
- static/vendor/ — vendored libraries (Monaco, marked, DOMPurify, xterm); wayfinder/ and dom-to-image/ added by Code Canvas port phases 2-3
- server.py — Flask, ADE socket, API routes; /api/library/graphs/scan calls Wayfinder's analyzer in ../Wayfinder/out/ts/analyzer/ (WAYFINDER_ROOT overrides); /raw/<path> serves a file by absolute path, Phase3F job H run 3, for the canvas iframe's base href; restart to pick up route changes
- speech.py — speech handling

Root files: .env, .sessions_index.json, global.json, log.jsonl, machines.json, policy.json, queue.json, requirements.txt, waypoint.jsonl

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
