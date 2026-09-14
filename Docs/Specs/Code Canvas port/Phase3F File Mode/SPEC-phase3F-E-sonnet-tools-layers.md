# SPEC — Phase 3F — E — Sonnet — Tools layers on .html

Written 2026-09-13. Starts after D is green through R. The Tools
widget's Layers tab shows the DOM tree of a file-mode canvas; the
library and page tabs hide on .html.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md
sections 3.5, 3.7, pick P2.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
  The canvas API is job D's; if a method is missing, stop and write
  BLOCKED in the receipt.
- Doc-mode layers stay as they are. Branch on `a.state`; do not merge.
- Stages below. After each, append `- [x] Stage N — label` to
  Docs/Reports/RECEIPT-phase3F-E.md. At 200K with stages open: stop,
  write Docs/Handoffs/HANDOFF-phase3F-E.md. Hard cap 250K.
- Receipt in the SESSION REVIEW shape with STAGES, PICKS I MADE,
  CONTRACT FIELDS ADDED. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` after every stage.

## Read, in this order

- The scope, sections 1, 2, 3.4, 3.5, 3.7, 5, 6.
- Docs/Reports/RECEIPT-phase3F-D.md — the API as D left it.
- static/js/widgets/codecanvas/tools/tools.js — whole. 37K.
- static/js/widgets/codecanvas/canvas/canvas.js — grep `frame._canvas =`
  and read that block only.
- static/js/widgets/codecanvas/shared/patch.js — `HOST_NODE_SELECTOR`
  and `find` only.

## Stage 1 — read and plan

Receipt with STAGES unchecked and a plan. Check stage 1.

## Stage 2 — tabs on .html

- In `renderTabs`, when `api(tl)` has no `state`: hide the library and
  page tab buttons (`hidden = true`); if `tl.section` is one of them,
  set it to `"tools"`. When state returns, unhide.
- Check stage 2.

## Stage 3 — the tree

- `renderFileLayers(tl, host, a)` called from `renderLayers` when
  `!a.state`. The "Layers need a doc canvas" line goes.
- Walk `a.doc().body` children recursively. Skip elements matching
  `HOST_NODE_SELECTOR`, `[data-od-edit-guides-layer]`, and the tags
  script, style, template, link, meta.
- Row per element: tag; `#id` or `.firstClass` when present; the
  first four words of the element's own text nodes; indented by depth;
  the word `group` on `data-od-group`. The row's key is
  `el.getAttribute("data-od-id")`. Rows in `a.selected()` are lit.
- Click: `tl.mirrors.select.emit({ids: [id]})`. Shift-click: toggle in
  the current selection and emit the new set.
- Check stage 3.

## Stage 4 — drag, buttons, eye

- Drag a row onto a row, same DnD shape as the doc-mode rows: top
  quarter `a.move(id, parentOf(target), indexOf(target))`, bottom
  quarter index + 1, middle `a.move(id, target, childCount(target))`.
  Index counts element children that are not host nodes; write one
  helper and use it for both.
- Head: Group button → `a.group(a.selected())`; Ungroup button →
  `a.ungroup(a.selected()[0])`. Disabled when the selection is empty.
- Eye per row: `a.patchSource({id, kind: "set-style", styles:
  {display: hidden ? "" : "none"}})` where hidden reads the live
  element's inline `display`.
- Re-render on `select`, `change`, `doc` mirrors: already wired.
- Check stage 4.

## Stage 5 — check and receipt

- `node --check`. Against a server if reachable: bind Tools to a
  file-mode canvas on a scratchpad .html, confirm the tree, click a
  row, group two, drag one. If no server, say so and stop at the code.
- Receipt. Check stage 5.

## Done when

- Tools bound to an .html canvas shows two tabs: tools, layers.
- Layers shows the page's tree, nested, with the selected row lit.
- Click a row: the canvas selects that element.
- Drag a row into another: the element moves in the page and in the
  tree.
- Group button on two selected siblings: a `group` row appears holding
  both.
- Bind to a .json canvas: four tabs, doc layers unchanged.
- node --check clean.
