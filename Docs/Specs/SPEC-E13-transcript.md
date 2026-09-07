# SPEC E13 — transcript widget — Sandbox Suite

Model: sonnet. Wave 5. Receipt: Docs/Reports/RECEIPT-E13-transcript.md,
written before 200K tokens.

## What this is

The old retired chats window as a widget, widened to live regions. One
place for every transcript, live and retired, per session. It reads the
E4 transcript route and the library toggle.

## Decisions, from Brandon

- Transcript is the home for all transcripts in one spot, for the widget
  and the library.
- The library toggle is global with a session override. When it is on,
  the Suite page library shows archives through this same route.

## Read, in this order, nothing else

- static/js/matrix/widget-frame.js. 6 KB, the widget contract.
- Docs/Reports/RECEIPT-E4-archives-context.md, the route and the toggle
  key name. That receipt is written in wave 2 of this phase.
- static/js/widgets/mount/mount.js. 4 KB.
- static/js/widgets/shared/turns.js, from E7.
- static/js/ade/retiredwin.js. 4 KB, the design.
- static/ade-retired.html lines 12 to 73, the markup and its style.
- static/js/suite/library.js. 10 KB. Read only the saved sessions
  section.
- library/registry/widgets.json.

## Build

1. Folder static/js/widgets/transcript/transcript.js, type transcript,
   label Transcript. Same markup as ade-retired.html. Style block from
   its inline rules.
2. Data from GET /api/transcripts?sid=<bound session>. Live regions
   listed first with a live dot, retired after with the retired dot.
   Caches under each as before. Reading a cache uses the existing
   retired chat route.
3. Turn blocks from turns.js.
4. Suite page library: when session_effective says the toggle is on, the
   saved sessions section links each session to its transcripts through
   the same route. When off, the section is as it was.

## Do not

- Do not change how caches are read or archived.
- Do not open windows.

## Acceptance

- A live region and a retired one both list under the bound session.
- Reading a retired cache renders its turns.
- Toggle on: the library links to transcripts. Toggle off: unchanged.

## Receipt

Edits by file. Registry row.
