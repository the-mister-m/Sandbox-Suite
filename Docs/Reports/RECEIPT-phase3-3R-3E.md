# SESSION REVIEW — Sandbox Suite — Phase 3-3R, redpen after 3E, Annotate — 2026-09-12

## EDITS

- none. Read-only redpen. One line each added below to SESSIONLOG.md and INDEX.md.

## READ

- [Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md](../Specs/Code%20Canvas%20port/SPEC-session-agent-phases1-3.md) section 2.
- [Docs/Reports/RECEIPT-phase3-3E.md](RECEIPT-phase3-3E.md), whole.
- [Docs/Specs/Code Canvas port/Phase3 Canvas 2D/SPEC-phase3-3E-sonnet-annotate.md](../Specs/Code%20Canvas%20port/Phase3%20Canvas%202D/SPEC-phase3-3E-sonnet-annotate.md), whole.
- [static/js/widgets/canvas/shared/annotate.js](../../static/js/widgets/canvas/shared/annotate.js), whole.
- [static/js/widgets/canvas/canvas/canvas.js](../../static/js/widgets/canvas/canvas/canvas.js), the 3E-added ranges (bar button, defaults, mount, unmount, onFrame, onOption, getOptions, helper functions) plus the `frame._canvas` block.
- [server.py](../../server.py) :1630-1694, the `/api/fs/put` and new `/api/snapshot` routes.
- [static/matrix.html](../../static/matrix.html), whole.
- [static/vendor/dom-to-image/dom-to-image.min.js](../../static/vendor/dom-to-image/dom-to-image.min.js) — confirmed 9,278 bytes exposing `toPng`, matches the receipt's claim.
- [Docs/Reports/RECEIPT-phase3-3B.md](RECEIPT-phase3-3B.md) CANVAS API section, [Docs/Reports/RECEIPT-phase3-3C.md](RECEIPT-phase3-3C.md) for the `doc()` addition.

## CHECKS — EVERY RUN

- Every option in the job spec's defaults is in getOptions and handled in onOption — PASS. `annotate`, `snapshot`, `annotateTrack` in `MOD.defaults` (canvas.js:1400-1403), all three in `getOptions` (canvas.js:1618-1620) and `onOption` (canvas.js:1598-1603).
- Every mirror emit passes through MX.mirror; no raw `MX.bus.emit` of a family channel — PASS. No `bus.emit` in annotate.js or the 3E-added canvas.js ranges; `setAnnotate` calls `frame._canvas.freeze(on)` directly, a same-instance function call, not a bus channel.
- Mirror receipts never re-emit — PASS, unchanged from 3B/3C; `cv.mirrors` freeze handler (canvas.js:1491) calls `applyFreeze` only.
- subscribe before first send. off and dispose in unmount — PASS. canvas.js:1455-1456 subscribes `["file","saved","tree_dirty","ade_init","track_list"]` before sending `roster`. `cv.mirrors.off()` in unmount (canvas.js:1518); annotate.js's own listeners are bound to its own discarded `<canvas>` node, nothing global to release.
- No module-level mutable state that two instances would share — PASS. annotate.js's `st` is per-call closure state; `SNAPSHOT_MODES` (canvas.js:19) is a read-only constant, always `.slice()`d.
- Registry row type matches registerWidget. Script tag present and ordered after the core tags — PASS. `annotate.js` tag (matrix.html:56) sits after `canvas-core.js` (:55) and before `canvas.js` (:57); `dom-to-image.min.js` (:37) loads before both. Registry row for `canvas` unchanged by this job.
- node --check clean. py_compile clean if server.py was touched — PASS. `node --check` clean on annotate.js and canvas.js; `python3 -m py_compile` clean on server.py.

## CHECKS — 3E

- Three snapshot methods present and selectable. 501 path handled — PASS. `raster`/`playwright`/`none` in `SNAPSHOT_MODES` and `backgroundFor()` (annotate.js:230-235); selectable via `optionControls.snapshot` (canvas.js:1486). A non-OK response (including the route's 501) resolves to `null` in `playwrightBackground` (annotate.js:78), composite falls back to white and `setStatus(method + " missing page")` fires — no throw, no hang. Small double-check, noted not fixed: the status line shows a generic "playwright missing page" rather than surfacing the route's own `{error: "no playwright"}` text; spec's wording ("the widget shows that in its status line") reads as wanting the specific message. Cosmetic, not a contract break — every failure mode (501, network error, missing selector) degrades the same safe way.
- PNG path under docs/scratchpad/. user frame carries image_paths — PASS. annotate.js:265 `"docs/scratchpad/annotate-" + Date.now() + ".png"`; annotate.js:271 `frame.send({type:"user", track, text, image_paths:[res.path]})`, matching the spec's frame shape exactly.
- Freeze on while annotate is on; released when off — PASS. `setAnnotate` (canvas.js:1626-1631) calls `cv.frame._canvas.freeze(on)` on both the bar-button toggle and the `annotate` option, matching the job spec's own line naming `frame._canvas.freeze(true)` directly (not the `canvas.freeze` mirror — see PICKS below).
- Canvas getOptions has the three new keys — PASS. canvas.js:1618-1620.

## PICKS I MADE

- None. No fix needed; the one double-check above (generic vs. specific playwright-failure status text) is noted, not touched — a multi-file, judgment-call change to route error text through the client is outside a redpen's MAY FIX list.

## CONTRACT CHECK

3E's three PICKS (direct `freeze()` not the mirror, `annotate` always reading back `false`, track names from cached `ade_init`/`track_list` not a fetch) were each checked against the contract and the job spec, not just against the receipt's own reasoning:
- Direct `frame._canvas.freeze(on)` — matches SPEC-phase3-3E-sonnet-annotate.md Part 3's own line naming that exact call. Not a narrowing of contract 2.7's `canvas.freeze` mirror channel — that channel is untouched, still used by 3D's Code widget for cross-instance freezing. Annotate's direct call only reaches its own same-instance canvas. PASS.
- `annotate` pinned `false` in `getOptions` — matches 3D's `locked` precedent (RECEIPT-phase3-3D.md) and the spec's "Done when" line ("annotate is off" on reload, unqualified). PASS, not a narrowing since `onOption("annotate", …)` still drives the live toggle.
- `doc()` on `frame._canvas` — verified as a real 3C contract addition (RECEIPT-phase3-3C.md:100, canvas.js:1476), not invented by 3E. PASS.

Contract fields added by 3E (three `getOptions` keys, `/api/snapshot`) are additive only — the eight pre-existing keys' shapes are unchanged (canvas.js:1610-1617, 1570-1597).

## DONE WHEN

Every check PASS. Nothing FIXED, nothing FAIL.

## QUESTIONS FOR THE SESSION AGENT

- None.

## BRANDON'S TODOS

- Same standing items as RECEIPT-phase3-3E.md: no headed proof ran (3H covers it), and a server restart is needed before `/api/snapshot` and 3A's `b64` fix are both live — **Brandon**.

## CLOSER REVIEW

- Every check in SPEC-phase3-3R-sonnet-redpen.md, parameterized for 3E, PASS. Zero FAIL, zero FIXED — **closer**.
- One small double-check noted, not fixed: playwright-failure status text is generic, not the route's specific error — **closer** to decide if worth a follow-up seam.
- 3E's three PICKS re-checked against contract text directly, not taken on the receipt's word alone — **closer**.
