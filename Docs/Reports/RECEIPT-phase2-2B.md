SESSION REVIEW — Sandbox Suite — phase2-2B-opus-force-graph — 2026-09-12 [timestamps: ask Brandon]

EDITS
- [static/js/widgets/graph/shared/force-sim.js](../../static/js/widgets/graph/shared/force-sim.js) — new, part 1: MX.forceSim, MX.forceLayout, MX.forceSimDefaults, MX.forceWorldScale
- [static/js/widgets/graph/force/force.js](../../static/js/widgets/graph/force/force.js) — new, part 2: the graph_force widget
- [static/js/widgets/graph/shared/graph-core.js](../../static/js/widgets/graph/shared/graph-core.js) — added MX.graphMapStyles(), the wf-* map paint; nothing else in that file touched
- [library/registry/widgets.json](../../library/registry/widgets.json) — graph_force row
- [static/matrix.html](../../static/matrix.html) — two script tags, force-sim.js before force.js

STRAY FILES
- none in the project. Probe scripts (settle.mjs, sweep*.mjs, trace*.mjs, diag*.mjs, vmcheck.mjs) stayed in the session scratchpad and are not worth keeping — the numbers they produced are below.

GOALS DONE
- Part 1 force-sim.js — one pure step per call, pair repulsion (inverse square, clamped at MIN_DIST 6), edge springs to a rest length of (r1+r2)*REST_K, velocity damping, dims 2 holds z at 0. Returns `{positions, maxMove}`. MX.forceLayout builds the full ViewModel: one plane sized to the placed bounding box plus PLANE_MARGIN 76, edges rolled up the way layout.ts :369-384 does, part radius R_BASE + min(degree, R_CAP) * R_STEP.
- Part 2 force.js — graph_force, label "Force Graph", group graph. Bar (freeze, 2D/3D, search + hits, fit, gear), MapView on an svg, mermaid frame underneath. Sim loop on requestAnimationFrame. Selection, camera, filters, reach all wired through MX.graphMirrors.
- Part 3 worker swap — named, not built. Paragraph below.
- Part 4 settle test — run headless under node against the real seed graph. Numbers below.
- node --check clean on all three JS files; widgets.json parses.

SETTLE NUMBERS — part 4
Run under node against `library/graphs/graph.json` (84 nodes, 142 edges), default
filters, the widget's own deterministic seed, threshold maxMove < 0.05 held for 30
steps. NOT run in a browser — the rule bars starting the server, so there is no
Brandon's-machine wall-clock number and no three-widgets-open stutter check. Both
are open, named under BRANDON'S TODOS.

- 3D: settles at step 933. Sim cost 0.046 ms per step.
- 2D: settles at step 1070. Every z exactly 0 at settle.
- At STEPS_PER_FRAME 8 that is 117 frames 3D / 134 frames 2D — **1.95 s / 2.23 s at
  60 fps**, inside the 4 s cap, with 0.37 ms of sim per frame.
- Resulting layout: world span 1190, closest pair 141 apart, against a file tile
  96 wide (map.js:19 TILE) — tiles do not overlap.
- Freeze and unfreeze are a boolean gate on the loop (stopLoop/startLoop); not
  exercised headless.

WORKER SWAP — part 3, for the record
Main thread is the build. The swap: force-sim.js becomes a worker script with the
same function; the widget posts `{nodes, edges, positions, opts}` and receives
`{positions, maxMove}` per tick. The widget's loop and everything else stay. If a
later test shows stutter, that is the one-file change. `MX.forceSim` already
returns exactly that message shape, so the post/receive sides need no reshaping.

DRAWN WIDGET PATTERN — 2C and 2D read this

Mount order, force.js `mount`:
1. `ensureStyles()` (the widget's own chrome) then `MX.graphMapStyles()` (the wf-*
   map paint — see PICKS, this is new and shared).
2. Build the DOM tree in one go and append it to `frame.host`: `.gf-wrap` holding
   bar, hits list, `.gf-map-host` with one `<svg class="mx-map">`, and the mermaid
   host. The svg must be in the document before MapView is constructed.
3. `MX.mermaidFrame(mermaidHost, {collapsed: frame.options.mermaidCollapsed})`.
4. `MX.graphMirrors(frame, {select, filters, reach})`.
5. `loadTarget(frame)` — everything that needs the graph happens in there, async.

How MapView is fed, `loadTarget`:
- `MX.graphCore()` -> `MX.graphLoad(target)` -> `MX.graphFilters(options)`.
- MapView is constructed ONCE, on the first successful load:
  `new core.MapView(svg, index, {onSelect, onDrill, look})`. A later target change
  reuses it and just reassigns `view.index`. `look` is `(e) => filters.stampOf(e)`.
- Then `buildSimInputs` (visible node list + degree-derived radii + raw edge list),
  `seedPositions`, `MX.forceLayout(index, filters, positions)` -> vm,
  `view.show(vm, {keepSelection, keepCamera: true})`.
- Per sim step the widget writes `positions` into the SAME `vm.placed` records
  (multiplied by `MX.forceWorldScale`) and calls `view.render()`. `show()` is
  called once per target or filter change, never per tick. This is the split
  2C and 2D should copy: `show` rebuilds elements, `render` just moves them.
- `view.onSelect` hands back only the focused node, so read `view.selectedIds` and
  `view.focusedId` off the view afterwards, not the callback argument.

How the mermaid frame is wired:
- `st.mermaid.set(index, frame.options.selectedIds, frame.options.reachDeep)` on
  every selection change — local pick, mirror arrival, and option round-trip.
- Collapse state lives on `st.mermaid.el.dataset.collapsed`; `getOptions` reads it
  back into `mermaidCollapsed`. The widget never stores it separately.
- `unmount` calls `clear()` and removes `el` from the DOM.

How camera persists:
- Option `camera {yaw, pitch, scale}`, contract 2.8.
- Out of the view: MapView fires a `wf-cam` CustomEvent on its own svg for yaw and
  pitch (map.ts :462-466) but NOT for scale, so the widget also listens on `wheel`
  and `pointerup` and reads `view.cam` directly. All three call `readCamera`, which
  writes the option and calls `MX.grid.markDirty` (debounced, grid.js:146-158).
- Into the view: `applyCamera` after `show`. `show` always ends in `fit()`, so the
  order is show -> centreFit -> applyCamera. Setting a remembered `scale` zooms
  about the middle of the box the way the wheel zooms about the pointer, otherwise
  the graph walks off-screen.
- `getOptions` reads the live `view.cam`, not the stored option.

PICKS I MADE

1. **Gravity — an added force term, not in the recipe.** The recipe as the spec
   wrote it (pair repulsion + edge springs + damping, nothing else) does not settle.
   I measured it across ~450 parameter combinations: with no centering term the
   cluster expands forever and `maxMove` decays like 1/sqrt(t), sitting at 0.07–0.4
   after 3000 steps and never reaching the 0.05 floor at any usable world scale.
   I added one term — a linear pull toward the origin, `opts.gravity`, default
   0.012 — which gives the system a bounded equilibrium. **`gravity: 0` reproduces
   the recipe exactly as written.** That is the whole revert. This is the one place
   I went past the spec's letter, and I did it because the spec's own Done-when
   ("settles under the cap") is unreachable without it. Brandon rules.

2. **`MX.forceSim` returns `{positions, maxMove}`, not the bare number.** The spec
   says "Returns the same Map, mutated, and a number". A JS function returns one
   value; part 3 says the worker posts back `{positions, maxMove}`. Returning that
   object makes the worker swap a true one-file change with no reshaping.

3. **`drillable` is `new Set()`, not `false`.** The spec's ViewModel list says
   `drillable: false`. `MapView.show` calls `vm.drillable.has(id)` (map.ts :305) and
   `paintState` calls it again (:822) — `false` throws on the first render. A Set is
   the empty value the field actually wants. `page: 0`, `crumbs: []` and `note: ""`
   are as the spec wrote them; MapView reads none of the three.

4. **World scale.** The sim settles into a tight ball (span ~215 sim units). A file
   tile is 96 world units wide (map.js:19), so at that span every tile would swallow
   its neighbours. `MX.forceLayout` multiplies sim coordinates by `WORLD_SCALE` 6 on
   the way into `placed`, giving world span 1190 and a closest pair of 141. The
   settle threshold stays in sim units, exactly as the spec wrote it.
   `MX.forceWorldScale` is exported so the widget can place a point itself per tick.

5. **STEPS_PER_FRAME 8.** The spec says the loop is requestAnimationFrame and a tick
   is one `MX.forceSim` call, but does not say one call per frame. At one per frame
   the seed graph needs 933 frames — 15.6 s, four times the cap. Eight steps per
   frame costs 0.37 ms and lands at 1.95 s. One constant at the top of force.js.

6. **`MX.graphMapStyles()` added to graph-core.js.** MapView builds svg elements
   carrying wf-* classes and no inline colour; without a stylesheet the widget draws
   a blank box. Nothing in the suite had one — cards.js is not a drawn widget. The
   sheet is Wayfinder's own `style.css` :601-676 and `reach.css` :10-50, ported with
   every colour resolved to the real value from `style.css` :11-79 and scoped under
   `.mx-map` so it cannot leak. It lives in graph-core.js because 2C and 2D need the
   same paint; they call `MX.graphMapStyles()` and set `class="mx-map"` on their svg.
   Contract addition, named here per section 2's own rule.

7. **`query` added as an option.** The spec's option list for 2B does not name it,
   but the body asks for "search box and hits as cards does" and cards persists its
   search text. Added so a refresh keeps the box filled. It rides on `graph.filters`
   like every other non-target key (contract 2.6 as changed today).

8. **`camera` and `frozen` and `dims` and `sim` ride on `graph.filters`.** That is
   contract 2.6 as Brandon changed it today — filters is every option key except
   target. Consequence worth naming: when a filter changes on one force widget, its
   camera goes out on the same payload and a sibling force widget on the same target
   adopts it. Camera changes on their own do not emit (only FILTER_FIELDS changes
   do), so an orbit never yanks the sibling; a checkbox does. If that is unwanted the
   fix is a narrowing in `filtersPayload`, not a contract change.

9. **Mirror applies go through `setOption` with an `st.applying` guard**, matching
   2A-fix2's ruling on cards.js rather than 2A's original direct-mutation shape. I
   found fix2 on the way out, not in my brief. Because a rebuild is expensive here
   (reseed, show, fit) the FILTER_FIELDS and dims branches of `onOption` return early
   while `st.applying` is true, and `applyFilters` does one rebuild after the loop
   instead of up to 22.

10. **`FILTER_FIELDS` is `MX.graphFilterFields`**, the one copy, also from fix2. No
    local array in force.js.

11. **`centreFit`.** `MapView.fit` and `frame` reserve 430 px on the right for
    Wayfinder's own card panel (map.ts :593, :510). A widget has no such panel, so
    the graph fits to the left of centre. `centreFit` runs `fit()` then nudges
    `cam.ox` back to the middle of the box. 2C and 2D will want the same three lines.

12. **Not verified live.** No browser. The rule bars starting the server, so every
    "Done when" line that needs a page — cards lighting on a force pick, two widgets
    redrawing on a filter change, refresh restoring state, the clipboard copy — is
    unrun. Everything above is node --check, a headless sim harness against the real
    graph file, and static read-through.

13. **Leaks I did not fix.** `MapView.bind` attaches a `window` keydown listener and
    a ResizeObserver and never removes them (map.ts :431, :457). A force widget that
    unmounts leaves both behind, and the keydown handler still answers `f`. The
    vendored files are byte-for-byte and not mine to edit; the fix is either a
    `destroy()` on MapView upstream or a wrapper. Naming it, not touching it.

14. **mermaid-frame.js's six kind colours are still the invented hex.** 2A-fix2
    flagged this and was gated out of the file; I am gated to force-sim.js and
    force.js and did not take it either. My `graphMapStyles` uses the real Wayfinder
    values, so the map and the mermaid pane disagree on colour until someone owns
    that file.

BRANDON'S TODOS
- Rule on the gravity term (PICK 1). `gravity: 0` is the exact recipe and does not
  settle; 0.012 settles in 1.95 s. Your call which one ships.
- The settle number is headless, not browser. Someone with the server up should run
  the real part-4 test: load the target, time first tick to settle, freeze mid-run,
  and check for stutter with three drawn widgets open. That number decides the
  worker swap.
- Rule on PICK 8 — camera riding along on `graph.filters` between two force widgets.
- mermaid-frame.js's six kind colours (PICK 14) still need an owner.

CLOSER REVIEW
- Gravity term added past the spec's recipe, with a one-value revert — closer/Brandon: rule on it.
- `drillable: false` in the spec would throw; built as `new Set()` — closer: confirm the spec is the thing that is wrong, not the code.
- `MX.graphMapStyles()` added to graph-core.js, a file 2A owns — closer: confirm that is the right home before 2C and 2D build on it.
- Headless settle numbers stand in for the browser test the rules bar — closer: carry the open browser test forward, do not mark part 4 closed.
