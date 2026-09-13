# SPEC — Phase 2 — 2D — Sonnet — Files Graph, global and local views

Written 2026-09-12. Starts after 2R passes on 2B. Runs parallel with
2C. Cap 150K. One widget, two views. Global is Wayfinder's Files
view: one box per file, flat. Local is Wayfinder's Layers view:
folders that open one level at a time, with the path in the corner.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.6, 2.8.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 120K used, if parts 1 and 2 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase2-2D.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase2-2D.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase2-2B.md — the DRAWN WIDGET PATTERN
  section and PICKS I MADE. Nothing else.
- Docs/Reports/RECEIPT-phase2-2A.md — the CORE API section.
- static/js/widgets/graph/force/force.js — whole. Your template.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/layout.ts
  :418-488 fileLayout, :515-548 LEVEL_CAP and folderNode, :693-743
  zoomLayout, for the recipe signatures and what `trail`, `page`,
  `crumbs`, `drillable`, `drillTo` mean. About 8K.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/map.ts
  :342-459 bind — flat views only pan, and how a drillable box's
  click reaches the owner. About 6K.

## Part 1. static/js/widgets/graph/files/files.js

Type `graph_files`, label "Files Graph", group `graph`. Registry row
and script tag are yours.

Copy force.js. Remove the sim loop, `frozen`, `dims`, `sim`, and the
2D/3D toggle. Add:

Options and defaults: `target ""`, every Filters field, `selectedIds
[]`, `focusedId ""`, `camera {yaw: 0, pitch: 0, scale: 1}`,
`mermaidCollapsed false`, `view "global"`, `trail []`, `page 0`.
`optionControls` adds `view: {kind: "select", values: () =>
["global", "local"]}`.

Recipes:
- `view === "global"`: `fileLayout(index, filters)`.
- `view === "local"`: `zoomLayout(index, filters, trail, page)`.
Both flat. Camera pans and zooms only; MapView's bind already does
that for flat modes.

Bar: a global/local toggle bound to `view`; when local, a breadcrumb
strip built from `vm.crumbs`, each crumb clickable and setting
`trail` to that depth, then a home button that empties `trail`;
`page` arrows when `vm.page` says there are more. The path label:
when local, the current `trail` joined with `/` shown at the top
left of the SVG, the way Wayfinder shows `everything / viewer/`.
Search, fit, options gear as force has.

Drill: a click on a box whose vm marks it `drillable` sets `trail`
to `vm.drillTo(box)` or the equivalent the recipe returns, resets
`page` to 0, rebuilds, `show`. A click on a file box selects it as
in force. Read map.ts bind to see which callback carries the box.

Mirrors as force. `graph.select` from a mirror: if the selected file
is not on the current level in local view, do not change `trail`;
light nothing and keep the selection in options so a flip to global
shows it. Note this in the receipt.

Lifecycle as force. `onOption` handles `view`, `trail`, `page` by
rebuilding. `getOptions` returns every key.

## Part 2. Shared pull-up

Same rule as 2C: an identical block over 30 lines moves to
static/js/widgets/graph/shared/drawn-widget.js. 2C is doing the same
in parallel; if you both move the same block, the redpen merges. Name
what you moved.

## SETTLED IN CHAT

The shared pull-up rule is 30 identical lines. Settled in chat to
keep the two widgets from being three copies of force.js. The other
option is no pull-up; three files, nothing shared, the redpen diffs
them. Receipt: what you moved, or that nothing qualified.

Files Graph's global and local views are one widget with a `view`
option. Settled in chat. The other option is two widgets; split the
file at the recipe call. Receipt: what a mirrored pick does when the
file isn't on the current local level.

## Done when

- Files Graph mounts, loads graph, global shows nine file boxes in
  three clusters.
- Flip to local: three folder boxes, `everything` in the corner.
  Click `viewer/`: five file boxes, `everything / viewer/` in the
  corner and the breadcrumb. Home returns.
- Click a file: cards follows, mermaid frame prints its chains, Force
  Graph lights it.
- Refresh in local at `viewer/`: same view, trail, selection.
- Cap levels on with a graph over 60 files pages; note that the seed
  graph does not reach the cap and the arrows stay hidden.
- node --check clean.
