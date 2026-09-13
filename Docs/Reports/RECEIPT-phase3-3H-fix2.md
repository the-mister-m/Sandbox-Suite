# SESSION REVIEW — Sandbox Suite — Phase 3, job 3H fix pass 2 — 2026-09-12, harness run 22:08–22:09

One fix, line 9 scroll-to-header. Harness: **18 of 18 PASS**.

## DIAGNOSIS

Probe, headed, against session `9883b6bec3df`: a bus trace on
`canvas.select` / `canvas.focus` plus a wrapper on the editor's
`deltaDecorations`.

A clean mount-click-widget sequence already worked — `decor=1`, decoration
on the clicked widget's header. Adding one step reproduced the FAIL: marquee
two widgets first, then click one of them. The trace then showed
`canvas.focus` arriving and **no `canvas.select` at all**, `decor` unchanged.

Cause: [canvas.js:544](../../static/js/widgets/canvas/canvas/canvas.js) —
a plain mousedown on a widget that is **already in the selection** takes no
branch. `setSelection` is the only caller of `mirrors.select.emit`
([:321](../../static/js/widgets/canvas/canvas/canvas.js)), so nothing is
announced and Code never hears the click.

That is the harness's line 9 exactly: line 7 leaves the marquee selection
`[a, b]` on the canvas, the code widget mounts after it at line 585 with
`decor=[]`, and line 592 clicks widget `b` — already selected. No select
frame, `decor=0`, with the block index built and the line visible. The
earlier queue-and-replay never fired because there was nothing to queue.

Neither suspect named in the brief held: `redrawOnly` runs after the
measurement, and the `canvas.change` frame arrives after `canvas.select`,
not before.

## THE FIX

[canvas.js:542-551](../../static/js/widgets/canvas/canvas/canvas.js) — the
already-selected case gets an `else if (cv.mirrors)` branch that re-announces
on the select mirror with the clicked id moved to the front and the rest of
the selection behind it. The selection itself is not changed and not
narrowed: siblings receive the same set, Code's `scrollToWidget` reads
`ids[0]` and lands on the widget that was clicked.

Undo: delete that `else if` branch, three lines plus its comment.

Proof, from the probe's second run: click on an already-selected widget now
logs `delta old=1 new=1 line=9` and
`canvas.select ids=["wg_gq13sm","wg_xccn2w"]` — clicked id first.

## HARNESS — one run, [results.json](phase3-3H-fix2/results.json)

`python3 Docs/tests/phase3_headed.py --session 9883b6bec3df --surface
phase3-3H-fix2 --out Docs/Reports/phase3-3H-fix2/`

| # | line | result |
|---|---|---|
| 1 | Canvas draws in the iframe | PASS |
| 2 | Tools fields on a click | PASS |
| 3 | Drag, Tools box x, dirty, cmd-s | PASS |
| 4 | Typing reaches the canvas | PASS |
| 5 | Layers reorder | PASS |
| 6 | Library drop | PASS |
| 7 | Marquee, nudge, undo | PASS |
| 8 | Two canvases: follow, then pin | **PASS** (was FAIL) |
| 9 | Code scroll; css Apply redraws one | **PASS** (was FAIL) |
| 10 | Doc view moves a box | PASS |
| 11 | Export with back-link meta | PASS |
| 12 | File mode drag, save, reopen | PASS |
| 13 | File text edit | PASS |
| 14 | Annotate, three methods | PASS — 6 user turns, real model spend |
| 15 | Preview: chrome hidden, nothing moves | **PASS** (was FAIL) |
| 16 | Reload returns every widget | PASS |
| 17 | Unrelated close | PASS |
| 18 | Zero pageerrors | PASS |

What this run proves beyond the new fix:

- Line 9 `scrolled=True decor=1 want_line=17 visible=[5, 28]` — the fix.
- Line 9 `target_node_replaced=True` — the last pass's unproven
  [render.js:135-148](../../static/js/widgets/canvas/shared/render.js)
  correction, now covered.
- Line 8 `who='pinned canvas-mtz6dj9c-1'` — the last pass's unproven
  [tools.js:938-942](../../static/js/widgets/canvas/tools/tools.js)
  correction, now covered.
- Lines 8 and 15 pass against the session agent's corrected assertions.

Console: [console.txt](phase3-3H-fix2/console.txt) — four lines, no warnings,
no pageerrors. Shots in [phase3-3H-fix2/](phase3-3H-fix2/).

## VERIFICATION

`node --check` clean on canvas.js, code.js, render.js. Harness run once, no
reruns. Server pid 92992 untouched. Harness untouched.

## STATE LEFT BEHIND

- Surfaces: none. The probe surface `probe-3H2` and the harness surface
  `phase3-3H-fix2` were both removed, grid files deleted.
- Fixtures the harness leaves by design: `docs/scratchpad/fixture.json`,
  `fixture2.json`, `fixture.html`.
- Annotate PNGs from line 14: `annotate-1789265355879.png`,
  `annotate-1789265360773.png`, `annotate-1789265366130.png` in
  `docs/scratchpad/`.
- Probe script lives in the session scratchpad, outside the project.

## EDITS

- [canvas.js:542-551](../../static/js/widgets/canvas/canvas/canvas.js) — click
  on an already-selected widget re-announces on the select mirror.
- [RECEIPT-phase3-3H-fix2.md](RECEIPT-phase3-3H-fix2.md) — this receipt.
- SESSIONLOG.md, INDEX.md — one line each.

## CLOSER REVIEW

- Gets copy of review, not a contract.
- Line 9 open items from the previous receipt are closed — the "cause not
  found" note there is superseded — closer.
- Nothing left for Brandon on lines 8, 9, 15; the two harness assertions he
  was handed were fixed by the session agent and pass — closer.
