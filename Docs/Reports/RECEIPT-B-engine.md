# RECEIPT — SPEC B engine

Boot green. `python3 -m pytest tests/ -q` — 26 passed.
No git actions taken (no commits, no staging, no branches) per the launch instruction.

## PRIOR AGENT

The previous agent B left nothing on disk.

- Checked `ls -laT` on engine/, ade/, server.py, tests/. Every mtime is either
  19:46:16 (pristine fetch) or 21:27–21:38 (agent A's window, matching
  [RECEIPT-A-foundation.md](RECEIPT-A-foundation.md)'s edit list line for line).
- There is a commit after all of it — `774e06e` "rewrite start", 21:43:36 —
  and `git status` was clean against it at session start. So the tree at HEAD
  is agent A's finished state, not a partial B.
- Every SPEC-B artifact was absent or untouched: no `engine/settings.py`, no
  `library/`, `injections/presets/` intact, `engine/codex_provider.py` and
  `engine/settings_stack.py` both present, `engine/providers.py` and
  `engine/ollama_provider.py` both still at 19:46:16.

Nothing to finish. Built the whole spec from the committed state.

## READ BUDGET — CORRECTED RANGES

Four of the eight ranges no longer land where the spec describes.

- agent_loop.py `1293–1400` starts one line inside `load_index_healed`.
  Corrected: **1269–1400** (whole index/persist block through `_agent_loop_body`).
- agent_loop.py: the spec names `show_status`, `handle_command`,
  `_handle_command_impl`, `_drain_worker`, `add_agent`, `WorkerIO` for deletion,
  all outside both ranges. Read **215–257** (WorkerIO), **887–968**
  (`_drain_worker`/`add_agent`) and **1422–1918** (the command block) to find
  their boundaries. Deleting a function requires seeing where it ends.
- tracks.py `1354–1560` cuts `_world_from_master` off mid-body (it runs to 1566).
  Corrected: **1354–1600**.
- server.py `420–520` starts below `GLOBAL_PATH`, `CONFIRM_KEYS`,
  `CONFIRM_STATES`, `MODAL_MODES`, `ADE_MODAL_MODES` and the head of
  `GLOBAL_DEFAULTS` — the exact constants the spec says to move.
  Corrected: **399–495**.
- server.py `1096–1160` lands on `_retired_caches` / `api_retired_chats`, not on
  a settings route. The settings routes are at **610–686** (`api_global_get`,
  `api_global_post`) and **997–1063** (`_SETTINGS_CARRY_KEYS`,
  `api_settings_browse`, `api_settings_read`, `api_settings_resolved`).
  Both read instead.
- frames.py `214–380` and `869–950`, tracks.py `279–1000` and `1197–1330`, and
  the four full-file reads all still land correctly.
- One read outside the budget: **ade/web_io.py in full** (207 lines). It is on
  the editable list and `send_models` had to go somewhere — see QUESTIONS.

## EDITS

- [engine/settings.py](../../engine/settings.py) — new. `Row`, the table, `region_defaults`,
  `block_keys`, `harness_keys`, `preset_keys`, the global loader/saver/validator,
  and the five preset functions.
- [engine/providers.py](../../engine/providers.py) — rewritten to the Provider interface. `_read_events`
  shared by oneshot `chat` and `_read_turn`; `_want`/`_spawned` dicts;
  `_overlay`; row-shaped `list_models`; new `Router`.
- [engine/ollama_provider.py](../../engine/ollama_provider.py) — new interface, `settings` dict instead of
  eighteen kwargs, model rows, `split_model`.
- [engine/agent_loop.py](../../engine/agent_loop.py) — `run_turn` rebuilt on `provider_for` +
  `block_keys`/`harness_keys`; `tool_schema()` added; `_agent_loop_body` derives
  `effective_mode` from `provider.tool_mode`; `Session.settings` from
  `region_defaults("local")`; settings functions imported, not defined.
- [ade/rails.py](../../ade/rails.py) — four rails, three providers, `_models_by_provider`
  walks `Router.providers`.
- [ade/tracks.py](../../ade/tracks.py) — `Track` slimmed to id/name/regions/root/order/created;
  `kind_of()` added; `Region.__init__` builds the bag from `region_defaults`;
  `index_entry` writes the full bag; `apply_edits` reset-on-change rule with
  `_reset_with`; `reset_region(region_id, row=None)`; `ARCHIVE_SCHEMA` 5.
- [ade/frames.py](../../ade/frames.py) — `_do_load_preset` per 2d, `_capture_preset_fields` is now
  a bag filter, `_do_save_preset` writes the whole bag, preset routes on
  `engine.settings`.
- [ade/web_io.py](../../ade/web_io.py) — `send_models` added to `AdeSenders` (rows + list);
  `_track_row` sends `order`.
- [server.py](../../server.py) — global constants and loader imported from `engine.settings`;
  `api_global_post` is a thin call around `save_global`; preset routes moved;
  `/api/settings/resolved` rebuilt on `ClaudeProvider._overlay`; llamacpp
  unload/stop branches removed.
- [library/presets/](../../library/presets/) — the five preset files moved from `injections/presets/claude/`.
  Their `gates` dicts were converted to `overlay_rows` rows (see QUESTIONS).
- [tests/test_settings.py](../../tests/test_settings.py), [tests/test_router.py](../../tests/test_router.py), [tests/test_region_edit.py](../../tests/test_region_edit.py) — new, 24 tests, all offline.
- [global.json](../../global.json) — gained the `voices` and `models` blocks at their defaults,
  written by the new loader. Additive only, nothing existing changed.

## DELETED

- engine/codex_provider.py, engine/settings_stack.py — files gone.
- engine/providers.py: `LiteRTProvider`, `LiteRTPersistentProvider`,
  `LlamaCppProvider`, `CodexProvider` import, `LLAMACPP_MODELS`, `LLAMACPP_PORT`,
  `LLAMACPP_NGL`, `LITERT_MODELS_DIR`, `_first_glob`, `CODEX_MODELS`,
  `is_text_only_provider`, the `provider="codex"` override in `_pick`/`chat`,
  the seventeen `_X`/`_spawned_X` pairs, `DEFAULT_GATED`, every `**_kwargs`.
- engine/agent_loop.py: `_is_litert`, `_is_llamacpp`, `DEFAULT_SETTINGS`,
  `_GLOBAL_DEFAULTS`, `_global_path`, `load_global`, `save_global_key`,
  `modal_mode` (all four now imported), `WorkerIO`, `add_agent`, `_drain_worker`,
  `WORKER_COORDINATOR_URL`, `handle_command`, `_handle_command_impl`,
  `show_status`, `persist_session`, `_save_transcript`, `_load_index`,
  `_save_index`, `index_upsert`, `index_remove`, `load_index_healed`,
  `SESSIONS_INDEX_PATH`, `sessions_dir`, `_project_meta`. `agent_respond` no
  longer calls `_save_transcript`.
- ade/tracks.py: `Track.INHERITABLE`, `Track.inherit`, and `overlay_rows`,
  `provider`, `loop_class`, `mechanism` off `Track`; the llamacpp branches in
  `_apply_edit`.
- ade/rails.py: llamacpp, litert and codex rails and provider rows; both hidden
  SDK rails; the unbuilt Messages API rail; `CODEX_MODELS`.
- ade/frames.py: `_capture_gates`.
- server.py: `_load_global`, `_save_global`, `GLOBAL_DEFAULTS`, `CONFIRM_KEYS`,
  `CONFIRM_STATES`, `MODAL_MODES`, `ADE_MODAL_MODES`, `KILL_ROW_KEYS`,
  `KILLSWITCH_SCOPES`, `GLOBAL_PATH`, `_skins_available`, `_SETTINGS_CARRY_KEYS`.
- injections/presets/ — directory gone.

`normalize_audio` stays. speech.py still imports it and still boots.

## KEYS REMOVED FROM THE ENGINE

`mode`, `list_recursive`, `list_size`, `list_hidden`, `gate_read`, `gate_list`,
`step`, `run_stream`, `speak`, `listen`, `listen_mode`, `tts_engine`,
`tts_voice`, `stt_engine`, `worker_transport`, `litert_mode`, `claude_gated`,
`claude_preset`, `codex_sandbox_mode`, `codex_approval_policy`.

The speech four now live at `voices.*` in global. `run_stream` is always on —
`run_command` streams unconditionally. `claude_preset` is replaced by
`preset_name`.

## QUESTIONS

Where the spec was silent I took the smallest thing. Each of these is a judgment
call, not a rule I invented:

1. **`send_models` is in engine/web_io.py, not ade/web_io.py.** Spec 1c names
   the wrong file, and engine/web_io.py is not on the editable list. Added
   `send_models` to `AdeSenders` in ade/web_io.py instead. `AdeMemberWebIO`
   inherits `(AdeSenders, MonitoredWebIO)`, so it wins the MRO and the ADE
   socket — the only live caller — gets the row-carrying frame. engine/web_io.py
   untouched.

2. **`harness_keys()` is eight keys, not two.** Spec 1b says a provider gets
   "this provider's keys plus the harness keys (`request_timeout`,
   `gate_wait_s`)"; spec 2b defines `harness_keys()` as every region-tier
   block-`None` key minus model/seat/preset_name/overlay_rows — eight keys.
   Followed 2b, since it is the explicit function contract and Part 3 calls that
   function by name. Providers ignore the keys they do not read.

3. **`overlay_rows` is not in the settings bag.** The table gives it a region-tier
   row, but the gates live on `Region.overlay_rows` and mirror to
   `sess.policy_overlay`. Putting them in the bag too would double-store them and
   need a rewrite of every `region.overlay_rows` reader. `region_defaults()`
   skips the key; `preset_keys()` skips it; `read_preset`/`write_preset` accept
   it; `_capture_preset_fields` adds it from the Region, per 2d. The constant is
   `settings.OVERLAY_KEY`.

4. **The five preset files' `gates` dicts were converted, not dropped.** Spec 2b
   says move the files and that unknown keys are dropped with a warning — which
   would have silently thrown away three presets' real gate configuration.
   Converted `gates` → `overlay_rows` with the existing
   `tracks.apply_gate_subset` at move time. All five now read back with zero
   warnings.

5. **The tool-registry keys are `.get()` reads, not deletions.** `list_recursive`,
   `list_size`, `list_hidden`, `gate_read`, `gate_list` and `step` are gone from
   the table but still read in `_execute_tool` and `_agent_loop_body`. Spec 2a
   hands them to C's registry. Left them as `s.get(key, today's default)` so
   behavior is unchanged until C lands. C should delete those six reads.

6. **"Track edits: name, root, order only" has no code path to enforce.** The
   `edit_track` frame calls `tracks.get_region()` — it edits regions and always
   has. There is no track-edit frame to restrict. Left alone.

7. **`/api/settings/resolved` no longer has a resolver to call.**
   `settings_stack.resolve()` is gone. The route now returns the same shape
   (`overlay`, `setting_sources`, `config_dir`, `system_prompt`, `bare`,
   `warnings`) built from the bag plus `ClaudeProvider._overlay`, with
   `provenance` replaced by `preset_name`. Phase 2 JS reading `provenance` will
   find it missing.

8. **`ARCHIVE_SCHEMA` 4 rows still load, but their Track rows lose fields.**
   Schema 4 track rows carry `overlay_rows`/`provider`/`loop_class`/`mechanism`,
   which `Track` no longer has; they are ignored on load. Region rows keep all
   three rail fields, so no rail information is lost — only the Track's unused
   copy. Region settings deltas merge over `region_defaults` exactly as before.

## FOR C

- `engine/settings.py` is the only settings table. `DEFAULT_SETTINGS` and
  `settings_stack` are gone. Add a row to `ROWS`, nothing else.
- `agent_loop.tool_schema()` returns `rt.NATIVE_TOOLS` and is the seam for your
  registry. `run_turn` calls it only when `provider.tool_mode == "native"`.
- Six per-tool keys are still read as `s.get(...)` in `_execute_tool`
  (`list_recursive`, `list_size`, `list_hidden`) and `_agent_loop_body`
  (`gate_read`, `gate_list`, `step`). They have no rows. Delete those reads when
  the registry takes over — nothing else references them.
- Provider surface: `id`, `label`, `kind` (`local`/`cloud`), `tool_mode`
  (`native`/`text`), `settings_keys`, and
  `available/list_models/chat/unload`. `chat` takes
  `(messages, model, settings, tools, region_id, root, metrics_sink)` — a
  settings **dict**, no kwargs, no `**_kwargs`.
- `Router.provider_for(model)` is the name sniff. `Router.chat` swaps in the
  persistent Claude provider itself when `claude_mode == "persistent"`.
- `Router.list_models()` returns rows `{"id", "provider", "model", "version"}`,
  hidden ids filtered by `global.json → models.hidden`.
- `router.unload(model, region_id=...)` — the kwarg is `region_id` now, not
  `track_id`.
- `tracks.reset_region(region_id, row=None)` takes an optional pre-edited row.
- `Region.index_entry()["settings"]` is the full bag, not a delta.

## STRAY FILES

None. `injections/presets/` removed, `library/presets/` created with the five
moved files. `requirements.txt` still pins `claude-agent-sdk` and carries a
comment naming the deleted `engine/claude_sdk.py` — flagged in RECEIPT-A, still
not named for this part, still untouched.
