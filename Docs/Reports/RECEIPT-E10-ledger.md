RECEIPT — E10 ledger widget — Sandbox Suite — Sun Sep 6 18:28:21 EDT 2026 to Sun Sep 6 18:34:26 EDT 2026

EDITS
- [static/js/widgets/ledger/ledger.js](../../static/js/widgets/ledger/ledger.js) — new ledger widget, ported from ade/ledgerview.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — appended ledger row
- [static/matrix.html](../../static/matrix.html) — added ledger.js script tag before main.js

STRAY FILES
- none

GOALS DONE
- Folder static/js/widgets/ledger/ledger.js, type ledger, label Ledger, same markup/columns/sort
- Subscribes to track_list, feed, transcript; sends feed and transcript with inst
- Turn blocks rendered straight from turns.js builders into the row, no chat pane
- Listens on document for mx:open-ledger, applies focus/open/flash the same way the old URL filter did
- Styles for led/rchip/at-/chip/cols-panel/table.led/srow rules copied into the widget's own style block
- Columns, rollup math, and totals unchanged; no window opens anywhere

GOALS NOT DONE
- none

DECISIONS MADE
- track name/gone lookup: old ledgerview.js took nameOf/isGone/getTracks from an external ctx never shown to this wave. Built trackName/goneCls locally off track_list rows, assuming rows carry {id, name}, falling back to the raw id and tracking "ever seen" ids for the gone state. Options seen: (a) guess the row shape as above, (b) block on it. Picked (a) since it is self-contained to this widget and does not touch a file another wave owns. Undo: change trackName/goneCls in ledger.js only.
- mx:open-ledger detail shape confirmed by grep against timeline.js's dispatch (detail: {track, turn}) rather than guessed — no decision needed there, just noting the read-beyond-list reason below.
- Per-instance dragSrcKey/colWidths/sort/hiddenCols/cols order moved off ledgerview.js's module-level singletons into a state object on frame._ledger so multiple ledger widgets don't collide. Options seen: (a) per-instance state object (chosen), (b) module-level singleton same as old code (breaks with two ledger widgets open). Undo: none needed, this is required correctness for the widget contract, not a stylistic choice.
- Kept the same known leak as the old code: every renderBar() call adds a fresh document click listener to close the columns panel. Left it in place per "do not improve, refactor, or tidy beyond it." Undo: dedupe the listener in ledger.js only, if asked.
- Renamed the flash keyframe to mxLedFlash (was "flash" in ade.css) since the widget's style block is injected globally by id-guard, to avoid colliding with any other widget's "flash" keyframe on the matrix page. Undo: rename back, no callers reference the keyframe name.

READS BEYOND THE LIST
- static/js/matrix/session-panel.js (allowed, rule 5) — looking for the track_list row shape (id/name) before writing trackName/goneCls; it didn't show the shape, so I made the trackName/goneCls decision above instead.
- static/js/suite/suite.js (allowed, rule 5) — same search, also didn't show the track_list row shape.

BLOCKERS FOR LATER WAVES
- static/js/widgets/changes/changes.js line 275 dispatches mx:open-ledger on window, not document. My widget (and timeline.js) listen on document, so changes.js's dispatch will not reach the ledger widget. Not fixed — changes.js belongs to job E11. Spec named "the timeline" as the source, which does dispatch on document correctly, so E10 acceptance is unaffected.

PHASE 3 SURFACED
- track_list row shape (does it carry a "name" field, or something else) is assumed, not confirmed — worth a real answer before another widget makes the same guess differently.
- CSS custom properties used by the copied rules (--well, --gate-blue, --surface-1/2/3, --border, --border-2, --text-1..4, --mono, --gridline) were not verified present in whatever skin matrix.html loads (og.css) — copied verbatim from ade.css on the assumption the matrix skin defines the same variable names.

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm track_list row shape against server.py/ade/tracks.py and correct trackName/goneCls in ledger.js if wrong — closer or next wave
- Confirm the matrix skin defines the CSS vars the copied ledger styles use — closer
- Decide whether changes.js's window-dispatch of mx:open-ledger is a bug to fix in E11 — closer
