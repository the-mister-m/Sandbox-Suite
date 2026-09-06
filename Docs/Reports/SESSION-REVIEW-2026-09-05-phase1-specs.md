SESSION REVIEW — Sandbox Suite — 2026-09-05, ~19:30 to 21:18 (session agent: Fable, GoTo)

EDITS
- [Docs/Specs/SPEC-A-foundation.md](../Specs/SPEC-A-foundation.md) — Agent A: fetch, purge, server, shells folder gone, reset language. Sonnet + Redpen.
- [Docs/Specs/SPEC-B-engine.md](../Specs/SPEC-B-engine.md) — Agent B: three providers, provider interface, settings table with tiers, reset-on-change, presets as snapshots, track as lane. Opus.
- [Docs/Specs/SPEC-C-tools-context.md](../Specs/SPEC-C-tools-context.md) — Agent C: one tool table, browser kept, Logic Pro gone, one context builder, reseat renamed. Opus.
- [Docs/Handoffs/HANDOFF-phase1-session-agent.md](../Handoffs/HANDOFF-phase1-session-agent.md) — next session's read order, decisions as facts, every deferral with what not to break, expected file map.

No code was edited this session. Nothing was spawned.

STRAY FILES
- .DS_Store in root, Docs/, Mapdocs/, shells/, static/ — Agent A purges.
- __pycache__ in engine/, shells/, channels/ — Agent A purges.
- Docs/Reports/ — created by this review.
- Brandon's strip pass replaced every .py with its stripped twin between 19:20 and 19:47; the .stripped files are gone.

GOALS DONE
- Read the whole Phase 1 tree: engine, shells/ade, server.py, channels, hooks.
- Assessment delivered: nothing boots (eight missing imports), seven providers where scope wants three, one tool spread across five files, two global loaders, mixed preset semantics, death language inventory, repo dirt.
- Q/A settled the settings model, tool registry shape, provider set, track definition, reset language rule.
- Three build specs and one handoff written.

DECISIONS SETTLED (Brandon's words, not mine)
- Providers: Ollama, Gemini, Claude only. Codex out.
- Settings on the region, preset is a snapshot, no live link. Any change resets: default on for cloud, off for local, per-region toggle. Name and gates never reset. TTL change resets (Brandon: fine).
- Model is a region choice. Provider, Model, Version picker. Global holds library, preset editor, model manager, voices.
- Track is a lane: name, root, order, regions.
- Channels gone, browser kept, Logic Pro gone. One tool table, room for the tool library.
- Shells concept gone. Speech stays, agents folder comes over.
- Death language: agents close and reset; killswitch, pkill, dead letters stay.
- Preamble to injections/global, ADE room file to injections/session (Brandon: appreciated).
- Step mode and per-tool read gates dropped (Brandon: leave it out).
- "spine" banned everywhere.

MY CHOICES, NOT YET VETOED
- "closed" as the vocabulary for a retired region cache (SPEC-A Part 4).
- Presets move to library/presets.
- claude_mode oneshot kept.

DEFERRED (full list with what-not-to-break in the handoff)
- Swap tool (Brandon's session). Claude native plus ADE tools bridge. Chat pane on a track. Suite Page UI. Speech rewrite. IDE chat settings. JavaScript death words. Model manager UI.

BRANDON'S TODOS
- Veto or confirm "closed" before Agent A spawns.
- Next session: read the handoff, spawn A.

CLOSER REVIEW
- Gets copy of review, not a contract.
- Update INDEX.md with the four Docs files and this review — closer.
- Append SESSIONLOG.md entry for this session — closer.
- Write the warm start block in MEMORY.md: situation (Phase 1 specs written, nothing built), last state (this review), next move (spawn A after the "closed" veto), links to handoff and specs — closer.
- Update the MAP section of CLAUDE.md: Docs/Scope, Docs/Specs, Docs/Handoffs, Docs/Reports, Mapdocs/rewrite phase maps, plus the code folders as they stand today — closer.
- TODO.md does not exist. Create it with Brandon's two todos above — closer.
