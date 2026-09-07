# RECEIPT — D7 — Editor and Terminal

Job 7, Wave 4. Spec: [SPEC-D7-editor-terminal.md](../Specs/SPEC-D7-editor-terminal.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Read first: [RECEIPT-D1-settings.md](RECEIPT-D1-settings.md),
[RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md),
[RECEIPT-D4-suite-library.md](RECEIPT-D4-suite-library.md),
[RECEIPT-D5-matrix.md](RECEIPT-D5-matrix.md).

## EDITS

### [static/js/matrix/widgets/editor.js](../../static/js/matrix/widgets/editor.js), new, 470 lines

`MX.registerWidget("editor", ...)`. One Monaco instance per frame, created
after the frame's host is attached (a `requestAnimationFrame` retry loop,
same guard the old pane used). Language guessed from the file extension
(same table as the old pane). Markdown toggle renders a side-by-side
preview via the shared `marked`/`DOMPurify` globals Job 6 already loads in
`static/matrix.html`, with a self-contained fallback renderer if those
globals are absent. Save calls `window.showSaveFilePicker()`, writes the
file directly through the returned handle, then sends the same content
through the existing `{type: "save", path, content}` socket frame. Exit
(`unmount`) shows a Save / Discard / Cancel modal when content differs
from what was loaded, with a line diff against the loaded file (ported
from the old pane's LCS diff, capped at 800 lines).

### [static/js/matrix/widgets/terminal.js](../../static/js/matrix/widgets/terminal.js), new, 260 lines

`MX.registerWidget("terminal", ...)`. One xterm instance per frame, loaded
lazily from `static/vendor/xterm*`. A region picker (from `ade_init`'s
`tracks` rows) plus Connect/Disconnect. Connect sends the existing
`{type: "focus", track: <region id>}` then a `\n` `input` frame to wake
the lazily-spawned shell. Keystrokes go out as `{type: "input", data}`;
incoming `{type: "term", data}` writes to xterm. Closing the widget
(`unmount`) sends `{type: "close_shell", track: <region id>}`.

### [static/matrix.html](../../static/matrix.html)

Two lines added, after Job 6's `queue.js` and before `main.js`:

    <script src="/static/js/matrix/widgets/editor.js"></script>
    <script src="/static/js/matrix/widgets/terminal.js"></script>

Nothing else in the file touched.

### [Docs/tests/test_editor_terminal.py](../tests/test_editor_terminal.py), new, 10 tests

Mirrors Job 6's `test_chat_queue.py` shape: registry seeds both types,
each file registers its type, neither sends the `answer` form, banned
words absent, `matrix.html` loads both files, both parse under
`node --check`, terminal only uses the four named shell frames, editor
uses `file`/`save`/`saved`, and `/api/widget-registry` carries both types.

## DELETED

- Nothing.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Result: `166 passed in 0.31s`. 156 before this job (concurrent with Jobs 6
and 8 in the shared worktree), 10 new in `test_editor_terminal.py`. Both
widget files also pass `node --check` directly.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. The spec's LANE names `static/js/widgets/editor/` and
   `static/js/widgets/terminal/`. Job 5's actual convention, and the spec's
   own instruction to "start from the stub in Job 5's receipt," puts the
   stub at `static/js/matrix/widgets/stub.js`. Followed the working
   convention: `static/js/matrix/widgets/editor.js` and `terminal.js`,
   flat files, not directories. Job 6 did the same for chat/mini-queue/
   queue. Job 8 instead used the literal spec path
   (`static/js/widgets/browser/browser.js`,
   `static/js/widgets/shared/monaco-readonly.js`) — the tree now has two
   widget-file conventions side by side. Named for the closer, not fixed;
   `static/js/widgets/` is Job 8's file, outside this lane.
2. `window.showSaveFilePicker()` never exposes a real OS path — that is a
   browser sandboxing limit, not a gap in this build. The write itself
   happens locally through the handle the dialog returns; the same content
   is then sent through the existing `save` socket frame with `path` set
   to `handle.name` (filename only, no directory) so the server-side gate
   and `saved`/`saved: denied` status path still fires. A server-side
   denial does not undo the local write — the bytes are already on disk
   by the time the `saved` frame comes back. This is a real gap between
   "the dialog writes the file" and "the server gates writes," not
   fixable from this lane (no server files).
3. The `"file"` socket frame carries no target widget-instance id. With
   more than one editor instance mounted, an incoming `file` frame is
   applied to whichever editor instance last had DOM focus (a
   module-level `_activeEditor`, defaulting to the most recently mounted).
   Two editors open with neither yet focused both show the most-recently-
   mounted one receiving the load. A real fix needs an instance id on the
   frame Job 8's file browser sends — outside this lane (browser widget is
   Job 8's, the frame shape is server-side).
4. The confirm diff is shown only in the Exit (Save/Discard/Cancel) modal,
   matching the spec's sentence order ("shown in the save modal" following
   the Exit-modal sentence). The regular toolbar Save button writes
   straight through without a diff/confirm step — the spec's Save bullet
   says only "opens the macOS browser save dialog... goes through the
   existing save frame," nothing about a confirm on every save.
5. Terminal shells are anchored per socket connection
   (`ade/frames.py`'s `ctx.anchored`, one per matrix window, not one per
   widget instance), and `"term"` output carries no region id. Two
   terminal widgets in the same window both send `input` against
   whichever region was `focus`ed last, and both would render every
   incoming `term` frame with no way to tell them apart. Filled the
   smallest way: each terminal re-sends `focus` for its own region on
   every DOM focus-in, and only the most-recently-connected terminal
   instance (`_activeTerminal`) renders incoming `term` data — so one
   terminal actively works correctly at a time, and a second, unfocused
   terminal in the same window will not reliably show its own output.
   True independent concurrent terminals in one window need `track` id
   carried on `input`/`term` and per-region routing server-side — outside
   this lane (`ade/frames.py`, `ade/tracks.py`, `server.py` not touched).
6. Exit's Save/Discard/Cancel modal cannot actually block a close: the ×
   button on a widget (`grid.js`'s `removeWidget`) and window teardown
   both remove the widget and call `unmount` with no way to cancel the
   removal already in progress. Filled the smallest way: the modal still
   appears and Save still writes the content, but Cancel and Discard both
   just close the modal — the widget is already gone either way. A working
   Cancel needs a pre-close hook in `grid.js`, outside this lane.
7. `library/registry/widgets.json` already carried `{"type": "editor",
   "label": "Editor"}` and `{"type": "terminal", "label": "Terminal"}`
   from Job 1's seed (D5 stripped the `"rows"` field project-wide). No
   edit needed there.
8. The wire field carrying a region id on `focus`/`input`/`close_shell` is
   named `track` (pre-rename code — `tracks.get_region(tid)` resolves it).
   Used the existing field name as-is; the terminal's own UI labels it
   "region."

## PHASE 3

- Editor save writes to disk before the server gate can refuse it (Q2).
  A save flow that gates before the write, not after, needs a server-side
  route rather than a raw socket frame plus a client-side file write.
- Multi-instance targeting: neither `file` (editor open) nor `term`
  (terminal output) frames carry a target instance or region id readable
  by more than one subscriber at a time (Q3, Q5). Both editor and browser,
  and both terminal instances, need this once more than one is expected to
  work independently in the same window.
- A working Cancel on the editor's exit modal needs a pre-close hook on
  `grid.js`'s widget removal and on window teardown (Q6).
- Two widget-file directory conventions now exist side by side
  (`static/js/matrix/widgets/` vs `static/js/widgets/`) — a Phase 3
  cleanup pass should pick one (Q1).

## STRAY FILES

- None. `Docs/tests/__pycache__` is pre-existing.

## CONDUCT NOTE

No bash-for-reads-and-writes system reminder appeared during this job, so
there is no conflict to name here (five earlier jobs each named the same
one). All reads and edits above went through the Read, Edit, and Write
tools; bash was used only to run `node --check`, `ls`, `find`, `grep`,
and `pytest`.
