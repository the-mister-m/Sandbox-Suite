# SCOPE — OLD phases 4 to 6 — Motion, agent hands on, threejs

Superseded 2026-09-12. Motion and threejs are now one phase, phase 4,
in SCOPE-phase4-motion-3d.md. The agent phase is gone: its bus emit
tool is phase 1 job 1A, its reach CLI is not built (the mermaid frame
is the agent's reach), its merge rule is dropped, Neo4j is a separate
session. FACTS FROM CODE below stand and the phase 4 scope points at
them.

Written 2026-09-12. LLM version. The human summary is in the 2026-09-11
session chat. Every line ref is from code read that session. Nothing built.

Old numbering: phase 4 depended on phase 2. Phase 5 on phases 0 and 1.
Phase 6 on phases 2 and 4.

---

# PHASE 4 — Motion

## INTENT

The Motion widget authors and plays animations and behaviors for a
canvas. Author in Canvas mode, play in Preview mode. Same document,
same iframe. Nothing exists for this in any code read; every hook does.

## FACTS FROM CODE

Code Canvas root: /Users/moth3rship/Desktop/AI Design/Code Canvas/app/
- state.js:260-261 every widget record has behaviors [] and
  animations []. :80 the doc library has animations [] and
  behaviors []. Nothing reads them except counts.
- render.js:49-60 schematic shows b and a counts. :94-96 page(pageId,
  opts) reads opts.play and changes nothing. That is the seam.
- render.js:24-46 widget: custom css goes into the one style block.
  Keyframes can go there too. No js is ever read.
- kit-container.js:4 ANIMATABLE ['opacity', 'offset', 'fill']. :21
  animatable on the definition. Other kit files declare their own.
- kit-container.js:15-38 the definition shape has a js template field,
  always empty in what was read.
- nav.js:65-96 presetObjects: library objects are named, carry widget
  records, and are the pattern for named reusable things.
- Open Design gives nothing for authoring. From
  Mapdocs/MAP-open-design-editor.md FREEZE AND PLAY: freezeMotion
  (FileViewer.tsx:11021) settles deck animations for export only. The
  runtime-state capture protocol (:8458-8494, :9954-9979) survives
  frame reloads; its shape is unread, in packages/contracts.
- Open Design's runtime overrides, source-patches.ts:5-92 and
  :454-530, write a JSON script block and an applier script into the
  HTML file. That is the shape for storing motion inside a raw HTML
  file with no doc.

## DESIGN

### Data
- animation: {id, prop, from, to, duration, easing, delay, trigger,
  iterations}. prop must be in the widget type's animatable list.
  trigger: load, hover, click, scroll, or a behavior id.
- behavior: {id, event, action, target, args}. event: click, hover,
  load, key. action: navigate (uses widget.link), toggle-class, show,
  hide, run-animation, custom (calls a named function in code.js).
- Library-level animations and behaviors are named and referenced by
  id from widget records, like library.objects. Version 3 of the doc
  if the record shape changes; add to migrate.

### Author, the Motion widget
- Option canvas like Tools. Follows canvas:select.
- Per selected widget: an animations list and a behaviors list, add,
  edit, remove, reorder. A library tab for named ones. A timeline
  strip per animation showing delay, duration, iterations.
- Writes through State: setAnimations(id, list), setBehaviors(id,
  list), setLibraryMotion(kind, list). New State methods, batched.

### Play, in Render
- opts.play true: for each widget's animations emit @keyframes and an
  animation rule into the style block; for behaviors attach listeners
  in the iframe document; if code.custom and code.js, inject a script
  tag into the iframe. Same-origin makes all three plain.
- opts.play false: emit none of it. Canvas mode is frozen by design.
- Preview mode on the Canvas widget sets play true and hides chrome.

### File mode motion
- Store as the runtime-overrides pattern: a JSON script block with
  animations and behaviors keyed by element id, plus an applier script
  that reads it on load. The Motion widget edits the block through a
  patch. Same Canvas mode and Preview mode rule.

## DECIDED
- Motion is one widget, authors and plays.
- Play lives in Render behind the existing seam.
- Same-origin iframe is the runtime.

## OPEN
- Timeline UI depth for phase 4: list only, or a scrubber.
- Whether custom JS runs in Preview only or also on export.
- Scroll trigger needs an observer; phase 4 or later.

## READS FOR THE SPEC SESSION
- render.js, state.js, all kit-*.js. About 45KB.
- source-patches.ts :5-92 and :454-530. About 6KB.
- The phase 2 shared module as built.

## TESTS, headed
- Author an opacity animation on load, switch to Preview, the element
  fades. Switch to Canvas, it holds still.
- A click behavior with navigate follows the widget's link in Preview.
- Custom js with a console line runs in Preview only.
- File mode: the override block appears in the saved HTML and plays
  when the file is opened plain in a browser.

---

# PHASE 5 — Agent hands on

## INTENT

An agent reads the graph, walks it, and moves the widgets, through the
same bus and files Brandon uses.

## FACTS FROM CODE
- Wayfinder TS port/app/index.ts is 4.7KB and pure. reach.ts:49-92 is
  pure. Both run in Node without the browser.
- out/ts/analyzer/index.js:131-152 the CLI shape to copy for a reach
  CLI.
- Phase 0 bus frame: widget_bus {channel, payload, inst} through
  frames.py handle() and web_io send_widget_bus.
- engine/tools.py and tools_web.py exist per CLAUDE.md as the agent
  tool set. Not read this session.
- Mapdocs/MAP-open-design.md GRAPH-SHAPED THINGS: Open Design holds
  registries and manifests, no node and edge graphs. Nothing to borrow.
- Neo4j work lives in a concurrent session. Mapping only here.

## DESIGN
- reach CLI in Wayfinder: node out/ts/tools/reach.js <graph.json> <id>
  [--deep] [--mermaid]. Wraps Index and reachFrom, prints chains or
  mermaid lines. An agent runs it from a terminal.
- Agent tool: widget_bus_emit(channel, payload) in engine tools, sends
  the frame. The graph widgets already listen. Selection and filters
  become agent-settable.
- Neo4j mapping: node label from kind, properties id, path, name, lang,
  shape, facts. Relationship type from edge kind, property resolved.
  Comments as nodes with where and what, related to owner.
- Knowledge graph: new node kinds doc, spec, receipt, session. Edges
  specs, receipts, mentions. An agent emits these in the same schema
  into a second file merged at load. Wayfinder's analyzer never parses
  markdown; determinism holds for the code half only.

## OPEN
- Whether the reach CLI lives in Wayfinder or as a Sandbox Suite script.
- Whether agent tools gate bus emits.
- Merge rule for two graph.json files with the same root.

## READS FOR THE SPEC SESSION
- engine/tools.py, tools_web.py. Sizes not measured.
- index.ts, reach.ts again, 9KB.
- The phase 0 bus as built, the phase 1 channels as built.

---

# PHASE 6 — threejs and CAD

## INTENT

A canvas that holds a 3D scene, edited with the same Tools and Motion
widgets. Not sized. Listed so the boilerplate for phases 2 and 4 does not
close the door.

## FACTS FROM CODE
- Open Design file-viewer-render-mode.ts:237 htmlNeedsPoweredPreview
  detects GPU, Worker, WASM, SharedArrayBuffer. FileViewer.tsx:389-390
  POWERED_PREVIEW_SANDBOX adds allow-same-origin, popups, forms,
  modals, pointer-lock for those pages.
- Same-origin is decided for the Canvas widget in phase 2. That door
  stays open.
- Nothing else read this session touches 3D.

## WHAT THE BOILERPLATE MUST KEEP
- The iframe stays same-origin.
- Render's play seam injects scripts; a three.js bundle is one more
  script.
- The kit's definition shape allows a widget type whose html is a
  canvas element and whose js is the scene. The animatable list can
  name scene properties.
- Motion's animation record is prop, from, to, duration. Scene
  properties fit that record.

## OPEN
- Everything else.
