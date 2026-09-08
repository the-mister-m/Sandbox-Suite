# SPEC-test-transcript — B3

## RENDER
b3-01-idle-both.png, b3-30-ledger-with-b3claude2.png (transcript pane
visible alongside ledger), b3-35-transcript-after-kill.png,
b3-36-retired-opened.png under Docs/Reports/phase3-test/b3/.

## READ LINE CONFIRMED OR REFUTED
CONFIRMED. `load()` fetches `/api/transcripts?sid=` on mount and again on
"refresh" click; `openCache()` fetches
`/api/retired-chats/<sid>/<rid>[?cache=]`. Both routes answered live
(confirmed by rendered rows/content, not just no-404). No frame
subscriptions — `mount()` never calls `frame.subscribe(...)`, confirmed
by reading the full file; the widget is fetch-only.

## CHECKLIST
- lists live then retired: SEEN — the region list sorts live regions
  first (`t.regions.sort((a,b)=>(b.live?1:0)-(a.live?1:0))`,
  transcript.js:139), confirmed visually in b3-30/35: gfsf, gemma4b2,
  sonnetb2 (all live, dot un-dimmed) listed above b3claude2 and the rest
  of the track's history (all retired, dimmed dot) once b3claude2 was
  killed.
- opening a cache renders turns: SEEN — b3-36-retired-opened.png, clicking
  the retired "b3claude2" row rendered its full turn history via
  `MX.turns._groupTurns`/`_buildTurnBlock`: the user prompt ("write a
  file named b3test.txt..."), the model's thinking block, and its text
  response, matching what ledger's own transcript sub-panel showed for
  the same region/turn.
- suite page transcripts toggle: NOT DRIVEN, per spec — needs `/suite`,
  not the harness.

## CONSOLE
One pre-existing 404 (page-level favicon, shared-setup known list) on
every load. No new console errors, no pageerrors.

## FIX LIST
None found.

## READS
- Docs/Specs/SPEC-phase4-test-waves.md (Shared setup, B3)
- static/js/widgets/transcript/transcript.js (full, 205 lines)
- static/js/widgets/ledger/ledger.js (full, 815 lines, for the shared
  turns.js rendering path used by both widgets)
- Docs/tests/matrix_harness.py (full, basis for driver scripts)
- Docs/HOWTO-frames.md (full)
- static/js/matrix/grid.js:180-235, widget-frame.js:1-110, socket.js:1-70

## BLOCKERS
None.
