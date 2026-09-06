# PHASE 1 — ENGINE MAP

Written by: Goto (Sonnet), Phase 1. Date: 2026-09-05.
Files touched (read, not edited): engine/*.py, shells/ade/tracks.py, shells/ade/frames.py,
shells/ade/rails.py, shells/ade/web_io.py, static/js/ade/tracksettings.js, static/js/ade/region.js,
server.py, hooks/ade_pretooluse_hook.py, channels/logicpro.py, channels/webbrowser.py,
injections/presets/claude/*.json, global.json, policy.json.
Some sub-findings (marked "per subagent") come from parallel Explore agents this session
launched and read into this map; every citation is file:line, independently spot-checked
against the live tree where noted.

---

## 1. PROVIDERS

### Ollama — `engine/ollama_provider.py`, class `OllamaProvider` (30-159)
- List: `list_models()` (43) — `GET {host}/api/tags`, returns installed model names.
- Load/warm: no explicit load call; Ollama loads a model on first `/api/chat` request.
  `keep_alive` (top-level field, seconds VRAM stays warm; -1 forever, 0 unload now) is
  the only warmth lever, set per-call from `sess.settings["keep_alive"]` (chat signature, 54-61).
- Unload: `unload(model=None)` (142) — `model=None` sweeps everything currently loaded via
  `GET /api/ps` then one `POST /api/generate {"keep_alive":0}` per loaded model; a specific
  name unloads just that one.
- Call/stream: `chat()` (54) — `POST {host}/api/chat` with `stream:true`; generator yields
  `("thinking"|"content"|"tool_call"|"metrics", data)` reading one JSON line per chunk (117-134).
- Cancel: `GeneratorExit` (135-140) closes the HTTP response, which is what actually aborts
  generation server-side (a closed stream, not a cancel call).
- Settings fields read: `model, think, tools, num_ctx, timeout, temperature, top_k, top_p,
  min_p, repeat_penalty, repeat_last_n, seed, num_predict, keep_alive, mirostat, mirostat_tau,
  mirostat_eta, num_gpu, num_thread` — all named kwargs on `chat()` (54-61), sourced from
  `sess.settings` via `run_turn`'s call into `Router.chat(**kwargs)`.
- Transport: HTTP (`requests`), no subprocess.
- Instancing: ONE `OllamaProvider` per process, held at `Router.__init__` (`self.ollama`,
  providers.py:2480) — not per-track. Model identity travels in the `model` kwarg per call,
  not in the instance.

### Gemini — `engine/providers.py:177-293`, class `GeminiProvider`
- List: `list_models()` (200) — static `MODELS = ["gemini-2.5-flash", "gemini-3.1-pro-preview"]` (183).
- Load/warm: none — `_get_client()` (189) lazily builds one `google.genai.Client` and keeps it;
  no per-model load/unload concept (`Router.unload` has no Gemini branch).
- Call/stream: `chat()` (203) — `client.models.generate_content_stream(...)`; translates the
  canonical transcript via `_translate()` (247) into Gemini `contents`/`system_instruction`;
  yields `content` per text part, one `tool_call` if a `function_call` part arrived, then `metrics`.
- Cancel: no explicit cancel path found — UNKNOWN whether closing the generator aborts the
  remote stream (no `GeneratorExit` handler in this class, unlike Ollama/Claude/LiteRT).
- Settings fields read: only `system_instruction` + `tools` reach the API; `think`, `num_ctx`,
  `timeout` are accepted "for interface parity" and never used (comment, providers.py:168-171,
  and rails.py:166-177's Q4 note — confirms this by code read, not by live probe).
- Transport: HTTP via the `google-genai` SDK (lazy-imported, providers.py:191, so an Ollama-only
  install needs no `google-genai` package).
- Instancing: ONE per process (`self.gemini`, providers.py:2481).

### Claude — `engine/providers.py`, three cooperating pieces
- `ClaudeProvider` (711-1322) — oneshot subprocess curtain over `claude -p`.
  - List: `list_models()` (802) — static `CLAUDE_MODELS` tuple (137-139: `sonnet, haiku, fable,
    opus, claude-opus-4-5, claude-opus-4-6, claude-sonnet-4-5, claude-sonnet-4-6,
    claude-opus-4-8, claude-fable-5`), gated on `available()` (799, checks the binary exists).
  - Load/warm: none — a fresh `claude -p` subprocess spawns on every `chat()` call (1084).
  - Call/stream: `chat()` (1040) builds a command via `_build_cmd()` (806), spawns with
    `subprocess.Popen` (1084-1094, stdin/stdout/stderr piped, `cwd=claude_root`, env from
    `_cache_env()` 909), writes the whole transcript via `_StdinPump` (1099-1100), reads
    `stream-json` lines from stdout in a loop (1140-1199) yielding `thinking`/`content` deltas
    (or full blocks when `claude_partial=False`) and a final `metrics` from the `result` event.
  - Cancel: `GeneratorExit` unwinds through the `finally` (1200-1215) which stops the stdin
    pump and `proc.kill()`s the subprocess if still alive.
  - Settings fields read (via `chat()`'s signature, 1040-1047, several resolved through
    `settings_stack.resolve()` at 1061): `model, claude_gated (accepted, unused — see DEAD),
    claude_effort, claude_partial, claude_cache_ttl, claude_exclude_dynamic, claude_tools,
    claude_setting_sources, claude_system_prompt, claude_bare, claude_config_dir,
    claude_memory_enabled, claude_md_excludes, claude_output_style, claude_settings_file,
    claude_preset, claude_track_id, claude_root, claude_disallowed_tools, claude_add_dirs,
    gate_wait_s, timeout`.
  - Transport: subprocess (`claude -p --output-format stream-json --input-format stream-json`).
  - Instancing: ONE `self.claude` in `Router.__init__` (2485) used only when `claude_mode`
    is not `"persistent"` (rare — see Router._pick, 2583-2609).
- `ClaudePersistentProvider(ClaudeProvider)` (1322-2120) — warm-subprocess variant.
  - Load/warm: `chat()` (1558) either `_spawn_and_prime()` (1637, cold start or any
    spawn-time lever mismatch — model, cache_ttl, exclude_dynamic, tools, setting_sources,
    system_prompt, bare, config_dir, memory_enabled, md_excludes, output_style, settings_file,
    preset, gate_wait_s, disallowed_tools, add_dirs, root — each compared against its own
    `_spawned_X` shadow field, 1364-1447) or `_send_turn()`/`_send_catchup()` (1746, 1760) on
    an already-warm process that "continues" the same transcript (`_continues()`, 1517).
  - Unload: `Router.claude_close_track(track_id)` (2545) kills every warm subprocess for a
    track; `Router.unload(model, track_id)` (2662) pops one `(track_id, model)` entry.
  - Cancel: `interrupt()` (1976) / `_interrupt_and_drain()` (2010) sends an out-of-band
    interrupt and keeps the process warm ("end the turn, keep the session" — providers.py:2562
    docstring); `_kill_process()` (2074) actually kills the OS subprocess (used by `shutdown()`,
    2103, and by a respawn-condition mismatch).
  - Per-(track, model) instancing: `Router.claude_p = {(track_id, model): ClaudePersistentProvider}`
    (2503, "BLOCK D"), get-or-create via `claude_provider_for()` (2506) — one warm subprocess per
    pair, never evicted except by explicit close/unload/shutdown; `claude_keep_warm` lets a track
    hold more than one warm model at once under separate keys.
  - Session-id save/reattach ("BLOCK E"): `Router.claude_session_id()` (2544),
    `Router.claude_reattach()` (2524) — `--session-id`/`--resume` CLI flags (providers.py:874-875).

### Codex — `engine/codex_provider.py`, class `CodexProvider` (76-282)
- List: `list_models()` (103) — `CODEX_MODELS` is `()` in codex_provider.py (35, deliberately
  empty per its own comment); `Router.list_models()` instead lists from `providers.py`'s OWN
  `CODEX_MODELS` tuple (145: `gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5`) at
  providers.py:2632-2634 ("THIS module owns the catalogue").
- Load/warm: none — one-shot `codex exec --json` subprocess per call, `--ephemeral`
  (no session state written, 106-130).
- Call/stream: `chat()` (199) renders the whole transcript into one plain-text prompt via
  `_render()` (132, embeds a hard "do not use tools" instruction plus the ADE's own system
  text), spawns the subprocess, reads newline-JSON events, yields `content` for
  `agent_message` items and a final `metrics` on `turn.completed`/`turn.failed` (236-267).
- Cancel: `finally` block (260-270) kills the subprocess if still alive.
- Settings fields read: `model, workspace_root, metrics_sink` only (199-201) — every other
  kwarg is swallowed via `**_kwargs` (204-207, deliberate: "sampling, native tools, and
  provider-specific Claude settings must not change the text-worker contract").
- Transport: subprocess (`codex exec --json --ephemeral --sandbox read-only
  --ignore-user-config --ignore-rules --skip-git-repo-check`).
- Instancing: ONE `self.codex` in `Router.__init__` (2485).
- DEAD/DOC MISMATCH: `codex_provider.py:7-9`'s own module docstring says "This module is
  intentionally NOT wired into Router yet" — false today; `Router.__init__` (2485), `_pick()`
  (2589-2590), `list_models()` (2632-2634), and `unload()` (2679-2681) all route Codex live.
  Flagged in lane1 already; still true against current code.

### The router — `Router`, `engine/providers.py:2474-2705`
- Holds one instance of every provider (`self.ollama/gemini/litert/litert_p/llamacpp/
  claude/codex`, 2479-2486) plus the per-(track, model) Claude registry `self.claude_p` (2503).
- Picks a provider in `_pick()` (2583-2609): explicit `provider="codex"` override first
  (fail-closed on any other explicit string); else `_provider_for(model)` (148) name-sniffs
  the model string into `codex|gemini|llamacpp|claude|<default>`; Claude routes through
  `claude_provider_for(track_id, model)` when `claude_mode="persistent"` (the default); a
  `.litertlm` name routes to LiteRT (oneshot or persistent per `litert_mode`); anything else
  falls through to Ollama.
- `chat()` (2635) calls `_pick()` then the chosen provider's own `chat()`, forwarding every
  kwarg; Codex gets `workspace_root` aliased from `claude_root` if not given explicitly (2649-2657).
- `unload()` (2662) branches per `_provider_for(model)`: llamacpp/codex are no-ops (external
  server / ephemeral subprocess), Claude pops `(track_id, model)` from `claude_p` (or sweeps
  all when `track_id=None`), LiteRT drops cached engines, else Ollama's `unload()`.

### Other provider classes (one line each)
- **LiteRT** (`LiteRTProvider`, providers.py:2121-2253; `LiteRTPersistentProvider`,
  2256-2313) — in-process `litert-lm-api` engine over local `.litertlm` files
  (`models/` dir scan), wired live in `Router.__init__` (2482-2483); the only local path
  that hears raw audio.
- **LlamaCpp** (`LlamaCppProvider`, providers.py:2314-2473) — HTTP curtain over a
  self-managed `llama-server` subprocess (OpenAI-compatible endpoint), wired live in
  `Router.__init__` (2484); one model per server process, swapped via `ensure_serving()`.

---

## 2. READ / WRITE / RUN PER PROVIDER

**Native function-calling path** (Ollama, Gemini; per `system_message()`,
`engine/agent_loop.py:702-714`, only these two ever reach the native-tools branch — Claude
and llamacpp are forced onto the TEXT branch regardless of `mode`, and LiteRT never receives
`tools=` at all, providers.py:2179/2276 swallow it via `**_kwargs`):
- read_file/write_file/run_command are entries in `NATIVE_TOOLS`
  (`engine/read_tool.py:1258-1319`: `read_file` at 1260-1272, `write_file` at 1289-1303,
  `run_command` at 1304-1319), sent as the model's function-calling schema.
- Gate: `agent_loop.execute_tool()` (1666) / `_execute_tool()` (1750) dispatch each tool
  name to `approve_write()` (1216), `approve_run()` (1289), `approve_read()`/`approve_boundary()`
  (1262/1275) — each builds a human-facing prompt and calls the shared `_resolve_gate()` (1084),
  which calls `policy.resolve(edge, driver, ctx)` (policy.py:174) and, on `hook=="ask"`,
  `daemon_queue.park()`/`await_answer()` (1177, 1180); on `hook=="queue"`, `dq.park()` (1158);
  on `hook=="open"`, `dq.record_resolved()` (1139) with no prompt.
- Executed: the actual work is `read_tool.read_file()` (138), `write_file()` (181),
  `run_command()` (455) — pure functions, no gating inside them (module docstring, read_tool.py
  header: "outside-root access is gated in the loop before this is called").
- Logged: `log_event(sess, "tool", ...)` inside `_execute_tool` → `_record_event` (agent_loop.py:598)
  → `ledger.action_record()`/`append()`, plus the parallel legacy `_append_durable_log` line.

**TEXT-marker path** (every model forced onto `mode:"text"`, plus Claude and llamacpp always):
- `engine/read_tool.py:1012-1094` `_BASE_HINT` (aliased `TEXT_SYSTEM_HINT`/`TEXT_WORKER_HINT`
  at 1096/1103) teaches the model literal `READ:`, `WRITE:` (with `---BEGIN---`/`---END---`
  body fence), `RUN:` markers, among others.
- `detect_text(reply)` (1106) parses the raw model reply for these markers (WRITE checked
  first per its own comment, 1108-1109, since a write body could itself contain "READ:").
- Same gate functions and same `read_tool` executors as the native path — `execute_tool`/
  `_execute_tool` do not care which protocol produced the tool name.
- Claude CLI tools-OFF specifically (`ClaudeProvider`/`ClaudePersistentProvider` with
  `claude_tools` empty/None) spawns with `--tools ""` (providers.py:906) — Claude's own tool
  roster is empty, so this whole TEXT-marker path is Claude's ONLY way to act, gated
  identically to Ollama-in-text-mode.

**Claude CLI tools-ON, Rail C** (`agent-loop` / `cli`, rails.py:270-319, `piped:True`):
- Claude's OWN native tool schema (`Read/Write/Edit/Bash/...`, selected by the `claude_tools`
  roster, `--tools <list>` CLI flag, providers.py:906) — the harness's `execute_tool` never
  runs on this rail (rails.py:48 comment: "the model owns the loop").
- Gate: `_settings_obj()` (providers.py:951) registers a `PreToolUse` AND `PostToolUse` hook
  (both pointed at `hooks/ade_pretooluse_hook.py`) into `--settings` whenever `claude_tools`
  is non-empty — "not a separate toggle" (same method docstring, 963-967).
- `hooks/ade_pretooluse_hook.py` reads `ADE_REGION_ID` from its own inherited env (set at
  spawn by `_cache_env()`, providers.py:945-946); on `PreToolUse` (`_handle_pre`, 175) it
  POSTs `{region_id, tool_name, tool_input, tool_use_id[, edge]}` to
  `http://localhost:5000/api/policy/resolve-hook`; on `PostToolUse` (`_handle_post`, 214) it
  POSTs `{region_id, tool_name, tool_input, tool_response, tool_use_id, duration_ms}` to
  `/api/policy/record-tool-outcome` and never waits on/denies from the response.
- `server.py:api_policy_resolve_hook()` (1371) maps `tool_name` → policy edge via
  `claude_sdk.edge_for()`/`TOOL_EDGES` (claude_sdk.py:173-191, e.g. `Bash→run_command`,
  `Read/Glob/Grep/NotebookRead→check_read`, `Write/Edit/NotebookEdit→write_file`,
  `WebFetch/WebSearch→fetch_url`), one override: a read-only Bash command
  (`cat/grep/ls/head/tail/wc/find`, no `>,>>,|,;,&&`) is reclassified to `check_read` by the
  hook script's own `_bash_edge()` (hook file, 143-153) before the POST. Resolves via
  `policy.resolve(edge, "model", ctx)` (server.py:1413); on `ask` it BLOCKS via
  `dq.await_answer(entry["id"], timeout=gate_wait_s)` (1460) unless the track's
  `claude_hook_ask_blocking` is False (degrades straight to `queue`, 1449-1454); returns
  `{"decision": "open"|"queue"|"locked"}` which the hook script turns into
  `permissionDecision: allow|deny` (`_respond`, hook file 156-164).
- FAIL-OPEN (documented, not this code's choice): the CLI's own hook-timeout (`gate_wait_s+15`
  or `CLAUDE_IDLE_TIMEOUT`, providers.py:993) cancels a hanging hook script and lets the tool
  through if THIS SCRIPT itself hangs past it (hook file, module docstring 77-84).
- Executed by Claude's own tool implementation inside the CLI subprocess — never
  `read_tool.py`.
- Logged: `dq.record_resolved`/`log_event` on PreToolUse (server.py:1425-1481);
  `_open_rail_c_tool_record()` (server.py:1428, 1479, def not read this pass) on an
  opened/approved call, closed by the PostToolUse endpoint.

**Claude Agent SDK rails** (`claude_sdk.py`, `piped:False`, `hidden:True` — rails.py:233-266):
- `make_can_use_tool()` (claude_sdk.py:269) builds an async `can_use_tool(tool_name,
  input_data, context)` callback (283) that runs `decide()` (233) in an executor — same
  `policy.resolve(edge, driver, ctx)` call as every other rail, using the SAME `TOOL_EDGES`
  map (173-191) — returning `PermissionResultAllow()`/`PermissionResultDeny(message=why)`.
- Not wired to a live `Session` (module docstring: "Leg 3" unbuilt) — described but does not
  run a turn today; hidden from the frontend catalog (rails.py:526).

**Codex**: no tool schema is ever sent (`--sandbox read-only`, no `--tools`-equivalent flag
exists on the Codex CLI per the module docstring, codex_provider.py:11-19); the rendered
prompt (`_render()`, 132-170) instructs the model in plain text not to use tools and to emit
the ADE's own text markers instead. If Codex emits a tool-shaped item anyway
(`command_execution`/`tool_call`/`mcp_tool_call`/`web_search`, 250-253), `CodexProvider.chat`
reports it as `"[CodexProvider protocol violation: attempted ...]"` (272-274) and does
**not** forward it into `execute_tool`/`read_tool.py` at all — no read/write/run path exists
from Codex today.

---

## 3. EVERY OTHER TOOL AND GATE EDGE

| tool / edge name | policy edge | approve function (agent_loop.py) | dispatched where | channel / module |
|---|---|---|---|---|
| read_file/list_files/view_image (inside root) | `check_read` | `approve_read` :1262 | `execute_tool`/`_execute_tool` :1666/:1750 | read_tool.py |
| read_file/list_files/view_image (outside root) | `check_read` (scope=outside) | `approve_boundary` :1275 | same | read_tool.py |
| write_file | `write_file` | `approve_write` :1216 | same | read_tool.py |
| run_command | `run_command` | `approve_run` :1289 | same | read_tool.py |
| fetch_url | `fetch_url` | `approve_fetch` :1299 | same | read_tool.py |
| screen_capture | `screen_capture` | `approve_screen` :1309 | same | read_tool.py |
| recall | `recall` | `approve_recall` :1330 | same | read_tool.py (`recall_memory`) |
| remember | `remember` | `approve_remember` :1438 | same | read_tool.py |
| send_message | `send_message` | `approve_send` :1341 | same | read_tool.py / waypoint.py |
| request_messages | `request_messages` | `approve_request` :1364 | same | read_tool.py / waypoint.py |
| reset_self | `reset_self` (no row in policy.json on disk — falls to unknown-edge "ask" default, policy.py:209) | `approve_reset_self` :1391 | agent_loop.py :2148 | read_tool.py `reset_self` → `_ade_resetter` (server.py:660) |
| reset_region | `reset_region` (same — no row on disk) | `approve_reset_region` :1419 | agent_loop.py :2169 | read_tool.py `reset_region` → `_ade_resetter` |
| step (observability) | n/a (no policy row) | `approve_step` :1553 | `_execute_tool` when `/step`/per-tool gate on | read_tool.py |
| logic_status | `logic_status` | `approve_logic_status` :1458 | `_execute_tool` | channels/logicpro.py |
| logic_open | `logic_open` | `approve_logic_open` :1467 | `_execute_tool` | channels/logicpro.py |
| logic_transport | `logic_transport` | `approve_logic_transport` :1476 | `_execute_tool` | channels/logicpro.py |
| logic_command | `logic_command` | `approve_logic_command` :1484 | `_execute_tool` | channels/logicpro.py |
| web_open | `web_open` | `approve_web_open` :1500 | `_execute_tool` | channels/webbrowser.py |
| web_read | `web_read` | `approve_web_read` :1511 | `_execute_tool` | channels/webbrowser.py |
| web_screenshot | `web_screenshot` | `approve_web_screenshot` :1521 | `_execute_tool` | channels/webbrowser.py |
| web_act | `web_act` | `approve_web_act` :1532 | `_execute_tool` | channels/webbrowser.py |
| web_eval | `web_eval` | `approve_web_eval` :1543 | `_execute_tool` | channels/webbrowser.py |
| Read/Glob/Grep/NotebookRead (Claude native) | `check_read` (via `TOOL_EDGES`, claude_sdk.py:175-178) | n/a — Rail C bypasses agent_loop's approve_* entirely | `/api/policy/resolve-hook` (server.py:1371) | hooks/ade_pretooluse_hook.py |
| Write/Edit/NotebookEdit (Claude native) | `write_file` (claude_sdk.py:180-182) | n/a | same | same |
| Bash/BashOutput/KillShell (Claude native) | `run_command` (claude_sdk.py:184-186) | n/a | same | same |
| WebFetch/WebSearch (Claude native) | `fetch_url` (claude_sdk.py:189-190) | n/a | same | same |
| `default`/human/any | `default` | none (human-driven actions; hook `open`) | policy.py fallback row, `:_find_row` 159 | n/a |

Channel edge tables (declared, not policy-table rows — `channel_registry.register`,
`engine/channel_registry.py:49`):
- `channels/logicpro.py:40-45` `EDGES`: `logic_status` (level `check`), `logic_open`/
  `logic_transport`/`logic_command` (level `run`) — all `grade: "declared"`.
- `channels/webbrowser.py:60-66` `EDGES`: `web_open`/`web_screenshot` (level `check`),
  `web_read` (level `read`), `web_act`/`web_eval` (level `run`) — all `grade: "enforced"`.

---

## 4. SETTINGS SURFACES

| surface | file / object | UI | reader | writer | route/frame |
|---|---|---|---|---|---|
| global.json | `SUITE_ROOT/global.json` | control widget (Phase 2, not read this pass) | `agent_loop.load_global()` :300 AND `server._load_global()` :919 (duplicated by design, agent_loop.py:271: "engine never imports server.py") | `agent_loop.save_global_key()` :330 AND `server._save_global()` :960 | `/api/global` GET/POST, server.py:1197-1278 |
| agent_loop DEFAULT_SETTINGS / Session.settings | in-memory dict, `engine/agent_loop.py:87-259` (dict), `:463` (`Session.__init__`) | ADE track menu widget (tracksettings.js), IDE/terminal connect defaults | `sess.settings[...]` read fresh every `run_turn()` call :836-921 | mutated at: server.py connect handlers :2383-2436; worker.py :80-83; `shells/ade/tracks.py` `_apply_edit()` :1295-1367; `shells/conference/conference.py:107`; `shells/terminal/main.py:22` | ADE `edit_track`/`create_track`/`insert_region` frames (below) |
| ADE track menu payloads | none (wire only) | tracksettings.js modal (2857+ lines) | `frames.py` handlers | same | `create_track`/`insert_region`/`edit_track` frames, frames.py:900/943/1885 |
| preset JSON | `injections/presets/claude/<name>.json` | tracksettings.js PRESETS section (picker + Load/Save/Rename/Delete) | `settings_stack.read_preset_file()` :319 | `write_preset_file()` :374 / `rename_preset_file()` :406 / `delete_preset_file()` :394 | `load_preset`/`save_preset`/`rename_preset`/`delete_preset` frames (frames.py:1961/1983/2007/2016); browse/preview via `/api/settings/browse`,`/api/settings/read` (server.py:1806-1887) |
| policy.json | `SUITE_ROOT/policy.json`, module-global `_table` (`engine/policy.py:130`) | ADE per-edge gate rows in tracksettings.js (track-level OVERLAY, not the global table, :2668-2718); a separate global gate-matrix widget is Phase 2 scope, not read this pass | `policy.resolve()` :174, `all_rows()` :240 | `policy.set_row()` :216 | `/api/policy` GET/POST, server.py:1285-1317; `/api/policy/resolve-hook`, `/api/policy/record-tool-outcome` |
| .sandbox_config.json | `engine/agent_loop.py` `ROOT_CONFIG_PATH` :362-363 | ADE "root" control (tracksettings.js:877-1032), IDE setroot | `load_persisted_root()` :378 | `persist_root()`/`set_and_persist_root()` :387/393 | `setroot` frame, frames.py:1774 |
| rails catalog | `shells/ade/rails.py` `RAILS`/`PROVIDERS`/`MARKERS` (static in-process table) | tracksettings.js provider/loop_class/mechanism cascade (:689-763) | `rails.catalog()` :515 | n/a (code, not data) | sent once at connect as the `rail_catalog` frame (per web_io.py:160 `send_rail_catalog`) |
| .sessions_index.json | `engine/agent_loop.py` `SESSIONS_INDEX_PATH` :363-364 | session load/save pickers (not this phase) | read/write inline in an unread surrounding function, agent_loop.py:2057/2065 | same | n/a this pass |
| machines.json | `engine/ledger.py` (hostname→machine, read once at import, :38/128-138) | none | `_resolve_machine` | n/a (static file) | n/a |
| queue.json | `engine/daemon_queue.py` `QUEUE_PATH` :42 | ADE Queue/Log widget | `Queue._load()` :339 | `Queue._persist()` :351 | daemon_queue functions, not a direct route |
| waypoint.jsonl | `engine/waypoint.py` `WAYPOINT_PATH` :48 | ADE Messenger widget | `Waypoint.replay()`/`display_lines()` | `Waypoint._append_line()` :79 | `wp_feed`/`wp_send`/`wp_read`/`wp_mute` frames |
| log.jsonl | `engine/ledger.py` `LOG_PATH`, redirected per-ADE-session by `_log_path_for()` :74-89 | ADE Ledger widget | `ledger.read_log()`/`snapshot()`/`ade_snapshot()` | `ledger.append()` :468 | `feed`/`ledger_detail` frames |

---

## 5. TRACK SETTINGS, EVERY FIELD

Sources merged: `engine/agent_loop.py` `DEFAULT_SETTINGS` (87-259, ~55 keys), `engine/
settings_stack.py` `PRESET_TABLE` (139-213, 22 keys — the ONE preset vocabulary, replacing
the retired `STACK_PRESET_FIELDS`/`MODEL_PRESET_FIELDS` names — see DISCREPANCIES),
`static/js/ade/tracksettings.js` field table (per subagent read of 458-2973), `static/js/
ade/region.js` `REGION_FIELDS` (62-75), `shells/ade/tracks.py` `Track`/`Region` `__init__`
and `index_entry()` (547-971, per subagent + direct read), `shells/ade/rails.py` `RAILS`
params/unwired lists (129-361).

Legend for "stored on": T=Track object, R=Region object, S=Region.sess.settings (the
settings bag), N=neither (frame-level identity write only).

| field | type | default | UI control / label | frame/file | stored on | runtime read | preset kind | archive |
|---|---|---|---|---|---|---|---|---|
| `name` | str | `''`→'untitled' | text input, tracksettings.js:662-671 | create_track/insert_region/edit_track | T or R (`.name`) | display only | excluded (`PRESET_EXCLUDED`, settings_stack.py:244) | yes, `index_entry()` |
| `provider` | str | first piped rail | select, :689-723 | all three frames | T (default) / R (own) | `rails.py` catalog, `Router._pick` | derived from `model`, never stored in preset (settings_stack.py:236-243) | yes |
| `loop_class` | str | first class for provider | select, locked if 1 option, :739-744 | same | T / R | rails.py | derived, not in preset | yes |
| `mechanism` | str | resolved non-sdk mech | hidden select, :746-752 | same | T / R | rails.py | derived, not in preset | yes |
| `model` | str | first model / current | select, :754-763 | insert_region/edit_track (hidden on addTrack) | S (`sess.settings["model"]`), also `Region.model` | `run_turn`, `_provider_for` | `PRESET_TABLE["model"]`, how=`identity` | yes, as `vessel` (:923) |
| `seat` | str | `''` = bare | select, :864-875 | insert_region/edit_track (hidden on addTrack) | R (`.seat`) / `sess.nick` | `compiler.compile_injections` | `PRESET_TABLE["seat"]`, how=`identity` | yes, `:922` |
| `root` | str | `''` (session root) | hidden input + folder picker, :877-1032 | all three (Track.INHERITABLE) | T.root / R.root / `sess.root` | `read_tool._resolve`, `rt._track_root` | excluded — never a preset field (settings_stack.py:233-234) | yes |
| `overlay_rows` | list | `default_overlay_rows()` | per-edge gate selects + all/custom radio, :2621-2718 | edit_track `fields.overlay` | T.overlay_rows (default) / R.overlay_rows / `sess.policy_overlay` | `policy.resolve(ctx["overlay"])` | `PRESET_TABLE["gates"]`, how=`gates` | yes |
| `gate_wait_s` | int/None | `150` (agent_loop default) / `20` (tracksettings.js UI default — see DISCREPANCIES) | number input, :129 | edit_track generic setting | S | `_resolve_gate`, hook's own timeout | `PRESET_TABLE`, how=`bag`, default `150` | yes, settings-delta |
| `max_tools` | int/None | `None` | number input, :130 | same | S | user-loop tool counter | `bag`, default `None` | yes, delta |
| `request_timeout` | number | `200` (agent_loop) / `30` (tracksettings.js UI default) | number input, :131 | same | S | `Router.chat(timeout=...)` | `bag`, default `200` | yes, delta |
| `num_ctx` | int | `32768` | number input, :134 | same | S | Ollama options | `bag` | yes, delta |
| `think` | bool | `True` | checkbox, :135 | same | S | Ollama/CLI thinking toggle | `bag` | yes, delta |
| `temperature` | number | `0.8` | number (fold), :139 | same | S | Ollama/llamacpp sampling | `bag` | yes, delta |
| `top_k` | int | `40` | number (fold), :140 | same | S | Ollama | `bag` | yes, delta |
| `top_p` | number | `0.9` | number (fold), :141 | same | S | Ollama/llamacpp | `bag` | yes, delta |
| `min_p` | number | `0.0` | number (fold), :142 | same | S | Ollama | `bag` | yes, delta |
| `repeat_penalty` | number | `1.1` | number (fold), :143 | same | S | Ollama | `bag` | yes, delta |
| `repeat_last_n` | int | `64` | number (fold), :144 | same | S | Ollama | `bag` | yes, delta |
| `seed` | int | `0` | number (fold), :145 | same | S | Ollama/llamacpp | `bag` | yes, delta |
| `num_predict` | int | `-1` | number (fold), :146 | same | S | Ollama/llamacpp | `bag` | yes, delta |
| `keep_alive` | number | `30` | number (fold), :147 | same | S | Ollama VRAM warmth | `bag` | yes, delta |
| `mirostat` | int | `0` | number (fold), :148 | same | S | Ollama | `bag` | yes, delta |
| `mirostat_tau` | number | `5.0` | number (fold), :149 | same | S | Ollama | `bag` | yes, delta |
| `mirostat_eta` | number | `0.1` | number (fold), :150 | same | S | Ollama | `bag` | yes, delta |
| `num_gpu` | int/None | `None` | number, nullable, :151 | same | S | Ollama | `bag` | yes, delta |
| `num_thread` | int/None | `None` | number, nullable, :152 | same | S | Ollama | `bag` | yes, delta |
| `claude_gated` | list | `["Bash","Edit","Write"]` | not in tracksettings.js field table — UNKNOWN if exposed in UI | n/a | S | accepted by `ClaudeProvider.chat`, unused (DEAD, see providers.py:721-725) | not in `PRESET_TABLE` | yes, delta (if changed) |
| `claude_mode` | str | `"persistent"` | not found in tracksettings.js field table — UNKNOWN | n/a | S | `Router._pick` | not in `PRESET_TABLE` | yes, delta |
| `claude_effort` | str/None | `None` | select, :156-158 | edit_track | S | `_build_cmd --effort` | `bag`, nullable | yes, delta |
| `claude_partial` | bool | `True` | not in field table — UNKNOWN if exposed | n/a | S | `_build_cmd --include-partial-messages` | not in `PRESET_TABLE` | yes, delta |
| `claude_cache_ttl` | str | `"1h"` | select, :162-164 | edit_track | S | `_cache_env` | `bag` | yes, delta |
| `claude_keep_warm` | bool | `False` | checkbox, :159-161 | edit_track | S | `Router.claude_p` retention | `bag` | yes, delta |
| `claude_exclude_dynamic` | bool | `False` | checkbox, :165-167 | edit_track | S | `_build_cmd --exclude-dynamic-system-prompt-sections` | `bag` | yes, delta |
| `claude_tools` | list | `[]` | composite "toolset" (12-row on/off), :177,1382-1488 | edit_track | S | `_build_cmd --tools`, `_settings_obj` hook registration | `bag` | yes, delta |
| `claude_disallowed_tools` | list | `[]` | same composite, other half, :220 | edit_track | S | `_build_cmd --disallowedTools` | `bag` | yes, delta |
| `claude_hook_ask_blocking` | bool | `True` | checkbox, :178-180 | edit_track | S | `/api/policy/resolve-hook` (server.py:1449) | `bag` | yes, delta |
| `claude_setting_sources` | str/None | `None` | 3 checkboxes (user/project/local), :184-185,1490-1514 | edit_track | S | `_build_cmd --setting-sources` | `layer` (resolve()'d) | yes, delta |
| `claude_system_prompt` | str | `""` | textarea + bypass/load-file, :189-190,1521-1548 | edit_track | S | `_build_cmd --system-prompt` | `layer` | yes, delta |
| `claude_bare` | bool | `False` | checkbox ("Raw Claude"), :193-201 | edit_track | S | `_build_cmd --bare` | `layer` | yes, delta |
| `claude_config_dir` | str | `""` | display + browse/clear/manual, :202-203,1552-1607 | edit_track | S | `_cache_env → CLAUDE_CONFIG_DIR` | `layer` | yes, delta |
| `claude_memory_enabled` | bool | `False` | checkbox, :207-209 | edit_track | S | `_settings_obj` overlay `autoMemoryEnabled` | `bag` (resolve()'d into overlay) | yes, delta |
| `claude_md_excludes` | list | `[]` | checkbox list of CLAUDE.md files, :210-211,1703-1765 | edit_track | S | overlay `claudeMdExcludes` | `layer` | yes, delta |
| `claude_output_style` | str | `""` | select (fetched from CLI), :212-213,1658-1690 | edit_track | S | overlay `outputStyle` | `layer` | yes, delta |
| `claude_add_dirs` | list | `[]` | folder list, :223-224,1611-1651 | edit_track | S | `_build_cmd --add-dir` (repeated) | `bag` | yes, delta |
| `claude_settings_file` | str | `""` | display + browse/clear, :234-235,1789-1942 | edit_track | S | `settings_stack._read_override_file` | `bag` | yes, delta |
| `claude_preset` | str | `""` | select + Load/Save/Rename/Delete, :244-245,1971-2158 | its own frames (`load_preset` etc, not the Save batch) | S | `settings_stack.resolve()` re-reads the named file live every spawn | `PRESET_TABLE["claude_preset"]`, how=`name` | yes, delta |
| `codex_sandbox_mode` | str | `""` | text input (Codex rail only, hidden), :258 | edit_track | S | grayed — Codex not wired | `bag` | yes, delta |
| `codex_approval_policy` | str | `""` | text input (hidden rail), :259 | edit_track | S | grayed | `bag` | yes, delta |
| `allow_agent_reset` | bool | `True` | checkbox, :2465-2478 | edit_track | S | `_ade_resetter` (server.py:703) | `bag` | yes, delta |
| `context_reset_cap_k` | int/None | `300` | numeric input, :2480-2543 | edit_track | S | context-cap watcher (not read this pass) | `bag`, nullable | yes, delta |
| `start_turn_on_reset` | bool | `True` | checkbox, :2546-2556 | edit_track | S | reset-arming logic | `bag` | yes, delta |
| `reset_instruction` | str | default sentence (agent_loop.py:110-111) | textarea + clear/load-file, :2559-2607 | edit_track | S | seeded into the fresh region's first user turn (not traced this pass) | `bag`, default=`_DEFAULT_SENTINEL` (reads live from DEFAULT_SETTINGS) | yes, delta |
| `litert_mode` | str | `"oneshot"` | not in tracksettings.js field table — UNKNOWN if exposed | n/a | S | `Router._pick` | not in `PRESET_TABLE` | yes, delta |
| `worker_transport` | str | `"pipe"` | not in field table — UNKNOWN if exposed (conference/worker concept, not ADE) | n/a | S | `add_agent()` | not in `PRESET_TABLE` | yes, delta |
| `node_id` | str/None | n/a | not a settings field — plan-node binding | insert_region `region.node_id` | R only | `_announce_new_track`, cable derivation | not preset-carried | yes, `:919` |
| `carried` (job/input/output/git/notes/status/stxt) | dict | `{}` | **only 3 of 7 have current UI**: `notes`/`status`/`stxt` render via `REGION_FIELDS` (region.js:70-74); `job`/`input`/`output`/`git` have NO current UI (cut 2026-08-10 per region.js:54-59) but are still carried verbatim by the backend (`CARRIED_FIELDS`, tracks.py:527) if present on a wire payload | insert_region `region={...}` | R.carried | never interpreted (BINDING-SPEC §8) | not preset-carried | yes, flattened `:928` |
| `agent` (REGION_FIELDS) | str | `''` | textarea, region.js:63 | insert_region `region.agent` (frames.py:721) | UNKNOWN — not in `CARRIED_FIELDS`; likely mapped to `seat` at insert time, not independently confirmed this pass | — | not preset-carried | UNKNOWN |
| `wt` (REGION_FIELDS) | str | `''` | text input, region.js:67-69 | insert_region, aliased to `root` at frames.py:720 | same field as `root` above — **two names, one field**: `wt` is the region.js/canvas label, `root` is the backend attribute | — | excluded (root) | yes (as `root`) |
| `track` (REGION_FIELDS) | str | `''` | text input, region.js:64-66 | top-level frame key `track` (which Track container), NOT `Region.track` set via this field — **name collision**: REGION_FIELDS' `track` is a manual-entry convenience for naming/matching a track by name; `Region.track` (the actual container id) is set separately at `insert_region` time from the resolved `track_id` | — | — | — | — |
| `x`, `y`, `notches` | number/number/list | canvas position | canvas-only (arrange.js) | insert_region via `ade_plan` (Phase 3/4 scope) | not on Region at all — canvas-only, explicitly excluded from `REGION_FIELDS` (region.js:20-24) | n/a | n/a | plan JSON, not Region |
| `id` | str | minted by caller | none — never typed | all three | R.id / T.id | everything | excluded | yes |

Fields explicitly present in `PRESET_TABLE` (settings_stack.py:139-213) not separately
re-verified in the tracksettings.js field scan above (UNKNOWN if visible in the current
build of the modal, given "grayed until wired" states for the SDK/Codex rails):
`claude_hook_ask_blocking`, `codex_sandbox_mode`, `codex_approval_policy` ARE present per the
subagent's field table; every other `PRESET_TABLE` key is accounted for in the table above.

---

## 6. THE PRESET JSON FILES

Directory: `injections/presets/claude/` (one kind only — `settings_stack._preset_dir()`,
:278-284, `assert kind in ("claude",)`). Files present (`find injections/presets -type f`):
- `Agent Opus.json` — keys: `model, claude_md_excludes, claude_tools, gates, name`.
- `Agent Sonnet.json` — keys: `model, claude_tools, gates, name`.
- `Music History Sonnet.json` — keys: `model, claude_md_excludes, claude_tools, gates, name`.
- `User Fable.json` — keys: `model, claude_tools, name`.
- `test sonnet.json` — keys: `model, claude_system_prompt, claude_output_style,
  claude_md_excludes, claude_tools, name`.
- `.DS_Store` — non-JSON, macOS metadata, not a preset.

Code that lists/reads/writes/renames/deletes: all in `engine/settings_stack.py` —
`list_presets()` :308, `read_preset_file()` :319, `write_preset_file()` :374,
`delete_preset_file()` :394, `rename_preset_file()` :406. Call sites outside that module:
`shells/ade/frames.py` — `_do_load_preset()` :459 (reads, called from `load_preset` frame
:1961, and from `_apply_spawn_presets()` :544 on `create_track`/`insert_region` when the
frame names a `presets` value), `_capture_preset_fields()` :569 / `_do_save_preset()` :659
(reads then writes, called from `save_preset` frame :1983), `rename_preset`/`delete_preset`
frames (:2007/:2016) call the rename/delete functions directly. `server.py` —
`/api/settings/browse?presets=claude` (1806-1823, listing) and `/api/settings/read?
preset_kind=claude&preset_name=...` (1840-1862, preview) — both read-only.

Load semantics (per settings_stack.py:502-512 and frames.py `_do_load_preset`, :459-541):
**mixed, not a single mechanism.** For the six `how="layer"` fields (`claude_config_dir,
claude_setting_sources, claude_system_prompt, claude_output_style, claude_md_excludes,
claude_bare`) plus the preset name itself (`claude_preset`, `how="name"`): Load CLEARS the
track's own field to the engine default and instead sets `claude_preset = <name>` — every
future `settings_stack.resolve()` call (i.e. every spawn) re-reads the named file straight
off disk (:527-528), a LIVE LINK. For every `how="bag"`/`how="identity"` field (tools,
sampling params, model, seat, etc.): Load COPIES the file's values onto the track's settings
bag once (frames.py:513-517) — a later hand-edit of the preset file does not reach an
already-loaded track for these fields.

Live in-memory home of a running track's settings: `Region.sess.settings` (a plain dict,
`engine/agent_loop.py:463`, `dict(DEFAULT_SETTINGS)`), read fresh at the top of every
`run_turn()` call (agent_loop.py:838) and passed straight into `Router.chat(**kwargs)`.
Whether `settings_stack.resolve()` re-runs every turn depends on the Claude provider class:
`ClaudeProvider.chat()` (oneshot) calls it unconditionally every call (providers.py:1061,
since it respawns every turn anyway); `ClaudePersistentProvider.chat()` only calls it inside
`_spawn_and_prime()` (1660), i.e. only on a respawn — a warm process that "continues" the
same transcript does **not** re-resolve, so hand-editing a currently-loaded preset file
on disk while the process stays warm has no live effect until the next respawn.

---

## 7. CONTEXT, EVERY TEXT THAT REACHES A MODEL

Order of assembly, `engine/compiler.py:compile_injections()` (363-451; line numbers verified
current this pass):

**System message** (compiler.py:369-434):
1. L1 `injections/preamble.md` (369-371) — data file.
2. L1.5 LEGEND block (`_legend_block`, def at compiler.py:151) — hardcoded Python f-string,
   "who's speaking: crew tags + vessel" (374).
3. L2 model blurb `injections/models/<tag>.md` (376-385) where `tag` derives from the model
   name; falls back to a one-line hardcoded string if no blurb file exists (384-385).
4. `## Your capabilities` + `rt.TEXT_WORKER_HINT` (engine/read_tool.py, the same `_BASE_HINT`
   documented in §2 above) + a workspace-root note (386-390).
5. SELF ROW (ADE only, region present) — hardcoded, def at compiler.py:284 (296-303 body).
6. PEER ROSTER (ADE only, via `set_peers_provider`) — hardcoded, inside `compile_injections`
   at compiler.py:392 (body ~306-360 per the prior mapdoc; PEER ROSTER's own marker comment
   is now at :392, drifted from the mapdoc's :306-360 citation — see DISCREPANCIES).
7. L3 `agent/<folder>/persona.md`, `usermemory.md`, `agentmemory.md` (413-434) — data files,
   outside this phase's file list.

**Context message** (compiler.py:441-448):
1. L4 `injections/shells/<shell>.md` (441-443) — data file; shell name is the ADE's own
   `shell="ade"` (set at `al.reseat(self.sess, shell="ade")`, tracks.py:752).
2. Every `injections/skills/*.md` whose `**Applies:**` line matches `(shell, nick)`
   (246-259) — fails OPEN (injects) on a missing/unparseable Applies line (214-243).
3. L5 the task text, built by the caller (447-448).

**Second, independent channel** (not through `compile_injections` at all): a stack preset's
`claude_system_prompt` field reaches the CLI via `--system-prompt` (providers.py:892-893,
resolved by `settings_stack.resolve()`, :568-573) — e.g. `injections/presets/claude/
test sonnet.json`'s `claude_system_prompt` key. `--append-system-prompt` (from
`compile_injections` above) and `--system-prompt` (full replace, from a preset/track field)
are both real flags, additive, never a substitute for one another (providers.py:837-842).

**NATIVE_TOOLS descriptions** — every function-calling tool's `description` field is text
sent to a native-tool model as part of its tool schema (`engine/read_tool.py:1258-1319+`
for read_file/list_files/write_file/run_command/view_image/screen_capture; the file
continues past line 1350 for `fetch_url, remember, recall, send_message, request_messages,
logic_*, web_*, initiate` — not individually re-quoted here, all inside `NATIVE_TOOLS`).

**PreToolUse deny-reason string** (reaches the model as a Claude tool-result, not a system
message): `hooks/ade_pretooluse_hook.py:208-210`, `"[{decision}: {tool_name} refused or
parked by ADE policy — do not retry, a human will release it if parked]"`.

**Channel edge failure strings** — reach the model as tool-result text on a failed/refused
channel call: `channels/logicpro.py` and `channels/webbrowser.py` (exact line numbers not
re-verified this pass; cited by lane5 as logicpro.py:122,140,147 and webbrowser.py:230,233,237).

**TEXT protocol hint** — `_BASE_HINT`/`TEXT_SYSTEM_HINT`/`TEXT_WORKER_HINT` (read_tool.py:
1012-1103, quoted in full in §2 above) — the entire READ/WRITE/RUN/SEND/REQUEST/REMEMBER/
RECALL/VIEW_IMAGE/SCREEN_CAPTURE/FETCH/LOGIC_*/WEB_*/INITIATE/RESET_SELF/RESET_REGION marker
vocabulary, sent verbatim to every text-protocol model.

**`system_message()` hardcoded branches** (agent_loop.py:702-714): the native-tool-calling
branch's own hardcoded string, first words "You can read, list, and write project files and
run shell" (710-711); the TEXT/Claude/llamacpp branch instead prepends `rt.TEXT_SYSTEM_HINT`.
Both branches append a `root_note` (703-705): `"Your workspace root is: {rt.WORKSPACE_ROOT}..."`.

**`_worker_system_message()`** (761-767) — single branch, always `rt.TEXT_WORKER_HINT` +
the same `root_note` pattern, for spawned conference-room seats (`add_agent`, 1614).

---

## 8. REGION STATE AND RESET

Full `Region` attribute inventory (per subagent read of `shells/ade/tracks.py:645-783`,
cross-checked directly against `Region.__init__` and `index_entry()`):

| attribute | set at | in-memory only / persisted |
|---|---|---|
| `id, track, node_id, name, seat, root, carried, provider, loop_class, mechanism, overlay_rows, created, lifecycle, _turn_ordinal` | `__init__` :649-783 | persisted — all appear in `index_entry()` :916-971 |
| `model` | :651 | persisted as `"vessel"` :923 |
| `hub` (TrackHub) | :655 | in-memory only |
| `muted` | :669 | in-memory only (`set_muted()`, :2375 per subagent) |
| `sess` (al.Session) and its sub-fields `region, track, turn, region_name, stop_key_watch, stop_label, policy_overlay, nick` | :691-732 | in-memory (custody stamps for the ledger; not separately archived) |
| `sess.settings` | :692 | persisted as a DELTA dict under `"settings"` in `index_entry()` :968-970 (only keys that differ from `DEFAULT_SETTINGS`) |
| `sess.messages` (the transcript) | :740 | persisted, but via `flush()`/`<region-id>.jsonl` append (:973-995), NOT via `index_entry()` |
| `inbox, outbox, _inbox_lock` | :755-759 | in-memory only |
| `_pumping, _killed, _reset_armed` | :760-765 | in-memory only (halt/lifecycle flags) |
| `_shell, _shell_lock` | :774-775 | in-memory only (PTY handle) |
| `_flushed, _flush_lock` | :782-783 | in-memory only (append-index bookkeeping) |

Claude subprocess/cache state is held OUTSIDE the `Region` object entirely, in
`al.router.claude_p`, keyed by `(region.id, region.model)` — see §1's Claude sections;
`index_entry()` reads it read-only at save time (`al.router.claude_session_id(...)`, :944-945).

**`reseat()`** — not defined in tracks.py; lives in `engine/agent_loop.py:717-758`, called
from tracks.py at `Region.__init__` (:752), and from `_apply_edit()`'s root/seat branches
(:1377, :1393), always with `shell="ade"`. Order: (1) strip any prior `_seat_context`-tagged
message (:741 in agent_loop.py — offset per subagent citation matches direct read); (2) read
`region`/`region_name` off the session; (3) if `sess.nick` is set, call
`compiler.compile_injections()` and replace `messages[0]`, inserting a tagged context message
if non-empty; else build `system_message(sess)` + `compiler.self_block()` and replace
`messages[0]`.

**`kill_region(region_id)`** — `shells/ade/tracks.py:2476-2543`. Order: get region (2489);
under `_inbox_lock`, set `_killed=True` and clear `inbox` (2492-2494, "skips and drops the
inbox" — a queued write neither delays nor survives the kill); `hub.stop_requested.set()`
(2495); `hub.resolve_gate(None, "n")` to wake a pump parked on a live gate (2502);
`region.kill()` (2503, stamps a `"killed"` lifecycle event, closes the PTY via `SIGKILL`);
`al.router.claude_close_track(region_id)` if a router exists (2509-2510); `autosave()` (2511);
`remove_region(region_id)` (2513, drops it from the live registry and its Track's region
list — the Track itself is untouched); append the removed row to `_graveyard` (2514-2516);
`waypoint.dead_letter_all(region_id)` (2517, dead-letters any mail still waiting for it);
notify each sender of undelivered mail (2528-2542, swallows its own failures). The transcript
file on disk is NOT deleted — only the live cache/registry entry is cleared.

**`reset_region(region_id)`** (arms only — `tracks.py:2797-2876`) — "a kill followed by an
insert" (comment, :2554), performed asynchronously by `_reset_watch()` (:2879) once the
region's pump reaches a boundary. `_reset_to_scratch()` (:3555-3623, shared by `new_session()`
:3626 and `end_session()`) — order: `autosave()` (3589); for every live region, set `_killed`,
clear inbox, set stop flag, deny any live gate, `close_shell()` — deliberately NOT `kill()`,
so no `"killed"` lifecycle stamp is written (a saved→ended→reloaded session must not have its
regions graveyarded, 3567-3570); `dq.terminate_session()` per region (3608); clear
`_regions`/`_tracks`/`_graveyard` (3611-3615); reset `_session` to unsaved scratch (3619-3620);
`_point_stores_at(None)` (3621); `_move_floor(_now_ms())` (3622).

**`reload_session(sid)`** — `tracks.py:3409-3487`. Order: load `master.json`, refuse a
template (3435-3438); `_halt_live_world()` (3439, same halt-without-kill pattern as above,
plus `close_shell()`); restore the saved global root BEFORE the roster if it differs
(3456-3458); build the whole new world off-lock via `_world_from_master()` (3459, which
calls `_hydrate_region()` per region when `hydrate_dir` is not None); atomically swap
`_regions`/`_tracks`/`_graveyard` (3460-3466); restore `_session` metadata including `plan`
(3471-3473); `_point_stores_at(master["id"])` (3484, AFTER the swap and the halt); `_move_floor(0)`.

**`_hydrate_region(track, sdir)`** — `tracks.py:3243-3282`. Reads `<region-id>.jsonl` line by
line into a list, tags any message missing `_turn` with `_turn=0` (a pre-tagging-era
sentinel), sets `track.sess.messages = msgs` VERBATIM — deliberately does not call
`reseat()` (a reload restores the region's own prior root/seat, unlike a scratch `/load`
which may land under a different one); sets `_flushed` to the current line count so `flush()`
won't re-append; turns `autosave` on and sets `save_name = track.id`.

**`_reset_to_scratch`** — see above, shared by `new_session`/`end_session`.

---

## 9. KILL/DEATH LANGUAGE

Grep scope: `engine/`, `shells/`, `static/js/`, `server.py`, `hooks/` for
`kill|killed|dead|death|graveyard|killswitch|die|murder|reap` (case-insensitive, substring).
"death"/"murder" produced zero real hits anywhere. False-positive substrings excluded from
the tables below: `skill(s)` (contains "kill"), `deadlock(s)`/`deadline` (unrelated to death),
`bodies` (contains "die"), `reapplied`/`reapplication` (contains "reap"). Raw hit counts by
file (before filtering false positives): `shells/ade/tracks.py` 151, `server.py` 111,
`engine/providers.py` 56, `shells/ade/frames.py` 51, `engine/agent_loop.py` 44,
`static/js/control.js` 40, `engine/waypoint.py` 40, `static/js/ade/timeline.js` 38, plus
smaller counts across ~30 more files (gate matrix, killswitch.js, ledger views, etc. —
static/js/panes and static/js/ade widgets are Phase 2/3 scope, not individually re-verified
here beyond the count).

**Real mechanisms** (state-changing code, not prose):

| identifier | file:line | what it does |
|---|---|---|
| `Track._killed`, `Track._reset_armed` | tracks.py:762,765 | halt-signal flags on `Region` (naming note: these live on `Region`, not `Track` — see §8) |
| `kill_region()` | tracks.py:2476 | out-of-band region teardown, drops inbox, closes shell, closes Claude subprocess, graveyards the row — full detail in §8 |
| `Region.kill()` | tracks.py:1679 | stamps a `"killed"` lifecycle event, calls `close_shell()` |
| `_graveyard`, `graveyard_rows()` | tracks.py:1701, 2388 | module-level list of killed regions' final index rows; read-only accessor |
| `_halt_live_world()`, `_reset_to_scratch()` | tracks.py:3285, 3555 | halt every live region WITHOUT stamping `"killed"` (uses `close_shell()`, not `kill()`) so a reload/new-session doesn't wrongly graveyard rows |
| `waypoint.dead_letter_all()` | waypoint.py:257 (instance), :489 (module wrapper) | dead-letters every message still waiting for a track the kill hook just reported dead |
| `read_tool.py` `why = "that track has been killed"` | read_tool.py:662 | the exact string surfaced to the model when a message's target track is dead |
| `RUN_TIMEOUT`/`SCREEN_TIMEOUT`, `proc.kill()` | read_tool.py:70,79,520,525 | OS-process kill for a hung `run_command`/`screen_capture` |
| `ClaudePersistentProvider._kill_process()` | providers.py:2074 | kills just the OS subprocess, keeps session bookkeeping (so a respawn can `--resume`) |
| `ClaudePersistentProvider.shutdown()` | providers.py:2103 | kills the subprocess AND ends the session bookkeeping |
| `Router.claude_close_track()` | providers.py:2545 | kills every warm Claude subprocess for a track ("kill on track close") |
| `Router.claude_interrupt_track()` | providers.py:2562 | the non-killing twin — interrupts every warm subprocess, keeps all of them alive |
| `daemon_queue`'s `"killed"` vs `"timeout"` outcome | daemon_queue.py:865-905 | a ledger OUTCOME LABEL for a gate whose blocked answer-waiter thread was torn down with its session — not a process kill |
| `ledger._deny_orphan()` | ledger.py:1195 | denies a record whose queue waiter "died" (session torn down) |
| `agent_loop.py` `/killswitch` command | agent_loop.py:2588-2663 | the ONLY literal panic-button code: `pkill -f "ollama runner"` (2634), llama.cpp stop (2644), `pkill -f "ollama serve"`/`pkill -x ollama` on `hosts`/`suite` scope (2651-2653) — reads `global.json`'s `killswitch.scope` |
| `server.py` `api_kill_hosts()` | server.py:1121 | server-side kill-hosts endpoint (body not re-read this pass) |
| `server.py` `_pkill()` | server.py:1074 | shared pkill helper |
| `KILL_ROW_KEYS`, `KILLSWITCH_SCOPES` | server.py:896, 903 | validation vocab for `global.json`'s `kill_holds`/`killswitch` sub-objects |
| `frames.py` `killswitch` frame | frames.py:1184 | calls `tracks.stop_all_regions()` — per its own comment (1191-1200), this is NOT a process/model kill any more; the real killswitch is `/api/end-all` |
| `claude_sdk.py` `"KillShell": "run_command"` | claude_sdk.py:186 | maps Claude's native `KillShell` tool name onto the `run_command` policy edge — a tool NAME, not a mechanism this codebase runs |

`engine/policy.py`, `engine/compiler.py`, `engine/worker.py`, `engine/channel_registry.py`:
zero real hits (confirmed by direct/subagent re-grep).

Per subagent, `server.py` and `static/js/control.js` additionally carry an escalating "kill
ladder" (Phase 2 territory, out of this map's file list, noted for completeness): row 1
`/api/end-all-turns` kills nothing (every agent stops mid-turn); `/api/kill-hosts`
(server.py:1120) kills the Ollama daemon; a further row kills every region, its Claude
process, and the weights; a final row kills everything then the harness itself
(server.py:1132, "REAPS FIRST, THEN EXITS"). `shells/ade/tracks.py:kill_region()` itself
"kills nothing" at the OS-process level (tracks.py:2441/2460 per subagent) — the actual
Claude subprocess kill is `providers.Router.claude_close_track()` (providers.py:2552),
called FROM `kill_region` (tracks.py:2509-2510).

---

## 10. CODE COMMENTS BEYOND LABEL/FUNCTION/STATE

Exhaustive "Brandon"/"SCOPE-"/"decided-by"/dated-comment-block enumeration (first line only,
file:line) for `engine/agent_loop.py`, `engine/providers.py`, `engine/read_tool.py` (per
subagent scan), plus the samples independently read directly this pass:

`engine/agent_loop.py`: :28,91,123,141,186,191,209,222,226,230,238,244,256,355,655,796,902,
916,922,936,970,1006,1086,1223,1267,1291,1323,1420,1439,1452,1492,1682,1718,1751,1840,1927,
2096,2126,2155,2261,2266,2298,2330,2346,2489,2547,2574,2589,2790 — representative: `:230`
"claude_hook_ask_blocking ... decided-by Brandon 2026-08-14"; `:1718` "HERE AND NOT AT TURN
START (decided-by Brandon 2026-08-24 ...)"; `:2096` "START THE NEXT NODE (SCOPE-initiate,
decided-by Brandon 2026-08-08 ...)"; `:2589` "Panic button. Scope model per
CONTROL-CENTER.md §1b (2026-07-13 PM ...)".

`engine/providers.py`: :82,317,509,592,617,629,673,686,696,712,745,750,812,823,856,883,903,
909,924,951,994,1027,1057,1143,1335,1347,1381,1403,1425,1448,1482,1570,1584,1592,1639,1652,
1657,1703,1869,1940,1976,2075,2153,2315,2487,2505,2507,2524,2544,2552,2562,2637,2675 —
representative: `:750` "THINKING DISPLAY (Brandon, 2026-08-19) ..."; `:951` `_settings_obj`'s
hook-registration contract; `:2552` "BLOCK D's 'kill on track close' reaping rule"; `:296-330`
Claude CLI pricing table, sourced verbatim from Ledger's own HTML, dated; `:721-748`
`claude_gated`/`claude_cache_ttl` docstring, "Brandon decides what (if anything) it should
gate instead" / "do not delete as dead code".

`engine/read_tool.py`: :213,646,749,764,840,966,1001 — `:646` "DEAD-LETTER REPORT
(decided-by Brandon 2026-07-20)"; `:840` "THE RESET (SCOPE-region-reset, decided-by Brandon
2026-08-21)"; `:1001` "CARRY/PIN (2026-07-08 reformat, was SUMMARY) ...".

`engine/settings_stack.py`: `:10-20` "PRESET FILE KEY NAMES — Brandon, 2026-08-17,
overruling SCOPE-stack-presets §3's prose"; `:85-100` "THE ONE TABLE (SPEC-preset-one-table,
decided-by Brandon 2026-08-25)"; `:230-244` "NEVER TOUCHED BY A PRESET ... Brandon's ruling,
2026-08-25".

`engine/policy.py`: `:61-67` "v2 default rows (2026-07-09, decided-by: Brandon)".

Full enumeration for `shells/ade/tracks.py` and `shells/ade/frames.py`, and for
`static/js/ade/tracksettings.js`/`region.js`, is in this map's §§8-9 citations above and in
the receipt (gathered via subagent + direct read, cross-checked).

---

## 11. DISCREPANCIES vs MAPDOCS

- **File sizes have all grown** since the v2-sweep mapdocs (dated 2026-08-19/20):
  `shells/ade/tracks.py` 2928→3665 lines; `shells/ade/frames.py` 1619→2025; `shells/ade/
  web_io.py` 400→461; `static/js/ade/tracksettings.js` 2857→2975; `static/js/ade/region.js`
  117→116. `shells/ade/rails.py` is unchanged at 562. Every specific line-number citation in
  the source mapdocs was re-verified against current code in this map rather than trusted.
- **`engine/providers.py` grew 2705 lines total** (from an unstated prior size); most class
  line numbers drifted: `GeminiProvider` still 177 (stable), `ClaudeProvider` 710→711,
  `ClaudePersistentProvider` 1280→1322, `LiteRTProvider` 2038→2121, `LlamaCppProvider`
  2173→2314, `Router` 2391→2474.
- **Preset system fully restructured** since the lane5 mapdoc (which described a
  `stack`/`model` two-kind split under `injections/presets/stack/` and
  `injections/presets/model/`): `SPEC-claude-preset-merge` (2026-08-22) and
  `SPEC-preset-one-table` (2026-08-25) collapsed this into ONE kind, `"claude"`, one
  `PRESET_TABLE` (22 keys), one directory `injections/presets/claude/`. The names
  `STACK_PRESET_FIELDS` and `MODEL_PRESET_FIELDS` (cited by lane2 as things
  `engine/settings_stack.py` exports, used by `shells/ade/frames.py:368-510,1558-1616`) **do
  not exist in current code** — confirmed by repo-wide grep, zero hits outside historical
  comments. `frames.py`'s preset call sites have also moved (now 459-707, 1961-2021, not
  368-510/1558-1616).
- **`policy.json` on disk is missing two rows** that `engine/policy.py:_default_rows()`
  (61-89) defines: `send_message` and `request_messages`. The live file (read directly)
  has 17 rows; the code's defaults list 20. Not reconciled this pass — a fact, not a judgment.
- **`engine/codex_provider.py`'s own docstring is stale** (lines 7-9, "intentionally NOT
  wired into Router yet") — `Router` wires it live at four points (2485, 2589-2590,
  2632-2634, 2679-2681). Same mismatch lane1 already flagged; still true.
- **`engine/ledger.py` line citations drifted**: `custody()` 154→194, `action_record()`
  340→347, `append()` 466→468, `snapshot()` 826→870, `ade_snapshot()` 967→1010.
  `turn_record()` is unchanged at 417.
- **`server.py` settings/policy/global route lines drifted** from lane2's citations
  (:986-1017 for policy, :1505-1560 for settings): current routes are `/api/global`
  1197-1278, `/api/policy` 1285-1317, `/api/policy/resolve-hook` 1371, `/api/policy/
  record-tool-outcome` 1494, `/api/settings/browse` 1806, `/api/settings/read` 1840,
  `/api/settings/resolved` 1889.
- **`engine/compiler.py`'s PEER ROSTER marker comment drifted** to compiler.py:392 (inside
  `compile_injections`, which itself still starts at 363, matching lane5); the prior mapdoc's
  "306-360/332-347" citation for PEER ROSTER no longer overlaps the right function body.
- **`engine/read_tool.py`'s `NATIVE_TOOLS`/`_BASE_HINT` line citations drifted**: lane1 cited
  905-968/1098 for the text hint and did not cite `NATIVE_TOOLS`'s own start line; current
  code has `_BASE_HINT` at 1012-1094, `TEXT_SYSTEM_HINT`/`TEXT_WORKER_HINT` at 1096/1103,
  `NATIVE_TOOLS` starting at 1258.
- **`engine/agent_loop.py`'s core-function line citations drifted slightly** from lane1:
  `Session` 462→449, `log_event` 538→525, `_resolve_gate` 1093→1084, `execute_tool`
  1628→1666, `_execute_tool` 1676→1750, `run_turn` 859→836.
- **lane1's claim that `engine/claude_sdk.py` "owns the `can_use_tool` permission callback"**
  is accurate in substance but the callback itself is not a bare module-level function — it
  is built by a factory, `make_can_use_tool()` (claude_sdk.py:269), which returns the actual
  `async def can_use_tool` closure (283). Worth stating precisely since a reader searching
  for `def can_use_tool` at module level would not find one.

---

## 12. UNKNOWNS

- Whether `agent` (region.js `REGION_FIELDS`) actually lands anywhere on the persisted
  `Region.carried` dict, or is silently dropped, was not traced past `frames.py:721`
  (`region.agent` is read but its destination was not confirmed against `CARRIED_FIELDS`,
  which does not list `"agent"`).
- Whether `claude_gated`, `claude_mode`, `claude_partial`, `litert_mode`, `worker_transport`
  are exposed anywhere in the current `tracksettings.js` UI, or are settings-bag-only fields
  with no track-menu control, was not confirmed — the field-inventory subagent's table did
  not include them and no further UI grep was run for them specifically.
- `ledger.custody()`'s exact field list and `_open_rail_c_tool_record()`'s body (server.py,
  referenced at :1428/:1479 but not read) were not traced this pass.
- Whether Gemini's `chat()` generator responds to `GeneratorExit` (an abort) the way every
  other provider does was not found in the code — no handler is present in `GeminiProvider`,
  which may mean an abort during a Gemini turn does not cleanly cancel the remote request.
  Not verified live.
- `server.py`'s full route list beyond settings/policy/global (e.g. `/api/fs/browse`, ADE
  websocket routes) is Phase 3 territory and was not enumerated here beyond what this map's
  assignment explicitly named.
- The exact destination of `tracksettings.js`'s `gate_wait_s`/`request_timeout` UI DEFAULTS
  (`20`/`30`) vs `agent_loop.DEFAULT_SETTINGS`' engine defaults (`150`/`200`) — whether the
  UI shows its own placeholder default before a track exists, or whether these numbers
  reflect an actual, different resolved default somewhere — was not reconciled; both are
  reported as-cited in §5 and flagged, not resolved.
