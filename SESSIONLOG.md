Updated 2026-08-17 — Memory System redesign — see GLOBAL-RULES.md

# SESSIONLOG — [project]
Rules: GLOBAL-RULES.md. Append-only. Work done and decisions made.

## SESSION INDEX
(one line per session, newest first: date · name · 5–10 word summary)
- 2026-09-06 · phase2-scope · Phase 2 scoped in waves, ten docs written, no code touched
- 2026-09-05 · spec-b-engine · Agent B built SPEC-B: providers, settings table, region reset rule
- 2026-09-05 · spec-a-foundation · Agent A built SPEC-A: fetch, purge, server, reset language
- 2026-09-05 · phase1-specs · Phase 1 tree read, assessed, three specs + handoff written

## ENTRIES
### 2026-09-06 — phase2-scope
- DONE: Phase 2 scoped by gap risk, drift risk, and blast radius into four waves plus a redpen close; every open question answered by Brandon before the gate opened; ten docs written (scope, eight D-series specs, Phase 3 handoff), nothing built.
- DECIDED: see MEMORY.md warm start's durable facts list.
- OPEN: see TODO.md.
- CONDUCT: a harness notice asked for Bash file writes this session; Brandon's rule requires dedicated tools so edits stay visible; Brandon's rule was followed.
- LINKS: [Docs/Reports/SESSION-REVIEW-2026-09-06-phase2-scope.md](Docs/Reports/SESSION-REVIEW-2026-09-06-phase2-scope.md) · [Docs/Scope/SCOPE-phase2-build.md](Docs/Scope/SCOPE-phase2-build.md)

### 2026-09-05 — spec-b-engine
- DONE: Built SPEC-B-engine. New `engine/settings.py` owns every setting in one table (region/track/global tiers, provider blocks, preset and live columns). Providers cut to ollama/gemini/claude behind one interface — litert, llamacpp and codex classes deleted along with `settings_stack.py` and `codex_provider.py`. `run_turn` now routes through `provider_for` and hands each provider a settings dict, no kwargs. Rails cut from ten to four. Regions build their bag from `region_defaults`, save the full bag, and reset-on-change replaces the region on a settings edit. Presets moved to `library/presets/`. Boot green, 26 tests passing.
- DECIDED: `harness_keys()` follows spec 2b's eight-key definition, not 1b's two-key sentence. `overlay_rows` stays on the Region rather than entering the settings bag. The five preset files' `gates` dicts were converted to `overlay_rows` at move time rather than dropped with a warning. `send_models` went onto `AdeSenders` because the spec named the wrong file and engine/web_io.py is off-limits. Six per-tool keys left as `.get()` reads for C.
- FOUND: the previous agent B left nothing on disk — every file was either pristine or matched agent A's receipt, and commit `774e06e` covers all of it. Built from scratch.
- OPEN: five read-budget ranges in SPEC-B are stale; corrected ranges are in the receipt. `/api/settings/resolved` dropped its `provenance` field.
- LINKS: [Docs/Reports/RECEIPT-B-engine.md](Docs/Reports/RECEIPT-B-engine.md)

### 2026-09-05 — spec-a-foundation
- DONE: Built SPEC-A-foundation (fetch from LLM Sandbox, purge legacy files, shells/ade→ade/ move, server.py dead-route removal, claude_sdk.py folded into policy.py, Part 4 kill→close rename table, tests/test_boot.py). Boot green throughout; first commit made on main (`c00242d`, "Phase 1 A: foundation").
- DECIDED: `/api/rooms` and `/api/saves` left removed despite still being called by static/js/control.js — their backing shells.conference module was never fetched into this repo, so restoring them breaks boot. Flagged, not resolved.
- OPEN: see TODO.md; the /api/rooms /api/saves conflict above needs Brandon's call.
- LINKS: [Docs/Reports/RECEIPT-A-foundation.md](Docs/Reports/RECEIPT-A-foundation.md)

### 2026-09-05 — phase1-specs
- DONE: Read whole Phase 1 tree (engine, shells/ade, server.py, channels, hooks); gave assessment; Q/A settled settings model, tool registry, provider set, track definition, reset language; wrote three build specs plus one handoff. No code changed, nothing spawned.
- DECIDED: see review's DECISIONS SETTLED section.
- OPEN: see TODO.md.
- LINKS: [Docs/Reports/SESSION-REVIEW-2026-09-05-phase1-specs.md](Docs/Reports/SESSION-REVIEW-2026-09-05-phase1-specs.md) · [Docs/Handoffs/HANDOFF-phase1-session-agent.md](Docs/Handoffs/HANDOFF-phase1-session-agent.md)

### 2026-09-05 — B2-fixes
- DONE: agent B2 built SPEC-B2-fixes.md (send_models moved home, provenance added to /api/settings/resolved, Track.apply_edits). 33 tests pass, boot green.
- LINKS: [Docs/Reports/RECEIPT-B2-fixes.md](Docs/Reports/RECEIPT-B2-fixes.md)

### 2026-09-05 — C-tools-context
- DONE: agent C built SPEC-C-tools-context.md — engine/tools.py holds one 19-row tool table (schema, marker, hint, gate prompt, executor); channels/ and engine/channel_registry.py deleted, the browser moved to engine/tools_web.py, the four logic tools removed everywhere; agent_loop's twenty approve_* functions and _execute_tool collapsed into one execute_tool; compiler's compile_injections became build_context with tiered injections/global/ and injections/session/; policy.json regenerated from tools.gate_edges(). 53 tests pass, boot green.
- LINKS: [Docs/Reports/RECEIPT-C-tools-context.md](Docs/Reports/RECEIPT-C-tools-context.md)

### 2026-09-05 — phase1-build session agent
- DONE: Picked up after the cut-off session. Reviewed RECEIPT-B, confirmed harness_keys by grep, wrote SPEC-B2-fixes, spawned B2 (Sonnet) then C (Opus). Phase 1 engine build is complete on disk, nothing committed. Session review written, Closer spawned.
- DECIDED: overlay_rows stays on Region. Provenance fixed by B2. Track edits enforced by Track.apply_edits. logic-pro.md deletion accepted. initiate gated.
- OPEN: see review's BRANDON'S TODOS and HANDOFF DEFECTS.
- LINKS: [Docs/Reports/SESSION-REVIEW-2026-09-05-phase1-build.md](Docs/Reports/SESSION-REVIEW-2026-09-05-phase1-build.md)
