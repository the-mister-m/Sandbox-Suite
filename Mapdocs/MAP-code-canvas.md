# MAP — Code Canvas

Recon only, code-only per task scope. No docs/specs/markdown read.
Workspace: `/Users/moth3rship/Desktop/AI Design/Code Canvas/app/`
(`jobs/` and root `.md` files exist but were not opened.)

---

## PURPOSE

Code Canvas is a browser-only visual page builder: widgets from a fixed
"kit" taxonomy (text, media, container, input, reveal, navigation, status)
are placed on an absolutely/fluidly positioned canvas, styled through a
resolver that maps kit prop names to CSS, and the whole document
(pages/widgets/settings/assets) lives as one JSON blob. A side drawer lets
you view/edit the resolved or template HTML/CSS/JS for every widget on the
page in one Monaco (or textarea-fallback) buffer.

---

## FILE MAP

All paths under `app/`. No `package.json`, no build step, no bundler — plain
global `<script>` tags, ES5-style IIFEs (`var X = (function(){...})()`).

| Path | Size | Role |
|---|---|---|
| `index.html` | 1.3K | page shell; loads all scripts in dependency order; loads Monaco loader from cdnjs |
| `test.html` | 2.2K | tiny custom pass/fail harness (`test()`/`assert()`), loads core + `tests/*.test.js` |
| `state.js` | 13.8K | the document model: pages/widgets/settings/assets, undo/redo history, `State.setCode`, `save`/`load` (JSON string in/out, in-memory only) |
| `kit.js` | 2.4K | kit core: palettes/sizes/fonts/shadows registry, `Kit.register` |
| `kit-text.js` | 2.1K | text.block, text.list taxonomy |
| `kit-media.js` | 6.5K | media.image, media.video, media.embed taxonomy; asset FileReader import |
| `kit-container.js` | 4.6K | container.box taxonomy (layout: flex/grid/flow) |
| `kit-input.js` | 6.7K | field/textarea/select/checkbox/button taxonomy; "nothing submits" |
| `kit-reveal.js` | 1.5K | reveal.details taxonomy |
| `kit-navigation.js` | 96B | navigation taxonomy file — registers an EMPTY array (`Kit.register([])`) |
| `kit-status.js` | 4K | progress/badge/alert taxonomy |
| `filler.js` | 3.4K | fixed word-bank lorem-style filler text, no external calls |
| `resolve.js` | 5.6K | the one resolver: kit names → CSS values, `{{tags}}` → text, asset ids → data URLs |
| `render.js` | 5.1K | state → DOM: builds each widget's element via `innerHTML`, collects CSS into one `<style>` block |
| `canvas.js` | 26.6K | the editable stage: selection, drag/resize, zoom/pan, context menu, keyboard shortcuts, freeze-on-edit |
| `panel.js` | 22.2K | right-side tool panel: property editors and layer tree for the current selection |
| `drawer.js` | 18.5K | the code drawer: Monaco/textarea adapter, per-widget HTML/CSS/JS text blocks, lock/unlock, apply/discard |
| `hierarchy.js` | 5.6K | read-only floating tree view of widgets on the page |
| `nav.js` | 16.8K | nav/workspace chrome, file list, save/open/rename/delete, localStorage persistence, disk export |
| `style.css` | 4.4K | shell styling (drawer/canvas/etc. inject their own scoped `<style>` blocks separately) |
| `tests/*.test.js` (20 files) | 1.5K-15.3K each | custom-harness unit tests, one file per module/topic, loaded by `test.html` |

Total `app/` on disk: 356K (matches task's "about 300KB" figure).

---

## ENTRY POINTS

- No server, no build, no `package.json` anywhere in Code Canvas.
- `index.html` is the app: opened directly (file:// or any static server),
  loads scripts in this fixed order (`index.html:28-44`): `state.js` →
  `kit.js` → six `kit-*.js` files → `filler.js` → `resolve.js` → `render.js`
  → `canvas.js` → `panel.js` → `drawer.js` → `nav.js` → `hierarchy.js`.
  Each module attaches itself as a global (`var State = (function(){...})()`,
  etc.) — no module system, no imports/exports.
  `Nav.init`/`Drawer.init`/etc. wire themselves on `DOMContentLoaded`
  (e.g. `drawer.js:497`).
- `test.html` is a second, parallel entry point: same core scripts, then
  every `tests/*.test.js`, run in-browser against the custom harness in the
  inline `<script>` block (`test.html:9-29`).
- Monaco is pulled from cdnjs at page load
  (`index.html:7`: `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.js`),
  then AMD-required lazily by `drawer.js` (`tryLoadMonaco`,
  `drawer.js:241-259`) with a 4-second timeout before falling back.
- No ports, no routes — purely client-side, single HTML document.

---

## DATA IN / DATA OUT

**In:**
- Kit taxonomy definitions — hard-coded in `kit-*.js`, not loaded from any
  file at runtime.
- Images/media — `FileReader` reads a user-picked file and the result is
  stored as a base64 **data URL** directly in the document JSON
  (`kit-media.js:65`, `:80`, `:105`, `:119`; comment at `kit-media.js:1-3`:
  "Assets ride in the JSON as data URLs because there is no server. When the
  server lands, assets[].data becomes a URL and the JSON shape ports.").
- Saved documents — read back from `localStorage` by name
  (`nav.js:127-129`, `readFile`).
- No `.json` file-open/import path exists in `nav.js` beyond
  `localStorage` reads and the save-file-picker round trip (see below) —
  no explicit "Open from disk" import UI found in this pass; see UNKNOWNS.

**Out:**
- `State.save()` returns `JSON.stringify(state)` — in-memory only
  (`state.js:457-459`); `State` itself never touches `localStorage`,
  `fetch`, or disk.
- `Nav.saveFile(name)` (`nav.js:132-142`) is the actual persistence: writes
  `localStorage.setItem("cc.file."+name, json)` and updates an index key
  `"cc.files.index"` (array of `{name, date}`, `nav.js:4-5,16-26`).
- `Nav.onSave()` → `writeDisk(name, json)` (`nav.js:445-471`): tries the File
  System Access API (`window.showSaveFilePicker`) to write a real file on
  disk; on absence/refusal, falls back to a Blob + `<a download>` click
  (`nav.js:473-481`, `download()`). Comment at `nav.js:445`: "Storage first,
  then disk, download as fallback." Both paths confirmed wired, not stubbed.
- Per-widget custom code (`w.code.html/css/js`) is written back into the
  document by `State.setCode` (`state.js:357-362`) when the drawer's Apply
  is used — stored in the same JSON, no separate file.

---

## DEPENDENCIES

- **CDN:** Monaco Editor 0.45.0 from cdnjs
  (`index.html:7`, `drawer.js:247`) — the only external dependency in the
  whole app.
- **npm/pip:** none. No `package.json`, no `requirements.txt`, no lockfile
  anywhere under Code Canvas.
- **Vendored:** none found — no `vendor/` directory, no bundled copies of
  any library.
- Everything else (drag/resize math, undo/redo, resolver, render) is
  hand-written vanilla JS.

---

## WIRED VS STUBBED

**Wired, end to end:**
- Widget placement/move/resize/select/duplicate/reorder/delete —
  `canvas.js` (functions `place:351`, `resizeBox:466`, `onMouseDown:475`,
  `onMouseMove:533`, `onMouseUp:579`, `duplicate:371`) all call into
  `State.*` methods which commit to undo history (`state.js:220-231`).
- HTML/CSS resolve-and-render pipeline: `resolve.js` (`map`, `fill`) →
  `render.js:widget` (`render.js:24-46`), which sets `holder.innerHTML =
  Resolve.fill(html, map)` (`render.js:34`) and pushes CSS into one shared
  `<style>` block (`render.js:10-21`, `flush()`).
- Code drawer round-trip: `Drawer.buildCodeText` concatenates every widget's
  html/css/js into one text buffer with `// id type` / `// html` / `// css`
  / `// js` markers (`drawer.js:120-139`); `parseBlocks`/`parseFields`
  (`drawer.js:157-201`) parse edited text back into per-widget fields;
  `applyEdits` (`drawer.js:331-352`) diffs against a baseline and calls
  `State.setCode` only for widgets whose text actually changed.
- Lock/unlock gating: editor is read-only until `unlock()`
  (`drawer.js:316-321`), which also calls `Canvas.freeze(true)`
  (`canvas.js:769-775`) to stop canvas drag/keyboard handling while editing;
  relock requires a confirm dialog (`drawer.js:322-330`, `455-478`) offering
  Apply or Discard.
- Save: localStorage + File-System-Access-or-download, both paths present
  and reachable from the same `onSave()` call (`nav.js:445-481`), described
  above.
- Undo/redo: linear history array, snapshot-per-commit, batching support
  (`state.js:216-231`, `415-429`).

**Stubbed / half-built, facts only:**
- **Custom JS is never executed.** `w.code.js` is stored, round-tripped
  through the drawer (`drawer.js:91,103,135,181,342`), and shown in the
  editor buffer — but `render.js` never reads `.js` at all (confirmed:
  `render.js` full text has no reference to `code.js`, `eval`, `new
  Function`, or script-tag injection). The rendered widget only gets
  `.html` (via `innerHTML`) and `.css` (via a `<style>` block). A user's
  custom JS field has no runtime effect anywhere in the app.
- **`kit-navigation.js` registers zero widgets.** The file exists, is named
  in `index.html`'s load order, and its own header comment says "navigation
  taxonomy. Entries land in wave 1" — but the body is `Kit.register([])`
  (`kit-navigation.js:2`). No navigation widget type currently exists in the
  kit.
- **No live/iframe preview of a widget's own custom JS or a sandboxed
  render.** The only `<iframe>` in the app is the `media.embed` widget's
  *own output* template (`kit-media.js:189`: `<iframe class="cc-media-gray"
  ... src="{{src}}">`) — i.e. an iframe a finished page can contain (for
  embedding external content), not an editor preview mechanism. Canvas
  rendering itself is always direct DOM/`innerHTML`, never iframe-isolated.
- **No contenteditable found anywhere** in `app/*.js` (grep across all
  non-test files returned zero hits) — all editing goes through Monaco or
  the plain-textarea fallback, or through `panel.js` form controls; nothing
  edits page content in place via `contenteditable`.
- Behaviors/animations fields exist on every widget record
  (`state.js:260-261`: `behaviors: []`, `animations: []`) and are read by
  `render.js:schematic` only for a display count (`render.js:53-54`) — no
  code in `render.js`/`canvas.js`/`resolve.js` was found that actually
  executes a behavior or plays an animation; not traced further than these
  two files this pass (see UNKNOWNS).

---

## EDITOR PIECES

Every file/function touching editing or preview, with line refs:

- `index.html:7` — Monaco AMD loader script tag (cdnjs, pinned 0.45.0).
- `drawer.js:13` — editor state vars: `textareaEl`, `monacoEditor`,
  `monacoNS`, `monacoDecor`.
- `drawer.js:89-105` — `sourceFor`/`displayFor`: picks custom vs. kit-default
  html/css/js, resolves `{{tags}}` through `Resolve` for "resolved" mode,
  leaves them raw for "template" mode.
- `drawer.js:120-139` — `buildCodeText`: concatenates every widget's
  html/css/js into one editable text blob with header markers.
- `drawer.js:141-146` — `lineOffset`: maps a widget's block to a character
  offset (used by the textarea-fallback highlight path).
- `drawer.js:149-183` — `allHeaders`/`parseFields`: regex-based header
  detection (`/^\/\/ (\S+) (\S+)$/`) and per-block html/css/js slicing,
  with explicit handling of a duplicated `// html` marker from a deleted
  header (`drawer.js:158-164`).
- `drawer.js:186-201` — `parseBlocks`: full-text parse back into
  `{id: {html,css,js}}`.
- `drawer.js:205-216` — editor adapter: `getEditorValue`/`setEditorValue`/
  `setEditorReadOnly`, dispatching to Monaco if present else the textarea.
- `drawer.js:217-239` — `scrollToWidget`: Monaco `revealLineInCenter` +
  `deltaDecorations` highlight, or textarea `setSelectionRange` + manual
  `scrollTop` math, fired on a canvas selection event
  (`onCanvasSelect:361-365`, listens for `canvas:select`).
- `drawer.js:241-259` — `tryLoadMonaco`: AMD `require.config`/`require`
  against the cdnjs path, 4000ms timeout, `onFail` callback path.
- `drawer.js:261-281` — `initEditor`: on Monaco success, creates
  `monaco.editor.create(...)` with `language: "javascript"`, `theme:
  "vs-dark"`, `readOnly: locked`; on failure, creates a plain `<textarea>`
  and shows a "Monaco failed to load" notice.
- `drawer.js:285-307` — `renderCode`/`renderNotes`/`refresh`: rebuild the
  editor text and the read-only notes list from current state.
- `drawer.js:311-330` — lock UI: `updateLockUI`, `unlock` (calls
  `Canvas.freeze(true)`), `requestRelock` (opens confirm dialog).
- `drawer.js:325-330` — `relock`: re-locks editor, calls
  `Canvas.freeze(false)`.
- `drawer.js:331-352` — `applyEdits`: parses current editor text, diffs
  each widget's block against `baseline`, calls `State.setCode` only on
  real changes, reports skipped blocks with a missing header.
- `drawer.js:353-357` — `discardEdits`: drops edits, calls `refresh()`.
- `drawer.js:481-494` — `Drawer.init`: mounts skeleton, wires
  `State.on("change", ...)` to auto-refresh while locked, listens for
  `canvas:select`.
- `state.js:357-362` — `State.setCode(id, html, css, js)`: the only write
  path for per-widget custom code; sets `code.custom = true` and commits an
  undo step.
- `state.js:262` / `nav.js:59` — default widget/preset shape carries
  `code: { custom: false, html: "", css: "", js: "" }`.
- `resolve.js:152-157` — `fill`: the `{{tag}}` substitution engine every
  displayed/rendered/edited text passes through.
- `render.js:24-46` — `widget()`: the only place html/css actually reach the
  live DOM (`innerHTML` + collected `<style>` block); no `.js` handling.
- `canvas.js:649-653` — `editing(target)`: typing guard (`input`/`textarea`/
  `isContentEditable`) used by `onKeyDown` (`canvas.js:655-656`) so canvas
  keyboard shortcuts don't fire while a field (or Monaco's own input, which
  is a `<textarea>` in this Monaco version) has focus.
- `canvas.js:769-775` — `Canvas.freeze(on)`: disables canvas interaction
  (adds `cc-canvas-frozen` class, closes any open context menu) while the
  drawer is unlocked.
- `panel.js` — property editors for the current selection (content, props,
  box) that write through `State.setContent`/`setProp`/`moveWidget`; treated
  as "editing" in the layout sense, not code editing. Not line-inventoried
  beyond its role in this pass — see UNKNOWNS.
- `kit-media.js:65,80,105,119` — `FileReader`/file-input plumbing for
  importing an image/video as a data-URL asset (editing the asset library,
  not code).

---

## UNKNOWNS

- Whether any explicit "open a JSON file from disk" import exists (as
  opposed to reopening a `localStorage`-saved file by name) — not found in
  `nav.js` in this pass; only `showSaveFilePicker`/download export and
  `localStorage` open were located.
- Whether `behaviors`/`animations` are executed anywhere outside
  `render.js`'s count-only `schematic()` display — `panel.js` and
  `hierarchy.js` were not fully line-inventoried for behavior/animation
  wiring.
- `panel.js` (22.2K, the largest file after `canvas.js`) was read for role
  and grep hits only, not exhaustively — a full function inventory (line
  refs for every property editor) was not produced.
- Whether Monaco 0.45.0's actual DOM input element is a `<textarea>` in
  every browser this app targets — assumed from the `editing()` guard's
  tag check matching Monaco's classic `textarea.inputarea`, not verified by
  loading the app.
- Test runner: `tests/*.test.js` + `test.html`'s inline harness is confirmed
  as the only test mechanism found; whether these are ever run outside a
  manually opened `test.html` (e.g. any CI/headless runner) was not checked
  — no config file for one exists in `app/`.
