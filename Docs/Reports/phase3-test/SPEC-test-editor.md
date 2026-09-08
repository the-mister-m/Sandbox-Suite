# SPEC-test-editor — C3, 2026-09-07

Type `editor`. static/js/widgets/usertools/editor/editor.js plus
shared/monaco-readonly.js. Mounted on session 9883b6bec3df via
MX.grid.addWidget, one instance, no restart of the driven session.

## RENDER
Mounted clean: New/Open/Save/Preview bar, empty tab strip, Monaco host.
editor-01-mounted.png. Monaco attached 0.146s after addWidget (python-side
wall clock between the addWidget call and frame._editor.editor existing —
the widget itself logs no timing, see CONSOLE).

## READ LINE CONFIRMED OR REFUTED
"open and save frames echo inst. Monaco vendored. Tabs ride the grid
options. Refused save leaves the tab dirty with the reason on the bar."
CONFIRMED, all four clauses. open/save frames both carried `inst:
frame.id` (editor-frames-sent.json). Monaco loaded from the vendored
static/vendor/monaco path, no network fetch. getOptions() returns
tabs:[{key,path}] and active — that is what rides applyTemplate/options.
Denied save: tab stayed dirty (mxed-dirty class, confirmed both via
screenshot and `tab.model.getValue() !== tab.saved` === true) and the
reason landed in statusEl — see CHECKLIST for the one wrinkle.

## CHECKLIST
- open a file: SEEN — editor-02-opened.png, loaded content byte-equal to
  the file on disk before any edit (loaded_text === ORIG_MD, editor-console.txt line 3).
- edit: SEEN — keyboard-typed into the Monaco host, dirty tab (•) shown,
  editor-04-dirty.png.
- save, confirm on disk: SEEN — editor-05-saved.png, on-disk content after
  save matched the typed content exactly (editor-console.txt line 5).
- revert: SEEN — content set back to the original, saved again,
  editor-06-reverted.png, on-disk content matched the original file byte
  for byte (editor-console.txt lines 6-7). Scratch file removed after the
  run (see STRAY FILES).
- denied save shows reason: SEEN, with one wrinkle. Reproduced twice: the
  paired run (editor-07-denied-save.png) and an isolated follow-up that
  captured the raw `saved` frame and polled statusEl every 200ms for
  1.2s. Server sends `{ok:false, result:"[WRITE failed: parent directory
  does not exist ...]"}`; the widget's own denied-check
  (`result.startsWith("[WRITE failed")`) matches, and statusEl carries
  that full message, sticky (no fade), confirmed stable across six 200ms
  polls. The paired run's own screenshot (editor-07) shows the status
  span empty at the same point — not reproduced on the isolated retry
  with identical steps, so it reads as a capture-timing artifact in this
  driver, not a widget defect. Recorded as-is; see FIX LIST for a related,
  reproducible bug found alongside it.
- markdown preview: SEEN — editor-03-preview.png, `.md` file opened by
  path, Preview enabled, split pane rendered `<h1>c3 editor scratch</h1>`
  from the marked+DOMPurify pipeline.
- unsaved modal on close: SEEN — editor-08-unsaved-modal.png. Clicking the
  × on a dirty tab (the denied-save tab, never successfully saved) opened
  the Save/Discard/Cancel modal with a correct line diff. Discard closed
  the tab.
- load time and console: load time reported above (0.146s, python-side
  timing — the widget itself emits no timing console line, see CONSOLE).

## CONSOLE
One pre-existing 404 (page-level favicon, shared-setup known list) on
load. No new console errors, no pageerrors, across both the paired run
and the isolated follow-up.
No app-level timing log exists in editor.js or monaco-readonly.js (grepped,
zero hits) — "load time from console timestamps" was measured as
wall-clock delta on the driver side (addWidget call to
frame._editor.editor existing), not read out of a console line the app
prints. Flagging this since the READ LINE for the spec implied the app
logs it.

## FIX LIST
- static/js/widgets/usertools/editor/editor.js — after a Save-As sets
  `tab.path` on a previously-untitled tab, nothing calls `showTab` again.
  `renderTabs` (tab strip) updates, but `ed.pathEl` (top path label) and
  `ed.previewBtn.disabled` (markdown detection) stay stuck on the
  pre-save state until the tab is clicked again. Directly confirmed: after
  a Save-As to `.../nope2.txt`, `pathEl.textContent` read `"(new file)"`;
  clicking the same, already-active tab changed it to the real path with
  no other action taken. A markdown file saved for the first time via
  Save-As would show Preview disabled until re-clicked, same root cause.

## READS
- Docs/Specs/SPEC-phase4-test-waves.md (Shared setup, Wave C, C3 section
  only, per assignment)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (full, probe
  pattern)
- static/js/widgets/usertools/editor/editor.js (full, 468 lines)
- ade/frames.py:1-30 (_human_path), :790-853 (open/save/delete handlers),
  :530-545 (_write_refused)
- engine/read_tool.py:99-133 (write_file, backup + refusal shapes)
- static/js/matrix/ui.js (full — askText/choose modal wiring, used to
  drive Save-As and the unsaved modal by DOM selector)
- static/js/matrix/socket.js:1-90 (send/onFrame, used to hook outgoing
  and incoming frames for proof)
- Docs/tests/matrix_harness.py (full, basis for the driver script)
- archives/9883b6bec3df/master.json (session/track root:
  /Users/moth3rship/Desktop, confirms editor's "real file under the
  session root" target)
- library/registry/widgets.json:5-6 (editor/terminal registry rows,
  grouped paths confirmed post-S3)

## BLOCKERS
None. Editor fully driven, no server restart, no session created.
