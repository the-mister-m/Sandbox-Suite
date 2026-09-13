# SPEC — Phase 3 — 3B — Opus — Canvas widget, doc mode and file mode

Written 2026-09-12. Starts after 3R passes on 3A. Cap 200K. The
heaviest job in the port. Everything in phase 3 and 4 stands on this
iframe.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.7 to 2.10.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 170K used, if parts 1 to 3 are not done, stop. Write
  Docs/Handoffs/HANDOFF-phase3-3B.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase3-3B.md in the SESSION
  REVIEW shape with a PICKS I MADE section, plus a CANVAS API
  section: what `frame._canvas` exposes to sibling widgets (place,
  selected, freeze, redraw, state, patchSource). 3C to 3E read that.
  One line each to SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase3-3A.md — CORE API section.
- Docs/HOWTO-repipe.md — file frames and mirror sections.
- static/js/widgets/usertools/editor/editor.js — whole, 21K. The
  file-frame widget you match: open on mount, save, saved, dirty,
  canClose, status line.
- Code Canvas app/canvas.js — whole, 26.6K. Your source.
- Open Design bridge.ts :444-482 targetFrom, :519-536 transforms,
  :811-862 text edit, :886-905 preview styles, :1015-1045 pointer
  down and up, :1158-1200 pointer move, :349-421 guides and
  measurements. About 20K.
- Code Canvas app/nav.js :366-427 topbar and page tabs, :297-333
  page options. 6K.

## Part 1. static/js/widgets/canvas/canvas/canvas.js

Type `canvas`, label "Canvas", group `canvas`. Registry row and
script tag are yours; canvas-core.js and the four shared files' tags
go before it.

Options and defaults: `target ""`, `mode "canvas"` (code, canvas,
preview), `zoom 100`, `selection []`, `schematic false`, `page ""`,
`assetMode "data"`, `backLink true`. `optionControls` spreads the
core's, plus `mode` select of the three, `assetMode` select of the
three.

Body:
- Bar: three mode buttons; schematic toggle; zoom control ported from
  canvas.js :171-198; page tabs when doc mode has more than one page;
  path label and status word like the editor's; options gear.
- One iframe, `srcdoc`, same origin, no sandbox attribute. Its
  document is what the core's render and the ported canvas.js
  listeners bind to.

Doc mode (`target` ends `.json`):
- On mount send `open`. On `file`, `state.load(JSON.parse(content))`,
  build render against the iframe document, `page(page || first)`.
- Port canvas.js: module state (:3-20) becomes per-instance state on
  `frame._canvas`; every `document` reference becomes the iframe
  document; the seven capture listeners (:746-753) bind there;
  keyboard (:656-728) binds on the iframe window. Selection chrome
  (:297-329) draws in the iframe. Zoom (:210-262) transforms the
  page element in the iframe.
- `setSelection` emits `canvas.select` through the mirror instead of
  dispatching a DOM event. `State.on` change emits `canvas.change`
  and marks dirty.
- Pointerdown anywhere in the iframe emits `canvas.focus`.
- Save: `save` frame with `JSON.stringify(state.doc, null, 2)`. On
  `saved`, status. canClose asks when dirty, editor.js :396-410.
- `tree_dirty` or `saved` from another inst for this path: re-send
  `open` only when not dirty and no gesture is live.
- Export button in the bar: render the page to a static HTML string
  (render already produces it), and when `backLink` is true add
  `<meta name="code-canvas-source" content="<doc path>">` in the
  head; `save` it next to the doc as `<docname>.html`.

File mode (`target` ends `.html`):
- On `file`, `srcdoc` = the text plus the core's guides stylesheet
  and id-assign script. If the head carries the back-link meta, show
  it in the bar as `from <doc path>` with a button that sets this
  widget's `target` to that doc.
- Drag: the bridge's translate logic (:519-536, :1015-1045,
  :1158-1200) run directly on the iframe document. DRAG_THRESHOLD 4.
  Live transform during the move; on release, `patch.apply(source,
  {kind: "set-style", ...})` with the composed transform, replace the
  source string, mark dirty. Do not reload the iframe on commit.
- Text edit: double-click a text leaf makes it editable (:834-862);
  Enter commits a set-text patch; Escape cancels.
- Guides and measurements (:349-421) drawn in the guides layer while
  dragging.
- Save: `save` frame with the patched source string.

Mode rule: `canvas` mode injects no custom JS and no keyframes.
`preview` mode calls `page(pageId, {play: true})` and hides the
selection chrome and grid. `code` mode is the same as canvas mode
with the schematic on; 3D's Code widget is where code is edited.
Every mode change emits `canvas.mode`.

Mirrors: `canvas.freeze` from a sibling sets the frozen flag (:3-20)
so gestures are refused. `canvas.select` from a sibling applies
selection without re-emitting.

`frame._canvas` exposes `{place(type, at), selected(), freeze(on),
redraw(), state, source(), patchSource(patch), mode()}` for 3C to 3E.

Lifecycle: `getOptions` returns every key; `onOption` for `target`
reloads, `mode` switches, `zoom` applies, `selection` applies,
`schematic` redraws, `page` switches, `assetMode` passes to resolve,
`backLink` nothing until export. `markDirty` on every internal
change. `unmount` off, detach listeners, blank the iframe.

## Part 2. Two canvases in one grid

Every listener is bound on its own iframe. No module-level state. A
second instance with a different target must not see the first's
selection. Test this before the receipt.

## Part 3. Fluid mode

state.js's fluid width mode (:146-183) uses the parent width. In the
iframe that is the iframe's width. Set the page element's width to
`100%` in fluid mode and re-rebase on the iframe's resize
(ResizeObserver on the host).

## SETTLED IN CHAT

Export writes the back-link meta. Settled in chat. `backLink` is a
widget option, default on; off writes plain HTML. Receipt: the meta
line as written and what file mode showed when it read one.

Code mode is canvas mode with the schematic on. Settled in chat
because 3D's Code widget is where code is edited. The other option is
a third render path; not built. Not a widget option. Receipt: what
the three mode buttons actually change.

## Done when

- Open a doc from the Code Canvas tests folder: it draws. Drag a
  widget, release, the doc's box changes, status shows dirty, save
  writes, status shows saved.
- Marquee, nudge with arrows, cmd-z undo, cmd-d duplicate, delete,
  context menu items all work inside the iframe.
- Zoom control and cmd-wheel zoom around the pointer.
- Export writes `<docname>.html` with the back-link meta.
- Open that HTML as target: file mode, the bar says `from <doc>`,
  drag a heading, save, reopen, the transform is in the source.
- Double-click a paragraph, type, Enter: the source text changes.
- Two canvases, two targets: independent selection, independent
  docs, no cross-talk in the console.
- Pipes on the same target counts `canvas.select`.
- Reload: same target, mode, zoom, selection, page.
- Preview mode: chrome hidden, nothing plays, no errors.
- node --check clean. Receipt has the CANVAS API section.
