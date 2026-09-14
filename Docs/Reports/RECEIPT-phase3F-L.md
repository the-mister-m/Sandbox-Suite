SESSION REVIEW — Phase 3F job L — 2026-09-13

STAGES
- [x] Stage 1 — read and trace
- [x] Stage 2 — fix
- [x] Stage 3 — run and prove
- [x] Stage 4 — node --check and receipt

CAUSE
resetModels() disposed all Monaco models while the editor still held one live, on every canvas.doc mirror event and every target/canvas option change.
Monaco's pending per-model background work rejects with "Canceled" once its model is torn out from under the live editor.

CHANGE — static/js/widgets/codecanvas/code/code.js
- mirrors.doc handler (was line 487): dropped the resetModels(cs) call, renderCurrent(cs) already refreshes via setValue.
- onOption "target" (was line 517) and "canvas" (was line 518): dropped resetModels(cs) calls, same reason.
- unmount (was lines 507-509): replaced the manual per-model dispose loop with resetModels(cs), called after cs.editor.dispose() — resetModels now runs only here.

Canceled count: before 32 (per K2), after 0 (Docs/Reports/phase3F-headed-code/L/console.txt).
Lines 1-10: all PASS (Docs/Reports/phase3F-headed-code/L.log).
node --check: OK.

EDITS
- static/js/widgets/codecanvas/code/code.js — removed mid-session model disposal, moved dispose to unmount-only

STRAY FILES
- Docs/Reports/phase3F-headed-code/L/ — harness run output for this job
- Docs/Reports/phase3F-headed-code/L.log — harness stdout/stderr

GOALS DONE
- Canceled pageerror from Code widget stopped, harness lines 1-10 still pass

BRANDON'S TODOS
- none

CLOSER REVIEW
- Fold into MEMORY.md warm start for Phase 3F — Closer
