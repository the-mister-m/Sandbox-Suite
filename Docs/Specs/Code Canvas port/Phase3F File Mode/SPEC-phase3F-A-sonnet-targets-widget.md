# SPEC — Phase 3F — A — Sonnet — Targets widget

Written 2026-09-13. Runs with B and C. A new widget that lists the
.html files a Canvas has open and lets Brandon add, remove, reorder
and switch them.

Contracts: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md
section 3.6, and 3.1 for the Canvas options you write to.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- You own static/js/widgets/codecanvas/targets/targets.js and one line
  of library/registry/widgets.json. Nothing else. canvas.js is job B's;
  if it lacks `targets` when you test, test against a hand-set option.
- Stages below. After each, append `- [x] Stage N — label` to
  Docs/Reports/RECEIPT-phase3F-A.md. At 200K with stages open: stop,
  write Docs/Handoffs/HANDOFF-phase3F-A.md. Hard cap 250K.
- Receipt in the SESSION REVIEW shape with STAGES, PICKS I MADE,
  CONTRACT FIELDS ADDED. One line each to SESSIONLOG.md and INDEX.md.
- `node --check` every file you edit.

## Read, in this order

- The scope, sections 1, 2, 3.1, 3.6, 5.
- static/js/widgets/codecanvas/tools/tools.js :177-240 and :840-962 —
  the binding pattern and the module shape. Copy the binding.
- static/js/widgets/shared/mirror.js — whole, 1.5K.
- static/js/widgets/shared/root-browser.js — the `MX.openRootBrowser`
  signature only.
- static/js/matrix/widget-frame.js :97-120 — setOption.
- library/registry/widgets.json :26-28 — the three codecanvas rows.

## Stage 1 — read and plan

Read the list. Write the receipt file with the STAGES list unchecked
and a three-line plan. Check stage 1.

## Stage 2 — module and binding

- `MX.registerWidget("canvas_targets", MOD)` with `defaults {canvas:
  "focused", followTarget: ""}`, `optionControls.canvas` the same
  select Tools builds, `mount`, `unmount`, `onOption`, `getOptions`.
- State on `frame._targetsState`. No module-level state.
- Binding: `canvasIdsFor`, `canvasFrame`, `boundFrame`, `onAnyFocus`
  ported from tools.js. Follow mode hears `canvas.focus` through
  `MX.mirror(frame, "canvas.focus", fn, "followTarget")`. Also
  `canvas.doc` the same way. Re-render on `MX.bus.on("surface.layout")`.
- Registry row after `canvas_code`: `{ "type": "canvas_targets",
  "label": "Targets", "path": "/static/js/widgets/codecanvas/targets/targets.js",
  "group": "codecanvas" }`.
- Check stage 2.

## Stage 3 — rows

- Read `bf.options.targets || []` and `bf.options.target || ""` from
  the bound frame. One row per path: basename, title = full path,
  active row lit. Click: `bf.setOption("target", path)`.
- × per row: new list without it; if it was active, activate next,
  else previous, else `""`. Two setOption calls: `targets` then
  `target`.
- Drag rows to reorder, same DnD shape as the Layers rows in tools.js
  :584-597. One `setOption("targets", reordered)`.
- "+ Add": `MX.openRootBrowser("/", cb, {ext: [".html", ".json"]})`.
  Append if absent, then activate.
- No bound canvas: "No canvas on this surface."
- Styles under an `mxtg-` prefix, one `ensureStyles()` like Tools.
- Check stage 3.

## Stage 4 — check and receipt

- `node --check`. Load /matrix/<sid> in the headed harness pattern
  from Docs/tests/phase3_headed.py :1-80 if you can reach a server;
  if not, say so in the receipt and stop at the code.
- Receipt. Check stage 4.

## Done when

- Add Targets beside a Canvas: it names the canvas it follows.
- + Add a file: the Canvas's `targets` option holds it, `target` is it.
- × the active row: the Canvas switches to its neighbour.
- Drag a row: `targets` reorders.
- Two canvases on the surface: clicking inside one makes Targets
  follow it.
- node --check clean.
