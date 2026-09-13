# HOWTO — repipe a widget

Worked example throughout: static/js/widgets/test/pipes/pipes.js.

## Add a widget

- Folder: static/js/widgets/test/pipes/pipes.js.
- Registry row: library/registry/widgets.json:21.
- Script tag: static/matrix.html:66, after shared/ scripts (target-option.js,
  mirror.js load first at matrix.html:47-48).
- registerWidget: pipes.js:59 `MX.registerWidget("pipes", {...})`.
- Module shape: mount pipes.js:66, unmount pipes.js:170, onOption pipes.js:176,
  onFrame pipes.js:184, getOptions pipes.js:198, optionControls pipes.js:62-64.
- Options default: pipes.js:60 `defaults: {target, path, note}`, read by
  startingOptions widget-frame.js:19-25 (registry defaults win first, then
  mod.defaults).
- getOptions round-trip: pipes.js:198-204 returns the three keys;
  widget-frame.js:91-96 getOptions prefers the module's copy.
- markDirty: pipes.js:37, inside pushLog, whenever the log grows.
  grid.js:146-158 is the timer it feeds.

## Give it a target

- Option key: `target`, default "" at pipes.js:60. Read at pipes.js:18,
  113, 200 — lines 43, 91, 138, 153 read `note`/`path`, not `target`.
- optionControls: pipes.js:62-64, one entry keyed `target`.
- MX.targetControl(listFn, onNew): target-option.js:25-27, wraps a list
  function and a New handler into `{kind: "select", values, onNew}`.
- Which list function per family: graph family passes MX.graphTargets
  (target-option.js:29-43, shelf names merged with current targets). Canvas
  family (not built yet) passes its own current-targets list filtered to
  `.json`/`.html`, per contract 2.3.
- What New does: MX.graphTargetNew, target-option.js:45-68 — opens the root
  browser, POSTs /api/library/graphs/import, calls frame.setOption("target",
  name) on success. Draw wiring: widget-frame.js:200-207 (New button),
  widget-frame.js:164-183 (select + refill).

## Share state with its siblings

- MX.mirror(frame, channel, apply): mirror.js:14-30.
- pipes.js:40-49 makeMirrors — two mirrors: "pipes.ping" (log + Emit button,
  pipes.js:42-44) and "graph.select" (count only, pipes.js:45-48).
- Channel naming: dotted, family first. "pipes.ping" here; graph family list
  is contract 2.6, canvas family is 2.7.
- Payload rule: fields are added, never renamed. pipes.js:91 adds `note, at`
  to the mirror's own `{target, inst}` (mirror.js:24-26 builds that base).
- off in unmount: pipes.js:51-57 killMirrors, called from pipes.js:172.

## Load a vendored ES module

- MX.moduleReady(key, loader): module-ready.js:14-20, one memoized promise
  per key, same shape as MX.monacoReady.
- import() path for a vendored file: `/static/vendor/<lib>/<file>.js` —
  contract 2.4 names `/static/vendor/wayfinder/<file>.js` for phase 2.
- Where vendored files live: static/vendor/ (monaco, marked, DOMPurify,
  xterm today; wayfinder/ arrives in phase 2 job 2A).
- Note: pipes.js has no moduleReady call — nothing is vendored yet in phase
  1, and Part 1's body list for this widget doesn't call for one. The
  working example already built is monaco-readonly.js:35-55 (ready()) and
  :70 (MX.monacoReady), same memoized-promise pattern.

## Talk to files

- open -> file: pipes.js:138 sends `open`; pipes.js:184-191 onFrame handles
  `file`, keeps the first 200 characters.
- save -> saved: pipes.js:148-154 sends `save` with the shown text plus one
  appended `pipes <timestamp>` line; pipes.js:193-195 onFrame handles
  `saved`, shows `ok` or `msg.result`.
- Filter by inst: pipes.js:187 `if (msg.inst !== frame.id) return;`.
- The denied strings: editor.js:545-548 checks `msg.result` for
  `[save denied`, `[WRITE refused`, `[WRITE failed`. Pipes does not gate on
  these — it shows the raw result string either way (throwaway widget, no
  polish). Copy editor.js's check for a real widget.
- Frame table: Docs/HOWTO-frames.md rows 49 (open), 50 (save), 92 (widget_bus
  server-to-client), 94 (file), 101 (feed_dirty, unrelated — do not confuse
  with tree_dirty at row 103).

## Let an agent push

- The BUS: line an agent writes: engine/tools.py:997-1051 (`_bus_*` helpers),
  the `widget_bus_emit` row at engine/tools.py:1197-1200.
- The route it hits: server.py:1552-1560, `POST /api/widget-bus`.
- Why the widget sees it as remote: the route calls
  `ade_frames._broadcast_all("send_widget_bus", channel, payload, "agent")`
  to every open socket. Client-side, bus.js:45-53 receives it as a socket
  frame and calls listeners with `(payload, {remote: true})` since
  `msg.inst` ("agent") never equals `MX.TAB_ID`. pipes.js:42-44 reads
  `meta.remote` to prefix the log line.

## Add a route

- Pattern to copy: the presets routes, server.py:1423-1460.
- Name validation: server.py:1466-1470 `_graph_name` — no slash, no
  backslash, not "." or "..". Same shape as `_grid_name` in server.py and
  `_safe_name` in settings.py.
- Where it goes: grouped with the feature's other routes. The graphs routes
  sit at server.py:1462-1560, right after presets.

## Repipe when a contract grows

- Add a field, never rename: SPEC-session-agent-phases1-3.md:101-102 states
  the rule; section 2 (2.1-2.10) is the contract list itself.
- This job's own instance: mirror.js's `apply` callback grew a second
  argument (`meta`, forwarded from `MX.bus.on`) beyond contract 2.2's
  `apply(payload)` — mirror.js:15-19. Additive, no existing caller reads a
  second argument today. Named in RECEIPT-phase1-1D.md.
