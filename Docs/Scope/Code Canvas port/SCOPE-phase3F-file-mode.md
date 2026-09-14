# SCOPE — Phase 3F — File Mode

Written 2026-09-13. Session agent Fable 5.1. Sits after Phase 3 (green
2026-09-12) and before the Phase 4 motion scope Brandon has not ruled on.

Phases 1 to 3 built an editor with no front door. Doc mode (.json, the
kit, widget types) has nothing that creates a document, and the kit was
never wanted. File mode (.html, the Open Design bridge port) is the
editor Brandon asked for: click any element, drag it, edit it, patch the
source. This phase finishes file mode and leaves doc mode parked.

## 1. Brandon's rulings, 2026-09-13

- Multiple .html targets open at once, as tabs on the Canvas widget.
- A new widget, Targets, that adds .html files to a canvas.
- Canvas opens in preview mode by default. Nothing edits by accident.
- No widget types. Group and layer like Adobe.
- No .json is needed for any of this.
- The port may write `data-od-id` attributes into the .html files it opens.
- Wrap and move mutate the live iframe DOM. Never reload the iframe.
- Tab edits are held in memory across switches.
- Cmd-Z survives a tab switch.
- Agents work in stages. One checkmark per stage in the receipt.
- No agent over 250K. Brandon is watching.

## 2. Session agent's picks

Marked so Brandon can red-pen them. Each is a pick, not a ruling.

- P1. Tabs live on the Canvas widget's own bar, under the button row,
  above the page tabs doc mode already draws.
- P2. "Like Adobe" is: a layers panel that is the DOM tree, group is
  wrap-in-div, order is move among siblings, shift-click and marquee
  multi-select, a context menu, keys. Align, distribute, lock, rename
  are not in this phase.
- P3. Keys: Delete, arrows nudge 1px (shift 10px), cmd-Z, shift-cmd-Z,
  cmd-G group, shift-cmd-G ungroup, cmd-] forward, cmd-[ back, shift
  for front and back, cmd-D duplicate, cmd-S save, Escape clears.
- P4. Ruled by Brandon 2026-09-13, "mutate": save writes the
  serialized source. First save reformats a hand-written file through
  the browser's serializer. Not a pick.
- P5. Undo is inverse patches applied live, not a reload. Only
  set-full-source (the Code widget) reloads the iframe.
- P6. Ungroup only works on a div the port made (`data-od-group`).
  Unwrapping arbitrary markup is refused.
- P7. A clean tab reopens from the server on switch; a dirty tab loads
  from memory. History survives when the reopened text matches the
  cached text, drops when it does not.
- P8. Save saves the active tab. The close prompt saves every dirty tab.
- P9. Models: sonnet on A, C, E, R; opus on B, D, H.
- P10. The Targets widget's row order is the tab order.

## 3. Contracts

Every job reads this section. Nothing here is renamed by a job. A job
that needs more adds a field and names it in its receipt.

### 3.1 Canvas options (job B)

- `targets`: array of path strings, tab order. New. Default `[]`.
- `target`: the active tab. Unchanged.
- `mode`: default changes from `canvas` to `preview`.
- On mount, a `target` absent from `targets` is appended. On
  `onOption("targets")`, an active `target` absent from the new list
  switches to the first entry, else `""`.
- A tab switch is `stash(cv)` then `frame.setOption("target", path)`.
- After any file-mode load completes, the canvas emits `canvas.focus`
  `{}` and `canvas.doc` `{mode, path}` so Tools, Code and Targets follow.

### 3.2 Tab cache (jobs B, C, D)

`cv.tabs[path]` holds one record per target the instance has opened:

    { text, dirty, selection, scroll: {left, top}, history }

- `text`: the source as the canvas holds it (file mode: serialized
  with ids; doc mode: the doc JSON text).
- `history`: null until job D, then a `patch.history()` object (3.3).
- Written by `stash(cv)` on leaving a tab. Read on arriving per P7.
- `loadTarget` no longer wipes selection and history when a record
  exists for the path.

### 3.3 patch.js (job C)

Additions to `MX.canvasPatch()`. Existing exports keep their names.

- `applyToDoc(doc, patch)` → `{ok, inverse}`. Mutates `doc`. Every
  kind but set-full-source. `apply(text, patch)` becomes parse,
  applyToDoc, serialize. One code path for the live document and the
  source. `apply` returns `{text, inverse}`; a refused patch returns
  the input text and `inverse: null`.
- New kinds. `parent` is an id or `"__body__"`. `index` counts element
  children that are not host nodes.
  - `wrap {ids, id}`: ids must be siblings; a `<div data-od-id=id
    data-od-group="1">` inserted at the first one's slot, the ids moved
    in, document order kept. Inverse `unwrap {id, slots}`, slots the
    original index of each child. Added after R-C, 2026-09-13.
  - `unwrap {id, slots?}`: the element's children move out into its
    slot, or each to its `slots` index when present, the element is
    removed. Refused unless `data-od-group`. Inverse `wrap`.
  - `move {id, parent, index}`: inverse `move` back.
  - `remove {id}`: inverse `insert {parent, index, html}`.
  - `insert {parent, index, html}`: html is one root; inverse `remove`.
- Inverses of the five existing kinds: set-style with the prior values
  (`""` where absent), set-text with the prior text, replace-outer-html
  with the prior outerHTML, set-css-token with the prior value,
  set-full-source with the prior text.
- `normalize(text)` → `{text, n}`: parse, assignIds, serialize. The
  canvas calls it once on load; the file gains ids on first save.
- `newId(prefix)` → `prefix_xxxxxx`, six lowercase alphanumerics.
- `history()` → `{push(entry), undo(), redo(), canUndo(), canRedo(),
  clear()}`. An entry is `{patches: [], inverses: []}`. `undo()` returns
  the entry to apply in reverse or null; `redo()` the entry to replay.

### 3.4 File-mode selection (job D)

- `cv.selection` is an array of ids in file mode too. Every file-mode
  painter handles N.
- Click replaces. Shift-click toggles. Marquee on empty ground in
  canvas mode: hits are elements fully inside whose parent is not
  fully inside; shift extends. Escape clears.
- Every change emits `canvas.select {ids}`. Tools, Code, Targets
  already listen.

### 3.5 Canvas API additions (job D)

On `frame._canvas`, file mode only, every one through a single
internal `applyPatches(cv, patches)` that: applies each to the live
`idoc` through `applyToDoc`, applies each to `cv.source` through
`apply`, pushes one history entry, marks dirty, emits `canvas.change`.

- `undo()`, `redo()`
- `group(ids)`, `ungroup(id)`
- `move(id, parent, index)`, `forward(ids)`, `back(ids)`, `front(ids)`,
  `toBack(ids)`
- `remove(ids)`, `duplicate(ids)`
- `patchSource(patch)` stays and routes into `applyPatches([patch])`.

### 3.6 Targets widget (job A)

- Type `canvas_targets`, label `Targets`, group `codecanvas`, file
  `static/js/widgets/codecanvas/targets/targets.js`.
- Options `{canvas: "focused", followTarget: ""}`. No `target` option;
  it never appears in the canvas target picker.
- Binds to a canvas exactly as Tools does (`canvasIdsFor`,
  `boundFrame`, follow on `canvas.focus` with the empty followTarget
  key). With no canvas: "No canvas on this surface."
- Rows are the bound canvas's `targets`, basename shown, full path as
  title, active row is its `target`. Click a row: `setOption("target")`.
  A × on each row removes it; removing the active one activates the
  next, else the previous, else `""`. Drag rows to reorder: one
  `setOption("targets")`. "+ Add": `MX.openRootBrowser("/", cb, {ext:
  [".html", ".json"]})`, append if absent, then activate.
- Re-renders on `surface.layout`, `canvas.focus`, `canvas.doc`.

### 3.7 Tools on .html (job E)

- When the bound canvas has no state (file mode), the library and page
  tabs are hidden and a section set to either falls back to tools.
- Layers on file mode is the DOM tree of `a.doc().body`: host nodes,
  the guides layer, script, style, template, link and meta skipped.
  One row per element: tag, `#id` or `.firstClass` when present, first
  four words of own text, indented by depth, `group` label on
  `data-od-group`. Selected rows from `a.selected()`.
- Click emits `canvas.select {ids: [id]}`. Shift-click toggles.
- Drag a row onto a row: top quarter moves before, bottom quarter
  after, middle into as last child. One `a.move(id, parent, index)`.
- Head buttons: Group (`a.group(selected)`), Ungroup
  (`a.ungroup(selected[0])`). Eye toggles `display: none` through
  `a.patchSource` set-style.
- Doc-mode layers untouched.

## 4. Jobs

| job | model | files owned | after |
|---|---|---|---|
| A targets widget | sonnet | targets/targets.js new, widgets.json one line | none |
| B canvas tabs | opus | canvas.js | none |
| C patch kinds | sonnet | patch.js | none |
| D file interactions | opus | canvas.js | B and C green |
| E tools layers | sonnet | tools.js | D green |
| R redpen | sonnet | none | each job |
| H headed walk | opus | Docs/tests/phase3F_headed.py, Docs/Reports/phase3F-headed/ | E green |

A, B, C run together. B and D both own canvas.js and never run
together.

## 5. Stages and receipts

Every spec is cut into stages. The agent finishes a stage, appends one
line to its receipt (`- [x] Stage N — label`), then continues. A
receipt with unchecked stages is a handoff, not a failure. At 200K
used with stages open: stop, write Docs/Handoffs/HANDOFF-phase3F-<job>.md,
leave the receipt. Hard cap 250K.

Receipt shape: SESSION REVIEW, plus STAGES (the checkmarks), PICKS I
MADE, CONTRACT FIELDS ADDED. Path Docs/Reports/RECEIPT-phase3F-<job>.md.
One line each to SESSIONLOG.md and INDEX.md.

## 6. The walk

Job H proves this, on a copy of nirvana-canvas.html in Docs/scratchpad,
never the original:

1. New surface. Add Canvas. It opens in preview, "no target".
2. Add Targets. It binds. "+ Add" the copy. A tab appears. The page
   draws. Clicks do nothing.
3. Add a second small .html. Two tabs. Switch. Switch back.
4. Canvas mode. Click an element. Tools inspector shows it. Layers
   shows the tree with that row lit.
5. Shift-click a sibling. Cmd-G. Layers shows a group row holding both.
6. Cmd-[. The group moves back one. Cmd-Z twice. Both undone.
7. Edit text on tab one. Switch to tab two. Switch back. The edit is
   there. Cmd-Z undoes it.
8. Cmd-G the pair again. Save. Status reads saved. The file on disk
   has ids, the text edit and the group. Reworded after H run 3: line
   7's edit drops the redo stack, so the group is remade, not redone.
9. Reload the page. Two tabs return. Preview mode. Nothing lost.
10. Console clean the whole way.
