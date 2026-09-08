SESSION REVIEW — Sandbox Suite — S3 — 2026-09-07 EDT

EDITS
- static/js/widgets/{chat,anchor-chat}/ -> static/js/widgets/chat/{chat,anchor-chat}/ (git mv)
- static/js/widgets/{queue,mini-queue,queue-log,gate-list}/ -> static/js/widgets/queue/{queue,mini-queue,queue-log,gate-list}/ (git mv)
- static/js/widgets/{editor,terminal,browser,viewer}/ -> static/js/widgets/usertools/{editor,terminal,browser,viewer}/ (git mv)
- static/js/widgets/{strip,devagent,messenger,mount}/ -> static/js/widgets/agent/{strip,devagent,messenger,mount}/ (git mv)
- static/js/widgets/{ledger,changes,transcript,timeline,arrange}/ -> static/js/widgets/adetools/{ledger,changes,transcript,timeline,arrange}/ (git mv)
- library/registry/widgets.json — all 19 paths rewritten to new group folders, "group" field added to every row
- static/matrix.html:42-60 — all 19 script src paths rewritten to match
- static/js/matrix/widget-picker.js — full rewrite: dropdown anchored under #mxNewWidget, left column = groups (chat, queue, usertools, agent, adetools order), right column = that group's widgets, click mounts via MX.grid.addWidget and leaves dropdown open, closes on outside click / Escape, no MX.ui.overlay
- static/css/matrix.css — added .mx-picker block (groups, widgets, active/disabled/hover states) using existing --surface-1/2/3, --border, --border-2, --gridline, --text-1 vars, no new colors

HARNESS
- 19/19 widget types loaded clean via matrix_harness.py (chat, mini_queue, queue, editor, terminal, browser, viewer, mount, strip, anchor_chat, gate_list, devagent, changes, messenger, timeline, ledger, queue_log, transcript, arrange). No 404s, no "no widget module for" in any console.txt or run output. 57 files written to Docs/Reports/phase3-test/s3/.
- Picker probe (own script, same Playwright pattern as matrix_harness.py): opened #mxNewWidget, clicked queue group (screenshot picker-queue-group.png shows chat/queue/usertools/agent/adetools left column, queue highlighted, right column = Mini Queue/Queue/Gate List/Queue Log), clicked Mini Queue, screenshot picker-widget-mounted.png shows it mounted top-left, dropdown stayed open. One console line: the known favicon 404.

STRAY FILES
- Docs/Reports/phase3-test/s3/*.png, *-console.txt — harness + probe output, expected per spec.

GOALS DONE
- F4: five group folders under static/js/widgets/, shared/ untouched, widgets.json paths+group updated, matrix.html script tags updated. No restart needed (widgets.json read per-request via engine_settings._load_registry, not cached).
- F5: widget-picker.js rewritten to two-column dropdown, styled under .mx-picker, dropdown mounts widgets and stays open.

BLOCKERS
- None found in static/js/matrix/*.js, server.py, or Docs/tests/matrix_harness.py — grepped all three for "js/widgets/" before editing, zero hits outside matrix.html and widgets.json.
- Visual gap, not a functional block: the picker dropdown is anchored under #mxNewWidget, which sits near the top-right corner of the toolbar, so the right column clips off-screen at that position (picker-queue-group.png shows it) — matches the spec's own flagged risk ("gap picker pixels"). Clicks still land correctly on the clipped items.
- Pre-existing, not caused by this box: static/js/widgets/shared/model-picker.js shows as modified in git status; shared/ was never touched here.

READS
- Docs/Specs/SPEC-phase4-fixes-sonnet.md:7-21 (Shared setup), :134-187 (S3)
- static/js/widgets/ directory listing (19 folders + shared)
- library/registry/widgets.json (full, 19 rows)
- server.py:1364-1370 (/api/widget-registry route), engine/settings.py:519-538 (_load_registry, load_widget_registry — confirmed per-request, no cache)
- static/matrix.html:1-70 (script tags, #mxNewWidget)
- static/js/matrix/widget-picker.js (full, 43 lines, pre-rewrite)
- static/js/matrix/registry.js (full)
- static/js/matrix/ui.js:1-40 (el/button/overlay)
- static/js/matrix/main.js:50-70 (mxNewWidget click handler)
- static/css/matrix.css (grep for --mx-/surface/border vars, full var usage, end of file)
- Docs/tests/matrix_harness.py (full, basis for picker probe script)
- Docs/Reports/RECEIPT-phase4-B1.md (full — checked for probe procedure, found none there; unrelated S1-rerun follow-up content)
- Docs/Reports/RECEIPT-phase4-S1.md (full, for receipt shape)

CLOSER REVIEW
- Picker dropdown viewport clipping near #mxNewWidget's corner position — cosmetic, flagged as expected risk by the spec; Brandon's call on whether it needs viewport-clamping in a follow-up.
- shared/model-picker.js pre-existing modified state, unrelated to S3 — closer to confirm with whichever box last touched it.
