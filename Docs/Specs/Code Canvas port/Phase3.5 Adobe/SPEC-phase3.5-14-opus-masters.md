# SPEC — Phase 3.5 — 14 — Opus — Masters

Written 2026-09-14. Runs after R4 green. A page links a master file;
its content shows underneath, locked; page-number variables fill.

Contracts: scope sections 3.1 (link, meta, master layer, var), 3.4
(job 14 line), pick P7.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/canvas/canvas.js. Nothing else.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-14.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.1, 3.4, 5.
- canvas.js: `loadFileMode`, `docText`, `doSave`, `stash`, the layer
  helpers. About 12K of it.
- Docs/scratchpad/spread.master.html.

## Stage 1 — receipt outline. Check.

## Stage 2 — inject on load

In `loadFileMode`, after the iframe loads: read `link[rel="cc-master"]`;
fetch the href relative to the page's folder through `/raw/`; parse;
take its first `[data-cc-layer]`'s children; insert a first body
child `section[data-cc-layer][data-cc-master="1"][data-cc-locked="1"]
[data-cc-name="Master"][data-od-edit-bridge="master"]` holding them.
The bridge attribute makes it a host node: patch.js skips it, the
layers panel shows it greyed (it already skips host nodes — so
instead give the panel a way: the section carries the bridge attr
but the panel lists any `[data-cc-master]` section read-only; name
this in the receipt for tools). Fill every `[data-cc-var="page-number"]`
in the injected content from `meta[name="cc-page-number"]`. A missing
master file: status `master not found`, no injection. Check.

## Stage 3 — strip on save, keep on stash

`docText` serializes from `cv.source`, which never had the master
content — verify that no patch path ever writes into the master
section (locked plus host node covers it) and that `stash`/`restore`
re-inject on tab return. Check.

## Stage 4 — API and menu

`master()` and `setMaster(href)` (replace-outer-html on the link, or
insert it in head — head elements have no ids, so implement as a
`set-full-source`-free head edit: name the mechanism in the receipt;
a `set-head-link` patch kind would be job 1b's territory, so if you
need it, write it as a canvas-local text edit on `cv.source` with its
own inverse pushed to history). Bar ⚙ row: Master (text field). Page
number: a ⚙ row writing the meta the same way. Check.

## Stage 5 — test and receipt

Docs/tests/phase35_14.py, headless: fixture copy beside the master
copy; load → a first section with data-cc-master and the footer
text; the page-number span reads 1; click the footer → nothing
selected; save → the file on disk has no data-cc-master; reload →
back; setMaster("") → gone; Cmd-Z → back. Run it. Receipt. Check.

## Done when

- Master content shows on every page that links it and never saves.
- Page numbers fill from the meta.
- Master content is unselectable and unpatchable.
- phase35_14.py passes. node --check clean.
