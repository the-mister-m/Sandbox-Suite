# SPEC — Phase 3 — 3R — Sonnet — code redpen, run after every job

Written 2026-09-12. No browser. Runs five times: after 3A, 3B, 3C,
3D, 3E. Cap 80K each. The session agent names the job in the spawn
prompt. Receipt: RECEIPT-phase3-3R-<job>.md.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. No decisions.
- Never touch MEMORY.md or CLAUDE.md. Do not start or stop the server.
- Receipt shape: one line per check, PASS or FAIL or FIXED with
  file:line. QUESTIONS for the session agent, yes or no each. One
  line each to SESSIONLOG.md and INDEX.md.
- Mid-run rule: small double-check, note and keep going. Multi-
  consideration problem, easy undo or stop and ask.

## Read

- Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
  section 2.
- The receipt for this job, whole. Its job spec, whole.
- The files the receipt names as edited, whole.

## Checks, every run

- Every option in the job spec's defaults is in getOptions and
  handled in onOption.
- Every mirror emit passes through MX.mirror; no raw
  `MX.bus.emit` of a family channel.
- Mirror receipts never re-emit.
- subscribe before first send. off and dispose in unmount.
- No module-level mutable state that two instances would share.
- Registry row type matches registerWidget. Script tag present and
  ordered after the core tags.
- node --check clean. py_compile clean if server.py was touched.

## Checks, per job

3A
- Every export in the CORE API section exists.
- render.page has the play branch, empty, with the one comment.
- patch.js has none of the cut ranges (grep for `runtime`, `brand`).
- kit.js drops kit-navigation.
- resolve.asset handles data, raw, folder.

3B
- No `document.` in the ported canvas.js paths where the iframe
  document should be; grep and list each hit with a verdict.
- No sandbox attribute on the iframe.
- setSelection emits canvas.select; State.on emits canvas.change;
  pointerdown emits canvas.focus; mode change emits canvas.mode.
- Export writes the back-link meta only when backLink is true.
- File-mode commit patches the string without reloading the iframe.
- canClose asks when dirty.
- `frame._canvas` exposes every name in the CANVAS API section.

3C
- Writers go through the target canvas's state, batched.
- Drop listener bound on the iframe document via `frame._canvas`.
- `canvas` option: "focused" follows canvas.focus; an id pins.
- File-mode inspector writes set-style patches.

3D
- locked is always false in getOptions.
- Apply on blocks calls setCode only on changed blocks.
- Doc Apply guarded by docEditable and a parse try.
- One Monaco model per view, disposed in unmount.

3E
- Three snapshot methods present and selectable. 501 path handled.
- PNG path under docs/scratchpad/. user frame carries image_paths.
- Freeze on while annotate is on; released when off.
- Canvas getOptions has the three new keys.

## MAY FIX

- A missing off, dispose, markDirty, or subscribe-before-send.
- A raw bus emit that should be a mirror.
- A re-emit on mirror receipt.
- A `document.` that should be the iframe document, when the fix is
  one identifier.
- Script tag order. A getOptions key gap.

## Done when

- Every check PASS, FIXED, or FAIL with file:line.
