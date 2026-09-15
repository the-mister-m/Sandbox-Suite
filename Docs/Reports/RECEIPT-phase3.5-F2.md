# RECEIPT — Phase 3.5-Adobe — F2 (fix after R2)

Spec: [SPEC-phase3.5-F-sonnet-fix.md](../Specs/Code%20Canvas%20port/Phase3.5%20Adobe/SPEC-phase3.5-F-sonnet-fix.md)
Work order: [RECEIPT-phase3.5-R2.md](RECEIPT-phase3.5-R2.md), FIX LIST (9 items)

## SESSION REVIEW — Phase 3.5-Adobe F2 — 2026-09-14

EDITS
- [static/js/widgets/codecanvas/tools/tools.js](../../static/js/widgets/codecanvas/tools/tools.js) — items 2, 3, 4, 5
- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — items 6, 7
- [Docs/tests/phase35_05.py](../tests/phase35_05.py) — item 9
- [RECEIPT-phase3.5-03.md](RECEIPT-phase3.5-03.md) — item 8, one line under CONTRACT FIELDS ADDED

STRAY FILES
- none

## STAGES

1. [x] patch.js — nothing to fix, `wrap.tag` confirmed present. Context only.
2. [x] tools.js `ensureLayers` (~828) — `wrap` patch now carries `tag: "section"`.
3. [x] tools.js ~431 — trimmed the job-5 hand-off line under `// ---------- page ----------`.
4. [x] tools.js ~748-751 — trimmed the four-line hand-off block to a `state:` line.
5. [x] tools.js ~648-654 — snippet drop now calls `cur.insertAt(html, pt)` on
   `frame._canvas` instead of a direct `patchSource({kind:"insert",...})`.
   Selection-after-drop kept (insertAt calls `setSelection` internally, same
   mirrors bus tools.js used before). `node --check` clean both attempts.
6. [x] canvas.js `addLayer` ~1752-1759 — local var renamed `kind` -> `p`.
7. [x] canvas.js `getOptions` ~2599-2618 — added `activeLayer: cv.activeLayer`.
8. [x] RECEIPT-phase3.5-03.md — appended `data-cc-chrome`/`data-cc-ruler` line
   under CONTRACT FIELDS ADDED.
9. [x] Docs/tests/phase35_05.py `PICK_ABS` — added the svg-layer-root
   fallthrough (`n.tagName.toLowerCase() === "svg" && n.parentElement.matches
   ("[data-cc-layer]")`) copied from phase35_03.py's `PICK_ITEM`
   `isLayerOrRoot`. Rerun with `--session 0d78d246515f`: 9/9, line 4 now PASS,
   the other 8 stayed green.

## TEST RERUNS

- Docs/tests/phase35_04.py — 12/12 PASS. Manual follow-up check (throwaway
  Playwright script, scratchpad, not committed) confirmed item 2's target
  directly: a plain file with no layers gets a Layer 1 whose DOM tag is
  `SECTION`, not `DIV`.
- Docs/tests/phase35_05.py — 9/9 PASS (was 8/9 before item 9).
- Docs/tests/phase35_15.py — 3/4 PASS. Item 5's own line ("Drop Text frame at
  200,300: one div, selected") FAILS. See STUCK note below — code change
  matches the FIX LIST wording exactly; the test failure is a separate,
  pre-existing fixture/contract interaction.

## STUCK — phase35_15.py line 3, not item 5's code fix

Two attempts:
1. Straight swap to `cur.insertAt(html, pt)` per the FIX LIST wording. Test
   line 3 failed: "no div at 200,300".
2. Added `ensureLayers(tl, cur)` before the drop on the theory the fixture
   had no `[data-cc-layer]` yet. Traced further: the fixture already has two
   layers ("Text", "Art"/svg). `ensureLayers` was a no-op both times.
   Reverted (kept the diff to exactly the FIX LIST's ask).

Root cause found: `activeLayerEl` in canvas.js (job 5's own, already
reviewed PASS in R2) falls back to "the topmost unlocked layer" when no
active layer is set — and `layerNodes`' own comment says "DOM order, first
is bottom." In this fixture "Art" (svg, plugin) is last in the DOM, so it is
topmost, so a freshly-loaded drop with no active layer chosen lands in the
svg layer's own `<svg>`, not the "Text" html layer the test's
`DROPPED_STATE` checks (`doc.querySelector("[data-cc-layer]")`, first only).
This is the exact svg-layer-targeting behavior the FIX LIST asked insertAt
to have — it is working as specified. The test assumes drop always lands in
the first/bottom layer, which held under the old direct-patch code (whose
`dropParentNode` literally picked `doc.querySelector("[data-cc-layer]")`)
but no longer holds once "the active layer" is contract-defined as topmost
unlocked.

Fixing this needs either: the fixture's layer order changed, the test
choosing/asserting on a layer explicitly, or a default-active-layer policy
change in job 5's `activeLayerEl` — none of which are `tools.js`,
`canvas.js` lines 648-654, or a file I'm permitted to touch (phase35_15.py
is not on my edit list). Leaving this to the coordinator/redpen.

## PICKS I MADE

- Item 5: kept `snippetOuterHtml(def, "drop", pt.x, pt.y)` to build the raw
  html handed to `insertAt` — the placeholder id/position it bakes in are
  both overwritten by `insertAt`'s own `placeHtmlAt` (real id via
  `patch.newId`, position via `pt`), so nothing bakes-in wrong; width/height/
  `extra` from the snippet def survive untouched. `dropParentNode` (now
  unused) left in place — out of the item's 648-654 range, not asked for.
- Item 6: renamed to `p`, matching the existing `plugin` param name style in
  tools.js's own `addLayer`/`layerHtml` (which use `plugin` directly, no
  local rename needed there since they don't branch on a short local).

## node --check

- tools.js — clean after every edit round.
- canvas.js — clean after items 6 and 7.

## READ LEDGER

- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-F-sonnet-fix.md — whole, once
- Docs/Reports/RECEIPT-phase3.5-R2.md — FIX LIST section, once
- static/js/widgets/codecanvas/tools/tools.js — lines 420-440, 570-662,
  740-850, once each (never opened whole)
- static/js/widgets/codecanvas/canvas/canvas.js — lines 1685-1719, 1745-1762,
  1830-1900, 2595-2622, activeLayer grep hits, once each (never opened whole)
- Docs/tests/phase35_03.py — PICK_ITEM block (200-260), once
- Docs/tests/phase35_05.py — PICK_SHAPE/PICK_ABS block (140-220), once
- Docs/tests/phase35_04.py — argparse, MOUNT/DOC_LAYERS/PANEL_LAYERS blocks
  (55-100), tail assertions (380-412), once each
- Docs/tests/phase35_15.py — DROP_TEXT_FRAME/DROPPED_STATE block (70-195), once
- Docs/scratchpad/phase35-magazine.html — grepped for `data-cc-layer` count
  and lines only, not opened whole
- SESSIONLOG.md, INDEX.md — tail only, for append-format reference

## SUPERSEDED

None.
