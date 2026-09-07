# SPEC E11 — changes widget — Sandbox Suite

Model: sonnet. Wave 4. Receipt: Docs/Reports/RECEIPT-E11-changes.md, written
before 200K tokens.

## What this is

The old Changes view as a widget. Files or agents grouping, the diff
pane, the pending flag, exactly as they are. One drift is fixed: its
gate color helper lacks three lines the other views have.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/widgets/mount/mount.js. 4 KB.
- static/js/ade/changes.js. 13 KB, the design.
- static/js/ade/queuelog.js lines 160 to 170, the gateColor to match.
- static/css/ade.css: grep for chg, cparent, cchild, dline, diffstat,
  pendflag, and read those rules.
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/changes/changes.js, type changes, label
   Changes. Same markup.
2. Subscribe to track_list, feed, ledger_detail. Send with inst.
3. gateColor gains the parked, killed, and timeout lines from
   queuelog.js so the four views agree.
4. The jump button fires mx:open-ledger with track and turn instead of
   opening a window.
5. Styles copied into the widget's style block.

## Do not

- Do not change the diff, the grouping, or the selection rule.

## Acceptance

- A write with a prior shows a diff with counts. A pending write shows
  the gate flag. The jump button opens that turn in the ledger widget.

## Receipt

Edits by file. Registry row.
