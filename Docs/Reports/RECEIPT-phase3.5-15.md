# RECEIPT — Phase 3.5 — 15 — Snippets drawer

SESSION REVIEW — Sandbox Suite — job 15, snippets drawer — 2026-09-14

EDITS
- static/js/widgets/codecanvas/tools/tools.js — snippets tab: SNIPPETS_LAYOUT (9
  Layout defs), SNIPPET_SETS ("Shapes" heading left empty), renderSnippets,
  snippetOuterHtml; drop-into-canvas: bindDrop/unbindDrop/dropPoint/dropParentNode,
  wired into render/mount/unmount/onOption
- static/js/widgets/codecanvas/tools/tools.js — contract 3.1 fix on job 2's behalf:
  createPageBlock now writes the fourth rule, `[data-cc-layer][data-cc-hidden]
  { display: none; }`; comment above writePageFields updated to say all four
  rules are written
- Docs/tests/phase35_15.py — headless Playwright test, new file

STRAY FILES
- none (fixture copy phase35_15-magazine-copy.html made and removed by the
  test's own teardown)

GOALS DONE
- Snippets tab renders nine Layout cards (Text frame, Headline, Image frame,
  Pull quote, Caption, Rectangle, Ellipse, Line, Group) plus an empty "Shapes"
  heading for job 9
- Cards are draggable, text/plain = snippet name
- Drop on the canvas iframe inserts one element via patchSource insert into
  the first [data-cc-layer] (or body), positioned at the drop point, selected
- One undo removes it
- node --check clean after every stage
- phase35_15.py: 4/4 passed

BRANDON'S TODOS
- none

CLOSER REVIEW
- Gets copy of review, not a contract.
- Confirm the contract 3.1 fix (fourth page-block rule) reads right against
  job 2's original receipt — Brandon or closer

## STAGES

- [x] Stage 1 — receipt outline
- [x] Stage 2 — the drawer
- [x] Stage 3 — drop
- [x] Stage 4 — test and receipt

## PICKS I MADE

- Coordinator fix: added the fourth `[data-cc-layer][data-cc-hidden] { display:
  none; }` rule to job 2's `createPageBlock`, per contract 3.1 being binding
  over the spec's "three calls" wording. Nothing else of job 2's touched.
- `insertAt` does not exist on `frame._canvas` yet (job 5, scope 3.4). Drop
  writes one `patchSource({kind:"insert", parent, index, html})` into the
  first `[data-cc-layer]` (or `"__body__"` when none), as the rules direct.
  Job 5 should swap this for `a.insertAt(html, {x,y}, ns)`.
- The `id` for the dropped element is generated up front with
  `tl.core.patch.newId("el")` and stamped into the insert html's own
  `data-od-id`, so it's known before the patch returns — used to emit
  `canvas.select` for it. `doInsert` in patch.js only invents an id when
  the html arrives without one, so this is a supported path, not a workaround.
- No zoom accessor exists on `frame._canvas` yet (3.3/3.4 list guides/snap/
  layers/insertAt for jobs 3-5, no zoom getter). The rule text says "left/top
  from the drop point divided by zoom"; dragover/drop are bound directly on
  the bound canvas's iframe *document* (`idoc`), so `e.clientX/clientY` and
  `doc.body.getBoundingClientRect()` are both already in that iframe's own
  local coordinate space — a same-origin iframe's internal event/layout
  coordinates aren't affected by an ancestor's CSS transform in the parent
  document, so no manual scale division is needed for this binding to be
  correct today. Flagging for job 3/5: if file-mode zoom ends up implemented
  as an in-document scale (not an outer-wrapper transform), this drop math
  will need an explicit divide once a zoom getter exists.
- Snippet HTML is built as a flat string (tag + inline `style` + `data-od-id`
  + one inner fragment) rather than going through `tl.core.patch.parse`/
  `serialize` — matches how `doInsert` in patch.js consumes `patch.html`
  directly (one root element via a `<template>`), and keeps every default
  (text/color/size) in one readable table (`SNIPPETS_LAYOUT`) instead of
  scattered DOM-builder calls.
- "Caption (p, small)" read literally: a `<p>` wrapping a `<small>` child,
  not a font-size style — matches the spec's own parenthetical shorthand for
  the other tags (h1, blockquote).
- "Rectangle / Ellipse / Line ... HTML divs with border-radius and a 1px
  height" read as: three plain `<div>`s, where Ellipse's own default carries
  `border-radius:50%` and Line's own default carries `height:1px` — not that
  every one of the three carries both.
- Drop-point math: `e.clientX/Y - doc.body.getBoundingClientRect().{left,top}`,
  not raw `e.clientX/Y`, since the page (body) is `margin: 0 auto` and can sit
  off the iframe's own left edge — matches "left/top from the drop point"
  meaning relative to the page, not the viewport.
- `Cmd-Z removes it` in stage 4 is tested by calling the contract's own
  `frame._canvas.undo()` directly, not a live keypress — keybinding routing
  to `undo` is canvas.js/host territory, outside tools.js.
- Drop binding follows the pre-job-1 library's shape (`bindDrop`/`unbindDrop`,
  one pair of listeners on the iframe document, re-bound in `render()`,
  torn down on target change, doc-mirror fire, and unmount) — read from git
  history per the rules, since job 1 removed the old library drop path.

## CONTRACT FIELDS ADDED

None — job 15 does not touch the `frame._canvas` contract (3.4). `insertAt`
not yet available; drop goes through `patchSource` insert directly (see
PICKS). No canvas options (3.3) touched.

## READ LEDGER

- Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-15-sonnet-snippets.md
  — whole, once
- Docs/Scope/Code Canvas port/SCOPE-phase3.5-adobe.md — lines 37-67 (picks),
  69-205 (contracts), 240-260 (stages/receipts/loop guard), once
- Docs/Reports/RECEIPT-phase3.5-02.md — whole, once
- static/js/widgets/codecanvas/tools/tools.js — whole (926 lines, per this
  job's own Read section: "tools.js whole after job 2"), once
- static/js/widgets/codecanvas/shared/patch.js — grep for "insert"; sed
  1-45 (header comment/KINDS) and 440-500 (doInsert, doRemove) and 639-700
  (newId, MX.canvasPatch exports), once, grep-only elsewhere
- static/js/widgets/codecanvas/canvas/canvas.js — grep for patchSource/
  stableId/applyPatches/zoom symbols, once; no line ranges opened
- git history (`git log --all -p -- .../tools.js`) — grep for bindDrop/
  dragover/drop, then sed 1270-1335 (old bindDrop/unbindDrop) and 1111-1165
  (old renderLibrary, card DOM pattern) from the diff output, once
- Docs/tests/phase35_02.py — whole (244 lines), once, as the harness pattern
  for phase35_15.py
- Docs/scratchpad/phase35-magazine.html — grep for data-cc-layer only, once

Tool call count at receipt finish: ~40

## TEST RESULT

Docs/tests/phase35_15.py, headless, against a copy of phase35-magazine.html
via the running server, session 0d78d246515f, surface phase35-15-headless.
`node --check` clean throughout.

1. PASS — fixture copy opens in file mode
2. PASS — snippets tab shows nine cards
3. PASS — drop Text frame at 200,300: one div, selected (el_zvobrr)
4. PASS — undo removes the dropped element

4/4 passed. Log: Docs/Reports/phase35-15/phase35_15-results.json

## STUCK

(none)
