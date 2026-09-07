# SPEC E10 — ledger widget — Sandbox Suite

Model: sonnet. Wave 4. Receipt: Docs/Reports/RECEIPT-E10-ledger.md, written
before 200K tokens.

## What this is

The old Ledger view as a widget. Turn table, rollup chips, per-agent
totals, column pick and drag, transcript rows under a turn, exactly as
they are. It also answers the open-ledger event from the timeline.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/widgets/mount/mount.js. 4 KB.
- static/js/widgets/shared/turns.js, from E7. Import the turn builders.
- static/js/ade/ledgerview.js. 25 KB, the design.
- static/js/ade/ledgerwin.js lines 83 to 111, the URL filter it took.
- static/css/ade.css: grep for led, rchip, at-, chip, cols-panel, and
  read those rules.
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/ledger/ledger.js, type ledger, label Ledger.
   Same markup, same columns, same sort.
2. Subscribe to track_list, feed, transcript. Send feed and transcript
   with inst.
3. mountTranscript used makeChatPane. Use the turn builders from
   turns.js and render the turn blocks straight into the row. No pane.
4. Listen on the document for mx:open-ledger. On it, apply the same
   focus the old window applied from its URL: open that turn, flash,
   scroll. The window function openLedgerWindow is gone.
5. Styles copied into the widget's style block.

## Do not

- Do not change columns, rollup math, or totals.
- Do not open windows.

## Acceptance

- Turns from two regions list with cost and tokens. Chips filter them.
- Open a turn: its actions and its transcript slice show.
- Fire mx:open-ledger with a track and turn: that row opens and flashes.

## Receipt

Edits by file. Registry row.
