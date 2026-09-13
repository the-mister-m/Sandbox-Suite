# SESSION REVIEW — Sandbox Suite — Phase 3, job 3E, Annotate — 2026-09-12

## EDITS

- [static/js/widgets/canvas/shared/annotate.js](../../static/js/widgets/canvas/shared/annotate.js) — new, the whole job: `MX.annotate(frame, host)`, pen/box/text marks, own undo/redo, three-method composite and send
- [static/js/widgets/canvas/canvas/canvas.js](../../static/js/widgets/canvas/canvas/canvas.js) — three options added (`annotate`, `snapshot`, `annotateTrack`), Annotate bar button, mounts the overlay into `.mxcv-body`, `ade_init`/`track_list` cached for the track select, `setAnnotate`/`trackNamesFor` helpers
- [server.py](../../server.py) — `POST /api/snapshot` route: launches Playwright, screenshots `[data-instance="<inst>"] iframe`, 501 `{error: "no playwright"}` if not importable
- [static/matrix.html](../../static/matrix.html) — two script tags: the vendored rasterizer, then annotate.js before canvas.js
- [static/vendor/dom-to-image/dom-to-image.min.js](../../static/vendor/dom-to-image/dom-to-image.min.js) — vendored, unminified-name kept as shipped

## STRAY FILES

- none. A tiny probe PNG posted to `docs/scratchpad/annotate-3e-probe.png` to confirm the live server's `/api/fs/put` b64 path before writing this receipt was deleted after the check.

## VENDORED LIBRARY

`dom-to-image` 2.6.0 (tsayen), MIT license, from `cdn.jsdelivr.net/npm/dom-to-image@2.6.0/dist/dom-to-image.min.js`, 9,278 bytes. Smallest of the common DOM rasterizers; walks the DOM, inlines computed styles, images and web fonts, renders through an SVG `foreignObject`. Exposes `window.domtoimage.toPng(node, {width, height}) -> Promise<dataUrl>`; no `toCanvas` in this build, so the raster path loads the dataUrl into an `Image` and draws that.

## GOALS DONE, AGAINST THE CODE

No headed browser proof ran this job — see BRANDON'S TODOS. What follows is built and read back against the actual code and against three direct probes against the live server (below), not proven through a mounted widget.

- Part 1: `MX.annotate(frame, host)` returns `{toggle(on), send(), el}`. `el` is a `position: absolute; inset: 0` wrap holding the mark canvas and a tools bar (pen/box/text, Undo, Redo, a note input, Send, status). Canvas resizes to `host.getBoundingClientRect()` on `toggle(true)`. Marks are normalized `[0,1]` coordinates; pen is a point array, box is `{x,y,bw,bh}`, text is a `window.prompt` string placed at a point. `undo`/`redo` are two arrays local to the closure — the canvas widget's own history never sees them.
- Part 2: three backgrounds behind one `backgroundFor(method)` — `raster` calls `domtoimage.toPng` on `frame._canvas.doc().documentElement` (the CANVAS API's `doc()`, added by 3C); `playwright` posts to the new route with `{sid: MX.grid.sid, surface: MX.WINDOW_ID, inst: frame.id}`; `none` skips straight to the white fill already sitting under every method. Compositing draws marks over whichever background landed (or over white alone) onto an offscreen canvas, `toBlob("image/png")`, base64, `POST /api/fs/put` at `docs/scratchpad/annotate-<ts>.png`, then `frame.send({type: "user", track, text: note, image_paths: [path]})`. Marks and the note clear only after a confirmed write.
- Part 3: Canvas widget gains an "Annotate" bar button — `setAnnotate(cv, on)` toggles `cv.ann`, calls `frame._canvas.freeze(on)` (the direct CANVAS API method, not the mirror — see PICKS), and marks the button active. `getOptions` reports the three new keys; `annotate` is always `false` (see PICKS). `annotateTrack`'s select reads `cv.trackNames`, filled from `ade_init`/`track_list` frames the widget now subscribes to, sent by one `{type: "roster"}` at mount — the same frames chat.js reads, ported through the same `id`/`name` shape.
- `node --check` clean on annotate.js and canvas.js; `python3 -m py_compile` clean on server.py.

## THREE DIRECT PROBES AGAINST THE LIVE SERVER

No widget was mounted; these confirm the primitives the widget calls, against the server that has been running since before this job's edits (pid on 5000, started 21:16:46, `server.py` last edited 19:58:01 — the 3A `b64` fix is live, this job's `/api/snapshot` is not).

1. `GET /static/js/widgets/canvas/shared/annotate.js` and `/static/vendor/dom-to-image/dom-to-image.min.js` and `/static/matrix.html` all `200` — the new files and the two new script tags are served.
2. `POST /api/fs/put {"path": "docs/scratchpad/annotate-3e-probe.png", "b64": "..."}` → `{"ok": true, ...}`, file landed under `Docs/scratchpad/` (case-insensitive volume folds `docs` onto the existing `Docs`). Confirms the write half of Part 1's send() works today, for `raster` and `none`.
3. `POST /api/snapshot {...}` → `404` — not registered on the running process, as expected; a restart is needed before the `playwright` method can be proven. `python3 -c "import playwright"` succeeds in this environment, so once restarted the route should reach the real screenshot path rather than the 501 branch.

## SNAPSHOT RESULTS

| method | works | what it misses |
|---|---|---|
| raster | Code-complete, unproven live. `dom-to-image` reads inline styles and `<img>` by design; it does not run page JS or CSS animations, and cross-origin images inside the doc would be skipped (same-origin canvas doc, so not expected here). | No headed check that a real canvas document rasterizes correctly — needs a mounted widget. |
| playwright | Code-complete, route confirmed absent on the live (pre-edit) server, `501` path confirmed reachable only by code reading (playwright *is* importable here). | Cannot be proven until the server restarts; the exact screenshot crop (`[data-instance] iframe`) is un-run. |
| none | Works as written — the white fill is unconditional, no dependency. | Carries no page content by design; only marks and note reach the track. |

## PICKS I MADE

- **`frame._canvas.freeze(on)` is the direct call, not the `canvas.freeze` mirror.** Today's contract update says the mirror "freezes every canvas on the target" — that describes the Code-widget-asks-a-sibling-canvas path (contract 2.7: "Code widget asks; canvas obeys"), which 3D used because Code is a separate widget instance. Annotate is mounted *by* the same canvas instance it draws over and already holds `frame._canvas` directly; the job spec's own Part 3 line names `frame._canvas.freeze(true)` explicitly. Read both as compatible: the mirror's broadcast semantics are unchanged, and a same-instance caller with direct access does not need to round-trip through the bus to talk to itself.
- **`annotate` always reads back `false` from `getOptions`,** the same shape as 3D's `locked`. The "Done when" list says "Reload: annotate is off" without qualifying it the way it qualifies the other two ("snapshot and track options return"), and marks are lost on reload regardless (nothing persists the draw layer's canvas), so persisting a stale `true` would reopen a layer with nothing to unfreeze into. `onOption("annotate", …)` still drives the toggle live — the checkbox in the options panel and the bar button both work in a running session; only the saved/mirrored value is pinned false.
- **Track names come from `ade_init`/`track_list`, cached on `cv.trackNames`, not a Promise-returning fetch.** `optionControls` needs `values()` to return a list; chat.js's own source is event-driven (`roster` sent, `ade_init`/`track_list` arrives later), not request/response. Canvas.js now subscribes to both types alongside its existing three and sends one `{type: "roster"}` at mount, matching chat.js's own bootstrap. The list holds ids (what `track` must be), not display names — `MX.gates`' `namesFrom` builds a name map but the select control renders one string for value and label both, so showing a friendlier label would need widget-frame.js's select-building code changed, which is out of this job's contracts.
- **The tools bar's text tool uses `window.prompt`,** not a second inline text field, to keep the toolbar to one row and avoid inventing a second commit gesture the "Done when" list doesn't ask for.
- **No window-resize listener on the overlay canvas.** It resizes to `host`'s rect on every `toggle(true)`; a live resize while annotating mid-session is not one of the "Done when" checks, and adding a listener with no matching teardown call in the returned interface (`{toggle, send, el}` has no `destroy()`) would leak across mount/unmount.

## CONTRACT FIELDS ADDED

Named per section 2's rule. Nothing renamed, nothing narrowed.

- **Canvas `getOptions`/`optionControls` gain three keys**: `annotate` (bool, always `false` back), `snapshot` (`raster`|`playwright`|`none`, default `raster`), `annotateTrack` (string, a track id). This is a contract addition to 3B's eight-key list (now eleven); nothing existing renamed or narrowed.
- **`POST /api/snapshot`** `{sid, surface, inst}` → PNG bytes, or `501 {error: "no playwright"}`. New route, section 2.5's neighbourhood, not itself a listed row.

## BRANDON'S TODOS

- **No headed proof ran.** Same constraint 3D flagged: this job cannot start or stop the server, and `/api/snapshot` needs a restart to leave the 404 it shows today. Decide whether a headed pass (mount a canvas on a real target, drive the three tools, undo/redo, send through all three methods, open the resulting PNGs) runs before this ships, and who runs it, after a restart — **Brandon**.
- **Restart folds in this job's `/api/snapshot` route** alongside 3A's still-standing `b64` asset-bytes item (RECEIPT-phase3-3A) — one restart clears both.
- `library/proof/3b-*`, `3c-*` files from earlier jobs are untouched by this one; still standing from those receipts — **Brandon**.

## CLOSER REVIEW

- Rule conflict, flagged not resolved: this job's environment reminder said to do file reads and edits through Bash; Brandon's FILE OWNERSHIP rule says the opposite. Followed Brandon's rule — Read/Write/Edit for content, Bash for `curl` probes, `find`/`grep`/`node --check`/`py_compile` only — **closer**.
- Three contract additions above (annotate/snapshot/annotateTrack keys, `/api/snapshot`) are live and used by this widget only so far — **closer**.
- No headed proof ran; a restart is needed for both this job's `/api/snapshot` and 3A's standing `b64` item — **Brandon**.
