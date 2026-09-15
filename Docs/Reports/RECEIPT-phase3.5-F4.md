# RECEIPT — Phase 3.5-Adobe — F4

Work order: [RECEIPT-phase3.5-W1.md](RECEIPT-phase3.5-W1.md), item 3 (Line 6 — a dropped text frame takes no typing)

## SESSION REVIEW — Phase 3.5-Adobe F4 — 2026-09-15

EDITS
- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — double-click now climbs to the nearest ancestor a patch actually tracks before entering text edit, instead of gating on the raw hit element being a bare leaf
- [Docs/tests/phase35_15.py](../tests/phase35_15.py) — added line 5: drop, set canvas mode, double-click, type hello, blur, source checked

STRAY FILES
- none

## STAGES

1. [x] Read RECEIPT-phase3.5-W1.md "Line 6" note. Grepped
   `contenteditable`/`dblclick`/`editText` in canvas.js and `Text frame`/
   snippet in tools.js. Read only the hit ranges (makeEditable/
   finishTextEdit 1030-1105, onFileDblClick/closestTarget 234-300 and
   1506-1512, insertAt 1888-1932, SNIPPETS_LAYOUT 68-88).
2. [x] Found the edit-entry path already exists (`makeEditable`/
   `finishTextEdit`, "set-text" patch) — picked Shape A.
3. [x] First pass: drilled double-click down into a wrapped text child
   (div > p). Wrote the test, ran it: entered edit, but the commit was
   silently refused — the dropped `<p>` never got a `data-od-id` written
   into `cv.source`, only onto the live DOM (`cv.patch.stableId` invents
   one on demand, never re-serialized). Confirmed with a throwaway debug
   harness outside the edit set (not committed, not counted in tool
   calls against the file budget).
4. [x] Second pass: replaced the drill-down with a climb-up
   (`trackedAncestor`) to the nearest element that already carries
   `data-od-id` — the snippet's own root, the one `insertAt` actually
   stamped into source. Paired with `wrapsTextLeaf` so only a leaf or a
   leaf wrapped one level (the Text frame shape) is eligible; groups and
   empty shapes stay untouched.
5. [x] `node --check` on canvas.js: clean.
6. [x] Docs/tests/phase35_15.py --session 0d78d246515f: 5/5 PASS.
7. [x] Docs/tests/phase35_05.py --session 0d78d246515f: 9/9 PASS, stayed
   green.
8. [x] Removed the debug harness and its three stray grid files
   (`library/grids/0d78d246515f/phase35-debug*.json`).

## PICKS I MADE

- A. canvas.js: double-click on any element in an html layer whose
  plugin is html sets contenteditable on it for the edit session,
  removes it on blur, and writes the new text through one patch —
  preferred because the edit-entry path (`makeEditable`/
  `finishTextEdit`) already existed.
- The edit target is the tracked ancestor, not the literal hit element.
  A bare pre-existing leaf (e.g. the fixture's headline `<h1>`) already
  carries its own load-time id, so `trackedAncestor` returns it
  unchanged — same element, same behavior as before. A freshly dropped
  Text frame's inner `<p>` has no source id, so the climb lands on the
  div `insertAt` stamped — editing there commits, at the cost of the
  `<p>` wrapper collapsing to plain text on commit. Not tested against,
  not fixed here.
- Did not touch tools.js. The snippet html needed no editing hook once
  the entry point resolved to the id `insertAt` already tracks.

## CONTRACT FIELDS ADDED

- None. Scope 6 line 6 ("Type in it.") now holds; no new field.

## node --check

- canvas.js — clean.

## READ LEDGER

- Docs/Reports/RECEIPT-phase3.5-W1.md — "Line 6" grep hit, once
- static/js/widgets/codecanvas/canvas/canvas.js — lines 1030-1105
  (makeEditable/finishTextEdit/afterChange), 234-300 (closestTarget/
  hitGate/isLayerSection), 1495-1520 (onFileDblClick), 1888-1932
  (insertAt), 1125-1237 (runPatches/applyPatches/patchSource), grep
  hits for `contenteditable`/`dblclick`/`editText`/`makeEditable`/
  `isTextLeaf`/`onFileDblClick`/`plugin ===`, once each (never opened
  whole)
- static/js/widgets/codecanvas/tools/tools.js — lines 60-89
  (SNIPPETS_LAYOUT), grep hits for `Text frame`/`snippet`, once (never
  opened whole)
- static/js/widgets/codecanvas/shared/canvas-core.js — lines 95-131
  (ID_SCRIPT, load-time id stamping) — read-only, not in the edit set
- Docs/tests/phase35_15.py, Docs/tests/phase35_05.py — run only past
  the one line added

## SUPERSEDED

None.
