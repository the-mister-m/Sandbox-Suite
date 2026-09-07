RECEIPT — E12 messenger widget — Sandbox Suite — Sun Sep 6 18:28:56 EDT 2026 to Sun Sep 6 18:33:45 EDT 2026

EDITS
- [static/js/widgets/messenger/messenger.js](../../static/js/widgets/messenger/messenger.js) — new messenger widget, type messenger
- [static/matrix.html](../../static/matrix.html) — one script tag added after devagent, before main.js
- [library/registry/widgets.json](../../library/registry/widgets.json) — appended messenger row

STRAY FILES
- none

GOALS DONE
- Folder static/js/widgets/messenger/messenger.js, type messenger, label Messenger, same markup
- Subscribes to track_list, wp_feed; sends wp_feed, wp_send, wp_mute, wp_read with inst
- Roster comes from the last track_list; rosterChanged runs on it
- Styles copied into the widget's own style block (injected once via a <style> tag keyed by id)
- Card grouping and arm logic unchanged from static/js/ade/messenger.js

GOALS NOT DONE
- none

DECISIONS MADE
- Root wrapper class .mx-messenger replacing the old #view-messenger id scope on every copied mg- rule — options seen: keep #view-messenger and require a fixed page id (breaks multi-instance widgets), or scope to a class on the widget's own wrapper — undo path: sed #view-messenger back if a different scope class is wanted
- Added height:100%; display:flex; flex-direction:column to .mx-messenger itself (not in the grepped mg- rules, needed so .mg-panes' flex:1 has a sized parent inside the widget host) — options seen: leave bare and rely on host CSS, or add the minimum layout properties — undo path: delete those three properties from the first CSS rule
- Dropped the old ctx.nameOf/ctx.isGone historical fallback (no per-session name registry is available to this widget) — a track that drops off the roster shows its raw id once NAME rebuilds, instead of a remembered name — options seen: carry no fallback (chosen) or read another file for a name registry, which the read list didn't name — undo path: none needed to reverse, this is additive if a registry appears later
- Did not bind to frame.options.region — spec's build steps never mention region, messenger operates over the whole track roster, not one region — undo path: add options.region read if a later spec asks for it

READS BEYOND THE LIST
- none — the four optional fallback reads (MEMORY.md, widget-frame.js already on my list, session-panel.js, suite.js) were not needed

BLOCKERS FOR LATER WAVES
- none seen

PHASE 3 SURFACED
- The base .dot status-color classes and .gbadge classes used in the copied markup are not mg-prefixed, so they weren't in my read list and aren't in my widget's style block. If they aren't already global in ade.css/matrix's page CSS, status dots and denied/dead-letter badges in this widget will render unstyled.

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm .dot / .gbadge global styles actually reach widget-hosted markup — closer
- node --check passed on messenger.js — closer, no action needed
