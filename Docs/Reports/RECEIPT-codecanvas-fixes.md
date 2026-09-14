SESSION REVIEW — Sandbox Suite / codecanvas fixes — 2026-09-14

(clickable links only — no code blocks, no restating)

EDITS
- [static/js/widgets/codecanvas/tools/tools.js](../../static/js/widgets/codecanvas/tools/tools.js) — A1 STYLE_CONTROL table (color picker, selects, number+unit) in renderInspector; A2 sticky `.cc-panel-order-head`; B2 Layers row contextmenu opens the bound canvas's own menu items
- [static/js/widgets/codecanvas/shared/annotate.js](../../static/js/widgets/codecanvas/shared/annotate.js) — A3 track select in the annotate bar, `refreshTracks()` exposed
- [static/js/widgets/codecanvas/canvas/canvas.js](../../static/js/widgets/codecanvas/canvas/canvas.js) — A3 calls `cv.ann.refreshTracks()` on ade_init/track_list; B1 `linksLive` option, bar button, redraw opts; B2 `menuItems(cv)` extracted from `openMenu`/`onFileContextMenu`, exposed on `frame._canvas`
- [static/js/widgets/codecanvas/shared/render.js](../../static/js/widgets/codecanvas/shared/render.js) — B1 `page`/`redrawOnly`/`anchor` take a `links` flag, wrap only when true
- [static/js/widgets/codecanvas/tools/tools.js:233-277](../../static/js/widgets/codecanvas/tools/tools.js#L233-L277) — Addendum A1b `parseNumUnit` treats `normal` as `{num:"",unit:""}`; `styleControlFor` gives `lineHeight`/`letterSpacing` `numberUnitControl` always, no text fallback

STRAY FILES
- none

GOALS DONE
- A1 file-mode inspector controls: color/select/number+unit per STYLE_CONTROL, fontFamily/border/transform stay text
- A2 sticky Layers header in both doc and file trees
- A3 annotate track picker, "none" first, refreshes on track_list
- B1 links-live toggle, doc-mode only, preview always live
- B2 Layers right-click reuses the canvas's own menu items in both modes
- Addendum A1b: `lineHeight`/`letterSpacing` no longer fall to text on a `normal` computed value

BRANDON'S TODOS
- Load a doc target and a file target once headed to confirm the acceptance list; no headed run was done this session
- Group geometry held out of scope per spec, untouched

CLOSER REVIEW
- Gets copy of review, not a contract.
- Headed pass against the six acceptance checks — Brandon or closer
