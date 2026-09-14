# SPEC — Phase 3F — D — Opus — File-mode interactions

Written 2026-09-13. Starts after B and C are green through R. Multi-
select, group, order, delete, duplicate, undo, a context menu and keys,
all in file mode, all through one apply path that mutates the live
iframe and the source together.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md
sections 3.2, 3.3, 3.4, 3.5, picks P2, P3, P5, P6.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing
  else. patch.js is job C's; if a kind is missing or wrong, stop and
  write it in the receipt under BLOCKED, do not patch patch.js.
- Doc mode keeps working. Its listeners, menu and keys are separate
  functions; you add file-mode ones beside them, you do not merge.
- Stages below. After each, append `- [x] Stage N — label` to
  Docs/Reports/RECEIPT-phase3F-D.md. At 200K with stages open: stop,
  write Docs/Handoffs/HANDOFF-phase3F-D.md. Hard cap 250K.
- Receipt in the SESSION REVIEW shape with STAGES, PICKS I MADE,
  CONTRACT FIELDS ADDED. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` after every stage.

## Read, in this order

- The scope, sections 1, 2, 3.2 to 3.5, 5, 6.
- Docs/Reports/RECEIPT-phase3F-B.md and RECEIPT-phase3F-C.md — what
  they built and what they named.
- static/js/widgets/codecanvas/shared/patch.js — whole, as C left it.
- static/js/widgets/codecanvas/canvas/canvas.js — whole, as B left it.
  60K plus. It is the job.
- static/js/widgets/codecanvas/shared/canvas-core.js :242-272 — the
  iframe's id script.

## Stage 1 — read and plan

Receipt with STAGES unchecked and a plan naming the new functions.
Check stage 1.

## Stage 2 — one apply path

- `applyPatches(cv, patches)`: for each patch, `patch.applyToDoc(cv.idoc,
  p)` then `patch.apply(cv.source, p)`. Collect inverses. If any
  refuses, stop, set status "patch refused", undo the live ones already
  applied with their inverses, apply nothing to source. On success:
  `cv.source = text`, push `{patches, inverses}` to `cv.history`,
  `cv.dirty = true`, status "dirty", `mirrors.change.emit({})`,
  `markDirty`.
- `cv.history = patch.history()` created in `loadFileMode`, or taken
  from the tab record B restores. `stash` carries it (B left the field
  null; fill it).
- `patchSource(cv, patch)` routes into `applyPatches(cv, [patch])`.
  set-full-source is the one exception: apply to source, reload the
  iframe with `loadFileMode`, push its inverse.
- `loadFileMode`: `cv.source = patch.normalize(text).text` before
  building the srcdoc, so the iframe and the source share ids.
- `undo(cv)`: entry from `cv.history.undo()`; apply its inverses in
  reverse order to live and source, no history push. `redo(cv)` the
  patches forward. Both set dirty and emit change.
- Check stage 2.

## Stage 3 — selection

- `cv.selection` as an array in file mode. `paintFileSelection` draws
  chrome for every id. `onFileClick`: plain replaces, shift toggles.
  `onFilePointerDown` on an already-selected element keeps the set so
  a drag moves all of them; the drag applies one set-style per id in
  one `applyPatches` call.
- Marquee: pointer down on body or html in canvas mode starts it,
  drawn in the guides layer; up computes hits per scope 3.4.
- Escape clears. Every change emits `canvas.select {ids}` through
  `setSelection`.
- Check stage 3.

## Stage 4 — the API

- On `frame._canvas`: `undo`, `redo`, `group(ids)`, `ungroup(id)`,
  `move(id, parent, index)`, `forward(ids)`, `back(ids)`, `front(ids)`,
  `toBack(ids)`, `remove(ids)`, `duplicate(ids)`. Each builds patches
  and calls `applyPatches` once.
- `group`: `wrap {ids, id: patch.newId("grp")}`; refusal shows status
  "group needs siblings". Selection becomes the group id.
- `forward/back/front/toBack`: one `move` per id, computed from the
  live siblings before any applies.
- `duplicate`: one `insert` per id, `html` = the element's outerHTML
  with every `data-od-id` stripped, at index + 1. Selection becomes
  the new roots.
- `remove`: one `remove` per id, deepest first so inverses re-insert
  cleanly. Selection empties.
- Check stage 4.

## Stage 5 — menu and keys

- `bindFileListeners` gains `contextmenu` on the document and `keydown`
  and `keyup` on the window, file mode only, canvas mode only, never
  while `cv.textEdit` or `editingTarget`.
- Context menu on an element: Group, Ungroup, Bring forward, Send
  backward, Bring to front, Send to back, Duplicate, Delete. Reuse the
  doc-mode menu element and styles through a shared `openMenuItems(cv,
  x, y, items)`; doc mode's `openMenu` calls it with its own items.
- Keys per pick P3. Arrows nudge through set-style transform using
  `readTranslateBase`, one patch per selected id, one history entry.
- Check stage 5.

## Stage 6 — check and receipt

- `node --check`. Against a server if reachable: on a scratchpad copy
  of an .html, walk scope section 6 lines 4 to 7 by hand through
  the harness pattern in Docs/tests/phase3_headed.py. If no server,
  say so and stop at the code.
- Receipt. Check stage 6.

## Done when

- Shift-click two siblings, cmd-G: one group in the iframe and in
  `cv.source`, both with the same id. Cmd-Z: gone from both.
- Cmd-[ on the group: moves back one in both. Cmd-Z: back.
- Delete, cmd-Z: the element returns at the same index.
- Cmd-D: a copy with fresh ids after the original.
- Switch tabs and back: cmd-Z still undoes.
- Marquee over three elements selects three. Escape clears.
- Preview mode: none of it fires.
- Doc mode: every Phase 3 line still passes in your reading.
- node --check clean.
