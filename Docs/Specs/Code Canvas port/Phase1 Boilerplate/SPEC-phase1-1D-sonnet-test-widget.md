# SPEC — Phase 1 — 1D — Sonnet — test widget and HOWTO-repipe

Written 2026-09-12. Starts after 1A and 1B receipts exist. Cap 150K.
The widget is a throwaway. It exists to prove every pipe and to be
the worked example in the HOWTO. No design. No polish.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.1 to 2.5 and 2.9. Read those first.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 150K used, if parts 1 and 2 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase1-1D.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase1-1D.md in the SESSION
  REVIEW shape with a PICKS I MADE section. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase1-1A.md and RECEIPT-phase1-1B.md — whole.
- static/js/widgets/shared/target-option.js, mirror.js,
  module-ready.js — whole, as built.
- static/js/matrix/widget-frame.js:27-123 — the contract.
- static/js/widgets/usertools/viewer/viewer.js:374-420 — module shape.
- static/js/widgets/usertools/editor/editor.js:3-8, :310, :370,
  :528-563 — the file frames as used.
- library/registry/widgets.json — whole.
- Docs/HOWTO-frames.md rows for open, file, save, saved, widget_bus.

## Part 1. static/js/widgets/test/pipes/pipes.js

Type `pipes`, label "Pipes", group `test`. Registry row and script
tag are yours.

Options: `{target: "", path: "", note: ""}`.
`optionControls: {target: MX.targetControl(MX.graphTargets,
MX.graphTargetNew)}`.

Body, plain elements, one column:
- A line showing `target`, `MX.TAB_ID`, `MX.WINDOW_ID`, `frame.id`.
- "Emit" button: `mirror.emit({note: options.note, at: Date.now()})`.
- A log box: every payload received through the mirror, one line,
  newest on top, capped at 50. Prefix `remote` when the second
  argument to the listener says so (bus.js:51).
- "Load target" button: fetches `/api/library/graphs/<target>`, shows
  node and edge counts in the line under it.
- "Open" button: sends the `open` frame for `path`; on the `file`
  frame shows the first 200 characters. "Save" button: sends `save`
  with the shown text plus one appended line `pipes <timestamp>`; on
  `saved` shows ok or the result string. Filter by `msg.inst`.
- A count of `graph.select` payloads received on this target, so 2A
  has a witness later. Same mirror, channel `pipes.ping` for the
  Emit button; a second `MX.mirror` on `graph.select` for the count.

Lifecycle: `subscribe(["file", "saved"])` before any send. `onOption`
updates the line and re-creates both mirrors when `target` changes
(off the old ones first). `getOptions` returns the three keys.
`markDirty(frame)` when the log grows. `unmount` calls off on both.

## Part 2. Docs/HOWTO-repipe.md

The one page a later builder reads instead of the pipes. Sections,
each a short list of steps with file and line, no prose:

- Add a widget: folder, registry row, script tag, registerWidget,
  module shape, options and getOptions round-trip, markDirty.
- Give it a target: the option key, `optionControls`, which list
  function per family, what New does.
- Share state with its siblings: `MX.mirror`, channel naming, payload
  rule, off in unmount.
- Load a vendored ES module: `MX.moduleReady`, the import() path,
  where vendored files live.
- Talk to files: open/file, save/saved, filter by inst, the denied
  strings (editor.js:545-548).
- Let an agent push: the BUS: line an agent writes, the route it
  hits, why the widget sees it as remote.
- Add a route: the presets pattern (server.py:1423-1460), name
  validation, where it goes.
- Repipe when a contract grows: add a field, never rename; where the
  contract list lives (session-agent spec section 2).

Every step names the pipes widget's line that does it.

## SETTLED IN CHAT

The test widget is a throwaway. Settled in chat. The other option is
folding its checks into the first real widget; that widget would then
carry pipe tests it doesn't own. Receipt: every pipe it touched and
the console or curl line that proved it.

## Done when

- Pipes mounts on two surfaces with different targets; both targets
  show in both dropdowns after a reopen of the panel.
- Closing one surface from the session window, then reopening the
  other's panel, shows only the survivor's target.
- Two tabs on one surface: Emit in one logs `remote` in the other.
  Two pipes on one surface with the same target: Emit in one logs in
  the other without `remote`. Different targets: nothing.
- Load target shows 84 nodes, 142 edges for `graph`.
- Open shows a file. Save writes it and shows ok.
- `curl -X POST /api/widget-bus -d '{"channel":"pipes.ping","payload":{"target":"graph","inst":"agent","note":"hi"}}'`
  lands in the log of every pipes widget whose target is graph.
- HOWTO-repipe.md exists and every step has a line number.
- Receipt has the exact console and curl lines used.
