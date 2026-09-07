RECEIPT — E3b ask timeout — Sandbox Suite — Sun Sep 6 18:29:06 EDT 2026 to Sun Sep 6 18:30:22 EDT 2026

EDITS
- [ade/tracks.py](../../ade/tracks.py) — TrackHub.ask waits with a timeout (region's gate_wait_s, default 150) instead of blocking forever; empty string on timeout via new _gate_wait_s helper

STRAY FILES
- none

GOALS DONE
- SPEC-E3-lifecycle.md item 6: ask() now times out on gate_wait_s and returns a non-"yes" string on timeout, a closed gate. agent_loop.py:402's `.strip().lower() in ("y","yes")` contract is untouched and reads the timeout result as no.

GOALS NOT DONE
- none

DECISIONS MADE
- Timeout value source: TrackHub has only region_id, no settings access. Chose get_region(self.region_id).sess.settings.get("gate_wait_s"), falling back to 150 if region/sess missing. Options seen: (a) this lookup, (b) pass gate_wait_s into ask() as a parameter from the caller. Picked (a) to keep the caller's call signature (`sess.io.ask(prompt)`) unchanged. Undo: revert ade/tracks.py to the prior ask() body (queue.get() with no timeout, no _gate_wait_s method).
- Timeout return value: empty string "". Options seen: "", None, "no". Picked "" since it is falsy text and `.strip().lower()` on it is not "yes"/"y". Undo: change the except branch's assignment.

READS BEYOND THE LIST
- none

BLOCKERS FOR LATER WAVES
- none

PHASE 3 SURFACED
- none

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm gate_wait_s lookup path (get_region → .sess.settings) matches how region settings are read elsewhere for Track objects — Closer
