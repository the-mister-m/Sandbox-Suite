RECEIPT — phase2-2R — run a, job 2B (Force Graph) — 2026-09-12

Global rules recited per spec instruction (see session transcript). Scope:
spec's "run a" checklist, force.js/force-sim.js section plus the
2A-shared surfaces 2B touches (mirror.js contract 2.2, graph-core.js
contract 2.6/graphMapStyles, script tags, registry). cards.js/editor.js/
mermaid-frame.js internals not re-audited — already covered by
RECEIPT-phase2-2A(-fix)(-fix2).

CHECKS

- force-sim.js: forceSim pure, no DOM, no MX call-outs, one step per
  call, returns {positions, maxMove} — PASS.
  static/js/widgets/graph/shared/force-sim.js:46-130
- Loop stops on frozen and on settle; restarts on filter or target
  change; cancelled in unmount — PASS.
  static/js/widgets/graph/force/force.js:186-219 (stop/settle),
  :415-417 (filter restart), :573-575 (target restart), :556 (unmount)
- ViewModel fields (mode, planes, placed, pads, nodes, edges, camera,
  crumbs, drillable, page, note) all present; drillable is a Set,
  matching map.js:184 `.has(id)` usage — PASS.
  static/js/widgets/graph/shared/force-sim.js:204-216
- Mirror receipts never re-emit — PASS. st.applying guards both
  onOption emit sites (FILTER_FIELDS branch and selectedIds/focusedId
  branch), checked before the mirror.emit call in each.
  static/js/widgets/graph/force/force.js:580, :593
- Camera writes markDirty — PASS. force.js:262
- getOptions returns the live camera (st.view.cam when a view exists)
  — PASS. force.js:639-641
- Registry row: type/label/path match — PASS.
  library/registry/widgets.json:23
- Script tag order (helpers, graph-core, mermaid-frame, force-sim,
  then widgets) — FAIL as found: force-sim.js (shared) sat after
  cards.js (a widget). FIXED: moved force-sim.js ahead of cards.js.
  static/matrix.html:50-52

Contract 2.2 (mirror drops on inst only for local hits) — PASS.
mirror.js:22 checks `!(meta && meta.remote) && payload.inst ===
frame.id`; apply gets (payload, meta) — PASS, mirror.js:25.

Contract 2.6 (payload = every option key except target) — PASS in
both directions. graph-core.js MX.graphFilters loops Object.keys(opts)
skipping target; force.js's filtersPayload does the same.
force.js:313-319

Three ruled 2B picks confirmed as built, not re-litigated: gravity
default 0.012 with `if (o.gravity)` making 0 an exact no-op
(force-sim.js:101), drillable as `new Set()` (force-sim.js:213),
MX.graphMapStyles living in graph-core.js (graph-core.js:129, called
force.js:442).

node --check: force-sim.js, force.js, mirror.js, graph-core.js — all
clean.

FIXED
- static/matrix.html:50-52 — force-sim.js script tag moved before
  cards.js, matching required shared-then-widgets order. Undo: swap
  the two lines back.

QUESTIONS for the session agent
- Any objection to the script-tag reorder as a MAY FIX taken here
  rather than left as a FAIL for a separate pass? (no functional
  change, node --check clean)

Not run: browser "Done when" checks — no server start per instructions,
same gap 2B's own receipt already named.

CLOSER REVIEW
- One MAY FIX taken (script order) — closer: confirm, file.
- No FAILs standing.
