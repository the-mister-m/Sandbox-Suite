# HOWTO — ADE frames

Drawn from `handle()` in `ade/frames.py` and the `send_*` methods in
`ade/web_io.py`. Nothing invented.

`inst` is echoed on replies that carry it.

The roster listener in `tracks.py` fires `track_list` after reset and
after region replacement, outside `handle()`.

`change_prompt` is not a `send_*` method — `_send_change_prompt` in
frames.py sends it directly via `webio._send(...)`. Listed in the
server-to-client table anyway since it is a real server-to-client frame.

`send_ledger_detail` is called by the `ledger_detail` frame but is not
defined in `ade/web_io.py` — out of scope for the server-to-client table
below.

## Client to server

| frame | fields read | replies to sender | broadcast to environment | roster fires | parks behind change prompt |
|---|---|---|---|---|---|
| create_track | name, root, overlay/overlay_rows, provider, loop_class, mechanism, model, seat, settings, region, presets | track_created (always, F1 edit); track_transcript, chat_history (via anchor, only if a region was made) | track_list (via roster) | yes | no |
| insert_region | track, region{name,model,wt/root,agent/seat,overlay_rows}, name, model, root, seat, overlay_rows, settings, provider, loop_class, mechanism, node_id, presets | track_created; track_transcript, chat_history (via anchor) — or out + track_list to sender if the track is unknown | track_list (via roster), skipped if reg is None | yes, unless reg is None | no |
| anchor | track | track_transcript, chat_history — or out on unknown track | none | no | no |
| user | track, text, media, image_paths | none in-handler (enqueues the turn; replies stream later, outside handle()) | none | no | no |
| stop | track | none | none | no | no |
| kill_track / close_track | track | none extra (reached via the broadcast) | track_removed, then track_list (roster) | yes | no |
| reset_track | track | out (dim) | none in handle() — tracks.py roster listener fires track_list later | no (in handle()) | no |
| delete_track | track | out + track_list to sender only if nothing removed and nothing doomed (early return) | track_removed per doomed id, then track_list (roster) — skipped on the early-return path | yes, unless early-return | no |
| duplicate_region | region/track, name | track_created; track_transcript, chat_history (via anchor) — or out + track_list if reg is None | track_list (roster), skipped if reg is None | yes, unless reg None | no |
| edit_track_row | track, fields{} | out + track_list if row is None (early return); out if any keys rejected | track_list (roster) | yes, unless row None | no |
| killswitch | (none) | out (stopped count) | none in handle() | no | no |
| answer | track, id, text | none (resolves a gate; outcome streams via later turn frames) | none | no | no |
| ade_plan | plan | out (summary / "nothing to pipe" / "no regions") | track_list (roster), once tracks/regions are built via internal helpers (no track_created frames sent) | yes, unless plan invalid or no rows | no |
| ade_save | plan, name, session_template, template | out (template-save confirmations) | ade_init to environment, only for the plain-name save path | no (ade_init carries it) | no |
| ade_load | sid | none direct; socket rebinds to the loaded environment | ade_init to the (new) environment | no (ade_init carries it) | no |
| ade_new | template | out ("no such template") on failure | ade_init to the new environment, on success | no | no |
| ade_end | plan | none — close_conns() closes every socket on the environment, sender included | none | no | no |
| feed | since, limit | feed | none | no | no |
| ledger_detail | id | ledger_detail (send_ledger_detail not in ade/web_io.py) | none | no | no |
| wp_feed | (none extra) | wp_feed | none | no | no |
| wp_send | to[], body | none direct (lands in the waypoint mailbox) | none in handle() | no | no |
| wp_mute | id, muted | none | none | no | no |
| wp_read | ids[] | none | none | no | no |
| transcript | track | transcript | none | no | no |
| gate_action | action, id | none direct | none in handle() | no | no |
| tree | path, hidden, tag | tree | none | no | no |
| open | path | file | none | no | no |
| save | path, content | saved | tree_dirty, suite-wide, only if ok | no | no |
| delete | path | deleted | tree_dirty, suite-wide | no | no |
| move | src, dst | moved | tree_dirty, suite-wide | no | no |
| rename | src, name | renamed | tree_dirty, suite-wide | no | no |
| mkdir | path | made | tree_dirty, suite-wide | no | no |
| rmdir | path | deleted (shares the delete frame) | tree_dirty, suite-wide | no | no |
| setroot | path | out (status lines) | reload, suite-wide | no | no |
| input | track, shell, data | none (writes to the pty) | none | no | no |
| close_shell | track, shell | none | none | no | no |
| focus / follow | track, inst | out on unknown region; on success, transcript + gatelog via a MirrorView (not a webio.send_* frame), sent on every follow; inst added to the region's follower set | none | no | no |
| unfollow | track, inst | none; inst removed from the follower set, mirror dropped only when the set is empty | none | no | no |
| edit_track | track, fields{name, root, seat, overlay, provider, loop_class, mechanism, ...settings} | out + track_list if track unknown; out if root invalid | change_prompt (F1 edit — now environment-wide) if the edit prompts_on_change; otherwise track_list (roster) | yes, only on the non-prompting path | yes, when `track.prompts_on_change(items)` |
| change_answer | token, choice | out (preset warnings/results); track_list only on cancel or unknown token/choice | track_list (roster) on every resolved choice except cancel | yes, except cancel/unknown-token/unknown-choice | no (resolves a park) |
| load_preset | track, name, mode (F1 edit) | out (bad name; preset warnings on the reset/in_place path) | change_prompt (F1 edit) when mode is not reset/in_place; track_list (roster) when mode is reset/in_place | yes, only on the reset/in_place path | yes, unless mode is "reset" or "in_place" (F1 edit) |
| save_preset | track, name, fields (pending) | out (bad name) | change_prompt (F1 edit) | no (roster comes later, from change_answer) | yes, always |
| rename_preset | old_name, new_name | out | none | no | no |
| delete_preset | name | out | none | no | no |
| roster | (added by S2) | (added by S2) | (added by S2) | (added by S2) | (added by S2) |
| widget_bus | channel, payload, inst | none | widget_bus to environment | no | no |
| (unknown type) | type | out ("unknown frame") | none | no | no |

A second `change_answer` on a taken token prints "unknown token" and
stops — that is fine as-is.

## Server to client

| frame | fields | who sends it (frames.py line or tracks.py listener) |
|---|---|---|
| session_refused | reason | `refuse()`, frames.py:104 — no caller within frames.py itself |
| crew_list | roster, current | `send_crew_list()`, called at server.py:1753, on socket open |
| gate_edges | edges | `send_gate_edges()`, called at server.py:1754, on socket open |
| rail_catalog | catalog | `send_rail_catalog()`, called at server.py:1755, on socket open |
| ade_init | session, tracks, rows, names | `_init()` closure, frames.py:550 — called from ade_save:737, ade_load:744, ade_new:761 |
| track_list | tracks, rows, names | `_roster()` closure, frames.py:545, and direct sender-only calls on early-return paths (delete_track:642, duplicate_region:654, edit_track_row:665, edit_track:1010, change_answer:1056); also `broadcast_roster()`, frames.py:130 — the tracks.py roster listener (outside handle()) uses this after reset and region replacement |
| region_replaced | old_id, new_id | `broadcast_region_replaced()`, frames.py:135 — no caller within frames.py; fired by the tracks.py roster listener after region replacement, outside handle() |
| track_created | track, row | direct sender-only calls: create_track:561, insert_region:574, duplicate_region:657 |
| reload | reason | `broadcast_reload()`, frames.py:111 — called from setroot:979 |
| track_removed | id | `_broadcast(..., "send_track_removed", ...)` at kill_track/close_track:625, delete_track:646 |
| track_transcript | id, messages | `_anchor()`, frames.py:264 — sender-only, on create_track, insert_region, duplicate_region, anchor |
| chat_history | id, records | `_anchor()`, frames.py:265 — same call sites as track_transcript |
| transcript | id, region, inst, messages | transcript frame, frames.py:806 |
| feed | records, inst, totals | feed frame, frames.py:772 |
| widget_bus | channel, payload, inst | `send_widget_bus()`, ade/web_io.py — frames.py handle() widget_bus branch |
| wp_feed | lines, counts | wp_feed frame, frames.py:783 |
| file | path, inst, content | open frame, frames.py:832 |
| tree | data, inst | tree frame, frames.py:815 |
| saved | path, inst, ok, result, content | save frame, frames.py:840 |
| deleted | path, result | delete frame:851, rmdir frame:955 |
| moved | src, dst, result | move frame, frames.py:882 |
| renamed | src, dst, result | rename frame, frames.py:908 |
| made | path, result | mkdir frame, frames.py:927 |
| feed_dirty | stores | `_fire_dirty()`, frames.py:177, timer-armed by `mark_dirty()` — mark_dirty has no caller within frames.py itself; out of scope |
| activity | event | `broadcast_human_mail()`, frames.py:140 — no caller within frames.py; out of scope |
| tree_dirty | track (id or "*") | `_broadcast_all("send_tree_dirty", ...)` at save:842, delete:852, move:883, rename:909, mkdir:928, rmdir:956 |
| track_status | track, phase | `broadcast_track_status()`, frames.py:120 — set as the status listener at server.py:362 |
| context_warn | track, peak, cap | `broadcast_context_warn()`, frames.py:125 — called from ade/tracks.py:827 |
| gate_broadcast | kind, id, prompt, track, track_name | `broadcast_gate()`, frames.py:115 — called from `_gate_notifier()` at server.py:200 |
| change_prompt | token, region, action, edits, choices, text | `_send_change_prompt()`, frames.py:355 (F1 edit) — called from edit_track:1040, load_preset:1091, save_preset:1105; not a `send_*` web_io.py method, sends via `webio._send()` |

## Server to client, engine senders

Drawn from `engine/web_io.py` (the `WebIO` class) and `MirrorView` in
`ade/tracks.py`.

| frame | fields | sender line |
|---|---|---|
| out | text, dim, end | `WebIO.out()`, engine/web_io.py:26 |
| ask | prompt, id, region | `WebIO.ask()`, engine/web_io.py:50; also `_advance_locked()`, engine/web_io.py:97 |
| gate_pending | pending, active | `WebIO._push_pending_locked()`, engine/web_io.py:145 |
| activity | event | `WebIO.event()`, engine/web_io.py:148 |
| meters | meters | `WebIO.meters()`, engine/web_io.py:159 |
| term | data, shell, region | `WebIO.term()`, engine/web_io.py:164 |
| speak | text, voice | `WebIO.speak()`, engine/web_io.py:172 |
| audio | data, mime | `WebIO.speak()`, engine/web_io.py:179 |
| status | phase | `WebIO.status()`, engine/web_io.py:184 |
| models | list, rows, current | `WebIO.send_models()`, engine/web_io.py:190 |
| ledger_detail | detail, inst | `WebIO.send_ledger_detail()`, engine/web_io.py:219 |
| mirror | track, kind, ...payload | `MirrorView._tag()`, ade/tracks.py:154 |
