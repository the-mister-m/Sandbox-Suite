# RECEIPT — Phase 3.5 — 03 — rulers, guides, snap, zoom

Job 3. Owns `static/js/widgets/codecanvas/canvas/canvas.js` only.
Spec: [SPEC-phase3.5-03-opus-rulers-guides-snap.md](../Specs/Code%20Canvas%20port/Phase3.5%20Adobe/SPEC-phase3.5-03-opus-rulers-guides-snap.md)
Scope: [SCOPE-phase3.5-adobe.md](../Scope/Code%20Canvas%20port/SCOPE-phase3.5-adobe.md)

## STAGES

- [x] Stage 1 — receipt outline
- [x] Stage 2 — zoom for file mode — `node --check` clean
- [x] Stage 3 — rulers, margins, columns — `node --check` clean
- [x] Stage 4 — guides — `node --check` clean
- [x] Stage 5 — snap — `node --check` clean
- [x] Stage 6 — test and receipt — `node --check` clean; walk run twice,
  5 of 9 lines PASS, 4 blocked by the harness picker — see STUCK

## FIELDS

Canvas options added (scope 3.3):

| option | type | default |
| --- | --- | --- |
| `snap` | bool | `true` |
| `snapTo` | array of `"grid"`, `"guides"`, `"objects"` | all three |
| `rulers` | bool | `true` |
| `showGuides` | bool | `true` |
| `showMargins` | bool | `true` |
| `showColumns` | bool | `true` |
| `zoomPct` | number 25–400 | `100` |

`frame._canvas` additions (scope 3.4, job 3 line):

| member | returns |
| --- | --- |
| `guides()` | `{v: [px], h: [px]}` in page px |
| `addGuide(axis, px)` | bool, writes `data-cc-guides` on body |
| `removeGuide(axis, px)` | bool, writes `data-cc-guides` on body |
| `snapPoint({x,y})` | `{x,y}` in page px |
| `page()` | `{w,h,marginTop,marginRight,marginBottom,marginLeft,columns,gutter,bleed,grid}` |

Page tokens read from `:root` (scope 3.1): `--cc-page-w`, `--cc-page-h`,
`--cc-margin-top`, `--cc-margin-right`, `--cc-margin-bottom`,
`--cc-margin-left`, `--cc-columns`, `--cc-gutter`, `--cc-bleed`, `--cc-grid`.

## PICKS I MADE

- The guides layer and the ruler host hang off `documentElement`, not
  `body`. The zoom transform is on body, and a transformed ancestor turns
  `position: fixed` into a containing block, so chrome parented under body
  would be scaled a second time and offset by body's auto margin. Outside
  body, every `getBoundingClientRect` the chrome already uses stays correct
  at any zoom and no rect needs dividing. The spec's stage 2 wording
  ("every rect you read is divided by the scale") describes the other
  arrangement; the outcome it asks for is the same.
- `paintFileSelection` is now a one-line call into `paintChrome`, which
  owns the single clear of the guides layer and then draws rulers, page
  chrome and selection in that order. Every existing caller keeps working.
- Drag snapping is on the element's left and top edge only, per stage 5.
  Snap targets are cached once per drag; guides and grid are not.
- `snapTo` gets no `optionControls` entry — `widget-frame.js` renders bools
  as checkboxes on its own, and an array renders as a JSON row.
- Job 2's `page()` is added here because `frame._canvas` lives in canvas.js
  and job 2 owns tools.js only. `setPage` is NOT added — it is not named in
  this spec. See BRANDON'S TODOS.
- Major ruler ticks carry `data-cc-px` with the page px they stand for, so
  the test can assert ruler accuracy against a tick rather than a label.

## CONTRACT FIELDS ADDED

- `zoomPct` — canvas option, 25–400, default 100. Scope 3.3 lists the other
  six options but not zoom; stage 2 names `zoomPct` and it is saved and
  restored with the rest.
- `page()` on `frame._canvas` — scope 3.4 assigns it to job 2, which cannot
  reach canvas.js. Same shape as the 3.4 line.
- `data-cc-px` on major ruler ticks — chrome only, inside the ruler host,
  never saved.
- `data-cc-chrome` (line 464) and `data-cc-ruler` (lines 517-518) — host-node
  attributes, chrome only, never reach the saved file. Added by F2 per FIX
  LIST item 8 in RECEIPT-phase3.5-R2.md.

## READ LEDGER

| file | lines | times |
| --- | --- | --- |
| canvas.js | 1-60, 182-400, 660-800, 976-1090, 1155-1200, 1245-1410, 1480-1557 | once each |
| canvas-core.js | 30-100, 160-201 | once each |
| patch.js | 55-120, 137-185, 521-545, 631-690 | once each |
| phase35_01.py | whole, 630 lines | once, the harness shape |
| phase35-magazine.html | 13-60 | once, after run 2, to explain the picker |

canvas.js was never opened whole. Every range came from a symbol grep first.

## TOOL CALLS

- Stage 1: 10
- Stage 2: 22
- Stage 3: 26
- Stage 4: 29
- Stage 5: 33
- Stage 6: 55

## STUCK

Stage 6. `phase35_03.py` ran twice. The loop guard forbids a third run of
the same command, so I stopped there.

Run 1 — 4 PASS (1, 4, 8, 9), 5 FAIL (2, 3, 5, 6, 7).
Run 2 — 5 PASS (1, 3, 4, 8, 9), 4 FAIL (2, 5, 6, 7).
Output: [phase35-03/results.json](phase35-03/results.json),
[console.txt](phase35-03/console.txt), nine screenshots.

What the two runs settle:

- Rulers read true page px. Run 1 was off by 2.5px because the harness
  measured the number label, which carries a 2px nudge. Run 2 measures the
  tick and the worst gap across 17 major ticks is 0.5px. PASS.
- A guide survives save and reload, and no ruler, guide layer or chrome
  stylesheet reaches the file. PASS both runs.
- `page()` reads every 3.1 token off `:root`. PASS.
- Console clean, nothing 404s, no page errors. PASS.

What is NOT settled — lines 2, 5, 6, 7 (zoom chrome, snap on, Cmd-Z, snap
off). All four failed for one harness reason, not a code fault: `PICK_ITEM`
returned no element (run 2 note: `scanned: 17, candidates: 0`). Reading the
fixture afterwards showed why — the Art layer's `<svg>` covers the page, and
my `resolves()` lacked the svg-layer-root fallthrough that
`phase35_01.py` has. Every candidate hit the svg first and was rejected.
Fixed in the file, unverified.

Second harness fault found in the same read, also fixed and unverified: the
fixture already ships `body data-cc-guides="v:120;h:300"`, so line 4's
assertion on `h:300` passed both runs whether or not the ruler drag worked.
Line 4 now drags to y=420 and asserts the value was absent before the drag;
lines 4 and 8 both key on `h:420`.

Next run of `python3 Docs/tests/phase35_03.py --session <sid> --out
Docs/Reports/phase35-03/` is the one that proves zoom chrome, snap and the
guide drag. It needs a lifted loop guard.

Job 2's STUCK, checked on my path: it does not reproduce for `set-attr`.
Line 8 wrote `data-cc-guides` through `patchSource`, Cmd-S put it on disk,
and the reload brought it back — both runs. If job 2's `set-css-rule` edits
are lost, the fault is in that kind's source-text apply or in the style
block it targets, not in `doSave` or `loadTarget`. I changed nothing for it.

---

SESSION REVIEW — Sandbox Suite — Phase 3.5 job 3 — 2026-09-14

EDITS

- [canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — zoom,
  rulers, margins, columns, guides, snap. The only source file touched.
- [phase35_03.py](../tests/phase35_03.py) — the job 3 headless walk, new.
- [RECEIPT-phase3.5-03.md](RECEIPT-phase3.5-03.md) — this receipt.
- [SESSIONLOG.md](../../SESSIONLOG.md) — one appended line.
- [INDEX.md](../../INDEX.md) — one appended line.

STRAY FILES

- [phase35-03/](phase35-03/) — screenshots, console.txt, results.json from
  the two runs. Evidence, keep.

GOALS DONE

- Rulers read true page px at every zoom — worst tick gap 0.5px.
- A guide survives save and reload.
- Nothing the canvas draws for itself reaches the saved file.
- Zoom 25–400 with bar, keys, Cmd-wheel and Space-drag pan.
- `guides()`, `addGuide`, `removeGuide`, `snapPoint`, `page()` on
  `frame._canvas`.
- `node --check` clean after every stage.

BRANDON'S TODOS

- Lift the loop guard for one more `phase35_03.py` run. Lines 2, 5, 6, 7
  are unproven and the two harness faults behind them are fixed but
  unverified.
- `setPage(key, value)` from scope 3.4 is on nobody. Job 2 owns tools.js,
  and `frame._canvas` is in canvas.js. Say who adds it.

CLOSER REVIEW

- Gets a copy of this review, not a contract.
- Decide the `phase35_03.py` rerun — Brandon.
- Decide who adds `setPage` — Brandon.
- Job 2's set-css-rule STUCK stays open; it is not on job 3's path — closer.

## RERUN 3 — session agent, 2026-09-14

phase35_03.py run 3, session 0d78d246515f, out Docs/Reports/phase35-03/: 9 of 9 PASS. Lines 2, 5, 6, 7 proven. Line 4 h:420 proven. findings: [].
