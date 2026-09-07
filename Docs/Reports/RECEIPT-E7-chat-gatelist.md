RECEIPT — E7 chat and gate list — Sandbox Suite — Sun Sep 6 18:16:24 EDT 2026 to Sun Sep 6 18:24:17 EDT 2026

EDITS
- [static/js/widgets/shared/turns.js](../../static/js/widgets/shared/turns.js) — new, _groupTurns and _buildTurnBlock plus their private helpers, ported from ade/chat.js
- [static/js/widgets/anchor-chat/anchor-chat.js](../../static/js/widgets/anchor-chat/anchor-chat.js) — new, anchor_chat widget, chat pane only, no gate coupling
- [static/js/widgets/gate-list/gate-list.js](../../static/js/widgets/gate-list/gate-list.js) — new, gate_list widget, ade/chat.js lines 248-444 verbatim plus binding
- [library/registry/widgets.json](../../library/registry/widgets.json) — appended two rows: anchor_chat, gate_list

STRAY FILES
- none created beyond the above and this receipt

GOALS DONE
- Anchor chat widget: makeChatPane's pane logic (script, thinking, fences, busy meters, scroll pin, image intake, mail rendering) ported, gate management removed
- Anchor chat binds to a region via frame.options.region, sends anchor with that track, re-anchors on region_replaced
- Anchor chat Send sends user with text, media, image_paths, inst; Stop sends stop
- Gate list widget: chat.js lines 248-444 (_gateTier through _renderGateListInto) ported unchanged
- Gate list binds to a region the same way, settle sends answer with text y/n/queue and the gate id, matching boot.js's sendGateAnswer/_ALERT_GATE_TEXT
- Shared module static/js/widgets/shared/turns.js holds _groupTurns and _buildTurnBlock for E10/E13
- Two registry rows appended; old chat and mini_queue untouched
- Styles: cp-*, turnblock, msg, bub, code-fence rules copied into anchor-chat's injected style block; pip, gbadge, evrow rules copied into gate-list's; no class renamed
- node --check passed on all three new JS files; widgets.json parses

GOALS NOT DONE
- Focus mirror pane (chat.js lines 892-1055) — not ported, per spec. See BLOCKERS.
- Track selector dropdown, zoom controls, edit-track button, ledger-jump button (old pane-head chrome) — not built. These aren't in the spec's Subscribes/Send/Stop/Settle list or acceptance criteria, and old pane-head chrome (title bar) looks owned by matrix frame chrome (E5), not widget content. Left out to stay inside spec scope.

DECISIONS MADE
- Region binding key: used frame.options.region as the per-instance binding value, read/written through the existing options mechanism (WidgetFrame.options / setOption / onOption) already in widget-frame.js. The spec says "the instance picks a region the way widget-frame.js does for the Phase 2 chat widget" but the Phase 2 chat widget (static/js/widgets/chat/chat.js) is not on my read list, so I did not open it to confirm the exact key name. Options seen: guess a key name from widget-frame.js's generic options system (chosen), or open chat/chat.js to confirm (blocked by read rule). Undo path: rename the "region" key in both widget files' defaults/regionOf functions if the real key differs.
- gate-list also subscribes to region_replaced, though the spec's line for gate list's Subscribes only lists ask, gate_pending, chat_history. Acceptance criteria says "Reset the region. Both widgets follow to the new id," and gate list "Binds to a region the same way" as chat, which does react to region_replaced. Options seen: subscribe and re-bind (chosen), or leave gate list unable to follow a region reset. Undo path: remove 'region_replaced' from gate-list's frame.subscribe array and its onFrame case.
- chat_history is subscribed by both widgets per spec's literal text, but anchor-chat's onFrame case for it is a no-op (gate history now belongs to gate-list only, to keep "no coupling"). Undo path: none needed, it's inert.
- Dropped the makeBusyMeters ownsTitle behavior (document.title mutation) since one instance no longer owns the whole page. Undo path: add an ownsTitle option back if a later wave wants one instance to own the tab title.
- Turn "who" label for the live/rendered agent row: passed empty trackName (no track-name lookup available, since anchor-chat doesn't subscribe to track_list) so _buildTurnBlock falls back to "agent". Undo path: subscribe to track_list and thread a name through if a display name is wanted later.

READS BEYOND THE LIST
- `ls static/js/widgets/` and `ls static/js/widgets/shared/` — ran before writing, to avoid a folder-name collision and to see whether a shared gate-list module already existed. Found static/js/widgets/shared/gate-common.js already present; did not open it (not on my read list, not a grep hit on a symbol I'm changing).

BLOCKERS FOR LATER WAVES
- Follow mode / focus mirror (chat.js lines 892-1055, uses the follow frame and mirror frames): not ported. Whether it becomes an anchor_chat mode or its own widget is Brandon's call. It would need: a follow/mirror frame subscription, a second render target (or a toggle inside anchor-chat's script area), and the renderMirror logic from boot.js (not on my read list, only referenced at line 542-545 of the read range).
- Script load order: static/js/widgets/shared/turns.js must load before static/js/widgets/anchor-chat/anchor-chat.js (it reads MX.turns at mount time). Not my file to fix — whatever assembles the widget script tags (grid.js / the matrix page shell) needs to load shared/ before per-type widget files, or load turns.js unconditionally like widget-frame.js.
- Confirm the real per-instance region-binding option key against static/js/widgets/chat/chat.js (Phase 2 chat), which I could not open. If it uses a different key than "region", anchor-chat.js and gate-list.js's regionOf()/defaults need that key name instead.

PHASE 3 SURFACED
- chat_history's records payload carries no track/region id in the vocabulary I read (boot.js applies it unconditionally to whatever's anchored). With multiple region-bound gate-list widgets sharing one socket, a chat_history frame may not say which region it's for. Not fixed here — old vocabulary stays as it is per the wave-3 brief. Worth a server-side look before E10/E13 build on it.

BRANDON'S TODOS
- none surfaced beyond what's already in Phase 3 scope

CLOSER REVIEW
- Confirm the "region" option key name against the Phase 2 chat widget — Brandon or closer
- Decide follow-mode's home (anchor_chat mode vs its own widget) — Brandon
