# SPEC E6 — devagent widget — Sandbox Suite

Model: sonnet. Wave 3. Receipt: Docs/Reports/RECEIPT-E6-devagent.md,
written before 200K tokens.

## What this is

A dev widget that shows, for one session, every track and every region,
with each rung's settings and context in place, and a button for every
frame the backend accepts. It replaces the old track settings modal. It
exists so Brandon can test the backend end to end and see where
everything sits before the real track settings pane is designed in
Phase 4.

## The layout, as the DOM

```
┌ devagent ──────────────────────────────────────────────────────────┐
│ TRACKS          │ TRACK build-1         root ~/Desktop/x  [set root]│
│ ▾ build-1       │  settings   name · root · order          [edit]   │
│    ● redpen-1   │  context    injections/track/<id>.md    [unlock]  │
│    ○ redpen-2   ├──────────────────────────────────────────────────┤
│ ▸ audit         │ REGION redpen-1    claude / opus / 4.8    idle     │
│                 │  [settings] [context] [gates] [preset]            │
│ [+ track]       │  ▾ harness (7)   gate_wait_s  20   [edit]         │
│ [+ region]      │                  max_tools    —    [edit]         │
│                 │  ▸ claude (18)                                    │
│                 │  [reset] [stop] [close shell] [delete]            │
└─────────────────┴──────────────────────────────────────────────────┘
```

Left, the tree. Tracks collapse to their regions. Right, the selected
track above the selected region. Each rung has the same three lines:
identity and root, settings, context. Region adds four tabs.

## Decisions, from Brandon

- The old modal is not needed. Every edit is in place, one control per
  key, one frame per change.
- Region settings show only the keys on that region's rail. Unwired keys
  on the rail show greyed with their reason. claude_mode and
  claude_partial are shown under the claude block.
- Context files open in a read-only textarea. Unlock makes it editable.
  Save sends the save frame. After the reply, the box locks again.
- The session rung is not here. It is the corner button in E5.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/widgets/mount/mount.js. 4 KB, the reference widget.
- static/js/widgets/shared/model-picker.js. 4 KB.
- ade/web_io.py lines 25 to 53 (the region and track row shapes). 8 KB.
- ade/frames.py lines 537 to 1119 (every frame handler). 40 KB file, this
  is the wire. Read it once, note the frame names and fields, do not
  reread.
- ade/rails.py lines 14 to 80 (rails, params, unwired). 
- engine/settings.py lines 57 to 100 (the row table: key, tier, type,
  default, block).
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/devagent/devagent.js, registry type devagent,
   label Dev Agent. Subscribe to ade_init, track_list, track_created,
   track_removed, region_replaced, track_status, models, rail_catalog,
   gate_edges, change_prompt, saved, file, out.
2. Tree. From the rows and tracks arrays on ade_init and track_list.
   Region dot filled when track_status is not idle. Selecting a region
   selects its track. Add track sends create_track with a name and root.
   Add region sends insert_region on the selected track with a name and
   the model picker's value.
3. Track rung. Name, root, order as inputs. Edit sends edit_track_row
   with the one changed field. Set root opens a path input and sends
   edit_track_row with root. Context: fetch /api/fs/read on
   injections/track/<id>.md into the textarea. Unlock, Save through the
   save frame with the absolute path and inst, lock on the saved reply.
   A missing file shows empty and Save creates it.
4. Region rung, settings tab. Header: name, provider / model / version
   from the region row, phase from track_status. Blocks from the row
   table: harness for block None, then the region's provider block. Keys
   drawn: the rail's params from rail_catalog plus the always-on region
   keys (model, seat, preset_name, reset_on_change, allow_agent_reset,
   context_reset_cap_k, start_turn_on_reset, reset_instruction). Unwired
   rows drawn disabled with the why text. Control by row type: bool is a
   checkbox, int and float a number input, str a text input, list a
   comma text input. Model uses the nested picker. Each control sends
   edit_track with fields holding that one key. When change_prompt
   arrives, show its three choices inline and send change_answer.
5. Region rung, context tab. Same textarea and unlock flow on
   injections/region/<id>.md.
6. Region rung, gates tab. One line per overlay row: edge, scope, hook
   select. Apply sends edit_track with fields.overlay as the full list.
7. Region rung, preset tab. Select from /api/library/presets. Load sends
   load_preset. Save asks a name and sends save_preset with no fields.
   Rename and Delete send their frames. Reply text from out frames shows
   under the tab.
8. Region buttons. reset sends reset_track. stop sends stop. close shell
   sends close_shell. delete sends kill_track after a confirm.
9. Every frame carries inst. Replies with inst not ours are ignored.

## Do not

- Do not draw the session rung.
- Do not add a folder or file browser popout. Paths are typed.
- Do not port any code from static/js/ade/tracksettings.js. The design is
  the sketch above, not that file.
- Do not add keys the row table does not have.
- Do not style beyond a flat two-pane layout with the existing mx- classes.

## Acceptance

- Every button sends its frame and the tree reflects the reply.
- A region on the ollama rail shows sampling keys; on the claude agent
  rail it shows claude_tools and no sampling.
- Unlock, edit, Save on a region context file, then reset that region.
  The new region's context tab shows the same text.
- Reset-on-change off, edit model: the change prompt appears inline.

## Receipt

Edits by file. Registry row. What claude_mode and claude_partial read
as, from the row table defaults, in one line each for Brandon.
