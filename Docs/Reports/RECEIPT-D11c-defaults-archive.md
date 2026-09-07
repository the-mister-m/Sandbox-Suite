# RECEIPT — D11c — Widget defaults stripped, session settings archived

## Edits

Part 1 — widget defaults moved to engine/settings.py

- engine/settings.py:183-188 — widget_defaults entries for editor
  ({"showPreview": False, "tabs": [], "active": ""}), terminal
  ({"region": "", "tabs": [], "active": ""}), viewer
  ({"path": "", "tabs": []}) filled in; browser stays {} (its module
  defaults were already {}).
- static/js/widgets/editor/editor.js:311-312 — `defaults:` line deleted.
- static/js/widgets/terminal/terminal.js:259-260 — `defaults:` line
  deleted.
- static/js/widgets/viewer/viewer.js:350-351 — `defaults:` line deleted.
- static/js/widgets/browser/browser.js:337-338 — `defaults: {}` line
  deleted.
- chat.js, mini-queue.js, queue.js — grepped for a defaults object,
  none carry one. Left untouched per spec.

Confirmed no second path is needed: static/js/matrix/widget-frame.js
`startingOptions()` already reads `MX.widgetDefaults(type)` (the
server's widget_defaults, trickled through registry.js's
`/api/widget-registry` fetch) before ever looking at `mod.defaults`.
Once engine/settings.py carries real values for editor/terminal/viewer,
that registry lookup returns non-empty and the `mod.defaults` fallback
never fires — so the delete is safe with no code path added.

Part 2 — session settings survive a restart

- ade/tracks.py, `autosave()` (was line 1697) — after `_write_archive`,
  writes `dict(environment.settings)` to `settings.json` beside
  `master.json` in the same session directory, under
  `environment.archive_lock`.
- ade/tracks.py, `reload_session()` (was line 1909) — after
  `_fill_environment`, reads `settings.json` if present and merges it
  onto `environment.settings` with `.update()`. No file means the
  bag stays as `Environment.__init__` seeded it
  (`settings_table.session_defaults()`, all keys `None` — inherits
  global), matching a fresh session.
- Docs/tests/test_session_settings_archive.py — new file, two tests:
  a set key survives autosave + reload, and a session archived before
  the bag existed still reloads with keys unset (inherits global).

## Decisions

1. The archive file is a sibling `settings.json` next to `master.json`,
   not a new field inside the master record. The spec says "beside
   the session record," and the lane names only autosave and
   reload_session in ade/tracks.py — not `_write_archive`, which
   `save_session` and the shutdown path also call. A sibling file
   keeps the bag write inside autosave alone.
2. browser.js's `defaults: {}` line was deleted too, even though it
   had no values to move — spec Part 1's first bullet names "each of
   the four widgets" for the move-then-delete treatment.

## Outside the lane, not done

- Nothing found outside the lane. static/js/widgets/stub/ and mount/
  and suite files were not touched.

## Test run

python3 -m pytest Docs/tests -q
242 passed in 0.58s

## Rule conflict

A system reminder said to prefer Bash (cat/sed/grep) over Read/Edit for
file changes under bypass-permissions mode. Per the spec's own Rules
section, Read/Edit/Write were used for every file read and edit; Bash
was used for grep-based discovery and the pytest run only.
