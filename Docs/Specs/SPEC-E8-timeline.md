# SPEC E8 — timeline widget — Sandbox Suite

Model: opus. Wave 4. Receipt: Docs/Reports/RECEIPT-E8-timeline.md, written
before 200K tokens. This is a port. Nothing is invented. Anything that
needs a decision goes in the blockers section, unbuilt, so a sonnet can
finish it after Brandon decides.

## What this is

The old timeline view as a widget. Lanes per track, spans per region,
action pips, the context menu, the root browser, the zoom, the refresh
timer, exactly as they are. Only the wire changes.

## Decisions, from Brandon

- Port, not rebuild. Keep the DOM, behavior, and look.
- The root browser on the lane head stays. Brandon likes it.
- Edit region from the context menu opens the devagent widget on that
  region, not the old modal.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/widgets/mount/mount.js. 4 KB, the reference widget.
- static/js/widgets/shared/feed-rows.js, from E5. Import settle from it.
- static/js/widgets/devagent/devagent.js, from E6: find how it takes a
  region id to select. Read only that.
- static/js/ade/timeline.js. 38 KB, the design. Read once.
- static/js/ade/boot.js lines 1226 to 1250 (the view context object) and
  lines 458 to 495 (track_list, track_removed, region_replaced).
- static/css/ade.css: grep for tl-, th-, region, rlab, rname, tick,
  playhead, pip, region-ctxmenu, region-settle, and read those rules.
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/timeline/timeline.js, type timeline, label
   Timeline. mount builds the same markup timeline.js builds. The view
   context object boot.js passed becomes local: send is frame.send with
   inst, getTracks and getTrackRows come from the last track_list,
   nameOf from the names map, editTrack and addRegion open devagent.
2. Subscribe to ade_init, track_list, track_created, track_removed,
   region_replaced, feed. On feed, the same onFrame.
3. openLedgerWindow calls become a custom DOM event, mx:open-ledger,
   with track and turn in detail. E10 listens. Nothing opens a window.
4. The settle helper imports from feed-rows.js.
5. The root browser stays as it is, fetching /api/fs/browse and sending
   edit_track with root.
6. The refresh timer sends feed. Keep the interval control.
7. Styles copied into the widget's style block, same class names.

## Do not

- Do not change lane building, span placement, pip clustering, colors,
  or the context menu items.
- Do not add a track pane. Phase 4.
- Do not resolve the one-region-per-track warning. Leave the console
  error and the warn chip as they are.
- Do not open windows.
- Do not read any file not listed above.

## Blockers, for the receipt

- One region per track. The old view warns when a track carries more
  than one region. The backend allows it. What the lane should show is
  Brandon's call.
- Any place the old code assumed one session. List file and line.
- Anything else you had to leave unbuilt. Say why in one line.

## Acceptance

- Two tracks, one with a reset region, take turns. Lanes, spans, pips,
  and the ended run appear as the old page drew them.
- Right-click a lane, edit region: devagent selects that region.
- Set root from the lane head: the region's root changes.

## Receipt

Edits by file. Registry row. Blockers, each one line, unbuilt.
