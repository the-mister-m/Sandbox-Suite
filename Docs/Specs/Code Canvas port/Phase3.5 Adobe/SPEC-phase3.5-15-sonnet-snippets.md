# SPEC — Phase 3.5 — 15 — Sonnet — Snippets drawer

Written 2026-09-14. Runs after 2, before 4. The snippets tab replaces
the widget library: drag a card onto the page, it lands where dropped
on the active layer.

Contracts: scope sections 3.4 (insertAt, job 5 — not yet on
`frame._canvas` when you run; see rules), 3.5.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/tools/tools.js. Nothing else.
- `insertAt` does not exist on the canvas yet. Implement the drop as
  one `patchSource` insert into the first `[data-cc-layer]` (or body
  when none) with left/top from the drop point divided by zoom, and
  name in the receipt that job 5 replaces this with `a.insertAt`.
- Stages below. Stage 1 writes the receipt outline. Cap 100K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-15.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.4, 3.5, 5.
- tools.js whole after job 2. About 16K. The `snippets` stub, the
  old drop binding shape if any survives, `bindDrop` pattern from git
  history if job 1 removed it (read `git show HEAD~1:…` for the
  shape only).

## Stage 1 — receipt outline. Check.

## Stage 2 — the drawer

Section `snippets`, one set "Layout": Text frame (a div, 240×120,
`contenteditable` off, one `<p>` of placeholder), Headline (h1),
Image frame (div 320×240 overflow hidden holding an img with a data
SVG placeholder, object-fit cover), Pull quote (blockquote 240×120),
Caption (p, small), Rectangle / Ellipse / Line (HTML divs with
border-radius and a 1px height — the SVG shapes come in job 9 and go
in a second set "Shapes" that you leave as an empty heading). Group
(an empty div 200×200 with a dashed outline). Every snippet is
absolutely positioned with inline left/top/width/height. Cards are
draggable with `text/plain` = snippet name. Check.

## Stage 3 — drop

Bind dragover/drop on the bound canvas's `doc()` as the old library
did. Drop: build the snippet html with left/top from the drop point,
one insert patch. Emit `canvas.select` for the new id. Unbind on
target change and unmount. Check.

## Stage 4 — test and receipt

Docs/tests/phase35_15.py, headless: fixture copy; snippets tab shows
nine cards; simulate a drop of Text frame at 200,300 (dispatch the
drop event on the iframe document with a DataTransfer) → a div at
left 200 top 300 exists in the first layer and is selected; Cmd-Z
removes it. Run it. Receipt. Check.

## Done when

- Every card inserts one element where dropped, selected.
- One undo removes it.
- phase35_15.py passes. node --check clean.
