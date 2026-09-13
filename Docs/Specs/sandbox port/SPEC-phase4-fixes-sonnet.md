# SPEC — Phase 4 fixes, three Sonnet boxes — Sandbox Suite

Written 2026-09-07 by Fable. Three boxes, one agent each, Sonnet, Goto
definition. Run one at a time. Each box ends in a headed harness run and
a receipt. Brandon watches.

## Shared setup, every box

- Harness: `python3 Docs/tests/matrix_harness.py --widget <type> --session <sid> --hold 45 --out Docs/Reports/phase3-test/`
  Session id comes from the session agent. Run command in
  Docs/Reports/RECEIPT-test-job1-setup.md.
- Server on 127.0.0.1:5000 is up. Do not start, stop, restart.
- Read rule: grep first. Read only the lines this spec names plus
  enough around them to edit safely. Log every read.
- Edit with the Edit tool, one hunk at a time, so Brandon sees each.
- Receipt: `Docs/Reports/RECEIPT-phase4-<box>.md`, receipt shape from
  ~/.claude/CLAUDE.md. INDEX.md and SESSIONLOG.md are the Closer's.
- Comments label, function, state only. "spine" banned. No commits,
  no README, no installs.
- Cap 150K. Write the receipt for the first job before the second.

## Server naming, do not guess

`ade/web_io.py` lines 74-91: the `track_list` and `ade_init` frames carry
`tracks` (region rows: id, track, node_id, name, model, seat, root,
provider, settings, overlay, muted) and `rows` (track container rows:
id, name, regions, root, order). Region rows are the agents. Feed
records key on region id.

---

## S1 — F1 rows versus tracks, plus F3 HOWTO third table

Risk row: drift low, gap none, blast five widgets blank if wrong.
Estimate 60K.

### F1

Five widgets read `msg.rows` where they need region rows, and none of
the five subscribes to `ade_init`. Change both in each.

| file | rows line | subscribe line |
|---|---|---|
| static/js/widgets/strip/strip.js | 329 `s.tracks = msg.rows` | 313, add "ade_init"; 328, accept `ade_init` too |
| static/js/widgets/changes/changes.js | 463 `msg.rows` | 449, add "ade_init"; 462, accept `ade_init` too |
| static/js/widgets/messenger/messenger.js | 420 `msg.rows` | 406, add "ade_init"; 419, accept `ade_init` too |
| static/js/widgets/queue-log/queue-log.js | 571 `msg.rows` | 557, add "ade_init"; 570, accept `ade_init` too |
| static/js/widgets/ledger/ledger.js | 802 `msg.rows` | 782, add "ade_init"; 801, accept `ade_init` too |

Change `msg.rows` to `msg.tracks` on each rows line. Nothing else in
those files.

Harness: run each of the five. Screenshot shows region names, not ids,
in strip chips, messenger rail, queue-log track column, changes agent
labels, ledger chips. Console clean of new errors.

### F3

Docs/HOWTO-frames.md covers `ade/web_io.py` only. Add a third table,
"Server to client, engine senders", from `engine/web_io.py`. Grep
`"type":` in that file and `ade/tracks.py` line 154. Rows: out, ask,
gate_pending, activity, meters, term, speak, audio, status, models,
ledger_detail, mirror. Columns: frame, fields, sender line.

Strike the "no caller" wording on lines 76-79 and 98-103. Callers exist:
context_warn at ade/tracks.py:827, gate_broadcast at server.py:200,
track_status at server.py:362, crew_list, gate_edges, rail_catalog at
server.py:1753-1755, all on socket open. Say that instead.

Add one client-to-server row for `roster` (S2 adds the handler; write
the row here, mark it "added by S2").

No harness for F3.

---

## S2 — F2 roster frame, F6 session root, F7 frame type in error

Risk row: drift low, gap the widget list below, blast frames.py.
Estimate 50K.

### F2

Server sends `ade_init` on socket open (server.py:1753-1756). Widgets
mount after the grid fetch (static/js/matrix/main.js:41-45,
grid.js:108-115). No client frame asks for the roster again.

Add a handler in `ade/frames.py` inside `handle()`, after the `_init`
closure (line 551) and before `if t == "create_track"` (line 557):

```
    if t == "roster":
        _roster()
        return
```

`_roster()` at line 546 already broadcasts `track_list` to the
environment. That is the whole handler.

Client: every widget that keeps a roster sends
`frame.send({ type: "roster", inst: frame.id })` once in `mount`, right
after its `frame.subscribe([...])` line. Twelve files:

strip, changes, messenger, queue-log, ledger, timeline, devagent,
arrange, chat, terminal, queue, mini-queue.

Gate-list and anchor-chat bind by option, not roster. Leave them.

Harness: cold bind on timeline. First paint shows the driven session's
tracks. Then strip, chat. Same.

### F6

`ade/frames.py:322`: `root=msg.get("root") or rt.WORKSPACE_ROOT,`
becomes `root=msg.get("root"),`. `ade/tracks.py:1104` then falls back to
`environment.root`, and `tracks.py:449` covers a None root at run time.

Harness: mount widget, "+ track + region" with root left inherited.
Timeline lane head shows the session root, not the workspace root.

### F7

`server.py:1772`: the catch-all reports the exception without the frame
type. Add the type. The frame dict is in scope in that loop; grep the
ten lines above for its name. Shape:
`[frame error — skipped: <type>: <e>]`.

No harness. Brandon's screenshot showed
`'str' object has no attribute 'tracks_lock'` with no type. The next
time it fires, the type names the handler.

---

## S3 — F4 folders and registry group, F5 picker dropdown

Risk row: drift medium on picker look, gap picker pixels, blast paths
and the New Widget button. Estimate 55K.

### F4

Move widget folders under static/js/widgets/ into five groups. shared/
stays where it is.

| group | folders |
|---|---|
| chat | chat, anchor-chat |
| queue | queue, mini-queue, queue-log, gate-list |
| usertools | editor, terminal, browser, viewer |
| agent | strip, devagent, messenger, mount |
| adetools | ledger, changes, transcript, timeline, arrange |

Result shape: `static/js/widgets/chat/chat/chat.js`,
`static/js/widgets/chat/anchor-chat/anchor-chat.js`, and so on. Use
`git mv`. No edits inside widget files.

Then two files:

- `library/registry/widgets.json`: every `path` updated; every row gains
  `"group": "<group>"`.
- `static/matrix.html` lines 42-60: every `<script src>` updated.

Harness: load every widget type once, nineteen runs, console shows no
404 and no "no widget module for". One screenshot per type is enough.

### F5

Rewrite `static/js/matrix/widget-picker.js`. Today it opens an overlay
with one flat column per registry row.

Target: a dropdown anchored under the New Widget button
(`#mxNewWidget`, static/matrix.html:18). Two columns. Left column lists
groups from the registry `group` field, in the order chat, queue,
usertools, agent, adetools. Clicking a group fills the right column with
that group's widgets, label above type. Clicking a widget calls
`MX.grid.addWidget(row.type)` and leaves the dropdown open so several
can be added. "not built" stays disabled as today.

Close on click outside the dropdown and on Escape. `MX.ui.overlay` is
not used. Styles go in `static/css/matrix.css` under a `.mx-picker`
prefix, or injected the way widgets do it. Match the existing surface
and border variables. No new colors.

Harness: any widget type. Screenshot with the dropdown open on the
queue group. Add one widget through it, screenshot shows it mounted.

---

## After S3

Session agent relays three receipts. Gate B follows.
