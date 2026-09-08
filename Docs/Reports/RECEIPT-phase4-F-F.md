SESSION REVIEW — Sandbox Suite — F-F — 2026-09-07 17:4x-18:12 (from harness output; server restart between job 1 and job 2 per coordinator)

EDITS
- server.py:775-781 — `/api/fs/read` reverted to
  `os.path.abspath(request.args.get("path") or "")`. Relative paths resolve
  against the server's CWD (project root) again, as before F-E's change.
- ade/frames.py:25-33 — `_human_path` now special-cases relative
  `injections/...` paths (used only by the "save"/"open"/"tree"/"delete"
  frames for context files) to resolve the same way — `os.path.abspath`,
  project root — instead of `environment.root`. Everything else still
  resolves against `environment.root`, unchanged.
- No makedirs added: `injections/track/` and `injections/region/` already
  exist on disk, confirmed by `ls` before editing.

HARNESS
- Driver: scratchpad ff_driver.py (below), headed Chrome, session
  9883b6bec3df.
- A page-level `window.MX.socket.onFrame(...)` listener registered via
  `page.evaluate` never fired in this sandbox — proven with a raw
  `setTimeout` too, then ruled back in once the wait used
  `page.wait_for_timeout()` instead of Python's `time.sleep()` (which
  stalls Playwright's own event pump). Even after that fix the page-level
  listener specifically never fired, while every mounted widget's own
  internal frame handling worked live and correctly every time (confirmed
  separately: a mounted timeline widget picked up a track created *after*
  mount, live, no reload). Root cause not chased further — driving
  switched to real widget UI (devagent's own "+ track"/"+ region"
  controls), which sidesteps it entirely.
- Track 5a031370bf1c and track a104ecc9ea23 (region gfsf) are gone from
  the live session post-restart — confirmed via a fresh connection's
  `ade_init` frame: only one track exists, "untitled" (528b80a75803), no
  regions. The restart wiped in-memory session state that was never
  written to master.json. gfsf could not be left alone because it no
  longer exists; nothing here deleted it. Used fresh tracks instead
  (below), prefixed ff.
- Mounted devagent (addWidget). Its own "+ track" control created
  "ffsonnettrack"; its "+ region" control (provider claude, model sonnet)
  created region "ffsonnet" (stamped "ffsonnet.2" — a pre-existing name
  collision, harmless) on it, region id d4feadb77ace. Same for a second
  track "fftrack" holding region "ffgemma" (provider ollama, model
  gemma4:e4b-it-q8_0) — deliberately a separate track, since
  timeline.js's `multiRegionTracks` handling only shows the first
  region's toggle state when two regions share one track.
- Mounted timeline (addWidget, not applyTemplate). Claude lane
  (ffsonnettrack/ffsonnet.2): `.tl-ttl`=1, `.ade-exclude-dynamic`=1 —
  screenshot shows "5m"/"1h" and "trim:off". Gemma lane
  (fftrack/ffgemma): `.tl-ttl`=0, `.ade-exclude-dynamic`=0 — no toggles.
  Confirms F-E item 9 (isClaudeModel matches modelRows by id/resolved)
  live.
- Job 1 round trip: in devagent's context tab for region ffsonnet,
  unlocked, typed a marker string, clicked save (brand-new file, no
  `absPath` yet — exercises the relative-path fix in both edits above).
  Removed and re-added the devagent widget (fresh `contexts: {}` state,
  forces a real `/api/fs/read` fetch), reselected ffsonnet, reopened
  context — read-back text matched the saved marker exactly. Path on
  disk: `injections/region/d4feadb77ace.md` — confirmed present with the
  marker text, then deleted (job spec: delete after).
- Evidence: Docs/Reports/phase3-test/ff/ — 6 screenshots
  (01-timeline-full, 02-timeline-widget, 03-claude-lane, 04-gemma-lane,
  05-context-saved, 06-context-readback), ff-console.txt (one
  pre-existing favicon 404, no new console/page errors).
- Teardown: removed both mounted widgets; deleted tracks ffsonnettrack
  and fftrack (and their regions) via delete_track. Session left holding
  only its pre-existing "untitled" track — gfsf was already gone before
  this box touched anything (see above).

STRAY FILES
- Docs/Reports/phase3-test/ff/ — this box's screenshots and console dump.
- Driver script in session scratchpad, not under the project:
  scratchpad/ff_driver.py.
- injections/region/d4feadb77ace.md — created by the round trip, deleted
  after confirming its content.

GOALS DONE
- Job 1: `/api/fs/read` reverted; context-file save path fixed to match;
  round trip driven headed and confirmed byte-for-byte.
- Job 2: cache-toggle proof driven headed — claude lane shows both
  toggles, gemma lane shows neither.

BRANDON'S TODOS
- None raised by this box.

CLOSER REVIEW
- Track 5a031370bf1c / a104ecc9ea23 (gfsf) no longer exist in session
  9883b6bec3df after the restart — worth flagging to D1/D3 if their work
  assumed those tracks or gfsf were still there.
- The page-level onFrame-never-fires quirk (see HARNESS) is environment-
  specific to this sandbox's headed Chrome and unrelated to the code
  changes; noting it since a future headed harness in this project will
  hit the same wall if it relies on a raw page-level frame listener
  instead of driving through a mounted widget's own UI.
