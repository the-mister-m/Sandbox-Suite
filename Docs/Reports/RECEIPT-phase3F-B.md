# SESSION REVIEW — Sandbox Suite — Phase 3F job B — canvas tabs

Timestamps: ask Brandon.

## EDITS

- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — targets option, tab row, tab cache, save-all

## STRAY FILES

- none

## GOALS DONE

- `targets` option, tab order, default `[]`; `mode` default now `preview`.
- Tab row `.mxcv-targets` between the bar and doc mode's page tabs.
- Tab cache `cv.tabs[path]` with text, dirty, selection, scroll, history.
- Dirty tab reloads from memory, clean tab reopens from the server.
- File-mode loads emit `canvas.focus` then `canvas.doc`.
- Save-all on close, prompt names every dirty basename.

## BRANDON'S TODOS

- Phase 3's headed harness mounts canvases with no `mode`
  ([phase3_headed.py:81](../tests/phase3_headed.py)), so its doc-mode drag and
  select lines now open in preview and will fail until the harness sets
  `mode` to `canvas`. Consequence of the preview-by-default ruling, not a
  code fault. Job H or Brandon decides who edits the harness.
- Live browser check of the tab switch not run — see CHECKS.

## CLOSER REVIEW

- Gets copy of review, not a contract.
- Confirm the preview-by-default fallout on phase3_headed.py — Brandon.
- Job D fills `cv.history`; it is carried as `null` here — closer, no action.

## STAGES

- [x] Stage 1 — read and plan
- [x] Stage 2 — options
- [x] Stage 3 — tab row
- [x] Stage 4 — the cache
- [x] Stage 5 — save and close
- [x] Stage 6 — check and receipt

## PLAN — functions in canvas.js that change

New:
- `stash(cv)` — write the leaving tab's record into `cv.tabs`.
- `restoreTab(cv, rec)` — selection, scroll, dirty, history from a record.
- `renderTargetTabs(cv)` — the `.mxcv-targets` row.
- `switchTab(cv, path)` — stash then `setOption("target")`.
- `saveRecord(cv, path, rec)` — one save frame for a cached record.
- `doSaveAll(cv)` — active tab plus every dirty record.

Changed:
- `ensureStyles` — `.mxcv-targets` rule.
- `MOD.defaults` — `targets: []`, `mode` default `"preview"`.
- `MOD.mount` — `cv.tabs`, `cv.targets`, `cv.history`, the targets row in the
  wrap, append an absent `target` to `targets`.
- `MOD.onOption` — `targets` key; `target` key redraws the tab row.
- `MOD.getOptions` — returns `targets`.
- `MOD.canClose` — dirty across all tabs, names them, saves all.
- `MOD.onFrame` `saved` — clears a cached record's dirty.
- `renderBar` — calls `renderTargetTabs`.
- `loadTarget` — stash on leave, cache lookup, dirty record skips the server.
- `loadDocMode`, `loadFileMode` — restore from the record; file mode emits
  `canvas.focus` before `canvas.doc`.

## PICKS I MADE

- `mount`'s invalid-`mode` fallback changed from `"canvas"` to `"preview"`,
  to match the new default.
- History is kept when `docText(cv)` after the load equals `record.text`.
  Job C's `normalize` does not exist yet, so file mode compares raw text;
  doc mode compares the re-serialized state JSON.
- `restoreTab` also restores `dirty` from the record, so a tab returned to
  from memory reads "dirty" rather than "loaded".
- `onOption("target")` redraws the tab row before loading, so the lit tab
  moves even before the core resolves.
- Close prompt body: basenames joined by commas, "has" for one and "have"
  for more. The old body used the full path.
- `doSaveAll` saves the active tab unconditionally, as the spec words it,
  even when only a cached tab is dirty.
- The `saved` frame carries no content
  ([ade/web_io.py:163](../../ade/web_io.py)), so the spec's other-instance
  rule — clear a cached record's dirty when its text equals the saved
  content — is written with a `typeof msg.content === "string"` guard and
  never fires against today's server. Our own saves clear the record by
  comparing against the content we sent.

## CONTRACT FIELDS ADDED

- `cv.targets` — array of path strings, the tab order (scope 3.1).
- `cv.tabs` — the tab cache, `Object.create(null)` (scope 3.2).
- `cv.targetsEl` — the tab row element.
- `cv.history` — carried as `null`; job D fills it (scope 3.2).

## CHECKS

- `node --check static/js/widgets/codecanvas/canvas/canvas.js` after every
  stage — clean, last run after stage 6.
- A server answers on 127.0.0.1:5000 (it was already running; I did not
  start it). The live tab-switch walk was not run: my tool gate allows Bash
  only for grep and `node --check`, so no browser was driven. Job H's headed
  walk is the proof.
- No function was removed or re-signatured. `loadDocMode`, `loadFileMode`,
  `doSave`, `renderTabs`, `setPage`, `renderBar` keep their signatures.
  Behaviour changed in `loadTarget`, `canClose` and the `saved` handler.
