# SPEC — Phase 3 — 3D — Sonnet — Code widget

Written 2026-09-12. Starts after 3R passes on 3C. Cap 150K. The
drawer leaves the canvas and becomes its own widget. Three views.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.4, 2.7, 2.8.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 130K used, if parts 1 and 2 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase3-3D.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase3-3D.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase3-3B.md — CANVAS API section.
- Docs/Reports/RECEIPT-phase3-3C.md — PICKS, and how it finds its
  canvas. Copy that.
- static/js/widgets/canvas/tools/tools.js — mount and the canvas-
  finding block only.
- Code Canvas app/drawer.js — whole, 18.5K. Your source.
- static/js/widgets/shared/monaco-readonly.js :35-55, :70-103.
- static/js/widgets/usertools/editor/editor.js :137-175 — a writable
  Monaco mount, one model per tab.

## Part 1. static/js/widgets/canvas/code/code.js

Type `canvas_code`, label "Code", group `canvas`. Registry row and
script tag are yours.

Options and defaults: `target ""`, `canvas "focused"`, `view
"blocks"`, `codeMode "resolved"`, `docEditable false`, `locked false`
(always false in getOptions). `optionControls`: `target` and `canvas`
as Tools, `view` select of blocks, doc, source; `codeMode` select of
resolved, template.

Views:
- blocks: drawer.js buildCodeText (:120-139) over the canvas's state,
  sourceFor and displayFor (:89-105) by `codeMode`. Monaco language
  html. Header line per widget; canvas.select scrolls to it
  (:217-239).
- doc: `JSON.stringify(state.doc, null, 2)`, language json. Read-only
  unless `docEditable`.
- source: file mode only, the canvas's `source()`, language html.
  Hidden in doc mode; blocks and doc hidden in file mode.

Lock: a lock button. Unlock emits `canvas.freeze {on: true}` and
makes the editor writable; relock emits `on: false`. While locked
open, `canvas.change` does not refresh. On relock with edits pending,
the confirm dialog (:379-479) offers Apply and Discard.

Apply:
- blocks: parseBlocks (:149-201), diff each against baseline
  (:331-352), call the canvas's `state.setCode` only on change, report
  lost headers in the notice line.
- doc, with `docEditable` true: `state.load(JSON.parse(text))`, one
  undo step. A parse failure shows in the notice and applies nothing.
- source: `patchSource({kind: "set-full-source", text})`.
Discard refreshes the view from the canvas.

Monaco: `MX.monacoReady` once, one model per view, created on first
show. tryLoadMonaco (:241-259) is not ported.

Mirrors: `canvas.select` scrolls; `canvas.change` refreshes when not
unlocked; `canvas.doc` switches the visible views by mode;
`canvas.focus` re-targets when `canvas === "focused"`.

Lifecycle: getOptions returns every key with `locked` false.
onOption for `view`, `codeMode`, `docEditable`, `canvas`. markDirty
on view or mode change. unmount disposes models and the editor, off.

## Part 2. Notes view

drawer.js's notes tab (:293-303) is folded into Tools by 3C. Do not
port it here.

## SETTLED IN CHAT

Doc view is editable behind `docEditable`. Settled in chat: widget
option, default off. On, Apply is a full `State.load`, one undo step.
Receipt: what a bad paste did with it on.

`locked` is never persisted. Settled in chat so a reload never comes
back unlocked with edits pending. Not a widget option. Receipt:
confirm getOptions returns false.

## Done when

- Canvas with a doc, Code beside it. Select a widget: Code scrolls
  to its header line.
- Unlock, edit one block's css, Apply: the canvas re-renders that
  widget only; other widgets' elements are untouched (compare
  element identity before and after).
- Doc view shows the same JSON the save frame writes. With
  docEditable on, edit a box value, Apply, the canvas moves it, one
  undo restores.
- File-mode canvas: Source view shows the patched HTML after a drag
  commit in the canvas.
- Reload: same target, canvas, view, codeMode; locked is false.
- node --check clean.
