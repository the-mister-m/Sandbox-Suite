# SCOPE — Phase 2 — graph widgets

Renumbered 2026-09-12: was phase 1. Phase 1 is now the boilerplate
and test widget. DESIGN, DECIDED, and OPEN below are superseded by
Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md section 2
and the Phase2 Graph Widgets specs. Widgets are cards, Force Graph,
Stack Graph (planeLayout), Files Graph (fileLayout global, zoomLayout
local). FACTS FROM CODE stand.

Written 2026-09-12. LLM version. The human summary is in the 2026-09-11
session chat. Every line ref is from code read that session. Nothing built.

Depends on phase 1: routes, target option, mirror helper, loader.

---

## INTENT

Wayfinder's views become five suite widgets that read one graph.json and
share selection and filters over the bus. Brandon looks at the drawn
graph; an agent reads the mermaid pane; both point at the same node.
Wayfinder the app stays separate and gets its own cleanup session.

---

## FACTS FROM CODE

Wayfinder root: /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/

### The graph
- schema.ts (via Mapdocs/MAP-wayfinder.md GRAPH FORMAT): Graph is
  schema_version, root, nodes, edges, comments. Node is id, kind, lang,
  span, summary{shape, facts, weight}. Edge is from, to, kind, resolved.
  Comment is owner, file, span, bytes, where, what, text, raw.
- Node kinds: file, function, class, css-rule, element, asset.
- Edge kinds: imports, contains, calls, styles, touches. resolved is
  exact or guess.
- Id rules: file id is the path. Inner thing is path::name. Method is
  path::Class.method. Unnamed numbered path::div[3]. Repeat numbered
  from 2. Output is byte-identical for identical input.

### Index, index.ts
- :7 EXPECTED_SCHEMA_VERSION = 1. :124-135 loadGraph refuses a mismatch.
- :17-70 constructor builds byId, byKind, byFolder, out, in, children,
  parent, comments. Attaches path, name, folder to every node.
- :75-80 files, assets, roots, childrenOf, outOf, inOf.
- :83-88 neighbours. :93-99 isCopy. :102-110 foldersOf. :113-116
  planeOf cuts at the first slash.

### Reach, reach.ts
- :8-14 three rulings: exact edges only, both directions, depth is a
  switch. :16-19 first chain to claim a node keeps it, so chains are
  shortest.
- :25 CHAIN_CAP = 6. :28-31 ReachIndex needs only outOf and inOf.
- :49-75 reachFrom(index, from, deep). Returns from, ids, chains.
- :80-84 stepsFrom filters resolved === 'exact'.
- :89-92 chainText prints a ~> b ~> c.

### Filters, filters.ts
- :62-116 the class. Twenty booleans plus guesses as on, flag, off.
  Defaults at :92-115.
- :119-134 comments(all) filters by where and what.
- :138-147 nodes(index): a part stands or falls with its file.
- :150-154 edges(index, ok): both ends must survive; guesses off drops
  them. :157-159 stampOf: only flag draws the difference.
- :162-171 counts for the header.

### Layout, layout.ts
- :22-44 world constants. :37-38 HOME_YAW -0.42, HOME_PITCH 0.92.
- :50-62 FolderNode is synthetic, never written.
- :88-101 ViewModel: mode, planes, placed, pads, nodes, edges, camera,
  crumbs, drillable, drillTo, page, note. Every recipe emits this.
- :103-247 planeLayout: shelves. Group by top folder, pad per file,
  parts in a grid with wired parts front, planes stacked with elevation
  from projected shadow. Part radius :208 R_BASE + degree * R_STEP
  capped.
- :251-267 buildPad. :273-283 padExit. :290-308 makeProjection, yaw
  then pitch, orthographic, depth for painter's order. :312-315
  eyeVector.
- :333-349 shelfPack shared. :356-364 boxFor grows by square root of
  held. :369-384 rollUp merges edges between on-screen units, exact
  outranks guess.
- :418-488 fileLayout: one box per file, clusters per folder, flat.
- :515 LEVEL_CAP 60. :525-537 folderNode. :539-548 partsLevel.
  :552-616 flatLevel (path cut at first slash). :620-691 nestedLevel
  (one rung per segment). :693-743 zoomLayout picks by
  filters.nestFolders, pages by filters.capLevels.

### Renderer, map.ts
- :22-37 constants. :99-110 ViewModel as the renderer sees it.
- :145-207 MapView: cam, hidden, selectedIds, focusedId, hovered,
  reachSet, fanTo.
- :211-241 shell: defs with wf-ground gradient and wf-glow filter
  (:227-230), four groups planes, edges, nodes, labels.
- :244-339 show(vm): builds elements once per view model. Files are
  polygons, parts are circles at DOT_R. Labels only for files.
- :342-459 bind: left drag orbits, right or middle pans, flat views
  only pan, shift adds to selection (:353-354 ruling), wheel zooms
  toward pointer, f frames, shift+f fits all, ResizeObserver redraws.
- :476-496 glide eases camera. :507-520 frame. :531-555 select with
  add. :559-564 focusOn. :577-600 fit. :609-653 fitTo.
- :656-735 render: reprojects every element from vm.placed each call.
  Painter's order by depth. Edge arcs :847-853 quadratic.
- :737-831 paintState: classes dim, lit, picked, reachlit. Hover
  previews one hop of reach (:773-783). fanTo narrows to common reach.

### Cards, tabs, search (not read, from the map)
- card.ts 11.4K shows WHO, WHERE, COMMENTS n of m, SHAPE, USES, WEIGHT.
  tabs.ts 2.8K per-pick tabs. search.ts 3.7K substring over name, facts,
  comments. Read these in the phase 1 spec session.

### Build output, verified
- TS port/tsconfig.json: module esnext, target ES2022. package.json
  type module. out/ts/app/*.js built 2026-09-08. No node imports in
  index, reach, filters, layout, map.

### Suite side
- Widget contract: static/js/matrix/widget-frame.js:27-40 fields,
  :43-49 subscribe, :62-70 mount, :91-96 getOptions, :98-106 setOption
  saves the grid, :115-173 options panel draws booleans as checkboxes
  and everything else as text.
- Registry rows: library/registry/widgets.json, one row per widget
  with type, label, path, group. Registered by
  static/js/matrix/registry.js:13 MX.registerWidget.
- Script list: static/matrix.html:26-64.
- Graph list and scan routes: phase 0 job G.

---

## DESIGN

### Vendoring
- Copy out/ts/app/{index,reach,filters,layout,map}.js to
  static/vendor/wayfinder/. Check compiled map.js's import lines at copy
  time; viewcube is a type import and should be erased.
- A shared module static/js/widgets/graph/shared/graph-core.js does one
  dynamic import of the five at first mount, memoized like
  MX.monacoReady. Exposes loadGraph, Index, Filters, reachFrom,
  chainText, the three recipes, MapView.

### The five widgets, group "graph"
- cards: one pane for the focused pick. Reads Index for summary and
  comments. Tabs when more than one pick. Port card.ts and tabs.ts.
- layers: planeLayout, tilt camera. The 3D layer map.
- force: new recipe, tilt camera, sim controls in the bar.
- files: fileLayout, flat.
- map: zoomLayout, flat, breadcrumbs, page cap. Name to be relabeled.
- Every drawn widget has a mermaid pane below the SVG. Locked text.
  One line per reach chain, `a --> b --> c`. Node names colored by kind
  with the same classes the SVG uses.

### Force recipe
- Emits the layout ViewModel with mode 'tilt', one plane or none,
  placed x, y, z from a simulation, edges as-is, camera at HOME.
- The simulation is one function: (nodes, edges, positions) -> positions.
  Repulsion every pair, attraction per edge, damping, step. Swappable
  for d3-force later. Hand-rolled first.
- Ticks: update placed, call render(). A freeze switch stops ticking.
- Radius by degree using the existing R_BASE, R_STEP, R_CAP. Glow is
  the existing wf-glow filter on lit and reachlit. Weight can also
  scale radius by held count in file mode.

### Filters as options
- The Filters class fields become the widget's options object.
  Defaults from filters.ts:92-115. The options panel draws them.
  onOption writes the field and redraws. getOptions returns them.
- Guesses is a three-state string. The options panel draws it as text.
  Acceptable for phase 1.

### Bus channels
- graph:select {inst, ids, focused}. graph:filters {inst, filters}.
  graph:reach {inst, from, deep, ids, chains}. graph:graph {inst,
  name} when a widget loads a different graph.json.
- Every graph widget listens to all four and mirrors state. The source
  instance is ignored on receipt.

### Persistence
- Options hold: graph name, filters, selectedIds, focusedId, camera
  yaw, pitch, scale. A refresh comes back pointed at the same node.

### Graph source
- Option graph is a name from GET /api/library/graphs. The widget
  fetches the file through the existing fs raw route or a graphs read
  route. A rescan button posts to the scan route with the graph's root.

---

## DECIDED
- Vendor, not hand-convert.
- Path option plus spawn route. Both from phase 0.
- Window event bus with the server hop. Phase 0.
- Hand-rolled sim behind one function.
- Filters in as options, one key each, easy to remove.
- Five separate widgets, Brandon's call.

## OPEN
- Whether search ships in phase 1.
- The map widget's new name.
- Whether the force recipe runs in a worker for larger graphs.
- Whether cards ship in phase 1 or phase 5 with the agent tools.

---

## READS FOR THE SPEC SESSION
- The five files above, about 75KB. card.ts 11.4K, tabs.ts 2.8K,
  search.ts 3.7K if shipping.
- static/js/widgets/usertools/viewer/viewer.js 14.7K as the template
  for a widget that shows a file by path.
- static/js/matrix/widget-frame.js and grid.js again, 20KB.
- Docs/Scope/Code Canvas port/SCOPE-phase0-foundation.md for the bus
  and graphs routes as built.

## TESTS
- Headed, per widget: mount, load the seed graph, click a node, check
  the mermaid pane shows its reach.
- Cross-widget: select in layers, cards follows, files lights the same
  file, map drills to it.
- Force: sim settles under a time cap on the seed graph; freeze stops
  movement; refresh restores camera and selection.
