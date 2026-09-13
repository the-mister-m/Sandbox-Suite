# SESSION REVIEW — Sandbox Suite — Phase 3, job 3H, headed pass — 2026-09-12

Headed Chrome against the running server (pid 92992, `/api/snapshot` live —
confirmed 400 on an empty body, not 404). Session `9883b6bec3df`, surface
`phase3-headed`, removed at the end. 13 PASS, 5 FAIL.

## EDITS

- [Docs/tests/phase3_headed.py](../tests/phase3_headed.py) — new, the whole job: the 18-line pass
- [SESSIONLOG.md](../../SESSIONLOG.md) — one line
- [INDEX.md](../../INDEX.md) — one line

## FIXTURE

`Code Canvas/app/tests/` holds twenty `*.test.js` files and **no JSON doc** —
`find` over the whole Code Canvas repo returns no document JSON at all. Built
the fixture through `MX.canvasCore().makeState` instead, the way
[phase3_3B_canvas.py](../tests/phase3_3B_canvas.py) and
[phase3_3C_tools.py](../tests/phase3_3C_tools.py) build theirs, and wrote it to
`docs/scratchpad/fixture.json` as the spec's Read line asks. Two pages, three
widgets on page 1 (heading, paragraph, badge).

## TESTS

| # | line | result | shot |
|---|---|---|---|
| 1 | Canvas on the fixture draws in the iframe | PASS — docMode doc, drawn 3, pages 2 | [01](phase3-headed/01-canvas-draws.png) |
| 2 | Tools beside it, `canvas` focused, click a widget shows fields | PASS — Text/Box/Color/Link/Notes, 13 fields | [02](phase3-headed/02-tools-fields.png) |
| 3 | Drag 40px right, Tools box x, dirty, cmd-s, file changed | **FAIL** — see A and B below | [03](phase3-headed/03-drag-save.png) |
| 4 | Type in Tools, canvas shows it after 600ms | PASS — `3H TYPED TEXT` in the iframe | [04](phase3-headed/04-tools-typed.png) |
| 5 | Layers: last widget to the top, DOM order changes | PASS — order head becomes the dragged id | [05](phase3-headed/05-layers-reorder.png) |
| 6 | Library: drag a card in, a widget appears | PASS — 3 → 4, drawn matches | [06](phase3-headed/06-library-drop.png) |
| 7 | Marquee two, arrow right, cmd-z | PASS — both move, both return | [07](phase3-headed/07-marquee-nudge-undo.png) |
| 8 | Second Canvas on a second copy, Tools follows, then pins | **FAIL** — see C | [08](phase3-headed/08-two-canvases.png) |
| 9 | Code scrolls to header; css Apply re-renders one widget | **FAIL** — see D | [09](phase3-headed/09-code-apply.png) |
| 10 | Code doc view with docEditable moves a box | PASS — y 300 → 420 on the canvas | [10](phase3-headed/10-code-doc-view.png) |
| 11 | Export writes HTML with the back-link meta | PASS — `<meta name="code-canvas-source" …fixture.json">` | [11](phase3-headed/11-export.png) |
| 12 | Export opens in file mode, bar `from <doc>`, drag, save, reopen | PASS — transform survives, Code Source shows it | [12](phase3-headed/12-file-mode.png) |
| 13 | Double-click a paragraph, type, Enter | PASS — textEdit `path-0-2-0`, source changed | [13](phase3-headed/13-file-text-edit.png) |
| 14 | Annotate: box sent with none, raster, playwright | PASS — 3 PNGs, 6 user turns in the archive | [14](phase3-headed/14-annotate.png) |
| 15 | Preview mode: chrome hidden, nothing moves, no errors | **FAIL** — see E | [15](phase3-headed/15-preview.png) |
| 16 | Reload: every widget returns with its options | PASS — 5/5, zero option diffs | [16](phase3-headed/16-after-reload.png) |
| 17 | Close an unrelated widget, both canvases keep state | PASS — drawn and selection unchanged on both | [17](phase3-headed/17-unrelated-close.png) |
| 18 | Zero pageerrors | PASS — none, either run | [18](phase3-headed/18-final.png) |

Full notes per line: [results.json](phase3-headed/results.json),
[console.txt](phase3-headed/console.txt).

## FAILS — each with file:line

**A — Tools has no box x field.** [tools.js:356-375](../../static/js/widgets/canvas/tools/tools.js)
`buildBoxTool` builds Width, Height, Padding, Margin, Corner, Shadow. There is
no X or Y field, so nothing in Tools can change when a widget is dragged
sideways. The rest of line 3 passed: box x 40 → 80 in state, the same x on disk
after cmd-s, status `saved`. Bigger than one line — a new field plus a
`writeBox(state, ids, "x", …)` wire.

**B — the status line reads empty after the drag, not `dirty`.**
`cv.dirty` is `true` and [canvas.js:1205-1206](../../static/js/widgets/canvas/canvas/canvas.js)
does call `setStatus(cv, "dirty", true)`. The sticky message is then wiped by an
older non-sticky one's timer: [canvas.js:65-70](../../static/js/widgets/canvas/canvas/canvas.js)
arms a 2500ms `setTimeout` that blanks `statusEl` and is never cancelled, so the
`"loaded"` set at mount ([canvas.js:1176](../../static/js/widgets/canvas/canvas/canvas.js),
[:1194](../../static/js/widgets/canvas/canvas/canvas.js)) clears a `dirty` that
arrived inside its window. Fix is a stored timer handle plus a `clearTimeout` —
three lines, not one, so it is here and not fixed.

**C — Tools cannot follow a canvas on a different target.**
[mirror.js:23](../../static/js/widgets/shared/mirror.js) drops any payload whose
`target` is not an exact match for the listener's own `target`, so the
`canvas.focus` emitted by the second canvas (target `fixture2.json`) never
reaches a Tools bound to `fixture.json`
([tools.js:866-878](../../static/js/widgets/canvas/tools/tools.js)). Measured:
clicking canvas A set `focusedInst` to A; clicking canvas B left it on A. The
second half of the line does pass — pinning `canvas` to A's id and clicking B
leaves Tools on A (`who` = `pinned canvas-…-1`). The spec line asks for
cross-target following, which is the opposite of contract 2.2's exact-match
rule; that is a spec-versus-contract call for Brandon, not a code fix.

**D — a css Apply re-renders every widget, not one.**
[render.js:120](../../static/js/widgets/canvas/shared/render.js) is
`matrix.innerHTML = ""` followed by a full rebuild of the page's widgets, so
`state.setCode` on one widget replaces every element in the canvas. Probed by
stamping each element before Apply and reading the stamp after: the edited
widget's node was replaced (correct) and **zero** other nodes survived (the line
asks for them to be the same node). Both runs agreed.
The first half of the line, Code scrolling to the picked widget's header, passed
on run 1 (decoration on line 17, inside the visible range) and failed on run 2
(decor 0) — `canvas.select` can land before `cs.blocksIndex` is built, since
[code.js:271](../../static/js/widgets/canvas/code/code.js) returns silently when
the index is missing and nothing replays the pick. Flaky, reported as seen.

**E — preview mode does not refuse doc-mode gestures.**
[canvas.js:479-480](../../static/js/widgets/canvas/canvas/canvas.js)
`onMouseDown` guards on `cv.frozen` only. The file-mode handlers next to it do
guard the mode — [canvas.js:1018](../../static/js/widgets/canvas/canvas/canvas.js),
[:1080](../../static/js/widgets/canvas/canvas/canvas.js),
[:1090](../../static/js/widgets/canvas/canvas/canvas.js) all read
`cv.frozen || cv.mode === "preview"`. Measured: in preview a drag moved a
widget's box. The other two halves passed — zero handles, no grid background,
no new pageerrors.

## FIXES

Harness-side only, all four inside `phase3_headed.py`, made between run 1 and
run 2. No product file was touched by this job.

- Test 7 marquee was drawn from the iframe corner and contained one widget;
  now drawn from the union of the two widgets' own rects. FAIL → PASS.
- Tests 12 and 13 picked the first `[data-widget-id]` in the export, which is
  the badge at `top: 420px` — below the fold of a nine-row pane, so the click
  landed outside the iframe. Now they name the heading and its paragraph.
  Both FAIL → PASS.
- Test 14 read the track archive 1.5s after the send; the region was still
  pumping and only one turn had flushed. Now waits 8s and re-saves. FAIL → PASS
  (6 turns, three from each run).
- Test 3 note now carries `cv.dirty` alongside the status text — that is what
  separated finding B from a plain miss.

## SNAPSHOT METHODS — proven live

3E could not prove these. All three wrote a PNG under `docs/scratchpad/`:

| method | bytes | what landed |
|---|---|---|
| none | 6,370 | white ground, marks only, as designed |
| raster | 28,524 | `dom-to-image` over `frame._canvas.doc()` |
| playwright | 70,531 | the real page — heading, paragraph, selection chrome, red mark on top |

`/api/snapshot` reached the real screenshot path, not the 501 branch.
Annotate freezes its own canvas while on (`frozen` true with `annotateOn` true)
and the track select filled from the cached `ade_init`.

## STATE LEFT BEHIND

- `docs/scratchpad/fixture.json`, `fixture2.json`, `fixture.html` — the fixture
  copies and the export. Named per the spec's "Done when".
- `docs/scratchpad/annotate-1789263789864.png`, `-1789263794768.png`,
  `-1789263800197.png` (run 1) and `-1789264017488.png`, `-1789264022377.png`,
  `-1789264027831.png` (run 2) — six annotate sends.
- Six **live user turns** on region `0c2be647998d` of session `9883b6bec3df`,
  three per run, each one a real model turn. The spec's line 14 asks for the
  send; flagging the spend, not apologising for it.
- Surface `phase3-headed`: every widget removed, `library/grids/9883b6bec3df/phase3-headed.json`
  deleted. Nothing left on the grid.
- Server untouched — not started, not stopped.

## BRANDON'S TODOS

- Five FAIL lines above, A through E. A, B, D and E are code; C is a spec line
  that contradicts contract 2.2's exact-target rule and needs your call before
  anyone writes anything — **Brandon**.
- D's flaky half (Code's scroll-to-header racing `blocksIndex`) is the only
  non-deterministic result in the pass — **Brandon**.

## CLOSER REVIEW

- 18 lines run once each, then one rerun after four harness-side fixes; no
  rerun loop, no product file edited by this job — **closer**.
- `Code Canvas/app/tests/` has no JSON doc; the fixture was built through the
  core instead, same as 3B and 3C did — **closer**.
- 3D's and 3E's standing "no headed proof" item is cleared: Code widget and
  Annotate both ran live, and `/api/snapshot` is proven past its 501 branch —
  **closer**.
- Rule conflict, flagged not resolved: this job's environment reminder said to
  read and edit through Bash; Brandon's FILE OWNERSHIP rule says the opposite.
  Followed Brandon's rule — Read/Write/Edit for every file, Bash for
  `grep`/`find`/`curl`/`py_compile` and the test run only — **closer**.
