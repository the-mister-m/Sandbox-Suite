# SPEC test — browser widget

## 2026-09-07 — C4

RENDER: browser mounts left of viewer (`applyTemplate`, cols 1-6 / 7-12,
12x12 grid). Bar reads "File Browser · browser-<id>", Change Root button,
root line, scrolling tree. Screenshots:
Docs/Reports/phase3-test/c4/browser-00-mounted.png through -99-final.png.

READ LINE CONFIRMED OR REFUTED:
- "`tree` reply echoes `tag` (frames.py:814)" — CONFIRMED. frames.py:817-819
  `elif t == "tree": ... if isinstance(text, dict) and msg.get("tag"): text["tag"]
  = msg["tag"]`. browser.js:313 `if (data.tag !== tag()) return;` — tag is
  `frame.id`, so two open browser instances never cross-read each other's
  tree replies.
- "Right-click menu: duplicate, rename, reveal, open in editor, open in
  viewer" — CONFIRMED in that order. browser.js:136-141 labels: Duplicate,
  Rename, "Show in Finder" (the reveal item), Open in Editor, Open in
  Viewer (last two only on files, not directories). Screenshot:
  c4/browser-menu-duplicate.png.

CHECKLIST
- change root: SEEN. Native `showDirectoryPicker` removed from `window`
  first (Chromium supports the File System Access API so the real button
  click would open an OS-native folder dialog Playwright cannot drive
  without hanging — chooseRoot()'s fallback branch, browser.js:267-278,
  is what a non-Chromium/older browser or a denied picker takes anyway).
  Clicked "Change Root", filled the real `MX.ui.prompt` modal, clicked
  Save. Root line updated live. c4/browser-01-root-changed.png.
- tree expands: SEEN. Clicked the "Docs" row, chevron flipped ▸ → ▾,
  children rendered. c4/browser-02-tree-expanded.png.
- sizes load: SEEN. File rows show a fetched size (`/api/fs/stat`),
  e.g. `_c4-scratch.txt => 62 B`.
- right-click actions: SEEN, each one, in this order:
  - Duplicate: `/api/fs/duplicate` POST, new `_c4-scratch copy.txt` row
    appeared in the tree and on disk. c4/browser-04-after-duplicate.png.
  - Rename: real `MX.ui.prompt` modal (same as Change Root), typed
    `_c4-scratch-renamed.txt`, `rename` frame sent, row and on-disk file
    both updated, old duplicate path gone. c4/browser-05-after-rename.png.
  - Show in Finder (reveal): `/api/fs/reveal` POST fired. Server side
    (server.py:1583-1593) runs `subprocess.Popen(["open", "-R", path])`
    — macOS Finder reveal, no HTTP body returned beyond `{ok:true}`. On
    this machine that opens (or focuses) Finder with the file selected;
    the harness cannot screenshot Finder itself, console/network confirm
    the call fired and returned ok.
  - Open in Viewer: SEEN. Paired viewer instance already existed, so
    `openInWidget` found it and called `target.openTab(path)` directly —
    no `addWidget` involved. Viewer tab bar shows `_c4-scratch.txt`, file
    content rendered in the Monaco read-only pane.
    c4/browser-07-open-in-viewer.png.
  - Open in Editor: SEEN the action fire (instance count 2 → 3, new tab
    with file content in the editor pane) but see FIX LIST — the click
    also destroyed the browser widget's own live tree state.
    c4/browser-06-open-in-editor.png.

CONSOLE: no page errors, no console errors across the run. Docs/Reports/phase3-test/c4/browser-console.txt.
One pre-existing favicon 404 (page-level, per shared-setup known list — not
re-logged by this driver, seen on prior boxes' console dumps).

FIX LIST
- static/js/matrix/grid.js:149-161 `addWidget()` calls `this.render()`
  (grid.js:158), and `render()` (grid.js:237-243) does
  `this.el.textContent = ""` then rebuilds every instance via `_build()`,
  which constructs a brand-new `MX.WidgetFrame` and calls `frame.mount()`
  again for EVERY currently-mounted widget (grid.js:293-298), not just the
  new one. Any widget with in-memory, register()-scoped state loses it the
  instant any other widget on the same window calls `addWidget` — not
  restricted to the "two widgets land in the same slot" case already in
  the shared-setup known list (grid.js:232), this fires on every add
  regardless of slot placement. Directly confirmed live: browser's tree
  (`frame._browser.root`, `.nodeMap`) went from a populated, expanded
  tree to `root: null` / 0 tree children the moment "Open in Editor" ran
  `MX.grid.addWidget('editor')` (browser.js:56-58 `openInWidget`) because
  no editor instance existed yet. "Open in Viewer" avoided this only
  because the viewer instance already existed in this run's layout, so
  its `openInWidget` call skipped `addWidget` entirely — a browser with
  no editor OR viewer already open would lose its own tree the instant a
  user right-clicks "Open in Editor" or "Open in Viewer" on a fresh
  layout.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:10-40 (Shared setup), :195-212 (C4)
- Docs/Reports/RECEIPT-phase4-B1.md (full, probe pattern)
- static/js/widgets/usertools/browser/browser.js (full, 358 lines)
- static/js/widgets/usertools/viewer/viewer.js (full, 390 lines)
- Docs/tests/matrix_harness.py (full, mount pattern basis)
- static/js/matrix/grid.js:14-28 (windowId/gridUrl), :140-243 (_normalize,
  addWidget, removeWidget, unmountAll, applyTemplate, _occupied, _freeSlot,
  render), :255-299 (_build — frame construction/mount)
- static/js/matrix/widget-frame.js (full, 176 lines — send/subscribe/
  deliver/mount/unmount/getOptions/setOption)
- static/js/matrix/ui.js:1-52 (overlay/modal/prompt — real DOM modal used
  by Change Root and Rename)
- ade/frames.py:16-21 (_human_path), :790-822 (tree/gate_action/tree
  handlers), :891-906 (rename handler)
- server.py:1565-1593 (/api/fs/duplicate, /api/fs/reveal), 758-800
  (/api/fs/browse, /api/fs/read), 1544-1552 (/api/fs/raw)
- archives/9883b6bec3df/master.json (workspace_root = /Users/moth3rship/Desktop,
  session root basis for scratch-file placement)

BLOCKERS: none.
