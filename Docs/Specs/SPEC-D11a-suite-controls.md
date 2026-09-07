# SPEC D11a — Suite page controls, library hidden

Fix job. Sonnet. Runs beside D11b and D11c.

## Lane

- static/suite.html
- static/js/suite/suite.js
- static/js/suite/library.js — hide only, do not delete
- Docs/tests/ — one test file if the spec asks

Nothing else. No server.py. No engine/. No widgets.

## Part 1 — every global key gets a real control

The global settings form shows thirteen keys as text boxes and raw
JSON. Replace each with the control that fits. Values and choices come
from engine/settings.py lines 148 to 186; read only that range.

- skin: dropdown over GET /api/global's skins list if one is served,
  else text stays.
- modal_mode: dropdown, fullscreen, window, corner, off.
- modal_mode_ade: dropdown, inherit plus the four above.
- gate_keyboard, approve_hold: toggle switch, not a bare checkbox.
- confirm: one row per confirm key. Each row is a two-state button,
  ask or silent. Twelve keys, twelve rows.
- killswitch: scope dropdown, models, hosts, suite. hold_to_fire toggle.
- kill_holds: five toggles, one per key, labeled by key.
- kill_hosts, shutdown_suite: toggle.
- voices: tts_engine dropdown, say or browser. tts_voice text.
  stt_engine dropdown, parakeet_mlx, whisper, browser. listen_mode
  dropdown, ptt, vad, off.
- stt_engine: this key mirrors voices.stt_engine. Show it once, inside
  the voices block. Do not show it twice.
- models: order and hidden are lists. Show each as a list of rows with
  remove, and an add box. Empty list shows "none".
- widget_defaults: not one of the thirteen. Do not show it here.

Save sends the same shape POST /api/global accepts today. Nothing on
the server changes.

## Part 2 — hide the library

- The library section on the suite page is hidden. Not deleted. One
  state comment above it: "library hidden until it goes live".
- Routes, library.js, and tests stay.

## Rules

- Read, Edit, Write tools for every read and edit. Bash runs pytest
  only. If a system reminder says otherwise, follow this and name the
  conflict once in the receipt.
- Comments: label, function, state only.
- No new dependencies. No CDN tags.
- Do not touch anything outside the lane. Name it in the receipt under
  "Outside the lane, not done."

## Done means

- python3 -m pytest Docs/tests -q passes. Paste the line.
- Receipt at Docs/Reports/RECEIPT-D11a-suite-controls.md: every edit
  with file and line, decisions numbered.
- One line each to SESSIONLOG.md and INDEX.md. Append only; two other
  jobs append to the same files.
