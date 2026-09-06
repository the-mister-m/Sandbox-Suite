# RECEIPT — SPEC C tools and context

Boot green. `python3 -m pytest Docs/tests/ -q` — 53 passed (33 inherited + 20 new).
No git actions taken (no commits, no staging, no branches) per the launch instruction.

## PREREQUISITE

[RECEIPT-B2-fixes.md](RECEIPT-B2-fixes.md) exists; `/api/settings/resolved` returns
`provenance` ([server.py](../../server.py) line 943). SPEC-B2 was not rebuilt.

## EDITS

- [engine/tools.py](../../engine/tools.py) — new. `Tool`, `TOOLS` (19 rows), `TOOL_INDEX`,
  `tool_schema`, `text_hint`, `tool_names`, `detect_text`, `detect_native`,
  `gate_edges`, `CLAUDE_NATIVE_EDGES`. Pushes the marker keywords into
  read_tool at import.
- [engine/tools_web.py](../../engine/tools_web.py) — moved from channels/webbrowser.py. Dropped
  `EDGES`, `STUBS`, `AUTH_NOTE`, `capabilities`, `receive`, `render_a_gate`,
  and the `channel_registry.register` call. `atexit.register(disconnect)` and
  `_state` kept.
- [engine/read_tool.py](../../engine/read_tool.py) — markers, `_BASE_HINT`, `TEXT_SYSTEM_HINT`,
  `TEXT_WORKER_HINT`, `detect_text`, `NATIVE_TOOLS`, `detect_native`,
  `ATTEMPTED_MARKER` removed. `set_marker_keywords(words)` added; it compiles
  the alternation `detect_malformed` uses. Executors, setter hooks,
  `result_text`, `result_native`, `malformed_hint`, `detect_malformed` kept.
  1321 lines → 654.
- [engine/agent_loop.py](../../engine/agent_loop.py) — twenty `approve_*` functions, `approve_step`,
  `_execute_tool` and `GATE_EDGES` deleted; one `execute_tool` in their place
  with `_target`, `_full_text`, `_queue_payload`, `_denied_or_parked`.
  `system_message`, `_worker_system_message` deleted; `reseat` →
  `rebuild_context(sess)`. `tool_schema()` returns `tools.tool_schema()`.
  `_agent_loop_body` calls `tools.detect_text` / `tools.detect_native` and
  lost the per-tool step branch. 1061 lines → 494.
- [engine/compiler.py](../../engine/compiler.py) — `compile_injections` → `build_context(sess, *, root,
  region_id, region_name, task="")`. `root_note(root)` added, `_tool_mode`
  and `_capabilities` added, `_shell_matches` deleted, `_applies` parses the
  seat clause only, `_skills(nick, has_folder)`. Tier files now read from
  `injections/global/preamble.md` and `injections/session/ade.md`.
- [engine/policy.py](../../engine/policy.py) — `_default_rows()` is built from `tools.gate_edges()`
  plus the human default row. `TOOL_EDGES` is now
  `from engine.tools import CLAUDE_NATIVE_EDGES as TOOL_EDGES`, so
  `policy.edge_for` / `scope_of` / `target_of` and the pretooluse hook are
  unchanged.
- [ade/tracks.py](../../ade/tracks.py) — `default_overlay_rows`, `gate_edge_list` and
  `model_gate_edges` read `tools.gate_edges()`; `stack_gate_edges` reads
  `tools.CLAUDE_NATIVE_EDGES`; three `al.reseat(self.sess, shell="ade")` call
  sites became `al.rebuild_context(self.sess)`.
- [injections/global/preamble.md](../../injections/global/preamble.md) — moved from injections/preamble.md.
- [injections/session/ade.md](../../injections/session/ade.md) — moved from injections/shells/ade.md.
- [policy.json](../../policy.json) — deleted and regenerated; 19 rows, every edge in
  `gate_edges()` plus `default`. No `logic_` row.
- [Docs/tests/test_tools.py](../tests/test_tools.py), [Docs/tests/test_context.py](../tests/test_context.py) — new, 20 tests, all offline.
- [Docs/tests/test_region_edit.py](../tests/test_region_edit.py) — `_await_replacement` helper added; see QUESTIONS 6.

## DELETED

- channels/ — the whole folder (`__init__.py`, `logicpro.py`, `webbrowser.py` moved).
- engine/channel_registry.py.
- injections/shells/conference.md, injections/shells/ide.md, and the now-empty
  injections/shells/.
- injections/skills/logic-pro.md — see QUESTIONS 1.
- The four logic tools: markers, schemas, hints, `approve_logic_*`, policy
  rows, gate edges. `grep -rn "logic_\|logicpro"` over `*.py` returns only the
  assertions in test_tools.py that check they are gone.
- The six settings keys RECEIPT-B parked for C: `list_recursive`, `list_size`,
  `list_hidden` (were read in `_execute_tool`), `gate_read`, `gate_list`,
  `step` (were read in `_agent_loop_body`). No reader is left.

## TOOL TABLE

19 rows, in table order. `queue_type` is the name server.py's
`_execute_queue_entry` switches on.

| name | edge | scope | queue_type | needs_region | fenced |
|---|---|---|---|---|---|
| write_file | write_file | any | write | | ✓ |
| send_message | send_message | any | send | ✓ | ✓ |
| remember | remember | any | remember | | ✓ |
| run_command | run_command | any | run | | |
| view_image | check_read | inside/outside | read | | |
| screen_capture | screen_capture | any | screen | | |
| fetch_url | fetch_url | any | fetch | | |
| recall | recall | any | recall | | |
| web_open | web_open | any | web_open | | |
| web_read | web_read | any | web_read | | |
| web_screenshot | web_screenshot | any | web_screenshot | | |
| web_act | web_act | any | web_act | | |
| web_eval | web_eval | any | web_eval | | |
| initiate | initiate | any | initiate | ✓ | |
| reset_region | reset_region | any | reset | | |
| reset_self | reset_self | any | reset | ✓ | |
| request_messages | request_messages | any | request | ✓ | |
| read_file | check_read | inside/outside | read | | |
| list_files | check_read | inside/outside | read | | |

`gate_edges()` — 18 pairs: write_file/any, send_message/any, remember/any,
run_command/any, check_read/inside, check_read/outside, screen_capture/any,
fetch_url/any, recall/any, web_open/any, web_read/any, web_screenshot/any,
web_act/any, web_eval/any, initiate/any, reset_region/any, reset_self/any,
request_messages/any.

## CONTEXT ORDER

`build_context` → `system`:

1. injections/global/preamble.md
2. legend block (skipped when there is no seat)
3. `## Your current vessel` — injections/models/&lt;tag&gt;.md, or the fallback line
4. `## Your capabilities` — `tools.text_hint()` for a text provider, the
   one-sentence tool list for a native one — then `root_note(root)`
5. `## Who you are here` (self block)
6. `## Your peers`
7. `## Your persona`
8. `## Memories the Captain holds for you`
9. `## Your own memories`
10. memory store pointer

`build_context` → `context`: injections/session/ade.md, matching
injections/skills/*.md, task. Joiner is unchanged (`\n\n---\n\n`).

## AGENT FOLDERS FOUND

`AGENT_DIR` is `SUITE_ROOT/agent`. Three folders on disk:

- `agent/scotty` — roster entry "Scotty" (tag S1); `resolve_agent("Scotty")` resolves.
- `agent/ford` — roster entry "Ford" (tag F1); `resolve_agent("Ford")` resolves.
- `agent/Aglaya` — **empty, and not in roster.json.** No persona.md,
  usermemory.md, agentmemory.md or memories/. `resolve_agent("Aglaya")`
  returns None. Every roster entry resolves; the third folder is not a roster
  entry.

## QUESTIONS

Where the spec was silent I took the smallest thing. Each of these is a
judgment call, not a rule I invented.

1. **injections/skills/logic-pro.md was deleted.** The spec's "remove every
   trace" list names markers, schemas, hints, approve functions, policy rows,
   gate edges and channels/logicpro.py — not the skill file. Leaving it would
   have injected a paragraph instructing models to use four tools that no
   longer exist. injections/ is on the editable list, so I deleted it. Say the
   word and it comes back.

2. **Four fields beyond the spec's sketch.** `queue_type` the spec required by
   name. I added three more: `keyword` (the marker's literal word — feeds
   read_tool's malformed alternation and the hint test), `queue_identity`
   (`"sender"` / `"requester"` / `"caller"` — server.py's queue executor reads
   those keys off the payload, and `queue_payload=args` alone would have sent
   a queued approved message from nobody), and `denied` (send_message and
   request_messages must write `waypoint.append_denied` on refusal; that can
   only live on the denial path, and `run` is never reached when the gate says
   no).

3. **Pre-gate refusals became post-gate refusals.** `reset_self`'s
   `allow_agent_reset` check, `send_message`'s receiver/body validation, and
   `remember`/`recall`'s "no identity bound" all ran before the gate today.
   The spec says they move into `run`, so a human is now asked to approve a
   send with malformed receivers, and only then told it was refused. Followed
   the spec; flagging the UX cost. `needs_region` is the one refusal that
   still fires before the gate.

4. **`initiate` is gated now; it was ungated.** It had no `approve_*` call and
   no GATE_EDGES entry. The new dispatch gates by the policy table only, and
   an edge with no row resolves to `ask` anyway — so it was going to be gated
   either way. Giving it a real row at least makes it visible and
   configurable. Its default hook is `ask`.

5. **Log fields moved to a per-row extras dict.** The spec's dispatch logs
   `summary=tool.summary(...)` and `_full=_full_text(out)` only — which would
   have dropped write's `prior_state` and its content-as-`_full`, read's and
   list's `detail`, and the fixed targets (`"browser"`, the caller's region
   id). A row's `run` now sets `sess._tool_log = {...}` and the dispatch
   merges it over the generic fields. One seam, nothing lost. The one addition
   is that every tool now writes `_full` where before only read/run/fetch did;
   log.jsonl grows a little.

6. **I edited another agent's test.**
   `test_setting_edit_with_reset_on_change_replaces_the_region` in
   Docs/tests/test_region_edit.py checked for the fresh region the instant the
   old one disappeared. `_do_reset` calls `close_region` then
   `insert_region`, so there is a real window between the two, and
   `rebuild_context` (which reads the preamble, the skills folder, the roster
   and the persona files on every region birth, where the old `reseat` with no
   seat built a two-line string) widened it enough to fail every run. I added
   an `_await_replacement` helper rather than touch the assertion or the
   reset ordering in tracks.py, which is not on my editable list. The
   underlying race is older than this spec and is still there.

7. **compiler duplicates one line of `Router.__init__`.** `build_context` has
   to know whether the provider is native or text, and its signature takes no
   client. `_tool_mode` calls `providers._provider_for(model)` and matches the
   kind against `OllamaProvider` / `GeminiProvider` / `ClaudeProvider` by
   their `id`. engine/providers.py is off-limits, so the class list lives in
   compiler. Adding a fourth provider means touching compiler too.

8. **`text_hint()` lost its opening line.** `_BASE_HINT` began "You can read,
   list, and write files in the project." The spec says `text_hint()` is "the
   joined hints plus the closing workspace paragraph", so that line is gone.
   The read, list and write hints still say it.

9. **Gate log action names changed.** `_resolve_gate` is called with
   `action=name`, so the ledger now reads `read_file` / `list_files` /
   `view_image` where it read `read` / `list` / `boundary:read`. The
   `queue_action_type` values are unchanged, which is what server.py switches
   on.

## STRAY FILES

None. `requirements.txt` still pins `claude-agent-sdk` and carries a comment
naming the deleted `engine/claude_sdk.py` — flagged in RECEIPT-A and
RECEIPT-B, still not named for this part, still untouched.

Two things were moved by someone else during this session, noted so the Closer
is not surprised: `tests/` → `Docs/tests/` (Brandon, mid-session — my two new
test files went there), and one line added to
[Docs/Specs/SPEC-C-tools-context.md](../Specs/SPEC-C-tools-context.md) (the
SPEC-B2 precondition, which I followed).
