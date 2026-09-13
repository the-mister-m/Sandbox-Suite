# SPEC B2 — FIXES after B: three corrections before C

Builder: Sonnet, or C itself if no Sonnet runs first.
Order: after Docs/Reports/RECEIPT-B-engine.md, before SPEC-C Part 1.
Source: RECEIPT-B-engine.md QUESTIONS 1, 6, 7. Brandon's answers on 2026-09-05.

## GUARDRAILS

- Files you may edit: engine/web_io.py, ade/web_io.py, server.py (`api_settings_resolved` only), ade/tracks.py (`Track` class only), ade/frames.py (`edit_track_row` branch only), tests/.
- Do not touch anything else. Do not touch engine/settings.py, engine/providers.py, static/.
- Code comments: label, function, state.
- Boot stays green. `python3 -m pytest tests/ -q` passes.
- Read budget: engine/web_io.py 170–190, ade/web_io.py 50–66, server.py 900–918, ade/tracks.py 296–320 and `apply_edits` 582–640, ade/frames.py 486–498 and 824–860, static/js/ade/tracksettings.js 580–590 and 1582–1590 (read only, to match the wire shape).
- Receipt: Docs/Reports/RECEIPT-B2-fixes.md. Update INDEX.md and SESSIONLOG.md.

## FIX 1 — send_models lives in engine/web_io.py

B put the row-carrying `send_models` on `AdeSenders` in ade/web_io.py because engine/web_io.py was off its editable list. Move it home.

- engine/web_io.py `send_models(self, rows, current)` sends `{"type": "models", "list": [ids], "rows": rows, "current": current}`. Same body B wrote.
- Delete `send_models` from ade/web_io.py.
- server.py line 1153 caller is unchanged; it already passes rows.
- Test: `WebIO.send_models` frame carries both `list` and `rows`, and `AdeSenders` has no `send_models` of its own.

## FIX 2 — provenance comes back on /api/settings/resolved

Phase 2 JS at tracksettings.js reads `data.provenance[key]` for seven keys and paints a layer class. CSS has `file`, `preset`, `track`. Missing key paints `global`.

Keys: `outputStyle`, `autoMemoryEnabled`, `claudeMdExcludes`, `setting_sources`, `config_dir`, `system_prompt`, `bare`.

Layer per key, first match wins:
- `file` — the value in `overlay` came from the region's `claude_settings_file` (ClaudeProvider._overlay reads it; see providers.py 563).
- `preset` — region `preset_name` is set, the preset file exists in library/presets/, and the bag value equals the preset's value for that key.
- `track` — the bag value differs from the table default in engine/settings.py.
- `global` — otherwise. Omit the key or write `global`; JS treats both the same.

Bag key behind each provenance key: `claude_output_style`, `claude_memory_enabled`, `claude_md_excludes`, `claude_setting_sources`, `claude_config_dir`, `claude_system_prompt`, `claude_bare`.

Add `"provenance": {...}` to the JSON `api_settings_resolved` returns. Nothing else on the route changes. Use `engine.settings.read_preset` and `BY_KEY[...].default`; do not add a resolver module.

Test: stub region with defaults returns no non-global layer; a region with one edited key returns `track` for it; a region whose value matches its named preset returns `preset`.

## FIX 3 — track edits are name, root, order, in code

Today `edit_track_row` sets `name` only and silently drops every other field. Nothing enforces the lane rule.

- `Track.apply_edits(self, fields) -> list[str]` in ade/tracks.py. Accepts `name` (non-empty str, stripped), `root` (existing directory, expanded and absolutized), `order` (int). Sets the accepted ones. Returns the list of rejected keys: unknown keys and bad values.
- `edit_track_row` in ade/frames.py calls it. Rejected keys print one dim line: `[edit_track_row: rejected keys: a, b]`. Broadcast unchanged.
- `root` set on the Track also sets `root` on each of the track's regions through the region's existing root edit path (the `root` branch in `edit_track`, frames.py 835–845). Whatever that path does about reset today, it keeps doing.
- Test: `apply_edits({"name": "x", "root": tmpdir, "order": 2, "provider": "ollama"})` sets three and returns `["provider"]`. Bad root is rejected and root is unchanged.

## NOT IN THIS SPEC

- `harness_keys()` is eight keys. Checked 2026-09-05: every key has a reader and tests cover the filter. Stays.
- `overlay_rows` stays on Region. Stays.
- Schema 4 archives dropping Track rail fields. Regions keep them. Stays.

## RECEIPT

Docs/Reports/RECEIPT-B2-fixes.md. Sections: EDITS, DELETED, PROVENANCE SHAPE (one sample JSON), QUESTIONS, STRAY FILES.
