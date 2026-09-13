# SESSION REVIEW — Sandbox Suite — Phase 3, job 3H fix pass — 2026-09-12, harness run 21:56–21:57

Five fixes from [RECEIPT-phase3-3H.md](RECEIPT-phase3-3H.md), A through E.
Allowed files only: `static/js/widgets/canvas/**` and `shared/mirror.js`.
Server pid 92992 untouched. Harness run once, session `9883b6bec3df`,
surface `phase3-3H-fix`, removed by the harness at the end.
15 PASS, 3 FAIL.

`mirror.js` needed no edit: it already carries the `targetKey` argument
contract 2.2 describes, so nothing was narrowed there.

None of these files are in git yet (`static/js/widgets/canvas/` is
untracked), so every undo below is the hand reversal, not a checkout.

## THE FIVE FIXES

**FIX 1 — Tools box X and Y.**
[tools.js:385-388](../../static/js/widgets/canvas/tools/tools.js) — two
`numberField` rows first in `buildBoxTool`, both through the existing
`writeBox`, which batches `state.moveWidget`, the same call drag makes.
Undo: delete the two `grid.appendChild(numberField(... "X" / "Y" ...))` calls.
Harness: **line 3 PASS** — `X` and `Y` in the field list, x 40 → 80 on the
drag, 80 on disk after cmd-s.

**FIX 2 — status keeps `dirty`.**
[canvas.js:66-77](../../static/js/widgets/canvas/canvas/canvas.js) — one
`cv.statusTimer` per instance, cleared on every write, and `dirty` arms no
timer. Handle declared at [:1457](../../static/js/widgets/canvas/canvas/canvas.js),
cleared in unmount at [:1542](../../static/js/widgets/canvas/canvas/canvas.js).
Undo: restore the old four-line `setStatus`, drop the two `statusTimer` lines.
Harness: **line 3 PASS** — `status after drag='dirty'`, `cv.dirty=True`,
`after_save='saved'`.

**FIX 3 — Tools follows a canvas on another target.**
[tools.js:911-913](../../static/js/widgets/canvas/tools/tools.js) — a second
mirror on `canvas.focus` with `targetKey` `followTarget`, an option left
empty, so it hears every target; `onAnyFocus` at
[tools.js:228-240](../../static/js/widgets/canvas/tools/tools.js) adopts the
focused canvas and sets the frame's own `target` to that canvas's target.
Same shape as editor.js's `graphTarget`
([editor.js:432-433](../../static/js/widgets/usertools/editor/editor.js)).
Option declared at [:843](../../static/js/widgets/canvas/tools/tools.js),
persisted at [:960](../../static/js/widgets/canvas/tools/tools.js), mirror
released at [:925](../../static/js/widgets/canvas/tools/tools.js).
Undo: delete `onAnyFocus`, the `followMirror` lines, and the two option lines.
Harness: **line 8 FAIL**, but the half that was broken now works —
`clicked_a_focused` = canvas A, `clicked_b_focused` = canvas B, where before
both read A. Two things hold the line down, both below in OPEN.

**FIX 4 — a css Apply redraws one widget.**
[render.js:118-150](../../static/js/widgets/canvas/shared/render.js) —
`redrawOnly`, and `page` takes `opts.only` at
[:163](../../static/js/widgets/canvas/shared/render.js); a full rebuild is
the fallback whenever an id, a wrapper or a flat page is missing.
[canvas.js:342-360](../../static/js/widgets/canvas/canvas/canvas.js) —
`changedIds` signs each widget, the page, the settings and the render mode
per draw and hands `redraw` the ids that actually moved
([:369](../../static/js/widgets/canvas/canvas/canvas.js)).
[code.js:273](../../static/js/widgets/canvas/code/code.js) queues a
`canvas.select` that lands before `blocksIndex`, replayed once at
[:308-312](../../static/js/widgets/canvas/code/code.js).
Undo: restore `matrix.innerHTML = ""` as the only path (drop `redrawOnly`,
`opts.only`, `changedIds`), and the single-line guard in `scrollToWidget`.
Harness: **line 9 FAIL**, half moved — `untouched_nodes` is now three ids
where the first pass measured zero. See OPEN.

**FIX 5 — preview refuses doc gestures.**
[canvas.js:507](../../static/js/widgets/canvas/canvas/canvas.js) mousedown,
[:562](../../static/js/widgets/canvas/canvas/canvas.js) mousemove,
[:608](../../static/js/widgets/canvas/canvas/canvas.js) mouseup,
[:664](../../static/js/widgets/canvas/canvas/canvas.js) contextmenu — each
now reads `cv.frozen || cv.mode === "preview"`, matching the file-mode
handlers. Wheel zoom ([:760](../../static/js/widgets/canvas/canvas/canvas.js))
was left alone: it moves the view, not a widget.
Undo: drop `|| cv.mode === "preview"` from those four lines.
Harness: **line 15 FAIL** on an assertion, but the gesture is refused —
`moved=False` where the first pass measured a widget moving. See OPEN.

## HARNESS — one run, [results.json](phase3-3H-fix/results.json)

| # | line | result |
|---|---|---|
| 1 | Canvas draws in the iframe | PASS |
| 2 | Tools fields on a click | PASS — X and Y in the list |
| 3 | Drag, Tools box x, dirty, cmd-s | **PASS** (was FAIL: A and B) |
| 4 | Typing reaches the canvas | PASS |
| 5 | Layers reorder | PASS |
| 6 | Library drop | PASS |
| 7 | Marquee, nudge, undo | PASS |
| 8 | Two canvases: follow, then pin | **FAIL** — follow fixed, pin and assertion open |
| 9 | Code scroll; css Apply redraws one | **FAIL** — untouched nodes fixed, two halves open |
| 10 | Doc view moves a box | PASS |
| 11 | Export with back-link meta | PASS |
| 12 | File mode drag, save, reopen | PASS |
| 13 | File text edit | PASS |
| 14 | Annotate, three methods | PASS — 6 user turns, real model spend |
| 15 | Preview: chrome hidden, nothing moves | **FAIL** — gesture fixed, assertion open |
| 16 | Reload returns every widget | PASS |
| 17 | Unrelated close | PASS |
| 18 | Zero pageerrors | PASS |

Console: [console.txt](phase3-3H-fix/console.txt). Shots in
[phase3-3H-fix/](phase3-3H-fix/).

## OPEN — what the three FAILs are made of

**Line 8, pin.** `who=''` at measure time: follow mode had adopted canvas B's
target, so the pinned id — a canvas on the other target — was no longer in
`canvasIdsFor`. Corrected after the run at
[tools.js:938-942](../../static/js/widgets/canvas/tools/tools.js): a pinned
instance brings its own target along, through `targetOfInst`
([:218](../../static/js/widgets/canvas/tools/tools.js)). **Not covered by the
run** — it landed after it, and the gate allows one pass. `node --check` only.

**Line 8, assertion.** `ok8` requires `pinned["who"] == follow_a["who"]`
([phase3_headed.py:573](../tests/phase3_headed.py)). The label is
`"following <id>"` in follow mode and `"pinned <id>"` when pinned
([tools.js:806-808](../../static/js/widgets/canvas/tools/tools.js)), so the
two can never be equal. Harness-side, outside this gate — **Brandon**.

**Line 9, node replaced.** `target_node_replaced=False`: `redrawOnly` first
refilled the wrapper instead of replacing it. Corrected after the run —
[render.js:135-148](../../static/js/widgets/canvas/shared/render.js) builds a
fresh wrapper and `matrix.replaceChild`s it. **Not covered by the run.**

**Line 9, scroll.** `decor=0` with the index built and line 17 inside the
visible range. The queue-and-replay went in, but this ordering never queued:
the index existed when the select arrived and `deltaDecorations` still did not
run. Cause not found, and finding it costs a second pass the gate does not
allow — **Brandon**.

**Line 15, assertion.** `ok15` needs `not prev["grid"]`, and preview writes
`backgroundImage = "none"` ([canvas.js:271](../../static/js/widgets/canvas/canvas/canvas.js)) —
a truthy string, so the line cannot pass as written no matter what the
gestures do. Product side is clean: `handles=0`, `moved=False`,
`new_pageerrors=0`. Harness-side or a one-word product change, neither in
this gate — **Brandon**.

## VERIFICATION

`node --check` clean on all four edited files, before the run and again after
the two post-run corrections. `mirror.js` unedited.

## STATE LEFT BEHIND

- `docs/scratchpad/fixture.json`, `fixture2.json`, `fixture.html` — rewritten
  by this run, same names as the first pass.
- `docs/scratchpad/annotate-1789264622349.png`, `-1789264627238.png`,
  `-1789264632614.png` — three annotate sends from line 14.
- Three more **live user turns** on region `0c2be647998d` of session
  `9883b6bec3df`, six in the archive counting the first pass. Real model spend,
  flagged not apologised for.
- Surface `phase3-3H-fix` removed by the harness; nothing new under
  `library/grids/9883b6bec3df/`.
- Server pid 92992 not started, not stopped.

## BRANDON'S TODOS

- Line 8's `who` comparison and line 15's `grid` check are harness
  assertions that cannot pass as written — **Brandon**.
- Line 9's scroll-to-header still does not decorate; the queue fix did not
  reach this ordering — **Brandon**.
- Three product corrections rode in after the single allowed run and carry
  no harness proof: the pin adoption, the wrapper replacement — **Brandon**.

## CLOSER REVIEW

- Five fixes made, all inside the allowed files; `mirror.js` needed no edit
  because `targetKey` already existed — **closer**.
- One harness run, no rerun loop; every post-run correction is named as
  unproven above rather than folded into a PASS — **closer**.
- Rule conflict, flagged not resolved, same as the first pass: this job's
  environment reminder said to read and edit through Bash; Brandon's FILE
  OWNERSHIP rule says the opposite. Followed Brandon's rule — Read/Edit for
  every file, Bash for grep/ls/node/the test run only — **closer**.
