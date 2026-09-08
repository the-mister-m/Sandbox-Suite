SPEC test — messenger — Phase 4 B2

RENDER
- Mounts clean via applyTemplate, no console errors beyond the known
  page-level 404. Screenshots: b2/messenger-01-roster.png through
  b2/messenger-44-after-mark-read-forced-refresh.png.

READ LINE CONFIRMED OR REFUTED
- "rail rows carry status, model, muted" — CONFIRMED (messenger-02,
  messenger-10).
- "wp_send goes to region ids" — CONFIRMED, inherited SEEN from
  S1-rerun (wp_feed line rendered as a live card), re-seen here in
  messenger-20 ("Captain: driver ping" card).
- "roster from track_list and ade_init" — CONFIRMED, inherited SEEN
  from S1-rerun, re-seen on remount (messenger-40 tracks list).

CHECKLIST
- roster updates on track_list: SEEN (inherited S1-rerun; re-confirmed
  live here — inserting gemma4b2/sonnetb2 grew the rail in
  messenger-02-roster-after-insert.png).
- send lands on the waypoint: SEEN (inherited S1-rerun; re-confirmed —
  messenger-20-cards-two-groups.png shows both new sends as live
  cards).
- mute toggles: SEEN, with a real gap — messenger-10-after-mute-click-no-refresh.png
  shows gemma4b2's row struck through and its 🚫 button lit red within
  500ms of the click, no widget-forced refresh in between. But
  messenger.js's mBtn click handler (mount handler, `.mg-btn.m` branch)
  never calls renderRows/syncButtons itself, and wp_mute's server
  handler (ade/frames.py:794-798, tracks.set_muted) never re-broadcasts
  track_list — it only posts a waypoint system line. The update seen
  here rode in on an incidental track_list broadcast from unrelated
  concurrent activity on the shared session (a "b3claude2" region also
  live on this session, presumably another wave box). See FIX LIST.
- read marks: SEEN — messenger-42/43/44. Captain's unread mail count
  went 2 -> 1 after clicking a card's "mark read" button and forcing a
  fresh wp_feed (messenger-44). Same class of gap as mute: the click
  itself does not locally clear the badge or request a refresh
  (messenger-43, taken before the forced wp_feed, still shows the
  other card's read button present) — engine/waypoint.py:87 collect()
  does append a "received" receipt that a fresh wp_feed correctly
  reflects, it's just never fetched automatically.
- cards group by participants: SEEN — messenger-20-cards-two-groups.png
  shows 6 distinct cards, each keyed by its own participant set
  (Captain+driver-ping-recipient, Captain+gemma-only, Captain+both,
  three view-only gfsf/gemma greetings), never merged across different
  recipient sets.

CONSOLE
- One pre-existing page-level 404 on load (known, shared setup list).
  No new console errors or pageerrors across both driver runs.

FIX LIST
- static/js/widgets/messenger/messenger.js:373-383 — the `.mg-btn.m`
  (mute) click handler sends wp_mute but never calls renderRows/
  syncButtons, and never re-requests wp_feed or track_list. Same for
  markRead (line 257-260) — no local UI update, no re-fetch. Both
  controls are correct once a track_list/wp_feed happens to arrive
  from anywhere, but neither guarantees one; on a quiet session (no
  other live regions changing state) a mute or a read-mark could sit
  visually unconfirmed indefinitely. Same shape of bug as B1's
  changes.js "feed sent once at mount, no feed_dirty subscription"
  finding — worth a matching fix.
- ade/frames.py:794-798 — wp_mute changes tracks.set_muted() state but
  never triggers `_broadcast(..., "send_track_list", ...)` the way
  insert_region/kill_track/stop do (frames.py:643/655/666/1011/1023/1057).
  Server-side root of the same gap.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:1-40 (Shared setup, B2)
- Docs/Reports/RECEIPT-phase4-S1-rerun.md (full)
- Docs/Reports/RECEIPT-phase4-B1.md (full)
- static/js/widgets/messenger/messenger.js (full, 431 lines)
- ade/frames.py:775-806 (wp_feed/wp_send/wp_mute/wp_read handlers)
- ade/tracks.py:1347-1362 (set_muted)
- engine/waypoint.py (full, 236 lines — append_message, collect,
  display_lines, waiting_counts)
- ade/frames.py:160-183 (mark_dirty/_fire_dirty/feed_dirty broadcast)
- server.py:205-260 (_waypoint_nudger, _waypoint_track_prober,
  _all_live_regions, _waypoint_track_resolver — confirms "Captain"
  resolves to HUMAN_SENDER and probes "live")
- engine/tools.py:600-660 (_SEND_SCHEMA, send_message tool, gated)
- engine/read_tool.py:439-460 (send_message runtime)
- static/js/matrix/socket.js:1-60 (onFrame/send, used for the raw
  gate-watch driver)
- static/js/matrix/grid.js:193-205 (applyTemplate)
- Docs/tests/matrix_harness.py (full, basis for driver scripts)
- queue.json (read to identify the two pending send_message gates by
  region/timestamp after the first driver script crashed on gate-id
  quoting)

BLOCKERS
- None. The read-mark turn (sonnetb2 -> send_message -> Captain) also
  produced an unrequested extra recipient (the agent added gemma4b2 to
  the receivers list on its own) — not a widget bug, model behavior,
  noted only for context.
