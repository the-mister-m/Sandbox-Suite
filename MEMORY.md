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
- Server frames: `tracks` are region rows, `rows` are track container rows. Five widgets read the wrong one — strip, changes, messenger, queue-log, ledger. [SPEC-phase4-fixes-sonnet.md](Docs/Specs/SPEC-phase4-fixes-sonnet.md).
- No client frame re-requests the roster; S2 adds a `roster` frame. `frames.py:322` blocks the session root; S2's fix F6 corrects it. [SPEC-phase4-fixes-sonnet.md](Docs/Specs/SPEC-phase4-fixes-sonnet.md).
- HOWTO-frames.md covers ade/web_io.py senders only; engine/web_io.py senders are undocumented — S1's fix F3 adds them. [Docs/HOWTO-frames.md](Docs/HOWTO-frames.md), [SPEC-phase4-fixes-sonnet.md](Docs/Specs/SPEC-phase4-fixes-sonnet.md).
- Widget folders regroup into six groups — chat, queue, usertools, agent, adetools, shared — in S3. [SPEC-phase4-fixes-sonnet.md](Docs/Specs/SPEC-phase4-fixes-sonnet.md).
- Widget folders are physically grouped under static/js/widgets/<group>/ (chat, queue, usertools, agent, adetools, shared) — done in S3, picker dropdown updated to match. [RECEIPT-phase4-S3.md](Docs/Reports/RECEIPT-phase4-S3.md).
- library/maps/ holds archived doc generator maps (Music History.json, Music History.2.json, Desktop.json) — housekeeping list, Brandon's call, nothing moved yet. [SESSION-REVIEW-phase4-2026-09-07.md](Docs/Reports/SESSION-REVIEW-phase4-2026-09-07.md).
- The anchor frame is gone; anchor-chat is now a region switcher on follow and mirror. [RECEIPT-phase4-W2.md](Docs/Reports/RECEIPT-phase4-W2.md).
- Raw out/status/meters fan-out is deleted; the mirror is the one tagged stream. [RECEIPT-phase4-W5.md](Docs/Reports/RECEIPT-phase4-W5.md).
- Archive writes master.prev before overwriting; shutdown skips unhydrated environments. [RECEIPT-phase4-W1.md](Docs/Reports/RECEIPT-phase4-W1.md).
- Injections context files resolve against the project root, not the session root — reverted from the session-root resolution tried mid-phase. [RECEIPT-phase4-F-F.md](Docs/Reports/RECEIPT-phase4-F-F.md).
- Ollama's default model is gemma4:26b-mxfp8.
- Rule conflict, unresolved: the harness bypass notice tells agents to read and edit through Bash; the project rules say Read and Edit tools so Brandon sees edits. Every Phase 4 box followed the project rules. [SESSION-REVIEW-phase4-2026-09-07.md](Docs/Reports/SESSION-REVIEW-phase4-2026-09-07.md).
- Widget-closes-resets-siblings cause found: grid.js removeWidget calls render() on both branches and rebuilds every widget; addWidget already carries the fix. [SCOPE-phase0-foundation.md](Docs/Scope/Code%20Canvas%20port/SCOPE-phase0-foundation.md) job A.
- Window resume gap: window id lives in sessionStorage, no picker into stored grids. Same scope doc.
- Wayfinder compiles to ES modules with no node imports in the five files that would be vendored — vendor as-is, don't hand-convert. [MAP-wayfinder.md](Mapdocs/MAP-wayfinder.md).
- Brandon's Code Canvas port decisions (doc and raw HTML modes both, iframe stays same-origin, Motion is one widget that authors and plays, Code widget is the drawer detached, vendor Wayfinder not hand-convert, graph by path plus a spawn route in phase 0, window event bus with a server frame in phase 0, hand-rolled force sim first, filters as options, five graph widgets) — [SESSIONLOG.md](SESSIONLOG.md) entry 2026-09-11 ~19:40.
- Phase 0 done: tab id (MX.TAB_ID) split from surface id (MX.WINDOW_ID) — bus gates on TAB_ID, layout/widget mirror gates on WINDOW_ID. [RECEIPT-phase0-sonnet3.md](Docs/Reports/RECEIPT-phase0-sonnet3.md).
- Bus (static/js/matrix/bus.js) carries three channels over one widget_bus frame: surface.layout, surface.widget, surface.name; MX.bus.on/off/emit, drops frames stamped with its own tab id. [RECEIPT-phase0-sonnet2.md](Docs/Reports/RECEIPT-phase0-sonnet2.md).
- Seven widgets (editor, viewer, chat, browser, terminal, queue, mini-queue) round-trip every getOptions key through onOption and call markDirty on internal change; markDirty is one debounce timer per frame id, not grid-wide. [RECEIPT-phase0-sonnet4.md](Docs/Reports/RECEIPT-phase0-sonnet4.md), [RECEIPT-phase0-sonnet5.md](Docs/Reports/RECEIPT-phase0-sonnet5.md).
- Socket goodbye cause and fix: werkzeug kept writing its HTTP tail after the close frame; server.py now waits on the close reply and shuts the socket before that tail, opening burst moved inside the try — session agent fix, reran phase0_final.py clean. [SESSION-REVIEW-2026-09-12-phase0.md](Docs/Reports/SESSION-REVIEW-2026-09-12-phase0.md).
- xterm/Monaco loader collision (both install an AMD `define`, one throws "anonymous define call"): terminal.js hides its define while the two xterm bundles load — session agent fix, step 6 now PASS. Same review.
- E (graphs) and G (config home) on hold. Brandon's open decisions: config home for the analyzer path (own file / env var / global.json line); current targets scope (this surface only or every surface of the session); wayfinder widget group (four widgets with a view toggle, or five; code data in or map in); SEAM doc (Docs/Scope/Code Canvas port/SEAM-phase0-phase1-targets.md) keep or drop. [SESSION-REVIEW-2026-09-12-phase0.md](Docs/Reports/SESSION-REVIEW-2026-09-12-phase0.md).
- Code Canvas port is four phases: 1 boilerplate and a throwaway test widget, 2 graph widgets, 3 canvas 2D (serial), 4 motion and 3D (scope only). [SESSION-REVIEW-2026-09-12-phase1-design.md](Docs/Reports/SESSION-REVIEW-2026-09-12-phase1-design.md).
- Target is a widget option: a dropdown of live targets across every open surface of the session, plus a New button. Same review.
- Mirrors are how targets share state. Same review.
- Wayfinder's compiled path is Wayfinder/out/ts/app. Same review.
- Graph target is a codebase, not a graph file: `/api/library/graphs/scan` runs Wayfinder's analyzer in place ([RECEIPT text, SESSION-REVIEW-2026-09-13-graph-scan.md](Docs/Reports/SESSION-REVIEW-2026-09-13-graph-scan.md)); New opens the macOS folder picker and scans; `graph.rescan` mirror reloads every widget on the target.
- One `picker` setting (native or suite, default native) routes every path picker in the suite — Canvas New, Wayfinder New, Viewer Open, Browser choose root, Editor Open/Save As. [SESSION-REVIEW-2026-09-13-target-picker.md](Docs/Reports/SESSION-REVIEW-2026-09-13-target-picker.md).
- `claude_tools` is a region list (all-or-nothing today); on/off toggle in settings-rows.js, default on. Loop-class labels ("tools ON/OFF") are decorative, nothing in engine/ reads them. [SESSION-REVIEW-2026-09-13-claude-tools-toggle.md](Docs/Reports/SESSION-REVIEW-2026-09-13-claude-tools-toggle.md).
- Anchor Chat is tightened (spacing, zoom bar, cache/ctx meters split cloud vs local); two widgets following one region on one socket no longer starve each other. Untested, server not restarted. [SESSION-REVIEW-2026-09-13-anchor-chat-sync.md](Docs/Reports/SESSION-REVIEW-2026-09-13-anchor-chat-sync.md).
- Widget folders renamed: graph/ → wayfinder/, canvas/ → codecanvas/, both families now show in the picker; type strings (graph_cards … canvas_code) left unchanged, too costly to rename.

## WARM START — 2026-09-13 (Phase3F file mode)
- Situation: Phase3F built file mode into Code Canvas — Targets widget, canvas tabs (many open files per Canvas), patch kinds (wrap/unwrap/move/remove/insert), file-mode interactions (multi-select, marquee, group/order/delete/duplicate/undo, menu, keys), Tools file-mode layers tree, Code widget file mode. Scope rulings verbatim: tabs on canvas, Targets widget, preview default, no widget types, no .json, ids may be written into files, mutate live never reload, tab edits held in memory, cmd-Z survives switch, stages with checkmarks, 250K watched not a wall.
- Last state: seven harnesses green — phase3_headed (doc mode, live track) 18/18, phase3F_headed (main walk) 10/10, phase3F_headed_keys 11/11, phase3F_headed_tools 10/10 (+ socket first-bind 0/10 stalls, measured three times), phase3F_headed_drag 11/11, phase3F_headed_code 11/11, phase3_headed_trace 18/18. Monaco's "Canceled" pageerror traced to WordHighlighter's cancelled delayer on setModel, killed with `occurrencesHighlight: "off"`. The walk moved off nirvana-canvas.html onto two plain fixtures (Docs/scratchpad/phase3F-fixture.html, -2.html) because the nirvana file builds most of its body in its own scripts, outside cv.source.
- Next move: Brandon's "later spec" list — links-live toggle on the canvas (default off), right-click context menu on Tools Layers rows, Group/Ungroup on a sticky Layers header, annotate track picker on the canvas bar (default none), group geometry ("doesn't parent/child the way you'd think" — Brandon leaving it to play with first). Also unruled: G's "page" tab label now reads "pages", section key still `page`. Uncommitted: this session's edits share one tree with four other sessions today (graph-scan, target-picker, claude-tools-toggle, editor-open-browser, editor-save-picker, anchor-chat-sync). Server pid 92195 (nohup, log in the session scratchpad) outlives the session, nobody owns it.
- Links: [SESSION-REVIEW-2026-09-13-phase3F-file-mode.md](Docs/Reports/SESSION-REVIEW-2026-09-13-phase3F-file-mode.md), [STICKY-2026-09-13-session-agent.md](Docs/stickies/STICKY-2026-09-13-session-agent.md), [SESSIONLOG.md](SESSIONLOG.md), [TODO.md](TODO.md).

## LAST WEEK
- 2026-09-05: Phase 1 read, specced, and built (foundation, engine, tools/context) — [SESSIONLOG.md](SESSIONLOG.md).
- 2026-09-06: Phase 2 scoped and built in four waves (settings, environments, sockets, suite/matrix, widgets); Phase 3 scoped (14 E-specs) and built (17 builders, nothing run live); Phase 3 test pass started, four widgets graded, thirteen specced as jobs — [SESSIONLOG.md](SESSIONLOG.md).
- 2026-09-07: Arrange widget scoped and its shared PLAN JSON landed in the Doc Generator; Session F built backend frame fixes, shared widget modules, timeline behavior, and the arrange widget (nothing run live); devagent CSS written; Phase 4 scoped from a read pass, then built and tested headed across twenty-seven boxes, five fix waves — [SESSIONLOG.md](SESSIONLOG.md).
- 2026-09-11 to 2026-09-12: Code Canvas port recon, two waves across four Sonnet Goto agents, five maps written; session agent then read about 330KB of code and wrote five phase scopes (0 through 6); nothing built — [SESSIONLOG.md](SESSIONLOG.md).
- 2026-09-12: Phase 0 built and redpenned, five Sonnet builds and five Opus headed reruns serial; every headed line PASS at close. Same day, phases 1 to 3 of the Code Canvas port built end to end, 29 jobs, all three headed gates green — [SESSIONLOG.md](SESSIONLOG.md), [SESSION-REVIEW-2026-09-12-phase0.md](Docs/Reports/SESSION-REVIEW-2026-09-12-phase0.md).

## WARM START — 2026-09-12 (phases 1 to 3 green)
- Situation: Code Canvas port phases 1 to 3 built, redpenned, headed, and green. Phase 1 boilerplate 10/11 (one FAIL fixed by seam), Phase 2 graph widgets 13/13, Phase 3 canvas 2D 18/18. Every contract in section 2 held or widened, nothing renamed.
- Last state: contract rulings this session — 2.2 mirror drops on inst only for local hits, apply gets (payload, meta), optional fourth targetKey arg; 2.3 values(frame) optional arg; 2.6 graph.filters is every option key except target; 2.7 canvas.select may carry notes:true, canvas.freeze rides the mirror. Additive fields: tool builders (widgets, state), openRootBrowser opts.ext array, /api/fs/put b64, /api/snapshot, _canvas.doc(), state.setHidden, state.replace, MX.graphFilterFields, MX.graphMapStyles, force gravity option. widget-frame startingOptions now merges module defaults under registry defaults.
- Next move: Phase 4 (motion/3D) has a scope doc only — no specs until Brandon rules. Brandon's other open items are in TODO.md (comment-rule check on pre-2C agents, drawn-widget.js ownership rule, token-count-cap decision).
- Links: [SESSION-REVIEW-2026-09-12-phases1-3-build.md](Docs/Reports/SESSION-REVIEW-2026-09-12-phases1-3-build.md), [STICKY-2026-09-12-session-agent.md](Docs/stickies/STICKY-2026-09-12-session-agent.md), [SESSIONLOG.md](SESSIONLOG.md), [TODO.md](TODO.md).
