# RECEIPT — D1 — Settings, Presets, Templates, Registries, Context

Job 1, Wave 1. Spec: [SPEC-D1-settings.md](../Specs/SPEC-D1-settings.md).
Scope: [SCOPE-phase2-build.md](../Scope/SCOPE-phase2-build.md).
Transcript window: 2026-09-06 01:44 to 01:52 EDT.

## EDITS

- [engine/settings.py](../../engine/settings.py) — TIERS gains session
  and widget. Session tier: SESSION_GLOBAL_PATH, SESSION_KEYS,
  SESSION_ROWS, session_defaults, global_value, session_value,
  session_effective, save_global_defaults. Widget tier: WIDGET_ROWS,
  widget_types, widget_defaults. Registries: REGISTRY_DIR,
  load_widget_registry, load_provider_registry. reset_on_change row
  default and region_defaults now True for every provider kind.
- [engine/compiler.py](../../engine/compiler.py) — track_layer and
  region_layer readers, build_context gains track_id, both layers land
  after the session layer and before skills.
- [ade/tracks.py](../../ade/tracks.py) — SESSION_TEMPLATE_KIND,
  save_session_template, list_session_templates, instantiate_template
  accepts both template kinds, reload_session rejects both. Region gains
  prompts_on_change, apply_with_reset, apply_in_place; apply_edits keeps
  its old behavior and calls the new in-place path.
- [ade/frames.py](../../ade/frames.py) — CHANGE_CHOICES, _park_change,
  _take_change, _send_change_prompt, _preset_load_items, _do_load_preset
  gains a mode. change_answer frame handler. edit_track prompts when
  reset-on-change is off. load_preset and save_preset always prompt.
  ade_save gains the session_template flag.
- [library/registry/widgets.json](../../library/registry/widgets.json) —
  seven widget types, seeded.
- [library/registry/providers.json](../../library/registry/providers.json) —
  ollama, gemini, claude, plus cloud and docker as empty slots.
- [injections/track/PLACEHOLDER.md](../../injections/track/PLACEHOLDER.md) — new folder.
- [injections/region/PLACEHOLDER.md](../../injections/region/PLACEHOLDER.md) — new folder.
- [Docs/tests/test_presets.py](../tests/test_presets.py) — new, 6 tests.
- [Docs/tests/test_context_layers.py](../tests/test_context_layers.py) — new, 4 tests.
- [Docs/tests/test_session_widget.py](../tests/test_session_widget.py) — new, 14 tests.
- [Docs/tests/test_change_modal.py](../tests/test_change_modal.py) — new, 10 tests.
- [Docs/tests/test_settings.py](../tests/test_settings.py) — one existing
  assertion changed, see QUESTIONS.
- [Docs/tests/test_region_edit.py](../tests/test_region_edit.py) — one
  existing assertion changed, see QUESTIONS.
- [Docs/Handoffs/HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md) —
  appended the Job 1 block.

## DELETED

- Nothing.

## TESTS

Command: `python3 -m pytest Docs/tests -q`
Count: 87 passed, 0 failed. 34 of them are new in this job.

## QUESTIONS

Filled with the smallest thing. Answers wanted after the build.

1. The spec says existing tests may not change, and Part 4 says
   reset_on_change defaults True for cloud and local both. Two existing
   tests asserted the old local-is-False behavior and could not both
   hold. Changed the two assertions, nothing else:
   test_settings.py::test_reset_on_change_follows_provider_kind, renamed
   to test_reset_on_change_defaults_on_for_every_provider_kind, and
   test_region_edit.py::test_local_model_defaults_reset_on_change_off,
   renamed to ..._on. No production behavior beyond Part 4 moved.
2. The spec names thirteen global keys. global.json has ten top-level
   keys. kill_hosts and shutdown_suite are sub-keys of kill_holds;
   stt_engine is a sub-key of voices. Built thirteen session rows as
   named, with the three nested ones addressed by dotted path through
   SESSION_GLOBAL_PATH. kill_holds itself is also a session row, so a
   session can set the whole block or the two named sub-keys.
3. A session row unset means inherit. Rows carry the global type and
   default as the spec asks; session_defaults() returns None for every
   key so unset is distinguishable from a value equal to the default.
4. Chat speech options: speech.py splits engines into stt, tts, and
   clone. Voice and stt_engine went to the session per the spec, so the
   chat widget got speech_enabled, tts_engine, and listen_mode. Nothing
   else on the chat side of speech.py is per window.
5. The queue widget got exactly the two fields queuelog.js sends,
   claude_cache_ttl and claude_exclude_dynamic, as widget rows. They
   also exist as region rows in the claude block. The widget rows are
   the queue view's own options; no code links the two.
6. Preset load and save now always send change_prompt, per the scope. A
   client that never answers leaves a parked record in memory. No
   expiry was specified, so none was added.
7. instantiate_template now accepts a session template as well as a
   matrix template, so a session template has a load path before Job 3a
   wires its route. list_session_templates() is written and untested by
   a route; Job 3a owns the route.
8. Widget registry rows carry type, label, and a "rows" field naming
   the widget tier row group. The spec said "the widget tier row group
   it uses" without naming the field. "rows" is the smallest name.
9. A harness system-reminder mid-build told me to do reads and writes
   through bash rather than the Read, Edit, and Write tools. Brandon's
   file-ownership rule says the opposite. Followed Brandon's rule; every
   edit above is visible as a tool call in the transcript. Naming the
   conflict here as required.

## PHASE 3

Appended in full to [HANDOFF-phase3.md](../Handoffs/HANDOFF-phase3.md)
under "From Job 1". Summary:

- Widget defaults for a new instance: row defaults every time today.
  Inheritance from the last instance, or from a saved per-type default,
  is unanswered.
- Widget options do not persist and do not ride in a matrix template.
- The preset shape is region rows only, three blocks. No session-tier or
  widget-tier preset exists.
- gemini is a BLOCKS value with no rows behind it.
- Three session keys are nested inside global blocks and are reached by
  dotted path. Promoting them to top-level global keys is a later call.
- The two new context folders hold placeholders. Whether a UI edits them
  or they stay path-referenced is unanswered.
- The change modal's parked record lives in module memory in frames.py
  and does not survive a restart. Job 3a's per-session worlds may want
  it to move with the world.

## STRAY FILES

- None left behind. Three template archives written by an early test run
  into `archives/` were removed, and both template-writing test fixtures
  now redirect `tracks.archives_dir` at tmp_path. `archives/` is not
  tracked by git and holds no master.json now.
- `Docs/tests/__pycache__` is pre-existing.
