# SPEC F3 — Timeline behavior

Goto agent. Ceiling 120 thousand tokens. Receipt before 150. Comments are
label, function, state only. "spine" is a banned word. No README files.

Runs after F1 and F2 land. Read in this order, nothing else:

1. This spec.
2. Docs/HOWTO-frames.md.
3. static/js/widgets/shared/derived.js, settings-rows.js, add-controls.js.
   Contract comments only, then the export lines.
4. static/js/widgets/timeline/timeline.js.
5. static/js/widgets/devagent/devagent.js, `onFrame` only.

## 1. LANE RIGHT-CLICK

Rewrite `openTrackMenu`. Items, in this order, nothing else.

Lane with a live region:
- `copy region settings` — as today.
- `paste settings from <name>` — as today, only when a clip exists.
- `save preset` — `window.prompt` for a name, send
  `{ type: "save_preset", track: <region id>, name }`.
- `load preset ▸` — submenu of names from `GET /api/library/presets`
  (`names`). Pick sends `{ type: "load_preset", track, name }`. The change
  prompt follows, section 3.
- `reset with preset ▸` — same list. Pick confirms
  `Reset "<region>" and load "<preset>"? New id, no transcript, no cache.`
  then sends `{ type: "load_preset", track, name, mode: "reset" }`.
- `reset region` — as today.
- `delete region` — as today.

Lane with no live region:
- `insert region preset ▸` — same list, sends `insert_region` with
  `presets: name` on the container. Replaces `openPresetPick`.
- `insert region from <clip>` — as today.
- `delete track` — as today.

Gone: `duplicate region to new track`, `edit region`, `insert region…`,
every `mx:open-devagent` dispatch, `/api/settings/browse`.

The span's own right-click menu (`region-ctxmenu`) loses `edit settings`.
It keeps `delete region`.

## 2. PRESET LIST

One fetch of `/api/library/presets` per menu open, cached on `frame._tl`
until the next open. Submenus render inside `#tlCtxMenu` the way
`openPresetPick` did. `(none saved)` when empty.

## 3. CHANGE PROMPT

Subscribe to `change_prompt`. F1 broadcasts it. On arrival, if
`msg.region` is a live region on a lane, hold it on `tl.changePrompt` and
render: the region's span gets the `settling` class and a popover styled
like `region-settle`, showing `msg.text` and one button per
`msg.choices`. Click sends `{ type: "change_answer", token, choice }`,
clears `tl.changePrompt`, renders. Escape clears it.

`cacheTtlToggle` and `excludeDynamicToggle` stop writing to `t.settings`
before the send. They send, then wait for the roster.

Devagent already draws the prompt. Two widgets may show one prompt; the
second answer prints "unknown token". Leave that.

## 4. HANDOFF LINES

On every `feed`, call `MX.derived.deriveFileHandoffs(msg.records)` and
`MX.derived.mergeDerived(files, [])`. Hold the list on `tl.handoffs`.

In `render`, after lanes are built, for each handoff whose `from` and `to`
both sit on drawn lanes:
- A tick on the `from` span at `xAt(at)`, class `tl-handoff out`, title
  `→ <to name> · <count> file(s)`.
- A tick on the `to` span at the same x, class `tl-handoff in`, title
  `← <from name> · <count> file(s)`.
- One vertical line in `tlRows`, absolute, at that x, from the from-lane's
  row middle to the to-lane's row middle, class `tl-handoff-line <wire>`.
- Click on any of the three opens the ledger for `from`.

CSS: `file` wire uses `var(--text-3)`, `message` wire uses
`var(--gate-blue)`. Line width one pixel. Ticks two pixels wide, top and
bottom inset like `.tl-tick`. Regions with no lane draw nothing.

## 5. CHECK

- `node --check` on timeline.js.
- Grep timeline.js: no `api/settings/browse`, no `mx:open-devagent`, no
  `duplicate_region`.
- Grep timeline.js: `change_prompt` in the subscribe list.

## 6. NOT IN SCOPE

- Devagent edits. Read its `onFrame` for reference only.
- Any Python file. Any shared file.
- Message handoffs. The deriver returns empty until arrange fills it.

## 7. RECEIPT

`Docs/Reports/RECEIPT-F3-timeline-behavior.md`, session review format
from the global rules. One INDEX.md line for the receipt. Append one block
to SESSIONLOG.md. Do not touch MEMORY.md or CLAUDE.md.

If blocked, write what you have to the receipt and end your turn with
`BLOCKED: <one question>`.
