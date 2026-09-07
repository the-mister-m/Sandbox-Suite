# SESSION REVIEW — Sandbox Suite — F3 timeline behavior — 2026-09-07 03:53–04:00 EDT

Spec: [Docs/Specs/SPEC-F3-timeline-behavior.md](../Specs/SPEC-F3-timeline-behavior.md)

## EDITS

- [static/js/widgets/timeline/timeline.js](../../static/js/widgets/timeline/timeline.js) — `openTrackMenu` rewritten to the spec's two item lists; `openPresetPick` replaced by `loadPresetNames` + `openPresetSubmenu` against `/api/library/presets`; `openDevagent` helper deleted; span menu lost `edit settings`; `change_prompt` subscribed, held on `tl.changePrompt`, drawn as a `region-settle` popover with one button per choice; handoff ticks and lines drawn from `MX.derived` on every `feed`; both cache toggles send without writing `t.settings`; CSS block gained `#tlRows{position:relative}`, `.tl-handoff`, `.tl-handoff-line.file`, `.tl-handoff-line.message`.

## CHECKS RUN

- `node --check static/js/widgets/timeline/timeline.js` — clean.
- Grep timeline.js for `api/settings/browse`, `mx:open-devagent`, `duplicate_region`, `openDevagent`, `openPresetPick` — zero hits.
- Grep timeline.js for `change_prompt` — two hits: the `frame.subscribe` list and the `onFrame` branch.
- Grep timeline.js for the banned word — zero hits.

## DECISIONS MADE

- The spec says the preset list comes back as `names`; `server.py:1402` returns `{"list": [...]}` (plain strings from `engine_settings.list_presets`). The fetch reads `data.names` first and falls back to `data.list`, so it works against the route as it stands and against the field the spec names.
- Section 4 puts the handoff ticks at `xAt(at)`. `xAt` is row-absolute and the ticks live inside the span, which is itself absolutely placed and `overflow:clip`. Each tick's `left` is `xAt(at)` minus its span's own `left`, so the tick lands at the same x as the line. Placing the tick at the literal `xAt(at)` inside the span would have put it off-screen behind the clip.
- `#tlRows` got `position:relative` so the handoff lines and the row middles resolve against the same box. Without it both resolved against `#tlRight` and carried the ruler's 28px — consistent, but only by accident.
- Handoff line `title` is not in the spec; added `<from> → <to> · N file(s)` so the line matches its two ticks on hover. Say the word and it comes out.
- `change_prompt` is dropped when `msg.region` names no live region — the spec's condition. An existing prompt is left alone rather than cleared.
- The toggles no longer repaint optimistically either. Spec says they send and wait for the roster; a local repaint would have shown a state the server had not confirmed.
- `delete track` now appears only on lanes with no live region. That is the spec's list; it used to sit on every lane with a container.

## STRAY FILES

- none.

## GOALS DONE

- Sections 1 through 5 of SPEC-F3.

## BRANDON'S TODOS

- Nothing was run live. Server never started, browser never opened, no test suite run — the spec's check list is `node --check` plus greps, and that is all that ran.
- Two widgets can show one change prompt; the second answer prints "unknown token". Left as the spec says.
- Message handoffs draw nothing until the arrange build fills `deriveMessageHandoffs`. Only the `file` wire has data today.

## CLOSER REVIEW

- Confirm the INDEX.md line and the SESSIONLOG.md block below carry no dupe — closer.
- `/api/library/presets` returning `list` where the F-series specs say `names`: pick one and make the other match — Brandon.
