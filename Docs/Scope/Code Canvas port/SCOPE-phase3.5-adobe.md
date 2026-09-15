# SCOPE — Phase 3.5-Adobe — Layout and Vector on HTML

Written 2026-09-14. Session agent fable. Sits after Phase 3F (file mode,
green 2026-09-13) and the 2026-09-14 codecanvas fixes. Before Phase 4
(motion, pen, raster, 3D).

Phase 3F made file mode the editor and parked doc mode. This phase
removes doc mode and grows file mode into a page-layout and vector tool
in the shape of InDesign and Illustrator. HTML is the document. Layers
are real. SVG is a layer plugin. Text has styles, columns and threading.

## 1. Brandon's rulings, 2026-09-14

- The .json target and doc mode are removed. Not parked. Git holds it.
- HTML is the document. Pages are files. Targets tabs are the page list.
- Page size in pixels.
- Named layers, lockable, hideable, reorderable, fluid drag between
  parents and children, buttons for the same, Adobe's right-click set,
  Adobe's keys.
- Layer kinds are `plugin`: `html` and `svg` now, `raster` and `3d`
  later. The word is consistent across every codecanvas widget. `kind`
  stays the word for patch kinds.
- Threading is its own job and may slip.
- Masters: yes.
- No raster. No pen tool. No 3D. Those go to Phase 4.
- The kit library goes with doc mode. A snippets drawer replaces it.
- Comments are label, function, state. "spine" is banned.
- Agents: ~120K target, 180K hard cap. Small jobs. Session agent picks
  models. Subagents run GoTo with model overrides.
- Headless tests inside every job. Headed walks at seams only.
- Redpens at seams and before anything builds on a job.
- Every subagent prewrites its receipt with the stage outline before
  code, and updates it after every stage. Test agents carry a loop
  guard (section 5).
- Fixture: one magazine page with everything piped in.

## 2. Session agent's picks

Each is a pick, not a ruling. Red-pen freely.

- P1. Page geometry is CSS custom properties on `:root` in a
  `<style data-cc="page">` block. The body is the page and is sized
  from them. Written with `set-css-token`.
- P2. Layers are `body > section[data-cc-layer]`. A file with no
  layer sections gets one, "Layer 1", wrapped around body's children
  on first load in canvas mode.
- P3. Everything this phase adds carries a `data-cc-` prefix.
  `data-od-id` and `data-od-group` stay as they are.
- P4. Job 1b adds four patch kinds to patch.js so jobs 2, 9 and 12 do
  not each touch it.
- P5. Items in a layer are absolutely positioned. Snippets insert with
  left, top, width, height. Drag keeps writing translate as today; a
  stage in job 5 folds translate into left/top on drop so the numbers
  in the panel read true.
- P6. Text styles are classes `.cc-style-<name>` in a
  `<style data-cc="styles">` block. Apply is a class on the element.
- P7. Masters are a separate `<name>.master.html`, linked from the page
  with `<link rel="cc-master" href>`. Injected on load as a locked
  bottom layer, stripped on save.
- P8. Rulers, guides, snap, active layer and draw tool are canvas
  options, not document fields. Guides persist on body as
  `data-cc-guides`.
- P9. Models: sonnet on 0, 1b, 2, 6, 7, 11, 15, 17, R, F. Opus on 1,
  3, 4, 5, 8, 9, 10, 12, 13, 14, W.
- P10. SVG hit-testing reuses `closestTarget`; SVG children are DOM
  elements and already resolve. Dragging an SVG child writes a CSS
  transform on it, which browsers honour on SVG.

## 3. Contracts

Every job reads this section. Nothing here is renamed by a job. A job
that needs more adds a field and names it in its receipt under
CONTRACT FIELDS ADDED.

### 3.1 The document

    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <style data-cc="page">
        :root { --cc-page-w: 816px; --cc-page-h: 1056px;
                --cc-margin-top: 48px; --cc-margin-right: 48px;
                --cc-margin-bottom: 48px; --cc-margin-left: 48px;
                --cc-columns: 3; --cc-gutter: 16px; --cc-bleed: 0px;
                --cc-grid: 8px; }
        body { width: var(--cc-page-w); height: var(--cc-page-h);
               position: relative; margin: 0 auto; overflow: hidden; }
        [data-cc-layer] { position: absolute; inset: 0; }
        [data-cc-layer][data-cc-hidden] { display: none; }
      </style>
      <style data-cc="styles"></style>
      <link rel="cc-master" href="spread.master.html">   (optional)
      <meta name="cc-page-number" content="1">           (optional)
    </head>
    <body data-cc-guides="v:120;v:696;h:300">
      <section data-cc-layer data-cc-name="Text" data-cc-plugin="html"
               data-od-id="ly_a1b2c3">
        <div data-od-id="el_..." style="position:absolute; left:48px;
             top:120px; width:220px; height:600px">…</div>
      </section>
      <section data-cc-layer data-cc-name="Art" data-cc-plugin="svg"
               data-cc-locked="1" data-od-id="ly_d4e5f6">
        <svg viewBox="0 0 816 1056" width="100%" height="100%">
          <rect data-od-id="el_..." x="…" y="…" …/>
        </svg>
      </section>
    </body>
    </html>

- Layer order in the DOM is stack order, first is bottom.
- `data-cc-locked="1"` and `data-cc-hidden="1"` are present or absent,
  never "0".
- An `svg` layer holds exactly one `<svg>` as its only child.
- Styles: `.cc-style-<name>` rules in the styles block. A `data-cc-style-
  kind="paragraph|character|object"` comment line above each rule.
- Threading: frames share `data-cc-story="<id>"` and carry
  `data-cc-thread="<n>"`, n from 1.
- Master content injected on load: a first `section[data-cc-layer]
  [data-cc-master="1"][data-cc-locked="1"]`. Never saved.
- `[data-cc-var="page-number"]` text is filled from the meta on load.

### 3.2 patch.js (job 1b)

Additions to `MX.canvasPatch()`. Existing kinds unchanged.

- `set-attr {id, name, value}`: value `null` removes. Inverse set-attr
  with the prior value or null. Refuses names starting `data-od-`.
- `set-css-rule {block, selector, declarations}`: `block` is the
  `data-cc` value of the style element ("page" | "styles"); finds or
  creates the element; replaces the rule's declarations text, or
  appends the rule. Inverse set-css-rule with the prior declarations,
  or remove-css-rule when it was new.
- `remove-css-rule {block, selector}`: inverse set-css-rule.
- `insert {parent, index, html, ns?}`: when `ns === "svg"`, html is
  parsed inside a `<svg>` template and the child moved out, so SVG
  elements are created in the SVG namespace. Ids stamped as today.
- `KINDS` lists thirteen.

### 3.3 Canvas options (jobs 3, 5, 10)

- `snap`: bool, default true. `snapTo`: `["grid","guides","objects"]`.
- `rulers`: bool, default true. `showGuides`: bool, default true.
- `showMargins`: bool, default true. `showColumns`: bool, default true.
- `activeLayer`: layer id or `""`. New items land here. Empty falls to
  the topmost unlocked layer.
- `tool`: `"select" | "rect" | "ellipse" | "line" | "text" | "image"`.
  Default `"select"`.
- `target` accepts `.html` only. `.json` is refused with
  `target must be .html`.

### 3.4 Canvas API additions on `frame._canvas`

- Job 1: `state` getter removed. `place` removed. `patchSource`,
  `source`, `doc`, `selected`, `undo`, `redo`, `group`, `ungroup`,
  `move`, `forward`, `back`, `front`, `toBack`, `remove`, `duplicate`,
  `menuItems`, `freeze`, `redraw`, `mode` stay.
- Job 1b callers: `setAttr(id, name, value)` → patchSource set-attr.
- Job 2: `page()` → `{w,h,marginTop,…,columns,gutter,bleed,grid}` read
  from computed `:root`; `setPage(key, value)` → set-css-token.
- Job 3: `guides()`, `addGuide(axis, px)`, `removeGuide(axis, px)`,
  `snapPoint({x,y})` → `{x,y}`.
- Job 4: `layers()` → `[{id,name,plugin,locked,hidden}]` in DOM order;
  `addLayer(name, plugin)`, `removeLayer(id)`, `renameLayer(id,name)`,
  `setLayerFlag(id, "locked"|"hidden", bool)`, `moveLayer(id, index)`,
  `mergeDown(id)`, `moveToLayer(ids, layerId)`, `layerOf(id)`,
  `activeLayer()`, `setActiveLayer(id)`.
- Job 5: `insertAt(html, {x,y}, ns?)` inserts into the active layer at
  page coordinates; `selectAllOnLayer(id)`; `lockSelection()`,
  `unlockAll()`, `hideSelection()`, `showAll()`.
- Job 6: `align(how)`, `distribute(axis)`, `eyedrop(fromId, toIds)`,
  `selectSame("fill"|"stroke"|"style")`.
- Job 9: `svgOf(layerId)` → the `<svg>` element.
- Job 12: `styles()` → `[{name,kind,declarations}]`; `setStyle(name,
  kind, declarations)`; `removeStyle(name)`; `applyStyle(ids, name)`.
- Job 13: `thread(ids)`, `unthread(id)`, `reflow(storyId)`.
- Job 14: `master()` → href or `""`; `setMaster(href)`.

### 3.5 Tools sections

`SECTIONS = ["tools", "layers", "snippets", "page"]`. Labels: tools,
layers, snippets, pages. All four live in file mode. Doc-mode branches
are gone after job 1.

### 3.6 Plugin naming

The word for a layer's engine is `plugin`, everywhere: the attribute
`data-cc-plugin`, the field on `layers()` records, comments, the panel
label, the skills. No `kind`, `type`, `engine`, `adapter` for this.

### 3.7 Removed by job 1

- Files deleted: `shared/state.js`, `shared/kit.js`, `shared/render.js`,
  `shared/resolve.js`.
- canvas-core.js: `kit`, `makeState`, `makeResolve`, `makeRender`
  removed from the core object; `baseDocument("doc")` branch removed.
- canvas.js: every doc-mode path. `modeForTarget` returns `"file"` or
  `""`. Export, schematic, links, zoom bar and page tabs removed from
  the bar. `assetMode`, `backLink`, `schematic`, `linksLive`, `page`,
  `zoom` options removed.
- tools.js: doc tool builders, doc layers, library, doc page section.
- code.js: blocks and doc views. Source view stays.
- The target picker filters to `.html`.
- Zoom returns in job 3 for file mode.

## 4. Jobs

| job | model | files owned | after |
|---|---|---|---|
| 0 fixture | sonnet | Docs/scratchpad/phase35-magazine.html, Docs/scratchpad/spread.master.html | none |
| 1 strip doc mode | opus | canvas.js, tools.js, code.js, canvas-core.js, targets.js, widgets registry line, the four deleted files | 0 |
| 1b patch kinds | sonnet | patch.js | none |
| R1 | sonnet | none | 1, 1b |
| 2 page setup | sonnet | tools.js | R1 green |
| 3 rulers guides snap | opus | canvas.js | R1 green |
| 15 snippets | sonnet | tools.js | 2 |
| 4 layers panel | opus | tools.js | 2, 15 |
| 5 layers canvas | opus | canvas.js | 3 |
| R2 | sonnet | none | 4, 5 |
| W1 headed layers | opus | Docs/tests/phase35_W1.py, Docs/Reports/phase35-W1/ | R2 green |
| 6 arrange | sonnet | tools.js | W1 |
| 7 object panel | sonnet | tools.js | 6 |
| 8 rotate handle | opus | canvas.js | W1 |
| 9 svg layer | opus | tools.js, canvas.js | 7, 8 |
| 10 svg draw | opus | canvas.js | 9 |
| R3 | sonnet | none | 10 |
| W2 headed svg | opus | Docs/tests/phase35_W2.py, Docs/Reports/phase35-W2/ | R3 green |
| 11 paragraph | sonnet | tools.js | W2 |
| 13 threading | opus | canvas.js, shared/thread.js new | W2 |
| 12 styles | opus | tools.js | 11 |
| R4 | sonnet | none | 12, 13 |
| 14 masters | opus | canvas.js | R4 green |
| 17 skills | sonnet | injections/skills/codecanvas-howto.md, codecanvas-agent.md | 14 |
| W3 headed all | opus | Docs/tests/phase35_W3.py, Docs/Reports/phase35-W3/ | 17 |
| F fix | sonnet | the files the redpen names | any FIX |

Two jobs never own the same file at the same time. Rows sharing a
file run in the order the `after` column gives.

## 5. Stages, receipts, loop guard

- Stage 1 of every job: read, then write the receipt with every stage
  listed unchecked, and the KINDS or FIELDS table filled from this
  scope. Then code.
- After every stage: append `- [x] Stage N — label` to the receipt.
  A receipt with unchecked stages is a handoff, not a failure.
- At 150K with stages open: stop, write
  Docs/Handoffs/HANDOFF-phase3.5-<job>.md, leave the receipt. Hard
  cap 180K.
- Loop guard, every agent: one stage may be attempted twice. On the
  second failure, write what happened under a STUCK heading in the
  receipt and move to the next stage or hand off. Never a third run of
  the same command. Never re-read a file already in context.
- Loop guard, test agents: each walk line gets two attempts. FAIL is
  recorded with the shot and the run continues. The whole walk runs at
  most twice. A second full run is the last.
- `node --check` on every edited .js after every stage.
- Receipt shape: SESSION REVIEW, plus STAGES, PICKS I MADE, CONTRACT
  FIELDS ADDED, STUCK (when any). Path Docs/Reports/RECEIPT-phase3.5-
  <job>.md. One line each to SESSIONLOG.md and INDEX.md.

## 6. The walk (W3)

On a copy of the fixture in Docs/scratchpad, never the original.

1. New surface. Canvas, Tools, Targets. Add the copy. Preview. Nothing
   selects.
2. Canvas mode. Pages tab: set Letter, 3 columns, 48px margins. The
   page resizes, margin and column lines draw.
3. Drag a guide from the top ruler. Drag the pull quote near it. It
   snaps. Snap off, it doesn't.
4. Layers: three layers show — Text, Art, Master (locked, greyed).
   Click the footer. Nothing. Lock Art. Click a shape. Nothing. Hide
   Art. Shapes vanish. Show.
5. Drag the photo row from Text into Art. It moves layer. ▲ twice. It
   moves up two. Right-click the row: the menu has every line from
   contract 3.4 job 4 and 5.
6. Snippets: drag a text frame onto the page. It lands on the active
   layer where dropped. Type in it.
7. Select three column frames. Align top. Distribute horizontal. Gaps
   read equal in the panel.
8. Object panel: rotate the pull quote 5°. Opacity 80%. Photo frame
   to cover. Rotate handle: shift-drag to 15°.
9. Art layer active. Rect tool. Drag a rect. Gradient it. Ellipse over
   the photo, Make Clipping Mask. Photo shows through.
10. Paragraph: the first column frame to 2 columns, drop cap on.
11. Styles: make Body. Apply to three frames. Change Body's font. All
    three change.
12. Thread the three column frames. Paste long copy in the first. It
    flows to the third. Shrink the first. More flows.
13. Save. Status saved. The file on disk has the page block, three
    layers, the svg, the styles block, no master content, translate
    folded into left/top.
14. Reload the surface. Everything returns. Master footer present and
    locked. Page number reads 1.
15. Console clean the whole way.
