SESSION REVIEW — Sandbox Suite — 2026-09-13T18:05Z to 19:02Z (UTC, from the transcript)

EDITS
- [server.py:1996](../../server.py#L1996) — /api/targets rows carry `types`, the widget types holding each target
- [server.py:1779](../../server.py#L1779) — /api/fs/pick takes `ext` as a comma list or `*`, and `start` as Finder's default location
- [engine/settings.py:167](../../engine/settings.py#L167) — `PICKERS`, `picker` default `native` in GLOBAL_DEFAULTS, load merge :230, validation :271
- [static/js/widgets/shared/target-option.js:20](../../static/js/widgets/shared/target-option.js#L20) — `MX.targetsFor(sid, types)`; Wayfinder list filtered to the four graph types; graphTargetNew goes through the shared picker :51
- [static/js/widgets/codecanvas/shared/canvas-core.js:292](../../static/js/widgets/codecanvas/shared/canvas-core.js#L292) — `MX.canvasTargetControl(withNew)`, sync, canvas family types only, New through the shared picker
- [static/js/widgets/codecanvas/canvas/canvas.js:1437](../../static/js/widgets/codecanvas/canvas/canvas.js#L1437) — optionControls on the module at registration, target with New
- [static/js/widgets/codecanvas/code/code.js:396](../../static/js/widgets/codecanvas/code/code.js#L396) — optionControls at registration, target lists Canvas targets, no New
- [static/js/widgets/codecanvas/tools/tools.js:845](../../static/js/widgets/codecanvas/tools/tools.js#L845) — same as Code
- [static/js/widgets/shared/root-browser.js:92](../../static/js/widgets/shared/root-browser.js#L92) — `MX.openRootBrowser` routes on global.json `picker` per click: native dialog :77 or suite modal; `ext: "*"` lists every file
- [static/js/suite/suite.js:325](../../static/js/suite/suite.js#L325) — workspace root browse follows `picker`; `picker` dropdown :580
- [static/js/matrix/session-panel.js:334](../../static/js/matrix/session-panel.js#L334) — own modal copy removed, calls the shared picker
- [static/js/widgets/usertools/viewer/viewer.js:178](../../static/js/widgets/usertools/viewer/viewer.js#L178) — Open takes any file through the shared picker
- [static/js/widgets/usertools/browser/browser.js:300](../../static/js/widgets/usertools/browser/browser.js#L300) — choose root through the shared picker
- [SESSIONLOG.md:444](../../SESSIONLOG.md#L444) — session entry
- [INDEX.md:212](../../INDEX.md#L212) — picker and target entry
- [Docs/Reports/SESSION-REVIEW-2026-09-13-target-picker.md](SESSION-REVIEW-2026-09-13-target-picker.md) — this review

STRAY FILES
- none

GOALS DONE
- Canvas target pickable: target select and New show in the gear panel from page load
- Canvas and Wayfinder target lists separated by widget type
- Code and Tools target lists only what a Canvas holds
- `picker` setting in Suite settings, native or suite, default native; every path picker follows it except Canvas media Upload
- node --check and py_compile clean on every edited file; settings validation run by hand (default native, suite accepted, bogus refused)

BRANDON'S TODOS
- Restart server.py, hard reload suite and matrix, try New on a Canvas, a Timeline lane root, and `picker` set to suite
- Rule on Canvas media Upload ([kit.js:278](../../static/js/widgets/codecanvas/shared/kit.js#L278)) — left on the browser file input
- Rule on the orphan attach input ([index.html:317](../../static/index.html#L317)), nothing references it
- Rule on the dead `.sp-rootmodal` CSS left in session-panel.js
- 3A and 3B specs still name `widgets/canvas/` and `widgets/graph/` paths

CLOSER REVIEW
- Gets copy of review, not a contract.
- Nothing tested in a browser; the Finder `default location` path is untested live — Brandon
- 3B receipt pick "optionControls attached after the core resolves" is superseded — closer
- `picker` in global.json and type-filtered /api/targets are durable facts for MEMORY.md — closer
- Worklog skipped this session on Brandon's word — closer
