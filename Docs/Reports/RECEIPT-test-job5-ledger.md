# RECEIPT — Job 5, ledger widget, Phase 3 test pass

Spec: [SPEC-test-ledger.md](phase3-test/SPEC-test-ledger.md)

## WHAT RAN

- `matrix_harness.py --widget ledger --session 6ab8273846b3 --hold 45` → `phase3-test/ledger-console.txt`, `ledger-full.png`, `ledger-widget.png`.
- A second probe run (scratchpad script, not a project file) that mounted the ledger, resized the frame, delivered synthetic `track_list` and `feed` frames, clicked a sort header, and dispatched `mx:open-ledger` → `phase3-test/ledger-probe.txt`, `ledger-probe-filled.png`, `ledger-probe-focus.png`.

No edits to any widget, server, or css file. No commits. No new sessions. Server left running.

## RESULT

Checklist: 1 pass, 1 pass-with-defect, 1 fail. 11 numbered fixes in the spec.

## DECISIONS MADE

- Ran a second, synthetic-data probe instead of reporting "empty session, untestable." The live session has no turns, so rows/columns/sort and `mx:open-ledger` could not be judged from the harness screenshot alone. The probe touched only page memory — no session data written.
- Settled the loose end as **`tracks` is right, the widget reads `rows`**, on server-side evidence plus an observed render of raw region ids. Did not change the code.
- Did not read `Docs/audit/arrange-old/` or any other widget's source. Where I needed a comparison I grepped.

## READS BEYOND THE LIST

Declared in the spec's READS section. All were grep hits or narrow sed ranges, no full reads except the harness:
`ade/web_io.py`, `ade/frames.py`, `static/css/ade.css` (git), `static/css/matrix.css`, `static/css/skins/og.css`, `static/js/matrix/grid.js`, `static/js/matrix/widget-frame.js`, `Docs/tests/matrix_harness.py`.

`ade/web_io.py` was unavoidable — the loose end is a question about a frame's shape and cannot be answered from the js alone.

## FOR THE CLOSER

- Top three fixes: track names from `msg.tracks`; carry the `#legend` and `.ql-edge` css blocks over from `ade.css`; make `.ledgerRoot` fill its host so the table scrolls instead of the frame.
- Open question for Brandon or a later job, not decided here: `feed_dirty` refresh and the `inst` filter on feed frames are matrix-wide, not ledger-only. Spec fixes 8 and 9.
