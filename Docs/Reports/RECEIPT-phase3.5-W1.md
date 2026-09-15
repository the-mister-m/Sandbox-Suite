# RECEIPT — Phase 3.5-Adobe — W1 — headed walk, layers seam

Spec: [SPEC-phase3.5-W-opus-headed.md](../Specs/Code%20Canvas%20port/Phase3.5%20Adobe/SPEC-phase3.5-W-opus-headed.md)
Scope: [SCOPE-phase3.5-adobe.md](../Scope/Code%20Canvas%20port/SCOPE-phase3.5-adobe.md) section 6, lines 1, 2, 4, 5, 6, 13, 14, 15
Gate: [RECEIPT-phase3.5-R2-rerun.md](RECEIPT-phase3.5-R2-rerun.md) — GREEN
Harness: [phase35_W1.py](../tests/phase35_W1.py) — headed Chrome, 1720x1060, session 0d78d246515f, surface phase35-W1
Shots and console: [phase35-W1/](phase35-W1/) — [run 1 json](phase35-W1/phase35-W1-results-run1.json), [run 2 json](phase35-W1/phase35-W1-results-run2.json)
Ran 2026-09-14, run 1 at 23:50, run 2 at 23:52. Two runs, the second is the last.

## VERDICT

3 of 8 lines PASS. Failing lines: 4, 5, 6, 13, 14.
Console clean. Fixtures byte-identical.

## WALK — one line per scope line

1. **PASS** — [line01-preview-nothing-selects.png](phase35-W1/line01-preview-nothing-selects.png)
   New surface, three widgets added from the picker: Canvas, Tools, Targets.
   The canvas is pointed at the fixture copy and opens it in file mode. The
   mode reads `preview`. Clicking the headline in the page selects nothing —
   the selection list stays empty.

2. **PASS** — [line02-page-letter-3col-48.png](phase35-W1/line02-page-letter-3col-48.png)
   Tools to the Pages tab. The Size dropdown offers Letter, Tabloid, A4, A3,
   Custom. Picking Tabloid resizes the page to 1056x1632; picking Letter puts
   it back to 816x1056. Count 3, Top 48 typed into the panel. Four margin
   lines and four column lines draw over the page (`.cc-line-margin` x4,
   `.cc-line-column` x4), plus the fixture's two guides.

4. **FAIL** — [line04a-layers.png](phase35-W1/line04a-layers.png),
   [line04b-art-hidden.png](phase35-W1/line04b-art-hidden.png)
   The Layers tab shows two rows, Art over Text. **There is no Master row.**
   The page has no master footer to click — nothing in the document matches
   `[data-cc-var="page-number"]`, so the "click the footer, nothing happens"
   step has nothing to click. The rest of the line is right: right-click Art
   → Lock, then clicking the gold ellipse selects nothing; right-click Art →
   Hide and the Art layer goes `display: none`, the border, ellipse, rule,
   triangle and swoop all vanish; right-click → Show brings them back.

5. **FAIL** — [line05a-photo-in-art.png](phase35-W1/line05a-photo-in-art.png),
   [line05b-item-menu.png](phase35-W1/line05b-item-menu.png),
   [line05c-layer-menu.png](phase35-W1/line05c-layer-menu.png)
   The photo row starts at slot 5 of 7 in Text. Dragging it onto the Art row
   moves it — it lands in Art, slot 1 of 2. **Then ▲ is greyed out, both
   times, so it never moves up two.** The drop puts the row at the front of
   a two-row layer, and the walk's "▲ twice" has no room above it. Both
   menus are complete: the item menu reads Group, Ungroup, Isolate, Arrange,
   Lock, Unlock all, Hide, Show all, Move to layer, Duplicate, Delete, and
   `menuItems()` carries Bring to front / Bring forward / Send backward /
   Send to back under Arrange and one row per layer under Move to layer; the
   layer menu reads New layer, Duplicate layer, Delete layer, Rename, Lock,
   Hide, Merge down, Select all on layer, Move selection here. Nothing from
   3.4 job 4 or job 5 is missing.

6. **FAIL** — [line06-snippet-dropped.png](phase35-W1/line06-snippet-dropped.png)
   Tools to Snippets, active layer set to Text. Dragging a Text frame onto
   the page at 120,820 lands a div on the Text layer at exactly 120,820,
   holding the Lorem ipsum placeholder. **It cannot be typed in.** The
   dropped div is not contenteditable, a double-click does not focus it, and
   typing "W1 typed here" leaves the placeholder text untouched.

13. **FAIL** — [line13-saved.png](phase35-W1/line13-saved.png)
    Cmd-S with the canvas focused. Status reads `saved`. The file on disk
    holds the page block with all ten `--cc-*` tokens, no `translate(`
    anywhere (the drags are folded into left/top), no rulers, no guides
    layer, no `data-cc-chrome`, no master content. **It holds two layers,
    Text and Art, not three.** No third layer exists to save: the W1 walk
    lines never add one, and the Master layer of scope line 4 is not built.

14. **FAIL** — [line14-after-reload.png](phase35-W1/line14-after-reload.png)
    Reload the browser on the same surface. The canvas comes back in file
    mode, both layers return in order, the photo is still in Art, the
    dropped snippet is still in Text at slot 6. **The master footer is not
    there and there is no page number to read** — no Master layer, no
    `[data-cc-var="page-number"]` node. The `cc-page-number` meta in the
    file still reads 1, so the number survived the save; nothing renders it.

15. **PASS** — [line15-console.png](phase35-W1/line15-console.png)
    Zero page errors, zero console errors, zero console warnings across the
    whole run, both runs. Full dump in the run json.

## LOOP GUARD

Every line got two attempts inside each run, both recorded in the json.
The walk ran twice. Between the runs two probes in the harness were
re-aimed, neither at a product behaviour:
- the margin/column check counted `[data-cc-chrome]` nodes, which is only
  the injected style tag; it now counts `.cc-line-margin` / `.cc-line-column`
  as `drawPageChrome` writes them ([canvas.js:566](../../static/js/widgets/codecanvas/canvas/canvas.js#L566)).
  Line 2 went FAIL to PASS on that correction.
- the photo row lookup grabbed the `<img>`, which carries its own od-id;
  it now walks up to the layer's own child, the wrapping div. Line 5's
  result did not change.
No assertion was loosened. Run 2 is the record.

## FIX LIST

1. **Line 4, 13, 14 — masters are not built.** No Master layer, no master
   footer, no page-number rendering. `grep -n master static/js/widgets/codecanvas/canvas/canvas.js`
   returns nothing, and the fixture's `<link rel="cc-master" href="spread.master.html">`
   is never followed. Suspect: [canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js)
   — job 14 (SPEC-phase3.5-14-opus-masters.md) is unbuilt, so this is a gap,
   not a regression. Three walk lines cannot pass until it lands.
2. **Line 5 — ▲ dead after a cross-layer drop.** The drop puts the row at
   the front of the target layer, so the forward arrow is disabled and the
   walk's "▲ twice" cannot run. Either the drop should land at the drop
   point's depth rather than the front, or scope 6 line 5 is written against
   a layer with more rows. Suspect: [tools.js](../../static/js/widgets/codecanvas/tools/tools.js)
   layer-row drop handler and the item-row arrow enable test. **Brandon's
   call — this may be a scope wording problem, not code.**
3. **Line 6 — a dropped text frame takes no typing.** The div lands right,
   on the right layer, at the right point, but is not contenteditable and
   does not focus on double-click. Suspect: [tools.js](../../static/js/widgets/codecanvas/tools/tools.js)
   snippet drop (the inserted html carries no editing hook) and
   [canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) text
   edit entry. Scope 6 line 6 ends "Type in it."
4. **Line 13 — three layers on disk.** Not reachable from the W1 line set.
   Either the walk needs a "+ Layer" step, or the third layer is the Master
   from item 1. No code suspected.

## SHA — fixtures untouched

| file | before | after |
| --- | --- | --- |
| Docs/scratchpad/phase35-magazine.html | `d0a2e790…a50f5f` | `d0a2e790…a50f5f` |
| Docs/scratchpad/spread.master.html | `6f8e8d6b…faa9b716` | `6f8e8d6b…faa9b716` |

Byte-identical both runs. The walk worked on `Docs/scratchpad/phase35_W1-magazine.html`,
copied at start and deleted at teardown.

## CONSOLE SUMMARY

Both runs: 0 pageerrors, 0 console errors, 0 console warnings. The only
harness-written console lines are the session-open response and the retry
markers. Full text in the two run json files.

## READ LEDGER

- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-W-opus-headed.md — whole (53 lines), once
- Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md — lines 140-170 and 261-297, once
- Docs/Reports/RECEIPT-phase3.5-R2-rerun.md — whole (85 lines), once
- Docs/tests/phase35_04.py — lines 1-120, 120-200, 200-330, 330-427, once each (427 lines, never opened whole)
- Docs/tests/phase35_02.py — lines 65-168 plus grep hits, once
- Docs/tests/phase35_03.py — grep hits plus lines 468-498, once (560+ lines, never opened whole)
- Docs/tests/phase35_15.py — lines 50-115 plus grep hits, once
- Docs/scratchpad/phase35-magazine.html — whole (96 lines), once
- Docs/scratchpad/spread.master.html — whole (30 lines), once
- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-04-opus-layers-panel.md — grep hits only, once
- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-05-opus-layers-canvas.md — grep hits plus lines 55-75, once
- static/js/widgets/codecanvas/tools/tools.js — grep hits only, once
- static/js/widgets/codecanvas/canvas/canvas.js — grep hits plus lines 560-600, once (never opened whole)
- library/registry/widgets.json — grep hit only, once

## SESSION REVIEW — Sandbox Suite Phase 3.5-Adobe W1 — 2026-09-14 23:50 to 23:53

EDITS
- [Docs/tests/phase35_W1.py](../tests/phase35_W1.py) — the headed W1 walk harness, new
- [Docs/Reports/phase35-W1/](phase35-W1/) — 11 shots and 2 run json files, new
- [Docs/Reports/RECEIPT-phase3.5-W1.md](RECEIPT-phase3.5-W1.md) — this receipt, new
- [SESSIONLOG.md](../../SESSIONLOG.md) — one line appended
- [INDEX.md](../../INDEX.md) — one line appended

STRAY FILES
- none. The fixture copy was deleted at teardown; both originals are byte-identical.

GOALS DONE
- Every W1 walk line has a record and a shot.
- Lines 1, 2, 15 PASS. Lines 4, 5, 6, 13, 14 FAIL, each with a shot and a named suspect.
- No widget code touched.

BRANDON'S TODOS
- Rule on FIX LIST item 2 — whether "▲ twice" in scope 6 line 5 is a code
  fix or a scope rewrite.
- Decide whether W1 reruns after job 14 (masters) lands, or whether W3 covers it.

CLOSER REVIEW
- Gets a copy of this review, not a contract.
- Lines 4, 13 and 14 fail only on masters (job 14, unbuilt) — carry as a
  known gap, not a regression — closer.
- FIX LIST items 2 and 3 are real findings against built jobs 5 and 15 — Brandon.
