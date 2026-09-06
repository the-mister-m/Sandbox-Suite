# RECEIPT — SPEC B2 fixes

Boot green. `python3 -m pytest tests/ -q` — 33 passed.
No git actions taken (no commits, no staging, no branches) per the launch instruction.

## EDITS

- [engine/web_io.py](../../engine/web_io.py) — `send_models(self, rows, current)` now sends
  `{"type": "models", "list": [...], "rows": rows, "current": current}`.
- [ade/web_io.py](../../ade/web_io.py) — `send_models` removed from `AdeSenders`; MRO falls
  through to `WebIO.send_models` on `engine/web_io.py`.
- [server.py](../../server.py) `api_settings_resolved` — adds `"provenance"` to the JSON.
  Per key: `file` if the block's own normalized value is `None` (per
  `engine.providers._NORMALIZERS`) and the merged overlay carries a value;
  `preset` if `preset_name` is set, the preset file exists, and the preset's
  field for that key equals the bag value; `track` if the bag value differs
  from `engine.settings.BY_KEY[...].default`; else `global`.
- [ade/tracks.py](../../ade/tracks.py) `Track` class — `apply_edits(self, fields) -> list[str]`
  added. Accepts `name` (non-empty str, stripped), `root` (existing directory,
  expanded/absolutized — also pushed to every region on the track through the
  region's own root edit path via `get_region(id).apply_edits([{"type":
  "root", ...}])`), `order` (int, not bool). Returns rejected keys.
- [ade/frames.py](../../ade/frames.py) `edit_track_row` branch — calls
  `row.apply_edits(fields)`, prints `[edit_track_row: rejected keys: a, b]`
  dim when any are rejected. Broadcast unchanged.
- [tests/test_b2_fixes.py](../../tests/test_b2_fixes.py) — new, 8 tests covering all three fixes.

## PROVENANCE SHAPE (sample)

```json
{
  "provenance": {
    "outputStyle": "global",
    "autoMemoryEnabled": "global",
    "claudeMdExcludes": "global",
    "setting_sources": "global",
    "config_dir": "global",
    "system_prompt": "global",
    "bare": "track"
  }
}
```

## QUESTIONS

1. **The "file" check reads `engine.providers._NORMALIZERS` directly**, not
   just the merged `overlay` dict. The merged overlay alone can't tell origin
   apart: `_norm_memory(False)` returns `False`, not `None`, so a bag's own
   default-off value looks identical to a file-sourced `False` if you only
   check overlay-non-None. Importing `_NORMALIZERS` (private, read-only,
   inside the function) replays the same precedence `_overlay` already uses.
   No edit to providers.py.
6. **Track-row edits now have a code path.** SPEC-B2 fixed the gap
   RECEIPT-B's question 6 named — `edit_track_row` previously touched `name`
   only. `Track.apply_edits` is the enforcement point now.
7. **`provenance` is additive.** `preset_name` (RECEIPT-B's answer to its own
   question 7) stays in the response; `provenance` sits alongside it. Phase 2
   JS reads `provenance`, not `preset_name`, for the layer paint.

## STRAY FILES

None.
