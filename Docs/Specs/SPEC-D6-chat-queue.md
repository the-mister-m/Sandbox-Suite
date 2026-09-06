# SPEC D6 — Chat, Mini Queue, Queue

Wave 4. Front end plus the gate frames. Opus. Ceiling 180 thousand
tokens. Receipt before 250. Scope: Docs/Scope/SCOPE-phase2-build.md.
Read it first. Then Docs/Reports/RECEIPT-D5-matrix.md for the frame
contract, and Docs/Reports/RECEIPT-D3b-sockets.md for the gate
vocabulary.

```
WAVE 3   Job 4 ─ Job 5  done
              │
         ┌────┼─────────┐
WAVE 4   [Job 6 YOU]  Job 7   Job 8
         └────┴─────────┘
CLOSE    Job 9
```

Job 7 and Job 8 run beside you. Job 7 owns editor and terminal. Job 8
owns browser and viewer. You own chat, mini queue, and queue. The only
server file you touch is ade/frames.py, gate frames only, and the
translation Job 3b left.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language.
- Stay in your lane. Chat is where builders add features. The feature
  list below is the feature list.
- Add nothing not in this spec or the scope.
- These are rewrites against the widget frame, not ports. The old chat
  module in static/js/ade/chat.js is reference only.

## LANE

- static/js/widgets/chat/, new
- static/js/widgets/mini-queue/, new
- static/js/widgets/queue/, new
- ade/frames.py: gate frames and the answer translation only
- library/registry/widgets.json: no edits, the three types are seeded

## PART 1 — CHAT

Start from the stub in Job 5's receipt. One chat instance is one
region's transcript. The widget binds to a region through its options.

- Transcript renders true markdown. Use a markdown library from the
  allowed script host, pinned to a version, or the one already vendored
  if there is one. Code blocks inside markdown go through the same
  read-only Monaco path Job 8 builds for the viewer; if Job 8's receipt
  has not landed, render code blocks plain and name it in your receipt.
- File drag: a file dragged from the browser widget onto the chat input
  inserts a file block, path and contents, the way the old "to ctx"
  button did. Job 8 exposes the drag source; you accept the drop.
- Speech per window. Options come from the chat widget tier rows Job 1
  added. Voice comes from the session tier. One chat window speaks at a
  time: a speaking window holds a lock the other windows in the same
  browser respect. Two to four chat windows may be open.
- Cloud models show the current context in the window, the number the
  meters frame already carries, and no total.
- Gates: chat sends gate_action only. No answer frames. Remove the
  translation Job 3b left in ade/frames.py once every chat send is
  gate_action.

## PART 2 — MINI QUEUE

Its own widget, separate from chat. It shows pending gate rows for the
bound session's regions, with approve, deny, queue on each row, sending
gate_action.

Read static/js/ade/chat.js once to see whether gate rows are drawn
under the transcript today. If they are, that is the mini queue, and
you build it as a widget. If nothing is attached to chat, skip the mini
queue, leave its registry entry with a state comment "skipped, nothing
attached to chat", and say so in the receipt. Do not search further.

## PART 3 — QUEUE

One view, called queue. Every gate record for the bound session, with
pending rows first, then resolved. The old queue view's two edit_track
sends, cache ttl and exclude dynamic, become the queue widget's options
through the queue widget tier rows Job 1 added. The daemon's simple log
page is not this widget and is not yours.

## RECEIPT

Docs/Reports/RECEIPT-D6-chat-queue.md. Sections: EDITS, DELETED, TESTS,
QUESTIONS, PHASE 3, STRAY FILES. State whether the mini queue was built
or skipped and why. State whether the answer translation was removed.
