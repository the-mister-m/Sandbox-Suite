# SESSION REVIEW — Sandbox Suite — Phase 3F job H4 — 2026-09-13 (timestamps: ask Brandon)

Headed walk of the Code widget, the Targets widget, the tab cache, and
mixed tabs. Five runs; runs 4 and 5 agree line for line, and run 5 is the
record in [results.json](Docs/Reports/phase3F-headed-code/results.json).

6 of 11 lines pass. Every failure is a finding, not a fix.

## STAGES

- [x] Stage 1 — read and plan
- [x] Stage 2 — harness written, setup and walk lines 1 to 5
- [x] Stage 3 — harness written, walk lines 6 to 10, compiles
- [x] Stage 4 — full run, twice, same verdicts
- [x] Stage 5 — receipt, sessionlog line, index line

## WALK RESULTS

- 0 PASS — setup. Canvas, Targets, Tools, Code on one surface; canvas opens
  in preview with no target. [00-setup.png](Docs/Reports/phase3F-headed-code/00-setup.png)
- 1 FAIL — Code follows. Both files add through Targets and both load, but
  Code never shows either file's source. On its default blocks view it reads
  "Blocks and doc need a document canvas."; set to its own source view through
  the ⚙ panel it reads "No canvas on this target." Widget:
  [code.js](static/js/widgets/codecanvas/code/code.js). Its three views are
  blocks, doc and source, and no view reaches a file-mode canvas.
  [01-code-follows.png](Docs/Reports/phase3F-headed-code/01-code-follows.png)
- 2 FAIL — Code updates on change. The canvas side is right: red plus blue,
  Cmd-G wraps them into grp_*, Cmd-Z unwraps, live and source agree. Code's
  text never changes because of line 1. Widget: code.js.
  [02-code-updates.png](Docs/Reports/phase3F-headed-code/02-code-updates.png)
- 3 FAIL — Code edits the canvas. Not exercised: the text to edit was
  "No canvas on this target.", so no paragraph edit was ever in the editor.
  The widget has no Apply or commit control on its head — its only head
  buttons are Locked and ⚙ — and Cmd-S inside the editor did nothing. On a
  file-mode canvas the Locked button did not unlock. Widget: code.js.
  [03-code-edit-undo.png](Docs/Reports/phase3F-headed-code/03-code-edit-undo.png)
- 4 PASS — Targets remove. The × on the active row removes it, the other tab
  activates, cv.targets holds one entry. Cmd-Z does not bring it back, as
  expected. "+ Add" appends it and activates it.
  [04-targets-remove.png](Docs/Reports/phase3F-headed-code/04-targets-remove.png)
- 5 FAIL — Targets reorder. The drop does the work: cv.targets flips, the
  canvas tab row shows the new order, the active tab holds. The Targets
  widget's own rows stay in the old order — it does not re-render itself
  after its own reorder. Widget:
  [targets.js](static/js/widgets/codecanvas/targets/targets.js). Caveat: the
  drag was synthetic HTML5 dragstart/dragover/drop/dragend, not a mouse drag.
  [05-targets-reorder.png](Docs/Reports/phase3F-headed-code/05-targets-reorder.png)
- 6 PASS — tab cache, clean reopen. The clean tab re-reads the file over the
  ADE socket on switch back (socket frame type "open" with the path; no HTTP
  hit, which is why the run-1 check read zero). The two-id selection is
  restored, and Cmd-G then Cmd-Z still work.
  [06-clean-reopen.png](Docs/Reports/phase3F-headed-code/06-clean-reopen.png)
- 7 PASS — tab cache, history. Cmd-G then Cmd-Z leaves canRedo true; a switch
  away and back keeps it and Shift-Cmd-Z redoes the group. After the harness
  changed the file on disk, the reopen carries the disk text, canRedo is
  false and Shift-Cmd-Z does nothing. P7 holds both ways.
  [07-history-dropped.png](Docs/Reports/phase3F-headed-code/07-history-dropped.png)
- 8 FAIL — mixed tabs. The json adds as a third tab, the canvas goes to doc
  mode, and the html tab comes back to file mode; the section falls back from
  library to tools as 3.7 asks; console clean across both switches. The one
  failure: Tools' library and page tabs are hidden (display none, hidden set)
  on the doc-mode tab too, so they never appear for the json. Widget:
  [tools.js](static/js/widgets/codecanvas/tools/tools.js). The tab is named
  "page", not "pages".
  [08-mixed-tabs.png](Docs/Reports/phase3F-headed-code/08-mixed-tabs.png)
- 9 PASS — ungroup refused. The stage div selected from its Layers row,
  Shift-Cmd-G changes nothing in live or source, and the console carries the
  refusal, verbatim: canvasPatch: unwrap refused, not a group: path-0
  [09-ungroup-refused.png](Docs/Reports/phase3F-headed-code/09-ungroup-refused.png)
- 10 PASS — save, reload. Cmd-S on the html tab reaches status saved, disk
  matches cv.source byte for byte with eight data-od-id attributes. After
  reload three tabs return, preview mode, console clean.
  [10-save-reload.png](Docs/Reports/phase3F-headed-code/10-save-reload.png)

## CONSOLE

One warning in the whole run, the expected one from line 9:

[p1:console:warning] canvasPatch: unwrap refused, not a group: path-0

No errors, no page errors, no HTTP 400s.
[console.txt](Docs/Reports/phase3F-headed-code/console.txt)

## FIXTURES

Driven only on this walk's own copies; restored at teardown; the three
originals byte-identical before and after (sha checked).

- [phase3F-fixture-code.html](Docs/scratchpad/phase3F-fixture-code.html) —
  changed by the run (ids, saves, the deliberate disk edit), written back
- [phase3F-fixture-code-2.html](Docs/scratchpad/phase3F-fixture-code-2.html) — unchanged
- [phase3F-fixture-code.json](Docs/scratchpad/phase3F-fixture-code.json) — unchanged

## PICKS I MADE

- The Code widget's source view is reached through its ⚙ panel's view
  select, the widget's own control. Nothing was set behind its back.
- Tab one is saved before line 4 and again before the disk edit in line 7:
  P7 needs a clean tab for a server reopen, and the × on a dirty tab would
  have met a save prompt. Both saves are named in the run notes.
- Monaco is driven with editor.setValue, which fires the same model change
  the keyboard would. Line 3 never got that far.
- The re-request check reads fetch, XHR and ADE socket frames, not HTTP
  responses alone.

## EDITS

- [Docs/tests/phase3F_headed_code.py](Docs/tests/phase3F_headed_code.py) — the walk, built on the keys harness
- [Docs/Reports/phase3F-headed-code/](Docs/Reports/phase3F-headed-code/) — screenshots, console.txt, results.json
- [Docs/Reports/RECEIPT-phase3F-H4.md](Docs/Reports/RECEIPT-phase3F-H4.md) — this receipt
- three fixture copies named above

## STRAY FILES

- none

## GOALS DONE

- All ten walk lines run and reported, live DOM and cv.source checked where a
  mutation is named.
- No widget code touched.

## BRANDON'S TODOS

- Rule on the Code widget: file mode is not in it. Lines 1, 2 and 3 stay red
  until someone owns code.js for this phase.
- Rule on Targets re-rendering its own rows after a reorder.
- Rule on Tools' library and page tabs in doc mode.

## RERUN AFTER K

Job K gave the Code widget file mode; undo/redo now reload the iframe for a
set-full-source inverse. Rerun in
[K2/results.json](Docs/Reports/phase3F-headed-code/K2/results.json).

- 1 PASS
- 2 PASS
- 3 PASS
- 4 PASS
- 5 PASS
- 6 PASS
- 7 PASS
- 8 FAIL — tools tabs on the json show tools/layers/library/pages/⚙ all
  visible (library_shown=True pages_shown=True); back on the html tab
  library and pages go display:none, hidden=True, section falls back to
  tools. Same finding as before K: Tools' library/page tabs don't hide in
  doc mode the way the html tab hides them.
- 9 PASS
- 10 PASS

Canceled: still present. `[p1:pageerror] Canceled` appears repeatedly across
the run (console_at 12 through 31, lines 1-8), not only on lines 8 and 10 as
before K. Line 10's own console since the reload reads clean; line 9's own
console carries only the expected unwrap-refused warning. The Canceled
pageerrors sit earlier in the run (setup through line 7), not gone.

### Console lines flagged, verbatim

[p1:pageerror] Canceled — 15 occurrences (lines 13-31 in console.txt)
[p1:console:warning] canvasPatch: unwrap refused, not a group: path-0

## CLOSER REVIEW

- Gets copy of review, not a contract.
- Three findings above need a ruling before any Phase 3F green — Brandon.
- Rerun after K: lines 1-3 now pass, file mode reached them. Line 8's
  library/pages-tab finding stands unchanged. Canceled pageerror is not
  gone, it moved earlier in the run — needs a ruling on whether it's benign.
- Receipt, sessionlog line and index line left in place — closer.
