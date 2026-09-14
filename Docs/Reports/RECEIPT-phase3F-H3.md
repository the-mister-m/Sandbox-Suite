# SESSION REVIEW — Sandbox Suite — Phase 3F job H3 — Tools panel, cross-instance saves, socket first bind

Timestamps: ask Brandon. Three runs on 2026-09-13, the last at 17:52–17:56.
Run 3 is the run of record; runs 1 and 2 were harness fixes, both overwritten.

## STAGES

- [x] Stage 1 — read and plan
- [x] Stage 2 — harness lines 1 to 5
- [x] Stage 3 — lines 6 to 7
- [x] Stage 4 — lines 8 to 10 and full run
- [x] Stage 5 — receipt

## EDITS

- [Docs/tests/phase3F_headed_tools.py](../tests/phase3F_headed_tools.py) — the H3 walk, built on phase3F_headed.py: two canvases, Tools and Targets pinned to A, layers drag through synthetic HTML5 drag events, eye, Group/Ungroup, two cross-instance save lines, ten fresh-context boots
- [Docs/Reports/phase3F-headed-tools/](phase3F-headed-tools/) — eleven screenshots, console.txt, results.json
- [Docs/scratchpad/phase3F-fixture-tools.html](../scratchpad/phase3F-fixture-tools.html) — copy of the plain fixture, driven by the walk, restored at teardown
- [Docs/scratchpad/phase3F-fixture-tools-2.html](../scratchpad/phase3F-fixture-tools-2.html) — copy of the second fixture, B's second tab, restored at teardown

## WALK RESULTS

Live DOM and `cv.source` both read on every line that names a mutation.

| line | verdict | evidence |
|---|---|---|
| 1 | PASS | gold dropped on red's top quarter: both documents read h1, p, **gold, red**, blue, green, span. Cmd-Z restores both. [01-drag-before.png](phase3F-headed-tools/01-drag-before.png) |
| 2 | PASS | gold on red's bottom quarter: both read h1, p, **red, gold**, blue, green, span. Cmd-Z restores both. [02-drag-after.png](phase3F-headed-tools/02-drag-after.png) |
| 3 | PASS | gold on the stage row's middle: both read h1, p, red, blue, green, span, **gold** — last child. Cmd-Z restores both. [03-drag-into.png](phase3F-headed-tools/03-drag-into.png) |
| 4 | PASS | eye on blue: live and source `display: none`, style attr `left: 200px; top: 140px; display: none;`. Second click: both `''`, style attr back to `left: 200px; top: 140px;` — empty, not `block`. Cmd-Z twice restores. [04-eye.png](phase3F-headed-tools/04-eye.png) |
| 5 | FAIL | the selection lands (`cv.selection=['path-0-2','path-0-3']`) but the panel does not re-render: head reads Group disabled, Ungroup disabled, `rows_lit=[]`. The walk's Group click is refused by a disabled button. After a forced re-render both buttons enable, `rows_lit=['path-0-2','path-0-3']`, and the rest of the line then works — see below. [05-group-ungroup.png](phase3F-headed-tools/05-group-ungroup.png) |
| 6 | PASS | B clean before (`dirty=False`); A's text edit reaches A's source and disk; B showed the new text in **0.01s** (limit 5s), `B_dirty=False`, status `'loaded'`. A's undo and resave put the file back, text gone from disk, 1359 bytes. [06-cross-instance-reopen.png](phase3F-headed-tools/06-cross-instance-reopen.png) |
| 7 | PASS | B's edit reaches B's source; after B switches to the second copy its record for the tools copy is `dirty=True`, 1331 bytes. A takes that exact text through `patchSource` set-full-source (A's source 1331 bytes, holds B's text) and saves. B's record goes `dirty=False`, same 1331 bytes. B switched back: text in live and source, `dirty=False`, status `'loaded'`. [07-cross-instance-dirty-clear.png](phase3F-headed-tools/07-cross-instance-dirty-clear.png) |
| 8 | MEASUREMENT | see below. [08-first-boot.png](phase3F-headed-tools/08-first-boot.png) |
| 9 | PASS | both canvases back, `mode='preview'` on each, three body children each, B keeps its two targets, Tools still pinned to A with A's path, Targets shows its row. [09-after-reload.png](phase3F-headed-tools/09-after-reload.png) |
| 10 | PASS | 0 errors, 0 warnings, 0 pageerrors over 20 console lines, all of them the harness's own. [10-final.png](phase3F-headed-tools/10-final.png) |

## LINE 5 — FILE AND FUNCTION

`static/js/widgets/codecanvas/tools/tools.js`, `fileSelect` (line 646):

    function fileSelect(tl, a, id, additive) {
      if (!additive) { tl.mirrors.select.emit({ ids: [id] }); return; }

A layers row click emits the selection and nothing re-renders the panel
locally. The canvas takes it — `cv.selection` holds both ids — but
`renderFileLayers` reads `a.selected()` once per render (line 690) and sets
`groupBtn.disabled = !chosen.length` at line 696, so the head keeps the
state it had when the panel last drew: both buttons disabled, no row lit.
The walk's Group click hits a disabled button and nothing happens.

Nothing else on the line is broken. Forcing a re-render (switch the Tools
section away and back) enables both buttons, lights both rows, and then:

- Group makes `grp_x7uar9`, the layers group row holds `['red box']` and
  `['blue box']`, and both documents read `h1, p, div(red box + blue box),
  green, gold, span`.
- Ungroup puts red and blue back, both documents.
- Cmd-Z twice restores the stage in live and source.

No console line accompanies the failure — it is silent.

## LINE 8 — SOCKET FIRST BIND

Ten fresh page loads in ten fresh browser contexts, each mounting one
Canvas and opening the tools copy.

- **Rebinds needed: 0 of 10.**
- Seconds from mount to file-ready: 0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
  0.03, 0.03, 0.03, 0.03.
- `MX.socket.state()` was `live` at mount on all ten; every one reached
  file-ready inside the 12s first window.

Run 1 of job H reported the first `MX.socket.bind` sitting at `"opening"`
until a second bind. That did not reproduce here in twenty-odd first binds
across three runs. The rebind fallback stays in the harness, unused.

## CONSOLE

[phase3F-headed-tools/console.txt](phase3F-headed-tools/console.txt) — 20
lines, all harness lines. Zero page console lines, zero warnings, zero
errors, zero pageerrors.

Run 2 of this job showed one pageerror, after the boots and around the
reload, not reproduced in run 3:

    [p1:pageerror] Cannot read properties of null (reading 'body')

Run 2 also ran with a tools copy the harness had emptied (see PICKS), so
the page was opening a 0-byte file at that point. Intermittent, unexplained,
recorded rather than chased. Job H2 logged the same line twice during its
own save-and-reload line, so it is not this harness's alone — see
[RECEIPT-phase3F-H2.md](RECEIPT-phase3F-H2.md).

## FIXTURES

Both copies made from the originals at harness start, driven, and written
back at teardown.

- `phase3F-fixture-tools.html` — run left 1331 bytes, wrote back 1186,
  `matches_before=True`, `data-od-id` count after restore 0
- `phase3F-fixture-tools-2.html` — run left 673 bytes, wrote back 673,
  `matches_before=True`, `data-od-id` count after restore 0

The originals `phase3F-fixture.html` and `phase3F-fixture-2.html` were read
once each per run and never written. Nothing named `-keys` was touched.

## TEARDOWN

`widgets left on the surface: []`; grid file
`library/grids/410ef20f1a9d/phase3F-headed-tools.json` removed, and one
grid file per boot context removed as each boot closed.

## PICKS I MADE

- Tools and Targets are **pinned** to canvas A by its instance id, not left
  on `"focused"`. With two canvases on the same path, follow mode hands the
  panel to whichever canvas loaded last; pinning is the only deterministic
  way to say "bound to A". Tools' `canvas` option pull its own `target`
  across on pin, so the pin is one option write.
- Canvas A opens the tools copy through the Targets widget's "+ Add".
  Canvas B, which Targets is not bound to, gets its `targets` and `target`
  through its own option writes, both copies in its list so line 7 has
  somewhere to switch.
- The layers drag is a synthetic `DragEvent` pair with a real `DataTransfer`:
  `dragstart` on the source row so the widget's own handler sets the id,
  then `dragover` and `drop` on the target row at the height fraction the
  line asks for. Chrome's native HTML5 drag is out of a driver's reach.
- The picker stub from the base harness is kept: the suite picker is native
  on this machine.
- Element order is compared as `tag.class|own text` lists read out of the
  live document and out of `patch.parse(source())`, and the baseline is the
  order read at load rather than a hardcoded list.
- Two harness bugs cost runs 1 and 2, both mine, both fixed: `set-text`
  carries `value` (not `text`) and `set-full-source` carries `source` (not
  `text`). The wrong field left A's source `undefined`, and the save that
  followed wrote a **0-byte file** over the tools copy. The copy was
  restored at teardown; the original was never at risk. The harness now
  checks the copy before the boots and re-copies if a run damaged it.
- Line 8 counts a rebind as needed when file-ready does not arrive within
  12s of the mount, and measures mount to file-ready.
- Line 5 gets one extra probe past its verdict: a forced re-render, so the
  receipt can say whether Group and Ungroup themselves work.

## CONTRACT FIELDS ADDED

None.

## BRANDON'S TODOS

- Rule line 5: `fileSelect` in tools.js emits the selection and the panel
  never re-renders, so Group and Ungroup stay disabled and no row lights
  after a layers click. Either `fileSelect` re-renders after the emit, or
  the head reads `a.selected()` when it is clicked.
- Run 1 of job H's socket first-bind stall did not reproduce: 0 rebinds in
  10 fresh contexts. Retire the note or leave it as run 1's record.
- A `set-full-source` patch whose `source` is undefined wipes the target
  file on the next save, silently. Harness misuse caused it here; whether
  the port should refuse the patch is Brandon's to rule.

## CLOSER REVIEW

- Gets copy of review, not a contract.
- Line 5 is the only failure. It is a Tools re-render, not group or
  ungroup — both work once the panel redraws — closer to log as one finding,
  not three.
- Rule blocks conflict, same as job H: the bypass-permissions system
  reminder says read and write through Bash; Brandon's rules and this job's
  brief say Read/Write/Edit for content and Bash only for grep,
  `node --check`, `cp` and the harness. I followed Brandon — Brandon.
- Runs 1 and 2 of this job overwrote nothing outside
  `Docs/Reports/phase3F-headed-tools/`; run 3's artifacts are what is there.

One line each appended to [SESSIONLOG.md](../../SESSIONLOG.md) and
[INDEX.md](../../INDEX.md).

---

# RERUN — Phase 3F job H3, after the fixes

## STAGES

- [x] Stage 1 — read receipt and harness
- [x] Stage 2 — harness edits: reversed drags on lines 1 to 3, line 5 forced re-render removed
- [x] Stage 3 — full run, ten lines plus ten boots
- [x] Stage 4 — receipt

One run, 2026-09-13. Artifacts in
[phase3F-headed-tools/rerun/](phase3F-headed-tools/rerun/) — run 3's folder is
left as it was.

## RERUN EDITS

- [Docs/tests/phase3F_headed_tools.py](../tests/phase3F_headed_tools.py) —
  `move_to` helper and a `drag_case` closure; lines 1 to 3 now run both drag
  directions; line 5's forced re-render probe removed
- [Docs/Reports/phase3F-headed-tools/rerun/](phase3F-headed-tools/rerun/) —
  fourteen screenshots, console.txt, results.json

## RERUN WALK RESULTS

Baseline stage order at load, live and source: `h1, p, red, blue, green,
gold, span`.

| line | verdict | evidence |
|---|---|---|
| 1 | FAIL | gold onto red's top quarter passes — both documents read h1, p, **gold, red**, blue, green, span, Cmd-Z restores. The reversed drag fails: red onto gold's top quarter should read blue, green, **red, gold**, span; both documents read blue, green, **gold, red**, span. Cmd-Z restores. [01a](phase3F-headed-tools/rerun/01a-gold-before-red.png) [01b](phase3F-headed-tools/rerun/01b-red-before-gold.png) |
| 2 | FAIL | gold onto red's bottom quarter passes — h1, p, **red, gold**, blue, green, span, Cmd-Z restores. The reversed drag fails: red onto gold's bottom quarter should read blue, green, **gold, red**, span; both documents read blue, green, gold, span, **red** — red went past span to last child. Cmd-Z restores. [02a](phase3F-headed-tools/rerun/02a-gold-after-red.png) [02b](phase3F-headed-tools/rerun/02b-red-after-gold.png) |
| 3 | PASS | both directions onto the stage row's middle land last child, live and source, Cmd-Z restores each: gold → red, blue, green, span, **gold**; red → blue, green, gold, span, **red**. [03a](phase3F-headed-tools/rerun/03a-gold-into.png) [03b](phase3F-headed-tools/rerun/03b-red-into.png) |
| 4 | PASS | eye on blue: live and source `display: none`, style attr `left: 200px; top: 140px; display: none;`. Second click: both `''`, style attr `left: 200px; top: 140px;`. Cmd-Z twice restores. [04-eye.png](phase3F-headed-tools/rerun/04-eye.png) |
| 5 | PASS | fixed. The layers click re-renders: head before Group reads Group enabled, Ungroup enabled, `rows_lit=['path-0-2','path-0-3']`. Group made `grp_0pr4ia`, rows under it `['red box']`, `['blue box']`, both documents read h1, p, div(red+blue), green, gold, span. Ungroup restores red, blue. Cmd-Z twice restores. No forced re-render was used. [05-group-ungroup.png](phase3F-headed-tools/rerun/05-group-ungroup.png) |
| 6 | PASS | B clean before (`dirty=False`); A's edit reached A's source and disk; B showed it in **0.00s** (limit 5s), `B_dirty=False`, status `'loaded'`. A's undo and resave put the file back, 1359 bytes. [06](phase3F-headed-tools/rerun/06-cross-instance-reopen.png) |
| 7 | PASS | B's held record for the tools copy reads `dirty=True`, 1331 bytes. A took that text through set-full-source carrying `source` — A's source 1331 bytes, holds B's text — and saved. B's record went `dirty=False`, same 1331 bytes; B switched back with the text in live and source, `dirty=False`, status `'loaded'`. No file wipe, no warning. [07](phase3F-headed-tools/rerun/07-cross-instance-dirty-clear.png) |
| 8 | MEASUREMENT | see below. [08-first-boot.png](phase3F-headed-tools/rerun/08-first-boot.png) |
| 9 | PASS | both canvases back, `mode='preview'`, three body children each, B keeps its two targets, Tools still pinned to A, Targets shows its row. Zero pageerrors across the reload. [09](phase3F-headed-tools/rerun/09-after-reload.png) |
| 10 | PASS | 0 errors, 0 warnings, 0 pageerrors over 24 console lines, all of them the harness's own. [10-final.png](phase3F-headed-tools/rerun/10-final.png) |

## RERUN LINES 1 AND 2 — THE REMAINING OFF-BY-ONE

Widget: Tools, layers panel drag. The direction that was fixed is the one
that already worked; the reversed direction is still off by one, and by the
same one in both quarters.

Stage children, baseline indexes: h1 0, p 1, red 2, blue 3, green 4, gold 5,
span 6.

- Line 1, red (2) dropped on gold's (5) top quarter. Correct landing is index
  5 read before the drag, which is index 4 once red is lifted out. The port
  landed red at 5 — after gold.
- Line 2, red (2) dropped on gold's (5) bottom quarter. Correct landing is 6
  before the drag, 5 after the lift. The port landed red at 6 — after span,
  last child.

Both read the same in the live document and in `patch.parse(source())`, so
the index reaches the source patch, not just the iframe. The insert index is
not compensated for the dragged element's own removal when that element sits
before its target. Dropping onto the stage row (line 3) is unaffected in
both directions.

Console line accompanying the failure: **none.** Zero page console lines in
the whole run — the walk's twenty-four lines are all harness lines. The
failure is silent.

## RERUN LINE 8 — SOCKET FIRST BIND

Ten fresh page loads in ten fresh browser contexts, each mounting one Canvas
and opening the tools copy.

- **Rebinds needed: 0 of 10.**
- Seconds from mount to file-ready: 0.03, 0.04, 0.03, 0.05, 0.03, 0.04,
  0.04, 0.04, 0.03, 0.04.
- `MX.socket.state()` was `live` at mount on all ten, and `live` at the end
  of all ten; every one reached file-ready inside the 12s first window.

## RERUN CONSOLE

[phase3F-headed-tools/rerun/console.txt](phase3F-headed-tools/rerun/console.txt)
— 24 lines, all harness lines. Zero page console lines, zero warnings, zero
errors, zero pageerrors. The reload pageerror seen in run 2 did not appear.

## RERUN FIXTURES

- `phase3F-fixture-tools.html` — held 1186 bytes before the run, run left
  1331, wrote back 1186, `matches_before=True`, `data-od-id` count after
  restore 0
- `phase3F-fixture-tools-2.html` — held 673, run left 673, wrote back 673,
  `matches_before=True`, `data-od-id` count 0

`phase3F-fixture.html` and `phase3F-fixture-2.html` were read once each and
never written. Nothing named `-keys` was touched.

## RERUN TEARDOWN

`widgets left on the surface: []`; grid file
`library/grids/410ef20f1a9d/phase3F-headed-tools.json` removed, and one grid
file per boot context removed as each boot closed.

## RERUN PICKS I MADE

- Output went to `phase3F-headed-tools/rerun/` rather than over run 3's
  folder, so the first run's evidence survives next to this one.
- Lines 1 to 3 each run two drags now, source and target read fresh from the
  panel before each drag; the line passes only if both directions pass, and
  each drag is undone before the next begins.
- Line 3 got the reversed direction too, for symmetry with 1 and 2. It was
  not asked for and it passed.
- Expected orders are computed from the baseline read at load, with one
  helper that accounts for the dragged child's own removal — so the harness
  itself is not carrying the bug it is measuring.

## RERUN BRANDON'S TODOS

- Layers drag is still off by one when the dragged row sits **before** its
  target: red onto gold's top quarter lands after gold, red onto gold's
  bottom quarter lands after span. Lines 1 and 2. Silent, both documents.
- Line 5, run 1's socket stall, and the set-full-source wipe are all closed:
  the panel re-renders on a layers click, 0 rebinds in 10 fresh contexts, and
  a set-full-source carrying `source` round-trips clean.

## RERUN CLOSER REVIEW

- Gets copy of review, not a contract.
- Lines 1 and 2 are one finding, not two: one drop-index rule, one direction,
  both quarters.
- Rule blocks conflict, same as the first run: the bypass-permissions system
  reminder says read and write through Bash; Brandon's rules and this job's
  brief say Read/Write/Edit for content, Bash for grep, `node --check`, `cp`
  and the harness. I followed Brandon — Brandon.
- No code was fixed. No file outside the four owned paths was written.

One line each appended to [SESSIONLOG.md](../../SESSIONLOG.md) and
[INDEX.md](../../INDEX.md).

# RERUN 2 — Phase 3F job H3, after the move-index fix

## STAGES

- [x] Stage 1 — read the RERUN section and the harness; no harness edit needed
- [x] Stage 2 — full run, ten lines plus ten boots, 2026-09-13 18:07 to 18:08
- [x] Stage 3 — receipt

One run, 2026-09-13. Artifacts in
[phase3F-headed-tools/rerun2/](phase3F-headed-tools/rerun2/) — the `rerun/`
and top-level folders are left as they were.

## RERUN 2 EDITS

- [Docs/Reports/phase3F-headed-tools/rerun2/](phase3F-headed-tools/rerun2/) —
  fourteen screenshots, console.txt, results.json, run.log
- The harness was **not** changed. The output folder is a `--out` argument,
  so nothing in it needed a new wait or a new name.

## RERUN 2 WALK RESULTS

Baseline stage order at load, live and source: `h1, p, red, blue, green,
gold, span` — same as the rerun. Every line reads both the live document and
`patch.parse(source())`.

| line | verdict | evidence |
|---|---|---|
| 1 | PASS | fixed. Both directions land right before the target, live and source, Cmd-Z restores each. gold → h1, p, **gold, red**, blue, green, span. red → blue, green, **red, gold**, span — the drag the rerun failed. [01a](phase3F-headed-tools/rerun2/01a-gold-before-red.png) [01b](phase3F-headed-tools/rerun2/01b-red-before-gold.png) |
| 2 | PASS | fixed. Both directions land right after the target, live and source, Cmd-Z restores each. gold → h1, p, **red, gold**, blue, green, span. red → blue, green, **gold, red**, span — the drag the rerun failed. [02a](phase3F-headed-tools/rerun2/02a-gold-after-red.png) [02b](phase3F-headed-tools/rerun2/02b-red-after-gold.png) |
| 3 | PASS | both directions onto the stage row's middle land last child, live and source, Cmd-Z restores each: gold → red, blue, green, span, **gold**; red → blue, green, gold, span, **red**. Unchanged by the fix. [03a](phase3F-headed-tools/rerun2/03a-gold-into.png) [03b](phase3F-headed-tools/rerun2/03b-red-into.png) |
| 4 | PASS | eye on blue: live and source `display: none`, style attr `left: 200px; top: 140px; display: none;`. Second click: both `''`, style attr `left: 200px; top: 140px;`. Cmd-Z twice restores. [04-eye.png](phase3F-headed-tools/rerun2/04-eye.png) |
| 5 | PASS | head before Group reads Group enabled, Ungroup enabled, `rows_lit=['path-0-2','path-0-3']`. Group made `grp_fkscya`, rows under it `['red box']`, `['blue box']`, both documents read h1, p, div(red+blue), green, gold, span. Ungroup restores red, blue. Cmd-Z twice restores. [05-group-ungroup.png](phase3F-headed-tools/rerun2/05-group-ungroup.png) |
| 6 | PASS | B clean before (`dirty=False`); A's edit reached A's source and disk; B showed it in **0.00s** (limit 5s), `B_dirty=False`, status `'loaded'`. A's undo and resave put the file back, 1359 bytes. [06](phase3F-headed-tools/rerun2/06-cross-instance-reopen.png) |
| 7 | PASS | B's held record for the tools copy reads `dirty=True`, 1331 bytes. A took that text through set-full-source carrying `source` — A's source 1331 bytes, holds B's text — and saved. B's record went `dirty=False`, same 1331 bytes; B switched back with the text in live and source, `dirty=False`, status `'loaded'`. No file wipe, no warning. [07](phase3F-headed-tools/rerun2/07-cross-instance-dirty-clear.png) |
| 8 | MEASUREMENT | see below. [08-first-boot.png](phase3F-headed-tools/rerun2/08-first-boot.png) |
| 9 | PASS | both canvases back, `mode='preview'`, three body children each, B keeps its two targets, Tools still pinned to A, Targets shows its row. Zero pageerrors across the reload. [09](phase3F-headed-tools/rerun2/09-after-reload.png) |
| 10 | PASS | 0 errors, 0 warnings, 0 pageerrors over 24 console lines, all of them the harness's own. [10-final.png](phase3F-headed-tools/rerun2/10-final.png) |

## RERUN 2 LINES 1 AND 2 — THE OFF-BY-ONE IS CLOSED

Widget: Tools, layers panel drag. The direction the rerun failed — the
dragged row sitting **before** its target — lands right in both quarters now.

Stage children, baseline indexes: h1 0, p 1, red 2, blue 3, green 4, gold 5,
span 6.

- Line 1, red (2) dropped on gold's (5) top quarter. Landed at index 4 with
  red lifted out — `blue, green, red, gold, span`. The rerun landed it after
  gold.
- Line 2, red (2) dropped on gold's (5) bottom quarter. Landed at index 5
  with red lifted out — `blue, green, gold, red, span`. The rerun landed it
  after span, last child.

Both read the same live and in `patch.parse(source())`, and one Cmd-Z put the
baseline back each time. The reverse direction (gold onto red) still lands
where it did, so the fix did not trade one direction for the other. Dropping
onto the stage row, line 3, is unchanged in both directions.

## RERUN 2 LINE 8 — SOCKET FIRST BIND

Ten fresh page loads in ten fresh browser contexts, each mounting one Canvas
and opening the tools copy.

- **Rebinds needed: 0 of 10.**
- Seconds from mount to file-ready: 0.04, 0.03, 0.04, 0.03, 0.03, 0.03,
  0.03, 0.03, 0.03, 0.03.
- `MX.socket.state()` was `live` at mount on all ten, and `live` at the end
  of all ten; every one reached file-ready inside the 12s first window.

## RERUN 2 CONSOLE

[phase3F-headed-tools/rerun2/console.txt](phase3F-headed-tools/rerun2/console.txt)
— 24 lines, all harness lines. Zero page console lines, zero warnings, zero
errors, zero pageerrors. `results.json` carries `findings: []`.

Nothing was unclean, so there is no verbatim console line to quote.

## RERUN 2 FIXTURES

- `phase3F-fixture-tools.html` — held 1186 bytes before the run, run left
  1331, wrote back 1186, `matches_before=True`, `data-od-id` count after
  restore 0
- `phase3F-fixture-tools-2.html` — held 673, run left 673, wrote back 673,
  `matches_before=True`, `data-od-id` count 0

`phase3F-fixture.html` and `phase3F-fixture-2.html` were read once each and
never written. Nothing named `-keys` was touched.

## RERUN 2 TEARDOWN

`widgets left on the surface: []`; grid file
`library/grids/410ef20f1a9d/phase3F-headed-tools.json` removed, and one grid
file per boot context removed as each boot closed. No `phase3F` grid file is
left in that session folder.

## RERUN 2 STRAY FILES

- [phase3F-headed-tools/rerun2/run.log](phase3F-headed-tools/rerun2/run.log)
  — the run's stdout, kept next to the evidence.

## RERUN 2 PICKS I MADE

- Output went to `phase3F-headed-tools/rerun2/` so the rerun's evidence sits
  beside this one; the `--out` argument carried it, no harness edit.
- The run was backgrounded to a log file and waited on, never piped through
  `head`.

## RERUN 2 BRANDON'S TODOS

- None open from this walk. Ten lines, ten PASS plus the line 8 measurement,
  zero findings, console clean.

## RERUN 2 CLOSER REVIEW

- Gets copy of review, not a contract.
- The move-index fix closed the rerun's one finding. Lines 1 and 2 pass in
  both directions; line 3 did not regress.
- Rule blocks conflict, same as both earlier runs: the bypass-permissions
  system reminder says read and write through Bash; Brandon's rules and this
  job's brief say Read/Write/Edit for content, Bash for grep, `cp` and the
  harness. I followed Brandon — Brandon.
- No code was fixed. Nothing outside the owned paths was written.

One line each appended to [SESSIONLOG.md](../../SESSIONLOG.md) and
[INDEX.md](../../INDEX.md).
