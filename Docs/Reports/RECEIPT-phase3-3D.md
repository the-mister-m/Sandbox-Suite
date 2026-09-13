# SESSION REVIEW — Sandbox Suite — Phase 3, job 3D, Code widget — 2026-09-12

## EDITS

- [static/js/widgets/canvas/code/code.js](../../static/js/widgets/canvas/code/code.js) — new, the whole job: type `canvas_code`, three views (blocks, doc, source), lock/unlock/relock, Apply/Discard
- [static/js/widgets/canvas/shared/state.js](../../static/js/widgets/canvas/shared/state.js) — one method added: `replace(json)`, a whole-document swap as one commit
- [static/matrix.html](../../static/matrix.html) — one script tag, after tools.js and before graph-core.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — registry row, group `canvas`

## STRAY FILES

None.

## GOALS DONE

No headed harness was run — this job cannot start or stop the server, and every
prior headed proof in this phase (3A/3B/3C) needed one running. What follows is
built and read against the CANVAS API and against the actual code, not proven
live. Flagged below for Brandon/closer to decide whether a headed pass runs
before this ships.

- Part 1, `code.js`: mounts, binds to a canvas the same way Tools does
  (`canvas` option pins an instance id, `"focused"` follows the last
  `canvas.focus` on this target and falls back to the first). Three views
  share one Monaco editor and one model per view, created on first show.
- blocks view: `buildCodeText`/`parseBlocks`/`parseFields` ported near-verbatim
  from Code Canvas's drawer.js; Apply diffs each widget's parsed block against
  the baseline captured at last render and calls `state.setCode` only on a
  real change; a header lost to editing is counted and named in the notice.
- doc view: `JSON.stringify(state.get(), null, 2)` — the same string
  `docText()` writes for a doc-mode canvas's own save frame. With
  `docEditable` on, Apply parses the text and calls the new `state.replace`;
  a parse failure sets the notice and touches nothing.
- source view: file mode only; Apply calls `patchSource({kind:
  "set-full-source", source: text})`; Discard re-reads from the canvas either
  way.
- Lock: Unlock emits `canvas.freeze {on: true}` over the mirror (not a direct
  `frame._canvas.freeze()` call — see PICKS); relock with no edits pending
  relocks straight away, with edits pending shows an Apply/Discard choice
  first.
- Mirrors: `select` scrolls the blocks view to the picked widget's header
  line; `change` refreshes only while locked; `doc` drops cached models and
  re-renders (a new target or a doc/file switch invalidates old content);
  `focus` re-targets when `canvas` is `"focused"`.
- Lifecycle: `getOptions` always returns `locked: false`; `locked` is
  module-local (`cs.locked`) and never read from `frame.options`, so a reload
  can never come back "unlocked with edits pending."
- `node --check` clean on code.js and state.js.

## Part 2

Nothing ported. drawer.js's notes tab is 3C's territory already; confirmed
by reading tools.js that its Notes tool builder covers it.

## SETTLED IN CHAT — answered

- Doc view editable behind `docEditable`, default off. On, Apply is a full
  document swap, one undo step (see PICKS: `state.replace`, not `state.load`).
  **What a bad paste does with it on:** `JSON.parse` throws, caught, the
  notice reads `parse failed: <message>`, `state.replace` is never called —
  the canvas's document is untouched.
- `locked` is never persisted: not in `frame.options` at all as live state,
  `getOptions()` always answers `locked: false`. Confirmed by reading the
  method back — see EDITS/GOALS DONE above.

## PICKS I MADE

- **Apply uses `patchSource({kind: "set-full-source", source: text})`, not
  `{..., text}`.** patch.js:242 reads `patch.source` for that kind; the spec
  line's `text` field would silently write nothing. Read patch.js to confirm
  before using it — did not guess.
- **`state.load()` cannot give "one undo step."** It resets `history` to a
  single entry (state.js:576-577) — an `undo()` right after has nothing to
  go back to, and canvas.js relies on exactly that reset when opening a new
  target. Rather than change `load`'s contract for every caller, added
  `state.replace(json)`: the same parse/migrate/page-fallback as `load`, but
  through `commit()` — one push onto the existing history, so `undo()`
  restores the document as it stood immediately before Apply. `load` is
  untouched; canvas.js's target-open flow is untouched.
- **Unlock/relock go over the `canvas.freeze` mirror, not the direct
  `frame._canvas.freeze()` method.** The CANVAS API exposes `freeze` as a
  same-process call, but contract 2.7's own wording — "Code widget asks;
  canvas obeys" — plus this job's "Unlock **emits** canvas.freeze" is the bus
  path: `cs.mirrors.freeze.emit({on})`. Effect: every canvas sharing this
  widget's `target` freezes while Code is unlocked, not only the one Code is
  bound to. Both readings are defensible; picked the one the words in 2.7 and
  the job spec actually say.
- **Relock without pending edits skips the confirm dialog entirely** — spec
  says "on relock **with edits pending**," Code Canvas's own drawer.js shows
  the dialog unconditionally. Dirty is `editor.getValue() !== baselineText`,
  captured at the last successful render.
- **Confirm dialog is `MX.ui.choose`, not a ported custom modal.** drawer.js's
  own confirm markup (:379-479) is CSS/DOM the spec's own line already asks
  to drop (the widget stopped being a fixed-position drawer); `MX.ui.choose`
  is what canvas.js and editor.js already use for the same shape of question.
  A backdrop click resolves `"cancel"` — treated as "stay unlocked, do
  nothing," not named by the spec either way.
- **Blocks/doc need a document canvas; source needs a file one** — a mode
  mismatch (e.g. `view: "doc"` while the bound canvas holds a file) shows a
  plain-text guide in the editor instead of blanking it or silently
  reassigning the `view` option out from under the user; `view` is not
  auto-switched on a `canvas.doc` mode change, only re-rendered.
- **`onOption` also handles `target`**, not listed in this job's Lifecycle
  line (which names only `view`, `codeMode`, `docEditable`, `canvas`).
  Without it, changing `target` through the options panel would leave the
  widget bound to the old target's canvas list until some other event fired.
  Copied verbatim from tools.js's own `target` handling for the same
  widget family.
- **`resetModels` runs on a `target`/`canvas` change and on `canvas.doc`.**
  Not asked for explicitly; without it, switching to a different document
  reuses stale Monaco models keyed by view name and would need to be told
  apart from freshly-relevant content by their text alone.

## CONTRACT FIELDS ADDED

Named per section 2's rule. Nothing renamed, nothing narrowed.

- **`state.replace(json)`** — a new method on `MX.canvasState`'s public API,
  next to `load`. Same normalization as `load` (version default, v1 migrate,
  page fallback), but goes through `commit()` instead of resetting history,
  so it is undoable. `load` itself is untouched.

## BRANDON'S TODOS

- No headed proof was run for this job — cannot start or stop the server
  under this job's own rules. Decide whether a headed pass (like 3B's and
  3C's) runs against `code.js` before it ships, and who runs it — **Brandon**
- The freeze-broadcast pick above (every canvas on the target freezes, not
  only the bound one) is a real behavior choice, not just a naming pick —
  worth a look if it surprises anyone in practice — **Brandon**

## CLOSER REVIEW

- Rule conflict, flagged not resolved: this job's environment reminder said
  to do file reads and edits through Bash; Brandon's FILE OWNERSHIP rule says
  the opposite. Followed Brandon's rule — Read/Write/Edit for every file,
  Bash for `find`/`grep`/`node --check` only — **closer**
- One contract addition (`state.replace`) is live and used by this widget
  only so far; 3E should be told about it if it touches doc-wide swaps —
  **closer**
