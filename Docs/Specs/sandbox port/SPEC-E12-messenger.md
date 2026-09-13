# SPEC E12 — messenger widget — Sandbox Suite

Model: sonnet. Wave 4. Receipt: Docs/Reports/RECEIPT-E12-messenger.md,
written before 200K tokens.

## What this is

The old Messenger view as a widget. Track rail with send and view arms,
the mute button, chat cards, the open chat, mark read, exactly as they
are.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- static/js/widgets/mount/mount.js. 4 KB.
- static/js/ade/messenger.js. 13 KB, the design.
- static/css/ade.css: grep for mg-, and read those rules.
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/messenger/messenger.js, type messenger, label
   Messenger. Same markup.
2. Subscribe to track_list, wp_feed. Send wp_feed, wp_send, wp_mute,
   wp_read with inst.
3. The roster comes from the last track_list. rosterChanged runs on it.
4. Styles copied into the widget's style block.

## Do not

- Do not change the card grouping or the arm logic.

## Acceptance

- Send to all reaches every live region and the card shows it heard.
- Mute a region and it drops from the send arm and the room.
- Mark read clears the captain's unread count.

## Receipt

Edits by file. Registry row.
