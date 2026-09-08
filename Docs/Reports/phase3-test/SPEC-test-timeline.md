# SPEC-test-timeline — Sandbox Suite

## C2 — 2026-09-07

Box C2, Wave C. Session 9883b6bec3df, headed Chrome, viewport 1600x1000.
File under test: `static/js/widgets/adetools/timeline/timeline.js` (1387 lines).
Evidence: `Docs/Reports/phase3-test/c2/`.

### RENDER

Mounts clean. `applyTemplate` with one timeline at 12x12 gives a widget that
paints heads, ruler, rows and the head-actions block on the first roster +
feed round trip. Six lanes for six `trackRows`, six `.tl-row`s, 17 spans,
pips on every span that carries actions. No layout break at full width.
Screenshots: `test-01-baseline-full.png`, `test-01-baseline-widget.png`,
`test-02-lanes.png`.

### READ LINE — CONFIRMED OR REFUTED

- "reads both row types correctly" — CONFIRMED. `onFrame` puts `msg.tracks`
  into `tl.regions` and `msg.rows` into `tl.trackRows` (lines 1342-1343);
  lanes are built from `trackRows` and joined to regions by `r.track`
  (line 1024). Six rows in, six lanes out, region names on the two lanes
  that carry one.
- "Shared add form mounted at lines 1292-1293" — CONFIRMED, line numbers
  shifted by F-D. The two `MX.mountAddControls` calls are now at
  **lines 1299-1300**. Live markup captured (`test-log.txt`, HEAD ACTIONS
  HTML): mode `track` renders track-name input + root field + browse +
  "+ track"; mode `region` renders region-name input + root field + browse +
  a three-select model picker + "+ region".
- "Right-click on a track lane offers 'insert region preset' only" —
  CONFIRMED. Menu on a lane with no live region:
  `["＋ insert region preset ▸", "✕ delete track"]`. The
  "📋 insert region from …" item is conditional on `tl.settingsClip` and did
  not appear because nothing had been copied yet.
  `test-03-lanemenu-noregion.png`.
- "`isClaudeModel` matches four literal names, so cache toggles never show
  for a versioned model id" — CONFIRMED as written and worth being precise
  about. `CLAUDE_MODELS = ["opus","sonnet","haiku","fable"]` (line 264)
  is matched against `tr.track.model`, which is the **alias** the region was
  created with. A region created as `model: "sonnet"` DOES get the toggles
  (seen live). A region created with a dated id — `claude-sonnet-5`,
  `claude-opus-4-1-20250805` — would not. Note the lane's own sub-label
  already resolves to `claude-sonnet-5` (F-D's `modelSub`), so the widget
  displays a value its own gate would reject.
- "Ruler bar text collides with the zoom control at narrow widths" —
  CONFIRMED. At a 340px widget the `.ruler-pad` row wraps its three
  checkboxes and the refresh field, and the zoom control is clipped: only
  the "−" button survives at the right edge, the "%" label and "+" are cut
  off. `test-09-narrow-ruler.png`.

### CHECKLIST

| line | result | proof |
|---|---|---|
| lanes per track | SEEN | 6 `trackRows` → 6 `.tl-head` + 6 `.tl-row`. `test-log.txt` LANES. |
| spans per region | SEEN | 17 `.tl-span` across the rows, each `left`/`width` from turn start/end; `rname` layer on the wide ones (gfsf, gfsf2, b3claude). |
| pips | SEEN | Single pips (`?`, `·`) and clusters (`2`, `3`) with gradient backgrounds. gfsf's span: `["?","2","2","2","?"]`. |
| right-click menu items all present | SEEN | Lane, no region: `＋ insert region preset ▸`, `✕ delete track`. Lane with region: `⎘ copy region settings`, `💾 save preset`, `load preset ▸`, `reset with preset ▸`, `↺ reset region`, `✕ delete region`. Live region span: `✕ delete region`. `test-03/04.png`, `test-05b-live-spanmenu.png`. |
| inline rename of track | SEEN | Clicked `.th-name` on the c2 lane, `.th-input` appeared, typed + Enter, roster came back `["c2renamed"]`. `test-06-track-renamed.png`. |
| inline rename of region | SEEN | Same on `.th-reg`, roster came back `["c2regnamed"]`. `test-07-region-renamed.png`. |
| root browser | SEEN | Clicking `.th-root.th-edit` opens `.dv-rootmodal` with class `show`, title "Agent root", body listing `/Users/moth3rship/Desktop` and a Select button. `test-08b-rootbrowser.png`. |
| cache toggles on a claude region | SEEN | Mounted region `c2claude`, model `sonnet`, provider `claude`. Its lane carries `.tl-ttl` (5m / 1h, 1h active) and `.ade-exclude-dynamic` (`trim:off`). No other lane has them. `test-09-narrow-ruler.png`. |
| zoom persists | SEEN | 250% → click `+` → 313%, `localStorage.ade_tl_zoom = "3.125"`, `#tlRows` width 21971px. Full page reload: label reads 313% again. `test-10-after-reload.png`. |
| refresh timer | SEEN | Set `#tlRefreshMin` to 1 and dispatched change: `tl.refreshMin = 1`, `tl.refreshTimer` still truthy (`startRefreshTimer` cleared and re-set). Timer present at mount with the default 5. |

### CONSOLE

One `[console:error] Failed to load resource: … 404` per page load — the
page-level favicon on the shared-setup known list. No `pageerror`, no
timeline-originated errors, across both driver runs. The
`console.error("[timeline] invariant violated …")` at line 999 never fired.

### FIX LIST

Reported, not fixed. The first three are the target spec's "not in scope"
items.

1. **Ruler bar collides with the zoom control** (target spec, not in scope).
   `.ruler-pad` (line 28) is a fixed-height 28px flex row inside a 250px
   `#tlHeads`, holding three checkboxes, a number field and the zoom group.
   Below roughly 400px of widget width the zoom group is clipped away.
2. **`isClaudeModel` literal match** (target spec, not in scope). Line
   264-265, gates the two cache toggles at lines 1093-1094. Matches the
   four aliases only; any dated or provider-qualified id loses the toggles,
   including the very id the lane's own sub-label now displays.
3. **Slot overlap when the grid is full** (target spec, not in scope).
   `grid.js:232`, already on the shared known list. Not re-derived here.
4. **`sub` is blank for a lane whose region has ended.** Line 1034,
   `sub: reg ? modelSub(tl, reg) : ""`. The "test" lane shows region name
   `b3claude` with no model line under it. Cosmetic, no action requested.
5. **`insert_region` with no model produces a region with `model: ""`.**
   `ade/frames.py:441` falls back to `""`; `ade/tracks.py:1141` stores it
   as-is. This matters for target item 3 — see the C2 build receipt.

### READS

- `Docs/Specs/SPEC-phase4-test-waves.md:1-45` (Shared setup), `:155-172` (C2)
- `Docs/Specs/SPEC-phase4-timeline-target.md` (full)
- `Docs/Reports/RECEIPT-phase4-B1.md` (full), `RECEIPT-phase4-F-D.md` (full)
- `static/js/widgets/adetools/timeline/timeline.js` (full, 1387 lines)
- `static/js/widgets/shared/add-controls.js` (grep, modes track/region/both)
- `static/js/widgets/shared/root-browser.js:69-90` (`.dv-rootmodal`)
- `static/js/matrix/widget-frame.js` (grep, `deliver`/`send`/`subscribe`)
- `static/js/matrix/grid.js` (grep, `applyTemplate`/`addWidget`/`frames`)
- `ade/frames.py:310-330` (`_do_create_track`), `:437-452` (`_do_insert_region`)
- `ade/tracks.py:1098-1165` (`create_track`, `_stamp_name`, `insert_region`)
- `Docs/tests/matrix_harness.py` (full, basis for the driver)

### BLOCKERS

None. Every checklist line was driven live.

One process note, not a defect: a region span carries its right-click menu
only when the span's region is still live (`isLive`, line 875). The first
`.tl-span` in the DOM belongs to an ended region, so a naive
"right-click the first span" probe returns an empty menu. The live-region
span was found by matching `.rname` against the roster.

### C2 BUILD RETEST — 2026-09-07, after the build

Built to `Docs/Specs/SPEC-phase4-timeline-target.md`, four hunks in
timeline.js. Retest driven headed on the same session. The target's Proof
section reproduced end to end: head actions is one "+ track" button with
zero inputs and zero selects; clicking it makes a lane named "untitled"
whose root line reads the session root; right-clicking that lane shows
`["＋ insert region", "＋ insert region preset ▸", "✕ delete track"]`;
clicking "＋ insert region" puts region "untitled.4" on the lane.

Every menu item that existed before the build still exists after it, on all
three menus. Console unchanged — one page-level favicon 404, no pageerrors.
All ten checklist lines above still hold; the only checklist-visible change
is that the lane menu on a container with no region now carries one extra
item.

Two things the retest showed that the target assumes away, carried into the
build receipt: the inserted region comes back with `model: ""` (the server
has no model default on that path), and a region that has never run draws no
span on its row, so it shows on the lane head only.

Build detail, gap, and the mounted/dropped list:
`Docs/Reports/RECEIPT-phase4-C2-build.md`.

## W4 — 2026-09-07

- Zoom group not clipped at narrow width (W3's fix): SEEN again
  post-restart. `.tl-zoom`'s right edge sits inside the widget frame's
  right edge at the mounted width. Full detail: RECEIPT-phase4-W4.md.
