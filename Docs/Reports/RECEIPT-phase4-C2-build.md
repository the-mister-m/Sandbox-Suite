SESSION REVIEW — Sandbox Suite — C2 build half — 2026-09-07 EDT

Build half. Test half and its receipt came first:
Docs/Reports/RECEIPT-phase4-C2-test.md.

EDITS — static/js/widgets/adetools/timeline/timeline.js only. No css file
needed. No server change made, and none was needed to build.

- :1302-1317 — head actions. The two MX.mountAddControls calls (mode "track",
  mode "region") are gone. In their place one button, id tlAddTrack, class
  tb-btn, text "+ track", no inputs and no selects. Click sends
  {type:"create_track"} with no name and no root. Target item 1 and item 4.
- :687-693 — openTrackMenu, the tr.container && !tr.track branch gains one
  item, "＋ insert region", placed first. Sends
  {type:"insert_region", track: tr.container} with no preset, then refresh.
  Target item 3.
- :1036 — the lane object's name falls back to "untitled" instead of the
  track id. Target item 2.
- :1037 and :1048 — the lane object carries row_root, the track row's own
  root; the ended-region lanes carry "".
- :490-495 — rootLine reads the region's root when the lane has a region and
  falls back to tr.row_root when it does not. Without this the freshly
  mounted lane read "no root of its own — workspace default" even though the
  server had given it the session root, and the target's Proof line asks for
  the root on the lane. Same two lines, no behavior change for a lane that
  carries a region; the click-to-browse affordance is still gated on
  tr.track exactly as before.

F-D's work in this file is untouched and was re-confirmed present after the
build: modelRows on tl state, the mount fetch of /api/library/models,
modelSub near :793, and the lane sub-label calling it at :1041.

EVERY EXISTING MENU ITEM STAYS — verified live after the build

- Lane, no region: ＋ insert region, ＋ insert region preset ▸,
  ✕ delete track. ("📋 insert region from …" is still conditional on
  tl.settingsClip, unchanged.)
- Lane with a region: ⎘ copy region settings, 💾 save preset, load preset ▸,
  reset with preset ▸, ↺ reset region, ✕ delete region.
- Live region span: ✕ delete region.
c2/build-03-lanemenu.png, c2/build-05-lanemenu-region.png.

PROOF — headed, session 9883b6bec3df, the target spec's Proof section

1. "+ track" button visible in the head actions, and it is the only thing
   there: inputs 0, selects 0, buttons ["+ track"].
   c2/build-01-addtrack-button.png, c2/build-log.txt line 4.
2. Click it — a lane appears named "untitled". Server row:
   {id: f523e9d9f3a5, name: "untitled", regions: [],
    root: "/Users/moth3rship/Desktop"}. The lane's root line reads
   "…/moth3rship/Desktop", title "/Users/moth3rship/Desktop" — the session
   root. c2/build-02-untitled-lane.png.
3. Right-click that lane: ["＋ insert region", "＋ insert region preset ▸",
   "✕ delete track"] — the new item sits among the existing ones.
   c2/build-03-lanemenu.png.
4. Click "insert region": region 0e6e00ba38e2 "untitled.4" appears on track
   f523e9d9f3a5, and the lane's region line reads "untitled.4".
   c2/build-04-region-on-lane.png.
5. Cleanup: kill_track on the region, delete_track on the track. Roster at
   close is the roster at open — regions ["gfsf"], rows ["test","JHJKHKL",
   "jj","kljoiu","lkj;"]. c2/build-06-after-cleanup.png.

Console across the proof run: one page-level favicon 404, on the shared-setup
known list. No pageerrors. node --check passed before each run.

THE GAP BETWEEN THE BUILD AND THE TARGET, PLAINLY

1. **The inserted region has no model.** The region comes back with
   `model: ""`. Target item 3 says "The server defaults name and model" —
   only the name half is true. ade/frames.py:441 falls back to `""` and
   ade/tracks.py:1141 stores it as-is; there is no model default anywhere on
   that path. The lane's sub-label is therefore blank, and the region cannot
   run until someone gives it a model in devagent. Fixing this is a server
   change, which my box was told not to make. Flagged in the test receipt
   before I started building.
2. **The new region does not draw a span on the row.** Spans come from turn
   and action records (makeRegionSpan, :839); a region that has never run has
   neither, so the row stays empty and the region shows only on the lane head.
   The target's Proof says "puts a region on the lane" and it does — on the
   lane head. If Brandon wanted a visible bar on the row for an idle region,
   that is a separate change and I did not invent it.
3. **The names collide upward.** The inserted region came back "untitled.4",
   not "untitled" — _stamp_name (ade/tracks.py:1124) never reuses a freed
   name within a session, so repeated one-click inserts count up. F-D raised
   the same behavior. Not touched.
4. **tl.lastTrackId is now dead state.** It is still assigned in
   openTrackMenu (:639) and on the lane head click (:1110), but nothing reads
   it any more — the region add form that used it is gone. Left in place
   deliberately; removing it is outside the five items.
5. **Target items 5 and 6 need no edit here.** Devagent keeps both add forms
   and was not opened. Mount was not touched. D1 still owes the report on
   whether mount earns a slot.

THE THREE "NOT IN SCOPE" ITEMS — reported, not fixed

Detail and proof in Docs/Reports/RECEIPT-phase4-C2-test.md and
Docs/Reports/phase3-test/SPEC-test-timeline.md. Short form: the ruler /
zoom collision is real and reproduced at 340px; isClaudeModel's four-literal
match is real and now displays a model id its own gate rejects; the full-grid
slot overlap was not hit by this driver.

REGIONS AND TRACKS MOUNTED AND DROPPED

Build half, across two proof runs:
- Track a81f1d8e80be "untitled" + region 0e6e00ba38e2 "untitled.3" (run 1).
- Track f523e9d9f3a5 "untitled" + region 0e6e00ba38e2 "untitled.4" (run 2).
Both killed with kill_track and deleted with delete_track. Pre-existing
region gfsf (32f1ec929f4a) untouched and confirmed alone at close of both
runs. Test half's c2trk / c2claude were already cleaned before the build.

STRAY FILES

- Docs/Reports/phase3-test/c2/build-01 … build-06 screenshots,
  build-log.txt, build-console.txt.
- Docs/Reports/phase3-test/SPEC-test-timeline.md — C2 section plus a short
  build-retest note appended.
- Driver c2_build.py in the session scratchpad, not under the project.
- library/grids/9883b6bec3df/w-*.json — one throwaway window file per page
  load (two more this half). C1 and C4 add their own in parallel.

GOALS DONE

- All five target items built, in timeline.js only, four hunks.
- Every existing menu item confirmed still present, live.
- The target's Proof section reproduced end to end, headed.
- F-D's edits confirmed intact.
- Everything mounted was dropped.

BLOCKERS

None that stopped the build. The missing server-side model default is the
one thing the target asks for that this box could not deliver.

RULE CONFLICT, FLAGGED

The harness handed me a bypass-permissions note telling me to read and edit
through Bash. Brandon's rules say Read and Edit tools so he sees the edits.
I followed Brandon's rules; every edit above went through the Edit tool.
Bash was used only for greps, node --check, git diff, and the Playwright
drivers.

READS

Listed in full in Docs/Reports/phase3-test/SPEC-test-timeline.md. Added for
the build half: ade/frames.py:555-580 (create_track and insert_region frame
handlers, and the _roster() that follows each), ade/web_io.py:101-108
(send_track_created), static/js/widgets/adetools/timeline/timeline.js:490-516
(rootLine, re-read before editing).

CLOSER REVIEW

- The missing model default on insert_region is the open item. It is a
  server change on ade/frames.py:441 or ade/tracks.py:1141 and it belongs to
  whoever owns the server, not to C2 — Brandon or closer, scope call.
- isClaudeModel's literal match, carried over from the test half. Real user
  consequence, ruled out of scope by the target spec itself.
