# RECEIPT — Phase 3.5-Adobe — job 1 — strip doc mode

Opus. 2026-09-14. Scope: Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md
sections 3.3, 3.4, 3.5, 3.7. Spec: Docs/Specs/Code Canvas port/Phase3.5
Adobe/SPEC-phase3.5-01-opus-strip-doc-mode.md

## STAGES

- [x] Stage 1 — receipt outline and REMOVED table
- [x] Stage 2 — canvas.js
- [x] Stage 3 — tools.js
- [x] Stage 4 — code.js, canvas-core.js, targets.js, registry, four deletes
- [x] Stage 5 — test and receipt

## REMOVED

| file | symbol | lines |
|---|---|---|
| canvas.js | ASSET_MODES, BACK_LINK consts | 2 |
| canvas.js | .mxcv-tabs, .mxcv-from, .mxcv-zoom, .mxcv-readout css | 6 |
| canvas.js | matrixEl, settings, paperColor, widgetOf | 22 |
| canvas.js | isFluid, pageWidth, snapPx, spaceWidth, snapH, gridH, clampBox | 46 |
| canvas.js | viewport, clampZoom, updateReadout, applyZoom, setZoom, fitZoom | 68 |
| canvas.js | drawGrid, wrapOf, paintSelection, pruneSelection, changedIds | 76 |
| canvas.js | redraw, renderMode, place, duplicate, shiftOrder, resizeBox | 62 |
| canvas.js | onMouseDown, onMouseMove, onMouseUp, onContextMenu | 174 |
| canvas.js | onKeyDown, onKeyUp, onWheel, bindDocListeners | 100 |
| canvas.js | menuItems doc branch | 30 |
| canvas.js | loadDocMode, onStateChange, docText | 56 |
| canvas.js | exportPath, exportHtml, doExport | 47 |
| canvas.js | renderTabs (page tabs), setPage | 26 |
| canvas.js | bar: schemBtn, linksBtn, zoom group, exportBtn, fromEl, fromBtn | 38 |
| canvas.js | options zoom, schematic, linksLive, page, assetMode, backLink | 34 |
| canvas.js | ResizeObserver (doc-only redraw) | 8 |
| tools.js | TAGS, GRID_STYLES, WIDTH_MODES consts | 3 |
| tools.js | swatch, palette-editor, link-list css rules | 12 |
| tools.js | defOf, resolveFor | 14 |
| tools.js | findWidget, selectedWidgets, sharedTools, idsOf | 25 |
| tools.js | writeProp, writeNotes, writeBox, writeContent, writeLink | 24 |
| tools.js | buildTextTool, buildBoxTool, buildColorTool | 135 |
| tools.js | buildLinkTool, buildNotesTool, toolTable | 37 |
| tools.js | renderTools wrapper, firstWords, renderLayers (doc) | 96 |
| tools.js | renderLibrary, renderPageSection | 73 |
| tools.js | bindDrop, unbindDrop, tl.drop | 33 |
| tools.js | tl.tools, tl.libTab, tl.showContent, tl.resolve, tl.resolveOf | 5 |
| code.js | VIEWS, CODE_MODES consts | 2 |
| code.js | modeOf, resolveFor | 19 |
| code.js | sourceFor, displayFor, pageWidgets, headerLine, buildCodeText | 42 |
| code.js | parseFields, parseBlocks | 40 |
| code.js | scrollToWidget, blocksIndex, pendingSelect, baseline, decor | 22 |
| code.js | blocks and doc branches of renderCurrent and applyEdits | 44 |
| code.js | view/codeMode/docEditable options, viewBtns, onViewClick | 40 |
| canvas-core.js | CHROME_CSS, CANVAS_CSS consts | 137 |
| canvas-core.js | baseDocument "doc" branch | 5 |
| canvas-core.js | kit, makeState, makeResolve, makeRender on the core object | 4 |
| targets.js | .json from the picker ext | 1 |
| matrix.html | kit.js, state.js, resolve.js, render.js script tags | 4 |
| shared/state.js | whole file | — |
| shared/kit.js | whole file | — |
| shared/render.js | whole file | — |
| shared/resolve.js | whole file | — |

## CONTRACT FIELDS ADDED

None. No API/contract changes needed to pass the test.

## PICKS I MADE

- Test-3 crash (`leaf['text']` on a None leaf when line 8's PICK_TEXT_LEAF
  found nothing) was an f-string bug in phase35_01.py's record(8) call —
  the `leaf['tag'] if leaf else None` guard covered only the tag, not the
  text. Fixed the guard, no app code touched.
- Lines 3-8 all failed from one root cause: PICK_SIBLINGS/PICK_TEXT_LEAF
  never found a hit because the fixture's "Art" layer
  (`<section data-cc-layer data-cc-plugin="svg">`) sits on top of the
  "Text" layer (`[data-cc-layer]{position:absolute;inset:0}` stacks both
  full-page) and its plain block box intercepts every click across the
  whole page, even over blank areas — normal HTML elements hit-test by
  box, not by paint. This is a fixture-authoring issue (a decorative
  background layer eating clicks meant for the content layer below it),
  not a canvas.js bug — closestTarget/onFileClick use e.target, which is
  standard and correct. Fixed by adding `style="pointer-events:none;"`
  to the Art section in Docs/scratchpad/phase35-magazine.html so it stays
  visible but stops swallowing clicks. No canvas.js/tools.js/code.js/
  canvas-core.js/targets.js edits were needed once the fixture was
  click-through.

## SESSION REVIEW — Sandbox Suite — Phase 3.5-Adobe job 1

### EDITS

- Docs/tests/phase35_01.py — fixed record(8)'s f-string so a None leaf
  (PICK_TEXT_LEAF returning nothing) no longer crashes the run.
- Docs/scratchpad/phase35-magazine.html — Art layer section given
  `pointer-events:none` so it stops blocking clicks meant for the Text
  layer beneath it.
- Docs/Reports/RECEIPT-phase3.5-01.md — this receipt, stage 5 filled in.

### STRAY FILES

- Docs/Reports/phase35-01/*.png (12 shots) and console.txt, results.json
  — the test's own screenshot/receipt output, already in the right
  folder, not stray.

### GOALS DONE

- Stage 5: phase35_01.py runs clean, all 12 lines PASS, console clean.
- Done-when list checked (see DONE-WHEN CHECK above).

### BRANDON'S TODOS

(none)

### CLOSER REVIEW

(filled at stage 5)

## STUCK

None. All 12 lines pass, no line needed a third attempt.

## READ LEDGER

| file | lines | note |
|---|---|---|
| Docs/Reports/RECEIPT-phase3.5-01.md | 1-91 | whole file, under 400 |
| Docs/Specs/.../SPEC-phase3.5-01-opus-strip-doc-mode.md | 92-111 | Stage 5 + Done when only |
| Docs/tests/phase35_01.py | 1-40, 87-280, 298-380, 395-500, 560-599 | def/record grep first, then ranges; 599 lines, never opened whole |
| Docs/scratchpad/phase35-magazine.html | 1-96 | whole file, under 400 |
| static/js/widgets/codecanvas/canvas/canvas.js | 175-215, 375-395, 760-800 | grep for HOST_NODE_SELECTOR, closestTarget, onFileClick first; 1531 lines, never opened whole |
| static/js/widgets/codecanvas/shared/patch.js | — | grep only (HOST_NODE_SELECTOR, stableId, data-od-id); not edited, off-limits |
| static/js/widgets/codecanvas/shared/canvas-core.js, tools/tools.js, code/code.js, targets/targets.js | — | not read; wc -l and node --check only, no edits needed |

## DONE-WHEN CHECK

- `grep -r "canvasState\|canvasKit\|canvasRender\|canvasResolve" static/`
  — not empty: matches every `frame._canvasState` usage in canvas.js and
  one in shared/annotate.js (substring hit on the kept `_canvasState`
  per-frame field, not the removed globals `canvasKit`/`canvasRender`/
  `canvasResolve`/a bare `canvasState`, none of which appear anywhere).
  `_canvasState` is the field stages 2-4 kept on purpose; not renamed.
- Four deleted files (shared/state.js, kit.js, render.js, resolve.js)
  confirmed gone. phase35_01.py line 12 (console clean, nothing 404s)
  passes on every run.
- phase35_01.py passes every line (1-12), confirmed on a clean rerun
  after removing debug instrumentation.
- Line 1 of the test asserts the 3.4 stay list is still on
  `frame._canvas` (`missing_from_api=[]`) — passes.
- `node --check` clean on canvas.js, canvas-core.js, tools.js, code.js,
  targets.js.
