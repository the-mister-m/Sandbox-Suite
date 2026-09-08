# SPEC-test-terminal — C3, 2026-09-07

Type `terminal`. static/js/widgets/usertools/terminal/terminal.js. Mounted
on session 9883b6bec3df via MX.grid.addWidget, one instance, one region
mounted for the run (c3sonnet, claude/sonnet, track 5a031370bf1c),
dropped at the end via kill_track. No restart of the driven session.

## RENDER
Mounted clean: region picker, New Tab button, "no shell" status.
terminal-01-mounted.png.

## READ LINE CONFIRMED OR REFUTED
"follow then input with a shell key per tab; term frames carry shell and
region. xterm vendored. Report the process the PTY starts. Do not type
into it beyond the newline the widget sends." CONFIRMED. Outgoing frame
order on New Tab: `follow` (track: region id) then `input` (track, shell:
the tab's own key, data: "\n") — terminal-frames-sent.json. Incoming
`term` frames carried both `shell` and `region` on every line
(terminal-frames-recv.json). xterm loaded from static/vendor, no network
fetch. No keys were sent beyond the widget's own automatic newline.

## CHECKLIST
- region picker fills from roster: SEEN. Mount sends `{type:"roster"}`
  (S2), server answered with `track_list`; after `insert_region` for
  c3sonnet a second `track_list` arrived unprompted and the picker's
  `<option>` list grew to include it with no remount
  (terminal-02-roster.png, options list in terminal-console.txt line 2).
- New Tab opens a PTY: SEEN. Process diff of `ps -eo pid,ppid,command`
  immediately before vs. after the click shows one new process:
  `/bin/zsh -i` (PID 15670, parent PID 13580 — the server process),
  cwd anchored via `rt.usable_root(self.root)` per ade/tracks.py:452-453
  (region root /Users/moth3rship/Desktop). This is the process the PTY
  starts: the user's login shell in interactive mode, matching
  `os.environ.get("SHELL", "/bin/bash")` at ade/tracks.py:442.
- output lands in its own tab: SEEN. terminal-03-tab-open.png shows the
  real zsh prompt (`moth3rship@Brandos-Mac-Studio Desktop %`) rendered in
  the tab's xterm pane, sourced from `term` frames tagged with this tab's
  shell key (terminal-frames-recv.json, five term frames all carrying
  `shell: "terminal-mtrohwm9-1-sh1"`).
- close sends close_shell and unfollow: SEEN. Clicking the tab's × sent
  `close_shell` (track, shell) immediately followed by `unfollow` (track)
  since this was the region's only open tab (terminal-frames-sent.json,
  last two entries). The `/bin/zsh -i` process (PID 15670) was present in
  the pre-close ps snapshot and absent from the post-close one
  (terminal-console.txt lines 8-10). terminal-04-after-close.png shows
  the tab and pane both gone, status back to "no shell".

## CONSOLE
One pre-existing 404 (page-level favicon, shared-setup known list) on
load. No new console errors, no pageerrors.

## FIX LIST
None found. Terminal's mechanism matched its READ LINE exactly across
mount, follow/input ordering, output tagging, and teardown.

## READS
- Docs/Specs/SPEC-phase4-test-waves.md (Shared setup, Wave C, C3 section
  only, per assignment)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (full, probe
  pattern)
- static/js/widgets/usertools/terminal/terminal.js (full, 374 lines)
- ade/frames.py:437-450 (_do_insert_region), :565-580 (insert_region
  handler), :620-640 (kill_track/close_track), :987-1010
  (input/close_shell/follow/unfollow handlers)
- ade/tracks.py:430-490 (shell_master — pty.openpty, subprocess.Popen of
  `$SHELL -i`, close_shell)
- static/js/matrix/socket.js:1-90 (send/onFrame, used to hook outgoing
  and incoming frames for proof)
- Docs/tests/matrix_harness.py (full, basis for the driver script)
- archives/9883b6bec3df/master.json (session/track root, used to confirm
  the region drop; noted below as stale relative to live state)

## BLOCKERS
None. Region drop was confirmed against the live roster (the picker
dropdown re-fetched to just the pre-existing `gfsf` region,
terminal-05-region-dropped.png) rather than against
archives/9883b6bec3df/master.json, which still listed the dropped
c3sonnet region under track 5a031370bf1c a few seconds after kill_track —
that file appears to be a periodic snapshot, not updated synchronously on
every track close. Worth a note for whoever reads session state from disk
for other boxes: master.json can lag the live roster.
