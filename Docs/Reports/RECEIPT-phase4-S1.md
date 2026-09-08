SESSION REVIEW — Sandbox Suite — S1 — 2026-09-07 13:03 EDT

EDITS
- static/js/widgets/strip/strip.js:313 — subscribe adds "ade_init"
- static/js/widgets/strip/strip.js:328-329 — accept ade_init, msg.rows -> msg.tracks
- static/js/widgets/changes/changes.js:449 — subscribe adds "ade_init"
- static/js/widgets/changes/changes.js:462-463 — accept ade_init, msg.rows -> msg.tracks
- static/js/widgets/messenger/messenger.js:406 — subscribe adds "ade_init"
- static/js/widgets/messenger/messenger.js:419-420 — accept ade_init, msg.rows -> msg.tracks
- static/js/widgets/queue-log/queue-log.js:557 — subscribe adds "ade_init"
- static/js/widgets/queue-log/queue-log.js:570-571 — accept ade_init, msg.rows -> msg.tracks
- static/js/widgets/ledger/ledger.js:782 — subscribe adds "ade_init"
- static/js/widgets/ledger/ledger.js:801-802 — accept ade_init, msg.rows -> msg.tracks
- Docs/HOWTO-frames.md:76-79 — struck "no caller" wording for crew_list, gate_edges, rail_catalog; added server.py:1753-1755 socket-open callers
- Docs/HOWTO-frames.md:98-103 — struck "no caller" wording for track_status, context_warn, gate_broadcast; added server.py:362, ade/tracks.py:827, server.py:200 callers
- Docs/HOWTO-frames.md — added roster row to client-to-server table, marked "added by S2"
- Docs/HOWTO-frames.md — added third table "Server to client, engine senders" (12 rows: out, ask, gate_pending, activity, meters, term, speak, audio, status, models, ledger_detail, mirror)

HARNESS
- strip — chip reads "gfsf" (a name, not an id). Console: one pre-existing 404 (unrelated resource), no new errors.
- changes — default tab is "files", not "agents"; harness didn't switch tabs so no agent label visible in screenshot. Console: same one pre-existing 404, no new errors.
- messenger — roster shows "gfsf" / "gemma4:e4b-it-q8_0" and "CAPTAIN". Console: same one pre-existing 404, no new errors.
- queue_log — track column shows "gfsf  gemma4:e4b-it-q8_0", no records yet. Console: same one pre-existing 404, no new errors.
- ledger — summary tiles only (0 turns), no per-track chip row visible in the captured window height. Console: same one pre-existing 404, no new errors.

STRAY FILES
- Docs/Reports/phase3-test/{strip,changes,messenger,queue_log,ledger}-{full,widget}.png, *-console.txt — harness output, expected per spec.

GOALS DONE
- F1: all five widgets read region rows (msg.tracks) and subscribe to ade_init.
- F3: HOWTO-frames.md third table added, "no caller" wording struck with real callers, roster row added.

BLOCKERS
- Brandon's question: none of the five harness screenshots showed a region labeled sonnet or claude by name — only "gfsf" (gemma4:e4b-it-q8_0) and "CAPTAIN" appeared. Could not visually confirm the specific 14190f5a4d31/sonnet region's label.
- S1 code does not branch on model value anywhere — msg.rows -> msg.tracks and ade_init subscribe touch row structure only, model field passes through untouched.
- grep of injections/models and library/registry for "haiku" and "sonnet": zero matches in either, in any file.
- No reason a sonnet region would behave differently from a haiku region for this fix — the rename/subscribe change is generic over row shape, not model-conditional.

READS
- Docs/Specs/SPEC-phase4-fixes-sonnet.md:7-76 (Shared setup, Server naming, S1)
- static/js/widgets/strip/strip.js:305-334
- static/js/widgets/changes/changes.js:440-469
- static/js/widgets/messenger/messenger.js:398-426
- static/js/widgets/queue-log/queue-log.js:550-577
- static/js/widgets/ledger/ledger.js:775-804
- Docs/HOWTO-frames.md (full file, 105 lines)
- engine/web_io.py:1-220 (full file)
- ade/tracks.py:145-165, :820-830
- server.py:195-205, :358-366, :1748-1758
- Docs/Reports/phase3-test/*-console.txt (5 files, post-harness)

CLOSER REVIEW
- Confirm changes tab default (files, not agents) doesn't hide an F1 regression — Brandon or closer, visual call
- Roster row fields in HOWTO-frames.md are placeholders pending S2 — closer to reconcile once S2 lands
