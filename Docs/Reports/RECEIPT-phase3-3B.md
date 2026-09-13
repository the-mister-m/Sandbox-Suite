# SESSION REVIEW — Sandbox Suite — Phase 3, job 3B, canvas widget — 2026-09-12

## EDITS

- [static/js/widgets/canvas/canvas/canvas.js](../../static/js/widgets/canvas/canvas/canvas.js) — the whole job: type `canvas`, doc mode and file mode, bar, iframe, `frame._canvas`
- [static/matrix.html](../../static/matrix.html) — one script tag, after canvas-core.js and before graph-core.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — registry row, group `canvas`
- [Docs/tests/phase3_3B_canvas.py](../tests/phase3_3B_canvas.py) — headed proof harness, twenty-one checks
- [Docs/Reports/phase3-3B/](phase3-3B/) — checks.json, console.txt, doc-mode.png, preview-mode.png, two-canvases.png, file-mode.png, after-reload.png

## STRAY FILES

- [library/proof/3b-doc.json](../../library/proof/3b-doc.json) — the harness's doc under test, rewritten on every run
- [library/proof/3b-doc2.json](../../library/proof/3b-doc2.json) — the second canvas's target, same content, different path
- [library/proof/3b-doc.html](../../library/proof/3b-doc.html) — the export the harness writes and then reopens in file mode

## GOALS DONE

Every line of the spec's "Done when", proven headed on session 9883b6bec3df,
surface `phase3-3b` (grid file deleted by the harness). **Zero console lines
and zero pageerrors across the whole run.**

- Doc draws: three widgets in the iframe, two pages
- Drag a widget: box `{x:40,y:40}` → `{x:120,y:80}`, status `dirty`, Save writes, status `saved`, the box on disk is the new one
- Marquee selects two, arrows nudge by one grid unit, cmd-z restores the box, cmd-d takes three widgets to four, Delete takes four back to three
- Context menu inside the iframe: Duplicate, Delete, Notes, Bring forward, Send back, Lock position
- Zoom `+` 100 → 110, cmd-wheel around the pointer 110 → 120
- Page tabs draw both pages; one page draws none
- Export writes `3b-doc.html` with the back-link meta
- That HTML opened as `target`: file mode, the bar reads `from <doc path>`, drag puts a `translate(...)` in the source, save and reopen keep it
- Double-click a text leaf, type, Enter: `EDITED BY 3B` is in the source, survives save and reopen
- Two canvases, two targets: a `canvas.select` emitted by one leaves the other's selection empty
- `canvas.select` counted on the bus, six emissions, payload `{target, inst, ids}`
- Reload: `target`, `mode` (`code`), `zoom` (75), `selection`, `page` all come back and the doc redraws
- Preview mode: no handles, grid `none`, no errors
- Part 2, two canvases in one grid: every listener on its own iframe, no
  module-level state, the second instance never sees the first's selection
- Part 3, fluid mode: the page element's width is `100%` and measures exactly the
  iframe's width (777 px = 777 px); a grid resize rebases it (492 px = 492 px)
  through the host's ResizeObserver
- `node --check` clean on canvas.js after every edit

## BRANDON'S TODOS

- **The spec's "Pipes on the same target counts `canvas.select`" cannot hold as
  written.** pipes.js:45-48 mirrors `graph.select`, not `canvas.select` — it was
  built for the graph family in phase 1. I proved the channel with an
  `MX.bus.on("canvas.select")` listener in the harness instead and did not touch
  pipes.js. Adding a second mirror to pipes is a one-line change if you want the
  literal check.
- 3A's standing item is untouched: the `b64` asset bytes still need a server
  restart and a rerun of `phase3_3A_core.py`.

## PICKS I MADE

- **The zoom control lives in the host bar, not in the iframe.** The spec's body
  list puts it in the bar and Code Canvas built it inside the viewport
  (canvas.js:160, :170-198). I ported the four controls (−, readout, +, Fit) into
  the bar and dropped `buildZoomControl`'s call from `viewport()`; the iframe
  keeps `.cc-canvas-viewport` and nothing else of the zoom chrome.
- **Export composes the string from the rendered DOM.** The spec says "render
  already produces it"; `MX.canvasRender` produces DOM in the iframe, not a
  string. `exportHtml` clones `#matrix`, strips the handles, the selection class
  and any marquee, drops the `cc-canvas-matrix` class and the `id`, re-inlines
  width and paper colour, and wraps it with the `cc-render-style` block plus one
  `.cc-canvas-widget { position: absolute }` rule.
- **`optionControls` is attached after the core resolves.** widget-frame.js:150
  reads `mod.optionControls` as an object at panel-open time, and the core's is
  behind a promise, so `mount` assigns `MOD.optionControls` once `MX.canvasCore()`
  lands. Every instance shares it; the three controls are instance-independent.
- **A self-save is not a `tree_dirty` from someone else.** A save broadcasts
  `tree_dirty` suite-wide, so the widget that just saved was re-opening its own
  file and losing its undo stack. `reopenIfClean` skips a re-open within 2000 ms
  of this instance's own `saved`. Everything else re-opens as the spec says: not
  dirty, no gesture, no drag, no live text edit.
- **`canvas.doc` is emitted when a target finishes loading**, `{mode, path}` per
  contract 2.7. The spec's body list did not say when to emit it; a load is the
  only event that carries the mode and the path.
- **`canvas.focus` is emitted on pointerdown before the frozen check**, so a
  frozen canvas still tells its siblings it was touched.
- **The context menu's Notes item emits `canvas.select` with `{ids:[id], notes:
  true}`.** Code Canvas dispatched a `canvas:notes` DOM event; there is no
  `canvas.notes` channel in contract 2.7 and I did not add one. The extra field
  is additive and 3E can read it or ignore it.
- **File mode selects by `patch.stableId`**, so the selection option for a file
  target holds `path-N-N` ids and for a doc target holds `wg_*` ids. One
  `selection` key, two id spaces, as `target` already is.
- **Mode buttons show their state with an accent underline** (`.mxcv-btn-on`),
  and `.mxcv-wrap [hidden] { display: none !important }` is in the widget's own
  style block because `.mxcv-zoom` and `.mxcv-tabs` are `display: flex` and would
  otherwise ignore `el.hidden`.
- **The harness resizes the grid cell before it drives the mouse.** A new widget
  gets a 4×4 slot, which is a 207×18 px iframe — every gesture landed outside it
  and read as a miss. `MX.grid._place` with a 14×17 slot is the first thing the
  harness does after `addWidget`.
- **The harness opens the session over `/api/sessions/<sid>/open` first.** The
  ADE socket refuses a session that is not open (server.py:2052) and without the
  socket there are no file frames.

## WHAT THE THREE MODE BUTTONS CHANGE

Settled in chat, and this is what they do:

- `canvas` — `render.setMode("preview")`, `page(pageId, {play: false})`, grid
  drawn, selection chrome drawn, gestures live. No custom JS and no keyframes
  reach the iframe because `render.page` emits none.
- `code` — the same call with `render.setMode("schematic")`: every widget draws
  as a `.cc-canvas-schematic` box reading `id type b<n> a<n>`. Nothing else
  differs. 3D's Code widget is where code is edited.
- `preview` — `page(pageId, {play: true})`, `paintSelection` returns early, and
  `drawGrid` sets `background-image: none` and paints paper only. The play seam
  is still empty in phase 3, so nothing moves.

The `schematic` toggle is separate and ORs with `code`: the effective render mode
is `schematic` when either is on.

## EXPORT AND THE BACK LINK

The meta line as written, from the run:

```
<meta name="code-canvas-source" content="/Users/moth3rship/Desktop/AI Design/Sandbox Suite/library/proof/3b-doc.json">
```

`backLink` defaults on; off writes the same document with the meta line absent.
When file mode read that file it showed `from /Users/moth3rship/Desktop/AI
Design/Sandbox Suite/library/proof/3b-doc.json` in the bar next to an `Open doc`
button, which sets this widget's `target` to that path.

## CANVAS API

`frame._canvas`, set in `mount`, cleared in `unmount`. 3C to 3E read this.

```
place(type, at) -> id | null     at is {x, y} in iframe client px; doc mode only
selected() -> string[]           widget ids in doc mode, patch ids in file mode
freeze(on) -> void               refuses gestures, view unchanged
redraw() -> void                 doc mode: full redraw; file mode: repaint chrome
state                            the instance's MX.canvasState, null in file mode
source() -> string               doc mode: the document as pretty JSON
                                 file mode: the held source string
patchSource(patch) -> string     file mode only; applies, marks dirty, emits
                                 canvas.change, returns the new source
mode() -> "code" | "canvas" | "preview"
```

`place` snaps through the same `snapH`/`snapPx` the drag commit uses and divides
by the live zoom scale, so a drop point in iframe client pixels lands where the
pointer is. `patchSource` takes any of `patch.KINDS`; a refused patch leaves the
source untouched and writes `patch refused` to the status line.

Channels this widget emits, all through `core.mirrors`:

```
canvas.select  {target, inst, ids}            every selection change it owns
canvas.focus   {target, inst}                 any pointerdown in the iframe
canvas.doc     {target, inst, mode, path}     after a target finishes loading
canvas.change  {target, inst}                 after a State commit or a patch
canvas.mode    {target, inst, mode}           every mode change
```

Channels it listens on: `canvas.select` (applies without re-emitting) and
`canvas.freeze` (sets the frozen flag).

Options, all eight round-tripped through `getOptions`/`onOption`:
`target`, `mode`, `zoom`, `selection`, `schematic`, `page`, `assetMode`,
`backLink`.

## CONTRACT FIELDS ADDED

Named per section 2's rule. Nothing renamed, nothing narrowed.

- **`canvas.select` gains an optional `notes: true`** on the payload the context
  menu's Notes item emits. `{target, inst, ids}` is unchanged for every other
  emission; a listener that does not know the field is unaffected.

## CLOSER REVIEW

- Rule conflict, flagged not resolved: this job's environment reminder said to do
  file reads and edits through Bash; Brandon's FILE OWNERSHIP rule says the
  opposite. Followed Brandon's rule — Read/Write/Edit for every file, Bash for
  grep, `node --check` and the harness runs — **closer**
- Decide whether pipes.js gets a `canvas.select` mirror so the spec's literal
  check can run — **Brandon**
- `library/proof/3b-*.{json,html}` are harness artifacts, regenerated on every
  run; delete or keep — **Brandon**
- 3C to 3E read the CANVAS API section above instead of the widget code — **closer**
