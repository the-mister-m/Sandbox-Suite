# SPEC-test-queue — Job 4, Phase 3 test pass

Widget: `queue` (registry type `queue`)
New file: static/js/widgets/queue/queue.js (168 lines, no css in that folder)
Build spec: Docs/Specs/SPEC-D6-chat-queue.md, PART 3 (lines 76-82)
Old pane: Docs/reference/ide-panes/queue.js (191 lines, pre-Phase-1 ADE)
Harness: `--widget queue --session 6ab8273846b3 --hold 45`
Session is fresh, no model registered, zero gate records. Everything that
needs a row on screen is marked untestable, not passed.

## RENDER

What the screenshot shows (queue-widget.png, queue-full.png):
- Frame title bar: "Queue · queue-mtqhafl4-1", options link, close x. Frame chrome, not the widget.
- Header row: pill reading "0 records · 0 pending", button "refresh".
- Body: one line, "no gate records on this session".
- Nothing else. No filter, no columns, no row template visible.

What D6 PART 3 specifies:
- One view called queue. Present.
- Every gate record for the bound session. Cannot be seen, session is empty.
- Pending rows first, then resolved. Cannot be seen, session is empty.
- cache ttl and exclude dynamic as the widget's own options, not edit_track sends. Not visible in the widget body; nothing in queue.js draws them.
- The daemon simple log page is not this widget. Correct, queue_log is a separate registry row.

What the old pane had (Docs/reference/ide-panes/queue.js):
- Head: label, "awaiting me" review checkbox, refresh button (:163-167).
- Row head: action_type, hook level badge, driver, parked time (:69-72).
- Row body: payload summary, path / command / url / model+task (:40-48).
- Row conditions: one pass/fail badge per stamped condition (:50-55).
- Row actions: approve, deny, edit, delete (:116-136).
- Superseded rows: run / reseq / delete triple dialog instead of the button row (:88-103).
- Approve optionally hold-to-fire (:116-121).

What the new widget draws per row, from code (queue.js:45-93), unverified on screen:
- time, region name, edge/action_type chip, summary or target, and for pending rows approve / deny / queue.
- Click a row toggles a `<pre>` JSON detail fetched with `ledger_detail`.

## MISSING ELEMENTS

- "awaiting me" review filter — old :165, absent in new. D6 does not ask for it; Brandon's "new queue that never arrived" most likely means this.
- edit (modify-then-approve) — old :123-135, absent. New row actions are approve / deny / queue only (gate-common.js:86).
- delete action — old :136, absent.
- superseded handling and the run / reseq / delete triple — old :88-103, absent. No `superseded` reference anywhere in queue.js.
- hold-to-fire on approve — old :116-121, absent. Approve fires on one click.
- condition pass/fail badges — old :50-55, absent.
- hook level badge — old :70, absent.
- driver column — old :71, absent.
- cache ttl / exclude dynamic controls — D6 :79-81. The keys exist in this session's grid state (library/grids/6ab8273846b3/w-4muxcsxq.json:15-16) and in the test (Docs/tests/test_chat_queue.py:47), but queue.js only echoes `frame.options` back in getOptions. Whether the frame's "options" panel renders them was not opened, so this is unverified, not proven missing.
- live gate push — queue.js:124 subscribes to feed, ledger_detail, ade_init, track_list. mini-queue.js:99 also subscribes gate_broadcast, ask, gate_pending. A gate that arrives or settles elsewhere does not reach the queue until someone clicks refresh.

## CHECKLIST

Lines derived from SPEC-D6 PART 3 and the D6 RULES/LANE that bind this widget.

1. One view, called queue — PASS. Single registerWidget("queue"), registry row 4, title renders.
2. Bound to a session, shows that session's gate records — UNTESTABLE. Zero records; code takes G.actionRecords(feed) with no region filter, so it looks session-wide, unproven.
3. Pending rows first, then resolved — UNTESTABLE on screen. Code sorts pending-first then newest parked (queue.js:27-32); logic reads correct.
4. cache ttl and exclude dynamic are the widget's options, not edit_track sends — PASS in the negative half: no `edit_track` string in queue.js. UNTESTABLE in the positive half: no options UI was opened, nothing in queue.js renders them.
5. Daemon simple log page is not this widget — PASS. queue_log is its own type and file.
6. Registry entry seeded, no registry edit needed — PASS. library/registry/widgets.json:4.
7. Comments are label, function, state only; "spine" absent — PASS. queue.js:1-9.
8. Widget loads in matrix.html after its shared dependency — PASS. gate-common.js:34 loads before queue.js:41.
9. Empty state is handled — PASS. "no gate records on this session" renders.
10. Refresh control works — UNTESTABLE. Button exists and sends `feed`; not clicked, and with zero records a successful click is indistinguishable from a dead one.
11. Row detail expands on click — UNTESTABLE. No rows.
12. approve / deny / queue settle a pending row — UNTESTABLE. No pending rows.

Count: 5 pass, 0 fail, 7 untestable. Nothing failed because almost nothing could run.

## CONSOLE

- `[console:error] Failed to load resource: the server responded with a status of 404 (NOT FOUND)` — one line, no URL given. The identical line appears in Docs/Reports/phase3-test/anchor_chat-console.txt, so it is page-level, not queue-specific. Every `/static/...` href and src in matrix.html resolves to a file on disk, so this is not a missing widget asset. Source not traced.
- No other errors or warnings. No exceptions from queue.js.

## FIX LIST

1. Class collision: the queue settle button gets `cq-queue` (gate-common.js:88), the same class as the widget wrapper (queue.js:104), and `.cq-queue` at matrix-chat-queue.css:4 sets `display:flex; flex-direction:column; height:100%`. The button inherits the wrapper's layout. Rename one of the two.
2. Add the "awaiting me" pending-only filter the old pane had.
3. Subscribe queue to `gate_broadcast`, `ask`, `gate_pending` the way mini-queue does, so rows land without a refresh click.
4. Confirm the cache ttl and exclude dynamic rows actually render in the frame's options panel; wire them if they do not.
5. Decide, with Brandon, whether edit / delete / superseded / hold-to-fire come back. They are old-pane features D6 never asked for.
6. Re-run this widget against a session that has gate records, so items 2, 3, 10, 11, 12 on the checklist can be graded.

## READS

- Docs/Specs/SPEC-D6-chat-queue.md — full
- static/js/widgets/queue/queue.js — full
- Docs/reference/ide-panes/queue.js — full
- Docs/Reports/phase3-test/queue-widget.png, queue-full.png, queue-console.txt — harness output
- Docs/Reports/phase3-test/anchor_chat-console.txt — one line, to compare the 404
- static/matrix.html — grep hits only (script and stylesheet lines)
- library/registry/widgets.json — grep hits only (3 lines)
- static/js/widgets/mini-queue/mini-queue.js — grep hits only, overlap check
- static/js/widgets/shared/gate-common.js — beyond the read list. Grep for exports, then lines 82-108 to learn what settleButtons draws
- static/css/matrix-chat-queue.css — beyond the read list. Grep for cq- selectors, then lines 1-12 and 226-240 to confirm fix 1
- library/grids/6ab8273846b3/w-4muxcsxq.json — grep hit lines only (2 lines)

## BLOCKERS

- The test session has no gate records, so seven of twelve checklist lines are ungraded. A fix job cannot verify row rendering, sorting, settle, or detail expansion until a session with parked gates exists.
- Fix 1 lives in shared files (gate-common.js and matrix-chat-queue.css) used by chat and mini-queue as well. It is not a queue-only edit.
- The queue widget has no css of its own; all styling is in static/css/matrix-chat-queue.css, shared with chat and mini-queue.
- Fix 5 is Brandon's call, not a fix job's.
- The 404 is untraced and was not chased. It is not queue's.
