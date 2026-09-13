SESSION REVIEW — Sandbox Suite — phase2-2C-sonnet-stack-graph — 2026-09-12 [timestamps: ask Brandon]

EDITS
- [static/js/widgets/graph/stack/stack.js](../../static/js/widgets/graph/stack/stack.js) — new, part 1: the graph_stack widget
- [static/js/widgets/graph/force/force.js](../../static/js/widgets/graph/force/force.js) — part 2: centreFit/applyCamera/readCamera and haystack/searchIds/redrawHits pulled out, now thin wrappers calling drawn-widget.js's MX.drawnWidget* functions
- [library/registry/widgets.json](../../library/registry/widgets.json) — graph_stack row
- [static/matrix.html](../../static/matrix.html) — one script tag, stack.js after force.js

STRAY FILES
- none

GOALS DONE
- Part 1 stack.js — graph_stack, label "Stack Graph", group graph. Recipe is
  `core.planeLayout(index, filters)`, no sim, no positions map. `show(vm)` on
  target/filter change only; render is MapView's own bind() on drag/wheel —
  stack.js never calls `render()` itself (confirmed against map.js :258,
  :297, :322, :331, :367). Bar: static "stack" label, search box + three
  checkboxes, fit, gear — no freeze, no 2D/3D toggle, no sim option. Empty
  state: a `.sg-empty` overlay div reading "Pick a target." over the map
  host, shown when `frame.options.target` is empty. Options: target,
  selectedIds, focusedId, camera, mermaidCollapsed, query, every Filters
  field. Mirrors: select/filters/reach via MX.graphMirrors, same
  st.applying guard as force.js/cards.js. node --check clean.
- Part 2 shared pull-up — see PICKS 2, below; it landed mid-session from
  2D, not from me. I named it here because "call it from both" (force.js
  and stack.js) is what made it real.

PICKS I MADE

1. **`query` added as an option**, not in the spec's explicit defaults
   list. Same reasoning as 2B's pick 7 for force.js: the search box (spec
   says "search" stays) needs it to persist across refresh, and it rides
   `graph.filters` like every other non-target key per contract 2.6.

2. **The shared pull-up did not come out the way I built it.** I wrote
   `static/js/widgets/graph/shared/drawn-widget.js` myself first — a
   `MX.graphCameraOps(frame, st)` / `MX.graphHitList(frame, st, opts)`
   factory pair, wired into both force.js and stack.js, node --check
   clean, ~41 (camera) + ~44 (search/hits) lines pulled from force.js each
   time. Mid-session the file changed under me: 2D (Files Graph, building
   in parallel per the spec) had independently created the same path with
   a different shape — six pure functions (`MX.drawnWidgetCentreFit(view,
   svg)`, `MX.drawnWidgetApplyCamera(view, svg, camera, homeYaw,
   homePitch)`, `MX.drawnWidgetReadCamera(view)`, `MX.drawnWidgetHaystack`,
   `MX.drawnWidgetSearchIds`, `MX.drawnWidgetEsc`), no state assumptions.
   Per the harness's own instruction not to revert a file that changed
   under me, I kept 2D's version and rewired both force.js and stack.js to
   call it instead — force.js's centreFit/applyCamera/readCamera/
   redrawHits are now ~4-line wrappers around the pure functions; stack.js
   never had its own copies to begin with. Net: the 30-line pull-up rule
   is satisfied and both widgets call the one shared file, but the shared
   file's shape was 2D's call, not mine, and neither of us coordinated on
   who owns `graph/shared/drawn-widget.js` before writing to it. **Flagging
   for Brandon/closer: 2C and 2D independently wrote to the same shared
   path; this collision resolved itself only because 2D's version landed
   second and I adapted. A future 2-widgets-in-parallel spec should name
   which one owns a new shared file.**

3. **The bar's first word "stack" is a static label**, not a control — the
   spec names the word, not a behavior, and stack.js has no freeze/2D-3D
   toggle to spend the slot on.

4. **`R_BASE`/`R_STEP`/`R_CAP` are not in stack.js.** force.js needs them
   to size sim nodes by degree; `planeLayout` computes its own reach-based
   sizing internally (layout.ts :199, :208), so the widget never touches
   node radius.

5. **Not verified live.** No browser, same rule as 2A/2B. Everything above
   is node --check and static read-through against force.js's proven
   pattern and layout.ts's planeLayout body.

BRANDON'S TODOS
- Rule on PICK 2 — the drawn-widget.js ownership collision with 2D. Two
  parallel jobs wrote the same new shared path independently; this time it
  resolved without breaking either widget, but only because I caught the
  "changed on disk" notice and rewired rather than reverting.
- Someone with the server up should run the browser Done-when checks:
  mount/load/draw/orbit/zoom/fit, click-to-light across stack/force/cards,
  filter-change redraw across the three, and refresh persistence.

CLOSER REVIEW
- drawn-widget.js ownership collision (PICK 2) — closer/Brandon: confirm
  2D's shape is the one that stands; nothing further to merge from my side.
- graph_stack registry row and matrix.html script tag — closer: confirm
  placement (after force.js, before files.js) is fine.
- Browser Done-when checks still open, same as 2A/2B/2D — closer: carry
  forward, do not mark part 1 closed on node --check alone.
