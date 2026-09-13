# SPEC — Arrange Widget

Goto agent. Model: Brandon's override at spawn. Ceiling 150 thousand
tokens. Receipt before 200. Comments are label, function, state only.
"spine" is a banned word.

Runs after F1 and F2 land. Read in this order, nothing else until the
build needs it:

1. This spec.
2. The PLAN section of
   `/Users/moth3rship/Desktop/AI Design/Doc Generator/src/shared/types.ts`.
   That is the JSON. Do not change it. If it is missing something, stop and
   say so in the receipt.
3. Docs/HOWTO-frames.md. Every frame the widget sends or hears.
4. static/js/widgets/shared/root-browser.js, add-controls.js,
   settings-rows.js, derived.js. Contract comments and export lines. The
   widget calls these and defines none of them.
5. Docs/audit/arrange-old/arrange.js, region.js. The seed. cables.js is
   already in shared/derived.js, do not read it.
6. static/css/ade.css lines 1900 to 2115. The seed's styles.
7. static/js/widgets/timeline/timeline.js lines 1 to 60. The widget contract
   and the style-injection idiom every Phase 3 port uses.
8. static/js/matrix/widget-frame.js. What the frame calls on a widget.
9. library/registry/widgets.json. Where the widget is registered.

## VOCABULARY

- A **node** is a **job**. The face shows the job.
- A **track** is an agent. A job belongs to one track.
- **Regions** live inside a job. Their names carry the reset suffix the
  server already stamps: builder, builder.2, builder.3. The suffix is the
  reset count. Nothing counts client side.
- A query agent and a build agent are the same node. Same face, same
  window. Nothing on the face says which it is.
- **Branch** and **merge** are git worktree points. **Group** is a group
  message hub. These three are mini nodes.
- **Left drawer**, not rail. The old code calls it `#ar-rail`. Rename it.

## 1. SHELL

- Folder `static/js/widgets/arrange/`, one file `arrange.js`. No other
  files. `derived.js` lives in `static/js/widgets/shared/` (section 7 and
  10); this build edits it, never moves it.
- The root browser is `MX.openRootBrowser`. The settings pane is
  `MX.settingsRows`. Do not define either.
- One row in `library/registry/widgets.json`: type `arrange`, label
  `Arrange`, path `/static/js/widgets/arrange/arrange.js`.
- Same module shape as the other ports: IIFE, registers on `window.MX`,
  injects its own `<style>` once by id, exposes `mount(frame)`,
  `unmount(frame)`, `onFrame(frame, msg)`, `canClose(frame)`. Per-instance
  state hangs on the frame, the way timeline does with `frame._tl`.
- Frames the widget listens to: `ade_init`, `track_list`, `track_created`,
  `feed`, `wp_feed`. Frames it sends: `feed`, `wp_feed`, `ade_plan`.
- The seed's `mount(elHost, ctx)`, `refresh`, `onEsc`, `insertRegion`,
  `syncSessionPlan`, `currentPlan`, `clearMap` become internal. Nothing
  outside the widget imports from it.

## 2. WHERE THE PLAN LIVES

- The plan is the `plan` block of a doc generator project database file.
  The widget opens that file by path, edits `plan` only, and writes the
  whole file back. Every other key passes through byte for byte. Key order
  is sorted on write, the doc generator's `canonicalJson` does the same.
- No localStorage. The seed's `arrangeMockD2` store is removed.
- A blank or null plan draws nothing. No seed plan, no EXTRACTION TAB.
- Undo and redo keep working, in memory, per open file.
- **Assumption A1.** The file is opened through the existing browser widget
  or a path field in the widget's own toolbar, and written through the
  server's existing file write route. If no route can write an arbitrary
  path, add the smallest one and name it in the receipt.

## 3. FACE

The seed's face, with two additions and no removals.

- Name, model chip, notes, worktree chip, status dot with status text,
  expand button. All as the seed draws them.
- **Track line.** One line under the head: the track name. Blank shows a
  dim placeholder, same idiom as the empty name.
- **Region line.** One line under the track: region names joined by
  ` · `, suffix included. Filled from `track_list` rows whose node id
  matches. Read only.
- Mini nodes get a small face: kind glyph and name only. No notes, no
  status, no model.

## 4. LEFT DRAWER

Replaces the seed's rail. Same DOM position, new behavior.

- One block per phase. Each block collapses and expands. Collapsed shows
  the phase name, LIVE toggle, and node count. Expanded shows everything
  the seed's rail showed: shared files with add and remove, loop chips with
  the two ceilings, node count.
- **Track pane.** Under the phase blocks, one row per track from
  `track_list`. Each row shows the track name, its regions, and its model.
  Click a row to edit track and region settings in the node window
  (section 5). A 🗺 button on each row centers the canvas on the node that
  carries that track and selects it. If no node carries it, toast.
- The drawer itself collapses to a thin strip with one button to reopen.
  Collapsed state is per instance, not saved.

## 5. NODE WINDOW

Opens on the expand button and on double-click of the node head. Replaces
the seed's `#ar-ex` overlay. Two panes side by side, a header with the
node name and a close button.

**Settings pane.**

- Track rows, then region rows, in the order the server sends them.
  Region rows are drawn by `MX.settingsRows.create(frame, {state,
  rerender})` and its `renderSettings`, `renderGates`, `renderPreset`.
  The widget owns a state object with the keys that file documents.
  Edits go out as `edit_track` frames from inside that module. The widget
  never writes settings to disk itself.
- A preset picker at the top. Picking one sets `node.preset` and sends
  `load_preset`. The plan stores the name only.
- **Assumption A2.** Retired. The row list is whatever `settings-rows.js`
  draws. If it lacks a row this pane needs, the receipt names it; do not
  add rows here.

**Context pane.**

- A file list. Each row: path, a preload toggle, a remove button.
- Drop target for drags from the browser widget. A file picker button.
- An injection box, plain textarea.
- **Save to library** writes the injection and a copy of each listed file
  to `library/docs/<node name>/`. Creates the folder. Overwrites by name.
- **Import from library** lists `library/docs/` and adds a picked file to
  the list.
- On close, the pane writes `injections/region/<node name>/context.json`
  with the file list and preload flags, and
  `injections/region/<node name>/injection.md` with the box text. That is
  the job context. It is never in the plan.
- Job context is one per job, not per region.

**Right-click on a node.**

- The seed's items stay: add notch (three kinds become five, section 6),
  cut, copy, paste, delete, undo, redo.
- `open settings` opens the window on the settings pane. `open context`
  opens it on the context pane.
- **duplicate job settings** copies the node's preset and settings rows
  to the clipboard. Paste onto another node applies them and nothing else.
- **duplicate job context** copies the context file list, flags, and
  injection. Paste applies them and nothing else.

## 6. NOTCHES AND CABLES

- Notch kinds are the five in `PlanNotchKind`. The seed's `cable` kind is
  gone. `git` and `fork` flags are gone. Migration: `cable` becomes `out`
  if any cable starts there, else `in`; `git` becomes `git-out` under the
  same rule; `fork` becomes `out`.
- `in` and `out` look different. `git-in` and `git-out` look different
  from those and from each other. `message` has its own look. Use the
  seed's shapes as the starting point: hollow circle, filled circle,
  hollow square, filled square, triangle.
- A notch may carry `path`. Set it from the cable menu when a cable is
  wired to it. Shown in the notch tooltip.
- Cables join notch to notch. `in` and `git-in` accept. `out` and
  `git-out` emit. `message` joins `message`. Any other pairing toasts and
  does nothing.
- `wire` is `file` for any cable between file jacks, `message` between
  message jacks.
- **Message wire drawing.** If a file cable exists between the same pair
  of nodes, the message cable rides beside it, offset a few pixels, in its
  own color. Otherwise it takes its own path. Its notches sit beside the
  file notches on the rim.
- Cables are white until executed, grey after. The seed's two colors.
- The cable menu is unchanged: shift-click opens it, action seeds are
  initiate, fork, resume, action and content are free text, clear clears
  both. Add one field: `path`, free text, stored on the cable and on its
  `out` notch.
- No arrowheads. The seed's endpoint circle stays.

## 7. DERIVED LAYER

- File handoffs come from `MX.derived.deriveFileHandoffs` over the `feed`
  records. Already built. A derived pair that matches an authored file
  cable flips that cable to executed. A derived pair with no authored
  cable draws as the seed's `dcvis` path, always executed.
- Message handoffs come from `MX.derived.deriveMessageHandoffs(rows)` over
  `wp_feed` rows. That function exists and returns `[]`. This build fills
  it in, in `shared/derived.js`, same output shape: `from`, `to`, `count`,
  `at`, and `paths` empty. A match flips an authored message cable to
  executed. The widget reads `MX.derived.mergeDerived(files, messages)`.
- **Assumption A3.** The `wp_feed` row shape is not documented on the
  client. Read what the messenger widget does with `msg.rows` and derive
  from the fields it uses. If sender and recipient region ids are not in
  the row, the message deriver returns an empty list and the receipt says
  so. Authored message cables still draw and still store.

## 8. MINI NODES

- `kind` is `branch`, `merge`, or `group`. Added from the canvas
  right-click menu beside `+ add node`.
- Small face, section 3. Notches allowed: `git-in` and `git-out` on branch
  and merge, `message` on group.
- Cables can touch them. Loop detection treats them as nodes.
- `jobId` is always null on a mini node. The doc generator's map never
  draws them.

## 9. LOOPS

- Detection is the seed's Tarjan pass. Chips in the drawer, ceilings on the
  chip, `loop` label on the notch, toast on a new loop. All unchanged.
- The dash march on loop cables is removed. Loop cables draw like any other
  cable.
- The loopbox is always on. The dev flag is removed. It draws as a static
  glow border: one soft box-shadow in the worktree color, no animation.
  The label stays.

## 10. STATE AND MOTION

One rule set for nodes. Cables keep their two colors.

- **complete** — greyed. The seed's 55 percent opacity. No motion. Check
  mark shown, dot hidden.
- **working** and **thinking** — full brightness. The seed's white border
  glow. The `pulse` keyframe moves from the dot to the border glow, 1.5
  seconds on working, 1.1 on thinking. The dot pulses too.
- **idle** — brighter than complete, dimmer than working. 80 percent
  opacity. A slow pulse on the border only, 3 seconds, 15 percent swing.
  This is "yet to be done".
- **blank** — the seed's dashed border at 55 percent. No motion.
- Selected, live, and hover states are unchanged.
- `shared/derived.js` already exports the two derivers and `mergeDerived`,
  with the shape documented at the top. The timeline already reads that
  list. Filling `deriveMessageHandoffs` must not change the shape.

## 11. WHAT THE DOC GENERATOR READS

- `node.jobId` and `cable.wire === 'file'`. That is all. Everything else in
  the plan is the suite's.
- The widget does not set `jobId`. A later spec wires job picking. Leave
  it null on every node this build creates.

## 12. NOT IN SCOPE

- Timeline changes of any kind.
- Enforcing loop ceilings.
- Job picking from the docset.
- Any server change beyond Assumption A1.
- Moving other widget folders.

## 13. RECEIPT

`Docs/Reports/RECEIPT-F4-arrange.md`, session review format from the
global rules. One INDEX.md line for the receipt, one for the widget
folder. Append one block to SESSIONLOG.md. Do not touch MEMORY.md or
CLAUDE.md. If blocked, write what you have and end your turn with
`BLOCKED: <one question>`. Add two sections:

**ASSUMPTIONS** — A1, A2, A3, each with what was found and what was done.

**UNDO** — one line per row below, stating whether the reverse still
holds after the build.

| decision | reverse |
|---|---|
| plan lives in the doc gen file | restore localStorage store from the seed, drop file read and write |
| left drawer replaces rail | restore `renderRail` from the seed |
| notch kinds five, migration | restore `KINDS`, `NOTCH_ADD`, `MARKER_KINDS` from the seed, drop migration |
| message wire | delete the message deriver, drop the `message` notch kind |
| mini nodes | drop the three kinds from the canvas menu, `kind` stays `job` |
| loop glow replaces dash march | restore `dashflow` and the dev flag |
| idle pulses | delete the idle keyframe rule |
| pulse on border | move the animation back to `.dot` |
| context files under injections/region | delete the folder writes, window keeps state in memory |
| save and import from library/docs | remove the two buttons and the folder |
| edit_track frames from the settings pane | remove the pane, settings stay in the timeline |
| cable menu gains path | remove the field, notch `path` stays null |
