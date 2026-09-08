# SPEC test — mount

## D1 — 2026-09-07

RENDER: mounted via `MX.grid.applyTemplate`, three widgets side by side
(mount 4x6, timeline 4x11, devagent 4x11) on session 9883b6bec3df. Mount
shows track name, region name, provider/model/variant pickers, one
"+ track + region" button, and a root field (blank, placeholder "root
path"). No console errors beyond the known favicon 404.
Docs/Reports/phase3-test/d1/mount-01-layout.png.

READ LINE CONFIRMED OR REFUTED: PARTLY REFUTED. One call to the shared
add form in mode "both" — CONFIRMED (`static/js/widgets/shared/add-controls.js`
mode "both": one button, sends `create_track`, then on the matching
`track_created` row sends `insert_region`). The form does live in devagent
too (`static/js/widgets/agent/devagent/devagent.js:145-149`) — CONFIRMED.
"After S2 the root field shows the session root" — REFUTED as built.
`mountAddControls`'s root field only ever shows what `ctrl.refresh()` is
told (add-controls.js:183-188). devagent calls `refresh({sessionRoot: ...})`
after fetching `/api/session-settings/<sid>` (devagent.js:441-447).
mount.js never calls `ctrl.refresh` and never fetches session-settings —
it subscribes only `track_created`. Driven: root field read empty both
before and after the click (mount-summary.json: root_before "",
root_after ""). The inheritance itself still works — the server filled
in the session root on the new track with no root sent (see GATE/track
below) — the UI just never shows it, unlike devagent's or timeline's
which do.

CHECKLIST
- track plus region mount in one click with the inherited root: SEEN,
  with the root-field caveat above. Clicked mount's own "+ track + region"
  button with track name "d1mount", region name "d1mountr", root field
  untouched (still disabled/blank), model picker left at its own default
  (ollama / gemma4 / e4b-it-q8_0 — nothing in this box specified a model,
  so the widget's own default landed). Server frames:
  `track_created` (row d1mount, root `/Users/moth3rship/Desktop`), a
  second `track_created` with the full region (786413b30ae8 "d1mountr",
  ollama/gemma4:e4b-it-q8_0, root `/Users/moth3rship/Desktop`) —
  mount-frames.json. Root inherited correctly server-side even though the
  widget's own field never displayed it.
- the region appears in timeline and devagent without a remount: SEEN —
  mount-03-check-timeline-devagent.png. Both widgets showed the new
  d1mount track / d1mountr region live. DOM markers tagged on both
  widgets' elements before the click (`data-d1-marker=unremounted`)
  were still present after (mount-summary.json markers_after_click),
  proving neither widget's element was replaced — confirms F-E's
  addWidget-no-remount fix extends to server-pushed roster updates on an
  already-mounted grid, not just addWidget itself.

TARGET ITEM 6 (SPEC-phase4-timeline-target.md:39-40) — does mount earn a
slot now that timeline has a one-click "+ track": timeline's button
(timeline.js:1314-1323, confirmed live in mount-01-layout.png) makes a
bare track only — no region, no model choice; timeline's own read line
says right-click only offers "insert region preset" after that, which
needs an existing preset. devagent's two forms need a track to exist
before its region form's "+ region" button even enables
(add-controls.js:165-166, `paintDisabled`). Mount is still the only
widget that produces a populated, running track+region pair — provider,
model, variant all chosen inline — in one click. It earns its slot on
that basis. Its own bug (root field never reflecting the inherited root,
see FIX LIST) should be fixed rather than used as a reason to cut it.

CONSOLE: one pre-existing page-level favicon 404 (known, shared-setup
list). No new console errors, no pageerrors.
Docs/Reports/phase3-test/d1/mount-console.txt.

FIX LIST
- static/js/widgets/agent/mount/mount.js — never fetches
  `/api/session-settings/<sid>` and never calls the add-controls'
  `ctrl.refresh()`, unlike devagent.js:441-447. The root field stays
  blank/disabled forever instead of showing the inherited session root,
  even though the server-side inheritance itself is correct. One-line
  parity fix: add the same fetch-and-refresh devagent does.
- Not a bug, a default worth flagging: mount's model picker defaults to
  whatever `MX.mountModelPicker({})` resolves to first (ollama/gemma4 here)
  with no hint in the UI that this is a default rather than a deliberate
  choice; a one-click tool with no track context to infer intent from is
  more exposed to a wrong-model click than devagent's region form.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40, :215-234 (Shared setup, D1)
- Docs/Specs/SPEC-phase4-timeline-target.md:1-44 (full, item 6 at :39-40)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md (probe pattern)
- static/js/widgets/agent/mount/mount.js (full, 32 lines)
- static/js/widgets/shared/add-controls.js (full, 194 lines)
- static/js/widgets/agent/devagent/devagent.js:140-150, :380-450 (root
  fetch/refresh wiring, for contrast with mount)
- static/js/widgets/adetools/timeline/timeline.js:1270-1325 ("+ track"
  button, confirms C2's BUILD landed)
- static/js/matrix/grid.js:140-235 (addWidget, applyTemplate, _freeSlot)
- static/js/matrix/socket.js:1-75 (send/onFrame)
- ade/frames.py:446-461 (_do_insert_region), :640-673 (kill_track,
  delete_track — delete_track takes a track id and removes every region
  on it; kill_track/close_track takes a region id despite the name)
- server.py:1678 (`/api/session-settings/<sid>` route, confirms what
  devagent fetches and mount does not)
- library/registry/widgets.json:9 (mount row)
- archives/9883b6bec3df/master.json (ground truth, track roster before
  the run — only gfsf on 5a031370bf1c, track 5a031370bf1c's own name is
  "test")

BLOCKERS
- None. Both checklist lines and the target-item-6 question were driven
  live in one window.

## W4 — 2026-09-07

- Root field (D1/W3's fix): SEEN again post-restart. Root field showed
  `/Users/moth3rship/Desktop`, non-blank, on mount. Full detail:
  RECEIPT-phase4-W4.md.
