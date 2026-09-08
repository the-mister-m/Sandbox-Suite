# SPEC — Phase 4 fixes from Wave C — Sandbox Suite

Written 2026-09-07 by the Phase 4 session agent (Fable) from the Wave C
receipts (C1, C2 test and build, C3, C4). One box, F-E, Sonnet, cap
200K. Runs alone: item 6 remounts the grid and touches every widget.
The ruler and zoom collision is not here; Brandon decides after seeing
Docs/Reports/phase3-test/c2/test-09-narrow-ruler.png.

## Shared setup

- Session 9883b6bec3df. Server 127.0.0.1:5000. Brandon runs it. No
  start, stop, restart. No reloader: make every edit first, stop, report
  "ready for restart", wait for the session agent, then harness.
- Paths are grouped after S3: static/js/widgets/<group>/<name>/<name>.js.
- Harness: Docs/tests/matrix_harness.py mounts only. Copy to scratchpad,
  add page.evaluate and page.click between mount and screenshot. Headed.
  Probe pattern: Docs/Reports/RECEIPT-phase4-B1.md and C1.
- Regions live. Prefix mounts fe. Drop with kill_track and delete_track.
  gfsf stays.
- Grep first, read the named lines plus room to edit. Spec line numbers
  come from the receipts; confirm each. Edit tool, one hunk at a time.
  Log every read. Comments label, function, state only. "spine" banned.
  No commits, README, installs.
- Receipt Docs/Reports/RECEIPT-phase4-F-E.md, same shape as F-B.

## F-E — nine items

Source receipts: Docs/Reports/RECEIPT-phase4-C1.md, C2-build, C3, C4.

1. Devagent presets. devagent.js:419 and shared/settings-rows.js:426
   read `d.names`; /api/library/presets returns `{"list":[...]}`.
   Accept both shapes the way timeline.js:590 does. Load, rename,
   delete then reach the server.
2. Devagent context base. Read goes through /api/fs/read, which
   resolves against the server CWD (server.py:777). Save resolves
   against the region workspace root. Make read resolve against the
   same root as save. Server side, in the fs read route. Grep how save
   finds the root and mirror it.
3. Gates tab on mount. gate_edges is sent once at socket open
   (server.py:1754) and the roster reply carries none. Add a client
   frame `gate_edges` in ade/frames.py handle() that replies with the
   same send the socket-open path uses; devagent sends it once in mount
   after its roster send. C1 says the tab reads "no gate edges" on any
   real mount; after this it reads the edges.
4. Devagent render. C1: every tab and caret click runs `render()`,
   which remounts both add forms and the picker, so typed input is
   lost. `renderDetail` exists for the detail pane and is never called
   alone. Tab and caret clicks call `renderDetail`; roster and status
   frames keep the full render.
5. Numeric rows. settings-rows.js `controlKind(undefined)` returns
   "str", so an unset int row applies "7" as a string and the saved
   preset fails its own type check. Use the row's declared kind when
   the value is unset.
6. Grid remount on add. static/js/matrix/grid.js:149-161 `addWidget`
   calls `render()` (grid.js:237-243), which destroys and remounts every
   widget. Mount only the new instance; leave the others. C4 confirmed
   live state wiped on every add.
7. setOption saves. static/js/matrix/widget-frame.js:98-103 `setOption`
   never calls the grid save. Call it, so viewer tabs and any widget
   that persists through options survive a reload.
8. Insert-region default model. ade/frames.py:441 falls back to `""`
   for the model on insert_region with no preset. Default to the
   provider's default model; engine/providers.py:498 has
   `DEFAULT_MODEL = "sonnet"` for claude. Grep the ollama provider for
   its equivalent. C2's "+ insert region" then yields a runnable region.
9. isClaudeModel. timeline.js matches four literal names, so cache
   toggles hide on a region whose lane shows claude-sonnet-5. Match the
   provider, or the alias list and the resolved ids from providers.py.
   The models list the widget already fetches (F-D, `tl.modelRows`)
   carries `resolved`; use it.
10. Editor Save-As. usertools/editor/editor.js: Save-As on an untitled
    tab never re-runs `showTab`, so the path label and the preview
    markdown check stay stale. Call it after the save lands.
11. Viewer mermaid, vendored. usertools/viewer/viewer.js:71-78
    `ensureMermaid()` loads from a CDN; window.mermaid never populates
    once Monaco's AMD loader has run. Vendor mermaid under
    static/vendor/mermaid/ the way marked is vendored (grep matrix.html
    for marked). Use the ESM build and `import()` it from ensureMermaid,
    so the AMD loader never sees it. Pin the version in a one-line
    comment. Report the file size in the receipt.

Harness after restart, one window each, headed:
- devagent: load an existing preset, rename c1-style scratch preset,
  delete it; save a context file for a fresh region, read it back;
  gates tab on a late mount lists edges; type in the add form, click a
  tab, text still there. Screenshot each.
- grid: mount strip, run a turn so it has state, add a viewer; strip
  popover still open or its state intact. Screenshot before and after.
- viewer: open a .md with a mermaid fence, diagram renders, console
  line for the vendored load. Open two tabs, reload, both back.
- timeline: "+ insert region" gives a region with a model, its lane
  shows cache toggles.
- editor: Save-As on an untitled tab, path label updates.

## After F-E

Session agent relays the receipt. Gate D.
