# SCOPE — Phase 3a — Tools and Canvas widgets

Renumbered 2026-09-12: was phase 2. Now the first half of phase 3,
canvas 2D, with SCOPE-phase3b-code-annotate.md as the second. DESIGN,
DECIDED, and OPEN below are superseded by
Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md section 2
and the Phase3 Canvas 2D specs. Every OPEN item became a widget
option. FACTS FROM CODE stand.

Written 2026-09-12. LLM version. The human summary is in the 2026-09-11
session chat. Every line ref is from code read that session. Nothing built.

Depends on phase 1: target option, mirror helper. Phase 0's grid close
fix (A) so two canvases survive.

---

## INTENT

One place to arrange a page by hand where an agent reads the same
document. Two document kinds in one canvas widget: the Code Canvas JSON
doc (functional, named props, a tree, a resolver) and the raw HTML file
(visual, drag writes a transform). Both modes share the iframe, the
selection chrome, the file frames, and the bus. The Tools widget is the
inspector, layer tree, and library for whichever canvas it targets.

---

## FACTS FROM CODE

Code Canvas root: /Users/moth3rship/Desktop/AI Design/Code Canvas/app/

### The document, state.js
- :66-83 defaultState: app, version 2, settings{grid 8, gridStyle
  dynamic, width{mode fixed, px 1280}, palette, palettes}, page, pages,
  library{objects, animations, behaviors}, assets.
- :250-263 widget record: id, type, parent, box{x,y,w,h}, content{mode
  literal|instruction, value}, props from kit defaults, link, notes,
  locked, behaviors [], animations [], code{custom, html, css, js}.
- :146-158 absFrame and :163-183 rebase: fluid stores x and w as
  percent of the parent, fixed stores pixels. :188-208 keepOrder keeps
  parent before child in the array.
- :223-232 commit snapshots the whole state per write. :416-430 batch
  folds to one step. :444-455 undo, redo.
- :28-63 v1 to v2 migration. :462-477 load migrates on read.
- :358-363 setCode marks custom true and stores html, css, js.
- :479-493 assets are {id, name, mime, data}. data is a data URL
  (kit-media.js:1-3 comment: becomes a URL when a server lands).

### The kit, kit.js and kit-container.js
- kit.js:4-26 Kit shape: palettes, sizes, fonts, shadows, widgets,
  tools. :29-34 registerTool queues a panel tool. :37-48 register
  rejects duplicate types. :66-74 byTaxonomy.
- kit-container.js:15-38 a full definition: type, taxonomy, label,
  tools, animatable, defaults, box, filler, content, children, html,
  css, js. :3-4 TOOLS and ANIMATABLE lists. :8-13 CSS template with
  {{tags}}. :109-124 a kit-registered tool builder.
- kit-navigation.js registers an empty array.

### Resolve, resolve.js
- :15-21 def. :24-32 palette: kit first, then settings.palettes.
- :35-45 googleFont injects one link per family.
- :48-54 asset resolves as_ ids to data URLs.
- :57-82 prop: booleans, sizes, fonts, palette keys, shadows, assets.
- :85-127 escape, items, wrapItems, content by kind text, list,
  options, none. :131-136 tagFor floors to p.
- :139-149 map builds the fill map. :152-157 fill replaces {{tags}}.

### Render, render.js
- :10-21 flush writes every rule into one style block cc-render-style.
- :24-46 widget: custom code replaces kit html and css; innerHTML.
- :49-60 schematic: id, type, b and a counts.
- :63-70 anchor wraps a linked widget in an a tag.
- :75-87 position: absolute, or static under a flow parent.
- :95-134 page: finds #matrix, walks widgets in array order, hosts
  children under the parent's element when the kit says children.
  :94-96 opts.play is a seam that changes nothing.

### Canvas, canvas.js
- :3-20 module state: selection, frozen, gesture, marquee, menu,
  zoomPct, spaceDown.
- :22-60 injected STYLE with cc- prefixed classes.
- :150-162 viewport wraps #matrix once. :171-198 zoom control.
- :210-221 applyZoom transforms the page. :226-249 setZoom around a
  point. :252-262 fitZoom.
- :265-287 drawGrid: lines, dots, dynamic; paper color from palette.
- :297-320 paintSelection with eight handles. :323-329 setSelection
  dispatches canvas:select on document.
- :341-349 redraw. :352-367 place. :372-387 duplicate offsets one grid
  unit. :391-403 shiftOrder.
- :413-464 context menu: duplicate, delete, notes, bring forward, send
  back, lock.
- :476-532 onMouseDown: pan, marquee, select, gesture start.
  :534-578 onMouseMove: live left, top, width, height on the wrapper.
  :580-635 onMouseUp: snap, clamp, State.moveWidget.
- :656-728 onKeyDown: space, cmd zoom, cmd s fires canvas:save, cmd z,
  cmd d, delete, arrows. :650-653 editing guard.
- :746-753 seven document-level capture listeners.
- :755-761 State.on change redraws. :763-786 API: place, selected,
  setView, freeze, redraw, zoom, fit.

### Panel, panel.js
- :41-51 sharedTools intersects the selected widgets' kit tools.
- :55-67 bindTyping 500ms debounce. :70-101 writeProp, writeNotes,
  writeBox, writeContent, writeLink, all batched.
- :112-184 text tool. :213-227 box. :230-282 color with a user palette
  editor. :285-314 link. :317-326 notes. :329-334 TOOL_BUILDERS and the
  kit queue drain.
- :365-428 renderOrder: the layer tree. :404-421 drag to reorder or
  reparent by drop position, top quarter before, bottom quarter after,
  middle reparents.
- :432-440 notes modal. :549-552 registerTool. :553-562 init listens
  on window for canvas:select and canvas:notes.

### Drawer, drawer.js — moves to phase 3, listed here for the seam
- :316-330 unlock calls Canvas.freeze(true), relock frees it.

### Nav, nav.js
- :65-96 four container presets in every new file. :99-115 emptyDoc.
- :125-175 localStorage files: list, read, save, open, rename, delete.
  All replaced by suite frames.
- :242-274 renderLibrary: kit cards, draggable, text/plain type.
  :277-294 wireDrop: drop on #matrix calls Canvas.place.
- :297-333 renderOptions: grid, gridStyle, width mode, fixed px,
  palette.
- :366-404 topbar: back, page tabs, plus page, schematic toggle,
  library and tools toggles, save. :407-427 page tabs.
- :446-481 onSave and writeDisk through showSaveFilePicker or a blob
  download. Replaced by the save frame.

### Hierarchy, hierarchy.js
- :90-142 a read-only tree that mirrors panel's renderOrder without
  drag. Cut.

### File mode, Open Design
Root: /Users/moth3rship/Downloads/open-design-main/apps/web/src/edit-mode/
- bridge.ts:1-2 discovery selector. :33-39 stableId fallback: data-od-id,
  source path attr, runtime id, DOM path. :16-27 domPath builds
  path-0-3-1 from child indexes, skipping host nodes.
- bridge.ts:78-86 kind: a, img, text leaf, else container.
- bridge.ts:444-482 targetFrom: rect, parentRect, siblingRects,
  measurements, alignmentGuides, computedSummary, isLayoutContainer,
  outerHtml stripped of runtime attrs. :349-362 alignmentGuidesFor.
  :364-421 measurementsFor including nearest sibling gap.
- bridge.ts:519-536 readTranslateBase keeps a rotate prefix,
  composeTransform writes translate. :1015-1032 pointerdown records a
  candidate. :1158-1200 pointermove starts past DRAG_THRESHOLD 4, bumps
  inline to inline-block, selects if not selected, writes transform
  live, redraws guides. :1033-1045 pointerup posts od-edit-drag-commit.
- bridge.ts:834-862 makeEditable: contenteditable plaintext-only, Enter
  commits, Escape cancels. :811-833 finishActiveTextEdit posts
  od-edit-text-commit.
- bridge.ts:886-905 applyPreviewStyles. :906-1011 the message handler.
  :1297-1368 the guides stylesheet.
- bridge.ts:88-169 keyboard guard wraps addEventListener on window and
  document to swallow keydown during text edit.
- source-patches.ts:109-185 applyManualEditPatch: parse, find, patch by
  kind, serialize. :235-245 parseSource with DOMParser. :247-250
  serializeSource: body.innerHTML or doctype plus documentElement.
  :252-255 isManualEditFullHtmlDocument.
- source-patches.ts:278-286 findEditableElement fallback chain.
  :592-605 findElementByPath walks child indexes.
- source-patches.ts:657-663 setInlineStyles. :674-688 replaceOuterHtml
  requires one root, carries ids over. :703-713 setCssToken edits a
  custom property inside a style tag by regex. :690-701 last renderable
  body child guard.
- source-patches.ts:5-92 and :454-530 runtime overrides: a JSON script
  block plus an applier script written into the file for elements the
  source cannot find. :288-445 brand-kit special cases. Cut.
- types.ts:47-87 ManualEditStyles, the inspector property set.
  :110-119 ManualEditPatch kinds. :121-128 history entry with full
  before and after source.
- FileViewer facts from Mapdocs/MAP-open-design-editor.md: sandbox
  allow-scripts allow-downloads (:17521-17528), applyManualEdit
  (:13221-13358), undo writes to disk (:13387-13445), style edits are
  held pending until Save (:12719-12752), frozen source at edit entry
  (:9926-9933).

### Suite plumbing
- static/js/matrix/widget-frame.js:27-106 the contract.
- static/js/widgets/usertools/editor/editor.js: :5-8 frames open, file,
  save, saved with inst. :145-167 MX.monacoReady mount. :282-289
  sendSave. :311-470 the module: mount restores tabs from options and
  sends open per tab (:376-392), canClose asks per dirty tab
  (:396-410), onFrame filters by inst (:426), getOptions returns
  showPreview, tabs, active (:461-469).
- static/js/widgets/usertools/browser/browser.js:55-64 openInWidget
  finds or adds an instance and hands it a path. :325 subscribes to
  tree, saved, deleted, moved, renamed, made, tree_dirty.
- static/js/widgets/shared/monaco-readonly.js:12 vendored Monaco at
  /static/vendor/monaco/vs. :70 MX.monacoReady. :72-76 language from
  path.
- static/js/widgets/shared/root-browser.js:69 MX.openRootBrowser with
  opts.ext for file picking.
- Docs/HOWTO-frames.md: open :49 returns file :92. save :50 returns
  saved :94 and broadcasts tree_dirty :101 suite-wide. feed_dirty :99
  is the ledger feed, not files.
- server.py: /api/fs/raw :1552 serves a file. /api/fs/put :1518 and
  /api/fs/write :1502 write. Assets can become URLs through fs/raw.

---

## DESIGN

### Shared module, static/js/widgets/canvas/shared/
- kit.js: all kit-*.js merged into one data file. Drop navigation.
- state.js: makeState() returns an instance with the same API. No
  globals. Kit passed in, not read from window.
- resolve.js: makeResolve(kit, state). Fonts link into the iframe's
  document, not the host's.
- render.js: makeRender(state, resolve, doc) where doc is the iframe's
  document. Style block lives in that document.
- patch.js: file-mode patcher. The slice of source-patches listed
  above, without brand-kit and runtime overrides. Plus DOM path id
  assignment on load.
- Bus channels: canvas:select {inst, ids}, canvas:focus {inst},
  canvas:doc {inst, mode, path}, canvas:change {inst}.

### Canvas widget, group "canvas"
- Host bar: mode buttons Code, Canvas, Preview. Schematic toggle. Zoom
  control from canvas.js:171-198. Path label and status like the
  editor widget.
- Body: one iframe, srcdoc, same-origin, no sandbox attribute. Base
  document carries a #matrix div and the cc- stylesheet.
- Doc mode: a .json file whose app is "Code Canvas". State.load, Render
  targets the iframe document. canvas.js's listeners bind on the iframe
  document. Selection, gesture, zoom per instance.
- File mode: any .html. srcdoc is the file text plus an id-assign
  script plus the guides stylesheet. Drag is the bridge's translate
  logic, run directly since same-origin allows it. Commit patches the
  source string through patch.js and marks dirty.
- Canvas mode freezes: no custom JS injected, no keyframes. Preview
  mode: play true, chrome hidden, JS injected. Phase 4 fills play.
- File frames: option path. Mount sends open. file loads by extension.
  Save sends save with the serialized doc or the patched source. saved
  updates status. tree_dirty or saved from another inst re-opens only
  when not dirty and not mid-gesture.
- getOptions: path, mode, zoom, selection, schematic.
- canClose: dirty check like the editor widget.
- Export: doc mode writes a static HTML next to the JSON on request.
  Render already produces it.

### Tools widget, group "canvas"
- Option canvas: an instance id, or "focused" to follow canvas:focus.
- Sections: tools from panel.js by shared kit tools, layer tree from
  renderOrder with its drop logic, library cards from nav.js, page
  options from nav.js's renderOptions, pages tabs.
- File mode inspector: the ManualEditStyles set from types.ts:47-87,
  written as set-style patches. Text, link, image fields. Alignment
  guides and measurements from targetFrom drawn in the canvas's guides
  layer.
- Drag from library cards into the iframe: HTML5 DnD crosses a
  same-origin iframe. Drop calls the target canvas's place.

### Adobe overlap, where each lands
- Selection and move, marquee, nudge: canvas.js, present.
- Layers with reorder and reparent: panel.js renderOrder, present.
  Visibility and lock: lock present, visibility new.
- Align and distribute: new, using bridge.ts alignmentGuidesFor and
  measurementsFor math.
- Transform: box only today. Rotate preserved by the drag but not
  authored. New if wanted.
- Grouping: container.box plus setParent, present.
- Text tool: text.block, present. Swatches: color tool, present.
- Zoom and pan, guides and snapping: present. Guide lines new.
- History panel: State history exists, no UI. New if wanted.

---

## DECIDED
- Same-origin iframe.
- Both document modes in one canvas widget.
- Bus for cross-widget. Suite frames for files.
- Tools and Canvas are separate widgets. Code widget is phase 3.
- hierarchy.js, kit-navigation.js, nav.js storage and disk paths are
  cut.

## OPEN
- A doc exported to HTML and that HTML edited in file mode: one way
  only, or a back-link in the HTML head.
- Tools pinned to one canvas or following focus. Default following.
- Pages in file mode: a file is one page. Page tabs hide.
- Assets: data URLs stay in the doc, or fs/raw URLs from the start.
- Fluid mode in the iframe: page width is the iframe width.

---

## READS FOR THE SPEC SESSION
- Code Canvas: state.js, render.js, resolve.js, canvas.js, panel.js,
  nav.js, kit.js, all kit-*.js, style.css. About 130KB.
- Open Design: source-patches.ts :109-286 and :592-734. bridge.ts
  :1-86, :349-421, :444-482, :519-536, :811-905, :1015-1046,
  :1158-1200, :1297-1368. About 40KB in ranges. types.ts whole, 6KB.
- Suite: editor.js, browser.js, widget-frame.js, grid.js,
  monaco-readonly.js, root-browser.js, HOWTO-frames.md. About 75KB.
- Docs/Scope/Code Canvas port/SCOPE-phase0-foundation.md for the bus.

## TESTS, headed
- Open a JSON doc: canvas and tools both show it.
- Drag and release: doc updates, save writes, tools box fields update.
- Type in a tools field: canvas updates after the debounce.
- An agent writes the file: canvas reloads when idle.
- An agent writes during a drag: reload waits for release.
- Refresh: the same file, mode, zoom, selection come back.
- Two canvases in one grid: independent selection, independent docs.
- Open an HTML file: file mode, drag an element, save, reopen, the
  transform persists.
- Close a third widget: both canvases keep state (phase 0 A).
