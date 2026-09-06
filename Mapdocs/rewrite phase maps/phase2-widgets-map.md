# PHASE 2 — WIDGETS MAP (non-ADE app)

Written by: Goto (Sonnet), Phase 2. Date: 2026-09-05.
Files touched (read): static/js/shell.js, static/js/panes/*.js,
static/js/control.js, static/js/gatematrix.js, static/js/globalflags.js,
static/js/killswitch.js, static/index.html, static/control.html,
shells/ide/frames.py, shells/ide/web_io.py, shells/daemon/frames.py,
shells/turn_gate.py, engine/ledger.py, engine/daemon_queue.py,
engine/waypoint.py, engine/policy.py, engine/web_io.py (term/meters senders
only), server.py (routes 840-2620 region).

---

## 1. THE NON-ADE APP

Pages served (server.py):
- `/` — `index()` server.py:978-987. Serves `static/control.html` UNLESS
  `?room=` is present, then serves `static/index.html` (room mode keeps
  living at `/` too).
- `/ide` — server.py:990-996 — `static/index.html`.
- `/daemon` — server.py:999-1007 — `static/index.html` (same SPA bundle).
- `/ade`, `/ade/ledger`, `/ade/retired`, `/ade/arrange` — server.py:1010-1050
  — separate bundles (`static/ade.html`, `static/ade-ledger.html`,
  `static/ade-retired.html`, `static/ade-arrange.html`). Out of Phase 2 scope
  beyond the route table.

Mode detection (client-side, `static/js/shell.js:34-46`):
- `_roomParam = new URLSearchParams(location.search).get('room')` — non-null
  → `_isRoom` true. `'1'`/`''` maps to room id `'default'` (shell.js:38).
- `_isDaemon = !_isRoom && location.pathname.replace(/\/+$/,'') === '/daemon'`
  (shell.js:40).
- Else: normal IDE mode.
- `_needsNamePrompt = _isRoom && !_roomName` (shell.js:46) — room mode with
  no `?name=` defers the socket connect until a name prompt resolves.

Single socket (shell.js:57-60):
- `ws = new WebSocket(ws://${location.host}${_isRoom ? _roomWsPath() : _isDaemon ? '/ws/daemon' : '/ws'})`
- Room path built by `_roomWsPath()` (shell.js:49-53): `/ws/room?id=<id>[&name=<name>]`.
- Deferred connect for `_needsNamePrompt`: `_connectRoomSocket()`
  (shell.js:1117-1120), called after `showPrompt()` resolves (shell.js:1133-1139).

Pre-open queue (shell.js:68-72):
- `_preopenQueue` array. `wsSend(frame)` sends immediately if
  `ws.readyState === OPEN`, else pushes to the queue.
- Flushed in `ws.onopen` (shell.js:830): `while (_preopenQueue.length) ws.send(...)`.
- Comment (shell.js:62-67) states this fixed a bug where the files pane's
  mount-time `tree` request was silently dropped pre-connect.

Frame router — `ROUTE` table (shell.js:792-814), keyed by frame `type`:

| type | target |
|---|---|
| out, meters, speak, audio, transcript | chatPane |
| ask | null (handled specially, routeGate) |
| settings, models, crew_list | settingsPane |
| term | terminalPane |
| file, saved | editorPane |
| deleted, tree, moved, renamed, made | filesPane |
| ledger_state, ledger_detail | ledgerPane |
| queue_state | queuePane |
| log_tail | daemonLogPane |

Dispatched at shell.js:891-892 (`const target = ROUTE[m.type]; if (target) target.onFrame(m);`)
after special-cased branches for `ask` (shell.js:863-866), `status`
(shell.js:870-878, drives busy/idle + done-alert), `session_save_ack`
(shell.js:881-884), and a `tree`-with-`data.root` side-channel to
`settingsPane.setWorkspaceRoot()` (shell.js:887-889). Extra fan-out after
the table lookup: `saved` also re-hits `filesPane.onFrame` (895), `settings`
also re-hits `chatPane.onFrame` (897, VAD listening), and any `.html` `file`
frame auto-loads into `previewPane` (899-902).

Room mode has its own pre-ROUTE branch (shell.js:839-860): `ask` →
`routeGate(m, true)`; `ledger_state`/`ledger_detail` → `ledgerPane.onFrame`;
`room_status` drives the send-button busy state; everything else →
`conferenceUI.onFrame(m)`. The normal-mode ROUTE table is never reached in
room mode.

Header toggles (shell.js:743-789):
- `togglePane(entry)` (744-753) flips `entry.visible`, calls `updateGrid()`
  BEFORE `pane.show()`/`pane.hide()` (comment: Monaco needs an attached host
  when `show()` lazily creates it).
- Drag-to-reorder: `wirePaneDrag`/`reorderPanes` (756-788) — dragging one
  header button onto another splices `PANES` array order and re-lays the grid.

Gutters (shell.js:91-273):
- `updateGrid()` (117-238) lays out 0/1/2/3/4/5/6 visible panes via CSS grid
  coordinates; 2/3/4-pane layouts get real draggable gutters
  (`var(--col-split)`/`var(--row-split)`); 5- and 6-pane layouts use equal
  `fr` cells with no gutters (comment at 203, 224).
- `makeDragGutter(gutter, axis)` (241-270) — mousedown/mousemove/mouseup drag
  that live-writes `--col-split`/`--row-split` CSS vars, clamped to 120px/80px
  minimums; calls `terminalPane.fit()` on mouseup.

Gate modal (shell.js:318-542, `#gate-modal`):
- `showGate(prompt, id, windowed)` (338-370) — the one surface for a real
  `ask` frame. `.windowed` class toggles full-screen vs corner-card DOM
  (338-351). Sends `ledger_list` refresh (355). Binds y/n/Esc keys only if
  `gateKeyboard()` is true (361-369).
- `answerGate(text)` (392-402) — the single answer path: sends
  `{type:'answer', text, id:_activeGateId}`, refreshes ledger, clears chat
  awaiting/flag, hides modal. Shared by the y/n buttons, keyboard handler,
  and the text box's Enter key.
- `gateQueue` button (410-414) sends `'queue'` — defers/parks, only wired
  for real agent gates (`!_confirmCallback`).
- `routeGate(m, inRoom)` (443-455) — presentation router keyed on
  `modalMode()`: `off`/`corner` park only (ledger_list refresh, `corner`
  additionally calls `showCornerPop(m)`); else `showGate(..., mode==='window')`.
- `showConfirm`/`showPrompt`/`showTriple` (462-542) reuse the same modal DOM
  for local (non-agent, no-WebSocket) yes/no, freeform text, and 3-way
  confirms — guarded so they never open over a live agent gate (463, 490, 517).
  Exposed on `ctx` (545-547) so every pane can call them without importing
  shell.js.

---

## 2. WIDGET CONTRACT

Contract (stated verbatim in every pane file's header, e.g.
`static/js/panes/browser.js:6`, `chat.js:2`, `editor.js:3`, `terminal.js:2`,
`ledger.js:10`, `queue.js:12`, `daemonlog.js:7`, `preview.js:4`):
```
{ id, label, mount(el, ctx), show(), hide(), onFrame(msg) }
```

Registry per mode (all in `static/js/shell.js`):
- **Normal IDE** (`init()`, 918-1004) — `PANES` array (82-89): chatPane,
  terminalPane, editorPane, filesPane, ledgerPane, previewPane. Each gets a
  grid cell placed by `updateGrid()`, a header toggle button, and (for
  chat/editor/terminal/browser) a scoped settings corner button
  (`PANE_SCOPE`, 910-915).
- **Daemon** (`initDaemon()`, 1063-1111) — fixed cells `chat, queue, log,
  settings, ledger` (1082-1094): `chatPane`, `queuePane`, `daemonLogPane`,
  `settingsPane` (unscoped — every tab), `ledgerPane`.
- **Room** (`initRoom()`, 1007-1055) — two cells: `conferenceUI` (left) and
  `ledgerPane` (`#room-ledger-cell`, right), plus `settingsPane` mounted into
  the same header-gear overlay the IDE uses (1045-1051).

ctx passed to every pane (shell.js:77): `{ send: wsSend, answerGate }`, with
`showConfirm`/`showTriple`/`showPrompt` added after their definitions
(shell.js:545-547) — same mutable object reused everywhere, so late-added
methods reach every already-mounted pane.

Show/hide/resize:
- `show()`/`hide()` are called only by `togglePane()` (shell.js:751-752) in
  normal IDE mode — daemon and room modes never call them (their panes are
  permanently visible, no header-toggle infra is mounted: `headerBtns.style.display='none'`
  at shell.js:1013-1014/1066-1067).
- Resize is driven by `updateGrid()` re-placing cells + `makeDragGutter`'s
  live CSS var writes; individual panes react via `automaticLayout`
  (Monaco, editor.js:289), `ResizeObserver` (terminal.js:115-123), or nothing
  (chat/browser/ledger/queue/daemonlog/preview are plain flow layouts).

Double-instantiation:
- **editor.js** — guarded. `ensureEditor()` (editor.js:275-300) checks
  `if (_editorCreated) return;` (276) before `monaco.editor.create()`
  (282-292) — module-level singleton, idempotent.
- **terminal.js** — NOT guarded in code. `mount(el, ctx)` (terminal.js:74)
  unconditionally does `_term = new Terminal({...})` (99) on every call; a
  second `mount()` would create and open a second xterm instance and
  overwrite the module's `_term` reference, orphaning the first. Nothing in
  `shell.js` ever calls `terminalPane.mount()` more than once (it is only in
  the normal-IDE `PANES` array, never in daemon/room mode) — prevention is
  structural (one call site), not a code guard.
- **settings.js** — explicitly supports MULTIPLE simultaneous instances by
  design. `mount()` (settings.js:897-937) pushes `{el, knobsContainer}` onto
  a module-level `_instances` array (924-926, de-duped by `el` on re-mount),
  and every frame handler (`onFrame`, `setWorkspaceRoot`, `syncSettings`,
  `populateModels`, `setScrollMode`) iterates `_instances.forEach(...)`
  (942-977) so every open instance (master overlay + N per-pane scoped
  overlays + the daemon page's settings cell) stays in sync from one shared
  state cache (`_lastSettingsMsg`/`_lastModelsMsg`/`_lastCrewMsg`).
- **gatematrix.js** — same multi-instance pattern, but with NO shared state:
  its own header (gatematrix.js:11-16) states each `mount()` call is "a fully
  independent instance — its own fetch, its own staged edits, its own DOM,"
  with no live push between instances (plain HTTP, not WS).
- Every other pane (browser, chat, conference, daemonlog, ledger, preview,
  queue) is mounted exactly once per page load in every mode that mounts it
  at all (confirmed against shell.js's three init paths); no guard exists
  because no call site calls twice.

---

## 3. CHAT WIDGET (`static/js/panes/chat.js`, 1064 lines)

Rendering:
- Streaming text: `appendToTurn(text)` (chat.js:300-314) appends to a plain
  `.turn-plain` span (`textContent`, no HTML parsing) for low-latency
  display while a turn is live.
- On turn end: `endAssistantTurn()` (316-328) calls `renderAssistantTurn()`
  (237-287), which re-renders the FULL accumulated text through
  `parseFences(str)` (217-234) — a regex-based ``` fence splitter
  (`/```([^\n\`]*)\n([\s\S]*?)```/g`) producing `{type:'text'|'code', content, lang?}`
  segments. Non-code segments render as plain `textContent` spans (no
  markdown beyond the fence split — no bold/italic/link handling, no
  markdown library, confirmed by grep: no `marked`/`markdown`/`DOMPurify`
  reference anywhere in the file). Code segments get a `.code-fence` block
  with a language label, a "copy" button (`navigator.clipboard.writeText`,
  264-273), and a `<pre><code>` body (277-282).
- Thinking: `onFrame` (chat.js:886+) opens a `<details class="cot thinking">`
  element on the first thinking token (889-908), appends raw text to it, and
  closes/un-classes it when thinking ends (912-915), freezing an elapsed-time
  label (`_hmmTimeEl`).
- Meters: `#chat-meters` DOM built in `mount()` (chat.js:787), populated from
  `m.type === 'meters'` frames (990-992) reading `m.meters`.
- Transcripts: `session_load`/`session_new` full-replay frames re-render the
  whole log (referenced by `transcript` in shell.js's ROUTE table).

Attach / drag-drop (chat.js:361-604):
- `_addFiles(fileList)` (361-382) accepts image/audio files under
  `MAX_IMG_BYTES`/`MAX_AUDIO_BYTES`, base64-encodes via `FileReader`, stages
  in `_attachments`.
- `wireAttach()` (541-604): file-picker button + hidden `<input>` (544-546),
  clipboard paste of image/audio items (549-556), push-to-talk mic recording
  via `MediaRecorder` (560-588), and drag-drop onto `#bar`
  (`dragover`/`dragleave`/`drop`, 592-602) — same `_addFiles` path as the
  picker and paste.

Sent frames:
- `{type:'answer', text}` — gate-answer fallback via the chat bar
  (chat.js:623).
- `{type:'user', text}` — the message send path (626-631).
- `{type:'stop'}` — the stop button (1057).
- Also `session_new`/`session_save`/`session_load` (662-677, 832, 864) for
  the load/save dropdown, not part of the core send path.

---

## 4. EDITOR WIDGET (`static/js/panes/editor.js`, 440 lines)

Monaco creation — LAZY (editor.js:6-9, 271-300):
- `mount(el, ctx)` only builds DOM (`#monaco-editor` div) and stores `_host`.
- `ensureEditor()` (275-300) is the actual `monaco.editor.create(_host, {...})`
  call (282-292: `value:''`, `language:'plaintext'`, `theme:'vs-dark'`,
  `automaticLayout:true`, `wordWrap` from localStorage). Guarded (276-279):
  already created | Monaco AMD not loaded (`window._monacoLoaded`) | host not
  attached to `document.body`. Called from `show()`, which runs AFTER
  `updateGrid()` re-attaches the cell (comment, editor.js:7-9).
- `setMonacoInstance(editor)` (73-86) wires Ctrl+S → `editorSave` and replays
  any file frame that arrived before Monaco was ready (`_pendingFileFrame`).

Opening a file:
- Server → client: `{type:'file', path, content}` (routed via shell.js
  ROUTE table to `editorPane`) → `applyFileFrame(m)` (editor.js:88-106) sets
  `_currentEditorPath`/`_loadedContent`/`_loadedPath`, guesses Monaco language
  from extension (`editorGuessLanguage`, 61-71), calls
  `monaco.editor.setModelLanguage` + `_monacoEditor.setValue(m.content)`.
- Client → server: browser.js's `onRowClick` sends `{type:'open', path}`
  (browser.js:236); server handler is `shells/ide/frames.py:93-111` (`open`
  branch) — resolves via `rt._resolve(path)`, reads the file directly (no
  size cap — "editor is human-facing, not model-facing", line 95), detects
  image MIME and substitutes a `VIEW_IMAGE:` hint instead of raw bytes
  (100-105), replies via `webio.send_file(path, content)`
  (`shells/ide/web_io.py:12-15`).

Save path, frame → server → disk:
1. `editorSave()` (editor.js:129-132) always opens the folder picker
   (`openSaveModal`, 155-167) — no direct-save shortcut.
2. `_finishSave(dir)` (134-150) builds `path = dir + '/' + name`, reads
   `_monacoEditor.getValue()`, and — if `shouldConfirm('editor_save')` — shows
   a confirm via `ctx.showConfirm(saveConfirmText(...), () => _doSave(...))`;
   otherwise saves immediately.
3. `_doSave(path, content)` (219-222) sends `{type:'save', path, content}`.
4. Server: `shells/ide/frames.py:383-393` (`save` branch) — "the human is the
   trusted actor," calls `rt.write_file(path, content)` inline (no gate/
   `io.ask()`), replies `webio.send_saved(path, result)`
   (`shells/ide/web_io.py:24-27`), and fires `dq.notify("file_save")`
   (DAEMON-SPEC §4 re-check event).
5. Client: `saved` frame is routed to `editorPane` (status text) AND
   fanned out to `filesPane.onFrame` (shell.js:895) to refresh the tree.

Diff/confirm on save (editor.js:224-269, `saveConfirmText`/`lineDiff`):
- Same loaded path → LCS line diff (`lineDiff`, 248-269, O(n·m), capped at
  `DIFF_MAX_LINES = 800` lines else falls back to a "too large to diff"
  message with line counts, 234-236) shown in the gate-modal's scrollable
  body.
- New/different path → a 20-line head preview with a remaining-line count
  (241-245).
- This is a CLIENT-SIDE-ONLY diff against `_loadedContent` (the buffer as
  loaded) — not persisted, not a pane, unrelated to any server-side ledger
  diffing.

Second-instance prevention: see WIDGET CONTRACT §2 — `_editorCreated` guard
in `ensureEditor()`.

Native/macOS dialogs: NONE found. The save-location picker
(`#editor-save-modal`, editor.js:317-329) is a custom in-DOM tree browser
fed by `tree` frames tagged `'esave'` (176), not a native file dialog.

---

## 5. TERMINAL WIDGET (`static/js/panes/terminal.js`, 232 lines)

xterm creation (terminal.js:74-108, in `mount()`, NOT lazy):
- `new Terminal({theme, fontSize:13, fontFamily:..., convertEol:false})` (99-104),
  theme colors read once from CSS custom properties at init (94-98, no live
  re-theme — "a skin flip reloads the page anyway").
- `FitAddon.FitAddon()` loaded (105-106), `_term.open(el.querySelector('#term'))` (107).
- `scheduleFit()` (24-36) retries across animation frames (up to 30) until
  `_fitAddon.proposeDimensions()` reports real (nonzero) char metrics —
  guards against fitting a still-detached/zero-size host.
- `ResizeObserver` on `#term` (115-123) re-fits on any container size change.

PTY frames both directions:
- Client → server: raw keystrokes sent as `{type:'input', data}` (submitted
  via `submitShell()` for the shell-input box, terminal.js:47-56, confirmed
  via `shouldConfirm('terminal_run')`; raw xterm input presumably forwards
  through the same `input` type — not re-verified beyond the shell-input path
  in this pass).
- Server → client: `{type:'term', data}` frames, routed to `terminalPane` via
  shell.js's ROUTE table (`term: terminalPane`).
- Client-side line echo tracker `_trackLine(d)` (62-67) mirrors the raw xterm
  line in progress purely for the `terminal_run` confirm dialog text — resets
  on CR/LF/^C/^U, pops on backspace, ignores arrow keys/history/tab-complete
  (documented limit, line 61).

Server-side PTY ownership per connection (`server.py:2448-2526`, inside
`ws_handler`):
- `_shell = {"master": None, "proc": None}` — LOCAL to the connection's
  closure, spawned LAZILY (`_spawn_shell()`, 2458-2488) on first `_get_master()`
  call (i.e. first `input` frame, per `shells/ide/frames.py:89-91`).
- `pty.openpty()` (2459), `subprocess.Popen([shell, '-i'], stdin=slave,
  stdout=slave, stderr=slave, cwd=rt.WORKSPACE_ROOT, preexec_fn=_set_ctty)`
  (2467-2474) — `preexec_fn` calls `os.setsid()` + `TIOCSCTTY` ioctl so the
  shell gets job control (comment, 2451-2455).
- A dedicated pump thread (`_pump`, 2478-2488) reads `os.read(master, 4096)`
  in a loop and forwards via `webio.term(data.decode(...))`.
- Cleanup on disconnect (2513-2525): `os.killpg(getpgid(proc.pid), SIGKILL)`,
  `os.close(master)` — only if a shell was ever spawned this connection.
- No PTY at all is created for `/ws/daemon` (`ws_daemon_handler`,
  server.py:2363-2413 — no `_shell`/`pty` reference) or `/ws/room` — the
  daemon window has no terminal pane, and room mode never mounts `terminalPane`.

Second-instance prevention: no code guard (see WIDGET CONTRACT §2) — one PTY
per WebSocket connection is enforced by the connection-scoped closure, and
one `terminalPane.mount()` call is enforced by shell.js only including it in
the normal-IDE `PANES` array.

---

## 6. FILE BROWSER WIDGET (`static/js/panes/browser.js`, 710 lines)

Own header (browser.js:8-24) labels this "THE HUMAN'S PANE" (Brandon,
2026-08-21) — distinguishes "change folder" (display-only, unrooted) from
"make session root" (`setroot`, the only control that writes a root, always
confirmed). Cross-references `shells/ade/frames.py`'s "THE HUMAN DOOR" —
Phase 3 territory, not opened further here.

Tree frames — lazy expand:
- Node shape (browser.js:35-36): `{path, name, isDir, depth, parent, loaded,
  expanded, children, isRoot, _li, _row, _chev, _ul}` — NO size, NO mtime
  field anywhere in the node or in the rendering code (confirmed by grep for
  `.size`/`.mtime` — zero hits in this file).
- `requestTree(path)` sends `{type:'tree', path, hidden:_showHidden, tag:'tree'}`
  (browser.js:68); a directory expand re-sends the same frame type for that
  node's path (172, 177) — the "VS Code-style lazy-expand" the file header
  describes.
- Server: `shells/ide/frames.py:113-127` (`tree` branch) — `rt.list_dir(path, show_hidden)`,
  echoes the request's `tag` back untouched (125-126) so the client can tell
  the normal tree, the root-picker modal (`tag:'root'`), and the editor's
  save-location modal (`tag:'esave'`) apart when replies interleave.

Every file-op frame (client send site → server handler):

| op | client send | server handler |
|---|---|---|
| open | browser.js:236 `{type:'open', path}` | shells/ide/frames.py:93-111 |
| move (drag) | browser.js:203 `{type:'move', src, dst}` | shells/ide/frames.py:147-192 |
| rename | browser.js:309 `{type:'rename', src, name}` | shells/ide/frames.py:194-229 |
| mkdir | browser.js:300 `{type:'mkdir', path}` | shells/ide/frames.py:231-252 |
| rmdir | browser.js:316 `{type:'rmdir', path}` | shells/ide/frames.py:254-288 |
| delete (file) | browser.js:255 `{type:'delete', path}` | shells/ide/frames.py:313-316 (`rt.delete_file`) |
| setroot | browser.js:637 `{type:'setroot', path}` | shells/ide/frames.py:129-145 |
| save (new blank file) | browser.js:291 `{type:'save', path, content:''}` | shells/ide/frames.py:383-393 |

All of move/rename/mkdir/rmdir/delete/save are explicitly NOT gated — every
handler's comment repeats "the human is the trusted actor" (e.g.
frames.py:148-149, 195-196, 232-233, 255-256). `rmdir` alone gets an extra
realpath-containment check against `rt.WORKSPACE_ROOT` before `shutil.rmtree`
(frames.py:268-281) because it is destructive and recursive with no gate
behind it at all. `move`/`rename` also realpath-compare source/destination to
catch symlink escapes (frames.py:161-170, 211-220 case-only-rename via
`os.path.samefile`).

Context menu items (browser.js:328-351, `menuItemsFor(node)`):
- Root node: `new file`, `new folder`.
- Directory: `new file`, `new folder`, `rename`, `delete folder`.
- File: `open`, `rename`, `delete`.
- Also a per-row inline `×` delete button on files only (browser.js:394-406).

---

## 7. PREVIEW WIDGET (`static/js/panes/preview.js`, 74 lines)

Render path: `srcdoc`, not a `src` URL, for the "refresh" button —
`refreshFromEditor()` (preview.js:9-21) reads `window._monacoEditorInstance`
(the global the editor pane's `ensureEditor()` publishes,
`editor.js:294`) and sets `_iframe.srcdoc = editor.getValue()`.
- `navigateUrl()` (23-36) is the ONLY path that sets `_iframe.src` — for the
  URL field's "go" button, navigating to a `localhost:PORT` dev server
  (auto-prepends `http://` for bare `localhost` patterns, 28-29).
- `loadHtml(content)` (66-68) is a third entry point: shell.js auto-calls it
  whenever a `file` frame's path ends in `.html` (shell.js:899-902), setting
  `srcdoc` directly without touching the editor.
- Iframe sandbox: `allow-scripts allow-same-origin allow-forms allow-popups
  allow-modals` (preview.js:49).
- Content rendered: whatever HTML text is in the editor buffer (or was just
  opened), or whatever a live dev server at the typed URL serves. No file-type
  restriction beyond "editor content" — the pane itself does not inspect the
  file extension before rendering (the auto-load fan-out in shell.js is the
  only `.html`-specific gate, and only for the auto-load path, not "refresh").

---

## 8. SETTINGS WIDGET AND CONTROL CENTER

### settings.js — schema-array driven overlay (`KNOBS`, settings.js:27-232)

Every setting it exposes (type — where read/written):

| tab | id | type | onChange / write |
|---|---|---|---|
| model | sel-model | select | `/model <v>` slash |
| model | sel-crew | select | `{type:'set_crew', nick}` frame |
| model | sel-ctx | select | `/ctx <v>` → `settingsKey:num_ctx` |
| model | inp-timeout | number | `/timeout <v>` → `request_timeout` |
| model | mode (seg) | text/native | `/mode <v>` → `mode` |
| model | inp-max-tools | number | `/tools <v>` → `max_tools` |
| model | chk-think | checkbox | `/think on\|off` → `think` |
| model | inp-temperature | number | `/param temperature <v>` |
| model | inp-keep-alive | number | `/param keep_alive <v>` |
| model (advanced, collapsed) | top-k/top-p/min-p/repeat-penalty/repeat-last-n/seed/num-predict/mirostat/mirostat-tau/mirostat-eta/num-gpu/num-thread | number/seg | all `/param <key> <v>` |
| chat | scroll-mode (seg) | client-only | `chatPane.setScrollMode` |
| chat | alert-overlay/flag/notify/sound (checkbox), alert-when (seg), alert-pop-pos (seg), alert-pop-dismiss (checkbox) | `local:true` | localStorage only, no server round-trip |
| chat | snd-alert | custom `sound` type | upload/test/default alert clip |
| files | chk-gate-read/list/step/write/run | checkbox | `/gate <edge> on\|off` or `/step` |
| files | inp-workspace-root | custom `root` type | `sendSetRoot(path)` → `{type:'setroot'}` (confirmed always) |
| files | chk-recursive/size/hidden | checkbox | `/list <flag> on\|off` |
| editor | seg-newfile | local | localStorage `newFileLoc` |
| editor | chk-wordwrap | local | localStorage `editorWordWrap`, calls `_onWordWrap` |
| terminal | chk-run-stream | checkbox | `/run stream on\|off` |
| terminal | chk-terminal/chk-shell-input | internal | `terminal-visibility` / `shell-input-visibility` callbacks |
| speech | chk-listen, sel-stt-engine, seg-listen-mode | mixed | `/listen`, `/stt engine`, `/listen ptt\|continuous` |
| speech | chk-speak, sel-tts-engine, voices | mixed | `/speak`, `/tts engine`, custom voice picker (`/api/voices`) |
| global | global-gatematrix | custom `gatematrix` type | mounts `gatematrix.js` (policy.json + global.json) |

`local:true` knobs never round-trip to the server (client pref only, in
localStorage). Everything else sends a slash command as a `user` frame via
`sendCmd()` (settings.js:243-245) except `set_crew`/`setroot`/voice ops,
which send their own typed frames or hit `/api/voices` over plain HTTP.

Multi-instance behavior: see WIDGET CONTRACT §2.

### control.html / control.js — Control Center (no Session, no WebSocket)

Tabs (`static/control.html:14-18`): `launch` (active by default), `settings`, `status`.

- **launch** (control.html:24-74): new-IDE/new-daemon links (`/ide`,
  `/daemon`), new-room form, load-session list (`/api/saves`, control.js:45),
  load-room list (`/api/rooms`, control.js:75), ADE-sessions
  new/load(disabled)/save cluster (`/api/ade-sessions` list at control.js:125,
  save at control.js:186 → `/api/ade-sessions/save`, delete at control.js:153),
  and an "End All Sessions" button sharing the same `KILL_ROWS` wiring as the
  settings-tab kill panel.
- **settings** (control.html:77-124): gate-presentation segmented control
  (`fullscreen/window/corner/off`, control.js:214-242 → `GET/POST /api/global`
  key `modal_mode`), keyboard-answers toggle (control.js:244-267 →
  `gate_keyboard`), approve-gesture toggle (control.js:269-... →
  `approve_hold`), `#cc-gatematrix` mount (gatematrix.js instance #1), and
  the KILL CONTROLS panel (`KILL_ROWS`, control.js:307-320 — five rows:
  End All Turns/`/api/end-all-turns`, Unload Weights/`/api/unload-weights`,
  Kill Local Hosts/`/api/kill-hosts`, End All Sessions/`/api/end-all`, Shut
  Down Suite/`/api/shutdown-suite`; each row POSTs its route, control.js:361,
  427, and has its own hold-to-fire toggle written to `global.json`'s
  `kill_holds[key]`, control.js:380-388).
- **status** (control.html:126-133): stub. "content is designed last, by
  lock (CONTROL-CENTER.md §1, §5). Nothing lives here yet."

Every `/api` call from control.js: `/api/saves` (GET), `/api/rooms` (GET),
`/api/ade-sessions` (GET), `/api/ade-sessions/<id>` (DELETE),
`/api/ade-sessions/save` (POST), `/api/global` (GET/POST, three separate
load/save pairs for modal_mode/gate_keyboard/approve_hold plus the kill-holds
writes), and the five `KILL_ROWS` POST routes above.

`gatematrix.js` mount points (gatematrix.js:1-16): control.js's SETTINGS tab
(no `ctx` — its own save-confirm can't show) and settings.js's GLOBAL tab
(passed the pane's `ctx`) — two fully independent instances, no live push
between them, same `GET/POST /api/policy` (GATES tab, edge×driver×scope rows)
and `GET/POST /api/global` (CONFIRMS tab, the 12-row `CONFIRM_ROWS` list,
gatematrix.js:44-57) store underneath both.

---

## 9. REGISTRY: EVERY READER AND WRITER

| store | writer | reader | frame/route | UI |
|---|---|---|---|---|
| log.jsonl (action/turn) | `ledger.append()` engine/ledger.py:468, built by `action_record()` :347 / `turn_record()` :417 | `ledger._scan_log()` :555-593 (kind filter passed in); `read_log()` :596-609 (kind=='action' only) | `ledger_list`/`ledger_action`/`ledger_detail` frames (shells/ide/frames.py:58-72, shells/daemon/frames.py:149-157) | ledger.js pane (all shells) |
| log.jsonl (legacy activity event) | `agent_loop._append_durable_log()` (not in Phase 2 folders — cited via lane1 mapdoc) | no reader found in engine/ this pass | none | none found |
| log.jsonl (queue move record) | `daemon_queue.Queue._append_log()` engine/daemon_queue.py:369-388 | `daemon/frames.py:read_log_tail()` :34-57 reads log.jsonl RAW (all kinds, incl. `kind:'queue'`) with an optional `kind` filter | `log_tail` frame (shells/daemon/frames.py:141-143) | daemonlog.js pane (daemon window only) |
| queue.json (pending) | `Queue._persist()` engine/daemon_queue.py:351; mutated by `park()` :391, `answer_gate`/`deny`/`update_payload`/`delete`/`unsupersede` (module wrappers :1022-1061) | `Queue._load()` :339; `pending()` :1064; `condition_status()` :287-309 | `queue_list`/`queue_action`/`queue_test_park` (shells/daemon/frames.py:109-138); also folded into Ledger via `ledger.pending_as_records()` engine/ledger.py:619-671 | queue.js pane (daemon window); Ledger pane everywhere (as pending rows) |
| waypoint.jsonl | `Waypoint._append_line()` (engine/waypoint.py, cited via lane1 mapdoc — module not re-read whole this pass); `append_message()`/`append_denied()` :467-477 | `replay()` :513, `display_lines()` :510, `waiting_counts()` :507, `collect()`/`peek()`/`has_mail()`/`dead_letter_all()` :480-489 | no frame type in this lane's files maps to it directly (grep across shell.js/panes/*.js for `waypoint` — zero hits) | ADE-only per Phase 1/3 scope; not surfaced in any Phase 2 widget |
| policy.json | `policy._save()` engine/policy.py:118-125 | `policy._load()` :104-115, `resolve()` :174+, `all_rows()` :240, mtime-watched (`_stat_mtime()` :92-101) | `GET/POST /api/policy` (gatematrix.js:302-303, 371) | gatematrix.js GATES tab (both mount points) |
| global.json | server.py `_save_global` (cited via control.js call sites; not itself in Phase 2 folder list) | server.py `GLOBAL_DEFAULTS`-merged load (server.py:860-934) | `GET/POST /api/global` | globalflags.js cache (all shells), gatematrix.js CONFIRMS tab, control.js settings tab |
| logs/ blobs | `ledger.write_blob()` engine/ledger.py:171-192 | `_read_blob()` :509-528, referenced by `*_blob` fields in the action-record face | none directly — surfaced via `ledger_detail`'s `prompt`/`result` fields | ledger.js detail drawer |

`ledger.snapshot()` (engine/ledger.py:870-972) is the merge point: dedupes
`read_log()` (resolved) against `pending_as_records()` (live queue.json),
newest-first by `parked`, with orphan/parked-gate normalization (920-971).
`ledger.ade_snapshot()` (:1010+, Phase 1/3 territory) additionally reads
`kind=='turn'` records and scopes to the ADE's own per-session log — not
re-opened in depth this pass. `ledger.apply_action()` (:1221-1238) is the
single mutation function both `shells/ide/frames.py` and
`shells/daemon/frames.py`'s `ledger_action` branches call, so the two shells'
approve/deny/edit/delete/unsupersede behavior cannot drift.

---

## 10. GATES: READ / WRITE / RUN

`engine/policy.py:_default_rows()` (61-89) — the model-driven edges relevant
to Phase 2 widgets (full table is Phase-1/Library territory; write/run are
the two this app's widgets can trigger):

| edge | driver | scope | hook |
|---|---|---|---|
| check_read | model | inside | ask |
| check_read | model | outside | ask |
| write_file | model | any | ask |
| run_command | model | any | ask |
| default | human | any | open |

`resolve(edge, driver, ctx)` (policy.py:174+) looks up `_find_row()` (159-171)
→ `_match()` (145-156, exact edge/driver/scope, then edge/driver/'any'), with
a driver-wide `'default'` row as the final fallback. No hard-coded floor for
write_file/run_command — "that floor is gone by explicit instruction" (line
66), so these are live-editable via `/gate <edge> on|off` (client:
settings.js:159-163) or the gate matrix.

The one gate SURFACE all of it feeds is `#gate-modal` in `shell.js`
(§1 above) — `showGate`/`routeGate`/`answerGate` (shell.js:338-542). The
`answer` frame is `{type:'answer', text, id}` (shell.js:396); server routes
it to `webio.resolve_gate(id, text)` (shells/ide/frames.py:47-51,
shells/daemon/frames.py:85-86) — by id, so two concurrent gates never cross
answers.

`turn_gate` classification (shells/turn_gate.py:55-69, `route(msg)`):
- IMMEDIATE: `stop`, `answer`.
- QUEUE: `user` (non-slash, or a `MODEL_SLASH` command — `/model /ctx /think
  /mode /param`), `session_new`, `session_load`, `set_crew`, `setroot`,
  room turn-control types.
- RUN_NOW: everything else (file/editor ops, tree reads, ledger views, voice).
- `gate(ctx, msg)` (90-101) only holds QUEUE-classified frames, and only
  while `ctx.turn_running` — held in `ctx.pending` FIFO, drained in order by
  `_drain()` (121-135) when the turn's thread finishes. Every dispatched
  frame writes one `user_action` ledger line via `_log_user_action()`
  (140-181), keyed off `LOGGED_TYPES` (49-52).

Hold-to-fire wiring — every site:
- `static/js/killswitch.js:wireHoldToFire(btn, fire, {holdMs, bypassCheck})`
  (16-46) — the generic mechanism (pointerdown starts a 600ms timer,
  pointerup/leave cancels; `bypassCheck()` returning true fires instantly).
- `wireKillswitch(btn, sendText)` (51-55) — the panic button, bypasses the
  hold when `!flags().killswitch.hold_to_fire`.
- `static/js/panes/queue.js:119` — daemon queue APPROVE button:
  `if (approveHold()) wireHoldToFire(approveBtn, ...)` else a plain `onclick`.
- `static/js/panes/ledger.js:183-185, 400, 519, 525` — Ledger pane's approve
  button, same `approveHold()` branch, re-wired per render.
- `static/js/control.js:359, 425` — the Control Center's KILL CONTROLS panel,
  one `wireHoldToFire` per row, gated by that row's own `kill_holds[key]`.
- Default value in every loader: `false` (OFF, plain click) —
  `static/js/globalflags.js:28` (`approve_hold: false` client default),
  `server.py:874` (`GLOBAL_DEFAULTS["approve_hold"] = False`), and the
  on-disk `global.json:6` (`"approve_hold": false`) all agree.

---

## 11. DAEMON WINDOW

| piece | file:line | function |
|---|---|---|
| route | server.py:999-1007 | `/daemon` → `static/index.html` |
| ws handler | server.py:2362-2413 | `ws_daemon_handler` — same Session/WebIO shape as `/ws`, no PTY, adds queue/log frames |
| frame dispatch | shells/daemon/frames.py:82-181 | `_dispatch()` — answer/gate_reorder/stop/speak_test/setroot/queue_*/log_tail/ledger_*/user |
| queue snapshot | shells/daemon/frames.py:20-31 | `queue_snapshot()` — `dq.pending()` + `condition_status()` + `_awaiting_human` flag |
| log tail reader | shells/daemon/frames.py:34-57 | `read_log_tail(limit, kind)` — raw whole-file scan of `log.jsonl`, capped `LOG_TAIL_MAX=500` |
| queue widget | static/js/panes/queue.js | pending list, approve(hold)/deny/edit(prompt)/delete, superseded → `showTriple` (run/reseq/delete) |
| log-tail widget | static/js/panes/daemonlog.js | newest-first feed, kind filter (`gate/queue/tool/alert/all`), color-coded rows |
| client mount | static/js/shell.js:1063-1111 | `initDaemon()` — 5 fixed cells: chat/queue/log/settings/ledger |
| queue_test_park | shells/daemon/frames.py:128-138 | verification-only, reached via `window._daemonSend` (shell.js:1107), not a UI button |
| settings cell | static/js/panes/settings.js mounted with `{}` (no scopeTabs) | every tab renders, incl. GLOBAL |

---

## 12. CONFERENCE ROOM

`?room=<id>` (or `?room=1`/`''` → id `'default'`) mounts room mode
client-side (shell.js:34-46). Socket: `/ws/room?id=<id>[&name=<name>]`
(shell.js:49-53), server handler `ws_room_handler` (server.py:2267-2361,
not re-read in depth this pass — Phase 1/Library territory per the primer's
reading matrix). `initRoom()` (shell.js:1007-1055) hides the normal pane
grid/bar, mounts `conferenceUI` (conference.js) + `ledgerPane` side by side,
and mounts `settingsPane` into the same header-gear overlay as the IDE.
Frame routing is a separate pre-ROUTE branch in `ws.onmessage`
(shell.js:839-860): `ask` → `routeGate(m, true)`; `ledger_state`/`ledger_detail`
→ `ledgerPane` directly; `room_status` drives the send-button busy state;
everything else → `conferenceUI.onFrame(m)`. Persistence:
`shells/conference/persistence.py` (cited via lane2 mapdoc — not re-read):
rooms save to `<SUITE_ROOT>/rooms/*.json`, a schema separate from
single-model session saves, surfaced in this app via `GET/DELETE /api/rooms`
(control.js:75, 153-area) for the Control Center's "load room" list.

---

## 13. DISCREPANCIES vs MAPDOCS

- **Route line numbers drifted wholesale.** lane2-shells-server.md's HTTP
  route table (its lines 140-161) cites `/` `/ide` `/daemon` etc. at
  server.py:842-904; current code has them at server.py:978-1050 — a ~135
  line shift (GLOBAL_DEFAULTS/KILL_ROW_KEYS content grew before the routes).
  Route BEHAVIOR still matches (`/` control.html unless `?room=`, `/ide` and
  `/daemon` both serve `static/index.html`).
- **ADE pop-out route paths changed shape.** lane4-panes-static.md
  (CONNECTIONS, its line 67) states `/ade-ledger` and `/ade-arrange` as the
  routes. Current server.py defines them as `/ade/ledger` (1023) and
  `/ade/arrange` (1042) — slash-nested, not hyphenated. The HTML file names
  (`static/ade-ledger.html`, `static/ade-arrange.html`) kept the old
  hyphenated form; only the route path changed. No client-side link to
  either route was found in the files read this pass (static/js/ade/ is
  blackout for me — Phase 3's lane).
- **shell.js PANES/ROUTE line numbers drifted ~3-15 lines** from
  lane4-panes-static.md's citations (e.g. mapdoc's "shell.js:79-86" for the
  pane registry is actually shell.js:82-89; mapdoc's ROUTE table
  "shell.js not cited exactly" matches my read at 792-814 with content
  identical). Minor, content-accurate, flagged for completeness only.
- **lane2's EVENT STREAM section (queue.json shape, its lines 302-309)**
  matches current `shells/daemon/frames.py`/`engine/daemon_queue.py` content
  exactly (function names, line ranges within ~5 lines) — this section held
  up well against code.
- **lane4's UNKNOWN about `waypoint.jsonl`** ("no frame type found that maps
  to it") is CONFIRMED still true against current code: grep for `waypoint`
  across every file in `static/js/panes/*.js` and `static/js/shell.js`
  returns zero hits.
- **lane2's DEAD-code note on `queue_test_park`** (its lines 405-410,
  "confirming this required reading static/js, outside this lane") is now
  CONFIRMED from the static side: `window._daemonSend = wsSend` at
  shell.js:1107 is the only call site, gated behind no button.

---

## 14. UNKNOWNS

- Whether the terminal pane's raw xterm keystrokes (not the shell-input
  textbox) are sent as `{type:'input', data}` the same way `submitShell()`
  sends them was not directly confirmed in `terminal.js` — the xterm
  `onData`/keystroke-to-socket wiring past line 130 was not read in this
  pass (file continues to line 232; the `input` frame TYPE itself is
  confirmed from the server side, `shells/ide/frames.py:89-91`).
- `agent_loop._append_durable_log()`'s "legacy activity event" line-shape in
  log.jsonl (engine/agent_loop.py, outside Phase 2's assigned folders) has no
  confirmed reader in this pass — matches lane1's own UNKNOWN, not resolved
  here either.
- `server.py`'s `_save_global` implementation (the write side of
  `/api/global`) was not opened — only its call sites and `GLOBAL_DEFAULTS`
  (server.py:860-890) were read. `_load_global`'s merge-and-heal behavior
  cited in lane2's route table was not re-verified line-by-line.
- Whether `ws_room_handler` (server.py:2267-2361) shares any frame-dispatch
  code with `shells/ide/frames.py`/`shells/daemon/frames.py` beyond the
  `ledger_*` three-frame contract was not checked — out of Phase 2's primary
  folder list (`shells/conference/` is Library/Phase-1 lane per the primer).
- `static/js/panes/conference.js` and `static/js/panes/ledger.js` were read
  only via grep + the mapdoc excerpt, not line-by-line — Section 12 is
  intentionally brief per the assignment; a full ledger.js render/detail-drawer
  breakdown was not produced (out of the 14-section ask, which does not name
  ledger.js as its own numbered section).
