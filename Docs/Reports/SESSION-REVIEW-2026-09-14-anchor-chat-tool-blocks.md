SESSION REVIEW — Sandbox Suite — 2026-09-14T00:48Z to 01:57Z

EDITS
- [agent_loop.py](../../engine/agent_loop.py) — `_resolve_gate` sets `sess._gate_color` per outcome (open green, ask yes blue, locked or ask no red, queue/timeout/parked/deferred white); `execute_tool` starts red; budget refusal red; each tool result message carries `_tool` {name, target, args, gate, ts}; `io.tool` sends the row plus result
- [tracks.py](../../ade/tracks.py) — MirrorView.tool sends mirror kind `tool`; TrackHub.tool fans out
- [web_io.py](../../engine/web_io.py) — `tool()` no-op, mirror carries the stream
- [turns.js](../../static/js/widgets/shared/turns.js) — `makeToolBlock` (collapsed row: gate-colored name, target, time; open: in/out boxes); `_groupTurns` keeps `_tool` results as `turn.tools`; `_buildTurnBlock` draws them only with `opts.tools`
- [anchor-chat.js](../../static/js/widgets/chat/anchor-chat/anchor-chat.js) — `pane.appendTool` for live mirror `tool` frames; reload passes `{ tools: true }`; tool block CSS, in/out boxes capped at 4 lines with scrollbar, refused block tinted red
- [HOWTO-frames.md](../HOWTO-frames.md) — mirror kind `tool` row

STRAY FILES
- [library/grids/410ef20f1a9d/w-ah9qepoj.json](../../library/grids/410ef20f1a9d/w-ah9qepoj.json) — saved grid state changed by the running app, not this session's edit

GOALS DONE
- Anchor Chat shows each tool call as a collapsed block, opened by the user
- Block badge matches the changes widget's gate colors; refused tools red, parked white
- In/out boxes 4 lines max with scrollbar
- Colors survive a reload

BRANDON'S TODOS
- Restart the server to load agent_loop.py, tracks.py, web_io.py
- Reload the page to pick up Anchor Chat's injected styles

CLOSER REVIEW
- Gets copy of review, not a contract.
- Not run in the browser; py_compile and node --check clean only — closer
- Live blocks land between reply chunks; reloaded blocks group above the turn's reply bubble — Brandon
- Dim lines left as they were, by Brandon's call — closer
- Transcripts saved before this session have no `_tool`, so their tool results stay hidden on reload — closer
- Ledger and transcript widgets share turns.js and do not draw tool blocks — closer
