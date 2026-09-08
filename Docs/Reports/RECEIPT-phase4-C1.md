SESSION REVIEW — Sandbox Suite — C1 — 2026-09-07 16:05-16:35 EDT

devagent, session 9883b6bec3df, headed, three page loads. Mounted late on
purpose (gate_edges test). C3 and C4 running in parallel; everything this
box made is prefixed c1 and is gone.

DRIVEN
Full detail: Docs/Reports/phase3-test/SPEC-test-devagent.md (new file,
dated C1 section).

- tree lists tracks and regions: SEEN — c1/c1-10-tree.png, c1-15-tree-with-c1r2.png.
- dot fill follows status: SEEN — with the region unselected, ○ → ● at
  phase waiting, back to ○ at idle. c1/c1-62-dot-busy-unselected.png,
  c1-63-after-turn.png.
- add track from the tree: SEEN — c1/c1-12-after-add-track.png.
- add region from the tree: SEEN, claude/sonnet through the form's own
  picker — c1/c1-13-region-form-filled.png, c1-14-after-add-region.png.
- track fields save: SEEN, order 5 → 9 — c1/c1-70-track-field.png.
- settings tab rail params: SEEN, 32 rows, ollama block auto-collapsed on a
  claude region — c1/c1-20-settings-tab.png.
- model picker: SEEN, claude / sonnet / claude-sonnet-5, F-D's resolved id
  holding — c1/c1-22-model-row.png.
- change_prompt choices: SEEN, but only ever drawn in the settings tab, so
  a prompt raised from the preset tab is invisible where you raised it —
  c1/c1-52-change-prompt.png, c1-58-load-change-prompt.png.
- context loads / unlocks: PARTIAL / SEEN. Every context file in this
  session is missing, so all three reads 400 and the boxes render empty.
- context saves: FAILED — [WRITE failed: parent directory does not exist:
  /Users/moth3rship/Desktop/injections/region]. c1/c1-32-context-after-save.png.
- gates tab apply: SEEN only after the socket-open gate_edges frame was
  replayed by hand; 18 rows, write_file → open landed on the region's
  overlay. c1/c1-43-gates-picked.png, c1-44-gates-applied.png.
- gates tab on a late mount: reads "no gate edges" — the spec asked, the
  answer is yes, still, after S2. c1/c1-40-gates-no-edges.png.
- preset save: SEEN. preset load / rename / delete: FAILED as shipped (the
  select is always empty), SEEN end to end once the list was injected —
  c1/c1-56-preset-empty-select.png, c1-57-preset-list-injected.png,
  c1-81-preset-deleted.png.

READ LINE
- Confirmed: both row types read right; the whole tree rebuilds on every
  roster/status frame and remounts both add forms; `file` subscribed and
  unused; context path relative through /api/fs/read; gate_edges socket-open
  only; mx:open-devagent listener present.
- Refuted: the model list is NOT refetched. One full turn — 4 track_status,
  4 status, 12 out, 1 meters — produced zero fetches of any kind. The
  mount-time burst of 8 /api/library/models calls is model-picker.js's
  module cache filling under concurrent mounts, not per-frame work.
- Worse than the read line said: `render()` also runs on every tab click and
  caret click, so typing in an add form is lost by clicking a tab.
  devagent.js:322-326 describes behavior the file does not have.

REGIONS AND TRACKS MOUNTED AND DROPPED
- Track c1track (1581cba29472) + region c1sonnet (c07433b8915b), which the
  max_tools apply reset into c1sonnet.2 (770f55685f6f). Region deleted from
  devagent's own delete button, track by delete_track.
- Track c1trk2 (0dc9aec4cae4) + region c1r2 (82358b55e6f5). One real turn
  (claude/sonnet, "Reply with exactly: ok", no gate). Region deleted from
  the widget's delete button, track by delete_track.
- Pre-existing gemma4 region gfsf (32f1ec929f4a) on a104ecc9ea23 untouched;
  confirmed still alone at close. Five original tracks all present.
- Preset c1test created, renamed c1test2, deleted. library/presets/ is back
  to its five originals.

CONSOLE
- Run 2: one 404, the page-level favicon on the known list. Run 1: same 404
  plus four 400s, all /api/fs/read on context files that do not exist. No
  pageerror in either run.

FIX LIST (full text in the spec)
1. devagent.js:419 and settings-rows.js:426 read `d.names`;
   /api/library/presets returns `{"list": [...]}`. presetNames is
   permanently empty — preset load/rename/delete unreachable, and
   preset_name falls back to a text field. timeline.js:590 already handles
   both shapes.
2. Context read and write resolve against different bases: /api/fs/read
   uses the server CWD (project root, server.py:777), the save frame uses
   the region workspace root. settings-rows.js:124 only has an absolute
   path after a successful read, so the first save of any new context file
   lands in the wrong tree and fails.
3. gate_edges is sent once at socket open (server.py:1754) and the roster
   reply does not carry it, so any devagent mounted after page load has a
   dead gates tab.
4. Every render remounts both add forms and the model picker; a tab click
   or a status frame from an unrelated region throws away what is typed.
   renderDetail exists for this and is never called alone.
5. controlKind(undefined) returns "str", so an unset int row (max_tools)
   applies "7" as a string; the preset written from that region then failed
   its own type check on load.

GAP AGAINST SPEC-phase4-timeline-target.md ITEM 5
Tree, both add forms, both add paths and settings are whole. Presets,
context and gates are each broken in a different way (fixes 1, 2, 3).
Devagent is not yet "the one place" item 5 assumes; it needs those three
before C2 leans on it. Fix 4 is why the tree's add forms feel unreliable
mid-session.

STRAY FILES
- Docs/Reports/phase3-test/c1/ — 38 screenshots, c1-drive.json,
  c1-drive2.json, c1-console.txt, c1-console2.txt, c1-frames-seen.txt,
  c1-phase1.json. This box's evidence.
- Docs/Reports/phase3-test/SPEC-test-devagent.md — new, this box's spec.
- library/grids/9883b6bec3df/ — three throwaway window files, one per page
  load. Same footprint as B1, B4 and F-D; C3 and C4 added their own in
  parallel, so not all of the 93 there are mine.
- Driver scripts live in the session scratchpad, not under the project.

GOALS DONE
- Every C1 checklist line driven or explained.
- Read line settled: three parts confirmed, the refetch claim refuted with
  a counted turn, one part found worse than written.
- Gap against timeline-target item 5 reported.
- Nothing edited. Session left as found.

BRANDON'S TODOS
- None from this box.

CLOSER REVIEW
- Fixes 1, 2 and 3 are each a small, separable build box and all three gate
  timeline-target item 5 — scope call on whether C2 waits: Brandon.
- Fix 4 (render/renderDetail) touches the same file three fixes above want;
  worth batching with them rather than alone: Brandon or closer.
- Fix 5 is shared-module behavior that affects every nullable numeric row,
  not devagent alone — note-only, needs an owner.
- One rules conflict to settle, not acted on: the harness's bypass-mode
  note says do file work through Bash; Brandon's file-ownership rules say
  read and write with the tools so the edits are visible. I followed
  Brandon's — Read/Write for files, bash only for grep and the drivers.
