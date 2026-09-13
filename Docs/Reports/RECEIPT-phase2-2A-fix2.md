RECEIPT — phase2-2A fix pass 2 — Sonnet 5

Gate: four fixes only, two files only. graph-core.js and cards.js are
untracked (new from 2A) — no prior commit, so "undo" below means delete
the block, not `git checkout`.

FIX 1 — FILTER_FIELDS duplicated
- graph-core.js:19-27 — FILTER_FIELDS frozen (Object.freeze), exported as
  MX.graphFilterFields.
- cards.js:16-17 — local copy dropped; `const FILTER_FIELDS =
  MX.graphFilterFields;` (all downstream uses unchanged, alias only).
- Undo: delete the `Object.freeze`/`MX.graphFilterFields` line in
  graph-core.js, restore cards.js's inline array literal.

FIX 2 — FILTER_DEFAULTS drift check
- graph-core.js — added between graphFiltersDefaults() and graphFilters(),
  right after the sync hardcode (kept, per instruction). Runs once off
  MX.graphCore()'s own resolution, guarded by `_filterDefaultsDriftChecked`.
  console.warn per differing key, naming both values.
- Undo: delete that block (bounded by the `_filterDefaultsDriftChecked`
  comment above it through the `.catch(() => {})` line).

FIX 3 — six kind colors — NOT DONE, flagging
- Colors are not in either gated file. They live in
  static/js/widgets/graph/shared/mermaid-frame.js:20-25
  (--mx-kind-file/function/class/css-rule/element/asset). Gate names only
  graph-core.js and cards.js; did not touch a third file.
- Wayfinder grep result (so nobody re-asks): app/style.css DOES define
  real values — --ink-dim:#8895a8, --js:#58a6ff, --class:#3fb950,
  --css:#a371f7, --html:#f0883e, --asset:#8b949e (same in "TS port/"
  copy). Mapping to mermaid-frame.js's six: file→--ink-dim, function→--js,
  class→--class, css-rule→--css, element→--html, asset→--asset. All six
  differ from the invented hex in mermaid-frame.js right now.
- Brandon/closer: say the word and I'll take mermaid-frame.js as a fifth
  file, or hand it to whoever owns that file next.

FIX 4 — mirror apply bypassing setOption
- cards.js applySelect (was ~331-338): now two frame.setOption calls
  (selectedIds, focusedId), guarded by st.applying = true/false around
  them. Direct MX.grid.save() call removed — setOption saves
  (widget-frame.js:105, unconditional).
- cards.js applyFilters (was ~340-354): loop now calls
  frame.setOption(key, incoming[key]) per key instead of writing
  frame.options[key] directly. Same st.applying guard. Direct
  MX.grid.save() removed.
- cards.js onOption, two emit sites guarded with `&& !st.applying`:
  the FILTER_FIELDS branch's `st.mirrors.filters.emit(...)` and the
  selectedIds/focusedId branch's `st.mirrors.select.emit(...)`. This is
  the ping-pong stop: setOption always drives onOption, and onOption is
  where the mirror emits live, so the guard sits there, not on setOption.
- st.applying added to the mount-time state object (frame._cards),
  initialized false. Per-frame, not a true module global — a real module
  singleton would cross-contaminate two graph_cards instances on one
  surface; flagging this reading in case a stricter module-level flag was
  intended.
- Undo: revert applySelect/applyFilters to direct frame.options writes +
  MX.grid.save(), drop the two `!st.applying` guards, drop `applying:
  false` from the state object.

node --check: both files clean.

Not touched: static/js/widgets/graph/force/ (another agent's), any file
outside the two named.

CLOSER REVIEW
- Fix 3 open — needs a ruling: touch mermaid-frame.js or hand off.
