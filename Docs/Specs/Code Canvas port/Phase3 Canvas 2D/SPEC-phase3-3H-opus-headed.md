# SPEC — Phase 3 — 3H — Opus — headed test, phase gate

Written 2026-09-12. Headed Playwright against the running suite. Cap
120K. PASS or FAIL per line with a screenshot. One-line fixes are
fixed and rerun; anything bigger is a FAIL with file:line.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Never touch MEMORY.md or CLAUDE.md. Do not stop the server.
- Receipt: Docs/Reports/RECEIPT-phase3-3H.md. One line per test.
  FIXES section. Screenshots to Docs/Reports/phase3-headed/. One
  line each to SESSIONLOG.md and INDEX.md.
- Zero pageerrors is a test line.

## Read

- Docs/tests/phase2_headed.py — whole. Extend as
  Docs/tests/phase3_headed.py.
- Docs/Reports/RECEIPT-phase3-3R-3E.md — whole.
- Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
  section 6, the phase 3 paragraph.
- Code Canvas app/tests/ — list it; pick one JSON doc as the fixture
  and copy it into the workspace root as docs/scratchpad/fixture.json.

## Tests, in order

1. Mount Canvas, target the fixture. It draws inside the iframe.
2. Mount Tools beside it, `canvas` focused. Click a widget in the
   canvas: Tools shows fields.
3. Drag the widget 40px right, release. Tools' box x field changes.
   Status shows dirty. cmd-s. Status shows saved. Read the file: the
   box changed.
4. Type a new text value in Tools. After 600ms the canvas shows it.
5. Layers: drag the last widget to the top. The canvas's DOM order
   changes.
6. Library: drag a card into the canvas. A new widget appears.
7. Marquee two widgets, arrow right, both move. cmd-z, both return.
8. Second Canvas, a second fixture copy as target. Click in each:
   Tools follows. Set Tools `canvas` to the first's id, click the
   second: Tools stays.
9. Mount Code, focused. Click a widget: Code scrolls to its header.
   Unlock, change a css line, Apply: that widget's element changed,
   another widget's element is the same node as before.
10. Code doc view with docEditable on: edit one box value, Apply, the
    canvas moves it.
11. Export from Canvas. The HTML file exists next to the doc with the
    back-link meta.
12. Open that HTML as a third Canvas: file mode, bar reads `from
    <doc>`. Drag a heading, save. Reopen: the transform is in the
    source. Code's Source view shows it.
13. Double-click a paragraph, type, Enter: source changed.
14. Annotate on. Draw a box, send with `none`, then `raster`, then
    `playwright` (or 501 noted). PNGs exist; the track has user turns.
15. Preview mode: chrome hidden, nothing moves, no errors.
16. Reload: every widget returns with its options.
17. Close an unrelated widget: both canvases keep state.
18. Zero pageerrors.

## Done when

- Every line PASS or FAIL with a screenshot.
- Script at Docs/tests/phase3_headed.py.
- Receipt names any state left behind, including the fixture copies.
