RECEIPT — E11 changes widget — Sandbox Suite — Sun Sep 6 18:28:40 EDT 2026 to Sun Sep 6 18:32:40 EDT 2026

EDITS
- [static/js/widgets/changes/changes.js](../../static/js/widgets/changes/changes.js) — new changes widget, frame-wired port of static/js/ade/changes.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — appended changes row
- [static/matrix.html](../../static/matrix.html) — added changes.js script tag after devagent, before main.js

STRAY FILES
- none

GOALS DONE
- Folder static/js/widgets/changes/changes.js, type changes, label Changes, same markup
- Subscribes to track_list, feed, ledger_detail; sends (feed request, ledger_detail request) with inst
- gateColor gains parked, killed, timeout lines from queuelog.js
- Jump button and diff-line clicks fire mx:open-ledger with track and turn, no window
- Styles (chg, cparent, cchild, dline, diffstat, pendflag rules, plus the .jumpbtn/.cc-what/.cc-t/.chg-tbtn rules inside that same CSS block) copied into the widget's own injected style block
- Diff, grouping, and selection rule untouched from the old design

GOALS NOT DONE
- none

DECISIONS MADE
- No region binding option added — old changes.js shows all files/agents, not one region; spec is silent and its "do not change the grouping" bars filtering by frame.options.region. Options seen: add region filter like other widgets, or port as global view. Undo path: add a region option and filter reduceEvents' output.
- Region-to-name lookup (whoLabel/nameOf) now built from track_list rows (row.id -> row.name, falling back to raw id) since the old ctx.nameOf callback has no equivalent in the frame contract. Options seen: leave names as raw ids, or build the map from track_list. Undo path: it's one function, nameOf(c, region), swap its body.
- Feed is both subscribed and actively requested on mount (frame.send({type:'feed', inst})), since the old module relied on an external refresh() call this widget no longer has. Options seen: subscribe only and hope the server pushes on subscribe (mount.js's track_list precedent), or request explicitly. Undo path: delete the one send call in mount().
- Kept the exact old ids (#chgToggle, #chgTree, #chgDiff, #chgDiffHead, #chgDiffBody) so the copied CSS's id selectors still match. Two instances of the changes widget mounted at once would collide on ids. Spec said same markup and named these selectors for copying; did not invent per-instance id scoping since that's a refactor beyond the spec. Undo path: suffix ids with frame.id if a later wave needs multi-instance safety.
- Dropped the old module's onEsc export — the new widget-frame.js contract (mount/unmount/onFrame/getOptions/onOption/canClose/defaults) has no keyboard-escape hook to call it from, and the spec's build steps don't ask for it. Undo path: none needed unless the frame contract grows an onEsc hook later.
- Did not use static/js/widgets/shared/feed-rows.js (MX.feedRows). Its record/pending helpers would restate the grouping and pending logic the spec says not to change; the old changes.js already carries its own self-contained record reduction. Options seen: adopt feed-rows for consistency with other widgets, or keep the ported logic self-contained. Undo path: none needed, this is a read-only choice not to import a module.

READS BEYOND THE LIST
- none — read exactly the six items in the spec's read list, plus the CSS lines matching the named grep terms and their immediate rule block (718-780) which also contains .jumpbtn, .chg-tbtn, .cc-what, .cc-t, all needed to render this widget's own markup.

BLOCKERS FOR LATER WAVES
- The ledger widget (E10 job) must listen for a window CustomEvent named mx:open-ledger with detail {track, turn} — this widget only fires it, does not know if E10 wires the listener.
- Multiple simultaneous "changes" widget instances would collide on DOM ids (#chgToggle etc.) since the copied CSS is id-based. Not fixed here, see decisions.

PHASE 3 SURFACED
- none

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm E10's ledger widget listens for mx:open-ledger({track, turn}) — closer
- Confirm track_list rows carry a name field; if not, whoLabel falls back to raw region id — closer
