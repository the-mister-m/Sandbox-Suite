# SPEC — Phase 3F — R — Sonnet — Redpen

Written 2026-09-13. Runs once per job, after its receipt lands: R-A,
R-B, R-C, R-D, R-E. Read-only. Reports, never edits.

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- You edit nothing but your own receipt. Not code, not the job's
  receipt, not the spec.
- Cap 120K. Receipt at Docs/Reports/RECEIPT-phase3F-R-<job>.md. One
  line each to SESSIONLOG.md and INDEX.md.

## Read

- Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md sections 3
  and 5.
- The job's spec and the job's receipt.
- Every file the receipt's EDITS section names, whole. Nothing else.

## Check, one line per item, PASS or FAIL with the line number

1. Comments are label, function, state only. No decision, no history,
   no "because". Every comment in every edited file.
2. No module-level mutable state in a widget file. State lives on the
   frame.
3. Every contract name in scope section 3 that the job touches is
   spelled as the scope spells it. Nothing renamed, nothing narrowed.
4. Every field the job added is named in the receipt under CONTRACT
   FIELDS ADDED.
5. The job edited only the files it owns per scope section 4.
6. Every stage in the receipt is checked, or a handoff exists.
7. No widget types, kit lookups or doc-mode calls added to a file-mode
   path.
8. Doc mode: no function that Phase 3 headed lines exercise was
   removed or re-signatured. Name any that changed.
9. `node --check` was run and says so in the receipt.
10. The receipt's PICKS I MADE section exists and each pick is a pick,
    not a ruling on Brandon's behalf.
11. The job's "Done when" list: for each line, does the code as written
    do it. Read the code path, do not run it.

## Receipt shape

SESSION REVIEW header, then the eleven lines, then FAILS with the fix
each needs in one line, then a verdict: GREEN, or FIX with the count.
No suggestions past the fails.
