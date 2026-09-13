SESSION REVIEW — Sandbox Suite phase1-1D — 2026-09-12

EDITS
- static/js/widgets/test/pipes/pipes.js — new: pipes widget, type `pipes`,
  group `test`. optionControls.target via MX.targetControl(MX.graphTargets,
  MX.graphTargetNew). Info line, Emit button + log (pipes.ping mirror),
  graph.select count (second mirror), Load target (fetches
  /api/library/graphs/<target>), Open/Save through file frames filtered by
  inst, markDirty on log growth.
- library/registry/widgets.json:21 — registry row for `pipes`.
- static/matrix.html:66 — script tag, after arrange.js.
- static/js/widgets/shared/mirror.js:4-7,15,19 — `apply` now receives a
  second `meta` argument forwarded from `MX.bus.on`, so a widget can tell a
  same-tab local mirror hit from a cross-tab/agent one. Additive only.
- Docs/HOWTO-repipe.md — new: eight sections, each step cites a file:line,
  most pointing at pipes.js.

STRAY FILES
- none

GOALS DONE
- Part 1 pipes widget
- Part 2 HOWTO-repipe.md

PICKS I MADE
- mirror.js's `apply(payload)` grew a second `meta` arg (forwarded straight
  from the underlying `MX.bus.on` listener) so pipes.js can prefix `remote`
  per spec line 49, citing bus.js:51. Contract 2.2 states `apply(payload)`;
  this adds a field to a callback signature rather than a payload, additive
  and backward compatible — no existing caller reads a second argument.
  One file outside pipes' own folder, so this stayed mine per the mid-run
  rule rather than a stop-and-ask.
- "Load a vendored ES module" in HOWTO-repipe.md has no pipes.js line to
  cite — nothing is vendored in phase 1 (Wayfinder's vendor folder is job
  2A), and Part 1's body list for pipes never calls for a moduleReady use.
  Cited module-ready.js and the existing monaco-readonly.js example
  instead, flagged in the HOWTO itself.
- "the shown text" for Save (spec line 54) read literally as the first-200-
  char text already displayed from the last `file` frame, not the full
  loaded file — pipes.js:152 uses `st.shownText` (set at pipes.js:189).
- Save/onFrame does not check editor.js's `[save denied`/`[WRITE refused`/
  `[WRITE failed` strings — shows raw `msg.result` either way, since this
  is a throwaway witness widget, not a real editor. Named in the HOWTO's
  files section as the thing to copy for a real widget.
- onOption(frame, key) recreates both mirrors on any `target` change even
  though mirror.js already reads `frame.options.target` fresh per event
  (recreating isn't load-bearing) — kept because spec line 60 asks for it
  explicitly.

TESTS RUN
- `node --check` clean on pipes.js and mirror.js. `node -e` JSON.parse clean
  on widgets.json.
- Offline harness (stub MX.socket/TAB_ID, load bus.js + mirror.js): three
  mirrors, f1/f2 on target "graph", f3 on target "other". f1.emit() (same
  tab, local call) reached f2 with `meta` undefined, did not reach f3 —
  matches "same target mirrors, different target nothing" and "no `remote`
  tag on a same-tab hit." A simulated socket arrival with `inst: "agent"`
  (the curl shape from Done-when) reached both f1 and f2 with
  `meta.remote === true`, not f3 — matches "curl lands in the log of every
  pipes widget whose target is graph" and the `remote` prefix rule.
- Did not browser-test: could not restart the server (rule: don't
  start/stop it) to load 1A's routes — same situation 1A's own receipt
  logged. The already-running process (pid 64844, up before this job)
  answers 404 on /api/library/graphs and /api/widget-bus; confirmed with:
  - `curl localhost:5000/api/library/graphs` — 404 (route not loaded)
  - `curl -X POST localhost:5000/api/widget-bus -d '{"channel":"pipes.ping","payload":{"target":"graph","inst":"agent","note":"hi"}}'` — 404
  Static assets (pipes.js, matrix.html, widgets.json, mirror.js) need no
  restart — Flask serves them straight off disk — so mounting the widget in
  a browser only needs a page reload once the server carries 1A's routes.
  Curl lines for whoever restarts it, matching Done-when:
  - `curl localhost:5000/api/library/graphs/graph` — expect 84 nodes, 142 edges
  - `curl -X POST localhost:5000/api/widget-bus -d '{"channel":"pipes.ping","payload":{"target":"graph","inst":"agent","note":"hi"}}'`
    — with a pipes widget open on target "graph", expect the log line
    `remote {"target":"graph","inst":"agent","note":"hi"}`
  - Two surfaces, pipes on each with different targets, reopen both option
    panels — 1H's job, needs a browser.
  - Two tabs / two same-target pipes mirror test — 1H's job, needs a
    browser and a second tab.
  - Open/Save round trip against a real path — 1H's job.

BRANDON'S TODOS
- Restart the server so 1A's and this job's routes load together, then run
  the curl lines above.
- 1H (headed opus) still owes every browser-only Done-when item: two
  surfaces/two targets, close-one-surface target drop, two-tab mirror,
  same-target/different-target mirror, Load target's 84/142, Open/Save.

CLOSER REVIEW
- Confirm mirror.js's added `meta` argument doesn't collide with anything
  1R (redpen) or a later phase-2 mirror consumer expects — it's additive,
  should be inert for every current caller.
- action: restart + curl-verify — Brandon or session agent.
- action: spawn 1R (redpen, sonnet, 80K) — session agent.
