SESSION REVIEW — Sandbox Suite / Phase 3F job C — patch kinds — 2026-09-13

EDITS
- static/js/widgets/codecanvas/shared/patch.js — applyToDoc split, five new kinds, inverses, normalize, newId, history

STRAY FILES
- Docs/tests/phase3F_patch.html — the stage 5 test page (in scope, spec-named path)

GOALS DONE
- applyToDoc(doc, patch) added, returns {ok, inverse}, handles all kinds but set-full-source
- apply(text, patch) now parse + applyToDoc + serialize, returns {text, inverse}
- five new kinds: wrap, unwrap, move, remove, insert, each with an inverse
- inverses added for the five original kinds
- normalize(text), newId(prefix), history() added and exported
- KINDS grew to ten entries; ALIAS untouched
- node --check clean on patch.js

BRANDON'S TODOS
- (none)

CLOSER REVIEW
- job D (canvas.js, after B and C green) must update patchSource to read apply's result as .text, not a bare string — flagged above under CONTRACT FIELDS ADDED
- stage 5's test page was written but never executed (no jsdom, no browser tool) — see STAGE 5 NOTE; job H's headed walk is the next real exercise of this code

STAGES
- [x] Stage 1 — read and plan
- [x] Stage 2 — applyToDoc and inverses
- [x] Stage 3 — five new kinds
- [x] Stage 4 — normalize, newId, history
- [x] Stage 5 — test and receipt

KINDS TABLE (planned from scope 3.3 before coding)

| kind | fields | inverse | refusal cases |
|---|---|---|---|
| set-style | id, styles | set-style, prior values ("" where absent) | target not found |
| set-text | id, value | set-text, prior text | target not found; nested markup with no sole text node |
| replace-outer-html | id, html | replace-outer-html, prior outerHTML | target not found; html not exactly one root |
| set-css-token | token, value | set-css-token, prior value | token not found in any style block |
| set-full-source | source | set-full-source, prior full text (apply only; applyToDoc refuses) | none in apply; always refused in applyToDoc |
| wrap | ids, id | unwrap {id} | any id missing; ids not all siblings of one parent |
| unwrap | id | wrap {ids, id} (children ids, same wrapper id) | target not found; missing data-od-group |
| move | id, parent, index | move {id, parent: old parent, index: old index} | target not found; parent not found |
| remove | id | insert {parent, index, html} | target not found |
| insert | parent, index, html | remove {id: inserted root id} | parent not found; html not exactly one root |

PICKS I MADE
- parent resolution for move/insert uses find(doc, patch.parent) directly — find() already resolves "__body__" to the body, no separate helper needed
- parentKeyFor(): a parent's own data-od-id if present, else stableId(parent) — same fallback find() already relies on, so a move/remove inverse can always locate its parent again
- wrap's insertion point and child order come from the parent's actual document order of the given ids, not the order of patch.ids — matches scope 3.3 "document order kept"
- unwrap reads each freed child's existing data-od-id, falling back to stableId only if one is somehow missing (elements are normalized before patches run, so this is a safety net, not the expected path)
- replace-outer-html's inverse targets whatever id the replacement element ends up carrying (its own data-od-id if the replacement html supplied one, else the original patch.id), so the inverse can still find it
- insert refuses on anything but exactly one parsed root, same rule replace-outer-html already used
- test page Docs/tests/phase3F_patch.html loads patch.js at /static/js/widgets/codecanvas/shared/patch.js — confirmed server.py uses Flask's default static folder/url, no override (grepped for static_folder/static_url_path/app=Flask, none set)

CONTRACT FIELDS ADDED
- apply(text, patch) return value changed: was a string, now {text, inverse}. Breaking change for existing callers — canvas.js:1032 (patchSource) still treats the return as a string. Owned by jobs B/D; flagging for job D, who touches canvas.js after B and C are green, per scope 3.3 stage 2 instruction.
- applyToDoc(doc, patch) → {ok, inverse} — new export, mutates a live Document in place.
- normalize(text) → {text, n} — new export.
- newId(prefix) → new export.
- history() → {push, undo, redo, canUndo, canRedo, clear} — new export.
- KINDS: wrap, unwrap, move, remove, insert added (five original kinds unchanged, ALIAS unchanged).

`node --check` on static/js/widgets/codecanvas/shared/patch.js: ran, clean, no output.

STAGE 5 NOTE — could not execute the test
- The test page is written and self-contained (Docs/tests/phase3F_patch.html), but I have no tool that drives a real browser or a node+jsdom environment to run it and read back pass/fail counts. jsdom is not installed (no node_modules in the project) and I own no browser-automation tool. A server is up at localhost:5000, which would serve the script, but opening a page and reading its console still needs a browser. Per this stage's own instruction ("else say in the receipt what could not run"), I am reporting this rather than a browser run of the test. Job H's headed walk (Playwright) is the next point in this phase where a real browser exercises the code.
