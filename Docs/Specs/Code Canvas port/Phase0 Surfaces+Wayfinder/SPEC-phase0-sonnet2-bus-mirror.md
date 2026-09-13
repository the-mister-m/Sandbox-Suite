# SPEC — Phase 0 — Sonnet 2 — bus and surface mirror

Written 2026-09-12. Job D from Docs/Scope/Code Canvas port/SCOPE-phase0-foundation.md
plus its first customer: two tabs on one surface mirror each other.
Runs after Sonnet 1 (SPEC-phase0-sonnet1-surfaces.md) lands. No tests.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. No tests. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at about 150k used, if the bus (part 1) is not done and
  wired, stop. Write Docs/Handoffs/HANDOFF-phase0-sonnet2.md: done, in
  progress with file and line, next. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase0-sonnet2.md in the
  SESSION REVIEW shape. One line each to SESSIONLOG.md and INDEX.md.

## Read, in this order

- Docs/Reports/RECEIPT-phase0-sonnet1.md — what Sonnet 1 changed
- static/js/matrix/socket.js — whole, 103 lines
- static/js/matrix/grid.js — whole, as Sonnet 1 left it
- static/js/matrix/widget-frame.js — whole, 178 lines
- static/matrix.html:26-30 — script order
- ade/frames.py:95-104 — _broadcast; :561-566 — handle() head;
  :814-819 — wp_mute, the smallest frame
- ade/web_io.py:185-196 — send_feed_dirty, send_tree_dirty, the send shape
- Docs/HOWTO-frames.md:19-22 and :73-76 — the two table heads

## Part 1. Bus

server, ade/frames.py handle()
- One `elif t == "widget_bus":`. Read channel, payload, inst from msg.
  If channel: `_broadcast(ctx.environment, "send_widget_bus", channel,
  payload, inst)`.

server, ade/web_io.py
- `send_widget_bus(self, channel, payload, inst)`. Same lock, same
  json.dumps shape as send_tree_dirty. type "widget_bus".

client, static/js/matrix/bus.js — new file
- MX.bus = { on(channel, fn) returns off, off(channel, fn),
  emit(channel, payload, opts) }.
- emit dispatches locally to every listener on that channel. With
  opts.remote it also sends {type: "widget_bus", channel, payload,
  inst: MX.WINDOW_ID} through MX.socket.send.
- One MX.socket.onFrame listener: a "widget_bus" frame whose inst is
  not MX.WINDOW_ID dispatches locally with a third arg `{remote: true}`.
  A frame with our own inst is dropped.
- MX.WINDOW_ID is a `let` behind a getter after Sonnet 1; read it at
  emit time, never cache it.

static/matrix.html
- `<script src="/static/js/matrix/bus.js">` after socket.js, before
  widget-frame.js.

Docs/HOWTO-frames.md
- Client to server row: widget_bus | channel, payload, inst | none |
  widget_bus to environment | no | no
- Server to client row: widget_bus | channel, payload, inst |
  send_widget_bus, frames.py handle() widget_bus branch

## Part 2. Mirror

Two tabs on one surface id show one layout and one set of widget
options. Channels:

- "surface.layout" — payload {surface, snapshot} where snapshot is
  grid.snapshot().
- "surface.widget" — payload {surface, id, options}.

grid.js, sender side
- After each of: addWidget, removeWidget (both branches), _drop,
  _startResize onUp, applyTemplate, newSurface: emit "surface.layout"
  remote with the current snapshot. Route these through one method
  `_announce()` so the call sites stay one line.
- `_applying` flag: while true, save() and _announce() return at once.

grid.js, receiver side
- MX.bus.on("surface.layout"): ignore unless payload.surface equals
  MX.WINDOW_ID. Set _applying. Diff by instance id:
  - id in snapshot, not in instances: _normalize, push, _build, append.
  - id in instances, not in snapshot: frame.unmount, delete frame,
    remove element, filter.
  - id in both, slot differs: copy slot, _place on the element.
  - id in both, options differ: frame.applyOptions(options) (below).
  Clear _applying. No save; the sender already saved the same body.

widget-frame.js
- setOption: after onOption, emit "surface.widget" remote with
  {surface: MX.WINDOW_ID, id: this.id, options: this.getOptions()}.
  Skip when MX.grid._applying.
- New `applyOptions(options)`: for each key whose value differs from
  this.options[key], set it and call mod.onOption(this, key, value)
  if present. Never calls grid.save.
- MX.grid.markDirty(): after the debounce fires save(), also emit
  "surface.widget" for the frame that called it. markDirty gains an
  optional frame arg for that.

grid.js, receiver for "surface.widget"
- Ignore unless payload.surface equals MX.WINDOW_ID. Find
  frames[payload.id]. If present, applyOptions(payload.options).

## Done when

- Bus emits locally, and remotely with opts.remote. Own frames dropped.
- HOWTO has both rows.
- Two tabs on one surface: add, remove, move, resize in one appears in
  the other without a reload. setOption in one reaches the other.
- No save loop: applying a remote change never triggers a save or a
  re-emit.
- Receipt written. SESSIONLOG and INDEX lines added.
