# SESSION REVIEW — Sandbox Suite — Phase 3, job 3R redpen on 3C, Tools widget — 2026-09-12

## CHECKS, EVERY RUN

- Every option in defaults is in getOptions and handled in onOption — PASS, static/js/widgets/canvas/tools/tools.js:816, :899-914, :916-924 (target, canvas, section)
- Every mirror emit passes through MX.mirror — PASS, tools.js:554 `tl.mirrors.select.emit`, only emit in file
- No raw `MX.bus.emit` of a family channel — PASS, tools.js has no `MX.bus.emit`; `MX.bus.on("surface.layout", ...)` at tools.js:833 is a listen, not a family channel
- Mirror receipts never re-emit — PASS, tools.js:866-883, handlers only call render/focusNotes
- subscribe before first send — PASS, mirrors bound tools.js:866 before render() tools.js:884
- No module-level mutable state — PASS, all state on `frame._toolsState` (tl), no top-level let/var
- Registry row type matches registerWidget; script tag ordered after core — PASS, library/registry/widgets.json:27, static/matrix.html:56 (after canvas.js:55, before graph-core.js:57)
- node --check clean — PASS, re-ran on tools.js, canvas.js, state.js, render.js, widget-frame.js

## CHECKS, JOB 3C

- Writers go through the target canvas's state, batched — PASS, tools.js:269-291 `writeProp/writeNotes/writeBox/writeContent/writeLink` all wrap `state.batch`
- Drop listener bound on the iframe document via `frame._canvas` — PASS, tools.js:757-778 `bindDrop` reads `a.doc()` from `api(tl)` (frame._canvas)
- `canvas` option: "focused" follows canvas.focus; an id pins — PASS, tools.js:199-215 `boundFrame`; pin path does not fall back (line 204)
- File-mode inspector writes set-style patches — PASS, tools.js:729-741 `a.patchSource({kind: "set-style", ...})`

## RULED ITEMS, VERIFIED

- `frame._canvas.doc()` added, additive, ninth method — PASS, static/js/widgets/canvas/canvas/canvas.js:1463, nothing else in the block changed
- Contract 2.3 `values` takes optional frame — PASS, static/js/matrix/widget-frame.js:166 `control.values(this)`, `this` is the WidgetFrame instance (prototype method, widget-frame.js:131); existing zero-arg controls unaffected
- `state.setHidden`/`hidden` field added — PASS, static/js/widgets/canvas/shared/state.js:338, :436-442
- render draws hidden as display none — PASS, static/js/widgets/canvas/shared/render.js:132
- File mode detected by `_canvas.state === null`, not `mode()` — PASS, tools.js:485 `if (!a.state)`, no call to `a.mode()` anywhere in the section-routing path

## FIVE FILES OUTSIDE ITS OWN FOLDER

All confirmed additive, one line (state.js's writer is one function, five lines) each, nothing in 3A or 3B behavior narrowed or renamed:

- canvas.js:1463 — `doc: () => cv.idoc`
- state.js:338, :436-442 — `hidden: false` default, `setHidden` writer
- render.js:132 — `if (w.hidden) wrap.style.display = "none"`
- widget-frame.js:166 — `control.values(this)`
- matrix.html:56 / widgets.json:27 — script tag and registry row, pure additions

## HEADED PROOF CROSS-CHECK

No browser run this pass, per rule. Spot-checked the receipt's numeric claims against Docs/Reports/phase3-3C/checks.json directly — `dropdown_two`, `pinned`, `pinned_closed`, `layers_reorder`, `layers_reparent`, `file_style_patch`, `file_set_text`, `options_after_reload` all match the receipt verbatim. `console.txt` is empty, matching "zero console lines."

## QUESTIONS FOR THE SESSION AGENT

- `library/proof/3c-*.{json,html}` still sit as harness artifacts, same standing question 3A/3B raised — delete or keep? — no answer needed from this pass, flagging forward only

## Done when

Every check PASS. No FIXED, no FAIL.
