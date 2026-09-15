# SPEC — Phase 3.5 — 13 — Opus — Threading

Written 2026-09-14. Runs after W2, beside 11. Text frames link into a
story; copy overflows frame to frame; edits reflow. This job may slip
without blocking any other.

Contracts: scope sections 3.1 (story attrs), 3.4 (job 13 line).

## Rules for this agent

- Global rules apply: ~/.claude/CLAUDE.md. Recite them first.
- Comments are label, function, state. "spine" banned.
- You own static/js/widgets/codecanvas/canvas/canvas.js and a new
  static/js/widgets/codecanvas/shared/thread.js, plus its registry
  line. Nothing else.
- Stages below. Stage 1 writes the receipt outline. At 150K with
  stages open: handoff. Hard cap 180K.
- Receipt: Docs/Reports/RECEIPT-phase3.5-13.md. One line each to
  SESSIONLOG.md and INDEX.md. `node --check` after every stage.

## Read

- The scope, sections 3.1, 3.4, 5.
- canvas.js: `makeEditable`, `finishTextEdit`, `applyPatches`,
  `frame._canvas`, `menuItems`. About 10K of it.
- Docs/scratchpad/phase35-magazine.html — the three story frames.

## Stage 1 — receipt outline. Check.

## Stage 2 — thread.js

`MX.canvasThread(doc)`: pure functions on a document.
- `frames(storyId)`: elements with that `data-cc-story`, sorted by
  `data-cc-thread`.
- `storyText(storyId)`: the concatenated text content of the frames,
  with a `\n\n` between the paragraphs each frame holds.
- `fit(frame, text)`: binary search on the character count that fits
  without `scrollHeight > clientHeight`, splitting on word boundaries,
  paragraphs preserved as `<p>`. Returns `{fitted, rest}`. Measures in
  the live document by writing into the frame and reading; leaves the
  fitted text in place.
- `reflow(storyId)`: storyText, then fit through each frame in order;
  the last frame carries `data-cc-overset="1"` when text remains,
  else the attribute is absent. Returns the list of `{id, html}` per
  frame so the caller can patch.
- Check.

## Stage 3 — canvas

- `thread(ids)`: assign a new story id and thread numbers in selection
  order via set-attr; reflow; patch every frame with
  replace-outer-html in one `patchMany`.
- `unthread(id)`: remove the two attrs from that frame; renumber the
  rest; reflow.
- `reflow(storyId)` on demand.
- After `finishTextEdit` commits inside a story frame, after a resize
  of a story frame (job 8's handles), and after paragraph or style
  changes that hit a story frame (listen on `canvas.change` and check
  whether any patched id is a story frame), run reflow and patch.
- Chrome: a small in/out port square on the top-left and bottom-right
  of a selected story frame; an overset frame draws a red plus at the
  out port. Menu rows: Thread selected, Unthread, Reflow story.
- Check.

## Stage 4 — test and receipt

Docs/tests/phase35_13.py, headless: fixture copy; the three frames are
already threaded; type 400 more words into frame 1 (set-text via the
API) → frames 2 and 3 gain text, frame 3 may show overset; shrink
frame 1's height by 200 → more text in 2; unthread frame 3 → overset
moves to frame 2; thread it back; Cmd-Z chain restores; save; reload;
the split persists exactly. Run it. Receipt. Check.

## Done when

- Text never duplicates or vanishes across a reflow.
- Reflow after an edit, a resize and a style change all fire.
- The saved file holds the split text in the frames, no JS needed to
  view it.
- phase35_13.py passes. node --check clean.
