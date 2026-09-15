SESSION REVIEW — Sandbox Suite — 2026-09-14 (subagent, no clock access — times unavailable)

(clickable links only — no code blocks, no restating)

EDITS
- [engine/ledger.py:507-508](engine/ledger.py#L507) — `_pair_tool_use`: carries the open record's `tool_input` onto the merged result record (Bash's command didn't otherwise survive the merge)
- [static/js/widgets/adetools/ledger/ledger.js:59-66](static/js/widgets/adetools/ledger/ledger.js#L59) — `ioBox` takes an optional `resolving` arg, matching changes.js
- [static/js/widgets/adetools/ledger/ledger.js:98-135](static/js/widgets/adetools/ledger/ledger.js#L98) — `turnKey` (region+turn), `liveTurnsFor` (synthesizes a row per region+turn with matched actions but no turn record yet), `applyLiveOpenState` (live rows open by default, collapse once when the real turn record lands, never touches any other turn's open state)
- [static/js/widgets/adetools/ledger/ledger.js:224-225](static/js/widgets/adetools/ledger/ledger.js#L224) — time cell keys the caret off `turnKey(t)` and shows a `live` badge
- [static/js/widgets/adetools/ledger/ledger.js:269-274](static/js/widgets/adetools/ledger/ledger.js#L269) — state: `wasLive`, `liveCollapsed`, `details`, `detailAsked`
- [static/js/widgets/adetools/ledger/ledger.js:504-558](static/js/widgets/adetools/ledger/ledger.js#L504) — `renderBody` merges live turns into the row list, keys `st.open`/click toggle/transcript mount off `turnKey(t)` instead of `t.id`
- [static/js/widgets/adetools/ledger/ledger.js:659-750](static/js/widgets/adetools/ledger/ledger.js#L659) — `subDetailHtml` dispatches by action kind: `writeDiffHtml` (prior/result diff, ported `diffLines` from changes.js, fetches blobs via `ledger_detail` same as changes.js:283) for `action_type === 'write'`, `bashIoHtml` (command from `tool_input`, output from `tool_response`/`result`) for Bash, generic input/output boxes unchanged for everything else
- [static/js/widgets/adetools/ledger/ledger.js:932,972-974](static/js/widgets/adetools/ledger/ledger.js#L932) — subscribes to `ledger_detail`, stores detail responses on `st.details`
- [static/js/widgets/adetools/ledger/ledger.js:879,881-885](static/js/widgets/adetools/ledger/ledger.js#L879) — CSS: `.trow.live`, `.live-badge`, `.ql-diff` (uses the existing global `.dline` rules in ade.css, nothing new there)

GOALS DONE
- Running turn now shows as a live row (actions matched by region+turn, no turn record yet); cells with no data show "—", Actions counts real matched actions.
- Open state keyed by region+turn: a live row opens by default, collapses once when its turn record arrives, and a manually-opened turn stays open across that transition. No other turn's open state is touched.
- Write/Edit sub-rows show a diff of prior vs result instead of the generic boxes, reusing changes.js's diff algorithm; oversized fields resolve through `ledger_detail`.
- Bash sub-rows show the actual command (now carried onto the result record) and stdout/stderr instead of the mostly-empty generic boxes.
- Every other action type is unchanged (today's input/output boxes).

VERIFIED
- `python3 -m py_compile engine/ledger.py` — OK (re-checked after P1's concurrent edits landed in the same file; my change is isolated to `_pair_tool_use`)
- `node --check static/js/widgets/adetools/ledger/ledger.js` — OK
- Checked Bash command survival against `archives/535520fb3872/log.jsonl` (read-only): confirmed `claude_hook_result:Bash` records carry `tool_response.stdout/stderr` but no command, and the open `claude_hook:Bash` record's `payload.tool_input.command` is the only place the command lives — the engine change above is what makes it reach the result record.
- Not run in a browser; no headed pass this session.

NEEDS A RESTART
- engine/ledger.py change (new `tool_input` field on merged records) needs a server restart to take effect. Not restarted per scope.

STRAY FILES
- none

BRANDON'S TODOS
- none

CLOSER REVIEW
- Gets copy of review, not a contract.
- Confirm the live row's default-open / collapse-once behavior feels right once restarted and watched live — Brandon
- Fold into MEMORY.md / INDEX.md per normal close — closer
