# RECEIPT — D6 — Chat, Mini Queue, Queue

Job 6, Wave 4. Spec: [SPEC-D6-chat-queue.md](../Specs/SPEC-D6-chat-queue.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Receipts read first: [RECEIPT-D1-settings.md](RECEIPT-D1-settings.md),
[RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md),
[RECEIPT-D3c-end-closes-sockets.md](RECEIPT-D3c-end-closes-sockets.md),
[RECEIPT-D4-suite-library.md](RECEIPT-D4-suite-library.md),
[RECEIPT-D5-matrix.md](RECEIPT-D5-matrix.md).
Transcript window: 2026-09-06 15:50 to 16:33 UTC.

## THE TWO HEADLINE ANSWERS

**The mini queue was built.** `static/js/ade/chat.js` draws gate rows under
its transcript today — `gateListEl` is a member of the chat pane
(`makeChatPane`, line 718; `_renderGateListInto`, line 347; the approve /
deny / queue buttons, line 426). That is the mini queue, so it became a
widget. No further searching was done.

**The answer translation was removed.** `frames.ANSWER_ACTIONS` and the
fallback that called `_do_gate_action` from an `answer` frame are gone. The
`answer` handler now does only what it did before Job 3b: resolve an in-turn
ask through the region hub or the socket's own gate queue. Every gate word
this job puts on the wire is `gate_action`.

## EDITS

### [ade/frames.py](../../ade/frames.py)

- Line 509 (was) — `ANSWER_ACTIONS` and its comment, deleted.
- Lines 647-664 — the `answer` handler. The `landed` bookkeeping and the
  three-line translation fallback are gone; the two resolve calls stand on
  their own. State comment above it names where the gate vocabulary lives.

### [static/js/matrix/widgets/gate-common.js](../../static/js/matrix/widgets/gate-common.js) — new, 105 lines

`MX.gates`, shared by the mini queue and the queue. `fmtTime`, `regionOf`,
`isPending`, `target`, `color`, `flatten` (a gate record's own hook and
answer sit under `gate_hook` / `gate_answer`), `actionRecords` (the `feed`
frame's action rows, merged gate rows dropped), `namesFrom` and `regionRows`
(the roster off `ade_init` / `track_list`), and `settleButtons` — the three
buttons, each sending `{type: "gate_action", action, id}`.

### [static/js/matrix/widgets/chat.js](../../static/js/matrix/widgets/chat.js) — new, 400 lines

Registers type `chat` against Job 5's frame contract.

- Region binding through `frame.options.region`. A picker in the widget head
  lists the roster; the chosen id is written back into the options, so it
  rides a matrix template and shows in the frame's own options panel.
- Transcript renders true markdown: `marked` parses, `DOMPurify` sanitizes,
  both pinned script tags. With either absent the text still renders, in a
  plain block.
- `anchor` takes the socket's live stream; `transcript` reloads without
  taking it. A "live / not live" pill says which this instance holds and
  takes the stream on click. `out` streams into a live bubble; `status:
  idle` closes it. `mirror` frames for this instance's region are handled
  too, so a region another view focused still draws.
- Meters: `ctx <n>`, current context only, no total, and shown only when the
  region's provider is `kind: "cloud"` in the provider registry
  (`GET /api/library/providers`).
- File drag: a path dropped on the transcript or the input row is read
  through `GET /api/fs/read` and inserted as `[file: <path>]` plus a fenced
  block — the shape the old "to ctx" button used
  ([Docs/reference/ide-panes/editor.js](../reference/ide-panes/editor.js) line 362).
- Speech: `speak` frames go through `speechSynthesis`, `audio` frames through
  an `Audio` element. Both are gated on the `speech_enabled` widget row and
  on a lock in `localStorage` under `mx.speech.lock`, held by instance id,
  renewed while speaking, released on end, error, option-off and unmount, and
  stale after 15 seconds. One chat speaks at a time across the windows of one
  browser. Voice comes from `GET /api/global`'s `voices.tts_voice`.
- Sends: `anchor`, `user`, `stop`, `transcript`. No `answer`.

### [static/js/matrix/widgets/mini-queue.js](../../static/js/matrix/widgets/mini-queue.js) — new, 165 lines

Registers type `mini_queue`. Pending gate rows for the bound session's
regions, newest first, each with region name, edge, prompt or summary, and
approve / deny / queue. Fills from `feed` on mount and on the refresh button,
then follows `gate_broadcast` (`kind: "ask"` adds, `kind: "resolved"`
removes), `ask`, and `gate_pending`. Rows carry the source they came from so
a `gate_pending` sweep prunes only this socket's own rows and leaves the
broadcast rows alone.

### [static/js/matrix/widgets/queue.js](../../static/js/matrix/widgets/queue.js) — new, 160 lines

Registers type `queue`. One view: every action record for the bound session,
pending first then resolved by time. A row click opens its `ledger_detail`
and a second click closes it; a detail is dropped when its record's outcome
moves. Pending rows carry the same three buttons. The two old `edit_track`
sends are gone — `claude_cache_ttl` and `claude_exclude_dynamic` are the
widget tier rows Job 1 added and are this instance's options only.

### [static/css/matrix-chat-queue.css](../../static/css/matrix-chat-queue.css) — new, 245 lines

`cq-` prefixed, skin variables with literal fallbacks, same pattern as
`matrix.css`. Chat turns and markdown blocks, the queue row, the settle
buttons.

### [static/matrix.html](../../static/matrix.html)

Six lines added, nothing reordered: the CSS link, the two pinned CDN scripts,
and the four widget scripts after Job 5's `stub.js` line.

### [Docs/tests/test_sockets.py](../tests/test_sockets.py) — lines 105-133

Three tests asserted the translation. They now assert its absence, and three
more were added for the vocabulary that replaced it:
`test_an_answer_of_y_no_longer_reaches_the_gate_queue`,
`test_an_answer_of_n_no_longer_reaches_the_gate_queue`,
`test_the_answer_translation_is_gone`,
`test_gate_action_approve_answers_the_gate`,
`test_gate_action_deny_denies_the_gate`,
`test_gate_action_queue_defers_the_gate`. Net +3 tests in the file.

### [Docs/tests/test_chat_queue.py](../tests/test_chat_queue.py) — new, 20 tests

Registry seeds the three types; the chat rows are the three speech options
and the queue rows the two claude fields; each widget file registers its own
type; no widget of mine carries the `answer` form; anything with approve or
deny also carries `gate_action`; "world" and "spine" are absent from all
four files; `matrix.html` loads every one plus the stylesheet; the two
markdown libraries are pinned to a version; each file passes `node --check`;
and `GET /api/widget-registry` carries the three types with the chat
defaults.

## DELETED

- `ade/frames.py` — `ANSWER_ACTIONS`.
- `ade/frames.py` — the `answer` handler's translation fallback and the
  `landed` variable that fed it.
- No files deleted.

## TESTS

Command: `python3 -m pytest Docs/tests -q`

    166 passed in 0.31s

126 before Wave 4. 23 of the run above are this job's: 20 in
`test_chat_queue.py` and a net 3 in `test_sockets.py`. The four `.js` files
also pass `node --check`, which the new test file runs as a test rather than
by hand. Jobs 7 and 8 add tests to the same directory in this window, so the
total is a moving number; 166 was the count at the run above, with Job 7's
tests already in it.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. One socket carries one anchored region (`AdeCtx.anchored`, set by the
   `anchor` frame) and one mirror (`ctx.mirror`, set by `focus`). So two chat
   instances in one matrix window cannot both stream live. Widening that is
   `ade/frames.py` outside the gate frames, which the lane forbids. Smallest
   fill: one instance holds the anchor, shown by the live pill; the others
   reload their region's transcript through the `transcript` frame and take
   the stream on a click. Two to four chat windows still each speak and
   stream on their own, because each matrix window has its own socket.
2. `frame.options.region` is not a widget tier row. `WIDGET_ROWS["chat"]` has
   the three speech keys only, and `engine/settings.py` is Job 1's file. The
   widget writes the key into its own options at mount, so the frame's
   options panel shows it and a matrix template carries it. A real `region`
   row would be better.
3. Voice "comes from the session tier". No route serves a session's settings
   bag — Job 4's receipt, question 2, names the same hole. The chat reads
   `voices.tts_voice` from `GET /api/global`, which is what a session
   inherits by default today.
4. `tts_engine` and `listen_mode` are widget rows with no wire. The server
   picks the engine (`engine/web_io.py` line 157: browser and say send a
   `speak` frame, anything else renders and sends `audio`), and nothing
   carries a browser-side engine choice back. `listen_mode` needs a
   microphone path that does not exist. Both are read by the options panel
   and by nothing else. Handling the `audio` frame was added so a non-browser
   engine is not silent.
5. Markdown libraries: nothing is vendored under `static/vendor` but Monaco
   and xterm, so the spec's "from the allowed script host, pinned" branch
   applies. `marked` 12.0.2 and `DOMPurify` 3.0.11 from cdnjs. Model output
   is not trusted HTML, so the sanitizer is a second dependency rather than
   an option. Offline, both fail to load and the transcript renders plain.
6. Code blocks render plain, in `<pre><code>`. Job 8's receipt has not landed
   — `Docs/Reports/` holds no `RECEIPT-D8-*` and `static/js/matrix/widgets/`
   holds no viewer module — so the read-only Monaco path the spec points at
   does not exist yet. Named as the spec asks.
7. The mini queue's live rows come from `gate_broadcast`, `ask`, and
   `gate_pending`; only `feed` gives a region id for a row. A row that
   arrives on `ask` or `gate_pending` shows a blank region until the next
   refresh reconciles it against the feed.
8. Widget instances have no per-type icon or title, so a second chat is told
   apart by its instance id in the widget bar. Not raised by the spec.
9. A harness system-reminder mid-build told me to read and write through bash
   instead of the Read, Edit, and Write tools. The job instruction says the
   opposite and told me to name the conflict once. Followed the job
   instruction; every edit above is a tool call. Jobs 1, 3a, 3b, 3c, 4 and 5
   each named the same conflict.

## OUTSIDE THE LANE, NOT DONE

- `engine/settings.py` — no `region` row was added to `WIDGET_ROWS["chat"]`.
  See question 2.
- `ade/frames.py` — nothing outside the gate frames. The single-anchor and
  single-mirror limits in `handle`, `_anchor` and the `focus` branch stand
  as they were. See question 1.
- `server.py` — untouched. No route was added for a session's settings bag
  or for a session voice. See question 3.
- `static/css/matrix-chat-queue.css` is a new file rather than an edit to
  Job 5's `matrix.css`, so Jobs 7 and 8 do not collide in that file. The six
  lines in `static/matrix.html` are additions in place; nothing there was
  reordered, reformatted or renamed.
- `library/registry/widgets.json` — no edit, as the lane says. The three
  types were already seeded and the mini queue was built, so no "skipped"
  state comment was needed.
- `static/js/ade/chat.js` and `static/js/ade/queuelog.js` were read as
  reference only and not changed. Both still open the retired `/ws/ade`,
  which is D3b's question 1.

## PHASE 3

- One socket, one anchored region, one mirror. Several live chats in one
  matrix window need the server to fan a region's stream to more than one
  subscriber. Question 1.
- A session settings tier with a route, so voice and the other twelve keys
  can be read per session rather than off `global.json`. Question 3, and
  Job 4's question 2.
- A browser-side speech engine and a microphone path, so `tts_engine` and
  `listen_mode` mean something. Question 4.
- Code blocks in a chat transcript should go through the viewer's read-only
  Monaco once Job 8's path exists. Question 6.
- The markdown libraries are CDN script tags. Vendoring them under
  `static/vendor` would make the app work offline.
- A gate row's region id is only carried on the `feed` frame. Question 7.

## STRAY FILES

- None. `Docs/tests/__pycache__` is pre-existing.
- No new directories under `archives/` in this window.
