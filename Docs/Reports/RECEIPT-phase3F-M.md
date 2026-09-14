SESSION REVIEW — Sandbox Suite Phase 3F job M — 2026-09-13

EDITS
- Docs/tests/phase3_headed.py:840-859 — step 16 diff logic: canvas `mode` allowed to read back "preview"; tools `target` allowed to equal a canvas's post-reload target

STEPS
1. PASS — Canvas on the fixture draws inside the iframe
2. PASS — Tools beside the canvas, canvas focused: a click shows fields
3. PASS — drag 40px right: Tools box x moves, dirty, cmd-s saves, file changed
4. PASS — typing in Tools shows on the canvas after the debounce
5. PASS — Layers: dragging the last widget to the top reorders the canvas DOM
6. PASS — Library: dragging a card into the canvas adds a widget
7. PASS — marquee two, arrow right moves both, cmd-z returns both
8. PASS — Tools follows each canvas, then pins to the first and stays
9. PASS — Code scrolls to the header; a css edit re-renders one widget only
10. PASS — Code doc view with docEditable: an edited box moves the canvas
11. PASS — Export writes the HTML next to the doc with the back-link meta
12. PASS — export opens in file mode, bar reads from <doc>, drag saves and reopens
13. PASS — double-click a paragraph, type, Enter: the source changed
14. PASS — Annotate: a box sent with none, raster, playwright; PNGs and user turns
15. PASS — preview mode: chrome hidden, nothing moves, no new errors
16. FAIL — reload returns every widget with its options — note: `returned=5/5 diffs={"canvas_code-mu0gyoa0-4": {"target": ["/Users/moth3rship/Desktop/AI Design/Sandbox Suite/docs/scratchpad/fixture.json", "/Users/moth3rship/Desktop/AI Design/Sandbox Suite/docs/scratchpad/fixture.html"]}}`
17. PASS — closing an unrelated widget leaves both canvases as they were
18. FAIL — zero pageerrors across the pass — note: `[p1:pageerror] Canceled`

CONSOLE / WARNING / PAGEERROR LINES (verbatim, console.txt)
- `[harness] session open: {'sid': '410ef20f1a9d'}`
- `[p1:pageerror] Canceled`
- `[harness] widgets left on the surface: []`
- `[harness] removed /Users/moth3rship/Desktop/AI Design/Sandbox Suite/library/grids/410ef20f1a9d/phase3-headed.json`
- `[harness] annotate PNGs written: ['annotate-1789343591817.png', 'annotate-1789343597645.png', 'annotate-1789343602030.png']`

NOTES
- The two ruled-on staleness fixes (canvas `mode` -> "preview", tools `target` following the bound canvas) both hold in this run — neither shows up in the step 16 diff any more.
- Step 16's remaining diff is on the canvas_code widget's `target`, not tools — not one of the two rulings, left untouched per instructions ("change nothing else").
- A second run was made to check for flakiness: it reproduced step 16 and 18 failures but with a different, noisier diff shape (extra "targets" keys, other widgets implicated), suggesting a real timing/state issue in the app across widgets, not a harness expectation problem. That second run's output was not kept (wrong path, discarded) — this receipt reports the canonical run at Docs/Reports/phase3-headed-3F/M/results.json.
- Step 18's Monaco "Canceled" pageerror is still present; job L's code.js fix did not clear it.

STRAY FILES
- none remaining (a stray second-run folder was created and removed during this job)

GOALS DONE
- Step 16 expectation updated per both rulings; harness compiles; rerun executed and read

BRANDON'S TODOS
- Step 16: canvas_code's `target` still fails to round-trip after reload (not covered by either ruling) — needs a call on whether code widgets should get the same exception as tools, or whether this is a product bug
- Step 18: Monaco "Canceled" pageerror persists — job L's fix in code.js did not resolve it

CLOSER REVIEW
- Gets copy of review, not a contract.
- Rule on canvas_code target exception and Monaco pageerror — Brandon

---

SESSION REVIEW — Sandbox Suite Phase 3F job M, second pass — 2026-09-13

EDITS
- Docs/tests/phase3_headed.py:840-861 — step 16 target exception extended from tools-only to both follower widgets (canvas_code and canvas_tools); `canvas_ids = (a, b, d)` now the only source of "target" truth, `followers = (c, t)` the only widgets excused on that key
- static/js/widgets/codecanvas/code/code.js — investigated for the Monaco "Canceled" pageerror; no change kept (see NOTES)

STEPS (Docs/Reports/phase3-headed-3F/M3/results.json)
1. PASS — Canvas on the fixture draws inside the iframe
2. PASS — Tools beside the canvas, canvas focused: a click shows fields
3. PASS — drag 40px right: Tools box x moves, dirty, cmd-s saves, file changed
4. PASS — typing in Tools shows on the canvas after the debounce
5. PASS — Layers: dragging the last widget to the top reorders the canvas DOM
6. PASS — Library: dragging a card into the canvas adds a widget
7. PASS — marquee two, arrow right moves both, cmd-z returns both
8. PASS — Tools follows each canvas, then pins to the first and stays
9. PASS — Code scrolls to the header; a css edit re-renders one widget only
10. PASS — Code doc view with docEditable: an edited box moves the canvas
11. PASS — Export writes the HTML next to the doc with the back-link meta
12. PASS — export opens in file mode, bar reads from <doc>, drag saves and reopens
13. PASS — double-click a paragraph, type, Enter: the source changed
14. FAIL — Annotate: a box sent with none, raster, playwright; PNGs and user turns — note: `tracks=[] annotate_on=True frozen=True sends={'none': {'status': '', 'new_png': []}, 'raster': {'status': '', 'new_png': []}, 'playwright': {'status': '', 'new_png': []}} user_turns_in_archive=0`
15. PASS — preview mode: chrome hidden, nothing moves, no new errors
16. FAIL — reload returns every widget with its options — note: `returned=5/5 diffs={"canvas-mu0hkcmu-1": {"targets": [[], ["/Users/moth3rship/Desktop/AI Design/Sandbox Suite/docs/scratchpad/fixture.json"]]}, "canvas-mu0hkjxz-3": {"targets": [[], ["/Users/moth3rship/Desktop/AI Design/Sandbox Suite/docs/scratchpad/fixture2.json"]]}, "canvas-mu0hkuvr-5": {"targets": [[], ["/Users/moth3rship/Desktop/AI Design/Sandbox Suite/docs/scratchpad/fixture.html"]]}}`
17. PASS — closing an unrelated widget leaves both canvases as they were
18. PASS — zero pageerrors across the pass — note: `none`

CONSOLE / WARNING / PAGEERROR LINES (verbatim, Docs/Reports/phase3-headed-3F/M3/console.txt)
- `[harness] session open: {'sid': '410ef20f1a9d'}`
- `[harness] widgets left on the surface: []`
- `[harness] removed /Users/moth3rship/Desktop/AI Design/Sandbox Suite/library/grids/410ef20f1a9d/phase3-headed.json`
- `[harness] annotate PNGs written: []`

NOTES
- Item 1 (canvas_code target ruling): fixed as directed. `canvas_ids`/`followers` split so the "target" exception applies to both canvas_code and canvas_tools, checked only against the intrinsic canvas widgets' (a, b, d) post-reload targets — a widget's own target can no longer excuse itself. This ruling now holds cleanly whenever it's the only issue present.
- Item 2 (Monaco "Canceled"): read RECEIPT-phase3F-L.md — L's cause was resetModels() disposing all models while the editor held one live, fixed by dropping resetModels() from the mirrors.doc/target/canvas paths and keeping it unmount-only. That fix is intact in code.js; I did not touch it in the end (git diff on the file is clean against my edits). Before reverting, I traced setViewModel/showGuide/unmount (the three candidates given) and found no reachable path where cs.live is false but cs.editor still live — setViewModel and showGuide are only ever called from renderCurrent, which already returns early when `!cs.live`. I then built two isolated Playwright repros (one narrow: canvas+code widget through steps 9/10 and a reload; one wide: canvas+tools+code+export-canvas+queue_log-close+reload) and a diagnostic copy of the real harness with a `window.addEventListener('unhandledrejection', ...)` stack-capture hook wired in from page load, run through all 18 steps live against the real server. None of these reproduced the rejection or caught a stack. This run (M3) also came back with zero pageerrors. The "Canceled" pageerror is present in some runs (the original M run) and absent in others (this diagnostic run and M3) under what looks like identical steps — I could not pin a deterministic trigger, so I made no unverified change to code.js; the honest state is "still flaky, cause not isolated," not "fixed."
- Step 16 also surfaced a third issue this run, on none of the two rulings: a `targets` (plural) option on the plain canvas widgets (a, b, d) reads `[]` before reload and `[<target>]` after. This appeared in the diagnostic run and in M3, not in the original M run (which instead showed only the canvas_code `target` singular diff) — another sign of run-to-run non-determinism in what reload restores, not something either ruling covers. Not touched.
- Step 14 (Annotate) failed in this run (tracks=[], no PNGs) — not in scope for this job (steps 16/18 only), flagged for whoever owns Annotate.
- Diagnostic scratch scripts and their stray fixture files lived under my scratchpad and were removed from the project's docs/scratchpad before this run; M3's own fixture/grid files are cleaned up by the harness itself, same as M.

STRAY FILES
- none

GOALS DONE
- Canvas_code target exception added per ruling, holds in M3
- Monaco "Canceled" investigated with two repros plus a stack-capturing diagnostic run; not reproduced, no unverified fix applied

BRANDON'S TODOS
- Step 16: a `targets` (plural) key and the canvas_code/tools `target` follow-behavior both show up intermittently after reload — worth a look at whatever populates `targets` on restore, separate from either ruling
- Step 18: "Canceled" pageerror is flaky, not reproduced on demand — needs either more instrumentation in a real run or to be left as a known-intermittent line item
- Step 14: Annotate failed this run (tracks=[], no PNGs) — unrelated to this job, needs its own owner

CLOSER REVIEW
- Gets copy of review, not a contract.
- Rule on the `targets` plural key, the flaky Canceled pageerror, and the Annotate failure — Brandon
