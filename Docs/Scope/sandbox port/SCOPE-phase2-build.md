# SCOPE — Phase 2 build — Sandbox Suite

Written 2026-09-06 by the session agent for the next session agent.
Source: the cleanup scope, receipts A, B, B2, C, the closer receipt, the
phase 3 map, the library map, the phase 4 map, and Brandon's decisions in
the 2026-09-05 to 2026-09-06 session. Every line here was decided. There
are no open questions in this file or in the specs it points to.

## HOW TO RUN THIS

- You are the session agent. You spawn builders. You do not build.
- Spawn every builder as the Goto agent type with a model override. Opus
  or Sonnet per the job table. No other agent type. No other override.
- Builders stay in their lanes. Each spec names the files a builder may
  touch. The wave map exists so builders do not ask questions. A builder
  who asks a question has not read the spec.
- Jobs in the same wave touch different files and run side by side in
  one worktree. No extra worktrees.
- Every builder leaves a receipt in Docs/Reports before 250 thousand
  tokens. Ceilings in the table are budgets, not forecasts.
- Job 9, the redpen run, runs in this session, by hand, against the
  running app. It is the gate. Nothing goes to the session review until
  every checklist line is checked or marked failed with output.
- Code comments are label, function, and state only. No contracts, no
  reasoning, no names. Reasoning goes in the receipt.
- Language: reset and persistence. Never death, graveyard, kill for an
  agent. Process kills stay process kills. "spine" is banned.
- Add nothing that is not in this scope or its specs. A builder who
  finds a gap fills it with the smallest thing and names it in the
  receipt under QUESTIONS. Brandon answers after, not during.
- Anything that surfaces as a Phase 3 decision goes into
  Docs/Handoffs/HANDOFF-phase3.md, appended, never answered.
- Update INDEX.md and SESSIONLOG.md before the closer runs.

## THE WAVE MAP

```
WAVE 1   Job 1  Settings + Presets + Templates + Registries + Context   (engine, Opus)
              │
WAVE 2   Job 3a Worlds per session, list/save/end, autosave on shutdown  (server, Opus)
              │
         Job 3b Socket binding, gate vocabulary, route stubs             (server, Opus)
              │
         ┌────┴────┐
WAVE 3   Job 4     Job 5
         Suite     Matrix + Widget Frame
         + Library + Matrix Templates
         (Sonnet)  (Opus)
         └────┬────┘
         ┌────┼─────────┐
WAVE 4   Job 6   Job 7   Job 8
         Chat    Editor  Browser
         Mini Q  Term    Viewer
         Queue   (Sonnet)(Sonnet)
         (Opus)
         └────┴─────────┘
              │
CLOSE    Job 9  Redpen  (in session)
```

| job | spec | model | gap | drift | blast | ceiling |
|---|---|---|---|---|---|---|
| 1 | SPEC-D1-settings.md | Opus | low | highest | every region | 180k |
| 3a | SPEC-D3a-worlds.md | Opus | highest | medium | whole server | 180k |
| 3b | SPEC-D3b-sockets.md | Opus | high | medium | whole server | 150k |
| 4 | SPEC-D4-suite-library.md | Sonnet | medium | medium | one page | 150k |
| 5 | SPEC-D5-matrix.md | Opus | high | medium | every widget | 180k |
| 6 | SPEC-D6-chat-queue.md | Opus | medium | high | chat, gate frames | 180k |
| 7 | SPEC-D7-editor-terminal.md | Sonnet | low | low | two widgets | 150k |
| 8 | SPEC-D8-browser-viewer.md | Sonnet | medium | low | two widgets | 150k |
| 9 | this file, REDPEN CHECKLIST | session | none | none | none | 150k |

Specs live in Docs/Specs/. Gap risk is how much the builder has to
discover. Drift risk is how likely the builder adds things. Blast radius
is what breaks if the job is wrong.

## WHERE PHASE 1 LEFT THE TREE

Read this so you can answer a builder without opening a file.

- Providers: Ollama in engine/ollama_provider.py. Gemini, Claude, Claude
  persistent, and the Router in engine/providers.py. Codex, LiteRT, and
  llamacpp are gone. Router.list_models returns rows of id, provider,
  model, version. There is no provider registry. Router holds three
  instances by attribute.
- Settings: engine/settings.py is the only table. Three tiers today:
  global, track, region. Rows carry a block column: none for harness
  rows, ollama, or claude. Sampling rows come from a helper. Gates live on
  the Region as overlay rows, mirrored to the policy overlay, outside the
  bag on purpose. Global has thirteen keys: skin, modal_mode,
  modal_mode_ade, gate_keyboard, approve_hold, confirm, killswitch,
  kill_holds, kill_hosts, shutdown_suite, voices, stt_engine, models.
- Presets: five files in library/presets. Five functions in settings.py:
  list, read, write, delete, rename. Load copies the whole bag onto the
  region. Save writes the whole bag. There is no resolver. The old
  settings_stack is deleted. The resolved route returns preset_name where
  it used to return provenance.
- Reset: reset_on_change is a region row, nullable, live. apply_edits in
  ade/tracks.py applies the reset-on-change rule through _reset_with.
  reset_region, _do_reset, _archive_reset_transcript, _reset_watch, and
  _reset_to_scratch all came over into ade/tracks.py. reset_self and
  reset_region are gated tool edges in engine/tools.py. A reset
  instruction string lives in settings.py. Four reset fields are region
  rows: allow_agent_reset, context_reset_cap_k, start_turn_on_reset,
  reset_instruction.
- Track: id, name, regions, root, order, created. Nothing else. Edit
  frames go to regions. There is no track-edit path.
- Sessions: one live world. Regions, tracks, and the session record are
  module globals in ade/tracks.py. Log and waypoint stores repoint per
  session id under archives/. Autosave fires at turn boundaries only
  after a first save. The close helper has zero callers, so an unsaved
  session is lost on shutdown. Templates exist: an archive with settings,
  no transcripts, status blanked. Reload swaps the whole world.
- Sockets: one websocket at /ws/ade is one viewing tab. Every tab sees
  the one world. Frames dispatch through ade/frames.py.
- Gates: engine/daemon_queue.py parks asks and writes queue.json. It has
  zero references to the deleted daemon shell. It stays. Two wire
  vocabularies exist for the same approve, deny, queue action:
  gate_action with action words, and answer with y, n, queue.
- Context: engine/compiler.py builds two strings per seat from
  injections/global (was preamble), injections/models, agent folders,
  injections/session (was shells), injections/skills, and the task. No
  track or region folder exists. No UI touches any of it. Skills inject
  for everyone when the applies line is missing. Skills are later.
  Tools are piped in through engine/tools.py.
- Front end: static/ is untouched old JavaScript. Route "/" serves the
  old index.html whose IDE and room routes were deleted in spec A.
  control.js still fetches two deleted routes. The splash is dead. Old
  panes for browser, editor, terminal, and preview sit in
  Docs/reference/ide-panes as read-only reference. Old ADE JavaScript in
  static/js/ade is Phase 3 code; four provenance hits live in
  tracksettings.js there and are not Phase 2's problem.
- Speech: speech.py is present. Voices live in global.json under voices.
- Tests: Docs/tests/ holds test_boot, test_settings, test_router,
  test_region_edit.

## THE DECISIONS, ALL OF THEM

### Hierarchy

Four levels. Shell is the Suite Page: providers, global settings and
context, library. Session is the workroom: matrix windows, widgets,
session settings and context. Track is a lane: name, root, order,
regions. Region is the worker: its settings, its gates, its context.

### Settings, five tiers

Global, session, widget, track, region. All five have settings. Region
and session have presets or templates. Widget options are per widget
instance, no carryover between instances. Track stays slim, name, root,
order. After Phase 3 Brandon decides what moves where.

Session inherits global by default. Every one of the thirteen global keys
can be overridden on the session. Voice lives on the session. Everything
else about speech lives on the chat widget. The global settings page
carries an Update Default button. Click opens a modal, "Are you sure?",
Yes and No. Yes writes the current session values as the new global
defaults. No cancels.

One source per key. The region bag is the truth for a region. A preset
is a snapshot copied onto a region and then forgotten. No live link. No
layered resolution. No per-key source labels. No live file reads at
spawn. Any builder who adds a resolver has broken the spec.

### Region presets

One JSON file, read by more than one parser. The ADE reads the harness
rows and the overlay rows. The Claude CLI reads the claude rows. The
ollama provider reads the ollama rows. The block column in settings.py
already draws this line. The shape may still change through Phase 3.

Four rules. Save is one write of the whole bag. Load is one copy of the
whole bag onto the region. Delete is one file removed. None of the three
read region state to decide whether to run. Save and load work on a
running, idle, or closed region. After any preset write the list
re-reads from disk.

The old bug, named so it does not return: the old load cleared six
Claude keys on the track and read them live from the file at spawn.
Track beat preset, so a stale track value outranked a fresh load. That
path is gone. It stays gone.

### Reset and the change modal

Reset-on-change is a per-region toggle, default on. Name and gate edits
never reset. The change modal reads "How would you like to change?" with
three buttons: Reset Region, Rewrite Cache, Cancel. It pops on preset
save, on preset load, and on any setting change when reset-on-change is
off. Rewrite Cache applies the setting and keeps the transcript. A cloud
model rewrites its cache cold and pays the write, not the read.

Model is a region choice. The picker shows Provider, Model, Version rows
from Router.list_models. Gates are region settings. Cloud providers keep
their model and harness context inside region settings, shown in a
separate window labeled Model Context. The rest of the context area UI
is Phase 3.

### Templates

Session templates hold tracks and any preloaded map data. No region
data. Map data is not piped in yet; the slot exists. When you save a
session, you choose Save Session or Save Session Template.

Matrix templates hold one window's grid and widget list. Separate from
session templates. Both exist.

### Sessions

Many sessions open at once. A world per session id, a registry of live
worlds, one socket bound to one session. Autosave after the first save
stays. On shutdown every open session autosaves whether or not it was
saved before. On boot, those sessions appear in the open-sessions
display on the Suite Page, marked open, no windows, no connection. You
start a matrix window for one when you want it. The world loads from
the archive it wrote on the way down.

### Suite Page

Replaces the dead splash at route "/". New and Open buttons. An
open-sessions display that lists how many sessions are open and lets
you start a matrix window for one. Save and End on each. End opens a
modal with Save, End, Cancel. The global settings page edits global.json
directly and carries the Update Default button. The library entry point
lives here.

### Library

Presets with a preset editor. Providers from a provider registry, with
empty slots for cloud and docker, no code behind them. Saved sessions.
Session templates. Matrix templates. Model manager over the model rows.
Voices. Context files are referenced by path and opened for edit, never
stored in the app.

### Matrix window

Opens blank, then binds to a session. One session can have as many
matrix windows as Brandon wants, on as many screens. Widgets sit in a
grid. Every border drags. A button on each widget moves it, the way
icons move on an Android home screen. Two corner buttons: Session and
New Widget. Session shows the bound session with Save, Save Session
Template, Save Matrix Template, End, and below that every open session
with how many matrix windows each has open. Click one to switch this
window to that session. New Widget opens the widget selection page,
which reads the widget registry. The widget list is open ended. Grid state lives with
the matrix window, not the session. Settings and Context corner buttons
are Phase 3 ideas and live in the handoff.

Every widget is an independent instance with its own options panel.
Options are per instance. Defaults for new widgets are a Phase 3
decision in the handoff.

### Widgets

Chat: file drag from the file browser, true markdown, speech per window.
One chat window speaks at a time. Two to four may be open. Cloud models
show the current context in the window only, no total.

Mini queue: its own widget, separate from chat. The old anchor chat pane
drew gate rows under the transcript. If the builder finds nothing
attached to chat today, the builder skips the mini queue and says so in
the receipt. No searching.

Queue: one view, called queue. The daemon keeps a simple log page.

Editor and terminal: independent instances, more than one terminal.
Editor save prompts the macOS browser dialog. Save modal on exit. True
markdown.

File browser: file sizes, right-click duplicate, rename, show in Finder,
open in Editor, open in Viewer. Root chosen through the macOS dialog,
everything else in app.

Viewer: renders markdown, images, vector graphics, PDF, audio, video,
tables from CSV, JSON, mermaid, and code. Code renders through read-only
Monaco with its color theme, the same syntax coloring engine as VS Code.

Gates: one wire vocabulary. Old daemon tools: the daemon shell is
already deleted. daemon_queue.py is the gate queue and stays.

### Registries and context

A widget registry the selection page reads. A provider registry the
library reads. Track and region folders under injections with a loader
in the compiler. The region folder stays empty; region context comes
into play with maps and query agents. Skills are later. Tools are piped
in now. Keep tools in mind for Phase 3 and 4.

## RECEIPTS

Every builder writes Docs/Reports/RECEIPT-D<job>-<name>.md with these
sections: EDITS with links, DELETED, TESTS with the command and count,
QUESTIONS for anything filled with the smallest thing, PHASE 3 for
anything that surfaced as a later decision, STRAY FILES. Timestamps
come from the transcript.

## REDPEN CHECKLIST — Job 9, run by hand in session

One line per user function. Check it or mark it failed with output.

Suite Page
- [ ] Route "/" serves the Suite Page, not the old splash.
- [ ] New opens a blank session. Open lists saved sessions.
- [ ] Open-sessions display lists every live session.
- [ ] Start a matrix window for a listed session.
- [ ] Save on a listed session writes its archive.
- [ ] End opens Save, End, Cancel. Each button does what it says.
- [ ] Global settings page edits global.json.
- [ ] Update Default opens Are you sure. Yes writes. No cancels.
- [ ] Stop the server with an unsaved session open. Boot. It is listed open.

Library
- [ ] Presets tab lists the five files. Editor opens one.
- [ ] Providers tab lists Ollama, Gemini, Claude, and two empty slots.
- [ ] Saved sessions, session templates, matrix templates each list.
- [ ] Model manager lists rows with provider, model, version.
- [ ] Voices lists the global voices block.
- [ ] A context file opens for edit by path.

Settings
- [ ] Session settings show all thirteen keys, inherited by default.
- [ ] Override one key on the session. Global is unchanged.
- [ ] Voice on session. Speech options on the chat widget.
- [ ] Track row shows name, root, order only.
- [ ] Region settings show reset-on-change, default on.
- [ ] Change one region setting with reset-on-change on. Region resets.
- [ ] Change one with it off. Modal pops with three buttons.
- [ ] Rewrite Cache applies and keeps the transcript.
- [ ] Reset Region resets. Cancel changes nothing.
- [ ] Rename a region. No reset. Change a gate. No reset.
- [ ] Cloud region shows a Model Context window.

Presets
- [ ] Save a preset from a running region. One write. Done.
- [ ] Load a preset onto a running region. Modal. Done.
- [ ] Delete a preset. List refreshes from disk.
- [ ] Load with reset-on-change on. Load with it off. Both take.
- [ ] No resolver, no source labels anywhere.

Sessions and matrix
- [ ] Two sessions open. Two matrix windows. No cross-talk.
- [ ] Two matrix windows on one session. Both live.
- [ ] Matrix opens blank. Bind to a session. Widgets appear.
- [ ] Session and New Widget corner buttons. Nothing else.
- [ ] Session panel lists open sessions with window counts. Click switches.
- [ ] Every border drags. Move button rearranges.
- [ ] Save a matrix template. Load it into a new window.
- [ ] Save a session template. Load it. Tracks present, no regions.

Widgets
- [ ] Chat: drag a file in from the browser. Markdown renders.
- [ ] Chat: speech per window. Two open, one speaks.
- [ ] Chat: cloud model shows current context only.
- [ ] Mini queue is its own widget, or the receipt says it was skipped.
- [ ] Queue is one view.
- [ ] Two editors, two terminals, independent.
- [ ] Editor save opens the macOS dialog. Exit prompts.
- [ ] Browser shows sizes. Right-click: duplicate, rename, Finder.
- [ ] Browser: open in Editor. Open in Viewer. Root via macOS dialog.
- [ ] Viewer renders each type on the list. Code has colors.
- [ ] One gate vocabulary. Approve, deny, queue work from every widget.

Conduct
- [ ] Grep the diff for death language. Zero hits outside process kills.
- [ ] Grep the diff comments for contract, Brandon, must. Zero hits.
- [ ] Every job has a receipt.

## POINTERS

- Phase 3 handoff: Docs/Handoffs/HANDOFF-phase3.md
- Cleanup scope: Docs/Scope/SCOPE-sandbox-cleanup.md
- Phase 1 receipts: Docs/Reports/RECEIPT-A-foundation.md,
  RECEIPT-B-engine.md, RECEIPT-B2-fixes.md, RECEIPT-C-tools-context.md
- Maps: Mapdocs/rewrite phase maps/
- Old panes: Docs/reference/ide-panes/
