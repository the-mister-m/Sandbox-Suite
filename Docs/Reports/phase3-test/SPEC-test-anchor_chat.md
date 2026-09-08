# SPEC-test-anchor_chat

Phase 3 test pass, Job 2. Widget `anchor_chat`.
Harness run 2026-09-06 20:03:43 → 20:04:28, session `6ab8273846b3`, hold 45s.
Outputs: `Docs/Reports/phase3-test/anchor_chat-full.png`, `anchor_chat-widget.png`, `anchor_chat-console.txt`.

New file: `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/anchor-chat/anchor-chat.js` (699 lines, no css file in the folder).
Old reference: `git show HEAD:static/js/ade/chat.js` (1054 lines), mounted at `git show HEAD:static/js/ade/boot.js` line 1181, markup at `git show HEAD:static/ade.html` lines 42-72.

I did not drive the widget. The harness mounts, holds, and screenshots — it has no interaction flags (`--widget --session --hold --out` only). Everything below is render evidence plus static comparison.

---

## RENDER

What the screenshot shows, top to bottom:
- Frame bar: `Anchor Chat · anchor_chat-mtqh9n8l-1`, `options`, close.
- A ~20px empty strip where the transcript should be. No `.empty` placeholder text, no turns.
- Input row: textarea placeholder `Message the bound region…`, `Send` and `Stop` stacked to the right.
- Meters row: `IDLE  ctx —  cache —  t/s —  avg —`.
- Roughly 90px of dead space below the meters row, inside the frame.

What the old anchor pane rendered (ade.html 42-72):
- Pane title bar with zoom out / zoom label / zoom in.
- `#anchorBody.cp-script` filling the pane height, with `.cp-jump-bottom` overlaid.
- `.cp-busy` hidden bar.
- Input row with `#anchorInput`, `#anchorSend`, `#anchorStop`.
- `.cp-meters` row.
- Separate gate pane `#glList` with `#glTrackName` — intentionally moved to the gate-list widget, not counted as missing.

Difference: the vertical layout is inverted. The transcript is squeezed to nothing and the slack sits under the meters. Cause is CSS, not JS: `.mx-anchor-chat` (anchor-chat.js:491) has zero rules — it is not in the injected stylesheet (anchor-chat.js:389-468) and there is no widget css file. Its parent `.mx-host` (static/css/matrix.css:102) is `flex:1 1 auto; min-height:0; overflow:auto` but is **not** `display:flex`, so `.mx-anchor-chat` is a plain block at natural height and every `flex:1` inside it — `.cp-script`, `.cp-scriptwrap` — resolves to nothing.

The busy bar is correctly hidden (`busy-hidden`, no phase). Meters render their placeholder text as authored.

---

## MISSING ELEMENTS

Old ids/classes/controls with no counterpart in the new widget. `ade.html` and `boot.js`/`chat.js` line numbers are at `HEAD`.

- `#anchorZoomOut` / `#anchorZoomLbl` / `#anchorZoomIn` — ade.html:49-51, wired boot.js:842. No zoom control ported; the ported CSS still reads `var(--cp-zoom, 1)` at anchor-chat.js:401, :415, :423 and nothing ever sets it.
- `#glTrackName` name element — ade.html:87, written by chat.js:826 `if (nameEl) nameEl.textContent = trackName`. New widget has no name element and always calls `setTrack(id, '')` (anchor-chat.js:480, :673), so `trackName` is permanently `''` and every turn block gets an empty row name.
- `title="jump to latest"` on `.cp-jump-bottom` — ade.html:57. New button has text only (anchor-chat.js:499).
- `cp-stop-fired` flash on Stop — boot.js:725 added the class for 600ms. The keyframes are ported (anchor-chat.js:412-413) but `stopBtn.onclick` (anchor-chat.js:647-651) never adds the class. Stop gives no visual feedback.
- `.cp-stop:disabled` state — CSS ported at anchor-chat.js:411, never applied. Old shell disabled the focus-pane stop (boot.js:1189).
- `clear()` pane method — chat.js:836. Not on the new pane object (anchor-chat.js:580-615).
- `getTrackId()` pane method — chat.js:885. Not exposed; the region id lives on `frame._anchorChat.region` instead.
- `.empty` styling — the widget still emits `<div class="empty">no turns on this track</div>` (anchor-chat.js:593) but no `.empty` rule exists in the injected style or in static/css/matrix.css.
- `#glList` gate list, `renderGate`, `renderGateHistory` — chat.js:796-820. Deliberately moved to the gate-list widget per the widget header comment. Not a defect.
- Mirror/focus exports `renderMirror`, `mirrorAttach`, `mirrorDetach`, `appendMirrorEcho`, `wireMirrorSettle` — chat.js:905-1016. Out of this widget's scope.

---

## CHECKLIST

- **Anchor chat: pane sends/receives** — FAIL on render, UNTESTABLE end-to-end. The pane cannot show anything received because the transcript area has no height (see RENDER). Send wiring is present (anchor-chat.js:622-639) and the frame shape `{type:'user', text, inst, track}` matches the server handler at ade/frames.py:589-600.
- **Anchor chat: binds to a region** — FAIL. `defaults: { region: '' }` (anchor-chat.js:485), so `_bind` at mount (anchor-chat.js:654) sends no `anchor` frame and the widget comes up bound to nothing. Nothing in the widget offers a region to pick; the only path is the generic per-instance options panel (widget-frame.js:105-138). The screenshot confirms an unbound, empty pane.
- **Anchor chat: re-anchors on region change** — UNTESTABLE. Code exists and the hook is real: `onOption` (anchor-chat.js:661-664) is invoked by widget-frame.js:100, and `region_replaced` (anchor-chat.js:688-690) matches the server broadcast at ade/frames.py:135 / ade/web_io.py:96. Not exercised — no interaction in the harness and no region to change from.
- **Anchor chat: Send and Stop both work** — UNTESTABLE end-to-end, PARTIAL by inspection. Both buttons render and both are wired. Stop's frame `{type:'stop', inst, track}` matches ade/frames.py:613-617. With `region: ''` the `track` field is omitted and the server falls back to `ctx.anchored`; with nothing anchored a send produces `[no track anchored]` on the global out stream (ade/frames.py:597). Stop is missing its fired flash (see MISSING ELEMENTS), so even a working Stop looks inert.

Additional finding, not on the checklist but it affects "receives": `out`, `status`, and `meters` are emitted by engine/web_io.py:26, :159, :184 with **no track or inst field**. The widget's `onFrame` renders every one of them unconditionally (anchor-chat.js:676-684) — it only region-filters `track_transcript` (anchor-chat.js:672). Two anchor_chat instances bound to different regions will both render the same stream. The old shell got away with this because the session had exactly one anchored track.

---

## CONSOLE

`Docs/Reports/phase3-test/anchor_chat-console.txt`, whole contents:

- `[console:error] Failed to load resource: the server responded with a status of 404 (NOT FOUND)` — one line, no URL captured by the harness.

Traced as far as I can without reading the harness: every `/static/...` `src` and `href` in static/matrix.html resolves to a file that exists on disk (checked all of them), and matrix.html declares no favicon link. The most likely source is the browser's automatic `/favicon.ico` request. **Not from this widget** — anchor-chat.js issues no `fetch`, no `XHR`, and loads no external resource; its only styling is an injected `<style>` block. I did not confirm the URL, and the harness does not record it.

No other errors and no warnings. Notably there is no error from `MX.turns` — static/js/widgets/shared/turns.js loads at matrix.html:37, ahead of anchor-chat.js at matrix.html:47, so `MX.turns._groupTurns` / `_buildTurnBlock` (turns.js:117, :141, exported turns.js:209) are available.

---

## FIX LIST

Smallest first.

1. Give `.mx-anchor-chat` a rule: full-height flex column with `min-height:0`. This alone restores the transcript area. — anchor-chat.js:389-468 (injected style), class applied at :491.
2. Add a `.empty` rule to the injected style so the "no turns on this track" placeholder is legible.
3. Add the `cp-stop-fired` class for 600ms in `stopBtn.onclick` so Stop shows it fired, matching boot.js:725.
4. Put the `title="jump to latest"` attribute back on the jump button.
5. Give the widget a real default or first-run affordance for `region` — either default to the session's currently anchored region or render a "no region bound" state in the transcript area instead of blank.
6. Region-filter the streaming frames: either have the widget ignore `out`/`status`/`meters` unless it is the anchored instance, or add a track/inst field server-side at engine/web_io.py:26/:159/:184. Needs a decision before it is coded.
7. Surface the bound region's name in the widget — carry a name into `setTrack` instead of the hardcoded `''` at anchor-chat.js:480 and :673, so turn blocks are labeled.
8. Decide on zoom: either port the zoom controls or drop the dead `var(--cp-zoom, 1)` references from the injected CSS.
9. Handle `track_status` (ade/web_io.py:200) if per-region phase is wanted; the widget currently subscribes only to the global `status`.

---

## READS

Read in full:
- `/Users/moth3rship/Desktop/AI Design/Sandbox Suite/static/js/widgets/anchor-chat/anchor-chat.js`
- `git show HEAD:static/js/ade/chat.js` — dumped to scratchpad, read lines 205-259 and 700-909, grepped the rest

Read by grep hit lines only:
- `static/matrix.html` — script tags
- `library/registry/widgets.json` — the anchor_chat row
- `git show HEAD:static/js/ade/boot.js` — chat mount, `_sendStop`, zoom wiring
- `git show HEAD:static/ade.html` — anchor pane markup

Reads beyond the assigned list, taken to trace the render bug and verify the frame contract, all grep or short `sed` windows:
- `static/css/matrix.css` lines 95-115 — `.mx-host` rule, the cause of the collapse
- `static/js/matrix/grid.js` lines 282-298 — host element creation
- `static/js/matrix/widget-frame.js` — grep for host/subscribe/onOption/options
- `static/js/matrix/registry.js` — grep for registerWidget hooks
- `static/js/widgets/shared/turns.js` — grep for `MX.turns` exports
- `ade/frames.py` lines 570-620 — anchor / user / stop handlers
- `ade/web_io.py` — grep for frame type strings
- `engine/web_io.py` — grep for out / status / meters emitters
- `server.py` — grep for frame type strings
- `Docs/tests/matrix_harness.py --help` — confirmed no interaction flags

Screenshots read: `anchor_chat-full.png`, `anchor_chat-widget.png`. Console read: `anchor_chat-console.txt`.

---

## BLOCKERS

- The layout collapse is a CSS-only bug in a stylesheet the widget injects itself. A fix job editing `anchor-chat.js` is enough; nothing in `static/css/matrix.css` needs to change, and it should not be changed, since `.mx-host` is shared by every widget.
- Nothing in this widget can be exercised until a region is bound. The harness cannot bind one. A fix job that wants to verify Send/Stop needs either a harness that sets `options.region`, or a manual pass in Brandon's Chrome window.
- No model is registered in session `6ab8273846b3`, so a send will not produce a reply regardless. Report says nothing about model behavior because none was observed.
- Fix 6 (region-filtering the stream) is a contract change between `engine/web_io.py` and every widget that listens to `out`. It is not a one-file fix and should not be done blind — it needs Brandon's call.
- The 404 URL is unconfirmed. If it matters, the harness needs to log failed request URLs; the current console file records only the message.

---
---

# B4 — Phase 4 Wave B, driven live

Appended 2026-09-07 by box B4. The Phase 3 section above stands; it was a
render-only pass with no region bound. This section drives the widget against
live regions on session `9883b6bec3df`, track `5a031370bf1c`, paired with a
gate-list in the same window per the box's pairing rule.

Regions used and dropped: `481ac26ee513` b4claude (claude/sonnet, later reset
to `fd4f0c30551c`), `5f2653efe80b` b4gemma (ollama/gemma4:e4b-it-q8_0),
`3483ba1b0b6e` b4stop (claude/sonnet), `3a74cb29c5ed` b4fence (claude/sonnet).

Screenshots: `Docs/Reports/phase3-test/b4/`.

---

## RENDER

The Phase 3 layout finding is unchanged and now visible with content in it.
`91-stop-midstream.png` and `92-after-stop.png` are a full-width 12x12 mount:
transcript, busy bar, input row and meters stack correctly and in order, then
roughly 380px of dead frame below the meters row. `.mx-anchor-chat` still has
no rules of its own (the injected sheet at :389-468 styles only the children)
and `.mx-host` is still not `display:flex`, so the widget sits at its natural
content height rather than filling the host. Nothing new to add to the Phase 3
diagnosis; it is simply now confirmed with a live, scrolling transcript.

New, seen only under load: with a long stream the transcript does grow and
scroll, the `↓ latest` jump button appears when you scroll off the bottom, and
the busy bar renders `WORKING ● ... wait 5.3s think 6.5s work 2.0s` with the
active timer highlighted (`91-stop-midstream.png`).

---

## READ LINE CONFIRMED OR REFUTED

Read line: "sends `anchor` on bind, gets `track_transcript` and `chat_history`.
Subscribes `out`, `status`, `meters` raw; those frames carry no region
(engine/web_io.py:26, 184). Two anchor-chats on one socket both draw every
region's stream."

CONFIRMED, all four parts, and the last one driven.

- `anchor` on bind: `_bind()` at :477-482, called from `mount` (:654) and from
  `onOption` (:661-664). Confirmed on the wire — every `setOption('region', …)`
  was followed by a `track_transcript` + `chat_history` pair for that id.
- `out` / `status` / `meters` carry no region: confirmed at source.
  engine/web_io.py:26 `{"type":"out","text","dim","end"}`, :184
  `{"type":"status","phase"}`, :159 `{"type":"meters","meters"}` — no region
  field on any of the three. Compare `ask` at :50 and `term` at :162-165, which
  do carry one.
- **Two anchor-chats both draw every region's stream: SEEN.** Two instances in
  one window, A bound to the claude region `481ac26ee513`, B bound to the
  gemma4 region `5f2653efe80b`. One turn sent from B's own send box. Both panes
  ended with the identical trailing text
  `…I will reply with the requested text.agent hello from gemma.` and the
  identical meters `ctx 4.5K/32.8K cache 0 t/s 67.4 avg 67.4` — 32.8K is
  gemma4's context window, painted onto a pane bound to a 200K claude region.
  A's turnblocks went 2 → 3 and its thinking blocks 1 → 2 on a turn it had
  nothing to do with. `41-turn-on-gemma-both-panes.png`,
  `b4/anchor-state.json`.
- Worth adding, because it makes the leak worse rather than better: `_anchor()`
  calls `_detach()` first (ade/frames.py:259-260), so one socket can be
  anchored to exactly one region. Binding B to gemma silently removed the
  socket from the claude region's hub. So the second pane does not add a
  stream, it *replaces* the one the first pane was entitled to, and then both
  panes draw it. Two anchor-chats in one window is not two views; it is one
  view rendered twice, of whichever region bound last.

---

## CHECKLIST

**Transcript renders — SEEN.** On rebind to a region with prior turns, the pane
drew the full history: `30-rebound-history.png` and `32-after-settle-click.png`
show two prior turn blocks with user bubbles, agent bubbles, a collapsed
`Hmmm …` thinking block, and the `ledger → (S8)` footer per block.
`track_transcript` id `481ac26ee513`, 2 messages, `settle-frames.json`.

**Send runs a turn — SEEN.** Every turn in this box was typed into the widget's
own textarea and sent with its own Send button, never over the raw socket.
`03-task-typed.png` → `04-stream-live.png`. Frame shape
`{type:'user', text, inst, track}` (:631-635) matched ade/frames.py:589-611 and
enqueued real work each time — five turns across four regions, all confirmed in
`archives/9883b6bec3df/log.jsonl`.

**Stream shows thinking — SEEN.** `details.cot.thinking` with the animated
`Hmmm ... ... ...` summary and a live `hmm-time` counter, freezing at the
elapsed value when the first non-dim text arrives: `Hmmm ... ... ... 6.5s` in
`91-stop-midstream.png`, `0.4s` in `10-gate1-ask.png`, `4.6s` on the gemma pane
in `41-turn-on-gemma-both-panes.png`.

**Stream shows fences — SEEN.** No turn in the first four runs emitted a
triple-backtick fence (the sonnet regions write `WRITE: … ---BEGIN--- …
---END---` instead), so a dedicated region `b4fence` was mounted and asked for
one. `95-fence.png`: a `.code-fence` with header lang `python`, a working
`copy` button, and body `print("hello")`. `parseFences` (:229-240) and
`_renderFenced` (:242-284) are live and correct.

**Stop fires — SEEN.** Driven twice before it landed cleanly; the first two
attempts clicked Stop after the turn had already gone idle and proved nothing.
The third, at 14:44:37 on region `3483ba1b0b6e` mid-stream: `out` frame count
was 132 at the click, 136 three seconds later, and still 136 at +10s and +20s.
The transcript is cut mid-sentence at
`6. Claude needs to stop lying and saying things were Brandon's call because he
vaguely mentioned them` with no closing text, a dim `[stopped — you hit Stop]`
line beneath it, and the meters row back to `IDLE`.
`91-stop-midstream.png` → `92-after-stop.png`. The Phase 3 note stands: the
button works, but `cp-stop-fired` is never added (:647-651), so the button
itself gives no feedback — only the dim line, one frame later, tells you it
took.

**Meters update — SEEN.** Live values on every turn:
`ctx 13.2K/200K cache 13.2K t/s 20.4 avg 78.4` on the claude region
(`b4/gate-state.json`), `ctx 4.5K/32.8K cache 0 t/s 67.4 avg 67.4` on gemma4.
Status word tracked `waiting → thinking → working → idle` in order on every
turn. Caveat, from the leak above: the meters row shows whichever region last
sent a `meters` frame to the socket, not the bound region.

**region_replaced rebinds — SEEN.** `reset_track` on `481ac26ee513` produced
`{"type":"region_replaced","old_id":"481ac26ee513","new_id":"fd4f0c30551c"}`,
and the instance bound to the old id reported
`frame._anchorChat.region === "fd4f0c30551c"` immediately after
(`b4/anchor-state.json`, `60-after-region-replaced.png`). The `_bind` at :689
re-sent `anchor` for the new id and the pane cleared to the new region's
transcript, as written.

---

## CONSOLE

One `[console:error] Failed to load resource: … 404` per page load — the known
page-level favicon 404. No other console errors and no pageerrors across five
driver runs. `b4/gate-console.txt`, `settle-console.txt`, `anchor-console.txt`,
`final-console.txt`, `fence-console.txt`.

---

## FIX LIST — B4

Phase 3's fix list above still applies (layout, missing zoom, no track name,
no `cp-stop-fired`, no `.empty` rule). New from driving it:

1. `static/js/widgets/anchor-chat/anchor-chat.js:676-684` — `out`, `status` and
   `meters` are rendered with no region check because the frames carry no
   region to check (engine/web_io.py:26, :159, :184). Any anchor-chat draws
   whatever the socket receives. This is Phase 3's fix 6, now demonstrated
   rather than reasoned: a pane bound to a claude region rendered a gemma4
   turn and gemma4's context meter.
2. `ade/frames.py:259-260` — `_anchor()` detaches the socket's previous region
   before attaching the new one, so a window can only follow one region's
   stream at a time. Two anchor-chats in one window therefore mirror each other
   instead of showing two regions. Whether that is the intended contract is
   Brandon's call, but as it stands the second instance is worse than useless:
   it silently blinds the first.
3. `static/js/widgets/anchor-chat/anchor-chat.js:647-651` — Stop works, but
   still no `cp-stop-fired` class and no disabled state, so the click looks
   inert until the server's dim line arrives. Carried forward from Phase 3,
   now confirmed against a working stop.

---

## READS — B4

Everything in the gate_list spec's READS list, plus:
- `Docs/Reports/phase3-test/SPEC-test-anchor_chat.md` (this file, Phase 3
  section, before appending)
- `ade/tracks.py:1399-1420` (stop_region / stop_all_regions), `:1550-1565`
  (_fire_replaced on reset)
- `ade/frames.py:589-618` (user / stop dispatch)

---

## BLOCKERS — B4

- Fix 1 is still not a one-file change; adding a region to `out`/`status`/
  `meters` touches engine/web_io.py and every widget listening on them. Phase 3
  flagged it as Brandon's call and it still is. What changed is that it is no
  longer hypothetical.
- Image paste and drag-drop intake (:18-91) was not driven. No image was
  available to the driver and the box's checklist does not name it.
- `activity` / mail rendering (:605-612, `_buildMailBlock`) was not driven —
  B2 covered the messenger side of that path.

## W4 — 2026-09-07 (W2's region-switcher rewrite)

- Region select lists the roster (`untitled`, plus two live test regions);
  switching regions rebinds the pane. SEEN.
- Sent a turn from the anchor-chat's own input after switching; echoed
  into the transcript, `frame.send` fired. SEEN (input-echo evidence, not
  a full server-round-trip confirmation).
- Stop button toggles `.cp-stop-fired` on click, confirmed via classList
  read. SEEN.
- Full detail: RECEIPT-phase4-W4.md.
