SESSION REVIEW — Sandbox Suite — 2026-09-07 — timestamps: ask Brandon

Session agent: Fable. Read pass over static/js/widgets, static/js/matrix,
HOWTO-frames.md, ade/web_io.py, ade/frames.py greps, engine/web_io.py
greps, server.py greps. Four specs written. No code edited.

EDITS
- [SCOPE-phase4-session-agent.md](../Scope/SCOPE-phase4-session-agent.md) — brief for the next session agent, gates, model policy
- [SPEC-phase4-fixes-sonnet.md](../Specs/SPEC-phase4-fixes-sonnet.md) — S1 S2 S3, exact lines
- [SPEC-phase4-test-waves.md](../Specs/SPEC-phase4-test-waves.md) — waves B C D, read lines, checklists
- [SPEC-phase4-timeline-target.md](../Specs/SPEC-phase4-timeline-target.md) — timeline, mount, devagent target

STRAY FILES
- none

GOALS DONE
- Reviewed SPEC-test-waves-BC.md; it tests screens, not code
- Found the timeline add buttons: old bare buttons opened the settings modal, now devagent; shared form was already mounted at timeline.js:1292
- Read every widget, shared module, and the matrix framework
- Named the systemic defects: roster race on bind, rows versus tracks in five widgets, untagged stream frames, HOWTO covers half the senders
- Named per-widget defects, one line each, carried into the test spec as read lines
- Confirmed server facts: nameless track defaults to "untitled"; frames.py:322 blocks session root; ledger_detail sender exists in engine/web_io.py; every "no caller" frame has a caller
- Could not pin the `tracks_lock` error to a handler; F7 adds the frame type to the catch-all

BRANDON'S TODOS
- Session id for the driven session at Gate 0
- Model per box at each wave gate
- Plan file name for D2 arrange
- Whether D3 chat runs

CLOSER REVIEW
- Gets copy of review, not a contract.
- Retract from earlier in session: I told Brandon timeline had no add form; it does at line 1292. Corrected in turn. — closer notes
- SPEC-test-waves-BC.md is superseded by SPEC-phase4-test-waves.md; INDEX line should say so — closer
- MEMORY.md warm start: Phase 4 is specced, not started; next move is Gate 0 with a fresh session agent — closer
- INDEX.md and SESSIONLOG.md lines for the four files and this receipt — closer
