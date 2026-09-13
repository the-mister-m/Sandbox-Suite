RECEIPT — Sandbox Suite phase2-2H-fix — 2026-09-12

Fix pass for the two FAILs in
[RECEIPT-phase2-2H.md](RECEIPT-phase2-2H.md). Headed Playwright, Chrome,
against the server already running on :5000 (never started, never stopped).
Session `ae83cfb77344`. Verification run:
[Docs/Reports/phase2-2H-fix/](phase2-2H-fix/).

FIX 1 — camera lost on reload (test 11)

- Per the ruling: a per-widget `st.restoring` flag, set before `show()`,
  cleared after `applyCamera`; the `wf-cam` listener skips the options write
  while it is set. Same shape in all three. `map.js` untouched.
- [force.js:182-186](../../static/js/widgets/graph/force/force.js),
  [force.js:309-314](../../static/js/widgets/graph/force/force.js)
- [stack.js:65-69](../../static/js/widgets/graph/stack/stack.js),
  [stack.js:130-135](../../static/js/widgets/graph/stack/stack.js)
- [files.js:136-140](../../static/js/widgets/graph/files/files.js),
  [files.js:266-271](../../static/js/widgets/graph/files/files.js)
- Undo: drop the `if (st.restoring) return;` line and its comment from
  `readCamera`, drop the `st.restoring = true/false` pair around
  `show()`/`applyCamera` in `loadTarget`.
- `node --check` clean on all three.
- Harness: **11 PASS** — server held `scale 0.12` for all three, restored
  `frame.options.camera` reads `scale 0.12`, every pre/post option matches.

FIX 2 — two-tab pick never takes (test 12)

Diagnosed first, with a bus trace in both tabs
(`graph.select`, `surface.widget`, `surface.layout` logged on emit and on
receipt). Result: **34,834 bus events in tab one and 37,594 in tab two in a
few seconds** — an unbounded echo storm that starts the moment a second tab
is open, and saturates the page so that *no* `setOption` in tab one sticks.
The pick was never the only casualty: the search box's own
`setOption("query", "score")` was reverted mid-flight, the hit list still
held the previous query, and the score.js row the test clicks never existed.

The storm, measured, not guessed:

1. `applyOptions` compared option values with `===`, so an arriving
   `selectedIds` array never matched the local one and always counted as a
   change — every echo re-entered `onOption`, which re-emitted
   `graph.select`, which came back as `surface.widget`, forever.
2. Once that was stopped, a slower loop stayed: a mirror apply writes two
   options (`selectedIds`, then `focusedId`) and `setOption` emits the whole
   bag on each, so the first emit carries a half-updated bag (new selection,
   old focus). The two tabs then took turns correcting each other with two
   different intermediate states.
3. Same half-bag on the other channel: `applyOptions` applies keys one at a
   time, and the widget's `onOption` emitted `graph.select` from the middle
   of that loop, with the focus not yet written.

Three changes, smallest that ends each one:

- [widget-frame.js:116](../../static/js/matrix/widget-frame.js) — one line,
  the change test in `applyOptions` is now a value compare:
  `if (JSON.stringify(this.options[key]) === JSON.stringify(value)) continue;`
  This is the single line the job allowed in `widget-frame.js`; `grid.js` is
  untouched. Undo: restore `if (this.options[key] === value) continue;`.
- [graph-core.js:227-239](../../static/js/widgets/graph/shared/graph-core.js)
  — `graphMirrors` coalesces the select mirror's `emit` to one per tick, last
  fields win, so a two-key apply announces once, whole. Payload shape,
  channel and `MX.mirror` itself unchanged; only the timing of a repeat emit
  inside one tick. Undo: delete the `sendSelect`/`pending` block.
- `applySelect` in all four graph widgets stages the focus before the first
  emitting write, so no half bag leaves the tab at all —
  [force.js:333](../../static/js/widgets/graph/force/force.js),
  [stack.js:211](../../static/js/widgets/graph/stack/stack.js),
  [files.js:291](../../static/js/widgets/graph/files/files.js),
  [cards.js:329](../../static/js/widgets/graph/cards/cards.js).
  Undo: delete the `frame.options.focusedId = payload.focused || "";` line
  and its comment from each.
- `node --check` clean on all five files.
- Bus events for the same click after the fix: **29 in tab one, 28 in tab
  two** (was 34,834 / 37,594). Zero console lines, zero pageerrors.
- Harness: **12 PASS** — tab two's Cards reads `score.js`, and tab one holds
  `viewer/score.js` at 50, 60, 150, 1000 and 3000 ms.

SIDE FINDING FROM 2H — included, not touched

- `startingOptions` ([widget-frame.js:19-24](../../static/js/matrix/widget-frame.js))
  merging module defaults under registry defaults is the session agent's
  edit, left as found and carried through this rerun. Test 7 PASS, and
  `followGraph` and `openInEditor` were both set from the options panel this
  time (`followGraph_set_by=panel`), which the 2H run could not do.

HARNESS RERUN — full pass, `Docs/Reports/phase2-2H-fix/`

    1 PASS   2 PASS   3 PASS   4 PASS   5 PASS   6 PASS   7 PASS   8 PASS
    9 FAIL  10 PASS  11 PASS  12 PASS  13 PASS

- 7 PASS, 11 PASS, 12 PASS — the three lines this job had to move.
- 13 PASS — zero pageerrors across both tabs.

NEW FAIL — 9, and the ruling it needs

- Line 9 (Files local: drill `viewer/`) passed in 2H and fails now. Cause,
  proven by a separate two-round run, not inferred: Files Graph's default
  camera is `{yaw: 0, pitch: 0, scale: 1}`
  ([files.js:328](../../static/js/widgets/graph/files/files.js)) while
  `MapView` constructs its camera at the tilt `{yaw: -0.42, pitch: 0.92}`
  ([map.js:79](../../static/vendor/wayfinder/map.js)), the same tilt Force
  and Stack carry as their own defaults. Before FIX 1 that default was
  clobbered before it could be applied, so Files always drew at the
  constructor tilt; now the stored camera is honoured, a fresh Files widget
  draws at pitch 0, the plane is edge-on, and a node cannot be clicked.
- The proof, one surface, two rounds, same node: with the default camera the
  drill click misses and the corner stays `everything` (cam
  `yaw 0, pitch 0`); with the camera set at runtime to
  `{yaw: -0.42, pitch: 0.92, scale: 1}` the same click drills and the corner
  reads `everything / viewer/`.
- **Question for Brandon.** The candidate is one line — Files' default camera
  at [files.js:328](../../static/js/widgets/graph/files/files.js) (and the
  `0, 0` home fallbacks it passes at
  [files.js:133](../../static/js/widgets/graph/files/files.js)) becoming the
  tilt. It is outside this job's gate, so it is **not made**; the code is as
  described above. Line 9 stands FAIL until you rule.

STATE LEFT BEHIND

- None. Every surface this job made was deleted: `w-rh0sxq1m`, `w-u5xtfn65`,
  `w-3r5ejhnw`, `w-j1xgrsty`, `w-qk1j5m3d`, `w-68njfozm`, `w-hizrwwla`
  (the harness run), `w-dsqtpr8t` (the line 9 proof). The session's other
  surfaces were not touched. Server never started or stopped.
- Diagnostic scripts live in the scratchpad, not in the repo.

CLOSER REVIEW

- FIX 1 and FIX 2 both verified by the harness, 11 and 12 PASS, 7 PASS —
  closer: file.
- One line spent in `widget-frame.js`, as the job allowed; `grid.js`
  untouched — closer: confirm.
- Line 9 FAIL, Files' default camera, one-line candidate named and not
  taken — Brandon: rule.
