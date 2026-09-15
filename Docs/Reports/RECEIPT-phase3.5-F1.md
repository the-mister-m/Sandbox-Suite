# RECEIPT — Phase 3.5-Adobe — F1 (fix after R1)

## SESSION REVIEW — Sandbox Suite — 2026-09-14

EDITS
- [static/js/widgets/codecanvas/shared/canvas-core.js](../../static/js/widgets/codecanvas/shared/canvas-core.js) — FAIL A, comment trimmed to label/function only, line 134
- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — FAIL B, `closestTarget` falls through layer sections and svg layer roots, lines 193-224
- [Docs/scratchpad/phase35-magazine.html](../scratchpad/phase35-magazine.html) — FAIL B, `pointer-events:none` reverted, line 86
- [Docs/tests/phase35_01.py](../tests/phase35_01.py) — FAIL B, `PICK_SIBLINGS`/`PICK_TEXT_LEAF` probes mirror the same fallthrough instead of raw `elementFromPoint`, lines ~156-216, ~223-247
- [static/js/widgets/codecanvas/shared/patch.js](../../static/js/widgets/codecanvas/shared/patch.js) — FAIL D, `doSetStyle` drops the `style` attribute when empty, line ~293

STRAY FILES
- none

GOALS DONE
- FAIL A fixed
- FAIL B fixed
- FAIL C recorded (no code change)
- FAIL D fixed
- phase35_01.py: 12/12 PASS
- phase35_patch.html: 22/22 PASS

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm the FAIL B pick (elementsFromPoint fallthrough in canvas.js's click resolution, test probes updated to match, no CSS approach used) matches your intent — who: Brandon.

## STAGES

- [x] FAIL A — canvas-core.js:134 comment
- [x] FAIL B — phase35-magazine.html pointer-events + canvas.js closestTarget fallthrough + phase35_01.py probe fix
- [x] FAIL C — Done-when grep, recorded
- [x] FAIL D — patch.js doSetStyle

## PICKS I MADE

- FAIL B: the spec (SPEC-phase3.5-F-sonnet-fix.md, via the task prompt) names the approach directly — `closestTarget`/`onFileClick` in canvas.js, `document.elementsFromPoint` fallthrough, fallthrough not in the fixture's CSS. Implemented `closestTarget` to detect when the top hit is a `[data-cc-layer]` section or an svg layer's own root (an `<svg>` whose parent is `[data-cc-layer]`) and, only then, walk `elementsFromPoint(e.clientX, e.clientY)` past host nodes and further section/svg-root hits to the next real element. SVG children (rect/path/etc.) are never sections or svg roots, so they keep resolving on the first pass, per P10.
- FAIL B, second part: after the fixture's `pointer-events:none` came off, `Docs/tests/phase35_01.py`'s own candidate picker (`PICK_SIBLINGS`, `PICK_TEXT_LEAF`) broke — it used raw `doc.elementFromPoint(x,y) === el` to find safe test targets, which no longer holds once the Art layer's section/svg legitimately sit on top at the native hit-test level. A real click still resolves correctly (canvas.js's listeners run the fallthrough above), but the picker never called that. Gave both probes the identical fallthrough logic (`elementsFromPoint`, skip host/section/svg-root) so the test finds targets the same way a real click would land. This is the "another way" the task named for making lines 3-8 pass, done in the test file the task lists as editable, not a change to what's being tested.

## CONTRACT FIELDS ADDED

- none

## READ LEDGER

| file | lines | note |
|---|---|---|
| Docs/Specs/.../SPEC-phase3.5-F-sonnet-fix.md | 1-36 | whole, under 400 |
| Docs/Reports/RECEIPT-phase3.5-R1.md | 30-213 | FAIL sections and context |
| Docs/Scope/.../SCOPE-phase3.5-adobe.md | 40-67, 75-121 | sed -n, P8-P10 and contract 3.1 |
| static/js/widgets/codecanvas/shared/canvas-core.js | 1-45, 86-145 | header/comment context, guides sheet, baseDocument |
| static/js/widgets/codecanvas/canvas/canvas.js | 180-210, 640-680, 774-810, 1030-1054 | closestTarget + three call sites + listener binding; 1531 lines, never opened whole |
| static/js/widgets/codecanvas/shared/patch.js | 31-46, 225-264, 279-318, 560-575 | HOST_NODE_SELECTOR/KINDS, setInlineStyles, doSetStyle/doSetText, doRemoveCssRule; 691 lines, never opened whole |
| Docs/scratchpad/phase35-magazine.html | 78-92 | pointer-events line and surrounding markup |
| Docs/tests/phase35_01.py | 150-243, 298-330, 380-410 | PICK_SIBLINGS/PICK_TEXT_LEAF, main() args, stage 3 test; 630 lines, never opened whole |
| Docs/tests/phase35_patch.html | grep only (line 56) | set-style round trip line, roundTrip() helper at 38-45 |
| server.py | 1282-1296, 1442-1470 | api_sessions_open, api_session_open — to find a valid session id for the rerun |
| ade/tracks.py | 40-55, 1979-2010 | session_dir, reload_session — same reason |
| static/ (whole tree) | grep only | FAIL C's tighter grep |

## FAIL C — Done-when grep, tighter pattern

`grep -rn "canvasKit\|canvasRender\|canvasResolve\|\bcanvasState\b" static/`

Result: no output (0 hits). The removed globals (canvasKit, canvasRender, canvasResolve, bare canvasState) are gone. The kept field is `frame._canvasState` — a word-boundary match on `canvasState` alone doesn't catch it because the underscore before it isn't a word-boundary break for `\b` the way a substring search was; confirmed by running it. No code change needed.

## TEST RESULTS

- Docs/tests/phase35_01.py, rerun against session `0d78d246515f`: 12/12 PASS.
- Docs/tests/phase35_patch.html, headless via Playwright against the running local server (`/raw/<path>`, port 5000): 22/22 PASS (`RESULT total=22 fail=0`).
