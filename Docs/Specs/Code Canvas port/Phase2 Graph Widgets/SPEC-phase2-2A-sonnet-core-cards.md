# SPEC — Phase 2 — 2A — Sonnet — vendor, graph core, mermaid frame, cards

Written 2026-09-12. First job of phase 2. Starts after 1H is green.
Cap 180K. Builds the shared pieces every graph widget stands on, and
the cards widget, which is the reading pane the later widgets are
checked against.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.6, 2.8. Read those first. Then the Wayfinder
block of section 3 for exports and constants. Do not read section 4.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 150K used, if parts 1 to 4 are not done, stop. Write
  Docs/Handoffs/HANDOFF-phase2-2A.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase2-2A.md in the SESSION
  REVIEW shape with a PICKS I MADE section, plus a CORE API section
  listing every export of graph-core.js and mermaid-frame.js with
  its signature. 2B, 2C, 2D read that section instead of your code.
  One line each to SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit. Vendored files are ES
  modules; check them with `node --check --input-type=module < file`.

## Read, in this order

- Docs/HOWTO-repipe.md — whole.
- static/js/widgets/shared/target-option.js, mirror.js,
  module-ready.js — whole.
- static/js/widgets/test/pipes/pipes.js — whole. The worked example.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/out/ts/app/index.js,
  reach.js, filters.js — whole, 13K. layout.js and map.js: only the
  export lines and the constants named in section 3. Do not read
  their bodies.
- /Users/moth3rship/Desktop/AI Design/Wayfinder/TS port/app/card.ts,
  tabs.ts, search.ts — whole, 18K. These are the source you port;
  the compiled card.js imports monaco.js and is not used.
- static/js/widgets/usertools/editor/editor.js:137-169 and :528-541
  — Monaco instance and file arrival, for part 5.
- static/js/widgets/shared/monaco-readonly.js:72-76 — language from
  path.

## Part 1. Vendor

- Copy index.js, reach.js, filters.js, layout.js, map.js from
  Wayfinder/out/ts/app/ to static/vendor/wayfinder/. Byte for byte.
- Their import lines are relative (`./index.js`, `./layout.js`,
  `./reach.js`) and resolve inside the folder. Confirm with grep and
  list the three lines in the receipt.
- Do not copy card.js, tabs.js, search.js. Those are ported by hand
  in parts 4 and 5.

## Part 2. static/js/widgets/graph/shared/graph-core.js

- `MX.graphCore()` → `MX.moduleReady("wayfinder", loader)`. loader
  does five `import("/static/vendor/wayfinder/<file>.js")` and
  resolves to `{loadGraph, Index, EXPECTED_SCHEMA_VERSION, Filters,
  GUESS, reachFrom, chainText, CHAIN_CAP, planeLayout, fileLayout,
  zoomLayout, makeProjection, HOME_YAW, HOME_PITCH, MapView}`.
- `MX.graphLoad(target)` → fetches `/api/library/graphs/<target>`
  and returns `new Index(graph)`. Uses the vendored loadGraph if its
  signature takes a URL; otherwise fetch and construct. Memoized per
  target for the page; `MX.graphDrop(target)` clears one.
- `MX.graphFilters(options)` → a Filters instance with every field
  named in section 3's defaults list copied from `options` when
  present. `MX.graphFiltersDefaults()` → the defaults as a plain
  object, for a widget's `defaults`.
- `MX.graphKindClass(node)` → `kind-<kind>` string, matching the
  classes map.js paints so the mermaid frame colors agree.
- `MX.graphOptionControls()` → `{target: MX.targetControl(
  MX.graphTargets, MX.graphTargetNew), guesses: {kind: "select",
  values: () => ["on", "flag", "off"]}}`. Every graph widget spreads
  this into its own `optionControls`.
- `MX.graphMirrors(frame, handlers)` → makes three mirrors on
  `graph.select`, `graph.filters`, `graph.reach` with the given apply
  functions, returns `{select, filters, reach, off()}`.

## Part 3. static/js/widgets/graph/shared/mermaid-frame.js

The frame under a drawn graph. One module, mounted by 2B, 2C, 2D.
Cards does not mount it.

- `MX.mermaidFrame(host, opts)` → `{set(index, ids, deep), clear(),
  el}`. Builds inside host: a bar with the word `mermaid`, a copy
  button carrying a clipboard icon (inline SVG, two overlapping
  rounded rects, 14px, no text), and a collapse toggle; under it a
  `pre.mx-mermaid` that is read-only.
- `set(index, ids, deep)`: for each id in ids, in order,
  `reachFrom(index, id, deep)`; for each chain print one line `a -->
  b --> c` using node names, capped at CHAIN_CAP names then ` --> ...`.
  A file id prints its own chains the same way; nothing special.
  Names are `span` elements with the kind class from
  `MX.graphKindClass`. Duplicate lines across ids are printed once.
  Empty ids prints nothing and shows the bar only.
- Copy writes the plain text, one chain per line, no markup, to the
  clipboard with `navigator.clipboard.writeText`. Flash the icon for
  300ms on success.
- Collapse hides the pre and keeps the bar. State is returned by
  `el.dataset.collapsed` so the owning widget can persist it as its
  `mermaidCollapsed` option.
- Styles injected once, prefix `mx-mermaid`. Kind colors: define six
  CSS variables `--mx-kind-file` and so on, defaults picked from
  map.js's own class colors if it sets any, else six distinct hues.

## Part 4. static/js/widgets/graph/cards/cards.js

Type `graph_cards`, label "Cards", group `graph`. Registry row and
script tag are yours; script tags for graph-core.js and
mermaid-frame.js go before it, after the shared helper tags.

Options and defaults: `target ""`, every Filters field at its
default, `selectedIds []`, `focusedId ""`, `openInEditor false`,
`query ""`. `optionControls` spreads `MX.graphOptionControls()`.

Body:
- Bar: search box bound to `query`, three checkboxes bound to
  `searchName`, `searchFacts`, `searchComments`; a hits list under
  the box from search.ts's `searchIds` and `paintHits`, hidden when
  empty. Clicking a hit selects that id (replaces selection) and
  focuses it.
- Tabs strip from tabs.ts: one tab per `selectedIds`, focused tab
  marked. Click moves `focusedId` only.
- Card body from card.ts, ported to plain JS:
  - Cut the monaco.js import, the EDITS_EVENT listener, the EDIT row,
    and the `openInEditor(node)` call at :173.
  - Rewrite `empty()` text: "Pick a node in any graph widget on this
    target."
  - Keep every row: WHO, WHERE, COMMENTS n of m, SHAPE, HOLDS or
    USES → and ← USED, WEIGHT, REACH. CHAIN_ROWS stays 20.
  - `switches` is the Filters instance from `MX.graphFilters(options)`.
  - `chains` come from `reachFrom(index, focusedId, reachDeep)` when
    `reachCard` is true, else empty.
  - `onJump(id)` selects that id (replaces) and focuses it.
- When `openInEditor` is true and a shown node has a path and is not
  synthetic: `mirrors.select` is not used; emit on a fourth mirror
  `graph.open` with `path` = graph root joined to node.path with one
  slash, and `span` = node.span or null.

Mirrors: `MX.graphMirrors(frame, {select: apply selectedIds and
focusedId then redraw; filters: apply every field then redraw;
reach: ignore})`. Cards emits `graph.select` whenever its own
selection or focus changes, and `graph.filters` whenever one of its
filter options changes.

Lifecycle: `mount` loads the core then the target; `onOption` handles
`target` (drop, reload, redraw), every filter key (set on the Filters
instance, redraw, emit filters), `selectedIds`, `focusedId`, `query`,
`openInEditor`. `getOptions` returns every key. `markDirty(frame)`
on any internal change. `unmount` calls mirrors.off().

## Part 5. editor.js, one listener

- Add option `followGraph false` to the editor's defaults and
  `getOptions`, round-trip in `onOption`.
- In mount, `MX.mirror(frame, "graph.open", apply)` where apply, when
  `frame.options.followGraph` is true, sends the `open` frame for
  `payload.path` with this instance id, remembers `payload.span`, and
  after the matching `file` frame lands (onFrame :533-540) calls
  `ed.editor.revealLineInCenter(span[0])` and sets the cursor there.
  When the tab already exists, showTab it and reveal at once.
- The editor has no `target` option. Add `graphTarget ""` as an
  editor option and have the mirror compare against it. Extend
  mirror.js with an optional fourth argument `targetKey`, default
  `"target"`; the editor passes `"graphTarget"`. Empty graphTarget
  follows every target. One line in mirror.js; note it in the
  receipt as a contract addition.
- `off()` in unmount.

## SETTLED IN CHAT

Channel names are dotted, family first: `graph.select`. Settled in
chat to match phase 0's `surface.layout`. The other option is the
scope's colon form `graph:select`; a one-line rename in mirror.js
callers if it ever matters. Not a widget option.

Cards opens the editor through `graph.open`. Settled in chat: the bus
is what this is for. It is a widget option on both ends,
`openInEditor` on cards and `followGraph` on the editor, both default
off, so the coupling exists only when both are on. The other option
is dropping the emit; delete the fourth mirror. Receipt: both option
keys, the mirror.js argument you added, and what happened when only
one side was on.

## Done when

- `MX.graphCore()` resolves in the console with all fifteen names.
- `MX.graphLoad("graph")` resolves to an Index with 84 nodes.
- Cards mounts, picks target graph, shows the empty text. Setting
  `selectedIds` to `["viewer.html"]` and `focusedId` the same in the
  console redraws the card with WHO viewer.html and USES rows.
- Search "score" with name on lists `viewer/score.js`; clicking it
  shows the card and a tab.
- Two cards on one target: pick in one, the other follows. Pipes on
  the same target counts the `graph.select`.
- `openInEditor` on, editor `followGraph` on: picking a node opens
  its file in the editor at its span.
- `MX.mermaidFrame(el, {})` in the console with `set(index,
  ["viewer.html"], false)` prints chains; copy puts plain text on
  the clipboard.
- Refresh: cards returns with the same target, selection, focus,
  query.
- node --check clean. Receipt has the CORE API section.
