# RECEIPT — D10 — Tabs, targets, settings trickle

Job 10, after Wave 4. Spec: [SPEC-D10-tabs-targets.md](../Specs/SPEC-D10-tabs-targets.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Receipts read first: [D1](RECEIPT-D1-settings.md), [D3b](RECEIPT-D3b-sockets.md),
[D3c](RECEIPT-D3c-end-closes-sockets.md), [D4](RECEIPT-D4-suite-library.md),
[D5](RECEIPT-D5-matrix.md), [D6](RECEIPT-D6-chat-queue.md),
[D7](RECEIPT-D7-editor-terminal.md), [D8](RECEIPT-D8-browser-viewer.md).

## PARTS

Done: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11. None partial. None untouched.

## EDITS

### Moved — Part 1, one widget folder standard

Every widget now lives at `static/js/widgets/<name>/<name>.js`. Content moved
unchanged except where a later part is named. `static/js/matrix/widgets/` is
gone.

- [static/js/widgets/chat/chat.js](../../static/js/widgets/chat/chat.js) — was
  `matrix/widgets/chat.js`. Parts 2, 3, 7, 9 folded in, below.
- [static/js/widgets/mini-queue/mini-queue.js](../../static/js/widgets/mini-queue/mini-queue.js) —
  was `matrix/widgets/mini-queue.js`. Part 2 folded in.
- [static/js/widgets/queue/queue.js](../../static/js/widgets/queue/queue.js) —
  was `matrix/widgets/queue.js`. Part 2 folded in.
- [static/js/widgets/editor/editor.js](../../static/js/widgets/editor/editor.js) —
  was `matrix/widgets/editor.js`. Rewritten for Parts 2, 4, 5, 6, 7.
- [static/js/widgets/terminal/terminal.js](../../static/js/widgets/terminal/terminal.js) —
  was `matrix/widgets/terminal.js`. Rewritten for Parts 2, 3, 4, 6.
- [static/js/widgets/stub/stub.js](../../static/js/widgets/stub/stub.js) —
  was `matrix/widgets/stub.js`. Unchanged.
- [static/js/widgets/shared/gate-common.js](../../static/js/widgets/shared/gate-common.js) —
  was `matrix/widgets/gate-common.js`. `settleButtons` line 82 gains `region`
  and sends `inst` (Part 2).
- [library/registry/widgets.json](../../library/registry/widgets.json) — every
  row gains `path`, the widget's own file. Eight rows.
- [static/matrix.html](../../static/matrix.html) lines 31-43 — script tags
  repointed at the new folders; shared modules first.

### [ade/frames.py](../../ade/frames.py)

- line 200 — `AdeCtx.mirror` becomes `AdeCtx.mirrors`, a region id to Region
  map. One socket, many followed regions (Part 3).
- line 265 — `_anchor` posts waiting gates with the region id (Part 2).
- line 287 `_follow(ctx, region)`, line 297 `_unfollow(ctx, region_id)` — new.
- line 305 `disconnect` — drops every followed region, not one mirror.
- line 529 `_WRITE_REFUSALS`, line 532 `_write_refused` — a write result that
  did not land (Part 5).
- line 541 — `handle` reads `_inst` off the frame; every reply echoes it.
- lines 772, 776, 802, 811, 828, 836 — `feed`, `ledger_detail`, `transcript`,
  `tree`, `file`, `saved` replies carry `inst`.
- line 836 — `saved` carries `ok`; a refused write no longer fans `tree_dirty`
  or notifies the queue (Part 5).
- line 974 `input` — takes `track` and `shell`, writes to that tab's own PTY.
- line 982 `close_shell` — takes `track` and `shell`; a key closes one PTY.
- line 987 — `focus` and `follow` are one handler, and it adds rather than
  replaces. line 996 `unfollow` — new.

### [ade/tracks.py](../../ade/tracks.py)

- line 162 `MirrorView.term(data, shell, region)` — output is tagged with the
  tab's shell key.
- line 183 `MirrorView.speak` — now tags a `speak` mirror frame instead of
  dropping it, so a followed region's speech reaches its own chat instance.
- line 247 `TrackHub.term(data, shell, region)` — the fanout carries both.
- line 271 `TrackHub.ask` — the ask frame carries `region` (Part 2).
- line 404 `Region._shells` — one PTY per shell key, replacing `_shell`.
- line 421 `shell_master(key="")` — spawns and pumps one PTY per key (Part 4).
- line 466 `close_shell(key=None)` — `None` closes every shell on the region,
  which is what every existing caller means; a key closes that one.
- line 905 `Environment.settings` — the session tier, seeded from
  `session_defaults()`, every key unset so it inherits global (Part 9).

### [ade/web_io.py](../../ade/web_io.py)

- line 133 `send_transcript(..., inst)` — reply carries `inst` and `region`.
- line 143 `send_feed(..., inst)`, line 153 `send_file(..., inst)`,
  line 158 `send_tree(..., inst)`.
- line 163 `send_saved(..., inst, ok)` — `ok` is the gate outcome.
- line 214 `send_gate_broadcast` — carries `region` beside `track`.

### [engine/web_io.py](../../engine/web_io.py)

- line 35 `ask(prompt, region="")`, line 66 `post_gate(gid, prompt, region="")`
  — a gate row carries its region.
- line 98 and line 138 `_push_pending_locked` — `ask` and every `gate_pending`
  row name their region. No gate row draws blank (Part 2).
- line 162 `term(data, shell, region)` — shell output is addressable.
- line 218 `send_ledger_detail(detail, inst)`.

### [engine/settings.py](../../engine/settings.py)

- line 183 — `GLOBAL_DEFAULTS` gains `widget_defaults`, one entry per widget
  type (Part 9).
- line 473 `_row_defaults` — the old body of `widget_defaults`.
- line 484 `WIDGET_DEFAULTS_KEY`, line 487 `_widget_block`.
- line 496 `widget_defaults(type, bag, conf)` — rows, then global.json, then
  the session bag. line 504 `widget_defaults_all(bag, conf)`.

### [server.py](../../server.py)

- line 188 — `_gate_notifier` resolves the region first and hands it to
  `post_gate`.
- line 1295 `api_widget_registry` — takes `?sid=`, serves that session's
  trickled widget defaults.
- line 1504 to 1611, one labeled block, "grid state and session settings —
  Job 10, tabs and targets", inserted after Job 8's block:
  - line 1504 `GRIDS_DIR` — `library/grids`.
  - line 1507 `_grid_name`, line 1514 `_grid_path`, line 1519 `_grid_body`.
  - line 1539 `GET /api/grid/<sid>/<window_id>` — the stored grid, or null.
  - line 1551 `PUT|POST /api/grid/<sid>/<window_id>` — write.
  - line 1566 `DELETE /api/grid/<sid>/<window_id>`.
  - line 1578 `GET /api/session-settings/<sid>` — bag plus effective values.
  - line 1588 `POST /api/session-settings/<sid>` — writes named session keys.
  - line 1607 `GET /api/widget-defaults` — the trickled block for a session.

### [static/js/matrix/grid.js](../../static/js/matrix/grid.js)

- line 26 `gridUrl` replaces `storeKey`. `localStorage` is gone (Part 8).
- `load(sid)` and `save()` — the server holds one grid per session per window.
  A window with no stored grid starts blank.
- `bindSession` and `rebind` are async against that load.
- `removeWidget(id)` — asks `canClose()` first and leaves the widget mounted
  when it refuses (Part 6).

### [static/js/matrix/widget-frame.js](../../static/js/matrix/widget-frame.js)

- `WidgetFrame.prototype.canClose` — new, the pre-close hook. A module's
  `canClose(frame)` may answer a promise; anything but `false` allows removal.

### [static/js/matrix/registry.js](../../static/js/matrix/registry.js)

- `MX.widgetPath(type)` — new, reads the registry row's path.
- `MX.loadRegistry(sid)` — passes `sid` so defaults arrive already trickled.

### [static/js/matrix/ui.js](../../static/js/matrix/ui.js)

- `MX.ui.choose(title, message, buttons, extra)` — a modal that answers; the
  pre-close hook's Save / Discard / Cancel and the terminal's one question.
- `MX.ui.askText(title, label, placeholder)` — a text prompt that answers.

### [static/js/matrix/main.js](../../static/js/matrix/main.js)

- One state comment on `bind`: the grid restores itself from the server.

### [static/js/widgets/shared/monaco-readonly.js](../../static/js/widgets/shared/monaco-readonly.js)

- `MX.monacoReady` — the memoized loader promise, exported so the editor
  mounts a writable instance from the page's one loader (Part 7).

### [static/js/widgets/shared/model-picker.js](../../static/js/widgets/shared/model-picker.js), new

- `MX.mountModelPicker(host, {value, onPick})` — provider, then model, then
  version, three nested selects over `GET /api/library/models` (Part 11).

### [static/js/widgets/browser/browser.js](../../static/js/widgets/browser/browser.js)

- line 52 `openInWidget` — Open in Editor and Open in Viewer add a tab to an
  open instance, mounting one first if none exists (Part 4).
- `tree` and `rename` sends carry `inst` (Part 2).

### [static/js/widgets/viewer/viewer.js](../../static/js/widgets/viewer/viewer.js)

- A tab strip: `openTab`, `closeTab`, `renderTabs`. `frame.openTab(path)` is
  the browser's entry point. Tab list rides the options as `tabs` (Parts 4, 8).
- Tab styles added to the widget's own style block.

### [static/matrix.html](../../static/matrix.html)

- Vendored `marked` and `DOMPurify` replace the two cdnjs tags (Part 10).
- `shared/model-picker.js` added.

### [static/vendor/marked/marked.min.js](../../static/vendor/marked/marked.min.js), [static/vendor/dompurify/purify.min.js](../../static/vendor/dompurify/purify.min.js), new

marked 12.0.2 and DOMPurify 3.0.11, the exact versions D6 pinned. No CDN tag
remains on the page.

### [static/js/suite/suite.js](../../static/js/suite/suite.js)

- The Update Default modal reads the selected session's own tier through
  `GET /api/session-settings/<sid>` and falls back to the form only when no
  session is selected (Part 9).

### [Docs/tests/test_targets_tabs.py](../tests/test_targets_tabs.py), new, 64 tests

Parts 2, 3, 5, 6, 8, 9 and 11, plus the folder standard, the banned words, a
`node --check` on every widget file, and the one-Monaco-loader check.

### Tests updated for the move

- [Docs/tests/test_chat_queue.py](../tests/test_chat_queue.py) — `WIDGET_DIR`
  and every filename follow the new folders; `test_the_markdown_library_is_pinned`
  becomes `test_the_markdown_libraries_are_vendored` and asserts no cdnjs.
- [Docs/tests/test_editor_terminal.py](../tests/test_editor_terminal.py) —
  same path change; the terminal frame test now names `follow` and `unfollow`
  in place of `focus`.

## DELETED

- `static/js/matrix/widgets/` — the seven files moved to
  `static/js/widgets/<name>/`, then the empty directory removed.
- `ade/frames.py` — `AdeCtx.mirror`, the single-mirror slot.
- `ade/tracks.py` — `Region._shell`, the single-PTY slot.
- `static/js/matrix/grid.js` — `storeKey` and every `localStorage` call.
- `static/js/widgets/editor/editor.js` — its own Monaco loader
  (`ensureMonacoLoaded`), `showSaveFilePicker`, `writeAndAnnounce`,
  `saveDetached`, and the fallback markdown renderer. Job 8's loader and the
  page's `marked` stand in their place.

## TESTS

Command: `python3 -m pytest Docs/tests -q`

    240 passed in 0.55s

176 before this job. 64 new, all in `test_targets_tabs.py`. Two existing test
files changed for the folder move and the vendored libraries; no existing
assertion changed meaning beyond the two the spec's own parts require.

## DECISIONS

Every choice the spec left open, numbered.

1. `gate-common.js`, `monaco-readonly.js` and `model-picker.js` are not
   widgets, so they went to `static/js/widgets/shared/` rather than a folder
   of their own. Part 1 says every widget lives in `<name>/`; it does not say
   where a shared module goes.
2. Registry rows carry the new path under a `path` field. Part 1 says
   "registry entries point at the new paths" without naming the field.
   `MX.widgetPath(type)` reads it. Nothing loads a widget from it yet — the
   script tags in `matrix.html` still do that — so the field is the pointer the
   spec asked for, not a loader.
3. The target field is `inst`, carrying the instance id, on both the request
   and the reply. Job 8's `tag` on `tree` is untouched and rides beside it, so
   the browser widget keeps working exactly as its receipt describes.
4. Part 3's live pill means "this instance is streaming its own region."
   Every chat instance follows on mount, so the pill is on for all of them; it
   is the retake button when a follow is dropped. Named as the spec allows.
5. `focus` and `follow` are one handler and it adds a mirror rather than
   replacing one. The old exclusive `focus` had one mirror per socket, which is
   the limit Part 3 removes. `unfollow` is the new frame that drops one.
6. Per-tab PTYs needed a keyed shell registry, which lives on `Region` in
   `ade/tracks.py`. The spec names `ade/frames.py` as in the lane for Part 3;
   Part 4's "one PTY per tab" has no in-lane home, and duplicating the spawn
   code into `frames.py` would have been worse. `close_shell(None)` keeps every
   existing caller's meaning.
7. `MirrorView.speak` used to return `None`, so a followed region never spoke.
   With every chat instance now on a mirror rather than the socket anchor, it
   tags a `speak` frame. A non-browser tts engine still sends `audio` at the
   socket level only; a mirrored instance will not play rendered audio. Named,
   not fixed.
8. Part 7 says the editor imports Job 8's loader, but that module mounts
   read-only. Exported `MX.monacoReady` — the memoized loader promise — and the
   editor creates its writable instance from it. One loader, two mount styles.
9. Editor tabs are one Monaco instance with one model per tab, not one editor
   per tab. Fewer instances, same behaviour.
10. Part 5 removes the file picker, so a new buffer has no path. Save on a
    pathless tab asks for one through `MX.ui.askText` and then sends the same
    server-side `save`. No local write anywhere.
11. `saved` gained an `ok` field. The old reply carried only a result string
    the client had to pattern-match. A refused write also no longer fans
    `tree_dirty` or notifies the queue, since nothing changed on disk.
12. The pre-close hook is a module's optional `canClose(frame)`, and the frame
    wraps whatever it returns in a promise. Anything but an explicit `false`
    allows removal, so no existing widget had to change.
13. Grid state is stored at `library/grids/<sid>/<window_id>.json` — a file per
    window, so a session's windows never collide and a session that comes back
    from an archive finds its layouts. Part 8 names the route, not the store.
14. `GET /api/grid/...` answers `{"grid": null}` rather than 404 for a window
    with no stored grid, because "starts blank" is the normal case, not an
    error.
15. The session settings bag lives on `Environment` in memory. Part 9 says
    seeded at creation, editable live, switchable mid-session; it does not say
    it survives a restart, and nothing archives it.
16. Widget defaults sit in `global.json` under `widget_defaults` and in the
    session bag under the same key, deliberately outside the thirteen
    `SESSION_KEYS`. Adding a fourteenth session row would have broken the
    thirteen-key contract the scope sets and a standing test asserts. The
    trickle is still global to session to widget.
17. Widgets keep their module-level `defaults` object. The registry's trickled
    defaults win outright wherever they are non-empty, which is the rule Job 5
    already set; `global.json`'s new block is how a type stops carrying its own.
18. Part 11: the only place Phase 2 picks a model today is the model manager
    table, which the spec says to leave alone. The nested picker ships as
    `MX.mountModelPicker`, a shared module loaded on the matrix page, so the
    next screen that picks a model has it. Nothing was rewired to use it.
19. The chat reads its voice from `GET /api/session-settings/<sid>` instead of
    `GET /api/global`, which is Part 9's "voice reads the session tier" and
    closes D6's question 3 and D4's question 2.
20. Bash was used twice outside pytest: `rm` on the seven relocated widget
    files, because no delete tool exists and Write cannot remove a file; and
    `curl` to fetch the two vendored libraries in Part 10. Every read and every
    edit went through the Read, Edit, and Write tools.

## CONFLICT NAMED ONCE

A harness system-reminder told me to do reads and edits through bash rather
than the Read, Edit, and Write tools. The spec's Rules and the job instruction
say the opposite and told me to follow them and name the conflict here. Every
read and edit above is a tool call, visible in the transcript. Jobs 1, 3a, 3b,
3c, 4, 5, 6 and 8 each named the same conflict.

## OUTSIDE THE LANE, NOT DONE

- `static/js/ade/` — untouched. It still opens the retired `/ws/ade` and now
  also sends the old exclusive `focus`, which has become an additive `follow`.
  D3b's question 1 stands.
- `engine/daemon_queue.py` — untouched.
- The model manager table in `static/js/suite/library.js` — untouched, as Part
  11 says. The provider's hidden filter is untouched; D4's question 4 stands.
- `library/registry/providers.json` — untouched.
- `ade/tracks.py`'s archive path does not carry the session settings bag or
  the stored grids. Neither was asked for.
- `GET /api/fs/read`'s 256 KB cap still applies to the viewer — D8's question 9.

## PHASE 3

- A mirrored region cannot play rendered audio from a non-browser tts engine.
  Decision 7.
- The session settings bag does not survive a restart. Decision 15.
- Widget defaults are a global block and a session block; no UI edits either.
- The nested model picker exists and nothing calls it. Decision 18.
- A stored grid is never pruned when a session ends; `library/grids/<sid>/`
  outlives the session that wrote it.

## STRAY FILES

- None. `library/grids/` is created on the first write and the grid tests
  redirect `server.GRIDS_DIR` at `tmp_path`, so no grid file was written into
  `library/`.
- No new directories under `archives/` in this window.
- `Docs/tests/__pycache__` is pre-existing.
