# SPEC — Phase 3.5 — 01 — Opus — Strip doc mode

Written 2026-09-14. Runs after 0, beside 1b. Removes the .json engine
and every doc-mode path from the codecanvas widgets. File mode must
work exactly as it did on 2026-09-14 when this is done.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md
sections 3.3 (target), 3.4 (job 1 line), 3.5, 3.7.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned. No README.
- You own: static/js/widgets/codecanvas/canvas/canvas.js, tools/tools.js,
  code/code.js, shared/canvas-core.js, targets/targets.js, the widget
  registry line for the four deleted files, and the four files you
  delete. Nothing else. patch.js is job 1b's; do not open it for edit.
- Delete, do not comment out. Git holds the old code.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-01.md with STAGES, PICKS I
  MADE, CONTRACT FIELDS ADDED, and a REMOVED table: file, symbol, line
  count. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` on every edited file after every stage.

## Read, in this order

- The scope, sections 1, 3.3, 3.4, 3.5, 3.7, 5.
- canvas.js whole. 40K. Doc-mode paths: :84-89 modeForTarget, :111-537
  doc geometry and menus, :539-830 doc listeners, :1791-1831
  loadDocMode, :1860-1875 onStateChange and docText, :1918-1964 export,
  :1968-1985 page tabs, :2058-2127 bar, :2129-2451 module. File-mode
  paths :832-1708 stay.
- tools.js whole. 20K. Doc: :396-409 defOf resolveFor, :411-654 doc
  writers and builders, :678-763 doc layers, :925-998 library and
  page section, :1089-1123 drop (kit drag). File: :765-923, :1000-1087
  stay.
- code.js whole. 10K. Find the blocks and doc views.
- canvas-core.js :296-352.
- targets.js: grep `json`.
- Where the four shared files are registered: grep `state.js|kit.js|
  render.js|resolve.js` under static/ and library/registry/.

## Stage 1 — receipt outline

Receipt with stages unchecked and the REMOVED table filled with every
symbol you intend to delete, per file, before deleting. Check.

## Stage 2 — canvas.js

- `modeForTarget` returns `"file"` for .html, `""` otherwise. Status
  `target must be .html`.
- Delete the doc-mode geometry, listeners, menus, load, export, page
  tabs, and every `cv.docMode === "doc"` branch. `docMode` becomes a
  boolean-shaped string that is only ever `"file"` or `""`; keep the
  name.
- Bar: code, canvas, preview, path, Save, Annotate, ⚙, status. Remove
  schematic, links, zoom, Export, Open doc, from.
- Options: `target, targets, mode, selection, annotate, snapshot,
  annotateTrack`. Remove the rest per 3.7.
- `frame._canvas`: per 3.4 job 1 line. `menuItems` returns the file
  list only.
- `mirrors`: keep the six channels; nothing emits `canvas.doc` with
  `mode: "doc"`.
- `redraw` becomes `paintFileSelection`. Check.

## Stage 3 — tools.js

- `SECTIONS = ["tools","layers","snippets","page"]`, labels per 3.5.
  snippets and page render "Coming in job 15" / "Coming in job 2"
  placeholders for now.
- Delete doc builders, doc layers, library, doc page section, kit drop
  binding, `defOf`, `resolveFor`, `tl.core.kit` references.
- `renderTools` calls `renderInspector` directly. `renderLayers` calls
  `renderFileLayers` directly. Rename them to the short names.
- `api(tl)` unchanged. Check.

## Stage 4 — code.js, canvas-core.js, targets.js, registry

- code.js: source view only. Remove blocks, doc, resolved/template
  toggle, `docEditable`.
- canvas-core.js: core object is `{patch, baseDocument, channels,
  optionControls, mirrors}`. `baseDocument(mode, …)` keeps its
  signature; the `"doc"` branch is deleted; any non-file mode returns
  the file build. `CANVAS_TYPES` unchanged. Target control filters
  `.html`.
- targets.js: `ext: [".html"]`.
- Delete state.js, kit.js, render.js, resolve.js. Remove their
  registry lines. Grep the whole static/ tree for their names; nothing
  may still load them. Check.

## Stage 5 — test and receipt

- Write Docs/tests/phase35_01.py, headless Playwright, shape of
  Docs/tests/phase3F_headed.py: mount Canvas + Tools + Targets on a
  copy of the fixture; canvas mode; click an element (selected);
  shift-click a sibling; Cmd-G (group row in layers); Cmd-[; Cmd-Z
  twice; double-click a text leaf, type, Enter; Save; reload; the edit
  persists; a .json target is refused with the status word. Console
  clean. Run it. Screenshots to Docs/Reports/phase35-01/.
- Receipt. Check.

## Done when

- `grep -r "canvasState\|canvasKit\|canvasRender\|canvasResolve" static/`
  returns nothing.
- The four files are gone and nothing 404s in the console on load.
- phase35_01.py passes every line.
- Every name in scope 3.4 job 1 "stay" list is still on `frame._canvas`
  with the same signature.
- node --check clean on all five edited files.
