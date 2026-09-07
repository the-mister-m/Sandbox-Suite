# RECEIPT — Job 2, anchor_chat test pass

Phase 3 test pass. Harness run 2026-09-06 20:03:43 → 20:04:28, session `6ab8273846b3`.

Spec: [SPEC-test-anchor_chat.md](phase3-test/SPEC-test-anchor_chat.md)

## EDITS
- [Docs/Reports/phase3-test/SPEC-test-anchor_chat.md](phase3-test/SPEC-test-anchor_chat.md) — the spec
- [Docs/Reports/phase3-test/anchor_chat-full.png](phase3-test/anchor_chat-full.png) — harness output, overwrote the proof run
- [Docs/Reports/phase3-test/anchor_chat-widget.png](phase3-test/anchor_chat-widget.png) — harness output, overwrote the proof run
- [Docs/Reports/phase3-test/anchor_chat-console.txt](phase3-test/anchor_chat-console.txt) — harness output, overwrote the proof run
- This receipt
- One line each in INDEX.md and SESSIONLOG.md

No widget, server, or css file was touched. No commits.

## DECISIONS MADE
- Called the checklist items UNTESTABLE rather than guessing. The harness has no interaction flags — `--widget --session --hold --out` only — so Send, Stop, and re-anchor were never driven. Everything in the spec is render evidence or static comparison, and the spec says so.
- Did not bind a region or register a model to force a test. Both were out of scope.
- Traced the 404 by elimination — every `/static/...` reference in matrix.html resolves, matrix.html declares no favicon, and the widget issues no network call — and named `/favicon.ico` as the likely source without claiming it as confirmed.
- Listed the `out`/`status`/`meters` cross-talk finding even though it is not on my checklist, because it is the receive half of "binds to a region". Flagged it as needing Brandon's call, not as a fix to apply.

## READS BEYOND THE LIST
Taken to find the cause of the render bug and verify the frame contract. All grep hits or short `sed` windows, no full-file reads.

- `static/css/matrix.css` 95-115 — `.mx-host` rule, the actual cause of the collapsed transcript
- `static/js/matrix/grid.js` 282-298 — host element creation
- `static/js/matrix/widget-frame.js`, `static/js/matrix/registry.js` — grep, frame API and hooks
- `static/js/widgets/shared/turns.js` — grep, `MX.turns` exports
- `ade/frames.py` 570-620, `ade/web_io.py`, `engine/web_io.py`, `server.py` — grep, frame type strings
- `Docs/tests/matrix_harness.py --help`

## FOR THE CLOSER
- 9 fixes listed, smallest first. Fix 1 (`.mx-anchor-chat` never got a CSS rule) is the whole render failure.
- Fix 6 is a cross-widget contract change — Brandon's call, not a fix job's.
