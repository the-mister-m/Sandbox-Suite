# PHASE 3 — ADE MAP

Written by: Goto (Sonnet), Phase 3. Date: 2026-09-05.
Files touched (read/grepped, not edited): static/ade.html, static/ade-ledger.html,
static/ade-arrange.html, static/ade-retired.html, static/js/ade/*.js,
static/css/ade.css (not read), shells/ade/*.py, server.py (ADE portions),
hooks/ade_pretooluse_hook.py, engine/providers.py (hook registration only),
engine/policy.py / engine/claude_sdk.py (edge lookups only).

Timeline widget recon (timeline.js, and the remaining half of boot.js's frame
router past the parts logged here) was not completed this pass — its
sub-agent did not return before this map was written. Those gaps sit in
UNKNOWNS (§14), not guessed.

---

## 1. ADE PAGE AND BOOT

**Grid regions** (static/ade.html): `#shell` (29) > `#topbar` (32, with
`#adeModalToggle`/`#adePopPos`/`#adePopDismiss`/`#btnMuFull`/`#btnWin3`/
`#btnPanic`) > `#sessionBar` (85, `#agentStrip`, `#btnRetiredChats`,
`#btnAdeSave`/`#btnAdeLoad`/`#btnAdeNew`/`#btnAdeEnd`) > `#panes` (101) >
`#leftcol` (104: `#anchorPane` with `#anchorAgentChip`/`#anchorSel`/
`#anchorBody`/`#anchorInput`/`#anchorSend`/`#anchorStop`, `#splitLeft`,
`#glPane` with `#glTrackName`/`#btnAnchorLedger`/`#glList`), `#splitCol`,
`#rightcol` (177: `#arrange` > `#viewTabs` + `#arrangeBody` holding
`#view-timeline`/`#view-arrange`/`#view-queue`/`#view-changes`/`#view-ledger`/
`#view-messenger`, `#splitRow`, `#bottomrow` with `#multiuse`
(`#muTabs`/`#btnMuExpand`/`#muBody` > `#mvFiles`/`#splitMu1`/`#mvEditor`/
`#splitMu2`/`#mvTerm`), `#splitBot`, `#focus` with `#focusAgentChip`/
`#focusSel`/`#focusName`). `#peek` and `#modal` exist per the file's own
header comment; `#alert` is the gate/mail overlay placed by `placeAlert()`.
Entry script: `<script type="module" src="/static/js/ade/boot.js">`
(ade.html:402).

**App-state object `S`** (boot.js:69-115): `session`, `tracks` (region rows),
`names` (id to display name, merged not replaced), `trackRows` (container
rows), `anchored`, `focus`, `switchPending` (boot.js:92, drops in-flight
frames from a track being switched away from mid-anchor), `view`, `muCols`
(`{files, editor, term}`), `models`, `curModel`, `crew`, `edges` (gate edge
list), `rails` (rail catalog). `switchPending` is not in the 2026-08-20
mapdoc pass — new field.

**Socket**: `connect()` (boot.js:127) opens `new WebSocket(`${proto}://
${location.host}/ws/ade`)` (boot.js:129). `onopen` (131), `onmessage` (149,
parses JSON and calls `route(m)`), `onclose` (147, reconnects via
`setTimeout(connect, 1200)`), `onerror` (148, closes the socket).

**Frame router `route(m)`** (boot.js:756-1129+): a switch on `m.type`.
Case order as found: `ade_init`, `track_list`, `track_created`, `reload`,
`track_removed`, `region_replaced`, `track_transcript`, `chat_history`,
`out`, `models`, `crew_list`, `gate_edges`, `rail_catalog`, `tree`, `file`,
`saved`, `deleted`, `moved`, `term`, `renamed`, `made`, `mirror`, `activity`,
`feed_dirty`, `tree_dirty`, `feed`, `ledger_detail`, `wp_feed`, `transcript`,
`status`, `track_status`, `context_warn`, `meters`, then (past boot.js:1135)
`ask`/`gate_pending`, `gate_broadcast`. Fan-out to views for `feed` and the
roster frames is in the sub-agent report not yet folded into a verified
line-by-line list — see UNKNOWNS.

**viewCtx** (boot.js:2065+): `send`, `getTracks: () => S.tracks`, `nameOf`,
`isGone`, `getTrackRows: () => S.trackRows`, `getSession: () => S.session`,
`setFocus`, `editTrack(track)` (opens `openTrackMenu({mode:'edit',...})`,
refreshes timeline on a real save), `addTrack()` (mode `'addTrack'`),
`addRegion(trackId)` (mode `'add'`, filters `S.trackRows` against tracks
already used via `S.tracks.map(r => r.track)` so a track with a region isn't
offered twice; optional `trackId` pre-selects the target), `getAnchored:
() => S.anchored`, plus the shared modal (`showModal`/`showConfirm`/
`showPrompt`, handed down per the file's own "V2ADE-MAP §K law" comment).

**View tab switching**: `setView(v)` (boot.js:1613), `wireTabs()`
(boot.js:1627).

**Splitters**: `wireSplitters()` (boot.js:1379). Applies any persisted split
size from `SPLIT` config (boot.js:1356) before first paint, then attaches
`mousedown` drag handlers to every `.split[data-split]` element; computes a
px value along the configured axis, clamps to `cfg.min`/`cfg.max`/
`cfg.minOther`, writes it to a CSS custom property on `cfg.host()`. Elements
with `data-musplit` instead of `data-split` (`#splitMu1`/`#splitMu2`) are
explicitly skipped here — a separate `wireMuSplitters()` owns those (moves a
pair of flex ratios, not one px value).

**Modal**: `showModal(title, bodyHTML, buttons)` (boot.js:1648),
`showConfirm(prompt, onYes, onNo)` (boot.js:1672), `showPrompt(message,
defaultValue, onOk)` (boot.js:1690). `wireAdeModalKnobs()` (boot.js:612)
wires the topbar's modal-mode/pop-position/pop-dismiss buttons.

**Alert overlay**: `placeAlert(mode)` (boot.js:280, called at boot.js:299
and boot.js:2039 with `modalModeFor('ade')`) scopes `#alert` per the
four modes (full/window/corner/off per ade.html:327-330 comment). Triggered
by `ask`/`gate_pending` (case at boot.js:1146ish) and `gate_broadcast`
(boot.js:1174ish, "before the alert surface" per the fan-out order for
`agentStrip`).

**Session save/load/new/end senders** (boot.js:185-201):
- `sendAdeSave(name, asTemplate)` sends `{type:'ade_save', name, template:
  !!asTemplate, plan: arrangePlan()}` — carries the arrange plan.
- `sendAdeLoad(sid)` sends `{type:'ade_load', sid}`.
- `sendAdeNew(templateId)` sends `{type:'ade_new', template: templateId ||
  ''}` — empty string is a blank scratch session; a template id seeds the
  roster from that template under a fresh unsaved session id.
- `sendAdeEnd()` sends `{type:'ade_end', plan: arrangePlan()}`.

---

## 2. TIMELINE VIEW — UNKNOWN, not completed this pass

The sub-agent assigned to timeline.js did not return before this map was
written, per instruction to write now rather than wait. DOM structure, row
construction, region-span placement math, action-pip matching, feed
record-kind/key reads, toggle behavior, auto-refresh, click targets, and the
add-phase toggle's current wiring are all UNKNOWN — see §14. The 2026-08-20
mapdoc's claims (timeline.js was 1051 lines; now 1736, so roughly 700 lines
were added since that pass and are entirely unverified against current code)
are NOT restated here as current fact.

What IS confirmed from other agents' work, not timeline.js's own agent:
- `queuelog.js` exports `settle`, `rowsForRegion`, `pendingByRegion`
  (queuelog.js:404-437) and timeline.js is reported (by the chat.js/agent
  strip recon) to import `settle` (cited there as timeline.js:36) and call
  it from buttons at timeline.js:880-882 and timeline.js:1123 — two line
  numbers for the same import that were not reconciled against each other
  by any agent. Flagged, not resolved.
- `deriveCables`/`cables.js` and `region.js` do not depend on timeline.js.

---

## 3. ARRANGE VIEW

**DOM at mount**: `mount(elHost, ctx)` (arrange.js:1485) sets
`_host.innerHTML = HOST_HTML` (arrange.js:1487) and resolves `#ar-world`,
`#ar-cwrap`, `#ar-svg`, `#ar-cablesG`, `#ar-ghost`, `#ar-rail`, `#ar-toast`,
`#ar-cabends`, `#ar-ctxmenu` (arrange.js:1488-1489). `HOST_HTML`
(arrange.js:1362-1447): `#ar-shell` > `#ar-topbar` (`#ar-popout`,
`#ar-btnCopy`, `#ar-btnShow`), `#ar-main` > `#ar-rail` / `#ar-railsplit` /
`#ar-cwrap` > `#ar-world` > `#ar-svg` (`#ar-cablesG`, `#ar-ghost`) +
`#ar-cabends` (arrange.js:1394) + `#ar-cbmenu`. Outside the shell:
`#ar-jsonwrap`/`#ar-jsonbox`/`#ar-jsonta` (arrange.js:1447-1456),
`#ar-ex`/`#ar-exPanel` (arrange.js:1458-1470), `#ar-zoomctl`, `#ar-toast`,
`#ar-ctxmenu` (arrange.js:1472-1481).

**Plan storage**: localStorage key `arrangeMockD2` (arrange.js:57). Read at
arrange.js:1288; written by `save()` (arrange.js:62, strips `_`-prefixed
keys first). Plan shape: `{id, name, extract, selPhase, phases:[...]}`
(`buildSeed`, arrange.js:1355-1358). One phase: `{id, name, files:[],
active, loops:[], nodes:[], cables:[]}` (arrange.js:1357). A node is a
`region.js` `blankRegion()` object: `id, x, y, name, model, notes, status,
stxt, wt, track, notches:[], detail:{agent}` (region.js:103-116); a node
bound to a live region additionally carries `regnode_id`/`_rail`
(arrange.js:1613-1614); `_w`/`_h` are stripped before save. A cable:
`{id, a:{n,t}, b:{n,t}}` (pushed at arrange.js:882, read by
`drawCables`/`deleteSelectedNode`/`deleteSelectedCable`, arrange.js:994-1007).
Node `x`/`y` are written at arrange.js:948, 961, 1622, 1688 and by drag
(arrange.js:826); read by `layoutNotches`, `cablePath`, `fitAll`
(arrange.js:1075-1082).

**Node lifecycle**: create via double-click (arrange.js:937-949, pushes
`blankRegion(uid(), {x,y})`) or the "+ add node" context-menu item
(arrange.js:965-969); also via `insertRegion()` (arrange.js:1684). Move:
`nodeDown` (arrange.js:818-834). Edit: `openExpand`/`closeExpand`
(arrange.js:1116-1129, writes `n.notes`/`n.wt`/`n.detail[f]`). Delete:
`deleteSelectedNode` (arrange.js:998-1006, refuses on a live node with a
toast at arrange.js:1000-1001), the Delete key (arrange.js:1052-1058), the
node context menu (arrange.js:1102-1113). Cables created/deleted via
`notchDown` (arrange.js:837-883) and `deleteSelectedCable`
(arrange.js:994-996).

**Roster adoption**: `onFrame` (arrange.js:1649-1666) handles `ade_init`/
`track_list` (calls `adoptRegions(m.tracks, true)`) and `track_created`
(calls `adoptRegions([m.track], false)`). `adoptRegions`
(arrange.js:1589-1638): if an incoming region's `node_id` matches an
authored node id (map built at arrange.js:1592), that node is stamped
`regnode_id = r.id` and `_rail` (arrange.js:1613-1614) and any live ghost for
it is removed (arrange.js:1615-1616). Otherwise a "live" node is manufactured
— `blankRegion(uid(), {x,y})` with `_live: true`, `regnode_id: r.id`,
`status: 'idle'`, pushed into `ph._live` (arrange.js:1618-1627), positioned
at `LIVE_X0 + elapsed-minutes * PX_PER_MIN` with lane assigned by index.
`ph._live` is never persisted (arrange.js:1539). A `prune: true` pass drops
stale `_live` nodes and clears stale `regnode_id` values (arrange.js:1630-1634).

**Cable derivation** (`deriveCables`, cables.js:160-221): input is
`(records, opts)` where `opts.roots` maps region id to root path,
`opts.nodes` is declared but arrange.js never actually uses it, and
`opts.home` is never passed by arrange.js. `isFiredFileAction`
(cables.js:120-127) keeps records where `action_type` is `write`/`read`,
`outcome==='fired'`, `failed !== true`, `payload.target` is a string, and
`region` is set; records are sorted oldest-first (cables.js:169-170). A
`write` is keyed by `resolveTarget(payload.target, base, home)`
(cables.js:176-184, a hand transliteration of `engine/read_tool.py`'s
`_resolve`, cables.js:90-99); a `read` of the same key joins every earlier
write from a DIFFERENT region (cables.js:191-192), one cable per
`(from, to)` pair (cables.js:195-217). Output shape: `{id, from, to,
fromNode, toNode, paths, count, at, edges:[{write, read, path}]}`
(cables.js:145-146, 197-208). Called from `derivedCables()`
(arrange.js:518-527, passes `{roots: _regionRoots}`) inside `drawCables()`
(arrange.js:559-571, called arrange.js:562; `#ar-cablesG` innerHTML rebuilt
at arrange.js:609) — computed at draw time, not stored on the plan.
Authored cables in `ph.cables` ARE persisted (this is a separate, node-notch
authored cable, not the derived write/read kind).

**Pop-out window** (arrangewin.js, 59 lines): the sole script of
static/ade-arrange.html. Imports `mount`, `refresh`, `onEsc` from arrange.js
(arrangewin.js:28); mounts into `#view-arrange` (arrangewin.js:45-46); shares
`localStorage['arrangeMockD2']` with the main tab, same origin
(arrangewin.js:9-11). No socket: `send: () => {}` (arrangewin.js:32) — the
file's own comment says piping a plan into real tracks is a main-tab-only
act; the pipe button in the pop-out toasts and drops the action.
`getTracks: () => []`, `getSession: () => null` (arrangewin.js:33-34).
`showConfirm`/`showPrompt` fall back to native `window.confirm`/`window.prompt`
(arrangewin.js:35-42).

**currentPlan / syncSessionPlan**: `currentPlan()` (arrange.js:1141-1144)
returns a deep clone of the plan with `_`-prefixed keys stripped, or null.
`syncSessionPlan(serverPlan)` (arrange.js:1340-1358) clears undo/redo and
selection, migrates the incoming plan if it has `phases` or else seeds a
blank scratch plan, schedules a save, and re-renders. boot.js imports these
as `onEscArrange`, `arrangePlan`, `syncArrangePlan` (boot.js:39-40, per the
arrange.js:19/1324-1327 header comment); boot.js calls `syncSessionPlan`
with `session.plan` on every `ade_init`, and reads `currentPlan()` for the
`ade_save`/`ade_end` senders shown in §1.

**Server-side `ade_plan`** (shells/ade/frames.py:1247-1296): validates the
incoming plan is a dict (frames.py:1268-1270), calls `tracks.set_plan(plan)`
(frames.py:1271), then `_plan_rows(plan)` (frames.py:835-880, uses only the
selected phase via `plan.selPhase`, groups nodes by a trimmed `track`
field). For each row it calls `_do_create_track({"name"})`
(frames.py:1276, def at frames.py:420); for each node it calls
`_do_insert_region({"track", "region": _plan_region(node)})`
(frames.py:1279-1280, def at frames.py:710; `_plan_region` at
frames.py:815-831 uses `_PLAN_NODE_FIELDS`/`_PLAN_DETAIL_FIELDS`, excluding
`x`/`y`/`notches`/`track`), then stamps `reg.node_id = node.id`
(frames.py:1285-1290). One `_broadcast("send_track_list")` fires at the end
(frames.py:1291). This handler starts nothing — no track is nudged or run.

**JSON export**: `#ar-jsonwrap` overlay (arrange.js:1447-1456,
`#ar-jsonta`). `showJSON()` (arrange.js:1190-1191) fills it from
`planJSON()` (arrange.js:1145-1146); `#ar-btnShow` opens it
(arrange.js:1212); `#ar-btnCopy` copies `planJSON()` with a `copyText`
fallback (arrange.js:1188-1189, 1211); closed via `#ar-jbClose` or the
backdrop (arrange.js:1212-1214).

---

## 4. TRACK MENU (tracksettings.js, 2975 lines)

**Entry point**: `openTrackMenu({mode, track, targetTrack, models, crew,
edges, rails, tracks, send})` (tracksettings.js:458). `commit()`
(tracksettings.js:2856-2949) branches on mode:
- `'addTrack'` — sends `create_track` with `name`/`provider`/`loop_class`/
  `mechanism`; deletes `frame.model`/`frame.seat`/`frame.settings` before
  sending (tracksettings.js:2879-2886).
- `'add'` — requires the track picker dropdown (tracksettings.js:548-577);
  sends `insert_region` at `track: trackSel.value`
  (tracksettings.js:2892-2901); on success calls `insertRegion(region)`
  which stamps `frame.node_id` (tracksettings.js:2938-2946).
- `'edit'` — sends `edit_track` carrying only dirty fields (`fieldsOut`),
  no-ops if nothing changed (tracksettings.js:2863-2867); the only mode
  with rename / close-shell / kill-track buttons (tracksettings.js:2801,
  2817).

**Modal DOM sections** (built via `makeSection`, tracksettings.js:591-611),
in order: a `'track'` picker (add mode only, tracksettings.js:550);
PRESETS (`secPresets`, tracksettings.js:619); IDENTITY (`secIdentity`,
tracksettings.js:620 — rows: name 670, provider 735, loop class 744, model
758, crew seat 871, root 935); SESSION (`secSession`, tracksettings.js:621);
CONTEXT STACK (`secContext`, tracksettings.js:622); an unlabeled TOOLS
section (`secTools`, tracksettings.js:623) with sub-groups for claude tools
(tracksettings.js:2232), region reset (tracksettings.js:2465), and gate
overlay (tracksettings.js:2609); RESOLVED STACK (`secResolved`,
tracksettings.js:624). Ad-hoc inline labels "carries into the overlay" /
"dropped — no sandbox field" appear at tracksettings.js:1820, 1829.

**Reads from server** (routes/frames, not payload content):
`GET /api/settings/browse` (924), `GET /api/fs/browse?path`
(989, 1276, 1348), `GET /api/fs/read?path` (1329),
`GET /api/claude/output-styles` (1663), `GET /api/claude/md-files?root`
(1733), `GET /api/settings/read?path` (1810), `GET /api/settings/browse?path`
(1855), `GET /api/settings/browse?presets=claude` (2021),
`GET /api/settings/resolved?track` (2402). Frames: `load_preset` (2062),
`save_preset` (2095, 2116), `rename_preset` (2140), `delete_preset` (2148).

**Frames emitted and payload keys, per mode**:
- `create_track`: `{type, name, provider, loop_class, mechanism, ...ident,
  [overlay]}`.
- `insert_region`: `{type, track, name, model, provider, loop_class,
  mechanism, ...ident, [settings], [presets], [overlay], [node_id]}`
  (tracksettings.js:2892-2946).
- `edit_track`: `{type, track: t.id, fields: fieldsOut}`
  (tracksettings.js:2864-2867).

**Compat path**: the single-frame `create_track` that also carries region
content is NOT sent by the current client — `'addTrack'` strips `model`/
`seat`/`settings` before sending (tracksettings.js:2873-2886), and `'add'`
always sends a separate `insert_region` (tracksettings.js:2892-2901). One
`send(frame)` call site total (tracksettings.js:2950).

**arrange.js call**: `import { insertRegion } from './arrange.js'`
(tracksettings.js:57), called in the `'add'` branch
(tracksettings.js:2943-2946) with `region {name, model}`
(tracksettings.js:2933-2934).

**New since the 2026-08-20 mapdoc pass** (dated comments 2026-08-21 through
2026-08-24 at tracksettings.js:73, 93, 877, 559, 2444, 2455, 2480): a REGION
RESET block sitting after the gate-overlay section — `allow_agent_reset`
checkbox (tracksettings.js:2461-2472), `context_reset_cap_k` numeric field
(thousands, default 300, tracksettings.js:2480-2536), `start_turn_on_reset`
checkbox (tracksettings.js:2538-2551), and a "on reset, say" textarea
(`resetNoteTa`, tracksettings.js:2554+). None of this existed in the older
pass at 2857 lines.

---

## 5. REGION SHAPE (region.js, 116 lines)

`REGION_STATUS` (region.js:41): `['blank', 'idle', 'thinking', 'working',
'complete']` — the face-light cycle order; arrange.js's node face steps this
list on click, tracksettings.js's status `<select>` renders the same array.

`REGION_FIELDS` (region.js:62-75), each `{key, in, label, type, [placeholder],
[hint]}`:

| key | in | label | type | meaning |
|---|---|---|---|---|
| agent | detail | agent | area | the region's agent/system-prompt text, in the `detail{}` bag |
| track | node | track | text | which row this region sits on; blank = its own row; regions sharing a track name land on one track when the plan pipes |
| wt | node | worktree / branch | text | where this region works; blank = wherever the plan is |
| notes | node | notes | area | free text |
| status | node | status | status | the face light; blank = nothing has run yet |
| stxt | node | status text | text | the line beside the status dot |

`x`/`y`/`notches` are canvas-only facts, never in `REGION_FIELDS`. `id` is
minted by whoever inserts the region (arrange.js's `uid()`), never typed.
`name`/`model` are region fields but are deliberately excluded from
`REGION_FIELDS` too — the add-region window already draws them as identity
inputs.

`blankRegion(id, canvas)` (region.js:103-116): returns `{id}`; if `canvas`
is given, adds `x`/`y` from it and an empty `notches: []`; always sets
`name: ''`, `model: ''`, `notes: ''`, `status: 'blank'`, `stxt: ''`,
`wt: ''`, `track: ''`, `detail: {agent: ''}`.

`regionGet(region, field)` / `regionSet(region, field, value)`
(region.js:81-93): branch on `field.in === 'detail'` to read/write
`region.detail[field.key]`, else `region[field.key]` directly.

---

## 6. THE OTHER VIEWS

| view (file) | source frame | kept fields / filter | frames sent | pop-out |
|---|---|---|---|---|
| Messenger (messenger.js) | `wp_feed` reply → `LINES`/`COUNTS` (messenger.js:359-367) | groups lines into cards by `from+to` id-set (`setOf`/`keyOf`/`buildCards`, messenger.js:100-113); `armedView` hides cards for a view-off track id or Captain/harness idents per meta-chip toggles (messenger.js:179-183) | `wp_feed` (361); `wp_read {ids}` (220-223); `wp_mute {id, muted}` (314-318); `wp_send {to, body}` (335-345) | none |
| Changes (changes.js) | `feed` reply → `_records` (changes.js:281-296); `ledger_detail` reply for blobs (307-311) | `kind==='action'` only, drops `gate && merged` (295-297); `reduceEvents` sorts into `write`/`pending`/`human` rows (changes.js:173-196) | `feed` (282); `ledger_detail {id}` (318-322) | calls `openLedgerWindow({track, turn})` from the diff-head button (475) and a diff-line click (484); button text "open in queue/log →" (472-473) actually opens the Ledger pop-out |
| Queue/Log (queuelog.js) | `feed` reply → `_records` (355-356); `ledger_detail` (380-384) | `kind==='action'` (356); render drops `gate && merged` and filters by the active track chip (710-713) | `feed` (347); `ledger_detail {id}` (445-449); `gate_action {action, id}` via `settle` (615-621); `edit_track {track, fields:{claude_cache_ttl}}` (181); `edit_track {fields:{claude_exclude_dynamic}}` (228) | none — exports `rowsForRegion`/`pendingByRegion`/`settle` (404-437) for other modules |
| Ledger (ledgerview.js) | `feed` reply → `_records`, `_totals` (ledgerview.js:456-459); `transcript` reply → `_transcripts[track]` (460-462) | `reduceActions` keeps action records, drops merged gates (169-174); `allTurns` keeps turn records (176); per-turn actions joined by a `(region, turn)` string match (213-231) | `feed` (446); `transcript {track}` (1030-1033) | owns `openLedgerWindow(filter)` (486-496), opening `/ade/ledger` in a new window — every other view's "ledger" link calls this one function |

**isPending / gateColor / isFailedWrite drift** (byte-comparable):
- `queuelog.js:286` `isPending`: true when `outcome` is null/undefined.
  `queuelog.js:287-302` `gateColor`: `user_action` → white; `hook==null` →
  white; `outcome==='parked'` → white; `outcome==='killed'||'timeout'` →
  white; `outcome==='locked'` → red; `isPending` → yellow; `answer===false`
  → red; `hook==='open'` → green; else blue. `queuelog.js:312-316`
  `isFailedWrite`: `r.failed` true, `action_type!=='write'` → false, or
  summary matches `/^\[WRITE/`.
- `ledgerview.js:130` (isPending) and `ledgerview.js:131-143`/`146-150`
  (gateColor/isFailedWrite) are identical to queuelog.js's.
- `changes.js:69` `isPending` is identical. `changes.js:70-78` `gateColor`
  is MISSING the `parked` branch and the `killed`/`timeout` branch that
  queuelog.js:290-296 carries — an observed drift, not a byte-identical
  copy, though the file's own comment (changes.js:68) claims it is
  byte-identical and cites stale line numbers ("queuelog.js:78-87").
  `changes.js:82-86` `isFailedWrite` is identical to queuelog.js's.
- `timeline.js:36` imports `settle` from queuelog.js (its own
  `isPending`/`gateColor` copy was not verified this pass — see §14).

**static/ade-ledger.html title mismatch, still present**: title
"Queue/Log — ADE" (static/ade-ledger.html:5), `<span class="wtitle">Queue/Log
</span>` (static/ade-ledger.html:30). `ledgerwin.js:16` imports `mount`/
`onFrame`/`refresh` from `./ledgerview.js` (the Ledger view, not Queue/Log) —
same mismatch the 2026-08-20 pass recorded, not fixed.

**Transcripts**: no dedicated `transcriptview.js` file was located by any
sub-agent's grep; `transcript` frames are consumed by `ledgerview.js`
(`mountTranscript`) and separately by `retiredwin.js` (§ below) via a
different, REST, path. `viewCtx.getAnchored` (boot.js, §1) carries a
2026-07-23 comment naming a "transcriptview.js" default-pick behavior that
was not traced to a file this pass — see §14.

**retiredwin.js** (163 lines, not in the 2026-08-20 mapdoc pass): its own
boot for the Retired Chats window, mounted by static/ade-retired.html. No
socket. Fetches `GET /api/retired-chats` (retiredwin.js:122) and
`GET /api/retired-chats/<sid>/<rid>` (retiredwin.js:139) — server routes at
server.py:2055 and server.py:2104, page route server.py:1036-1039. Imports
`_groupTurns`/`_buildTurnBlock` directly from chat.js (retiredwin.js:17).
No exports. Wires `#rtList`/`#rtRefresh`, loads via `load()`
(retiredwin.js:161-163). Live, referenced from ade.html's
`#btnRetiredChats` (ade.html:91).

---

## 7. AGENT STRIP AND CHAT PANES

**agentstrip.js** (458 lines):
- Inputs: `ctx.getTracks()` (agentstrip.js:370-373); imports
  `rowsForRegion`, `pendingByRegion`, and `settle` (aliased `settleGate`)
  from queuelog.js (agentstrip.js:51). `onFrame` (agentstrip.js:401-450)
  handles `track_status`, `gate_broadcast` (into `_liveGates`),
  `context_warn` (`_ctxWarn[track] = {peak, cap}`), and `feed` (calls
  `pendingByRegion` at agentstrip.js:445).
- Outputs: one `.ag-chip` per live agent (`buildChip`,
  agentstrip.js:145-211) in idle/busy/queue states plus an `ag-ctxwarn`
  class; a popover (`.ag-pop`, `renderPopoverBody`, agentstrip.js:320-365)
  with approve/deny/queue buttons that call `settleGate` sending
  `gate_action` (agentstrip.js:355-364); a stop button (✕) sending
  `{type:'stop', track:id}` (agentstrip.js:205-210).
- `mountPaneChip` (agentstrip.js:387-391) is called from boot.js
  (boot.js:2174-2175) for the anchor chip (`() => S.anchored`) and the
  focus chip (`() => S.focus`).

**chat.js** (1675 lines, Law 4 — "one module, two instances"):
- `makeChatPane(els, send, opts)` (chat.js:1118; contract at
  chat.js:1061-1080: `els = {scriptEl, gateListEl, inputEl, sendBtn,
  nameEl}`; returns `{setTrack, renderTranscript, appendOut, renderGate,
  clear, renderGateHistory, ...}`). Three call sites: boot.js:1965 for the
  anchor pane (`{ownsTitle:true, onSettle: sendGateAnswer}`);
  ledgerview.js:1046 for `mountTranscript` (read-only, third consumer); the
  focus pane does NOT get a second `makeChatPane` instance (boot.js:1976
  comment) — it is driven entirely through `renderMirror`. `retiredwin.js`
  imports `_groupTurns`/`_buildTurnBlock` directly (chat.js internals,
  retiredwin.js:17) rather than going through `makeChatPane`.
- `renderMirror(m)` (chat.js:1549, called boot.js:977). `mirrorAttach`
  (aliased `_mirrorReset(trackId)`, chat.js:1494, called boot.js:1270).
  `mirrorDetach` (chat.js:1479, called boot.js:1269). `appendMirrorEcho`
  (chat.js:1505, called boot.js:1340, right before sending
  `{type:'user', track}`).
- Gate list inside the pane: `_renderGateListInto(gateListEl, gates,
  onRowClick, onSettle)` (chat.js:639). `renderGateHistory`
  (chat.js:1258) reseeds history rows with `{hist:true}` then calls
  `_renderGateList`; called from boot.js:923. States rendered: active,
  pending (badge ASK/QUEUED, yellow), settled-approved (blue),
  settled-denied (red), and read-only history rows.
- **Gate answer vocabulary, every call site found**:
  - `queuelog.js:617` `settle` → `{type:'gate_action', action:
    'approve'|'deny'|'queue', id}` (buttons at queuelog.js:596-598).
  - the same imported `settle`, called from timeline.js at two cited line
    numbers (timeline.js:880-882 and timeline.js:1123 — not reconciled,
    see §13) and from agentstrip.js:356-363.
  - `boot.js:571-573`/`592-600` `answerAdeCornerPop` → `gate_action`
    approve/deny/queue.
  - `boot.js:483-485`/`513` `answerForeignGate` → `gate_action`.
  - `boot.js:439-441`/`405-409` `answerAlertGate` → `{type:'answer', text:
    _ALERT_GATE_TEXT[action] || 'n', id}`, where `_ALERT_GATE_TEXT =
    {approve:'y', deny:'n', queue:'queue'}` (boot.js:389).
  - `boot.js:405-409` `sendGateAnswer`, used by chat.js's inline settle
    buttons (chat.js:734, 1520-1544, wired at boot.js:1971 and 1982) →
    `{type:'answer', text: 'y'|'n'|'queue'}`.
  - Net: two distinct wire vocabularies coexist for the same
    approve/deny/queue action — `gate_action` with
    `action:'approve'|'deny'|'queue'` on one set of call sites, and
    `answer` with `text:'y'|'n'|'queue'` on another (boot.js's own comment
    at boot.js:352-389 names this split). Button labels read
    approve/deny/queue everywhere regardless of which wire form the click
    sends.

---

## 8. MULTI-USE COLUMN

**multiuse.js** (133 lines) imports `filesPane` from `../panes/browser.js`,
`terminalPane` from `../panes/terminal.js`, `editorPane` from
`../panes/editor.js` (multiuse.js:38-40) — the file's own comment marks this
as the one allowed crossing into Lane 4's panes (not read past the import
line itself, per blackout).

`routeMultiUseFrame(m)` (multiuse.js:51-82): `tree` → `editorPane.onFrame`
if `m.data.tag === 'esave'` else `filesPane.onFrame`; `deleted`/`moved`/
`renamed`/`made` → `filesPane.onFrame`; `file` → `editorPane.onFrame`;
`saved` → both `editorPane.onFrame` and `filesPane.onFrame`; `term` →
`terminalPane.onFrame`; default → no-op.

`mountMultiUse(els, ctx)` (multiuse.js:99-128) mounts all three panes into
`{filesEl, termEl, editorEl}` (`#mvFiles`/`#mvTerm`/`#mvEditor`), each
mount wrapped in its own try/catch so one pane's failure does not break the
others; calls `terminalPane.show()` and `editorPane.show()` immediately
after mount (comment explains Monaco needs an attached node at create time,
unlike the IDE's shell.js which detaches hidden cells).

Root scoping per anchored track is NOT implemented inside multiuse.js — no
per-track scoping code was found there. It lives server-side (`setroot`
frame, referenced in shells/ade/frames.py) and in whatever ctx boot.js
passes down; not traced further this pass (blackout on engine/ boot.js
internals beyond confirming call targets).

`syncMuColumns` is NOT in multiuse.js — it is a boot.js function
(comment boot.js:1486, definition boot.js:1494, called boot.js:1640 and
boot.js:2053). This corrects the primer's phrasing, which grouped it under
"multiuse.js" in the assignment brief; the code places it in boot.js.

---

## 9. SERVER SIDE, shells/ade/

Current file sizes: tracks.py 3665 lines, frames.py 2025 lines, web_io.py
461 lines, rails.py 562 lines, `__init__.py` 6 lines — all larger than the
2026-08-20 pass recorded (tracks.py was 2928, frames.py 1619, web_io.py 400).

**Track** (tracks.py:547-628, `__init__` tracks.py:573-596): fields `id`,
`name`, `regions` (ordered region-id list), `root`, `overlay_rows`,
`provider`, `loop_class`, `mechanism`, `created`. `INHERITABLE =
("root","overlay_rows","provider","loop_class","mechanism")`
(tracks.py:571).

**Region** (tracks.py:628-1679, `kill()` at tracks.py:1679-1690): fields
`id`, `name`, `model`, `seat`, `root`, `overlay_rows`, `hub` (a TrackHub),
`track`, `node_id`, `carried` (a 7-key dict via `_carried()`), `muted`,
`provider`/`loop_class`/`mechanism` (via `rails.normalize`), `sess` (an
`al.Session` carrying `settings["model"]`, `nick`, `stop_key_watch`,
`stop_label`, `root`, `policy_overlay`, `region`, `track`, `turn`,
`region_name`, `messages`), `inbox`, `outbox`, `_inbox_lock`,
`_turn_ordinal`, `_pumping`, `_killed`, `_reset_armed`, `_shell`
(`{"master":None,"proc":None}`), `_shell_lock`, `created`, `lifecycle`
(list), `_flushed`, `_flush_lock`. `CARRIED_FIELDS = ("job","input",
"output","git","notes","status","stxt")` (tracks.py:527).

**TrackHub** (tracks.py:341-539): keeps `_members` (webio to label, the
anchors) separate from `_mirrors`; `_fanout()` at tracks.py:431-445;
`empty()` (tracks.py:406-419) counts anchors only, mirrors don't count;
`ask`/`resolve_gate` at tracks.py:483-506.

**MirrorView** (tracks.py:249-341): `_tag()` (tracks.py:274-280) wraps every
outgoing call into `{"type":"mirror","track":id,"kind":kind,**payload}` via
`webio._send`, so one socket can watch a second track without a second
connection.

**Module registry**: `_regions` (tracks.py:1698), `_tracks` (tracks.py:1699),
`_graveyard` (tracks.py:1701), guarded by `_tracks_lock` (tracks.py:1700).

**create_track / insert_region / edit_track**: `create_track`
(tracks.py:1852-1895) adds a `Track` to `_tracks`; if compat fields
(`model`/`seat`/`settings`/`region`) are present it also calls
`insert_region` (though §4 confirms the current CLIENT never sends that
compat shape — a caller could still in principle). `insert_region`
(tracks.py:1936-2019) looks up the `Track` in `_tracks`, constructs a
`Region`, applies settings via `reg._apply_edit`, and adds it to `_regions`
and the `Track.regions` list under `_tracks_lock` (tracks.py:2011-2014).
`edit_track` frame handler (frames.py:1885-1940+) looks up the `Region`,
builds a list of edit items, and applies them via `Region.apply_edits`
(tracks.py:1205-1285) / `_apply_edit` (tracks.py:1285-1427).

**kill_track / kill_region / killswitch, order of operations**:
- `kill_track` frame (frames.py:1060-1072): calls `tracks.kill_region(tid)`,
  `_detach`s it if anchored, then `send_track_removed` and
  `send_track_list`.
- `tracks.kill_region` (tracks.py:2476-2540): (1) `region._killed = True`,
  clears inbox; (2) `hub.stop_requested.set()`; (3)
  `hub.resolve_gate(None, "n")`; (4) `region.kill()` (marks lifecycle
  "killed", closes the shell); (5) `al.router.claude_close_track(region_id)`;
  (6) `autosave()`; (7) `remove_region`; (8) `index_entry()` into
  `_graveyard`; (9) `waypoint.dead_letter_all(region_id)`; (10) notifies
  senders via `waypoint.append_message(SYSTEM_SENDER, ...)`.
- `killswitch` frame (frames.py:1184-1203) calls `tracks.stop_all_regions()`
  (tracks.py:2457-2472), which fans `stop_region()` (tracks.py:2427-2453)
  over every region: `hub.stop_requested.set()`, `hub.resolve_gate(None,
  "n")`, `al.router.claude_interrupt_track`. This kills nothing — a
  frames.py comment (frames.py:1195-1198) states the real killswitch is
  `/api/end-all`.
- `delete_track` frame (frames.py:1079-1130) calls `kill_region` per region
  in the track, then `remove_track` (see DEAD/ORPHANED below — this is now
  a real caller).

**anchor / focus / detach**: `_anchor` (frames.py:361-379) and `_detach`
(frames.py:383-396) call `track.hub.add(ctx.webio, ctx.conn_sid)`
(frames.py:373) / `old.hub.remove(ctx.webio)` (frames.py:391). The `anchor`
frame handler (frames.py:1017-1030) calls `_anchor`. `disconnect(ctx)`
(frames.py:398-408) calls `_detach` plus
`ctx.mirror.hub.remove_mirror_for(ctx.webio)`. No `t=="focus"` branch was
located within the ranges read this pass — see §14.

**Archive lifecycle, in order**:
`_write_archive` (tracks.py:2979-3053) builds a master record with
`schema=4` (`ARCHIVE_SCHEMA = 4`, tracks.py:2967), `kind`,
`tracks`/`regions`/`plan`, writes `master.json`, then flushes each region
(`r.flush(d)`). `_read_master` (tracks.py:3053-3118) migrates schema 1→2
(the Track/Region split) then 2→3 (adds `plan`); "3→4 has no step" (adds
`workspace_root` with no migration needed) per the code's own comment; sets
`schema=4` on load. `save_session` (tracks.py:3118-3131) sets
`_session["saved"] = True` then calls `_write_archive`. `autosave`
(tracks.py:3131-3151) is a no-op unless already saved. `save_template`
(tracks.py:3151-3243) writes a fresh `archives/<new-id>/master.json` with
`kind = TEMPLATE_KIND`, scrubbing `TEMPLATE_BLANKED = ("status","stxt")`
plus lifecycle/`turn_ordinal`/`claude_session_id`. `reload_session`
(tracks.py:3409-3490) refuses a template id, calls `_halt_live_world()`,
restores `workspace_root`, rebuilds the world via `_world_from_master`,
swaps `_regions`/`_tracks`/`_graveyard`/`_session`, calls
`_point_stores_at(master["id"])`, and `_move_floor(0)`.
`instantiate_template` (tracks.py:3490-3555) requires `TEMPLATE_KIND`, sets
`hydrate_dir = None`, mints a fresh session id, `saved = False`, calls
`_point_stores_at(sid)` and `_move_floor(_now_ms())`. `_reset_to_scratch`
(tracks.py:3555-3626, shared by new-session and end-session) calls
`autosave()`, halts and closes the shell for every region,
`dq.terminate_session`, clears the registries, resets `_session`, calls
`_point_stores_at(None)` and `_move_floor(_now_ms())`. `_hydrate_region`
(tracks.py:3243-3285, NOT in the 2026-08-20 pass — new) replays a
`<region-id>.jsonl` file into `track.sess.messages` without reseating,
tags legacy messages `_turn=0`, sets `_flushed`, `sess.autosave = True`,
`sess.save_name = track.id`; called only from `_world_from_master`
(tracks.py:3376) when `hydrate_dir` is not None.

**_point_stores_at** (tracks.py:1804-1829): repoints
`ledger.set_ade_log_dir` and `waypoint.repoint` at `archives/<sid>/`, or
back to the global files when `sid` is None. Called from `_ensure_session`
(tracks.py:1829-1852, call at tracks.py:1847), `reload_session`
(tracks.py:3484), `instantiate_template` (tracks.py:3545), and
`_reset_to_scratch` (tracks.py:3621, with `None`).

**feed / wp_feed / transcript handlers** (frames.py): `feed`
(frames.py:1392-1425) reads `since = msg.get("since",
tracks.session_started_ms())` and a `limit`, replies via
`webio.send_feed(ledger.ade_snapshot(limit, since),
ledger.region_totals(since))`. `wp_feed` (frames.py:1445-1452) replies
`send_wp_feed(waypoint.display_lines(), waypoint.waiting_counts())` — no
floor/since parameter. `transcript` (frames.py:1492-1511) looks up
`get_region(msg["track"])` and replies `send_transcript(track.id,
track.sess.messages)` — this is NOT gated on the track being anchored.

**mark_dirty / _fire_dirty**: debounce state at frames.py:208-210
(`_dirty_lock`, `_dirty_stores`, `_dirty_timer`), the function itself at
frames.py:214-236, firing a `Timer(0.3)` (frames.py:222, 300ms). Three
listener seams, all wired in server.py: `ledger.set_append_listener`
(server.py:735), `dq.set_change_listener` (server.py:737),
`waypoint.set_append_listener` (server.py:738) — the first two call
`mark_dirty("record")`, the third calls `mark_dirty("waypoint")`.

**broadcast_track_status / broadcast_gate / broadcast_human_mail**:
`broadcast_gate` (frames.py:101-113) calls `send_gate_broadcast`
(web_io.py:434-453). `broadcast_track_status` (frames.py:114-127) calls
`send_track_status` (web_io.py:394-408). `broadcast_human_mail`
(frames.py:167-214) reads `waypoint.peek(HUMAN_SENDER)` and sends
`{"kind":"mail","track":HUMAN_SENDER,"count","from","system","bodies","ts"}`
via `_broadcast("send_activity")` (web_io.py:379-387). All three sit inside
the `AdeSenders` mixin (web_io.py:140-461).

**ade_plan handler**: frames.py:1247-1296 — described in full in §3.

---

## 10. SERVER SIDE, server.py ADE PORTIONS

**ws_ade_handler** (server.py:2567, `@sock.route("/ws/ade")` decorator at
server.py:2566): one websocket connection is one viewing tab. Creates an
`AdeMemberWebIO`, registers a `conn_sid` in `_registry` with `sess=None`.
Sends newcomer sync frames (models list, crew roster, gate edges, rail
catalog, `send_ade_init` with session meta + regions + tracks). Builds an
`AdeCtx` bound to `_ade_live_runner` and a `_rebind` closure. Loop: reads
raw frames, JSON-decodes, dispatches to `ade_frames.handle(ctx, msg)`,
catching per-frame exceptions into an inline `[frame error — skipped: ...]`
reply. On disconnect (`finally`): pops the registry entry, calls
`ade_frames.unregister_conn(webio)` and `ade_frames.disconnect(ctx)` — this
detaches the VIEW only, the track keeps running.

**_ade_live_runner** (server.py:2540): takes a `sess`, initializes
`sess._turn_usage` (`out_tokens`, `in_tokens`, `cache_read`,
`cache_creation`, `duration_ns`, `cost_usd`, `calls`), calls
`agent_respond_safe(sess)`, returns `{"usage": ..., "cost_usd": ...,
"stop_reason": "stop"}` with an explicit `list()` copy of `calls` so the
return value doesn't alias the session's live accumulator.

**_gate_notifier** (server.py:377): per-session half reads
`entry.get("session")` as `target_sid`, and under `_registry_lock` finds
every registry webio whose `sess.sid == target_sid`; for `kind=="ask"`
calls `w.post_gate(entry["id"], prompt)`, for `kind=="resolved"` calls
`w.gate_resolved(entry["id"])` (both try/except-wrapped). ADE-wide broadcast
half (around server.py:404-414): looks up `track =
ade_tracks.get_region(target_sid)`; if it's a live ADE track, calls
`ade_frames.broadcast_gate(kind, entry["id"], prompt, track.id,
track.name)` — fans to every open ADE tab regardless of anchor, separate
from the per-session routing. Registered via `dq.set_notifier(_gate_notifier)`
at server.py:415.

**_waypoint_nudger and neighbors**: `_waypoint_nudger` (server.py:433) —
if `track_ident == ade_tracks.HUMAN_SENDER`, calls
`ade_frames.broadcast_human_mail()` and returns (no pump thread, "Brandon
is not summoned"); otherwise looks up `track = ade_tracks.get_region
(track_ident)`, no-ops if None or `track.muted`, else calls `track.nudge()`
and, if the pump flag was claimed, starts a daemon thread on
`track.run_pump` with `_ade_live_runner`. `_ade_mute_prober(region_id)`
(server.py:457). `_waypoint_track_prober(track_ident)` (server.py:461)
returns `"live"`/`"muted"`/`"killed"`/`"unknown"`, hardcoding Brandon to
`"live"`. `_waypoint_track_resolver(receiver)` (server.py:481) resolves
tiered: exact id, then reserved human aliases `"captain"`/`"brandon"`/
`"the human"`, then unique name, then unique seat; an ambiguous match
returns None.

**_ade_initiator** (server.py:521): two sequential loops — (1) delivery,
for each `(target, content)` in `ade_tracks.initiate_deliveries
(region_ident)`, calls `waypoint.append_message(region_ident, [target.id],
content, wake=False)` (deliver without summoning); (2) start, for each
`target` in `ade_tracks.initiate_targets(region_ident)`, calls
`target.nudge()` and, if claimed, starts a daemon thread on
`target.run_pump`; appends `target.name or target.id` to the returned
`started` list. The function's own docstring flags an unfixed bug: a
first-wins id lookup inside `ade_tracks._initiate_by_node` can resolve to
the wrong live copy when a node id repeats across live regions
(decided-by Brandon 2026-08-08, not fixed).

**_ade_room_reporter** (server.py:584): takes `(sender, receivers)`, reads
`ade_tracks._live_peers()`, returns `""` if empty. Builds a "reached" list
via `ade_tracks.display_name(r)`, marks the sender "(you)" and
`HUMAN_SENDER` "(the human)", others by name/seat. Appends a "Not on this
message" list of agent ids omitted from `receivers` (excluding sender and
the human). Returns the composed reminder string appended to outgoing
messages.

**/api/ade-sessions\***:
- `GET /api/ade-sessions` (server.py:1967, `api_ade_sessions`) — walks
  `archives/*/master.json`, skips rows where `kind ==
  ade_tracks.TEMPLATE_KIND`, returns `{"list": [{id, name, created, saved,
  tracks}]}` (`tracks` = live region count).
- `DELETE /api/ade-sessions/<sid>` (server.py:2135,
  `api_delete_ade_session`) — validates `sid` against `[\w\-]+`, refuses
  the currently-live session id, 404s if the dir is missing, else
  `shutil.rmtree(sdir)`.
- `POST /api/ade-sessions/save` (server.py:2214, `api_save_ade_session`) —
  accepts `{"name": ...}`, 400s on an empty name or when there's no live
  ADE session (`ade_tracks.session_meta()["id"] is None`), calls
  `ade_tracks.save_session(name)`, broadcasts
  `ade_frames._broadcast("send_ade_init", ...)`, returns `{"ok": True,
  "session": ...}`.

**/api/ade-templates\***:
- `GET /api/ade-templates` (server.py:2153, `api_ade_templates`) — same
  walk, inverted filter (`kind == TEMPLATE_KIND`), same output shape.
- `DELETE /api/ade-templates/<tid>` (server.py:2191,
  `api_delete_ade_template`) — validates id, reads `master.json`'s `kind`,
  400s if not `TEMPLATE_KIND`, else `shutil.rmtree(tdir)`.

**Page routes**: `GET /ade` (server.py:1010, `ade_page`, serves
static/ade.html). `GET /ade/ledger` (server.py:1023, `ade_ledger_window`,
serves static/ade-ledger.html). `GET /ade/arrange` (server.py:1042,
`ade_arrange_window`, serves static/ade-arrange.html). Also present, not
named in the primer: `GET /ade/retired` (server.py:1033, serves
static/ade-retired.html).

**`/__debug_initiate/<region_id>`**: route server.py:2237, handler
server.py:2238, body `return {"result": rt.initiate(region_id)}`. Docstring
still reads "TEMPORARY — SCOPE-fork live verify only, removed before this
contract's receipt ships." A recursive grep of `static/` for
`__debug_initiate`/`debug_initiate` returns zero matches — nothing in the
client calls it.

---

## 11. RAIL C HOOK

**hooks/ade_pretooluse_hook.py** (272 lines): `main()`
(hooks/ade_pretooluse_hook.py:244) reads `ADE_REGION_ID` from `os.environ`
(line 245), parses JSON off stdin (lines 247-251), branches on
`payload.get("hook_event_name", "PreToolUse")` (line 253).

**PreToolUse** (`_handle_pre`, line 175): computes `tool_name`,
`tool_input`, `tool_use_id`; for `tool_name == "Bash"` computes
`_bash_edge(command)` (line 143), which classifies plain read-only commands
(`cat`/`grep`/`ls`/`head`/`tail`/`wc`/`find` with no `>`, `>>`, `|`, `;`,
`&&`) as a `"check_read"` edge override. POSTs to `ENDPOINT`
(`"http://localhost:5000/api/policy/resolve-hook"`, line 108), blocking up
to `REQUEST_TIMEOUT_S = 3600` seconds. On network/JSON failure, responds
`"locked"` with an explicit unreachable-endpoint reason. On success, reads
`answer.get("decision", "locked")`, builds a reason string when the
decision isn't `"open"`, and calls `_respond`.

**PostToolUse** (`_handle_post`, line 214): if there's no `region_id`,
responds immediately with no POST. Otherwise POSTs `region_id, tool_name,
tool_input, tool_response, tool_use_id, duration_ms` to
`OUTCOME_ENDPOINT` (`"http://localhost:5000/api/policy/record-tool-outcome"`,
line 112) with a 3-second timeout (`OUTCOME_REQUEST_TIMEOUT_S = 3`);
swallows every `URLError`/`TimeoutError`/`OSError`; always calls
`_respond_post()` (prints `{}`, exits 0) — this branch never denies or
blocks the tool call.

**Decision vocabulary**: the hook script itself never interprets `"ask"` —
the endpoint always resolves to a final `open`/`queue`/`locked` (per the
module docstring, lines 67-70). `_respond` (line 156) maps `"open"` to
`"allow"` and anything else to `"deny"` (line 159).
`answer.get("decision", "locked")` (line 207) is the fallback default.

**ADE_REGION_ID**: read from env at hooks/ade_pretooluse_hook.py:245. Set
in `engine/providers.py`'s `_cache_env` (engine/providers.py:909), lines
938-939: `if region_id: env["ADE_REGION_ID"] = region_id`.

**Server handlers for the two endpoints**:
- `/api/policy/resolve-hook` (server.py:1371-1372,
  `api_policy_resolve_hook`) reads `region_id, tool_name, tool_input,
  tool_use_id, edge` from the POST body; 400s if the body isn't a dict;
  404s with `{"decision":"locked","error":"region not found"}` if
  `ade_tracks.get_region(region_id)` is None. Derives `edge` via
  `claude_sdk.edge_for(tool_name)` (`TOOL_EDGES` at
  engine/claude_sdk.py:173, `edge_for` at engine/claude_sdk.py:202) unless
  the incoming `edge_override == "check_read"`. Computes `target =
  claude_sdk.target_of(tool_input)`, `scope = claude_sdk.scope_of(...)`
  under `rt._track_root` set to the region's root;
  `human_attached = (agent_loop.modal_mode() != "off")`; calls `hook =
  policy.resolve(edge, "model", ctx)` (`policy.resolve` at
  engine/policy.py:174) with `ctx = {scope, overlay:
  region.sess.policy_overlay, human_attached}`. Branches: `"open"` →
  `dq.record_resolved(...)`, a gate event, `_open_rail_c_tool_record(...)`,
  returns `{"decision":"open"}`; `"locked"` → `record_resolved` with
  `outcome="locked"`, a gate event, returns `{"decision":"locked"}`;
  `"queue"` → `dq.park(...)`, returns `{"decision":"queue"}`; `"ask"` — if
  the per-track `claude_hook_ask_blocking` flag is False, degrades to a
  queue-park; otherwise parks with `register_waiter=True` and BLOCKS on
  `dq.await_answer(entry["id"], timeout=gate_wait_s)` — a timeout or
  `"parked"`/`"deferred"` result yields `{"decision":"queue"}`, a boolean
  answer opens the Rail C record on True and returns `open`/`locked`
  accordingly.
- `/api/policy/record-tool-outcome` (server.py:1494-1495,
  `api_policy_record_tool_outcome`) reads `region_id, tool_name,
  tool_use_id`; returns `{"ok": False}` (still HTTP 200) if the body isn't a
  dict, ids are missing, or the region isn't found. Otherwise builds
  `meta = ledger.custody(region.sess, driver="model")` and calls
  `ledger.action_record(...)` with `action_type =
  f"claude_hook_result:{tool_name}"` (the PreToolUse open record instead
  uses `claude_hook:{tool_name}`; `_pair_tool_use` matches the two by
  prefix), payload `{tool_use_id, tool_response, duration_ms}`,
  `outcome="fired"`. `ledger.append(rec)` runs inside a try/except that
  swallows everything; the endpoint always returns `{"ok": True}`.

**providers.py registration**: `HOOK_SCRIPT_PATH =
os.path.join(SUITE_ROOT, "hooks", "ade_pretooluse_hook.py")`
(engine/providers.py:694) — the surrounding comment (lines ~689-694) states
the script is never Python-imported, only spawned by the `claude` CLI by
path. The invocation string is built at engine/providers.py:995
(`hook_cmd = f"python3 {shlex.quote(HOOK_SCRIPT_PATH)}"`) inside
`_settings_obj` (engine/providers.py:951), embedded into the `--settings`
`"hooks"` key at lines 996-1010: a `"PreToolUse"` list with `{"hooks":
[{"type":"command", "command":hook_cmd, "timeout":hook_timeout_s}]}`, and a
sibling `"PostToolUse"` block (lines 1006-1010) using
`POST_TOOL_USE_TIMEOUT_S = 5.0` (engine/providers.py:708).

**What turns the hook on**: `_settings_obj(self, claude_tools, overlay,
gate_wait_s)` (engine/providers.py:951) gates the entire `"hooks"` block on
`if claude_tools:` (engine/providers.py:992) — the function's own docstring
(lines 963-967) states "THE HOOK REGISTRATION IS NOT A SEPARATE TOGGLE...
there is no UI path that turns tools on without also wiring the hook."
Which UI/settings field ultimately sets `claude_tools` was not traced this
pass (blackout on deeper engine/ reads) — see §14.

---

## 12. DEAD OR ORPHANED

| item | file:line | status |
|---|---|---|
| `tracks.attach` / `tracks.detach` | tracks.py:2905-2916 / 2918-2925 | still zero callers (repo-wide grep re-run this pass); `frames.py`'s `_anchor`/`_detach` do the equivalent work directly via `track.hub.add`/`.remove` |
| `tracks.remove_track` | tracks.py:2415-2427 | NO LONGER DEAD — now called from `frames.py`'s `delete_track` handler (frames.py:1123, inside frames.py:1079-1130); a frames.py comment (frames.py:1114) says it was written for this. The 2026-08-20 pass's "no caller found" verdict is stale. |
| `tracks.unsaved_summary` / `tracks.close` | tracks.py:3642-3658 / 3661-3665 | still zero callers anywhere; `server.py`'s `_shutdown_children` (server.py:2650-2662, registered via `atexit` at 2665 and SIGTERM at 2668-2670) only stops the `llamacpp`/`ollama` subprocesses, never calls either. An unsaved ADE session with live tracks is still silently lost on a clean shutdown; `autosave()` still only fires when already saved. |
| `static/ade-ledger.html` title/header | static/ade-ledger.html:5, 30 | still says "Queue/Log — ADE" while hosting `ledgerview.js` (the Ledger view); not fixed |
| `changes.js` gateColor drift | changes.js:70-78 vs queuelog.js:290-296 | missing the `parked` and `killed`/`timeout` white-outcome branches; the file's own comment still claims byte-identical parity and cites stale line numbers |
| `/__debug_initiate/<region_id>` | server.py:2237-2238 | docstring still says temporary/to-be-removed; zero callers found in `static/`, `shells/`, or `server.py` itself this pass |
| `shells/daemon/frames.py:queue_test_park` | not this phase's file (Phase 2 territory) | out of scope, not re-verified here |

---

## 13. DISCREPANCIES vs MAPDOCS

- **Every lane doc's own line count is off by one from the file on disk**:
  lane1-engine.md says 124 lines, file is 123; lane2-shells-server.md says
  476, file is 475; lane3-ade-frontend.md says 335, file is 334;
  lane5-injections-state.md says 244, file is 243. Consistent off-by-one,
  every lane doc, not investigated further (out of scope for a code-recon
  pass).
- **Every static/js/ade/*.js file this phase covers grew since the
  2026-08-20 pass**: boot.js 2093→2205+, timeline.js 1051→1736,
  agentstrip.js 406→458, chat.js 1492→1675, ledgerview.js 867→1049,
  messenger.js 356→373, tracksettings.js 2857→2975. None of these are
  small rounding differences — each grew by dozens to hundreds of lines.
  `retiredwin.js` (163 lines) exists in the current codebase and is not
  mentioned anywhere in the 2026-08-20 mapdoc pass at all.
- **shells/ade/*.py also grew substantially**: tracks.py 2928→3665,
  frames.py 1619→2025, web_io.py 400→461. `ARCHIVE_SCHEMA` is now 4 (the
  old pass only described migrations up to schema 3). `_hydrate_region`
  (tracks.py:3243-3285) is new and not in the old pass.
  `tracks.remove_track`, dead in the old pass, now has a real caller
  (frames.py:1123).
- **Region reset controls in tracksettings.js** (`allow_agent_reset`,
  `context_reset_cap_k`, `start_turn_on_reset`, the reset-note textarea —
  tracksettings.js:2461-2554) postdate the 2026-08-20 pass (dated comments
  2026-08-21 through 2026-08-24) and are absent from lane3's COMPONENTS
  description of tracksettings.js.
- **timeline.js's own `settle` import line is cited two different ways**
  across this pass's sub-agent reports — timeline.js:36 (per the chat/gate
  vocabulary agent) is consistent with the old mapdoc's timeline.js:36-37
  citation for `settle`/`openLedgerWindow`, but the same agent also cited
  call sites at both timeline.js:880-882 and timeline.js:1123 for what
  looks like the same button family. Not reconciled — timeline.js itself
  was never directly read this pass (see §14).
- **The primer's phrasing groups `syncMuColumns` under "multiuse.js"**
  (task assignment, §8) but the function is defined and called entirely
  inside boot.js (boot.js:1486, 1494, 1640, 2053) — multiuse.js contains no
  reference to it.
- **server.py line numbers moved substantially** from the old pass's
  citations (e.g. `ws_ade_handler` was cited server.py:2143, now
  server.py:2567; `_gate_notifier` was cited server.py:348-393, now
  server.py:377-414ish) — consistent with several hundred lines of growth
  elsewhere in server.py between the two passes, not itself a content
  change.

---

## 14. UNKNOWNS

- **Timeline view (§2) in full**: DOM structure, row-building function,
  region-span placement math, action-pip matching, exact feed keys read,
  toggle wiring (including whether `_addPhase`/add-phase toggle is still
  read nowhere else, per the old pass's DEAD finding), auto-refresh
  interval, and click targets. The sub-agent assigned to this file did not
  return before this map was written.
- **boot.js `route(m)`'s exact fan-out order for the `feed` case and the
  roster cases** (which view's `onFrame` each one calls, and in what
  order) — the case labels were grepped (§1) but the body of each case
  arm was not read this pass, so the old mapdoc's specific fan-out
  ordering claim (`routeQueueLogFrame`, `routeTimelineFrame`,
  `routeChangesFrame`, `routeLedgerFrame`, `routeArrangeFrame`,
  `routeAgentStripFrame`, in that order) is neither confirmed nor refuted
  against current code.
- **`transcriptview.js`**: a 2026-07-23 comment inside boot.js's `viewCtx`
  (§1) references a "Transcript tab" and a file by that name-shape, but no
  sub-agent located this file by grep and it is not among the files this
  phase's primer names. Whether it exists, and whether it's a seventh view
  beyond the six tabs enumerated in ade.html, is unresolved.
- **`t=="focus"` branch** in shells/ade/frames.py's anchor/detach handling
  — not located within the line ranges read for §9.
- **Whether `Region.apply_edits`/`_apply_edit` touch the module registries
  directly**, or only mutate the `Region` object in place — not confirmed.
- **Bodies of `_do_create_track`, `_do_insert_region`, `_plan_region`,
  `_plan_rows`** (frames.py) beyond their call-site behavior described in
  §3 — signatures and call sites confirmed, internals not read.
- **Which UI/settings field sets `claude_tools`** in
  `engine/providers.py`'s `_settings_obj`, which in turn gates whether the
  Rail C hook gets registered at all (§11) — not traced.
- **`engine/policy.py` internals beyond the `resolve()` call signature**
  used at server.py's `/api/policy/resolve-hook` handler — not read.
- **Root scoping per anchored track** (§8) — confirmed NOT implemented in
  multiuse.js itself; the actual scoping mechanism (server-side `setroot`
  frame handling, or a ctx field passed down from boot.js) was not traced
  to specific lines this pass.
- **`opts.nodes` in `deriveCables`** (cables.js) — confirmed declared in
  the function's parameter destructuring but never actually populated by
  arrange.js's call site; whether any OTHER caller supplies it was not
  checked (cables.js's only known caller this pass is arrange.js).
- **Non-JS callers of `/__debug_initiate`** — grepped only against
  `static/`; not checked against any external tooling or test scripts
  outside this repo's static/shells/server.py scope.
- **queuelog.js's own `isPending`/`gateColor` line citations
  (queuelog.js:286-302) vs timeline.js's claimed "byte-identical" copy** —
  timeline.js's copy was not independently read this pass, so the
  byte-identical claim from the 2026-08-20 doc is neither confirmed nor
  refuted for current code.
