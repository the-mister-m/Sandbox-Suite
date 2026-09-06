Updated 2026-08-17 — Memory System redesign — see GLOBAL-RULES.md

# MEMORY — [project]
Rules: GLOBAL-RULES.md. Closer-only file. Lean: no superseded history.

## PROJECT
- Name: [name]
- Purpose: [one line]
- Stack / entry point: [e.g. server.py, static/index.html]
- Runs: [where/how]
- Key paths: [3–5 links]

## WARM START — 2026-09-06
- Situation: Phase 1 built and receipted. Phase 2 now scoped: ten docs written, nothing built.
- Last state: SCOPE-phase2-build.md, SPEC-D1 through SPEC-D8 (D3a/D3b split, no D2), and Docs/Handoffs/HANDOFF-phase3.md all exist. No code touched this session.
- Next move: the next session agent reads Docs/Scope/SCOPE-phase2-build.md in full, then spawns Job 1 (SPEC-D1-settings.md) as the Goto agent type with an Opus model override.
- Decisions, tightened:
  - Five settings tiers: global, session, widget, track, region. Session inherits global; every global key can be overridden on session. Update Default button, Are you sure modal.
  - One source per key. No resolver, no provenance, no live file reads at spawn.
  - Presets: save is one write, load is one copy, delete is one file; none check region state.
  - Change modal (Reset Region / Rewrite Cache / Cancel) fires on preset save, preset load, and any setting change when reset-on-change is off. Rewrite Cache keeps the transcript; cloud models rewrite cache cold.
  - Session templates hold tracks plus a map data slot, no regions. Matrix templates hold one window's grid and widgets. Both exist, separately.
  - Many sessions, many matrix windows per session across screens. Grid state lives with the window, not the session.
  - Autosave fires on shutdown for every open session. Recovered sessions appear in the open-sessions display, no reconnect.
  - Voice lives on the session; other speech options live on the chat widget. One chat speaks at a time.
  - Mini queue is its own widget, built now, skipped (and noted in the receipt) if nothing is attached to chat.
  - Viewer renders the full type list; Monaco (read-only) colors code.
  - Job models: Opus on Jobs 1, 3a, 3b, 5, 6; Sonnet on 4, 7, 8. Redpen (Job 9) runs by hand in session.
  - Rule: the session agent spawns every builder as the Goto agent type with a model override only, no other agent type. Builders stay in their lanes.
  - Tools stay in mind for Phase 3 and 4. Skills come later.
- Links: [Docs/Scope/SCOPE-phase2-build.md](Docs/Scope/SCOPE-phase2-build.md) · [Docs/Handoffs/HANDOFF-phase3.md](Docs/Handoffs/HANDOFF-phase3.md) · [Docs/Reports/SESSION-REVIEW-2026-09-06-phase2-scope.md](Docs/Reports/SESSION-REVIEW-2026-09-06-phase2-scope.md) · [SESSIONLOG.md](SESSIONLOG.md) · [TODO.md](TODO.md)
