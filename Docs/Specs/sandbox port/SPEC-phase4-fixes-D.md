# SPEC — Phase 4 last wave: fixes from B through D — Sandbox Suite

Written 2026-09-07 by the Phase 4 session agent (Fable) from the
receipts B4, D1, D2, D3, F-B, F-G, S3 and Brandon's answers on
2026-09-07. Four boxes. W1, W2, W3 run together, split by file. One
restart. W4 tests after it.

## Shared setup

- Session 9883b6bec3df. Server 127.0.0.1:5000. Brandon runs it. No
  start, stop, restart. No reloader: boxes that edit server or engine
  files make every edit, stop, report "ready for restart", wait.
- Paths grouped: static/js/widgets/<group>/<name>/<name>.js.
- Harness: Docs/tests/matrix_harness.py mounts only. Copy to scratchpad,
  add page.evaluate and page.click steps. Headed. Use MX.grid.addWidget,
  never applyTemplate, other boxes share the session. Prefix mounts with
  the box name. Remove what you made with kill_track and delete_track.
- Words: regions end or stop. The frame is named kill_track; use the
  frame name only when naming the frame.
- Grep first. /usr/bin/grep on arrange.js. Edit tool, one hunk at a
  time. Syntax check. Log every read. Comments label, function, state
  only. "spine" banned. No commits, README, installs.
- Receipt Docs/Reports/RECEIPT-phase4-<box>.md, shape as F-B.

## Housekeeping, logged, not done

- library/maps/: Music History.json (test phase inside), Music
  History.2.json, Desktop.json. D2 test output.
- library/grids/9883b6bec3df/: throwaway window files from every box.
- Docs/Reports/phase3-test/<box>/ screenshot folders stay as evidence.

## W1 — server, Sonnet, cap 100K

Files: ade/tracks.py, ade/frames.py, engine/agent_loop.py, server.py.

1. Archive safety. ade/tracks.py save_all_on_shutdown (:2078) writes
   every environment. Skip any with hydrated False. In _write_archive
   (:1663), before opening master.json for write, copy the existing
   file to master.prev in the same folder if it exists.
2. Gate command text on the direct-answer branch. F-B put `command`
   on the queue, timeout, and disconnect branches of
   engine/agent_loop.py (:396, :418, :424). The direct human answer
   inside gate_wait_s (around :181) never had a queue entry. Carry the
   command from `data` or the tool payload there too, same key.
3. Plan node provider. ade/frames.py _plan_region and _PLAN_NODE_FIELDS:
   add `provider`, so a node can say claude or ollama. _plan_rows: skip
   nodes whose kind is group, branch, or merge; only job nodes pipe.
4. Chooser comes forward. server.py:1558 has an unproven
   `osascript -e activate` line from D2. Prove it by calling the route
   with curl and watching the dialog come to front; cancel it. Fix if
   it does not.
5. Ollama default model stays gemma4:26b-mxfp8. Confirm nothing else
   overrides it. No edit expected.

## W2 — anchor-chat becomes a switcher, Opus, cap 150K

Files: engine/web_io.py, ade/frames.py (chat_history frame only),
static/js/widgets/chat/anchor-chat/anchor-chat.js,
static/js/widgets/chat/chat/chat.js,
static/js/widgets/queue/gate-list/gate-list.js.

Brandon's decision: drop the anchor. One socket following one region
is out. Anchor-chat gets a region switcher like chat and rides
follow and mirror. Chat and anchor-chat are probably the same widget
after this; Brandon dedupes later, not this box.

1. engine/web_io.py: `out` (:26), `status` (:159), `meters` (:184)
   carry `region`. Grep how `mirror` gets its region tag and do the
   same.
2. chat.js:480-488: the raw fallback guards on msg.inst or msg.region.
   With region now present, drop frames whose region is not the bound
   one. anchor-chat.js:676-684 the same.
3. anchor-chat.js: remove the `anchor` send. Bind and switch send
   `follow` for the new region and `unfollow` for the old, the way
   chat.js does. Transcript comes from the `transcript` frame
   (HOWTO-frames client table). Add a region select in the head fed by
   the roster, same control chat uses; grep chat.js for it and share
   the code if it is in shared/, else copy the smallest piece.
   region_replaced rebinds still. Stop button adds a fired state until
   the server's dim line lands (:647-651).
4. gate-list history without anchor. gate-list waited on
   `chat_history`, which only `anchor` sent. Add a client frame
   `chat_history` with `track` in ade/frames.py handle() that replies
   with `send_chat_history(track.id, _track_gatelog(track.id))`.
   gate-list sends it on bind and on region change.
5. ade/frames.py _anchor and _detach stay for now; nothing else calls
   them after this. Say in the receipt what still references them.

## W3 — widgets, Sonnet, cap 100K

Files: static/js/widgets/agent/mount/mount.js,
static/js/widgets/shared/settings-rows.js,
static/js/matrix/widget-picker.js, static/css/matrix.css,
static/js/widgets/adetools/arrange/arrange.js. No server files.

1. Mount root field. mount.js never calls the shared add form's
   refresh, so its root box stays blank. Call it the way devagent does
   (D1 receipt names the line).
2. settings-rows.js:226 blockCollapsed throws on a node with regions
   after a pipe (D2: pageerror plus a 400). Guard it.
3. Picker dropdown clips off screen at the New Widget button's corner
   (S3). Flip it to open left or up when it would overflow the
   viewport.
4. Theme variables. F-G found --accent, --surface-1, --surface-2, and
   the rest are never defined in any :root. Add one :root block at the
   top of static/css/matrix.css defining each variable from the
   fallback value the files already use. Grep every `var(--` in
   static/css and static/js/widgets to collect the set. No new colors,
   the fallbacks are the values.
5. Arrange node track. D2: `node.track` has no control. Add a select
   on the node window listing tracks from the roster, writing
   node.track. Grep D2's node window code at arrange.js:2124-2130 for
   where the rows go.

## W4 — test, Sonnet, cap 150K, after restart

- Arrange: open library/maps/Music History.json, draw a cable between
  two nodes, set its path, save, reopen, cable is there. Pipe a phase
  with one job node provider claude model sonnet; region lands with
  node_id; console clean after the pipe.
- Chooser: browse click brings the dialog to the front; cancel returns
  null. Screenshot it in front.
- Two chats bound to two regions, one turn each from the widget send
  box; neither shows the other's text; frames-seen counts per region.
- Anchor-chat: switch regions with the new select; transcript follows;
  send runs a turn; stop shows fired.
- Gate-list bound to a region shows history rows with no anchor-chat
  in the window.
- Mount: root box shows the session root on mount.
- Picker: open it with the button at the right edge; dropdown stays on
  screen.
- Devagent: the FG selection styles still hold after the :root block.
- Remove what you made. SPEC-test files: append a dated W4 section.

## W5 — delete the raw fan-out, Sonnet, cap 120K, after W4

Brandon's decision 2026-09-07: the socket-level out, status, and
meters frames are a second copy of what mirror sends. Delete that
copy. Map: Docs/Reports/RECEIPT-phase4-W2.md, "WHAT STILL REFERENCES
_anchor AND _detach" and BLOCKERS.

Files: engine/web_io.py, ade/tracks.py (TrackHub only), ade/frames.py.

1. Grep first what rides hub membership besides those three frames:
   ask, gate_pending, term, speak, audio, and anything else
   TrackHub._fanout (ade/tracks.py:193-260) passes to members. Those
   stay. Write the list in the receipt before editing.
2. Remove the member fan-out for out, status, meters only: the send
   calls in engine/web_io.py (:26-29, :161-163, :187-189) that go to
   hub members, and their branch in _fanout. Mirror keeps carrying
   the stream. WebIO.region (:24) goes with them if nothing else reads
   it.
3. ade/frames.py: remove the `anchor` client frame (:619 area); no
   widget sends it. _anchor stays because create_track, insert_region,
   duplicate_region use it to join the hub for ask and gate_pending;
   rename it `_join_hub` and update its four callers so the old word
   is gone. _detach stays for disconnect and end paths.
4. chat.js:483-485 and anchor-chat.js raw-frame branches: remove the
   dead branches for out, status, meters. Keep speak and audio.
5. Stop and report "ready for restart". After restart, headed: two
   chats on two regions stream from mirror only, no doubling; a write
   gate parks and gate-list draws and settles it; terminal opens a
   shell and output lands. Remove what you made.

## After W5

Session agent relays the receipts and writes the session review.
