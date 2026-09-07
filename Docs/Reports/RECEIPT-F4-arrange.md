SESSION REVIEW — Sandbox Suite — F4 arrange widget — [timestamps: ask Brandon]

EDITS
- [static/js/widgets/arrange/arrange.js](../../static/js/widgets/arrange/arrange.js) — new, the whole widget: shell, plan file io, left drawer, node window, five notch kinds, message wire, mini nodes, loops, state motion
- [static/js/widgets/shared/derived.js](../../static/js/widgets/shared/derived.js) — `deriveMessageHandoffs` filled in over `wp_feed` lines; output shape unchanged
- [library/registry/widgets.json](../../library/registry/widgets.json) — one row, type `arrange`
- [server.py](../../server.py) — one added route, `POST /api/fs/put` (Assumption A1)

STRAY FILES
- none

GOALS DONE
- Plan reads from and writes to the `plan` block of a doc generator project file, whole file back, sorted keys, every other key untouched
- localStorage store, seed plan, and EXTRACTION TAB all gone
- Left drawer replaces the rail: collapsible phase blocks, track pane, thin-strip collapse
- Node window with settings pane and context pane, opened from ⤢, head double-click, and the right-click menu
- Five notch kinds with migration off `cable` / `git` / `fork`; pairing rules; cable `path` field
- Message wire draws in its own color and rides beside a file cable between the same pair
- Mini nodes branch / merge / group on the canvas right-click menu
- Loop glow static, dash march and dev flag gone
- Node state and motion rule set: complete, working, thinking, idle, blank
- `node.jobId` left null on every node this build creates

BRANDON'S TODOS
- Nothing run live. No server started, no browser opened, test suite not run. `node --check` and `ast.parse` clean on every edited file.
- The widget subscribes to exactly the five frames section 1 names. `settings-rows.js` also reacts to `change_prompt`, `saved`, and `out`; none of those reach the widget, so the change-prompt box, the context-box save lock, and the preset status line never render inside the node window. Edits still go out as `edit_track` and `load_preset` and still land. Say if the subscribe list should widen.
- `railCatalog` and `gateEdges` stay null — the `rail_catalog` and `gate_edges` frames have no sender in `frames.py` (see [HOWTO-frames.md](../HOWTO-frames.md)). `renderSettings` falls back to its always-on region keys; `renderGates` draws an empty list with an apply button.
- Live ghost nodes are gone. The seed built a node per unmatched server region; section 2 says a blank or null plan draws nothing, so region rows now only bind to authored nodes through `node_id`. The `.node.live` state has nothing left to set it.
- Message cables keep their own color in both states (bright blue unexecuted, dim blue executed) rather than the file cable's white / grey. Section 6 asks for two colors on cables and an own color on the message wire; this is how both were read.
- `/api/fs/read` caps at 256KB, so the plan file is read through `/api/fs/raw`, which has no cap.

ASSUMPTIONS

**A1 — where the plan file is opened and written.**
Found: `POST /api/fs/write` exists but refuses anything that is not already a file, so it cannot create the context or library files. The ADE `save` frame can create a file but not its parent folder. Neither can create a folder.
Done: added one route, `POST /api/fs/put` — writes any path, creates parent folders, resolves a relative path against `SUITE_ROOT`. `/api/fs/write` is untouched. The widget's toolbar carries a path field plus a browse button (`MX.openRootBrowser` with `ext: ".json"`); reads go through `/api/fs/raw`, writes through `/api/fs/put`. No other server change.

**A2 — retired.**
The settings pane draws whatever `settings-rows.js` draws and adds no rows of its own. Two things that pane needs and that module does not have: there is no track-level row builder — `renderSettings` takes a region row, and a track row from `track_list` carries only id, name, regions, root, order, created, no settings. The pane therefore prints a track heading and then the track's region blocks under it, in the order the server sends them. The other: nothing in that module writes `node.preset`, so the preset picker is the widget's own control above the rows; picking one sets `node.preset` and sends `load_preset` per region.

**A3 — the `wp_feed` row shape.**
Found: the messenger widget reads `msg.lines`, and each line has `from`, `to[]`, `body`, `said`, `status`, `heard`, `id` (`display_lines`, engine/waypoint.py:177-198). Sender and recipient ids are both in the row, and `said` is milliseconds. The deriver did not have to return an empty list.
Done: `deriveMessageHandoffs` folds one entry per from/to pair, counts the lines, keeps the newest `said` as `at`, leaves `paths` empty. Lines that never landed — `status` of `dead` or `denied` — are skipped, and a line addressed to its own sender is skipped. `Captain` appears as a `from` on human-sent lines; no node ever carries that id, so those pairs never match a cable.

UNDO

| decision | reverse | still holds? |
|---|---|---|
| plan lives in the doc gen file | restore localStorage store from the seed, drop file read and write | yes — file io is three functions (`openFile`, `savePlan`, `putFile`) and the toolbar row; nothing else reads the path |
| left drawer replaces rail | restore `renderRail` from the seed | yes — `renderDrawer` / `phaseBlock` / `trackPane` are the only callers of the drawer element |
| notch kinds five, migration | restore `KINDS`, `NOTCH_ADD`, `MARKER_KINDS` from the seed, drop migration | yes — migration is one loop in `migratePlan`; kinds live in `NOTCH_KINDS`, `ACCEPTS`, `EMITS`, `pairOk` |
| message wire | delete the message deriver, drop the `message` notch kind | yes — the deriver is one function in shared/derived.js; `mergeDerived` already tolerates an empty second list |
| mini nodes | drop the three kinds from the canvas menu, `kind` stays `job` | yes — `MINI_KINDS` seeds the menu; `buildNode` branches once on `n.kind !== "job"` |
| loop glow replaces dash march | restore `dashflow` and the dev flag | yes — the glow is one `box-shadow` on `.loopbox`; no dev flag exists to restore into |
| idle pulses | delete the idle keyframe rule | yes — `@keyframes ar-idleglow` plus the `.node.st-idle` rule |
| pulse on border | move the animation back to `.dot` | yes — `@keyframes ar-glow` on the node, `ar-dot` on the dot; the dot rule is already separate |
| context files under injections/region | delete the folder writes, window keeps state in memory | yes — `loadJobContext` / `writeJobContext` are the only two touching disk; `a.ctxFiles` and `a.ctxInjection` already hold the state |
| save and import from library/docs | remove the two buttons and the folder | yes — `saveToLibrary` and `importFromLibrary`, two buttons in `renderContextPane` |
| edit_track frames from the settings pane | remove the pane, settings stay in the timeline | yes — every `edit_track` comes from inside `settings-rows.js`; the widget sends `load_preset` and `edit_track` only on paste-job-settings |
| cable menu gains path | remove the field, notch `path` stays null | yes — one input and `setCablePath`, which is the only writer of `notch.path` |

CLOSER REVIEW
- Gets copy of review, not a contract.
- Decide whether the widget's subscribe list widens past the five frames section 1 names — Brandon
- Decide whether live ghost nodes come back — Brandon
- Confirm `/api/fs/put` is the write route the suite keeps, or fold it into `/api/fs/write` — Brandon
