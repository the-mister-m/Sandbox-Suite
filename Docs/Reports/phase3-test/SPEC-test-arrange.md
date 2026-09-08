# SPEC-test-arrange — Sandbox Suite

## 2026-09-07 — D2, Phase 4 (arrange: browse, archive, update)

Box D2, Opus, session 9883b6bec3df. Build then test, one restart between.
Drivers in the session scratchpad: d2_driver.py, d2_driver2.py,
d2_driver3.py, d2_driver4.py. All headed, all mounted with
MX.grid.addWidget. Screenshots d2-01 through d2-12 in this folder.

### RENDER

arrange mounts clean. Head row now reads: open plan file · path · dirty
dot · save · archive · library · update · pipe phase · show all.
archive and update start disabled. Drawer, canvas, node windows, track
pane all render.

### READ LINE CONFIRMED OR REFUTED

- CONFIRMED: opens through /api/fs/raw, writes through /api/fs/put.
- CONFIRMED: sends ade_plan; regions land on nodes by node_id.
- CONFIRMED: reads both row types (trackRows, regionRows).
- REFUTED, and this is the important one: the read line and the build
  spec both assume arrange already maps docsetRoot nodes to plan nodes.
  It never did. Before this build arrange read `doc.plan` and nothing
  else; a doc generator database.json with no plan block opened empty.
  The docset-to-plan mapping is new code, not an edit to old code.
- NOT CONFIRMED: the plan node has no `provider` field, and
  ade/frames.py `_PLAN_NODE_FIELDS` does not carry one. "provider
  claude" reaches the region only through the model name.

### CHECKLIST

| line | result |
|---|---|
| browse opens the native chooser | PARTIAL — route blocks on a live `choose file`, so the dialog exists, but it never came to the front on screen. See FIX LIST. |
| cancel returns null, no error | CONFIRMED by shape; the cancel was forced by killing the osascript process, not by clicking Cancel. |
| pick the scratchpad database.json | NOT DRIVEN — Playwright cannot click a macOS dialog. Opened through the path field instead, which works. |
| archive writes library/maps/Music History.json | PASS. `{source, root, archived_at, doc}`, root `/Users/moth3rship/Desktop/Music History` from export-record.json. |
| archive the 981412e2 copy, root null | PASS. Lands as `Desktop.json` (its docsetRoot.label is "Desktop", not "Music History"), root null. |
| name stamping | PASS. A second archive of the same source wrote `Music History.2.json`. |
| library menu lists both | PASS. Three rows, the unexported one labelled "not exported". |
| open from library shows the docset tree | PASS. RUNMAP.md a job node, Briefs a group node. |
| RUNMAP.md window shows its disk path | PASS. `/Users/moth3rship/Desktop/Music History/RUNMAP.md`. |
| 981412e2 nodes show "not exported" | PASS. |
| drawer phases | PASS. Phase blocks, + phase adds one, selecting re-renders the canvas. |
| canvas nodes and cables | PASS for nodes. Cables NOT DRIVEN — the docset plans carry no notches, so no cable could be drawn without hand-building one. |
| node window settings and context panes | PASS. |
| track pane centers on a node | PASS via the 🗺 button (`.tk-map`). The row body opens the node window instead — that is the existing design, not a fault. |
| pipe phase sends ade_plan | PASS. One phase, one node, track `d2-arrange`, model `sonnet`. |
| region lands with node_id | PASS. Region `1629990e0150`, node_id `kmtrt6aob6`, matching the node. |
| kill the track after | PASS. kill_track + delete_track; roster back to the pre-existing `untitled`. |
| save writes the library copy | PASS. |
| update writes the plan into the source | PASS. |
| diff shows only `plan` changed | PASS. Key diff against a pre-test snapshot: added `plan`, nothing changed, nothing removed. |
| console clean beyond the favicon 404 | FAIL. See CONSOLE. |

### CONSOLE

- favicon 404 — known, page level.
- `[pageerror] Cannot read properties of undefined (reading 'has')` at
  `static/js/widgets/shared/settings-rows.js:226` in `blockCollapsed`,
  reached from `renderSettingsPane` when a node's settings pane renders
  for a node that carries real regions. Outside D2's files, not fixed.
- one 400 BAD REQUEST alongside that same render.

Both appear only after a pipe, when a node has regions. A node with no
regions renders its settings pane clean.

### FIX LIST

1. The native chooser does not come to the front. `choose file` runs and
   blocks, but no window appeared on screen, on the widget click or on a
   direct shell call. One line was added during the test stage —
   `osascript -e activate -e <script>` — and it is UNVERIFIED, because
   the server has no reloader and was not restarted again. Needs a
   restart and Brandon's eyes. If activate is not enough, the route needs
   a real foreground helper.
2. `settings-rows.js:226 blockCollapsed` throws on a node with regions.
   Belongs to whoever owns shared/settings-rows.js.
3. The plan node has no provider field, so "provider claude" cannot be
   set from arrange. Either add `provider` to `_PLAN_NODE_FIELDS` in
   ade/frames.py or drop the wording from the spec.
4. `node.track` has no UI. The driver had to set it on the plan object.
   Piping to a named track is unreachable by clicking.
5. `pipePlan` guards on job nodes but `_plan_rows` pipes every node in
   the phase, group nodes included. A docset plan piped whole would make
   a track per folder.
6. A docset file label already carries its extension (`RUNMAP.md` with
   extension `md`). The spec's literal rule would build `RUNMAP.md.md`;
   the build skips the append when the label already ends in it.
7. `/Users/moth3rship/Desktop/Music History` does not exist on disk, so
   no computed path was checked against a real file.

### READS

Docs/Specs/SPEC-phase4-arrange-maps.md; SPEC-phase4-test-waves.md
(header + D2); Docs/tests/matrix_harness.py; Docs/HOWTO-frames.md
(frame tables); arrange.js by /usr/bin/grep plus five ranges; server.py
routes 1396-1600 by grep; ade/tracks.py `_stamp_name`; ade/frames.py
`_plan_region`, `_plan_rows`, ade_plan; the two scratchpad
database.json copies and bb99's export-record.json.

### BLOCKERS

- Native macOS dialogs cannot be driven by Playwright. Browse stays a
  Brandon-eyes test.
- No restart was available after the chooser fix, so item 1 is unproven.

## W4 — 2026-09-07

- Cable draw/save/reopen: SEEN. Added a message notch to RUNMAP.md (job)
  and Briefs (group) via the real node context menu, dragged a real
  pointer-event cable between the two notches, set the cable's path,
  saved, reopened. Cable and path present after reopen. Landed on
  `library/maps/Music History.2.json` (a library-menu click matched that
  row, not the plain file); the plain `Music History.json` is untouched.
- Pipe, provider + group-skip: SEEN. One job node (`provider: claude,
  model: sonnet`) plus one group node in a fresh phase; pipe produced a
  region with `node_id`, `provider: "claude"`, `model: "sonnet"`; the
  group node produced no region. Console clean before/during/after.
- Full detail: RECEIPT-phase4-W4.md.
