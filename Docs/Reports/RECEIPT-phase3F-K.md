# SESSION REVIEW — Sandbox Suite — Phase 3F job K — 2026-09-13 (timestamps: ask Brandon)

Code widget wired to file-mode canvas targets. code.js only, per job H4's
finding: `canvasIdsFor` needed the follow mechanism, not a filter change.

## EDITS

- [static/js/widgets/codecanvas/code/code.js](../../static/js/widgets/codecanvas/code/code.js) — followTarget/onAnyFocus bind, cs.effectiveView for file-mode source, view buttons in the bar, cmd/ctrl-s apply-and-relock

## STRAY FILES

- none

## GOALS DONE

- Stage 1 — Code follows a tab switch via `canvas.focus`, same pattern as Tools
- Stage 2 — file mode always shows source in the editor without touching the saved `view` option
- Stage 3 — unlock, edit and apply work on a file target; cmd/ctrl-s applies and relocks

## BRANDON'S TODOS

- H (headed walk) needs a rerun against this file to confirm scope section 6 lines 1-3 and the mixed-tabs lines from H4

## CLOSER REVIEW

- Session agent runs the harness against this file — closer / session agent
- Confirm the `focusedInst` reset on the pre-existing `target` onOption branch is fine left as-is (see PICKS) — Brandon

## STAGES

- [x] Stage 1 — bind like Tools
- [x] Stage 2 — file mode view
- [x] Stage 3 — edit and apply on file mode
- [x] Stage 4 — check and receipt

## PICKS I MADE

- `onAnyFocus` ported straight from tools.js with `unbindDrop` dropped —
  code.js has no drag state to unbind.
- No explicit `onOption` case added for `followTarget`: tools.js has none
  either, the value is read straight off `frame.options.followTarget` at
  mirror-comparison time, nothing to cache.
- Read `unlock`, `relock`, `onLockClick`: no doc-only gate lives in any of
  the three. The real gate was in `updateReadOnly`'s editable check and
  `renderCurrent`'s guide branches, both keyed on `cs.view`. Rekeying both
  on `cs.effectiveView` is what makes unlock work on a file target — no
  change needed inside `unlock`/`relock`/`onLockClick` themselves.
- Lock and apply convention kept: Unlock arms the freeze mirror and the
  editor goes writable per `updateReadOnly`. Lock, when the buffer
  differs from `cs.baselineText`, prompts Apply/Discard. Apply reads
  `cs.effectiveView` — blocks writes changed widgets through
  `state.setCode`, doc through `state.replace`, source through
  `a.patchSource({kind: "set-full-source", ...})` — then relocks. Discard
  clears the notice and relocks, throwing the buffer away; `renderCurrent`
  on relock repaints from the canvas, not the discarded text. Cmd/Ctrl-S
  inside the editor while unlocked runs the same Apply path and relocks,
  skipping the choose dialog.
- View buttons in the bar are new (none existed before): Blocks/Doc/
  Source, each a plain `frame.setOption("view", ...)`. Disabled per mode:
  file mode disables Blocks and Doc and lights Source; doc mode disables
  Source; no canvas disables all three. Highlight follows
  `cs.effectiveView`, not the saved `cs.view`, so Source stays lit while
  file mode is forcing it even if the saved preference is Blocks.
- Left `scrollToWidget`'s `cs.view !== "blocks"` guard untouched — not
  named in the spec's four effectiveView users, and it already no-ops
  safely (queues to `pendingSelect`, never built) when file mode forces
  source under a saved Blocks/Doc preference.
- Flagging, not fixing: `onOption`'s pre-existing `target` branch resets
  `cs.focusedInst = ""` right after `onAnyFocus` sets it, one tick before
  `renderCurrent` runs — tools.js's `target` branch does not do this.
  Harmless with one canvas bound (canvasIdsFor already narrows to it by
  the time boundFrame falls through the loop), but would misresolve if
  two canvas instances shared one target. Not in Stage 1's edit list, left
  alone.

## CONTRACT FIELDS ADDED

- `followTarget` — Code widget option, default `""`. Named by the spec,
  in defaults/getOptions, read directly by `MX.mirror` as the follow key.
- `cs.effectiveView` — instance state, not an option. Derived every
  `renderCurrent`: `cs.view` except file mode forces `"source"`.
- `cs.followMirror` — instance state, the `MX.mirror` handle, `.off()` in
  unmount.
- `cs.viewBtns` — instance state, `{blocks, doc, source}` button elements
  for the bar.

`node --check code.js` — clean, no output, exit 0.
