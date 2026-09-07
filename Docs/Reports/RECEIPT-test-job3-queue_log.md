# RECEIPT — Job 3 — queue_log test pass — Phase 3

Spec: [SPEC-test-queue_log.md](phase3-test/SPEC-test-queue_log.md)

Harness run 20:03:54 / 20:04:39, session `6ab8273846b3`, hold 45.
Outputs: [queue_log-full.png](phase3-test/queue_log-full.png), [queue_log-widget.png](phase3-test/queue_log-widget.png), [queue_log-console.txt](phase3-test/queue_log-console.txt)

Result: 2 pass, 3 fail. No fixes made.

## DECISIONS MADE

- Split the first checklist line in two. "Same localStorage key and column defs" passes; "rows render correct data" fails. Reporting them as one line would have hidden a real defect behind a pass.
- Called the cache-TTL and exclude-dynamic toggles FAIL rather than untestable. The session has no tracks so nothing rendered, but the code path is provably dead — `t.provider` does not exist on the row shape the widget reads.
- Traced the 404 to `/favicon.ico` and scoped it out of queue-log. All four widget console files in the folder are byte-identical.
- Read `ade/web_io.py` beyond the brief. The render defect could not be named without the `_region_row` / `_track_row` shapes.

## READS BEYOND THE LIST

`ade/web_io.py` (two bounded ranges), `ade/tracks.py`, `ade/frames.py`, `static/js/widgets/shared/feed-rows.js`, `static/js/widgets/strip|changes|ledger|timeline/*.js`, `static/css/skins/og.css` + `matrix.css` + `matrix-chat-queue.css` — all grep hit lines or grep counts only, except the two `web_io.py` ranges. Full list in the spec's READS section.

## FOR THE CLOSER

- The `msg.rows` vs `msg.tracks` choice repeats in `changes.js` and `ledger.js`. Needs a suite-wide call, not a per-widget patch.
- `.tb-btn`, `.chip`, `.empty` are missing from every stylesheet `matrix.html` loads. Suite-wide.
- Esc-to-close has no dispatch contract in matrix. Restoring it is a matrix change.
