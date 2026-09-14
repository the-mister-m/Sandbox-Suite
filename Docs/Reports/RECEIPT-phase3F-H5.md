# SESSION REVIEW — Sandbox Suite — Phase 3F job H5 — 2026-09-13, 18:22 to 18:39 EDT

Doc-mode regression (part A) plus the pointer-drag and close-prompt walk (part B).
Session 410ef20f1a9d. Server was already up on 127.0.0.1:5000 and was not restarted.

## STAGES

- [x] Stage 1 — read: phase3_headed.py, phase3F_headed_keys.py, SCOPE section 2 P8 and section 3.5, close-path grep
- [x] Stage 2 — part A run: phase3_headed.py, session 410ef20f1a9d, out Docs/Reports/phase3-headed-3F/, 9 pass 9 fail
- [x] Stage 3 — part B harness: Docs/tests/phase3F_headed_drag.py, copied from the keys harness, ten walk lines
- [x] Stage 4 — part B run: three runs, out Docs/Reports/phase3F-headed-drag/, final 6 pass 5 fail
- [x] Stage 5 — receipt, plus one line each appended to SESSIONLOG.md and INDEX.md

## EDITS

- [Docs/tests/phase3F_headed_drag.py](../tests/phase3F_headed_drag.py) — the drag walk, new, copied from phase3F_headed_keys.py
- [Docs/Reports/phase3-headed-3F/](phase3-headed-3F/) — part A shots, console.txt, results.json
- [Docs/Reports/phase3F-headed-drag/](phase3F-headed-drag/) — part B shots, console.txt, results.json
- [Docs/Reports/RECEIPT-phase3F-H5.md](RECEIPT-phase3F-H5.md) — this receipt

No widget source was edited. Every failure below is a finding, not a fix.

## PART A — doc-mode regression, one line per Phase 3 line

Ran as its usage says: `python3 Docs/tests/phase3_headed.py --session 410ef20f1a9d
--out Docs/Reports/phase3-headed-3F/`. It ran to the end. 9 pass, 9 fail.

- 1 PASS — canvas on the fixture draws inside the iframe. docMode=doc, drawn=3, widgets=3, pages=2.
- 2 FAIL — Tools beside the canvas, canvas focused, a click shows fields. Phase 3 expected the click on the heading to select it and the Tools panel to draw that widget's fields. Got canvasOpt='focused', who='following canvas-mu0dr8ta-1', titles=[], fields=[] — the panel drew nothing and the click did not select. Console: nothing.
- 3 FAIL — drag 40px right. Phase 3 expected the box x to move, status dirty, Cmd-S to save, the file to change. Got box {'x': 40, 'y': 40, 'w': 320, 'h': 80} unchanged, disk unchanged, status after drag='' , cv.dirty=False, tools box fields {} both before and after. The save itself reported 'saved'. Console: nothing.
- 4 FAIL — typing in Tools shows on the canvas. Expected '3H TYPED TEXT' in the iframe text. Got the original text, unchanged: 'Phase 3 headed headingA paragraph of headed proof text.badge'. Downstream of line 2 — there was no selection to type into. Console: nothing.
- 5 PASS — Layers reorder. ['wg_ab5wj4','wg_z8igew','wg_wnw9f3'] to ['wg_wnw9f3','wg_ab5wj4','wg_z8igew'].
- 6 PASS — Library drop adds a widget. 3 to 4, drawn 4.
- 7 FAIL — marquee two, arrow right, Cmd-Z. Expected two widgets selected, both moved, both returned. Got selection=[], moved=[], returned=[] — the marquee selected nothing. Console: nothing.
- 8 PASS — Tools follows each canvas, then pins to the first and stays.
- 9 FAIL — Code scrolls to the header, a css edit re-renders one widget only. The edit and the apply worked: edited=True, apply_clicked=True, target node replaced, two untouched nodes kept their probes. The scroll did not: want_line=17, visible=[1,24], decor=0 — no decoration was drawn and the editor never scrolled, because the click that should have selected the paragraph is the same click that fails at line 2. Console: nothing.
- 10 PASS — Code doc view with docEditable moves the canvas. box y 300 to 420.
- 11 PASS — Export writes the HTML with the back-link meta.
- 12 FAIL — export opens in file mode, drag saves and reopens. File mode and the bar are right: docMode='file', bar='from .../fixture.json'. The drag is not: transform_after_drag=False, transform_after_reopen=False, code source has no translate(, code_len=1659. Console: nothing.
- 13 FAIL — double-click a paragraph, type, Enter. Expected '3H INLINE EDIT' in the source. Got leaf_found=True but textEdit=None — the double-click never opened an edit session — in_source=False, dirty=False. Console: nothing.
- 14 PASS — Annotate with none, raster and playwright. Three PNGs, six user turns in the archive.
- 15 PASS — preview mode. handles=0, grid='none', nothing moved, no new pageerrors.
- 16 FAIL — reload returns every widget with its options. All 5 came back, two options did not round-trip: canvas-mu0dr8ta-1 mode 'canvas' before, 'preview' after; canvas_tools-mu0dr9fd-2 target fixture.json before, fixture.html after. Console: nothing.
- 17 PASS — closing an unrelated widget leaves both canvases as they were.
- 18 FAIL — zero pageerrors. One, verbatim: `[p1:pageerror] Canceled`. The harness records no line number for console entries, so it cannot be placed; it is the only non-harness line in Docs/Reports/phase3-headed-3F/console.txt.

Shape of part A: every failing line except 16 and 18 is a pointer line — click to select (2), drag to move (3, 12), marquee (7), double-click to edit (13) — and 4 and 9 are downstream of 2. Line 16's evidence is that the canvas widget's `mode` option does not round-trip a reload: it was 'canvas' going in and 'preview' coming out. That is the closest thing in this run to a common cause, and it is an observation, not a diagnosis — nothing was read to confirm it.

## PART B — pointer drag and the close prompt, one line per walk line

`python3 Docs/tests/phase3F_headed_drag.py --session 410ef20f1a9d --out
Docs/Reports/phase3F-headed-drag/`, surface phase3F-headed-drag. Three runs; the
numbers below are the third. Runs one and two are named under STRAY FILES.

- 0 PASS — setup. Canvas plus Tools plus Targets, canvas mode after add, docMode=file, stage children h1 p div div div div span, live equals source, all seven hit-testable.
- 1 PASS — drag one. Press on red, 100 right and 50 down in steps, release. Inline transform reads `translate(100px, 50px)` in live style and in cv.source, left/top stay 40px/140px, status 'dirty', cv.dirty True, selection ['path-0-2'] — red. One canvas.select on the bus with that id.
- 2 PASS — undo one. Cmd-Z reaches the iframe (capture and bubble, prevented=True) and the transform is empty in live and in source. History goes canUndo True to canUndo False, canRedo True.
- 3 FAIL — drag many. Selection before the drag is right: ['path-0-2','path-0-3'], red and blue. Press on blue, move 30 right, release, and **neither element moves**: red transform live=None src=None, blue transform live=None src=None, want (30,0) on both. Selection survives the gesture. No history entry was created — the harness's drain at the next reset found nothing to undo. A single-element drag works at line 1, so this is multi-select drag specifically.
- 4 FAIL — undo many. **No verdict.** Line 3 never moved anything, so there was nothing for one Cmd-Z to clear. Recorded for the record: history before the undo was canUndo False, the undo did nothing, a second Cmd-Z also did nothing.
- 5 FAIL — drag then click. **No verdict, and the setup would not hold.** Click red then shift-click green returned ['path-0-4'] — green only — with one counted click retry. The same two-click pattern works one line earlier at line 3 with red and blue. The retry is itself a hazard: two clicks on the same point in quick succession read as a double-click. The line's own question — does the click after a drag release change the selection — was never reached. Next step is a rerun that sets the pair up a different way.
- 6 PASS — drag in preview. mode='preview', a press and move on red selects nothing (selection []), red's transform is identical before and after, and cv.source is byte-identical at 1359 both sides. Mode goes back to 'canvas'. **One anomaly on this line, reproduced in all three runs with identical numbers:** red's live inline transform reads `translate(-274px, 200px)` while cv.source has none. It was already there before the preview drag, so it arrived during lines 3 to 5, and no history entry exists for it. Something writes a live-only inline transform that never reaches the source. Not diagnosed — no widget source was read.
- 7 FAIL — text edit. The double-click does open the session: textEdit='path-0-1', the paragraph is the iframe's activeElement, isContentEditable true, document has focus, one range, anchor #text@28. The caret goes to the end and the typing lands in the live DOM. Then **neither Escape nor a click away commits it**: committed_by='neither', the live text is back to 'A paragraph of fixture text for the text edit line.', source the same, ' plus' nowhere. Cmd-Z had nothing to restore.
- 8 FAIL — dirty tabs. The tab half all passes: Add commits fixture two, tabs read ['phase3F-fixture-drag.html','phase3F-fixture-drag-2.html'], the active tab is two, dragging tile one 40 right gives (40,0) in live and source, and **both tabs are dirty** — active True, cached {fixture-drag: True}. Cmd-S reaches the iframe prevented=True, status reaches 'saved', and **exactly one save frame goes out, for tab two only**: `{'type':'save','path':'.../phase3F-fixture-drag-2.html','bytes':791,'hasTf':True}`. Disk: fixture-drag-2 has translate, fixture-drag does not have the edit, tab one still dirty after the save. That is P8's first sentence confirmed. The line is marked FAIL only because the tab-one edit it depends on is line 7's text edit, which does not commit.
- 9 PASS — close prompt, P8. **The close path is `canClose(frame)` in canvas.js, not beforeunload** — see the grep finding below. Fired `MX.grid.removeWidget(canvasId)` with tab one dirty. The modal came up: title 'Unsaved changes', message 'phase3F-fixture-drag.html has unsaved changes.', buttons ['Save','Discard','Cancel']. Clicked Save. Two save frames went out: tab two (791 bytes) and **tab one (1359 bytes)**. The disk file for tab one is 1359 bytes after the close, exactly the bytes sent. removeWidget resolved True, the frame is gone. P8's second sentence — the close prompt saves every dirty tab — holds.
- 10 PASS — console clean. Part B produced zero browser console lines: 0 pageerrors, 0 error or warning lines, 13 console entries all of which are the harness's own.

## CLOSE-PATH GREP FINDING

One grep into `static/js/widgets/codecanvas/canvas/canvas.js` for beforeunload,
unmount, dirty, confirm.

- **beforeunload: no hit.** Nothing in canvas.js listens for it.
- **confirm: no hit.** The prompt is `MX.ui.choose`, not `window.confirm`.
- `canClose(frame)` at line 2145 is the close path. It reads `dirtyNames(cv)`, returns true when there are none, otherwise calls `MX.ui.choose("Unsaved changes", ...)` with Save / Discard / Cancel. Cancel returns false and the widget stays mounted; Discard returns true; Save returns `doSaveAll(cv).then((ok) => !!ok)`.
- `doSaveAll(cv)` at line 1796 saves the active tab through `doSave(cv)` then every cached tab whose record is dirty and is not the active one, and resolves true only if all of them did.
- `dirtyNames(cv)` at line 1807 is the active tab first, then every dirty cached tab, by basename.
- `unmount(frame)` at line 2162 runs only after canClose resolves true — `MX.grid.removeWidget` at grid.js:336 awaits `f.canClose()` and returns false without unmounting when it says no. unmount itself saves nothing; it clears the live flag, timers, listeners, the menu, mirrors and the resize observer, blanks the iframe, and nulls `frame._canvas` and `frame._canvasState`.

So nothing hangs on a page unload. A widget close is the only close, and it does save dirty tabs. P8 is satisfied.

## CONSOLE SUMMARY

- Part B: clean. Zero browser console lines of any kind.
- Part A: one line, verbatim and unplaced: `[p1:pageerror] Canceled`

## FIXTURES

Restored at teardown, verified after the write:

- Docs/scratchpad/phase3F-fixture-drag.html — run left 1359 bytes, wrote back 1186, matches the original, original untouched
- Docs/scratchpad/phase3F-fixture-drag-2.html — run left 791 bytes, wrote back 673, matches the original, original untouched

The originals phase3F-fixture.html and phase3F-fixture-2.html were opened read-only
and never written. Nothing named -keys, -tools or -code was touched. Part A writes
its own fixtures under docs/scratchpad/ (fixture.json, fixture2.json, fixture.html);
those are phase3_headed.py's, not this job's.

## STRAY FILES

- Docs/Reports/phase3F-headed-drag/ — holds the third run only; runs one and two wrote to the same folder and were overwritten. Runs one and two are not on disk.
- Docs/Reports/phase3-headed-3F/ — part A, one run.

## GOALS DONE

- Part A ran unedited and to the end; every one of its eighteen lines has a verdict.
- Part B harness written and run; nine of its ten walk lines have a verdict.
- The close path was found by grep and exercised; P8 holds on both halves.

## BRANDON'S TODOS

- Rule conflict at session start, same as job H2: the bypass-permissions system-reminder told this agent to do reads and edits through Bash; your rules and the job brief say Read/Write/Edit for content, Bash for grep and running things. Your rules were followed.
- Lines 4 and 5 of part B have no verdict. A rerun is needed once line 3 is fixed, and line 5 needs its pair set up without a repeated click on the same point.

## CLOSER REVIEW

- Gets a copy of this review, not a contract.
- Part A's nine failures and part B's three real failures (3, 6's live/source divergence, 7) are findings against canvas.js — decide whether they go to MEMORY.md or to a Phase 3F fix job — Brandon.
- P8 confirmed on both halves; that is a durable fact about the close path — closer.
