# SESSION REVIEW — Sandbox Suite — Phase 3, job 3C, Tools widget — 2026-09-12

## EDITS

- [static/js/widgets/canvas/tools/tools.js](../../static/js/widgets/canvas/tools/tools.js) — the whole job: type `canvas_tools`, four sections, the file-mode inspector, inline notes
- [static/matrix.html](../../static/matrix.html) — one script tag, after canvas.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — registry row, group `canvas`
- [static/js/widgets/canvas/canvas/canvas.js](../../static/js/widgets/canvas/canvas/canvas.js) — one line: `doc()` added to `frame._canvas`
- [static/js/widgets/canvas/shared/state.js](../../static/js/widgets/canvas/shared/state.js) — `hidden: false` on a new widget, `setHidden(id, bool)` writer
- [static/js/widgets/canvas/shared/render.js](../../static/js/widgets/canvas/shared/render.js) — one line: a hidden widget's wrapper draws `display: none`
- [static/js/matrix/widget-frame.js](../../static/js/matrix/widget-frame.js) — one line: `control.values(this)` passes the frame
- [Docs/tests/phase3_3C_tools.py](../tests/phase3_3C_tools.py) — headed proof harness, twenty checks
- [Docs/Reports/phase3-3C/](phase3-3C/) — checks.json, console.txt, tools-section.png, layers-section.png, notes-inline.png, library-section.png, page-section.png, two-canvases.png, file-mode.png, after-reload.png

## STRAY FILES

- [library/proof/3c-doc.json](../../library/proof/3c-doc.json) — the doc under test, rewritten on every run
- [library/proof/3c-file.html](../../library/proof/3c-file.html) — the file-mode target, rewritten on every run

## GOALS DONE

Every line of the spec's "Done when", proven headed on session 9883b6bec3df,
surface `phase3-3c` (grid file deleted by the harness). **Zero console lines
and zero pageerrors across the whole run.**

- Canvas with a doc, Tools beside it: click a widget, the tools section draws
  `Text, Box, Color, Link, Notes` with thirteen fields
- Typed into Content: after the 500 ms debounce the document holds
  `EDITED BY 3C TOOLS` and the string is in the canvas's iframe
- Layers: dragging `b` onto the top quarter of `a` reorders
  `[a, b, c]` → `[b, a, c]`; dropping `b` into the middle of the container
  reparents it — `parent` becomes the container's id
- Layers: the eye writes `hidden` and the drawn wrapper reads
  `display: none`; the lock writes `locked`
- Part 2: `canvas.select {notes: true}` from the Canvas context menu switches
  the section to tools and focuses `.cc-panel-notes-field`; typing there writes
  `note written by 3C` onto the widget
- Library: the taxonomy tabs switch, a `status.badge` card dragged into the
  canvas's iframe places — three widgets to four
- Page: the five option rows write (`grid` 20 → 40), `+ Page` adds
  `Page 2` and the canvas's `page` option follows it
- Two canvases up, the `canvas` dropdown listed exactly
  `["focused", "canvas-mtz3lt85-1", "canvas-mtz3lzgh-3"]`
- On `focused`: clicking A binds A, clicking B binds B
- Pinned to B: clicking A leaves the binding on B — `who` still reads
  `pinned canvas-mtz3lzgh-3`
- The pinned canvas closed: the body reads **"No canvas on this target."**
  and the bar's who-line empties
- File mode: clicking the `h1` selects `path-0-0`, the inspector draws all
  thirty-six ManualEditStyles fields plus a Text field; setting `color` writes
  `<h1 style="color: rgb(255, 0, 0);">` into the source; setting Text writes
  `3C SET TEXT` into the same line
- Reload: `{target, canvas, section}` all come back
- `node --check` clean on every JS file edited, `py_compile` clean on the harness

## PICKS I MADE

- **File mode is `_canvas.state === null`, not `mode()`.** The spec says "when
  the canvas's `mode()` reports file mode", but 3B's `mode()` returns the view
  mode — `code | canvas | preview` — and never says doc or file. The one signal
  in the CANVAS API is `state`, "null in file mode". That is what the widget
  reads. Nothing was added to canvas.js for it.
- **`"focused"` falls back to the first canvas on the target** when nothing has
  emitted `canvas.focus` yet. Without it a fresh mount and every reload would
  read "No canvas on this target" until the user clicked. The pinned case has no
  fallback: a pin to a closed instance reads "No canvas on this target."
- **The tab row is the `section` control; `section` is not in `optionControls`.**
  The spec named two controls and I added none.
- **Page switching goes through the canvas's `page` option, not `state.setPage`.**
  The canvas holds `pageId` separately and redraws from it, so a direct
  `state.setPage` would redraw the old page. `boundFrame.setOption("page", id)`
  keeps both sides in step. Add and rename call state directly.
- **Attribute writes (`href`, `src`, `alt`) are `replace-outer-html`.**
  `patch.KINDS` has no `set-link` or `set-image`. The element is re-read out of
  the *held source* (not the iframe), cloned, the attribute set, every
  `data-od-*` attribute stripped, and the clone replaces it. Reading from the
  source is what keeps the bridge's stamped ids out of the file.
- **`inferKind` is ported into this widget**, four lines from bridge.ts:278-286
  plus a local `isTextLeaf` (no children, some text). Open Design's own
  `isTextLeaf` was not in the read list.
- **The builder table is per instance.** `toolTable(tl)` builds the five ported
  builders bound to this instance and drains `kit.tools` on top, so the kit's
  four queued builders (`media, container, input, status`) override by name.
  No module-level table — two Tools widgets in one grid share nothing.
- **`surface.layout` re-renders.** A canvas added or closed changes what this
  widget can bind to and no channel in 2.7 carries it. Without this the body
  stayed stale after the pinned canvas closed; with it the spec's line lands.
- **A `canvas.change` redraw is skipped while the body holds focus.** Code
  Canvas's panel re-rendered on every commit and stole the caret from the field
  that caused it. Selection changes always redraw.
- **The palette editor and the layer tree keep Code Canvas's `cc-panel-*` class
  names**, and the library keeps `cc-nav-*`, because the kit's four queued tool
  builders emit those classes. The style block is this widget's own, in the host
  page, adapted off panel.js:446-475 minus the fixed `#panel` chrome.

## CONTRACT FIELDS ADDED

Named per section 2's rule. Nothing renamed, nothing narrowed.

- **`frame._canvas` gains `doc()`** → the canvas's iframe `Document`, null when
  it has not loaded. The spec asks for the library's drop listener to be bound
  "on the iframe document through `frame._canvas`", and the eight-method API has
  no way to reach it. The file-mode inspector reads computed style through the
  same accessor. One line in canvas.js; nothing else there changed.
- **Contract 2.3 `values` takes an optional frame.** `values: () => string[]`
  becomes `values: (frame) => string[]`. The `canvas` dropdown must list only the
  canvases on *this widget's* target, and `optionControls` is one object shared
  by every instance, so `values()` alone cannot know the target. widget-frame.js
  now calls `control.values(this)`; every existing control ignores the argument.
- **`state.setHidden(id, bool)`** and a `hidden` field on a widget record. The
  spec calls the layers visibility toggle "new" and the 3A state API has no
  writer for it. `setProp` refuses a key with no kit default, so it could not
  carry this. render.js draws a hidden widget's wrapper `display: none`, which
  hides its children with it. Default `false`; an older document reads as
  visible.

## WHAT THE DROPDOWN LISTED, AND THE PINNED CLOSE

Asked for by the spec's SETTLED IN CHAT section, from the run:

```
values(frame) with two canvases up:
["focused", "canvas-mtz3lt85-1", "canvas-mtz3lzgh-3"]
```

`"focused"` first, then every `canvas` instance on this surface whose `target`
equals this widget's, in grid order. A canvas on a different target is not
listed.

Pinned to `canvas-mtz3lzgh-3`, that widget closed:

```
canvasOpt: "canvas-mtz3lzgh-3"   who: ""   body: "No canvas on this target."
```

The pin is kept, not rewritten — reopening a canvas is not something this widget
can do, and silently re-pointing the pin at another canvas would hide the change
from the user. Setting `canvas` back to `focused` rebinds immediately.

## NOTES: WHICH ONE LANDED

**Inline.** The modal from panel.js:432-440 was not ported. The Notes tool
builder is a textarea inside the tools section, written through `writeNotes`
on the same 500 ms debounce as every other field, and it does not crowd the
section — every kit definition already lists `notes` among its tools, so the
textarea is the last block of every selection's tool stack.

The Canvas context menu's `canvas.select {notes: true}` (3B's added field) is
what reaches it: the widget switches to the tools section, redraws, and focuses
the textarea. Proven from the layers section — the section flipped to `tools`
and `document.activeElement.className` came back
`cc-panel-field cc-panel-notes-field`.

## TOOLS API

For 3D and 3E, if either needs to drive this widget.

```
type            canvas_tools     label "Tools"     group canvas
options         target, canvas, section     all three round-trip
canvas          "focused" | a canvas instance id
section         "tools" | "layers" | "library" | "page"
frame._toolsState   per-instance state; core, section, canvasOpt, focusedInst
```

Channels it listens on, all through `core.mirrors`: `canvas.select` (redraw, and
`notes: true` jumps to the tools section), `canvas.focus` (follows when
`canvas` is `focused`), `canvas.doc` (rebinds the iframe drop listener),
`canvas.change` (redraw unless the body holds focus). It emits `canvas.select`
only, when a layer row is clicked. It also listens on `MX.bus`'s
`surface.layout` to notice a canvas added or closed.

## CLOSER REVIEW

- Rule conflict, flagged not resolved: this job's environment reminder said to
  do file reads and edits through Bash; Brandon's FILE OWNERSHIP rule says the
  opposite. Followed Brandon's rule — Read/Write/Edit for every file, Bash for
  grep, `node --check` and the harness runs — **closer**
- Three contract additions above are live and used by this widget only;
  3D and 3E should be told `frame._canvas` is now nine methods — **closer**
- `library/proof/3c-*.{json,html}` are harness artifacts, regenerated on every
  run; delete or keep — **Brandon**
- 3A's standing item is untouched: the `b64` asset bytes still need a server
  restart and a rerun of `phase3_3A_core.py` — **Brandon**
