# SPEC — Phase 3 — 3C — Opus — Tools widget

Written 2026-09-12. Starts after 3R passes on 3B. Cap 150K. The
inspector, layer tree, and library for one canvas. Pinned to an
instance or following focus, by option.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.7, 2.8.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 130K used, if parts 1 and 2 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase3-3C.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase3-3C.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase3-3B.md — CANVAS API section and PICKS.
- Docs/Reports/RECEIPT-phase3-3A.md — CORE API section.
- static/js/widgets/canvas/canvas/canvas.js — mount, onOption,
  getOptions, and the `frame._canvas` block only.
- Code Canvas app/panel.js — whole, 22K. Your source.
- Code Canvas app/nav.js :242-294 library and drop, :297-333 page
  options. 4K.
- Open Design types.ts :47-87 ManualEditStyles. bridge.ts :444-482
  targetFrom, for what the file-mode inspector reads.

## Part 1. static/js/widgets/canvas/tools/tools.js

Type `canvas_tools`, label "Tools", group `canvas`. Registry row and
script tag are yours.

Options and defaults: `target ""`, `canvas "focused"`, `section
"tools"`. `optionControls`: the core's `target`; `canvas` select
whose values are `["focused"]` plus the ids of every canvas instance
on this surface whose target equals this widget's target (walk
`MX.grid.instances`).

Which canvas: when `canvas === "focused"`, the last instance that
emitted `canvas.focus` on this target; else the named instance. Its
`frame._canvas` is what the widget reads and writes. When none,
the body reads "No canvas on this target."

Sections, a tab row bound to `section`:
- tools: port panel.js :41-51 sharedTools over the canvas's
  selection, :55-101 the writers (through the canvas's `state`,
  batched, 500ms typing debounce), :112-334 the tool builders and
  the kit queue drain (:329-334, :549-552).
- layers: renderOrder :365-428 with the drop logic :404-421, against
  the canvas's state; visibility toggle new, lock present.
- library: nav.js :242-274 kit cards, draggable; drop into the
  target canvas's iframe calls its `place`. HTML5 DnD crosses a
  same-origin iframe; bind the drop listener on the iframe document
  through `frame._canvas`.
- page: nav.js :297-333 options: grid, gridStyle, width mode, fixed
  px, palette; pages list with add and rename.

File mode inspector: when the canvas's `mode()` reports file mode,
the tools section shows the ManualEditStyles fields for the selected
element, read from the element's computed style in the iframe, and
writes each change as a set-style patch through `patchSource`. Text,
link, image src fields for those kinds.

Mirrors: `canvas.select` and `canvas.change` on this target redraw
the current section. `canvas.focus` updates the followed instance
when `canvas === "focused"`. `canvas.doc` redraws when the followed
instance changed document.

Lifecycle: `getOptions` returns three keys. `onOption` for `canvas`
rebinds; `section` switches. `markDirty` on section or canvas
change. `unmount` off.

## Part 2. Notes

The notes modal (panel.js :432-440) becomes an inline textarea in
the tools section, written through `writeNotes`.

## SETTLED IN CHAT

Tools follows focus or pins to one canvas. Settled in chat: `canvas`
is a widget option, `focused` by default, an instance id pins.
Receipt: what the dropdown listed with two canvases up and what
happened when the pinned one closed.

Notes are an inline textarea, not the modal. Settled in chat to fit a
widget body. The other option is the modal from panel.js :432-440;
port it if inline crowds the section. Receipt: which one landed.

## Done when

- Canvas with a doc, Tools beside it. Select a widget in the canvas:
  tools shows its shared tools; type in a text field; after the
  debounce the canvas re-renders that widget.
- Layers: drag one above another, the canvas's order changes; drop
  into the middle of a container, it reparents.
- Library: drag a card into the canvas, it places.
- Two canvases, Tools on `focused`: click each, Tools follows. Set
  `canvas` to one id, click the other, Tools stays.
- File-mode canvas: select an element, change a color in the
  inspector, the source gets the inline style.
- Reload: Tools returns with target, canvas, section.
- node --check clean.
