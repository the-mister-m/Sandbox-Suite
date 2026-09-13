# SCOPE — Phase 3b — Code widget and annotate

Renumbered 2026-09-12: was phase 3. Now the second half of phase 3,
canvas 2D. DESIGN, DECIDED, and OPEN below are superseded by
Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md section 2
and the Phase3 Canvas 2D specs. Snapshot method is a widget option
with all three built. Doc view editable is a widget option. FACTS
FROM CODE stand.

Written 2026-09-12. LLM version. The human summary is in the 2026-09-11
session chat. Every line ref is from code read that session. Nothing built.

Depends on phase 3a: the shared canvas module and the canvas bus channels.

---

## INTENT

The drawer leaves the canvas and becomes its own widget, so a second
screen can hold the code while the first holds the canvas. It shows the
same document three ways: the block buffer of html, css, js per widget;
the doc JSON; or the raw HTML source in file mode. Annotate draws marks
over the canvas and sends a picture to a track.

Widget name is "Code" in group "canvas". Headers read group then name.
Code Canvas's existing "schematic" render mode keeps its word as a view
toggle on the Canvas widget.

---

## FACTS FROM CODE

### Drawer, drawer.js
Root: /Users/moth3rship/Desktop/AI Design/Code Canvas/app/
- :4-10 state: open, activeView code or notes, codeMode resolved or
  template, locked, currentText, baseline per widget id.
- :89-105 sourceFor picks custom code or kit templates. displayFor fills
  tags in resolved mode, leaves them in template mode.
- :120-139 buildCodeText: per widget a header line `// id type`, then
  `// html`, `// css`, `// js` blocks, blank line. Returns text and a
  line index per widget.
- :149-201 allHeaders, parseFields, parseBlocks: regex on header lines,
  a second html marker cuts an orphaned block.
- :205-216 editor adapter over Monaco or a textarea. :217-239
  scrollToWidget reveals and highlights the header line.
- :241-259 tryLoadMonaco from cdnjs with a 4 second fallback. Replaced
  by MX.monacoReady.
- :285-292 renderCode sets baseline. :293-303 renderNotes.
- :311-330 lock UI: unlock calls Canvas.freeze(true), relock frees it.
  :331-352 applyEdits diffs each block against baseline and calls
  State.setCode only on change, reports blocks with a lost header.
  :353-357 discardEdits.
- :379-479 skeleton: toggle, resize handle, tabs Code and Notes,
  toolbar with lock and mode, notice, editor host, confirm dialog with
  Apply and Discard.
- :481-494 init: State.on change refreshes only while locked. Listens
  for canvas:select on document.

### Suite Monaco
- static/js/widgets/shared/monaco-readonly.js:35-55 ready(), one AMD
  load, memoized. :80-103 mountReadonlyMonaco returns editor, setValue,
  setLanguage, layout, dispose.
- static/js/widgets/usertools/editor/editor.js:145-167 a writable
  mount with cmd s bound. :170-175 one model per tab.

### Annotate, Open Design
Root: /Users/moth3rship/Downloads/open-design-main/apps/web/src/components/
- PreviewDrawOverlay.tsx:38 ANNOTATION_EVENT 'opendesign:annotation'.
  :63-69 props include captureSnapshot. :8 imports
  requestPreviewSnapshot from runtime/exports.
- :926-968 compositeWithBackground: an offscreen canvas at snapshot
  size, white base, the snapshot image, the capture target box,
  selection boxes, strokes in normalized coordinates, text marks, then
  toBlob png.
- :970-1035 send: builds detail {file, note, action, filePath,
  markKind, bounds, target, extraFiles, ack} and dispatches the window
  event. 60 second timeout on the ack.
- From Mapdocs/MAP-open-design-editor.md DRAW OVERLAY: a canvas element
  over the iframe container (:1282-1301), text label layer
  (:1303-1418), tools box, pen, text in refs, undo and redo stacks
  separate from the document's (:661-701).
- :860-879 snapshot: the host's compositor on desktop, else
  requestPreviewSnapshot posts to the iframe and waits. The comment at
  :940-942 says the web fallback rasterizer can paint nothing.

### Suite frames for the picture
- Docs/HOWTO-frames.md:26 the user frame reads track, text, media,
  image_paths.
- server.py:1518 /api/fs/put writes a file. :1552 /api/fs/raw reads.
- Docs/tests/matrix_harness.py is a headed Playwright harness. Size
  not measured. Playwright can screenshot a page.

---

## DESIGN

### Code widget
- Option canvas like Tools: instance id or "focused".
- Views: Blocks (the drawer buffer, resolved or template), Doc (the JSON,
  pretty), Source (file mode raw HTML). Blocks and Doc show for doc
  mode; Source shows for file mode.
- Lock and unlock over the bus: canvas:freeze {inst, on}. Apply sends
  the parsed blocks as setCode calls into the target canvas's State,
  or a set-full-source patch in file mode, or State.load for a Doc
  edit. Discard refreshes.
- canvas:select scrolls to the widget's header line. canvas:change
  refreshes while locked.
- Monaco through MX.monacoReady, one model per view, language html for
  Blocks, json for Doc, html for Source.
- getOptions: canvas, view, codeMode, locked false always.

### Annotate
- A layer on the Canvas widget, toggled from its bar. Host-side canvas
  element over the iframe. Tools box, pen, text. Marks in normalized
  coordinates. Own undo stack.
- Send: composite snapshot plus marks to a PNG, write it through
  /api/fs/put under the session's root, then send a user frame to a
  chosen track with the note as text and the PNG path in image_paths.
- Snapshot options, decide in the spec:
  - Vendor a DOM rasterizer and draw the iframe document to canvas.
    Same-origin makes the document reachable. Fonts and images may
    miss.
  - A server route that runs Playwright against the matrix URL with
    the window id and clips to the canvas iframe. Exact pixels. Needs
    the harness's browser available to the server.
  - No background: send marks over a blank frame with the file path.
    Cheapest, least useful.

---

## DECIDED
- Code is a separate widget, one target canvas.
- Three views, mode-dependent.
- Annotate sends through the existing user frame.

## OPEN
- The snapshot method.
- Whether Doc view edits write through State.load (full replace, one
  undo step) or stay read-only in phase 3.
- Which track receives the annotation: a picker, or the canvas's
  option.

---

## READS FOR THE SPEC SESSION
- drawer.js whole, 18.5KB.
- editor.js and monaco-readonly.js, 21KB.
- PreviewDrawOverlay.tsx ranges :38-70, :661-701, :834-905,
  :926-1035, :1282-1418. About 20KB.
- HOWTO-frames.md user frame row. server.py fs/put route :1518-1541.
- matrix_harness.py head, for the Playwright screenshot option.

## TESTS, headed
- Select on canvas: Code scrolls to the block.
- Unlock, edit a block, Apply: canvas re-renders that widget only.
- Doc view shows the same JSON the file frame saved.
- File mode: Source view shows the patched HTML after a drag commit.
- Annotate: draw a box, send, the PNG exists on disk and the track
  received a user frame naming it.
