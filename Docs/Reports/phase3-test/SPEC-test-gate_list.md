# SPEC-test-gate_list

Phase 4 Wave B, box B4. Widget `gate_list`, driven live 2026-09-07 14:26-14:39 EDT.
Session `9883b6bec3df`, track `5a031370bf1c`, region `481ac26ee513` "b4claude"
(claude / sonnet), mounted for this test and dropped after.

File: `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/gate-list/gate-list.js`
(338 lines, no css file in the folder — styles injected at :218-252).

Driven with a real anchor-chat in the same window bound to the same region, per
the box's pairing rule. Driver scripts in the session scratchpad
(`b4_gate.py`, `b4_settle.py`).

Screenshots: `Docs/Reports/phase3-test/b4/`.

---

## RENDER

Mounted at 12x12 slot col 8 row 1 w 5 h 12, next to an anchor-chat.

- Empty state: `no gates on this track` (gate-list.js:113). Seen at
  `01-mounted-unbound.png` and again after every bind — the widget comes up
  empty and stays empty until a gate fires.
- Live gate row: `now` · yellow pulsing `?` pip · the gate prompt in mono ·
  yellow `ASK` badge, then a second line `waiting on you` with three buttons
  `approve` / `deny` / `queue`. `10-gate1-ask.png`, `31-gate-ask.png`.
- Settled row: `done` · blue `A` pip · prompt · blue `APPROVED` badge, whole
  row at 58% opacity, settle buttons gone. `11-gate1-settled.png`,
  `20-after-gates.png`, `32-after-settle-click.png`.
- Layout is correct here — unlike anchor-chat, `.cp-gates` gets `flex:1` inside
  `.mx-gate-list` but the rows are plain flex children, so it fills the host
  without needing `.mx-host` to be flex.

---

## READ LINE CONFIRMED OR REFUTED

Read line: "binds by `options.region`. Waits on `chat_history`, which the server
sends only to the socket that sent `anchor`. Gate-list never sends `anchor`. So
its history rows appear only when an anchor-chat for the same region is in the
same window. `ask` and `gate_pending` come from engine/web_io.py during a turn.
Settle sends `answer` with text y, n, or queue."

CONFIRMED on every mechanical claim, and the history half is REFUTED in
outcome — history rows do not appear even with the anchor-chat present.

- Binds by `options.region`: confirmed. `regionOf()` at :212-214, `onOption`
  at :293-300. Setting the option cleared the list and re-rendered as written.
- Never sends `anchor`: confirmed. There is no `frame.send` at mount
  (:257-287); the only send in the file is the settle at :278-280.
- `chat_history` is anchor-only: confirmed at ade/frames.py:265 inside
  `_anchor()`, and Docs/HOWTO-frames.md line 88 lists the same four call sites.
- `ask` / `gate_pending` from a live turn: confirmed on the wire. One `ask`
  and one `gate_pending` captured per gate (`gate-frames.json`).
- Settle sends `answer` with y/n/queue: confirmed at :210 and :278-280.
  That frame is the wrong one — see FIX LIST.

Where it is refuted: the anchor-chat was in the same window, on the same
socket, bound to the same region, and `chat_history` arrived twice for
`481ac26ee513` — both times with **zero records**, including after the region
already had a completed write gate in the ledger. So history rows never show,
regardless of the anchor-chat. Cause below.

---

## CHECKLIST

**With anchor-chat bound to the same region, history rows show — FAILED.**
`settle-history.json`: `chat_history` id `481ac26ee513`, `n: 0`; gate-list
`gates` array length 0 at bind. `30-rebound-history.png` shows the empty
placeholder on a region that had already written a file under gate.
Root cause is server-side, not the widget:
- ade/frames.py:253-256 `_track_gatelog(track_id)` keeps ledger rows where
  `r.get("track") == track_id`, and `_anchor()` (:265) passes the **region**
  id.
- engine/ledger.py:136 writes `"track": sess.track`, and ade/tracks.py:401
  sets `sess.track` to the **parent track** id (`sess.region` holds the region
  id, :400).
- Ground truth: every one of the 109 action rows in
  `archives/9883b6bec3df/log.jsonl` carries `track: 5a031370bf1c` or
  `a104ecc9ea23` — both track ids. No row ever carries a region id, so the
  filter can never match and `chat_history.records` is always `[]`.
gate-list's `_histRows()` (:89-108) is therefore dead code in the current
server; it was not exercised.

**A live gate shows as ASK — SEEN.**
`10-gate1-ask.png` (gate `7617d9f177e5`) and `31-gate-ask.png` (gate
`da15630caa01`). Yellow pip, `ASK` badge, prompt text
`write  b4test.txt  [create]\nb4ok\n\napply? [y/N]`, settle buttons present.
Frames behind it, from `gate-frames.json`:
`{"type":"ask","id":"7617d9f177e5","region":"481ac26ee513","prompt":"write  b4test.txt …"}`
and one `gate_pending` with the same id in `active`.

**Settle changes the badge — SEEN, and the badge is not true.**
The badge does change: `11-gate1-settled.png` and `32-after-settle-click.png`
both show `done` / blue `A` / `APPROVED` within ~1s of the click. But the click
does not settle the gate on the server. Proof, from the `b4_settle.py` run:
- 14:38:27 clicked gate-list's own `approve` on gate `da15630caa01`.
- 14:38:47, twenty seconds later, still nothing: the last `out` frames were
  the model's own `WRITE: b4test.txt / ---BEGIN--- / b4ok / ---END---`, no
  write result, no turn progress. `33-20s-after-click.png`.
- 14:38:48 sent `{type:"gate_action", action:"approve", id:"da15630caa01"}`
  on the same socket, same gate id.
- 14:39:03 the model had moved on: `out` tail reads
  `"Step 1 done", ". Step 2 next", ": re", "ading b4test.txt."`.
  `34-after-gate-action.png`.
- Ledger row for that gate: `outcome: fired`, `answer: True`,
  `answered_by: human`, followed by `action write_file … 'content': 'b4ok\n'`
  `outcome: fired`. `/Users/moth3rship/Desktop/b4test.txt` appeared, 5 bytes,
  contents `b4ok`.
The first run tells the same story from the other end: gate `7617d9f177e5` was
clicked approve in gate-list at 14:26, the row went `APPROVED`, and 150s later
the ledger recorded `outcome: parked`, `answered_by: timeout` while
anchor-chat printed `[gate timed out — parked in the queue]`
(`20-after-gates.png`). The widget said APPROVED; the server said timeout.

**Cross-region leak — SEEN, driven.** `ask` carries a `region` field
(engine/web_io.py:50) and every `gate_pending` row carries one (:137-143), but
gate-list's `onFrame` (:302-335) never reads `msg.region`. Driven at 14:43:09
with two gate-lists in one window: one bound to the live region
`fd4f0c30551c`, the other to `481ac26ee513`, a region that had already been
replaced and no longer exists. A read gate fired on the live region and **both
lists showed it** — same `now` / yellow `?` / `read /Users/moth3rship/Deskto…`
/ `ASK` row, both with live approve/deny/queue buttons.
`83-leak-check.png`; driver log line
`LEAK CHECK: gate-list bound to the dead region holds ["8e34b83a185f"]`.
A gate-list bound to a dead region is still offering to settle another
region's gates.

---

## CONSOLE

One `[console:error] Failed to load resource: 404` per page load — the known
page-level favicon 404 from the shared-setup list. No other console errors, no
pageerrors, across three driver runs. `b4/gate-console.txt`,
`b4/settle-console.txt`.

---

## FIX LIST

1. `static/js/widgets/gate-list/gate-list.js:278-280` — settle sends
   `{type:'answer', text:'y'|'n'|'queue', id, track}`. `ade/frames.py:681`
   says in its own comment: "the in-turn ask reply only; approve, deny and
   queue ride gate_action". Because a `track` is named, the handler takes
   `track.hub.resolve_gate(gid, text)` (:694), which only resolves the hub's
   in-turn ask slot `_pending_gate_id` (ade/tracks.py:290-297). A queued gate
   sits in the deferred queue awaiting `dq.await_answer`
   (engine/agent_loop.py:411-413), so `_pending_gate_id` is `None`, the call
   returns `False`, and nothing is sent back. Silent no-op. The frame the
   server acts on is `gate_action` (ade/frames.py:520-528), which is what
   strip, queue-log and changes all use. This is the box's headline defect.
2. `static/js/widgets/gate-list/gate-list.js:267-277` — the row is repainted
   `APPROVED` optimistically, before any acknowledgement. Even after fix 1 this
   would show a green light for a gate that timed out or was denied elsewhere.
   The badge should follow a server frame, not the click.
3. `ade/frames.py:253-256` + `:265` — `_track_gatelog` filters ledger rows on
   the region id against a field that holds the track id
   (engine/ledger.py:136, ade/tracks.py:400-401). `chat_history` is therefore
   always empty for any region, which silently disables gate-list's whole
   history path. Same class of region-vs-track id mismatch B1 saw in the feed.
4. `static/js/widgets/gate-list/gate-list.js:302-335` — no `msg.region` filter
   on `ask` or `gate_pending`, though both frames carry one. Proven live: two
   gate-lists in one window, one of them bound to a region that no longer
   exists, both drew the same gate with working settle buttons
   (`83-leak-check.png`).
5. `static/js/widgets/gate-list/gate-list.js:326-331` — `region_replaced` is
   handled, but a gate-list left bound to a stale id that was never replaced
   (a killed region, say) keeps drawing and offering to settle. With fix 4 in
   place this would fall out; without it the widget's bind is decorative.

---

## READS

- Docs/Specs/SPEC-phase4-test-waves.md:1-45, :103-132 (Shared setup, B4)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B2.md (full)
- static/js/widgets/gate-list/gate-list.js (full, 338 lines)
- static/js/widgets/anchor-chat/anchor-chat.js (full, 699 lines)
- Docs/tests/matrix_harness.py (full, basis for the driver scripts)
- static/js/matrix/grid.js:185-235, widget-frame.js:40-110, socket.js:1-75
- library/registry/widgets.json:11-12 (grep)
- Docs/HOWTO-frames.md (grep: anchor, answer, chat_history, track_transcript)
- ade/frames.py:250-275 (_track_gatelog/_anchor/_detach), :437-475
  (_do_insert_region), :520-528 (_do_gate_action), :560-580 (insert_region /
  anchor dispatch), :629-640 (reset_track), :680-700 (answer)
- ade/web_io.py:93-130 (region_replaced, track_created, track_transcript,
  chat_history)
- ade/tracks.py:290-297 (hub.resolve_gate), :392-405 (sess.region / sess.track)
- engine/web_io.py:26-50, :137-143, :159-184 (out / ask / gate_pending /
  meters / status), :100-121 (resolve_gate)
- engine/agent_loop.py:400-425 (gate park, await_answer, timeout)
- engine/settings.py:62 (gate_wait_s default 150)
- engine/ledger.py (grep "track": — :136 log_event)
- archives/9883b6bec3df/log.jsonl (ground truth, read across all runs)
- Docs/Reports/phase3-test/SPEC-test-anchor_chat.md:1-60 (Phase 3 baseline)

---

## BLOCKERS

- `_histRows()` (:89-108) could not be exercised at all, because the server
  never delivers a non-empty `chat_history` for a region (fix 3). Whether that
  rendering path works is unknown, not passing.
- Because the settle button is a no-op, every gate in this box that actually
  had to resolve was resolved with a raw `gate_action` frame instead. The
  checklist line "settle changes the badge" is answered on the widget's own
  control; "settle settles the gate" is not, and cannot be until fix 1 lands.

## W4 — 2026-09-07

- History without anchor-chat (W2's new `chat_history` server frame):
  SEEN. gate-list bound to a region, with no anchor-chat mounted anywhere
  in the window, rendered a prior settled/timed-out gate row via its own
  `chat_history` request.
- Live pending row within the gate's wait window: FAILED, root cause
  found. Mounted gate-list bound to a live region *before* a real
  `run_command` gate parked server-side (confirmed via `queue.json`:
  `hook: "ask"`, unresolved, ~150s window) — no live row ever drew, across
  four separate attempts including one check made while the gate was
  confirmed still pending. Cause: gate-list.js's `onFrame` only handles
  `ask` / `gate_pending` (:317-338); a full capture of every frame type
  the socket received during a live gate showed `gate_broadcast` fire
  instead — a session-wide broadcast (`ade/web_io.py:210-215`) that
  already carries the correct `region` field but has no handler here.
  strip.js and mini-queue.js already handle `gate_broadcast`; gate-list.js
  does not. This is a different defect than "the region field is empty" —
  the frame gate-list filters on never arrives at all. Full detail and the
  captured frame-type array: RECEIPT-phase4-W4.md item 14.
