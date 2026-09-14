SESSION REVIEW — Sandbox Suite Phase 3F job P — 2026-09-14 00:23Z–00:33Z

THE STACK (verbatim, [Docs/Reports/phase3-headed-3F/P2/console.txt](Docs/Reports/phase3-headed-3F/P2/console.txt) lines 15-25)

```
[p1:pageerror:stack] Canceled: Canceled
    at i.cancel (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:122:13889)
    at i.dispose (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:122:14018)
    at t (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:11:22161)
    at g.clear (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:11:22775)
    at g.dispose (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:11:22685)
    at P.dispose (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:722:24461)
    at c.value (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:722:24961)
    at u._deliver (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:71:910)
    at u._deliverQueue (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:71:1001)
    at u.fire (http://127.0.0.1:5000/static/vendor/monaco/vs/editor/editor.main.js:71:1336)
```

Minified names read from editor.main.js: `i` = `Delayer` (its `cancel()` does
`this.doReject?.(new CancellationError)`), `g` = `DisposableStore`,
`P` = `WordHighlighter` (`dispose(){this._stopSingular(),this.toUnhook.dispose()}`),
`c.value` = the `onDidChangeModel` listener inside `WordHighlighterContribution`.

CAUSE
`setViewModel`/`showGuide` in code.js call `cs.editor.setModel(...)` on every view
switch; `onDidChangeModel` disposes the old WordHighlighter, whose `runDelayer`
rejects its in-flight document-highlight promise with `CancellationError` and nobody
holds a handler. It needs the cursor parked on a word when the model swaps, so it
fires in about half the doc-mode runs and never in file mode, which never swaps models.

CHANGE — [static/js/widgets/codecanvas/code/code.js](static/js/widgets/codecanvas/code/code.js) lines 218-228
- `ensureEditor`: added `occurrencesHighlight: "off"` to the `monaco.editor.create`
  options, with a two-line comment above. Monaco guards the delayer trigger on
  `occurrencesHighlight !== "off"`, so no highlight request is ever started and the
  dispose path has nothing pending to cancel. No catch added, no rejection swallowed.

CANCELED COUNTS PER RUN (all runs: `--session 410ef20f1a9d`, trace harness)
- P1 — before the fix — crashed at step 12 (`MX.grid.frames[d]` undefined), no console.txt written, not counted
- P2 — before the fix — 1 Canceled (one pageerror + its unhandledrejection), step 18 FAIL
- P3 — after the fix — 0 Canceled, 18/18 PASS
- P4 — after the fix — 0 Canceled, 18/18 PASS
- P5 — after the fix — 0 Canceled, 18/18 PASS

Steps 9 and 10 still PASS in all three post-fix runs (scroll-to-header, decoration,
css apply, doc-view box move) — the widget's own highlight decoration is unaffected.

node --check static/js/widgets/codecanvas/code/code.js: OK.

EDITS
- [static/js/widgets/codecanvas/code/code.js](static/js/widgets/codecanvas/code/code.js) — occurrencesHighlight off in the editor create options
- [Docs/tests/phase3_headed_trace.py](Docs/tests/phase3_headed_trace.py) — copy of phase3_headed.py with `e.name`/`e.stack` recorded on pageerror and an `unhandledrejection` stack logger; nothing else changed

NOTE ON THE TRACE HARNESS
`wire()` runs before `page.goto`, so a plain `page.evaluate` would have been wiped by
the navigation — the rejection listener is installed with `page.add_init_script` at the
same call site instead. Same effect, and it is why the stack reached console.txt.

STRAY FILES
- [Docs/Reports/phase3-headed-3F/P1/](Docs/Reports/phase3-headed-3F/P1/) — crashed pre-fix run, screenshots + run.log only
- [Docs/Reports/phase3-headed-3F/P2/](Docs/Reports/phase3-headed-3F/P2/) — pre-fix run that caught the stack
- [Docs/Reports/phase3-headed-3F/P3/](Docs/Reports/phase3-headed-3F/P3/), [P4/](Docs/Reports/phase3-headed-3F/P4/), [P5/](Docs/Reports/phase3-headed-3F/P5/) — the three proving runs
- [Docs/tests/phase3_headed_trace.py](Docs/tests/phase3_headed_trace.py) — diagnostic copy, keep or delete is Brandon's call

GOALS DONE
- Monaco "Canceled" traced to its call site with a real stack
- Cause named, fixed in code.js, proved zero across three runs

BRANDON'S TODOS
- P1 crashed at step 12: `MX.grid.frames[d]` was undefined right after `CANVAS_READY`
  passed on that same id. Seen once in five runs, unrelated to this fix — needs a call
- The trace harness duplicates phase3_headed.py; fold the stack capture into the real
  harness or delete the copy

CLOSER REVIEW
- Gets copy of review, not a contract.
- Fold the Canceled fix into MEMORY.md's Phase 3F warm start — Closer
- Rule on the step 12 frame-missing crash and on keeping phase3_headed_trace.py — Brandon
