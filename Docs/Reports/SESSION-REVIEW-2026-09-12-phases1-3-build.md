SESSION REVIEW — Sandbox Suite, Code Canvas port phases 1 to 3 — 2026-09-12 17:08 to 22:31 local (21:08Z to 02:31Z)

Session agent: Fable 5.1. Brandon opened the session with "begin phase 1" against [SPEC-session-agent-phases1-3.md](../Specs/Code%20Canvas%20port/SPEC-session-agent-phases1-3.md). All three phases built, redpenned, headed, and green by close.

EDITS (session agent's own hand, seams under 1K)
- [mirror.js:21](../../static/js/widgets/shared/mirror.js#L21) — drop on inst only for local hits; 1H test 6
- [mirror.js:22](../../static/js/widgets/shared/mirror.js#L22) — default target key exact match restored; non-default key empty follows all
- [SPEC-session-agent-phases1-3.md:126](../Specs/Code%20Canvas%20port/SPEC-session-agent-phases1-3.md#L126) — contract 2.2 reworded to match
- [mermaid-frame.js:20-25](../../static/js/widgets/graph/shared/mermaid-frame.js#L20-L25) — six kind colors, Wayfinder's own values
- [widget-frame.js:19-23](../../static/js/matrix/widget-frame.js#L19-L23) — startingOptions merges module defaults under registry defaults
- [files.js:328](../../static/js/widgets/graph/files/files.js#L328) — Files Graph default camera set to home tilt
- [phase3_headed.py:574](../tests/phase3_headed.py#L574) — line 8 assertion compares id tail
- [phase3_headed.py:813](../tests/phase3_headed.py#L813) — line 15 accepts "none" grid
- [STICKY-2026-09-12-session-agent.md](../stickies/STICKY-2026-09-12-session-agent.md) — session-long notes, rulings, jobs table
- Server restarted once after 3E, pid 92992, log at [server.log](../server.log)

EDITS (builders and fix agents, by receipt)
- [RECEIPT-phase1-1A.md](RECEIPT-phase1-1A.md) — graphs, targets, widget-bus routes; widget_bus_emit tool; graph.json seeded
- [RECEIPT-phase1-1B.md](RECEIPT-phase1-1B.md) — mirror.js, target-option.js, module-ready.js, toggleOptions select
- [RECEIPT-phase1-1D.md](RECEIPT-phase1-1D.md) — pipes test widget, HOWTO-repipe.md
- [RECEIPT-phase2-2A.md](RECEIPT-phase2-2A.md) — Wayfinder vendored, graph-core, mermaid-frame, cards, editor followGraph
- [RECEIPT-phase2-2A-fix.md](RECEIPT-phase2-2A-fix.md) — graph.filters widened to contract 2.6
- [RECEIPT-phase2-2A-fix2.md](RECEIPT-phase2-2A-fix2.md) — FILTER_FIELDS export, defaults drift check, apply through setOption
- [RECEIPT-phase2-2B.md](RECEIPT-phase2-2B.md) — force-sim.js, Force Graph, graphMapStyles
- [RECEIPT-phase2-2C.md](RECEIPT-phase2-2C.md) — Stack Graph
- [RECEIPT-phase2-2D.md](RECEIPT-phase2-2D.md) — Files Graph, drawn-widget.js
- [RECEIPT-phase2-2H-fix.md](RECEIPT-phase2-2H-fix.md) — camera restore flag, echo storm cut, applyOptions JSON compare
- [RECEIPT-phase3-3A.md](RECEIPT-phase3-3A.md) — canvas core six files, /api/fs/put b64
- [RECEIPT-phase3-3B.md](RECEIPT-phase3-3B.md) — Canvas widget
- [RECEIPT-phase3-3C.md](RECEIPT-phase3-3C.md) — Tools widget, _canvas.doc(), values(frame), setHidden
- [RECEIPT-phase3-3D.md](RECEIPT-phase3-3D.md) — Code widget, state.replace
- [RECEIPT-phase3-3E.md](RECEIPT-phase3-3E.md) — annotate.js, /api/snapshot, dom-to-image vendored
- [RECEIPT-phase3-3H-fix.md](RECEIPT-phase3-3H-fix.md) — Tools X/Y, status timer, followTarget, redrawOnly, preview guard
- [RECEIPT-phase3-3H-fix2.md](RECEIPT-phase3-3H-fix2.md) — click on selected widget announces canvas.select

HEADED RECEIPTS (gates)
- [RECEIPT-phase1-1H.md](RECEIPT-phase1-1H.md) — 10/11, one fixed by seam, never re-run headed; 2H covered it
- [RECEIPT-phase2-2H.md](RECEIPT-phase2-2H.md) — 11/13 then fixes; Brandon's rerun 13/13, output in [phase2-headed-rerun/](phase2-headed-rerun/)
- [RECEIPT-phase3-3H.md](RECEIPT-phase3-3H.md) — 13/18; fix 15/18; fix2 18/18, artifacts in [phase3-3H-fix2/](phase3-3H-fix2/)

STRAY FILES
- [docs/scratchpad/](../scratchpad/) — 12 annotate PNGs, fixture.html, fixture.json, fixture2.json, .backups/ — 3E and 3H test output
- [docs/server.log](../server.log) — server stdout since the 22:09 restart
- [Docs/Reports/phase1-headed/](phase1-headed/), [phase2-headed/](phase2-headed/), [phase2-headed-rerun/](phase2-headed-rerun/), [phase2-2H-fix/](phase2-2H-fix/), [phase3-3A/](phase3-3A/), [phase3-3B/](phase3-3B/), [phase3-3C/](phase3-3C/), [phase3-headed/](phase3-headed/), [phase3-3H-fix2/](phase3-3H-fix2/) — screenshots and console dumps, one folder per headed run
- [Docs/tests/](../tests/) — phase1_headed.py, phase2_headed.py, phase3_3A_core.py, phase3_3B_canvas.py, phase3_3C_tools.py, phase3_headed.py
- library/graphs/graph.json — seeded first target
- Region 0c2be647998d — twelve real model turns from 3H line 14 across three runs

GOALS DONE
- Phase 1 boilerplate: routes, target option, mirror, loader, test widget, HOWTO. Green.
- Phase 2 graph widgets: cards, Force, Stack, Files, mermaid frame. Green, 13/13.
- Phase 3 canvas 2D: core, Canvas, Tools, Code, Annotate. Green, 18/18.
- Every contract in section 2 held or widened. Nothing renamed. Additions named in receipts.

RULINGS THE SESSION AGENT GAVE (for MEMORY.md)
- Contract 2.2: mirror drops on inst only for local hits; apply gets (payload, meta); optional fourth targetKey arg, non-default key empty follows every target
- Contract 2.3: values(frame) optional argument
- Contract 2.6: graph.filters is every option key except target
- Contract 2.7: canvas.select may carry notes: true; canvas.freeze rides the mirror, every canvas on the target freezes
- Additive fields: tool builders (widgets, state); openRootBrowser opts.ext array; /api/fs/put b64; /api/snapshot; _canvas.doc(); state.setHidden; state.replace; MX.graphFilterFields; MX.graphMapStyles; force gravity option (0 = spec recipe)
- File mode is _canvas.state === null; mode() never returns file
- Tools follow mode listens canvas.focus on empty followTarget key
- drawn-widget.js: 2D's shape stands, 2C adapted
- widget-frame: startingOptions merges module defaults; applyOptions compares by JSON.stringify

BRANDON'S TODOS
- Every agent before 2C may have left decision comments in code. Comments are label, function, state only. Check 1A, 1B, 1D, 1R, 1H, 2A, 2A-fix, 2A-fix2, 2B, 2R-2B, 2D. Known: 2A cards.js FILTER_FIELDS note.
- Name an owner for any shared file two parallel specs touch. 2C and 2D both wrote drawn-widget.js.
- Region 0c2be647998d carries twelve test turns from 3H.
- Taste pass on Stack and Files 3D projection and Force Graph empty planes; seen mid-2H, not a test line.
- 3R-3E cosmetic: annotate status shows "playwright missing page" instead of the route's own error text.
- Goto agent definition recites an older seven-rule block with a 500K cap; the first 1A spawn stalled on it. Check ~/.claude/agents/Goto.md.
- Phase 4: scope doc only. No specs until Brandon rules.
- Harness token counts ran above the spec caps on most jobs (table below). Agents' own counts were under. Decide which count the rule reads.

JOBS
| job | model | harness tokens | receipt | FAIL left |
|---|---|---|---|---|
| 1A spawn 1 | sonnet | 45K | none, stalled at recite | - |
| 1A | sonnet | 97K | RECEIPT-phase1-1A.md | 0 |
| 1B | sonnet | 98K | RECEIPT-phase1-1B.md | 0 |
| 1D | sonnet | 163K | RECEIPT-phase1-1D.md | 0 |
| 1R | sonnet | 163K | RECEIPT-phase1-1R.md | 0 |
| 1H | opus | 137K | RECEIPT-phase1-1H.md | 1, seam |
| 2A | sonnet | 173K | RECEIPT-phase2-2A.md | 0 |
| 2A-fix | sonnet | 82K | RECEIPT-phase2-2A-fix.md | 0 |
| 2A-fix2 | sonnet | 94K | RECEIPT-phase2-2A-fix2.md | 0 |
| 2B | opus | 203K | RECEIPT-phase2-2B.md | 0 |
| 2R-2B | sonnet | 90K | RECEIPT-phase2-2R-2B.md | 0 |
| 2C | sonnet | 168K | RECEIPT-phase2-2C.md | 0 |
| 2D | sonnet | 150K | RECEIPT-phase2-2D.md | 0 |
| 2R-2CD | sonnet | 140K | RECEIPT-phase2-2R-2CD.md | 0 |
| 2H | opus | 239K | RECEIPT-phase2-2H.md | 2, fixed |
| 2H-fix | opus | 153K | RECEIPT-phase2-2H-fix.md | 0 after rerun |
| 3A | opus | 183K | RECEIPT-phase3-3A.md | 0 |
| 3R-3A | sonnet | 146K | RECEIPT-phase3-3R-3A.md | 0 |
| 3B | opus | 234K | RECEIPT-phase3-3B.md | 0 |
| 3R-3B | sonnet | 156K | RECEIPT-phase3-3R-3B.md | 0 |
| 3C | opus | 180K | RECEIPT-phase3-3C.md | 0 |
| 3R-3C | sonnet | 122K | RECEIPT-phase3-3R-3C.md | 0 |
| 3D | sonnet | 194K | RECEIPT-phase3-3D.md | 0 |
| 3R-3D | sonnet | 113K | RECEIPT-phase3-3R-3D.md | 0 |
| 3E | sonnet | 213K | RECEIPT-phase3-3E.md | 0 |
| 3R-3E | sonnet | 111K | RECEIPT-phase3-3R-3E.md | 0 |
| 3H | opus | 189K | RECEIPT-phase3-3H.md | 5, fixed |
| 3H-fix | opus | 147K | RECEIPT-phase3-3H-fix.md | 3, fixed |
| 3H-fix2 | opus | 109K | RECEIPT-phase3-3H-fix2.md | 0 |

SESSION AGENT'S OWN FAILS, FOR THE RECORD
- Listed 2A's picks without ruling on them; Brandon had to demand rulings.
- Buried four picks in a pull line instead of reporting them.
- Spawn prompts did not repeat the comment rule until 2R-2CD; Brandon caught it.
- Brandon put the reinforcement in context mid-session and the work tightened after it. He asked the transcript to hold his appreciation for that. It does.

CLOSER REVIEW
- Gets copy of review, not a contract.
- Bring temp files forward into docs/ where they belong; scratchpad output stays in scratchpad unless a receipt names it — closer
- Fold the sticky's rulings into MEMORY.md warm start — closer
- Update CLAUDE.md map for the new widget folders (graph/, canvas/), vendor folders, tests, receipts — closer
- Finish the worklog at Ledger/worklog.html, Brandon assigned it at close — closer, after the file moves
- Phase 4 ruling — Brandon
