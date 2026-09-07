Updated 2026-08-17 — Memory System redesign — see GLOBAL-RULES.md

# MEMORY — [project]
Rules: GLOBAL-RULES.md. Closer-only file. Lean: no superseded history.

## PROJECT
- Name: [name]
- Purpose: [one line]
- Stack / entry point: [e.g. server.py, static/index.html]
- Runs: [where/how]
- Key paths: [3–5 links]

## DURABLE FACTS
- Five settings tiers: global, session, widget, track, region. Session inherits global; every global key can be overridden on session. Update Default button, Are you sure modal.
- One source per key. No resolver, no provenance, no live file reads at spawn.
- Presets: save is one write, load is one copy, delete is one file; none check region state.
- Change modal (Reset Region / Rewrite Cache / Cancel) fires on preset save, preset load, and any setting change when reset-on-change is off. Rewrite Cache keeps the transcript; cloud models rewrite cache cold. No expiry on the prompt.
- Session templates hold tracks plus a map data slot, no regions. Matrix templates hold one window's grid and widgets. Both exist, separately.
- Many sessions, many matrix windows per session across screens. Grid state lives with the window, not the session.
- Autosave fires on shutdown for every open session. Recovered sessions appear in the open-sessions display, no reconnect.
- Voice lives on the session; other speech options live on the chat widget. One chat speaks at a time.
- Mini queue is its own widget, built now, skipped (and noted in the receipt) if nothing is attached to chat.
- Viewer renders the full type list; Monaco (read-only) colors code.
- Job models: Opus on Jobs 1, 3a, 3b, 5, 6; Sonnet on 4, 7, 8. Redpen (Job 9) runs by hand in session.
- Rule: the session agent spawns every builder as the Goto agent type with a model override only, no other agent type. Builders stay in their lanes.
- Tools stay in mind for Phase 3 and 4. Skills come later.
- The live container is an Environment, not a World. The word world is gone from code.
- There is no current session/environment. Every open one is equally live; no hidden default argument anywhere.
- "rows" names only an actual table row in settings.py; the widget registry field is "type" — Job 5's rename is done.
- Hydrated flag on boot-registered sessions is the scope's "listed open, no windows, no connection."
- End Session closes every socket bound to it.
- One socket follows many live regions (follow/unfollow), not a single mirror.
- Every frame carries the sending instance id; ask and gate_pending also carry the region.
- One widget folder standard: static/js/widgets/<name>/, registry rows name each file.
- Session settings tier is archived to settings.json beside master.json, restored by reload_session.
- Widget defaults live in engine/settings.py's widget_defaults block, trickled global to session to widget.
- Set-to-default controls live on the global settings page only.
- Phase 3 rule: port, not rebuild — one old ADE file per spec, old UI is the design, only the wire changes.
- When a harness system reminder conflicts with a project tool rule, builders follow the project rule (ten receipts this session hit a bash-vs-Read/Edit/Write conflict; all followed the project rule).
- Root cascades: global default ~/Desktop, then session root set from the file browser and cascading to every track and region, then a track may diverge, then a region may diverge.
- Shutdown Suite shows one line per live session: name field, save checkbox, date and time. Saved sessions are archived, the rest dropped.
- Date and time show on every saved session anywhere it is listed.
- Global toggle, session override only, for archives as the library home. Transcripts are saved on our side.
- The old track settings modal is not needed. Devagent edits in place.
- Context files open in a read-only textarea inside devagent. Unlock makes it editable, Save writes through the save frame, then it locks again.
- Region settings on devagent are filtered to the rail. Unwired keys show greyed with their reason.
- The session rung lives on a matrix corner button beside Settings, expand and collapse, draggable around the perimeter.
- Agent strip stays exactly as it is.
- Old chat comes over detached from the gate list below it. Both become widgets. Old and new both stay registered.
- Add-widget picker shows one column per type.
- Queue vocabulary and web_io vocabulary stay separate for the port.
- Arrange waits. It merges with the map editor in Phase 4.
- create_track seeds a track's root from environment.root when none is given; setroot validates the path inline instead of through a global-mutating helper.
- Ledger action records are filtered per environment by the record's "session" key; tracks.list_regions(log_dir) finds the owning environment by log_dir. Queue-fired action records (server.py's _execute_queue_entry) still carry no region and keep landing in the old shared log.
- Shutdown Suite's modal and button are built entirely in JS on the Suite page; unchecked-save sessions end without archive by setting session["saved"]=False before end_session runs.
- TrackHub.ask times out on the region's gate_wait_s setting (default 150) and returns "" — a timeout reads as a closed gate to its one caller in engine/agent_loop.py.
- library_archives is a global toggle (session override) gating archives as the library home; ade/tracks.py's reset copies a region's old context file forward to the new id when one exists. server.py's _live_region_ids() guesses its key (regions/tracks/agents) off environment_rows() — unverified.
- The add-widget picker draws one column per registry row with inline flex styles, no new CSS class. Agent strip is ported as widget type "strip" with its ag- rules copied wholesale, unconditional on ade.css being present. The session rung self-mounts its own corner bar; it does not yet sit beside the real Settings button, whose file is still unlocated.
- devagent's settings block/type mapping is a hardcoded table (BLOCK_OF); no schema route exposes engine/settings.py's ROWS. A brand-new context file saves with a plain relative path that misresolves if environment.root ever diverges from the project root; an existing file saves through fs/read's absolute path instead.
- devagent listens for mx:open-devagent on document, selects the region/track in the detail, and re-renders.
- anchor_chat and gate_list both bind to a region via frame.options.region; only gate_list also subscribes to region_replaced, so it alone follows a region reset.
- timeline, queue-log, ledger, and messenger scope their copied CSS under their own widget class (.mx-timeline, .mx-queue-log, .mx-messenger); none load ade.css directly.
- mx:open-ledger and mx:open-devagent are document-level CustomEvents; timeline.js, ledger.js, and devagent.js agree on document, but changes.js still dispatches mx:open-ledger on window — the two don't meet yet.
- The ledger widget keeps per-instance state on frame._ledger so more than one ledger widget can be open at once; queue-log and messenger likewise avoid module-level singletons.
- The transcript widget is bound to one session per frame instance (frame.sid); the Suite page reads library_archives as a flat global via Api.getGlobal(), not a per-session override.
- static/js/ade is deleted except arrange.js/region.js/cables.js, moved to Docs/audit/arrange-old/ for Phase 4. The four old ade-*.html pages and their server.py routes are gone; static/css/ade.css stays, referenced only in comments now.
- Headed Playwright test harness at [Docs/tests/matrix_harness.py](Docs/tests/matrix_harness.py), run command and behavior in [RECEIPT-test-job1-setup.md](Docs/Reports/RECEIPT-test-job1-setup.md). Test session id 6ab8273846b3 is fresh: no tracks, records, or model.
- haiku and gemma4:e4B are both absent from the models registry (injections/models/, library/registry/providers.json) — [RECEIPT-test-job1-setup.md](Docs/Reports/RECEIPT-test-job1-setup.md).
- Three systemic defects found across Wave A: widgets read msg.rows where names live in msg.tracks (ledger, queue_log, changes); .mx-host is not display:flex so inner flex:1 collapses (anchor_chat, ledger); matrix.html never loads static/css/ade.css so ported classes are unstyled (queue_log, ledger, anchor_chat). See the four specs in [Docs/Reports/phase3-test/](Docs/Reports/phase3-test/).
- Ledger loose end settled: region names live in msg.tracks, not msg.rows — [RECEIPT-test-job5-ledger.md](Docs/Reports/RECEIPT-test-job5-ledger.md).
- Wave A pass/fail/untestable counts: anchor_chat 0/2/2, queue_log 2/3, queue 5/0/7-untestable, ledger 1 pass/1 pass-with-defect/1 fail. Fix lists in each of the four specs in [Docs/Reports/phase3-test/](Docs/Reports/phase3-test/).
- The recurring console 404 seen on every widget mount is page-level (/favicon.ico), not a widget defect — traced by curl in [RECEIPT-test-job3-queue_log.md](Docs/Reports/RECEIPT-test-job3-queue_log.md) and [RECEIPT-test-job5-ledger.md](Docs/Reports/RECEIPT-test-job5-ledger.md).
- Plan lives in the doc gen project file, not localStorage. Reverse: restore the seed's `arrangeMockD2` store.
- Arrange shows state by motion and brightness together: complete greyed and still, working and thinking pulse on the border, idle pulses slow and sits between. Reverse: seed's opacity rules, pulse back on the dot.
- Loop glow is a static box-shadow border, always on, dash march removed. Reverse: restore `dashflow` and the dev flag.
- Five notch kinds: in, out, git-in, git-out, message. Reverse: seed's three kinds plus two flags.
- Message wire rides the file cable when one exists. Reverse: delete the message deriver and the kind.
- Mini nodes (branch/merge/group) are a node `kind`, suite only, doc gen ignores them. Reverse: drop the three kinds from the canvas menu.
- Job context is one per job, written to injections/region/<node>/ as context.json and injection.md. Reverse: keep it in memory.
- Save to library and import from library use a new library/docs/ folder. Reverse: remove two buttons and the folder.
- Settings pane sends edit_track frames, no settings widget. Reverse: remove the pane.
- Doc gen map is non-interactive, arrange skin as a third renderer and the default, edges from plan file cables, authoring-order chain removed. Reverse: four rows in [SPEC-map-arrange-skin.md](../Doc%20Generator/docs/SPEC-map-arrange-skin.md)'s undo table.
- Foundation 4 broken on Brandon's word. Reverse: delete the PLAN section and the three backend lines.
- Reset count is the region name suffix the server already stamps (`_stamp_name`, ade/tracks.py:1137). No client tally.
- `_send_change_prompt` broadcasts to every socket on the environment now, not just the asking socket; `create_track` sends `track_created` every time (region or `None`); `load_preset` takes `msg.get("mode")` — `"reset"`/`"in_place"` skip the prompt and call `_do_load_preset` directly. [ade/frames.py](ade/frames.py), [Docs/HOWTO-frames.md](Docs/HOWTO-frames.md).
- Four shared modules under static/js/widgets/shared/ — root-browser.js, add-controls.js, settings-rows.js, derived.js — moved out of devagent; mount and timeline both call them instead of their own copies.
- `/api/fs/put` (new route) writes any path and creates parent folders; `/api/fs/write` still refuses a path that is not already a file. Arrange's plan file goes through `/api/fs/raw` (uncapped read) and `/api/fs/put` (write).
- `deriveMessageHandoffs` is filled in: one entry per from/to pair off `wp_feed` lines, `dead`/`denied` and self-addressed lines skipped, `paths` left empty.
- `/api/library/presets` returns `{"list": [...]}`; the F-series specs assumed `names`. Timeline's fetch reads `names` then falls back to `list`.

## LAST WEEK
- 2026-09-07: Arrange widget scoped, shared PLAN JSON landed in the Doc Generator's project file, two build specs written, nothing spawned — [SESSION-REVIEW-2026-09-07-arrange-scope.md](Docs/Reports/SESSION-REVIEW-2026-09-07-arrange-scope.md).

## WARM START — 2026-09-06 (close)
- Situation: Phase 3 built and unrun; test pass started this session. Four widgets specced (anchor_chat, queue_log, queue, ledger) by Opus spec agents against old code and the redpen checklist — they wrote what's wrong, did not fix. Thirteen remaining widgets specced as jobs for the next session.
- Last state: fixes not yet designed. Brandon's shape for fix work is his own notes plus the four specs. Nothing fixed, nothing committed, server never restarted this session.
- Next move: Brandon's call — run Waves B and C from [Docs/Specs/SPEC-test-waves-BC.md](Docs/Specs/SPEC-test-waves-BC.md), or design fix jobs first.
- Links: [Docs/Reports/SESSION-REVIEW-2026-09-06-phase3-test.md](Docs/Reports/SESSION-REVIEW-2026-09-06-phase3-test.md) · [Docs/Specs/SPEC-test-waves-BC.md](Docs/Specs/SPEC-test-waves-BC.md) · [TODO.md](TODO.md)

## WARM START — 2026-09-07 (close, Session F)
- Situation: Session F (widgets) ran four Goto builders — backend frame edits, four shared modules pulled out of devagent, timeline's right-click/presets/change-prompt/handoff rebuild, and the arrange widget built whole. Nothing run live: no server restarted, no browser opened by any of the four.
- Last state: F1–F3 clean under cap. F2 (shared modules) ran 261k against a 180k cap; F4 (arrange) ran 198k against its spec's 150k ceiling — both noted, neither investigated. `node --check`/`ast.parse`/import checks clean across all four; no Python test suite rerun by F2–F4.
- Next move: Brandon opens the suite and tries one edit round trip on timeline and devagent, then decides the six open items in [TODO.md](TODO.md) — F2's cap vs spec size, the `/api/library/presets` `list`/`names` field, arrange's frame subscribe list, live ghost nodes, and `/api/fs/put` vs `/api/fs/write`.
- Links: [Docs/Reports/REVIEW-session-F-widgets.md](Docs/Reports/REVIEW-session-F-widgets.md) · [SESSIONLOG.md](SESSIONLOG.md) · [TODO.md](TODO.md)
