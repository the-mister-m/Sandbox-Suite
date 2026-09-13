# SPEC — Phase 4 fixes from Wave B — Sandbox Suite

Written 2026-09-07 by the Phase 4 session agent (Fable) from the Wave B
receipts (S1-rerun, B1, B2, B4) and the fix-reference reads. Three boxes.
Order: S2 alone (SPEC-phase4-fixes-sonnet.md), then F-B and F-C in
parallel, then S3 (SPEC-phase4-fixes-sonnet.md). Wave C after.

## Shared setup, every box

- Session 9883b6bec3df. Server 127.0.0.1:5000. Brandon runs it. No
  start, stop, restart. Server files have no reloader: a box that edits
  server code stops after its edits and reports, the session agent gets
  Brandon to restart, then the box continues to its harness.
- Harness: Docs/tests/matrix_harness.py mounts only. Copy to scratchpad,
  add page.evaluate and page.click between mount and screenshot. Headed.
  Driving mechanics and probe pattern: Docs/Reports/RECEIPT-phase4-B1.md
  and RECEIPT-phase4-B4.md.
- Regions are live. Mount on track 5a031370bf1c, drop with kill_track,
  say what was mounted and dropped. gfsf stays.
- Grep first, read the named lines plus room to edit. Edit tool, one
  hunk at a time. Log every read. Comments label, function, state only.
  "spine" banned. No commits, README, installs. Cap 150K.
- Receipt Docs/Reports/RECEIPT-phase4-<box>.md, same shape as B1.

## F-B — server side and gate-list

Risk: drift low, gap none, blast frames.py and tracks.py. Sonnet.
No file here is touched by F-C.

1. gate-list settle frame. static/js/widgets/gate-list/gate-list.js:278-280
   sends `answer`. Send `gate_action` with `action` from the button and
   `id`, the way static/js/widgets/shared/gate-common.js:94 does.
2. gate-list region filter. gate-list.js:302-335. `ask` carries
   `msg.region` at top level (engine/web_io.py:50). `gate_pending`
   carries `region` per row in `pending[]` and `active`
   (engine/web_io.py:137-143). When g.region is set, drop rows and asks
   whose region differs.
3. gate-list badge. gate-list.js:267-277 repaints on click. Keep the
   repaint but mark the row awaiting; clear it on the next
   `gate_pending` or `feed`. Small.
4. chat_history filter. ade/frames.py:256 compares `r.get("track")` to a
   region id. `engine/ledger.py:136` writes region under `region`.
   Change to `r.get("region")`.
5. Closed rows on delete. ade/tracks.py:1386 `remove_track` pops regions
   without appending `environment.closed_rows`. Mirror lines 1437-1440:
   append `index_entry()` for each popped region.
6. wp_mute roster. ade/frames.py:794-797 sets muted and stops. After
   `set_muted`, call the roster broadcast (`broadcast_roster`,
   frames.py:130) so rails repaint.
7. Gate record command text. engine/agent_loop.py:181 builds the gate
   payload with `target` and `queue_id` only. Add the command text under
   key `command`. Grep engine/daemon_queue.py for the entry shape to find
   where the command lives. If it is not reachable from `data`, say so
   in BLOCKERS and skip; F-C reads `payload.command`.

Harness after restart: gate-list bound to a fresh sonnet region, one
write gate, settle from the widget, ledger shows answered_by human.
Second gate-list bound to a dead region shows nothing. messenger mute
click repaints without a second frame.

## F-C — Wave B widgets and the model selector

Risk: drift low, gap feed_dirty timing, blast five widgets. Sonnet.
No file here is touched by F-B. Server side of item 4 lands in F-B.

1. changes write_file. static/js/widgets/changes/changes.js:160 matches
   `action_type === "write"` only. Accept `"write_file"` too.
2. Closed names. strip, changes, messenger, queue-log, ledger name
   regions from `msg.tracks` rows. ade_init and track_list also carry
   `names` (ade/web_io.py:81, 90), which includes closed rows. Where each
   widget maps a region id to a name, fall back to `msg.names[id]`, then
   the id. Grep each for the name lookup; timeline.js and devagent.js
   already read `msg.names` for the pattern.
3. Live refresh. No widget subscribes `feed_dirty`. changes.js:449-450
   and queue-log.js:557-558 fetch once. Subscribe `feed_dirty` and
   re-send `feed` on it, debounced one second. Check ledger.js:782 and
   do the same if it fetches once.
4. queue-log detail. queue-log.js:185-198 shows queue_id for merged
   run_command. Read `payload.command` first when present.
5. messenger read marks. messenger.js:257-260 sends wp_read and stops.
   Re-send `wp_feed` after it so read marks repaint.
6. Model selector, look then fix only if wrong. Wherever a region model
   picker lists claude models (static/js/widgets/shared/settings-rows.js,
   devagent, timeline, anchor-chat), Brandon wants the resolved model id
   shown, like claude-sonnet-5, not a dash or a bare alias.
   engine/providers.py:234-237 holds the alias map. Grep what
   /api/library/models returns and what the picker renders. If it
   already shows the resolved id, one line in the receipt. If it shows a
   dash or bare alias, fix the render.

Harness: changes with a write_file turn keeps the file after the gate
resolves and updates without remount. queue-log detail shows the
command. messenger read mark repaints. Kill a region, its name stays in
strip, changes, ledger. Model picker screenshot.

## F-D — model selector shows the resolved id

Risk: drift low, gap none, blast the models API and three pickers.
Sonnet. Runs after F-B and F-C edits are in; its files overlap neither.
F-C's investigation, 2026-09-07: /api/library/models (server.py:1446-1449,
engine/providers.py:534-542 ClaudeProvider.list_models) returns rows
whose id is a bare alias from CLAUDE_MODELS (providers.py:77-79).
static/js/widgets/shared/model-picker.js draws the version select as a
dash for an alias row. devagent.js:208-212 modelDisplay() renders the
bare alias. timeline.js:1027 shows raw reg.model. settings-rows.js
modelDisplay() is dead code, leave it.

1. Server, one place: in ClaudeProvider.list_models, each row gains
   `resolved`, the value from CLAUDE_ALIAS_TO_RATE_KEY
   (providers.py:234-237) when the id is an alias, else the id itself.
2. model-picker.js: when a row has `resolved`, the version select shows
   it instead of the dash. Selecting still sends the alias id the row
   already carries; no change to what is saved.
3. devagent.js modelDisplay() and timeline.js:1027: show `resolved` when
   the roster row or the models list has it, else what they show today.
   Grep whether the roster row carries the model id only; if so, look it
   up in the fetched models list the widget already holds.

Harness after restart: devagent settings tab model picker screenshot
shows claude-sonnet-5, not a dash. Timeline lane shows the same for a
sonnet region. A gemma4 region is unchanged.

## After F-B, F-C, F-D

Session agent relays the receipts. S3 runs. Then Gate C.
