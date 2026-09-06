Updated 2026-08-17 — Memory System redesign — see GLOBAL-RULES.md

# SESSIONLOG — [project]
Rules: GLOBAL-RULES.md. Append-only. Work done and decisions made.

## SESSION INDEX
(one line per session, newest first: date · name · 5–10 word summary)
- 2026-09-05 · spec-a-foundation · Agent A built SPEC-A: fetch, purge, server, reset language
- 2026-09-05 · phase1-specs · Phase 1 tree read, assessed, three specs + handoff written

## ENTRIES
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
