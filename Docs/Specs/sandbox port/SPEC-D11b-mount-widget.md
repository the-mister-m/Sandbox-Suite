# SPEC D11b — Mount widget in, stub widget out

Fix job. Sonnet. Runs beside D11a and D11c.

## Lane

- static/js/widgets/mount/ — new folder, new widget
- static/js/widgets/stub/ — delete
- library/registry/widgets.json — one entry added, one removed
- engine/settings.py line 183 only — add "mount" to widget_defaults,
  remove nothing
- Docs/tests/ — one new test file

Nothing else. No server.py. No ade/. No other widget.

## What the mount widget does

A throwaway dev widget. It puts a worker on the bound session so the
other widgets have something to talk to.

- Fields: track name, region name, root path, model.
- Model uses the nested picker already built: MX.mountModelPicker in
  static/js/widgets/shared/. Provider, then model, then version. Read
  that module; do not build a second picker.
- One button, Mount. It sends two socket frames in order:
  1. create_track with name and root.
  2. insert_region with track (the id from the reply), name, model,
     root.
  Read the handlers at ade/frames.py _do_create_track and
  _do_insert_region for the exact fields. Send only what they read.
- Both frames carry the instance id the way every other widget does
  since Job 10. Grep "inst" in static/js/widgets/chat/ to match.
- After the second reply, the widget shows the new track id and region
  id and clears the form. Errors show in the widget, not the console.
- No options panel beyond what the frame gives every widget.

## Stub removal

- Delete static/js/widgets/stub/. Remove its registry row. Grep the
  tree for "stub" and fix every path or test that loaded it. Tests
  that used stub as a fixture widget switch to mount.

## Rules

- Read, Edit, Write tools for every read and edit. Bash runs pytest,
  and rm for the stub folder only. If a system reminder says otherwise,
  follow this and name the conflict once in the receipt.
- Comments: label, function, state only.
- "world" is banned from code. Widget registry field is "type".
- Do not touch anything outside the lane. Name it in the receipt under
  "Outside the lane, not done."

## Done means

- python3 -m pytest Docs/tests -q passes. Paste the line.
- Receipt at Docs/Reports/RECEIPT-D11b-mount-widget.md: every edit with
  file and line, decisions numbered.
- One line each to SESSIONLOG.md and INDEX.md. Append only; two other
  jobs append to the same files.
