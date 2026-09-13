RECEIPT — Sandbox Suite phase2-2H — 2026-09-12, run 18:55–19:23

Headed Playwright, Chrome, against the running suite on :5000.
Session used: `ae83cfb77344`. Script:
[Docs/tests/phase2_headed.py](../tests/phase2_headed.py).
Screenshots + console + results:
[Docs/Reports/phase2-headed/](phase2-headed/).

SERVER

- Already running before this job: pid 67011, `python server.py`, up 17:37.
  server.py's newest edit is 17:15, earlier than that start, so the routes
  in memory are current. The phase 2 JavaScript (newest 18:41) is static and
  served per request, and `library/registry/widgets.json` (18:41) is read per
  request — curl-verified, not assumed: `/api/widget-registry` lists
  graph_cards, graph_force, graph_stack, graph_files, and
  `/api/library/graphs` returns graph 84/142/186. No restart was needed and
  the server was never started or stopped by this job.
- First live run of every graph widget; no phase 2 builder ran a browser.

TESTS

- 1 PASS — Cards mounted, target `graph` picked in its own options panel,
  empty text "Pick a node in any graph widget on this target." —
  [01-cards-empty.png](phase2-headed/01-cards-empty.png)
- 2 PASS — Force Graph draws 84 nodes, settles in 1229 ms (933 sim steps,
  polled on the node positions, cap 4 s), freeze stops the loop and the
  positions hold —
  [02a-force-settled.png](phase2-headed/02a-force-settled.png),
  [02b-force-frozen.png](phase2-headed/02b-force-frozen.png)
- 3 PASS — click on viewer.html in Force Graph: Cards WHO reads
  `viewer.html`, the mermaid frame prints 18 lines, all starting
  `viewer.html -->` —
  [03-pick-viewer-html.png](phase2-headed/03-pick-viewer-html.png)
- 4 PASS — shift+click on panel.js: Cards shows two tabs
  (`viewer.html`, `panel.js`), the mermaid frame grows to 30 lines with 12
  starting `panel.js -->` —
  [04-shift-pick-panel-js.png](phase2-headed/04-shift-pick-panel-js.png)
- 5 PASS — copy button: clipboard read back through Playwright is 705 chars
  and equals the frame's `innerText` exactly —
  [05-copy-clipboard.png](phase2-headed/05-copy-clipboard.png)
- 6 PASS — Cards search "score" with name on lists 6 hits; clicking
  `viewer/score.js` puts `picked` on that node's class in Force Graph and
  Cards WHO reads `score.js` —
  [06-search-score.png](phase2-headed/06-search-score.png)
- 7 PASS — Editor with followGraph on and Cards openInEditor on: picking
  score.js in Force Graph opens
  `/Users/moth3rship/Desktop/AI Design/Wayfinder/fixtures/viewer/viewer/score.js`
  with the cursor at line 1, the span's first line —
  [07-editor-follows.png](phase2-headed/07-editor-follows.png).
  Setup caveat, not the test line: followGraph had to be set through
  `setOption`, it is not in the Editor's options panel — see FINDINGS.
- 8 PASS — Stack Graph and Files Graph mounted on the same target; picking
  data.js in Stack puts `picked` on that node in Force Graph and Files
  Graph, and Cards WHO reads `data.js` —
  [08-stack-pick-data-js.png](phase2-headed/08-stack-pick-data-js.png)
- 9 PASS — Files Graph flipped to local: corner reads `everything`; clicking
  `viewer/` reads `everything / viewer/`; home returns to `everything` —
  [09a-files-local-everything.png](phase2-headed/09a-files-local-everything.png),
  [09b-files-drilled.png](phase2-headed/09b-files-drilled.png),
  [09c-files-home.png](phase2-headed/09c-files-home.png).
  FAILED as found (`everything / viewer//`), fixed in one line, rerun — see
  FIXED.
- 10 PASS — guesses set to off in Cards' options: every drawn widget's
  `getOptions().guesses` reads `off`, the sim edge count holds at 142, no
  new pageerrors —
  [10-guesses-off.png](phase2-headed/10-guesses-off.png)
- 11 FAIL — reload returns target, selection, Files Graph's view and trail,
  but **not the camera**: all three drawn widgets come back at
  `scale: 1` when `scale: 0.12` was stored. file:line below —
  [11-after-reload.png](phase2-headed/11-after-reload.png)
- 12 FAIL — with a second tab open on the surface, a pick made in tab one
  does not take in tab one, so tab two has nothing to follow. file:line
  below —
  [12-second-tab-follows.png](phase2-headed/12-second-tab-follows.png)
- 13 PASS — zero pageerrors across the whole pass, both tabs —
  [13-final-state.png](phase2-headed/13-final-state.png)

FAILS

- 11, camera lost on reload. Not a save problem and not an apply problem —
  the stored value is clobbered between the two. `MapView.show()` ends with
  `this.emitCam()` (static/vendor/wayfinder/map.js:212). Each widget listens
  for `wf-cam` and writes the *live* camera back into its options
  (force.js:298 → force.js:182-187, stack.js:121, files.js:256), and that
  listener is wired before the first `show()`. So `st.view.show(...)`
  (force.js:307, stack.js:128, files.js:263) fires `wf-cam` while the view
  is still at its construction default, overwriting
  `frame.options.camera`; `applyCamera(frame)` on the next line
  (force.js:310, stack.js:131, files.js:266) then applies that default.
  Measured on the same reload: server held
  `{yaw:-0.42, pitch:0.92, scale:0.12}` for all three widgets, the restored
  `frame.options.camera` read `scale: 1`. Three files, two lines each —
  bigger than a one-liner, left for a fix pass.
- 12, pick does not stick once a second tab is open. Tab one picks
  `viewer/score.js` from the Force Graph's own hit list (which calls
  `MapView.select` directly); `st.vm.nodes.has('viewer/score.js')` is true,
  yet tab one's Force Graph and Cards both still read `viewer.html` when
  sampled at 50 ms, 60 ms, 150 ms, 1 s and 3 s after the click. The same
  widget, same session, picked cleanly one step earlier with no second tab
  open (recorded inside the test as `solo_before_tab2=(True,
  'viewer.html')`), so the second tab is what changes the outcome.
  Suspected path, named not proven: selection rides two channels at once —
  `graph.select` through mirror.js, and each tab's whole option bag through
  `surface.widget` (widget-frame.js:107-109 on every setOption,
  grid.js:146-158 on every markDirty), applied wholesale by the other tab at
  grid.js:212-216. A `surface.widget` frame carrying the other tab's older
  selection lands last and wins. Phase 1's own two-tab FAIL was in this same
  area, so re-covering it was in scope; it is not the mirror.js:22 drop this
  time — that fix holds, tab two receives (test 12's tab-two Cards tracks
  tab one's earlier solo pick).

FIXED

- static/js/widgets/graph/files/files.js:77 — `crumbLabel` added a "/" to
  every crumb after the first, but layout.js already stamps a folder crumb's
  trailing slash (static/vendor/wayfinder/layout.js:476-477, :496, :558), so
  the corner read `everything / viewer//` and a file crumb would read
  `data.js/`. Now returns `c.label` unchanged. One line, rerun, test 9 PASS.
  Undo: restore `return i === 0 ? c.label : c.label + "/";`.
  `node --check` clean.

FINDINGS (not test lines)

- Editor's `followGraph` and `graphTarget` never reach a fresh instance.
  `startingOptions` (static/js/matrix/widget-frame.js:19-25) returns the
  registry/session defaults whenever they are non-empty and never merges the
  module's own `defaults`; this session's bag carries
  `editor: {active, showPreview, tabs}`, so the Editor's options panel draws
  only those three rows and a user cannot switch followGraph on at all.
  Phase 2's "open in editor" works — test 7 PASS — but only from
  `setOption`. Fix is a rewrite of that function, not a line, so it is left
  here rather than taken.
- The one `fit` at `show()` time happens before the sim spreads the nodes,
  so a settled Force Graph sits partly outside its own box and some nodes
  are unclickable until the `fit` button is pressed. The harness presses
  `fit` for a node it cannot reach and logs it (console.txt). Not a spec
  line; noted because it is what a user meets first.
- After a reload, a raw map click on a node that sits buried under others
  does not land — the harness tried up to six points inside the node's box
  and the map selected none. That is why test 12's pick goes through the
  Force Graph's search list instead of the canvas. Tests 3, 4, 6, 8 cover
  the raw canvas click.

STATE LEFT BEHIND

- Session `ae83cfb77344` carries the surfaces this pass and its reruns made:
  `w-uxsi99e1` ("Empty surface 17") from the final run, plus the earlier
  runs' surfaces (`w-wfaosb42`, `w-rsk0dl6y`, `w-qw8dwsbf`, `w-3lguiw0z`,
  `w-9g9m8fa0`, `w-kfpoub7m`, `w-dfv4xiza`, `w-uuvnq4rx` and others in
  `library/grids/ae83cfb77344/`). Phase 1's pass deleted its surfaces; this
  spec did not say to, and the test widgets on them are the evidence, so
  they are left standing for Brandon to clear.
- `graph` is now in the session's target list from these surfaces.
- No files changed other than the one-line files.js fix and the new harness.

CLOSER REVIEW

- One MAY FIX taken (files.js crumbLabel) — closer: confirm, file.
- Two FAILs standing (11 camera on reload, 12 two-tab pick) — closer: these
  are phase gate items, not 2H's to fix.
- One finding standing (Editor followGraph unreachable from the panel) —
  closer: rule whether it belongs to phase 2 or to the phase 1 frame code.
