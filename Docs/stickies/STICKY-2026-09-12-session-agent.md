# STICKY — session agent — Code Canvas port phases 1-3 — 2026-09-12

Session-long notes. Folded into the session receipt at close.

## BRANDON'S TODOS (closer copies these)
- Every agent spawned before 2C may have left decision comments in code.
  Comments must be label, function, state only. Double-check: 1A, 1B,
  1D, 1R, 1H, 2A, 2A-fix, 2A-fix2, 2B, 2R-2B, 2D. Known offender: 2A,
  cards.js, FILTER_FIELDS note (receipt says "noted in a comment").
  Nothing existing was touched; from 2C on the spawn prompt carries the
  comment rule verbatim.

## SEAMS I DID
- static/js/widgets/shared/mirror.js:21 — drop on inst only for local
  hits (1H test 6 FAIL). Contract 2.2 reworded to match,
  SPEC-session-agent-phases1-3.md:126.
- static/js/widgets/shared/mirror.js:22 — default target key matches
  exactly again; only a non-default key (editor graphTarget) follows
  every target. Restores contract 2.2 after 2A widened it.
- static/js/widgets/graph/shared/mermaid-frame.js:20-25 — six kind
  colors swapped to Wayfinder's own values from its style.css.

## RULINGS GIVEN
- 1R: HOWTO-repipe line fix stands; mirror meta arg no collision.
- 2A: graph.filters widened to contract 2.6 (fix agent). Four picks:
  FILTER_FIELDS exported, defaults drift check, Wayfinder colors,
  apply through setOption with st.applying guard (fix2 agent + seam).
- 2B: gravity option stands (0 = spec recipe), drillable as Set stands,
  graphMapStyles in graph-core.js stands.
- 2R-2B: matrix.html script reorder stands.

## JOBS
| job | model | harness tokens | receipt | FAIL left |
| 1A (spawn 1) | sonnet | 45K | none, stalled at recite | - |
| 1A | sonnet | 97K | RECEIPT-phase1-1A.md | 0 |
| 1B | sonnet | 98K | RECEIPT-phase1-1B.md | 0 |
| 1D | sonnet | 163K | RECEIPT-phase1-1D.md | 0 |
| 1R | sonnet | 163K | RECEIPT-phase1-1R.md | 0 |
| 1H | opus | 137K | RECEIPT-phase1-1H.md | 1, fixed by seam |
| 2A | sonnet | 173K | RECEIPT-phase2-2A.md | 0 |
| 2A-fix | sonnet | 82K | RECEIPT-phase2-2A-fix.md | 0 |
| 2A-fix2 | sonnet | 94K | RECEIPT-phase2-2A-fix2.md | 0 |
| 2B | opus | 203K | RECEIPT-phase2-2B.md | 0 |
| 2R-2B | sonnet | 90K | RECEIPT-phase2-2R-2B.md | 0 |
| 2D | sonnet | 150K | RECEIPT-phase2-2D.md | 0 |
- 2C/2D: both specs asked for the shared drawn-widget.js pull-up and
  both wrote it in parallel. 2D's shape stands; 2C adapted force.js and
  stack.js. Brandon's todo: name an owner for any shared file two
  parallel specs touch (phase 3 is serial, so this bites again only if
  a future map runs parallel).
| 2C | sonnet | 168K | RECEIPT-phase2-2C.md | 0 |
| 2R-2CD | sonnet | 140K | RECEIPT-phase2-2R-2CD.md | 0 |
- static/js/matrix/widget-frame.js:19-23 — startingOptions merges module
  defaults under registry defaults (was registry else module). 2H side
  finding: editor followGraph checkbox missing. Undo: restore the
  if/return pair. Affects every widget's fresh mount; registry still
  wins on any key it names.
- 2H: ran the pass seven times, 239K harness tokens against a 120K
  cap, left its surfaces standing on session ae83cfb77344. Brandon's
  todo: delete those surfaces or let the fix agent's cleanup catch them.
| 2H | opus | 239K | RECEIPT-phase2-2H.md | 2, fix agent out |
- static/js/widgets/graph/files/files.js:328 — Files Graph default
  camera set to the home tilt {-0.42, 0.92, 1}, was {0, 0, 1}, plane
  drew edge-on (2H-fix new FAIL line 9). Undo: restore zeros.
- Phase 2 green: Brandon ran the full phase 2 harness after the seam,
  13/13 PASS, output at Docs/Reports/phase2-headed-rerun/.
| 2H-fix | opus | 153K | RECEIPT-phase2-2H-fix.md | 0 after rerun |
- 3A: three additive contract fields stand: tool builders (widgets,
  state); openRootBrowser opts.ext array; /api/fs/put optional b64.
  Server pid 67011 predates the b64 route edit; raw and folder asset
  bytes unverified until restart. Brandon restarts; rerun
  Docs/tests/phase3_3A_core.py after.
| 3A | opus | 183K | RECEIPT-phase3-3A.md | 0, b64 bytes open |
| 3R-3A | sonnet | 146K | RECEIPT-phase3-3R-3A.md | 0 |
- 3B: Pipes mirrors graph.select not canvas.select; spec check replaced
  by bus-listener proof, pipes.js untouched. canvas.select gains
  optional notes: true, additive. Both stand. 3B spent 234K harness
  tokens against a 200K cap; builder reports under 170K by its count.
| 3B | opus | 234K | RECEIPT-phase3-3B.md | 0 |
| 3R-3B | sonnet | 156K | RECEIPT-phase3-3R-3B.md | 0 |
- 3C: frame._canvas.doc() added; contract 2.3 values(frame) optional
  arg; state.setHidden + hidden field, render display none; file mode
  is _canvas.state === null (spec said mode(), which never returns
  file). All stand.
| 3C | opus | 180K | RECEIPT-phase3-3C.md | 0 |
| 3R-3C | sonnet | 122K | RECEIPT-phase3-3R-3C.md | 0 |
- 3D: canvas.freeze rides the mirror, every canvas on the target
  freezes (contract 2.1 + 2.7 as written); state.replace(json) added,
  additive; notes tab not ported, 3C holds it. No headed proof from 3D;
  3H covers. All stand.
| 3D | sonnet | 194K | RECEIPT-phase3-3D.md | 0, unproven headed |
| 3R-3D | sonnet | 113K | RECEIPT-phase3-3R-3D.md | 0 |
- Server restarted by Brandon, pid 91684, 21:16, newer than server.py
  19:58. All 1A and 3A routes live. Brandon opened the restart gate to
  the session agent for the rest of the session. b64 bytes check left
  to 3H (3A core test is headed, opens Chrome).
- 3E: annotate freezes its own canvas by direct call, same instance,
  not the mirror; annotate option reads back false, never persists;
  POST /api/snapshot added, additive; dom-to-image vendored. All stand.
  3E probed /api/fs/put b64 live: works, 3A item closed.
- Server restarted by session agent after 3E, pid 92992, log at
  docs/server.log. /api/snapshot answers 400 on empty body, live.
| 3E | sonnet | 213K | RECEIPT-phase3-3E.md | 0, unproven headed |
- 3R-3E cosmetic note for the closer: on a playwright 501 the annotate
  status line shows "playwright missing page" instead of the route's
  own error text. Not fixed.
| 3R-3E | sonnet | 111K | RECEIPT-phase3-3R-3E.md | 0 |
- 3H: 13/18 PASS, 5 FAIL. Rulings: Tools gets X/Y box fields; status
  timer cancelled per write, dirty arms none; Tools follow mode listens
  canvas.focus on an empty non-default key followTarget (editor
  graphTarget path), contract 2.2 exact match stays; render.page gains
  a per-widget path, full rebuild fallback, code.js queues select until
  blocksIndex exists; doc-mode pointer handlers refuse preview. Fix
  agent opus 150K out.
- 3H made six real model turns on region 0c2be647998d (line 14). The
  fix rerun makes three more. Brandon's todo: know that region carries
  test turns.
| 3H | opus | 189K | RECEIPT-phase3-3H.md | 5, fix agent out |
- Docs/tests/phase3_headed.py:574 — line 8 assertion compared "pinned
  <id>" to "following <id>"; now compares the id tail. :813 — line 15
  treated the string "none" as a set grid; now accepts "", "none",
  None, False. Harness seams, py_compile clean.
- 3H-fix: 15/18. Two corrections landed after its run with no headed
  proof (tools.js:938-942, render.js:135-148). Line 9 scroll-to-header
  cause unknown. Fix2 agent opus 120K out: diagnose line 9, one rerun
  covers everything. Three more model turns on region 0c2be647998d.
| 3H-fix | opus | 147K | RECEIPT-phase3-3H-fix.md | 3, fix2 out |
- 3H-fix2: line 9 cause was a click on an already-selected widget
  emitting no canvas.select; canvas.js:542-551 announces it, clicked
  id first, selection unchanged. Harness 18/18. Phase 3 green.
  Twelve real model turns on region 0c2be647998d across 3H and its
  two fixes.
| 3H-fix2 | opus | 109K | RECEIPT-phase3-3H-fix2.md | 0 |
