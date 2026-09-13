# SPEC — Phase 4 timeline and mount target — Sandbox Suite

Written 2026-09-07 by Fable from Brandon's words on 2026-09-07. This is
the target C2 builds to and the target B, C, D agents test mount,
timeline, and devagent against. Agents report the gap. Only C2 edits.

## What Brandon saw

One matrix window, session 9883b6bec3df. A mount widget stacked on top
of a devagent in the same slot. Three copies of the same add form on
one screen: mount, devagent tree, timeline head actions. Timeline lanes
with no name showing only "no region". A region right-click menu that
is the right shape. A server exception leaking into the devagent
status line.

## Target

1. **A track mounts without a name.** One button in the timeline head
   actions, "+ track", no fields. Sends `create_track` with no name and
   no root. Server names it "untitled" and, after S2's F6, gives it the
   session root.
2. **A track is named inline, no region needed.** The lane head name
   already edits inline (timeline.js `inlineEdit`, line 1053). Keep it.
   A nameless track shows "untitled", not blank.
3. **Right-click a track lane, insert a region.** Add one item to the
   existing lane menu (timeline.js `openTrackMenu`, the
   `tr.container && !tr.track` branch, line 688): "＋ insert region".
   Sends `insert_region` with `track: tr.container` and no preset. The
   server defaults name and model. Every item already on that menu
   stays: insert region preset, insert region from clip, delete track,
   and the region-side items.
4. **The shared add form comes out of the timeline head actions.** The
   region form and the track form at lines 1292-1293 are replaced by
   the one "+ track" button. The shared module stays for mount and
   devagent.
5. **Devagent stays the one place** with settings, context, gates,
   presets, and every region and agent together. Its tree keeps both
   add forms. Both paths add regions.
6. **Mount stays for now.** D1 reports whether it earns a slot once
   timeline has the one-click track.

## Not in scope here

- The ruler bar collision with the zoom control. Report it, do not fix.
- `isClaudeModel` literal match. Report it.
- The slot overlap when the grid is full. Report it.

## Proof

Harness on timeline after the build: screenshot shows the "+ track"
button, a lane appears on click named "untitled" with the session root
in its root line, right-click on that lane shows "insert region" among
the existing items, clicking it puts a region on the lane.
