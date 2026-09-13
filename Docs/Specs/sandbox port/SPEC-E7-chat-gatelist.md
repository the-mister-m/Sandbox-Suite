# SPEC E7 — old chat and gate list — Sandbox Suite

Model: sonnet. Wave 3. Receipt: Docs/Reports/RECEIPT-E7-chat-gatelist.md,
written before 200K tokens.

## What this is

The old anchor chat pane and the gate list that sat under it, each as a
widget, detached from one another. The Phase 2 chat and mini queue stay
registered. Brandon prunes later.

## Decisions, from Brandon

- The old chat comes over detached from the gate list below it.
- Two of each stay registered.
- The old answer vocabulary on the wire stays as it is.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract and how an
  instance binds to a region. grep it and grid.js for target.
- static/js/widgets/mount/mount.js. 4 KB, the reference widget.
- static/js/ade/chat.js. 35 KB, the design. Lines 1 to 890 are the pane.
  Lines 892 to 1055 are the focus mirror; read them, do not port them.
- static/js/ade/boot.js lines 433 to 650 (the frame routing), 673 to 682
  (anchor), 175 to 191 (answer). 44 KB file, those lines only.
- static/ade.html lines 42 to 91 (the anchor pane and gate list markup).
- static/css/ade.css: grep for cp-, turnblock, msg, bub, evrow, gbadge,
  pip, code-fence, and read those rules only.
- library/registry/widgets.json.

## Build

1. Chat. Folder static/js/widgets/anchor-chat/anchor-chat.js, type
   anchor_chat, label Anchor Chat. Markup from ade.html's anchor pane.
   makeChatPane from chat.js as the module body, image intake included.
   Binding: the instance picks a region the way widget-frame.js does for
   the Phase 2 chat widget, then sends anchor with that track. Subscribes to track_transcript, chat_history,
   out, status, meters, activity, region_replaced. Send button sends user
   with text, media, image_paths, inst. Stop sends stop. On
   region_replaced for its region, re-anchor to the new id.
2. Gate list. Folder static/js/widgets/gate-list/gate-list.js, type
   gate_list, label Gate List. Markup from ade.html's glPane. The gate
   list functions from chat.js, lines 248 to 444, as the module body.
   Binds to a region the same way. Subscribes to ask, gate_pending,
   chat_history. Settle sends the answer frame with text y, n, or queue
   and the gate id, as boot.js does.
3. Shared. _groupTurns and _buildTurnBlock go to
   static/js/widgets/shared/turns.js so E10 and E13 import them.
4. Styles. Copy the rules the grep found into each widget's style block
   with the same class names. Do not rename classes.

## Do not

- Do not port the focus mirror pane. List it under blockers.
- Do not couple the two widgets. No import between them.
- Do not change the frame vocabulary.
- Do not touch the Phase 2 chat or mini queue.

## Blockers, for the receipt

- Follow mode. The old focus pane used the follow frame and mirror
  frames. Whether it becomes a mode of anchor_chat or its own widget is
  Brandon's call. Note what it would need.

## Acceptance

- Anchor chat bound to a region streams a turn, shows thinking, renders
  fences, and its Stop ends the turn.
- Gate list bound to the same region shows the ask, settles it, and the
  turn continues.
- Reset the region. Both widgets follow to the new id.

## Receipt

Edits by file. Two registry rows. The shared module's exports. Blockers.
