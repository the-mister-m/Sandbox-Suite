# SESSION REVIEW — Sandbox Suite — Phase 3F job F — 2026-09-13

Fixes in `static/js/widgets/codecanvas/canvas/canvas.js` from the H5 walks,
part A (Phase 3 doc-mode harness) and part B (phase3F_headed_drag.py).
No harness was run. A rerun follows this job.

## STAGES

- [x] Stage 1 — read and trace: H5 receipt, SCOPE 1/3.1/3.4/3.5, canvas.js whole, the named harness lines, patch.js set-style path
- [x] Stage 2 — finding A traced to the harness, no canvas.js edit
- [x] Stage 3 — findings B, C, D traced, no canvas.js edit
- [x] Stage 4 — findings E, F, G fixed in canvas.js
- [x] Stage 5 — node --check, receipt, SESSIONLOG and INDEX lines

## EDITS

- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — file-mode pointer and text-edit lifecycle
- [Docs/Reports/RECEIPT-phase3F-F.md](RECEIPT-phase3F-F.md) — this receipt

## FINDINGS

**A — doc mode dead to pointer input. Not canvas.js. No edit.**
The doc-mode pointerdown path is intact. `onMouseDown` (canvas.js:519) returns
at its first gate, `cv.frozen || cv.mode === "preview"`, and the canvas is in
preview for the whole of part A. Cause: SCOPE 3.1 changed the `mode` default
from `canvas` to `preview`, and `phase3_headed.py`'s MOUNT helper only leaves
preview for one widget type — line 84 reads
`if (args.type === "canvas_canvas") ... setOption("mode", "canvas")`, while
lines 431, 555 and 694 mount `"canvas"`. The guard never fires. The only
`setOption('mode','canvas')` that does run is line 819, after line 15, which
is why line 16 read mode `canvas` going into the reload. So lines 2, 3, 7 and
their downstream 4 and 9 all ran in preview against a selection gate that was
working as written. Fix belongs in `Docs/tests/phase3_headed.py` line 84 — not
my file, stopped.

**B — Phase 3 line 12, file-mode drag leaves no transform. Not canvas.js. No edit.**
Same cause. Line 694 mounts the exported `.html` as type `"canvas"`, so it
opens in preview, and `onFilePointerDown` returns at the same preview gate.
`phase3F_headed_drag.py` line 556 sets `mode` to `canvas` explicitly, which is
why the identical drag works there. The Phase 3 harness's expectation is
stale, not the code's fault. Fix belongs in that harness — stopped.

**C — Phase 3 line 18, pageerror "Canceled". Not canvas.js. No edit.**
Monaco. `Canceled` is Monaco's `errors.canceled()` message; it is present in
`static/vendor/monaco/vs/editor/editor.main.js`. canvas.js contains no
`reject(` and no such string anywhere in `static/js/widgets/codecanvas/`. Part
A mounts the Code widget at lines 9 and 10 and closes a widget at line 17; a
pending Monaco promise cancelled on unmount surfaces as exactly one unplaced
pageerror. Left as is.

**D — Phase 3 line 16, mode `canvas` in, `preview` out. Superseded. No edit.**
`mount` sets `cv.mode = "preview"` and does not read `frame.options.mode`
(canvas.js:2039), so a reload always comes up in preview. That is Brandon's
ruling of 2026-09-13 and SCOPE 3.1 — the canvas mounts in preview always. The
same line's other half, the Tools `target` round-trip `fixture.json` to
`fixture.html`, is `tools.js` — named, not touched.

**E — part B line 3, multi-select drag does nothing. Fixed, cause narrowed not proved.**
What the run rules out: `status` stayed `'dirty'`, never `patch refused`, so
`applyPatches` was never reached; and part B logged zero console lines, while
every refusal inside `patch.js` `doSetStyle` warns on the console. So the
press was swallowed or the moves were intercepted before any patch was built.
Two paths in the old code did that, and both are now closed:
- `onFilePointerDown` returned outright while `cv.textEdit` was set (old line
  1228). The harness's `click()` retries a failed click on the same point,
  which reads as a double-click and opens a text edit; every later press was
  then a no-op with the selection left intact — the exact shape line 3
  recorded. Now the press commits the edit and continues (canvas.js:1267-1269).
- A `cv.fileMarquee` left over from an earlier gesture took every pointermove
  (old line 1259) and sent pointerup to `endFileMarquee`, which returned
  without ever clearing `cv.drag`. `onFilePointerDown` now clears both before
  it starts anything (canvas.js:1274-1275), and `onFilePointerUp` handles the
  marquee and the drag instead of one or the other (canvas.js:1352-1358).
Also hardened: a press whose selected ids no longer resolve used to build an
empty `items` list and move nothing in silence; it now falls back to the
pressed element (canvas.js:1296), and `drag.ids` is the set that actually
moved.

**F — part B line 7, the text edit never commits. Fixed.**
The picks: **Enter without shift commits, blur commits, Escape cancels and
rewinds** — the Open Design convention named in the brief. `makeEditable` had
Enter and Escape already and nothing on focus loss, so a click away left the
typing in the live DOM and the session open. Added a `blur` listener that
commits (canvas.js:1056-1062), removed with the keydown listener in
`finishTextEdit` (canvas.js:1022). A press outside the edited element commits
first and then goes on to select (canvas.js:1267-1269), so the commit is
deterministic rather than racing the browser's blur. A mode change, a tab
switch and a target load commit too; unmount cancels, because `canClose` has
already decided by then.
**The rerun of line 7 will still fail.** That harness presses Escape first and
treats it as a commit. Under the convention above Escape cancels, so the
session is gone before the click away and nothing can commit. The harness has
to try Enter or the click away before Escape — `Docs/tests/phase3F_headed_drag.py`,
not my file, stopped there.

**G — part B line 6, a live-only transform in preview. Fixed.**
`translate(-274px, 200px)` is the ground point `reset()` clicks, `(6, 400)`,
minus the pressed element's point — a stale `cv.drag` being dragged by the
pointermove that `p1.mouse.click` emits on its way to that ground point. The
old `onFilePointerMove` asked only whether `cv.drag` existed: no button check,
no mode check. So a mouse move with nothing held moved live elements, and
because no pointerup followed, nothing was patched and no history entry was
made — a live DOM that disagrees with `cv.source`. Now a pointermove with the
primary button up rewinds and drops whatever it finds
(canvas.js:1305-1310), and the same gate refuses `frozen` and `preview` on
both move and up (canvas.js:1306, 1357). Added `cancelDrag`, which rewinds the
inline transform and display each item was pressed with, `cancelFileMarquee`
and `endGestures` (canvas.js:1236-1263); a `pointercancel` listener
(canvas.js:1379-1382, bound at 1668); and `endGestures` on `setMode` (1969),
`switchTab` (1985), `loadTarget` (1717) and `unmount` (2228). Preview no
longer touches the live DOM by any path.

## PICKS I MADE

- P-F1. Enter without shift commits, blur commits, Escape cancels and rewinds.
- P-F2. A press outside an open text edit commits it and then selects, rather
  than being swallowed. Committing beats losing the typing.
- P-F3. `unmount` cancels an open text edit instead of committing it —
  `canClose` has already asked Brandon about unsaved work.
- P-F4. No `setPointerCapture` on the press. The button check on pointermove
  already neutralises a press released off-document, and cross-frame capture
  is a bigger change than the evidence asks for.
- P-F5. `drag.ids` is the set that actually resolved, not the raw selection.

## CONTRACT FIELDS ADDED

- `cv.textEdit.onBlur` — the commit-on-focus-loss listener, removed by
  `finishTextEdit` with `onKey`. No contract name from SCOPE section 3 changed.

## NODE --CHECK

`node --check static/js/widgets/codecanvas/canvas/canvas.js` — clean.

## GOALS DONE

- Every finding A to G has a verdict and, where it is canvas.js, a fix.
- Three findings (A, B, C) are not canvas.js and were named, not touched.

## BRANDON'S TODOS

- Rule conflict at session start, same as jobs H2 and H5: the
  bypass-permissions system-reminder told this agent to read and edit through
  Bash; your rules and the job brief say Read/Write/Edit for content, Bash for
  grep and `node --check`. Your rules were followed.
- Three fixes live outside my file and need a ruling on who does them:
  `phase3_headed.py` line 84 (findings A and B), `phase3F_headed_drag.py`
  line 828 (finding F's Escape-first order), `tools.js` (line 16's Tools
  target round-trip).
- Finding E's exact trigger is narrowed to two closed paths, not proved. The
  rerun decides.

## CLOSER REVIEW

- Gets a copy of this review, not a contract.
- Whether the two harness fixes are a job or a rerun agent's own work — Brandon.
- The commit and cancel convention in P-F1 is durable and belongs in MEMORY.md
  if Brandon keeps it — closer.
