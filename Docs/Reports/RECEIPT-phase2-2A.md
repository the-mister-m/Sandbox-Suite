SESSION REVIEW — Sandbox Suite — phase2-2A-sonnet-core-cards

EDITS
- [static/vendor/wayfinder/index.js](../../static/vendor/wayfinder/index.js) — vendored, byte-for-byte
- [static/vendor/wayfinder/reach.js](../../static/vendor/wayfinder/reach.js) — vendored, byte-for-byte
- [static/vendor/wayfinder/filters.js](../../static/vendor/wayfinder/filters.js) — vendored, byte-for-byte
- [static/vendor/wayfinder/layout.js](../../static/vendor/wayfinder/layout.js) — vendored, byte-for-byte
- [static/vendor/wayfinder/map.js](../../static/vendor/wayfinder/map.js) — vendored, byte-for-byte
- [static/js/widgets/graph/shared/graph-core.js](../../static/js/widgets/graph/shared/graph-core.js) — new, part 2
- [static/js/widgets/graph/shared/mermaid-frame.js](../../static/js/widgets/graph/shared/mermaid-frame.js) — new, part 3
- [static/js/widgets/graph/cards/cards.js](../../static/js/widgets/graph/cards/cards.js) — new, part 4
- [static/js/widgets/shared/mirror.js](../../static/js/widgets/shared/mirror.js) — targetKey 4th arg, part 5
- [static/js/widgets/usertools/editor/editor.js](../../static/js/widgets/usertools/editor/editor.js) — followGraph/graphTarget, graph.open listener, part 5
- [library/registry/widgets.json](../../library/registry/widgets.json) — graph_cards row
- [static/matrix.html](../../static/matrix.html) — script tags: graph-core.js, mermaid-frame.js, cards.js

STRAY FILES
- none

GOALS DONE
- Part 1 vendor — five files copied, import lines confirmed relative, node --check clean on all five.
- Part 2 graph-core.js — MX.graphCore/graphLoad/graphDrop/graphFilters/graphFiltersDefaults/graphKindClass/graphOptionControls/graphMirrors.
- Part 3 mermaid-frame.js — MX.mermaidFrame(host, opts), set/clear/el, copy+collapse, six kind-color CSS vars.
- Part 4 cards.js — graph_cards widget: search+hits (search.ts ported), tabs (tabs.ts ported), card (card.ts ported, monaco cut), graphMirrors wiring, fourth graph.open mirror.
- Part 5 editor.js — followGraph/graphTarget options, graph.open listener (reveal on file arrival or at once for an open tab), off() in unmount.
- node --check clean on every JS file touched (vendored as ES modules, the rest as classic scripts).

PICKS I MADE
- graph.filters payload = the Filters-class fields only (FILTER_FIELDS), not "the whole options object minus target" — contract 2.6's own wording ("filters is the options object minus target") reads broader than cards.js's own part-4 line ("every filter key ... emit filters"). Went with the narrower reading since the channel is named graph.filters and selectedIds/focusedId already have their own channel. Flagging for 2B/2C/2D and Brandon — if 2.6 meant the broad reading, this needs a one-line widen in graph-core.js/cards.js both.
- mirror.js's targetKey change is generic, not editor-only: `if (frame.options[targetKey] && payload.target !== frame.options[targetKey]) return;` — this also changes the *default* "target" key's behavior: a widget with target "" now follows every target's mirror traffic instead of matching only other blank-target widgets. Spec only asked for this for the editor's graphTarget; I made it the one shared line rather than special-casing "target" vs other keys. If that default-target widening is unwanted for graph/canvas widgets, it's a one-line revert (guard the widen to `targetKey !== "target"`).
- MX.graphFiltersDefaults() hardcodes filters.js's constructor defaults as a plain object rather than instantiating `new Filters()`, because a widget's `defaults` object must be synchronous and the vendored class only resolves after MX.graphCore()'s import(). Two sources of truth for those 21 values now (vendor Filters ctor + graph-core.js's FILTER_DEFAULTS) — drift risk if filters.js is ever revendored with new defaults.
- Six kind colors (--mx-kind-file etc.) are my own six hues — map.js's compiled output sets no inline colors for kind classes (grep came up empty), so there was nothing to copy.
- cards.js keeps its own FILTER_FIELDS list (duplicate of graph-core.js's private one) since graph-core.js doesn't export it — noted in a comment, not hidden.
- mirror apply callbacks (applySelect/applyFilters in cards.js) mutate frame.options directly and call MX.grid.save() themselves, bypassing frame.setOption — going through setOption/onOption here would re-emit the same mirror channel and ping-pong between instances on one target. Local user actions (clicks, checkboxes) go through setOption as normal; onOption is where the emit happens, and it is never reached by the mirror's own apply path.
- Not verified live in a browser — the rule against starting/stopping the server means the "Done when" console checks (MX.graphCore() in the console, etc.) are unrun. Everything below is node --check and static read-through only.

CORE API — static/js/widgets/graph/shared/graph-core.js
- MX.graphCore() -> Promise<{loadGraph, Index, EXPECTED_SCHEMA_VERSION, Filters, GUESS, reachFrom, chainText, CHAIN_CAP, planeLayout, fileLayout, zoomLayout, makeProjection, HOME_YAW, HOME_PITCH, MapView}> — memoized via MX.moduleReady("wayfinder", ...).
- MX.graphLoad(target: string) -> Promise<Index> — memoized per target; rejects if target is falsy.
- MX.graphDrop(target: string) -> void — clears one target's memo.
- MX.graphFiltersDefaults() -> plain object, the 21 Filters fields at their constructor defaults. Synchronous.
- MX.graphFilters(options: object) -> Promise<Filters> — new Filters() with each of the 21 fields copied from options when present.
- MX.graphKindClass(node: {kind?: string}) -> string — `kind-${node.kind}`.
- MX.graphOptionControls() -> {target: {...}, guesses: {kind:"select", values:() => ["on","flag","off"]}}.
- MX.graphMirrors(frame, handlers: {select?, filters?, reach?}) -> {select, filters, reach, off()} — three MX.mirror() calls on graph.select/graph.filters/graph.reach.

CORE API — static/js/widgets/graph/shared/mermaid-frame.js
- MX.mermaidFrame(host: Element, opts: {collapsed?: boolean}) -> {set(index, ids, deep) -> Promise<void>, clear() -> void, el: Element}.
- set() dedupes lines by their plain-text form across all ids; each line is a div of kind-classed spans joined by " --> ", capped at CHAIN_CAP names then " --> ...".
- Copy button writes the deduped plain-text lines (one per line) to the clipboard, flashes 300ms.
- Collapse state on el.dataset.collapsed ("true"/"false"), read by the owning widget for its own mermaidCollapsed option.

Mirror.js contract addition: MX.mirror(frame, channel, apply, targetKey = "target"). See PICKS above for the default-key behavior change this brings.

Cards' openInEditor / editor's followGraph: both default off, so the coupling exists only when both are on (cards emits graph.open only when openInEditor is true and the shown node has a path and isn't synthetic; editor's mirror.apply no-ops unless frame.options.followGraph is true). With only one side on, nothing happens on the other end — no error, no partial state.

BRANDON'S TODOS
- none

CLOSER REVIEW
- Rule on token spend vs the 180K cap: all five parts finished, no handoff needed — closer: confirm and file.
- graph.filters payload width (narrow vs contract 2.6's literal wording) — closer/Brandon: rule on it before 2B/2C/2D build against it.
- mirror.js targetKey default-key behavior change (empty target now follows everything) — closer/Brandon: rule on it; it's a one-line revert either way.
