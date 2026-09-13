# SPEC — Phase 2 — 2B — Opus — Force Graph

Written 2026-09-12. Starts after 2A's receipt exists. Cap 180K. The
finicky widget. It answers every drawn-widget question first so 2C
and 2D are subsets. Read the receipt's CORE API section instead of
2A's code.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.6, 2.8. Read those first. Then section 3's
Wayfinder block for layout.js and map.js exports and constants.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 150K used, if parts 1 to 3 are not done, stop. Write
  Docs/Handoffs/HANDOFF-phase2-2B.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase2-2B.md in the SESSION
  REVIEW shape with a PICKS I MADE section, plus a DRAWN WIDGET
  PATTERN section: the mount order, how MapView is fed, how the
  mermaid frame is wired, how camera persists. 2C and 2D read that
  section. One line each to SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase2-2A.md — whole.
- Docs/HOWTO-repipe.md — the mirror and vendored-module sections.
- static/js/widgets/graph/cards/cards.js — mount, onOption,
  getOptions only. The pattern to match.
- static/js/widgets/graph/shared/mermaid-frame.js — whole.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/layout.ts
  :22-44 constants, :88-101 ViewModel, :103-247 planeLayout for how
  a ViewModel is built, :290-315 projection. About 12K.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/map.ts
  :99-110 ViewModel as seen, :145-241 MapView fields and shell,
  :244-339 show, :342-459 bind, :476-520 glide and frame, :531-564
  select and focus, :656-735 render, :737-831 paintState. About
  25K. The vendored map.js is what runs; the TS is what you read.

## Part 1. Force recipe, static/js/widgets/graph/shared/force-sim.js

- `MX.forceSim(nodes, edges, positions, opts)` → positions. One
  function, pure, one step per call. nodes is `[{id, r}]`, edges is
  `[{from, to}]`, positions is a Map id → `{x, y, z, vx, vy, vz}`.
  opts: `{repulsion, attraction, damping, step, dims}` with defaults
  chosen so the seed graph settles inside the cap in part 4.
- Repulsion between every pair, inverse square, clamped at close
  range. Attraction along every edge, spring toward a rest length
  proportional to r1 + r2. Velocity damped by `damping` each step.
  `dims` is 2 or 3; 2 holds z at 0.
- Returns the same Map, mutated, and a number: the largest
  displacement this step. The caller uses it to detect settle.
- Nothing else in the file. This is the swap point for a library or
  a worker later.

`MX.forceLayout(index, filters, positions)` in the same file → a
ViewModel with `mode: 'tilt'`, one plane sized to the bounding box of
positions plus PLANE_MARGIN, `placed` from positions, `nodes` and
`edges` from `filters.nodes(index)` and `filters.edges(index, ok)`
rolled up the way fileLayout does (layout.ts :369-384), part radius
`R_BASE + min(degree, R_CAP) * R_STEP` with the three numbers copied
from section 3, `camera: {yaw: HOME_YAW, pitch: HOME_PITCH}`,
`crumbs: []`, `drillable: false`, `page: 0`, `note: ''`. Match the
ViewModel field list in layout.ts :88-101 exactly so MapView.show
takes it unchanged.

## Part 2. static/js/widgets/graph/force/force.js

Type `graph_force`, label "Force Graph", group `graph`. Registry row
and script tag are yours; force-sim.js's tag goes before it.

Options and defaults: `target ""`, every Filters field, `selectedIds
[]`, `focusedId ""`, `camera {yaw: HOME_YAW, pitch: HOME_PITCH,
scale: 1}`, `frozen false`, `dims 3`, `mermaidCollapsed false`,
`sim {repulsion, attraction, damping, step}` at the defaults.
`optionControls` spreads `MX.graphOptionControls()`.

Body, top to bottom:
- Bar: freeze toggle bound to `frozen`; a 2D/3D toggle bound to
  `dims`; search box and hits as cards does; a fit button (MapView
  fit); options gear (frame.toggleOptions).
- SVG host: one MapView from the core. `show(vm)` once per target or
  filter change; `render()` per sim tick.
- Mermaid frame from `MX.mermaidFrame`, `set(index, selectedIds,
  reachDeep)` on every selection change.

Sim loop: `requestAnimationFrame`; each tick calls `MX.forceSim`,
writes positions into `vm.placed`, calls `view.render()`. Stops when
`frozen` is true or the largest displacement falls under 0.05 for 30
ticks running. Any filter change or target change re-seeds positions
(existing nodes keep theirs, new ones start at a small random offset
from the centre) and restarts the loop unless frozen.

Selection: MapView's own bind handles click, shift+click add, drag
orbit, wheel zoom, f and shift+f (map.ts :342-459). Hook its select
callback: on change, write `selectedIds` and `focusedId`, emit
`graph.select`, `set` the mermaid frame, `markDirty`. On
`graph.select` from a mirror: apply to the view (map.ts :531-564)
without re-emitting.

Camera: on any camera change from bind, write `camera` and
`markDirty`. On mount, after `show`, set the view's cam from the
option before the first render.

Filters: every filter option change sets it on the Filters instance,
rebuilds vm, `show`, emits `graph.filters`. On `graph.filters` from
a mirror: apply the fields as options without re-emitting.

Reach: on focus change with `reachMap` true, emit `graph.reach` with
the reachFrom result. On receipt, light the ids on the view the way
map.ts :773-783 lights hover, held until the next.

Lifecycle: mount loads core then target, builds the Filters instance,
the view, the frame, the loop. `onOption` handles every key. `dims`
change re-seeds. `getOptions` returns every key including the live
camera and `mermaidCollapsed` from the frame's dataset. `unmount`
cancels the loop, calls mirrors.off(), disposes the frame.

## Part 3. Worker swap, named not built

Main thread is the build. The swap, for the record and the receipt:
force-sim.js becomes a worker script with the same function; the
widget posts `{nodes, edges, positions, opts}` and receives
`{positions, maxMove}` per tick. The widget's loop and everything
else stay. If a later test shows stutter, that is the one-file
change. Write this paragraph into the receipt's PICKS I MADE.

## Part 4. Settle test, in the receipt

- Load target graph, default filters, 3D. Time from first tick to
  settle. Must be under 4 seconds on Brandon's machine; report the
  number.
- Freeze mid-run: positions stop changing; unfreeze resumes.
- 2D: settles flat, z all zero.

## SETTLED IN CHAT

Force runs on the main thread. Settled in chat: easiest to undo. The
other option is a worker; force-sim.js becomes the worker script with
the same function, the widget posts and receives per tick, nothing
else moves. That is the one-file swap. `dims` 2D or 3D is a widget
option, default 3. Receipt: the settle time on the seed graph, and
whether anything stuttered with three drawn widgets open; that number
decides the swap.

## Done when

- Force Graph mounts, loads graph, settles under the cap, freezes,
  orbits, zooms, fits.
- Click a node: cards on the same target shows it; the mermaid frame
  prints its chains; shift+click adds a second and its chains.
- Pick in cards: the force view lights the same node.
- Filter change in either widget: both redraw.
- Refresh: same target, camera, selection, frozen state, collapsed
  state.
- Copy button puts the chains on the clipboard as plain text.
- node --check clean. Receipt has the DRAWN WIDGET PATTERN section,
  the settle number, and the worker paragraph.
