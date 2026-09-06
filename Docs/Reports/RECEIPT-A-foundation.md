# RECEIPT — SPEC A foundation

Boot green after every part. `python3 -m pytest tests/ -q` — 2 passed.
Commit `c00242d` — "Phase 1 A: foundation" — first commit on main.

## EDITS

- [speech.py](../../speech.py) — fetched from LLM Sandbox
- [agent/](../../agent/) — fetched whole folder
- [static/ade-retired.html](../../static/ade-retired.html) — fetched
- [Docs/reference/ide-panes/](../reference/ide-panes/) — fetched as read-only reference (panes/*.js + shell.js, flat)
- [injections/models/gemma4-12b-mxfp8.md](../../injections/models/gemma4-12b-mxfp8.md) — extensionless file renamed
- [.gitignore](../../.gitignore) — created
- sessions/, log.jsonl, waypoint.jsonl, queue.json, .sessions_index.json, .sandbox_config.json, archives/, logs/, __pycache__, .DS_Store, static/js/ade/.backups/ — deleted
- [ade/](../../ade/) — moved from shells/ade/; imports updated in [server.py](../../server.py), [ade/frames.py](../../ade/frames.py), [ade/tracks.py](../../ade/tracks.py), [ade/web_io.py](../../ade/web_io.py); stale path string fixed in [ade/rails.py](../../ade/rails.py)
- shells/ — deleted after the move
- [engine/agent_loop.py](../../engine/agent_loop.py) — interrupt_py import replaced with inline `_default_stop_key_watch` no-op, `import contextlib` added
- [server.py](../../server.py) — removed worker_transports routes, conference (`/ws/room`, `/api/rooms*`), daemon (`/ws/daemon`), ide (`/ws`, `/ide`, `/daemon`, IdeWebIO), `/api/saves*`, `/__debug_initiate`, `/api/ledger/<rid>`; `_rooms`/`_rooms_lock` removed; unused `fcntl`/`pty`/`termios` imports removed
- [engine/policy.py](../../engine/policy.py) — `TOOL_EDGES`, `edge_for`, `target_of`, `scope_of` moved in from claude_sdk.py
- engine/claude_sdk.py — deleted; server.py and [ade/tracks.py](../../ade/tracks.py) `stack_gate_edges` now import from policy
- [tests/test_boot.py](../../tests/test_boot.py) — created, 2 tests passing
- Part 4 rename table applied in [ade/tracks.py](../../ade/tracks.py), [ade/frames.py](../../ade/frames.py), [ade/web_io.py](../../ade/web_io.py), [server.py](../../server.py), [engine/waypoint.py](../../engine/waypoint.py), [engine/read_tool.py](../../engine/read_tool.py), [engine/daemon_queue.py](../../engine/daemon_queue.py) — `kill_region`→`close_region`, `Region.kill()`→`.close()`, `_killed`→`_closed`, `_graveyard`/`graveyard_rows()`→`_closed_rows`/`closed_rows()`, lifecycle event write→`"closed"`, waypoint prober status→`"closed"`, the four named user-facing strings, `results["regions_closed"]`, daemon_queue outcome→`"closed"`; `close_track` added as a second accepted frame type alongside `kill_track`; `_is_closed()` archive-compat helper added and used in `_read_master`, `_world_from_master`, `api_ade_sessions`, `api_retired_chats`, `api_ade_templates`

## ROUTES KEPT BY JS GREP

`grep -rn '/api/\|/ws' static/js static/*.html` returned: `/api/ade-sessions(/save)`, `/api/ade-templates`, `/api/claude/md-files`, `/api/claude/output-styles`, `/api/end-all`, `/api/end-all-turns`, `/api/fs/browse`, `/api/fs/read`, `/api/global`, `/api/kill-hosts`, `/api/policy`, `/api/retired-chats`, `/api/rooms`, `/api/saves`, `/api/settings/browse`, `/api/settings/read`, `/api/settings/resolved`, `/api/shutdown-suite`, `/api/unload-weights`, `/ws/ade`.

All match the keep list except `/api/rooms` and `/api/saves` — see QUESTIONS.

## LANGUAGE GREP HITS

`grep -rniE "kill|dead|death|grave|murder|reap" --include="*.py" engine ade hooks server.py speech.py` — 145 hits. Every hit is one of: the stays-as-is list (killswitch, kill_holds, `_pkill`, `api_kill_hosts`, `dead_letter_all`, dead-letter receipts, deadline, `KillShell`, `proc.kill()`, `os.killpg`, `SIGKILL`, `_kill_process`/`terminate`-adjacent), a literal process-kill message (ollama/llamacpp unload in agent_loop.py and server.py — machines/processes still get killed), the new `_is_closed(("killed", "closed"))` compat tuple, unnamed local variable names (`dead`, `killed`, `_dead`, `landed`, `_reaped`) not in the rename table, or false positives (`_skills`, `deadlocks` in a comment). engine/providers.py hits are in the off-limits file, untouched.

## STRAY FILES

None created outside what's named. `requirements.txt` still carries a comment block referencing `engine/claude_sdk.py` (now deleted) and pins `claude-agent-sdk` — not touched, not named for this part.

## QUESTIONS

- `/api/rooms` (GET, DELETE) and `/api/saves` (GET, DELETE `/api/saves/<id>`, DELETE `/api/saves`) are named for removal in Part 3b's table, but `static/js/control.js` (lines 36, 64) still fetches `/api/rooms` and `/api/saves`. Their backing module, `shells.conference` (persistence, frames, web_io), was never fetched into Sandbox Suite in Part 1 — it doesn't exist here, so restoring the routes would re-break the boot test. Left removed per the explicit table; flagging rather than guessing which instruction wins.
- `static/js/index.html`'s old IDE/room UI (served via `/` with `?room=`) now has no backing `/ws`, `/ws/room`, `/ide` routes since those were removed — expected under "JavaScript is phase 2," but noting it since `index()` itself wasn't named for editing.
