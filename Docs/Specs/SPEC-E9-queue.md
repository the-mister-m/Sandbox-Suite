# SPEC E9 — queue log widget — Sandbox Suite

Model: sonnet. Wave 4. Receipt: Docs/Reports/RECEIPT-E9-queue.md, written
before 200K tokens.

## What this is

The old Queue / Log view as a widget. Track chips, column grid, settle
row, detail expansion, exactly as they are. The Phase 2 queue widget
stays registered.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/widgets/mount/mount.js. 4 KB.
- static/js/widgets/shared/feed-rows.js, from E5.
- static/js/ade/queuelog.js. 17 KB, the design.
- static/css/ade.css: grep for ql-, qlrow, qlh, trackchip, sbtn, and
  read those rules.
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/queue-log/queue-log.js, type queue_log, label
   Queue Log. Same markup, same columns, same localStorage key for column
   widths.
2. Subscribe to track_list, feed, ledger_detail. Send feed and
   ledger_detail with inst. Ignore replies with another inst.
3. rowsForRegion and pendingByRegion are exported from feed-rows.js now.
   This file imports them instead of owning them.
4. Cache TTL and exclude-dynamic toggles on the chips stay. The Claude
   check uses the region row's provider field, not the model name list.
5. Styles copied into the widget's style block.

## Do not

- Do not change columns, sort, or the settle row.
- Do not touch the Phase 2 queue or mini queue widgets.

## Acceptance

- A parked gate shows pending, settles from the row, and the feed
  updates.
- Detail opens and shows input and output.
- Column drag and width persist across a reload.

## Receipt

Edits by file. Registry row.
