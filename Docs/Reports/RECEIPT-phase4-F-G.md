SESSION REVIEW — Sandbox Suite — F-G — 2026-09-07

EDITS
- static/js/widgets/agent/devagent/devagent.js:56-67 — text inputs and
  native selects inside `.mx-devagent` now share surface-1 background,
  border, text-1, radius:3px (item 6).
- static/js/widgets/agent/devagent/devagent.js:81-104 — tabs: inactive get
  no border, active gets surface-2 fill + accent bottom border (item 4).
  Tree rows: selected gets surface-2 fill + accent left bar + bold name,
  hover gets surface-2 (items 1, 7). New `.mx-dev-rung-title-active` /
  `-dim` classes (item 2 support).
- static/js/widgets/agent/devagent/devagent.js:203-221 (renderHeads) —
  TRACK line dims when a region is selected, REGION line goes bold when a
  region is selected, else TRACK is bold and REGION reads
  "no region selected" in `.mx-dim` (item 2).
- static/js/widgets/shared/add-controls.js:25-38 — caption + hairline CSS,
  shared input/select surface styling, `.mx-model-picker` flex-nowrap so
  the three model selects hold one line (items 3, 6).
- static/js/widgets/shared/add-controls.js:91,96,156 — "add track" /
  "add region" captions added ahead of each row; mount's "both" mode is
  untouched, its one button stays as is (item 3).
- static/js/widgets/shared/settings-rows.js:153-176 — row hover (surface-2),
  shared input/select surface styling, `.mx-model-picker` flex-nowrap
  (items 6, 7).
- static/js/widgets/shared/settings-rows.js:267-273, 308-318 — apply
  buttons hidden until the row's live value differs from the value the row
  was built with; click behavior unchanged (item 5).

HARNESS
- Driver: scratchpad fg_driver.py, headed Chrome, session 9883b6bec3df.
  Mounted devagent + mount via MX.grid.addWidget (no applyTemplate).
- Created track "fgtrack" and region "fgregion" through devagent's own add
  rows, selected the region, opened settings (default tab), typed into
  "seat" without clicking apply.
- fg-02-tree-selected.png — tree shows "untitled" (pre-existing, not mine)
  flat, "fgtrack"/"fgregion" selected with accent bar + bold; TRACK line
  dim, REGION line bold; settings tab underlined, others plain; add
  track/add region captions + hairline; three model selects one line.
- fg-03-dirty-apply-visible.png — seat row shows the only visible apply
  button on the pane; name/root/order/model/preset_name/reset_on_change/
  gate_wait_s/max_tools/request_timeout/allow_agent_reset all hidden.
- fg-01-mounted-layout.png, fg-04-devagent-widget.png — layout/crop extras.
- Cleanup: deleted fgregion via its own delete button, then fgtrack via a
  direct `delete_track` socket frame (devagent's UI has no track-delete
  button). Confirmed in fg-console.txt. Console/page errors: one
  pre-existing 404 only.
- Evidence: Docs/Reports/phase3-test/fg/ (4 screenshots, console, state
  json).
- Item 7 (hover) was not screenshotted — hover is a CSS-only rule, verified
  by reading the rule, not driven with a mouse-hover capture.

STRAY FILES
- Docs/Reports/phase3-test/fg/ — this box's screenshots, console, state.
- library/grids/9883b6bec3df/w-uy70bnrk.json — this box's window file (same
  footprint as prior boxes; not deleted).
- Driver script in session scratchpad, not under the project:
  scratchpad/fg_driver.py.

GOALS DONE
- All 7 style items applied across devagent.js, add-controls.js,
  settings-rows.js. mount.js needed no edit — its captions/hairline are
  correctly out of scope per the spec's own text.
- node --check clean on all three touched files.
- Harness confirms items 1, 2, 3, 4, 5, 6 live in the browser.

BLOCKERS
- None.

READS
- Docs/Reports/phase3-test/c1/c1-20-settings-tab.png, c1-15-tree-with-c1r2.png
- Docs/Reports/phase3-test/d1/mount-01-layout.png
- static/js/widgets/agent/devagent/devagent.js (full)
- static/js/widgets/shared/add-controls.js (full)
- static/js/widgets/shared/settings-rows.js (full)
- static/js/widgets/agent/mount/mount.js (full)
- static/js/widgets/shared/model-picker.js (full, not edited)
- static/css/matrix.css (grepped for surface/accent/border/text/dim vars,
  .mx-btn, .mx-panel input, select rules)
- static/css/ade.css, app.css, suite.css, matrix-chat-queue.css (grepped
  for --accent/--surface variable definitions — none define --accent*;
  matrix.css's own `var(--x, fallback)` convention was followed instead)
- Docs/tests/matrix_harness.py (full, pattern reference)
- Docs/Reports/RECEIPT-phase4-F-B.md, RECEIPT-phase4-B1.md (receipt shape,
  driver pattern reference)
- library/registry/widgets.json (grepped for devagent/mount type strings)
- ade/frames.py (grepped for kill_track/delete_track handling)
- static/js/matrix/grid.js (grepped for `frames[id]` map, used by the
  cleanup step to reach the fg track id and send delete_track directly)

CLOSER REVIEW
- --accent, --accent-dim, --accent-bdr, --accent-mid, --accent-dark,
  --accent-fg are used throughout ade.css/app.css/suite.css but never
  defined anywhere in the repo — a pre-existing gap, not touched here.
  matrix.css's own rules all carry a literal fallback (e.g.
  `var(--accent, #2a6)`), which is what this box's new CSS also does.
  Worth a follow-up if Brandon wants --accent actually defined.
- "surface" was read as --surface-1 (recessed/base) and "surface-raised"
  as --surface-2, matching matrix.css's own existing use of --surface-2 for
  buttons/hover states one step up from the --surface-1 widget plane.
