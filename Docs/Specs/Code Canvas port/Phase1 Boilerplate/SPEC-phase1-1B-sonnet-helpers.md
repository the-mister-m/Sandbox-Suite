# SPEC — Phase 1 — 1B — Sonnet — target option, mirror helper, module loader

Written 2026-09-12. Browser side only. Runs parallel with 1A. Cap
150K.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4. Read those first. Do not read the rest of it.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 150K used, if parts 1 to 4 are not done, stop. Write
  Docs/Handoffs/HANDOFF-phase1-1B.md: done, in progress with file and
  line, next. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase1-1B.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- static/js/matrix/widget-frame.js — whole, 196 lines.
- static/js/matrix/bus.js — whole, 56 lines.
- static/js/matrix/grid.js:34-67 and :146-158 — grid fields, init,
  markDirty.
- static/js/widgets/shared/monaco-readonly.js:35-55 and :70 — the
  memoized ready pattern.
- static/js/widgets/usertools/viewer/viewer.js:374-420 — a module's
  shape.
- static/matrix.html:26-65 — the script list.

## Part 1. widget-frame.js, select controls

In toggleOptions (:151-177), before the boolean check:

- `const controls = (this._mod && this._mod.optionControls) || {};`
- If `controls[key]` exists and its `kind === "select"`: build a
  `select` element. Resolve `controls[key].values()` (may be a
  promise) and fill one `option` per string, plus the current value
  if it is not in the list. Selected is the current value. On change,
  `this.setOption(key, select.value)`.
- If `controls[key].onNew` exists, add a `button.mx-btn` labelled
  "New" after the select. Click calls `onNew(this)`. After it
  resolves, refill the select from `values()` again.
- Everything else unchanged.

## Part 2. static/js/widgets/shared/target-option.js

- `MX.targetsFor(sid)` → fetches `/api/targets/<sid>`, returns the
  list of `value` strings. Empty list on error.
- `MX.targetControl(listFn, onNew)` → `{kind: "select", values:
  listFn, onNew}`. A convenience so widgets write one line.
- `MX.graphTargets()` → fetches `/api/library/graphs`, returns names.
  Merges with `MX.targetsFor(MX.grid.sid)` so a target held by a
  widget but missing from the shelf still shows. Empty list on error.
- `MX.graphTargetNew(frame)` → opens `MX.openRootBrowser({ext:
  ".json"})` (root-browser.js:69) to pick a file, POSTs its path to
  `/api/library/graphs/import`, then `frame.setOption("target",
  name)` from the response. On refusal, sets nothing and writes the
  error to `console.warn`.
- Routes come from 1A. If 1A's receipt is not in yet, write against
  section 2.5 and say so in your receipt.

## Part 3. static/js/widgets/shared/mirror.js

- `MX.mirror(frame, channel, apply)` → `{emit(fields), off()}`.
- emit: `MX.bus.emit(channel, Object.assign({target:
  frame.options.target || "", inst: frame.id}, fields), {remote:
  true})`.
- Listener registered with `MX.bus.on(channel, fn)`. fn drops when
  `payload.inst === frame.id`, drops when `payload.target !==
  (frame.options.target || "")`, else `apply(payload)`. Errors in
  apply are caught and logged with `console.warn`.
- off() calls the function bus.on returned.
- No other behavior. No queueing, no dedupe.

## Part 4. static/js/widgets/shared/module-ready.js

- `MX.moduleReady(key, loader)` → returns the memoized promise for
  key, creating it with `loader()` on first call. A rejected promise
  is dropped from the memo so the next call retries.
- Nothing else.

## Part 5. Script tags

matrix.html: add three script tags after :45 (derived.js), in this
order: module-ready.js, target-option.js, mirror.js.

## SETTLED IN CHAT

Select controls come from a module's `optionControls`. Settled in
chat so `target` and `guesses` draw as dropdowns without widget-frame
knowing either name. The other option is widget-frame hardcoding
`target`; one branch at :151, and every later select would need
another. Not a widget option. Receipt: the line where the select
branch sits and which widgets declare controls.

## Done when

- A widget module with `optionControls: {target: MX.targetControl(
  MX.graphTargets, MX.graphTargetNew)}` shows a select and a New
  button in its options panel. Test by temporarily adding that line
  to viewer.js, opening its options, then removing the line.
- `MX.moduleReady("x", () => Promise.resolve(1))` called twice returns
  the same promise object.
- In the console, with two viewer instances on one surface: `const m1
  = MX.mirror(f1, "test.m", console.log)` and the same for f2, then
  `m1.emit({a: 1})` prints once, from f2's apply, with target, inst,
  and a. Setting f1.options.target to "z" and emitting again prints
  nothing. Document the console lines in the receipt.
- node --check clean on the four files.
