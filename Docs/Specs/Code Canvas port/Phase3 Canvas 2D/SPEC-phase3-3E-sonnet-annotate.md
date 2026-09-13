# SPEC — Phase 3 — 3E — Sonnet — Annotate

Written 2026-09-12. Starts after 3R passes on 3D. Cap 150K. A draw
layer on the Canvas widget and a send button that hands a picture to
a track. Three snapshot methods, all built, chosen by option.

Contracts: Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
sections 2.7, 2.8, 2.9.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. Short. No decisions in comments.
- "spine" is banned. No README. Do not start or stop the server.
- Never touch MEMORY.md or CLAUDE.md.
- Token rule: at 130K used, if parts 1 to 3 are not done, stop.
  Write Docs/Handoffs/HANDOFF-phase3-3E.md. Leave the receipt.
- Receipt at close: Docs/Reports/RECEIPT-phase3-3E.md in the SESSION
  REVIEW shape with a PICKS I MADE section and a SNAPSHOT RESULTS
  table: method, works, what it misses. One line each to
  SESSIONLOG.md and INDEX.md.
- Run `node --check` and `py_compile` on every file you edit.

## Read, in this order

- Docs/Reports/RECEIPT-phase3-3B.md — CANVAS API section.
- static/js/widgets/canvas/canvas/canvas.js — the bar and the iframe
  host block only.
- Open Design components/PreviewDrawOverlay.tsx :38-70, :661-701,
  :860-879, :926-1035. About 12K. Your source for marks and
  composite.
- Docs/HOWTO-frames.md row 26, the user frame. server.py :1531-1553
  fs/put.
- Docs/tests/matrix_harness.py — the launch and screenshot lines
  only, for method b.
- static/js/widgets/chat/chat/chat.js — grep `send(` and read the
  one that sends a `user` frame, for the track name and the frame
  shape.

## Part 1. Draw layer, static/js/widgets/canvas/shared/annotate.js

- `MX.annotate(frame, host)` → `{toggle(on), send(), el}`. Mounted by
  the Canvas widget from a bar button labelled "Annotate". Adds two
  options to Canvas: `annotate false`, `snapshot "raster"`, and
  `annotateTrack ""`. The Canvas widget's `optionControls` gains
  `snapshot` select of raster, playwright, none, and
  `annotateTrack` select of the session's track names (fetch the
  same list chat.js uses).
- A canvas element over the iframe, sized to it, pointer-events on
  only while `annotate` is true. Tools box: pen, box, text. Marks in
  normalized coordinates. Own undo and redo stacks (:661-701).
- Send: composite (:926-968) onto an offscreen canvas at the
  snapshot's size: background from the snapshot method, then marks,
  then `toBlob("image/png")`. POST the PNG through `/api/fs/put` to
  `<workspace root>/docs/scratchpad/annotate-<timestamp>.png`. Then
  `frame.send({type: "user", track: annotateTrack, text: note,
  image_paths: [that path]})` where note is a one-line input in the
  tools box. Clear marks on success.

## Part 2. Snapshot methods

- raster: walk the iframe document and draw it to a canvas. Vendor
  one small DOM rasterizer into static/vendor/ (pick the smallest
  that handles inline styles and img; name it and its license in the
  receipt). Same-origin makes the document reachable.
- playwright: a server route `POST /api/snapshot` body `{sid,
  surface, inst}`. It launches the harness's browser against
  `/matrix/<sid>?s=<surface>`, waits for the instance's iframe,
  screenshots that element, returns the PNG bytes. If Playwright is
  not importable, the route answers 501 `{error: "no playwright"}`
  and the widget shows that in its status line.
- none: white background at the iframe's size.

## Part 3. Wire-in

- Canvas widget bar: the Annotate button toggles the layer. When on,
  the iframe's own gestures are blocked (freeze through
  `frame._canvas.freeze(true)`) and released when off.
- getOptions on Canvas returns the three new keys. Note the edit in
  the receipt as a contract addition to 3B's option list.

## SETTLED IN CHAT

Snapshot has three methods, all built. Settled in chat: `snapshot` is
a widget option on Canvas, default `raster`. The PNG lands in
docs/scratchpad because that is LLM space. The other option is a
per-session folder; one path string. Receipt: the SNAPSHOT RESULTS
table, which method showed the page and which didn't, and where the
PNGs are.

## Done when

- Toggle annotate, draw a box and a text mark, undo one, redo it.
- Send with each method: a PNG lands in docs/scratchpad/, the track
  shows a user turn naming it. Open each PNG; the receipt's table
  says which methods show the page content.
- Annotate off: canvas gestures work again.
- Reload: annotate is off, snapshot and track options return.
- node --check and py_compile clean.
