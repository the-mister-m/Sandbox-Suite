# HANDOFF — Phase 3 — Sandbox Suite

Written 2026-09-06 by the Phase 2 scoping session agent. For Brandon,
for the session that scopes Phase 3. Every Phase 3 decision that
surfaced during Phase 2 scoping is here, unanswered. Phase 2 builders
append to the PHASE 3 SURFACED section through their receipts; the
Phase 2 session agent copies those lines here before the closer runs.

## WHAT PHASE 3 IS, FROM THE CLEANUP SCOPE

ADE. Timeline uses messages and diffs to show interaction between
agents, lines with notches like a subway map. Arrange has a left-side
collapse and expand for phases, a track pane mirroring the timeline for
editing track and region and jumping to a job on the map with a map
icon. Nodes are jobs. Arrange visualizes past, current, and future work,
shows loops, imports the mapdocs library, and uses messages, changes,
and queue to draw edges and notches. Nodes show track and region info,
reset count, and a notes window. Notches show files and git. Edges show
shared files and messages, different wires in one cable. Messages,
Changes, Queue, Ledger, Transcripts are fine as is for the most part.
The gate is a multi-agent redpen run with a manual checklist per bullet.

Library in Phase 3: tools, skills, hooks.

## DECISIONS BRANDON PARKED FOR PHASE 3

- After Phase 3 Brandon will know exactly what settings need to be
  where across the five tiers. Phase 2 puts settings on all five and
  moves nothing.
- The region preset JSON shape may change up to the end of Phase 3.
  Nothing in Phase 2 locks it with validation beyond what exists.
- Track settings stay slim over region through Phase 2. Whether track
  gains more is a Phase 3 call, when the track pane exists.
- A third corner button on the matrix window, Settings, holding session
  settings plus a tab for track settings and a tab for region settings.
  A fourth corner button, Context, holding a tab per track and region
  context. Brandon said it might be worth throwing out there. Two
  buttons ship in Phase 2.
- The context area UI: the Model Context window for cloud providers
  ships in Phase 2 inside region settings. Everything else about
  context and library in one separate context area is Phase 3.
- Region context stays bare through Phase 2. It comes into play when
  Brandon starts making maps and building query agents.
- A defaults page for new widgets: every new widget instance starts at
  widget_defaults for its type. Where those defaults are edited, the
  Suite Page settings or the session settings, is Phase 3.
- Skills: Brandon will worry about skills later. Tools are piped in
  through engine/tools.py in Phase 1 and stay in mind for Phase 3 and
  Phase 4.
- Reset never needed a UI beyond the reset-on-change toggle and the
  change modal. The four old reset fields, allow reset, context cap,
  start turn on reset, reset note, are region rows. Whether any of them
  gets a surface in the track pane is Phase 3.
- The daemon's simple log page. Phase 2 builds the queue widget and
  the mini queue. The log page is not built in Phase 2.

## WHAT PHASE 2 PIPES IN FOR PHASE 3

Read the Phase 2 receipts in Docs/Reports/RECEIPT-D*.md for the exact
names. What lands, by job:

- Job 1: five settings tiers in one table. Session inherits global.
  Widget tier keyed by type. Registries for widgets and providers.
  Track and region context folders with a compiler loader, region
  folder empty. Session templates holding tracks and an empty map data
  slot for when maps are piped in. The change modal as a frame pair.
- Job 3a: a World per session id. A registry of live Worlds. Autosave
  on shutdown, recovery on boot into the open-sessions display, no
  reconnect. Archive schema bumped by one.
- Job 3b: one socket, one session. One gate vocabulary, gate_action.
  Page routes for suite and matrix.
- Job 4: Suite Page at route "/". Library with presets, providers,
  saved sessions, session templates, matrix templates, model manager,
  voices, context file references.
- Job 5: matrix window, grid, widget frame contract in four lines,
  matrix templates. Grid state in the browser per window.
- Job 6: chat, mini queue, queue as widgets. Speech per chat window.
- Job 7: editor and terminal as widgets.
- Job 8: browser and viewer as widgets, plus a shared read-only Monaco
  module.

## OLD ADE CODE STILL ON DISK, FOR PHASE 3 TO REWRITE OR RETIRE

All in static/js/ade/ and static/ade*.html, untouched by Phase 2.

- tracksettings.js, 2975 lines. The old track menu. Sections: presets,
  identity, session, context stack, tools, resolved stack. The resolved
  stack section showed a per-key source label called provenance. Spec B
  removed the resolver and the resolved route now returns preset_name.
  Four provenance reads in this file break against the new route. The
  resolver does not come back. Region settings live on the region, one
  source per key.
- timeline.js, 1736 lines. Never mapped in full; the phase 3 map's
  timeline agent did not return. Row building, span placement, action
  pips, and toggles are unverified.
- arrange.js, 1721 lines, with region.js, cables.js, arrangewin.js.
  Plan stored in the browser under one key. Nodes are region shapes.
  Cables derive from write and read records, one cable per region
  pair. The pop-out window has no socket. The phase 4 map covers the
  plan model in full.
- queuelog.js, changes.js, ledgerview.js, messenger.js. The gate color
  helper drifted between queuelog.js and changes.js. ade-ledger.html's
  title still says Queue/Log while hosting the ledger view.
- agentstrip.js, chat.js, multiuse.js, boot.js. Two gate vocabularies
  lived here; Job 3b and Job 6 unify them server side and in chat. The
  rest of these files still send the old form until rewritten.
- retiredwin.js and ade-retired.html. The retired chats window, fetched
  in spec A. Not mapped in the old passes.
- The Rail C hook in hooks/ade_pretooluse_hook.py registers only when a
  region's claude tools list is non-empty. Two endpoints in server.py
  resolve and record. Nothing in Phase 2 touches it.

## OPEN THREADS FROM PHASE 1, NOT PHASE 2'S TO CLOSE

- requirements.txt still pins claude-agent-sdk and names the deleted
  claude_sdk.py in a comment. Flagged in receipts A and B, never named
  for an edit.
- The old index.html and control.js stay on disk after Job 4 repoints
  route "/". Their removal is the closer's call.
- agent/Aglaya and Docs/tests placement were left as Brandon's calls in
  the Phase 1 session review.

## PHASE 3 SURFACED DURING PHASE 2 BUILD

Appended from each Phase 2 receipt's PHASE 3 section by the session
agent. Empty until builds run.
