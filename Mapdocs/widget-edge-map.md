# WIDGET EDGE MAP

Grep a symbol. Read its edges. Open only the files the edges name.
Edges run left to right: caller → callee → wire frame → handler → state.
Pointers are function names, not line numbers.

## EDGE TABLE

```
devagent.mount              → MX.settingsRows.create        → dev.settingsRows
devagent.mount              → GET /api/library/models       → dev.modelRows
devagent.mount              → GET /api/library/presets      → dev.presetNames
devagent.mount              → GET /api/policy               → dev.policyHooks
devagent.mount              → GET /api/claude/output-styles → dev.outputStyles
devagent.mount              → GET /api/settings/region-defaults → dev.regionDefaults
devagent.render             → "Add track" button            → create_track
devagent.render             → renderCard per live region    → one card each
devagent.render             → ensureDraft per track         → one blank card each
devagent.renderCard         → textField(track name)         → edit_track_row
devagent.renderCard         → textField(region name)        → edit_track | draft.name
devagent.renderCard         → MX.mountModelPicker           → edit_track | setDraftModel
devagent.renderCard         → strip tabs                    → dev.cardTab, dev.openCards
devagent.renderCard         → renderTab                     → settingsRows.render*
devagent.renderCard         → "Start region"                → startDraft
devagent.startDraft         → insert_region                 → _do_insert_region
settingsRows.commit         → edit_track | applyToDraft     → _apply_edit | draft
settingsRows.renderSettings → region.settings[key]          → commit
settingsRows.renderGates    → region.overlay                → commit({overlay})
settingsRows.renderContext  → GET /api/fs/read              → save → saved
settingsRows.renderPreset   → loadPreset / savePreset       → frame | REST (draft)
addControls[track|region]   → create_track / insert_region  → unused by devagent
addControls[both]           → create_track → track_created  → insert_region (mount)
modelPicker                 → MX.mountModelPicker           → promise, ctrl.value()
```

## FRAME TABLE

```
create_track    { name, root?, presets? }                → frames.py _do_create_track
insert_region   { track, name, model, root?, seat?,
                  overlay_rows?, settings?, region?,
                  provider?, loop_class?, mechanism?,
                  presets? }                             → frames.py _do_insert_region
edit_track      { track, fields{} }                      → frames.py dispatch branch t == "edit_track"
edit_track_row  { track, fields{} }                      → frames.py dispatch branch t == "edit_track_row"
load_preset     { track, name, mode? }                   → dispatch branch → _park_change → _do_load_preset
save_preset     { track, name }                          → dispatch branch → _park_change
save            { path, content }                        → saved
track_created   { track, row }                           → devagent.onFrame (opens card)
track_list      { rows, tracks, names }                  → applyRoster
```

## NODES

### devagent — static/js/widgets/agent/devagent/devagent.js
One column of cards. No tree, no detail pane, no add-region form.
Owns: the "Add track" button, one card per live region, one draft card per
track, the tab strip and its open state, the button column.
Reads: dev.trackRows, dev.regionRows, dev.drafts.
Writes: create_track, edit_track_row (track name), edit_track (region name,
model), insert_region (startDraft).
Rebuild: `render()` redraws the column on every roster/status/models/gate
frame. Tab and caret clicks also go through `render()`.
Draft ids: `"__draft__:<trackId>"`. `isDraftId()` is a prefix test.
Draft name syncs on `input` so a rebuild mid-typing keeps it.
Start: no name gate. Empty name → "untitled". Empty model → picker value,
else first model row.
Trap: `mountModelPicker` returns a promise; `dev.pickers[id]` fills a tick
after mount. `render()` clears `dev.pickers` first.

### settings-rows — static/js/widgets/shared/settings-rows.js
Owns: the region-tier setting rows, the gates tab, the context boxes, the
preset tab.
Reads: `region.settings[key]` — one source, every row.
Writes: `commit()` — one funnel. Sends edit_track, or `applyToDraft()`
when `isDraft(region.id)`.
Draft: settings, gates, and presets all draft. Preset load on a draft is
REST (`GET /api/library/presets/<name>`) merged over regionDefaults; save
is REST POST of the preset keys plus overlay. Context does not draft — the
file is keyed on a live id.
`MX.settingsRows.isDraft` and `MX.settingsRows.DRAFT_ID` are exported.

### add-controls — static/js/widgets/shared/add-controls.js
Owns: the inline create forms. Modes track / region / both.
`opts.stage` on region mode diverts `+ region` into a caller-held draft.
Consumers: mount (both). devagent no longer mounts it.

### model-picker — static/js/widgets/shared/model-picker.js
Returns a promise resolving to a ctrl. Three chained selects: provider,
model, version. `ctrl.value()` yields the model id. `onPick(id, row)` fires
on user change.

### frames.py — ade/frames.py
`_do_insert_region` accepts settings at birth and applies them through
`_apply_edit` before the region joins the environment. Also reads `seat`
and `overlay_rows` from the message when the region dict lacks them.
Ordering trap: `_apply_spawn_presets` runs AFTER insert, so a preset named
on the create frame overwrites everything in the settings dict.

### server.py
`/api/settings/region-defaults` → `engine_settings.region_defaults("")`.
The bag a region is born with; devagent drafts seed from it.

### tracks.py — ade/tracks.py
`Region.__init__` seeds `sess.settings` from `region_defaults()` and runs
`rails.normalize()`, so provider / loop_class / mechanism are corrected
regardless of what the client sends. An unsent key keeps its default.
`_apply_edit` has no allowlist — any `type:"setting"` key is written.
`name`, `root`, `seat`, `overlay` are separate edit types, not settings keys.

### web_io.py — ade/web_io.py
`_region_row` is the wire shape every widget reads. A draft mimics it:
`{ id, track, name, model, seat, root, provider, loop_class, mechanism,
   settings{}, overlay[], region{} }`
Wire says `overlay`. The server argument is `overlay_rows`. Rename on send.

## THE TWO BUCKETS

settings-rows draws the region-tier keys. `engine/settings.py`
region_defaults returns the same set. Docs/tests/test_draft_region.py
asserts the two match.

All of them ride the `settings{}` bag. `model` and `seat` ride it *and*
their own create-frame arguments, because the settings path sets only the
bag while the argument also sets `region.model` / `region.seat`. `overlay`
is not a settings key — it is `overlay_rows` on the create frame.
`provider` / `loop_class` / `mechanism` never go in `settings{}`; the
settings path skips `rails.normalize`. Region.__init__ normalizes them
regardless.
