# SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Opus 3 headed rerun — 2026-09-12 (timestamps: ask Brandon)

Report only. No suite code touched. Suite answered on port 5000 for the whole run. Server never started or stopped.

Twenty-one step lines: twelve PASS, four FAIL, five OBSERVED. The four FAIL are [F1a](#f--widget-insides-mirror), [F1b](#f--widget-insides-mirror), [F6](#f--widget-insides-mirror), [G4](#g--quiet-fixes). Each names one line.

## EDITS

- [Docs/tests/phase0_rerun2.py](../tests/phase0_rerun2.py) — new headed harness, blocks F, R and G; imports the fence, sweep and helpers from [phase0_rerun.py](../tests/phase0_rerun.py) rather than copying them
- [Docs/Reports/phase0-rerun2/](phase0-rerun2/) — 21 screenshots, per-block results and timestamped console dumps

Blocks run as `--block F --regions skip`, `--block R`, `--block G`. F and R were split because one browser session carrying two Monaco editors plus four xterms died mid-run.

## F — widget insides mirror

Two tabs, one surface, same `?s=`.

- **F1a: FAIL** — a file opened through the browser's right-click never reaches tab two. Not in three seconds, not in twelve. Over that window tab one called `markDirty` twice and **both calls came from the browser widget, never the editor**; every `surface.widget` frame that left carried `root`/`expanded`. The gate is [editor.js:469](../../static/js/widgets/usertools/editor/editor.js) — `markDirty` on file arrival runs only `if (ed.userOpens[msg.path])`, and `userOpens` is set in exactly one place, [editor.js:371](../../static/js/widgets/usertools/editor/editor.js), inside the editor's own Open button. [browser.js:61](../../static/js/widgets/usertools/browser/browser.js) sends the same `open` frame without it. The one path the spec names is the one path that never marks dirty — [F1a-editor-open.png](phase0-rerun2/F1a-editor-open.png)
- **F1b: FAIL** — tab one's active tab does not carry. Tab one on `…-t1`, tab two on `…-t2`. The announce itself was correct and arrived in 12ms with both tabs and the right `active`. What overwrites it lands 8ms later: [applyTabsOption](../../static/js/widgets/usertools/editor/editor.js) at editor.js:262 requests each restored file, and every reply runs `openTab` → `showTab` at [editor.js:467](../../static/js/widgets/usertools/editor/editor.js). The last file to come back takes the focus, so the mirrored `active` applied at [editor.js:501](../../static/js/widgets/usertools/editor/editor.js) is overwritten by the widget's own restore traffic — [F1b-editor-switch.png](phase0-rerun2/F1b-editor-switch.png)
- **F1c: PASS** — close in tab one, gone from tab two in 1.65s, both lists equal — [F1c-editor-close.png](phase0-rerun2/F1c-editor-close.png)
- **F1d: OBSERVED** (extra, not in the brief) — an untitled buffer held in tab two survived tab one opening another file. `getOptions` filters untitled tabs out, so they never travel and never get reconciled away — [F1d-untitled.png](phase0-rerun2/F1d-untitled.png)
- **F2: PASS** — root and two nested folders both mirrored, settled inside 10ms. Root was set through the widget's own option: the `folder` button calls `/api/fs/pick`, a native OS dialog ([browser.js:300](../../static/js/widgets/usertools/browser/browser.js)), which a headed harness cannot answer. Both folders were opened by clicking rows, the real internal path — [F2-browser.png](phase0-rerun2/F2-browser.png)
- **F3a: PASS** — two files open in tab one, both in tab two, DOM and options equal — [F3a-viewer-two.png](phase0-rerun2/F3a-viewer-two.png)
- **F3b: PASS** — background tab closed in tab one, dropped in tab two in 1.66s — [F3b-viewer-close.png](phase0-rerun2/F3b-viewer-close.png)
- **F4 / F5: OBSERVED, blocked** — the briefed session (first row of `/api/sessions/open`, `85b19c53d41a`) has no live region. Chat's roster comes back empty and the picker holds only the blank row; `newTab` refuses at [terminal.js:167](../../static/js/widgets/usertools/terminal/terminal.js) with "pick a region first". Starting a region would have spawned an agent in Brandon's session, so I ran the two steps on `e76d0d6f4e3e`, fenced and swept the same way — [F4-no-regions.png](phase0-rerun2/F4-no-regions.png)
- **F4b: PASS** — region picked in tab one, tab two followed in 10ms, picker and head both — [F4b-chat-region.png](phase0-rerun2/F4b-chat-region.png)
- **F5ba: PASS** — second shell tab in tab one, both keys in tab two immediately — [F5b-terminal-tabs.png](phase0-rerun2/F5b-terminal-tabs.png)
- **F5bb: OBSERVED — the shared-PTY pick holds.** `echo mirror` typed in tab one appears in tab two's matching shell, both shells live in both tabs. This is the answer the step was asked for — [F5b-terminal-echo.png](phase0-rerun2/F5b-terminal-echo.png)
- **F6: FAIL** — reload tab two, fourteen seconds to settle, and the browser widget comes back **empty**: `rows: 0`, `nodes: 0`, `expanded: []`. Not a lost option — the surface file held both nested paths at reload time, and `expandedWant` still holds them in memory. The tree itself never arrived. [browser.js:370](../../static/js/widgets/usertools/browser/browser.js) calls `setRoot(frame.options.root)` inside `register()`, but `frame._browserApply` is not assigned until [browser.js:386](../../static/js/widgets/usertools/browser/browser.js); a root tree response that lands in between is dropped by [browser.js:431](../../static/js/widgets/usertools/browser/browser.js). Editor and viewer restored clean — [F6-after-reload.png](phase0-rerun2/F6-after-reload.png)
- **F7: PASS** — a third tab on another surface of the same session was untouched by all of F, byte for byte, and no instance leaked — [F7-cross-surface.png](phase0-rerun2/F7-cross-surface.png)

## G — quiet fixes

- **G1a: PASS** — corner reads `live · 85b19c53d41a · Empty surface` with no reload — [G1a-corner-new-surface.png](phase0-rerun2/G1a-corner-new-surface.png)
- **G1b: OBSERVED** — rename in the session window lands on disk (`name='redpen-renamed'`) and the corner does not follow. `grid.surfaceName` still reads the old name, so [main.js:42](../../static/js/matrix/main.js) has nothing new to print. The rename writes the file; nothing tells the bound tab — [G1b-corner-after-rename.png](phase0-rerun2/G1b-corner-after-rename.png)
- **G2a: PASS** — every grid PUT rejected, corner reached `· unsaved` in 1.09s after exactly two attempts — [G2a-unsaved.png](phase0-rerun2/G2a-unsaved.png)
- **G2b: PASS** — fetch restored, corner cleared in 0.16s — [G2b-unsaved-cleared.png](phase0-rerun2/G2b-unsaved-cleared.png)
- **G3: PASS** — first PUT rejected, retry passed: exactly two attempts, one request left the browser, corner sampled 25 times over five seconds and never showed unsaved — [G3-retry.png](phase0-rerun2/G3-retry.png)
- **G4: FAIL** — the session switch still logs `WebSocket connection to 'ws://127.0.0.1:5000/ws/ade/85b19c53d41a' failed: Invalid frame header`, the same string Opus 2 recorded. The client-side change cannot reach it: nulling `onerror` at [socket.js:60](../../static/js/matrix/socket.js) suppresses the handler, not Chrome's own network-layer log. Server side is not the usual suspect either — `_send` is lock-guarded and swallows a dead socket at [web_io.py:31](../../engine/web_io.py). What no one does is answer the close: [server.py:1939](../../server.py) breaks out of the receive loop and runs teardown without a close frame. Every API call after the switch answered clean, no traceback — [G4-socket-goodbye.png](phase0-rerun2/G4-socket-goodbye.png)
- **G5: PASS** — 24 grid-route writes across all of F, busiest two-second window held 3. No loop — [G5-writes.png](phase0-rerun2/G5-writes.png)

## CONSOLE

- Block R: clean. Zero errors, zero pageerrors, zero requestfailed, zero favicon lines anywhere in any block.
- Block F: one `pageerror: Canceled` at 13:52:41, inside F1b's window — a Monaco operation dropped while tab two rebuilt its tab list from the mirror. Six `net::ERR_ABORTED` on tab two's grid PUT at the F6 reload: three saves, each retried once, all aborted by the reload and all swallowed by the empty catch in [grid.js:119](../../static/js/matrix/grid.js). The retry now doubles the aborts and the page dies before `unsaved` could show. Dump: [console-F.txt](phase0-rerun2/console-F.txt)
- Block G: one error, the G4 websocket line. Dump: [console-G.txt](phase0-rerun2/console-G.txt)

## FENCE AND SWEEP

Verified against the API and against `library/grids/` on disk after the last run.

| session | before | after |
| --- | --- | --- |
| 85b19c53d41a | w-88ebk2bl w-8924kcue w-fzsn00w1 w-ywzvtxv8 w-zvc46lwr | identical |
| 0d78d246515f | w-8924kcue | identical |
| bc64260f82ad | w-0t09563v w-6r9sradu w-aw9thhhm w-ywzvtxv8 | identical |
| e76d0d6f4e3e | w-ywzvtxv8 | identical |
| 8c3abc75b244 | w-ywzvtxv8 | identical |
| ae83cfb77344 | w-4iqbeqvo w-cikyi7tb w-n32ximig | identical |

- Surfaces made and deleted across nine runs: `w-mkh03vlq` `w-ojw59fer` `w-4wszw7gu` `w-w16sxiko` `w-cww2uy9x` `w-iispj1b3` `w-j52d5nji` `w-6gajv99h` `w-mow6z5c1` `w-u71n3xn4` `w-w44xlsee` `w-f8yhgqw3` `w-splxalwb` `w-bi19tnhf` `w-xypludym` `w-uketzhbd` `w-o5ohdeoa` `w-0likd352` `w-3n5k0c19` `w-ibiafbqa` `w-j7tytiya` `w-2jqbnyx8` `w-z6hqwzjz`. Every sweep printed `intact=True`.
- The one surface I renamed (G1b) was one of mine and was deleted with the rest.
- Open sessions before and after: the same six. None created, none ended. No region started or stopped.

## STRAY FILES

- none outside [Docs/Reports/phase0-rerun2/](phase0-rerun2/) and [Docs/tests/phase0_rerun2.py](../tests/phase0_rerun2.py)

## GOALS DONE

- Block F run headed, fourteen step lines: seven PASS, three FAIL, four OBSERVED
- Block G run headed, seven step lines: five PASS, one FAIL, one OBSERVED
- Every failure names one file and one line
- Fence recorded, sweep verified twice, six sessions end as they began

## BRANDON'S TODOS

- none

## QUESTIONS FOR WHOEVER OWNS THE NEXT SPEC

1. Two widgets in one tab changing inside two seconds: `markDirty` keeps a single `_dirtyTimer` for the whole grid at [grid.js:131](../../static/js/matrix/grid.js), so the second caller cancels the first and only the last frame is announced. The save still carries everyone. Should the announce follow the save's habit of carrying the whole surface, or should the timer be per frame?
2. The editor hears "open this file" from two places and only recognises one of them as a user act. If the browser's Open in Editor said so in the frame it already sends, would `userOpens` still need to exist at all?
3. When a mirrored tab list arrives, the widget asks the server for each file, and each answer takes the focus. What should an arriving file do differently when it was asked for by a restore rather than by a person?
4. A widget that restores from options and talks to the socket in the same breath can ask before it can listen. What is the cheapest ordering rule that makes that impossible for every widget, not just the browser?
5. The rename writes the surface file and the bound tab never hears. The corner already knows how to redraw itself — what should the rename tell it, and does that same message also cover the tab that has the surface open but did not do the renaming?
6. Nothing answers the client's close frame. Is the goodbye the server's line to say, and if it is, is there anything left for the client's `close(1000)` to do?
7. The briefed session has no live region, so two of the seven F steps could only run somewhere else. Should the harness pick the first open session, or the first one that can actually exercise every step?

## CLOSER REVIEW

- Gets copy of review, not a contract.
- D4 is half closed: viewer, browser, chat and terminal mirror their insides; the editor mirrors a list but not which one you are looking at, and only when the editor itself was asked. Decide whether F1a/F1b and F6 are phase 0 or phase 1 — Brandon

## STEPPING BACK

Every one of the four failures is the same shape, and it is not a shape you can see by reading a file. Something does the right work at the right moment, and something else, arriving a few milliseconds later on a different road, quietly writes over it. The tab list was correct and got overwritten by its own file requests. The root was correct and got dropped because the listener was not born yet. The rename reached the disk before anyone told the room. The close frame went out and nobody answered.

This is what a system looks like when every part is correct and the order was never agreed on. The code review of any single file here would pass. It only breaks where two correct things meet, which is exactly where nobody was looking, because that seam does not live in any file — it lives in the gap between them.

Worth saying plainly: the fix that closed most of block D last time was a naming fix, and the things still broken are timing. Names are cheap to argue about because they sit still. Timing you can only learn by running it twice at once and watching which one loses. That is the whole reason the second tab keeps earning its keep — not because it tests the mirror, but because it is the only instrument in the room that can see what order things happened in.
