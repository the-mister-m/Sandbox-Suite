# SPEC-test-changes — B1

## RENDER
changes-10/11/12-pending-before-approve.png, changes-30-pending-flag-forced-refresh.png,
changes-40-agents-tab-real.png, changes-23-after-jump.png under
Docs/Reports/phase3-test/b1/.

## READ LINE CONFIRMED OR REFUTED
PARTIALLY REFUTED. "agent labels come from region rows" CONFIRMED —
trackNames fills from track_list/ade_init and whoLabel falls back to the
raw region id once that region is dropped (changes-40, group label
"faed240b2643" after cleanup — correct fallback, not a bug). "jump button
and diff-line clicks dispatch mx:open-ledger" CONFIRMED — ledger.js:780
listens for it and the click fired (jumped: true in console log).
Read line did not mention the actual bug found: changes only requests
`{type:"feed"}` once, at mount (changes.js:449-450) — it does not
subscribe to `feed_dirty`, so its tree is a frozen snapshot from mount
time and never updates on its own as new turns/gates happen. Strip
re-sends `feed` every popover open; changes never does, only on remount.

## CHECKLIST
- files and agents grouping: SEEN, with a bug (see FIX LIST). Both tabs
  correctly group by file/by region when the feed is (manually) refreshed
  (changes-10, changes-40). But a completed write logged with
  action_type `write_file` (the sandbox's direct write path) never
  renders — only writes normalized to action_type `write` by
  engine/ledger.py:514 (`_translate_rail_c_write`, for Claude's native
  Write/Edit tool calls) pass changes.js:160's `r.action_type === "write"`
  check. Proven directly: test2.txt showed correctly while its gate was
  PENDING (changes-30, pending records use action_type "write" per
  queue-shaped record), then vanished entirely once the same write
  resolved and was logged with action_type "write_file"
  (archives/9883b6bec3df/log.jsonl id 8d153cb3f1a3) — changes-31 shows
  only the older test.txt group, test2.txt gone.
- diff pane: SEEN. changes-10/40 show a real diff: header "test.txt +1
  -0 faed240b2643 · 13:35:13" with "open in ledger →", body one green
  "+ hello" line.
- pending gate flag: SEEN (was NOT DRIVEN in S1-rerun). changes-30 shows
  "test2.txt [GATE] 1" in the yellow pending style with a pending child
  row, caught by forcing a manual `{type:"feed"}` re-send the instant the
  write gate went live (changes only otherwise reads feed once at mount,
  see FIX LIST — without that forced refresh this line cannot be
  observed live in the widget as shipped).
- jump opens the right ledger row (ledger mounted): SEEN mechanism,
  NOT VISUALLY CONFIRMED. Click on `#chgJumpBtn` fired `mx:open-ledger`
  (console-confirmed `jumped: true`), and ledger.js:780 has a live
  listener bound (`_ledgerOpenHandler`). Full-page screenshot
  (changes-23-after-jump.png) is unchanged from before the click at this
  resolution/zoom — could not visually confirm which ledger row it
  focused. Ledger widget itself renders real turn-table and per-agent
  rollup data now (feed fix benefits it too), not part of this box's
  scope.

## CONSOLE
Two pre-existing 404s (page-level favicon), no new console errors, no
pageerrors across all four driver runs (changes-console.txt and console
captured inline in later runs — no error/pageerror lines in any of them).

## FIX LIST
- static/js/widgets/changes/changes.js:160 — `reduceEvents()` only
  matches `r.action_type === "write"`. The sandbox's own write path logs
  `action_type: "write_file"` (see log id 8d153cb3f1a3), which
  `_translate_rail_c_write` (engine/ledger.py:514) never touches because
  that function only fires for Claude's native `claude_hook:Write/Edit`
  tool-call pairing. Net effect: any write done through the direct
  write_file/queue mechanism disappears from changes' tree the moment
  its gate resolves — it is visible only while pending (pending records
  are separately shaped with action_type "write" by
  engine/ledger.py's queue-to-record path). Confirmed live, not
  theoretical.
- static/js/widgets/changes/changes.js:449-450 — mount sends `{type:
  "feed"}` once and never again; the widget does not subscribe to
  `feed_dirty` (compare strip.js:313, which subscribes it and re-sends
  `feed` on every popover open). Changes' tree is frozen at whatever the
  feed looked like at mount time; a widget left open through a live turn
  will not show new writes or new pending gates without a manual
  `frame.send({type:"feed"})` or a remount. This is why the pending-gate
  flag line above could only be observed by forcing that resend by hand.

## STRAY FILES
None outstanding — test.txt and test2.txt (both driven writes) were
removed (one by the agent's own `rm` inside the gate test, one by me
directly since that turn only asked for a write). Extra grid window
JSON files under library/grids/9883b6bec3df/ from each applyTemplate
call in this box's driver runs (throwaway test windows, same footprint
noted in RECEIPT-phase4-S1-rerun).

## READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40 (Shared setup, B1)
- static/js/widgets/changes/changes.js (full, 484 lines)
- static/js/widgets/ledger/ledger.js:770-795 (mx:open-ledger listener)
- engine/ledger.py:396-460 (_pair_gates, _pair_tool_use), :460-515
  (_translate_rail_c_write, where action_type becomes "write")
- archives/9883b6bec3df/log.jsonl (read repeatedly across three driver
  rounds — ground truth for the write vs write_file finding)
- queue.json (pending-record shape, action_type "write" for live gates)
- archives/9883b6bec3df/master.json (region/track roster checks,
  confirmed stale relative to live state — live check via a fresh strip
  mount is the ground truth)

## BLOCKERS
None. Spent the budget the read line under-scoped (the feed-request-once
behavior) rather than re-deriving what S1-rerun already proved about the
feed pipe itself.
