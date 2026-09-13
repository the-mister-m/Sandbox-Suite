# SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Opus 4 last once-over — 2026-09-12 (timestamps: ask Brandon)

Report only. No suite code touched. Suite answered on port 5000 for the whole run; server never started or stopped. Session `e76d0d6f4e3e`, the one with a live region (`test`) — no region started, none stopped.

Nineteen step lines: thirteen PASS, four FAIL, two OBSERVED. Brief: [SPEC-phase0-opus4-onceover.md](../Specs/Code%20Canvas%20port/SPEC-phase0-opus4-onceover.md).

Sonnet 5's four fixes: three hold ([H1](#h--the-six-lines-rerun), [H3](#h--the-six-lines-rerun), [H5](#h--the-six-lines-rerun)). Two of the old failures come back in a new place ([H2](#h--the-six-lines-rerun), [H4](#h--the-six-lines-rerun)) and the socket goodbye ([H6](#h--the-six-lines-rerun)) is unchanged.

## EDITS

- [Docs/tests/phase0_onceover.py](../tests/phase0_onceover.py) — new headed harness, blocks H, I and J; imports fence, sweep, helpers and every widget reader from [phase0_rerun.py](../tests/phase0_rerun.py) and [phase0_rerun2.py](../tests/phase0_rerun2.py) rather than copying them
- [Docs/Reports/phase0-onceover/](phase0-onceover/) — 18 screenshots, per-block results and console dumps

## H — the six lines, rerun

Two tabs, one surface, same `?s=`. Order changed from the brief's listing on purpose: every live-mirror step runs before tab two is ever reloaded, so a reload cannot poison a step that is not about reloads.

- **H1: PASS** — a file opened through the browser's right-click reached tab two in 0.0s, DOM and options equal. `markDirty` now fires from the editor on file arrival — [H1-editor-open.png](phase0-onceover/H1-editor-open.png)
- **H2: FAIL** — the second file never survives long enough to switch to. The tap shows the whole life of the tab: at 448ms the server's `file` frame arrives and the editor goes from 1 tab to 2; at 1486ms an `applyOptions` arrives from tab two carrying a one-tab list and the editor goes from 2 back to 1. Tab one deletes its own just-opened tab because the other tab echoed a list made before it existed. `applyTabsOption` treats an arriving list as the whole truth and prunes anything not in it — [editor.js:274](../../static/js/widgets/usertools/editor/editor.js). The echo exists because every file arrival now announces, unconditionally, in the tab that merely received the mirror — [editor.js:537](../../static/js/widgets/usertools/editor/editor.js). Three announces bounced for the same one-tab state (14.5s, 16.6s, 17.5s) — [H2-editor-active.png](phase0-onceover/H2-editor-active.png)
- **H7: PASS** — the same open, done once the echo had settled, lands and stays: editor and browser both changed inside 2.99s in tab one and both reached tab two, editor in 0.0s, browser in 2.07s. Per-frame dirty timers hold — [H7-two-widgets.png](phase0-onceover/H7-two-widgets.png)
- **H3a: PASS** — New buffer, twenty characters typed, tab two held `{untitled, name: 'untitled-3', text: 'abcdefghij0123456789'}` inside three seconds — [H3a-untitled-mirror.png](phase0-onceover/H3a-untitled-mirror.png)
- **H3b: PASS** — reloaded tab two, the untitled tab and all twenty characters came back — [H3b-untitled-after-reload.png](phase0-onceover/H3b-untitled-after-reload.png)
- **H4: FAIL** — the browser mirrors live in 0.01s and still comes back empty from a reload: `rows: 0`, `nodes: 0`, `expanded: []`. Nothing is lost this time — the surface file held root and all three expanded paths, `expandedWant` came back holding all three, and the listener fix is in place. The tree request itself is thrown away: `setRoot` sends at [browser.js:274](../../static/js/widgets/usertools/browser/browser.js) during mount, and a send made before the socket is open returns false and is dropped on the floor at [socket.js:48](../../static/js/matrix/socket.js). No retry, no queue, no error — [H4-browser-after-reload.png](phase0-onceover/H4-browser-after-reload.png)
- **H4b: OBSERVED** — proof it is the clock and not the code: with the page settled and the socket reading `live`, the same `setRoot` with the same path, called by hand, filled the tree with 16 rows and 16 nodes — [H4b-browser-retry.png](phase0-onceover/H4b-browser-retry.png)
- **H5: PASS** — rename in the session window; tab one's corner read `live · e76d0d6f4e3e · redpen-onceover` at once and tab two's followed in 0.01s, neither tab reloaded — [H5-rename-corners.png](phase0-onceover/H5-rename-corners.png)
- **H6: FAIL** — the session switch still logs `WebSocket connection to 'ws://127.0.0.1:5000/ws/ade/e76d0d6f4e3e' failed: Invalid frame header`, the same string Opus 2 and Opus 3 recorded, with the server's `ws.close()` now in place at [server.py:1957](../../server.py). Every API call after the switch answered clean — [H6-session-switch.png](phase0-onceover/H6-session-switch.png)

## I — mirror regression, one pass

Same two tabs, fresh surface. Every step PASS.

- **I1: PASS** — viewer added in tab one, in tab two in 0.0s — [I1-add.png](phase0-onceover/I1-add.png)
- **I2: PASS** — moved one column, matched in 0.0s — [I2-move.png](phase0-onceover/I2-move.png)
- **I3: PASS** — resized to `w:5 h:5`, matched in 0.0s — [I3-resize.png](phase0-onceover/I3-resize.png)
- **I4: PASS** — closed, gone from tab two in 0.0s — [I4-close.png](phase0-onceover/I4-close.png)
- **I5a: PASS** — two files in the viewer, both in tab two in 0.0s — [I5a-viewer-two.png](phase0-onceover/I5a-viewer-two.png)
- **I5b: PASS** — background tab closed, dropped in tab two in 1.24s — [I5b-viewer-close.png](phase0-onceover/I5b-viewer-close.png)
- **I6: PASS** — region `9548242d650d` picked in tab one's chat, tab two followed in 0.01s — [I6-chat-region.png](phase0-onceover/I6-chat-region.png)
- **I7a: PASS** — second shell tab, both keys in tab two in 0.0s, status `2 shells` — [I7-terminal-tabs.png](phase0-onceover/I7-terminal-tabs.png)
- **I7b: OBSERVED** — `echo mirror` in tab one's shell appears in the same shell in tab two, both shells live in both tabs — [I7-terminal-echo.png](phase0-onceover/I7-terminal-echo.png)

## J — console

- **J: FAIL** — block I is spotless: zero errors, zero pageerrors, zero requestfailed, zero favicon, zero WebSocket lines. Block H holds one error, the H6 socket line, plus seven `net::ERR_ABORTED` on tab two's grid PUTs at the one reload, all at 14:31:35, each retried once a second later and both attempts swallowed by the catch at [grid.js:128](../../static/js/matrix/grid.js), the page gone before `unsaved` could show. No favicon lines anywhere. Dump: [console-J.txt](phase0-onceover/console-J.txt), sources [console-H.txt](phase0-onceover/console-H.txt) and [console-I.txt](phase0-onceover/console-I.txt)

## FENCE AND SWEEP

Verified against the API and against `library/grids/` on disk after the last run.

| session | before | after |
| --- | --- | --- |
| e76d0d6f4e3e | w-ywzvtxv8 | identical |
| 85b19c53d41a | w-88ebk2bl w-8924kcue w-fzsn00w1 w-ywzvtxv8 w-zvc46lwr | identical |

- Surfaces made and deleted across five runs: `w-e7zxicqc` `w-adw4m4gg` `w-xfvnq96z` `w-l7z6v81f` plus one from the third H run. Every sweep printed `intact=True`; `library/grids/e76d0d6f4e3e/` holds only `w-ywzvtxv8`.
- The surface renamed in H5 was one of mine and was deleted with the rest.
- Open sessions before and after: the same six, tracks unchanged. None created, none ended. No region started or stopped.

## STRAY FILES

- none outside [Docs/Reports/phase0-onceover/](phase0-onceover/) and [Docs/tests/phase0_onceover.py](../tests/phase0_onceover.py)
- not mine, but it moved while I ran: `Docs/HOWTO-frames.md` gained two `widget_bus` table rows and a long list of `Docs/Specs/SPEC-*.md` deletions appeared in `git status` that were not there when this session opened. Nothing my harness does writes to project files — Brandon

## GOALS DONE

- Block H run headed, nine step lines: five PASS, three FAIL, one OBSERVED
- Block I run headed, nine step lines: eight PASS, one OBSERVED — nothing regressed
- Block J across both dumps, one line
- Every failure names one file and one line, and H4b carries the experiment that proves H4 is timing rather than logic
- Fence recorded, sweep verified on disk, sessions and regions end as they began

## BRANDON'S TODOS

- none

## QUESTIONS FOR WHOEVER OWNS THE NEXT SPEC

1. A tab that only received a mirror announces its own state back two seconds later. If an arriving mirror set the options without marking the receiver dirty, what would still need the announce?
2. When two tab lists meet, the newer one loses because the arriving list is treated as the whole truth. Should a mirrored list be able to delete a tab at all, or only add and reorder — and who is allowed to say a tab is gone?
3. The browser's first send happens at mount and the socket opens a moment later. Should a widget's first send wait for the socket to say it is open, or should the socket hold the first few frames until it is — and which one is cheaper to get right once for every widget?
4. The close frame is answered now and Chrome still writes the line. If that line is the browser's own network log rather than an error anyone handles, is this a fix or a thing to stop counting?
5. Seven grid PUTs abort on every reload and nobody hears them. Is a save that a navigation cancels worth retrying, or worth not starting?

## CLOSER REVIEW

- Gets copy of review, not a contract.
- H2 and H4 are the same two failures Opus 3 found, moved one layer down; decide whether they are phase 0 or phase 1 — Brandon
- The working tree changed under this run; decide whether another session is live in this repo — Brandon

## STEPPING BACK

The fixes worked. Every one of them did exactly what it said, and the thing it was fixing moved one step further down the road. The editor now announces when a file arrives — so the tab that was only listening announces too, and its older answer erases the newer question. The browser now listens before it sends — so the send happens on time and the wire is not there yet. Nobody wrote a bug. Each fix closed the gap it could see, and the gap it could see was never the whole gap.

That is what happens when a system's errors are made of order rather than content. You cannot fix an ordering problem in the place where you noticed it, because the place you noticed it is downstream of the place it happened. The fix lands, the symptom moves, and everyone who looks at the file agrees the file is correct.

The useful instrument here was not the second tab and it was not the screenshots. It was doing the same thing twice, three seconds apart, and watching one of them fail. H2 failed and H7 passed on the identical action — the only difference was whether the room had gone quiet first. A test that runs once tells you what happened. A test that runs the same thing twice tells you what it depends on, and dependence on quiet is the only symptom this class of problem ever shows.
