# SPEC — Phase 4 arrange: browse, archive, update, then D2 test — Sandbox Suite

Written 2026-09-07 by the Phase 4 session agent (Fable) from Brandon's
words on 2026-09-07 and a read of arrange.js:772-815, the doc generator
map folders, and types.ts. One box, D2, Opus, cap 200K. Build first,
restart, then the D2 checklist from SPEC-phase4-test-waves.md.

## What exists

- arrange.js opens a doc generator project database file through
  /api/fs/raw (openFile, :777), reads its `plan` block, and writes the
  whole file back through /api/fs/put (savePlan, :801). Path comes from
  a text field (:659) or MX.openRootBrowser (:731).
- Doc generator maps live under
  ~/Library/Application Support/doc-generator/<uuid>/docgen/. Each has
  database.json (docsetRoot tree of folders and files with labels,
  kinds, roles, extensions), library.json, schema.json, backups/. An
  exported map also has export-record.json with `rootPath`, the
  absolute folder on disk the tree was written to. None has a `plan`
  block yet; arrange writes it.
- Four maps exist. bb99c24e-6345-4a43-8c08-801aa706a15b is exported,
  root "/Users/moth3rship/Desktop/Music History", tree: RUNMAP.md and
  a Briefs folder. 981412e2-5c45-4e65-9a66-8a06bfe2b4de has four nodes,
  not exported.
- The aliased grep treats arrange.js as binary. Use /usr/bin/grep on it.

## Brandon's decisions

- Two sources of truth, on purpose. The generator owns its folder. The
  sandbox owns a copy in its library. Brandon keeps track of which is
  which.
- **Archive** is for the sandbox: copy a generator map into the library.
- **Update** is for the doc generator: push the sandbox's plan block
  back into the generator's database.json.
- The suite never writes generator docs. It only reads the tree and
  the export root to find them on disk.
- Browse opens the native macOS chooser. The server runs on the Mac,
  so a route can run it and return a real path.

## Build

1. Server route `GET /api/fs/pick?ext=json`: runs
   `osascript -e 'POSIX path of (choose file of type {"public.json"})'`
   and returns `{"path": ...}`, or `{"path": null}` on cancel. Put it
   next to /api/fs/raw in server.py. Nothing else about it.
2. Library folder `library/maps/`. One file per archived map,
   `<name>.json`, name from docsetRoot.label, stamped `.2`, `.3` if
   taken (mirror ade/tracks.py _stamp_name, client or server side).
   Shape: `{"source": <generator database.json path>, "root":
   <export-record rootPath or null>, "archived_at": <iso>, "doc":
   <database.json contents>}`.
3. Server routes `GET /api/library/maps` returning
   `{"list":[{name, path, source, root, archived_at}]}` and
   `POST /api/library/maps/archive` with `{"source": <path>}` that reads
   database.json, reads export-record.json beside it if present, writes
   the library file, returns its row. Refuse a source that is not a
   file named database.json.
4. arrange.js head: keep the path field and Enter. Replace the
   root-browser call at :731 with the pick route, then openFile on the
   returned path. Add **archive**, enabled when the open file is a
   generator database.json; calls the archive route, then opens the
   library copy. Add a **library** menu listing /api/library/maps; pick
   opens that file. Add **update**, enabled when the open file is a
   library copy with a `source`; writes `doc.plan` into the source
   database.json through /api/fs/put, whole file, plan block only
   changed. Save keeps writing whatever is open.
5. Finding files. When a library copy has `root`, a file node's disk
   path is root plus the labels from docsetRoot down to it, plus
   `.<extension>`. Show that path on the node's window and put it in
   the plan node the way the cable path field (:682) is stored today.
   When root is null, show "not exported" instead. Grep how arrange
   already maps docsetRoot nodes to plan nodes before adding fields.

Styles under the existing `ar-` prefix, existing variables, no new
colors. Comments label, function, state only. "spine" banned.

## Test, after restart

Never touch ~/Library/Application Support/doc-generator/. Copy
bb99c24e's docgen folder and 981412e2's docgen folder into the session
scratchpad first and use those copies as "the generator" for every step.

- Browse: click, native chooser opens, cancel returns null with no
  error, pick the scratchpad database.json, it opens. Screenshot.
- Archive: click, library/maps/Music History.json appears with the
  shape above, root filled from export-record. Archive the 981412e2
  copy: root null. Screenshot the library menu with both.
- Open from library: pick Music History, canvas shows the docset tree
  nodes, RUNMAP.md's window shows its disk path, the Briefs folder
  shows a folder node. 981412e2 nodes show "not exported".
- D2 checklist: drawer phases, canvas nodes and cables, node window
  settings and context panes, track pane centers on a node, pipe phase
  sends ade_plan. Build a phase with one node bound to a claude region
  provider claude model "sonnet" on track 5a031370bf1c. Pipe. Confirm
  the region lands with node_id set. Kill it after.
- Save: writes the library copy. Update: writes the plan block into the
  scratchpad database.json copy; diff shows only `plan` changed.
- Console clean beyond the known favicon 404.

## Receipt

Docs/Reports/RECEIPT-phase4-D2.md, shape as RECEIPT-phase4-C2-build.md:
EDITS, HARNESS, REGIONS MOUNTED AND DROPPED, STRAY FILES, GAP BETWEEN
BUILD AND SPEC, FIX LIST, READS, CLOSER REVIEW. Also
Docs/Reports/phase3-test/SPEC-test-arrange.md.
