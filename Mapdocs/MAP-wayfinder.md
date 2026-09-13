# MAP — Wayfinder

Recon only. Facts from code, sessionlog, index, and receipts.
Workspace: `/Users/moth3rship/Desktop/AI Design/Wayfinder/`

---

## PURPOSE

Wayfinder scans a project folder, extracts a node/edge graph of its code
(files, functions, classes, css rules, elements, comments), and draws that
graph as an interactive 3D-tilted map in the browser. It also lets you view
and edit the scanned project's source in a Monaco pane and save changes back
to disk, with a terminal and git status alongside.

---

## FILE MAP

Two code generations exist side by side. `analyzer/` + `app/` (root, `.js`)
is the original JavaScript build. `TS port/` is the active TypeScript build
— sessionlog entries from 2026-08-29 onward all touch `TS port/`, and
`npm run build` compiles only `TS port/` (`package.json` `build:types`
script). `analyzer/`/`app/` are not referenced by any current npm script
except the stale `scan`/`serve` scripts, which sessionlog (2026-09-07 entry)
calls "the dead pre-port app/serve.js."

| Path | Size | Role |
|---|---|---|
| `analyzer/index.js` etc. | ~6-10K each | legacy JS scanner (superseded) |
| `app/*.js`, `app/viewer.html` | ~1-25K each | legacy JS viewer (superseded) |
| `TS port/schema.ts` | 4K | Graph/Node/Edge/Comment types — the schema |
| `TS port/analyzer/walk.ts` | 4K | file tree walk, extension → language map |
| `TS port/analyzer/parse.ts` | 5.7K | tree-sitter parse, chunked read, comment sweep hookup |
| `TS port/analyzer/comments.ts` | 5K | comment sweep: owner/where/what classification |
| `TS port/analyzer/resolve.ts` | 10.7K | edge resolution (imports/calls/styles/touches), exact vs guess |
| `TS port/analyzer/emit.ts` | 5K | graph.json writer, sort + validation |
| `TS port/analyzer/index.ts` | 6.9K | scan orchestration, language dispatch |
| `TS port/analyzer/lang/{css,html,javascript,python}.ts` | 5-11K each | per-language node/edge extractors |
| `TS port/app/serve.ts` | 29.5K | HTTP server, routes, port, save/scan/browse |
| `TS port/app/map.ts` | 35K | SVG renderer, camera, selection, shift-click, fan/tabs |
| `TS port/app/layout.ts` | 29.3K | "shelves" layout recipe (grouping/packing, not physics) |
| `TS port/app/viewer.html` | 46.3K | the page: mounts map, card, filters, drawer chrome |
| `TS port/app/style.css` | 40.6K | all viewer styling |
| `TS port/app/monaco.ts` | 17.4K | Monaco pane for viewing/editing scanned source |
| `TS port/app/edits.ts` | 10.7K | edit-marking on nodes (post-stub; see WIRED VS STUBBED) |
| `TS port/app/card.ts` | 11.4K | node detail card (WHO/WHERE/COMMENTS/SHAPE/USES/WEIGHT) |
| `TS port/app/chrome.ts` | 13.8K | header chrome, per-language counts |
| `TS port/app/filters.ts` | 6.1K | view switches (nestFolders, capLevels, comment filters, reachCommon, etc.) |
| `TS port/app/reach.ts` | 3.6K | blast-radius style neighborhood walk (exact edges only) |
| `TS port/app/search.ts` | 3.7K | plain substring search over name/facts/comments |
| `TS port/app/tabs.ts`/`.css` | 2.8K/2.2K | per-pick tabs for multi-select |
| `TS port/app/picker.ts`/`.css` | 4.5K/2.7K | folder picker, retargets SCAN_ROOT live |
| `TS port/app/terminal.ts`, `terminal.server.ts` | 8.3K/3.6K | in-browser terminal (xterm + node-pty) over the scanned project |
| `TS port/app/git.ts` | 1.4K | git status reader for the scanned project |
| `TS port/app/capture.ts`/`.css` | 5K/0.3K | capture-script injection for target pages |
| `TS port/app/errorpane.ts`/`.css`, `errors.server.ts` | ~11K/2.5K/2.7K | runtime error surfacing from a served target page |
| `TS port/app/flagstore.ts` | 5.3K | persisted UI-flag store |
| `TS port/app/options.ts`/`.css` | 4.2K/0.6K | options panel |
| `TS port/app/viewcube.ts` | 6K | corner orientation cube |
| `out/graph.json`, `out/ts/` | — | scan output; compiled build output |
| `fixtures/viewer/` | — | nine-file fixture project, 84 nodes / 142 edges |
| `configs/*.wayfinder.json` | — | per-project scan configs (ignore rules, language toggles) |
| `docs/SCHEMA.md` | — | frozen schema spec (see DOC VS CODE DISAGREEMENTS) |
| `docs/contracts/card-contract.md` | — | frozen card-field spec (stale, see below) |

---

## ENTRY POINTS

Per `HOWTO-run.md` and `TS port/app/serve.ts:1-22`:

```
npm install
npm run build                              # tsc over TS port/ -> out/ts/
node "TS port/app/serve.ts" <target-folder> [--config <path>]
```

- `serve.ts` itself runs **from source** (`node "TS port/app/serve.ts"`) — it
  computes its own ROOT from `import.meta.url`, so it must run un-compiled
  (`TS port/app/serve.ts:11-22`). Everything else it loads (analyzer, other
  app modules) is loaded from the **build** (`out/ts/`) via runtime
  `import()`, because tsc does not rewrite `.ts` specifiers to `.js`.
- Target folder is a required CLI argument — the project being scanned/edited.
  Never guessed, never `process.cwd()` (`serve.ts:8-10`).
- Port: `PORT` env var, default **8117** (`serve.ts:39`). `PORT=8200 node ...`
  moves it.
- Serves: `http://localhost:<port>/TS%20port/app/viewer.html`.
- Legacy path: `npm run scan` → `node analyzer/index.js`; `npm run serve` →
  `node app/serve.js`. Present in `package.json` but not the path used by any
  session since 2026-08-29 per sessionlog.

---

## DATA IN / DATA OUT

**In:**
- Target project's source tree, walked by `TS port/analyzer/walk.ts` — file
  extensions map to `css`, `html`, `javascript`/`typescript`/`tsx`, `python`.
- `--config <path>` to a `wayfinder.json` (root, ignore rules, language
  toggles); examples in `configs/`.
- Nothing is read back in as a "graph file" input format for a second tool —
  graph.json is Wayfinder's own output, read by its own viewer only.

**Out:**
- `out/graph.json` — the scan result, written by `TS port/analyzer/emit.ts`,
  read by the browser viewer via fetch. `schema_version` at top; frontend
  refuses a mismatch (per `docs/SCHEMA.md`, not independently verified in
  code this pass).
- `out/ts/` — compiled JS + `.d.ts` from `tsc -p "TS port/tsconfig.json"`.
- Edits made in the Monaco pane: `POST /save` (`TS port/app/serve.ts:199-241`,
  function `handleSave`) writes the edited text straight to the file inside
  the scanned project (`fs.writeFileSync(abs, post.text)`), guarded by
  `insideScan()` so a path cannot escape the scan root (`serve.ts:211-215`).
  A rescan runs immediately after a successful save (`serve.ts:230`); if the
  rescan fails, the response says the file saved but the graph is stale
  (`serve.ts:234-240`).
- Terminal + git operate directly against the scanned project's filesystem
  (`TS port/app/terminal.server.ts`, `TS port/app/git.ts`).

---

## DEPENDENCIES

From `package.json` (root — the only place dependencies live; `TS port/package.json`
is a marker file with no deps of its own):

- **npm, pinned:** `tree-sitter` 0.21.1 + grammars `tree-sitter-css` 0.21.0,
  `tree-sitter-html` 0.20.3, `tree-sitter-javascript` 0.21.4,
  `tree-sitter-python` 0.21.0, `tree-sitter-typescript` 0.23.2 — all parsing.
  `monaco-editor` 0.56.0, `node-pty` 1.1.0, `@xterm/xterm` 6.0.0,
  `@xterm/addon-fit` 0.11.0, `ws` 8.18.0.
- **devDependencies:** `typescript` 7.0.2, `@types/node` 26.4.0,
  `@types/ws` 8.18.1, `playwright` 1.63.0 (added 2026-09-07 for a headed
  multi-select test run per sessionlog).
- **No CDN dependencies found in `TS port/app/viewer.html`** for the graph
  view itself — Monaco/xterm/node-pty are all npm-vendored and presumably
  served/bundled locally, not pulled from a CDN (contrast with Code Canvas,
  which loads Monaco from cdnjs). Not independently confirmed by reading
  every asset path in viewer.html this pass — see UNKNOWNS.
- **No graph-layout or rendering library.** No d3-force, no cytoscape, no
  three.js/WebGL. Rendering is one hand-rolled SVG tree built with
  `document.createElementNS` (`TS port/app/map.ts:213`), projected through a
  custom yaw/pitch camera the code itself describes as "One SVG, one
  renderer, three recipes" (`TS port/app/map.ts:3`).

---

## WIRED VS STUBBED

**Wired, end to end:**
- Scan → graph.json → viewer render (`TS port/analyzer/index.ts` →
  `TS port/analyzer/emit.ts` → fetched by viewer, drawn by `map.ts`/`layout.ts`).
- Monaco/textarea edit → `POST /save` → file write → rescan
  (`TS port/app/serve.ts:199-241`). Confirmed by reading `handleSave` in full.
- Search (`TS port/app/search.ts`) — plain case-insensitive substring across
  name/facts/comments, per its own header comment, no fuzzy/scoring.
- Reach / neighborhood walk (`TS port/app/reach.ts`) — exact edges only,
  both directions, depth switch. This is the feature that absorbed the
  2026-08-27 sessionlog's "SEARCH and BLAST RADIUS were never built" item;
  no literal "blast radius" string exists in the TS port, but reach.ts covers
  the same one-node-outward function that item named.
- Comment sweep (`TS port/analyzer/comments.ts`) — every comment node,
  classified `prose`/`dead`/`todo`/`directive`, byte-exact spans, round-trip
  proven per sessionlog 2026-08-31 entry.
- Multi-select, per-pick reach fans, tabs, common-reach intersection
  (`TS port/app/map.ts`, `TS port/app/tabs.ts`) — sessionlog 2026-09-07,
  30/30 headed-Chromium pass against the fixture only (not a real project).
- Python scanning (`TS port/analyzer/lang/python.ts`) — sessionlog
  2026-09-08, 935 functions + 51 classes on LLM Sandbox vs. hand-count 986,
  exact.
- Project picker (`TS port/app/picker.ts`) — retargets `SCAN_ROOT` live via
  `GET /browse`, no restart (sessionlog 2026-08-30).

**Stubbed / half-built / open, per sessionlog and code comments (not
independently re-verified against current HEAD beyond what's cited):**
- `TS port/app/edits.ts:263-269` — comment block "the STUB IS GONE" says a
  prior `stubEditRow()` was removed; current edit path is the Monaco/save
  route above, not a stub — noted here because the file's own comments frame
  edits as a recently-replaced stub, worth re-checking if edits misbehave.
- `TS port/app/serve.ts:571` — comment: "the starting folder. Open, see
  TODO.md" — an open item, not resolved in code.
- No golden `graph.json` and no test script exist for the analyzer itself
  (sessionlog 2026-08-27, 2026-08-15 — repeatedly carried, not closed as of
  the head of sessionlog).
- `dead` comment classification is "conservative and untuned" — 16 hits in
  598 comments on Wayfinder's own codebase, not validated against real files
  (sessionlog 2026-08-31).
- Embedded `<script>` comments inside HTML are not swept — the HTML grammar
  holds them as raw text, not comment nodes (sessionlog 2026-08-31).
- The doc/DB extraction script (graph.json → doc/DB) "is not built" as of
  2026-08-31 sessionlog entry.
- `npm run serve` still points at the retired `app/serve.js`
  (`package.json`, noted stale in sessionlog 2026-09-07).
- Two second copies of SCAN_ROOT (terminal's spawn cwd, `errors.installTarget`)
  do not follow a live project switch — only the git reader does
  (sessionlog 2026-08-30 picker entry).
- Header chrome cost (`TS port/app/chrome.ts`) — per-language counts and
  zero-hiding "discussed, chrome.ts was never read" as of 2026-09-08
  sessionlog entry (i.e., that entry's session did not check current state).

---

## GRAPH FORMAT

Source of truth: `TS port/schema.ts`. Confirmed against a real scan,
`out/graph.json` (84 nodes / 142 edges / 186 comments, root
`fixtures/viewer`).

```ts
interface Graph {
  schema_version: number;
  root: string;          // absolute scan root; binds node ids to a project
  nodes: Node[];
  edges: Edge[];
  comments?: Comment[];  // optional, additive
}

interface Node {
  id: string;             // "path" or "path::name" — see ID rules below
  kind: "file" | "function" | "class" | "css-rule" | "element" | "asset";
  lang?: string | null;
  span?: [number, number];
  summary: Summary;
  parse_status?: "failed";
}

interface Edge {
  from: string;
  to: string;
  kind: "imports" | "contains" | "calls" | "styles" | "touches";
  resolved: "exact" | "guess";
}

interface Summary { shape: string; facts: string[]; weight?: Weight | null; }
interface Weight { lines: number; props?: number; attrs?: number; branches?: number; methods?: number; }

interface Comment {
  owner: string; file: string;
  span: [number, number]; bytes: [number, number];
  where: "header" | "leading" | "trailing" | "interior" | "orphan";
  what: "prose" | "dead" | "todo" | "directive";
  text: string; raw: string;
}
```

**ID rules** (`docs/SCHEMA.md`, matches observed output):
- File node id = path from scan root, forward slashes: `static/skin-dark.css`.
- Inner thing = `path::name`, one level: `static/skin-skin1.css::#ed-title`.
- A selector/name that itself starts with `:` (e.g. CSS `:root`) produces an
  id that reads as three colons — `static/skin-dark.css:::root` — because it
  is `path` + `::` + `:root`, not a different separator. Confirmed in
  `out/graph.json`; not a schema violation.
- Method inside a class: `path::Class.method` (dot, not a second `::`).
- Unnamed thing numbered by order-in-file, per kind: `path::div[3]`.
- Reused name numbered from 2: `page.html::wire`, `page.html::wire[2]`.
- Determinism: `graph.json` byte-identical for identical input; nodes sorted
  by id, edges sorted by from/to/kind, plain byte order.

**Loading:** the viewer fetches `out/graph.json` at runtime (path resolved
from ROOT, per `serve.ts` comments); no other input graph format is accepted.

**Layout:** NOT force-directed. `TS port/app/layout.ts` implements a fixed
deterministic "shelves" recipe — files grouped by top-level folder into
stacked planes; each file gets a sized pad; parts inside a pad sit in a grid,
wired parts (non-containment edges) placed toward the front row
(`TS port/app/layout.ts:1-15`). No physics simulation, no iterative
relaxation. Two zoom recipes exist: `flatLevel` (as originally shipped) and
`nestedLevel` (adds folder nesting), both capped and paginated (sessionlog
2026-08-27).

**Rendering:** one SVG tree, hand-built via `document.createElementNS`
(`TS port/app/map.ts:213`), with a custom yaw/pitch 3D-style projection
(`HOME_YAW`/`HOME_PITCH` constants, `TS port/app/layout.ts:33-35`). No
graph/visualization library used.

**Example fragment** (from `docs/SCHEMA.md`, shape matches live output):
```json
{
  "schema_version": 1,
  "nodes": [
    { "id": "src/style.css", "kind": "file", "lang": "css" },
    { "id": "src/style.css::.poster", "kind": "css-rule", "span": [12, 18],
      "summary": { "shape": ".poster", "facts": ["width: 8.5in"] } }
  ],
  "edges": [
    { "from": "src/index.html", "to": "src/style.css",
      "kind": "imports", "resolved": "exact" },
    { "from": "src/style.css::.poster", "to": "src/index.html::#poster",
      "kind": "styles", "resolved": "exact" }
  ]
}
```

---

## DOC VS CODE DISAGREEMENTS

- `docs/SCHEMA.md` line ~79 documents a card field `SAYS  doc/comment,
  verbatim`, and `docs/contracts/card-contract.md` line ~107 lists `SAYS` in
  the card's row list. Current code has no `summary.says` field —
  `schema.ts` has no `says`, and the card
  (`TS port/app/card.ts`) shows `COMMENTS n of m` instead, per the comment
  sweep rebuild (sessionlog 2026-08-31: "`summary.says` is GONE... Cut from
  the schema, the emitter, all three extractors"). Both docs are marked
  frozen/locked and were explicitly left unedited ("Brandon's call" — 2026-08-31
  entry) — the disagreement is known and open, not accidental drift.
- `wayfinder-design.md` section 6, per multiple sessionlog entries
  (2026-08-27, 2026-08-20), still said analyzer language was "OPEN" after
  Brandon ruled JavaScript, then later TypeScript/Python were added in code
  — this doc's staleness was called out repeatedly in-session, not
  independently re-checked against the doc's current text this pass.
- `TS port/package.json` states "nothing runs from this folder" (i.e.
  `TS port/` is source-only, run from `out/ts/`). `HOWTO-run.md` and
  `serve.ts`'s own header comment say `serve.ts` itself runs directly from
  `TS port/` via `node "TS port/app/serve.ts"`. Not a doc-vs-code conflict —
  `serve.ts:11-22` explains the split (entry file runs from source for path
  reasons; everything it imports comes from the build) — but the plain
  package.json description reads as contradicting the HOWTO unless that
  comment is read.

---

## UNKNOWNS

- Whether `out/graph.json`'s `schema_version` mismatch guard actually exists
  in the current viewer boot code — asserted by `docs/SCHEMA.md`, not traced
  to a specific line in `TS port/app/*.ts` this pass.
- Whether Monaco/xterm assets are served locally from `node_modules` or
  fetched some other way at runtime — not traced past `package.json`
  dependency listing.
- Current git-tracked vs. working-tree state of `TS port/` (2026-09-08
  sessionlog entry says "nothing committed, ten files in the working tree");
  not re-checked against `git status` this pass.
- Whether `chrome.ts` (header chrome) has since been read/wired — sessionlog
  as of 2026-09-08 says it "was never read" this project.
- Exact current content of `docs/reports/reviews/*` receipts — listed by
  sessionlog as "only with permission," not opened this pass.
