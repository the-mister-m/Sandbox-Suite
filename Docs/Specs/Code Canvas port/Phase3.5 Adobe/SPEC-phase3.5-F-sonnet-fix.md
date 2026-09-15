# SPEC — Phase 3.5 — F — Sonnet — Fix

Written 2026-09-14. Runs once per redpen that says FIX, when the
session agent judges the fails above 4K of work. Fixes exactly the
FAILS list. Nothing else.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own only the files the redpen's FAILS section names.
- Cap 120K. Receipt Docs/Reports/RECEIPT-phase3.5-F<n>.md. One line
  each to SESSIONLOG.md and INDEX.md.
- Loop guard: the receipt lists every FAIL as an unchecked stage
  before you edit. One attempt per fail; a second failure is STUCK
  with the reason, and you move on.

## Read

- The redpen receipt. Its FAILS section is your stage list.
- The scope, section 3 lines the fails cite.
- The named files, at the cited lines plus 40 lines either side.
  Not whole.

## Stages

One per FAIL, in the redpen's order. After each: `node --check`, then
check the stage. When a fail's fix changes a headless test's
expectation, run that test and name the result.

## Done when

- Every FAIL is checked or STUCK.
- node --check clean on every edited file.
- The affected jobs' headless tests pass or the receipt names which
  line does not and why.
