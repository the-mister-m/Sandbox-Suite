SESSION REVIEW — Sandbox Suite — F-E — 2026-09-07 (timestamps: log.jsonl / harness output)

EDITS (by F-E, confirmed live by read before driving; F-E itself out of budget for harness)
1. devagent.js:419-421, settings-rows.js:424-426 — presetNames accepts `.names` or `.list`.
2. server.py:776-784 — `/api/fs/read` resolves relative paths against rt.WORKSPACE_ROOT.
3. ade/frames.py:557-562 gate_edges client frame; devagent.js:457-459 sends it on mount.
4. devagent.js:261, 295, 340 — caret/tab clicks call renderDetail, not render.
5. settings-rows.js:83-101, 295 — controlKind falls back to declared kind when value unset.
6. grid.js:149-162 — addWidget mounts only the new instance.
7. widget-frame.js:98-106 — setOption calls MX.grid.save().
8. ade/frames.py:7-19, 434-452 — insert_region defaults model per provider.
9. timeline.js:264-270, 1100-1101 — isClaudeModel matches modelRows by id/resolved.
10. editor.js:435-452 — saved handler re-runs showTab.
11. viewer.js:14-17, 72-83 — ensureMermaid imports the vendored ESM build.

HARNESS
Driver: scratchpad fe_driver.py (+ fe_inspect.py, fe_debug*.py side probes), headed,
session 9883b6bec3df, Chrome. Evidence: Docs/Reports/phase3-test/fe/ — 22
screenshots, fe-results.json, fe-console.txt.

- Item 6 (grid remount): SEEN. Mounted strip, opened a chip popover
  (`_strip.popover` true), ran MX.grid.addWidget("viewer") — popover still
  open after, `[data-instance]` count for the strip stayed 1 (no remount).
  fe-01/02/03.png.
- Item 1 (presetNames): SEEN. Late-mounted devagent's presetNames = the 5
  real preset names (not empty); preset tab select showed them. Saved
  scratch preset "fehtest" through the UI (dialog + settings-tab
  change_prompt → rewrite_cache), confirmed on disk; renamed to "fehtest2"
  and deleted via direct frame.send (rename_preset/delete_preset — reaches
  the same server code the UI buttons call). Both confirmed on disk.
  Boundary found, not an F-E item: presetNames is fetched once
  (presetsLoaded latch) and never refetched after save/rename/delete, so
  the preset tab's own `<select>` can never show a name just created in the
  same mount — reproduced 3 times as a Playwright select_option timeout.
  fe-13/14/14a/15/16.png.
- Item 3 (gate_edges on late mount): SEEN. Devagent mounted well after page
  load (already the harness's standing pattern); gates tab on a selected
  region listed 18 real edges (write_file, send_message, ... hook selects),
  not "no gate edges". fe-12.png.
- Item 4 (renderDetail): SEEN. Typed "fehtypeintact" into the region-name
  add-form input, clicked the settings tab, input still read
  "fehtypeintact" after. fe-17.png.
- Item 5 (numeric row): SEEN. Built a fresh ollama region (max_tools unset
  by construction), saved a preset from it through the UI; the written
  JSON has `"max_tools": null` (Python type NoneType) — not the string
  "7". Confirmed twice (fe-24.png, and isolated debug run fe_debug3.py).
- Item 2 (context save/read root): SEEN for the fix itself, FAILED
  end-to-end. `/api/workspace-root` = /Users/moth3rship/Desktop; the
  context path for the fresh region is injections/region/<id>.md — read
  and save both resolve to the identical absolute path (confirmed by code:
  fs/read now mirrors _human_path's env.root default, same as save).
  The write itself never lands: `rt.write_file` refuses when the parent
  directory is missing, and no `injections/` directory exists anywhere
  under ~/Desktop (checked directly) — the same "[WRITE failed: parent
  directory does not exist]" gap C1 already reported. This is universal
  (would block any region's first context save on this workspace root) and
  outside item 2's stated scope (root alignment, not directory creation).
  The widget's own textarea showed the typed text back after a tab bounce,
  but that is `settings-rows.js`'s cached box state re-rendering, not a
  real re-fetch (`loadContext` only fetches once per box) — not usable as
  round-trip proof, flagged here so it isn't mistaken for one.
  fe-21/22/23.png.
- Items 8/9 (insert-region default model, cache toggles): SEEN. Track
  5a031370bf1c ("test", confirmed empty going in and after — dropped both
  test regions via kill_track). Real "+ insert region" context-menu click
  gave a claude region, model "sonnet" — runnable, not empty. A second
  insert sent with `provider: "ollama"` (the plain menu item has no
  provider control; add-controls.js is the only UI path for that choice,
  so this reached the same server branch by frame.send) gave model
  "gemma4:26b-mxfp8". That model does NOT exist in injections/models/
  (only gemma4-12b-mxfp8.md, gemma4-31b-mxfp8.md, ornith-35b-q8_0.md are
  there) — worth a look, separate from this box's scope.
  Cache-toggle selector check came back false on the claude lane
  (`timeline_cache_toggle_present_claude`) — NOT DRIVEN conclusively; the
  DOM query (`.tl-cachettl`, `[title*=cache]`) may be the wrong selector
  rather than the toggle being absent; isClaudeModel's code path (matching
  modelRows by id/resolved, item 9) was confirmed by read but not proven
  live. fe-31/32/33.png.
- Item 7 (setOption saves): SEEN. Reused the item-6 viewer, opened 2 tabs,
  reloaded the page — both tabs back (2 → 2). fe-41/42.png.
- Item 11 (vendored mermaid): SEEN. A `.mmd` file (not a `.md` with a
  fenced block — viewer.js only classifies raw `.mmd`/`.mermaid` by
  extension as mermaid kind; a fenced block inside a `.md` file has no
  render path in this widget, code-confirmed, worth flagging against the
  harness wording) rendered to an SVG; console line "mermaid loaded from
  vendored ESM build: /static/vendor/mermaid/dist/mermaid.esm.min.mjs";
  no cdnjs/mermaid network request observed. Survived reload (tab
  re-clicked, SVG present again). File size: mermaid.esm.min.mjs 32K,
  chunks/ 3.6M, vendor/mermaid/ total 3.6M. fe-40/42/43.png.
- Item 10 (editor Save-As): SEEN. New untitled tab, typed body, Save →
  MX.ui.askText modal (mounts on document.body, not inside the widget —
  tripped the harness once before the selector was fixed), filled a path,
  OK. Path label updated to the full path with no further click. fe-50.png.

STRAY FILES
- Docs/Reports/phase3-test/fe/ — this box's screenshots, fe-results.json,
  fe-console.txt, fe-mid-results.json.
- Scratchpad (outside the project, not cleaned): fe_driver.py,
  fe_inspect.py, fe_debug.py/2/3.py, run4/5.log, debug*.log,
  feh-mermaid-test.md/.mmd, feh-editor-saveas.txt — session scratchpad,
  gone with the session.

GOALS DONE
- All 11 F-E edits confirmed live by read before driving.
- Items 1, 3, 4, 5, 6, 7, 10, 11 driven headed and SEEN.
- Item 2 SEEN for its actual scope (root alignment); full round-trip
  FAILED on an out-of-scope, pre-existing directory-creation gap, reported
  precisely rather than folded into a pass.
- Items 8/9 SEEN for the model default; cache-toggle DOM check
  inconclusive (NOT DRIVEN), noted rather than guessed at.
- Every track/region this box created was dropped (kill_track/delete_track)
  before stopping; gfsf and the five original tracks confirmed untouched
  and unchanged in count/state.
- Every scratch preset (fehtest, fehtest2, fehdbg, fehdbg3preset, fehnum)
  removed from library/presets/; back to the five originals.

REMAINING (per Brandon: stop here, mark as NOT DRIVEN — no further harness lines started)
- Cache-toggle DOM confirmation for item 9 (selector was likely wrong, not
  re-tried).
- Any deeper look at the injections/ directory-creation gap (item 2's
  neighbor) — not this box's scope, flagged only.
- The ollama default model (gemma4:26b-mxfp8) vs. injections/models/
  mismatch — flagged, not investigated further.

CLOSER REVIEW
- 8 of 11 items fully SEEN; item 2 SEEN/FAILED split is real and specific,
  not a hedge; items 8/9 mostly SEEN with one inconclusive sub-check.
- Gate D scope call: Brandon / session agent.
- The presetNames-never-refetched gap and the ollama-model-file mismatch
  are both new, real findings outside F-E's fix list — worth a line in
  MEMORY.md or a future spec, Brandon's call.
