SESSION REVIEW — Sandbox Suite — C4 — 2026-09-07 16:00-16:20 EDT

DRIVEN
- browser — change root, tree expands, sizes load, all five right-click
  actions (duplicate, rename, reveal, open in editor, open in viewer):
  SEEN. Docs/Reports/phase3-test/SPEC-test-browser.md.
- viewer — image, pdf, markdown, csv, json, code each render: SEEN.
  Tabs persist in options across reload: FAILED, real gap, see FIX LIST.
  Docs/Reports/phase3-test/SPEC-test-viewer.md.

READ LINE
- browser: tree reply echoes tag (frames.py:814-819) — CONFIRMED. Menu
  order duplicate/rename/reveal/open-in-editor/open-in-viewer — CONFIRMED.
- viewer: marked vendored, mermaid from CDN — CONFIRMED marked works,
  REFUTED "does the CDN load succeed" as a flat question — it's order-
  dependent, see FIX LIST.

FIX LIST
- grid.js:149-161 addWidget() calls render() (grid.js:237-243), which
  destroys and remounts EVERY widget's frame, not just the new one — any
  widget's live in-memory state is wiped the moment another widget is
  added anywhere on the same window. Confirmed live: browser's expanded
  tree/root went to null the instant "Open in Editor" ran addWidget
  because no editor instance existed yet. Broader than the known
  same-slot-collision note in shared setup.
- viewer.js:71-78 ensureMermaid() — window.mermaid never populates once
  Monaco's AMD loader (shared/monaco-readonly.js) has run on the page;
  mermaid's CDN UMD bundle takes the define.amd branch instead of
  assigning globalThis.mermaid. Confirmed both ways: mermaid-first works,
  mermaid-after-a-code/json-tab throws "Cannot read properties of
  undefined (reading 'initialize')". marked.min.js shares the same UMD
  shape and would hit the identical failure if opened after Monaco.
- widget-frame.js:98-103 setOption() never calls grid.save(). Viewer tabs
  ride entirely on setOption/getOptions, so opening tabs alone never
  persists — confirmed getOptions() correct pre-reload, {path:"",
  tabs:[]} post-reload.

STRAY FILES
- Docs/Reports/phase3-test/c4/*.png, *-console.txt — this box's
  screenshots and console dumps.
- library/grids/9883b6bec3df/w-*.json — throwaway per-window grid saves
  from applyTemplate calls across all Wave C boxes' own browser contexts,
  same pattern as prior boxes.
- Scratch fixtures created and removed: project-root _c4-scratch.txt
  (+copy/rename, all removed after the browser run). Scratch CSV/PDF/MMD
  left under the harness scratchpad (outside the project tree, not the
  repo).

GOALS DONE
- Both widgets driven per C4 checklist, receipts written, no widget/
  server/css file edited.

BRANDON'S TODOS
- none raised this box.

CLOSER REVIEW
- Two real fix candidates worth a build box: grid.js full-remount-on-add
  (state loss, broader than the known slot-collision note) and viewer's
  mermaid-vs-Monaco-AMD-loader collision. Third, smaller: viewer tab
  persistence never saves. Brandon or closer, priority call.
