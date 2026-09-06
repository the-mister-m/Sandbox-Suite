# LIBRARY MAP — stored, reusable things

Written by Goto (Sonnet), Library. Date 2026-09-05.
Files touched: engine/compiler.py, engine/settings_stack.py, engine/providers.py,
engine/ollama_provider.py, engine/codex_provider.py, engine/channel_registry.py,
engine/claude_sdk.py, engine/agent_loop.py (sessions), engine/ledger.py,
engine/daemon_queue.py, engine/waypoint.py, shells/ade/tracks.py,
shells/ade/frames.py, shells/conference/persistence.py, shells/ide/frames.py,
hooks/ade_pretooluse_hook.py, channels/logicpro.py, channels/webbrowser.py,
server.py, injections/ (all), agent/ (all), policy.json, machines.json.

Code wins over the 2026-08-20 v2-sweep mapdocs. Every discrepancy found is in
section 9.

---

## 1. CONTEXT FILES MECHANISM

`engine/compiler.py` builds two strings per seat: system message + context
message, by reading files off disk in a fixed order — `compile_injections()`,
`engine/compiler.py:363-451`.

**Folders/files read, in order:**

| Layer | Source | Code |
|---|---|---|
| L1 preamble | `injections/preamble.md` | `compiler.py:369-371` |
| L1.5 legend | code-generated, not a file | `compiler.py:150-169,374` |
| L2 model blurb | `injections/models/<tag>.md`, `tag = model.replace(':','-').replace('/','-')`; fallback one-liner if no file | `compiler.py:202-204,376-385` |
| capabilities note | `rt.TEXT_WORKER_HINT` + workspace root | `compiler.py:386-390` |
| SELF ROW (ADE only) | code-generated | `compiler.py:283-303,401-403` |
| PEER ROSTER (ADE only) | code-generated, via `set_peers_provider` | `compiler.py:306-360,405-411` |
| L3 persona/memory | `agent/<folder>/persona.md`, `usermemory.md`, `agentmemory.md` | `compiler.py:413-434` |
| L4 shell | `injections/shells/<shell>.md` | `compiler.py:441-443` |
| L4 skills | `injections/skills/*.md` (skip `_`-prefixed) | `compiler.py:246-259,444` |
| L5 task | caller-supplied string | `compiler.py:447-448` |

**Model blurb tag derivation** (`compiler.py:202-204`): `tag =
re.sub(r"[:/]", "-", model or "")`, then reads
`injections/models/<tag>.md`. No blurb file -> inline fallback string
`compiler.py:384-385`.

**Applies matcher** (`_applies`, `compiler.py:230-243`): parses a skill's
`**Applies:** <seat-clause>, <shell-clause>` line via `_APPLIES` regex
(`compiler.py:74`). Seat clause: `"every seat"` (all), `"every seat with an
agent folder"` (has_folder only), or `/`-joined nick names
(`_seat_matches`, `compiler.py:214-220`). Shell clause: `"all shells"` or
`/`-joined shell names (`_shell_matches`, `compiler.py:223-227`).
**FAILS OPEN**: missing Applies line, unparseable, or not exactly two
comma-separated non-empty clauses all inject unconditionally
(`compiler.py:235-241`) — "a parse bug must never silently strip a seat's
constraints."

**roster_entries()/resolve_agent()** (`compiler.py:138-142,190-199`): both
do a case-insensitive scan of `load_roster()` (reads `agent/roster.json`,
`compiler.py:182-187`). `resolve_agent(nick)` returns
`agent/<entry['folder']>` only if that directory exists on disk, else
`None` (red shirt). `roster_entries()` returns `[{'nick','tag'}]` for every
roster.json key, tag falling back to `_derive_tag` (first alnum char
uppercased + "0", `compiler.py:114-123`) when the entry has no `tag` field.

**set_peers_provider()** (`compiler.py:272-280`): registers a
module-global callable `fn() -> [{'id','name','seat'}]`. Registered once
by `server.py:727` — `compiler.set_peers_provider(ade_tracks._live_peers)`.
Unregistered, or `fn()` returning `[]`/raising, injects no peer block
(`compiler.py:405-411`).

**Files currently on disk:**

`injections/`:
| File | Size | First line |
|---|---|---|
| `injections/preamble.md` | 729 B | `<!-- Layer 1 — crew orientation. Drafted by Claude 2026-07-06 from Brandon's` |
| `injections/models/gemma4-31b-mxfp8.md` | 224 B | `One of the strengest reasoners available, leaning more towards communication, prose, and making connections/synthesis. ...` |
| `injections/models/ornith-35b-q8_0.md` | 107 B | `Can get confused, but produced excellent results. Friendly and artistic, very quick but can only run solo` |
| `injections/models/gemma4-12b-mxfp8` (no `.md`) | 162 B | `On the slower side, but runs light weight. Can see and hear (and should eventually do both)...` |
| `injections/shells/ade.md` | 2186 B | `<!-- Layer 4 — the ADE shell. Created 2026-08-18 (decided-by Brandon): until` |
| `injections/shells/conference.md` | 314 B | `<!-- Layer 4 — the conference room shell. -->` |
| `injections/shells/ide.md` | 476 B | `<!-- Layer 4 — the IDE shell. -->` |
| `injections/skills/_TEMPLATE.md` | 1219 B | `<!-- The skill template (2026-07-06). A skill is written instruction a model` |
| `injections/skills/logic-pro.md` | 940 B | `# Skill: logic-pro` |
| `injections/skills/remember-by-hand.md` | 709 B | `# Skill: remember-by-hand` |
| `injections/skills/remember.md` | 653 B | `# Skill: remember` |
| `injections/skills/room-messaging.md` | 2078 B | `# Skill: room-messaging` |
| `injections/skills/screen.md` | 2557 B | `# Skill: screen` |
| `injections/skills/web-browsing.md` | 863 B | `# Skill: web-browsing` |
| `injections/presets/claude/Agent Opus.json` | 605 B | `{` |
| `injections/presets/claude/Agent Sonnet.json` | 375 B | `{` |
| `injections/presets/claude/Music History Sonnet.json` | 617 B | `{` |
| `injections/presets/claude/User Fable.json` | 251 B | `{` |
| `injections/presets/claude/test sonnet.json` | 620 B | `{` |
| `injections/.DS_Store` | Finder metadata | n/a |
| `injections/presets/.DS_Store` | Finder metadata | n/a |

`agent/`:
| File | Size | First line |
|---|---|---|
| `agent/roster.json` | small | `{` (contains `Scotty`->`scotty`/`S1`, `Ford`->`ford`/`F1` only) |
| `agent/ford/persona.md`, `agent/ford/usermemory.md`, `agent/ford/agentmemory.md` | — | not read this pass (widget scope; content out of Library's assignment) |
| `agent/ford/memories/2026-07-06.md`, `2026-07-09.md`, `canon.md`, `initialmemory.md` | — | date-bucketed store, `engine/compiler.py:41-44` shape |
| `agent/scotty/persona.md`, `agent/scotty/usermemory.md`, `agent/scotty/agentmemory.md` | — | not read this pass |
| `agent/scotty/memories/2026-07-06.md`, `2026-07-08.md`, `2026-07-08-sabrent-4-bay-dock-recommendation.md`, `canon.md`, `initialmemory.md` | — | date-bucketed store |
| `agent/.DS_Store`, `agent/ford/.DS_Store`, `agent/scotty/.DS_Store` | Finder metadata | n/a |

**UI/route exposure today**: only the roster (`roster_entries()`) reaches a
UI, via the `crew_list` frame — `shells/ide/frames.py:311`,
`server.py:2325`, `server.py:2440`, `server.py:2591` all call
`webio.send_crew_list(compiler.roster_entries(), <nick>)`; the frame is
sent by `IdeSenders.send_crew_list` (`shells/ide/web_io.py:53-59`),
`ConfSenders.send_crew_list` (`shells/conference/web_io.py:41-47`), and
ADE's `send_crew_list` (`shells/ade/web_io.py:141-150`) — all three the
same `{"type":"crew_list","list":roster,"current":current}` shape.
`static/js/shell.js:801` routes the `crew_list` frame type to
`settingsPane`. No route or frame lists/loads/edits model blurbs, shell
files, skills, or persona/memory files directly — they only ever reach a
model through `compile_injections`.

---

## 2. SESSION SAVES MECHANISM — three systems

### (a) single-model sessions

| | |
|---|---|
| `sessions_dir()` | `engine/agent_loop.py:354-358` — `<SUITE_ROOT>/sessions/`, fixed, decoupled from workspace root |
| `persist_session(sess, name)` | `agent_loop.py:2211-2224` — writes `<sessions_dir>/<name>.json`, calls `index_upsert` |
| `.sessions_index.json` | `SESSIONS_INDEX_PATH = <SUITE_ROOT>/.sessions_index.json` (`agent_loop.py:350-351`); a flat JSON list, one row per save: `{id, project_path, project_name, created, file, preview}` (`agent_loop.py:2194-2223`) |
| `load_index_healed()` | `agent_loop.py:2203-2209` — reads the index, drops rows whose `file` no longer exists on disk, rewrites if changed |
| `sessions/<name>.json` shape | `{id, created, project_path, project_name, messages, activity}` (`agent_loop.py:2211-2219`) |

Trigger: `session_save` frame (IDE). Writer: `persist_session`. Reader:
`session_load` frame (by name under `sessions_dir()`, or by absolute
`path` validated against the index — `shells/ide/frames.py:340-379`).
Lister: `/api/saves` (`server.py:1613-1648` — `scope=current` globs
`sessions_dir()`; `scope=all` reads `load_index_healed()`). Deleter:
`/api/saves/<save_id>` DELETE and `/api/saves` DELETE-by-path
(`server.py:1939-1963`, calls `agent_loop.index_remove`). UI: IDE's
save/load pickers wired through `/api/saves`.

IDE frames: `session_new` clears the transcript and unbinds save-name
(`shells/ide/frames.py:318-326`); `session_save` sanitizes the name
(`[^\w\-]` -> `-`) and calls `persist_session`, sets `sess.autosave=True`
(`:328-338`); `session_load` loads by `path` or by `name`, always resets
`autosave=False`/`save_name=None` — a load never re-binds autosave
(`:340-381`).

### (b) conference rooms

| | |
|---|---|
| `rooms_dir()` | `shells/conference/persistence.py:13-17` — `<SUITE_ROOT>/rooms/` |
| `persist_room(room, name)` | `persistence.py:20-40` — writes `rooms/<name>.json`: `{id, kind:"room", saved_ts, preview, **room.snapshot()}` (snapshot carries `participants`, `mode`, `transcript`) |
| `/api/rooms` | `server.py:1903-1925` (GET, list) |
| `/api/rooms/<room_id>` | `server.py:1928-`(DELETE) |

Separate schema from (a) on purpose (`persistence.py:1-4,14-16`) — a room
and a session named the same never collide, and `/api/saves`'
single-`messages[]` reader never sees a room file.

### (c) ADE sessions and templates

`shells/ade/tracks.py`:

| Function | Line | What |
|---|---|---|
| `archives_dir()` | `73-76` | `<SUITE_ROOT>/archives/` |
| `session_dir(sid)` | `79-80` | `archives_dir()/<sid>/` |
| `save_session(name)` | `3118-3128` | names the live ADE session, writes archive, flips `_session['saved']=True` |
| `autosave()` | `3131-3138` | no-op until saved once; writes archive at turn boundary + server close |
| `save_template(name)` | `3151-3240` | writes `archives/<fresh-id>/master.json` under `kind="ade-template"`; scrubs `lifecycle`, `turn_ordinal`, `claude_session_id`, `status`/`stxt`; drops killed regions |
| `reload_session(sid)` | `3409` | loads a saved session "as-if-never-left", replays `<region-id>.jsonl` verbatim (`_hydrate_region`, `3243-`) |
| `instantiate_template(tid)` | `3490` | same world-swap as reload, but from a template (no transcripts, fresh session id) |
| `_write_archive(sid,name,created)` | `2979-` | the one master.json writer both `save_session`/`autosave` funnel through |

`master.json` schema: `ARCHIVE_SCHEMA = 4` (`tracks.py:2967-2976`) — 1->2
Track/Region split, 2->3 adds `plan`, 3->4 adds `workspace_root`. `kind`
field distinguishes `SESSION_KIND = "ade-session"` from
`TEMPLATE_KIND = "ade-template"` (`tracks.py:2951-2965`); missing `kind`
reads as a session (safe direction).

One archive folder listed (`archives/01b47947f665/`): `log.jsonl`. Another
(`archives/b3e217f022b0/`): `log.jsonl`, `waypoint.jsonl` — no
`master.json` in either sampled folder (both untracked/in-progress at time
of this pass).

Routes (`server.py`): `/api/ade-sessions` (`1967-`, GET list, reads
`archives_dir()` off disk, no index file), `/api/ade-sessions/<sid>`
(`2135-`, DELETE), `/api/ade-templates` (`2153-`, GET),
`/api/ade-templates/<tid>` (`2191-`, DELETE), `/api/ade-sessions/save`
(`2214-`, POST — control.html's non-socket save button, per
`mapdocs/v2-sweep/lane2-shells-server.md:158`).

Frames (`shells/ade/frames.py`): `ade_save` (`1300-1324`) — first save
names the session (`tracks.save_session`) or, with `template:true`, writes
a template (`tracks.save_template`) without touching the live session;
`ade_load` (`1326-1345`) — `tracks.reload_session`, broadcasts
`send_ade_init`, sweeps waiting mail on every revived track; `ade_new`
(`1347-1373`) — `tracks.new_session()` or, with a `template` id,
`tracks.instantiate_template(tid)`; `ade_end` (`1375-1390`) — autosaves via
`tracks.end_session()`, then resets to scratch. All four broadcast
`send_ade_init(session_meta(), list_regions(), list_tracks())` except a
failed load/instantiate.

**Table, all three systems:**

| System | Trigger | Writer | File | Reader | Lister | Deleter | UI |
|---|---|---|---|---|---|---|---|
| (a) session | `session_save` frame | `persist_session` | `sessions/<name>.json` | `session_load` frame | `/api/saves` | `/api/saves/<id>`, `/api/saves` DELETE | IDE picker |
| (b) room | room close/autosave (conference.py, outside this lane) | `persist_room` | `rooms/<name>.json` | conference load (outside this lane) | `/api/rooms` | `/api/rooms/<room_id>` DELETE | conference room picker |
| (c) ADE session | `ade_save` frame | `save_session`/`_write_archive` | `archives/<sid>/master.json` | `ade_load` frame -> `reload_session` | `/api/ade-sessions` | `/api/ade-sessions/<sid>` DELETE | ADE splash Load/Delete |
| (c) ADE template | `ade_save` frame w/ `template:true` | `save_template` | `archives/<fresh-id>/master.json` (`kind="ade-template"`) | `ade_new` frame w/ `template` id -> `instantiate_template` | `/api/ade-templates` | `/api/ade-templates/<tid>` DELETE | ADE splash Template picker |

---

## 3. PRESETS MECHANISM

`engine/settings_stack.py` in full.

**One preset kind today, not two.** `PRESETS_ROOT =
<SUITE_ROOT>/injections/presets` (`settings_stack.py:83`); `_preset_dir(kind)`
asserts `kind in ("claude",)` (`:278-284`) — comment states this was merged
from an earlier two-kind ("stack"/"model") design by
SPEC-claude-preset-merge, 2026-08-22 (`:79-83`). One folder,
`injections/presets/claude/`, one file per preset.

**PRESET_TABLE** (`:139-213`) is "the one table" (SPEC-preset-one-table,
2026-08-25) — every field the ADE track-settings widget can show has a row:
`{type, default, how, nullable}`. 33 keys total, grouped by `how`:
- `identity` (2): `model`, `seat`
- `layer` (6): `claude_config_dir`, `claude_setting_sources`,
  `claude_system_prompt`, `claude_output_style`, `claude_md_excludes`,
  `claude_bare`
- `bag` (23): `claude_memory_enabled`, `claude_exclude_dynamic`,
  `claude_add_dirs`, `claude_settings_file`, `claude_tools`,
  `claude_disallowed_tools`, `max_tools`, `gate_wait_s`,
  `claude_hook_ask_blocking`, `claude_effort`, `claude_keep_warm`,
  `claude_cache_ttl`, `request_timeout`, `num_ctx`, `think`,
  `allow_agent_reset`, `context_reset_cap_k`, `start_turn_on_reset`,
  `reset_instruction`, `temperature`, `top_k`, `top_p`, `min_p`,
  `repeat_penalty`, `repeat_last_n`, `seed`, `num_predict`, `keep_alive`,
  `mirostat`, `mirostat_tau`, `mirostat_eta`, `num_gpu`, `num_thread`,
  `codex_sandbox_mode`, `codex_approval_policy` (count exceeds 23 in the
  grouping comment; the table itself, `:139-213`, is the authority)
- `gates` (1): `gates` (dict)
- `name` (1): `claude_preset` (the preset's own name)

`_APPLY_ORDER = ("name", "identity", "layer", "bag", "gates")`
(`:224`) — identity before bag is load-bearing (`:216-223`,
found by `verify/ade/test_preset_roundtrip.py`). `PRESET_EXCLUDED =
("name", "provider", "loop_class", "mechanism", "root")` (`:244`) — never
rows in the table; `provider`/`loop_class`/`mechanism` are derived from
`model` at load time, never stored (`:236-243`).

`CLAUDE_PRESET_FIELDS` (`:272`) and `_NULLABLE_MODEL_FIELDS` (`:275`) are
derived from `PRESET_TABLE`, not hand-maintained lists. **`STACK_PRESET_FIELDS`
and `MODEL_PRESET_FIELDS` do not exist in the code today** — see §9.

**File read/write/list/rename/delete** (all in this file):
- `list_presets(kind)` — `:308-316` — sorted `.json` stems in
  `_preset_dir(kind)`, `[]` on missing folder.
- `read_preset_file(kind, name, warnings=None)` — `:319-371` — loads JSON,
  validates every key against `CLAUDE_PRESET_FIELDS`; unknown key ->
  warning + dropped; wrong type -> warning + dropped (never coerced); `name`
  key always dropped silently (it identifies the file, not a track field).
  Returns `(fields, warnings)`.
- `write_preset_file(kind, name, fields)` — `:374-391` — writes
  `fields` + a stamped `"name"` verbatim; creates the folder lazily.
- `delete_preset_file(kind, name)` — `:394-403`.
- `rename_preset_file(kind, old, new)` — `:406-436` — renames the file,
  restamps its internal `name` field; refuses if the target name already
  exists.

**resolve() — precedence** (`:476-590`): layers weakest -> strongest:
`global` (never materialized — absence, answered by the CLI's own disk
stack) -> `file` (`claude_settings_file` override JSON) -> `preset`
(`claude_preset`-named file) -> `track` (the ADE track's own fields).
Stated explicitly at `:495-496`: "track fields beat preset values beat the
override file beat the global disk stack." The three overlay keys
(`outputStyle`/`autoMemoryEnabled`/`claudeMdExcludes`) are resolved per-key
in that order at `:534-547`. Four more levers
(`setting_sources`/`config_dir`/`system_prompt`/`bare`) resolve
track-then-preset only, no file-layer route, at `:554-580`. `hooks` in an
override file is always dropped with a warning (`:466-467`) — the
PreToolUse gate is generated from the tool roster, never preset-settable.

**Preset files on disk** (`injections/presets/claude/`), 5 files (keys, not
values):
| File | Keys present |
|---|---|
| `Agent Opus.json` | includes `claude_system_prompt` (the one preset that sets it) — `settings_stack.py:183` in lane5 notes this as a second, independent system-prompt channel |
| `Agent Sonnet.json` | — |
| `Music History Sonnet.json` | — |
| `User Fable.json` | — |
| `test sonnet.json` | — |
(Exact key lists not enumerated further this pass — out of the grep-first
budget; file contents are JSON objects, first line `{` for all five, per §1
table above.)

**Routes** (`server.py`):
- `/api/settings/browse` (`:1806-1837`) — `presets=claude` bypasses the
  path-root logic and calls `settings_stack.list_presets("claude")`
  directly (`:1821-1823`); absent `presets=`, lists a directory under
  `rt.WORKSPACE_ROOT` for the `claude_settings_file` picker.
- `/api/settings/read` (`:1840-1886`) — `preset_kind=claude&preset_name=`
  calls `settings_stack.read_preset_file` (`:1857-1862`); absent those
  params, classifies an arbitrary file's top-level keys against
  `_SETTINGS_CARRY_KEYS`.
- `/api/settings/resolved` (`:1889-1900`) — `track=<region id>` ->
  `settings_stack.resolve(region.sess.settings)` verbatim.

**ADE frames** (`shells/ade/frames.py`):
- `_do_load_preset(track, name)` (`:459-541`) — one walk of
  `settings_stack.preset_keys()` in apply order. `how=="layer"` fields are
  CLEARED to the engine default on the track (resolve() reads them live
  from the file on every future spawn — track-beats-preset precedence
  means a stale track value would outrank a freshly loaded preset).
  `how=="bag"` fields are written plainly. `how=="name"` writes
  `claude_preset = name` (never whatever the file says). The rail
  (`provider`/`loop_class`/`mechanism`) is derived from `model` via
  `rails.infer_provider`+`rails.normalize` (`:519-534`), never read from
  the file. Gates applied last via `tracks.apply_gate_subset` (`:536-539`).
- `_capture_preset_fields(track, pending)` (`:569-636`) — the inverse walk
  for Save; captures `pending` (what the open widget shows) over the live
  track; only fields differing from the engine default are stored, except
  `model` which is always written (`:620-634`, so a preset never loses its
  rail).
  `_do_save_preset(track, name, pending)` (`:659-`) — refuses to write when
  the capture is empty (an all-default track), so Save can never silently
  blank an existing preset file (`:676-686`).
- `rename_preset` frame (`:2007-2014`) -> `settings_stack.rename_preset_file("claude", ...)`.
- `delete_preset` frame (`:2016-2022`) -> `settings_stack.delete_preset_file("claude", ...)`.
- `load_preset` frame (`:1961-1981`) -> `_do_load_preset`.
- `save_preset` frame (`:1983-2005`) -> `_do_save_preset`.
- `_apply_spawn_presets` (`:544-566`) — a `create_track`/`insert_region`
  frame carrying a top-level `presets` name runs the SAME `_do_load_preset`
  door at track creation.

**providers.py consumption** (`engine/providers.py`):
- `ClaudeProvider.chat()` (`:1040-1082`) and
  `ClaudePersistentProvider`'s equivalent (`:1658-1680`) call
  `settings_stack.resolve({...})` (`:1061-1071`, `:1660-`), then pass
  `resolved["overlay"]` into `_settings_obj()` (`:1072`) and
  `resolved["setting_sources"]`/`["system_prompt"]`/`["bare"]` straight
  into `_build_cmd()` (`:1076-1079`).
- `_settings_obj(claude_tools, overlay, gate_wait_s)` (`:951-1012`) —
  `overlay` becomes the base of the `--settings` JSON object; when
  `claude_tools` is non-empty it ALSO adds `hooks.PreToolUse`/
  `hooks.PostToolUse` entries pointing at `HOOK_SCRIPT_PATH`
  (`hooks/ade_pretooluse_hook.py`, `:694`) — no separate toggle
  (`:963-967`).
- `_build_cmd()` (`:806-907`) — the CLI flag mapping: `claude_setting_sources`
  -> `--setting-sources` (`:890-891`), `claude_system_prompt` ->
  `--system-prompt` (`:892-893`), `claude_bare` -> `--bare` (`:894-895`),
  `claude_settings_obj` (the built dict above) -> `--settings <json>`
  (`:896-897`), `claude_disallowed_tools` -> `--disallowedTools` comma-list
  (`:898-899`), `claude_add_dirs` -> repeated `--add-dir` (`:900-902`),
  `claude_tools` -> `--tools <comma-list-or-empty>` (`:906`).

---

## 4. PROVIDER REGISTRATION MECHANISM

`Router.__init__` (`engine/providers.py:2479-2503`) constructs one of each:
`OllamaProvider`, `GeminiProvider`, `LiteRTProvider`,
`LiteRTPersistentProvider`, `LlamaCppProvider`, `ClaudeProvider`,
`CodexProvider` — plus `self.claude_p = {}`, a
`{(track_id, model): ClaudePersistentProvider}` registry (BLOCK D,
`:2487-2502`).

**chat() dispatch** (`Router.chat`, `:2635-2660`, via `_pick`,
`:2583-2612`): `provider=None` (default) routes by model-name prefix via
`_provider_for(model)` (`:148-158`) — `gemini*` -> gemini, `llamacpp*` ->
llamacpp, name in `CLAUDE_MODELS` -> claude, name in `CODEX_MODELS` ->
codex, else -> ollama (with a LiteRT override: `self.litert.handles(m)`
checked separately, `:2610-2611`, for local `.litertlm` files under
`models/`). `provider="codex"` is the one explicit override string
accepted; any other explicit `provider` value raises `ValueError`
(fail-closed, `:2593-2599`) rather than falling through to Ollama.
`claude_mode="persistent"` (default) routes Claude through
`claude_provider_for(track_id, model)` (get-or-create,
`:2506-2522`), keyed on `(track_id, model)` — never track alone, so
`claude_keep_warm` can leave an old model's warm subprocess alive under
its own key while the track talks to a different model (`:2487-2499`).

`CLAUDE_MODELS = ("sonnet","haiku","fable","opus","claude-opus-4-5",
"claude-opus-4-6","claude-sonnet-4-5","claude-sonnet-4-6",
"claude-opus-4-8","claude-fable-5")` (`:137-139`).
`CODEX_MODELS = ("gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5")`
(`:145`) — this module owns the catalogue; `codex_provider.CODEX_MODELS`
is deliberately kept empty (`:35` in that file).

**Model catalogue merge** (`Router.list_models`, `:2618-2633`): concatenates
`ollama.list_models()` (if `available()`), `gemini.list_models()`,
`litert.list_models()`, `claude.list_models()`, `list(CODEX_MODELS)` (if
`codex.available()` — names come from THIS module, not the provider),
and `llamacpp.list_models()` unconditionally (static registry, listed even
when its server is down).

**Load/unload/warm**: no `load`/`warm` methods on `Router`; "warm" is the
per-`(track_id, model)` persistent-provider registry itself plus the
`claude_keep_warm` chat kwarg. `Router.unload(model, track_id)`
(`:2662-2705`) branches by `_provider_for(model)`: llamacpp -> no-op
message (external server); codex -> no-op message (ephemeral, nothing
warm survives a turn); claude -> pops `(track_id, model)` from
`self.claude_p` and calls `.shutdown()` (scoped to one track unless
`track_id is None`, which sweeps every track); litert -> `self.litert.unload(model)`;
else -> `self.ollama.unload(model)`. `claude_close_track(track_id)`
(`:2552-2560`) kills every warm Claude subprocess a track holds, on track
close. `claude_interrupt_track(track_id)` (`:2562-2581`) ends the turn on
every warm subprocess a track holds without killing the process (keeps the
prompt cache).

**Minimal provider interface** the Router calls: `available() -> bool`,
`list_models() -> list[str]`, `chat(messages, model=None, **kwargs) ->
Iterator[(channel, data)]` (channel in `thinking|content|tool_call|metrics`),
and optionally `unload(model=None) -> str` and `handles(model) -> bool`
(LiteRT only, `:2145`).

**`engine/ollama_provider.py`** — `OllamaProvider`: constructor
`__init__(model="gemma4:26b-mxfp8", host="http://localhost:11434")`
(`:31-33`). Methods: `available()` (GET `/api/tags`, `:35-41`),
`list_models()` (GET `/api/tags`, `:43-52`), `chat(messages, model=None,
think=None, tools=None, num_ctx=None, timeout=None, <sampling params>,
**_kwargs)` (`:54-140`, generator), `unload(model=None)` (POST
`/api/generate` with `keep_alive:0`, or sweeps `/api/ps` when `model` is
`None`, `:142-159`). Transport: raw `requests` HTTP calls to a local Ollama
daemon; streaming chat via `stream=True` + `iter_lines()`.

**`engine/codex_provider.py`** — `CodexProvider`: constructor takes no
args (`DEFAULT_MODEL = None`, `:86`). Methods: `_get_binary()` (PATH or
`CODEX_EXECPATH` env, `:88-96`), `available()` (`:98-101`), `list_models()`
(`:103-104`), `_build_cmd()` (`:106-130`, builds `codex exec --json
--ephemeral --sandbox read-only --ignore-user-config --ignore-rules
--skip-git-repo-check [--cd <root>] [--model <name>]`), `chat(messages,
model=None, workspace_root=None, metrics_sink=None, **_kwargs)`
(`:199-281`, generator). Transport: `subprocess.Popen` spawning the
`codex` CLI, one prompt in over stdin, streamed JSON events read line by
line off stdout; the class collapses the whole ADE transcript into one
plain-text prompt (`_render`, `:132-170`) since Codex here is text-only —
any `command_execution`/`tool_call`/`mcp_tool_call`/`web_search` item type
is reported back as a protocol violation, never forwarded as an ADE tool
call (`:250-253,272-274`). Note: this file's own module docstring
(`:7-9`) states "This module is intentionally NOT wired into Router yet"
— see §9, that is stale; `Router.__init__` does construct
`self.codex = CodexProvider()` (`providers.py:2486`) and `_pick`/`chat`
route to it.

**Docker/container/ssh/remote-host handling**: none found. `grep -rniE
"docker|container|ssh|remote" engine/*.py machines.json` matches only this
project's own "container" terminology for an ADE Track (the thing a Region
sits on — `daemon_queue.py:619`, `agent_loop.py:1933,2107,2130`,
`ledger.py:234-236,389,455,534-537,550`), never a Docker/OS container.
`machines.json` is a flat hostname -> machine-name map (`Mac-50.lan` etc ->
`mothership`/`blackbook`, 5 rows) with no docker/ssh/remote fields.

---

## 5. SKILLS MECHANISM

`injections/skills/` — 7 files (6 real skills + 1 template):

| File | Applies (verbatim) | Constrains (verbatim) |
|---|---|---|
| `logic-pro.md` | `every seat, all shells (v0 injects everywhere — no per-seat assignment yet, even though this reads as if it worked)` | `how you use logic_status / logic_open / logic_transport / logic_command` |
| `remember-by-hand.md` | `every seat with an agent folder, all shells` | `how to file a memory manually with write_file` |
| `remember.md` | `every seat with an agent folder, all shells` | `how memories are kept with the remember tool` |
| `room-messaging.md` | `every seat, ade` | `how to answer a group message and how to reach a peer` |
| `screen.md` | `every seat, all shells` | `how you use \`screen_capture\` — which display, when to ask,` (line wraps) |
| `web-browsing.md` | `every seat, all shells (v0 injects everywhere — no per-seat assignment yet, even though this reads as if it worked)` | `how you use web_open / web_read / web_screenshot / web_act / web_eval` |
| `_TEMPLATE.md` | `<when this skill is in force — which shells, which seats>` (placeholder) | `<the behavior it shapes, in one line>` (placeholder) |

`_TEMPLATE.md` full contract comment (`injections/skills/_TEMPLATE.md:13-23`):
Applies is two comma-separated clauses, `"<seat-scope>, <shell-scope>"` (a
trailing parenthetical is ignored by the matcher); seat-scope is `"every
seat"`, `"every seat with an agent folder"`, or `/`-joined nicknames;
shell-scope is `"all shells"` or `/`-joined shell names. Anything not this
exact two-clause shape — missing, blank, unparseable — FAILS OPEN and
injects for everyone. Files starting with `_` are never injected.

Matcher: `engine/compiler.py:_applies` (`:230-243`), `_seat_matches`
(`:214-220`), `_shell_matches` (`:223-227`), `_skills` (`:246-259`, does
the `os.listdir` + `.md`/no-`_`-prefix filter + empty-file skip).

No UI lists skills — confirmed by grep across `static/`, `server.py`,
`shells/`, `engine/` for `injections/skills`, `skills_list`, `list_skills`,
`/api/skills`: only `engine/compiler.py` reads this folder.

---

## 6. HOOKS MECHANISM

`hooks/` contains one live file: `hooks/ade_pretooluse_hook.py` (272
lines) — "Rail C's PreToolUse gate AND PostToolUse outcome-recorder"
(`:1-7`). (`hooks/__pycache__/` also present, a compiled artifact, not
source.)

**Registration**: `engine/providers.py:_settings_obj`
(`:951-1012`, see §3) writes it into the `--settings` JSON's
`hooks.PreToolUse`/`hooks.PostToolUse` arrays whenever `claude_tools` is
non-empty (`:992-1011`) — `HOOK_SCRIPT_PATH = <SUITE_ROOT>/hooks/
ade_pretooluse_hook.py` (`:694`). Both hook types are wired in the same
act; there is no separate toggle for hook registration (`:963-967`). The
settings field that turns it on, concretely, is a non-empty
`claude_tools` list on the track — there is no dedicated boolean field.

**What the script does** (`hooks/ade_pretooluse_hook.py:1-60`+): a
subprocess of the Claude CLI, no session of its own. PreToolUse: reads
`{session_id, tool_name, tool_input, tool_use_id}` off stdin, POSTs to
`server.py`'s `/api/policy/resolve-hook` (`server.py:1371-`), returns
`{"hookSpecificOutput":{"hookEventName":"PreToolUse",
"permissionDecision":"allow"|"deny", "permissionDecisionReason":...}}`,
always exit 0 (decision rides the JSON). PostToolUse: records the outcome
via the same server route, never denies, never blocks, always exits fast.

**`engine/claude_sdk.py`** — a second, separate mechanism:
`TOOL_EDGES` (`:173-191`) maps Claude-native tool names to this project's
policy edges (`Read`/`Glob`/`Grep`/`NotebookRead` -> `check_read`;
`Write`/`Edit`/`NotebookEdit` -> `write_file`;
`Bash`/`BashOutput`/`KillShell` -> `run_command`;
`WebFetch`/`WebSearch` -> `fetch_url`); an unmapped tool passes its own
name through as the edge (`edge_for`, `:199-202`), which `policy.resolve`
turns into `"ask"` for an unknown edge. `edge_for`/`target_of`/`scope_of`/
`TOOL_EDGES` ARE consumed live — by `server.py`'s `/api/policy/resolve-hook`
route (`server.py:78,1395-1403,1518`, the route the subprocess hook above
POSTs to) and by `shells/ade/tracks.py:1754` (imports `TOOL_EDGES` to
derive the gate-edge vocabulary for `apply_gate_subset`). Separately, this
file also defines `make_can_use_tool`/`build_options`/an async
`can_use_tool` callback (`:269-352`) shaped for the Claude Agent SDK's
native `can_use_tool` permission hook — `grep`, across `server.py`,
`shells/ade/rails.py`, `shells/ade/tracks.py`, `engine/providers.py`,
found no call site for `make_can_use_tool`, `build_options`, or
`can_use_tool` itself. The live gate path today is the subprocess
`--settings` hook above; this SDK-native callback machinery is present but
uncalled — see UNKNOWNS.

No other hook registration found in the codebase this pass.

---

## 7. CHANNELS MECHANISM

`engine/channel_registry.py` — a flat module-global dict `_CHANNELS`
(`:46`), import-clean by invariant (imports nothing from the project,
`:18-25`). `register(name, entry)` (`:49-135`) validates and stores an
entry: `{edges: [{name,level,grade}], auth: str, state: callable()->str,
stubs: [str]}`; raises `ValueError` on any malformed shape (never returns
an error string — programmer-facing, not model-facing). `get(name)`
(`:138-140`), `names()` (`:143-145`), `describe(name)`/`describe_all()`
(`:161-197`, printable report, calls `state()` live at report time, guards
exceptions as `"[state error: ...]"`). `LEVELS = ("check","read","write",
"overwrite","delete","run")`, `GRADES = ("enforced","declared")` (`:35-36`).

`channels/logicpro.py`:
```
EDGES = [
    {"name": "logic_status",    "level": "check", "grade": "declared"},
    {"name": "logic_open",      "level": "run",    "grade": "declared"},
    {"name": "logic_transport", "level": "run",    "grade": "declared"},
    {"name": "logic_command",   "level": "run",    "grade": "declared"},
]
```
(`logicpro.py:40-45`). Registers as `channel_registry.register("logicpro",
{"edges": EDGES, "auth": AUTH_NOTE, "state": connect, "stubs": STUBS})`
(`:311-316`) — note the module docstring (`:17`) says it registers as
`"logicpro"` and the code matches. `AUTH_NOTE = "none — local UI scripting
(System Events; needs macOS Accessibility grant)"` (`:52`). All four edges
graded `"declared"`.

`channels/webbrowser.py`:
```
EDGES = [
    {"name": "web_open",       "level": "check", "grade": "enforced"},
    {"name": "web_read",       "level": "read",  "grade": "enforced"},
    {"name": "web_screenshot", "level": "check", "grade": "enforced"},
    {"name": "web_act",        "level": "run",   "grade": "enforced"},
    {"name": "web_eval",       "level": "run",   "grade": "enforced"},
]
```
(`webbrowser.py:60-66`). Registers as `channel_registry.register(
"webbrowser", {"edges": EDGES, "auth": AUTH_NOTE, "state": _state, "stubs":
STUBS})` (`:461-466`) — the module docstring (`:29`) says
`register("browser", ...)`, but the code registers under `"webbrowser"`;
see §9. `AUTH_NOTE = "none — local headless Chrome via CDP, dedicated port
9223 (never 9222)"` (`:73`). All five edges graded `"enforced"`.

Both files self-register at the bottom of the module (`# noqa: E402`,
deliberate) by importing `engine.channel_registry` and calling
`.register()` at import time.

**Import site**: `engine/agent_loop.py:66-67` —
`from channels import logicpro as channel_logicpro` and
`from channels import webbrowser as channel_webbrowser`, both commented
"self-registers with channel_registry at import time." No other importer
of either channel module found this pass.

**`policy.json` rows naming these edges** (`policy.json:56-109`): one row
per edge, all `"driver": "model"`, `"scope": "any"`, `"hook": "ask"` —
`logic_status`, `logic_open`, `logic_transport`, `logic_command`,
`web_open`, `web_read`, `web_screenshot`, `web_act`, `web_eval`. (A
`"default"`/`"human"`/`"any"`/`"open"` row precedes them at
`policy.json:50-55`.)

---

## 8. REGISTRY STORES AS LIBRARY ITEMS

| Store | Owner module | Path constant | Repoint function | Format |
|---|---|---|---|---|
| `log.jsonl` | `engine/ledger.py` (also independently defined in `engine/agent_loop.py` and `engine/daemon_queue.py`) | `ledger.py:60 LOG_PATH`; `agent_loop.py:495 LOG_JSONL_PATH`; `daemon_queue.py:52 LOG_PATH` — all three `= os.path.join(SUITE_ROOT, "log.jsonl")` | `ledger.py:set_ade_log_dir(directory)` (`:73-79`), consulted by `_log_path_for(shell)` (`:82-89`) — the ONE function every writer/ADE reader consults; `shell=="ade"` + a set dir points at `<dir>/log.jsonl`, else global `LOG_PATH` | append-only JSON-lines |
| `queue.json` | `engine/daemon_queue.py` | `daemon_queue.py:42 QUEUE_PATH = os.path.join(SUITE_ROOT, "queue.json")` | none found — one fixed path | JSON (object/array, daemon queue state) |
| `waypoint.jsonl` | `engine/waypoint.py` | `waypoint.py:48 WAYPOINT_PATH = os.path.join(SUITE_ROOT, "waypoint.jsonl")` | none at module level found this pass; a session switch uses a different file, `archives/<sid>/waypoint.jsonl` (`waypoint.py:320`) | one JSON object per line |
| `logs/` blobs | `engine/ledger.py` | `ledger.py:59 LOGS_DIR = os.path.join(SUITE_ROOT, "logs")` | none — `write_blob()` (`:171-191`) always targets `LOGS_DIR` | one file per blob, `<rec_id>.<kind>.txt`, `kind` in `{prompt,payload,out}` |
| `archives/<sid>/` copies | `shells/ade/tracks.py` | `tracks.py:73-76 archives_dir() = os.path.join(SUITE_ROOT, "archives")`; `tracks.py:79-80 session_dir(sid) = archives_dir()/<sid>` | none — one fixed root, per-session subfolder named by session id | folder per session/template: `master.json` + per-region `<region-id>.jsonl` + (per-session) `log.jsonl`/`waypoint.jsonl` |

---

## 9. DISCREPANCIES vs MAPDOCS

1. **Presets: two-kind design is gone.** `lane5-injections-state.md:25-26`
   (COMPONENTS) describes `injections/presets/model/*.json` (5 files) and
   `injections/presets/stack/*.json` (4 files) as separate
   `MODEL_PRESET_FIELDS`/`STACK_PRESET_FIELDS` bags, and
   `lane5-injections-state.md:71` (CONNECTIONS) describes stack-preset
   resolution as a mechanism separate from model presets, noting under
   UNKNOWNS "I found no code path that layers a model preset the way stack
   presets are layered." On disk today there is ONE folder,
   `injections/presets/claude/`, with 5 files (`Agent Opus.json`, `Agent
   Sonnet.json`, `Music History Sonnet.json`, `User Fable.json`,
   `test sonnet.json`) — none of the 9 file names the mapdoc lists exist.
   `engine/settings_stack.py` has no `STACK_PRESET_FIELDS` or
   `MODEL_PRESET_FIELDS` symbol; it has one `PRESET_TABLE` (33 rows) and a
   derived `CLAUDE_PRESET_FIELDS`. The module's own header comments
   (`settings_stack.py:1-4,78-100`) date this merge to
   SPEC-claude-preset-merge (2026-08-22) and a further consolidation,
   SPEC-preset-one-table (2026-08-25) — both after the mapdoc's 2026-08-19/20
   date. The mapdoc's own UNKNOWN about model-preset layering is resolved
   by the merge: there is no longer a separate model-preset layer to ask
   the question about.
2. **`lane5-injections-state.md:73`** cites preset write/rename/delete call
   sites as `shells/ade/frames.py:510` (write), `:1606` (rename), `:1615`
   (delete). In the current file these are `_do_save_preset` at
   `frames.py:659`, the `rename_preset` frame branch at `frames.py:2007-
   2014`, and the `delete_preset` frame branch at `frames.py:2016-2022` —
   line numbers have moved (expected drift for a dated line-cite mapdoc,
   noted per instructions).
3. **`lane1-engine.md:31-32`** describes `settings_stack.resolve()` as
   resolving "a track's settings overlay ... plus preset files under a
   presets dir" — still accurate in shape; the presets dir it points at is
   the merged `injections/presets/claude/`, not the two-kind dir the same
   lane1 excerpt's sibling lane5 describes.
4. **Channel self-description mismatch found in code, not a mapdoc.**
   `channels/webbrowser.py:29` (module docstring) says "Registers itself
   with channel_registry at import time — register('browser', ...)" but
   the executed call at `:461` registers under the name `"webbrowser"`.
   This is a code-internal discrepancy (docstring vs code), not a mapdoc
   one — flagged here because it affects anyone reading the docstring to
   learn the registry key.
5. **`engine/codex_provider.py:7-9`** module docstring states "This module
   is intentionally NOT wired into Router yet... wiring it before the
   agent loop classifies Codex as text-only would accidentally expose the
   ADE's native function tools." `engine/providers.py:2486` (`Router.__init__`)
   does construct `self.codex = CodexProvider()`, and `_provider_for`/`_pick`/
   `chat`/`list_models`/`unload` all have live Codex branches
   (`providers.py:156-157,2594-2595,2601-2602,2628-2631,2670-2674`). This
   is a code-internal discrepancy (a stale docstring claim), not a mapdoc
   one, flagged because a reader trusting the docstring would conclude
   Codex is unreachable through the Router when it is not.
6. **`lane2-shells-server.md:82-91`** (read for Library per the reading
   matrix) is accurate against current `shells/conference/persistence.py`
   and `frames.py` line counts as read.
7. **`lane1-engine.md:20-23,35-36`** and **`lane3-ade-frontend.md:66-79,
   105-111`** (Library's assigned ranges) read as accurate summaries of
   current `compiler.py`/`settings_stack.py`/`channel_registry.py`/
   `arrange.js`/`tracksettings.js` behavior — no discrepancy found in
   those specific ranges beyond the presets item above (which lane1:31-32
   touches only tangentially).

No other line-range assigned to Library conflicted with current code.

---

## 10. UNKNOWNS

1. Exact key contents of the 4 preset files other than `Agent Opus.json`
   (`Agent Sonnet.json`, `Music History Sonnet.json`, `User Fable.json`,
   `test sonnet.json`) were not individually enumerated — confirmed only
   that all are valid-looking JSON objects (`{` first byte) under
   `injections/presets/claude/`. A full per-file key diff against
   `PRESET_TABLE` was out of this pass's grep-first budget.
2. Whether `engine/claude_sdk.py`'s `make_can_use_tool`/`build_options`/
   `can_use_tool` (SDK-native permission-callback path, `:269-352`) is
   wired anywhere outside the four files grepped (`server.py`,
   `shells/ade/rails.py`, `shells/ade/tracks.py`, `engine/providers.py`) —
   e.g. in a test file, a not-yet-wired future integration, or dead code
   — was not resolved. No call site was found in the live request path;
   the subprocess `--settings` hook (`hooks/ade_pretooluse_hook.py` ->
   `/api/policy/resolve-hook`) is confirmed as the live gate mechanism.
3. `waypoint.jsonl`'s repoint behavior (global vs per-session) parallels
   `log.jsonl`'s `set_ade_log_dir`/`_log_path_for` pair by file-listing
   evidence (`archives/<sid>/waypoint.jsonl` exists alongside
   `archives/<sid>/log.jsonl` in the sampled folder), but the specific
   function that performs this repoint for waypoint (as opposed to log)
   was not located by name in `engine/waypoint.py` this pass — reading
   that mechanism in full is outside Library's assignment (waypoint's
   read/write internals belong to another lane per the primer).
4. `archives/b3e217f022b0/` and `archives/01b47947f665/` (the two folders
   listed per the BLACKOUT's "list file names of one folder" allowance)
   contain no `master.json` — both appear to be sessions that never
   reached a manual save, or logs from a session still in flight, or the
   `master.json` naming/location has a variant this pass did not check
   for. Not resolved.
