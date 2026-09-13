RECEIPT — phase2-2A-fix — 2026-09-12

Contract 2.6 (SPEC-session-agent-phases1-3.md, lines 176-185) says graph.filters
payload is `{target, inst, filters}`, filters = options object minus target.
2A's receipt (RECEIPT-phase2-2A.md, PICKS I MADE, bullet 1) chose the narrower
reading — filters = only the Filters-class fields (FILTER_FIELDS) — and
flagged it for a one-line widen in each file if wrong. Widened.

EDITS
- static/js/widgets/graph/shared/graph-core.js:98-100 — MX.graphFilters loop
  widened from `for (const key of FILTER_FIELDS)` to
  `for (const key of Object.keys(opts))`, skipping "target".
- static/js/widgets/graph/cards/cards.js:302-307 (filtersPayload, emit side)
  — widened from FILTER_FIELDS loop to every key of frame.options except
  "target".
- static/js/widgets/graph/cards/cards.js:338-344 (applyFilters, apply side)
  — widened from FILTER_FIELDS loop to every key of payload.filters except
  "target", applied into frame.options and st.filters.

UNCHANGED (in scope, left alone)
- FILTER_FIELDS constant itself, in both files — still used to gate which
  option changes trigger a filters.emit (onOption, cards.js:459) and the
  widget's own getOptions serialization (cards.js:499). Contract only
  covers wire-payload shape, not these.

VERIFY
- node --check on both files: OK, OK.
- Not run live — no server start per instructions.

UNDO
- git diff static/js/widgets/graph/shared/graph-core.js static/js/widgets/graph/cards/cards.js
- git checkout -- static/js/widgets/graph/shared/graph-core.js static/js/widgets/graph/cards/cards.js
