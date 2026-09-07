SESSION REVIEW — Sandbox Suite — Phase 3 scope — [timestamps: closer greps transcript]

Session agent: Fable. Read the socket lane backend, the full old ADE
front end, ledger, rails, settings rows, the mount widget and model
picker. Scoped Phase 3 in chat with Brandon, then wrote the briefs.

EDITS
- [Docs/Scope/SCOPE-phase3-session-agent.md](../Scope/SCOPE-phase3-session-agent.md) — session agent brief, waves, decisions
- [Docs/Specs/SPEC-E1-session-root.md](../Specs/SPEC-E1-session-root.md) — session root rung
- [Docs/Specs/SPEC-E2-ledger-per-session.md](../Specs/SPEC-E2-ledger-per-session.md) — ledger per environment
- [Docs/Specs/SPEC-E3-lifecycle.md](../Specs/SPEC-E3-lifecycle.md) — shutdown modal, six lifecycle fixes
- [Docs/Specs/SPEC-E4-archives-context.md](../Specs/SPEC-E4-archives-context.md) — library toggle, transcript route, context follows reset
- [Docs/Specs/SPEC-E5-matrix-chrome.md](../Specs/SPEC-E5-matrix-chrome.md) — picker columns, agent strip, session corner button
- [Docs/Specs/SPEC-E6-devagent.md](../Specs/SPEC-E6-devagent.md) — dev widget, replaces the track settings modal
- [Docs/Specs/SPEC-E7-chat-gatelist.md](../Specs/SPEC-E7-chat-gatelist.md) — old chat and gate list as widgets
- [Docs/Specs/SPEC-E8-timeline.md](../Specs/SPEC-E8-timeline.md) — timeline port, opus
- [Docs/Specs/SPEC-E9-queue.md](../Specs/SPEC-E9-queue.md) — queue log port
- [Docs/Specs/SPEC-E10-ledger.md](../Specs/SPEC-E10-ledger.md) — ledger port
- [Docs/Specs/SPEC-E11-changes.md](../Specs/SPEC-E11-changes.md) — changes port
- [Docs/Specs/SPEC-E12-messenger.md](../Specs/SPEC-E12-messenger.md) — messenger port
- [Docs/Specs/SPEC-E13-transcript.md](../Specs/SPEC-E13-transcript.md) — transcript widget
- [Docs/Specs/SPEC-E14-retire.md](../Specs/SPEC-E14-retire.md) — delete old pages, redpen checklist

STRAY FILES
- none

AUDIT
Old pages cannot boot: three panes they import are gone and both socket
owners open the path with no session id. Backend: Shutdown Suite skips
autosave because os._exit skips atexit; the ledger directory is one
global repointed per turn, so sessions misfile and every feed is
suite-wide; the workspace root is one global moved by every load;
session settings never persist on write; an in-turn ask with no window
hangs; the ade_end frame leaves sockets bound to a dead environment;
the old sessions route crashes. Provenance still served, gate answer
translation still present, both contrary to the handoff. All fixed in
E1 through E4.

GOALS DONE
- Audit of socket lane and old front end, in chat
- Phase 3 scoped, fourteen specs and the session agent brief written

BRANDON'S TODOS
- Lift the gate for the Phase 3 session agent, wave 1
- Decide arrange and the map editor merge in Phase 4
- Bring the other app's codebase to the track settings session

CLOSER REVIEW
- Gets copy of review, not a contract.
- Append one line per file above to INDEX.md — closer
- Append the session entry to SESSIONLOG.md — closer
- Write the Phase 3 warm start in MEMORY.md, update the CLAUDE.md map for Docs/Scope and Docs/Specs — closer
- Close the worklog — closer
