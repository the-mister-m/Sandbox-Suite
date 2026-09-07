SESSION REVIEW — Sandbox Suite — F1 backend frames — [timestamps: ask Brandon]

EDITS
- [Docs/HOWTO-frames.md](../HOWTO-frames.md) — client-to-server and server-to-client frame tables, drawn from `handle()` in ade/frames.py and the `send_*` methods in ade/web_io.py
- [ade/frames.py](../../ade/frames.py) — `_send_change_prompt` now takes `ctx` and broadcasts to every socket on the environment via `_broadcast(ctx.environment, "_send", payload)`; three call sites (edit_track, load_preset, save_preset) updated
- [ade/frames.py](../../ade/frames.py) — `create_track` sends `track_created` every time, `None` region included, instead of only when a region was made
- [ade/frames.py](../../ade/frames.py) — `load_preset` reads `msg.get("mode")`; `"reset"`/`"in_place"` calls `_do_load_preset` directly, prints warnings, fires `_roster()`, skips the change prompt; any other value keeps the old parked-prompt path
- [ade/web_io.py](../../ade/web_io.py) — `send_track_created` accepts `region=None`, sends `"track": None` in that case

STRAY FILES
- None.

GOALS DONE
- Frame table written.
- Change prompt now environment-wide, not sender-only.
- `create_track` always returns a `track_created` row.
- `load_preset` takes a mode and can skip the prompt.
- `python3 -c "import ade.frames, ade.web_io"` — clean import.
- `python3 -m pytest Docs/tests -q -x` — ran in 0.11s (under one minute, so run per spec). 8 passed, 1 failed: `test_boot.py::test_ade_page` asserts 404 == 200 on GET `/ade`. Pre-existing — `static/ade.html` is deleted per this session's git status, unrelated to this spec's frames.py/web_io.py edits. Not fixed, per spec's "do not fix tests."

BRANDON'S TODOS
- None raised.

CLOSER REVIEW
- Confirm the pre-existing `test_ade_page` failure (missing `static/ade.html`) belongs to a different spec's scope, not this one — Brandon or closer.
