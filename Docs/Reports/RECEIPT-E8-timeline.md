# RECEIPT — E8 timeline — Sandbox Suite — 2026-09-06 18:27:43 EDT to 2026-09-06 18:36 EDT

## EDITS

- [static/js/widgets/timeline/timeline.js](../../static/js/widgets/timeline/timeline.js) — new widget, port of the old timeline view
- [static/matrix.html](../../static/matrix.html) — one script tag, after changes.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — one row, type timeline

## STRAY FILES

- none

## GOALS DONE

- Folder static/js/widgets/timeline/timeline.js, type timeline, label Timeline; mount builds the same markup the old view built
- View context object is local: send is frame.send with inst, getTracks/getTrackRows come from the last track_list, nameOf from the names map
- Subscribed to ade_init, track_list, track_created, track_removed, region_replaced, feed; feed runs the same onFrame
- openLedgerWindow calls are now a mx:open-ledger DOM event with track and turn in detail; nothing opens a window
- settle imports from [feed-rows.js](../../static/js/widgets/shared/feed-rows.js)
- Root browser kept as it was — fetches /api/fs/browse, sends edit_track with root
- Refresh timer sends feed; the interval control is kept
- Styles copied into the widget's style block, same class names
- Lane building, span placement, pip clustering, colors, and the context menu items are unchanged
- node --check passes

## GOALS NOT DONE

- Acceptance run — the spec did not say to start the server, so lanes/spans/pips were not seen live
- "Edit region" reaches devagent only when devagent listens for mx:open-devagent — see blockers

## DECISIONS MADE

- Kept the old element ids (#tlScroll, #tlHeads, #tlRuler, #tlCtxMenu, #playhead) and scoped every lookup to the widget root — options: rename all to classes — undo: rename in markup and in the style block
- Style rules scoped under `.mx-timeline` (and `.tl-rootmodal` for the body-level browser) instead of bare copies, so the widget cannot restyle other widgets — options: bare copies as in ade.css — undo: strip the prefixes
- `--tl-heads-w` and `--tl-lane-h` defined on `.mx-timeline`; every other var the rules need is already in [og.css](../../static/css/skins/og.css) — options: add to :root in matrix.css — undo: move the two declarations
- Escape ported as a per-instance document keydown listener, since matrix has no onEsc hook; it returns immediately unless that instance has a popover, context region, or lane menu open, and never calls preventDefault — options: drop Escape entirely — undo: delete the tl.onKey block in mount and unmount
- mx:open-ledger and mx:open-devagent dispatched on `document` — [ledger.js](../../static/js/widgets/ledger/ledger.js) line 780 listens on document — options: window, which is boot.js precedent — undo: swap the dispatch target in openLedger/openDevagent
- editTrack and addRegion emit mx:open-devagent with `{ region, track }`; the `+ add track` / `+ add region` buttons emit it with an empty detail — options: leave the buttons dead — undo: delete the two click handlers
- Zoom is per-instance state, still persisted to the shared `ade_tl_zoom` key — options: module-level shared — undo: hoist tl.zoom
- Every outbound frame carries `inst: frame.id`, per spec item 1, including `feed`

## READS BEYOND THE LIST

- [static/css/skins/og.css](../../static/css/skins/og.css) — var block only. The spec named ade.css for the rules, but matrix.html does not load ade.css; needed to know which vars the copied rules would resolve against
- [static/matrix.html](../../static/matrix.html) — the script tag block, required by the ownership rule
- [static/js/widgets/ledger/ledger.js](../../static/js/widgets/ledger/ledger.js) lines 770-785 — to confirm the mx:open-ledger listener target and detail shape before wiring the dispatch
- [static/js/widgets/devagent/devagent.js](../../static/js/widgets/devagent/devagent.js) — grep plus lines 590-629 and applyRoster, per the spec's "find how it takes a region id to select"; also confirmed the roster field names (msg.tracks, msg.rows, msg.names)

## BLOCKERS FOR LATER WAVES

- One region per track — the lane shows only the first region and flags the track with the warn chip and a console.error, left exactly as the old view had it. What a multi-region lane should draw is Brandon's call — blocks nothing, unbuilt by instruction
- devagent has no listener for mx:open-devagent — it has no external selection API at all, only internal clicks setting dev.selectedRegionId. Until someone adds a `document.addEventListener('mx:open-devagent', ...)` that sets selectedRegionId/selectedTrackId and re-renders, "edit region" from the timeline fires into nothing — blocks E8 acceptance item 2, needs a small follow-up on E6's file
- [changes.js](../../static/js/widgets/changes/changes.js) line 275 dispatches mx:open-ledger on `window`, but ledger.js listens on `document` — that call never lands. Not my file; flagging for whoever owns E11
- The `+ add track` / `+ add region` / `insert region…` paths used to open the old track-settings modal with a mode and a target track. devagent has no equivalent entry point, so they only open the widget with an empty detail — a follow-up should carry the target
- `#tlSplit` is inert. boot.js wired the splitters; matrix has no equivalent. Markup kept so the layout is unchanged
- `add phase` stores its checkbox and does nothing — the same as the old code

## PHASE 3 SURFACED

- Two widgets now need a way to be told "select this region": timeline wants devagent, and the pattern will repeat. A single matrix-level convention for cross-widget focus would be better than one ad-hoc event per pair
- The old code assumed one session in one place that survives the port: the zoom preference key `ade_tl_zoom` is global, not per session. The roster it read (boot.js lines 1228 and 1231, `S.tracks` / `S.trackRows`) is now per-frame, so that assumption is gone

## BRANDON'S TODOS

- Decide what a lane with more than one region should draw

## CLOSER REVIEW

- Confirm the mx:open-ledger dispatch target with E10 and E11 — closer
- Assign the devagent mx:open-devagent listener to a follow-up — Brandon
