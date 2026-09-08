# SPEC-test-chat

## D3 — 2026-09-07

Phase 4, Wave D, box D3. Widget `chat`.
File: `static/js/widgets/chat/chat/chat.js` (504 lines).
Session `9883b6bec3df`, track `5a031370bf1c`. Two chat instances plus one
browser instance, mounted with `MX.grid.addWidget` (not `applyTemplate`,
which calls `unmountAll()` first — see BLOCKERS/note). Driver scripts in
session scratchpad, not under the project. Screenshots under
`Docs/Reports/phase3-test/d3/`.

Regions mounted and dropped, this box only:
- `84ce9911c681` "d3sonnet" — insert_region on 5a031370bf1c, claude/sonnet.
  One turn. Dropped via kill_track.
- `300083a8379c` "d3gemma" — insert_region on 5a031370bf1c,
  gemma4:e4b-it-q8_0/ollama. One turn. Dropped via kill_track. This region
  became the socket's anchored region (insert_region calls `_anchor`,
  ade/frames.py:601) — load-bearing for the FIX LIST below.
- Pre-existing region `gfsf` (32f1ec929f4a) on track a104ecc9ea23 untouched
  throughout; confirmed alone on its track at close.

---

## RENDER

Two chats side by side (04-both-streamed.png): each frame has a region
`<select>`, a `live`/`not live` pill, a `ctx` field (shown for the cloud
region only), a scrollable transcript, and a footer with input textarea +
send/stop/reload buttons. Placeholder text: "message, or drop a file from
the browser". Third instance is the file browser widget, "Change Root" /
"no root chosen" until a root is set.

---

## READ LINE CONFIRMED OR REFUTED

Read line: "`follow` per instance, `mirror` frames tagged by region, so
several chats stream at once."

- The mechanism is CONFIRMED by code and by a live frame capture:
  `follow(frame)` sends `{type:'follow', track:rid, inst:frame.id}`
  (chat.js:244-251); the server's `MirrorView._tag` (ade/tracks.py:153-155)
  wraps every push as `{type:'mirror', track:<region id>, kind, ...}`;
  chat.js:469-478 filters mirror frames on `msg.track !== rid` before
  drawing. Two regions, two bound chats, both showed `live` and both
  produced their own turn.
- The isolation the sentence implies — "so several chats stream at once"
  meaning independently — is REFUTED live. See FIX LIST #1. `chat.js` also
  listens to a second, unfiltered path (raw `out`/`status`/`meters`, no
  `mirror` wrapper, no region tag) that only exists for the socket's
  anchored region, and nothing in chat.js's bottom branch (lines 480-488)
  actually filters it out, because the frames it's checking against
  (`msg.inst`, `msg.region`) are absent on that path. Two chats bound to
  two different regions on one socket do not stream independently; the
  anchored region's raw stream reaches both.
- Speech lock in localStorage: CONFIRMED as a mechanism (key
  `mx.speech.lock`, chat.js:16, read/write in `claimSpeechLock`/
  `releaseSpeechLock`, chat.js:81-106). NOT DRIVEN as an effect — toggling
  `frame.options.speech_enabled` on its own never touches localStorage;
  the key is only written inside `speak()`/`playAudio()`, which only run
  on an actual `speak`/`audio` server frame. No such frame arrived in this
  session (no TTS route exercised here). Toggled on then back off per
  instruction; localStorage key stayed null start to finish
  (`before/after-enable/after-disable` all `None`, driver stdout).

---

## CHECKLIST

- region picker: SEEN — `02-bound.png`, `04-both-streamed.png`. Roster
  (`ade_init`/`track_list`) populates `c.regions`; the `<select>` shows
  d3sonnet/d3gemma/gfsf as they came and went.
- live pill: SEEN — `04-both-streamed.png`, both pills green "live" after
  `frame.setOption('region', rid)` on each instance.
- send: SEEN — both chats ran a turn from their own send button
  (`03-both-sent.png` mid-stream, `04-both-streamed.png` settled).
- stop: SEEN, with the same caveat B4 raised for anchor-chat's first
  attempts — `05-after-stop.png` shows chatA's dim `[stopped — you hit
  Stop]` line appended after the click, but the turn had already finished
  streaming by the time Stop was clicked, so this proves the button fires
  and the server acknowledges it, not that Stop interrupts a live stream.
- reload: SEEN — `06-after-reload.png`. chatB's transcript is replaced
  wholesale with the server's own two clean lines (`USER: d3gemma says
  hello` / `AGENT: Hello there! How can I help you today?`), each once —
  proof that the doubling below is a live-stream rendering defect, not a
  stored-transcript one.
- file drop from browser: SEEN — second pass, `10-browser-rooted.png` /
  `11-after-filedrop.png` / `filedrop-input.txt`. Browser widget has no
  option-driven root (only a native directory picker or a text prompt,
  browser.js:267-276); driven by calling its own exposed
  `frame._browserHooks.setRoot(path)` directly. A synthetic
  `dragstart`/`drop` with a shared `DataTransfer` from the browser's
  draggable row onto the chat's `.cq-foot` produced the expected
  `[file: <path>]` fenced block in the chat's input textarea.
- speech toggle: NOT DRIVEN (effect) / SEEN (mechanism, code read) — see
  READ LINE section above. Left off at close.
- two-chat isolation (added, not on the printed checklist but the point
  of pairing two regions): FAILED. See FIX LIST #1. `04-both-streamed.png`
  is the screenshot; `chatA-text.txt` and `chatB-text.txt` are the raw
  rendered text; `frames-seen.json` is the full captured-frame log.

---

## CONSOLE

One pre-existing page-level 404 (known, shared-setup list) per page load,
both driver passes. No new console errors, no pageerrors.
`Docs/Reports/phase3-test/d3/d3-console.txt`,
`Docs/Reports/phase3-test/d3/d3-filedrop-console.txt`.

---

## FIX LIST

1. `static/js/widgets/chat/chat/chat.js:480-488` — the fallback branch for
   raw `out`/`status`/`meters`/`speak`/`audio` frames guards on
   `msg.inst` and `msg.region`, but that pipe (the socket's anchored-region
   echo, distinct from the `mirror` pipe) carries neither field, so both
   guards are no-ops and every raw frame reaches every mounted chat
   instance regardless of which region it's bound to. Quantified live:
   `insert_region` auto-anchors the newest region to the socket
   (ade/frames.py:601, `_anchor(ctx, reg)`), so d3gemma (inserted second)
   became anchored. One turn on d3gemma produced 121 raw `out` frames
   (no track/region tag) alongside 121 correctly-tagged `mirror` `out`
   frames for the same region (`frames-seen.json`). Effect: chatB (bound
   to d3gemma) received its own output twice and rendered every word
   doubled ("The The user user input input is is…", `chatB-text.txt`).
   chatA (bound to d3sonnet, not anchored, no legitimate reason to see
   gemma's traffic at all) received the same 121 untagged frames and had
   gemma's reply interleaved mid-render into its own 8-frame mirror
   stream (`chatA-text.txt`, `04-both-streamed.png`). This is the same
   defect class B4 found in anchor-chat (raw `out`/`status`/`meters`
   carry no region, one socket effectively has one "anchored" voice) —
   now demonstrated in chat's own unfiltered fallback branch, with exact
   frame counts.
2. Same lines — a raw `status` frame with `phase:"idle"` blanks
   `c.live`/`c.liveText` unconditionally, with the same missing filter as
   #1. 4 untagged `status` frames rode the same unfiltered path in this
   run (`frames-seen.json`); not independently screenshotted, but nothing
   distinguishes it from #1's frames at the code level — a status idle
   from the anchored region can cut a different, still-streaming chat's
   live buffer.
3. Not a defect, a note: `static/js/widgets/usertools/browser/browser.js:
   267-276` — no option or API surface to set the tree root other than a
   native `showDirectoryPicker()` or a `MX.ui.prompt` text box. A driven
   session has to reach in through `frame._browserHooks.setRoot()`
   directly; there's no such escape hatch documented anywhere for other
   drivers to find.

---

## READS

- Docs/Specs/SPEC-phase4-test-waves.md:10-41 (Shared setup), :215-264
  (Wave D, D3 section)
- Docs/Reports/RECEIPT-phase4-B4.md (full)
- Docs/Reports/RECEIPT-phase4-B1.md:1-100 (receipt shape reference)
- static/js/widgets/chat/chat/chat.js (full, 504 lines)
- library/registry/widgets.json:2, :7, :11 (chat, browser, anchor_chat rows)
- ade/frames.py:290-330 (_follow/_unfollow), :440-465 (_do_insert_region),
  :555-620 (roster/insert_region/user handlers), :645-665
  (kill_track/reset_track)
- ade/tracks.py:147-190 (MirrorView)
- static/js/matrix/grid.js:149-300 (addWidget/applyTemplate/_build)
- static/js/matrix/widget-frame.js:45-105 (send/setOption/deliver)
- static/js/matrix/socket.js:1-55 (send/onFrame)
- static/js/widgets/usertools/browser/browser.js:1-60, :260-300
  (chooseRoot/setRoot, draggable rows)
- static/js/widgets/shared/gate-common.js:65-106 (regionRows/namesFrom,
  grep only)
- Docs/tests/matrix_harness.py (full, basis for both driver scripts)

---

## BLOCKERS

- None outright. `applyTemplate` was ruled out for laying out the two
  chats + browser because it calls `unmountAll()` first (grid.js:195-199)
  — with D1 running in parallel on the same session, that would have
  dropped D1's widgets too. Used `MX.grid.addWidget` per instance instead
  (F-E's fix holds: it no longer calls `render()` on every widget, only
  appends the new one), which does not disturb widgets it didn't mount.
- Speech toggle's localStorage effect could not be driven without an
  actual `speak`/`audio` server frame, which never arrived; reported as
  NOT DRIVEN rather than guessed at.

## W4 — 2026-09-07

- Two-chat isolation (D3's FAILED case, W2's fix): SEEN. Two chats each
  bound to their own region, one turn each from the widget's own send
  box; neither transcript shows the other's marker word. This re-drive
  used two distinct, separately-created regions (not one anchored +
  followers), so it does not by itself prove the mirror/follow broadcast
  path W2 also touched — see RECEIPT-phase4-W4.md item 4 for the frame-
  count caveat.
- Full detail: RECEIPT-phase4-W4.md.
