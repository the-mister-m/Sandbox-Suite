# RECEIPT — Phase 3 — 3R — Sonnet — redpen after 3D, Code widget

Read: SPEC-session-agent-phases1-3.md section 2, RECEIPT-phase3-3D.md
whole, SPEC-phase3-3D-sonnet-code-widget.md whole, code.js whole,
state.js's `load`/`replace`/`commit`, canvas.js's freeze mirror,
tools.js's mount/onOption/optionControls, drawer.js (source, whole
relevant sections).

## Checks, every run

- Every default in getOptions and handled in onOption — PASS.
  `locked` is in getOptions (code.js:483) but has no onOption branch;
  this matches the job spec's own Lifecycle line ("onOption for view,
  codeMode, docEditable, canvas") and the ruled ask that `locked` is
  never persisted. Not a gap.
- Every mirror emit through MX.mirror; no raw family-channel
  MX.bus.emit — PASS. code.js:321,328 both go through
  `cs.mirrors.freeze.emit`.
- Mirror receipts never re-emit — PASS. select/change/doc/focus
  handlers (code.js:430-438) only read and render.
- Subscribe before first send; off/dispose in unmount — PASS.
  Mirrors built in the `canvasCore()` callback before any emit is
  possible; unmount (code.js:443-454) calls `cs.mirrors.off()`,
  disposes the editor and every model.
- No module-level mutable state two instances would share — PASS.
  All state on `frame._codeState`; `MOD.optionControls` is
  reassigned per mount with closures over the passed frame only, same
  pattern 3B/3C already passed.
- Registry row matches registerWidget; script tag after core tags —
  PASS. widgets.json:28 `canvas_code`/`Code`/`canvas` matches
  code.js:488; matrix.html:57, after canvas.js and tools.js, before
  graph-core.js.
- node --check clean — PASS, code.js and state.js both clean.

## Checks, per job (3D)

- `locked` always false in getOptions — PASS, code.js:483.
- Apply on blocks calls setCode only on changed blocks — PASS,
  code.js:340-347, diffs `parsed[w.id]` against `cs.baseline[w.id]`.
- Doc Apply guarded by docEditable and a parse try — PASS,
  code.js:349-354.
- One Monaco model per view, disposed in unmount — PASS, `cs.models`
  keyed by view (code.js:223-233), disposed code.js:449-451; one
  editor total, created once (code.js:203-214, 420).

## Hardest checks named for this run

- Code calls the target canvas's own State, never a fresh one —
  PASS. `api(cs)` resolves `boundFrame(cs)._canvas` (code.js:90-93);
  every write goes through `a.state.*` or `a.patchSource`; no
  `MX.canvasState(...)` call anywhere in code.js.
- Apply diffs against the baseline, drawer.js:331-352 pattern —
  PASS, confirmed against the actual source
  (Code Canvas/app/drawer.js:331-352): same missing-header count,
  same three-field compare, same notice text.
- Unlock emits canvas.freeze on, relock emits off — PASS,
  code.js:321 `{on: true}`, code.js:328 `{on: false}`. Matches
  drawer.js:319,328 (`Canvas.freeze(true)` / `Canvas.freeze(false)`).
  Reaches every canvas on the target, not only the bound one
  (canvas.js:1476 filters by target only) — already named to Brandon
  in RECEIPT-phase3-3D.md's TODOS, not re-flagging as new.
- Contract 2.8 persisted keys round-trip — PASS. `target`, `canvas`,
  `view`, `codeMode`, `docEditable` all read on mount from
  `frame.options` and written back by `getOptions`; persistence does
  not depend on markDirty — `WidgetFrame.setOption` calls
  `MX.grid.save()` unconditionally (widget-frame.js:104) — so `view`
  and `codeMode` calling `markDirty` (code.js:463,468) and `target`/
  `canvas` not (code.js:459-460) matches the job spec's own line
  ("markDirty on view or mode change") and tools.js's identical
  pattern (tools.js:899-914), already passed in 3R-3C.

## Ruled/standing items, verified additive

- `canvas.freeze` rides the mirror, freezes every canvas on the
  target — confirmed above, matches contract 2.7's wording.
- `state.replace(json)` — confirmed state.js:582-589: same
  normalize as `load` (version default, v1 migrate, page fallback),
  commits instead of resetting history. `load` itself untouched
  (state.js:564-579). Used only by code.js so far.
- No notes port — confirmed, code.js has no notes view; job spec
  Part 2 and RECEIPT-phase3-3D.md both name 3C as already covering
  it.
- No headed proof attempted here, per the parent instruction that
  3H covers it.

## MAY FIX

None triggered — nothing missing to fix.

## QUESTIONS for the session agent

None.

## Done

Every check PASS. No FIXED, no FAIL.
