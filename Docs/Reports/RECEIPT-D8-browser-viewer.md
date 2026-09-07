# RECEIPT — D8 — File Browser and Viewer

Job 8, Wave 4. Spec: [SPEC-D8-browser-viewer.md](../Specs/SPEC-D8-browser-viewer.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Read first: [RECEIPT-D1-settings.md](RECEIPT-D1-settings.md),
[RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md),
[RECEIPT-D4-suite-library.md](RECEIPT-D4-suite-library.md),
[RECEIPT-D5-matrix.md](RECEIPT-D5-matrix.md).
Transcript window: 2026-09-06 12:33 to 12:48 EDT.

## FOR JOB 6 AND JOB 7 — READ THIS

### Drag source (browser -> chat)

A file row is `draggable`. `dragstart` sets both
`e.dataTransfer.setData("text/plain", absolutePath)` and
`setData("application/x-mx-path", absolutePath)`, same value. Job 6's chat
already reads `text/plain`; nothing to change on that side.

### Read-only Monaco export

`static/js/widgets/shared/monaco-readonly.js` exposes, on `window.MX`:

    MX.mountReadonlyMonaco(host, { value, language, path }) -> Promise<{
      editor, setValue(text), setLanguage(lang), layout(), dispose()
    }>
    MX.monacoLanguageFromPath(path) -> Monaco language id

It lazy-loads the vendored AMD build under `/static/vendor/monaco` once
(memoized) and mounts `readOnly: true`, theme `vs-dark`. Job 7 built its
own separate (writable) Monaco loader in `editor.js` rather than importing
this — its call, noted under QUESTIONS.

### Open-in-editor contract (browser -> Job 7's editor)

Job 7's editor widget loads a file only through the existing `open` socket
frame while it is the module's own `_activeEditor` (focus-tracked, private
to `editor.js`). It does not read a `path` option. The browser's "Open in
Editor" therefore mounts an editor widget if none exists (mounting sets it
as `_activeEditor`) and sends `{type: "open", path}` — not `setOption`.
"Open in Viewer" does use `setOption("path", ...)`, since the viewer widget
here defines that contract itself.

## EDITS

### [static/js/widgets/shared/monaco-readonly.js](../../static/js/widgets/shared/monaco-readonly.js), new

One AMD load of `/static/vendor/monaco`, memoized. `MX.mountReadonlyMonaco`
and `MX.monacoLanguageFromPath`, both described above.

### [static/js/widgets/browser/browser.js](../../static/js/widgets/browser/browser.js), new

`MX.registerWidget("browser", {...})`.

- Root chosen via `window.showDirectoryPicker()` where available (the
  macOS browser directory picker), confirmed/typed into a path through
  `MX.ui.prompt` — see QUESTIONS 1. No default root anywhere.
- Tree built from the existing `tree` socket frame. Every request this
  instance sends carries `tag: frame.id`; every reply is dropped unless
  its `data.tag` matches, so two open browser widgets never read each
  other's tree replies (see QUESTIONS 2).
- Every file row's size loads lazily from `GET /api/fs/stat`, cached per
  path for the life of the instance.
- Right click: Duplicate (`POST /api/fs/duplicate`), Rename (existing
  `rename` frame), Show in Finder (`POST /api/fs/reveal`), and, files
  only, Open in Editor / Open in Viewer.
- Subscribes to `tree`, `saved`, `deleted`, `moved`, `renamed`, `made`,
  `tree_dirty`; any of the last six refreshes every loaded directory.
- `defaults: {}` — no registry rows for `browser` (`WIDGET_ROWS["browser"]`
  is empty), and nothing here needs a persisted option.

### [static/js/widgets/viewer/viewer.js](../../static/js/widgets/viewer/viewer.js), new

`MX.registerWidget("viewer", {...})`. `defaults: { path: "" }`.

- Path arrives through the `path` option (browser's Open in Viewer,
  the generic per-instance options panel, or the widget's own path
  field + Open button) and is dispatched by extension:
  - image/vector -> `<img src="/api/fs/raw?path=...">`
  - pdf -> `<embed type="application/pdf" src=.../>`
  - audio/video -> `<audio>`/`<video controls src=.../>`
  - html -> sandboxed `<iframe>`, `srcdoc` from `GET /api/fs/read`,
    same sandbox string the old preview pane used
  - markdown -> `marked` (cdnjs, pinned, or the page's already-loaded
    global if Job 6's script tag is present) into `innerHTML`, run
    through `window.DOMPurify` when present (Job 6 also loads it)
  - mermaid -> `mermaid` (cdnjs, pinned), `.render()` into an SVG
  - csv -> hand-rolled quoted-field parser, drawn as a `<table>`
  - json -> pretty-printed (`JSON.stringify(..., null, 2)`) through
    `MX.mountReadonlyMonaco`
  - anything else (code, plain text) -> `MX.mountReadonlyMonaco` with
    the language guessed from the extension
- A `stale()` guard on each render's own sequence number drops a late
  fetch if the path changed again before it landed.

### [server.py](../../server.py) — lines 1432 to 1493, one labeled block

Inserted after Job 4's `/api/fs/write` (line 1429), before
`agent_respond_safe`. Nothing already in the file was reordered,
reformatted, or renamed.

- line 1435 `api_fs_stat` — `GET /api/fs/stat?path=` — `{size, isDir}`,
  404 on a missing path. Named under QUESTIONS 3: not in the spec's
  named lane, added to satisfy Part 1's "every row shows file size."
- line 1445 `api_fs_raw` — `GET /api/fs/raw?path=` — streams the file with
  a guessed mimetype, `conditional=True` for audio/video range requests.
  Named under QUESTIONS 4: also not in the spec's named lane, added
  because the existing `open` frame only returns UTF-8 text (and a
  placeholder string for images), and the viewer's render list requires
  actual bytes for images, PDF, audio, and video.
- line 1455 `_duplicate_name` — "name copy.ext", "name copy 2.ext", ...
- line 1466 `api_fs_duplicate` — `POST /api/fs/duplicate` — copies a file
  (`shutil.copy2`) or a directory (`shutil.copytree`), 404 on a missing
  source.
- line 1484 `api_fs_reveal` — `POST /api/fs/reveal` — `subprocess.Popen(["open", "-R", path])`,
  404 on a missing path.

### [static/matrix.html](../../static/matrix.html)

Three `<script>` lines added before `main.js`: `shared/monaco-readonly.js`,
`widgets/browser/browser.js`, `widgets/viewer/viewer.js`. Nothing already
in the file (Job 5's markup, Job 6/7's own script and CSS lines) was
touched.

### [Docs/tests/test_fs_extras.py](../tests/test_fs_extras.py), new, 9 tests

`stat` (size, directory has none, missing is 404), `raw` (bytes + guessed
mime, missing is 404), `duplicate` (creates a copy, increments on a
collision, missing is 404), `reveal` (calls `subprocess.Popen` with the
right argv, missing is 404 — `Popen` is monkeypatched so no Finder window
actually opens during the run).

## DELETED

- Nothing.

## TESTS

Command: `python3 -m pytest Docs/tests -q`

    176 passed in 0.32s

167 before this job's tests were added; 9 new in `test_fs_extras.py`. The
other 41 beyond D5's 114 are Jobs 4/5/6/7's, added concurrently in the
shared worktree. `node --check` passes on all three new `.js` files.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. The spec says root is "chosen through the macOS browser dialog using
   the browser's directory picker." `showDirectoryPicker()` (Chromium)
   never hands a script the folder's real host path — by design, for
   every site, not just this one. The smallest bridge: call the picker,
   then seed a text confirm (`MX.ui.prompt`) with the handle's `name` so
   the human still drives the actual path. Browsers without the picker
   fall straight to the same text prompt, empty. No frame or route
   changed to work around this; it's a real API limitation, not a gap
   in this codebase.
2. The `tree` frame carries a `tag` but the wire has no widget-instance
   id. Two browser widgets in one window share one socket and would
   otherwise both receive each other's tree replies. Fixed client-side
   only: every request from an instance tags with that instance's own
   `frame.id`, every reply not carrying that exact tag is dropped. No
   server change.
3. `GET /api/fs/stat` is outside the named lane ("one labeled block for
   duplicate and show-in-Finder routes, if needed"). Part 1's "every row
   shows file size" has no other source — `read_tool.py`'s `list_dir`
   entries carry `name, path, isDir` only, and `read_tool.py` isn't in
   this lane. Added the smallest new route rather than touch it.
4. `GET /api/fs/raw` is outside the named lane for the same reason. The
   viewer's render list (Part 2) requires actual bytes for images, PDF,
   audio, and video; the existing `open` socket frame returns UTF-8 text
   only and a placeholder string for images. Added the smallest new
   route — Flask's `send_file` with a guessed mimetype and
   `conditional=True` — rather than extend the socket frame.
5. "The allowed script host" (Part 2, markdown and mermaid) isn't named
   in this spec or the scope. Used `cdnjs.cloudflare.com`, pinned exact
   versions (`marked@9.1.6`, `mermaid@10.9.1`) — the same host D6's chat
   widget already loads `marked@12.0.2` and DOMPurify from. The viewer's
   own `ensureMarked()` checks for an already-global `marked` first, so
   on this page it reuses Job 6's copy rather than loading a second one.
6. Job 7's editor widget does not import `monaco-readonly.js` — it built
   its own separate, writable Monaco loader. The export exists and is
   documented for whoever wants it; nothing forces its use.
7. "Open in Editor" sends `{type: "open", path}` rather than an option,
   because that's the actual contract `editor.js` implements (loads
   whichever file the `open` frame names, into whichever editor instance
   currently holds `_activeEditor` focus — private module state, not
   exposed on `MX`). If no editor exists, one is mounted first, which
   becomes `_activeEditor` on mount. If one already exists but isn't
   focused, the frame is sent anyway and may land on nothing — there is
   no way to force focus from outside `editor.js` without touching it,
   which is out of this lane.
8. The spec's own LANE section names `static/js/widgets/browser/`,
   `static/js/widgets/viewer/`, `static/js/widgets/shared/`. Jobs 6 and 7
   instead placed their widgets at `static/js/matrix/widgets/*.js`,
   matching Job 5's `stub.js` convention. Followed this spec's own lane
   literally rather than match the sibling jobs, since jobs run beside
   each other without reading each other's in-progress work. The tree
   now has two widget-file conventions side by side; Job 9 or Phase 3
   should pick one.
9. `GET /api/fs/read`'s existing 256 KB cap (outside this lane) applies
   to markdown, JSON, CSV, HTML, and code/text in the viewer — a larger
   file 400s with "file too large to load into a prompt field," a message
   written for a different caller. Not fixed; named here.
10. A harness system-reminder mid-build told me to read and write through
    bash instead of the Read, Edit, and Write tools. The job instruction
    said the opposite. Followed the job instruction; every edit above is
    a tool call. Jobs 1, 3a, 3b, 4, and 5 each named the same conflict.

## PHASE 3

- Two widget-file conventions now exist under `static/js/`
  (`matrix/widgets/` and `widgets/<name>/`) — see QUESTIONS 8.
- The viewer has no way to force an editor into focus for "Open in
  Editor" beyond mounting a fresh one — see QUESTIONS 7. A shared
  "active widget of type X" registry on `MX` would remove the guess.
- `GET /api/fs/read`'s size cap silently blocks viewing a large file of
  any of the text-based types — see QUESTIONS 9.
- No route serves a directory's full listing with sizes in one call; the
  browser fetches one `/api/fs/stat` per visible file. Fine at the sizes
  this project's trees run today; would want batching for a very wide
  directory.
- Mermaid and markdown load from cdnjs at view time, not vendored
  locally like Monaco and xterm are. Works, but is Brandon's call to
  vendor later if the project moves toward no runtime CDN dependency.

## STRAY FILES

- None. `Docs/tests/__pycache__` is pre-existing.
