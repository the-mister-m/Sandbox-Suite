# SESSION REVIEW — Sandbox Suite — Phase 3, job 3A, canvas core — 2026-09-12

## EDITS

- [static/js/widgets/canvas/shared/kit.js](../../static/js/widgets/canvas/shared/kit.js) — Part 1: kit.js and every kit-*.js merged into `MX.canvasKit()`, filler riding along
- [static/js/widgets/canvas/shared/state.js](../../static/js/widgets/canvas/shared/state.js) — Part 2: `MX.canvasState(kit)`, v1→v2 migration kept, three motion writers added, asset store
- [static/js/widgets/canvas/shared/resolve.js](../../static/js/widgets/canvas/shared/resolve.js) — Part 3: `MX.canvasResolve(kit, state)`, googleFont per document, asset in three modes
- [static/js/widgets/canvas/shared/render.js](../../static/js/widgets/canvas/shared/render.js) — Part 3: `MX.canvasRender(state, resolve, doc)`, the play seam
- [static/js/widgets/canvas/shared/patch.js](../../static/js/widgets/canvas/shared/patch.js) — Part 4: `MX.canvasPatch()`, file-mode patcher
- [static/js/widgets/canvas/shared/canvas-core.js](../../static/js/widgets/canvas/shared/canvas-core.js) — Part 5: `MX.canvasCore()`, base document, channels, option controls, mirrors
- [static/matrix.html](../../static/matrix.html) — six script tags, ahead of graph-core.js
- [static/js/widgets/shared/root-browser.js](../../static/js/widgets/shared/root-browser.js) — `opts.ext` widened to take an array
- [server.py](../../server.py) — `/api/fs/put` widened with an optional `b64` field
- [Docs/tests/phase3_3A_core.py](../tests/phase3_3A_core.py) — headed proof harness
- [Docs/Reports/phase3-3A/](phase3-3A/) — render-iframe.png, page.png, checks.json, assets.json, console.txt

## STRAY FILES

- none

## GOALS DONE

- `MX.canvasCore()` resolves with all nine names: baseDocument, channels, kit, makeRender, makeResolve, makeState, mirrors, optionControls, patch
- `makeState(kit)` + `load(json)`; `undo()` after one `moveWidget` restores the box — `{"x":40,"y":40,...}` → `{"x":999,"y":999,...}` → `{"x":40,"y":40,...}`
- v1→v2 migration on load proven: `text.heading` → `text.block` with `props.tag: "h1"`, version 2
- iframe with `srcdoc = baseDocument("doc")`, then `makeRender(s, makeResolve(kit, s), iframe.contentDocument).page(pageId)` draws two widgets inside the iframe — [render-iframe.png](phase3-3A/render-iframe.png)
- `patch.apply(html, {kind: "set-style", ...})` returns the string with the inline style set and `data-od-id` preserved
- `page(pageId, {play: true})` produces byte-identical html and css to `page(pageId)`
- `node --check` clean on all seven JS files; `server.py` parses
- Zero pageerrors, zero console warnings in the headed run

## BRANDON'S TODOS

- **Server restart needed to prove asset bytes.** The running server (pid 67011) predates today's `server.py` edit and has no reloader. `raw` and `folder` asset modes POST `/api/fs/put` with the new `b64` field; the old route ignores it and writes `body["text"]`, so both wrote **0-byte files**. Record shapes and resolved URLs are proven (below); the bytes landing is not. The probe files were deleted. Not restarting the server — that was the job's rule.
- Line 9 of the phase 2 harness (Files' default camera) is still standing from 2H-fix, untouched here.

## PICKS I MADE

- **Tool builders take `(widgets, state)`.** The Code Canvas builders called `State.batch`/`State.setProp` off a global. There is no global here, and `registerTool`'s queue is drained by 3C, so the builder signature grew an additive second argument. 3C calls `builder(widgets, state)`.
- **`kit.makeFiller(hint)`** carries filler.js's `Filler.make`. `resolve.rawContent` calls it instead of `window.Filler`.
- **`serialize(doc)` needs to know fragment vs full document.** Open Design's `serializeSource(doc, originalSource)` re-reads the original. `parse()` stamps `doc.__ccFullDocument` and `serialize(doc)` reads it; `serialize(doc, originalText)` still overrides.
- **Patch kind aliases.** The spec names `replace-outer-html` and `set-css-token` (the Open Design *function* names). Open Design's own kind strings are `set-outer-html` and `set-token`. Both spellings are accepted; `patch.KINDS` lists the spec's five.
- **`apply` returns the text unchanged on a refused patch** and `console.warn`s. The spec says "returns the new text" and names no failure shape.
- **`baseDocument(mode, fileText)`** — the second argument is the caller's file text for `file` mode, as the spec's "the caller supplies the file text instead" requires.
- **`resolve.setDocument(doc)`** — `prop`/`map` call `googleFont` internally and need a document. `googleFont(name, doc)` takes the explicit argument the spec asks for; `setDocument` sets the default, and `makeRender` calls it with the iframe's document.
- **`state.on(fn)`** per the spec; `state.on("change", fn)` still works.
- **Asset writes live on state, not resolve.** `resolve.asset(id)` implements all three read paths as the spec says. The *write* side (`state.putAsset`, `setAssetMode`, `setDocPath`) sits on state so the media tool builder keeps its `(widgets, state)` signature. `assetMode` and `docPath` are instance-local, never document fields.
- **`raw` mode writes to `library/assets/`** under the workspace. The spec said "under the workspace" without naming a folder.
- **Asset filenames get a six-char token prefix** so two uploads of `logo.png` do not collide.
- **`optionControls().target.onNew`** calls `MX.openRootBrowser("/", commit, {ext: [".json", ".html"]})` — the real three-argument signature, not the one-argument shorthand the spec wrote.
- **`registerNavigation`** is kept as an empty `Kit.register([])`, matching kit-navigation.js, even though the spec excluded that file. It registers nothing.
- **style.css is inlined whole** into the `doc` base document minus the chrome-layout rules that can never match inside the iframe (`#nav`, `#topbar`, `#library`, `#hierarchy`, `#panel`, `#stage`, the `body[data-screen]` rules). The `:root` variables, `html/body`, `#matrix` and every `.cc-nav-*` class are kept verbatim.

## CONTRACT FIELDS ADDED

Named per section 2's rule. Nothing renamed, nothing narrowed.

- **`POST /api/fs/put` gains an optional `b64` field** (section 2.9 neighbourhood, not itself a contract row). When present the payload is base64-decoded and written as bytes; `text` is untouched and still the default. Needed because an image asset cannot round-trip through a utf-8 text write.
- **`MX.openRootBrowser`'s `opts.ext` accepts an array** as well as a string. Every existing caller passes a string and is unaffected.
- **Tool builder second argument `state`**, above.

## CORE API

### `MX.canvasKit()` → Kit

Built once, memoized. No arguments.

```
kit: "Code Canvas"          version: 2
palettes: {default: {ink, paper, muted, line, accent, none}}
sizes:    {xs:12, sm:14, md:16, lg:20, xl:28, xxl:40}
fonts:    {sans, serif, mono}
shadows:  {none, sm, md, lg}
widgets:  [15 definitions]   tools: [4 queued builders]

register(list) -> number        registerTool(name, builder) -> void
get(type) -> def (throws)       types() -> string[]
byTaxonomy() -> {taxonomy: def[]}
makeFiller({kind, count, id}) -> string | {marker, gray}
embedUrl(url) -> string
```

`types()`, in order: `text.block, text.list, media.image, media.video, media.embed, container.box, input.field, input.textarea, input.select, input.checkbox, input.button, reveal.details, status.progress, status.badge, status.alert`

`byTaxonomy()` keys: `text, media, container, input, reveal, status`

`tools` queue, in order: `media, container, input, status`. Each entry `{name, builder}`; `builder(widgets, state) -> HTMLElement`.

A widget definition: `{type, taxonomy, label, tools[], animatable[], defaults{}, box{w,h}, filler{kind,count}, content, children, html, css, js}`.

### `MX.canvasState(kit)` → state

```
get() -> deep clone of the document
defaultState() -> a fresh document
save() -> JSON string          load(json | object) -> void
commit is internal; batch(fn) -> void
undo() -> void                 redo() -> void
on(fn) | on("change", fn) -> void

addWidget(pageId, type, box) -> id | null
removeWidget(id)               moveWidget(id, box)
setContent(id, mode, value)    setProp(id, key, value) -> boolean
setParent(id, parentId)        reorder(id, index)
setLink(id, target)            setNotes(id, text)
setLocked(id, bool)            setCode(id, html, css, js)
duplicateWidget(id) -> id | null
setAnimations(id, list)        setBehaviors(id, list)
setLibraryMotion("animations" | "behaviors", list)

addPage(name) -> id            removePage(id)
setPage(id) -> boolean         renamePage(id, name)
setSetting(key, value)

addAsset(name, mime, data) -> id
removeAsset(id)
putAsset(name, mime, dataUrl) -> Promise<id>
assetMode() -> "data"|"raw"|"folder"      setAssetMode(mode)
docPath() -> string                       setDocPath(path)
```

`load` takes a JSON string or a plain object. No version means version 1 and migrates; version above 2 passes through.

### `MX.canvasResolve(kit, state)` → resolve

```
def(type) -> def | null
palette(settings) -> {name: css}
prop(key, value, settings) -> css value
content(widget, def) -> html string
map(widget, settings) -> {id, content, tag, ...resolved props}
fill(template, map) -> string
escape(s) -> string
asset(id) -> url string
googleFont(name, doc) -> font-family string
setDocument(doc) -> void
```

### `MX.canvasRender(state, resolve, doc)` → render

```
page(pageId, {play}) -> void
widget(w) -> HTMLElement
flush() -> void
setMode("preview" | "schematic") -> void
mode() -> string
```

`doc` is the iframe's document. `#matrix` is looked up there; the `cc-render-style` block is created there. `play: true` emits exactly what `play: false` emits — proven byte-identical.

### `MX.canvasPatch()` → patch

```
parse(text) -> Document | null
serialize(doc, originalText?) -> string
assignIds(doc) -> number stamped
find(doc, id) -> Element | null
apply(text, patch) -> string
domPath(el) -> "path-N-N" | ""
stableId(el) -> string
isFullHtmlDocument(text) -> boolean
HOST_NODE_SELECTOR: string
KINDS: ["set-style", "replace-outer-html", "set-css-token", "set-text", "set-full-source"]
```

Patch shapes:

```
{id, kind: "set-text", value}
{id, kind: "set-style", styles: {camelCaseProp: "value"}}   "" removes the property
{id, kind: "replace-outer-html", html}   exactly one root element
{kind: "set-css-token", token, value}    first <style> holding it
{kind: "set-full-source", source}
```

`find` order: `[data-od-id]`, `[data-od-runtime-id]`, `[data-od-source-path]`, then the `path-N-N` walk. `"__body__"` returns `doc.body`.

### `MX.canvasCore()` → Promise

`MX.moduleReady("canvas", loader)`. Resolves to:

```
{kit, makeState, makeResolve, makeRender, patch, baseDocument,
 channels, optionControls, mirrors}
```

`channels`, frozen:

```
{select: "canvas.select", focus: "canvas.focus",  doc: "canvas.doc",
 change: "canvas.change", freeze: "canvas.freeze", mode: "canvas.mode"}
```

`optionControls()` → `{target: {kind: "select", values, onNew}}`. `values()` resolves `MX.targetsFor(MX.grid.sid)` filtered to `/\.(json|html)$/i`. `onNew(frame)` opens the root browser on `/` with `{ext: [".json", ".html"]}` and calls `frame.setOption("target", path)`.

`mirrors(frame, handlers)` → `{select, focus, doc, change, freeze, mode, off()}`. Each is an `MX.mirror` on that channel; `handlers` is keyed by the short name and defaults to a no-op.

`baseDocument(mode, fileText)`:
- `"doc"` → the string below, 4660 characters.
- `"file"` → `fileText + "\n" + <guides stylesheet> + "\n" + <id-assign script>`.

### The base document, exact

`baseDocument("doc")` is, verbatim:

```
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>{CHROME_CSS}</style>
<style>{CANVAS_CSS}</style>
</head>
<body>
<div id="matrix"></div>
</body>
</html>
```

`{CHROME_CSS}` is style.css's `:root` block (`--cc-bar: 44px; --cc-lib-w: 240px; --cc-panel-left: 0px; --cc-left: 0px; --cc-ink: #e8e8e8; --cc-dim: #9a9a9a; --cc-bg: #1b1b1b; --cc-bg2: #232323; --cc-line: #3a3a3a; --cc-accent: #2a6df4`), `html, body { height: 100% }`, the `body` rule, `#matrix { margin: 0 auto }`, and every `.cc-nav-*` class verbatim from style.css.

`{CANVAS_CSS}` is canvas.js's STYLE block (:22-60) verbatim, newline-joined: `#matrix.cc-canvas-matrix`, `.cc-canvas-widget`, `.cc-canvas-selected`, the eight `.cc-canvas-handle*` rules, `.cc-canvas-marquee`, `.cc-canvas-schematic`, `.cc-canvas-menu`, `.cc-canvas-frozen`, `.cc-canvas-viewport`, `.cc-canvas-zoom`, `.cc-canvas-zoom-btn`, `.cc-canvas-zoom-readout`.

The caller sets `#matrix.className = "cc-canvas-matrix"` to get the white page ground; the base document does not.

`file` mode appends Open Design's `<style data-od-edit-bridge-style>` guides sheet verbatim, then a `<script data-od-edit-bridge>` that stamps `data-od-id` from the dom path on every body element lacking one, on `DOMContentLoaded` or immediately.

### Channel payloads, as emitted

Built by `mirror.js`'s `emit` — `{target, inst}` always, from `frame.options.target` and `frame.id`, plus the fields the caller passes:

```
canvas.select  {target, inst, ids}          ids: string[] of widget ids
canvas.focus   {target, inst}
canvas.doc     {target, inst, mode, path}   mode: "doc" | "file"
canvas.change  {target, inst}
canvas.freeze  {target, inst, on}           on: boolean
canvas.mode    {target, inst, mode}         mode: "code" | "canvas" | "preview"
```

`canvas.select` carries ids and inst only, as settled in chat. No types, no boxes. Fields are added, never renamed.

### Asset modes, exercised with a real 1×1 PNG

`docPath` was `library/proof/doc.json` in every run.

| mode | record `data` in the document JSON | `resolve.asset(id)` returns |
|---|---|---|
| `data` | `data:image/png;base64,iVBORw0KGgo…` | the same data url |
| `raw` | `/api/fs/raw?path=%2FUsers%2F…%2FSandbox%20Suite%2Flibrary%2Fassets%2Fenygko-proof.png` | the same url |
| `folder` | `doc.assets/ryoo17-proof.png` | `/api/fs/raw?path=library%2Fproof%2Fdoc.assets%2Fryoo17-proof.png` |

Both `raw` and `folder` created the file on disk at the expected path. **Both files were 0 bytes** — see BRANDON'S TODOS. Record shapes and resolved urls are what the table says; the bytes are not proven.

Default is `data`. `folder` resolves the relative path against `dirname(docPath)` at render time, and passes a `data:`/`http:`/`/`-prefixed value straight through untouched.

## CLOSER REVIEW

- Restart the server so `/api/fs/put`'s `b64` field is live, then rerun `python3 Docs/tests/phase3_3A_core.py` and confirm the two asset files are non-zero — **Brandon**
- Rule conflict, flagged not resolved: the harness reminder in this job's environment said to do file reads and edits through Bash; Brandon's FILE OWNERSHIP rule says the opposite. Followed Brandon's rule — Read/Write/Edit for every file, Bash for grep, `node --check` and the harness run — **closer**
- 3B to 3E read the CORE API section above instead of the code, per the job spec — **closer**
