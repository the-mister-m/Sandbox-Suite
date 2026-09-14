SESSION REVIEW — Sandbox Suite / Phase 3F job R-C — redpen on job C (patch kinds) — 2026-09-13

CHECKS
1. Comments label/function/state only — PASS, whole file
2. No module-level mutable state — PASS (KINDS/ALIAS/HOST_NODE_SELECTOR are constants; history() state is per-call, not module-level)
3. Contract names match scope 3.3 spelling — PASS
4. Every added field named under CONTRACT FIELDS ADDED — PASS
5. Job edited only patch.js (per scope 4); phase3F_patch.html is job C's own spec-named stage 5 output, self-flagged as STRAY — PASS
6. Every stage checked (no handoff needed) — PASS, receipt lines 25-30
7. No widget/kit/doc-mode references added — PASS (grep clean)
8. apply()'s re-signature named as a contract edit, canvas.js:1032 flagged for job D — PASS
9. `node --check` in receipt, re-run clean — PASS
10. PICKS I MADE are implementation picks, none a ruling on Brandon's behalf — PASS
11. Done-when list vs code — FAIL, see below

FAILS
- patch.js:347-374 doWrap + patch.js:378-398 doUnwrap — wrap then unwrap is not identity when the wrapped ids are non-contiguous siblings (interleaved untouched siblings end up reordered relative to the wrapped block). Fix: doWrap refuses ids that are not contiguous among the parent's children, or doUnwrap must restore each freed child to its own recorded original index instead of reinserting the whole block at the wrapper's slot.

VERDICT: FIX, 1
