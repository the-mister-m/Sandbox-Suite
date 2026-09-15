# RECEIPT — Phase 3.5-Adobe — F-patch, Sonnet subagent

## STAGES

- [x] Stage 1 — page-token reload FAIL (job 2's line 4)
- [x] Stage 2 — wrap.tag addition (session-agent follow-up item)

## PICKS I MADE

- Diagnosis, not a patch.js bug: isolated `MX.canvasPatch().apply()` against
  the real magazine fixture in a headless page (no canvas.js involved) —
  set-css-token and set-css-rule round-trip the text correctly, head
  included, values exact. patch.js was not the fault.
- Traced canvas.js (read only, not edited): `doSave` — the only function
  that writes `cv.source` to disk — fires solely on an explicit
  Meta/Ctrl+S keydown (canvas.js:1989), gated by `fileEditable(cv)`, which
  requires `cv.mode === "canvas"` (canvas.js:1963-1965; default mount mode
  is "preview", canvas.js:2329). `markDirty`/`afterChange` never autosave.
  Job 3's set-attr proof relied on the same explicit Meta+s after setting
  mode to "canvas" (phase35_03.py) — job 2's test never did either, so it
  never reached disk regardless of patch kind.
- Fix landed in Docs/tests/phase35_02.py, not patch.js: set `cv.mode =
  "canvas"` after file-ready, then focus the iframe, press Meta+s, and
  wait for the "saved" status before the reload in check 4 — mirrors
  job 3's working pattern exactly. This is a test bug per the loop-guard
  rule ("do not edit tests unless a test bug is the cause, and say so if
  you do") — said so here.
- wrap.tag (session-agent follow-up, not the original FAIL): `doWrap`
  takes `patch.tag`, defaults to "div" when absent, and skips the
  `data-od-group="1"` stamp only when a tag is given — existing
  no-tag callers are byte-identical.
- `doUnwrap`'s `data-od-group` refusal check is dropped. It existed only
  to guard against unwrapping a non-wrapper element; no test exercised
  it, and it made a tag-based wrap permanently un-undoable (the exact
  problem job 4 raised: no way off the div/group stamp). unwrap's inverse
  shape (`{kind:"wrap", ids, id}`) is unchanged — my pick, flagging it
  since it wasn't explicitly asked. Trade-off: an unwrap patch aimed at a
  non-wrapper element with children now succeeds instead of refusing;
  nothing in the codebase currently does that.
- Inverse of a tagged wrap is still `{kind:"wrap", ids, id}` — no `tag`
  field. Unwrapping a tag wrapper and re-wrapping via the inverse gets a
  plain div back, not the original tag. Contract says "inverse
  unchanged," so this is as specified, not a bug.
- Added one phase35_patch.html line: "wrap with tag round trip, no group
  stamp" (`tag: "section"`). 23/23, 0 fail.

## READ LEDGER

- SPEC-phase3.5-F-sonnet-fix.md — whole
- SCOPE-phase3.5-adobe.md lines 123-138 (contract 3.2)
- RECEIPT-phase3.5-02.md — STUCK section, test line 4
- RECEIPT-phase3.5-01b.md — READ LEDGER, PICKS
- RECEIPT-phase3.5-03.md — set-attr/reload proof, lines ~125-150
- static/js/widgets/codecanvas/shared/patch.js — whole file read across
  several passes (691 lines; over the 400-line whole-file rule, so read
  in ranges: 1-330, 330-610, 605-691)
- static/js/widgets/codecanvas/tools/tools.js — lines 400-500 (page read/
  write, PAGE_TOKEN wiring), 52-67 (PAGE_TOKEN/DEFAULTS/SIZES) — read
  only, not touched
- static/js/widgets/codecanvas/canvas/canvas.js — lines 80-115, 1000-1140
  (markDirty, runPatches, applyPatches, afterChange), 1963-1995
  (fileEditable, onFileKeyDown), 2075-2095 (bindFileListeners),
  2197-2222 (doSave/saveRecord/doSaveAll) — read only, not touched
- Docs/tests/phase35_02.py — whole (227 lines, under 400)
- Docs/tests/phase35_03.py — lines 255-280, 445-485 (FOCUS_IFRAME,
  STATUS_SAVED, the Meta+s save-then-reload pattern) — read only
- Docs/tests/phase35_patch.html — whole (test harness, short)
- Docs/scratchpad/phase35-magazine.html — head block only (fixture)

## STUCK

None. Both items resolved.

## node --check

`node --check patch.js` clean after both edits (wrap.tag, and the
unrelated unedited-for-persistence state before it).

## TEST RESULTS

- Docs/tests/phase35_patch.html — headless, 23/23 (22 original + 1 new
  wrap.tag line), 0 fail.
- Docs/tests/phase35_02.py --session 0d78d246515f --out Docs/Reports/ —
  5/5, including line 4 (was FAIL, now PASS: width=794px columns=2).

Tool calls used: 40 (cap).

---

SESSION REVIEW — Sandbox Suite — Phase 3.5-Adobe F-patch — 2026-09-14

EDITS

- [static/js/widgets/codecanvas/shared/patch.js](../../static/js/widgets/codecanvas/shared/patch.js) — wrap.tag: optional tag name, skips data-od-group when given; doUnwrap's group-only refusal dropped
- [Docs/tests/phase35_02.py](../tests/phase35_02.py) — test bug fix: set canvas mode, press Meta+s, wait for saved status before the reload check
- [Docs/tests/phase35_patch.html](../tests/phase35_patch.html) — added "wrap with tag round trip, no group stamp" line

STRAY FILES

- none (probe scripts lived in the session scratchpad, not the repo)

GOALS DONE

- Job 2's line-4 FAIL: root-caused as a test bug (missing mode switch + missing explicit save), not a patch.js defect. patch.js's set-css-rule/set-css-token were proven correct in isolation before any test change.
- wrap.tag added per the session agent's follow-up.

BRANDON'S TODOS

- none opened by this job

CLOSER REVIEW

- Gets copy of review, not a contract.
- Confirm the doUnwrap group-check removal is acceptable — Brandon
- job 2's original receipt (RECEIPT-phase3.5-02.md) still shows a FAIL for line 4; its STUCK note pointed at canvas.js dirty/save wiring. This receipt supersedes that call: the actual gap was test methodology, not canvas.js internals. Worth a line back into job 2's receipt or SESSIONLOG so the STUCK doesn't read as still-open — closer
