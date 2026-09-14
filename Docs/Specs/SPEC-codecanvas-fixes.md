# SPEC — codecanvas fixes

Written 2026-09-13 by fable.2 (0e22457f582b) from Brandon's list. One sonnet
does both halves, A then B, and checks in with fable.2 when the receipt is on
disk.

## Files

- static/js/widgets/codecanvas/canvas/canvas.js
- static/js/widgets/codecanvas/tools/tools.js
- static/js/widgets/codecanvas/shared/render.js
- static/js/widgets/codecanvas/shared/annotate.js

No other files. Read all four before the first edit; they are ~50k tokens
together. Comments are label, function, state only. "spine" is a banned
word. No module-level state; everything lives on the instance record
(`cv`, `tl`, `st`).

## Half A — tools.js + annotate.js

### A1. File-mode inspector controls

Where: `renderInspector` in tools.js (~L875). Today every prop in
`STYLE_GROUPS` is a plain text field.

Add a `STYLE_CONTROL` table keyed by prop name:

- color picker + text field, both write: `color`, `backgroundColor`,
  `borderColor`
- select:
  - `display` — block, flex, grid, inline, inline-block, none
  - `textAlign` — left, center, right, justify
  - `fontWeight` — normal, bold, 100, 200, 300, 400, 500, 600, 700, 800, 900
  - `flexDirection` — row, column, row-reverse, column-reverse
  - `justifyContent` — flex-start, center, flex-end, space-between,
    space-around
  - `alignItems` — flex-start, center, flex-end, stretch, baseline
  - `borderStyle` — none, solid, dashed, dotted
- number + unit: `fontSize`, `lineHeight`, `letterSpacing`, `width`,
  `height`, `minHeight`, `gap`, `padding`, `paddingTop`, `paddingRight`,
  `paddingBottom`, `paddingLeft`, `margin`, `marginTop`, `marginRight`,
  `marginBottom`, `marginLeft`, `borderTopWidth`, `borderRightWidth`,
  `borderBottomWidth`, `borderLeftWidth`, `borderRadius`, `opacity`
- text, unchanged: `fontFamily`, `border`, `transform`

Number + unit: parse a leading number from the current value, keep the
trailing unit in a small select — px, %, em, rem, and blank for unitless.
If the current value does not parse (`normal`, `auto`, a keyword), fall
back to the plain text field for that prop.

Every control writes the same patch it does now:
`a.patchSource({ id, kind: "set-style", styles: { [prop]: value } })`.
Text and number inputs keep the 500ms `bindTyping` debounce; selects and
the color picker write on change. If the current value is not in a
select's list, add it as the first option so nothing is silently changed.

### A2. Sticky Layers header

In `ensureStyles`, tools.js:

```
.cc-panel-order-head { position: sticky; top: 0;
  background: var(--surface-1, #1b1b1b); z-index: 1; }
```

Covers both `renderLayers` (doc) and `renderFileLayers` (file).

### A3. Annotate track picker

Where: `MX.annotate` in annotate.js, bar build (~L109).

- Add `<select class="mxann-track">` to the annotate bar, before the note
  field. First option value `""`, label `none`. Remaining options from
  `frame._canvasState.trackNames`.
- On change: `frame.setOption("annotateTrack", select.value)`.
- Expose `refreshTracks()` on the returned object; it rebuilds the options
  and re-selects `frame.options.annotateTrack`.
- canvas.js `onFrame`: after setting `cv.trackNames` on `ade_init` /
  `track_list`, call `if (cv.ann && cv.ann.refreshTracks) cv.ann.refreshTracks()`.
- `send()` unchanged: empty track shows `no track` and sends nothing.

## Half B — canvas.js + render.js + tools.js (Layers only)

### B1. Links-live toggle

- Option `linksLive`, default `false`. Add to `MOD.defaults`, `onOption`,
  `getOptions`, and the `cv` record.
- Bar button `links` in `buildBar`, after `schematic`. Toggles the option,
  `mxcv-btn-on` while on, hidden when `cv.docMode !== "doc"` (handle in
  `renderBar`).
- render.js: `page(pageId, opts)` reads `opts.links`. `anchor(w, el)` wraps
  in `<a>` only when `opts.links` is true; pass the flag down. `redrawOnly`
  takes the same flag.
- canvas.js `redraw`: pass `links: cv.mode === "preview" || !!cv.linksLive`
  in the `render.page` opts.
- File mode: no change. It already cancels clicks outside preview.

### B2. Layers right-click opens the canvas menu

canvas.js:

- Extract the item lists from `openMenu` (doc, ~L474) and
  `onFileContextMenu` (file, ~L1608) into one function
  `menuItems(cv)` returning `[[label, fn], ...]` for the current
  `cv.selection` and `cv.docMode`. Both existing callers use it. The doc
  list's Lock label reads the first selected widget.
- Expose `menuItems: () => menuItems(cv)` on `frame._canvas`.

tools.js:

- In `renderLayers` and `renderFileLayers`, each row gets a `contextmenu`
  listener: `preventDefault`; if the row's id is not in `a.selected()`,
  select it the same way the row's click does; then open a menu.
- The menu is built in the parent document, `position: fixed` at
  `e.clientX / e.clientY`, one element per Tools instance on `tl.menu`.
  Inline rules match the canvas menu: white background, `1px solid #d0d0d0`,
  `0 2px 8px rgba(0,0,0,0.15)` shadow, `13px system-ui`, rows
  `padding: 4px 16px`.
- Rows come from `a.menuItems()`. A row click runs its fn and closes the
  menu. The menu closes on any `mousedown` outside it, on Esc, and in
  `unmount`.

## Addendum A1b — 2026-09-14, Brandon after seeing A1

`lineHeight` and `letterSpacing` fell to the text fallback because the
browser reports `normal` when nothing is set. That was the spec's mistake.

- In `styleControlFor` (tools.js), `lineHeight` and `letterSpacing` always
  get `numberUnitControl`. Treat `normal` as an empty number and blank unit
  — `parseNumUnit` returns `{ num: "", unit: "" }` for it instead of null.
- `border` and `transform` stay text. Both are compound values (three
  parts; an open list of functions). No single control fits.
- Update the receipt: one EDITS line for this change, one line under
  GOALS DONE. Add the missing INDEX.md line for the receipt and this spec.

## Held — not in this spec

- Group geometry. Brandon plays with it first.

## Acceptance

- Load a doc target and a file target. No console errors.
- Every existing key, gesture, and menu item behaves as before.
- A1: a color prop shows a picker; `display` shows a select; `padding`
  shows number + unit; `fontFamily` stays text.
- A2: the Group / Ungroup header stays put while the Layers tree scrolls.
- A3: the annotate bar shows a track select with `none` first; `none`
  sends nothing.
- B1: with `links` off, clicking a linked widget in canvas mode selects it
  and does not jump; in preview it jumps. With `links` on, it jumps in
  canvas mode too.
- B2: right-click on a Layers row opens the same items the canvas gives,
  in both modes.

## Receipt

Write `Docs/Reports/RECEIPT-codecanvas-fixes.md`, then add one line each to
`INDEX.md` and `SESSIONLOG.md`. Format:

```
SESSION REVIEW — Sandbox Suite / codecanvas fixes — [start–end timestamps]

(clickable links only — no code blocks, no restating)

EDITS
- [link] — [one-line label]

STRAY FILES
- [path] — [what it is]

GOALS DONE
- [goal]

BRANDON'S TODOS
- [todo]

CLOSER REVIEW
- Gets copy of review, not a contract.
- [action] — [who: Brandon / closer]
```

Then message fable.2 (0e22457f582b) with the receipt path.
