SESSION REVIEW — Sandbox Suite — B3 — 2026-09-07 13:47-14:03 EDT

DRIVEN
- ledger — turn table with real usage: SEEN — b3claude2 (9f2051a42f39)
  turn 1, usage.out_tokens 1126, cost_usd 0.0966, duration_ms 24539.
- ledger — rollup chips: SEEN — Turns/Duration/Cost/Actions/Out/Read/Read
  Peak/Write 5m/Write 1h all populated with real numbers.
- ledger — per-agent totals: SEEN — "9 agents · peak 13,825" table, row
  matches totalsForMe for b3claude2.
- ledger — open a turn shows actions and transcript: SEEN — WRITE_FILE,
  READ_FILE, RUN_COMMAND sub-rows plus the rendered turn transcript below.
- ledger — columns hide and reorder: SEEN — "Out" column hidden via
  checkbox; "Cost $" dragged before "Model" via synthetic HTML5 DnD,
  header order changed and held.
- ledger — mx:open-ledger focuses a row: SEEN — dispatched event opened
  and flashed the b3claude2 row.
- transcript — lists live then retired: SEEN — live regions (gfsf,
  gemma4b2, sonnetb2) sorted above retired ones; b3claude2 moved from
  live to retired the moment it was killed.
- transcript — opening a retired cache renders turns: SEEN — full turn
  block (prompt, thinking, response) rendered for b3claude2, matching
  ledger's own transcript sub-panel for the same region.
- transcript — suite page toggle: NOT DRIVEN, per spec (needs /suite).

Full detail: Docs/Reports/phase3-test/SPEC-test-ledger.md (Phase 3 Job 5
findings preserved, B3 retest appended below them),
Docs/Reports/phase3-test/SPEC-test-transcript.md.

REGIONS MOUNTED AND DROPPED
- e5a59014886c "b3gemma4" — insert_region on track 5a031370bf1c, model
  gemma4:e4b-it-q8_0, provider ollama. Idled, never given a turn. Dropped
  via kill_track.
- 38b6279c67cc "b3claude" — insert_region on track 5a031370bf1c, model
  sonnet, provider claude. First turn attempt: my own gate-watch loop
  matched an unrelated pre-existing turn record in the feed and broke
  early after only the write_file gate was approved; I killed this
  region before the read/rm legs fired (driver bug, not a widget bug —
  see FIX LIST). Dropped via kill_track.
- 9f2051a42f39 "b3claude2" — insert_region on track 5a031370bf1c, model
  sonnet, provider claude, mounted to redo the turn correctly. Ran one
  full turn: wrote b3test.txt, read it back, removed it with `rm` — all
  three gates (write_file, read_file, run_command) approved via
  {type:"gate_action", action:"approve"} off gate_broadcast frames
  scoped to this region id. Turn completed with usage (confirmed in
  archives/9883b6bec3df/log.jsonl and .../9f2051a42f39.jsonl). Dropped
  via kill_track after the ledger checks, to create the retired-chat
  case for transcript.
- Pre-existing region gfsf (32f1ec929f4a) left untouched throughout.
- B2's regions (gemma4b2, sonnetb2, etc.) observed live/retired in the
  shared transcript list but not touched by me.

GATE
- b3claude turn (aborted by my own driver bug): write_file b3test.txt
  gate fired and approved; turn was still running (no read/rm gates had
  fired yet) when I sent kill_track. No file was left behind — confirmed
  no b3test.txt on disk afterward, and the incomplete region's turn
  record carries no usage (never completed).
- b3claude2 turn (clean run): write_file b3test.txt, read_file
  b3test.txt, run_command "rm b3test.txt" — all three fired in order,
  each approved within ~2s of appearing. Confirmed in
  archives/9883b6bec3df/9f2051a42f39.jsonl: write_file wrote 9 chars,
  read_file returned it, run_command exited 0 with no output. b3test.txt
  confirmed absent from the project root afterward. Turn ended stop_reason
  "stop" with a full usage/cost record.

CONSOLE
One pre-existing 404 (page-level favicon, shared-setup known list) on
every page load across all three driver runs. No new console errors, no
pageerrors.

FIX LIST
- No widget bugs found in ledger.js or transcript.js this pass.
- Driver-side only, not a product bug: my first gate-watch loop checked
  "any feed record with kind=turn and usage" instead of scoping the
  check to the region under test, so it matched a pre-existing turn
  record from an earlier receipt's history and broke out of the approval
  loop after one gate. Caught and redone cleanly on b3claude2 (see
  REGIONS section) — noting so nobody mistakes the b3claude region's
  half-run turn for a ledger/gate defect.

STRAY FILES
- Docs/Reports/phase3-test/b3/*.png, *-console*.txt, *-frames-*.{txt,jsonl},
  *.json — this box's screenshots, console dumps, captured frames, and
  state dumps.
- Corrected my own mistake: SPEC-test-ledger.md pre-existed from Phase 3
  Job 5 (rows-vs-tracks loose end, full css/behavior fix list). I
  overwrote it without reading first on my initial write; caught it via
  git diff, restored the original content from git, and appended my B3
  retest as a new dated section below it rather than losing it. Flagging
  for the Closer in case the diff needs a second look.

READS
- Docs/Specs/SPEC-phase4-test-waves.md (Shared setup, B3)
- Docs/Reports/RECEIPT-phase4-S1-rerun.md, RECEIPT-phase4-B1.md (full)
- static/js/widgets/ledger/ledger.js (full, 815 lines)
- static/js/widgets/transcript/transcript.js (full, 205 lines)
- Docs/tests/matrix_harness.py (full, basis for driver scripts)
- Docs/HOWTO-frames.md (full, client-to-server and server-to-client tables)
- static/js/matrix/grid.js:180-235 (applyTemplate, instances, windowId)
- static/js/matrix/widget-frame.js:1-110 (send/subscribe/deliver/setOption)
- static/js/matrix/socket.js:1-70 (onFrame/send)
- archives/9883b6bec3df/log.jsonl, .../9f2051a42f39.jsonl,
  .../38b6279c67cc.jsonl (ground truth, read repeatedly across three
  driver rounds)
- git show HEAD:Docs/Reports/phase3-test/SPEC-test-ledger.md (recovering
  the file I'd overwritten)

CLOSER REVIEW
- SPEC-test-ledger.md now carries both the Phase 3 Job 5 pass and the
  Phase 4 B3 retest in one file, oldest first — confirm that's the
  right shape versus splitting them, since every other box in this wave
  wrote a fresh single-pass file.
- b3claude's aborted turn (write_file only, killed mid-run) left no
  stray file and no bad data, but it is a half-finished turn record on
  disk under region 38b6279c67cc if anyone audits archives/ later.
