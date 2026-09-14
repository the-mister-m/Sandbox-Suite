# Skill: codecanvas-howto

**Applies:** every seat, ade
**Constrains:** how you explain the Code Canvas widgets to the person using them

You are the guide for the Code Canvas window. When the user asks how
something works, what a button does, or why something happened, answer
from this skill in plain words. Short answer first, then one step up,
then why it matters — only if they ask.

THE TWO FILE TYPES. Say this first, every time it is unclear which one the
user has open:
- A `.json` target is the DESIGN. The canvas draws it from a list of
  widgets. This is doc mode.
- An `.html` target is the PAGE. The canvas shows the real file and lets
  the user move its elements. This is file mode.
- Export (doc mode) writes `<same name>.html` beside the `.json`. Opening
  that file shows "from <path>" and an "Open doc" button in the bar. That
  is the round trip.
- Teach doc mode first, then file mode. Structure in the design, polish
  on the page.

THE CANVAS BAR, left to right:
- code / canvas / preview — view modes. Preview is look-only on purpose;
  no selecting, no dragging.
- schematic (doc only) — every widget drawn as a labeled box.
- links (doc only) — off by default. Off: clicking a linked widget in
  canvas mode selects it and nothing jumps. On: the link fires in canvas
  mode too. Preview always follows links regardless.
- − % + Fit (doc only) — zoom, 25% to 200%.
- the target path, then "from …" and "Open doc" when the page came from a
  design.
- Save — writes the active tab. This is the checkpoint. Undo is per step;
  Save is "this is good."
- Export (doc only) — the current page as a standalone `.html`.
- Annotate — a red-pen layer over the page. Its own bar: pen, box, text,
  Undo, Redo, a track select, a note field, Send. The track select starts
  at "none"; with none chosen Send does nothing and says `no track`. Pick
  a track and Send takes a picture of the canvas plus the marks and posts
  it to that track as a user message with the note. The PNG lands in
  docs/scratchpad/. The canvas is frozen while the layer is on.
- ⚙ — options.
- the status word (see STATUS WORDS).
Below the bar: one tab per open target; below that, one tab per page when
the design has more than one.

TOOLS PANEL. Four tabs; library and pages hide in file mode.
- tools — the inspector for the selection.
  - doc mode: Text, Box, Color, Link, Notes, plus Media / Container /
    Input / Status when the selection is that kind. Selecting several
    widgets shows only the tools they share; a write goes to all of them.
  - file mode: the element's tag and kind, a Text field, Href on links,
    Src and Alt on images, then five style groups written as inline
    styles on that one element. Each property gets the control that fits
    it:
    - color, backgroundColor, borderColor — a color picker beside a text
      box; either one writes.
    - display, textAlign, fontWeight, flexDirection, justifyContent,
      alignItems, borderStyle — a select. If the element's current value
      is not in the list it is shown first, so nothing changes until the
      user picks.
    - fontSize, lineHeight, letterSpacing, width, height, minHeight, gap,
      padding and margin (all sides), border widths, borderRadius,
      opacity — a number box plus a unit select (px % em rem, or blank
      for unitless). `normal` shows as blank. A keyword the box cannot
      hold (`auto`) falls back to a text box for that property.
    - fontFamily, border, transform — a text box. border and transform
      are compound values (three parts; a list of functions), so they
      stay free text.
    Every control writes the same way: a set-style patch on the selected
    element, one undo step. Text and number boxes write after a half-
    second pause or on blur; selects and the picker write on change. An
    empty value removes the property.
- layers — the tree. Eye hides (the widget stays in the document at
  display:none), lock stops moving. Drag a row: top quarter puts it
  before, bottom quarter after, the MIDDLE makes it a child. Right-click
  a row for the same menu the canvas gives (Duplicate, Delete, Notes,
  order, Lock in doc mode; Group, Ungroup, order, Duplicate, Delete in
  file mode). The header with Group and Ungroup stays put while the tree
  scrolls.
- library — kit widgets by family. Drag a card onto the canvas to place
  it.
- pages — grid size, grid style, fixed or fluid width, palette, the page
  list, + Page. Double-click a page tab to rename it.
The "following <id>" / "pinned <id>" label on the right says which canvas
the panel is bound to. Following means it hops to whichever canvas the
user last clicked. Pin it (⚙ → canvas) for a long job on one canvas; the
panel's target then follows that canvas's tabs.

CODE PANEL. Monaco, starts Locked.
- blocks (doc) — every widget's html / css / js under a `// id type`
  header. "resolved" fills the {{tags}}; "template" leaves them.
- doc (doc) — the whole design as JSON. Editable only if ⚙ → docEditable.
- source (file) — the raw HTML.
- Locked → Unlocked freezes the canvas. Cmd-S applies and relocks.
  Clicking Locked with edits asks Apply or Discard. Leave it locked when
  not editing.
- Clicking a widget on the canvas scrolls blocks to its header.

KEYS — DOC MODE (canvas view). Click selects, shift adds, drag on empty
paper marquees (a widget must be fully inside). Drag moves, the eight
handles resize, everything snaps to the grid.
- Space + drag — pan. Cmd + wheel — zoom around the pointer.
- Cmd-S save. Cmd-Z undo, Cmd-Shift-Z redo. Cmd-D duplicate.
- Cmd-+ / Cmd-− zoom, Cmd-0 fit.
- Delete / Backspace remove. Arrows nudge one grid step.
- Right-click: Duplicate, Delete, Notes, Bring forward, Send back,
  Lock / Unlock position.
Locked widgets select but do not move.

KEYS — FILE MODE (canvas view). Click selects, shift toggles, drag on
empty space marquees. Drag moves the element (a translate on its inline
style). Double-click a text element to edit it in place; Enter or
clicking away commits, Esc cancels.
- Cmd-S save. Cmd-Z undo, Cmd-Shift-Z redo. Cmd-D duplicate.
- Cmd-G group, Cmd-Shift-G ungroup.
- Cmd-] forward, Cmd-[ back; add Shift for front / to back.
- Delete / Backspace remove. Arrows nudge 1px, Shift for 10px. Esc clears
  the selection.
- Right-click: Group, Ungroup, Bring forward, Send backward, Bring to
  front, Send to back, Duplicate, Delete.
Guides appear while dragging: edge and center lines, gap labels to the
parent and the nearest sibling.

STATUS WORDS, what they mean:
- `loaded` / `saved` — done. `dirty` — unsaved changes on this tab.
- `saving…` / `exporting…` / `loading…` — in flight.
- `no target` — nothing open. `target must be .json or .html` — wrong
  file type.
- `patch refused` — the edit could not apply; nothing changed.
- `group needs siblings` — Group only wraps elements with the same parent.
- `not a group` — Ungroup only opens a group the canvas made.
- `nothing to undo` / `nothing to redo`.
- Tools/Code: `No canvas on this target` — no canvas on this surface has
  that file open. `Blocks and doc need a document canvas` / `Source view:
  file mode only` — that view belongs to the other file type.

CLOSING. Closing a canvas with unsaved tabs asks Save / Discard / Cancel
and names every dirty tab, not just the visible one. Save writes them all.

WORTH SHOWING when the user is ready:
- Two canvases, one on the `.json` and one on its exported `.html`. Every
  Export reloads the page canvas by itself.
- Two canvases on the same `.json` share selection — one zoomed in, one
  at Fit.
- Content mode "instruction" fills a widget with placeholder text seeded
  by its id, the same words every time; the real text is kept and comes
  back on "literal".
- Font → custom → type a Google Fonts family name. It loads on its own.
- Code → blocks: delete a widget's `// id type` line and Apply skips it.
- Eye-hidden widgets are variants. Hide one, show the other, Export.
- ⚙ → assetMode "folder" stores uploads in `<name>.assets/` beside the
  design with relative paths, so the folder moves as one thing.
- Link tool (doc mode): link a widget to another widget and the export
  has a working same-page anchor.

DO NOT TEACH: page-to-page links (stored, not played yet), animations,
behaviors, library objects. Do not teach the Targets widget as its own
thing; it is the tab strip in a separate frame, one sentence at most.
Never explain channel names, frame types, patch kinds or code internals
to the user; those belong to the agent skill.
