SESSION REVIEW — Sandbox Suite — D3 — 2026-09-07

chat, driven on session 9883b6bec3df, track 5a031370bf1c, two instances bound
to two regions plus one file browser instance, mounted with addWidget (not
applyTemplate, which unmounts the whole grid — would have hit D1 running in
parallel). Full detail: Docs/Reports/phase3-test/SPEC-test-chat.md.

DRIVEN
- region picker, live pill, send, reload, file drop from browser: all SEEN.
- stop: SEEN, but the turn had already finished by the click — proves the
  button/frame, not a live interrupt.
- speech toggle: NOT DRIVEN as an effect — mx.speech.lock is only written by
  an actual speak/audio server frame, none fired. Left off at close.
- two-chat isolation (the point of pairing d3sonnet + d3gemma): FAILED.

REGIONS MOUNTED AND DROPPED
- 84ce9911c681 "d3sonnet" — claude/sonnet on 5a031370bf1c. One turn. Dropped
  via kill_track.
- 300083a8379c "d3gemma" — gemma4:e4b-it-q8_0/ollama on 5a031370bf1c. One
  turn. Auto-anchored to the socket by insert_region. Dropped via kill_track.
- gfsf (32f1ec929f4a) on a104ecc9ea23 untouched, confirmed alone at close.

CONSOLE
- One pre-existing page-level 404 (known list). No new errors either pass.

FIX LIST
- static/js/widgets/chat/chat/chat.js:480-488 — the raw out/status/meters
  fallback guards on msg.inst/msg.region, but that pipe (the anchored
  region's echo) carries neither field, so the guard never fires. Live count:
  121 untagged out frames for the anchored region (d3gemma) landed on top of
  121 correctly-tagged mirror frames for the same region — chatB doubled
  every word of its own reply. The same 121 untagged frames also reached
  chatA (bound to d3sonnet, not anchored), interleaving gemma's reply into
  sonnet's own stream mid-render. Same defect class B4 found in anchor-chat,
  now quantified in chat's own code. Screenshot
  Docs/Reports/phase3-test/d3/04-both-streamed.png, counts in
  Docs/Reports/phase3-test/d3/frames-seen.json.
- Same lines — raw status idle blanks a chat's live buffer with the same
  missing filter; not independently screenshotted, same unfiltered path.
- Reload is clean regardless: chatB's post-reload transcript
  (06-after-reload.png) shows each line once, straight from the server
  ledger — the bug is confined to the live-stream path.
- Not a defect: browser widget (browser.js:267-276) has no option-driven
  root, only a native picker or text prompt. Driven by calling its own
  frame._browserHooks.setRoot() directly.

STRAY FILES
- Docs/Reports/phase3-test/d3/ — 13 screenshots, 2 console dumps,
  regions-seen.json, frames-seen.json (307 captured frames), chatA-text.txt,
  chatB-text.txt, filedrop-input.txt. This box's evidence.
- Driver scripts in session scratchpad (d3_chat.py, d3_filedrop.py), not
  under the project.

READS
- Docs/Specs/SPEC-phase4-test-waves.md:10-41, :215-264 (Shared setup, D3)
- Docs/Reports/RECEIPT-phase4-B4.md (full), RECEIPT-phase4-B1.md:1-100
- static/js/widgets/chat/chat/chat.js (full, 504 lines)
- library/registry/widgets.json:2, :7, :11
- ade/frames.py:290-330, :440-465, :555-620, :645-665
- ade/tracks.py:147-190 (MirrorView)
- static/js/matrix/grid.js:149-300, widget-frame.js:45-105, socket.js:1-55
- static/js/widgets/usertools/browser/browser.js:1-60, :260-300
- static/js/widgets/shared/gate-common.js:65-106 (grep only)
- Docs/tests/matrix_harness.py (full)

CLOSER REVIEW
- Fix List #1/#2 is the same raw-out/status/meters-carries-no-region defect
  class B4 flagged in anchor-chat, now confirmed in chat too, with exact
  frame counts. Worth the same question B4's closer note raised for
  region/track id mismatches: one engine-level fix (tag these frames) beats
  patching every widget's fallback branch separately.
- applyTemplate's unmountAll() is a real hazard for any future parallel-box
  wave — it will nuke whatever the paired box mounted. Worth a one-line
  callout in the shared setup for later waves.
- Brandon or closer: scope call on whether the raw-frame region tag gets
  fixed now or waits for a wave.
