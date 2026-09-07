SESSION REVIEW — Sandbox Suite F2 shared modules — Goto agent

EDITS

- [static/js/widgets/shared/root-browser.js](../../static/js/widgets/shared/root-browser.js) — new: `MX.openRootBrowser(start, commit, opts)`, moved from devagent's `openRootBrowser` + `ROOT_CSS` + `ensureRootCss` + `el` helper. CSS id `mx-root-browser-css`, class names unchanged. `ensureRootCss()` now also runs eagerly at file load so `.mx-dev-rootfield` styling is present before any consumer mounts.
- [static/js/widgets/shared/add-controls.js](../../static/js/widgets/shared/add-controls.js) — new: `MX.mountAddControls(host, frame, opts)`, lifted from devagent's `renderAddControls`/`rootField`/`inheritedRoot`. Modes `"track"`, `"region"`, `"both"`. Owns its own small CSS (`mx-add-controls-css`) instead of depending on `.mx-devagent` ancestor scoping, so it renders correctly standalone in timeline too.
- [static/js/widgets/shared/settings-rows.js](../../static/js/widgets/shared/settings-rows.js) — new: `MX.settingsRows.create(frame, opts)`, moved from devagent's `BLOCK_OF`/`ALWAYS_ON_REGION_KEYS`/`CLAUDE_FORCED_KEYS`/`CHOICES`/`PATH_KEYS`/`CHOICES_LIVE`/`choicesFor`/`controlKind`/`contextKey`/`ensureContextBox`/`loadContext`/`saveContext`/`railFor`/`buildSettingRow`/`renderChangePrompt`/`renderSettingsTab`/`renderContextBlock`/`renderGatesTab`/`renderPresetTab`, plus the row CSS (`.mx-dev-row` through `.mx-dev-change-prompt`, split out of devagent's `DEV_CSS`) under id `mx-settings-rows-css`. `saved` frame handling moved into the returned `onFrame(msg)`.
- [static/js/widgets/shared/derived.js](../../static/js/widgets/shared/derived.js) — new: `MX.derived = { deriveFileHandoffs, deriveMessageHandoffs, mergeDerived }`. `deriveFileHandoffs` is `deriveCables` from `Docs/audit/arrange-old/cables.js`, unchanged (converted from an ES module export to the window.MX IIFE idiom). `deriveMessageHandoffs` returns `[]`. `mergeDerived` flattens to `{ from, to, wire, count, at, paths }`.
- [static/matrix.html](../../static/matrix.html) — loads the four new shared files after `turns.js`, before `mount/mount.js` (first widget file).
- [static/js/widgets/mount/mount.js](../../static/js/widgets/mount/mount.js) — rewritten as a caller of `MX.mountAddControls(frame.host, frame, { mode: "both" })`; own form and track_list-guessing logic removed. onFrame forwards every message to the control's `onFrame`.
- [static/js/widgets/devagent/devagent.js](../../static/js/widgets/devagent/devagent.js) — root browser, add controls, and settings-row builders deleted (moved out). `renderTree` now calls `MX.mountAddControls` in `"track"` and `"region"` mode. `renderTrackRung`/`renderRegionRung` call `dev.settingsRows.renderContext/renderSettings/renderGates/renderPreset`. `dev.settingsRows = MX.settingsRows.create(frame, { state: dev, rerender })` created at mount. `DEV_CSS` trimmed to what devagent still draws itself (tree, rung heads, tabs, region-action buttons); kept a small local `modelDisplay` for the region rung head text since that call site stays in devagent while the builder it was listed under moved.
- [static/js/widgets/timeline/timeline.js](../../static/js/widgets/timeline/timeline.js) — deleted its own `openRootBrowser` and the `.tl-rootmodal` CSS block; `rootLine`'s one call site now calls `MX.openRootBrowser(root || "/", commit, {})`. `#tlHeadActions`'s two buttons (dispatching `mx:open-devagent`) replaced with `MX.mountAddControls` in `"track"` mode and `"region"` mode (`opts.track()` reads `tl.lastTrackId`, set on lane left-click and right-click).

BEHAVIOR CHANGES (the two named in the spec)

- Timeline head actions mount real add controls instead of asking a devagent to open (`mx:open-devagent` no longer fires from `#tlHeadActions`; lane right-click's `openTrackMenu` still fires it).
- Mount widget matches the pending track name against `track_created`'s `row` field (set by F1) instead of guessing the newest row off `track_list`. This logic lives in `add-controls.js`'s `"both"`-mode `onFrame`, which mount.js just forwards to.

CHECKS RUN

- `node --check` on all seven touched/created JS files — all pass.
- Grep: no file under `static/js/widgets/` outside `shared/` defines `openRootBrowser`, `renderAddControls`, `rootField`, `buildSettingRow`, `renderSettingsTab`, `renderContextBlock`, `renderGatesTab`, `renderPresetTab`, or `deriveCables` — clean.
- Grep: `mx:open-devagent` in timeline.js only appears inside the `openDevagent()` definition, called from `openTrackMenu` (lane right-click) — not from `#tlHeadActions` anymore.
- Server was already running; curled all four new shared files, both edited widget files, and matrix.html — all 200.
- `python3 -m pytest Docs/tests/test_targets_tabs.py -q` — 61 passed, 3 failed. The 3 failures are in `ade/tracks.py`/`ade/frames.py` (`'str' object has no attribute 'tracks_lock'`), the parallel agent's files, unrelated to this move — not touched here.

DECISIONS MADE (judgment calls the spec left open)

- CSS split for the settings-row block: moved the literal contiguous span from `.mx-dev-row` through `.mx-dev-change-prompt` in devagent's `DEV_CSS` into `settings-rows.js`, except `.mx-dev-caret` (kept in devagent too — the tree's collapse caret also uses it) and the button-group rule, which I split so `.mx-dev-tabs`/`.mx-dev-region-actions` (still devagent's) stay in devagent and `.mx-dev-context-actions`/`.mx-dev-preset-actions`/`.mx-dev-change-choices` move. `.mx-dev-add` was dropped from both — add-controls.js now owns its own tiny CSS instead, since it needed to render correctly outside a `.mx-devagent` ancestor (timeline has no such wrapper).
- `add-controls.js`'s returned object carries `onFrame(msg)` in addition to the spec's documented `{ el, refresh(state) }` — required for `"both"` mode to catch `track_created` and chain into `insert_region`; a no-op in `"track"`/`"region"` mode. Matches the idiom `settings-rows.js` already uses for the same reason.
- `modelDisplay(dev, region)` was on the spec's "moves to settings-rows.js" list but its only caller (the region rung head text) stays in devagent; kept a small duplicate in devagent.js so that display line still works, and also kept it (unused internally) in settings-rows.js per the literal list.
- `ensureRootCss()` in `root-browser.js` runs once eagerly at file-load time, not only lazily inside `openRootBrowser` — needed so `.mx-dev-rootfield` (used by `add-controls.js`'s root field, built at mount time, before any browse click) is styled from the start.
- Timeline's `opts.track()` for `"region"` mode reads `tl.lastTrackId`, a new field set on lane left-click and on right-click (`openTrackMenu`) — "the lane last right-clicked or selected" per spec section 2.

STRAY FILES

- None.

GOALS DONE

- shared/root-browser.js, shared/add-controls.js, shared/settings-rows.js, shared/derived.js built and loaded.
- Both named behavior changes made.
- No Python file touched.

BRANDON'S TODOS

- None raised this job.

CLOSER REVIEW

- Gets a copy of this review, not a contract.
- Confirm the CSS-split judgment calls above read as reasonable — closer/Brandon: visual check once the other agent's Python work lands and the app can be exercised live (nothing was run live beyond curl/node --check/pytest this session).
