# SPEC — Phase 3F — C — Sonnet — Patch kinds

Written 2026-09-13. Runs with A and B. patch.js grows five kinds,
inverse patches, a live-document apply, id normalization and a history
object. Pure functions on Documents. No widget code.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md
section 3.3, picks P5, P6.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- You own static/js/widgets/codecanvas/shared/patch.js. Nothing else.
  Every existing export keeps its name and its behaviour.
- Stages below. After each, append `- [x] Stage N — label` to
  Docs/Reports/RECEIPT-phase3F-C.md. At 200K with stages open: stop,
  write Docs/Handoffs/HANDOFF-phase3F-C.md. Hard cap 250K.
- Receipt in the SESSION REVIEW shape with STAGES, PICKS I MADE,
  CONTRACT FIELDS ADDED, and a KINDS table: kind, fields, inverse,
  refusal cases. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` after every stage. Stage 5 is a real test run.

## Read, in this order

- The scope, sections 1, 2, 3.3, 3.5, 5.
- static/js/widgets/codecanvas/shared/patch.js — whole. 10K.
- static/js/widgets/codecanvas/canvas/canvas.js :796-830 and
  :1031-1045 — how file mode finds elements and calls `apply` today.
  Read only. Do not edit.
- static/js/widgets/codecanvas/shared/canvas-core.js :242-272 — the
  id script the iframe runs, so your ids and its ids agree.

## Stage 1 — read and plan

Receipt with STAGES unchecked and the KINDS table filled in from the
scope before you write code. Check stage 1.

## Stage 2 — applyToDoc and inverses

- Split `apply` into `applyToDoc(doc, patch)` → `{ok, inverse}` and a
  thin `apply(text, patch)` → `{text, inverse}` that parses, calls
  applyToDoc, serializes. A refused patch returns the input text and
  `inverse: null`, with the existing `console.warn` lines.
- Callers of today's `apply` expect a string. Keep a string-returning
  shim: if `apply` is called and the result is used as text by job D,
  D reads `.text`. Name the change in the receipt as a contract edit
  to `apply`'s return.
- Inverses for the five existing kinds per scope 3.3. set-full-source
  handles inverse in `apply` only; `applyToDoc` refuses it.
- Check stage 2.

## Stage 3 — five new kinds

- `wrap {ids, id}`, `unwrap {id}`, `move {id, parent, index}`,
  `remove {id}`, `insert {parent, index, html}` per scope 3.3.
- `parent` resolves through `find`; `"__body__"` is the body.
- `index` counts element children that are not host nodes, in both
  the live document and a parsed one. Write one `siblingsOf(el)` and
  one `childAt(parent, index)` and use them everywhere.
- `wrap` refuses when the ids are not all siblings of one parent, or
  any id is missing. The wrapper gets `data-od-id = patch.id` and
  `data-od-group = "1"`. Order inside the wrapper is document order.
- `unwrap` refuses without `data-od-group`.
- `insert` refuses unless `html` parses to exactly one root. The root
  and every descendant lacking `data-od-id` get `newId("el")`.
- `KINDS` lists all ten. `ALIAS` unchanged.
- Check stage 3.

## Stage 4 — normalize, newId, history

- `normalize(text)` → `{text, n}`: parse, assignIds, serialize with
  the original for the full-or-fragment decision. `n` is the count
  stamped.
- `newId(prefix)` → `prefix + "_" + six of [a-z0-9]`.
- `history()` → `{push(entry), undo(), redo(), canUndo(), canRedo(),
  clear()}`. Entry `{patches: [], inverses: []}`. Push truncates redo.
  `undo()` moves the pointer back and returns that entry; `redo()`
  forward. Plain arrays inside, nothing else.
- Export all three on the `MX.canvasPatch()` object.
- Check stage 4.

## Stage 5 — test and receipt

- Write Docs/tests/phase3F_patch.html: a page that loads patch.js and
  runs, in the browser console or an inline script, every kind on a
  small fixture and its inverse, asserting the text round-trips to the
  pre-patch text. Also: normalize twice is idempotent; applyToDoc on a
  live document and apply on its text agree on the final `outerHTML`
  of body. Open it through the server's static route if a server is
  up, else with `node` and jsdom if present, else say in the receipt
  what could not run.
- Receipt. Check stage 5.

## Done when

- Every kind applies and its inverse restores the exact prior text.
- wrap then unwrap, move then move back, remove then insert: identity.
- `apply` on text and `applyToDoc` on a live document give the same
  body for the same patch.
- normalize stamps every element once and never twice.
- The five original kinds still pass today's canvas.js callers.
- node --check clean.
