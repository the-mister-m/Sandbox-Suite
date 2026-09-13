RECEIPT — phase2-2R — run b, jobs 2C (Stack Graph) and 2D (Files Graph) — 2026-09-12

Global rules recited per spec instruction. Scope: spec's "run b" checklist
plus contracts 2.2/2.6 across all three drawn widgets, and matrix.html/
widgets.json survival across the parallel 2C/2D edits.

CHECKS

- stack.js and files.js have no sim, no frozen, no dims — PASS. Neither
  file defines the three; both are flat MapView recipes only.
- Recipe call signatures — PASS.
  static/js/widgets/graph/stack/stack.js:91,127 `core.planeLayout(st.index, st.filters)`
  static/js/widgets/graph/files/files.js:216,218 `zoomLayout(st.index, st.filters, trail, page)` / `fileLayout(st.index, st.filters)`
- files.js: `view` select control present; trail and page in options;
  breadcrumb sets trail; home empties it — PASS.
  static/js/widgets/graph/files/files.js:329-331 (optionControls.view)
  static/js/widgets/graph/files/files.js:324-326 (trail/page in defaults)
  static/js/widgets/graph/files/files.js:373-378 (crumbBar click -> setTrail(crumb.trail))
  static/js/widgets/graph/files/files.js:366 (homeBtn -> setTrail(frame, []))
- drawn-widget.js: one copy, both widgets call it — PASS. grep for the six
  `MX.drawnWidget*` definitions turns up exactly one each, all in
  static/js/widgets/graph/shared/drawn-widget.js:20-85. force.js, stack.js,
  and files.js all call these same six functions (force.js:172-200,
  stack.js:55-84, files.js:60-140) — no second copy to merge, MAY FIX moot.
- Same mirror and lifecycle checks as run a, both widgets — PASS.
  - off() in unmount: stack.js:355, files.js:484.
  - Mirror receipts never re-emit: st.applying guards both onOption emit
    sites (filters and select) in both files — stack.js:378,391,
    files.js:507,519 — matching force.js's shape from run a.
  - Camera writes markDirty: stack.js:69, files.js:139.
  - getOptions returns the live camera: stack.js:418-420 (st.view.cam),
    files.js:552-554 (MX.drawnWidgetReadCamera(st.view)).
  - getOptions keys match defaults exactly, both widgets (checked by hand,
    top-level keys only — camera's own yaw/pitch/scale nest inside one
    `camera` key in both, not separate options).

2D's vm.placed filter (mirrored select, local view) — PASS, matches the
spec's ViewModel: zoomLayout's `nodes` field is the whole index (layout.ts
:698,:734), not the current level, so filtering a mirrored pick against
`st.vm.nodes` would treat any node in the whole graph as on-screen.
files.js:193-202 `pushSelection` filters against `st.vm.placed` (the
level's own drawn boxes) instead — a pick not on this level is dropped
from `view.selectedIds` without touching `trail`, and reappears once the
view flips back to global (fileLayout's placed holds every file). Built as
the receipt described it.

matrix.html / widgets.json survival — PASS. All four graph rows present
in library/registry/widgets.json:22-25 (graph_cards, graph_force,
graph_stack, graph_files). Script tags static/matrix.html:49-56: shared
four (graph-core, mermaid-frame, force-sim, drawn-widget) all before the
four widget tags (cards, force, stack, files) — order holds.

Contract 2.2 (mirror drops on inst only for local hits; apply gets
(payload, meta)) — PASS, shared/mirror.js unchanged since 2R run a:
static/js/widgets/shared/mirror.js:22 `!(meta && meta.remote) &&
payload.inst === frame.id` drops local-only; :25 `apply(payload, meta)`.

Contract 2.6 (graph.filters is every option key except target) — PASS, no
narrowing. `filtersPayload` in all three widgets loops
`Object.keys(frame.options)` skipping only "target" —
stack.js:191-197, files.js:204-210, force.js:251-257 — identical shape.

node --check: stack.js, files.js, force.js, drawn-widget.js — all clean.

FIXED
- none.

QUESTIONS for the session agent
- 2C's receipt flags that it and 2D independently wrote
  graph/shared/drawn-widget.js before either coordinated ownership; the
  collision resolved to 2D's shape with no functional gap found here. Any
  objection to closing that flag now rather than carrying it forward? (yes/no)

Not run: browser "Done when" checks — no server start per instructions,
same gap 2A/2B/2C/2D's own receipts already name.

CLOSER REVIEW
- No FAILs standing across 2C/2D or the shared surfaces they touched.
- drawn-widget.js ownership flag (2C's PICK 2 / 2D's receipt) — closer:
  rule per the question above.
