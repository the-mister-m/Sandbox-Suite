SESSION REVIEW — Sandbox Suite — F-D — 2026-09-07 (edits) / restart / harness EDT

EDITS
- engine/providers.py:534-543 — ClaudeProvider.list_models: each row gains
  `resolved`, CLAUDE_ALIAS_TO_RATE_KEY.get(name, name) — the resolved rate
  key for an alias, else the id itself.
- static/js/widgets/shared/model-picker.js:24-34 — fill() takes an optional
  labelFor(v) callback for option text.
- static/js/widgets/shared/model-picker.js:73-89 — drawVersions() passes a
  labelFor that shows row.resolved instead of "—" for the empty-version
  (alias) entry; dated versions unaffected.
- static/js/widgets/devagent/devagent.js:208-215 — modelDisplay() shows
  row.resolved when the matched row has no version; unchanged otherwise.
- static/js/widgets/timeline/timeline.js:1213-1218 — tl state gains
  modelRows: [].
- static/js/widgets/timeline/timeline.js:1310-1315 — mount() fetches
  /api/library/models into tl.modelRows, re-renders on arrival.
- static/js/widgets/timeline/timeline.js:790-796 — new modelSub(tl, reg)
  helper: resolved id when the matching row has no version, else reg.model.
- static/js/widgets/timeline/timeline.js:1027 — lane `sub` uses
  modelSub(tl, reg) in place of raw reg.model.

HARNESS
Driver: /private/tmp/.../scratchpad/fd_driver.py (session scratchpad, not
under the project), built on Docs/tests/matrix_harness.py's mount call and
B1/B4's socket-frame-capture pattern. Headed, session 9883b6bec3df.

- Mounted devagent + timeline via MX.grid.addWidget, resized both in-memory
  only (grid._place, no grid.save()) so the model picker and lanes were
  tall enough to screenshot.
- Sent insert_region on track 5a031370bf1c, claude/sonnet — mounted as
  region 805f93037a33 "fdsonnet.4" (name collision auto-suffixed by
  _stamp_name; two earlier throwaway mounts from debugging this driver,
  fdsonnet/fdsonnet.2/fdsonnet.3, were caught and killed before this run —
  see BLOCKERS).
- devagent settings tab, region rung: "REGION fdsonnet.4 — claude /
  claude-sonnet-5 idle"; model row version select reads "claude-sonnet-5",
  not a dash. SEEN — fd-01-devagent-full.png, fd-02-devagent-widget.png.
- Timeline lane for the same region: sub-label "claude-sonnet-5". SEEN —
  fd-01-devagent-full.png (same shot, timeline docked alongside), fd-03-
  timeline-widget.png.
- gfsf (32f1ec929f4a, track a104ecc9ea23, gemma4:e4b-it-q8_0) confirmed
  unchanged throughout — lane sub-text "gemma4:e4b-it-q8_0" before, during,
  and after (fd-console.txt line 6; fd-04-after-kill.png). Live roster
  checked twice (fd_check.py) — gfsf is the only region left at close.
- Killed the mounted region via kill_track; track_removed confirmed in
  fd-frames-seen.json. REGION rung reads "—" after. fd-04-after-kill.png.
- Console: one pre-existing page-level 404 (known, shared-setup list). No
  new console errors, no pageerrors.
- python3 ast.parse and node --check passed on all four edited files
  before restart.

STRAY FILES
- Docs/Reports/phase3-test/fd/ — fd-01 through fd-04 screenshots,
  fd-console.txt, fd-frames-seen.json. This box's evidence.
- Driver scripts in session scratchpad (fd_driver.py, fd_check.py), not
  under the project.
- library/grids/9883b6bec3df/w-*.json — one throwaway window file per
  Playwright page load across this box's five runs (three killed
  debugging attempts plus the clean run plus fd_check.py's two roster
  checks); same footprint noted in B1/B4. F-B and F-C were running
  headed in parallel and will have added more of these independently —
  not all of them are this box's.

GOALS DONE
- Server: /api/library/models rows carry `resolved`.
- model-picker.js version select shows the resolved id for an alias row.
- devagent.js and timeline.js show the resolved id wherever they
  previously drew the bare alias.
- Harness confirms all three, live, plus the gemma4 no-op case.

BLOCKERS
- None on the spec's three items. One process note: mounting the same
  region name twice in the same session hits _stamp_name's collision
  suffix (fdsonnet -> .2 -> .3 -> .4) rather than reusing the freed name;
  two debugging mounts had to be found via a live-roster check
  (fd_check.py, name startswith match) and killed by hand before the
  clean run. Not a bug in this box's files — noted for whoever owns
  _stamp_name.

READS
- Docs/Specs/SPEC-phase4-fixes-B.md:8-24 (Shared setup), :96-121 (F-D)
- engine/providers.py:70-99, :225-254, :525-560 (CLAUDE_MODELS,
  CLAUDE_ALIAS_TO_RATE_KEY, ClaudeProvider.list_models/split_model)
- static/js/widgets/shared/model-picker.js (full, 139 lines)
- static/js/widgets/devagent/devagent.js:190-215, :386-415, :440-505
- static/js/widgets/shared/settings-rows.js:220-230, :325, :489 (grep only,
  confirms mountModelPicker call site)
- static/js/widgets/timeline/timeline.js:786-800, :960-1040, :1200-1350
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (full — driving
  mechanics, probe pattern)
- Docs/tests/matrix_harness.py (full, basis for the driver)
- ade/frames.py:437-476, :550-582, :618-640 (_do_insert_region, roster,
  stop/kill_track)
- ade/web_io.py:25-45, :101-108 (_region_row, send_track_created)
- ade/tracks.py:1141-1181 (insert_region, _announce_new_track — grep, name
  collision -> _stamp_name)
- static/js/matrix/grid.js:1-11, :140-170, :185-235, :302-350 (addWidget,
  _place, _cellSize, resize — grep for the in-memory resize)
- static/js/matrix/widget-frame.js:1-110 (subscribe/deliver, confirms
  data-instance is the .mx-widget element itself)
- library/registry/widgets.json:13-16 (devagent/timeline type strings)
- archives/9883b6bec3df/log.jsonl (grep, gfsf/track id ground truth)

CLOSER REVIEW
- Three-item fix confirmed live, no open questions on this box's files.
- _stamp_name's collision behavior (never reuses a freed name within a
  session) is a minor process friction, not scoped to F-D — Brandon or
  closer, note-only.
