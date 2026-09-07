# SPEC — Phase 3 test pass, Waves B and C — Sandbox Suite

Written 2026-09-06 by the Phase 3 test session agent (Fable) at Brandon's
request. Thirteen widgets left unspecced after Wave A. One job per widget.
Same shape as Wave A: look, compare, write a spec. No fixes.

## Shared setup, every job

- Harness: `python3 Docs/tests/matrix_harness.py --widget <type> --session 6ab8273846b3 --hold 45 --out Docs/Reports/phase3-test/`
  Writes `<type>-console.txt`, `<type>-full.png`, `<type>-widget.png`.
  Harness has no interaction flags. Agents may add a scratchpad probe that
  injects frames by page.evaluate, as Job 5 did. Run command in
  [RECEIPT-test-job1-setup.md](../Reports/RECEIPT-test-job1-setup.md).
- Session 6ab8273846b3 is fresh: no tracks, no records, no model registered.
  haiku and gemma4:e4B are absent from the models registry. Nothing added.
  If Brandon wants live sends tested, a driven session and a registered
  model come first.
- Server on 127.0.0.1:5000. Do not start, stop, restart. No new sessions.
- Agent: Goto definition, model override Opus. Cap 150K. Wave A actuals ran
  86K to 109K.
- Waves of four, headed. Brandon watches four Chrome windows at once.
- Read rule: grep first for ids, classes, events, handlers, routes in old
  and new. Then the new widget file and the old reference in full.
  Beyond: static/matrix.html and the registry row by grep hit lines.
  Nothing else. Log every read.
- Output: `Docs/Reports/phase3-test/SPEC-test-<type>.md` with RENDER,
  MISSING ELEMENTS, CHECKLIST, CONSOLE, FIX LIST, READS, BLOCKERS.
  Receipt `Docs/Reports/RECEIPT-test-job<N>-<type>.md`. One line each in
  INDEX.md and SESSIONLOG.md, read right before edit, one Edit, retry once.
- Rules: no edits to widget, server, or css files. No commits, README,
  installs. Comments label, function, state only. "spine" banned. Truthful.
  Mid-run message from the session agent: follow it.
- Known, do not re-derive: the favicon 404 is page-level. `msg.rows` versus
  `msg.tracks` is systemic (ledger, queue_log, changes). `.mx-host` is not
  flex. matrix.html does not load ade.css. Check whether your widget hits
  each, one line, move on.

## Wave B, Phase 3 ports

### Job 6 — strip
- New: static/js/widgets/strip/strip.js. Type: `strip`.
- Old: `git show HEAD:static/js/ade/agentstrip.js`, boot.js grep `strip`.
- Checklist: Agent strip: one chip per track, popover opens, kill button
  stops the track.
- Note: TODO says dot and badge styles are missing on matrix for strip.
- Estimate 70K.

### Job 7 — devagent
- New: static/js/widgets/devagent/devagent.js. Type: `devagent`.
- Old: `git show HEAD:static/js/ade/tracksettings.js` (79KB, largest old
  file), boot.js grep `tracksettings`. Second reference:
  Docs/reference/ide-panes/settings.js for the knob schema, grep only.
- Checklist: Tree lists tracks/regions, dot fill reflects track status.
  Add track and add region both work from the tree. Track rung: name/root/
  order fields save, context textarea loads and saves. Region rung settings
  tab: rail params, model picker, change_prompt choices all work. Region
  rung context tab: textarea loads, unlocks, saves.
- Also: the mx:open-devagent listener from E6b.
- Estimate 120K. Biggest job. Run alone in its wave slot if it climbs.

### Job 8 — gate_list
- New: static/js/widgets/gate-list/gate-list.js, shared/gate-common.js.
  Type: `gate_list`.
- Old: no single old file confirmed. Grep `git show HEAD:static/js/ade/chat.js`
  and boot.js for `gate`. Spec: Docs/Specs/SPEC-E7-chat-gatelist.md.
- Checklist: Gate list: pending gates show and can be settled.
- Note: Job 4 found the `cq-queue` class collision in gate-common.js:88.
  Say whether gate_list hits it.
- Estimate 70K.

### Job 9 — timeline
- New: static/js/widgets/timeline/timeline.js (57KB). Type: `timeline`.
- Old: `git show HEAD:static/js/ade/timeline.js`, boot.js grep `timeline`.
- Checklist: Timeline widget shows the same markup and interaction as the
  old timeline view. Timeline shows agent interaction as subway-map lines
  with notches, from messages/diffs.
- Note: TODO has an open decision on lanes with more than one region.
  Report what it draws now, do not decide.
- Estimate 110K.

### Job 10 — changes
- New: static/js/widgets/changes/changes.js. Type: `changes`.
- Old: `git show HEAD:static/js/ade/changes.js`, boot.js grep `changes`.
- Checklist: Changes widget shows the same markup as before. Jump button
  and diff-line clicks open the right ledger row. Changes widget works the
  same as before the port.
- Note: Job 3 saw the rows/tracks defect at changes.js:462. Confirm.
- Estimate 80K.

### Job 11 — messenger
- New: static/js/widgets/messenger/messenger.js. Type: `messenger`.
- Old: `git show HEAD:static/js/ade/messenger.js`, boot.js grep `messenger`.
- Checklist: Messenger: roster updates from track_list. Send, mute, and
  read all work. Messages widget works the same as before the port.
- Note: TODO says dot and badge styles missing on matrix for messenger.
- Estimate 80K.

### Job 12 — transcript
- New: static/js/widgets/transcript/transcript.js, shared/turns.js.
  Type: `transcript`.
- Old: `git show HEAD:static/js/ade/retiredwin.js` is the closest, not
  confirmed. Spec: Docs/Specs/SPEC-E13-transcript.md.
- Checklist: Transcript widget lists live regions then retired regions,
  with caches under each. Opening a cache renders turns. Suite page:
  Transcripts toggle on adds a per-row transcripts link; toggle off restores
  the row. The suite page line needs /suite loaded, not the harness.
- Estimate 70K.

## Wave C, D-series

No redpen lines exist for these. Each agent builds its checklist from the
named D spec's acceptance lines and lists them in its spec.

### Job 13 — chat
- Brandon looked and said the chat widget looks good. Lowest priority.
  Run only if Brandon wants the number. New: static/js/widgets/chat/chat.js.
  Type: `chat`. Spec: SPEC-D6-chat-queue.md. Old: ide-panes/chat.js.
- Note: shares gate-common.js and matrix-chat-queue.css with queue and
  mini-queue, so the `cq-queue` collision may reach it.
- Estimate 70K.

### Job 14 — mini_queue
- New: static/js/widgets/mini-queue/mini-queue.js. Type: `mini_queue`.
- Spec: SPEC-D6-chat-queue.md. Old: none. Compare against queue.js for
  frame subscriptions; Job 4 found mini-queue takes gate_broadcast/ask/
  gate_pending and queue does not.
- Estimate 50K.

### Job 15 — editor
- New: static/js/widgets/editor/editor.js, shared/monaco-readonly.js.
  Type: `editor`. Spec: SPEC-D7-editor-terminal.md. Old: ide-panes/editor.js.
- Note: Monaco is vendored in static/vendor. Report load time and console.
- Estimate 80K.

### Job 16 — terminal
- New: static/js/widgets/terminal/terminal.js. Type: `terminal`.
  Spec: SPEC-D7-editor-terminal.md. Old: ide-panes/terminal.js.
- Note: xterm vendored. A terminal may open a shell on mount. Report what
  process it starts, do not type into it.
- Estimate 70K.

### Job 17 — browser
- New: static/js/widgets/browser/browser.js. Type: `browser`.
  Spec: SPEC-D8-browser-viewer.md. Old: ide-panes/browser.js (28KB).
- Estimate 80K.

### Job 18 — viewer
- New: static/js/widgets/viewer/viewer.js. Type: `viewer`.
  Spec: SPEC-D8-browser-viewer.md. Old: ide-panes/preview.js. Brandon
  confirmed this pair.
- Estimate 60K.

### Job 19 — mount
- New: static/js/widgets/mount/mount.js. Type: `mount`.
  Spec: SPEC-D11b-mount-widget.md. Old: none.
- Estimate 50K.

## Totals, estimates only

- Wave B, seven jobs: about 600K.
- Wave C, seven jobs: about 460K. 390K without chat.
- Wave A actuals ran 20 to 70 percent over my estimates. Plan for that.

## After the specs

Fix jobs are not designed. Brandon's stated shape: his notes plus the
specs, divided into fix jobs afterward. Three systemic fixes should be one
call each, not per widget: rows versus tracks, `.mx-host` flex, and what
to do about ade.css rules matrix.html never loads.
