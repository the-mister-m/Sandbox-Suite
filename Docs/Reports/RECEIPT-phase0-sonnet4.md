# SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Sonnet 4 widget mirror — 2026-09-12 (timestamps: ask Brandon)

## EDITS

- [static/js/widgets/usertools/editor/editor.js](../../static/js/widgets/usertools/editor/editor.js) — onOption now accepts `tabs` and `active`; markDirty added on New, Open-arrival, tab switch, tab close, Save-As path assignment
- [static/js/widgets/usertools/viewer/viewer.js](../../static/js/widgets/usertools/viewer/viewer.js) — onOption now accepts `tabs`; markDirty added when closing a background (non-active) tab
- [static/js/widgets/chat/chat/chat.js](../../static/js/widgets/chat/chat/chat.js) — markDirty added at the four places `setRegion` fires internally (picker pick, roster auto-select, region removed, region replaced); `region`/`speech_enabled` onOption was already correct
- [static/js/widgets/usertools/browser/browser.js](../../static/js/widgets/usertools/browser/browser.js) — getOptions rewritten to actually emit `root` and `expanded` (was echoing an empty frame.options); onOption added for both; markDirty on root pick and folder expand/collapse
- [static/js/widgets/usertools/terminal/terminal.js](../../static/js/widgets/usertools/terminal/terminal.js) — onOption added for `region`/`tabs`/`active`; a mirrored tab reattaches to the same live shell key instead of spawning a new PTY; markDirty on new tab, close tab, tab switch
- [static/js/widgets/queue/queue/queue.js](../../static/js/widgets/queue/queue/queue.js) — onOption added for `claude_cache_ttl`/`claude_exclude_dynamic` (no internal mirror existed; these already saved through the options panel, no markDirty needed)
- [static/js/widgets/queue/mini-queue/mini-queue.js](../../static/js/widgets/queue/mini-queue/mini-queue.js) — onOption stub added; this type has no default options, nothing to apply
- [static/js/matrix/grid.js](../../static/js/matrix/grid.js) — `save()` retries once after one second on catch or non-ok; two failures set `saveFailed = true` and call `MX.setSurfaceState()`, a later success clears it and calls again; `adoptSurface`, `newSurface`, `unbindSurface`, and `load()` now call `MX.setSurfaceState()`
- [static/js/matrix/main.js](../../static/js/matrix/main.js) — `setState` split; the text builder is now `MX.setSurfaceState()`, reading socket state/sid, `MX.grid.surfaceName` (falls back to `MX.WINDOW_ID`), and `MX.grid.saveFailed` for the trailing `· unsaved`
- [static/js/matrix/socket.js](../../static/js/matrix/socket.js) — `bind()` and `close()` null out the old socket's `onmessage`/`onclose`/`onerror` before closing it with code 1000
- [engine/web_io.py](../../engine/web_io.py) — `_send()` now catches and drops a send to an already-closed socket instead of raising

## PICKS I MADE

- editor/viewer/terminal: a remote tab-list reconciliation never sends a fresh open/follow request for a tab the local widget already holds by the same key — only new or removed keys move
- browser: nested expanded folders restore top-down — each arriving tree response re-checks the pending expanded set for its own new children, so deep paths resolve without a fixed depth limit
- terminal: mirroring an added tab into a second window reuses the same shell key, so both windows attach to the same live PTY rather than spawning a second shell for "the same" tab
- queue/mini-queue: where no widget-side mirror of an option exists, I still added the onOption entry point per the brief, rather than leaving it out because it's currently a no-op
- server.py's ws_ade_handler loop and ade/frames.py's close_conns were already clean (loop exits on `ws.receive()` returning None, close is try/excepted) — the actual gap was the shared `_send()` helper in engine/web_io.py raising on a stale socket; fixed there, not in server.py or ade/frames.py

## PER-WIDGET KEYS ROUND-TRIPPED

- editor.js — `showPreview`, `tabs`, `active`
- viewer.js — `path`, `tabs`
- chat.js — `region`, `speech_enabled`
- browser.js — `root`, `expanded`
- terminal.js — `region`, `tabs`, `active`
- queue.js — `claude_cache_ttl`, `claude_exclude_dynamic`
- mini-queue.js — none (no default options for this type)

## GOALS DONE

- Part 1: all seven widgets round-trip every getOptions key through onOption and call markDirty on internal change
- Part 2: a failed save retries once, then sets saveFailed and shows "unsaved" in the corner; a later success clears it
- Part 3: the corner line updates on adopt, new, unbind, and load
- Part 4: socket goodbye is clean client-side (nulled handlers, code 1000); server's shared send no longer raises on a closed socket

## STRAY FILES

- none

## BRANDON'S TODOS

- none

## CLOSER REVIEW

- Gets copy of review, not a contract.
- Headed rerun of blocks D (widget-inside mirror) and the new save-retry/corner-state/socket-goodbye behavior — Opus, per the spec header
