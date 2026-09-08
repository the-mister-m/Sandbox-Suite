# SCOPE — Phase 4 session agent — Sandbox Suite

Written 2026-09-07 by the Phase 3 test session agent (Fable) at Brandon's
request. This is the brief for the next session agent. Brandon watches
headed. Nothing runs without his go at each gate.

## Situation

Nineteen widgets under static/js/widgets/ were ported in Phase 3. None
has had its code tested. Fable read the whole widget tree, the matrix
framework, the frame tables, and the server senders. Findings and fixes
are in the three specs this scope names. Fix jobs run first, then test
jobs in waves.

## Rules for the session agent

- Recite the eight rules from ~/.claude/CLAUDE.md at start.
- Read list, nothing beyond it until a job names a file:
  this scope, SPEC-phase4-fixes-sonnet.md, SPEC-phase4-test-waves.md,
  SPEC-phase4-timeline-target.md, Docs/HOWTO-frames.md,
  Docs/tests/matrix_harness.py, Docs/Reports/RECEIPT-test-job1-setup.md.
- Every write asks. Every spawn asks. No fixes by the session agent.
- One receipt per box in Docs/Reports/, one line each in INDEX.md and
  SESSIONLOG.md per box, read right before edit, one Edit, retry once.
- Relay each receipt to Brandon as it lands, one screen, no restating.
- Comments in code are label, function, state only. "spine" is banned.
- Cap per subagent 150K. A paired box writes its first receipt before
  starting its second half.

## Server and session

- Server is up on 127.0.0.1:5000. Brandon runs it. Do not start, stop,
  or restart it.
- Driven session: Brandon gives the session id at the first gate. It
  carries one haiku region (cloud) and one gemma4 e4b region (local),
  at least one turn run, at least one gate record. If it does not, ask
  Brandon before Wave B, do not build it yourself.

## Model policy

- Agent definition: Goto, with model override.
- Sonnet is the standard for every box.
- Opus is suggested where a box carries mid or high risk on more than
  one line of its risk row: B4, C1, C2, D2. The specs say so per box.
- Before each wave the session agent stops, lists the wave's boxes with
  the suggested model, and asks Brandon to confirm or change each one.
  The answer is written into that wave's section of the spec before
  any spawn.

## Run order and gates

Sequential by default: one box at a time, one browser. Brandon can say
"run this wave in parallel" at the gate and the wave fans out, four
headed windows.

1. Gate 0: Brandon gives the session id. Confirm the driven session.
2. Fixes S1, S2, S3 from SPEC-phase4-fixes-sonnet.md, one at a time,
   harness after each, receipt, then the next.
3. Gate B: model confirm. Wave B boxes B1 to B4.
4. Gate C: model confirm. Wave C boxes C1 to C4.
5. Gate D: model confirm. Wave D boxes D1, D2, and D3 only if Brandon
   wants the chat number.
6. Session review in the receipt shape, then spawn the Closer.

## What the session agent does not do

- Does not edit widgets, server, css, or specs.
- Does not decide the timeline build shape. SPEC-phase4-timeline-target.md
  is the target; C2 builds to it and reports the gap.
- Does not touch MEMORY.md or CLAUDE.md. The Closer does.

## Links

- Fixes: ../Specs/SPEC-phase4-fixes-sonnet.md
- Tests: ../Specs/SPEC-phase4-test-waves.md
- Timeline target: ../Specs/SPEC-phase4-timeline-target.md
- Read findings: ../Reports/RECEIPT-phase4-read-and-specs.md
