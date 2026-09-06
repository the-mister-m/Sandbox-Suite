Updated 2026-08-17 — Memory System redesign — see GLOBAL-RULES.md

# MEMORY — [project]
Rules: GLOBAL-RULES.md. Closer-only file. Lean: no superseded history.

## PROJECT
- Name: [name]
- Purpose: [one line]
- Stack / entry point: [e.g. server.py, static/index.html]
- Runs: [where/how]
- Key paths: [3–5 links]

## WARM START — 2026-09-05
- Situation: Phase 1 specs written (A: foundation, B: engine, C: tools/context). No code changed.
- Last state: [Docs/Reports/SESSION-REVIEW-2026-09-05-phase1-specs.md](Docs/Reports/SESSION-REVIEW-2026-09-05-phase1-specs.md)
- Next move: Brandon vetoes or confirms "closed" as the retired-region-cache word (SPEC-A Part 4). Then next session reads the handoff and spawns Agent A.
- Providers: Ollama, Gemini, Claude only. Settings live on the region; preset is a snapshot, no live link. Any settings change resets the region (default on for cloud, off for local, per-region toggle); name/gates never reset. Model is a region choice (Provider/Model/Version). Track is a lane: name, root, order, regions. Channels gone, browser kept, Logic Pro gone; one tool table. Shells concept gone; speech stays, agent folder comes over. "spine" banned everywhere.
- Links: [Docs/Handoffs/HANDOFF-phase1-session-agent.md](Docs/Handoffs/HANDOFF-phase1-session-agent.md) · [Docs/Specs/SPEC-A-foundation.md](Docs/Specs/SPEC-A-foundation.md) · [Docs/Specs/SPEC-B-engine.md](Docs/Specs/SPEC-B-engine.md) · [Docs/Specs/SPEC-C-tools-context.md](Docs/Specs/SPEC-C-tools-context.md) · [TODO.md](TODO.md)
