# SPEC — Phase 2 — 2H — Opus — headed test, phase gate

Written 2026-09-12. Headed Playwright against the running suite. Cap
120K. PASS or FAIL per line with a screenshot. One-line fixes are
fixed and rerun; anything bigger is a FAIL with file:line.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Never touch MEMORY.md or CLAUDE.md. Do not stop the server.
- Receipt: Docs/Reports/RECEIPT-phase2-2H.md. One line per test.
  FIXES section. Screenshots to Docs/Reports/phase2-headed/. One
  line each to SESSIONLOG.md and INDEX.md.
- Zero pageerrors is a test line.

## Read

- Docs/tests/phase1_headed.py — whole. Extend it as
  Docs/tests/phase2_headed.py.
- Docs/Reports/RECEIPT-phase2-2R-b.md — whole.
- Docs/Specs/Code Canvas port/SPEC-session-agent-phases1-3.md
  section 6, the phase 2 paragraph.

## Tests, in order

1. Mount Cards, pick target graph. Empty text shows.
2. Mount Force Graph, same target. It draws, settles inside 4
   seconds (poll the node positions), freeze stops movement.
3. Click viewer.html in Force Graph. Cards shows WHO viewer.html.
   Mermaid frame under Force Graph has at least one line starting
   with `viewer.html -->`.
4. Shift+click panel.js. Cards shows two tabs. Mermaid frame gains
   lines starting with `panel.js -->`.
5. Copy button. Read the clipboard through Playwright; it equals the
   frame's text content with markup stripped.
6. In Cards, search "score", name on. Click the hit. Force Graph's
   picked class is on score.js; Cards shows it.
7. Mount Editor, set followGraph on. Set Cards openInEditor on. Pick
   score.js in Force Graph. Editor opens
   fixtures/viewer/viewer/score.js at its span's first line.
8. Mount Stack Graph and Files Graph, same target. Pick data.js in
   Stack Graph. Force Graph, Files Graph, Cards all show it picked.
9. Files Graph: flip local. Corner reads `everything`. Click
   viewer/. Corner reads `everything / viewer/`. Breadcrumb home
   returns.
10. Change guesses to off in Cards' options. Every drawn widget
    redraws (edge count drops or stays; assert no error and the
    filters option mirrored into each widget's getOptions).
11. Reload. All four widgets return with target, selection, camera,
    Files Graph's view and trail.
12. Second tab on the surface: pick in one, the other's Cards
    follows.
13. Zero pageerrors.

## Done when

- Every line PASS or FAIL with a screenshot.
- Script at Docs/tests/phase2_headed.py.
- Receipt names any state left behind.
