# RECEIPT — Phase 4 W3 — widgets — Sandbox Suite

Box W3, Sonnet, session 9883b6bec3df, 2026-09-07. Five spec items plus two
added mid-task (timeline ruler, strip chip label; strip's kill_track
version was reversed by Brandon before I touched the file).

## EDITS

[mount.js](../../static/js/widgets/agent/mount/mount.js)
- 20-33 — fetches `/api/workspace-root` and `/api/session-settings/<sid>`
  in `mount()`, calls `m.ctrl.refresh(state)` on each, the way devagent's
  render() does at devagent.js:162/165. Root field now shows the
  inherited root instead of staying blank (D1's fix item).

[settings-rows.js](../../static/js/widgets/shared/settings-rows.js)
- 224-228 `blockCollapsed` — guards `state.blocksTouched` before calling
  `.has()`. Root cause: arrange.js's own state object (arrange.js:567-580)
  never initializes `blocksTouched`, only `collapsedBlocks`, so any caller
  that reuses `MX.settingsRows` with arrange's state shape threw. D2 hit
  this piping a job with multiple regions (arrange.js:2148-2162 calls
  `a.settingsRows.renderSettings(r, box)` once per region in `n._regions`).
  Guarded per spec's file/line; did not touch arrange.js's state object.

[widget-picker.js](../../static/js/matrix/widget-picker.js)
- 60-67 — measures the dropdown's own width/height after append, flips
  left (anchors to the anchor button's right edge) when it would run past
  `window.innerWidth`, flips up the same way for height. Confirmed live:
  at a 480px viewport #mxNewWidget sits at left 311/right 402; the
  dropdown is 253px wide, so unflipped it would sit at 311-564 (84px past
  the edge) — flipped, it lands at 149-402, fully onscreen.

[matrix.css](../../static/css/matrix.css)
- 3-67 — one `:root` block, top of file, before item 4's variable was
  the fallback grep (below). Values copied from
  `static/css/skins/og.css`'s own `:root` (already loaded by
  matrix.html before matrix.css), not invented — see finding below.

[arrange.js](../../static/js/widgets/adetools/arrange/arrange.js)
- 2124-2143 — new "track" row in `renderSettingsPane`, before the disk
  path row. A `<select>` listing `a.trackRows` (roster tracks), blank
  option first, writes `n.track` on change, calls `touch(frame)`. Matches
  the preset row's pattern immediately above it.

[timeline.js](../../static/js/widgets/adetools/timeline/timeline.js)
- 28-36 — `.ruler-pad` gets `min-height` (was fixed `height:28px`) and
  `flex-wrap:wrap`; new `.tl-ruler-controls` wraps the three checkboxes +
  refresh field as one flex child.
- 1249-1260 — HTML: the three checkboxes + refresh label now sit inside
  `<div class="tl-ruler-controls">`; the zoom span is unchanged markup.
- `.tl-zoom` gets `flex-shrink:0; order:-1` — zoom is always laid out
  first (never shrinks, never wraps away); `tl-ruler-controls` is `flex:1
  1 auto` and wraps its own children onto additional lines when the
  250px `#tlHeads` column is too narrow for all of them on one line.
  Smaller-change pick: pure CSS + one wrapper div, no menu-button.

[strip.js](../../static/js/widgets/agent/strip/strip.js)
- 92 — `kill.textContent = "✕"` → `"stop"`. Brandon reversed the
  kill_track version before I edited the file, so there was nothing to
  revert; this is the only change. Still sends `{type:"stop", track:
  id}` at line 102, unchanged. What's lost: nothing new lost beyond what
  was already true — the chip's button was always a stop, not a delete;
  it just used to say "✕" instead of naming the action.

## FINDING — item 4, theme variables

Grepped every `var(--` in static/css and static/js/widgets (full list in
scratchpad, not reproduced here). F-G's read list (ade.css, app.css,
suite.css, matrix-chat-queue.css) did not include
`static/css/skins/og.css` or `skins/default.css` — og.css's own `:root`
(lines 4-131) already declares --accent (+ its five siblings),
--surface-1/2/3, --border, --border-2, --border-3, --gridline,
--text-1/2/3/4, --gate-*, --fill-*, --status-*, --mono, --sans, --deep,
--well, --plane, --splitter*, --col-*, --overlay-1/2, --shadow-1/2, and
matrix.html links og.css before matrix.css. So these were not actually
undefined on the matrix suite — F-G's finding was incomplete, not wrong
about the pattern (defensive `var(--x, fallback)` all over matrix.css and
the widgets), just wrong that nothing backs it. The new matrix.css
`:root` restates og.css's own values (confirmed identical everywhere
both exist) so the theme no longer depends on og.css being the specific
skin loaded — a harmless duplicate today, a real fix if og.css is ever
swapped out from under matrix.html. One literal mismatch found and
resolved: `var(--border, #333)` (terminal.js, viewer.js, editor.js) vs
`var(--border, #383838)` (matrix.css itself) — used og.css's #383838,
the design source, both are dead code now that --border is defined.
Widget-local layout vars (--dv-*, --ar-msg, --wt-*, --mg-rail, --mu-*,
--tl-*, etc.) were left alone — they're already defined at their own
component scope, not part of the "never defined" complaint.

## HARNESS

Copied matrix_harness.py's mount pattern into a scratchpad driver
(w3_driver.py), headed Chrome, session 9883b6bec3df, `MX.grid.addWidget`
only, never applyTemplate.

- Mounted `mount`, read its root-field input: `/Users/moth3rship/Desktop`
  — SEEN, non-blank. `w3-01-mount-root.png`.
- Created track `w3track` / region `w3region` (claude/sonnet, chosen
  over the mount default so the region stayed live) through mount's own
  form. Confirmed on the roster before proceeding.
- Mounted `devagent`, clicked the `w3region` row: accent left bar + bold
  name on the selected row, matching F-G's item 1/2 — SEEN, no
  regression. `w3-02-devagent-selected.png`.
- Mounted `strip`: chip reads "w3region.6" (server's own dedupe suffix —
  this session had prior test runs under the same base name), kill
  button reads "stop" both before and after a click; region still on the
  roster after the click (it's a stop, not a delete) — SEEN.
  `w3-03-strip-before.png`, `w3-04-strip-after.png`.
- Mounted `timeline`: `.ruler-pad` at both the widget's normal frame size
  and a 340px frame — screenshots identical. Reason, confirmed by
  reading the CSS: `#tlHeads` (and `.ruler-pad` inside it) is
  `flex-shrink:0` at a fixed `--tl-heads-w:250px`, so it never responds
  to the outer widget frame's width at all — the row's own content
  (three checkboxes + refresh field + zoom) doesn't fit 250px regardless
  of outer size, so the wrap is intrinsic, not narrow-width-triggered.
  Both screenshots show the fixed result: zoom (`− 250% +`) whole and
  unclipped on its own top line, checkboxes and the refresh field
  wrapped onto two lines under it. `w3-05-timeline-normal.png`,
  `w3-06-timeline-340.png`.
- Picker: viewport 480px, clicked `#mxNewWidget` (anchor at left
  311/right 402). Dropdown (253px wide) landed at left 149/right 402 —
  entirely onscreen; unflipped it would have sat at 311-564, 84px past
  the edge. `w3-07-picker-narrow.png`.
- Cleanup: `kill_track` on the region, `delete_track` on the track (also
  removes any region left under it). Roster after: `["untitled"]` only —
  the pre-existing track, untouched.

Arrange's new track-select (item 5) was built and syntax-checked but not
driven live — not in W3's own headed-proof list; W4's arrange pass
covers it.

## STRAY FILES

- Docs/Reports/phase3-test/w3/*.png, w3-console.txt — this box's
  evidence.
- Driver script in the session scratchpad (w3_driver.py), not under the
  project.
- No new grid window JSON files kept — mounted widgets were left on the
  grid per shared setup (not asked to remove widget frames, only the
  track/region), consistent with prior boxes' footprint.

## GOALS DONE

- All 5 spec items (mount refresh, settings-rows guard, picker flip,
  matrix.css :root, arrange node.track select) edited and
  `node --check` clean.
- Both added items (timeline ruler, strip label) edited and
  `node --check` clean.
- Headed proof: 3 of the spec's 3 named checks (mount root, picker
  clip, devagent FG styles) plus both added items, all SEEN.

## BLOCKERS

- None on the edits. The timeline "normal vs 340px" screenshot pair
  reads as identical — explained above, not a driver bug; flagged for
  the closer since it means the bug (and the fix) never depended on the
  widget's outer frame size, only on the fixed 250px heads column.

## READS

- Docs/Specs/SPEC-phase4-fixes-D.md (Shared setup, W3)
- Docs/Reports/RECEIPT-phase4-D1.md, RECEIPT-phase4-D2.md,
  RECEIPT-phase4-S3.md, RECEIPT-phase4-F-G.md, RECEIPT-phase4-F-B.md
  (full, fix-list sections per the assignment)
- static/js/widgets/agent/mount/mount.js (full)
- static/js/widgets/agent/devagent/devagent.js:130-175, 265-330, 440-480
  (refresh pattern, settings-pane region guard, root-field fetches)
- static/js/widgets/shared/add-controls.js (full — refresh/state contract)
- static/js/widgets/shared/settings-rows.js:190-240, 340-383 (blockCollapsed,
  toggleBlock, renderSettingsTab)
- static/js/widgets/adetools/arrange/arrange.js by `/usr/bin/grep` (node.track,
  regions, settingsRows.create) plus ranges 565-594, 700-780, 955-963,
  1300-1370, 2094-2233
- static/js/matrix/widget-picker.js (full, pre-edit, 81 lines)
- static/css/matrix.css (full, 319 lines pre-edit)
- static/css/skins/og.css (full, 131 lines) — found the existing `:root`
  F-G's read list missed
- `/usr/bin/grep -rohE "var\(--[a-zA-Z0-9_-]+(,\s*[^)]+)?\)"` across
  static/css and static/js/widgets (full set, ~95 distinct forms);
  targeted greps resolving every declaration site for each name
- static/js/widgets/adetools/timeline/timeline.js:1-100, 1225-1310 (CSS
  block, ruler-pad markup, zoom handlers)
- static/js/widgets/agent/strip/strip.js (full, 106+ lines around the
  chip build/kill handler)
- ade/frames.py:640-680 (kill_track / delete_track field shapes)
- ade/web_io.py:25-91 (`_region_row`/`_track_row`, track_list frame shape)
- library/registry/widgets.json (type strings: mount, strip, devagent,
  timeline)
- Docs/tests/matrix_harness.py (full, driver pattern reference)

## CLOSER REVIEW

- F-G's "never defined in any :root" was incomplete (missed
  skins/og.css); the new matrix.css `:root` is a safe duplicate today.
  Worth flagging to F-G's box or Brandon if og.css's role as "the" skin
  is ever in question.
- Timeline ruler-pad's wrap is confined to the fixed 250px `#tlHeads`
  column regardless of the widget's outer frame width — the fix holds at
  any size, but the "at 340px vs normal width" framing in the spec
  doesn't distinguish two different states in the current CSS. Not
  acted on beyond the fix itself.
- Strip's item 7 shipped as a pure label change per Brandon's reversal;
  no behavior change, so nothing for W4 to re-test there beyond reading
  the button.
