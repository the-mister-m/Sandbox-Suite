# SPEC — Phase 2 — 2R — Sonnet — code redpen, run twice

Written 2026-09-12. No browser. Run once after 2B (checks 2A and
2B), once after 2C and 2D. Cap 80K each run. The session agent says
which run this is in the spawn prompt. Receipt name carries it:
RECEIPT-phase2-2R-a.md, RECEIPT-phase2-2R-b.md.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. No decisions.
- Never touch MEMORY.md or CLAUDE.md. Do not start or stop the server.
- Receipt shape: one line per check, PASS or FAIL or FIXED with
  file:line. Then QUESTIONS for the session agent, yes or no each.
  One line each to SESSIONLOG.md and INDEX.md.
- Mid-run rule: small double-check, note and keep going. Multi-
  consideration problem, easy undo or stop and ask.

## Read

- Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
  section 2.
- The receipts for this run's jobs, whole.
- The files those receipts name as edited, whole. Skip the vendored
  five; check only their import lines with grep.

## Checks, run a (2A and 2B)

Vendor
- Five files present in static/vendor/wayfinder/, byte-identical to
  Wayfinder/out/ts/app/ (diff). Import lines are the three in
  section 3.

graph-core.js
- Every name in the CORE API section is exported and matches section
  2A part 2.
- graphLoad memoizes per target and graphDrop evicts.
- graphFilters copies only fields that exist in the defaults list.

mermaid-frame.js
- Lines are `a --> b --> c`, names not ids, capped at CHAIN_CAP with
  ` --> ...`. Duplicates dropped. Copy writes plain text.
- Kind classes match `MX.graphKindClass`.

cards.js
- No import of monaco. No EDIT row. No openInEditor call.
- Every row from card.ts present in that order.
- Emits graph.select on its own change; never re-emits on mirror
  receipt.
- graph.open only when openInEditor and path and not synthetic; path
  is root joined with one slash.
- getOptions returns every key in the defaults.
- subscribe before send; mirrors off in unmount.

editor.js
- followGraph and graphTarget in defaults, getOptions, onOption.
- Reveal happens after the file frame, not before.
- mirror.js fourth argument present and defaulted to "target".

force.js and force-sim.js
- forceSim is pure: no DOM, no MX, one step, returns maxMove.
- Loop stops on frozen and on settle; restarts on filter or target
  change; cancelled in unmount.
- ViewModel from forceLayout has every field in layout.ts :88-101.
- Mirror receipts never re-emit. Camera writes markDirty.
- getOptions returns the live camera.
- Registry rows and script tags: types match, order is helpers,
  graph-core, mermaid-frame, force-sim, then widgets.

## Checks, run b (2C and 2D)

- stack.js and files.js have no sim, no frozen, no dims.
- Recipes called with the right signatures: planeLayout(index,
  filters); fileLayout(index, filters); zoomLayout(index, filters,
  trail, page).
- files.js: `view` select control present; trail and page in
  options; breadcrumb sets trail; home empties it.
- drawn-widget.js: if both jobs moved a block, one copy remains and
  both widgets call it. Merge if two copies exist; that is a MAY FIX.
- Same mirror and lifecycle checks as run a for both widgets.

## MAY FIX

- A missing off() or a missing markDirty.
- A re-emit on mirror receipt (add the guard).
- Script tag order.
- Two copies of the same drawn-widget block.
- A getOptions key missing from defaults or vice versa.

## Done when

- Every check PASS, FIXED, or FAIL with file:line.
- node --check clean after any fix.
