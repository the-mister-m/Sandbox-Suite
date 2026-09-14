# SESSION REVIEW — Sandbox Suite — Phase 3F job G — 2026-09-13

Diagnose and fix two findings with a harness in hand: multi-select drag
(canvas.js) and Tools tabs in doc mode after a mixed-tab switch (tools.js).

## STAGES

- [x] Stage 1 — read and trace
- [x] Stage 2 — finding 1 fix and rerun
- [x] Stage 3 — finding 2 fix and rerun
- [x] Stage 4 — node --check both files and receipt

## FINDING 1 — multi-select drag does nothing

**Cause, proved with probes, not narrowed.** The browser's own drag-and-drop
took the gesture. `click("red")` then shift-`click("blue")` leaves a live
**text selection** in the iframe — shift-click extends one. The next press
lands inside that selection, and two pointermoves later Chrome decides the
user is dragging selected text: it fires `dragstart` and `pointercancel`,
and the pointer stream stops. `cv.drag` was built correctly with both items
— the probe printed `drag set path-0-3 ids ["path-0-2","path-0-3"] items 2`
— but the press never crossed `DRAG_THRESHOLD`, so no patch, no console
line, and the selection was left standing. The single-element lines pass
because nothing was ever shift-clicked, so there is no text selection to
drag. Job F's two closed paths (stale `textEdit`, stale `fileMarquee`) were
both clean on this run; neither was the cause.

Probe transcript, run 2, on the old code:

    PROBE down DIV sel ["path-0-2","path-0-3"] mode canvas ... btn 0 chrome false
    PROBE drag set path-0-3 ids ["path-0-2","path-0-3"] items 2
    PROBE move buttons 1 drag true mq false started false   (x2)
    PROBE dragstart DIV "blue box"
    PROBE cancel drag true sel-text "blue box"

**The change.** [canvas.js](static/js/widgets/codecanvas/canvas/canvas.js)
— `onFileDragStart` added at line 1387, bound on the iframe document at line
1677 beside the other file listeners. It calls `preventDefault()` in file
canvas mode, so the native drag never starts and the widget's own drag owns
the gesture. `frozen`, `preview` and an open text edit are left alone: a
text edit keeps the browser's drag of its own selection.

**Harness, [phase3F_headed_drag.py](Docs/tests/phase3F_headed_drag.py).**
Before: 3 FAIL, 4 FAIL, findings `['3 — canvas.js multi-select drag',
'4 — canvas.js one history entry per multi-select drag']`.
After: 0 through 10 all PASS, findings `[]`. Lines 1, 2, 5, 6 and 7 still
pass. Output: [phase3F-headed-drag/G/](Docs/Reports/phase3F-headed-drag/G/)

## FINDING 2 — Tools tabs stay hidden on the doc tab

**Cause.** A doc-mode load emitted `canvas.doc` and no `canvas.focus`. A
sibling's mirror drops any frame whose `target` is not its own option
([mirror.js](static/js/widgets/shared/mirror.js) line 23), and Tools only
re-targets on `canvas.focus` (`onAnyFocus`). So on the switch to the `.json`
the canvas's option moved to the json path, Tools' stayed on the html path,
the `canvas.doc` frame for the json was dropped, and Tools never rendered
again. Its tabs kept the file-mode state from the render before the switch —
`cv.state` was already set when the emit ran, so this is a render that never
happened, not a state set in the wrong order.

Probe transcript, on the old code — the doc emit, then no Tools render:

    PROBE tabs tl.target ...code.html a true state false fileMode true
    PROBE doc emit ...code.json state true opt.target ...code.json
    (nothing until the harness itself clicked a tab)

Pure doc mode passes because the canvas opens on the json from the start, so
Tools' target already matches and the doc frame is delivered.

**The change.** [canvas.js](static/js/widgets/codecanvas/canvas/canvas.js)
line 1799 to 1804 — `loadDocMode` now emits `canvas.focus {}` before
`canvas.doc`, the same pair and the same order `loadFileMode` has emitted
since job B (line 1829). Focus first so the sibling re-targets before the
doc frame it filters by target arrives.

**Harness, [phase3F_headed_code.py](Docs/tests/phase3F_headed_code.py).**
Before: 8 FAIL — `library_shown=False pages_shown=False` on the json tab.
After: 8 PASS — `library_shown=True pages_shown=True` on the json,
`False`/`False` back on the html tab, section falls back to tools, console
clean across both switches. Lines 1 and 2 (Code follows, Code updates) went
FAIL to PASS with the same emit — job K had already given code.js the
`followTarget`/`onAnyFocus` bind, and this is the frame it was waiting for;
both were still failing on my baseline run with K's code in place. Line 3
still fails: code.js has no Apply control, a separate build as briefed. Output: [phase3F-headed-code/G/](Docs/Reports/phase3F-headed-code/G/)

## PICKS I MADE

- **P-G1. Prevent `dragstart`, do not clear the text selection.** The press
  could also have collapsed the document's text selection, which is what
  leaves the stray highlight after a shift-click. That is a visible change
  to what a shift-click does and nobody asked for it; refusing the native
  drag is the smallest thing that fixes the finding.
- **P-G2. `canvas.focus` on the doc load, not a Tools-side re-render.** The
  other repair was to make Tools listen to `canvas.doc` on every target.
  That would have Tools follow a canvas it is not bound to. Scope 3.1 already
  pairs focus with doc on the file path; the doc path was the odd one out.
- **P-G3. The page tab's label now reads "pages".** The section key is still
  `page` — the contract name, the option value, what `SECTIONS` holds and
  what a saved grid file carries. Only the button's face changed, through
  `SECTION_LABELS` ([tools.js](static/js/widgets/codecanvas/tools/tools.js)
  line 14, used at line 1036). The code harness reads a tab by its text and
  line 8 asks for "pages"; H4 flagged the mismatch and my brief says the
  harness's checks stay as they are, so the label moved instead. **Brandon's
  call if it should read "page" — then line 8's `pg_on` is the thing to
  change, not tools.js.** No harness clicks this tab by name, so nothing
  else moved.

## CONTRACT FIELDS ADDED

None. No field added to any contract in scope section 3, no contract name
changed, no module-level mutable state. `SECTION_LABELS` is a constant
lookup table beside `SECTIONS`.

## NODE --CHECK

    node --check static/js/widgets/codecanvas/canvas/canvas.js   clean
    node --check static/js/widgets/codecanvas/tools/tools.js     clean

All temporary probes removed; `grep -n PROBE` returns nothing in either file.

## EDITS

- [canvas.js](static/js/widgets/codecanvas/canvas/canvas.js) — `onFileDragStart`
  (1387), bound at 1677; `canvas.focus` on the doc load (1799-1804)
- [tools.js](static/js/widgets/codecanvas/tools/tools.js) — `SECTION_LABELS`
  (14), used at 1036
- [phase3F-headed-drag/G/](Docs/Reports/phase3F-headed-drag/G/) — screenshots,
  console.txt, results.json
- [phase3F-headed-code/G/](Docs/Reports/phase3F-headed-code/G/) — screenshots,
  console.txt, results.json
- [RECEIPT-phase3F-G.md](Docs/Reports/RECEIPT-phase3F-G.md) — this receipt

## STRAY FILES

None. The harnesses restored their own fixture copies; the three originals
are byte-identical.

## GOALS DONE

- Finding 1 cause proved and fixed; drag harness 0 through 10 all pass.
- Finding 2 cause proved and fixed; code harness line 8 passes, and 1 and 2
  with it.
- `node --check` clean on both files.

## BRANDON'S TODOS

- P-G3: rule on the tab label, "pages" or "page".
- Code harness line 3 still fails — code.js has no Apply or commit control.
  Separate build, named in my brief as out of scope.
- Pure doc mode now gets a `canvas.focus` on every load. Nothing in the two
  harnesses regressed, but `Docs/tests/phase3_headed.py` lines 2 and 6 were
  not rerun — not named in my brief.

## CLOSER REVIEW

- Gets a copy of this review, not a contract.
- [P-G3 label ruling] — Brandon
- [phase3_headed.py rerun, if the doc-mode focus emit is worth a check] — Brandon
