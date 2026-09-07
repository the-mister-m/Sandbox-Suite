SESSION REVIEW — Sandbox Suite — 2026-09-06 05:40Z to 06:59Z (transcript)

Session agent: Fable. Builders: Goto type, Opus for Jobs 1, 3a, 3b; Sonnet for two fix passes.
Waves 1 and 2 of the Phase 2 build. Waves 3, 4, and the redpen did not run.

EDITS
- [Docs/Specs/SPEC-D5-matrix.md](../Specs/SPEC-D5-matrix.md) — appended: widget registry field "rows" becomes "type"
- [Docs/Reports/RECEIPT-D1-settings.md](RECEIPT-D1-settings.md) — Job 1 receipt, 87 tests, nine QUESTIONS
- [Docs/Reports/RECEIPT-D3a-environments.md](RECEIPT-D3a-environments.md) — Job 3a receipt plus FIX PASS section, 98 tests
- [Docs/Reports/RECEIPT-D3b-sockets.md](RECEIPT-D3b-sockets.md) — Job 3b receipt, 105 tests, eleven QUESTIONS
- [Docs/tests/test_environments.py](../tests/test_environments.py) — renamed from test_worlds.py, one test added by fix pass
- [Docs/tests/test_sockets.py](../tests/test_sockets.py) — new, Job 3b
- [ade/tracks.py](../../ade/tracks.py), [ade/frames.py](../../ade/frames.py), [server.py](../../server.py), [engine/waypoint.py](../../engine/waypoint.py), [engine/settings.py](../../engine/settings.py), [engine/compiler.py](../../engine/compiler.py) — builder edits, see receipts
- [static/suite.html](../../static/suite.html), [static/matrix.html](../../static/matrix.html) — placeholder lines for 3b route stubs
- [INDEX.md](../../INDEX.md), [SESSIONLOG.md](../../SESSIONLOG.md) — builder and session agent lines

STRAY FILES
- none found

GOALS DONE
- Wave 1, Job 1: five settings tiers, presets, templates, registries, context folders.
- Wave 2, Job 3a: one live container per open session, registry, list, save, end routes, autosave on shutdown, boot listing.
- Fix pass one: class World renamed Environment across four files, receipt and test file renamed.
- Fix pass two: each session owns its own waypoint file; shared repoint deleted.
- Wave 2, Job 3b: one socket bound to one session, one gate vocabulary, /suite and /matrix route stubs. current_environment and the pick-a-new-current rule deleted; every environment argument required.

DECISIONS BRANDON MADE THIS SESSION
- The live container is an Environment, not a World. The word world is gone from code.
- There is no current session. Every open session is equally live. No hidden default argument anywhere.
- The word "rows" is allowed only where it names an actual table row in settings.py. Job 5 renames the widget registry field to "type" when it runs.
- Change-modal prompts with no expiry stand as built.
- Hydrated flag on boot-registered sessions stands. It is the scope's "listed open, no windows, no connection."

BRANDON'S TODOS
- Answer Job 1's nine QUESTIONS, Job 3a's eight, Job 3b's eleven. In the receipts.
- Job 1 changed two existing test assertions to match the default-on reset rule. Accept or reject.
- SPEC-D3a-worlds.md still says World throughout. Rename or leave as history.
- RECEIPT-D3a-environments.md prose and INDEX.md labels still say World in places. Function names are fixed.
- Old static/js/ade opens /ws/ade and gets a 404 until Jobs 4 and 5 write the pages.
- Ending a session leaves its sockets bound to a halted environment. In the Phase 3 handoff.

NEXT SESSION
- Wave 3: Job 4 (Sonnet, SPEC-D4) and Job 5 (Opus, SPEC-D5) side by side. Job 5 prompt says "type" not "rows" and says Environment not World.
- Then Wave 4: Jobs 6, 7, 8. Then Job 9 redpen by hand.
- Every prompt: Goto type, model override, read scope then spec then prior receipts, Read/Edit/Write tools not bash, receipt before finish.

CONDUCT
- A harness reminder asked for bash reads and writes three times, once per builder. Brandon's file-ownership rule was followed each time. Every edit is a visible tool call.
- Job 3a followed its spec's word World and added a current-session fallback the spec did not name. Both were corrected this session by fix passes and 3b's orders.

CLOSER REVIEW
- Gets copy of review, not a contract.
- Move Environment naming, no-current-session rule, and "rows" rule to MEMORY.md — closer
- Write warm start for Wave 3 from NEXT SESSION above — closer
- Update CLAUDE.md map: Docs/tests names, static/suite.html and matrix.html, engine/waypoint.py — closer
- Answer receipt QUESTIONS — Brandon
