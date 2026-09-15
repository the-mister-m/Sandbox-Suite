# SPEC — Phase 3.5 — R — Sonnet — Redpen

Written 2026-09-14. Runs four times, at seams: R1 after 1 and 1b; R2
after 4 and 5; R3 after 10; R4 after 12 and 13. Read-only. Reports,
never edits.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- You edit nothing but your own receipt.
- Cap 120K. Receipt at Docs/Reports/RECEIPT-phase3.5-R<n>.md. One
  line each to SESSIONLOG.md and INDEX.md.
- Loop guard: write the receipt header and the list of files you will
  read before reading. Each file once.

## Read

- The scope, sections 3, 4, 5.
- Each job's spec and receipt for the jobs this redpen covers.
- Every file those receipts' EDITS sections name, whole. Nothing else.

## Check, one line per item per job, PASS or FAIL with the line number

1. Comments are label, function, state only. Every comment in every
   edited file.
2. No module-level mutable state in a widget file.
3. Every contract name in scope section 3 the job touches is spelled
   as the scope spells it.
4. Every field the job added is under CONTRACT FIELDS ADDED.
5. The job edited only the files it owns per scope section 4.
6. Every stage is checked, or a handoff exists, or STUCK explains.
7. The word for a layer engine is `plugin` in code, comments, UI
   strings. No `kind`, `type`, `engine`, `adapter` for it.
8. Every `data-cc-` attribute used is in scope 3.1 or under CONTRACT
   FIELDS ADDED.
9. Nothing the canvas draws for itself (rulers, guides, chrome, master
   content) can reach the saved text: it sits under a host-node
   attribute or in the guides layer.
10. `node --check` ran and the receipt says so.
11. The job's headless test exists, ran, and the receipt names its
    result per line.
12. PICKS I MADE exists and each pick is a pick.
13. "Done when": for each line, does the code as written do it. Read
    the path, do not run it.

## Receipt shape

SESSION REVIEW header, then the thirteen lines per job, then FAILS
with the one-line fix each needs and which file, then a verdict:
GREEN, or FIX with the count and a total line estimate for the fix
agent. No suggestions past the fails.
