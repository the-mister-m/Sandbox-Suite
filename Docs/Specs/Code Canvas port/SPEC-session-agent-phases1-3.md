# SPEC — Session agent — Code Canvas port, phases 1 to 3

Written 2026-09-12 by the phase 1 design session. Brandon set every
ruling in it. This is the one document the session agent reads. It
holds the run order, the contracts every builder writes against, the
fact index for answering a builder's question without a read, and the
troubleshoot map. Job specs hang off it; they never restate it.

Phase 4 has a scope doc only. See INDEX OF DOCS.

---

## 0. RULES FOR THE SESSION AGENT

- Global rules: ~/.claude/CLAUDE.md. Recite them first.
- Every builder, redpen, and headed tester is a `goto` agent with a
  model override. Never `general-purpose`. The spec names the model.
- Comments in code are label, function, state. Short. No decisions.
- "spine" is banned. No README. HOWTOs only.
- Never touch MEMORY.md or CLAUDE.md without asking.
- Do not read Docs/Scope/Code Canvas port/SEAM-phase0-phase1-targets.md.
  Brandon ruled it out. Its target model is not this one.
- Serial in phase 3. Parallel only where the map says parallel.
- Brandon runs headed passes for taste whenever he likes. The opus
  headed pass at each phase end is for mechanics and gates the phase.
- Seams under about 1K tokens of work are yours, not a builder's:
  a registry row, a script tag, a one-line listener. Do them, log them
  in your receipt.

### Mid-run rule, Brandon's

When a builder or redpen hits a call nobody made:
- Expensive up front, cheap to undo. Build the fuller thing behind a
  toggle in the widget's options, default to the safer state, and put
  the undo path in the receipt.
- If the fuller thing needs more than one file changed outside its own
  folder, stop and write the question in the receipt instead.
- A redpen that finds a small double-check keeps going and notes it.
  One that finds a multi-consideration problem picks the easy undo or
  stops. It never redesigns.

### Budgets

- Builders: 150K to 200K. The spec says the number. A builder that
  passes 150K with parts left writes a handoff and stops.
- Redpens: 80K. Headed testers: 120K.
- A builder never writes a receipt past 250K.

### Spawn shape

Agent tool, subagent_type `goto`, model as the spec says, prompt:

    Read and follow <spec path>. Recite the global rules first.
    Your receipt goes to <receipt path>. Stop at the token rule.

Resume a finished agent with SendMessage when its receipt asks a
question you can answer. Do not respawn.

---

## 1. RUN ORDER AND MODELS

```
PHASE 1  boilerplate                                   model   cap
  1A routes + targets route + agent emit tool          sonnet  150K
  1B target option + mirror + loader        (parallel) sonnet  150K
  1D test widget + HOWTO-repipe                        sonnet  150K
     1R redpen sonnet 80K ── 1H headed opus 120K

PHASE 2  graph widgets
  2A vendor + graph-core + mermaid frame + cards       sonnet  180K
  2B Force Graph                                       opus    180K
     2R redpen sonnet after 2B
  2C Stack Graph ─┬─ 2D Files Graph        (parallel)  sonnet  150K each
     2R redpen sonnet after both ── 2H headed opus

PHASE 3  canvas 2D, serial, redpen after every job
  3A canvas core                                       opus    180K
  3B Canvas widget                                     opus    200K
  3C Tools widget                                      opus    150K
  3D Code widget                                       sonnet  150K
  3E Annotate                                          sonnet  150K
     3H headed opus

PHASE 4  scope doc only. No specs until phase 3 is green.
```

Gates: a phase does not start until the previous phase's headed
receipt has zero FAIL lines. 1B does not start 1D until 1A and 1B
receipts exist. 2B does not start until 2A's receipt exists. 2C and
2D start together after 2R passes on 2B.

Redpen specs: one per phase, parameterized by job. Headed specs: one
per phase. Both in the phase folder.

---

## 2. CONTRACTS

Every builder writes against these. They are the law for phases 1 to
3. A builder that needs a field not here adds it and names it in the
receipt. Nothing here is renamed, ever.

### 2.1 Target

- Option key `target`, string. Empty string means none.
- What the string names depends on the family:
  - graph family: a file name on the shelf, `library/graphs/<name>.json`.
  - canvas family: a document path under the workspace root. A page
    key may sit beside it later; `target` stays one string.
- Current targets: every `target` value held by any widget in any grid
  file of this session. Server route, section 2.5. A surface closed by
  the session window deletes its grid file (session-panel.js:59-60,
  server.py:1827), so its targets leave the list on the next fetch.
- The options panel draws `target` as a select of current targets plus
  a New target button. Section 2.3 says how a module declares that.
- Two widgets with the same `target` on the same surface mirror
  selection and whatever else their family shares. Section 2.2.

### 2.2 Mirror helper, static/js/widgets/shared/mirror.js

- `MX.mirror(frame, channel, apply)` returns `{emit(fields), off()}`.
- `emit(fields)` sends `MX.bus.emit(channel, {target, inst, ...fields},
  {remote: true})` with `target` read from `frame.options.target` and
  `inst` from `frame.id`.
- On receipt: drop if local and `payload.inst === frame.id` (remote
  arrivals are never dropped on inst, two tabs on one surface share
  instance ids; 1H test 6); drop if `payload.target !==
  frame.options.target`; else `apply(payload, meta)`.
- `off()` removes the listener. Widgets call it in unmount.
- Payload rule: fields are added, never renamed. `target` and `inst`
  are always present.
- Channel names are dotted, family first: `graph.select`,
  `canvas.select`. Full lists in 2.6 and 2.7.

### 2.3 Options panel controls, widget-frame.js

- A widget module may export `optionControls`: an object keyed by
  option name. Each value is `{kind: "select", values: () => string[]
  | Promise<string[]>, onNew?: (frame) => void}`.
- `toggleOptions` (widget-frame.js:132-190) draws a `select` for a
  key that has a control, populated from `values()`, with a New button
  when `onNew` is present. Every other key keeps today's checkbox or
  text.
- `MX.targetControl(listFn, onNew)` in target-option.js returns a
  ready-made control for `target`. Graph widgets pass the shelf list;
  canvas widgets pass the current-targets list filtered to `.json` and
  `.html`.
- `guesses` in the graph family uses the same control with values
  `["on", "flag", "off"]`.

### 2.4 Module loader, static/js/widgets/shared/module-ready.js

- `MX.moduleReady(key, loader)` memoizes one promise per key, the
  MX.monacoReady pattern (monaco-readonly.js:35-55).
- `loader` returns a promise of anything. For Wayfinder it is one
  `import()` per vendored file, resolved to an object of the five.

### 2.5 Server routes, phase 1

- `GET /api/library/graphs` → `{list: [{name, root, mtime, nodes,
  edges, comments}]}`. Walks `library/graphs/*.json`. `root` is the
  file's `root` field or "".
- `GET /api/library/graphs/<name>` → the file as JSON.
- `POST /api/library/graphs/import` `{path}` → copies a graph file
  from anywhere on disk onto the shelf under its basename. Refuses a
  file whose `schema_version` is not 1. This is the New target button
  for the graph family. No analyzer. No scan route in phase 1.
- `GET /api/targets/<sid>` → `{targets: [{value, widgets, surfaces}]}`.
  Walks `library/grids/<sid>/*.json`, every widget's `options.target`,
  non-empty strings only. `surfaces` is the list of surface ids that
  hold it.
- `POST /api/widget-bus` `{channel, payload}` → calls
  frames.py `_broadcast_all("send_widget_bus", channel, payload,
  "agent")` and returns `{ok: true}`. The agent tool posts here.

### 2.6 Graph family channels

- `graph.select` `{target, inst, ids, focused}`.
- `graph.filters` `{target, inst, filters}` where filters is the
  options object minus `target`.
- `graph.reach` `{target, inst, from, deep, ids, chains}`.
- `graph.open` `{target, inst, path, span}`. Emitted by cards when its
  `openInEditor` option is true. Absolute path is the graph's `root`
  joined with the node's path. Editor listens when its own
  `followGraph` option is true.

### 2.7 Canvas family channels

- `canvas.select` `{target, inst, ids}`. Pinned minimal.
- `canvas.focus` `{target, inst}`. Emitted on any pointerdown in a
  canvas widget.
- `canvas.doc` `{target, inst, mode, path}`. mode is `doc` or `file`.
- `canvas.change` `{target, inst}`. After any State commit.
- `canvas.freeze` `{target, inst, on}`. Code widget asks; canvas obeys.
- `canvas.mode` `{target, inst, mode}`. mode is `code`, `canvas`,
  `preview`. Phase 4's Motion widget listens. Emit it in phase 3.

### 2.8 Options every widget in these families persists

- graph family: `target`, every Filters field by its own name,
  `selectedIds`, `focusedId`, `camera` `{yaw, pitch, scale}`, plus
  per-widget keys named in the job spec.
- canvas family: `target`, `mode`, `zoom`, `selection`, `schematic`,
  plus per-widget keys named in the job spec.
- Every widget round-trips every key through `onOption` and calls
  `MX.grid.markDirty(frame)` on internal change. Phase 0 rule.

### 2.9 File frames

- `open` `{path, inst}` → `file` `{path, content, inst}`.
- `save` `{path, content, inst}` → `saved` `{path, result, ok, inst}`
  and `tree_dirty` suite-wide.
- Docs/HOWTO-frames.md rows 49, 50, 92, 94, 101.

### 2.10 Play seam, canvas core

- `render.page(pageId, {play: boolean})`. Phase 3 emits nothing for
  `play: true`. Phase 4 fills it. The signature does not change.

---

## 3. FACT INDEX

Every line ref a builder might ask about. Grouped by file. Read from
code on 2026-09-11 and 2026-09-12. Answer a builder from here first.

### Suite, as built after phase 0

widget-frame.js
- :19-25 startingOptions: registry defaults, else module.defaults.
- :27-40 WidgetFrame fields: id, type, sid, options, host, el, _mod.
- :43-49 subscribe(types) or "*". :51-53 send → MX.socket.send.
- :55-60 deliver filters by _wants. :62-70 mount calls mod.mount.
- :73-78 canClose. :80-89 unmount. :91-96 getOptions prefers module.
- :98-110 setOption: writes, calls onOption, saves grid, emits
  surface.widget remote unless _applying.
- :113-123 applyOptions: remote, never re-saves.
- :132-190 toggleOptions: boolean → checkbox, else text. 2.3 changes
  this.

bus.js
- :16-31 on returns an off function; off. :32-42 emit local then
  remote when opts.remote. :45-53 socket frames: drops own TAB_ID,
  calls listeners with (payload, {remote: true}).

grid.js
- :14-28 WINDOW_ID from URL or sessionStorage; TAB_ID random.
- :34-45 grid fields: instances, frames, surfaceName, _applying,
  _dirtyTimers.
- :48-53 adoptSurface. :55-67 init: socket fanout to frames, three
  bus listeners.
- :83-142 load and save, retry once, saveFailed.
- :146-158 markDirty(frame): one timer per frame id, 2s, saves and
  emits surface.widget.
- :161-166 _announce. :169-209 _onLayoutMirror. :212-216
  _onWidgetMirror. :218-228 snapshot.
- :245-290 surfaces: list, unique name, newSurface.
- :310-345 add and remove instance.

registry.js
- :13-15 MX.registerWidget(type, mod). :17-19 MX.widgetModule.
  :21-23 MX.registryRows. :25-30 MX.widgetLabel.

matrix.html
- :26-65 script list. New scripts go after :45 (derived.js) and
  before :46. Vendored modules are ES modules loaded by import(), not
  script tags.

library/registry/widgets.json
- One row per widget: type, label, path, group. Groups today: chat,
  queue, usertools, agent, adetools. New groups: `graph`, `canvas`.

library/grids/<sid>/<surface>.json
- `{cols, rows, name?, widgets: [{id, type, slot{col,row,w,h},
  options}]}`.

session-panel.js
- :43 gridSurfaces fetches /api/grid/<sid>. :51-57 renameSurface.
  :59-60 closeSurface DELETEs the grid file. :188-233 surfaces list.

server.py
- :763 fs/browse. :780 fs/read. :1515 fs/write. :1531 fs/put. :1555
  fs/stat. :1565 fs/raw. :1577 fs/pick.
- :1423-1460 library/presets routes, the pattern for library/graphs.
- :1627 library/maps list, :1640 archive.
- :1754-1778 api_grid_list walks GRIDS_DIR/<sid>. :1800-1809 read.
  :1812-1824 write. :1827-1836 delete. `_grid_name`, `_grid_path`,
  `_grid_body`, `GRIDS_DIR` are the helpers.
- :1906 socket route /ws/ade/<sid>.

ade/frames.py
- :95-104 _broadcast(environment, method, *args). :106-115
  _broadcast_all(method, *args), every open socket.
- :561 handle(ctx, msg). :611 user frame. :1160-1164 widget_bus
  branch → _broadcast(ctx.environment, "send_widget_bus", ...).

ade/web_io.py
- :153 send_file(path, content, inst). :163 send_saved. :193
  send_tree_dirty. :197-201 send_widget_bus(channel, payload, inst)
  writes {type: "widget_bus", channel, payload, inst}.

engine/tools.py
- :15-39 Tool class: name, edge, scope, schema, marker, keyword,
  parse, hint, prompt, run, summary, needs_region, fenced,
  queue_type, queue_identity, denied.
- :44-59 _scope_any, _scope_path, _denied_default.
- :72-126 read_file: the row shape to copy. Schema :79-92, prompt
  :102-106, run :109-114, summary :117-119, denied :122-126.
- :997-1060 TOOLS list. A new Tool row goes at the end.

Widgets
- viewer.js :374-420 the module: mount/unmount/onOption/onFrame/
  getOptions. :96 fetches /api/fs/read. :349-357
  MX.mountReadonlyMonaco. The template for a by-path widget.
- editor.js :3-8 frames. :137-169 createInstance via MX.monacoReady,
  ed.editor is the Monaco instance. :310 sends open. :370 sends save.
  :394 registerWidget. :528-563 onFrame: file, saved. Filters by
  msg.inst.
- browser.js :55-64 openInWidget. :325 subscribes.
- monaco-readonly.js :35-55 ready(), memoized. :70 MX.monacoReady.
  :72-76 language from path. :78-103 mountReadonlyMonaco.
- root-browser.js :69 MX.openRootBrowser(opts) with opts.ext.

### Wayfinder, source /Users/moth3rship/Desktop/AI Design/Wayfinder

Compiled output: `out/ts/app/`. Not `TS port/out/`. Built 2026-09-08.
Sizes: index.js 4.3K, reach.js 2.9K, filters.js 5.5K, layout.js
27.3K, map.js 35.8K, card.js 10.7K, tabs.js 2.5K, search.js 3.1K.

Import lines in the compiled five, checked 2026-09-12:
- layout.js:16 `import { Index } from './index.js'`.
- map.js:14 `import { makeProjection, PLANE_THICK } from './layout.js'`.
- map.js:18 `import { reachFrom } from './reach.js'`.
- index.js, reach.js, filters.js import nothing.
- No viewcube import survives compilation. Nothing from node.
- card.js:8 imports monaco.js. That line is cut in the port.
- card.js:10 imports CHAIN_CAP from reach.js. Keep.

Graph files on disk: `Wayfinder/out/graph.json` root
`/Users/moth3rship/Desktop/AI Design/Wayfinder/fixtures/viewer`, 84
nodes, 142 edges, 186 comments, schema 1. Three siblings without
comments or root: graph.ts.json, graph.js.json, graph.baseline.json.
The first target is graph.json.

Exports, compiled:
- index.js :4 EXPECTED_SCHEMA_VERSION = 1. :5 class Index. :106
  loadGraph(url) async, fetches and checks the version.
- reach.js :22 CHAIN_CAP = 6. :24 emptyReach. :27 reachFrom(index,
  from, deep=false) → {from, ids, chains}. :68 chainText(chain, label)
  prints `a ~> b ~> c`.
- filters.js :34 GUESS = {ON, FLAG, OFF}. :35 class Filters. Defaults
  in the constructor: codeFiles true, otherFiles true, duplicates
  true, guesses 'flag', nestFolders false, capLevels false,
  searchName true, searchFacts false, searchComments false, reachMap
  false, reachCard false, reachDeep false, reachCommon false,
  commentHeader false, commentLeading true, commentTrailing true,
  commentInterior true, commentOrphan false, commentProse true,
  commentDead true, commentTodo false, commentDirective false.
- layout.js :18-22 PART_STEP 34, PAD_INSET 22, PAD_GAP 40,
  PLANE_MARGIN 76, PLANE_THICK 15. :31-32 HOME_YAW -0.42, HOME_PITCH
  0.92. :35-37 R_BASE 6.2, R_STEP 1.05, R_CAP 8 (not exported; force
  copies the numbers). :38 planeLayout(index, filters). :194 padExit.
  :208 makeProjection({yaw, pitch, scale, ox, oy}). :227 eyeVector.
  :327 fileLayout(index, filters). :416 LEVEL_CAP 60. :573
  zoomLayout(index, filters, trail=[], page=0).
- map.js :20 DOT_R 4.3. :33 class MapView. :104 wf-ground gradient.
  :108 wf-glow filter.

Source TS, for behavior questions (line refs from the 2026-09-11 read):
- index.ts :17-70 constructor builds byId, byKind, byFolder, out, in,
  children, parent, comments; attaches path, name, folder. :75-80
  files, assets, roots, childrenOf, outOf, inOf. :83-88 neighbours.
  :93-99 isCopy. :102-110 foldersOf. :113-116 planeOf.
- reach.ts :8-14 exact edges only, both directions, depth is a
  switch. :16-19 first chain to claim a node keeps it. :80-84
  stepsFrom filters resolved === 'exact'.
- filters.ts :119-134 comments(all) → {shown, total}. :138-147
  nodes(index). :150-154 edges(index, ok). :157-159 stampOf. :162-171
  counts.
- layout.ts :88-101 ViewModel: mode, planes, placed, pads, nodes,
  edges, camera, crumbs, drillable, drillTo, page, note. :103-247
  planeLayout. :251-267 buildPad. :290-308 makeProjection. :333-349
  shelfPack. :356-364 boxFor. :369-384 rollUp. :418-488 fileLayout.
  :525-537 folderNode. :552-616 flatLevel. :620-691 nestedLevel.
  :693-743 zoomLayout.
- map.ts :145-207 MapView fields: cam, hidden, selectedIds, focusedId,
  hovered, reachSet, fanTo. :211-241 shell. :244-339 show(vm).
  :342-459 bind: left drag orbits, right/middle pans, flat views only
  pan, shift adds to selection (:353-354), wheel zooms toward
  pointer, f frames, shift+f fits all. :476-496 glide. :507-520
  frame. :531-555 select(id, add). :559-564 focusOn. :577-600 fit.
  :609-653 fitTo. :656-735 render. :737-831 paintState: dim, lit,
  picked, reachlit; hover previews one hop (:773-783).
- card.ts, read 2026-09-12: :14-22 KIND_WORD. :27-37 CardNode. :39-44
  CardIndex needs byId, outOf, inOf, commentsOn. :47-49
  CommentSwitches. :51-175 class Card: el, index, onJump, node,
  chains, switches. :65-87 constructor: delegated [data-jump] click,
  EDITS_EVENT listener (cut), empty(). :89-102 empty() text names
  Stack, Files, Layers (rewrite). :104-174 show(node): rows WHO,
  WHERE, COMMENTS n of m, SHAPE, HOLDS for synthetic else USES →
  and ← USED, WEIGHT, REACH when chains, EDIT when dirty (cut);
  :173 openInEditor (cut, becomes graph.open). :178-194 commentList.
  :196-198 field. :200-206 factList caps 14. :208-234 edgeList grouped
  by kind, sorted, data-jump. :238 CHAIN_ROWS 20. :242-255 chainList.
  :257-263 weight. :265-268 esc.
- tabs.ts, read 2026-09-12: :22-24 module state. :26-31 TabsOptions
  {onPick, label}. :33-45 mountTabs delegated click. :50-65
  paintTabs(ids, focused): hidden when empty, textContent not
  innerHTML.
- search.ts, read 2026-09-12: :25-34 SearchNode, SearchIndex {nodes,
  commentsOn}. :38-42 SearchFields three booleans. :45-57
  searchIds(index, query, fields): case-insensitive substring, source
  order, empty when all switches off. :60-81 haystack. :86-91
  paintHits(el, ids).

### Code Canvas, source /Users/moth3rship/Desktop/AI Design/Code Canvas/app

Sizes: canvas.js 26.6K, drawer.js 18.5K, panel.js 22.2K, nav.js 16.8K,
state.js 14.2K, resolve.js 5.7K, render.js 5.2K, kit.js 2.4K,
kit-container.js 4.7K, kit-input.js 6.8K, kit-media.js 6.7K,
kit-reveal.js 1.6K, kit-status.js 4.1K, kit-text.js 2.2K,
kit-navigation.js 0.1K, filler.js 3.5K, hierarchy.js 5.6K (cut),
style.css 4.4K.

state.js
- :28-63 v1→v2 migration. :66-83 defaultState. :146-158 absFrame.
  :163-183 rebase. :188-208 keepOrder. :223-232 commit snapshots.
  :250-263 widget record. :358-363 setCode. :416-430 batch. :444-455
  undo, redo. :462-477 load migrates. :479-493 assets {id, name,
  mime, data}.
kit.js :4-26 Kit shape. :29-34 registerTool. :37-48 register rejects
  duplicates. :66-74 byTaxonomy.
kit-container.js :3-4 TOOLS, ANIMATABLE. :8-13 CSS template. :15-38
  definition shape. :109-124 kit-registered tool builder.
resolve.js :15-21 def. :24-32 palette. :35-45 googleFont. :48-54
  asset. :57-82 prop. :85-127 escape, items, content. :131-136
  tagFor. :139-149 map. :152-157 fill.
render.js :10-21 flush. :24-46 widget. :49-60 schematic. :63-70
  anchor. :75-87 position. :94-96 opts.play seam. :95-134 page.
canvas.js :3-20 module state. :22-60 STYLE. :150-162 viewport.
  :171-198 zoom control. :210-221 applyZoom. :226-249 setZoom.
  :252-262 fitZoom. :265-287 drawGrid. :297-320 paintSelection.
  :323-329 setSelection dispatches canvas:select. :341-349 redraw.
  :352-367 place. :372-387 duplicate. :391-403 shiftOrder. :413-464
  context menu. :476-532 onMouseDown. :534-578 onMouseMove. :580-635
  onMouseUp. :650-653 editing guard. :656-728 onKeyDown. :746-753
  seven capture listeners. :755-761 State.on change. :763-786 API.
panel.js :41-51 sharedTools. :55-67 bindTyping 500ms. :70-101
  writers. :112-184 text tool. :213-227 box. :230-282 color. :285-314
  link. :317-326 notes. :329-334 TOOL_BUILDERS. :365-428 renderOrder,
  :404-421 drop logic. :432-440 notes modal. :549-552 registerTool.
  :553-562 init listens on window.
drawer.js :4-10 state. :89-105 sourceFor, displayFor. :120-139
  buildCodeText. :149-201 allHeaders, parseFields, parseBlocks.
  :205-216 editor adapter. :217-239 scrollToWidget. :241-259
  tryLoadMonaco (replace). :285-292 renderCode. :293-303 renderNotes.
  :311-330 lock UI. :331-352 applyEdits. :353-357 discardEdits.
  :379-479 skeleton. :481-494 init.
nav.js :65-96 presets. :99-115 emptyDoc. :125-175 localStorage (cut).
  :242-274 renderLibrary. :277-294 wireDrop. :297-333 renderOptions.
  :366-404 topbar. :407-427 page tabs. :446-481 onSave (cut).

### Open Design, /Users/moth3rship/Downloads/open-design-main/apps/web/src

Sizes: edit-mode/bridge.ts 58.6K, source-patches.ts 27.8K, types.ts
5.9K, components/PreviewDrawOverlay.tsx 74.5K. Read ranges only.

bridge.ts :1-2 selector. :16-27 domPath. :33-39 stableId. :78-86
  kind. :88-169 keyboard guard. :349-362 alignmentGuidesFor. :364-421
  measurementsFor. :444-482 targetFrom. :519-536 readTranslateBase,
  composeTransform. :811-833 finishActiveTextEdit. :834-862
  makeEditable. :886-905 applyPreviewStyles. :906-1011 message
  handler. :1015-1032 pointerdown. :1033-1045 pointerup. :1158-1200
  pointermove, DRAG_THRESHOLD 4. :1297-1368 guides stylesheet.
source-patches.ts :109-185 applyManualEditPatch. :235-245
  parseSource. :247-250 serializeSource. :252-255
  isManualEditFullHtmlDocument. :278-286 findEditableElement.
  :592-605 findElementByPath. :657-663 setInlineStyles. :674-688
  replaceOuterHtml. :690-701 last renderable guard. :703-713
  setCssToken. Cut: :5-92, :454-530 runtime overrides; :288-445
  brand kit.
types.ts :47-87 ManualEditStyles. :110-119 patch kinds. :121-128
  history entry.
PreviewDrawOverlay.tsx :38 ANNOTATION_EVENT. :63-69 props. :661-701
  undo/redo stacks. :860-879 snapshot. :926-968
  compositeWithBackground. :970-1035 send.

---

## 4. TROUBLESHOOT MAP

Symptom → where to look. Answer from here before spawning anything.

- Widget mounts blank with `[no widget module for X]` → registry row
  missing in widgets.json, or script tag missing in matrix.html
  :26-65, or MX.registerWidget type string differs from the row.
- Options panel shows a text box where a select should be → module
  has no `optionControls`, or widget-frame.js :151-177 change from
  1B not applied.
- Target dropdown empty → /api/targets/<sid> returns nothing: grid
  files hold `options.target` as "" or the key is spelled differently.
  Check library/grids/<sid>/*.json.
- Two widgets on one target don't follow each other → one of them
  emits without `{remote: true}`, or payload.target differs (one is
  "" ), or apply() drops on inst equality by mistake. mirror.js.
- Second tab doesn't mirror → bus.js :47 drops own TAB_ID; check
  both tabs have different MX.TAB_ID (grid.js :27). Check
  surface.widget still fires from setOption (:107-109).
- Agent emit never lands → POST /api/widget-bus route missing, or
  `_broadcast_all` not imported in server.py, or the tool row is not
  in TOOLS (tools.py :997).
- Vendored import fails → import() path wrong (must be
  `/static/vendor/wayfinder/<file>.js`), or a file still imports
  something not copied. Section 3 lists the three import lines.
- loadGraph refuses → schema_version not 1 (index.js :4, :106).
- Reach empty on click → edge resolved is 'guess' and reach filters
  to exact (reach.ts :80-84); or filters dropped the node's file
  (filters.ts :138-147).
- Mermaid frame empty after shift+click → selectedIds not updated
  from MapView.select(id, add) (map.ts :531-555); or the frame reads
  focusedId instead of selectedIds.
- Editor doesn't jump on graph.open → editor's `followGraph` option
  false, or path not absolute (root join), or reveal called before
  the file frame landed (editor.js :533-540 is where the tab exists).
- Force never settles → damping missing or step too large; the
  freeze switch is the manual stop; the spec's settle test names the
  cap.
- Canvas iframe blank → srcdoc missing the #matrix div or the cc-
  stylesheet; render targets the host document instead of
  iframe.contentDocument.
- Drag in file mode does nothing → same-origin lost (a sandbox
  attribute crept in), or pointer listeners bound on the host not the
  iframe document.
- Tools shows no fields → sharedTools intersection empty (panel.js
  :41-51), or canvas.select payload.ids empty.
- Code widget Apply changes nothing → baseline diff equal (drawer.js
  :331-352), or setCode called on the wrong State instance (the core
  makes one per canvas; Code must call the target canvas's).
- Annotate PNG blank → rasterizer method can't see fonts/images;
  switch the `snapshot` option to another method.
- Save hits `[save denied` → policy refusal, not a widget bug.
  editor.js :545-548 is the denied check to copy.

---

## 5. INDEX OF DOCS

Scope docs, Docs/Scope/Code Canvas port/, renumbered 2026-09-12:
- SCOPE-phase0-foundation.md — phase 0 as scoped. Built. Receipts in
  Docs/Reports/RECEIPT-phase0-*.md.
- SCOPE-phase2-graph-widgets.md — was phase1. Wayfinder facts and
  design. Its OPEN and DECIDED sections are superseded by this spec.
- SCOPE-phase3a-tools-canvas.md — was phase2. Code Canvas and Open
  Design facts, canvas and tools design.
- SCOPE-phase3b-code-annotate.md — was phase3. Code widget and
  annotate.
- SCOPE-phase4-motion-3d.md — new. Decisions only.
- SCOPE-old-phase4-6-motion-agent-threejs.md — superseded. Read only
  for the phase 4 facts and the old phase 5 pieces, all of which are
  placed in this spec or the phase 4 scope.
- SEAM-phase0-phase1-targets.md — do not read.

Job specs, Docs/Specs/Code Canvas port/:
- Phase1 Boilerplate/ — 1A, 1B, 1D, 1R, 1H.
- Phase2 Graph Widgets/ — 2A, 2B, 2C, 2D, 2R, 2H.
- Phase3 Canvas 2D/ — 3A, 3B, 3C, 3D, 3E, 3R, 3H.

Receipts go to Docs/Reports/RECEIPT-phase<N>-<job>.md. Handoffs to
Docs/Handoffs/HANDOFF-phase<N>-<job>.md. HOWTOs to Docs/.

Old phase 5, placed:
- Agent bus emit → 1A.
- Reach CLI → not built. The mermaid frame is the agent's reach.
- Merge rule for two graph files → dropped. One graph per target.
- Neo4j → separate session, not this port.

---

## 6. WHAT THE USER CAN DO AFTER EACH PHASE

Phase 1: two surfaces, test widget on each with different targets,
both in every dropdown; close one surface and its target leaves; two
tabs mirror; a track pushes and the widget reacts; open and save a
file through it. Nothing else to look at.

Phase 2: pick a target, mount cards, read a node, search, jump. Force
Graph settles, freezes, orbits; click a node and cards follows; the
mermaid frame matches cards; shift+click adds picks and chains. Open
in editor jumps the editor to the span. Stack Graph and Files Graph on
the same node; Files Graph flips global to local with the path in the
corner. Refresh, same view. Copy the mermaid text with the clipboard
button.

Phase 3: open a doc, drag, resize, marquee, nudge, zoom. Tools edits
props, reorders layers, drags cards in, follows focus or pins. HTML in
file mode, drag, save, reopen, holds. Export, open the export in file
mode, the back-link shows. Code widget unlocks, edits, applies, one
widget re-renders. Doc view edit with its toggle on. Draw over the
canvas, send with each snapshot method, the track gets it. Preview
mode plays nothing until phase 4.

---

## 7. SESSION AGENT RECEIPT

At session close, the SESSION REVIEW shape from ~/.claude/CLAUDE.md.
Add a JOBS table: job, model, tokens used, receipt link, FAIL lines
left. Add a SEAMS I DID list for every under-1K edit you made
yourself, with file and line.
