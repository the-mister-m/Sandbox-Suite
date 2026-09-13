SESSION REVIEW — Sandbox Suite phase1-1H — 2026-09-12, run 17:43–17:47

Headed Playwright, Chrome, against the running suite on :5000.
Session used: `ae83cfb77344`. Script:
[Docs/tests/phase1_headed.py](../tests/phase1_headed.py).
Screenshots + console + results:
[Docs/Reports/phase1-headed/](phase1-headed/).

SERVER
- Running before this job started: pid 67011, `python server.py`, up 17:37,
  listening 127.0.0.1:5000. That start is later than 1A's edits (17:18),
  1D's (17:25) and 1R's (17:31), so the new routes were already loaded.
  Confirmed by curl before the pass, not assumed:
  `/api/library/graphs` returns graph 84/142/186,
  `POST /api/widget-bus` returns `{"ok":true}`, `/api/targets/<sid>` 200.
  The server was never started or stopped by this job.

TESTS

- 1 PASS — Pipes options panel draws `target` as a select holding "graph",
  with a New button beside it —
  [01-options-target-select.png](phase1-headed/01-options-target-select.png)
  (read back: `{"tag":"select","values":["graph"],"buttons":["New"]}`)
- 2 PASS — pick "graph", Load target reads `84 nodes, 142 edges` —
  [02-load-target.png](phase1-headed/02-load-target.png)
- 3 PASS — second surface, Pipes on "graph" too; reopened panel lists
  "graph" once, not twice —
  [03-dedupe-graph-once.png](phase1-headed/03-dedupe-graph-once.png)
- 4 PASS — surface two set to "other" via
  `frame.setOption("target","other")`; surface one's reopened panel lists
  it. Route agreed: `targets=['graph','other']` —
  [04-other-listed-on-surface-one.png](phase1-headed/04-other-listed-on-surface-one.png)
- 5 PASS — surface two closed from the session window; surface one's
  reopened panel no longer lists "other". Route agreed: `targets=['graph']` —
  [05-other-gone.png](phase1-headed/05-other-gone.png)
- 6 FAIL — second tab on surface one, Emit in tab one, tab two's log stays
  empty. No line, no `remote` —
  [06-tab-two-remote.png](phase1-headed/06-tab-two-remote.png).
  Cause, file:line below.
- 7 PASS — two Pipes on surface one, same target: Emit in one, the other
  logs `{"target":"graph","inst":"pipes-mtyx0mph-1",...}` with no `remote`
  prefix. Retarget the second, Emit again, its log does not change —
  [07-same-target-mirror.png](phase1-headed/07-same-target-mirror.png)
- 8 PASS — Open by path shows the file, Save shows `ok`, reopen shows the
  appended `pipes <timestamp>` line. On disk after save:
  `phase1 headed open/save witness\n\npipes 1789249630509` —
  [08-open-save-reopen.png](phase1-headed/08-open-save-reopen.png)
- 9 PASS — `curl POST /api/widget-bus` with channel `pipes.ping`, payload
  target "graph": the graph-target Pipes logs it with `remote` and
  `from-curl`; a second Pipes on target "somewhere-else" logs nothing —
  [09-curl-widget-bus.png](phase1-headed/09-curl-widget-bus.png)
- 10 PASS — reload the tab, Pipes returns with
  `{"target":"graph","path":"…/pipes-file-test.txt","note":"survive-reload"}` —
  [10-reload-options-survive.png](phase1-headed/10-reload-options-survive.png)
- 11 PASS — zero pageerrors across the whole pass. Console dump is empty
  but for one harness note —
  [console.txt](phase1-headed/console.txt),
  [11-final-state.png](phase1-headed/11-final-state.png)

FIXES
- None. No one-line fix was made to any built file. Two harness bugs of my
  own were fixed and the pass rerun from clean surfaces both times:
  `close_options` clicked a panel that was already shut, and the session
  window's corner buttons sit in a collapsed drawer that has to be opened
  by `#mxDrawerHandle` first.

TEST 6 — FAIL, file:line
- [static/js/widgets/shared/mirror.js](../../static/js/widgets/shared/mirror.js):17
  `if (payload.inst === frame.id) return;`
- Two tabs on one surface restore the same grid file, so both hold the same
  widget instance id (grid.js `_normalize` keeps the saved `id`). Tab one's
  emit carries `inst = <that id>`; tab two's mirror sees its own id and
  drops the payload before `apply` runs. Screenshot 06 shows it plainly:
  tab two reads `tab=t-98ecd29s` (a different tab) and
  `inst=pipes-mtyx0mph-1` (the same instance).
- Not fixed here, and not a one-liner in the sense the spec means. The drop
  is contract 2.2 verbatim —
  [SPEC-session-agent-phases1-3.md](../Specs/Code%20Canvas%20port/SPEC-session-agent-phases1-3.md):126,
  "On receipt, local or remote: drop if `payload.inst === frame.id`". Test 6
  and that line cannot both hold. Changing it is a contract call, not mine.
- The candidate, for whoever rules on it: bus.js:47 already drops a tab's
  own socket frames, so anything arriving with `meta.remote` is from another
  tab by construction. Gating the drop on local delivery only —
  `if (!(meta && meta.remote) && payload.inst === frame.id) return;` — is one
  line at mirror.js:17 and leaves test 7 untouched. It rewrites contract
  2.2's "local or remote" either way.
- Phase 1 stays open on this line.

SIDE FINDING — not a spec test line
- Closing a surface from the session window deletes its grid file, but the
  tab still showing that surface writes the file back when the tab closes.
  Measured in the pass: right after the close the route read
  `targets=['graph']`; two seconds after surface two's tab closed it read
  `targets=['graph','other']` again. Logged in
  [console.txt](phase1-headed/console.txt) and printed by the harness.
  `pagehide` sets `MX.grid._unloading` at
  [grid.js](../../static/js/matrix/grid.js):621-622 and the debounced saves
  check it, so something else writes on the way out. Test 5 still PASSES —
  the spec's order is close the surface, then reread the panel, and that
  holds. Naming it, not fixing it.

STRAY FILES
- none

STATE LEFT BEHIND
- Session `ae83cfb77344`: both test surfaces deleted after the pass
  (`w-9iw4b3zu` "Empty surface", `w-84j0dqzy` "Empty surface 2"). The
  session is back to the three surfaces it had before this job
  (`w-n32ximig`, `w-cikyi7tb`, `w-4iqbeqvo`) and
  `/api/targets/ae83cfb77344` reads `{"targets":[]}`.
- Open/save test file:
  [Docs/Reports/phase1-headed/pipes-file-test.txt](phase1-headed/pipes-file-test.txt)
  — written by the harness, one line. The appended `pipes <timestamp>` line
  was removed by hand after the pass; the file is back to
  `phase1 headed open/save witness`. The `.backups/` folder the save created
  beside it was deleted.
- `library/graphs/` shelf untouched: one entry, `graph`. Nothing imported.
- No file outside `Docs/` was written by this job.

GOALS DONE
- Every line of SPEC-phase1-1H run headed, each PASS or FAIL with a
  screenshot.
- Test script saved at
  [Docs/tests/phase1_headed.py](../tests/phase1_headed.py), launch pattern
  copied from matrix_harness.py.

BRANDON'S TODOS
- Rule on test 6: does contract 2.2 change, or does the phase-1 line
  "two tabs mirror" mean something else than one surface in two tabs?
- 1A's and 1D's todo "restart the server and curl the routes" is done — the
  running server already carried their code and every route answered.

CLOSER REVIEW
- Phase 1 is 10 of 11. Test 6 is the one open line; it is a contract
  question, not a build bug.
- action: rule on mirror.js:17 vs contract 2.2 — Brandon
- action: decide whether the surface-resurrect-on-tab-close finding becomes
  its own job — Brandon or session agent
