SESSION REVIEW — Sandbox Suite recon: Open Design runtimes — 2026-09-11 21:46 EDT to 2026-09-11 21:55 EDT

EDITS
- [Mapdocs/MAP-open-design-runtimes.md](../../Mapdocs/MAP-open-design-runtimes.md) — new mapdoc: daemon runtime adapters + stream layer for Open Design
- [Docs/Reports/RECEIPT-recon-open-design-runtimes.md](RECEIPT-recon-open-design-runtimes.md) — this receipt

STRAY FILES
- none

GOALS DONE
- defs/shared.ts — 1,689 B read
- defs/claude.ts — 7,617 B read
- defs/aider.ts — 3,092 B read
- defs/amp.ts — 2,716 B read
- defs/amr.ts — 24,770 B read
- defs/antigravity.ts — 11,023 B read
- defs/atomcode.ts — 3,077 B read
- defs/byok-opencode.ts — 1,504 B read
- defs/codebuddy.ts — 5,980 B read
- defs/codex.ts — 28,682 B read
- defs/copilot.ts — 3,893 B read
- defs/cursor-agent.ts — 4,008 B read
- defs/deepseek-harness.ts — 4,398 B read
- defs/deepseek.ts — 2,813 B read
- defs/devin.ts — 1,444 B read
- defs/grok-build.ts — 4,535 B read
- defs/hermes.ts — 2,013 B read
- defs/kilo.ts — 629 B read
- defs/kimi.ts — 1,307 B read
- defs/kiro.ts — 674 B read
- defs/mimo.ts — 972 B read
- defs/opencode.ts — 7,404 B read
- defs/pi.ts — 4,278 B read
- defs/qoder.ts — 2,129 B read
- defs/qwen.ts — 1,676 B read
- defs/reasonix.ts — 2,826 B read
- defs/trae-cli.ts — 738 B read
- defs/vibe.ts — 635 B read
- registry.ts — 3,176 B read (whole)
- detection.ts — 34,401 B read (whole)
- claude-stream.ts — 50,166 B read (whole)
- json-event-stream.ts — 56,749 B read (whole)
- runs.ts — ~8,557 B read of 106,423 B (grep + targeted ranges; no spawn/permission/design-system hits)
- auth.ts — ~4,867 B read of 31,216 B (grep + targeted range)
- chat-prompt-inputs.ts — ~12,325 B read of 36,611 B (grep + targeted ranges)
- chat-run-messages.ts — ~1,147 B read of 31,106 B (grep + targeted range)
- agent-protocol/README.md — 6,081 B read (whole)
- agent-protocol/core/index.ts — 251 B read (whole)
- agent-protocol/core/json-line-stream.ts — 10,008 B read (whole)
- agent-protocol/acp/index.ts — 588 B read (whole)
- agent-protocol/acp/types.ts — 1,073 B read (whole)
- agent-protocol/acp/session.ts — ~6,223 B read of 65,304 B (targeted: permission-handling range)
- agent-protocol/acp/rpc.ts — ~949 B read of 14,638 B (targeted: choosePermissionOutcome)
- agent-protocol/acp/{json,emission-provenance,stdio-mcp,constants,tool-execution-lifecycle,updates,models,session-params}.ts — grep only, not read (message-type-name search)
- TOTAL bytes read: ≈333,083 B (≈299,015 B full-file reads + ≈34,068 B targeted ranges), against the 180k-token / 250k-total budget
- Mapdoc written with all 11 required sections: PURPOSE, FILE MAP, DETECTION, SPAWN, DEF SCHEMA, STREAM AND EVENTS, PERMISSIONS, SESSION AND RESUME, INJECTION, PROTOCOL LAYER, UNKNOWNS

BRANDON'S TODOS
- none

CLOSER REVIEW
- confirm mapdoc sections match the exact required order and the 26-row diff table — Brandon
- decide whether the UNKNOWNS list (spawn call site, mock-bin handling, session DB path) warrants a follow-up recon into `launch.ts`/`chat-run-lifecycle.ts`/`db.js` — Brandon
