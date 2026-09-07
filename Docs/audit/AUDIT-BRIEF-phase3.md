# AUDIT BRIEF — Phase 3 scope input — Sandbox Suite

Written 2026-09-06 by the Phase 2 session agent. For one read-only
Fable agent, Goto type. Its report feeds the session that scopes Phase 3.
Brandon may change the lane before or during the run.

## What this is

Phase 2 rebuilt the backend and built new widgets from reference. The
new widgets are throwaways. Phase 3 ports the old ADE front end onto the
new backend, one old file per job, keeping the old UI as the design.
Before those specs are written, Brandon wants to know where the backend
is rotten and where the old front end will fight the new wire.

## What to read

Everything below. Grep first, then read whole files. Do not read specs,
receipts, or tests. The code is the evidence. If a claim needs proof,
grep one test by name.

Backend, about 446 KB:
- server.py
- ade/tracks.py, ade/frames.py, ade/web_io.py
- engine/*.py, speech.py

Old ADE front end, about 9,300 lines, all of static/js/ade/ and
static/ade*.html. This is the Phase 3 design. Read it to find every
place it assumes the old backend.

New front end, static/js/widgets/, static/js/suite/, static/js/matrix/.
Read only where a backend finding needs a caller shown. These files
are not the design and will not survive Phase 3 as they are.

## Brandon's decisions, from the Phase 2 build session

Binding. The audit measures the code against these.

Terms
- Turn: one intake, process, output. Run: turns back to back.
- Frame: one message on the socket. Instance: one mounted widget.
- Environment: the live container for a session. "world" is banned in
  code. "spine" is banned everywhere.

Sessions and sockets
- One Environment per session. Every environment argument is required.
  No current session, no default environment, anywhere.
- One socket per session. One socket carries many live regions at once.
- Ending a session closes every socket bound to it. Closing a window
  does not close a socket.
- Every request frame carries the instance id that sent it, and the
  region id where one applies. Every reply echoes the instance id.
- Suite-wide frames (reload, feed_dirty, tree_dirty) stay suite-wide.
  Brandon wants every page refreshed after every turn and layout back
  exactly as left.
- The two gate mechanisms, mid-run ask and daemon queue, stay separate
  behind one vocabulary, gate_action. No merge.
- The daemon queue stays as it is until Brandon drives it.

Settings
- Five tiers: global, session, widget, track, region. One source per
  key. No resolver, no provenance, no live file reads at spawn.
- Session tier is seeded from global at creation, editable live,
  switchable mid-session, archived beside the session record. New
  sessions inherit from global only, never from another session.
- Set-to-default and Update Default live on the global page only.
- Widget defaults live in global.json under widget_defaults. Widget
  files carry none.
- Global settings are real controls, never raw JSON.
- Model picker is provider, then model, then version. Hide and unhide
  stay as built. A hidden model cannot be unhidden today; Brandon
  decides after driving.

Widgets and windows
- Widgets live one per folder under static/js/widgets/<name>/. Shared
  modules under static/js/widgets/shared/.
- Editor, terminal, and viewer hold tabs. One PTY per terminal tab.
- Save is server-side only. The gate decides. No local browser write.
- The grid asks a widget before removing it. The widget may refuse.
- One Monaco loader, Job 8's. Chat code blocks use the read-only path.
- Grid state is server-side per session per window under library/grids.
- Markdown libraries are vendored under static/vendor. No CDN tags.
- The library on the suite page is hidden, not deleted. Its corner
  button goes live later.
- The stub widget is gone. A throwaway mount widget creates a track
  and region so other widgets have a worker.

Phase 3 rule
- Port, not rebuild. Each Phase 3 spec names one old file as the
  design. Keep its DOM, behavior, and look. Swap only the wire.

Undecided, do not resolve
- Matrix Load and Delete placement, swap on occupied drop, missing
  left and top resize handles, saved layout beating a carried grid.
- Whether ade_load and ade_new frames survive. Left untouched.
- The old ADE page is broken against the new socket path. Left alone
  on purpose; it still runs in the original repository.

## Where the other decisions live

Read these only when a finding needs the rule behind it.

- MEMORY.md, DURABLE FACTS. Closer-owned. Top-level truths.
- Docs/Scope/SCOPE-phase2-build.md, section "THE DECISIONS, ALL OF
  THEM". The Phase 2 scope in full, plus the redpen checklist.
- Docs/Handoffs/HANDOFF-phase3.md. Parked decisions, what Phase 2
  piped in, the old ADE file list with line counts, and every open
  question builders surfaced.
- Docs/Specs/SPEC-D10-tabs-targets.md and SPEC-D11a, D11b, D11c. The
  newest decisions in spec form.
- Docs/Reports/RECEIPT-D3c through D11c. Each has numbered decisions
  the builder made where a spec was silent.
- SESSIONLOG.md. What happened, in order.

## What to look for

Ranked by what Brandon saw while driving: socket trouble first.

1. Socket binding and the many-regions widening. How a connection
   holds its regions, mirrors, and anchor after Job 10. Races, leaks,
   sends after close, locks held across sends.
2. Environment arguments. Any path that reaches a session without
   being handed one. Any module global that still assumes one session.
3. Frame routing. Requests without an instance id, replies that do not
   echo one, broadcasts that should be targeted or targets that should
   be broadcasts.
4. Ending a session. What End actually tears down and what it leaves:
   PTYs, mirrors, parked queue items, archive directories, timers.
5. The daemon queue. Blocking waits, timeouts, what happens to a parked
   item whose region or session is gone.
6. Persistence. Autosave, reload, grid state, session settings. What
   survives a restart and what silently resets.
7. The ledger and waypoint stores. One store, many sessions. Where
   records misfile or cross.
8. Dead code from the one-session era. Fallbacks, unused frames,
   routes nothing calls.
9. The old ADE front end against the new wire. Every place it opens
   the old socket path, sends the old gate form, reads provenance,
   assumes one session, or names a route that is gone. Group by file.

## What to write

One report: Docs/audit/AUDIT-REPORT-phase3.md.

For each finding:
- File and line.
- What is rotten, in one or two sentences.
- Why it matters, against which decision above.
- Rough size to fix: lines, one function, one file, or cross-file.

Order findings by blast radius. Close with two lists:
- Blocks Phase 3 ports. Must be fixed before the first port lands.
- Can wait. Named so the scope session can schedule it.

Then one section, "Old front end, by file": for each old ADE file,
what it assumes that is no longer true, so each port spec can be
written from that entry alone.

## Rules

- Read-only. No edits to any file but the report. No tests run.
- Use the Read tool and grep. Bash is for grep, find, and wc only.
- Comments and prose: plain. No contracts, no attribution, no praise.
- Do not propose designs. Size the fix; do not write it.
- One line appended to INDEX.md and SESSIONLOG.md pointing at the
  report. Ask before writing them.
- Final message: the report path and the count of findings in each of
  the two closing lists. Nothing else.
