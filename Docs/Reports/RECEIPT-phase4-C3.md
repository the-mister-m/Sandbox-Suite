SESSION REVIEW — Sandbox Suite — C3 — 2026-09-07 16:03-16:14 EDT

editor and terminal, tested in sequence on session 9883b6bec3df, track
5a031370bf1c. Editor's spec was written and saved before the terminal
driver started. Full detail: Docs/Reports/phase3-test/SPEC-test-editor.md,
Docs/Reports/phase3-test/SPEC-test-terminal.md.

DRIVEN

editor
- open a file / edit / save / confirm on disk / revert: all SEEN, full
  round trip on a real .md file at /Users/moth3rship/Desktop, byte-exact
  on-disk confirmation at both the edit and the revert.
- denied save shows reason: SEEN, confirmed via an isolated repro that
  polled statusEl for 1.2s and captured the raw `saved` frame — sticky,
  stable, correct text. One screenshot from the full run showed the same
  bar blank at a single instant; not reproduced on retry with identical
  steps, logged as a driver-side timing artifact, not a widget defect.
- markdown preview, unsaved modal on close: both SEEN.
- load time: no app-level timing log exists in editor.js — measured as
  wall clock on the driver side instead (0.146s addWidget-to-Monaco-ready).

terminal
- region picker fills from roster, New Tab opens a PTY, output lands in
  its own tab, close sends close_shell and unfollow: all four SEEN, each
  with frame-level and ps-level proof (frames captured via a
  MX.socket.send/onFrame hook, PTY process confirmed present/absent via
  ps diff around the click).
- PTY process: `/bin/zsh -i`, the user's interactive login shell,
  cwd anchored to the region root.

REGIONS MOUNTED AND DROPPED
- 3e50df9becde "c3sonnet" — insert_region on 5a031370bf1c, sonnet/claude.
  One PTY opened and closed on it. Dropped via kill_track; live roster
  confirmed clear (picker screenshot). Note: archives/9883b6bec3df/master.json
  still showed it under the track a few seconds after the drop — that
  file lags the live state, flagged in the terminal spec's BLOCKERS for
  other boxes reading session state from disk.
- Pre-existing region gfsf (32f1ec929f4a) on track a104ecc9ea23 untouched
  throughout.
- No edits made to any file, track, or region mounted by another Wave C
  box.

GATE
None. Neither widget's test path runs a model turn — editor's writes are
direct server file writes with no gate, terminal's PTY is a plain shell,
no agent loop involved.

CONSOLE
One pre-existing page-level 404 (favicon, shared-setup known list) per
page load. No new console errors, no pageerrors, across four driver runs
(editor main pass, editor denied-save follow-up x2, terminal).

FIX LIST
- static/js/widgets/usertools/editor/editor.js — after a Save-As sets
  `tab.path` on a previously-untitled tab, `showTab` is never called
  again. The top path label and the Preview-button's markdown check both
  stay stuck on the pre-save state until the tab is clicked again.
  Directly confirmed by reading `pathEl.textContent` before and after
  re-clicking the same, already-active tab.

STRAY FILES
- Docs/Reports/phase3-test/c3/*.png, *-console.txt, *-frames-sent.json,
  *-frames-recv.json — this box's screenshots and captured-frame logs (17
  files).
- /Users/moth3rship/Desktop/c3-editor-scratch.md — created for the
  editor test, removed after use, confirmed absent.
- /Users/moth3rship/Desktop/c3-nonexistent-dir/ — the denied-save target
  path; the parent directory was never created (that's the point of the
  test), confirmed absent.
- Extra grid window entries under library/grids/9883b6bec3df/ from each
  addWidget call, same footprint as B1/B2/B4.
- Driver scripts in the session scratchpad
  (c3_editor.py, c3_editor_denied_check.py, c3_terminal.py), not under
  the project.

READS
- Docs/Specs/SPEC-phase4-test-waves.md — Shared setup and C3 sections
  only, per assignment
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (full, probe
  pattern)
- static/js/widgets/usertools/editor/editor.js (full, 468 lines)
- static/js/widgets/usertools/terminal/terminal.js (full, 374 lines)
- ade/frames.py:1-30, :430-475, :530-580, :620-640, :790-860, :980-1015
- engine/read_tool.py:99-133
- ade/tracks.py:430-490
- static/js/matrix/ui.js (full), socket.js:1-90
- Docs/tests/matrix_harness.py (full, basis for both driver scripts)
- library/registry/widgets.json:5-6
- archives/9883b6bec3df/master.json

CLOSER REVIEW
- editor's Save-As stale-pathEl/Preview-button bug — one line, low risk,
  same shape as other boxes' small state-refresh gaps; Brandon or closer,
  scope call.
- master.json lagging live roster state — noted for whoever else reads
  session state from disk this wave; not this box's bug to fix.
- No rules conflicts this box. Used Read/Write/Edit for all file work,
  Bash only for greps, ps snapshots, and the python driver runs.
