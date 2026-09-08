SESSION REVIEW — Sandbox Suite — Phase 4 — 2026-09-07 12:50 to 20:12 EDT

Session agent: Fable. Brandon drove headed. Server 127.0.0.1:5000, session
9883b6bec3df "test run". Twenty-seven boxes, twenty-seven receipts, five
fix specs, six server restarts.

EDITS BY THE SESSION AGENT
- [ade/tracks.py:1023](../../ade/tracks.py#L1023) — shadowed list_regions renamed region_ids_of_log_dir
- [engine/ledger.py:374](../../engine/ledger.py#L374) — calls the renamed function; unblocked every feed-driven widget
- [server.py:1560](../../server.py#L1560) — choose file runs inside Finder's tell block; unproven, needs a restart and Brandon's eyes
- [SPEC-phase4-fixes-B.md](../Specs/SPEC-phase4-fixes-B.md) — Wave B fixes, boxes F-B, F-C, F-D
- [SPEC-phase4-fixes-C.md](../Specs/SPEC-phase4-fixes-C.md) — Wave C fixes, box F-E
- [SPEC-phase4-arrange-maps.md](../Specs/SPEC-phase4-arrange-maps.md) — arrange browse, archive, update, box D2
- [SPEC-phase4-fixes-D.md](../Specs/SPEC-phase4-fixes-D.md) — last wave W1 to W5, housekeeping list

BOXES AND RECEIPTS, in run order
- [S1](RECEIPT-phase4-S1.md) rows-versus-tracks fix, HOWTO third table
- [S1-rerun](RECEIPT-phase4-S1-rerun.md) first driven test; found the feed bug
- [B1](RECEIPT-phase4-B1.md) strip, changes
- [B2](RECEIPT-phase4-B2.md) messenger, queue-log
- [B3](RECEIPT-phase4-B3.md) ledger, transcript
- [B4](RECEIPT-phase4-B4.md) gate-list, anchor-chat, Opus
- [S2](RECEIPT-phase4-S2.md) roster frame, session root, frame type in error
- [F-B](RECEIPT-phase4-F-B.md) server side and gate-list settle
- [F-C](RECEIPT-phase4-F-C.md) Wave B widgets, closed names, feed_dirty
- [F-D](RECEIPT-phase4-F-D.md) model picker shows the resolved id
- [S3](RECEIPT-phase4-S3.md) widget folders regrouped, picker dropdown
- [C1](RECEIPT-phase4-C1.md) devagent, Opus
- [C2 test](RECEIPT-phase4-C2-test.md), [C2 build](RECEIPT-phase4-C2-build.md) timeline to target, Opus
- [C3](RECEIPT-phase4-C3.md) editor, terminal
- [C4](RECEIPT-phase4-C4.md) browser, viewer
- [F-E](RECEIPT-phase4-F-E.md) Wave C fixes, edits by one agent, harness by a second
- [D1](RECEIPT-phase4-D1.md) mini-queue, mount
- [D3](RECEIPT-phase4-D3.md) chat
- [F-F](RECEIPT-phase4-F-F.md) context root revert, cache toggle proof
- [D2](RECEIPT-phase4-D2.md) arrange build and test, Opus
- [F-G](RECEIPT-phase4-F-G.md) selection styles in devagent, add form, settings rows
- [W1](RECEIPT-phase4-W1.md) archive safety, gate command, plan provider
- [W2](RECEIPT-phase4-W2.md) anchor-chat becomes a switcher, Opus
- [W3](RECEIPT-phase4-W3.md) widget fixes, ruler, strip label
- [W4](RECEIPT-phase4-W4.md) last wave retest
- [W5](RECEIPT-phase4-W5.md) raw fan-out deleted, gate-list broadcast
- Per-widget test records: [phase3-test/](phase3-test/) SPEC-test-<type>.md, one per widget, dated sections appended

GOALS DONE
- Nineteen of nineteen widgets driven headed, not screenshotted idle
- Every Wave B, C, D finding fixed and re-driven, except the two logged below
- Timeline built to [SPEC-phase4-timeline-target.md](../Specs/SPEC-phase4-timeline-target.md)
- Arrange gained browse, archive, library, update, disk paths on nodes
- Anchor-chat is a region switcher on follow and mirror; the anchor frame is gone
- Raw out, status, meters fan-out deleted; mirror is the one tagged stream
- Archive writes master.prev before overwriting; shutdown skips unhydrated environments

OPEN, LOGGED FOR NEXT SESSION
- Chooser dialog in front: server.py:1560 edit unproven; Brandon restarts and clicks browse in arrange
- Queue-log command text on a human answer inside the wait window: W4 proved by code parity only
- Track loss on the 17:48 restart: cause not found from disk; W1's two safety lines prevent a repeat; Brandon's terminal scrollback from 17:47 to 17:49 would name the line
- Chat and anchor-chat are now near duplicates; Brandon dedupes later
- Haiku absent from the picker list; the alias works as a bare model string
- gate-list does not filter chat_history on message id; two gate-lists on one socket share a reply

HOUSEKEEPING, Brandon's call, nothing removed
- library/maps/ — Music History.json, Music History.2.json (test cable and phase), Desktop.json
- library/grids/9883b6bec3df/ — throwaway window files from every box
- Docs/Reports/phase3-test/<box>/ — screenshot and console evidence, keep
- Two unnamed empty sessions from 2026-09-06 in the open list: 85b19c53d41a, 0d78d246515f
- archives/9883b6bec3df/ — sixty-odd region jsonl files from ended regions

BRANDON'S TODOS
- Restart, open arrange, click browse, say whether the dialog is in front
- Decide the library/maps and grid window cleanup
- Browser widget two skins, Finder columns versus VS Code tree: idea, not specced

RULE CONFLICT RAISED BY FOUR BOXES, UNRESOLVED
- The harness bypass notice tells agents to read and edit through Bash; the project rules say Read and Edit tools so Brandon sees edits. Every box followed the project rules.

CLOSER REVIEW
- Gets copy of review, not a contract.
- SESSIONLOG.md one entry for the session linking this review — closer
- INDEX.md one line per new spec and this review — closer
- MEMORY.md warm start block: state above, next move is the chooser proof and housekeeping — closer
- CLAUDE.md map: widget folders are grouped under static/js/widgets/<group>/; library/maps/ exists; five new specs — closer
- Worklog close, Ledger/worklog.html, assigned by Brandon 2026-09-07 20:12 — closer
- TODO.md: the OPEN list above — closer

---

SESSION REVIEW — Sandbox Suite — devagent card rebuild — 2026-09-07 23:07 to 23:41 EDT

Session agent: Fable. Brandon drove headed with screenshots and one sketch.
Follows an unlogged Opus pass (20:12 to 23:07) that left the edits below
uncommitted.

INHERITED FROM THE OPUS PASS, uncommitted, kept
- [ade/frames.py](../../ade/frames.py) — `_do_insert_region` reads seat and overlay_rows off the message
- [server.py](../../server.py) — `/api/settings/region-defaults`
- [settings-rows.js](../../static/js/widgets/shared/settings-rows.js) — draft-aware commit, REST preset load/save for drafts, preset_name select
- [add-controls.js](../../static/js/widgets/shared/add-controls.js) — `opts.stage` on region mode; devagent no longer uses it
- [test_draft_region.py](../tests/test_draft_region.py), [test_draft_presets.py](../tests/test_draft_presets.py) — 18 tests, pass

EDITS BY THE SESSION AGENT
- [devagent.js](../../static/js/widgets/agent/devagent/devagent.js) — rewritten: one column of region cards to Brandon's sketch, blank draft card per track, square Start button, no name gate
- [settings-rows.js:90-94](../../static/js/widgets/shared/settings-rows.js#L90-L94) — `isDraft()` prefix test replaces four strict id checks
- [settings-rows.js:427-446](../../static/js/widgets/shared/settings-rows.js#L427-L446) — only the harness block and the region's provider block draw; model row skipped
- [widget-edge-map.md](../../Mapdocs/widget-edge-map.md) — rewritten to the new shape, no line numbers

STRAY FILES
- [library/presets/zz draft check.json](../../library/presets/zz%20draft%20check.json) — Opus test preset, Brandon's call
- library/grids/ — eight new window folders from the Opus pass, Brandon's call

GOALS DONE
- Settings editable and presets loadable before a region starts
- A loaded preset shows in the settings rows before Start
- Region starts without a name
- One card shape for draft and live regions; provider-matched settings only

DROPPED
- Track root and order editing from the card. Sketch shows Track name only.

BRANDON'S TODOS
- Reload and drive: Start on a blank card, preset load into a draft, save a preset from a draft, then start
- Decide whether track root needs a home now that the card has none
- Decide the stray preset and the eight grid folders

RULE CONFLICT, again
- Harness bypass notice says edit through Bash; project rules say Read/Edit. Followed the project rules.

CLOSER REVIEW
- Gets copy of review, not a contract.
- SESSIONLOG.md entry for this pass — done by session agent
- INDEX.md: edge map line under MAPDOCS, two test lines under DOCS — done by session agent
- MEMORY.md warm start: devagent is card-based, drafts per track, Opus pass unlogged — closer
- CLAUDE.md map: Mapdocs/widget-edge-map.md line — closer
- TODO.md: the three Brandon todos above — closer
