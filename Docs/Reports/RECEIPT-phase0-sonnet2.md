SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Sonnet 2 — 2026-09-12

EDITS
- [ade/frames.py](../../ade/frames.py) — handle() gains `elif t == "widget_bus":` branch, broadcasts send_widget_bus
- [ade/web_io.py](../../ade/web_io.py) — send_widget_bus(channel, payload, inst), same lock/dumps shape as send_tree_dirty
- [static/js/matrix/bus.js](../../static/js/matrix/bus.js) — new file, MX.bus: on/off/emit, local dispatch plus remote widget_bus frame, drops own inst
- [static/matrix.html](../../static/matrix.html) — bus.js script tag added after socket.js, before ui.js/widget-frame.js
- [static/js/matrix/grid.js](../../static/js/matrix/grid.js) — _applying flag, _announce(), _onLayoutMirror/_onWidgetMirror bus listeners wired in init(), sender calls added to addWidget/removeWidget (both branches)/_drop/_startResize onUp/applyTemplate/newSurface, markDirty(frame) emits surface.widget after debounced save, save() no-ops while _applying
- [static/js/matrix/widget-frame.js](../../static/js/matrix/widget-frame.js) — setOption emits surface.widget remote (skipped when MX.grid._applying), new applyOptions(options) method
- [Docs/HOWTO-frames.md](../HOWTO-frames.md) — widget_bus row added to both client-to-server and server-to-client tables

STRAY FILES
- none

GOALS DONE
- Part 1 — bus: server handle() branch, send_widget_bus, MX.bus client module, script order, HOWTO rows
- Part 2 — mirror: surface.layout and surface.widget channels, sender announces on every layout change, receiver diffs by instance id without re-saving or re-emitting

BRANDON'S TODOS
- none raised this session

CLOSER REVIEW
- Gets copy of review, not a contract.
- Read the picks below and confirm or correct — Brandon / closer

PICKS I MADE (brief was silent or ambiguous)
- `_onLayoutMirror`'s options diff uses `JSON.stringify` on both sides to decide whether to call `applyOptions` — the brief says "options differ" without saying how to detect that; stringify comparison was the shortest correct check given options are plain JSON-shaped objects.
- `applyOptions` only sets and fires `onOption` for keys whose value differs (brief's own wording for this method), and treats a missing/undefined `options` payload as a no-op rather than throwing.
- `_onLayoutMirror` skips the slot/options diff step for instances it just added in the same pass (already normalized from the same snapshot row, so nothing to diff) — brief only describes the three cases (added/removed/both), this is the natural read of "in both" excluding same-pass adds.
- Placed `bus.js` right after `socket.js` in matrix.html (before ui.js) rather than immediately before widget-frame.js — brief says "after socket.js, before widget-frame.js," both true since ui.js sits between them and doesn't touch the bus.
- widget_bus's server-to-client HOWTO row cites `send_widget_bus()` and the frames.py branch together in the sender column, matching the brief's own wording for that row rather than a single line number.
