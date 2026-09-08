SESSION REVIEW — Sandbox Suite — C2 test half — 2026-09-07 EDT

Test half only. No edits to any widget, server, or css file. The build half
follows in RECEIPT-phase4-C2-build.md.

DRIVEN

All ten C2 checklist lines SEEN. Full detail and proof per line:
Docs/Reports/phase3-test/SPEC-test-timeline.md (C2 section, dated).

- lanes per track — SEEN, 6 rows in / 6 lanes out.
- spans per region — SEEN, 17 spans.
- pips — SEEN, singles and clusters.
- right-click menu items all present — SEEN, three menus captured:
  lane-no-region, lane-with-region, live region span.
- inline rename of track — SEEN, c2trk → c2renamed, confirmed on the roster.
- inline rename of region — SEEN, c2claude → c2regnamed, same.
- root browser — SEEN, .dv-rootmodal opens with a real directory listing.
- cache toggles on a claude region — SEEN on the sonnet region only.
- zoom persists — SEEN, survives a full page reload via localStorage.
- refresh timer — SEEN, interval re-set on change.

READ LINE

All five clauses CONFIRMED. Line numbers shifted by F-D: the two
MX.mountAddControls calls the target spec cites as 1292-1293 are now
static/js/widgets/adetools/timeline/timeline.js:1299-1300. openTrackMenu is
at :634, its container-no-region branch at :688, inlineEdit at :518 (used on
the lane name at :1060).

THE TARGET SPEC'S THREE "NOT IN SCOPE" ITEMS

- Ruler bar / zoom collision — REAL, reproduced. At a 340px widget the
  .ruler-pad row wraps and the zoom group is clipped to its "−" button;
  the % label and "+" are cut off. c2/test-09-narrow-ruler.png.
- isClaudeModel literal match — REAL. timeline.js:264-265 matches four
  aliases against tr.track.model. A region created as "sonnet" keeps the
  cache toggles; a dated id like claude-sonnet-5 loses them — the same id
  the lane's sub-label already displays after F-D.
- Slot overlap when the grid is full — grid.js:232, already on the shared
  known list. Not re-derived; the driver used applyTemplate with one
  widget, so it was never hit.

FINDING THAT AFFECTS THE BUILD

insert_region with no model does not get a server default. ade/frames.py:441
falls back to "" and ade/tracks.py:1141 stores it. Target item 3 says "the
server defaults name and model" — the name half is true (frames.py:315,
"untitled"), the model half is not. Stated plainly, not acted on: the build
is client-side only and I am not touching the server. Carried into the build
receipt as the gap.

REGIONS AND TRACKS MOUNTED AND DROPPED

- Track c2trk (07169234c08e), renamed c2renamed during the inline-rename
  test. Deleted via delete_track.
- Region c2claude (140ea23dfb65), model sonnet / provider claude on that
  track, renamed c2regnamed. Dropped via kill_track.
- Pre-existing region gfsf (32f1ec929f4a) untouched. Roster at close:
  regions ["gfsf"], rows ["test","JHJKHKL","jj","kljoiu","lkj;"] — exactly
  the state at open. c2/test-11-after-cleanup.png.

CONSOLE

One page-level favicon 404 per load, on the shared-setup known list. No
pageerrors, no timeline-originated console output, across both runs.

STRAY FILES

- Docs/Reports/phase3-test/c2/ — test-01 through test-11 screenshots,
  test-05b and test-08b from the re-drive, test-log.txt, test2-log.txt,
  test-console.txt, test2-console.txt.
- Docs/Reports/phase3-test/SPEC-test-timeline.md — new file, C2 section.
- Driver scripts c2_test.py, c2_test2.py in the session scratchpad, not
  under the project.
- library/grids/9883b6bec3df/w-*.json — one throwaway window file per page
  load (three this half). Same footprint B1, B4 and F-D noted. C1 and C4
  are running in parallel and add their own.

GOALS DONE

- Test half complete, every line driven, receipt written before any edit.
- The three not-in-scope items reported with proof, none fixed.
- Nothing mounted was left behind.

BLOCKERS

None.

RULE CONFLICT, FLAGGED

The harness handed me a bypass-permissions note telling me to read and edit
through Bash. Brandon's rules say the opposite — Read and Edit tools so he
sees the edits. I followed Brandon's rules. Bash was used only for greps and
for running the Playwright driver.

READS

Listed in full in the READS section of
Docs/Reports/phase3-test/SPEC-test-timeline.md.

CLOSER REVIEW

- isClaudeModel's literal match is the one finding here with a real user
  consequence: the cache toggles silently vanish for any dated model id,
  and F-D's resolved sub-label now shows exactly such an id on the same
  lane. Out of C2's scope by the target spec's own wording — Brandon or
  closer, scope call on whether it gets its own box.
- insert_region's missing model default is a server-side gap that target
  item 3 assumes away. Same call.
