# PHASE 4 — NEW EDITIONS MAP

Written by: Goto (Sonnet), Phase 4. Date: 2026-09-05.
Files touched (read): engine/worker.py, engine/worker_transports.py,
engine/agent_loop.py (add_agent/_drain_worker only), server.py (worker
routes only), shells/conference/conference.py (grep only, not read in full),
static/js/panes/editor.js, static/js/panes/preview.js,
static/js/ade/arrange.js, static/js/ade/arrangewin.js,
static/js/ade/region.js, static/js/ade/cables.js.

---

## 1. WORKER PROCESS

### Launch

`engine/agent_loop.py:1614` `add_agent(sess, target, task, display_name=None, system=None)`.
Builds a `start` event, picks a transport off
`sess.settings.get("worker_transport","pipe")`, spawns
`[sys.executable, "-m", "engine.worker"]` via `subprocess.Popen`
(agent_loop.py:1630, 1647-1659), sends the `start` event on the channel, then
blocks in `_drain_worker` (agent_loop.py:1565) until the worker sends `done`
or `error`.

- pipe transport (default): `Popen(..., stdin=PIPE, stdout=PIPE, stderr=PIPE)`,
  wrapped in `PipeChannel` (worker_transports.py:77-110).
- http transport: `register_worker(worker_id)` first
  (worker_transports.py:46-49), `Popen(worker_cmd + ["--coordinator", URL,
  "--id", worker_id], stdout=DEVNULL, stderr=DEVNULL)`, wrapped in
  `HTTPChannel` (worker_transports.py:114-144).

### Who starts a worker today

Only `shells/conference/conference.py` calls `al.add_agent(...)` — 6 call
sites: lines 354, 386, 434, 461, 514, 572 (grep only, not read). No other
caller of `add_agent(` exists in the tree (grep across `*.py`).
`shells/ade/tracks.py:19,690` mention `al.add_agent()` only in comments,
explicitly saying the ADE track path does NOT use it ("the track IS this
Session ... NOT al.add_agent()").

### What a worker runs inside

`engine/worker.py:_run` (line 46): reads a `start` event off the transport,
pulls `model`/`task`/`settings`/`workspace_root`/`nick`, sets
`read_tool.set_workspace_root(workspace_root)` (worker.py:64), builds a
`Router()` (worker.py:70), constructs `WorkerIO(transport)` and a
`Session(io_surface=io, shell="worker")` (worker.py:73-74), binds
`sess.nick = nick` (worker.py:75). Applies coordinator settings then forces
`model`, `claude_mode="oneshot"`, `mode="text"` (worker.py:80-83). Messages
are `[system_override or _worker_system_message(), {"role":"user",
"content":task}]` (worker.py:88-92). Runs `al.agent_respond(sess,
worker_router)` (worker.py:94), takes the last assistant message's content
as the final answer, sends `{"type":"done","text":final}` (worker.py:97-102).

Pipe mode redirects `sys.stdout` to `sys.stderr` before importing the
transport, "so any accidental print() calls never corrupt the newline-JSON
protocol" (worker.py:33-38).

### Event protocol (worker_transports.py:12-27 docstring, verified against code)

coordinator → worker:
| type | fields |
|---|---|
| `start` | `model`, `task`, `settings`, `workspace_root`, optional `system`, optional `nick` |
| `gate_answer` | `id`, `answer` |
| `stop` | (declared in the docstring; no send site or recv-side handler for `type=="stop"` found in worker.py or worker_transports.py — see UNKNOWNS) |

worker → coordinator:
| type | fields | handled by `_drain_worker` |
|---|---|---|
| `output` | `text`, `dim`, `end` | shown via `sess.io.out(...)`, dimmed header `[agent → {label}]` shown once |
| `gate_req` | `id`, `prompt` | forwarded to `sess.io.ask(...)`, answer sent back as `gate_answer` |
| `metrics` | `data` | `sess.io.meters(data)` |
| `status` | `phase` | `sess.io.status(phase)` |
| `term` | `data` | `sess.io.term(data)` |
| `done` | `text` | returned as the final answer, loop ends |
| `error` | `message` | returned as `"[agent error: {message}]"`, loop ends |

`channel.recv()` returning `None` (EOF / worker died) returns
`"[agent terminated unexpectedly]"` (agent_loop.py:1577-1578).

### Pipe transport vs HTTP transport

- `PipeChannel` (worker_transports.py:77-110): `send` writes newline-JSON to
  `proc.stdin`; `recv` blocks reading `proc.stdout.readline()`, skips blank
  lines and bad JSON, returns `None` on EOF; `close` closes stdin, waits 5s
  then kills.
- `WorkerPipeTransport` (worker_transports.py:148-172): worker-side mirror,
  reads `sys.stdin`, writes to the captured real stdout stream.
- `HTTPChannel` (worker_transports.py:114-144): `send` pushes onto
  `_worker_commands[worker_id]` queue; `recv(timeout=300)` blocks on
  `_worker_events[worker_id]` queue; `close` calls `unregister_worker` and
  terminates the subprocess.
- `WorkerHTTPTransport` (worker_transports.py:176-215): worker-side, `send`
  POSTs JSON to `{base}/worker/events/{worker_id}` (best-effort, swallows
  exceptions); `recv` long-polls GET `{base}/worker/commands/{worker_id}`
  with a 30s timeout, retries on 204/error, returns `None` only on a 404.

Both channel pairs are two in-process `dict`-of-`Queue` registries
(`_worker_events`, `_worker_commands`, worker_transports.py:42-43) — "the
single source of truth for in-flight workers" per the module's own comment
(worker_transports.py:38-40).

### server.py routes

`server.py:81` imports `from engine import worker_transports as wc`.

- `POST /worker/events/<worker_id>` (server.py:2247-2253): parses JSON body,
  calls `wc.handle_event(worker_id, event)`, returns `("", 204)`.
- `GET /worker/commands/<worker_id>` (server.py:2256-2263): calls
  `wc.get_command(worker_id, timeout=25)`; `None` → `("", 204)`; otherwise
  `jsonify(cmd)`.

Both routes are thin pass-throughs to the two module-level queue dicts; no
other logic lives in server.py for the worker protocol.

---

## 2. EDITOR WIDGET INTERNALS

`static/js/panes/editor.js` (440 lines). Imports `currentDir` from
`./browser.js` (editor.js:11) and `shouldConfirm` from `../globalflags.js`
(editor.js:12).

### Monaco config

Created lazily: `mount(el, ctx)` (editor.js:306) only builds DOM and stores
the host div in `_host`; `ensureEditor()` (editor.js:275-300) does the actual
`monaco.editor.create(...)` call, guarded on: already created, Monaco AMD
not loaded (`window._monacoLoaded`), host not attached to `document.body`.
`ensureEditor()` is called from `show()` (editor.js:391-400), which per the
file's header comment runs after `shell.js`'s `updateGrid()` re-attaches the
host, and from `window._onMonacoReady` (editor.js:388, set at mount).

`monaco.editor.create` options (editor.js:282-292): `value:''`,
`language:'plaintext'`, `theme:'vs-dark'`, `fontSize:13`,
`fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'`,
`minimap:{enabled:false}`, `automaticLayout:true`,
`scrollBeyondLastLine:false`, `wordWrap` from
`localStorage.getItem('editorWordWrap')`, default `'on'`.

Language detection: `editorGuessLanguage(path)` (editor.js:61-71) maps file
extension → Monaco language id (`js/ts/py/html/css/json/md/sh/yml|yaml/txt/
rs/go/c/cpp/java/rb`), default `plaintext`. Called on file load
(`applyFileFrame`), on typing the path field live (editor.js:370-374,
`input` listener re-sets the model language as you type a new filename), and
forced to `plaintext` on `editorNew()`.

### Open flow

`onFrame(m)` (editor.js:421-437): `m.type==='file'` → `applyFileFrame(m)`
(editor.js:88-106) — sets `_currentEditorPath`, `_loadedContent`/`_loadedPath`
(the save-confirm diff baseline), the path input value, clears status, and
either applies directly to Monaco (`setModelLanguage` + `setValue` +
`setScrollPosition({scrollTop:0})`) or stashes `_pendingFileFrame` if Monaco
isn't ready yet — replayed once by `setMonacoInstance` (editor.js:73-86).

### Save flow

`editorSave()` (editor.js:129-132, also bound to Ctrl+S via
`editor.addCommand` in `setMonacoInstance`) always opens the save-location
picker via `openSaveModal()` (editor.js:155-167) — there is no direct save
path anymore per the file's own comment (editor.js:126-128). The picker
seeds its start directory from the currently-loaded file's dirname, or from
`localStorage['newFileLoc']` (`'dir'` → `currentDir()`, else `'.'`) for a
new/untitled file. It requests directory listings via
`ctx.send({type:'tree', path, hidden:false, tag:'esave'})`
(`requestSaveModalTree`, editor.js:174-177); replies route back through
`onFrame`'s `'tree'` branch only when `_saveModalOpen` is true
(editor.js:432-436) — untagged tree replies go to the files pane instead.
`renderSaveModalData(data)` (editor.js:179-217) lists directory entries only
(`e.isDir`), falls back once to `/` on an error with no prior valid path
(editor.js:195-199, `_saveModalFellBack` one-shot guard).

Choosing a folder → `_finishSave(dir)` (editor.js:134-150): builds
`path = dir + '/' + basename(pathInputValue || 'untitled.txt')`, reads
Monaco content, and if `shouldConfirm('editor_save')` is true and
`ctx.showConfirm` exists, shows a confirm dialog built by `saveConfirmText`
before calling `_doSave`; otherwise calls `_doSave` directly. `_doSave`
(editor.js:219-222) sends `{type:'save', path, content}` and sets status text
to `'saving…'`.

`onFrame`'s `'saved'` branch (editor.js:424-431) reads `m.result`: status
becomes `'saved'`/class `ok` unless the result string starts with
`'[save denied'` or `'[WRITE refused'`, in which case status is
`'denied'`/class `err`; cleared after 2500ms.

### lineDiff / confirm dialogs

`saveConfirmText(path, content)` (editor.js:231-246): if `path === _loadedPath`
(overwriting the file as loaded), calls `lineDiff(_loadedContent, content)`
and shows either the diff, a "too large to diff" line-count message, or
"(no changes)"; otherwise shows a new-file preview (first 20 lines + a
"… (N more lines)" trailer).

`lineDiff(oldText, newText)` (editor.js:248-269): classic LCS table
(`Uint16Array((n+1)*(m+1))`), returns `null` if either side exceeds
`DIFF_MAX_LINES = 800` (editor.js:229) — "LCS is O(n·m)". Otherwise
backtracks the table into a list of `'- line'` / `'+ line'` entries, no cap
on output length ("#gate-prompt scrolls, and Brandon wants the whole diff",
editor.js:267).

### Exports

Named: `editorGuessLanguage`, `setMonacoInstance`, `applyFileFrame`,
`editorNew`. Default export `editorPane` (editor.js:302-440):
`{id:'editor', label:'editor', mount(el,ctx), show(), hide(), newFile,
getContext(), setWordWrap(on), onFrame(m)}`.
`getContext()` (editor.js:406-411) returns `{path, content}` off the current
Monaco value/path, or `null` if both are empty — used by the "to ctx" button
(editor.js:356-367) which prepends `[file: path]\n\`\`\`\n{content}\n\`\`\``
into the `#msg` textarea.

---

## 3. PREVIEW WIDGET INTERNALS

`static/js/panes/preview.js` (74 lines). No imports.

### srcdoc render

`refreshFromEditor()` (preview.js:9-21), bound to the `refresh` button
(preview.js:55): reads `window._monacoEditorInstance.getValue()` (the global
Monaco instance editor.js's `ensureEditor()` sets at
`window._monacoEditorInstance`, editor.js:294) and assigns it to
`_iframe.srcdoc`. Warns to console and no-ops if the editor instance isn't
present yet.

`previewPane.loadHtml(content)` (preview.js:66-68) also sets `_iframe.srcdoc`
directly. No caller of `loadHtml` exists inside preview.js itself (see
UNKNOWNS — out of this file's scope to find external callers).

### URL navigation

`navigateUrl()` (preview.js:23-36), bound to the `go` button and to Enter
inside the URL input (preview.js:56, 58-60): trims `_urlInput.value`,
prepends `'http://'` if it matches `/^localhost(:\d+)?(\/|$)/`, sets
`_iframe.src = url`.

### Refresh trigger

Only the `refresh` button (→ `refreshFromEditor`) and the `go` button /
Enter key (→ `navigateUrl`). No automatic/live refresh on Monaco edits.

### Content source

Editor content comes from the module-global `window._monacoEditorInstance`,
not from any `ctx` or props passed into `mount(el)` — the pane contract's
`ctx` argument is explicitly unused (`mount(el /*, ctx — not needed */)`,
preview.js:42). `onFrame` is a documented no-op — "No server frames" —
preview.js reads no server-pushed data at all (preview.js:70-71). Iframe
sandbox attribute: `"allow-scripts allow-same-origin allow-forms
allow-popups allow-modals"` (preview.js:49).

---

## 4. ARRANGE PLAN MODEL

`static/js/ade/arrange.js` (1721 lines). Imports `REGION_STATUS,
REGION_FIELDS, blankRegion, regionGet, regionSet` from `./region.js`
(arrange.js:46) and `deriveCables` from `./cables.js` (arrange.js:51).

### localStorage key

`const LS='arrangeMockD2'` (arrange.js:57). `save()` (arrange.js:62)
`JSON.stringify`s the whole state `S`, stripping any key starting with `_`.
`saveSoon()` (arrange.js:63) debounces `save()` by 250ms; flushed on
`beforeunload` and on `visibilitychange→hidden` (arrange.js:1503-1505).

### Top-level state object `S` (`defState()`, arrange.js:59-60)

```
{ uid, selPlan, zoom, panX, panY,
  dev: { expand, pips, nlabels, loopbox },
  plans: [ ...Plan ] }
```

### Plan object (built by `buildSeed`/`syncSessionPlan`, arrange.js:1223, 1350)

```
{ id, name, extract, selPhase, phases: [ ...Phase ] }
```

### Phase object (arrange.js:1225-1226, 279, 264)

```
{ id, name, files: [string], active: bool, loops: [ ...Loop ],
  nodes: [ ...Node ], cables: [ ...Cable ],
  // runtime, `_`-prefixed, stripped from save()/currentPlan():
  _live: [ ...Node ], _loopEdges: Set<cableId> }
```

### Node object (region — `region.js:blankRegion`, plus arrange.js additions)

Persisted fields (region.js:103-116): `id, x, y, name, model, notes, status,
stxt, wt, track, notches: [ ...Notch ], detail: { agent }`.
Added by arrange.js and persisted (not `_`-prefixed):
`regnode_id` (binds an authored node to a server region id, arrange.js:1552-1567).
Runtime-only, `_`-prefixed, never saved: `_rail` (display string "provider ·
loop_class · mechanism"), `_live` (true for a server-rendered node),
`_w`/`_h` (measured box size, set in `layoutNotches`, arrange.js:424-425).

### Notch object

`{ id, kind, p, label }` (arrange.js:1094, 1029, 948→blankRegion has none —
notches are added post-creation via `notchDown`/right-click). `kind` is one
of `'cable'`, `'git'`, `'fork'` post-migration (`migratePlan`,
arrange.js:1282: `in`/`out`/`loop` all collapse to `'cable'`).
`p` is a perimeter position consumed by `perimXY`/`xyToP` (not read in this
pass — see UNKNOWNS). Runtime-only: `_ax`, `_ay`, `_e` (world coords + facing
edge, set in `layoutNotches`, arrange.js:426-430).

### Cable object

`{ id, a: {n: nodeId, t: notchId}, b: {n: nodeId, t: notchId}, action? }`
(arrange.js:885, 1240). `action` is optional, only present on cables
authored after "WAVE 3" (arrange.js:597).

### Loop object (recomputed by `computeLoops`, arrange.js:164-188)

`{ key, nodes: [nodeId], maxCycles, maxCtx }` — `key` is the sorted,
`+`-joined node-id list; loops are recomputed from `ph.cables` via a
Tarjan SCC pass every time `structural()` runs, not hand-authored. Note:
`bumpUidPast` (arrange.js:1309-1320) calls `bump(l.id)` on every loop, but
the loop objects `computeLoops` actually produces carry no `id` field (only
`key`) — see DISCREPANCIES.

### Load / save / migrate

`initState()` (arrange.js:1287-1303): reads `localStorage[LS]`, JSON-parses
it, or seeds `defState()` + `buildSeed(EXTRACT)` (a single-node-less
`EXTRACTION TAB` plan) if nothing is stored. Runs `migratePlan` on every
plan. `migratePlan(p)` (arrange.js:1257-1285): backfills a missing/empty
`phases` array, fixes `selPhase` if it points nowhere, pushes a loop's
legacy `wt` down onto member nodes, renames the legacy notch kind `'spawn'`
→ `'out'`, promotes a `git` notch that carries a cable to `'out'`, collapses
`in`/`out`/`loop` notch kinds to `'cable'`, then re-runs `computeLoops`.

`syncSessionPlan(serverPlan)` (arrange.js:1340-1355, exported): called by
boot.js on every `ade_init` frame. Clears `UNDO`/`REDO` and selection (a
session boundary, not a user edit). If `serverPlan.phases` is a non-empty
array: `bumpUidPast` (rebases the local `uid()` counter above every id in
the incoming plan so freshly-drawn nodes can't collide), `migratePlan`, then
`S.plans = [serverPlan]`. Otherwise resets to a single blank `scratch` plan.
Always `saveSoon()` + `render()`.

### Export / import JSON

`currentPlan()` (arrange.js:1141-1144, exported): deep-clones the selected
plan via `JSON.parse(JSON.stringify(p, stripUnderscoreKeys))` — the one
place the in-memory plan becomes plain, `_`-free JSON. `planJSON()`
(arrange.js:1145-1146) pretty-prints it. Consumers: `pipePlan()` (sends
`{type:'ade_plan', plan}` over `ctx.send`, arrange.js:1169-1185), the
"copy this plan as JSON" / "show JSON" toolbar buttons (arrange.js:1207-1213),
and boot.js's save/end payloads (per the header comment, arrange.js:17-19,
72; boot.js itself is out of this phase's scope).

### Canvas render loop

Host DOM built once at `mount()` from the `HOST_HTML` template
(arrange.js:1362 on) into `#ar-shell`/`#ar-main`/`#ar-rail`/`#ar-cwrap` /
`#ar-world` / `#ar-svg`. SVG layers: `#ar-svg` (world-space, holds
`<defs>` markers plus `#ar-cablesG` — the cable `<path>` group, wholesale
`innerHTML` rebuilt every `drawCables()` call, arrange.js:560-620) and
`#ar-ghost` (the in-progress cable-drag preview path). A parallel HTML layer,
`#ar-cabends`, draws small `<div>` dots at cable endpoints because a notch
`<div>` (z-index 12) paints over an SVG `marker-end` circle
(arrange.js:550-559).

`render()` = `renderRail(); renderCanvas()` (arrange.js:449).
`renderCanvas()` (arrange.js:440-448): removes all `.node`/`.loopbox`
elements, rebuilds one `<div class="node">` per `faceNodes(phase())` (=
`ph.nodes.concat(ph._live||[])`, arrange.js:438) via `buildNode(n)`
(arrange.js:349-422), then on the next animation frame lays out each node's
notches (`layoutNotches`), draws cables (`drawCables`), places loop boxes,
and re-applies the current selection's CSS class.

Hit testing: cables get an invisible fat `<path class="chit">` alongside the
visible styled path (arrange.js:604) for click/shift-click; notches carry
`data-node`/`data-notch` attributes read via `document.elementsFromPoint`
during a notch drag (arrange.js:862-864, 871-873) to find a drop target.

Drag: `nodeDown(e,n,nel)` (arrange.js:818-834) — pointer-capture drag, moves
`n.x`/`n.y`, re-layouts notches/cables/loopboxes live, a <3px total move on
release is treated as a click-to-select instead of a drag. `notchDown`
(arrange.js:837-887) — a notch drag either "slides" the notch around its
node's rim (if it stays within 22px of the rim, reversible both ways,
arrange.js:849-853) or, once it leaves that band, becomes a cable drag that
shows a ghost path and highlights a hovered target notch; releasing over
another node's notch adds a `Cable` (rejecting a duplicate, and rejecting a
target whose kind is a "marker" — `git`/`fork`, which "take no cable").
Canvas panning: pointerdown-drag on empty canvas/world/svg pans
(`S.panX`/`panY`), same <3px-move-is-a-click rule deselects on release
(arrange.js:920-936).

Zoom: mouse wheel zooms by ×1.08/×0.92 around the cursor unless Shift is
held (then it pans by `deltaX`/`deltaY` instead) — "Brandon wants the wheel
ZOOMING" (arrange.js:966-978). `setZoom(z,cx,cy)` (arrange.js:894-896)
clamps `z` to `[0.35, 2]` and re-centers pan on the given point. `+`/`-`
toolbar buttons zoom ×1.2 around the viewport center. `fitAll()`
(arrange.js:903-918, the right-click "show all" item) bounds every node
(authored + live) on the phase and fits zoom to `[0.1, 2]`.

### Node creation / edit / delete UI

Create: double-click on empty canvas, or the right-click menu's "+ add
node", both push `blankRegion(uid(), {x,y})` onto `phase().nodes`
(arrange.js:948, 960-962) then call `structural()` (recompute loops, save,
render).

Edit: `buildNode(n)` (arrange.js:349-422) wires contenteditable spans for
`name`/`model`/`notes`/`stxt` via `bindCE` (arrange.js:318-324, becomes
read-only text for a `_live` node), a status dot that cycles
`REGION_STATUS` forward on click / backward on shift/alt-click
(arrange.js:384-387), a worktree tag (`n.wt`, read-only display, set via the
expand panel), and an "⤢ expand" button (`openExpand`, arrange.js:1116-1128)
that opens `#ar-ex`, binding `notes`/`wt` (top-level) and every other
`data-f` textarea/input to `n.detail[f]` (arrange.js:1119-1127). Right-click
on a node (`nodeCtxMenu`, arrange.js:1084-1102) offers: add-notch items (one
per `NOTCH_ADD` entry, not read in this pass), cut/copy/paste, "open
settings" (stub — `toast('settings — not built yet')`), delete, plus
undo/redo items. `notchLabel(ph,nc)` (arrange.js:341-347) computes a notch's
displayed word (`'loop'` > `'out'` > `'in'` > `''`) purely from which cables
touch it — a notch carries no direction of its own.

Delete: `deleteSelectedNode()` (arrange.js:998-1007) refuses to delete a
`_live` node ("that region is live on the server — kill it from the roster,
not here") and otherwise removes the node plus every cable touching it.
Bound to the `Delete` key when the arrange view is active and focus isn't in
a text field (arrange.js:1044-1055), and to the right-click menu's "✕
delete". `deleteSelectedCable()` (arrange.js:994-997) is the cable
equivalent. Copy/cut/paste are node-only (arrange.js:1012-1032) — cutting or
copying a node deep-clones it (stripping `_` keys), a paste mints a fresh id
and fresh notch ids and drops any `regnode_id` binding.

### Phase UI

`renderRail()` (arrange.js:198-267) draws one column per phase: an editable
name, a "LIVE" toggle (`ph.active`, purely a preview flag), a "shared files"
list (add via prompt, remove via an undoable `×` button), a "loops ·
worktrees" section showing each computed `Loop`'s mirrored worktree names
(read-only) plus editable `maxCycles`/`maxCtx` inputs, a node count, and a
"+ phase" button that appends a new blank `Phase`. Clicking a phase column
selects it (clears node/cable selection); right-click opens `phaseCtxMenu`
(arrange.js:1110-1112, delete-only, guarded so the last phase can't be
deleted, `deletePhase` arrange.js:1036-1042).

### `currentPlan` / `syncSessionPlan` / `insertRegion` — exported signatures

- `export function currentPlan()` (arrange.js:1141) — no args, returns the
  selected plan as plain JSON (or `null` if unmounted), `_`-keys stripped.
- `export function syncSessionPlan(serverPlan)` (arrange.js:1340) — see
  Load/save/migrate above.
- `export function insertRegion(src)` (arrange.js:1684-1701) — the "add
  region" manual-entry seam (tracksettings.js, out of this phase's scope).
  Builds a `blankRegion` at a staggered position (`40+(k%5)*200,
  40+floor(k/5)*150` where `k` is the current node count), copies
  `name`/`model` plus every `REGION_FIELDS` entry off `src` via
  `regionGet`/`regionSet`, pushes it onto `phase().nodes`, saves, and
  re-renders only if the arrange host is currently active (`_host.classList
  .contains('active')`). Returns the inserted node, or `null` if the view
  hasn't mounted (`!S`) or has no phase.
- Also exported: `clearMap()` (arrange.js:275-283, resets to one blank
  phase), `mount(elHost, ctx)` (arrange.js:1485-1509), `refresh()`
  (arrange.js:1513-1525, re-renders then pulls a fresh `feed` frame),
  `onFrame(m)` (arrange.js:1649-1666), `onEsc()` (arrange.js:1706-1721).

### Reverse channel (roster → canvas)

`onFrame(m)` (arrange.js:1649-1666): `ade_init`/`track_list` →
`adoptRegions(m.tracks||[], prune=true)`; `track_created` →
`adoptRegions([m.track], prune=false)`; `feed` → stores `m.records` into
module-local `_feed` (never saved, never part of the plan) and re-renders if
the host is active. `adoptRegions` (arrange.js:1589-1644) either binds an
incoming server region to an already-authored node (matched by
`r.node_id === authored node's id`, setting `regnode_id`/`_rail` on that
node) or creates/updates a `_live` node positioned on a timeline-style
layout (`x` = minutes-since-earliest-region × `PX_PER_MIN=26`, `y` = roster
order × `LANE_H=150`, matching `timeline.js`'s own scale per the code
comment). A full roster frame (`prune=true`) removes any `_live` node whose
region left the roster and clears `regnode_id` off any authored node whose
bound region is gone.

---

## 5. REGION SHAPE

`static/js/ade/region.js` (116 lines).

### `REGION_STATUS` (region.js:41)

`['blank', 'idle', 'thinking', 'working', 'complete']` — the face-light
cycle order; both `arrange.js`'s status dot and the add-region window's
`<select>` read this one array.

### `NAME_MODEL` (region.js:46)

`['name', 'model']` — the two region fields the add-region window renders as
"IDENTITY" rather than in the generic region-field section; documented here
so a future renderer knows they're the deliberate exception.

### `REGION_FIELDS` (region.js:62-75)

| key | in | type | notes |
|---|---|---|---|
| `agent` | `detail` | `area` | |
| `track` | `node` | `text` | "the row this region sits on"; blank = own row |
| `wt` | `node` | `text` | worktree/branch |
| `notes` | `node` | `area` | |
| `status` | `node` | `status` | the face light |
| `stxt` | `node` | `text` | status text beside the dot |

Comment notes `job/input/output/permissions/git` fields were cut 2026-08-10:
`permissions` was dead (a free-text textarea could never satisfy the
overlay-rows list shape), `job/input/output/git` were carried-but-never-read
per `tracks.py`'s `CARRIED_FIELDS` contract.

### `blankRegion(id, canvas)` (region.js:103-116)

```
{ id,
  ...(canvas ? {x: canvas.x, y: canvas.y} : {}),
  name: '', model: '', notes: '', status: 'blank', stxt: '', wt: '', track: '',
  ...(canvas ? {notches: []} : {}),
  detail: { agent: '' } }
```
Canvas-only fields (`x`, `y`, `notches`) are added only when a `canvas`
argument is passed; manual entry (no `canvas` arg) gets none of them.

### `regionGet` / `regionSet` (region.js:81-93)

`regionGet(region, field)`: if `field.in==='detail'` reads
`region.detail[field.key] || ''`, else reads `region[field.key] || ''`.
`regionSet(region, field, value)`: same branch, writes into `region.detail`
(creating the bag if absent) or directly onto `region`.

---

## 6. CABLE REDUCER

`static/js/ade/cables.js` (221 lines). Pure module — "no DOM, no state" per
its own header.

### `deriveCables(records, opts)` (cables.js:160-221, exported)

- `records`: array of ledger feed rows (`ade_snapshot()` rows), any order.
- `opts.roots`: `{regionId: rootPath}` — overrides the base path used to
  resolve that region's relative targets.
- `opts.nodes`: `{regionId: canvasNodeId}` — optional convenience, attached
  to output as `fromNode`/`toNode`; unused by arrange.js's own caller (it
  maintains its own region→node map instead, per arrange.js:477-482).
- `opts.home`: home directory string, for resolving a leading `~`.

Filters `records` to `isFiredFileAction` rows (cables.js:120-127): not a
`'turn'` kind, `action_type` is `'write'` or `'read'`, `outcome === 'fired'`,
`failed !== true`, and `payload.target` is a string with `region` set.
Sorts oldest-first (reverses the newest-first feed, then stable-sorts by
`stampOf` = `r.parked ?? r.resolved ?? r.started ?? 0`, cables.js:105-108).

Join: for each write, records it under its `resolveTarget(...)` key in a
`writes` map; for each read, for every earlier write to the same key from a
**different** region, gets-or-creates one cable keyed by `writerRegion + '
' + readerRegion` and pushes that read's evidence onto it (cables.js:176-217).
A write and read from the SAME region are not a cable (self-writes are
skipped, cables.js:192). "ONE CABLE PER REGION PAIR" regardless of how many
files/reads back it — files are the cable's `paths` payload, not its
identity (cables.js:149-158 comment, enforced by the `id = w.region + ' ' +
r.region` key).

### `resolveTarget(target, base, home)` (cables.js:90-99, exported)

A hand-written transliteration of `engine/read_tool.py:84`'s `_resolve`:
- non-string/empty `target` → `null`.
- expand a leading `~`/`~/` using `home` if given (`expandUser`,
  cables.js:67-71).
- absolute (`/...`) → `normPath(...)` (lexical `.`/`..` collapse, no
  filesystem access, cables.js:57-65).
- still-unexpanded `~...` (no `home` given) → `'rel:' + raw` — deliberately
  kept incomparable to a resolved absolute path.
- relative with a `base` → `normPath(base + '/' + ex)`.
- relative with no `base` → `'rel:' + normPath(ex).slice(1)` — namespaced so
  it can only match another baseless relative guess.

### Output shape

Array of:
```
{ id: "<writerRegion> <readerRegion>",
  from: writerRegionId, to: readerRegionId,
  fromNode: nodeId|null, toNode: nodeId|null,
  paths: [resolvedPathKey, ...],   // dedup, first-seen order
  count: number,                    // number of read events joined
  at: number,                       // most recent read's stampOf()
  edges: [{write: recordId, read: recordId, path: resolvedPathKey}, ...] }
```

---

## 7. ARRANGE POP-OUT

`static/js/ade/arrangewin.js` (59 lines). The sole module script of
`static/ade-arrange.html` (not read — out of scope).

### What it mounts

Imports `mount, refresh, onEsc` from `./arrange.js` (arrangewin.js:28). On
`DOMContentLoaded` (arrangewin.js:59), `boot()` (arrangewin.js:30-57) builds
a stub `ctx`, finds `#view-arrange` in this window's own document, calls
`arrange.js`'s `mount(host, ctx)`, then immediately `refresh()` (no
hidden-mount deferral here — "this window's host is visible from the first
frame"). Escape key presses are routed straight to `onEsc()`
(arrangewin.js:54-56) — this window has no modal/alert chain to peel first.

### What it stubs

```
ctx = {
  send: () => {},                 // no-op — no socket in this window
  getTracks: () => [],
  getSession: () => null,
  showConfirm: (message, onYes, onNo) => native window.confirm(...),
  showPrompt: (message, defaultValue, onOk) => native window.prompt(...),
}
```
`send` being a no-op means `arrange.js`'s `pipePlan()` toasts
"no socket on this window — pipe from the ADE tab" and does nothing further
when triggered from this window (per arrange.js:1170's guard).

### How it shares state with the main tab

No socket at all. `arrange.js`'s plan lives in `localStorage` under
`arrangeMockD2`; because this pop-out is same-origin, both windows read/write
the same key and pick up each other's saves on reload — there is no live
sync while both are open simultaneously (each window's in-memory `S` is
independent between reloads).

---

## 8. DISCREPANCIES vs MAPDOCS

- `lane3-ade-frontend.md:119` states `region.js (117 lines)`. The file at
  `static/js/ade/region.js` is 116 lines (`wc -l` and the Read tool's last
  line both confirm 116). Off-by-one; everything else in that mapdoc entry
  (`REGION_STATUS` at :41, `REGION_FIELDS` at :62-75, `regionGet`/`regionSet`
  at :81-93, `blankRegion()` at :103-116) matches the code exactly.
- `lane4-panes-static.md:14` cites `imports currentDir from ./browser.js:10`.
  The import statement in `editor.js` is at line 11
  (`import { currentDir } from './browser.js';`), not tied to a line number
  in `browser.js` itself in the code — `browser.js` is outside this phase's
  code-folder list and was not read, so whether `currentDir` is exported at
  `browser.js:10` could not be checked here.
- All other line-anchored claims checked against code in lane1:35, lane3:
  66-79/113-121, and lane4:16 matched the current file exactly (arrange.js's
  `onFrame` at 1649-1666, `currentPlan` at 1141, `syncSessionPlan` at 1340,
  arrangewin.js and cables.js line counts (59, 221) both exact).
- Not a mapdoc discrepancy, but a code-internal one noticed in scope:
  `arrange.js`'s `bumpUidPast` (arrange.js:1309-1320) calls `bump(l.id)` on
  every entry of `ph.loops`, but the `Loop` objects `computeLoops` actually
  produces (arrange.js:179-180) carry only `{key, nodes, maxCycles, maxCtx}`
  — no `id` field. The call is harmless (the `bump` guard only acts on a
  string starting with `'k'`, and `undefined` fails that check silently) but
  is dead code against the current `Loop` shape.

## 9. UNKNOWNS

- `worker_transports.py`'s docstring (lines 12-27) documents a
  coordinator→worker `stop` event, but no code in `worker.py` or
  `worker_transports.py` sends one, and `worker.py`'s `_run` loop has no
  branch checking `event.get("type")=="stop"` after the initial `start`
  read (it never loops on `transport.recv()` again at all — one `start` in,
  one `done`/`error` out). Whether `stop` is sent from `_drain_worker` or
  elsewhere in `agent_loop.py`, or is simply unimplemented, was not
  determined — `agent_loop.py` outside `add_agent`/`_drain_worker` was not
  read in this pass.
  
- `preview.js`'s `loadHtml(content)` method (preview.js:66-68) has no caller
  inside `preview.js` itself. Whether `shell.js`, `boot.js`, or another pane
  calls it via the pane registry was not checked — those files are outside
  Phase 4's code-folder list.

- `arrange.js`'s notch perimeter functions `perimXY`/`xyToP` (referenced at
  arrange.js:427, 855 and elsewhere) and the exact meaning of a notch's `p`
  field were not read in this pass — out of the line budget for a field
  whose write/read sites were otherwise fully covered.

- `arrange.js`'s `openCableMenu`/`closeCableMenu`/`hideCableMenu`
  (cable-specific right-click action menu, arrange.js:705-712 and callers)
  and the `UNDO`/`REDO`/`snap`/`undo` mechanics were not read in full — their
  call sites and effects (e.g. "snap() first so ⌘Z walks it back") are
  visible throughout the file's comments but the undo-stack implementation
  itself was not verified line-by-line.

- Whether `HTTPChannel`/`WorkerHTTPTransport` are exercised anywhere in
  practice (i.e., whether `sess.settings['worker_transport']` is ever set to
  `'http'` by a caller) was not checked — no grep for `worker_transport`
  assignment sites was run; only `add_agent`'s own read of that setting was
  confirmed.
