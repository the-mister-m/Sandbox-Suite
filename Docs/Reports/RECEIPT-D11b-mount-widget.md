# RECEIPT — D11b — mount widget in, stub widget out

## Edits

- static/js/widgets/mount/mount.js — new file. Fields: track name, region
  name, root path, model (MX.mountModelPicker). Mount button sends
  create_track then, on the next track_list row with the highest `order`,
  insert_region with that track id; both frames carry `inst: frame.id`.
  On track_created shows `track <id> / region <id>` and clears the form.
  Validation and send errors render in `.mx-mount-error`, never console.
- static/js/widgets/stub/ — deleted (rm).
- library/registry/widgets.json line 9 — stub row replaced with
  `{ "type": "mount", "label": "Mount", "path": "/static/js/widgets/mount/mount.js" }`.
- engine/settings.py line 188 — `"viewer": {...}}` became
  `"viewer": {...}, "mount": {}},` inside the widget_defaults literal that
  starts at line 183. Nothing else in that literal touched (another job
  had already added nested editor/terminal/viewer defaults there).
- static/matrix.html — `<script src=".../stub/stub.js">` swapped for
  `.../mount/mount.js` (script tag is a path that loaded stub; spec's
  stub-removal step says fix every one).
- Docs/tests/test_matrix_templates.py — all `"stub"` fixture/assertion
  values renamed to `"mount"`.
- Docs/tests/test_targets_tabs.py line 390 — `"stub/stub.js"` in
  WIDGET_FILES renamed to `"mount/mount.js"`.
- Docs/tests/test_session_widget.py lines 100-108 — registry-order and
  WIDGET_ROWS-membership assertions switched from `"stub"` to `"mount"`.
- Docs/tests/test_mount_widget.py — new test file: registry row, widget
  defaults, matrix.html script tag, model-picker usage, frame order
  (create_track before insert_region), inst on frames, banned words,
  node --check parse.

## Decisions

1. Track id after create_track: create_track carries no model/region, so
   the server never emits track_created for it (ade/frames.py 555-559) —
   only the track_list broadcast (rows) follows. Picked the row with the
   highest `order` field as the new track, since Track.order is a
   strictly increasing counter (ade/tracks.py 1073-1074). Race with a
   concurrent create_track from elsewhere is possible but accepted for a
   throwaway dev widget.
2. insert_region fields sent flat (`track`, `name`, `model`, `root`) —
   ade/frames.py `_do_insert_region` reads `msg.get("region")` first but
   falls back to these top-level keys, and the top-level path is the
   smaller frame.
3. Mount widget carries no options object beyond the frame default
   (empty `{}`, matching `widget_defaults["mount"]`) — per spec, "no
   options panel beyond what the frame gives every widget."
4. New registry row placed at the same position stub occupied (end of
   the list), to keep the diff to one line.

## Outside the lane, not done

- static/css/matrix.css still has `.mx-stub` rules (lines 266-268). CSS
  wasn't named in the lane and nothing loads them anymore, so left alone.
- Docs/tests/test_region_edit.py has a `_stub_turn` helper — unrelated
  test double, not the widget; not touched.

## Test run

python3 -m pytest Docs/tests -q → 252 passed
