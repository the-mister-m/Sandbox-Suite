SESSION REVIEW — Sandbox Suite / Phase 3.5-Adobe job 1b — patch kinds — 2026-09-14

EDITS
- static/js/widgets/codecanvas/shared/patch.js — three new kinds (set-attr, set-css-rule, remove-css-rule), insert grows an ns:"svg" option, KINDS now thirteen

STRAY FILES
- Docs/tests/phase35_patch.html — stage 5 test page (spec-named path; phase3F_patch.html no longer exists to extend/copy from, so written fresh)

GOALS DONE
- set-attr added: refuses data-od- names, null value removes, inverse restores prior value or null
- set-css-rule added: finds or creates the data-cc style block, replaces or appends the rule, inverse is set-css-rule (prior declarations) or remove-css-rule (rule was new)
- remove-css-rule added: refuses when the rule is absent, inverse is set-css-rule with the removed declarations
- insert grows ns:"svg": html parsed inside an <svg> template so the root and descendants land in the SVG namespace, refused unless exactly one root
- KINDS grew from ten to thirteen; the ten original kinds and ALIAS untouched
- headless browser test run (Playwright, against the already-running local server via /raw/<path>): 22 checks, 21 pass
- node --check clean after every stage

BRANDON'S TODOS
- (none)

CLOSER REVIEW
- one pre-existing quirk found, not touched: doSetStyle's inverse (unchanged code, not owned by this job) leaves an empty style="" attribute behind instead of removing it, when the inverse clears the only inline style a element had. Round-trip text differs by that empty attribute. Not a regression from this job — doSetStyle is untouched; flagging for whichever job next reads set-style behavior.

STAGES
- [x] Stage 1 — receipt outline
- [x] Stage 2 — set-attr
- [x] Stage 3 — set-css-rule, remove-css-rule
- [x] Stage 4 — insert with ns
- [x] Stage 5 — test and receipt

KINDS TABLE (planned from scope 3.2 before coding)

| kind | fields | inverse | refusal cases |
|---|---|---|---|
| set-style | id, styles | set-style, prior values ("" where absent) | target not found |
| set-text | id, value | set-text, prior text | target not found; nested markup with no sole text node |
| replace-outer-html | id, html | replace-outer-html, prior outerHTML | target not found; html not exactly one root |
| set-css-token | token, value | set-css-token, prior value | token not found in any style block |
| set-full-source | source | set-full-source, prior full text (apply only; applyToDoc refuses) | none in apply; always refused in applyToDoc |
| wrap | ids, id | unwrap {id} | any id missing; ids not all siblings of one parent |
| unwrap | id | wrap {ids, id} | target not found; missing data-od-group |
| move | id, parent, index | move {id, parent: old parent, index: old index} | target not found; parent not found |
| remove | id | insert {parent, index, html} | target not found |
| insert | parent, index, html, ns? | remove {id: inserted root id} | parent not found; html not exactly one root; ns=svg not exactly one root |
| set-attr | id, name, value | set-attr, prior value or null | target not found; name starts data-od- |
| set-css-rule | block, selector, declarations | set-css-rule, prior declarations, or remove-css-rule when new | block/style element issue none expected (created if absent) |
| remove-css-rule | block, selector | set-css-rule, prior declarations | rule absent |

PICKS I MADE
- styleBlock(doc, block, create): looks up `style[data-cc="<block>"]` in head, creates and appends when absent and create is true — mirrors find()'s pattern of a small resolver helper.
- cssRulePattern(selector): one regex built from the escaped selector, `selector\s*\{([^}]*)\}`, shared by set-css-rule and remove-css-rule so both read the same rule the same way.
- Declarations captured from an existing rule are trimmed (match[2].trim()) before use as an inverse's or a re-read value. Without the trim, declarations round-tripped through set-css-rule accumulate a leading/trailing space every pass (the fixed template spacing plus the captured spacing), so text stops being byte-stable after two edits. Trimming makes "selector { declarations }" the one canonical form the code ever writes, so repeated set/inverse cycles stay exact. Not spelled out in the scope; the scope's "no CSS parser" note left the exact regex shape to the job.
- remove-css-rule deletes the `<style>` element itself when removing the rule leaves the block empty, rather than leaving an empty style tag behind. Needed for exact inverse text: a set-css-rule that created the block from nothing must undo back to no block at all, not an empty one. Caught by the stage 5 round-trip test, not called out in scope 3.2's refusal-cases line, but required by the "Done when" exact-text bullet.
- insert's ns="svg" path wraps html in `<svg xmlns="...">` inside the template exactly as the spec's Stage 4 literal, then reads the svg's own first element child as root — everything after that (id stamping, index insert) reuses the existing non-ns code unchanged.
- Test fixture built as a full HTML document (doctype+html) rather than a body fragment, so serialize() round-trips head content (the styles block) too, not just body.innerHTML — set-css-rule/remove-css-rule tests need the head to be part of the compared text.
- Round-trip tests compare against `normalize(FIXTURE).text` (BASELINE), not the hand-typed FIXTURE string, so a DOM-parse/serialize formatting difference (attribute quoting, tag closing) isn't mistaken for a patch bug.
- phase3F_patch.html (the file this job's spec says to extend or copy) does not exist in the repo — grepped Docs/tests, not present. Wrote Docs/tests/phase35_patch.html fresh instead, same shape: script tag loading patch.js by its static route, inline assertions, results written to the page and to console.
- Test executed for real: a local server was already running on :5000 (not started by this job), so the test page was served through Flask's `/raw/<path>` route (serves a file by absolute path) and driven with Playwright (Python, already installed) headless. 22 checks ran; 21 passed. The one failure is the pre-existing set-style quirk noted under CLOSER REVIEW, not a new-kind bug — traced by inspecting the BASELINE-vs-result diff the test logs to console on failure.

CONTRACT FIELDS ADDED
- KINDS: set-attr, set-css-rule, remove-css-rule added (scope 3.2, "KINDS lists thirteen").
- insert {parent, index, html, ns?}: ns is a new optional field, scope 3.2.
- No other exports changed; applyToDoc/apply/normalize/newId/history signatures untouched.
