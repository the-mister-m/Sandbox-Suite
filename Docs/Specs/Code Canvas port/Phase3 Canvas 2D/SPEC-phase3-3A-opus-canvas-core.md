# SPEC — Phase 3 — 3A — Opus — canvas core

Written 2026-09-12. First job of phase 3. Starts after 2H is green.
Cap 180K. Builds the shared module every canvas widget stands on. No
widget in this job. Its receipt's CORE API section is what 3B to 3E
read instead of the code.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.7, 2.8, 2.10. Read those first. Then section
3's Code Canvas and Open Design blocks.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 150K used, if parts 1 to 5 are not done, stop. Write
  Docs/Handoffs/HANDOFF-phase3-3A.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase3-3A.md in the SESSION
  REVIEW shape with a PICKS I MADE section, plus a CORE API section:
  every export with its signature, the base document's exact
  contents, and the channel payloads as emitted. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/HOWTO-repipe.md — whole.
- static/js/widgets/graph/shared/graph-core.js — whole. The shape of
  a core module.
- Code Canvas root /Users/moth3rship/Desktop/AI Design/Code Canvas/app/:
  state.js whole 14K, resolve.js whole 5.7K, render.js whole 5.2K,
  kit.js whole 2.4K, every kit-*.js whole 26K, filler.js whole 3.5K,
  style.css whole 4.4K. About 61K.
- Open Design /Users/moth3rship/Downloads/open-design-main/apps/web/src/edit-mode/:
  source-patches.ts :109-286 and :592-734. bridge.ts :16-39 domPath
  and stableId only. types.ts :47-128. About 25K.
- static/js/widgets/shared/mirror.js — whole.

## Part 1. static/js/widgets/canvas/shared/kit.js

- Merge kit.js and every kit-*.js except kit-navigation.js into one
  file that exports `MX.canvasKit()` → the Kit object, built once,
  memoized. No globals. Keep every definition, taxonomy, tool list,
  animatable list, CSS template, and defaults exactly. filler.js
  rides along if the kit files need it.
- `registerTool` (kit.js :29-34) keeps its queue; 3C drains it.

## Part 2. static/js/widgets/canvas/shared/state.js

- `MX.canvasState(kit)` → an instance with the same API as state.js:
  defaultState, load, commit, batch, undo, redo, the widget record
  writers, setCode, assets, and `on(fn)` for change. No module-level
  state. The kit comes in, never read from window.
- Keep the v1→v2 migration on load (:28-63, :462-477).
- Add `setAnimations(id, list)`, `setBehaviors(id, list)`,
  `setLibraryMotion(kind, list)` as batched writers that store into
  the fields state.js already has (:260-261, :80). They write; nothing
  reads them yet. Phase 4 fills play.

## Part 3. static/js/widgets/canvas/shared/resolve.js and render.js

- `MX.canvasResolve(kit, state)` → the resolve functions. googleFont
  (:35-45) takes a document argument and injects the link into that
  document's head.
- `MX.canvasRender(state, resolve, doc)` → `{page(pageId, opts),
  widget(w), flush()}`. `doc` is the iframe's document; the style
  block cc-render-style lives there; `#matrix` is looked up there.
- `page(pageId, {play})`: `play` false or missing emits exactly what
  render.js :95-134 emits today. `play` true emits the same in phase
  3. The branch exists, is empty, and carries one comment: `play:
  phase 4 fills this`.

## Part 4. static/js/widgets/canvas/shared/patch.js

File-mode patcher, the slice of source-patches.ts:
- `MX.canvasPatch()` → `{parse(text), serialize(doc), assignIds(doc),
  find(doc, id), apply(text, patch)}`.
- parse and serialize from :235-255. assignIds walks the body and
  sets `data-od-id` from domPath (bridge.ts :16-27) on every element
  that lacks one. find uses the fallback chain :278-286 and :592-605.
- apply supports the patch kinds in types.ts :110-119 minus the
  brand-kit and runtime-override kinds: set-style (:657-663),
  replace-outer-html (:674-688), set-css-token (:703-713), set-text,
  and set-full-source. Returns the new text.
- Nothing from :5-92, :288-445, :454-530.

## Part 5. static/js/widgets/canvas/shared/canvas-core.js

- `MX.canvasCore()` → `MX.moduleReady("canvas", loader)` resolving
  to `{kit, makeState, makeResolve, makeRender, patch, baseDocument,
  channels, optionControls, mirrors}`.
- `baseDocument(mode)` → the srcdoc string: doctype, head with the
  cc- stylesheet from style.css and the canvas.js STYLE block (:22-60)
  inlined, body with `<div id="matrix"></div>`. For `file` mode the
  caller supplies the file text instead and only the guides
  stylesheet (bridge.ts :1297-1368, copied into this file as a
  string) and the id-assign script are appended.
- `channels` is the six names from section 2.7 as constants.
- `optionControls()` → `{target: MX.targetControl(listFn, onNew)}`
  where listFn returns `MX.targetsFor(sid)` filtered to values ending
  `.json` or `.html`, and onNew opens `MX.openRootBrowser({ext:
  [".json", ".html"]})` and sets `target` to the picked path.
- `mirrors(frame, handlers)` → mirrors on all six channels, returns
  them by name plus `off()`.
- Assets option, read by resolve: `assetMode` one of `data`, `raw`,
  `folder`. `data` keeps data URLs in the doc. `raw` stores the file
  under the workspace through `/api/fs/put` and the asset record's
  `data` becomes `/api/fs/raw?path=...`. `folder` stores next to the
  doc in `<docname>.assets/` and the record's `data` is a relative
  path resolved against the doc's folder at render time. Implement
  all three in `resolve.asset`; the widget chooses. Default `data`.

## SETTLED IN CHAT

`canvas.select` carries ids and inst only. Settled in chat so nothing
drifts when State changes. The other option is a rich payload with
types and boxes; add fields, never rename. Not a widget option.
Receipt: the exact payload as emitted.

Assets have three modes: data URL, fs/raw path, sibling folder.
Settled in chat: all three piped, `assetMode` is a widget option on
Canvas, default `data`. Receipt: which modes you exercised with a
real image and what each doc looked like after save.

## Done when

- `MX.canvasCore()` resolves in the console with every name.
- `const s = makeState(kit); s.load(<a Code Canvas JSON from the
  app's tests folder>)` works; `s.undo()` after one `moveWidget`
  restores the box.
- An iframe with `srcdoc = baseDocument("doc")`, then
  `makeRender(s, makeResolve(kit, s), iframe.contentDocument)
  .page(pageId)` draws the widgets inside the iframe. Screenshot in
  the receipt.
- `patch.apply(html, {kind: "set-style", ...})` on a small HTML string
  returns the string with the inline style set and the id preserved.
- `page(pageId, {play: true})` produces the same output as without.
- node --check clean. Receipt has the CORE API section with the base
  document text.
