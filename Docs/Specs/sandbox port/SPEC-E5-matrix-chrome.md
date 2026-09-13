# SPEC E5 — matrix chrome — Sandbox Suite

Model: sonnet. Wave 3. Receipt: Docs/Reports/RECEIPT-E5-matrix-chrome.md,
written before 200K tokens.

## What this is

Three small pieces on the matrix window. The add-widget picker laid out
in columns. The old agent strip as a widget, unchanged. A session corner
button that expands into the session rung.

## Decisions, from Brandon

- The add-widget list shows one column per type.
- The agent strip stays exactly as it is.
- The session rung lives on a corner button beside Settings. It expands
  and collapses. It can be dragged around the perimeter of the matrix
  when it is in the way.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/matrix/widget-picker.js. 1 KB, the add-widget picker.
- static/js/matrix/session-panel.js. 6 KB, the corner buttons.
- static/js/matrix/ui.js. 4 KB, the matrix chrome.
- static/js/matrix/registry.js. 2 KB, how the registry loads.
- static/js/matrix/socket.js. 3 KB.
- static/js/widgets/mount/mount.js. 4 KB, the reference widget.
- static/js/ade/agentstrip.js. 9 KB, the design.
- static/js/ade/queuelog.js lines 147 to 252 (rowsForRegion,
  pendingByRegion, settle). 17 KB file, read those lines.
- library/registry/widgets.json.
- static/css/ade.css: grep for ag- and ql-edge, read those rules only.

## Build

1. Picker. The add-widget panel draws one column per registry row. Label
   at the top of the column, an Add button beneath. Same registry, same
   add path, only the layout changes.
2. Agent strip. New folder static/js/widgets/strip/strip.js, registry
   type strip, label Agent Strip. Port agentstrip.js as is. The three
   helpers it imports from queuelog.js move to a new shared module
   static/js/widgets/shared/feed-rows.js, so E8 and E9 import the same
   code. The strip subscribes to track_list, track_status,
   gate_broadcast, context_warn, feed. The popover's settle calls send
   gate_action. The kill button sends stop. Keep the classes so ade.css
   styles it; copy only the ag- rules into the widget's own style block
   if ade.css is not loaded on the matrix page.
3. Session corner button. Beside Settings. Click toggles a panel. The
   panel shows session id, name, root with a Set root button that sends
   the setroot frame, the thirteen session settings as controls reading
   and writing /api/session-settings/<sid>, and injections/session/ade.md
   in a read-only textarea. The panel can be dragged to any of the four
   edges and stays there.

## Do not

- Do not change the strip's look, timing, or chip text.
- Do not touch the grid, the socket module, or any other widget.
- Do not build the Settings or Context corner panels beyond what exists.

## Acceptance

- Picker shows every registry type as a column, Add works from each.
- Strip chips light on track_status, flash on a gate, popover settles.
- Session panel sets root and every region in the session moves. A
  session setting written there reads back after a refresh.

## Receipt

Edits by file and line. The registry row added. Which ag- rules were
copied, if any.
