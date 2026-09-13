# SPEC — Phase 2 — 2C — Sonnet — Stack Graph

Written 2026-09-12. Starts after 2R passes on 2B. Runs parallel with
2D. Cap 150K. A subset of Force Graph: same bar, same mirrors, same
mermaid frame, a different recipe and no sim.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.6, 2.8.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 120K used, if parts 1 and 2 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase2-2C.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase2-2C.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase2-2B.md — the DRAWN WIDGET PATTERN
  section and PICKS I MADE. Nothing else.
- Docs/Reports/RECEIPT-phase2-2A.md — the CORE API section.
- static/js/widgets/graph/force/force.js — whole. Your template.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/layout.ts
  :103-247 planeLayout — what the recipe does, so the bar's words
  are right. Do not read the rest.

## Part 1. static/js/widgets/graph/stack/stack.js

Type `graph_stack`, label "Stack Graph", group `graph`. Registry row
and script tag are yours.

Copy force.js. Remove the sim loop, `frozen`, `dims`, `sim`, and the
2D/3D toggle. The recipe is `planeLayout(index, filters)` from the
core. `show(vm)` on target or filter change; `render()` only when
MapView's bind asks (camera moves). Everything else stays: options,
mirrors, mermaid frame, camera persistence, search, fit.

Options and defaults: `target ""`, every Filters field, `selectedIds
[]`, `focusedId ""`, `camera {yaw, pitch, scale}`, `mermaidCollapsed
false`.

The bar's first word is "stack". The empty state, when no target,
reads "Pick a target."

## Part 2. Shared pull-up

If while copying you find a block that is identical between force.js
and stack.js and longer than 30 lines, move it into
static/js/widgets/graph/shared/drawn-widget.js as one function and
call it from both. Name the function in the receipt with the line
count it saved. If nothing qualifies, say so. Do not refactor
anything shorter.

## SETTLED IN CHAT

The shared pull-up rule is 30 identical lines. Settled in chat to
keep the two widgets from being three copies of force.js. The other
option is no pull-up; three files, nothing shared, the redpen diffs
them. Receipt: what you moved, or that nothing qualified.

## Done when

- Stack Graph mounts, loads graph, draws shelves, orbits, zooms, fits.
- Click a node: cards follows, mermaid frame prints its chains,
  Force Graph on the same target lights it.
- Filter change here redraws Force Graph and cards.
- Refresh: same target, camera, selection, collapsed state.
- node --check clean.
