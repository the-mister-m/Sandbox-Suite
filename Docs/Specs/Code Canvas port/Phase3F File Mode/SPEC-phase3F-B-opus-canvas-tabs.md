# SPEC — Phase 3F — B — Opus — Canvas tabs

Written 2026-09-13. Runs with A and C. The Canvas widget holds many
targets, shows them as tabs, keeps each tab's edits in memory, opens in
preview.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md
sections 3.1, 3.2, and picks P1, P7, P8.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing
  else. Job D edits it after you; leave file-mode listeners alone.
- Doc mode keeps working. Every doc-mode path you touch, you re-run in
  your head against Docs/tests/phase3_headed.py's lines.
- Stages below. After each, append `- [x] Stage N — label` to
  Docs/Reports/RECEIPT-phase3F-B.md. At 200K with stages open: stop,
  write Docs/Handoffs/HANDOFF-phase3F-B.md. Hard cap 250K.
- Receipt in the SESSION REVIEW shape with STAGES, PICKS I MADE,
  CONTRACT FIELDS ADDED. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` canvas.js after every stage.

## Read, in this order

- The scope, sections 1, 2, 3.1, 3.2, 5, 6.
- static/js/widgets/codecanvas/canvas/canvas.js — whole. 60K. It is
  the job.
- static/js/widgets/codecanvas/shared/canvas-core.js :287-330 — the
  target control and mirrors.
- static/js/widgets/shared/mirror.js — whole.
- static/js/matrix/widget-frame.js :97-125 — setOption and applyOptions.

## Stage 1 — read and plan

Read the list. Receipt with STAGES unchecked and a plan naming which
functions in canvas.js change. Check stage 1.

## Stage 2 — options

- `MOD.defaults` gains `targets: []`. `mode` default becomes
  `"preview"`.
- `mount`: `cv.tabs = Object.create(null)`; `cv.targets` from
  `frame.options.targets`, arrays only. If `frame.options.target` is
  set and absent from `cv.targets`, append it and `setOption("targets")`.
- `onOption("targets", list)`: store; if the active target is absent
  from the list, `setOption("target", list[0] || "")`. Redraw tabs.
- `getOptions` returns `targets`.
- Check stage 2.

## Stage 3 — tab row

- A `div.mxcv-targets` between the bar and the page tab row. One
  button per target, basename, active lit, title = path. Hidden when
  `targets` is empty. Doc mode's page tabs keep their own row below.
- Click a tab: `switchTab(cv, path)` = `stash(cv)`, then
  `frame.setOption("target", path)`.
- `renderBar` also calls `renderTargetTabs`.
- Check stage 3.

## Stage 4 — the cache

- `stash(cv)`: when `cv.path` is set, write `cv.tabs[cv.path] = {text:
  docText(cv), dirty: cv.dirty, selection: cv.selection.slice(),
  scroll: {left, top} of the viewport or the iframe document's
  scrolling element, history: cv.history || null}`. `cv.history` does
  not exist yet; carry it as null. Job D fills it.
- `loadTarget(cv)`: before the reset block, `stash(cv)` if leaving a
  path. After the reset, look up `cv.tabs[target]`:
  - dirty record: skip the server `open`; call `loadDocMode` or
    `loadFileMode` with `record.text` directly.
  - clean record or none: send `open` as today.
- Both load paths, on completion: restore `selection`, `scroll`, and
  `history` from the record when one exists. Per P7, history is kept
  only when the loaded text, after the load's own normalization,
  equals `record.text`; else `history` is dropped. Job C's
  `normalize` may not exist when you build; compare raw text and note
  it in the receipt.
- After every file-mode load completes (both branches): `mirrors.focus
  .emit({})` then the existing `mirrors.doc.emit`.
- `reopenIfClean` and the `saved` frame handler: unchanged for the
  active tab. A `saved` for a cached path from another instance clears
  that record's `dirty` only if its text equals the saved content.
- Check stage 4.

## Stage 5 — save and close

- `doSave` saves the active tab, as today.
- `doSaveAll(cv)`: the active tab, then every cached record with
  `dirty`, one `save` frame each with the record's text. `saved`
  frames resolve them as today through `cv.pending`.
- `canClose`: dirty if the active tab or any cached record is dirty.
  The prompt body lists the dirty basenames. Save runs `doSaveAll`.
- Check stage 5.

## Stage 6 — check and receipt

- `node --check`. Against a running server if reachable: open a
  surface, set `targets` to two paths by hand through the options
  panel or `setOption`, switch, confirm the iframe swaps and the
  status line says loaded. If no server, say so and stop at the code.
- Receipt. Check stage 6.

## Done when

- A canvas with no target opens in preview, "no target", no tab row.
- Set `targets` to two .html paths: two tabs, first active, page drawn.
- Switch tabs: iframe swaps, status "loaded", `canvas.focus` and
  `canvas.doc` emitted.
- Drag an element on tab one in canvas mode (today's drag), switch,
  switch back: the element is where you left it, status "dirty".
- Close with a dirty tab: the prompt names it.
- Reload: two tabs, preview mode, same active tab.
- Doc mode on a .json tab still draws and still saves.
- node --check clean.
