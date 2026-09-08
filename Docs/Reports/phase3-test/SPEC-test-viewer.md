# SPEC test — viewer widget

## 2026-09-07 — C4

RENDER: viewer mounts full-width (12x12 grid, single instance). Bar has a
path input + Open button, a tab strip, a body pane. Screenshots:
Docs/Reports/phase3-test/c4/viewer-00-mounted.png through -99-after-reload.png.

READ LINE CONFIRMED OR REFUTED:
- "marked is vendored and already on the page" — CONFIRMED, but see FIX
  LIST: marked itself renders fine (viewer-markdown.png) because it loads
  before Monaco's AMD loader is ever invoked in a fresh session.
- "mermaid loads from a CDN. Report whether that CDN load succeeds and
  what the console says" — REFUTED as stated (it is not a flat
  succeed/fail — it is order-dependent). See FIX LIST for the exact
  failure and its cause, confirmed live both ways.

CHECKLIST
- image: SEEN. `messenger-widget.png` rendered full-size in an `<img>`.
  c4/viewer-image.png.
- pdf: SEEN. Scratch PDF (project has none — built a minimal one-page
  PDF under scratchpad, noted here) rendered in the native Chromium PDF
  `<embed>` viewer with page thumbnail, toolbar, zoom. c4/viewer-pdf.png.
- markdown: SEEN. `RECEIPT-phase4-B1.md` rendered through vendored
  `marked` + `DOMPurify`. c4/viewer-markdown.png.
- csv: SEEN. Scratch CSV (project has none) parsed into a bordered
  `<table>`, header row styled. c4/viewer-csv.png.
- json: SEEN, after a retry — first attempt used a stale path
  (`.sandbox_config.json`, not present on disk; CLAUDE.md's root-files
  list is out of date) and the viewer correctly showed `Error: not a
  file: ...` (viewer-json.png, first capture). Re-run against
  `global.json` (real file) rendered pretty-printed JSON in the readonly
  Monaco pane with syntax highlighting. Final c4/viewer-json.png is the
  successful render.
- code: SEEN. `viewer.js` itself opened in the readonly Monaco pane.
  c4/viewer-code.png.
- tabs persist in options: FAILED. See FIX LIST — `getOptions()` reports
  all 7 tabs correctly before reload; after `page.reload()` the grid
  restores the instance with `{path: "", tabs: []}`. Not a stale-data
  issue, a real gap: tab state is never sent to the server.
  c4/viewer-99-after-reload.png shows the reloaded viewer with an empty
  tab bar.

CONSOLE
- One pre-existing favicon 404 (page-level, per shared-setup known list).
- One 400 from `/api/fs/read` — traced to the stale `.sandbox_config.json`
  path above, server correctly answered `{error: "not a file: ..."}`,
  not a widget bug.
- On the mermaid tab: `TypeError: Cannot read properties of undefined
  (reading 'initialize')`, thrown inside viewer.js's `ensureMermaid()` at
  the line `window.mermaid.initialize(...)` — `window.mermaid` was
  undefined even though the network request for
  `mermaid.min.js` (10.9.1, cdnjs) returned 200 with no error logged.
  Full text: Docs/Reports/phase3-test/c4/viewer-console.txt.

FIX LIST
- static/js/widgets/usertools/viewer/viewer.js:71-78 `ensureMermaid()`
  assumes `window.mermaid` is set the instant the CDN script's `onload`
  fires. Confirmed root cause live, two ways:
  1. Mermaid opened in a FRESH viewer with no prior Monaco use:
     `window.mermaid` populates correctly, `window.define.amd` is
     falsy. Load succeeds.
  2. Mermaid opened AFTER a `json` or `code` tab had already triggered
     `MX.mountReadonlyMonaco` (shared/monaco-readonly.js:17-21 loads
     Monaco's vendored `loader.js`, the standard RequireJS/AMD loader,
     which sets a global `window.define` with `define.amd = {}`):
     `window.mermaid` stays undefined, `.initialize` throws.
  Cause: mermaid.min.js's own UMD header (confirmed by fetching the
  cdnjs file directly) is
  `typeof exports=="object" && typeof module<"u" ? module.exports=... :
  typeof define=="function" && define.amd ? define(...) :
  globalThis.mermaid=...`. Once Monaco's AMD loader exists on the page,
  mermaid's UMD wrapper takes the `define.amd` branch and registers
  itself as an anonymous AMD module instead of a global — the same
  UMD shape marked.min.js uses (static/vendor/marked/marked.min.js),
  which only avoids the same fate because it is loaded eagerly, before
  Monaco ever mounts, in every session so far tested. Any session that
  opens a code/json tab before a markdown tab would hit the identical
  failure on marked, not just mermaid. Order-dependent, reproducible,
  not a CDN outage or CSP block.
- static/js/matrix/widget-frame.js:98-103 `setOption()` never calls
  `MX.grid.save()`. `MX.grid.save()` (grid.js:74-82) is only invoked from
  `addWidget`, `removeWidget`, `applyTemplate`, `bindSession`'s sibling
  `rebind`, and the resize/move pointer-up handlers (grid.js:159, 169,
  178, 204, 349, 424) — never from a plain option change. The viewer's
  own tab list rides entirely on `setOption`/`getOptions`
  (viewer.js:188-193, 382-388), so opening tabs, alone, never persists
  them; a save only happens to catch a lucky ride if the user also
  resizes/moves a widget or adds/removes one before reloading. Confirmed
  live: `getOptions()` returned all 7 opened tabs correctly, then a
  `page.reload()` came back with `{path: "", tabs: []}`.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:10-40 (Shared setup), :195-212 (C4)
- Docs/Reports/RECEIPT-phase4-B1.md (full, probe pattern)
- static/js/widgets/usertools/viewer/viewer.js (full, 390 lines)
- static/js/widgets/shared/monaco-readonly.js:1-70 (AMD loader mount,
  memoized, `window.require.config`)
- static/vendor/marked/marked.min.js (header only — UMD wrapper)
- cdnjs mermaid.min.js 10.9.1 (fetched directly — UMD wrapper, confirmed
  `typeof define == "function" && define.amd` branch)
- static/js/matrix/grid.js:74-94 (save/snapshot), :100-127 (bindSession/
  rebind), :149-243 (addWidget/removeWidget/applyTemplate/render),
  :340-350 (resize pointerup save), :415-425 (move-drop save)
- static/js/matrix/widget-frame.js (full, 176 lines)
- server.py:775-800 (/api/fs/read), :1544-1552 (/api/fs/raw)
- Docs/tests/matrix_harness.py (full, mount pattern basis)

BLOCKERS: none. Project had no existing PDF or CSV file to view — built
minimal scratch ones under the harness scratchpad (noted above), removed
nothing on disk since both live outside the project tree.
