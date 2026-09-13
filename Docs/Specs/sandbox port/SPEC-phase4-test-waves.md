# SPEC — Phase 4 test waves B, C, D — Sandbox Suite

Written 2026-09-07 by Fable. Replaces SPEC-test-waves-BC.md. Eleven
boxes across three waves. Sequential by default, one browser. Brandon
can say "parallel" at a gate. Goto definition. Sonnet standard; Opus
suggested where marked. The session agent confirms the model per box
with Brandon before each wave and writes the answer into the MODEL
line of that box.

## Shared setup, every box

- Harness: `python3 Docs/tests/matrix_harness.py --widget <type> --session <sid> --hold 45 --out Docs/Reports/phase3-test/`
  Writes `<type>-console.txt`, `<type>-full.png`, `<type>-widget.png`.
  Session id from the session agent. Run command in
  Docs/Reports/RECEIPT-test-job1-setup.md. Harness has no interaction
  flags; a scratchpad probe that injects frames by page.evaluate is
  allowed, as Job 5 did.
- Driven session carries one haiku region, one gemma4 e4b region, one
  turn, one gate record. If a checklist line needs more than that, say
  so in BLOCKERS and move on.
- Server 127.0.0.1:5000 up. Do not start, stop, restart. No new sessions.
- Read rule: the READ LINE below is the starting hypothesis, drawn from
  a full read. Read the new widget file. Grep the old file only if the
  read line says markup is missing. Beyond that: static/matrix.html and
  the registry row by grep. Log every read.
- Output: `Docs/Reports/phase3-test/SPEC-test-<type>.md` with RENDER,
  READ LINE CONFIRMED OR REFUTED, CHECKLIST, CONSOLE, FIX LIST, READS,
  BLOCKERS. Receipt `Docs/Reports/RECEIPT-phase4-<box>.md`. INDEX.md and
  SESSIONLOG.md are the Closer's.
- Rules: no edits to widget, server, or css files except where a box
  says BUILD. No commits, README, installs. Comments label, function,
  state only. "spine" banned. Truthful. Mid-run message from the session
  agent: follow it.
- Paired box: receipt for the first widget before the second starts.
- Known, one line each, do not re-derive: favicon 404 is page-level.
  `.mx-host` is not flex. matrix.html does not load ade.css. Two widgets
  land in the same slot when the grid is full (grid.js:232).
- Cap 150K.

---

## Wave B

### B1 — strip + changes
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap gate records must exist, blast none.
Estimate 90K.

strip. Type `strip`. static/js/widgets/agent/strip/strip.js after S3.
READ LINE: after S1, chips are region rows and gates key by region.
Before S1 chips were containers and queue state never lit. Kill sends
`stop` with the chip id, which is now a region id. `track_status`,
`gate_broadcast`, `context_warn` are sent on server events; confirm at
least one arrives during a turn.
CHECKLIST: one chip per region, popover opens with feed rows, kill
stops the region, busy state shows during a turn, queue state shows on
a pending gate.

changes. Type `changes`. static/js/widgets/adetools/changes/changes.js.
READ LINE: after S1, agent labels come from region rows. Jump button
and diff-line clicks dispatch `mx:open-ledger`; needs a ledger widget in
the window to land.
CHECKLIST: files and agents grouping, diff pane, pending gate flag, jump
opens the right ledger row with a ledger widget mounted.

### B2 — messenger + queue-log
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap gate records must exist, blast none.
Estimate 100K.

messenger. Type `messenger`. static/js/widgets/agent/messenger/messenger.js.
READ LINE: after S1, rail rows carry status, model, muted. `wp_send`
goes to region ids. Roster from `track_list` and `ade_init`.
CHECKLIST: roster updates on track_list, send lands on the waypoint,
mute toggles, read marks, cards group by participants.

queue-log. Type `queue_log`. static/js/widgets/queue/queue-log/queue-log.js.
READ LINE: after S1, track column names regions, model and provider
chips fill, cache toggles show on claude regions. Column drag and
resize persist in localStorage.
CHECKLIST: feed rows, settle inline, detail expands, column order and
width survive a reload.

### B3 — ledger + transcript
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap one real turn with usage, blast none.
Estimate 90K.

ledger. Type `ledger`. static/js/widgets/adetools/ledger/ledger.js.
READ LINE: after S1, chips name regions. Turn rows need `kind: "turn"`
records with usage. Transcript under a turn requests `transcript` once
per region. `mx:open-ledger` focuses a row.
CHECKLIST: turn table, rollup chips, per-agent totals, open a turn shows
actions and transcript, columns hide and reorder.

transcript. Type `transcript`. static/js/widgets/adetools/transcript/transcript.js.
READ LINE: fetches `/api/transcripts?sid=` and
`/api/retired-chats/<sid>/<rid>`. Both routes exist. Live first, retired
after. No frame subscriptions.
CHECKLIST: lists live then retired, opening a cache renders turns. The
suite page transcripts toggle needs /suite, not the harness; note it.

### B4 — gate-list + anchor-chat, one window
MODEL: Opus suggested. Confirmed: ___
Risk: drift medium, gap a gate must fire live, blast none.
Estimate 100K.

gate-list. Type `gate_list`. static/js/widgets/queue/gate-list/gate-list.js.
READ LINE: binds by `options.region`. Waits on `chat_history`, which
the server sends only to the socket that sent `anchor`. Gate-list never
sends `anchor`. So its history rows appear only when an anchor-chat for
the same region is in the same window. `ask` and `gate_pending` come
from engine/web_io.py during a turn. Settle sends `answer` with text
y, n, or queue.
CHECKLIST: with anchor-chat bound to the same region, history rows
show; a live gate shows as ASK, settle changes the badge.

anchor-chat. Type `anchor_chat`.
static/js/widgets/chat/anchor-chat/anchor-chat.js.
READ LINE: sends `anchor` on bind, gets `track_transcript` and
`chat_history`. Subscribes `out`, `status`, `meters` raw; those frames
carry no region (engine/web_io.py:26, 184). Two anchor-chats on one
socket both draw every region's stream. Confirm with two instances.
CHECKLIST: transcript renders, send runs a turn, stream shows thinking
and fences, stop fires, meters update, region_replaced rebinds.

Gate the two together: mount both bound to the haiku region, run one
turn that hits a gate, settle it in gate-list, watch anchor-chat.

---

## Wave C

### C1 — devagent
MODEL: Opus suggested. Confirmed: ___
Risk: drift medium, gap which preset and gate edge to exercise, blast none.
Estimate 90K.

Type `devagent`. static/js/widgets/agent/devagent/devagent.js plus
static/js/widgets/shared/settings-rows.js.
READ LINE: reads both row types correctly. Every roster or status frame
rebuilds the whole tree, remounting both add forms and refetching the
model list. `file` is subscribed and unused. Context path is relative
`injections/track/<id>.md` through `/api/fs/read`; report what base the
server resolves it against. `gate_edges` arrives on socket open only,
before the widget mounts; after S2 confirm whether the gates tab still
reads "no gate edges" on a late mount. `mx:open-devagent` listener from
E6b.
CHECKLIST: tree lists tracks and regions, dot fill follows status, add
track and add region from the tree, track fields save, context loads
unlocks saves, settings tab rail params and model picker and
change_prompt choices, gates tab apply, preset load save rename delete.
See SPEC-phase4-timeline-target.md for what devagent keeps.

### C2 — timeline, test and BUILD
MODEL: Opus suggested. Confirmed: ___
Risk: drift high, gap the two changes are worded not drawn, blast
timeline.js and every menu item on it.
Estimate 90K.

Type `timeline`. static/js/widgets/adetools/timeline/timeline.js.
READ LINE: reads both row types correctly. Shared add form mounted at
lines 1292-1293. Right-click on a track lane offers "insert region
preset" only. `isClaudeModel` matches four literal names, so cache
toggles never show for a versioned model id. Ruler bar text collides
with the zoom control at narrow widths.
TEST FIRST: run the harness, checklist below, receipt.
THEN BUILD to SPEC-phase4-timeline-target.md. Every existing menu item
stays. Retest, second receipt.
CHECKLIST: lanes per track, spans per region, pips, right-click menu
items all present, inline rename of track and region, root browser,
cache toggles on a claude region, zoom persists, refresh timer.

### C3 — editor + terminal
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap a file path and a region for the shell, blast a
real PTY opens.
Estimate 95K.

editor. Type `editor`. static/js/widgets/usertools/editor/editor.js plus
shared/monaco-readonly.js.
READ LINE: `open` and `save` frames echo `inst`. Monaco vendored. Tabs
ride the grid options. Refused save leaves the tab dirty with the
reason on the bar.
CHECKLIST: open a file, edit, save, denied save shows reason, markdown
preview, unsaved modal on close, load time and console.

terminal. Type `terminal`. static/js/widgets/usertools/terminal/terminal.js.
READ LINE: `follow` then `input` with a shell key per tab; `term`
frames carry shell and region. xterm vendored. Report the process the
PTY starts. Do not type into it beyond the newline the widget sends.
CHECKLIST: region picker fills from roster, New Tab opens a PTY, output
lands in its own tab, close sends close_shell and unfollow.

### C4 — browser + viewer
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap none, blast none.
Estimate 80K.

browser. Type `browser`. static/js/widgets/usertools/browser/browser.js.
READ LINE: `tree` reply echoes `tag` (frames.py:814). Right-click menu:
duplicate, rename, reveal, open in editor, open in viewer.
CHECKLIST: change root, tree expands, sizes load, right-click actions,
open in viewer adds a viewer tab.

viewer. Type `viewer`. static/js/widgets/usertools/viewer/viewer.js.
READ LINE: marked is vendored and already on the page; mermaid loads
from a CDN. Report whether that CDN load succeeds and what the console
says.
CHECKLIST: image, pdf, markdown, csv, json, code each render; tabs
persist in options.

---

## Wave D

### D1 — mini-queue + mount
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap none, blast none.
Estimate 60K.

mini-queue. Type `mini_queue`. static/js/widgets/queue/mini-queue/mini-queue.js.
READ LINE: fills from `feed`, then follows `gate_broadcast`, `ask`,
`gate_pending`. All three are real server frames. Shares gate-common.js
and the `cq-queue` class with queue; the css targets both on purpose.
CHECKLIST: pending rows only, settle drops the row, refresh refills.

mount. Type `mount`. static/js/widgets/agent/mount/mount.js.
READ LINE: one call to the shared add form in mode "both". After S2 the
root field shows the session root. The same form lives in devagent and
timeline; report whether this widget earns a slot.
CHECKLIST: track plus region mount in one click with the inherited
root, the region appears in timeline and devagent.

### D2 — arrange
MODEL: Opus suggested. Confirmed: ___
Risk: drift high, gap a plan file to open, blast it saves to the doc
generator file Brandon names.
Estimate 100K.

Type `arrange`. static/js/widgets/adetools/arrange/arrange.js.
READ LINE: reads both row types correctly. Opens a doc generator project
file through `/api/fs/raw`, writes it back through `/api/fs/put`. Sends
`ade_plan`, `load_preset`, `edit_track`. Regions land on nodes by
`node_id`. Second half of the file unread beyond its sends.
Brandon names the plan file at the gate. Do not save unless he says so.
CHECKLIST: open plan, drawer phases, canvas nodes and cables, node
window settings and context panes, track pane centers on a node,
pipe phase sends ade_plan.

### D3 — chat, only if Brandon wants the number
MODEL: Sonnet suggested. Confirmed: ___
Risk: drift low, gap none, blast none.
Estimate 45K.

Type `chat`. static/js/widgets/chat/chat/chat.js.
READ LINE: `follow` per instance, `mirror` frames tagged by region, so
several chats stream at once. Speech lock in localStorage.
CHECKLIST: region picker, live pill, send, stop, reload, file drop from
browser, speech toggle.

---

## Totals, estimates only

Wave B about 380K. Wave C about 355K. Wave D about 205K. Wave A actuals
ran 20 to 70 percent over. Plan for 1.3M on the tests alone.

## After the waves

Fix jobs are not designed here. Each SPEC-test file carries a FIX LIST.
Brandon's notes plus those lists become the next fix set.
