SESSION REVIEW — Sandbox Suite, Code Canvas port phase 0 — 2026-09-12, about 09:45 to 15:10 (timestamps: ask Brandon)

Session agent. Phase 0 ran as five Sonnets and five Opus redpens, serial, one brief each. Every headed line closed. E and G on hold by Brandon.

EDITS, by the session agent
- [server.py](../../server.py) — websocket handler: close reply waited on, socket shut before werkzeug's HTTP tail, opening burst moved inside the try; socket imported
- [static/js/widgets/usertools/terminal/terminal.js](../../static/js/widgets/usertools/terminal/terminal.js) — AMD define hidden while the two xterm bundles load
- [Docs/Specs/Code Canvas port/](../Specs/Code%20Canvas%20port/) — nine briefs: sonnet1-surfaces, sonnet2-bus-mirror, opus-redpen, sonnet3-fixes, opus2-rerun, sonnet4-widget-mirror, opus3-rerun, sonnet5-ordering, opus4-onceover, opus5-fix-and-test
- [Docs/Scope/Code Canvas port/SEAM-phase0-phase1-targets.md](../Scope/Code%20Canvas%20port/SEAM-phase0-phase1-targets.md) — written unasked after a misread gate; Brandon has not ruled on it

EDITS, by agents, each with its own receipt
- [RECEIPT-phase0-sonnet1.md](RECEIPT-phase0-sonnet1.md) — grid close, surfaces, beacon save, suite page columns, last field
- [RECEIPT-phase0-sonnet2.md](RECEIPT-phase0-sonnet2.md) — bus, layout mirror
- [RECEIPT-phase0-opus-redpen.md](RECEIPT-phase0-opus-redpen.md) — first headed run
- [RECEIPT-phase0-sonnet3.md](RECEIPT-phase0-sonnet3.md) — tab id split, Empty surface row, naming, switch, favicon, sweep
- [RECEIPT-phase0-opus2-rerun.md](RECEIPT-phase0-opus2-rerun.md) — second headed run
- [RECEIPT-phase0-sonnet4.md](RECEIPT-phase0-sonnet4.md) — seven widgets round-trip options, save retry, corner line, socket handlers
- [RECEIPT-phase0-opus3-rerun.md](RECEIPT-phase0-opus3-rerun.md) — third headed run
- [RECEIPT-phase0-sonnet5.md](RECEIPT-phase0-sonnet5.md) — editor announce and restore, browser listener, rename frame, per-frame timers
- [RECEIPT-phase0-opus4-onceover.md](RECEIPT-phase0-opus4-onceover.md) — fourth headed run
- [RECEIPT-phase0-opus5-final.md](RECEIPT-phase0-opus5-final.md) — socket queue, editor echo, no retry on unload, final headed run

STRAY FILES
- scratchpad socket_goodbye.py and raw_close.py — headed switch check and raw close-frame capture; closer moves both to Docs/tests
- scratchpad final-recheck/ — rerun of phase0_final.py after the terminal fix, step 6 PASS, zero pageerrors; closer moves results-final.txt and console-final.txt to Docs/Reports/phase0-final/ as recheck
- [Docs/Reports/server-restart.log](server-restart.log) — stdout of the last server restart
- [Docs/Reports/phase0-redpen/](phase0-redpen/), [phase0-rerun/](phase0-rerun/), [phase0-rerun2/](phase0-rerun2/), [phase0-onceover/](phase0-onceover/), [phase0-final/](phase0-final/) — screenshots and console dumps, one folder per redpen
- library/grids/85b19c53d41a/w-5miaoy6v.json — deleted by the first redpen before its fence; recoverable at git b5fe4d9; Brandon said leave it

GOALS DONE
- A. Closing a widget no longer rebuilds the others
- B. Surfaces: named, in the URL, listed and renamed and closed from the session window, Empty surface fixed template row, suite page trimmed to Select Save End with a last column
- C. Beacon save on tab close; failed save retries once then shows unsaved
- D. Bus with tab id separate from surface id; two tabs on one surface mirror layout and widget insides; untitled editor buffers travel
- Socket goodbye clean; terminal and editor share a surface
- Ten agents, 1.36M agent tokens, every headed line PASS at close

BRANDON'S TODOS
- E and G, on hold: graphs folder, list route, scan route, first graph file
- Config home for the analyzer path: own file, env var, or global.json with a settings line
- Current targets: this surface only, or every surface of the session
- Wayfinder widget group: four with a view toggle, or five; code data in or map in
- SEAM doc: keep or drop

CLOSER REVIEW
- Gets copy of review, not a contract.
- Move the two scratch scripts and the recheck results into the project as named above — closer
- MEMORY.md warm start for phase 1 from this review and the receipts — closer
- CLAUDE.md map: add Docs/Specs/Code Canvas port/, Docs/tests phase0 harnesses, static/js/matrix/bus.js — closer
- Worklog entry — closer, assigned by Brandon
