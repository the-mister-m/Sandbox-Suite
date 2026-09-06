# SPEC C — TOOLS AND CONTEXT: one tool table, one context builder

Builder: Opus.
Order: third. Starts after Docs/Reports/RECEIPT-B-engine.md exists. Read A's and B's receipts first.
Before Part 1: if Docs/Reports/RECEIPT-B2-fixes.md does not exist, build Docs/Specs/SPEC-B2-fixes.md first under its own guardrails and leave its receipt. If it exists, read it and confirm `/api/settings/resolved` returns `provenance` before you start.
Scope source: Docs/Scope/SCOPE-sandbox-cleanup.md, Phase 1 (Context), Phase 2 (Gates: "get rid of old daemon tools"), Library Phase 3 (tools/skills/hooks) as the thing this makes room for.

## GUARDRAILS

- Files you may edit: engine/tools.py (new), engine/tools_web.py (new, moved from channels/webbrowser.py), engine/read_tool.py, engine/compiler.py, engine/policy.py, engine/agent_loop.py (dispatch, gating, and system message only), ade/tracks.py (`default_overlay_rows`, `gate_edge_list`, `reseat` call sites only), injections/, tests/. Delete: channels/, engine/channel_registry.py.
- Do not touch: engine/providers.py, engine/settings.py, ade/frames.py, ade/rails.py, server.py, hooks/, static/.
- The registry is a plain Python list of rows. No plugin loader, no directory scan, no decorators that register on import, no entry points. A future library will read this list; it does not exist yet and you do not build it.
- Code comments: label, function, state. Nothing else.
- Boot stays green. `python3 -m pytest tests/ -q` passes.
- Read budget: read_tool.py, compiler.py, policy.py, channels/webbrowser.py in full. agent_loop.py: `system_message`, `reseat`, `_resolve_gate` through `_execute_tool`, `_agent_loop_body`. tracks.py: `default_overlay_rows` through `gate_edge_list`, and every `al.reseat` call. injections/ folder listing plus preamble.md and shells/ade.md. B's receipt section FOR C.
- Receipt: Docs/Reports/RECEIPT-C-tools-context.md. Update INDEX.md and SESSIONLOG.md.

## PART 1 — THE TOOL TABLE

New file engine/tools.py.

```python
Tool(
    name,          # "read_file"
    edge,          # policy edge: "check_read" | "write_file" | "run_command" | "fetch_url" | ...
    scope,         # callable(args) -> "inside" | "outside" | "any"
    schema,        # the native function-calling dict (today's NATIVE_TOOLS entry)
    marker,        # compiled regex for the text protocol, or None
    parse,         # callable(match) -> args dict
    hint,          # one paragraph of text-protocol instruction (today's _BASE_HINT slice)
    prompt,        # callable(sess, args) -> the gate prompt string (today's approve_* bodies)
    run,           # callable(sess, args) -> str | (str, media)
    summary,       # callable(args, result) -> short log line
    needs_region,  # bool: refuses when sess has no region id
    fenced,        # bool: the marker has a ---BEGIN---/---END--- body (write, send, remember)
)

TOOLS = [ ... ]                 # ordered; fenced tools first, then run, then the rest, read and list last
TOOL_INDEX = {t.name: t for t in TOOLS}
def tool_schema() -> list       # [t.schema for t in TOOLS]
def text_hint() -> str          # the joined hints plus the closing workspace paragraph
def detect_text(reply)          # first marker that matches, in TOOLS order
def detect_native(tool_calls)   # unchanged from read_tool
def gate_edges() -> list        # [(edge, scope) ...] deduplicated, the source for policy defaults and overlay rows
CLAUDE_NATIVE_EDGES = TOOL_EDGES  # moved here from policy.py where A parked it; policy imports it from here
```

Tools in the table, in this order:

write_file, send_message, remember, run_command, view_image, screen_capture, fetch_url, recall, web_open, web_read, web_screenshot, web_act, web_eval, initiate, reset_region, reset_self, request_messages, read_file, list_files.

Dropped: logic_status, logic_open, logic_transport, logic_command. Remove every trace: markers, schemas, hints, approve functions, policy rows, gate edges, `channels/logicpro.py`.

`list_files` takes `recursive`, `show_size`, `show_hidden` as tool arguments with defaults `False`, `True`, `False` in its schema. The settings keys B removed are gone; the tool carries its own defaults.

`run_command` always streams to `sess.io.term`. `run_stream` is gone.

`step`, `gate_read`, `gate_list`, `approve_step`, and the per-tool step branch in `_agent_loop_body` are deleted. Gating is the policy table only.

`hooks/ade_pretooluse_hook.py` and `CLAUDE_NATIVE_EDGES` stay as they are. Claude tools-ON still cannot reach this table. That is a known deferral, not yours to fix.

### 1a. read_tool.py after the move

Keeps: `WORKSPACE_ROOT`, `set_workspace_root`, `usable_root`, `_resolve`, `is_outside_root`, `_track_root`, the executors (`read_file`, `write_file`, `delete_file`, `view_image`, `screen_capture`, `list_files`, `list_dir`, `run_command`, `fetch_url`, `recall_memory`, `send_message`, `request_messages`, `initiate`, `reset_self`, `reset_region`), the setter hooks (`set_room_reporter`, `set_mute_prober`, `set_initiator`, `set_resetter`), `result_text`, `result_native`, `malformed_hint`, `detect_malformed`.

Loses: every `*_MARKER` regex, `_BASE_HINT`, `TEXT_SYSTEM_HINT`, `TEXT_WORKER_HINT`, `detect_text`, `NATIVE_TOOLS`, `detect_native`, `ATTEMPTED_MARKER`. Those move into tools.py rows. `detect_malformed` builds its keyword alternation from `TOOLS` at import.

### 1b. Browser

Move channels/webbrowser.py to engine/tools_web.py. Drop `EDGES`, `STUBS`, `AUTH_NOTE`, `capabilities`, `receive`, `render_a_gate`, and the `channel_registry.register` call at the bottom. Keep everything else including `atexit.register(disconnect)`. Delete engine/channel_registry.py and the channels/ folder.

### 1c. agent_loop dispatch

Replace the twenty `approve_*` functions and the `_execute_tool` chain with:

```python
def execute_tool(sess, name, args):
    tool = tools.TOOL_INDEX.get(name)
    if tool is None:
        return f"[unknown tool: {name}]"
    if tool.needs_region and not getattr(sess, "region", None):
        return f"[{name} refused: this session has no track identity]"
    sess.gate_parked = False
    sess._tool_args = args if isinstance(args, dict) else None
    token = rt._track_root.set(getattr(sess, "root", None))
    try:
        ok = _resolve_gate(sess, tool.edge, "model", {"scope": tool.scope(args)},
                           tool.prompt(sess, args), action=name,
                           target=_target(args), queue_action_type=name,
                           queue_payload=args)
        if not ok:
            out = _denied_or_parked(sess, tool, args)
        else:
            out = tool.run(sess, args)
            log_event(sess, "tool", verb=name, target=_target(args),
                      summary=tool.summary(args, out), _full=_full_text(out))
    finally:
        rt._track_root.reset(token)
    return _with_context_warning(sess, out)
```

The write path's `prior_state` capture, the `on_write` callback, `send_message`'s `append_denied` on refusal, and `reset_self`'s `allow_agent_reset` refusal all move into the row's `run` or `prompt` callables. Nothing gets lost; it changes address. `_resolve_gate` is unchanged. `queue_action_type` values stay what they are today (`write`, `run`, `read`, `fetch`, `send`, `request`, `reset`, `remember`, `recall`, `screen`, `web_open` ...), because server.py's `_execute_queue_entry` switches on them. Put that name on the row as `queue_type`.

`_agent_loop_body` uses `tools.detect_text` and `tools.detect_native`. `effective_mode` comes from B's provider `tool_mode`.

policy.py `_default_rows()` becomes `[{"edge": e, "driver": "model", "scope": s, "hook": "ask"} for e, s in tools.gate_edges()] + [default human row]`. The `check_read` outside row is in `gate_edges()` because `read_file`, `list_files`, `view_image` declare scope callables that return outside when the path leaves the root. `reset_self` and `reset_region` are in the defaults now; they were missing from policy.json on disk. Delete policy.json once and let `_load` regenerate it, then confirm the regenerated file has every edge.

tracks.py `default_overlay_rows()` and `gate_edge_list()` read `tools.gate_edges()`. `stack_gate_edges` reads `tools.CLAUDE_NATIVE_EDGES`.

## PART 2 — CONTEXT TIERS

compiler.py owns every text that reaches a model except the per-turn root line in `_agent_loop_body` and the tool table's own hints.

### 2a. Tiers and their files

| tier | source | content |
|---|---|---|
| global | injections/global/preamble.md | who the suite is, house rules. Move today's injections/preamble.md here. |
| global | tools.text_hint() | capabilities, only when provider.tool_mode is text |
| global | one root note | `"Your workspace root is: {root}. Relative paths resolve there. Reaching outside the workspace needs approval each time."` One function `root_note(root)`. The three copies today become one. |
| session | injections/session/ade.md | the room rules. Move today's injections/shells/ade.md here. Delete conference.md and ide.md. |
| session | injections/skills/*.md | unchanged files. The `**Applies:**` line loses its shell clause: parse `seat` only. `_shell_matches` goes away. |
| track | agent/<folder>/persona.md, usermemory.md, agentmemory.md, memories/ | unchanged, keyed by seat |
| track | legend block | crew tags, unchanged |
| region | self block | id and name, unchanged |
| region | peers block | unchanged |
| region | injections/models/<tag>.md | the model blurb, unchanged |
| region | task | caller supplied |

### 2b. One builder

```python
def build_context(sess, *, root, region_id, region_name, task="") -> (system, context)
```

Assembly order for `system`: global preamble, legend, model blurb, capabilities plus root note, self block, peers block, persona, usermemory, agentmemory, memory store pointer. For `context`: session file, matching skills, task. Joiner unchanged.

When `sess.nick` is empty, the builder still runs. The legend and persona sections are skipped, and the `## Who you are` fallback is skipped. The capabilities section for a native-tool provider is one sentence naming the tools by name from the table, not the text hint.

`agent_loop.reseat` becomes `rebuild_context(sess)`: strip the tagged context message, call `build_context`, write `messages[0]` and the tagged context message. `system_message` and `_worker_system_message` are deleted. Every `al.reseat(` call site in ade/tracks.py becomes `al.rebuild_context(`. The `shell=` argument disappears.

`compile_injections` is deleted. `remember`, `resolve_agent`, `load_roster`, `roster_entries`, `resolve_tag`, `vessel_handle`, `self_block`, `_peers_block`, `set_peers_provider` stay.

### 2c. Agent folder

A fetched `agent/` with `roster.json` and three agent folders. `AGENT_DIR` stays `SUITE_ROOT/agent`. Verify `resolve_agent` finds each roster entry's folder and put the three names in the receipt.

## PART 3 — TESTS

tests/test_tools.py:
- every row has a non-empty `name`, `edge`, `schema`, `hint`, callables for `scope`, `prompt`, `run`, `summary`.
- every row with a marker: build a sample reply from its hint's shape, `detect_text` returns that row's name and the parsed args.
- `gate_edges()` contains `("check_read", "inside")`, `("check_read", "outside")`, `("write_file", "any")`, `("reset_self", "any")`, and no `logic_` edge.
- `policy._default_rows()` edge set equals `gate_edges()` edge set plus `default`.
- `text_hint()` contains every marker keyword once.
- `execute_tool` on an unknown name returns the refusal string; on a `needs_region` tool with no region returns the refusal string. No gate is touched (stub `_resolve_gate`).

tests/test_context.py:
- `build_context` with no seat produces a system string containing the root note and the self block, and no persona heading.
- with a seat that exists in `agent/roster.json`, the persona heading is present.
- a native provider gets the one-sentence tool list, a text provider gets the marker hint.
- context contains the session file text and only the skills whose Applies line names the seat or every seat.

All tests run offline with a stub session object.

## RECEIPT

Docs/Reports/RECEIPT-C-tools-context.md. Sections: EDITS, DELETED, TOOL TABLE (names and edges as built), CONTEXT ORDER (as built), AGENT FOLDERS FOUND, QUESTIONS, STRAY FILES.
