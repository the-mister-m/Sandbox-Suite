# SPEC — Phase 3F — K — Sonnet — Code widget on file mode

Written 2026-09-13 after walk H4 lines 1 to 3 failed. Scope section
3.1 says Code follows the canvas; no job built it. This one does.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Own file: static/js/widgets/codecanvas/code/code.js. Nothing else
  in code. tools.js is the reference for binding; read it, never
  edit it.
- Comments are label, function, state only. "spine" is banned.
- No module-level mutable state.
- Stages with checkmarks in the receipt. 200K stop and handoff, 250K
  hard cap.
- Read/Write/Edit for content. Bash for grep and `node --check`.
  You do not run the harness; the session agent runs it after you.

## Read

- Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md sections
  3.1, 3.2, 3.5.
- Docs/Reports/RECEIPT-phase3F-H4.md lines 1 to 3, what failed.
- code.js whole, it is 498 lines.
- tools.js: `onAnyFocus`, `followMirror`, `boundFrame`,
  `canvasIdsFor`, by grep and ranged reads. That is the binding to
  copy.

## What is wrong

`canvasIdsFor` in code.js keeps only canvases whose `target` equals
Code's own `target`. With tabs, a canvas's `target` is its active
path. Code's stays `""`. No canvas ever matches, `api()` is null,
and every view shows "No canvas on this target."

## Build

### Stage 1 — bind like Tools

- Add option `followTarget: ""` to defaults, getOptions, onOption.
- Add `cs.followMirror = MX.mirror(frame, "canvas.focus", (payload)
  => onAnyFocus(cs, payload), "followTarget")`, off in unmount.
- `onAnyFocus`: copy tools.js's. The focused canvas's `target`
  becomes this frame's `target` option, `cs.focusedInst` the
  instance, then `renderCurrent`. Same guards as Tools.
- Re-render on `canvas.doc` already exists; keep it. A tab switch
  emits `canvas.doc` and `canvas.focus`; Code follows both.

### Stage 2 — file mode view

- When `modeOf(a)` is `"file"` and `cs.view` is blocks or doc, the
  editor shows the source view without changing the saved `view`
  option. When the mode goes back to doc, the saved view returns.
  One field: `cs.effectiveView`, derived in `renderCurrent`, used
  by `renderCurrent`, `applyEdits`, `markDirty` and the bar.
- The view buttons in the bar: blocks and doc disabled on file mode,
  source lit.

### Stage 3 — edit and apply on file mode

- Unlock must work on a file target. Read `unlock`, `relock`,
  `onLockClick`; remove any doc-only gate. Name the convention in
  the receipt: what applies, what discards.
- Apply on source view is `a.patchSource({kind: "set-full-source",
  source: text})`. It exists. The canvas reloads the iframe, pushes
  history, marks dirty, emits `canvas.change`. Code re-renders on
  `canvas.change` only while locked; keep that.
- Cmd-S or Ctrl-S inside the editor while unlocked applies, then
  relocks. Add if absent.

### Stage 4 — check and receipt

- `node --check code.js`.
- Receipt Docs/Reports/RECEIPT-phase3F-K.md: SESSION REVIEW header,
  STAGES, PICKS I MADE, CONTRACT FIELDS ADDED, node --check line.
  One line each to SESSIONLOG.md and INDEX.md.

## Done when

- Two .html tabs on a canvas, Code on the surface: Code shows the
  active tab's source; switching tabs switches the text.
- Cmd-G on the canvas: Code's text gains the group div. Cmd-Z drops
  it.
- Unlock, edit the paragraph text in Code, apply: the iframe shows
  it, cv.source holds it, status dirty, Cmd-Z on the canvas restores
  iframe, source and Code.
- Doc mode unchanged: Phase 3 headed lines 9 and 10 still pass.
