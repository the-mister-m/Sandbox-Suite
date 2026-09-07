# HANDOFF — Phase 3 test — Sandbox Suite

Written 2026-09-06 after 6:52pm by the Phase 3 build session agent (Fable),
at Brandon's request, for the session that tests the Phase 3 UI. Brandon
ended the build session and asked for this instead of copy-pasting. Nothing
here is invented. Where a line is my claim and not verified, it says so.

## Where things stand

- Phase 3 is built and closed. Review: Docs/Reports/SESSION-REVIEW-2026-09-06-phase3-build.md
- Warm start and durable facts: MEMORY.md, written by the closer.
- Redpen checklist: Docs/Reports/CHECKLIST-phase3-redpen.md. Brandon's, by
  hand. Brandon parked it: "no redpen right now."
- Nothing was run live during the build. No server, no browser, no test
  suite. Every Python file compiles, every JavaScript file passed node check.
- 124 uncommitted paths on main. Nothing committed.
- Brandon has started driving the matrix window and said there are a lot of
  UI issues and things he already wants to change.
- One item the closer could not settle: static/js/widgets/ledger/ledger.js
  reads track names from the rows array of track_list, not the tracks
  array. Region rows with id and name are in tracks. Left as is.

## What Brandon said, this conversation

- Asked whether the UI issues came from using Sonnet builders. My answer:
  mostly no. Nothing was run, builders could not open the page or its
  stylesheets under the read rule, and ten widgets landed in parallel with
  no integration pass. Opus on the timeline hit the same class of issues.
- Asked how much more expensive it is to send agents in to test, and whether
  they must read the whole brief and codebase. Wants cost-effective test
  agents that do not need him looking at the UI, because the briefs are
  quality.
- Said it seems faster to test after the build than to have builders test
  themselves. A previous build had every builder self-test. He has no clue
  what the per-agent cost is about to be.
- Has Chrome. Wants agents to test headed so he can watch and give notes.

## What I told Brandon, my claims, not verified

- Test agents do not read the brief or the codebase. They read their
  checklist lines, their widget file, a console error dump, and a
  screenshot. Agents can read PNG files.
- Cost per test agent about 50 to 150K tokens. Screenshots about 1.5K each.
  A one-time setup agent about 60K.
- Shape of the work: one setup agent starts the server, makes a session,
  writes a headless or headed browser script that loads a matrix window,
  mounts one widget by type, dumps console errors and a screenshot. Then one
  agent per widget in parallel: run the harness, look, fix inside its own
  file only, re-run, receipt with before and after shots.
- Headed is possible with Playwright launching a visible Chrome, or
  attaching to Brandon's running Chrome through its remote debugging port.
  Brandon's notes come to the session agent, who relays them to the running
  agent by message.
- Self-test pays off for backend jobs: run the tests, paste output.
- Unknown: whether the Playwright Python package is installed. Check, no
  writes: `python3 -c "import playwright; print('playwright ok')"`.
  Expected `playwright ok`, or ModuleNotFoundError meaning one pip install.
  Not run. Brandon did not lift the gate.

## Builder prompt shape that held during the build

Not on disk anywhere else. What every prompt carried:

- Read rule: read the spec first, then only its read list. Four named
  fallback files only when the spec is silent, each logged. Grep only to
  find callers of a symbol being changed, hit lines only. Anything more:
  stop and ask through the session agent, do not read it.
- A "what earlier waves changed" block, four to six lines, so builders did
  not undo prior work or reintroduce removed code.
- Ownership: only spec-named files, one widget folder, one registry row,
  one script tag in static/matrix.html. Parallel-edit rule for shared files:
  Read right before Edit, one Edit, retry once.
- No commits, no README, no dependencies, no server start unless the spec
  says, no subagents, no improvising around a broken spec.
- Comments label, function, state only. "spine" banned.
- Every decision reversible and recorded with options seen and undo path.
- Receipt format with DECISIONS MADE, READS BEYOND THE LIST, BLOCKERS FOR
  LATER WAVES, PHASE 3 SURFACED. One line each into INDEX.md and
  SESSIONLOG.md by the builder.
- Builders were told no message would reach them mid-run and to ignore one
  if it did. One builder in Wave 2 refused a real mid-run message from me
  for that reason. Right instinct. Do not rely on mid-run messages.

Brandon's mid-build rule for the session agent: a fix under 100 tokens is
the session agent's to make. Anything bigger goes to a job that reads the
file anyway. Finished builders are never called again.

## Open decisions, Brandon's, from the review

Listed under BRANDON'S TODOS in the session review. Not restated here.

## Not done at handoff

- INDEX.md has no line for this handoff. The session was already closed by
  the closer when Brandon asked for it.
