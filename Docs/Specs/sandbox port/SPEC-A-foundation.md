# SPEC A — FOUNDATION: fetch, purge, server, reset language

Builder: Sonnet. Verifier: Redpen (greps only, no edits).
Order: first of three. B and C do not start until A's receipt is in.
Scope source: Docs/Scope/SCOPE-sandbox-cleanup.md, Phase 1.

## GUARDRAILS

- Touch only the files named in each part. Anything else goes in the receipt as a question.
- Boot stays green after every part: `python3 -c "import server"` must succeed.
- Code comments: label, function, state. Nothing else. No history, no reasoning, no names.
- No README. No new concepts. No new folders beyond the ones named here.
- The word "spine" appears nowhere: not in code, not in docs, not in the receipt.
- Do not touch static/ except the two fetches named below. JavaScript is phase 2.
- Do not touch engine/providers.py, engine/settings_stack.py, engine/read_tool.py logic, engine/compiler.py. Those belong to B and C. A edits strings in read_tool.py only where Part 4 names them.
- Receipt goes to Docs/Reports/RECEIPT-A-foundation.md. Update INDEX.md and SESSIONLOG.md.

## PART 1 — FETCH

Source root: `/Users/moth3rship/Desktop/AI Design/LLM Sandbox/`
Target root: `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/`

Copy, do not move:

| source | target | why |
|---|---|---|
| speech.py | speech.py | server.py voice routes import it |
| agent/ (whole folder) | agent/ | compiler.py reads roster.json and per-agent folders |
| static/ade-retired.html | static/ade-retired.html | server.py route references it, retiredwin.js exists |
| static/js/panes/ | Docs/reference/ide-panes/ | read-only reference for phase 2 chat settings, never served |
| static/js/shell.js | Docs/reference/ide-panes/shell.js | same |

After copying, verify `python3 -c "import speech"` from the Sandbox Suite root. If speech.py imports something not present, list it in the receipt; do not chase it.

Fix one filename: `injections/models/gemma4-12b-mxfp8` has no extension. Rename to `gemma4-12b-mxfp8.md`.

## PART 2 — PURGE

Delete from the Sandbox Suite root:

- sessions/ (34 legacy IDE saves, entire folder)
- log.jsonl
- waypoint.jsonl
- queue.json
- .sessions_index.json
- .sandbox_config.json
- archives/ and logs/ (both empty; code recreates on demand)
- every __pycache__ folder
- every .DS_Store
- static/js/ade/.backups/
- shells/ (after Part 3 moves what stays)

Keep: .env (never commit it), machines.json, requirements.txt, global.json, policy.json.

Create `.gitignore`:

```
.env
.DS_Store
__pycache__/
*.pyc
log.jsonl
queue.json
waypoint.jsonl
archives/
logs/
sessions/
.sessions_index.json
.sandbox_config.json
.backups/
*.stripped
```

Git: after Parts 1 through 4 pass, make the first commit on main. Message: `Phase 1 A: foundation`. Nothing else in the message.

## PART 3 — SERVER AND SHELLS

### 3a. Shells folder goes away

- Move `shells/ade/` to `ade/` at the root. Update every import: `from shells.ade import X` becomes `from ade import X`. Files that import it: server.py, ade/frames.py, ade/tracks.py, ade/rails.py, ade/web_io.py.
- `shells/terminal/interrupt_py.py`: do not move. Replace the import in engine/agent_loop.py line 14 with an inline no-op:

```python
@contextlib.contextmanager
def _default_stop_key_watch():
    yield lambda: False

_DEFAULT_STOP_LABEL = "Stop"
```

Add `import contextlib` to agent_loop.py. Keep the names `_default_stop_key_watch` and `_DEFAULT_STOP_LABEL` so `Session.__init__` needs no change.

- Delete `shells/`.

### 3b. server.py

Remove these imports and everything that depends on them:

- `from engine import worker_transports as wc` and both `/worker/...` routes.
- `from shells.conference import ...` (three lines), `_rooms`, `_rooms_lock`, `ws_room_handler`, `ConfMemberWebIO`, `/api/rooms` GET and DELETE.
- `from shells.daemon import frames as daemon_frames` and `ws_daemon_handler`.
- `from shells.ide import ...` (two lines), `ws_handler` (the `/ws` route), `IdeWebIO`.
- `/ide`, `/daemon` page routes.
- `/api/saves` GET, `/api/saves/<save_id>` DELETE, `/api/saves` DELETE (IDE transcript saves; ADE uses archives).
- `/__debug_initiate/<region_id>`.
- `/api/ledger/<rid>` (reads schema 1 only; dead).

Keep: `/`, `/ade`, `/ade/ledger`, `/ade/retired`, `/ade/arrange`, every `/api/global`, `/api/policy*`, `/api/settings*`, `/api/claude/*`, `/api/fs/*`, `/api/voices*`, `/api/ade-*`, `/api/retired-chats*`, `/api/end-all*`, `/api/unload-weights`, `/api/kill-hosts`, `/api/shutdown-suite`, `/api/sessions`, `/ws/ade`.

Redpen check before anything is removed: grep `static/js` and `static/*.html` for every `/api/` and `/ws` string. Any route the JavaScript calls stays, even if listed above. Report the list in the receipt.

`_registry` stays (the gate notifier uses it). `MonitoredWebIO` stays. `AdeMemberWebIO` stays.

### 3c. claude_sdk.py

engine/claude_sdk.py imports the `claude_agent_sdk` package at module top and server.py imports claude_sdk. The SDK rail is unbuilt. Move these four things into engine/policy.py, unchanged: `TOOL_EDGES`, `edge_for`, `target_of`, `scope_of` (scope_of needs `from engine import read_tool as rt`). Update server.py and ade/tracks.py (`stack_gate_edges`) to import them from policy. Delete engine/claude_sdk.py.

### 3d. Boot test

Create `tests/test_boot.py`:

```python
def test_import_server():
    import server

def test_ade_page():
    import server
    client = server.app.test_client()
    assert client.get("/ade").status_code == 200
```

Run with `python3 -m pytest tests/ -q`. Both pass before Part 4 starts.

## PART 4 — RESET LANGUAGE

Principle: an agent's cache closes and can reset. Machines and processes still get killed. Mail still dead-letters.

### Stays as is (do not touch)

killswitch, kill_holds, `_pkill`, `api_kill_hosts`, `dead_letter_all`, `dead-letter` receipts, `deadlock`, `deadline`, `KillShell` (a Claude tool name), `proc.kill()`, `os.killpg`, `SIGKILL`, `terminate()`.

### Rename table (Python only, JavaScript is phase 2)

| old | new | files |
|---|---|---|
| `kill_region()` | `close_region()` | ade/tracks.py, ade/frames.py, server.py |
| `Region.kill()` | `Region.close()` | ade/tracks.py |
| `Region._killed` | `Region._closed` | ade/tracks.py, ade/frames.py |
| lifecycle event `"killed"` | `"closed"` | ade/tracks.py (write side) |
| `_graveyard`, `graveyard_rows()` | `_closed_rows`, `closed_rows()` | ade/tracks.py, ade/web_io.py, server.py |
| waypoint prober status `"killed"` | `"closed"` | server.py `_waypoint_track_prober`, engine/waypoint.py `append_message` |
| `"that track has been killed"` | `"that region was closed; its cache is gone"` | engine/read_tool.py, server.py |
| `"[track was killed — anchor another]"` | `"[region closed — anchor another]"` | ade/frames.py |
| `"[reset: that region has been killed]"` | `"[reset: that region is closed]"` | ade/tracks.py |
| `"were NOT delivered — that track was killed before it read them"` | `"were NOT delivered — that region was closed before it read them"` | ade/tracks.py |
| `results["regions_killed"]` | `results["regions_closed"]` | server.py |
| daemon_queue `terminate_session` outcome `"killed"` | `"closed"` | engine/daemon_queue.py |
| `_reset_to_scratch`, `_halt_live_world` set `_killed` | `_closed` | ade/tracks.py |

Wire names the JavaScript sends: keep `kill_track` as the frame type in ade/frames.py. Add `close_track` as a second accepted name for the same branch. Phase 2 renames the sender.

### Archive compatibility

Old master.json files carry `"event": "killed"`. Add one helper in ade/tracks.py:

```python
def _is_closed(row):
    return any(e.get("event") in ("killed", "closed")
               for e in row.get("lifecycle", []))
```

Use it in `_read_master`, `_world_from_master`, and in server.py `api_ade_sessions`, `api_retired_chats`, `api_ade_templates`. Old archives must still load.

### Redpen verification

```
grep -rniE "kill|dead|death|grave|murder|reap" --include="*.py" engine ade hooks server.py speech.py
```

Every remaining hit must be on the "stays as is" list or a false positive (`skill`, `deadline`, `deadlock`). Paste the full hit list into the receipt.

## RECEIPT

Docs/Reports/RECEIPT-A-foundation.md. Sections: EDITS (clickable links), ROUTES KEPT BY JS GREP, LANGUAGE GREP HITS, STRAY FILES, QUESTIONS. Same shape as the session review block in the global rules.
