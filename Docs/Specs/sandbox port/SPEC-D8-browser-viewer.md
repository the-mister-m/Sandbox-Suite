# SPEC D8 — File Browser and Viewer

Wave 4. Front end. Sonnet. Ceiling 150 thousand tokens. Receipt before
250. Scope: Docs/Scope/SCOPE-phase2-build.md. Read it first. Then
Docs/Reports/RECEIPT-D5-matrix.md for the frame contract.

```
WAVE 3   Job 4 ─ Job 5  done
              │
         ┌────┼─────────┐
WAVE 4   Job 6   Job 7  [Job 8 YOU]
         └────┴─────────┘
CLOSE    Job 9
```

Job 6 and Job 7 run beside you. You own browser and viewer. Job 6
accepts a file drop from your browser; you expose the drag source. Job
6 and Job 7 may use your read-only Monaco path; you export it. No
server files unless a right-click action needs a route, and then one
labeled block in server.py for duplicate and show in Finder only.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language.
- Stay in your lane.
- Rewrites against the widget frame, not ports. The old panes in
  Docs/reference/ide-panes/browser.js and preview.js are reference only.
- Add nothing not in this spec or the scope. The render list below is
  the render list.

## LANE

- static/js/widgets/browser/, new
- static/js/widgets/viewer/, new
- static/js/widgets/shared/monaco-readonly.js, new, exported
- server.py: one labeled block for duplicate and show-in-Finder routes,
  if needed

## PART 1 — FILE BROWSER

Start from the stub. Tree from the existing tree frames.

- Root: chosen through the macOS browser dialog using the browser's
  directory picker. Everything below root is in-app tree navigation.
- Every row shows file size.
- Right click: Duplicate, Rename, Show in Finder, Open in Editor, Open
  in Viewer. Rename uses the existing rename frame. Duplicate and Show
  in Finder need a route each if no frame exists; one labeled block.
- Open in Editor sends the file to an editor instance in the grid, or
  mounts one if none exists. Open in Viewer does the same for a viewer.
- Drag source: a row is draggable and carries its path. Job 6's chat
  accepts the drop.

## PART 2 — VIEWER

Start from the stub. The viewer renders a file by type. The full list:

- Images, vector graphics, PDF, audio, video: the browser's own tags
  and frames. No library.
- HTML: in a sandboxed frame, the way the old preview did.
- Markdown: a markdown library from the allowed script host, pinned.
- Mermaid: a mermaid library from the allowed script host, pinned.
- CSV: parsed and drawn as a table.
- JSON: pretty printed through the read-only Monaco path.
- Code and plain text: the read-only Monaco path.

Read-only Monaco: one shared module, static/js/widgets/shared/
monaco-readonly.js, that mounts a read-only Monaco instance with the
dark theme and language from extension. Monaco carries the same syntax
coloring engine as VS Code, and the dark theme is built in. Code
renders with colors. Export the mount function; Job 6 and Job 7 may
import it.

## RECEIPT

Docs/Reports/RECEIPT-D8-browser-viewer.md. Sections: EDITS, DELETED,
TESTS, QUESTIONS, PHASE 3, STRAY FILES. State the drag source shape and
the read-only Monaco export.
