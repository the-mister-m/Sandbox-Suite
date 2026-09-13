# SPEC F2 — Shared modules

Goto agent. Ceiling 140 thousand tokens. Receipt before 170. Comments are
label, function, state only. "spine" is a banned word. No README files.

This is a move. No behavior changes except the two named in section 6.

Read in this order, nothing else:

1. This spec.
2. static/js/widgets/shared/model-picker.js. The idiom every new shared
   file matches: IIFE, one export on `window.MX`, contract comment at top.
3. static/js/matrix/widget-frame.js lines 1 to 60.
4. static/js/widgets/mount/mount.js.
5. static/js/widgets/devagent/devagent.js.
6. static/js/widgets/timeline/timeline.js.
7. Docs/audit/arrange-old/cables.js.
8. Grep `model-picker.js` across static/ and templates to find where shared
   files are loaded. New files load the same way, same place.

## 1. shared/root-browser.js

`MX.openRootBrowser(start, commit, opts)`. Devagent's `openRootBrowser`
plus its `ROOT_CSS`, `ensureRootCss`, `el` helper, moved as is. CSS id
becomes `mx-root-browser-css`. Class names stay.

- Devagent: delete the copy, call `MX.openRootBrowser`.
- Timeline: delete its `openRootBrowser` and the `.tl-rootmodal` CSS block.
  Its one call site passes `(root || "/", commit, {})`.

## 2. shared/add-controls.js

`MX.mountAddControls(host, frame, opts)` returns `{ el, refresh(state) }`.
Lifted from devagent's `renderAddControls`, `rootField`, `inheritedRoot`.

`opts.mode`:
- `"track"` — name, root, `+ track` button. Sends `create_track`.
- `"region"` — name, root, model picker, `+ region` button. Sends
  `insert_region` on `opts.track()`. Disabled when that returns null.
- `"both"` — track name, region name, root, model picker, one button. Sends
  `create_track`, then on the `track_created` frame whose `row` matches
  sends `insert_region`. This is the mount widget's behavior. F1 makes
  `track_created` carry `row` on every create, so drop mount's
  "highest order row" guess and match on `row.name` plus pending state.

`refresh(state)` takes `{ sessionRoot, workspaceRoot, trackRoot }` and
repaints the inherited root placeholder.

- Mount widget becomes a caller in `"both"` mode. Its own form goes.
- Devagent calls `"track"` and `"region"` under its tree.
- Timeline: the two buttons in `#tlHeadActions` that dispatch
  `mx:open-devagent` are replaced by `"track"` and `"region"` controls.
  `opts.track()` returns the lane last right-clicked or selected, else null.
  This is one of the two behavior changes.

## 3. shared/settings-rows.js

`MX.settingsRows.create(frame, opts)` returns
`{ renderSettings(region, host), renderContext(kind, id, host),
   renderGates(region, host), renderPreset(region, host), onFrame(msg) }`.

`opts.state` is an object the caller owns. Required keys, documented one
line each at the top of the file: `railCatalog, gateEdges, modelRows,
presetNames, outputStyles, changePrompt, contexts, collapsedBlocks,
lastOut`. `opts.rerender` is a function the module calls after any state
change it makes.

Moves from devagent, as is: `BLOCK_OF, ALWAYS_ON_REGION_KEYS,
CLAUDE_FORCED_KEYS, CHOICES, PATH_KEYS, CHOICES_LIVE, choicesFor,
controlKind, contextKey, ensureContextBox, loadContext, saveContext,
railFor, modelDisplay, buildSettingRow, renderChangePrompt,
renderSettingsTab, renderContextBlock, renderGatesTab, renderPresetTab`,
and the row CSS (`.mx-dev-row` through `.mx-dev-change-prompt`) under id
`mx-settings-rows-css`. The `saved` frame handling moves into `onFrame`.

Devagent keeps: tree, rungs, tabs, region buttons, tree CSS, roster
bookkeeping, fetches at mount. It passes `frame._dev` as `opts.state`.

## 4. shared/derived.js

`MX.derived = { deriveFileHandoffs(records), deriveMessageHandoffs(rows),
mergeDerived(files, messages) }`.

- `deriveFileHandoffs` is `deriveCables` from cables.js, unchanged, over
  `feed` records.
- `deriveMessageHandoffs` returns `[]`. The arrange build fills it.
- `mergeDerived` returns a flat list of `{ from, to, wire, count, at,
  paths }`, `wire` is `"file"` or `"message"`.

Shape comment at the top of the file: fields and types, one line each.

## 5. LOADING

Add the four files where `model-picker.js` is loaded, before any widget
file. Same form, same order convention.

## 6. BEHAVIOR CHANGES, EXACTLY TWO

1. Timeline head actions mount real add controls instead of asking a
   devagent to open.
2. Mount widget matches on the returned `row` instead of guessing.

Nothing else changes what any widget does.

## 7. CHECK

- `node --check` on every file touched.
- Grep: no file under `static/js/widgets/` except `shared/` defines
  `openRootBrowser`, `renderAddControls`, `rootField`, `buildSettingRow`,
  `renderSettingsTab`, `renderContextBlock`, `renderGatesTab`,
  `renderPresetTab`, `deriveCables`.
- Grep: `mx:open-devagent` no longer dispatched from timeline's head
  actions. Lane right-click still dispatches it. F3 removes that.
- If the server is running, curl each new file's path and expect 200.

## 8. NOT IN SCOPE

- Any Python file.
- Timeline right-click, presets, change prompt. That is F3.
- Any widget not named here.

## 9. RECEIPT

`Docs/Reports/RECEIPT-F2-shared-modules.md`, session review format from
the global rules. Add one INDEX.md line per new shared file and one for
the receipt. Append one block to SESSIONLOG.md. Update the `static/js/
widgets/<name>/` line in the project CLAUDE.md map to list the four new
shared files. Nothing else in CLAUDE.md. Do not touch MEMORY.md.

If blocked, write what you have to the receipt and end your turn with
`BLOCKED: <one question>`.
