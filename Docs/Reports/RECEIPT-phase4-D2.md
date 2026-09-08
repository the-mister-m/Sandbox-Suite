# RECEIPT — Phase 4 D2 — arrange: browse, archive, update — Sandbox Suite

Box D2, Opus, session 9883b6bec3df, 2026-09-07. Build, restart, test.

## EDITS

[server.py](../../server.py)
- 1555-1571 — `GET /api/fs/pick`, native chooser, `{"path": ...}` or null.
- 1573-1597 — `MAPS_DIR`, `_maps_stamp` (mirrors ade/tracks.py:1125), `_maps_row`.
- 1599-1610 — `GET /api/library/maps`.
- 1612-1645 — `POST /api/library/maps/archive`, refuses any source not
  named database.json, reads export-record.json beside it for `root`.
- 1558 — TEST-STAGE FIX, said out loud: `osascript -e activate -e <script>`.
  The chooser blocked but never came to the front. One line, unverified,
  no restart was available after it.

[arrange.js](../../static/js/widgets/adetools/arrange/arrange.js)
- 36-37, 357-358 — `.ar-btn:disabled` and `.lc-p`, existing variables.
- 435 — `blankNode` gains `docId`, `path`.
- 667-669, 733-734, 750-752, 773 — archive / library / update buttons.
- 745-749 — `.ar-open` calls `/api/fs/pick`; path field and Enter untouched.
- 808-824 — `openFile` detects a library copy, builds a plan from
  `docsetRoot` when the file has none.
- 833-837 — `paintHead`, enable rules.
- 839-874 — `planFromDocset`, `docsetPath`.
- 877-930 — `archiveMap`, `libraryMenu`, `updateSource`.
- 935 — `savePlan` writes through `docInner`.
- 2124-2130 — settings pane shows the disk path, or "not exported".

New folder [library/maps/](../../library/maps).

## HARNESS

matrix_harness.py mounts only — confirmed by read. Copied its mount path
into four scratchpad drivers with page.evaluate and page.click steps, as
RECEIPT-phase4-B1 and RECEIPT-phase4-C2-build describe. Headed, Chrome,
MX.grid.addWidget, never applyTemplate. Screenshots d2-01 to d2-12 in
[Docs/Reports/phase3-test/](phase3-test/). Full test record in
[SPEC-test-arrange.md](phase3-test/SPEC-test-arrange.md).

Never wrote under ~/Library/Application Support/doc-generator/. Both
docgen folders were copied to the scratchpad and every step pointed at
the copies; the original bb99 database.json is still 566 bytes, Sep 4.

## REGIONS MOUNTED AND DROPPED

- Track `d2-arrange` (`8db70f03e41d`), one region `1629990e0150` named
  d2-node, model sonnet, `node_id` `kmtrt6aob6` matching the plan node.
  Piped, confirmed, then kill_track + delete_track. Roster back to the
  pre-existing `untitled`.
- A second run made and dropped the same pair again. Nothing of mine is
  left on the server. `gfsf` and track 5a031370bf1c were already gone,
  per the coordinator.

## STRAY FILES

- [library/maps/Music History.2.json](../../library/maps/Music%20History.2.json)
  — from the name-stamp check. Delete it if you don't want it in the menu.
- [library/maps/Music History.json](../../library/maps/Music%20History.json)
  — real archive, but it now carries a test phase `PHASE 1` with the
  d2-node in it, from the save step.
- [library/maps/Desktop.json](../../library/maps/Desktop.json) — the
  981412e2 archive, root null. Real, keep or drop.
- Scratchpad only: d2_driver*.py, d2_console*.txt, d2_log*.txt, the two
  docgen copies, two before-snapshots, pick_probe*.png.
- d2-02-chooser.png is a 4MB full-screen capture and shows only the
  desktop — that is the evidence for the chooser fault, not a good shot.

## GAP BETWEEN BUILD AND SPEC

- Spec item 5 says to grep how arrange maps docsetRoot nodes to plan
  nodes. It never did any such thing — arrange read `doc.plan` only.
  The mapping is new code: folders become group nodes, files become job
  nodes.
- Spec says a file's path is root plus labels plus `.<extension>`. The
  labels already carry the extension (`RUNMAP.md`, extension `md`), so
  the literal rule builds `RUNMAP.md.md`. The build skips the append
  when the label already ends in the extension. Your call.
- "provider claude" is not reachable. The plan node has no provider
  field and ade/frames.py `_PLAN_NODE_FIELDS` does not carry one. Only
  model `sonnet` was set.
- Browse's pick-a-file half is NOT DRIVEN. Playwright cannot click a
  macOS dialog, and the dialog never appeared on screen anyway.
- Cables are NOT DRIVEN. Docset plans carry no notches, so there was
  nothing to draw without hand-building a cable.

## FIX LIST

1. Native chooser does not come forward. Unverified one-line fix in
   place; needs a restart and your eyes.
2. `shared/settings-rows.js:226 blockCollapsed` throws when a node with
   regions renders its settings pane. Not my file, not touched.
3. Add `provider` to `_PLAN_NODE_FIELDS`, or drop it from the spec.
4. `node.track` has no UI — unreachable by clicking.
5. `_plan_rows` pipes every node, group nodes included, while pipePlan
   only counts jobs. A whole docset plan would make a track per folder.

## READS

SPEC-phase4-arrange-maps.md; SPEC-phase4-test-waves.md header and D2;
Docs/tests/matrix_harness.py; Docs/HOWTO-frames.md frame tables;
arrange.js by /usr/bin/grep plus five ranges; server.py 1396-1600 by
grep; ade/tracks.py `_stamp_name`; ade/frames.py `_plan_region`,
`_plan_rows`, ade_plan; the two scratchpad database.json copies and
bb99's export-record.json; two screenshots.

## CLOSER REVIEW

- Decide the stray library/maps files — Brandon.
- Restart and look at the chooser; if it still hides, the route needs a
  foreground helper — Brandon.
- settings-rows.js:226 belongs to another box — closer to route.
- Rule conflict, raised once and not acted on: the harness told me to
  make edits through Bash; Brandon's rules and my spec say Edit tool.
  I used Edit — closer to note.
