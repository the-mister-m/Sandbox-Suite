# SPEC D1 — Settings, Presets, Templates, Registries, Context

Wave 1. Engine only. Opus. Ceiling 180 thousand tokens. Receipt before 250.
Scope: Docs/Scope/SCOPE-phase2-build.md. Read it first. It answers every
question this spec does not.

```
WAVE 1   [Job 1  YOU]
              │
WAVE 2   Job 3a ─ Job 3b
              │
WAVE 3   Job 4 ─ Job 5
              │
WAVE 4   Job 6 ─ Job 7 ─ Job 8
              │
CLOSE    Job 9
```

Nothing runs beside you. Everything after you reads your table, your
registries, and your loader. Wave 2 reads your template path.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language. No death words for agents.
- Stay in your lane. Files you may touch are listed below. Nothing else.
- Add nothing not in this spec or the scope. Fill a gap with the
  smallest thing and name it in the receipt under QUESTIONS.
- Phase 3 decisions that surface go in the receipt under PHASE 3.
- Tests first for the settings work. The table changes before any
  frame does, and the tests pass before any frame does.

## LANE

- engine/settings.py
- engine/compiler.py
- ade/tracks.py, apply_edits and the template functions only
- ade/frames.py, preset and template frames only
- injections/track/ and injections/region/, new, empty
- library/registry/ new, holding widgets.json and providers.json
- Docs/tests/, new test files only, existing tests may not change

## READ THIS BEFORE THE TABLE

Five tiers. Global, session, widget, track, region. One source per key.
The region bag is the truth for a region. A preset is a snapshot copied
onto a region and forgotten. No live link. No layered resolution. No
per-key source labels. No live file reads at spawn. If you find yourself
writing a function that decides which of several sources wins for a
key, stop. That function is the old bug and it is banned.

The old bug: load cleared six Claude keys on the track and read them
live from the file at spawn. Track beat preset. A stale track value
outranked a fresh load. Spec B removed that path. You do not rebuild it.

## PART 1 — SESSION TIER

Add "session" to TIERS. Add one session row per global key, thirteen
rows: skin, modal_mode, modal_mode_ade, gate_keyboard, approve_hold,
confirm, killswitch, kill_holds, kill_hosts, shutdown_suite, voices,
stt_engine, models. Same type and default as the global row.

Inherit down: a session value that is unset reads the global value. A
session value that is set wins for that session only. Global never
changes because a session changed.

Add save_global_defaults(session_values): writes every session value
that is set into global.json as the new default. This is the function
behind the Update Default button. Job 4 wires the button and the modal.
You write the function and its test.

Voice lives on the session: voices and stt_engine are session rows. The
rest of speech lives on the chat widget in Part 2.

## PART 2 — WIDGET TIER

Add "widget" to TIERS. Widget rows are keyed by widget type. Options are
per widget instance, no carryover between instances of the same type.
Rows to add now:

- chat: speech_enabled bool, and the speech options that today live on
  the chat side of speech.py. Read speech.py to find them. Voice itself
  stays on the session.
- queue: the options the old queue view exposed as buttons, collapsed
  into one options row. Read static/js/ade/queuelog.js for the two
  edit_track fields it sends, claude_cache_ttl and claude_exclude_dynamic,
  and expose those two.

Leave room to grow: the widget tier is a table keyed by type, and a new
type is one row group, nothing else.

Add widget_defaults(widget_type) returning the row defaults for a type.
Job 5 calls it when a widget is created.

## PART 3 — PRESET RULES

The five preset functions exist: list, read, write, delete, rename.
Make them obey four rules and prove it with tests.

- Save is one write of the whole bag.
- Load is one copy of the whole bag onto the region.
- Delete is one file removed.
- None of the three read region state to decide whether to run.

Save and load work on a running, idle, or closed region. After any
preset write the list re-reads from disk.

Two parsers, one file. The ADE reads the harness rows and the overlay
rows. The Claude CLI reads the claude rows. The ollama provider reads
the ollama rows. block_keys and harness_keys already draw this line. Do
not add a third parser. Do not move rows between blocks. The shape may
change through Phase 3, so do not lock it with validation beyond what
exists.

Tests, in Docs/tests/test_presets.py: save from a live region, load onto
a live region, delete then list, load with reset_on_change true, load
with reset_on_change false. Each test asserts the bag on the region
equals the file after load and the file equals the bag after save.

## PART 4 — RESET AND THE CHANGE MODAL

reset_on_change is a region row, nullable, live, default None. Make the
default True. Cloud and local both default on.

The change modal is a frame pair, not UI. Add to ade/frames.py:

- change_prompt: sent to the client when a setting change needs a
  choice. Carries region id, the pending edits, and the three choices:
  reset_region, rewrite_cache, cancel.
- change_answer: the client's choice. reset_region applies the edits and
  calls reset_region. rewrite_cache applies the edits and keeps the
  transcript. cancel drops the edits.

When the modal fires: on preset load, on preset save, and on any setting
change when reset_on_change is off. When reset_on_change is on and the
change is a setting change, apply and reset without a modal. Name and
gate edits never reset and never prompt.

Rewrite cache means: apply the setting, keep the transcript, and let the
provider rebuild its cache on the next turn. For Claude persistent that
is a cold rewrite. Do not add a cache flag. The provider does what it
already does on a settings change.

## PART 5 — SESSION TEMPLATES

Session templates hold tracks and a slot for preloaded map data. No
region data. Build on save_template in ade/tracks.py. A session
template archive carries the track rows, name, root, order, and a plan
field that stays empty until maps are piped in. Regions are dropped, not
blanked. Add a kind constant beside the existing template kind so the
lister can tell them apart. Old templates still load.

Frames: ade_save gains a session_template flag beside the existing
template flag. The lister route in server.py is Job 3a's. You write the
function it will call: list_session_templates().

## PART 6 — REGISTRIES

Two JSON files under library/registry/.

- widgets.json: one entry per widget type. Fields: type, label, and the
  widget tier row group it uses. Seed it with chat, mini_queue, queue,
  editor, terminal, browser, viewer. Job 5 reads it for the selection
  page. The list is open ended.
- providers.json: one entry per provider. Fields: id, label, kind. Seed
  it with ollama, gemini, claude from the Router, plus two entries,
  cloud and docker, kind "slot", with no code behind them. Job 4 reads
  it for the library.

Add load_widget_registry() and load_provider_registry() to settings.py.

## PART 7 — CONTEXT FOLDERS AND LOADER

Create injections/track/ and injections/region/, each with a placeholder
file so the folder exists in git. Add two layers to compile_injections
in engine/compiler.py, after the session layer and before skills: a
track layer reading injections/track/<track id>.md if present, and a
region layer reading injections/region/<region id>.md if present.
Missing file means no layer. The region folder stays empty this phase.

One test per layer in Docs/tests/test_context_layers.py.

## RECEIPT

Docs/Reports/RECEIPT-D1-settings.md. Sections: EDITS, DELETED, TESTS
with the command and count, QUESTIONS, PHASE 3, STRAY FILES. Under
PHASE 3 include anything you noticed about widget defaults, the preset
shape, or the context area, without acting on it.
