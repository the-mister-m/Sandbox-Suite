RECEIPT — E9 queue log widget — Sandbox Suite — 2026-09-06 18:27 EDT to 2026-09-06 18:34 EDT

EDITS
- [static/js/widgets/queue-log/queue-log.js](../../static/js/widgets/queue-log/queue-log.js) — new queue log widget, ported from static/js/ade/queuelog.js to the widget-frame contract
- [static/matrix.html](../../static/matrix.html) — one script tag added after devagent, before messenger
- [library/registry/widgets.json](../../library/registry/widgets.json) — appended queue_log row

STRAY FILES
- none

GOALS DONE
- Folder static/js/widgets/queue-log/queue-log.js, type queue_log, label Queue Log, same markup, columns, and localStorage key (ade.queuelog.cols)
- Subscribes to track_list, feed, ledger_detail; sends feed and ledger_detail tagged with inst; ignores tagged replies for another inst
- rowsForRegion/pendingByRegion no longer owned by this file — dropped, not reimplemented, since nothing in the widget-frame world imports a widget module's internals
- Cache TTL and exclude-dynamic toggles kept; Claude check now reads t.provider === "claude" instead of a model name list
- Styles copied into the widget's own style block, scoped under .mx-queue-log
- node --check passes on the new file

GOALS NOT DONE
- none

DECISIONS MADE
- Provider string for the Claude check: used t.provider === "claude" — seen from ade/web_io.py:35 ("provider": track.provider) and ade/tracks.py's rails.infer_provider(model), no direct read of the provider registry contents — options seen: hardcode "claude" (chosen) vs re-derive from CLAUDE_MODELS (spec forbids) — undo: change the one string literal in two spots (chip provider checks)
- Converted #qlBar/#qlWrap/#qlHead/#qlFeed id selectors to classes scoped under .mx-queue-log so multiple instances don't collide on element ids — options seen: keep ids and risk duplicate-id breakage under multiple instances (rejected), scope with classes (chosen) — undo: revert to ids, only safe if the type is limited to one instance
- feed-rows.settle used for the settle button instead of a local reimplementation of gate_action + refresh timers — options seen: copy old inline settle() (rejected, spec says import from feed-rows, do not copy), call MX.feedRows.settle (chosen) — undo: none needed, this is the intended shared path
- untagged feed/ledger_detail replies (no msg.inst) are accepted by this widget same as tagged ones matching frame.id — needed because feed-rows.settle's own follow-up refresh sends an untagged {type:"feed"} — options seen: filter strictly on inst present-or-absent (would drop feed-rows' own refreshes, rejected), accept when inst is absent or matches (chosen) — undo: tighten the onFrame guard to require inst present
- did not call MX.feedRows.setRecords from this widget's own feed handling — this widget keeps its own raw record list for the multi-track render, spec only asked to import rowsForRegion/pendingByRegion which this widget doesn't use internally — undo: add one setRecords(msg.records) call in the feed branch if a later widget expects queue-log to warm the shared cache
- dropped onEsc/resetCols/refresh exports from the old design — the widget-frame contract (mount/unmount/onFrame/getOptions/canClose/onOption) has no hook for them and nothing in this port calls them — undo: add as needed if a future spec wires an escape key or reset-columns control into the frame contract

READS BEYOND THE LIST
- static/css/ade.css lines 615-719 (full block) — the spec's grep-and-read-those-rules step only guarantees single-line hits for ql-/qlrow/qlh/trackchip/sbtn; reading the surrounding block was needed to get complete rule bodies (declarations span multiple lines) and to pick up the #qlBar/#qlWrap/#qlHead/#qlFeed container rules, which don't match those five grep patterns but are required for "same markup"
- ade/tracks.py, engine/settings.py, server.py, ade/web_io.py — grepped only, not opened, to find the "provider" field name for the Claude check (ade/web_io.py:35 hit used; other hits listed, not opened)

BLOCKERS FOR LATER WAVES
- none

PHASE 3 SURFACED
- none

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm t.provider === "claude" is the correct provider id (no registry file was opened to verify the literal string) — Brandon or closer
