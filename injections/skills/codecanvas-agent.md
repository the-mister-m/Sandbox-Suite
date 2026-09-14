# Skill: codecanvas-agent

**Applies:** every seat, ade
**Constrains:** how you drive a Code Canvas widget as an agent

Two pathways. Know both. Default to the first.

DOC PATHWAY — the target is a `.json` design.
- The document is `state.get()`: settings, page, pages[] → widgets[]
  (id, type, parent, box{x,y,w,h}, content{mode,value}, props, link,
  notes, locked, hidden, code{custom,html,css,js}), library, assets.
- Lay out structure first with content mode "instruction" (stable filler
  seeded by id). Swap to "literal" when copy exists.
- Writers, on `frame._canvas.state`: addWidget(pageId, type, box),
  removeWidget, moveWidget(id, box), setContent(id, mode, value),
  setProp(id, key, value) — key must exist in the kit defaults,
  setParent, reorder(id, index), setLink(id, target), setNotes,
  setLocked, setHidden, setCode(id, html, css, js), addPage, removePage,
  setPage, renamePage, setSetting, duplicateWidget, replace(json),
  batch(fn) — one undo step for many writes.
- Kit types: text.block, text.list, media.image, media.video,
  media.embed, container.box, input.field, input.textarea, input.select,
  input.checkbox, input.button, reveal.details, status.progress,
  status.badge, status.alert.
- Export when the layout settles. It writes `<name>.html` beside the
  `.json` with a back-link meta.

FILE PATHWAY — the target is an `.html` page.
- Every body element carries a `data-od-id`. Read it from
  `frame._canvas.doc()`; `__body__` is the body.
- Send patches through `frame._canvas.patchSource(patch)`. One patch, one
  undo step. Kinds and shapes:
  - `{kind:"set-text", id, value}`
  - `{kind:"set-style", id, styles:{camelCase: "value"}}` — empty string
    removes the property
  - `{kind:"set-css-token", token, value}` — one declaration in a
    `<style>` block
  - `{kind:"move", id, parent, index}` — index counted with the element
    out of the list
  - `{kind:"insert", parent, index, html}` — exactly one root element
  - `{kind:"remove", id}`
  - `{kind:"wrap", ids, id}` — siblings only; `{kind:"unwrap", id}` —
    groups only
  - `{kind:"replace-outer-html", id, html}` — one element, id carried
    over
  - `{kind:"set-full-source", source}` — the whole file; the iframe
    reloads
- Prefer the smallest kind that does the job. set-text and set-style
  first, move and insert next, replace-outer-html for one element,
  set-full-source only when the file is not the user's own work or they
  asked for a rewrite.
- A refused patch changes nothing and the canvas shows `patch refused`.
  Say so; do not retry blind.
- Shortcuts on the same handle: group(ids), ungroup(id), move(id, parent,
  index), forward / back / front / toBack(ids), remove(ids),
  duplicate(ids), undo(), redo(). menuItems() returns the `[label, fn]`
  rows the canvas's own right-click menu would show for the current
  selection and mode; call a row's fn to run it.

CANVAS OPTIONS you may set with frame.setOption: target, targets[],
mode (code | canvas | preview), zoom, selection[], schematic, page,
assetMode (data | raw | folder), backLink, linksLive (default false —
anchors render in canvas mode only when true; preview always renders
them), snapshot (raster | playwright | none), annotateTrack ("" sends
nothing).

DISK EDITS. Writing the target file on disk is allowed. Before you do:
say which file and what changes. The canvas reloads on `tree_dirty` only
when it holds no unsaved changes and no gesture is live; if the tab is
dirty your write sits on disk unseen until the user saves or discards.
Prefer patchSource when a canvas has the file open.

WHICH CANVAS. Operate on the focused canvas (the last to emit
`canvas.focus`) unless the user names a path. Tools and Code bind the same
way: `canvas: "focused"` follows, an instance id pins.

CODE PANEL. If you drive it: unlock, apply, relock. Unlocking freezes the
canvas for everyone. Never leave it unlocked.

SAVE IS THE CHECKPOINT. Undo is per step in both modes and does not
survive a reload. When a set of changes is good, save, and tell the user
you saved. Do not save unasked mid-work.

NOTES AND FEEDBACK. A remark about one widget goes on that widget
(setNotes). Something the user must see now goes to their track. Both
when it blocks.

CHANNELS, for listening: canvas.select {ids}, canvas.focus {inst,
target}, canvas.doc {mode, path}, canvas.change {}, canvas.freeze {on},
canvas.mode {mode}. Server frames: send `open` and `save`; receive `file`,
`saved` (ok / result), `tree_dirty`.

DO NOT TOUCH: animations, behaviors, library.objects, page-to-page link
play. Stored, not played. Do not tidy the user's tabs, selection or zoom.
Do not restore state they did not ask restored.
