# SPEC E14 — retire the old pages — Sandbox Suite

Model: sonnet. Wave 6. Receipt: Docs/Reports/RECEIPT-E14-retire.md, written
before 200K tokens.

## What this is

Remove the old ADE pages and their JavaScript once every port has
landed, and write the redpen checklist Brandon runs by hand.

## Read, in this order, nothing else

- Every RECEIPT-E5 through RECEIPT-E13 in Docs/Reports, the edits list
  of each, to know which widget folders exist.
- server.py lines 428 to 463 (page routes).
- Docs/Scope/SCOPE-sandbox-cleanup.md lines 69 to 94, the Phase 3 list
  the checklist is written against.

## Build

1. grep every folder under static/js/widgets for imports from
   static/js/ade. If any remain, stop and list them. Do not delete.
2. Delete static/js/ade, static/ade.html, static/ade-ledger.html,
   static/ade-retired.html, static/ade-arrange.html, and the four page
   routes in server.py.
3. Do not delete static/css/ade.css. Widgets copied its rules by class
   name and some may still link it. grep static for ade.css and list
   every reference in the receipt.
4. Write Docs/Reports/CHECKLIST-phase3-redpen.md: one line per user
   function from the cleanup scope's Phase 3 list plus one per widget
   acceptance section in E5 through E13, each a checkbox Brandon ticks.

## Do not

- Do not touch any widget.
- Do not delete arrange.js, region.js, or cables.js. Move those three to
  Docs/audit/arrange-old/ so Phase 4 has them.

## Acceptance

- The matrix page loads with no console error naming a deleted file.
- The four old routes return 404.

## Receipt

Files deleted, files moved, routes removed, ade.css references found.
