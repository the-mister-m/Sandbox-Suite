SESSION REVIEW — Sandbox Suite / Code Canvas port phase 0 — Opus headed redpen — 2026-09-12 (timestamps: ask Brandon)

Report only. No suite code touched. Suite answered on port 5000 for the whole run.

EDITS
- [Docs/tests/phase0_redpen.py](../tests/phase0_redpen.py) — new headed Playwright harness, blocks A–D
- [Docs/Reports/phase0-redpen/](phase0-redpen/) — 30 screenshots, per-block results and console dumps

STEP LINES

Block A — grid close (all green, console clean)
- A1: PASS — blank surface added from the session window, surface `w-l1zb7pob` — [A1-blank-surface.png](phase0-redpen/A1-blank-surface.png)
- A2: PASS — editor mounted, file opened via the browser widget's right-click → Open in Editor, one tab on `AI Design/CLAUDE.md` — [A2-file-open-in-editor.png](phase0-redpen/A2-file-open-in-editor.png)
- A3: PASS — browser mounted, folder `Desktop` expanded — [A3-folder-expanded.png](phase0-redpen/A3-folder-expanded.png)
- A4: PASS — third widget (terminal) closed with its × — [A4-third-closed.png](phase0-redpen/A4-third-closed.png)
- A5: PASS — editor tab unchanged, expansions unchanged, `.monaco-editor` 1 → 1 — [A5-survivors.png](phase0-redpen/A5-survivors.png)

Block B — surfaces (all green, console clean)
- B1: PASS — URL carries `?s=w-tcb1azwq` — [B1-url.png](phase0-redpen/B1-url.png)
- B2: PASS — tab closed, URL reopened: same two widgets, same slots, same options including the editor tab — [B2-reopened.png](phase0-redpen/B2-reopened.png)
- B3: PASS — Surfaces section lists it by name — [B3-surfaces-section.png](phase0-redpen/B3-surfaces-section.png)
- B4: PASS — renamed, reloaded, new name shows — [B4-renamed.png](phase0-redpen/B4-renamed.png)
- B5: PASS — template saved, Add surface made a new surface with the template's widgets, URL changed. Note: the new surface is named after the template (`redpen-tpl`), not `Surface N` — [B5-template-surface.png](phase0-redpen/B5-template-surface.png)
- B6: PASS — new blank surface, named row appears, grid empty — [B6-new-blank.png](phase0-redpen/B6-new-blank.png)
- B7: PASS — closing another tab's surface removes the row and the file from `GET /api/grid/<sid>` — [B7-other-closed.png](phase0-redpen/B7-other-closed.png). A rerun of this step read FAIL only because my harness had two rows named `RedpenRenamed` and matched the wrong one; the product behaviour was correct both times.
- B8: PASS — closing this tab's surface empties the grid and reopens the session window — [B8-own-closed.png](phase0-redpen/B8-own-closed.png)
- B9: PASS — header reads name, saved, last, tracks, surfaces; cell left edges match header left edges exactly — [B9-suite-header.png](phase0-redpen/B9-suite-header.png)
- B10: PASS — row buttons are Select, Save, End and nothing else — [B10-suite-buttons.png](phase0-redpen/B10-suite-buttons.png)
- B11: PASS — Select opens `/matrix/<sid>` in a new tab with the session window up; grid file count 19 → 19 — [B11-select-tab.png](phase0-redpen/B11-select-tab.png)
- B12: PASS — added a browser widget, reloaded the suite page, `last` moved 12:17:02 → 12:17:18 — [B12-last.png](phase0-redpen/B12-last.png)

Block C — beacon save (all green, console clean)
- C1: PASS — file opened through the browser's right-click, no options panel touched — [C1-file-open.png](phase0-redpen/C1-file-open.png)
- C2: PASS — immediate reload, file tab returns — [C2-after-reload.png](phase0-redpen/C2-after-reload.png)
- C3: PASS — widget dragged `{5,1}` → `{10,4}`, immediate reload, slot held — [C3-after-move-reload.png](phase0-redpen/C3-after-move-reload.png)

Block D — bus and mirror (six of seven fail; one root cause)
- D1: FAIL — widget added in tab one never appears in tab two. Both tabs report `MX.WINDOW_ID = w-mr62zhrk`. Break seen at **static/js/matrix/bus.js:47** — [D1-tab2-after-add.png](phase0-redpen/D1-tab2-after-add.png)
- D2: FAIL — move/resize in tab two; tab one has no such instance to follow. Same line — [D2-tab1-after-move.png](phase0-redpen/D2-tab1-after-move.png)
- D3: FAIL — not demonstrated: tab two never held the widget, so its removal proves nothing. Same line — [D3-tab2-after-close.png](phase0-redpen/D3-tab2-after-close.png)
- D4: FAIL — file opened in tab one's editor; tab two has no editor instance. Same line — [D4-tab2-editor.png](phase0-redpen/D4-tab2-editor.png)
- D5: FAIL — `emit("t", {}, {remote:true})` fired in tab one only (1 / 0). The frame *does* arrive at tab two's socket — the probe caught `{channel:"t", inst:"w-mr62zhrk"}` landing while tab two's own `MX.WINDOW_ID` is `w-mr62zhrk` — and is discarded at **static/js/matrix/bus.js:47** (`if (msg.inst === MX.WINDOW_ID) return;`), because the sender stamps the same value at **bus.js:40** and **static/js/matrix/grid.js:42-43** assigns the surface id into `WINDOW_ID`. Local emit behaved correctly (tab one only) — [D5-bus.png](phase0-redpen/D5-bus.png)
- D6: OBSERVED — two tabs, one session, two surfaces (`w-mr62zhrk`, `w-v50liydl`). Opening a file in surface one's editor left surface two's editor at `tabs=[]`, unchanged; surface two's widget list stayed `['editor']`; nothing else on surface two moved, redrew, or logged. No cross-surface leak seen — [D6-other-surface.png](phase0-redpen/D6-other-surface.png)
- D7: FAIL — layouts do not match after a burst (tab one 3 widgets, tab two 5). **No save loop**: with the burst's own four writes excluded, the busiest two-second window held 1 write to the grid route. The mismatch is the same mirror cause. A follow-on probe found something separate and worse: tab two wrote 4 widgets to the surface file, then tab one's reload fired `pagehide` → `save({beacon:true})` at **static/js/matrix/grid.js:574** and put the file back to 1 widget — tab one's stale snapshot overwrote tab two's newer one on disk — [D7-after-burst-reload.png](phase0-redpen/D7-after-burst-reload.png), [D7b-tab1-after-reload.png](phase0-redpen/D7b-tab1-after-reload.png)

CONSOLE
- One console error per page load, in every block: `GET /favicon.ico` 404. Nothing else. Dumps: [console-A.txt](phase0-redpen/console-A.txt), [console-B.txt](phase0-redpen/console-B.txt), [console-C.txt](phase0-redpen/console-C.txt), [console-D.txt](phase0-redpen/console-D.txt)

SURFACE LEDGER (fence arrived mid-run — read this first)
- Session under test: `85b19c53d41a`. Windows at start: 0. Windows at end: 0.
- Surfaces at start (6, all Brandon's): `w-5miaoy6v`, `w-88ebk2bl`, `w-8924kcue`, `w-fzsn00w1`, `w-ywzvtxv8`, `w-zvc46lwr`
- Surfaces at end: 20 — 5 of Brandon's plus 15 of mine.
- **The start set is NOT intact.** Step B7 ran before the fence reached me and closed `w-5miaoy6v` (2 widgets, written 2026-09-06). It is recoverable: the file is tracked in git at commit `b5fe4d9` as `library/grids/85b19c53d41a/w-5miaoy6v.json`. I have not restored it — that is your call.
- Every later B7 closed a surface my own harness made. Everything else I closed (B8) was mine.
- My 15 surfaces are still on disk and will show in your Surfaces list: `w-42vstyrx`, `w-4ergm1ot`, `w-bpuvceic`, `w-dwbi3zqo`, `w-gb5mwkd5`, `w-hi3ckedf`, `w-l1zb7pob`, `w-mr62zhrk`, `w-q7jmgm27`, `w-tcb1azwq`, `w-v8cr7vk2`, `w-wiwk1qxp`, `w-y81snqyf`, `w-za571yuv`, `w-zzl43bho`. Say the word and they go.

STRAY FILES
- none outside `Docs/Reports/phase0-redpen/` and `Docs/tests/phase0_redpen.py`

GOALS DONE
- Blocks A, B, C, D each run headed, every step carries PASS / FAIL / OBSERVED and a screenshot

BRANDON'S TODOS
- Decide whether `w-5miaoy6v` gets restored from `b5fe4d9`
- Decide whether my 15 test surfaces get swept

QUESTIONS FOR WHOEVER OWNS THE NEXT SPEC
1. Two tabs on the same surface are the same identity to the bus. What distinguishes "which surface am I showing" from "which tab am I" — two ids, or one id and a per-tab nonce on the frame? Whichever way it goes, `bus.js:40/47` and `grid.js:42` have to agree on it, and `_onLayoutMirror`'s `payload.surface !== MX.WINDOW_ID` gate (grid.js:129) reads the same value for a different purpose.
2. When two tabs hold one surface, which one's snapshot is the truth at `pagehide`? Right now the last tab to leave wins, and it can be the one that has been idle the longest.
3. `markDirty` (grid.js:107) is the only debounced path to `surface.widget`, and nothing in `static/js/` calls it. Is a widget supposed to announce its own internal changes yet, or is that phase 1?
4. "Add surface" from a template names the surface after the template; "New blank surface" names it `Surface N` where N counts every surface ever made for the session, so names skip and repeat. What do you want a surface to be called when it is born?
5. A blank `/matrix/<sid>` with no `?s=` leaves `MX.grid.sid` null until the panel's handler sets it (session-panel.js). Should the grid ever be bound-to-session-but-not-to-surface, or is that state worth removing?

CLOSER REVIEW
- Gets copy of review, not a contract.
- Restore or leave `w-5miaoy6v` — Brandon
- Sweep or keep the 15 test surfaces — Brandon

STEPPING BACK
Three of four blocks came back clean on the first honest run, and the fourth failed on one line. That ratio says the work is sound and the seam is young. The thing I would watch is not the bug — it is that the same word is doing two jobs. One identifier is being asked to mean "the layout I am showing" and "who I am," and the moment two people look at the same thing, those stop being the same question. That pattern shows up long before the code does: in filenames, in whose turn it is, in a shared document where everybody's cursor is named after the document. Whenever a system gets its second viewer, the first thing it needs is a way to say "us" that isn't the same as "me."
