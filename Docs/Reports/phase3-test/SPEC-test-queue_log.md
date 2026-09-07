# SPEC-test-queue_log — Phase 3 test pass, Job 3

Widget: `queue_log` — `static/js/widgets/queue-log/queue-log.js` (595 lines, no css file in folder; css is an inline `QL_CSS` block, lines 408–522).
Old reference: `git show HEAD:static/js/ade/queuelog.js` (510 lines) + `git show HEAD:static/js/ade/boot.js`.
Harness run: `python3 Docs/tests/matrix_harness.py --widget queue_log --session 6ab8273846b3 --hold 45` — wrote at 20:03:54 / 20:04:39.
Session state: fresh, no model registered, zero tracks, zero ledger records.

---

## RENDER

What the screenshot shows (`queue_log-widget.png`, `queue_log-full.png`):

- Frame title `Queue Log · queue_log-mtqh9vve-1`, with `options` and `×`.
- Toolbar row (`.qlBar`): empty on the left, `all` and `none` buttons right-aligned.
- Header row (`.qlHead.ql-cols`): `TIME`, `ACTION`, `TARGET` visible; `TRACK`, `SUMMARY`, `MODEL` exist but sit past the right edge — a horizontal scrollbar is rendered at the bottom of `.qlWrap`.
- Feed: `no records`.
- No track chips, no model chips, no `5m`/`1h` TTL buttons, no `trim:on`/`trim:off` button — the session has no tracks, so nothing to draw.

What old `queuelog.js` rendered, same empty-session state:

- Same four-part structure: bar, wrap, head, feed — same six columns in the same order and the same pixel widths.
- Same `no records` empty string.
- Same `all` / `none` buttons at the right of the bar.
- Difference: the old bar was fed from the shell's live `S.tracks`, so it was populated the moment the shell had regions; the new bar is fed only by an incoming `track_list` frame (see MISSING ELEMENTS).

Visual regressions present in the screenshot, both caused by css that no longer loads:

- `all` / `none` render as browser-default buttons (light grey, native chrome). Old `.tb-btn` styling is gone.
- `no records` renders as plain body text. Old `.empty` styling is gone.

Everything else that could be judged on an empty feed matches. Row markup, colour classes, detail panel, settle strip could not be exercised — no records existed.

---

## MISSING ELEMENTS

Old file:line on the left, one line each.

- `queuelog.js:178-180` — `ctx.getTracks` / `ctx.nameOf` bound at mount; new widget has neither, it builds both from frame state.
- `boot.js:459` — old shell set `S.tracks = m.tracks` (region rows: `_region_row`, carries `model`, `provider`, `settings`). New `queue-log.js:570` sets `st.tracks = msg.rows` (track rows: `_track_row` = `id, name, regions, root, order, created` only). Wrong list.
- `queuelog.js:281` — `isClaudeModel(t.model)` gate on the cache-TTL toggle. New `queue-log.js:254` uses `t.provider === "claude"`; `_track_row` has no `provider`, so the toggle can never mount.
- `queuelog.js:282` — same for the exclude-dynamic toggle; new `queue-log.js:255`, same failure.
- `queuelog.js:279` — model chip from `t.model`; `_track_row` has no `model`, so the chip can never mount.
- `boot.js:461` `mergeNames(m.names)` — the `names` map from `track_list`/`ade_init` is dropped. New `nameOf` (`queue-log.js:234-237`) only looks in `st.tracks` and falls back to the raw region id.
- `boot.js:1154` `VIEW_ESC = { queue: onEscQueueLog }` / `queuelog.js:260` `onEsc()` — Esc closed all open detail rows. No Esc handling in the new widget, and grep found no Esc dispatch contract anywhere in `static/matrix.html` or `static/js/widgets/shared/` for a widget to hook.
- `queuelog.js:226` `rowsForRegion` / `queuelog.js:244` `pendingByRegion` — moved to `static/js/widgets/shared/feed-rows.js:88`. But nothing in queue-log calls `MX.feedRows.setRecords`; only `strip.js:360` does. With queue-log mounted alone the shared store stays empty.
- `queuelog.js:367` `resetCols` — dropped. Grep of old `boot.js` shows no caller, so this is a dead export, not a lost feature. No action needed.
- No subscription to `ade_init` (`queue-log.js:557` subscribes to `track_list`, `feed`, `ledger_detail`). `ade_init` (`ade/web_io.py:74-82`) is what carries the initial region list; `track_list` is only broadcast on change. A widget mounted into an idle session therefore never gets a track list.
- css: `.tb-btn`, `.chip`, `.empty` are defined in `static/css/ade.css`, which `static/matrix.html` does not load (it loads `og.css`, `matrix.css`, `matrix-chat-queue.css` — all three have zero matches for those three selectors). The widget's inline `QL_CSS` does not define them either.

Not missing, verified:

- `QL_COLS_KEY` is byte-identical: `"ade.queuelog.cols"` — old `queuelog.js:28`, new `queue-log.js:21`.
- `QL_COLS` array identical — six columns, same `key`/`label`/`w`/`min`.
- Column drag-reorder, grip resize, `--ql-grid` write-back, localStorage persist/load: ported line for line.
- Row cell markup, `gateColor`, `isPending`, `isFailedWrite`, `getTarget`, `regionOf`, `fmtTime`, settle strip, detail panel: ported line for line.
- css selector diff of old `ade.css:610-740` against the new `QL_CSS` block shows no lost queue-log rule — the `#qlBar/#qlWrap/#qlHead/#qlFeed` ids became `.qlBar/.qlWrap/.qlHead/.qlFeed` classes scoped under `.mx-queue-log`, which is the right move for multi-instance.
- Every css var the block uses (`--surface-1..3`, `--gridline`, `--border-2`, `--text-4`, `--mono`, `--gate-*`, `--fill-*`) is defined in `og.css`.

---

## CHECKLIST

- **Rows/columns match the old queuelog, same localStorage column key** — PASS on the key and the column definitions; the key string and all six column defs are identical. Row cell markup is identical too, but was not exercised — zero records.
- **Rows render correct data** — FAIL by code trace. `track` and `model` columns resolve through `st.tracks`, which holds track rows, not region rows; `track` will print the raw region id and `model` will fall through to `r.vessel`. Not observable live: zero records.
- **Cache TTL and exclude-dynamic toggles work** — FAIL by code trace. Both are gated on `t.provider === "claude"` and `t` comes from `_track_row`, which has no `provider` key, so neither toggle ever mounts. Untestable live: zero tracks, so nothing rendered either way.
- **Queue widget works the same as before the port** — FAIL. Four separate divergences: wrong track list source, `all`/`none` write `st.visible[trackId]` while the feed filters on `st.visible[regionOf(r)]` so the buttons are inert, no Esc-to-close, and `.tb-btn`/`.chip`/`.empty` are unstyled.
- **Mounts and renders without error** — PASS. Widget mounted, drew its full chrome, only console line is a page-wide favicon 404.

Count: 2 pass, 3 fail.

---

## CONSOLE

`Docs/Reports/phase3-test/queue_log-console.txt`, one line total:

```
[console:error] Failed to load resource: the server responded with a status of 404 (NOT FOUND)
```

Traced: not queue-log's. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/favicon.ico` returns `404`, and the console files for `anchor_chat`, `ledger`, and `queue` in the same folder are byte-identical (95 bytes each, same single line). Page-level, affects every widget test.

No warnings. No widget-sourced errors.

---

## FIX LIST

1. Change `queue-log.js:570` to read `msg.tracks` instead of `msg.rows` — that is the region-row list the old widget used, and it carries `model`, `provider`, and `settings`. This one line is the root of fixes 2, 3, and 5.
2. Add `ade_init` to the subscribe list at `queue-log.js:557` and handle it the same way as `track_list`, so a widget mounted into an idle session gets its initial track list.
3. Feed the `names` map from `track_list`/`ade_init` into `nameOf` so the `track` column shows names, not region ids, for regions no longer in the live list.
4. Get `.tb-btn`, `.chip`, and `.empty` into scope — either add them to the inline `QL_CSS` block under `.mx-queue-log`, or add a shared matrix stylesheet that carries them. This is a suite-wide gap, not queue-log's alone; a fix job should check with the session agent before choosing.
5. Confirm the `provider === "claude"` gate is the intended replacement for the old `CLAUDE_MODELS` list check, or restore the model-name check. Cannot be decided from the widget alone.
6. Call `MX.feedRows.setRecords(msg.records)` in the `feed` handler so the shared region store is populated when queue-log is mounted without `strip`.
7. Decide whether Esc-to-close-detail-rows survives the port. If yes, matrix needs an Esc dispatch contract first — none exists today.

---

## READS

Screenshots read with the Read tool:
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/Docs/Reports/phase3-test/queue_log-widget.png`
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/Docs/Reports/phase3-test/queue_log-full.png`

Files read (grep hits or bounded ranges, via bash):
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/queue-log/queue-log.js` — full, in ranges
- `git show HEAD:static/js/ade/queuelog.js` — full, in ranges
- `git show HEAD:static/js/ade/boot.js` — grep hit lines only
- `git show HEAD:static/ade.html` — grep hit lines only
- `git show HEAD:static/css/ade.css` — lines 610-740 for the css selector diff
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/matrix.html` — grep hit lines only (script order, stylesheet links)
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/library/registry/widgets.json` — grep hit line only
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/Docs/Reports/phase3-test/queue_log-console.txt` and the three sibling console files — full, 1 line each

Reads beyond the brief (needed to trace the track-list defect and the css gap; logged here as required):
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/ade/web_io.py` — lines 25-53 and 74-120, the `_region_row` / `_track_row` / `send_track_list` / `send_ade_init` shapes
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/ade/tracks.py` — grep hit lines only (`index_entry`, `list_regions`)
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/ade/frames.py` — grep hit lines only
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/shared/feed-rows.js` — grep hit lines only
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/strip/strip.js`, `changes/changes.js`, `ledger/ledger.js`, `timeline/timeline.js` — grep hit lines only
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/css/skins/og.css`, `matrix.css`, `matrix-chat-queue.css` — grep counts only, no content read

---

## BLOCKERS

- **The `msg.rows` vs `msg.tracks` choice is systemic, not local.** `changes.js:462` and `ledger.js:801` read `msg.rows` too. For queue-log it is provably wrong — the toggles and the model chip need `_region_row` fields that `_track_row` does not have. Whoever fixes queue-log should raise the pattern with the session agent rather than silently diverging one widget from its neighbours.
- **Nothing in this spec was verified against live data.** Zero tracks and zero ledger records. Rows, colours, the detail panel, the settle strip, column drag/resize persistence, and the two toggles were all read from source, not observed. Every FAIL above is a code trace, not a screenshot.
- **The css gap needs a decision, not a patch.** `.tb-btn`, `.chip`, `.empty` are missing from every stylesheet matrix loads. Fixing them inside queue-log's `QL_CSS` fixes one widget and leaves the rest broken.
- **Esc has no home.** There is no Esc dispatch in matrix chrome. Restoring the old behaviour is a matrix change, not a widget change.
- No `.css` file exists in `static/js/widgets/queue-log/`. All styling is the inline `QL_CSS` template literal.
