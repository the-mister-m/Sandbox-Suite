SESSION REVIEW — Sandbox Suite — W1 — 2026-09-07 (timestamps: ask Brandon)

EDITS
- [ade/tracks.py:2086](../../ade/tracks.py) — `save_all_on_shutdown` skips any
  environment with `hydrated` False.
- [ade/tracks.py:1686-1688](../../ade/tracks.py) — `_write_archive` copies an
  existing `master.json` to `master.prev` in the same folder before writing.
- [engine/agent_loop.py:436-438](../../engine/agent_loop.py) — the direct
  human-answer branch (after `dq.await_answer` returns a real answer) now
  passes `queue_id=entry["id"]` and `command=(entry.get("payload") or
  {}).get("command")` to `log_event`, same key as the queue/timeout/
  disconnect branches F-B fixed.
- [ade/frames.py:499](../../ade/frames.py) — `_PLAN_NODE_FIELDS` adds
  `provider`; `_plan_region` carries it for free since it loops that tuple —
  no second edit needed there.
- [ade/frames.py:524-525](../../ade/frames.py) — `_plan_rows` skips nodes
  whose `kind` is group, branch, or merge; only job nodes pipe.
- [server.py:1562-1563](../../server.py) — chooser fix, two attempts, see
  HARNESS. Landed state: `osascript -e 'tell application "Finder" to
  activate' -e <script>`.
- Item 5, ollama default model: no edit. `OllamaProvider()` at
  engine/providers.py:1173 takes no model arg, uses the constructor default
  `gemma4:26b-mxfp8` (engine/ollama_provider.py:41), matching
  ade/frames.py:21. No override found.

HARNESS
- Pre-restart: curled `/api/fs/pick`, confirmed the dialog process
  (`osascript -e activate -e ...`, D2's original line) was open and
  blocking (`ps aux`), frontmost app stayed "Code" per `lsappinfo front` /
  `lsappinfo info -only name` — D2's bug reproduced live. Cancelled by
  killing the osascript pid (System Events denied automation permission to
  this shell, so the usual Cmd-. via System Events wasn't available).
- Edited to `tell me to activate` and stopped for restart.
- Post-restart (this message): curled `/api/fs/pick` again. Dialog opened
  and blocked (`ps aux` showed it sleeping on `choose file`), but frontmost
  stayed "Code" again — `tell me to activate` is a no-op restatement of the
  bare `activate` D2 already had (both resolve to "activate me" at the top
  level), so it changed nothing. NOT SEEN. Cancelled by killing the pid;
  route returned `{"path":null}`.
- Re-edited to `tell application "Finder" to activate` — the idiom that
  actually gives the panel an activated host app to front against. Syntax
  checked. NOT YET PROVEN — needs another restart, which is outside this
  box's remit (no start/stop/restart).
- `archives/9883b6bec3df/master.prev` — checked twice (before and after
  the chooser test): NOT PRESENT. `master.json` mtime hasn't moved since
  before the restart. `autosave`/`_write_archive` only fire on a track or
  session mutation (ade/tracks.py:1740-1750) — nothing event-driven has
  saved this session since restart. Not driven; the fix is real by read,
  same as F-B's item 7 pattern, but the file won't exist until some box's
  or Brandon's action triggers a save on this session.

STRAY FILES
- None from this box. No harness driver written — items 1, 2, 3, 5 were
  read-checked or one-line edits with no client-side surface to click;
  item 4 was proven by curl/ps/lsappinfo, not a Playwright driver.

GOALS DONE
- Items 1, 2, 3 applied and syntax-checked.
- Item 4 attempted twice; second fix in place, unproven pending restart.
- Item 5 confirmed by read, no edit.

BRANDON'S TODOS
- None.

CLOSER REVIEW
- server.py:1562-1563's `Finder activate` fix needs a restart plus one more
  curl/lsappinfo check before it can move from "in place" to "proven."
- `archives/9883b6bec3df/master.prev` needs a save event on this session
  (from any box or from Brandon) before it can be confirmed to exist —
  flagging this back rather than mounting something myself to force it,
  since the box said no mounting should be needed.
- Item 2's fix only touches the branch where `dq.await_answer` returns a
  real human answer while an `entry` is in scope; the no-notifier
  synchronous-ask branch (agent_loop.py ~402-409) still has no queue entry
  at all and was left untouched — out of spec's stated scope (matches F-B's
  own carve-out on this same function).

READS
- Docs/Specs/SPEC-phase4-fixes-D.md (Shared setup, W1)
- Docs/Reports/RECEIPT-phase4-F-B.md (item 7, full)
- Docs/Reports/RECEIPT-phase4-D2.md (FIX LIST, full)
- ade/tracks.py:1663-1750, 2079-2120 (grep + targeted read)
- engine/agent_loop.py:150-220, 355-480 (grep + targeted read)
- ade/frames.py:495-540 (grep + targeted read)
- server.py:1545-1575 (grep + targeted read)
- static/js/widgets/adetools/arrange/arrange.js (grep for `kind`, `pipePlan`,
  `blankNode` — confirmed node.kind values: job, group, branch, merge)
- engine/providers.py:1170-1180, engine/ollama_provider.py:38-45 (grep)
