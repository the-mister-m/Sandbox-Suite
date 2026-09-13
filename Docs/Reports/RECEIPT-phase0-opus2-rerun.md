# SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Opus 2 headed rerun — 2026-09-12 (timestamps: ask Brandon)

Report only. No suite code touched. Suite answered on port 5000 for the whole run. Server never started or stopped.

## EDITS

- [Docs/tests/phase0_rerun.py](../tests/phase0_rerun.py) — new headed Playwright harness, blocks E and D, with fence and sweep built in
- [Docs/Reports/phase0-rerun/](phase0-rerun/) — 14 screenshots, per-block results and timestamped console dumps

## STEP LINES

### Block E — Sonnet 3's changes (six of six PASS)

- E1: PASS — first template row is `Empty surface` with one button, `Add surface`, no Delete. No button anywhere in the panel reads "New blank surface" — [E1-templates.png](phase0-rerun/E1-templates.png)
- E2: PASS — two adds from Empty surface gave `w-270ai6cl` "Empty surface" and `w-5lecz2n0` "Empty surface 2", both with zero widgets — [E2-two-empty-surfaces.png](phase0-rerun/E2-two-empty-surfaces.png)
- E3: PASS — two adds from template `redpen-tpl` gave "redpen-tpl" and "redpen-tpl 2", two widgets each — [E3-template-surfaces.png](phase0-rerun/E3-template-surfaces.png)
- E4: PASS — bound tab on `85b19c53d41a`, surface `w-c03v16mp`, two widgets. Switch to `0d78d246515f`: grid emptied to 0 instances, URL became `/matrix/0d78d246515f` with no `?s=`, socket sid moved, session window reopened listing the other session's one surface. The other session's grid folder was byte-for-byte untouched — same file list, same mtimes — [E4-after-switch.png](phase0-rerun/E4-after-switch.png)
- E5: PASS — state line reads `live · 85b19c53d41a · surface w-s0q6wk8g`. The word is "surface" — [E5-state-line.png](phase0-rerun/E5-state-line.png)
- E6: PASS — `GET /favicon.ico` → 204. Zero favicon lines in any console dump this run — [E6-favicon.png](phase0-rerun/E6-favicon.png)

### Block D — bus and mirror (seven PASS, one OBSERVED)

- D1: PASS — widget added in tab one appeared in tab two with no reload. `TAB_ID` t1=`t-9143ob68` t2=`t-n8mn50km`, `WINDOW_ID` both `w-lv56257i` — [D1-tab2-after-add.png](phase0-rerun/D1-tab2-after-add.png)
- D2: PASS — dragged then resized in tab two to `{col:10,row:4,w:6,h:5}`; tab one holds the identical slot — [D2-tab1-after-move.png](phase0-rerun/D2-tab1-after-move.png)
- D3: PASS — tab two held the widget, tab one closed it, tab two dropped to zero — [D3-tab2-after-close.png](phase0-rerun/D3-tab2-after-close.png)
- D4: OBSERVED — file opened in tab one's editor via the browser's right-click. Tab one's editor holds `tabs=[{path: .../AI Design/CLAUDE.md}]`; tab two's same instance holds `tabs=[]`. **Widget insides do not mirror.** The open file rides on `getOptions` only: [editor.js:461](../../static/js/widgets/usertools/editor/editor.js) emits `tabs` and `active`, and [editor.js:457](../../static/js/widgets/usertools/editor/editor.js) `onOption` consumes `showPreview` and nothing else, so an arriving `applyOptions` cannot restore a tab. The only path that would carry it, `grid.markDirty` → `surface.widget`, is still defined at [grid.js:111](../../static/js/matrix/grid.js) and called from nowhere in `static/js/` — [D4-tab2-editor.png](phase0-rerun/D4-tab2-editor.png)
- D5: PASS — remote emit fired in both tabs (1/1); local emit fired in one only (2/1). `TAB_ID` differs between the tabs, `WINDOW_ID` matches. The frame that reached tab two's socket carried `inst: "t-9143ob68"`, tab one's tab id, not the surface id. The split at [bus.js:40 / bus.js:47](../../static/js/matrix/bus.js) holds — [D5-bus.png](phase0-rerun/D5-bus.png)
- D6: PASS — two surfaces in one session. A widget added on surface one left surface two's widget list unchanged and its instance never appeared there — [D6-other-surface.png](phase0-rerun/D6-other-surface.png)
- D7: PASS — burst of three widgets plus a move in tab two, then tab one reloaded. Tab one came back with tab two's seven widgets in tab two's slots, and `w-lv56257i.json` on disk matched tab two's snapshot. The D7b overwrite did not recur — [D7-after-burst-reload.png](phase0-rerun/D7-after-burst-reload.png)
- D8: PASS — after the burst settled, one write to the grid route; busiest two-second window held one. No loop — [D8-writes.png](phase0-rerun/D8-writes.png)

## CONSOLE

- Block D: zero console errors, zero pageerrors, zero favicon lines. Seven `net::ERR_ABORTED` on tab one's `PUT /api/grid/85b19c53d41a/w-lv56257i` — the `.catch(() => {})` at [grid.js:104](../../static/js/matrix/grid.js) swallows them, so they never reach the console. Dump: [console-D.txt](phase0-rerun/console-D.txt)
- Block E: one console error, timestamped `12:46:17`, between the E5 line and the E4 line — it lands on the E4 session switch: `WebSocket connection to 'ws://127.0.0.1:5000/ws/ade/85b19c53d41a' failed: Invalid frame header`. The old session's socket is torn down by `MX.socket.bind(sid)` at [main.js:63](../../static/js/matrix/main.js) and the close is not clean. Dump: [console-E.txt](phase0-rerun/console-E.txt)

## FENCE AND SWEEP

- Session `85b19c53d41a` before: `w-88ebk2bl`, `w-8924kcue`, `w-fzsn00w1`, `w-ywzvtxv8`, `w-zvc46lwr`
- Session `85b19c53d41a` after: `w-88ebk2bl`, `w-8924kcue`, `w-fzsn00w1`, `w-ywzvtxv8`, `w-zvc46lwr` — **intact**
- Session `0d78d246515f` before: `w-8924kcue`. After: `w-8924kcue` — **intact**, and E4 wrote nothing into it
- Seventeen surfaces made across three runs, all seventeen deleted: `w-270ai6cl` `w-2l3u8v3j` `w-5lecz2n0` `w-8oeqlihz` `w-8y4r4kj1` `w-aok6o4xs` `w-bof0hx8n` `w-c03v16mp` `w-cnhw1r43` `w-jrbimnw4` `w-lv56257i` `w-m08neawh` `w-m504qwr7` `w-sbquzkzm` `w-t0eip5z4` `w-t9n9ps9k` `w-uga8kliw`
- Open sessions before and after: the same six. None created, none ended. Template `redpen-tpl` reused, not replaced, and left as found
- One run of block E is not in the record: I ran E a second time without sweeping first, so my own leftover names collided and E2/E3 read FAIL with "Empty surface 6/7" and "redpen-tpl 3/4". That is the counter working, not the product failing — I swept and reran clean, and the clean run is what is written above

## STRAY FILES

- none outside `Docs/Reports/phase0-rerun/` and `Docs/tests/phase0_rerun.py`

## GOALS DONE

- Block D rerun headed, eight steps, seven PASS and one OBSERVED. The D failure the first redpen found is closed
- Block E rerun headed, six steps, six PASS. Every Sonnet 3 change holds
- Fence recorded, sweep verified, both folders end as they began

## BRANDON'S TODOS

- none

## QUESTIONS FOR WHOEVER OWNS THE NEXT SPEC

1. D7 passed because the mirror kept tab one current, not because the beacon changed. [grid.js:582](../../static/js/matrix/grid.js) still sends a whole snapshot at `pagehide` and [server.py:1811](../../server.py) still writes whatever arrives with no version or timestamp in the body. What does a tab that was asleep, backgrounded, or off-socket for a minute send when the user closes it — and what would the surface file want to see on it so it could tell a fresh snapshot from an old one?
2. Seven grid PUTs from tab one were aborted mid-flight and nothing in the app noticed, because the fetch's catch is empty. If a save is worth making, what should a tab do when it finds out the save never landed?
3. The editor round-trips its open file through `getOptions` for the save path and drops it on the way back in. When a second tab is showing the same editor, what is the smallest thing that should travel — the tab list, or the whole options object — and does that decision belong to the widget or to the frame?
4. E5 shows `surface w-s0q6wk8g` while the grid is actually on a different surface: `setState` only runs on a socket state change, so the corner line keeps the surface id from page load. Where does the corner get told that the surface changed?
5. E4's switch drops the old ADE websocket hard enough that Chrome logs "Invalid frame header." What does a clean goodbye look like on that socket, and who says it — the client at [main.js:63](../../static/js/matrix/main.js) or the server?

## CLOSER REVIEW

- Gets copy of review, not a contract.
- Phase 0 blocks A–E now stand green; decide whether D4's widget-inside mirroring is phase 0 or phase 1 — Brandon

## STEPPING BACK

The whole first failure came down to one name doing two jobs, and splitting the name fixed six steps at once without touching anything those steps were about. That is the tell of a young system: the expensive problems are naming problems wearing a costume.

What is left is quieter and worth more attention. Three of the five questions above are the same shape — something goes out, nothing comes back, and no one finds out it failed. The save that aborts silently, the socket that dies without a goodbye, the corner label that never hears the surface changed. None of them broke a test. They are all the system talking without listening, and a system that only talks is fine until the moment two people are in the room. That moment already arrived here: the second tab is what turned a working mirror into a real test. Every seam in this thing gets honest the same way — the second time someone looks at it.
