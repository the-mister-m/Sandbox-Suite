SESSION REVIEW — Sandbox Suite + Doc Generator — 2026-09-06 23:59 to 2026-09-07 02:46 EDT

Session agent Fable. Scope session for the arrange widget. Nothing built,
nothing spawned, nothing committed, no server started.

EDITS

- [Doc Generator/src/shared/types.ts](../../../Doc%20Generator/src/shared/types.ts) — PLAN section added: PlanNodeKind, PlanNotchKind, PlanWire, PlanNodeStatus, PlanNotch, PlanNode, PlanCableEnd, PlanCable, PlanLoop, PlanPhase, Plan. ProjectDatabase gains `plan: Plan | null`. Foundation 4 note rewritten as broken on purpose.
- [Doc Generator/src/main/db/project-db.ts](../../../Doc%20Generator/src/main/db/project-db.ts) — parseDatabase passes `plan` through, null when absent, throws when not an object. emptyDatabase sets `plan: null`. Plan imported.
- [Doc Generator/src/main/ipc/register.ts](../../../Doc%20Generator/src/main/ipc/register.ts) — the renderer save handler carries `project.database.plan` through. Without it every doc gen save nulled the plan.
- [Doc Generator/tests/main-process.test.ts](../../../Doc%20Generator/tests/main-process.test.ts) — `plan: null` on seven ProjectDatabase literals. First sed pass landed one line late, redone by pattern.
- [Doc Generator/tests/renderer-state.test.ts](../../../Doc%20Generator/tests/renderer-state.test.ts) — `plan: null` on one literal.
- [Docs/Specs/SPEC-arrange-widget.md](../Specs/SPEC-arrange-widget.md) — arrange widget spec, thirteen sections, three assumptions, twelve-row undo table.
- [Doc Generator/docs/SPEC-map-arrange-skin.md](../../../Doc%20Generator/docs/SPEC-map-arrange-skin.md) — doc gen map spec, third renderer, edges from plan file cables, four-row undo table.

TESTS

- Doc Generator: `npx tsc --noEmit` clean. `npx vitest run` 213 passed, 5 files.
- Sandbox Suite: nothing run.

STRAY FILES

- None.

GOALS DONE

- Located every piece: old arrange.js and its CSS block, cables.js, region.js, the doc gen map (five files), doc gen types, the D1 settings receipt, the reset suffix in tracks.py, every keyframe in ade.css.
- Vocabulary settled: node is job, track is agent, regions live inside a job, branch and merge and group are mini nodes, left drawer not rail.
- Shared JSON written into the doc gen project database as the plan block. Doc gen backend touched in three lines. Job context stays out of it.
- Two build specs written. Order: arrange and doc gen map may run in parallel, JSON is already in.
- Confirmed the subway map never reached timeline.js. Still on the redpen checklist.
- Confirmed moving widget folders touches only library/registry/widgets.json plus any shared/ imports, which were not grepped.

DECISIONS MADE

- Plan lives in the doc gen project file, not localStorage. Reverse: restore the seed's `arrangeMockD2` store.
- Arrange shows state by motion and brightness together: complete greyed and still, working and thinking pulse on the border, idle pulses slow and sits between. Reverse: seed's opacity rules, pulse back on the dot.
- Loop glow is a static box-shadow border, always on. Dash march removed. Reverse: restore `dashflow` and the dev flag.
- Five notch kinds: in, out, git-in, git-out, message. Reverse: seed's three kinds plus two flags.
- Message wire rides the file cable when one exists. Reverse: delete the message deriver and the kind.
- Mini nodes are a node `kind`, suite only, doc gen ignores them. Reverse: drop the three kinds from the canvas menu.
- Job context is one per job, written to injections/region/<node>/ as context.json and injection.md. Reverse: keep it in memory.
- Save to library and import from library use a new library/docs/ folder. Reverse: remove two buttons and the folder.
- Settings pane sends edit_track frames, no settings widget. Reverse: remove the pane.
- Doc gen map is non-interactive, arrange skin as a third renderer and the default, edges from plan file cables, authoring-order chain removed. Reverse: four rows in that spec's undo table.
- Foundation 4 broken on Brandon's word. Reverse: delete the PLAN section and the three backend lines.
- Reset count is the region name suffix the server already stamps. No client tally.

BRANDON'S TODOS

- Name the model for the Goto override before the arrange build spawns.
- Answer or accept assumptions A1 (plan file open and write path), A2 (settings row source), A3 (wp_feed row shape) in SPEC-arrange-widget.md.
- jobId wiring from the docset is a later spec. Every node this build creates leaves it null.
- Timeline subway scope, when ready, reads derived.js from the arrange build.

SESSION AGENT ERRORS

- Ran three reads after Brandon said gate closed, on a turn where he had also listed reads. He called it wishy-washy on his side and told me end-of-turn direction is final. Held to that after.
- Asked one question with no purpose, about which folder library save goes to. Dropped.
- Wrote not-yet nodes as static when Brandon had said motion on both in-progress and yet-to-be-done. Caught it when he asked what a spec would fail on, fixed in the spec.
- Dropped the left drawer from the first spec summary entirely. Same catch.
- Had the deliverable order wrong, said arrange first. Brandon corrected to JSON first.
- Batch sed on the test file landed one line late on every insert and BSD sed ignored `\s`. Two more passes to clean. Tests green at the end.

CLOSER REVIEW

- Gets copy of review, not a contract.
- Move the twelve decisions above to MEMORY.md as durable — closer.
- Warm start: arrange scope done, JSON in, two specs ready to spawn, model override pending — closer.
- CLAUDE.md map: Docs/Specs gains SPEC-arrange-widget.md; note that Doc Generator/docs holds SPEC-map-arrange-skin.md — closer.
- Worklog entry — closer, assigned by Brandon this session.
- INDEX.md and SESSIONLOG.md already updated by the session agent, confirm no dupes — closer.
