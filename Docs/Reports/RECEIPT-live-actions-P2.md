SESSION REVIEW — Sandbox Suite — 2026-09-14 (subagent, no clock access — times unavailable)

(clickable links only — no code blocks, no restating)

EDITS
- [server.py:608](server.py#L608) — `_live_tool_row`: pushes a live tool card row through `region.hub.tool(row)`, id = tool_use_id, gate colors green/blue/red/yellow
- [server.py:668](server.py#L668), [server.py:675](server.py#L675), [server.py:683](server.py#L683), [server.py:692](server.py#L692), [server.py:698](server.py#L698), [server.py:719-721](server.py#L719) — resolve-hook calls `_live_tool_row` per branch (open/locked/queue/queue-non-blocking/ask-pending/ask-settled); queue and ask branches now capture `entry` for `gate_id`
- [server.py:754-758](server.py#L754) — record-tool-outcome pushes `{id, result}` through `region.hub.tool` after the existing ledger write
- [static/js/widgets/shared/turns.js:119-172](static/js/widgets/shared/turns.js#L119) — `makeToolBlock` stores refs on the card (`details._live`), renders approve/deny/queue via `MX.gates.settleButtons` when `row.gate === 'yellow'` and `row.gate_id` is set and a frame is passed; new `updateToolBlock(details, patch)` flips gate color and result text in place, drops the buttons once no longer pending
- [static/js/widgets/chat/anchor-chat/anchor-chat.js:758-810](static/js/widgets/chat/anchor-chat/anchor-chat.js#L758) — `_liveTools` id→card map (reset on `setTrack`/`renderTranscript`); `appendTool` updates the existing card when `row.id` is known, else appends as before; native rail rows (no `id`) untouched

GOALS DONE
- Claude rail tool cards now appear mid-turn, as soon as the gate decides (open/locked/queue/ask), and update in place when the result lands — both rails, native path unchanged (agent_loop.py:603 untouched).
- Step 5 (approve/deny inside the card) done: reused `gate-common.js`'s `settleButtons` (sends the existing `gate_action` frame) for buttons, and the same id-matched `region.hub.tool` row update already built for steps 1-4 flips the card's color when the ask branch's `await_answer` returns — no new frame type or extra plumbing needed.

VERIFIED
- `python3 -m py_compile server.py` — OK
- `node --check static/js/widgets/shared/turns.js` — OK
- `node --check static/js/widgets/chat/anchor-chat/anchor-chat.js` — OK
- Not run in a browser; no headed pass this session.

NEEDS A RESTART
- server.py changes (new route logic) need a server restart to take effect. Not restarted per scope.

KNOWN LIMIT — reported, not fixed
- `renderTranscript` clears the pane and the `_liveTools` map on follow/join (anchor-chat.js:768-773 area). Claude transcripts carry no tool rows, so live cards vanish on re-follow, same as scope's KNOWN LIMIT note.

STRAY FILES
- none

BRANDON'S TODOS
- none

CLOSER REVIEW
- Gets copy of review, not a contract.
- Confirm gate color vocabulary (green/blue/red/yellow) reads right in the browser once restarted — Brandon
- Fold into MEMORY.md / INDEX.md per normal close — closer
