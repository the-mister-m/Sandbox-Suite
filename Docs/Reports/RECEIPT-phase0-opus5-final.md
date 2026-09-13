# SESSION REVIEW — Sandbox Suite, Phase 0 Code Canvas port, Opus 5 — headed run 15:00:10–15:02:18, session timestamps: ask Brandon

Three fixes from [SPEC-phase0-opus5-fix-and-test.md](../Specs/Code%20Canvas%20port/SPEC-phase0-opus5-fix-and-test.md), then one headed run of six steps on session `e76d0d6f4e3e`, one surface, two tabs on the same `?s=`. Eleven of twelve step lines PASS, one OBSERVED, one FAIL. The FAIL is step 6 and it is not one of the three fixes — see it below.

Server restarted once after the edits: old pid 57105 killed, new pid 57828, `/favicon.ico` answered 204. Log: [server-restart.log](server-restart.log).

## EDITS

- [static/js/matrix/socket.js](../../static/js/matrix/socket.js) — fix 1, `send()` queues a frame while the bind is CONNECTING and returns true; `onopen` flushes the queue in order then drops it; `close()`, a new `bind()` and `onclose` discard it
- [static/js/widgets/usertools/editor/editor.js](../../static/js/widgets/usertools/editor/editor.js) — fix 2, the `file` arrival reads `restoring` before `openTab` runs and only announces when it was clear, so a mirror arrival no longer echoes a stale tab list
- [static/js/matrix/grid.js](../../static/js/matrix/grid.js) — fix 3, `_unloading` added beside `_applying`, set true in the `pagehide` listener, and `save()`'s catch path skips the retry, the second catch and the `unsaved` flag while it is set
- [Docs/tests/phase0_final.py](../tests/phase0_final.py) — new headed harness, six steps, imports fence, sweep, helpers, widget readers and drivers from `phase0_rerun.py`, `phase0_rerun2.py` and `phase0_onceover.py`

`node --check` clean on all three edited JS files. `python3 -m py_compile` clean on the harness.

## STEPS

- **1: PASS** — two files opened in tab one through the browser right-click, then tab one clicked active. Tab two matched the active key in 0.01s and, sampled every 400ms for five seconds, always held both tabs with the same active. Tab one also always held both — the 1.0s deletion the Opus 4 run saw is gone. Tab lists identical either side. Tab one made 5 `markDirty` calls, none of them from a restore arrival — [1-editor-two-tabs.png](phase0-final/1-editor-two-tabs.png)
- **2: PASS** — `Docs/audit` and `Docs/audit/arrange-old` expanded in tab one's browser, tab two reloaded. Tab two came back with `rows: 15`, `nodes: 15` and both paths in `expanded`, root line intact and all three folders open in the DOM. The queued `setRoot` now survives the bind — [2-browser-after-reload.png](phase0-final/2-browser-after-reload.png)
- **3: PASS** — three moves in tab one, then an immediate reload of tab two. One grid PUT left tab two and one aborted; no request body was aborted twice, so there is no retry pair. The two `ERR_ABORTED` console lines at 15:01:07 are the one PUT plus the `pagehide` beacon, different bodies — [3-burst-reload.png](phase0-final/3-burst-reload.png)
- **4: PASS** — a bound tab carrying a browser widget switched session three times, into `85b19c53d41a`, `0d78d246515f` and `bc64260f82ad`. Zero WebSocket console lines across all three — [4-session-switches.png](phase0-final/4-session-switches.png)
- **5a: PASS** — viewer added in tab one, tab two showed it in 0.0s — [5a-add.png](phase0-final/5a-add.png)
- **5b: PASS** — moved one column, tab two matched the slot in 0.0s — [5b-move.png](phase0-final/5b-move.png)
- **5c: PASS** — resized to 5×5, tab two matched in 0.01s — [5c-resize.png](phase0-final/5c-resize.png)
- **5d: PASS** — closed in tab one, tab two dropped it in 0.0s — [5d-close.png](phase0-final/5d-close.png)
- **5e: PASS** — `arrange.js` and `cables.js` opened into tab one's viewer, tab two carried both in 0.0s, tab lists identical — [5e-viewer-two.png](phase0-final/5e-viewer-two.png)
- **5f: PASS** — background viewer tab closed in tab one, tab two dropped it in 1.05s, lists identical — [5f-viewer-close.png](phase0-final/5f-viewer-close.png)
- **5g: PASS** — chat picked region `9548242d650d` ("test") from the roster the session already had; started none. Tab two followed in 0.01s, both tabs read the same region and the same picker value — [5g-chat-region.png](phase0-final/5g-chat-region.png)
- **5ha: PASS** — two shell tabs opened in tab one's terminal on that region; tab two carried both keys in 0.0s, DOM shows two tabs, status reads "2 shells" — [5h-terminal-tabs.png](phase0-final/5h-terminal-tabs.png)
- **5hb: OBSERVED** — `echo mirror` typed into tab one's active shell reached neither pane; both tabs report `live: False` for both shells, so no xterm instance was ever attached. Downstream of the loader collision in step 6, not of the three fixes — [5h-terminal-echo.png](phase0-final/5h-terminal-echo.png)
- **6: FAIL** — zero console errors, but two pageerrors: `Can only have one anonymous define call per script file`, one per tab, at 15:02:07 and 15:02:09 — exactly when the terminal widget loaded. Six `requestfailed` lines, all `net::ERR_ABORTED` grid PUTs at the two reloads, none of them a retry pair. Dump: [console-final.txt](phase0-final/console-final.txt), results: [results-final.txt](phase0-final/results-final.txt) — [6-console.png](phase0-final/6-console.png)

## THE STEP 6 FAILURE, NAMED

Not one of my three fixes and not something I touched. The editor loads Monaco, which installs an AMD `define` with `define.amd` set. The terminal then loads `xterm.min.js` through a plain script tag at [terminal.js:29](../../static/js/widgets/usertools/terminal/terminal.js) — a UMD bundle, which sees `define.amd` and takes the AMD path with an anonymous `define`. Monaco's loader throws. It needs an editor and a terminal on the same surface, and no earlier block ever had both: block H was editor plus browser, block I was viewer, browser, chat and terminal with no editor. Both prior dumps carry zero pageerrors for that reason. This run is the first to put them together. It is also why 5hb has no live shell.

I did not fix it. It is outside the three fixes in the brief.

## PICKS I MADE

- **Fix 2, where the flag is read.** `openTab` calls `finishRestoreStep`, which clears `restoring` once the last requested file lands. Reading the flag after `openTab` would have let the last arrival of a restore announce anyway. I captured it into `wasRestoring` before the call, so the whole restore stays silent — the brief's "keep the flag set until the last requested file has landed" read to me as the last one being silent too.
- **Fix 1, what counts as "a bind in flight".** I used `readyState === CONNECTING` rather than a separate flag. CLOSING and CLOSED still return false, so a dead socket does not silently swallow frames.
- **Fix 1, onclose clears the queue.** The brief says "a close or a new bind discards the queue". `bind()` clears it too, so nothing stale can ever flush, but I added the line to `onclose` because an unexpected close is still a close.
- **Fix 3, three guard points.** `_unloading` is checked in the first catch, again before the retry fires, and again in the second catch. One check would have left a timer that had already been scheduled free to set `unsaved`.
- **Step 3's pass test.** The brief's wording is "never two for the same body". I tapped tab two's requests and compared actual PUT bodies rather than counting console lines, so the `pagehide` beacon is not mistaken for a retry.
- **Step 4's third session.** The brief says three switches and does not name the targets. I walked the open-session list in order, so the tab landed on three different sessions rather than bouncing between two.
- **One stale string, fixed after the run.** Step 3's printed note in [results-final.txt](phase0-final/results-final.txt) says "three moves in tab2". The code moved the widget in tab one, as the brief says; only the message was wrong. I corrected the string in the harness after the run. The result line as printed carries the old wording — believe the code, not that one line.

## FENCE AND SWEEP

Fenced every open session up front, because step 4 switches into three of them.

Before:

- `e76d0d6f4e3e` — `w-ywzvtxv8`
- `85b19c53d41a` — `w-88ebk2bl`, `w-8924kcue`, `w-fzsn00w1`, `w-ywzvtxv8`, `w-zvc46lwr`
- `0d78d246515f` — `w-8924kcue`
- `bc64260f82ad` — `w-0t09563v`, `w-6r9sradu`, `w-aw9thhhm`, `w-ywzvtxv8`
- `8c3abc75b244` — `w-ywzvtxv8`
- `ae83cfb77344` — `w-4iqbeqvo`, `w-cikyi7tb`, `w-n32ximig`

Made and deleted: `e76d0d6f4e3e/w-mw80gcd1`, `bc64260f82ad/w-2kzlfx4q`. Nothing else made.

After: every list above, unchanged. `intact=True` on all six. No region started, no region stopped.

## STRAY FILES

- [Docs/tests/phase0_final.py](../tests/phase0_final.py) — the harness, kept
- [Docs/Reports/phase0-final/](phase0-final) — fourteen screenshots, console dump, results file
- [Docs/Reports/server-restart.log](server-restart.log) — the one restart's stdout

## GOALS DONE

- Fix 1, socket holds frames until open — done, proved by step 2
- Fix 2, editor does not echo a mirror — done, proved by step 1
- Fix 3, no retry while unloading — done, proved by step 3
- Headed six-step run on `e76d0d6f4e3e`, no region started, fenced and swept clean

## BRANDON'S TODOS

- Step 6's loader collision: the terminal's UMD `xterm.min.js` cannot share a page with Monaco's AMD loader. Decide whether that is phase 0 or phase 1 — Brandon
- 5hb: no shell ever goes live while an editor is on the same surface. Same cause, same decision — Brandon

## CLOSER REVIEW

- Gets copy of review, not a contract.
- SESSIONLOG.md and INDEX.md lines added by me; check them against this receipt — closer
- The three fixes are proved and phase 0's original six lines are all closed except the new loader collision, which is a different problem than any of them — closer
