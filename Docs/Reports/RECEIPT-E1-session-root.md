RECEIPT — E1 session root — Sandbox Suite — [start not captured] to 2026-09-06 18:03 EDT

EDITS
- ade/tracks.py:893 — Environment gets a `root` field, seeded from rt.WORKSPACE_ROOT
- ade/tracks.py:1074-1075 — create_track passes `root or environment.root` into Track()
- ade/tracks.py:1117 — insert_region falls back to `environment.root`, not the global
- ade/tracks.py:1926-1930 — reload_session reads saved_root into environment.root, no longer calls set_and_persist_root
- ade/tracks.py:2071 — register_open_archives seeds environment.root from the master
- ade/frames.py:16-21 — _human_path takes `environment`, resolves from `environment.root`
- ade/frames.py:808,815,834,844,853-854,886,912,931 — all nine _human_path call sites pass ctx.environment
- ade/frames.py:933 — rmdir's own-root check now compares against ctx.environment.root
- ade/frames.py:954-973 — setroot frame validates the path itself, writes ctx.environment.root, no longer touches the global
- engine/ledger.py:106-120 — write_blob takes an optional `directory`, returns a path relative to SUITE_ROOT
- engine/ledger.py:130 — custody stamps `sess.root` when present, else the global

STRAY FILES
- none

GOALS DONE
- Environment root field, seeded at construction, untouched by session loads
- setroot writes the session's own root, broadcast reload stays, global untouched
- create_track / insert_region fall back to environment.root
- _human_path and every file frame resolve from environment.root
- ledger.custody and action records carry the firing region's root
- write_blob accepts a directory (wiring session-specific dirs is E2's job, per the spec's own do-not)
- tracks.py line 1927 (old) set_and_persist_root call removed

GOALS NOT DONE
- none

DECISIONS MADE
- create_track: seeded Track(root=root or environment.root) instead of leaving Track(root=root) and relying on a later fallback inside Track — options: (a) leave create_track alone, only fix insert_region; (b) seed the track's root at construction. Chose (b), it's what the spec line asks for and needs no Track-class read. Undo: change back to `root=root`.
- setroot: validates the path inline (os.path.isdir) instead of calling a global-mutating helper. Undo: revert the elif block to call al.set_and_persist_root.
- write_blob: return value changed from a hardcoded `f"logs/{filename}"` to `os.path.relpath(full, SUITE_ROOT)` — identical output today since LOGS_DIR is SUITE_ROOT/logs, but correct once a caller passes a different directory. Undo: revert to the hardcoded string.
- Left ade/tracks.py _write_archive (line ~1642, in my read range) stamping the global rt.WORKSPACE_ROOT into master.json's "workspace_root" key, not environment.root. Spec step 1 says the archive "carries it under workspace_root already" without directing a value change, and no acceptance test requires a session's diverged root to survive a full archive/reload round trip. Undo/next step: change that line to environment.root if restart-persistence is wanted.

READS BEYOND THE LIST
- none — grep only, hit lines used directly, nothing beyond the read list opened

BLOCKERS FOR LATER WAVES
- ade/frames.py:320 — `root=msg.get("root") or rt.WORKSPACE_ROOT` in a frame outside my read range and outside the Build steps — still reads the global for what looks like a track/region creation frame. Not opened, not fixed.
- ade/tracks.py:436 — `rt.usable_root(self.root or rt.WORKSPACE_ROOT)` inside the Track class (grep hit only, not opened) — a track with no root still falls to the global if it somehow bypasses create_track's new seeding.
- ade/tracks.py:1846, 1882 — two more `Track(...)` construction sites (grep hits only, not opened) inside archive-rehydration code, not touched by this job — worth checking whether they need the same environment.root fallback.
- ade/tracks.py:858 — `ledger.custody(self.sess)` (grep hit only, not opened) — confirms custody is called with something other than a Region directly; whether that object carries `.root` today is unverified.
- engine/ledger.py:154,165,174 and engine/daemon_queue.py:269 — existing write_blob callers (grep hits only, not opened); all still work unchanged since `directory` defaults to None.
- ade/tracks.py _write_archive stamping the global root, see DECISIONS MADE above — if a future wave wants session roots to survive a restart, that line needs environment.root.

PHASE 3 SURFACED
- Should master.json's "workspace_root" field become the session's own root (environment.root) instead of the global, so a restarted process restores per-session divergence? Currently it does not.

BRANDON'S TODOS
- none

CLOSER REVIEW
- Confirm the _write_archive decision (global vs environment.root in the archive) is the intended scope for E1 — closer / Brandon
