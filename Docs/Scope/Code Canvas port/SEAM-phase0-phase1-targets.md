# SEAM — where phase 0 stops and phase 1 begins, and what a target is

Written 2026-09-12, mid session, after Brandon set the target model.
Reads phase 0 and phase 1 scopes in this folder. Nothing here is built.

## Words

- Wayfinder: a separate app that maps other repos. Not touched by any
  phase. Its analyzer makes graph files. Its five compiled view files
  get copied into the suite (phase 0 job F confirmed they can be).
- Shelf: library/graphs/ in Sandbox Suite. Graph files live there. A
  list route reads it. Phase 0 job G.
- Target: a root folder that has been scanned into one graph file on
  the shelf. The first target is Sandbox Suite itself. Phase 0 job E
  makes that file. A target is data on disk, not a widget.
- Wayfinder widget group: five suite widgets that draw one target and
  share selection over the bus. Phase 1. They run from the vendored
  files and the shelf. No Wayfinder code on the machine is needed to
  draw a target that already exists.

## The seam

Phase 0 ends when the shelf exists, one target is on it, and the bus
carries frames between widgets. Phase 0 has no Wayfinder widget.

Phase 1 begins with the first widget that reads the shelf.

What phase 0 already has: A B C D and the surface work, all green.
What phase 0 still owes: G the shelf and its routes, E the first target.

## Target model, as Brandon set it

- Target lives in widget options, one key, like phase 1's "graph"
  option already says. Same thing, better word.
- The options panel draws it as a dropdown of current targets plus a
  New target button.
- Current targets is the set of target values held by live widgets. A
  target leaves the dropdown when the last widget holding it closes.
  The file stays on the shelf.
- New target asks for a root, posts to the scan route, and the new
  file appears on the shelf and in the dropdown.
- Code Canvas will need pages inside one target. Later phase. The
  target key stays one string so a page key can sit beside it.

## Phase 0 G, restated against the model

- GET /api/library/graphs lists the shelf: name, root, mtime, node
  and edge counts. The dropdown's New target flow reads this after a
  scan.
- POST /api/library/graphs/scan runs the analyzer. Needs Wayfinder on
  the machine. On a machine without it, the route answers "no analyzer
  here" and nothing else breaks. Existing targets still draw.
- The analyzer path is read from one config value. Absent means
  scanning is off, not the suite.

## Open, Brandon's

- Current targets: derived from widgets on this surface only, or from
  every surface of the session. The second needs the server to read
  grid files; the first is one loop over grid.instances.
- Config home for the analyzer path, now that absence must be allowed:
  own small file like the workspace root, or an environment variable.
  global.json would need a settings.py line and would show on the
  settings screen.
- Scan route in phase 0 or with the first widget in phase 1. The list
  route and the first target by hand are enough for phase 1 to start.
