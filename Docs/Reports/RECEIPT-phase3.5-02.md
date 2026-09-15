# RECEIPT — Phase 3.5 — 02 — Page setup

SESSION REVIEW — Sandbox Suite — job 2, page setup — 2026-09-14

EDITS
- static/js/widgets/codecanvas/tools/tools.js — pages tab: readPage, writePageFields, createPageBlock, renderPage; dispatch and mount-state wiring
- Docs/tests/phase35_02.py — headless Playwright test, new file

STRAY FILES
- none (test copies of phase35-magazine.html and second.html made and removed by the test's own teardown)

GOALS DONE
- Pages tab reads the live page block (defaults + missing flag) and renders size/margins/columns/bleed/grid
- Size presets (Letter/Tabloid/A4/A3/Custom), margin link checkbox, one set-css-token write per field
- Missing page block gains one on first write (3 of scope 3.1's 4 rules — see PICKS)
- node --check clean after every stage

BRANDON'S TODOS
- Decide whether the dropped `[data-cc-layer][data-cc-hidden]` rule on block-creation needs a 4th patchSource call (see PICKS)
- File-mode autosave-to-disk timing/mechanism needs a look — reload-persistence check is STUCK, likely not a tools.js bug (see STUCK below); canvas.js is job 3's file, not touched here

CLOSER REVIEW
- Gets copy of review, not a contract.
- Confirm STUCK item is canvas.js/save-layer, not tools.js, before job 3/5 pick it up — Brandon or closer

## STAGES

- [x] Stage 1 — receipt outline
- [x] Stage 2 — read the page
- [x] Stage 3 — the pages tab
- [x] Stage 4 — test and receipt (4/5, one check STUCK — see below)

## PICKS I MADE

- `readPage`/`writePageFields`/`createPageBlock`/`renderPage` are tools.js-local
  helpers, not `frame._canvas.page()`/`setPage()` — canvas.js is job 3's file
  right now. Job 5 should lift `readPage` → `page()` and a thin wrapper around
  `writePageFields` (one field, non-missing case) → `setPage(key, value)` onto
  `frame._canvas`.
- `frame._canvas.patchSource` only takes one patch (canvas.js:570-576,
  `applyPatches(cv, [patch])`); no multi-patch path is exposed today. Used
  three sequential `patchSource` calls for block creation, as the spec allows.
- Block-creation writes three rules, not all four in scope 3.1's page style
  block: `:root` (all ten tokens), `body`, `[data-cc-layer]`. Dropped
  `[data-cc-layer][data-cc-hidden] { display:none }` to hold the spec's
  literal "three patchSource calls" — no stage 4 test checks it, and hide/show
  is job 5's `hideSelection`/`showAll` territory, not page setup. Flagging for
  Brandon/job 5: add a fourth call there if the hidden-layer rule turns out to
  be load-bearing before layers exist.
- Size preset select writes `w` and `h` as two `set-css-token` calls (two undo
  steps) when the block exists, matching "each write is one set-css-token."
  Picking a preset is a compound action but the field-level contract holds.
- Margin "link" checkbox is per-tab session state (`tl.pageMarginLink`), not
  written to the document — matches the inspector's other local-only toggles,
  nothing in 3.1's token list covers a "linked" flag.
- W/H fields render disabled (not just non-writing) when a size preset is
  active, so they read as mirrors rather than dead inputs.

## CONTRACT FIELDS ADDED

FIELDS table (planned from scope 3.4 job 2, 3.1 tokens, before coding)

| field | shape | source token | notes |
|---|---|---|---|
| page() | `{w,h,marginTop,marginRight,marginBottom,marginLeft,columns,gutter,bleed,grid,missing}` | computed `--cc-*` | job 2 helper lives in tools.js, not canvas.js; job 5 lifts onto `frame._canvas` |
| setPage(key,value) | writes one `--cc-*` token | set-css-token | same helper, tools.js only |
| w | px number | --cc-page-w | |
| h | px number | --cc-page-h | |
| marginTop | px number | --cc-margin-top | |
| marginRight | px number | --cc-margin-right | |
| marginBottom | px number | --cc-margin-bottom | |
| marginLeft | px number | --cc-margin-left | |
| columns | int, unitless | --cc-columns | |
| gutter | px number | --cc-gutter | |
| bleed | px number | --cc-bleed | |
| grid | px number | --cc-grid | |

Canvas options touched: none (3.3 is jobs 3/5/10, not this job).

## READ LEDGER

- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-02-sonnet-page-setup.md — whole, once
- Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md — lines 69-205 (contracts), 240-260 (stages/receipts/loop guard), once
- static/js/widgets/codecanvas/tools/tools.js — lines 1-40, 120-270, 540-700, 700-776, once
- static/js/widgets/codecanvas/shared/patch.js — lines 256-267, 330-350, 535-580, once
- static/js/widgets/codecanvas/canvas/canvas.js — lines 565-580 (patchSource), 1360-1400 (frame._canvas), once
- Docs/Reports/RECEIPT-phase3.5-01b.md — grep only (KINDS table lines), once
- static/js/widgets/codecanvas/canvas/canvas.js — grep only (patchSource,
  applyPatches, save/dirty symbols), plus lines 565-580, 1360-1400, once
- Docs/tests/phase3F_headed.py — lines 1-100, 469-538, plus grep for
  STUB_PICKER/FILE_READY/boundFrame-equivalents, once (pattern reference for
  phase35_02.py: MX.grid.addWidget, setOption("target", ...), FILE_READY)
- Docs/scratchpad/second.html — grep + head only, confirmed no page block,
  used as the "plain html" fixture for stage 4 check 5

Tool call count at receipt finish: ~50

## TEST RESULT

Docs/tests/phase35_02.py, headless, against a copy of phase35-magazine.html
and second.html (plain, no page block) via the running server, session
0d78d246515f, surface phase35-02-headless. `node --check` clean throughout.

1. PASS — fixture copy opens in file mode
2. PASS — pages tab: set A4, body computed width 794px
3. PASS — pages tab: set columns 2, token reads 2
4. FAIL (STUCK) — reload: A4 width and columns 2 persist. Got width=816px,
   columns=3 (the original defaults) both attempts.
5. PASS — plain html with no page block: set Letter creates the block with
   all tokens

Log: Docs/Reports/phase35-02/phase35_02-results.json (written by the test)

## STUCK

- Check 4 (reload persistence): ran twice — 2.5s and 6s waits before
  `page.reload()` — both times the reloaded canvas shows the untouched
  defaults, meaning the in-iframe edits from checks 2 and 3 never reached
  disk before reload. `set-css-token`/`set-css-rule` writes go through
  `frame._canvas.patchSource` → `applyPatches` → `MX.grid.markDirty(frame)`
  (canvas.js:88-89, read this job) — that call marks the grid dirty; canvas.js
  also carries a separate `cv.dirty`/`selfSavedAt`/ade-socket-ack path
  (canvas.js:610, 707, 1391 `saveRecord`, 1687) that looked like the actual
  file-save route but wiring or timing it is canvas.js internals I don't own
  and didn't trace further. Not spending a third run per the loop guard.
  Handing to Brandon/job 3/5: confirm whether file-mode autosave-to-disk is
  wired at all yet, or needs a longer wait / an explicit save trigger the
  test should call.

## SUPERSEDED — session agent, 2026-09-14

Test line 4 STUCK closed by F-patch (Docs/Reports/RECEIPT-phase3.5-F-patch.md). Cause was the test, not canvas.js or patch.js: no canvas mode and no save before reload. phase35_02.py now 5 of 5.
