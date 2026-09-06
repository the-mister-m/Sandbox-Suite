# HANDOFF — Phase 1 session agent

Written 2026-09-05 by the session agent that read the whole Phase 1 tree and wrote the three specs. Read this before anything in the codebase.

## READ ORDER

1. MEMORY.md top block. Stop.
2. SESSIONLOG.md last entry.
3. This file.
4. Docs/Scope/SCOPE-sandbox-cleanup.md (110 lines).
5. The spec for the agent you are about to spawn, and the receipt of the agent before it.

Do not read engine/, ade/, or server.py yourself. The specs carry read ranges for the builders. If a builder's receipt raises a question you cannot answer from this file and the scope, grep for the one symbol, then ask Brandon.

## WHAT THIS PROJECT IS

Sandbox Suite is the LLM Sandbox copied over and stripped of comments on 2026-09-05. The ADE (tracks, regions, gates, ledger, waypoint mail) is the product. Phase 1 rebuilds the engine underneath it: providers, settings, context, tools. Phase 2 is the widgets and JavaScript. The JavaScript in static/ is untouched until phase 2 and still expects the old wire names; every spec keeps the wire names alive.

## THE THREE BUILDS

| agent | spec | model | starts when |
|---|---|---|---|
| A | Docs/Specs/SPEC-A-foundation.md | Sonnet + Redpen | now |
| B | Docs/Specs/SPEC-B-engine.md | Opus | RECEIPT-A exists |
| C | Docs/Specs/SPEC-C-tools-context.md | Opus | RECEIPT-B exists |

Receipts land in Docs/Reports/. Each builder updates INDEX.md and SESSIONLOG.md. The Closer runs after C.

Spawn prompt shape: "You are agent X. Read Docs/Specs/SPEC-X.md and the receipts it names. Build it. Nothing outside it. Leave the receipt it names." Nothing more.

## DECISIONS ALREADY MADE (facts, not for re-litigation)

- Providers: Ollama, Gemini, Claude. Nothing else. Re-adding one later is one class plus one Router line (SPEC-B 1e).
- Settings live on the region. A preset is a snapshot copied onto a region. No live link between a preset file and a running region.
- Any settings change resets the region. Default on for cloud providers, off for local. Per-region toggle `reset_on_change`. Name and gate edits never reset.
- Model is a region choice. Picker data is Provider, Model, Version rows.
- Track is a lane: name, root, order, its regions. Nothing else stored on it.
- Global is the home of the library, the preset editor, the model manager, and voices. Engine side only this phase; the UI is phase 2.
- A saved session or template carries every region's full settings bag.
- Claude's own settings-file layering folds into the Claude block. Hooks stay as they are.
- Channels concept is gone. Browser tools stay as plain rows in the tool table. Logic Pro is gone.
- One tool is one row in engine/tools.py. No loader, no discovery. The library reads that list later.
- Shells concept is gone. `ade/` is a top-level package. Daemon, conference, IDE server code is deleted.
- Speech stays. speech.py comes over unchanged. Voice settings move to global `voices.*`.
- Agent folder (personas) comes over.
- Reset language: agent caches close and reset. Machines get killed, mail dead-letters, the killswitch is a killswitch. Vocabulary table is in SPEC-A Part 4. The word "closed" for a retired region cache was my choice; Brandon can veto before A spawns.
- The word "spine" is banned everywhere.

## DEFERRED, WITH WHAT NOT TO BREAK

Swap tool (Brandon's own session):
- An ADE-only tool that changes a region's settings mid-run. It must go through `Region.apply_edits` so `reset_on_change` decides whether the region resets. Reserve the tool name `swap`. Do not add a row for it now.

Initiate:
- Already exists. `rt.initiate` walks the plan cables in ade/tracks.py (`_initiate_cable_walk`). Nothing to build.

Claude native tools plus ADE tools:
- On the tools-ON rail Claude uses its own Read, Write, Bash through the hook. It cannot see `send_message`, `web_open`, `reset_self`. A bridge would be an MCP server exposing the tool table. Not built. Do not fake it through the hook script.

Chat pane latched to a track:
- Today `TrackHub` is per region and a connection anchors to one region. A track-level pane needs a hub that follows the track's current region across resets. `_fire_replaced` in ade/tracks.py is the event to follow. Phase 2.

Suite Page:
- Scope says phase 1 plus 2. Only `/` serving control.html exists. Library, preset editor, model manager, voices UI are phase 2 JavaScript. The engine side (global.json blocks, preset IO, model rows) is built by B.

Speech rewrite:
- Brandon wants fresh TTS and STT models eventually. This phase only moves speech.py over and moves its settings to global. Do not put speech keys back into the region bag. Voice choice becomes a chat-window setting in phase 2.

IDE chat settings:
- The IDE pane JavaScript sits at Docs/reference/ide-panes/ (A copies it). Phase 2 reads it to decide which chat settings come over. Never serve it.

JavaScript death words:
- Python is renamed by A. These JS files still say kill or dead and still send `kill_track`: static/js/control.js, killswitch.js, gatematrix.js, static/js/ade/timeline.js, ledgerview.js, queuelog.js, retiredwin.js, boot.js. A keeps `kill_track` accepted as an alias. Old ledger records on disk carry outcome `"killed"`; ledger views must accept both.

Model manager UI:
- global.json gets `models.order` and `models.hidden`. Router honors `hidden`. The editor is phase 2.

Retired chats:
- `/ade/retired`, `/api/retired-chats`, retiredwin.js show past caches. Kept. "Retired" is not death language.

Step mode:
- `step`, `gate_read`, `gate_list` were an observability pause. C deletes them. Brandon did not ask for this; it is a consequence of "gating is the policy table only". Listed in the receipt questions.

Open questions Brandon has not answered:
- Should a cache TTL change reset a cloud region under `reset_on_change`? It does under the rule as written, because it is a Claude spawn field.
- "closed" as the word for a retired region cache.
- `claude_mode` oneshot: kept because it is real, unused by Brandon as far as the session showed.

## AFTER C

- Run `python3 -m pytest tests/ -q`. Everything green.
- Start the server, open /ade, add a track with an Ollama model, send one message, confirm a turn completes. Then one with Claude tools OFF. Then one with Claude tools ON and confirm the hook gate fires.
- Write the session review. Spawn the Closer.

## FILE MAP AFTER PHASE 1 (expected)

```
server.py                 Flask, ADE socket, API routes
engine/
  settings.py             one settings table, global loader, preset IO
  providers.py            Router + Ollama, Gemini, Claude
  ollama_provider.py
  tools.py                the tool table
  tools_web.py            browser executors
  read_tool.py            file, shell, fetch, memory, mail executors
  compiler.py             build_context
  agent_loop.py           Session, run_turn, gate resolve, execute_tool, loop body
  policy.py               gate table + Claude native edge map
  daemon_queue.py, ledger.py, waypoint.py, web_io.py
ade/
  tracks.py, frames.py, rails.py, web_io.py
hooks/ade_pretooluse_hook.py
agent/                    personas
injections/global/, injections/session/, injections/skills/, injections/models/
library/presets/
speech.py
static/                   phase 2
tests/
```
