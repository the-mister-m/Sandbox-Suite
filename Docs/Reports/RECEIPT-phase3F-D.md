# SESSION REVIEW — Sandbox Suite — Phase 3F job D — file interactions

Timestamps: ask Brandon.

## EDITS

- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — one apply path, file-mode multi-select, the element API, menu and keys

## STRAY FILES

- none

## GOALS DONE

- `applyPatches(cv, patches)`: every patch to the live `idoc` through
  `applyToDoc`, then to a working copy of `cv.source` through `apply`. A
  refusal rolls the live document back and leaves the source untouched.
- `cv.history` filled with `patch.history()`, created in `loadFileMode`,
  taken from the tab record when B restored one, carried by `stash`.
- `patchSource` reads `apply`'s `{text, inverse}`, not a string. Job C's
  flagged breakage is closed.
- set-full-source applies, pushes its inverse, then reloads the iframe.
- `loadFileMode` runs `patch.normalize` before the srcdoc, so the iframe
  and the source carry the same ids.
- `fileUndo` / `fileRedo`: inverses in reverse, patches forward, no push.
- `cv.selection` is an array in file mode. Chrome painted for every id.
  Click replaces, shift-click toggles, Escape clears, marquee on empty
  ground in canvas mode with shift extending.
- Drag moves the whole selection, one `set-style` per id in one call.
- `frame._canvas` gains undo, redo, group, ungroup, move, forward, back,
  front, toBack, remove, duplicate.
- Context menu on an element: Group, Ungroup, Bring forward, Send
  backward, Bring to front, Send to back, Duplicate, Delete, through the
  shared `openMenuItems`; doc mode's `openMenu` calls the same function.
- Keys per P3: Delete, arrows (shift ×10), cmd-Z, shift-cmd-Z, cmd-G,
  shift-cmd-G, cmd-], cmd-[, shift for front and back, cmd-D, cmd-S,
  Escape. Canvas mode only, never while editing text.
- Doc mode: no function removed, none re-signatured. `openMenu` keeps its
  signature and builds the same element.

## BLOCKED — patch.js, not touched

- `doMove` ([static/js/widgets/codecanvas/shared/patch.js](../../static/js/widgets/codecanvas/shared/patch.js), the `move` kind)
  records `index: oldIndex` as the element's slot **with itself still in
  the list**, while the forward application resolves `patch.index` against
  the sibling list **before the element is detached**. The two readings
  agree only when the move goes toward the end of the list.
  - Bring forward and Bring to front apply and undo correctly.
  - Send backward and Send to back apply correctly; **the undo is a
    no-op**. `[A,B,C]` → send B back → `[B,A,C]`; the inverse `move
    {index: 1}` resolves to `A` and inserts B before `A` again.
  - The fix is one line in `doMove`: detach the element before computing
    `ref`, so `index` means the final slot in both directions. Job C owns
    that file; I did not touch it.
  - I shipped the four order functions anyway: the kind exists, forward
    application is correct in every case, and the alternative was a dead
    menu and dead cmd-[ / cmd-]. The defect is undo-only and named here.

## BRANDON'S TODOS

- Rule the `doMove` inverse above — C reopens, or it ships with the known
  undo gap on Send backward / Send to back.
- The headed walk was not run: my tool gate allows Bash only for grep and
  `node --check`, so no browser was driven. Job H is the proof.
- Job B's note still stands: [phase3_headed.py:81](../tests/phase3_headed.py)
  mounts canvases with no `mode`, which is now `preview`.

## CLOSER REVIEW

- Gets copy of review, not a contract.
- `doMove` inverse — Brandon.
- Headed walk of scope section 6 lines 4 to 7 — job H.

## STAGES

- [x] Stage 1 — read and plan
- [x] Stage 2 — one apply path
- [x] Stage 3 — selection
- [x] Stage 4 — the API
- [x] Stage 5 — menu and keys
- [x] Stage 6 — check and receipt

## PICKS I MADE

- The guides layer gains `data-od-edit-bridge`, so patch.js counts it as a
  host node. Without it the layer is an element child of `body` in the
  live document and absent from the source, and the two disagree on every
  child index.
- The context menu element gains the same attribute, for the same reason,
  and carries inline styles duplicating `.cc-canvas-menu`. File mode's
  srcdoc has the guides sheet but not the chrome sheet, so the class alone
  would leave it unstyled. Doc mode is unchanged in look; it loses only
  the `:hover` tint on a row, which is class-only.
- `inChrome(target)` guards the pointer, click and contextmenu handlers so
  a press on the menu or the guides layer is not read as an element.
- Duplicate stamps a fresh `data-od-id` on every node of the copy before
  the patch, rather than leaving them stripped as the spec words it. Left
  stripped, `doInsert` generates its own random ids — separately in the
  live document and in the source — and the two copies diverge, so the
  `remove` inverse cannot find the element in both. Stamping keeps "fresh
  ids" and keeps the documents identical.
- Duplicate processes later slots first, so an earlier insert never shifts
  a slot still to come.
- The drag and the text edit rewind the live element to its pressed value
  before `applyPatches` runs. Both gestures write the DOM as they go; the
  inverse is read off the live element, so without the rewind cmd-Z would
  restore the value the gesture just produced.
- Ungroup selects the freed children. The group id is gone; the spec is
  silent on what replaces it.
- The marquee skips zero-area elements and anything inside the guides
  layer. It is drawn as `od-edit-guide-box od-edit-guide-box-hover`, the
  only dashed box the guides sheet offers.
- `keyup` is bound as the spec asks and closes an open menu on Escape
  release. File mode has no other key-release state; doc mode's keyup
  exists only for space-pan.
- An undo whose inverses refuse leaves the history pointer moved.
  `patch.history()` exposes no pointer restore.
- `fileMove(id, parent, index)` treats `index` as the final slot and
  converts it to patch.js's reference slot for a same-parent move, so job
  E can pass a plain tree index.
- The eleven `frame._canvas` methods fall back to the current selection
  when called with no ids.
- `applyPatches` pushes the inverses returned by the **live** document, not
  by the source. The two documents are identical after `normalize`, and
  the live one is what the eye checks.

## CONTRACT FIELDS ADDED

- `cv.fileMarquee` — the live marquee record in file mode, `{x0, y0,
  moved, node, base}`, null when none. Cleared by `loadTarget`.
- `cv.justDragged` — true after a drag release, suppresses the next
  click. Added to this list by the session agent after R-D.
- `cv.drag` grew `ids`, `items`, `startTransform`, `startDisplay`; the old
  single-element `el`/`prefix`/`baseTx`/`baseTy` moved onto each item.
- `data-od-edit-bridge` on the guides layer and on the context menu — an
  existing `HOST_NODE_SELECTOR` entry, newly worn by these two nodes.
- `frame._canvas`: `undo`, `redo`, `group`, `ungroup`, `move`, `forward`,
  `back`, `front`, `toBack`, `remove`, `duplicate` (scope 3.5).

## CHECKS

- `node --check static/js/widgets/codecanvas/canvas/canvas.js` after every
  stage — clean, last run after stage 6.
- No browser run. See BRANDON'S TODOS.
- One line each appended to
  [SESSIONLOG.md](../../SESSIONLOG.md) and [INDEX.md](../../INDEX.md).
