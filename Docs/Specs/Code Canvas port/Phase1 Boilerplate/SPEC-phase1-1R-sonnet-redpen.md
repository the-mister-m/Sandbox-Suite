# SPEC — Phase 1 — 1R — Sonnet — code redpen after 1D

Written 2026-09-12. No browser. Reads code and receipts against the
contracts. Cap 80K. Fixes only what is listed under MAY FIX. Everything
else is a line in the receipt.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. No decisions.
- Never touch MEMORY.md or CLAUDE.md. Do not start or stop the server.
- Receipt: Docs/Reports/RECEIPT-phase1-1R.md. Shape: one line per
  check, PASS or FAIL or FIXED with file:line. Then QUESTIONS for the
  session agent, each answerable yes or no. One line each to
  SESSIONLOG.md and INDEX.md.
- Mid-run rule: a small double-check, note it and keep going. A
  multi-consideration problem, pick the easy undo or stop and ask.

## Read

- Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
  section 2 only.
- Docs/Reports/RECEIPT-phase1-1A.md, 1B, 1D.
- The files those receipts name as edited. Whole.

## Checks

Routes, server.py
- Each of the five routes in section 2.5 exists with that exact path
  and method. Response keys match.
- Name validation on `/api/library/graphs/<name>` rejects `..` and
  slashes.
- import route refuses schema_version != 1 with 400.
- targets route skips empty strings and non-strings.
- widget-bus route imports `_broadcast_all` and passes "agent" as
  inst.
- py_compile clean.

Tool, engine/tools.py
- Row appended to TOOLS, name `widget_bus_emit`, schema requires
  channel and payload.
- parse returns None on bad JSON, never throws.

Helpers, static/js/widgets/shared/
- mirror.js drops own inst, drops target mismatch, off() works,
  emit passes `{remote: true}`.
- target-option.js: graphTargets merges shelf names with held
  targets, no duplicates.
- module-ready.js: rejected promise is evicted.
- widget-frame.js: select control only when `optionControls[key]`
  exists; boolean and text paths untouched; New button only with
  onNew.

Pipes widget
- subscribe before first send.
- Both mirrors off in unmount and re-made in onOption target.
- getOptions returns exactly target, path, note.
- markDirty called on log growth.
- Registry row type equals registerWidget type. Script tag present
  and after the three helper tags.

HOWTO-repipe.md
- Every step has file:line. Every line number exists in the named
  file.

## MAY FIX

- A wrong line number in the HOWTO.
- A missing `{remote: true}`.
- A missing off() in unmount.
- A script tag in the wrong order.
- A name-validation gap in a route, using the presets helper.

## Done when

- Receipt has every check as PASS, FIXED, or FAIL with file:line.
- node --check and py_compile clean after any fix.
