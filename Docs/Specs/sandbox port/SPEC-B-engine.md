# SPEC B — ENGINE: providers and settings tiers

Builder: Opus.
Order: second. Starts after Docs/Reports/RECEIPT-A-foundation.md exists. Read that receipt first.
Scope source: Docs/Scope/SCOPE-sandbox-cleanup.md, Phase 1 (Providers, Settings).

## GUARDRAILS

- Files you may edit: engine/providers.py, engine/ollama_provider.py, engine/agent_loop.py, engine/settings.py (new), ade/rails.py, ade/tracks.py, ade/frames.py, ade/web_io.py, server.py (global section and settings routes only), tests/. Delete: engine/codex_provider.py, engine/settings_stack.py.
- Do not touch: engine/read_tool.py, engine/compiler.py, engine/policy.py, channels/, static/. Those are C or phase 2.
- The design is in this document. Build it. Where the document is silent, choose the smallest thing and write it in the receipt under QUESTIONS.
- Code comments: label, function, state. Nothing else.
- Keep existing setting key names. Phase 2 JavaScript reads them. No renames of keys that survive.
- Boot stays green. `python3 -m pytest tests/ -q` passes at the end.
- Read budget: providers.py, ollama_provider.py, settings_stack.py, rails.py in full. agent_loop.py lines 1 to 600 and 1293 to 1400. tracks.py lines 279 to 1000 and 1197 to 1330 and 1354 to 1560. frames.py lines 214 to 380 and 869 to 950. server.py lines 420 to 520 and 1096 to 1160. Nothing else without a reason in the receipt.
- Receipt: Docs/Reports/RECEIPT-B-engine.md. Update INDEX.md and SESSIONLOG.md.

## PART 1 — PROVIDERS

### 1a. Delete

- `LiteRTProvider`, `LiteRTPersistentProvider`, `LlamaCppProvider`, `LLAMACPP_MODELS`, `LLAMACPP_PORT`, `LLAMACPP_NGL`, `LITERT_MODELS_DIR`, `_first_glob`.
- `CodexProvider`, `CODEX_MODELS`, engine/codex_provider.py, and the `provider="codex"` override in `Router._pick` and `Router.chat`.
- `is_text_only_provider`.
- In agent_loop.py: `_is_litert`, `_is_llamacpp`, every branch that mentions litert or llamacpp, `WorkerIO`, `add_agent`, `_drain_worker`, `WORKER_COORDINATOR_URL`, `handle_command`, `_handle_command_impl`, `show_status`, `persist_session`, `_save_transcript`, `_load_index`, `_save_index`, `index_upsert`, `index_remove`, `load_index_healed`, `SESSIONS_INDEX_PATH`, `sessions_dir`, `_project_meta`. `agent_respond` stops calling `_save_transcript`.
- In tracks.py `_apply_edit`: the llamacpp branches.
- In rails.py: the llamacpp, litert, codex rails and provider rows; the two hidden SDK rails; the unbuilt API rail. Four rails remain: ollama user-loop native, gemini user-loop native, claude user-loop cli (tools OFF), claude agent-loop cli (tools ON). Keep the field names `provider`, `loop_class`, `mechanism` because tracks and phase 2 JavaScript store them.
- `normalize_audio` stays. speech.py uses it.

### 1b. Provider interface

Every provider class exposes the same surface:

```python
class Provider:
    id = "ollama"            # "ollama" | "gemini" | "claude"
    label = "Ollama"
    kind = "local"           # "local" | "cloud"
    tool_mode = "native"     # "native" | "text"
    settings_keys = ()       # the keys this provider reads, see Part 2 table

    def available(self) -> bool
    def list_models(self) -> list[dict]      # rows: {"id", "provider", "model", "version"}
    def chat(self, messages, model, settings, tools=None, region_id=None,
             root=None, metrics_sink=None)   # generator of (channel, data)
    def unload(self, model=None, region_id=None) -> str
```

`settings` is a plain dict holding only this provider's keys plus the harness keys (`request_timeout`, `gate_wait_s`). `run_turn` builds it: `{k: bag[k] for k in provider.settings_keys + HARNESS_KEYS}`. No other kwargs reach a provider. Remove every `**_kwargs` catch-all.

Kind: ollama is local. gemini and claude are cloud.

Tool mode: ollama and gemini are native (they receive the tool schema). claude is text on the tools-OFF rail. On the tools-ON rail the harness sends no tools; Claude's own tools run through the hook. `run_turn` reads `provider.tool_mode` and the region's rail instead of `_is_claude` checks. `_agent_loop_body` derives `effective_mode` the same way. Delete the `mode` setting.

### 1c. Model rows

`list_models` returns rows, not strings. Split rule per provider:

- ollama: `"gemma4:26b-mxfp8"` becomes model `gemma4`, version `26b-mxfp8`. No colon means version `""`.
- gemini: `"gemini-2.5-flash"` becomes model `gemini`, version `2.5-flash`.
- claude: aliases `sonnet`, `opus`, `haiku`, `fable` become model = alias, version `""`. Dated ids `claude-opus-4-8` become model `opus`, version `4-8`.

`id` stays the full string the provider actually accepts. Router.list_models returns the concatenated rows. `send_models` in ade/web_io.py sends rows; keep the old `list` of ids alongside under the same frame so phase 2 JavaScript keeps working: `{"type": "models", "list": [ids], "rows": [rows], "current": ...}`.

Global settings gain a `models` block for the phase 2 model manager: `{"order": [], "hidden": []}`. Router applies `hidden` when listing. Nothing else reads it yet.

### 1d. Claude

Fold both Claude classes' stream reading into one method `_read_events(reader, on_result)` used by oneshot `chat` and persistent `_read_turn`. One copy of the `stream_event` / `assistant` / `result` handling.

Replace the seventeen `_X` / `_spawned_X` pairs with two dicts: `self._want` (built from the settings block each call) and `self._spawned` (a copy taken at spawn). Respawn when `self._want != self._spawned` or the process is gone or the model changed. Model and root live in the same dict.

`settings_stack.resolve()` collapses into `ClaudeProvider._overlay(settings)`: read `claude_settings_file` if set, take the three carried keys (`outputStyle`, `autoMemoryEnabled`, `claudeMdExcludes`), then let the block's own `claude_output_style`, `claude_memory_enabled`, `claude_md_excludes` override. No preset layer. The preset is already copied into the bag by Part 2.

Drop `claude_gated` (accepted, never used) and `claude_preset` (replaced by `preset_name` in Part 2).

`ClaudeProvider._settings_obj` (the hook registration) is unchanged. hooks/ade_pretooluse_hook.py is unchanged.

### 1e. Router

```python
class Router:
    providers: dict[str, Provider]   # {"ollama": ..., "gemini": ..., "claude": ...}
    def provider_for(self, model) -> Provider
    def chat(self, messages, model, settings, region_id, root, tools, metrics_sink)
    def list_models(self) -> list[dict]
    def unload(self, model=None, region_id=None)
    # Claude persistent registry: claude_provider_for, claude_reattach,
    # claude_session_id, claude_close_track, claude_interrupt_track stay as they are
```

`provider_for` keeps the name sniff: `gemini*` is gemini, names in `CLAUDE_MODELS` are claude, everything else is ollama. Adding a provider later means one class with the interface above and one line in `Router.__init__`. Write that sentence as the docstring of `Router.__init__`, nothing longer.

## PART 2 — SETTINGS TIERS

### 2a. One table

New file engine/settings.py. It owns every setting the engine knows. Delete engine/settings_stack.py and `DEFAULT_SETTINGS` in agent_loop.py. Everything that imported those imports engine/settings.py.

Row shape:

```python
Row(key, tier, type, default, block=None, preset=True, live=False, nullable=False)
```

- tier: `global` | `track` | `region`. Session has no agent settings; a saved session carries every track's regions' bags (already true through `index_entry`).
- block: `None` for harness keys, else `"ollama"` | `"gemini"` | `"claude"`. `Provider.settings_keys` is derived from this column, not typed by hand.
- preset: saved in a preset file.
- live: safe to apply to a running region without a reset when the region's `reset_on_change` is off. Informational for phase 2 UI. The engine does not enforce it.

The table:

| key | tier | type | default | block | preset | live |
|---|---|---|---|---|---|---|
| model | region | str | "" | | yes | no |
| seat | region | str | "" | | yes | no |
| preset_name | region | str | "" | | no | yes |
| reset_on_change | region | bool | None (see 2c) | | yes | yes |
| gate_wait_s | region | num | 150 | | yes | yes |
| max_tools | region | int | None | | yes | yes |
| request_timeout | region | num | 200 | | yes | yes |
| allow_agent_reset | region | bool | True | | yes | yes |
| context_reset_cap_k | region | int | 300 | | yes | yes |
| start_turn_on_reset | region | bool | True | | yes | yes |
| reset_instruction | region | str | (current sentence) | | yes | yes |
| num_ctx | region | int | 32768 | ollama | yes | yes |
| think | region | bool | True | ollama | yes | yes |
| keep_alive | region | num | 30 | ollama | yes | yes |
| temperature, top_k, top_p, min_p, repeat_penalty, repeat_last_n, seed, num_predict, mirostat, mirostat_tau, mirostat_eta, num_gpu, num_thread | region | (current types) | (current defaults) | ollama | yes | yes |
| claude_mode | region | str | "persistent" | claude | yes | no |
| claude_effort | region | str | None | claude | yes | no |
| claude_partial | region | bool | True | claude | yes | yes |
| claude_cache_ttl | region | str | "1h" | claude | yes | no |
| claude_keep_warm | region | bool | False | claude | yes | yes |
| claude_exclude_dynamic | region | bool | False | claude | yes | no |
| claude_tools | region | list | [] | claude | yes | no |
| claude_disallowed_tools | region | list | [] | claude | yes | no |
| claude_add_dirs | region | list | [] | claude | yes | no |
| claude_hook_ask_blocking | region | bool | True | claude | yes | yes |
| claude_setting_sources | region | str | None | claude | yes | no |
| claude_system_prompt | region | str | "" | claude | yes | no |
| claude_bare | region | bool | False | claude | yes | no |
| claude_config_dir | region | str | "" | claude | yes | no |
| claude_memory_enabled | region | bool | False | claude | yes | no |
| claude_md_excludes | region | list | [] | claude | yes | no |
| claude_output_style | region | str | "" | claude | yes | no |
| claude_settings_file | region | str | "" | claude | yes | no |
| overlay_rows (gates) | region | list | default rows | | yes | yes |
| name | track | str | "untitled" | | no | yes |
| root | track | str | workspace root | | no | yes |
| order | track | int | insertion index | | no | yes |
| skin, modal_mode, modal_mode_ade, gate_keyboard, approve_hold, confirm.*, killswitch.*, kill_holds.* | global | (current) | (server.py GLOBAL_DEFAULTS) | | no | |
| voices.tts_engine | global | str | "say" | | no | |
| voices.tts_voice | global | str | "" | | no | |
| voices.stt_engine | global | str | "parakeet_mlx" | | no | |
| voices.listen_mode | global | str | "ptt" | | no | |
| models.order, models.hidden | global | list | [] | | no | |

Keys that leave the engine entirely: `mode`, `list_recursive`, `list_size`, `list_hidden`, `gate_read`, `gate_list`, `step`, `run_stream`, `speak`, `listen`, `listen_mode`, `tts_engine`, `tts_voice`, `stt_engine`, `worker_transport`, `litert_mode`, `claude_gated`, `claude_preset`, `codex_sandbox_mode`, `codex_approval_policy`. The speech four move to `voices.*` in global. The list and step keys become tool parameters in C's registry. `run_stream` becomes always on.

gemini has no block keys today. The block exists, empty.

### 2b. Functions in engine/settings.py

```python
def region_defaults(provider_kind) -> dict     # every region-tier key at its default
def block_keys(block) -> tuple                 # keys where row.block == block
def harness_keys() -> tuple                    # region-tier keys with block None, minus model/seat/preset_name/overlay_rows
def preset_keys() -> tuple
def load_global() -> dict                      # one loader, merges GLOBAL_DEFAULTS, validates like server._load_global does today
def save_global(data) -> None
def save_global_key(key, value) -> dict        # dotted keys for nested blocks
def list_presets() -> list[str]
def read_preset(name) -> (fields, warnings)
def write_preset(name, fields) -> (ok, path_or_error)
def delete_preset(name), rename_preset(old, new)
```

server.py deletes `_load_global`, `_save_global`, `GLOBAL_DEFAULTS`, `CONFIRM_KEYS`, `CONFIRM_STATES`, `MODAL_MODES`, `ADE_MODAL_MODES`, `KILL_ROW_KEYS`, `KILLSWITCH_SCOPES` and imports them from engine/settings.py. `api_global_post` validation moves into `save_global` (reject unknown keys, wrong types) and the route becomes a thin call. agent_loop deletes `_GLOBAL_DEFAULTS`, `load_global`, `save_global_key`, `modal_mode` and imports from settings.

Presets live in `library/presets/*.json`. Move the five files from `injections/presets/claude/` there. Delete `injections/presets/`. A preset file is the region bag filtered to `preset=True` keys plus `"name"`. No `how` column, no layer logic. Unknown keys are dropped with a warning. Wrong types are dropped with a warning. That is all `read_preset` validates.

### 2c. Region bag

`Region.__init__` builds `self.sess.settings = region_defaults(provider.kind)` then applies the caller's settings. `reset_on_change` default: `True` when the provider kind is cloud, `False` when local. Stored as a real bool on the region after creation, so a later model swap across kinds does not flip it silently. `preset_name` records what was loaded, display only.

Track: `Track` keeps `id`, `name`, `regions`, `root`, `order`, `created`. Delete `INHERITABLE`, `overlay_rows`, `provider`, `loop_class`, `mechanism` from Track. `insert_region` takes `root` from the track when not given; gates come from the caller or the defaults. `order` is the index in creation order; `_track_row` in ade/web_io.py sends it. Track edits: `name`, `root`, `order` only.

Region keeps `provider`, `loop_class`, `mechanism` from `rails.normalize`.

### 2d. Loading a preset onto a region

`_do_load_preset(region, name)`:

1. `read_preset(name)`.
2. Build `new_bag = region_defaults(kind_of(fields["model"]))`, update with `fields`. Keep the region's current `reset_on_change` unless the preset carries one.
3. If `fields["model"]` differs from the region's model, re-run `rails.normalize` for provider, loop_class, mechanism.
4. Apply through the same path as an edit (2e), so reset-on-change applies.
5. Set `preset_name`.

`_capture_preset_fields` becomes: `{k: bag[k] for k in preset_keys()}` plus the current `overlay_rows`. No inheritance from a loaded preset, no default-stripping. Save writes the whole bag.

### 2e. Editing a live region

`Region.apply_edits(items)` today applies each item in place. New rule:

- Items of type `rename`, `overlay`, and edits to `preset_name` apply in place, always. Name and gates do not touch model context.
- Every other item (`setting`, `root`, `seat`, `rail`, `model`) checks `bag["reset_on_change"]`.
  - `True`: build the region's `index_entry()` row, apply the edits to the row's `settings` (and `vessel`, `seat`, `root` as relevant), then call `reset_region` with that row. The fresh region is born with the edited settings. The old cache closes.
  - `False`: apply in place, as today. Providers respawn on their own when they must (Claude's `_want != _spawned`).
- When the region is not pumping and `reset_on_change` is True, reset still happens (a cache is a cache whether or not a turn is running).
- Editing `reset_on_change` itself applies in place.

`reset_region(region_id, row=None)`: accept an optional row so the edit path can hand in the edited row instead of snapshotting the live one. `_reset_watch` and `_do_reset` are unchanged otherwise.

### 2f. Session saves

Already true: `index_entry()` writes the settings delta. Change it to write the full bag (`"settings": dict(self.sess.settings)`), not the delta, so a saved session or template restores without depending on the defaults of the day. `_world_from_master` and `_rebuild_from_row` apply the saved bag over `region_defaults`. Bump `ARCHIVE_SCHEMA` to 5. Schema 4 rows still load: their delta merges over defaults exactly as before.

Templates: unchanged behavior, they blank `status` and `stxt` and carry the bag.

## PART 3 — run_turn

```python
def run_turn(sess, client, payload):
    bag = sess.settings
    provider = client.provider_for(bag["model"])
    settings = {k: bag[k] for k in block_keys(provider.id) + harness_keys()}
    tools = tool_schema() if provider.tool_mode == "native" else None
    stream = client.chat(payload, model=bag["model"], settings=settings,
                         region_id=sess.sid, root=root_arg, tools=tools,
                         metrics_sink=abort_metrics)
```

`tool_schema()` is `rt.NATIVE_TOOLS` until C replaces it. Keep the metrics and meters code after the stream loop as it is. `ctx_max` for the meter: 200000 when provider.id is claude, else `num_ctx`.

## PART 4 — TESTS

tests/test_settings.py:
- every row has a tier in the allowed set and a block in `(None, "ollama", "gemini", "claude")`.
- `region_defaults("cloud")["reset_on_change"] is True`, `region_defaults("local")["reset_on_change"] is False`.
- preset round trip: write a preset from a bag, read it back, equal on preset keys.
- unknown key in a preset file is dropped with a warning.
- `load_global()` on a missing file returns defaults, and `save_global` rejects an unknown key.

tests/test_router.py:
- `provider_for` on `gemini-2.5-flash`, `sonnet`, `gemma4:26b` returns the right ids.
- a fake provider registered in a Router receives only its block keys plus harness keys from a bag that contains every key.
- `list_models` rows carry `id`, `provider`, `model`, `version` (use fakes, no network).

tests/test_region_edit.py:
- a region with `reset_on_change=True` that receives a `setting` edit ends up replaced (old id closed, new id present, new bag carries the edit). Use a stub turn runner; no model calls.
- same region with `reset_on_change=False` keeps its id and the bag changes in place.
- a `rename` edit never resets regardless of the flag.

All tests run offline.

## RECEIPT

Docs/Reports/RECEIPT-B-engine.md. Sections: EDITS, DELETED, KEYS REMOVED FROM THE ENGINE, QUESTIONS, FOR C (anything C must know about the new settings and router surface), STRAY FILES.
