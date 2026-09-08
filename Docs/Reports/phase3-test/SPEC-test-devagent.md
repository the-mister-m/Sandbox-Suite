# SPEC-test-devagent

## 2026-09-07 — C1 (Phase 4 Wave C)

Session 9883b6bec3df, headed Chrome, two driver runs (16:09-16:13,
16:15-16:29 EDT). File under test:
static/js/widgets/agent/devagent/devagent.js plus
static/js/widgets/shared/settings-rows.js. S2 and S3 have run; F-D's
`modelDisplay` change is in. Screenshots in Docs/Reports/phase3-test/c1/.

### RENDER

Mounts clean at 12x12, no layout faults, no pageerror. Left column is the
tree: five tracks, carets, one region row under JHJKHKL, then the two add
forms (track name / root / browse / + track, and region name / root /
browse / model picker / + region). Right column: TRACK rung with root,
REGION rung with `claude / claude-sonnet-5 idle`, four tabs
(settings / context / gates / preset) with the active one boxed, then the
tab body. Settings draws 32 rows: track (3), harness (11), ollama (16)
auto-collapsed for a claude region, claude (18). Controls line up; nothing
overlaps. c1-01-mounted-widget.png, c1-20-settings-tab.png.

Two cosmetic notes, not on the checklist: the tree and the add forms are
one scroll column with the detail pane below, so on a 12-row slot the tabs
sit mid-widget rather than at the top; and the region add form's model
picker repaints to the first provider/model in the list (ollama / gemma4)
after every rebuild, so it never shows what you last picked
(c1-20-settings-tab.png, "+ region" row).

### READ LINE CONFIRMED OR REFUTED

- "reads both row types correctly" — CONFIRMED. Track rows drive the tree
  heads and the track (3) block; region rows drive the region rows, the
  rung head, and all three provider blocks.
- "every roster or status frame rebuilds the whole tree, remounting both
  add forms" — CONFIRMED, and worse than stated: `render()` also runs on
  every tab click and every caret click, because those handlers call
  `render`, not `renderDetail` (devagent.js:340, :262, :294). Nothing in
  the file ever calls `renderDetail` alone, so the comment at
  devagent.js:322-326 describes behavior that does not exist. Proof: typed
  "typed-then-tab" into the track-name field, clicked the context tab, read
  the field back empty (c1-drive.json, step `addform_survives_tab_click`).
- "refetching the model list" — REFUTED. One full real turn on a claude
  region produced 4 `track_status` frames, 4 `status` frames, 12 `out`
  frames and a `meters` frame — and **zero** fetches of any kind
  (c1-drive2.json, step `turn_done`, `fetch_total: 0`). devagent fetches
  /api/library/models once in `mount()`; every later model picker goes
  through `MX.mountModelPicker`, which caches rows in a module-level
  `_rows` (model-picker.js:14-22). The repeated mount-time fetches (8
  /api/library/models in the first ~2s, c1-phase1.json) are that cache
  filling under six concurrent mount fetches, not per-frame refetching.
- "`file` is subscribed and unused" — CONFIRMED by read; devagent.js:452
  subscribes it, `onFrame` has no branch, the comment at :532 says so.
- "context path is relative `injections/<kind>/<id>.md` through
  /api/fs/read" — CONFIRMED, and the base is the **server process CWD**,
  i.e. the project root. server.py:777 is `os.path.abspath(path)` with no
  session or workspace base. Probe: `/api/fs/read?path=injections/track/
  PROBE.md` returned 400 `not a file: /Users/moth3rship/Desktop/AI Design/
  Sandbox Suite/injections/track/PROBE.md`; the same call on the existing
  `injections/region/PLACEHOLDER.md` returned 200 with that same base.
  This does not match the save path — see FIX LIST item 2.
- "`gate_edges` arrives on socket open only, before the widget mounts;
  after S2 confirm whether the gates tab still reads 'no gate edges' on a
  late mount" — CONFIRMED, still broken. server.py:1754 sends
  `gate_edges` once per socket open; the roster reply (`track_list`,
  ade/frames.py:546) carries no edges. The gates tab of a late-mounted
  devagent reads "no gate edges" with a region selected, in both runs
  (c1-40-gates-no-edges.png). S2's roster frame did not fix this.
- "`mx:open-devagent` listener from E6b" — CONFIRMED present
  (devagent.js:398-408). Not driven; no other widget was mounted.

### CHECKLIST

- **tree lists tracks and regions** — SEEN. Five tracks, one region,
  correct parentage; a created track and region appeared in place.
  c1-10-tree.png, c1-15-tree-with-c1r2.png.
- **dot fill follows status** — SEEN. With c1r2 *unselected*, dots read
  `● gfsf / ○ c1r2` before the turn, `● gfsf / ● c1r2` at phase `waiting`,
  and `○ c1r2` again at idle. Phases seen: waiting → thinking → idle.
  c1-62-dot-busy-unselected.png, c1-63-after-turn.png.
- **add track from the tree** — SEEN. "c1track" → track 1581cba29472,
  "c1trk2" → 0dc9aec4cae4, both with the inherited root.
  c1-12-after-add-track.png.
- **add region from the tree** — SEEN. Picker set to claude / sonnet,
  "+ region" created c1sonnet (c07433b8915b) and c1r2 (82358b55e6f5) on
  the selected track. c1-13-region-form-filled.png,
  c1-14-after-add-region.png.
- **track fields save** — SEEN. `order` 5 → 9 through the track block's
  apply button; the roster came back with order 9. c1-70-track-field.png.
- **context loads** — PARTIAL. The box mounts, the path line is right, the
  fetch fires — but every context file in this session is missing, so all
  three reads returned 400 and the textareas render empty with
  `absPath: null`. Loading a file that *does* exist works (PLACEHOLDER
  probe, 200 + absolute path). c1-30-context-locked.png.
- **unlocks** — SEEN. unlock flips `readOnly` and swaps the button to save.
  c1-31-context-unlocked.png.
- **saves** — FAILED. Save of the region context returned
  `saved {ok:false, result:"[WRITE failed: parent directory does not
  exist: /Users/moth3rship/Desktop/injections/region ...]"}`. See FIX LIST
  item 2. c1-32-context-after-save.png.
- **settings tab rail params** — SEEN. 11 harness + 16 ollama + 18 claude
  rows, correct control per type, ollama collapsed by provider. Applying
  `max_tools` committed and reset the region (reset_on_change true), and
  devagent followed the `region_replaced` frame correctly.
  c1-20-settings-tab.png, c1-21-after-max-tools.png.
- **model picker** — SEEN. Reads claude / sonnet / claude-sonnet-5; the
  version select shows the resolved id, F-D's change holding.
  c1-22-model-row.png.
- **change_prompt choices** — SEEN, in the wrong place. Both a preset save
  and a preset load raised `change_prompt` with choices reset_region /
  rewrite_cache / cancel, and rewrite_cache carried the action through.
  The prompt draws only inside the **settings** tab body
  (settings-rows.js:343), so a prompt raised from the preset tab is
  invisible until you leave that tab. c1-52-change-prompt.png,
  c1-58-load-change-prompt.png.
- **gates tab apply** — SEEN, only after the edges were put back by hand.
  With the socket-open `gate_edges` frame replayed into the instance, the
  tab drew all 18 edge rows with hooks open / ask / queue / locked; setting
  write_file to `open` and clicking apply produced overlay
  `{edge: write_file, driver: model, scope: any, hook: open}` on the live
  region. c1-43-gates-picked.png, c1-44-gates-applied.png. Un-replayed,
  the tab is dead — see FIX LIST item 3.
- **preset load / rename / delete** — FAILED from the UI as shipped; SEEN
  once the list was injected. The select is always empty because devagent
  reads `d.names` while /api/library/presets returns `{"list": [...]}`
  (six presets on disk, widget state `presetNames: []`).
  c1-56-preset-empty-select.png. With the endpoint's `list` assigned onto
  `dev.presetNames` by the probe, every button worked end to end: load
  (change_prompt → rewrite_cache → `preset_name` set on the region),
  rename c1test → c1test2, delete c1test2 (gone from disk).
  c1-57-preset-list-injected.png, c1-59-after-preset-load.png,
  c1-81-preset-deleted.png.
- **preset save** — SEEN, unaffected by the list bug because it names the
  preset through `window.prompt`. `[preset saved: .../library/presets/
  c1test.json]`. c1-53-preset-after-save.png.

### CONSOLE

- Run 2: one 404, the page-level favicon on the known list. Nothing else.
- Run 1: the same 404 plus four 400s, all of them /api/fs/read on context
  files that do not exist (three widget loads, one probe of mine). No
  pageerror in either run.

### FIX LIST

1. **devagent.js:419 and settings-rows.js:426 read the wrong key.**
   `/api/library/presets` returns `{"list": [...]}` (server.py:1404);
   both call sites read `d.names`, so `presetNames` is permanently `[]`.
   Effects: the preset tab's select is always empty, so load, rename and
   delete cannot be reached at all; and `preset_name` in the harness block
   falls back to a free-text field instead of the dropdown CHOICES_LIVE
   promises (settings-rows.js:59-69). timeline.js:590 already handles both
   shapes — `Array.isArray(data.names) ? data.names : (data.list || [])`.
2. **Context read and write resolve against different bases.**
   /api/fs/read resolves the relative path against the server CWD, i.e.
   the project root (server.py:777). The `save` frame resolves it against
   the region's workspace root (/Users/moth3rship/Desktop). settings-rows.js:
   124 sends `box.absPath || box.path`, and `absPath` is only ever set by a
   *successful* read — so the first save of any context file that does not
   already exist goes out relative and lands in the wrong tree, where it
   fails on a missing parent directory. Every region and track context in
   this session is in that state. Either make save use the same base, or
   have /api/fs/read hand back the resolved path on a miss too.
3. **The gates tab has no way to get its edges.** `gate_edges` is sent
   once, at socket open (server.py:1754), before any widget mounts; the
   roster reply does not carry it and devagent never asks. Any devagent
   mounted after page load shows "no gate edges" forever, and the whole tab
   — including the overlay the region already has — is unreachable. The
   frame handler is correct; only the delivery is missing. Cheapest fix is
   an /api/policy-style endpoint or an edges field on the roster reply.
4. **Every render remounts both add forms.** `render()` is called by tab
   clicks, caret clicks and every roster or status frame, and `renderTree`
   rebuilds the tree from scratch each time. Anything typed into "track
   name" or "region name", and any model the picker has selected, is thrown
   away — including by a status frame from an unrelated region mid-typing.
   `renderDetail` exists for exactly this and is never called on its own
   (devagent.js:328, :340). The comment at devagent.js:322-326 claims the
   opposite of what the code does.
5. **An unset numeric setting commits as a string.**
   `controlKind(undefined)` returns "str" (settings-rows.js:83-88), so an
   empty `max_tools` — an `int` row (engine/settings.py:63) — draws as a
   text input and applies `"7"`. The server took it; the preset written
   from that region then failed its own type check on load:
   `[preset 'c1test'] preset 'c1test': 'max_tools' dropped — wrong type`.
   Every nullable numeric row has this shape.
6. Cosmetic, low: the region add form's model picker resets to the first
   provider in the list on every rebuild, so it shows ollama / gemma4 on a
   claude track; and `dev.contexts` keeps boxes for regions that have since
   been replaced (three boxes for two live rows after one reset). Neither
   breaks anything.

### GAP AGAINST SPEC-phase4-timeline-target.md ITEM 5

Item 5 wants devagent to stay "the one place with settings, context, gates,
presets, and every region and agent together", tree keeping both add forms,
both paths adding regions. Today: the tree, both add forms and both add
paths work (checklist above). Settings works. Of the other three, **none is
whole** — presets are half-reachable (save only, fix 1), context is
read-only in practice (fix 2), and gates is empty on every real mount
(fix 3). Item 5 needs fixes 1, 2 and 3 before devagent is the one place it
is supposed to be. Fix 4 is what makes the tree's add forms feel unreliable
while the session is live, which is the same complaint that put three add
forms on screen in the first place.

### READS

- Docs/Specs/SPEC-phase4-test-waves.md:1-41 (Shared setup), :132-154 (C1)
- Docs/Specs/SPEC-phase4-timeline-target.md (full)
- Docs/Reports/RECEIPT-phase4-B1.md, RECEIPT-phase4-B4.md:1-70,
  RECEIPT-phase4-F-D.md (full)
- Docs/tests/matrix_harness.py (full, basis for the drivers)
- static/js/widgets/agent/devagent/devagent.js (full, 536 lines)
- static/js/widgets/shared/settings-rows.js (full, 507 lines)
- static/js/widgets/shared/add-controls.js (full, 193 lines)
- static/js/widgets/shared/model-picker.js:10-59, :100-139
- static/js/widgets/adetools/timeline/timeline.js:585-595 (preset fetch,
  the shape devagent is missing)
- static/js/matrix/socket.js:1-70, static/js/matrix/widget-frame.js (grep),
  static/js/matrix/grid.js (grep — applyTemplate, instances, frames)
- server.py:775-788 (/api/fs/read), :1402-1449 (presets, models),
  :1740-1760 (socket open frames)
- ade/frames.py:334-365 (_park_change, _send_change_prompt), :540-575
  (roster), :637-660 (delete_track), :1030-1130 (edit_track,
  change_answer, load/save/rename/delete_preset)
- engine/settings.py:63 (max_tools row), :557-563 (list_presets), :598
- library/registry/widgets.json:13, library/presets/ (listing only)

### BLOCKERS

- No haiku region and no gemma4 region were mounted by this box; the one
  driven turn was claude/sonnet. The shared setup's gemma4 region gfsf was
  used only as an idle neighbour and never touched.
- No gate fired during the turn ("Reply with exactly: ok" needs no tool),
  so the gates tab was proven on the overlay write, not on a live ask.
- The gates tab and the preset list could only be exercised by putting
  state back by hand (a replayed `gate_edges` frame; the endpoint's `list`
  assigned onto `dev.presetNames`). Both injections are named where they
  are used above; everything after them was a real click.

## W4 — 2026-09-07

- Selected-row FG styles still hold after matrix.css's new `:root` block
  (W3's fix): SEEN. Clicked a real region row; `.mx-dev-selected` class
  present on the row after click. Full detail: RECEIPT-phase4-W4.md.
