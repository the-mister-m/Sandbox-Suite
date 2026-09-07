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
