# SPEC-test-ledger — Phase 3 test pass, ledger widget

Job 5, spec agent. Look and compare only. No fixes applied.

Widget: `static/js/widgets/ledger/ledger.js` (registry type `ledger`, no css file in the folder — css is inline in the js as `STYLE_CSS`).
Old reference: `git show HEAD:static/js/ade/ledgerview.js` (699 lines), `git show HEAD:static/css/ade.css`.
Session: 6ab8273846b3. Server left running, untouched.

Evidence:
- `Docs/Reports/phase3-test/ledger-full.png`, `ledger-widget.png` — harness run, live empty session.
- `Docs/Reports/phase3-test/ledger-probe-filled.png`, `ledger-probe-focus.png`, `ledger-probe.txt` — second pass with synthetic `track_list` + `feed` frames delivered into the mounted frame, widget resized to 1150x620. Probe script: `/private/tmp/claude-501/-Users-moth3rship-Desktop-AI-Design-Sandbox-Suite/971afd5f-e83e-4c5e-b631-f248da987e01/scratchpad/probe_ledger.py`. Synthetic frames only — no session data was created.

---

## RENDER

What the live empty-session screenshot shows (`ledger-widget.png`, default frame size):

- Track chip bar: `ALL` / `NONE` buttons only, no chips (no turns yet — correct).
- `Columns ▾` button, right aligned.
- Rollup chips wrapped into a 2-wide stack that fills the whole frame: `0 TURNS`, `0ms DURATION`, `$0.0000 COST`, `0 ACTIONS`, `0 OUT`, `0 READ`…
- Table head, table body, and legend are pushed below the visible area. The frame scrolls as one block instead of the table scrolling inside a fixed shell.

What old `ledgerview.js` rendered (same DOM, ade.css layout): one horizontal rollup strip, then `#agentTotals`, then a `#ledScroll` region that took the remaining height and scrolled its own table, then a pinned legend strip.

At 1150x620 (`ledger-probe-filled.png`) with synthetic data the port renders correctly, and matches old structure element for element:

- 14 visible column headers, in old order: Time ▼, Track, Turn, Call, Duration, Model, Stop, Actions, Cost $, Out, Read, Read Peak, Write 5m, Write 1h. The three legacy columns (In, Cache R, Cache W) are hidden by default, same as old.
- Rollup strip: Turns, Duration, Cost, Actions, Out, Read, Read Peak, Write 5m, Write 1h + spacer. Same set as old.
- `Per-Agent Totals · 2 agents · peak 950` collapsible header, closed by default, same as old.
- Two turn rows, default sort Time descending (▼ on Time) — same default as old `_sort = { key:'time', dir:-1 }`.
- Legend row present but rendering as run-together text with no color swatches: `Color = gate outcomeno gatepre-permittedasked → approvedqueued, pendingdenied`.
- Track chips and the Track column both show raw region ids (`r-aaa`, `r-bbb`), not names. Old showed names.
- `mx:open-ledger` (`ledger-probe-focus.png`): row `turn-2` flashed blue, expanded, showed `no matched action records for this turn` and a transcript sub-row (`loading transcript…`, no server answer for a synthetic region id).

---

## MISSING ELEMENTS

DOM structure, ids, columns, sort keys, cell formatters, and event wiring are a faithful copy — no old id or column is absent. What is absent is css and refresh wiring.

CSS blocks present in old `static/css/ade.css`, not carried into `STYLE_CSS` in `ledger.js`:

- `#legend` — ade.css:1395 — legend strip box, flex, gap, padding, border.
- `#legend .lg` — ade.css:1400 — flex row for the legend items. Missing → legend text runs together.
- `#legend .lgl` — ade.css:1401 — "Color = gate outcome" label styling.
- `#legend .sw` — ade.css:1402 — `width:10px;height:10px` color swatches. Missing → the five gate-color squares are invisible; the legend explains colors it cannot show.
- `.ql-edge` and `.ql-edge.white/.green/.blue/.yellow/.red` — ade.css (5 color rules + 2 base rules) — the gate-outcome pill on every expanded action sub-row. Missing → sub-row gate outcomes render as bare text with no color. This is the feature the legend describes.
- `.ql-you` — ade.css — the "you" marker on user-action sub-rows.
- `.ql-io`, `.ql-io-box .io-l`, `.ql-io-box .io-l .io-x`, `.ql-io-box .scrollbox`, `.ql-io-box .io-blank` — ade.css — input/output boxes emitted by `ioBox()` (`ledger.js:59-67`) when a sub-row is opened.
- `.scrollbox` — ade.css — base scroll box used inside `ioBox`.
- `.muted` — ade.css — used in the Call column `—` cell (`ledger.js:198`) and in sub-row summaries.
- `.empty` — ade.css — used by the "No turns recorded yet." body cell, `no track`, `loading transcript…`, `no transcript for this turn`.
- `.cp-script`, `.cp-scriptwrap` — ade.css — the transcript wrapper class emitted by `transcriptRowHtml` (`ledger.js:608`) as `class="cp-script tx-wrap"`. `.tx-wrap` has no rule in either file.
- `.tb-btn` base rule — ade.css — new css only has `.led-chips .tb-btn` and `.cols-panel .tb-btn` overrides, no base.
- `.chip` base rule — ade.css — new css only has `.led-chips .chip`. The Model cell and Call cell emit a bare `.chip` (`ledger.js:192,197`) that is outside `.led-chips`, so those two chips get no chip styling at all.

Behavior present in the old shell, absent in the port:

- Feed refresh on `feed_dirty`. Old `boot.js:551-563` re-sent `{type:'feed'}` whenever the `record` store went dirty; it also fired feed at 0/400/1500ms on connect and on session switch (boot.js:188-190, 260-262, 327-329, 454). The port sends `{type:'feed'}` once in `mount` (`ledger.js:783`) and nothing else. No widget anywhere handles `feed_dirty` (grep across `static/js/widgets/` and `static/js/matrix/`: zero hits).
- `refresh()` — old `ledgerview.js:256` cleared cached transcripts and re-sent feed; boot bound it to the per-view refresh control (boot.js:953). No equivalent in the port, and the widget declares no `options` and no defaults.
- `onEsc()` — old `ledgerview.js:274` collapsed all open turn rows and sub-rows on Esc (boot.js:1155). No key handling in the port.
- `openLedgerWindow(filter)` — old `ledgerview.js:284`, popped out `/ade/ledger` (boot.js:1274). Read as intentionally dropped by the port; the matrix has frames, not popout windows. Flagging, not calling it a defect.

---

## CHECKLIST

- **Ledger: rows/columns/sort match the old ledger view — PASS with one defect.** Column list, order, default hidden set, cell formatters, and sort (default time desc; clicking Cost $ re-sorted ascending, verified in `ledger-probe.txt`) all match; the Track column shows region ids instead of names — see LOOSE END.
- **`mx:open-ledger` event focuses/opens/flashes the right row — PASS.** Dispatched `{track:'r-bbb', turn:2}` from the page; `turn-2` was the only row with class `flash`, it opened, and two sub-rows appeared (`ledger-probe.txt`, `ledger-probe-focus.png`). Both emitters (`changes.js:275`, `timeline.js:412`) dispatch on `document` with `{track, turn}`, matching the listener at `ledger.js:774-780`.
- **Ledger widget works the same as before the port — FAIL.** Four regressions: track names not resolved, legend/gate-color/io css not carried over, the feed never refreshes after mount, and the root does not fill its frame so a normally-sized widget overflows instead of scrolling its table.

---

## LOOSE END — `rows` versus `tracks`

**`tracks` is right. The widget reads `rows`, which is wrong.**

Evidence, server side (`ade/web_io.py:84-91`):

```
"tracks": [_region_row(t) for t in regions],
"rows":   [_track_row(t) for t in (track_rows or [])],
"names":  _names_map(regions),
```

`_region_row` (web_io.py:25) is a **region**: `id, track, node_id, name, model, seat, root, created, provider, loop_class, mechanism`.
`_track_row` (web_io.py:45) is a **track container**: `id, name, regions[], root, order, created`.
Caller (`ade/frames.py:131`): `send_track_list(tracks.list_regions(env), tracks.list_tracks(env))` — regions first, tracks second.

Evidence, widget side: every lookup key in ledger.js is a **region id** — `regionOf(r)` returns `r.region` (`ledger.js:82-86`), chips come from `chipIds` over region ids (`ledger.js:78`), and `trackName(id, st)` / `goneCls(id, st)` search `st.tracks` for a matching `id` (`ledger.js:146-156`). But `onFrame` sets `st.tracks = msg.rows` (`ledger.js:802`), which is the track-container array. Region ids never match track ids, so `trackName` always falls through to `return String(id)`.

Evidence, observed: probe fed a `track_list` whose `tracks` held `r-aaa`/`r-bbb` with names and whose `rows` held `t-1` "TRACK ONE". The widget rendered chips `r-aaa`, `r-bbb` and Track cells `r-aaa`, `r-bbb` — raw ids, no name, and `TRACK ONE` appeared nowhere.

Old behavior for comparison: old `ledgerview.js` never read the frame itself. It took `ctx.nameOf` / `ctx.isGone` callbacks (`ledgerview.js:236-238`), and boot fed those from `S.tracks = m.tracks` plus `mergeNames(m.names)` (`boot.js:458-461`). So the old name source was `msg.tracks` + `msg.names`.

Right answer for a fix job: read `msg.tracks` (and optionally prefer `msg.names[id]`, which is what boot's `mergeNames` used). Not changed here.

Second-order effect: `goneCls` also searches the wrong array, so `st.knownTrackIds` fills with region ids that are never "present", and every region will render as `led-gone` (dashed chip, dimmed) the moment a second `track_list` arrives. Not observed in the probe because only one `track_list` was delivered.

---

## CONSOLE

Harness run (`ledger-console.txt`), one line, whole run:

- `[console:error] Failed to load resource: the server responded with a status of 404 (NOT FOUND)`

Traced: `curl http://127.0.0.1:5000/favicon.ico` returns 404. Page-level, not ledger-specific — the same single line appears in `anchor_chat-console.txt` and `queue_log-console.txt`. Not a ledger defect.

Probe run (`ledger-probe.txt`): same one 404, no `pageerror`, no exception during mount, delivery of `track_list`/`feed`/sort click/`mx:open-ledger`. No warnings.

Note: `WidgetFrame.deliver` swallows widget exceptions (`static/js/matrix/widget-frame.js:59`, `catch (e) { }` with no log). A frame-handling throw in this widget would leave no console trace. Nothing suggests one is happening, but the console is not proof of a clean `onFrame`.

---

## FIX LIST

Smallest first. What, not how.

1. `ledger.js:802` — read track names from `msg.tracks`, not `msg.rows`. Fixes the Track column, the chip labels, the Track sort key, and the false `led-gone` state. One line.
2. `STYLE_CSS` — add the four `#legend` rules from `ade.css:1395-1402` so the legend lays out and its color swatches have a size.
3. `STYLE_CSS` — add the `.ql-edge` base and five color rules from ade.css so expanded sub-rows show gate outcome color.
4. `STYLE_CSS` — add `.muted`, `.empty`, `.scrollbox`, `.ql-you`, `.ql-io`, `.ql-io-box .io-l`, `.ql-io-box .io-l .io-x`, `.ql-io-box .scrollbox`, `.ql-io-box .io-blank` from ade.css.
5. `STYLE_CSS` — add the base `.chip` rule (the Model and Call cells emit a chip outside `.led-chips`) and the base `.tb-btn` rule.
6. `STYLE_CSS` — add a `.cp-script` / `.tx-wrap` rule for the transcript sub-row wrapper; `.tx-wrap` currently has no rule in either file.
7. Layout — make `.ledgerRoot` fill its host. `.mx-host` is `display:block; overflow:auto` (`static/css/matrix.css:102-107`) so `.ledgerRoot{flex:1;min-height:0}` (`ledger.js:647`) has no flex parent and the root is content-sized; `#ledScroll{flex:1}` therefore never caps and the whole widget overflows the frame. Confirmed measured: host 597px tall, root 360px, `#ledScroll` 128px — the scroll region never grows to fill. Scope the fix inside the ledger folder, do not change `.mx-host` for every widget without checking the others.
8. Feed refresh — the widget requests `feed` once at mount and goes stale. Old boot re-requested on `feed_dirty` for the `record` store (`boot.js:551-563`). Decide whether this belongs in each widget or in the matrix socket layer; whichever, the ledger needs to subscribe to the refresh trigger.
9. Feed instance filter — `ledger.js:783` sends `feed` with `inst: frame.id` and `ledger.js:799` drops any frame whose `inst` is set and not its own. The server echoes the requester's `inst` (`ade/frames.py:770-775`). A feed another widget requested is therefore invisible to the ledger. Old boot routed every feed to every view. Decide the rule and make it consistent across the feed-consuming widgets.
10. Refresh / Esc controls — the port dropped `refresh()` and `onEsc()`. Decide whether they come back as widget options or as matrix-level bindings. Lowest priority; both were shell-level in the old design.
11. `ledger.js:762` — `mount` overwrites `frame.el`, which the grid set to the widget shell (`static/js/matrix/grid.js:294`). Ledger is the only widget that does this. Harmless today (grid never reads `frame.el` after mount) but it is a latent trap; use a private field.

---

## READS

New widget, in full:
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/ledger/ledger.js` — grep across the whole file, Read tool for lines 76-160 and 740-815, sed for the css range 646-750.

Old reference, via `git show HEAD:`:
- `static/js/ade/ledgerview.js` — grep + sed ranges 1-60, 150-175, 256-300, 580-600.
- `static/js/ade/boot.js` — grep for ledger/track_list/feed, sed 450-475 and 585-615.
- `static/js/ade/ledgerwin.js` — line count only, no content read.
- `static/css/ade.css` — grep for ledger selectors, sed 1395-1403, plus a scripted selector-set diff against `STYLE_CSS`.

Grep-hit lines only, as allowed:
- `static/matrix.html` — script/stylesheet lines.
- `library/registry/widgets.json` — the ledger row.

Beyond the read list (declared, all grep-hit or narrow sed ranges, no full reads):
- `ade/web_io.py` — `send_track_list`, `_region_row`, `_track_row`, `_names_map`, `send_feed`. Needed to settle the loose end; the loose end cannot be answered without the frame's shape.
- `ade/frames.py` — `broadcast_roster`, the `feed` request handler.
- `static/css/matrix.css` — `.mx-host` rule.
- `static/css/skins/og.css` — `--gate-*` variable definitions.
- `static/js/matrix/grid.js` — lines 30-60, 280-300, plus grep for `frame.el`.
- `static/js/matrix/widget-frame.js` — lines 20-75.
- `Docs/tests/matrix_harness.py` — full, to write the probe.

Screenshots read: `ledger-widget.png`, `ledger-full.png`, `ledger-probe-filled.png`, `ledger-probe-focus.png`.

---

## BLOCKERS

- **Not verified: live data.** Session 6ab8273846b3 is fresh and empty. Every row, sort, chip, and focus result above came from synthetic frames injected into the mounted widget, not from the server. Rollup math, per-agent totals, action matching, and cost formatting were exercised only against my fake records.
- **Not verified: transcripts.** The transcript sub-row mounts and requests, but the synthetic region id has no transcript, so it sat at `loading transcript…`. The transcript path past the request is untested.
- **Not verified: gate colors.** `gateColor()` was never exercised with a real gate record; the color classes are also unstyled (fix 3), so this needs a re-test after the css lands.
- **Not verified: multiple ledger widgets.** The widget uses document-unique ids (`#ledBar`, `#rollup`, `#agentTotals`, `#ledScroll`, `#ledCols`, `#ledHead`, `#ledBody`, `#legend`, `#colsBtn`, `#colsPanel`, `#ledTrackAll`, `#ledTrackNone`, `#ledColAll`, `#ledColNone`, `#atToggle`). All internal lookups are scoped via `frame.el.querySelector`, so it probably survives, but two ledger frames on one grid was not tested and the ids are duplicated in the document if it happens.
- `ensureStyle()` injects `#mx-ledger-style` into `document.head` and `unmount` never removes it. Intentional-looking, harmless, noting it so a fix job does not "fix" it by accident.
- A fix job changing the layout should check the other Phase 3 widgets before touching `.mx-host` — that rule is shared by every widget in the grid.
