RECEIPT — Phase 3 test pass — Job 1, Setup — 2026-09-06

RUN COMMAND

    python3 Docs/tests/matrix_harness.py --widget anchor_chat --session 6ab8273846b3 --hold 15 --out Docs/Reports/phase3-test/

(spec agents swap --widget for their assigned registry type; --session can reuse
6ab8273846b3 or a fresh sid from POST /api/sessions/new)

SERVER CHECK

- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/matrix` → 200.
  Server was already running. Not started or restarted.

SESSION

- Created via `POST /api/sessions/new` (route at server.py:1367, `api_session_new`,
  calls `ade_tracks.new_session()`, returns `{"sid": ...}`).
- Session id: **6ab8273846b3**

MODELS CHECK — haiku / gemma4:e4B

- `injections/models/`: files present are `gemma4-31b-mxfp8.md`, `gemma4-12b-mxfp8.md`,
  `ornith-35b-q8_0.md`. No `haiku` entry. No `gemma4:e4B` / `gemma4-e4B` entry
  (closest are the 31b and 12b gemma4 variants — neither is e4B).
- `library/registry/providers.json` and `library/registry/widgets.json`: grepped
  for `haiku` and `gemma` (case-insensitive) — no matches in either file.
- Result: **both haiku and gemma4:e4B are absent from the models registry.**
  Nothing added — not asked to add.

HARNESS — Docs/tests/matrix_harness.py

What it does:
- Launches visible Chrome (`playwright.chromium.launch(channel="chrome", headless=False)`).
- Loads `/matrix/<session>`, fails (exit 1) only if that page load itself
  errors or returns a non-ok response.
- Waits for `window.MX.grid.sid` to be set (grid bound to the session) before
  mounting anything — see BLOCKERS below for why this wait was added.
- Mounts the widget by calling `window.MX.grid.addWidget(type)` directly in
  page JS. This is the same call the "New Widget" picker button makes
  (static/js/matrix/widget-picker.js:28) when a registry row's Add button is
  clicked — the harness skips the picker overlay and calls the grid API
  straight, since the task allowed either route.
- Locates the mounted element at `[data-instance="<id>"]` (grid.js sets
  `el.className = "mx-widget"` and `el.dataset.instance = inst.id` per instance).
- Captures all `console` messages and `pageerror` events from page-load
  onward into `<out>/<widget>-console.txt`.
- Screenshots the full page (`<out>/<widget>-full.png`) and the widget
  element alone (`<out>/<widget>-widget.png`).
- Holds the browser window open for `--hold` seconds (default 30), then closes.
- Prints the three output paths. Exit code 0 in all cases except the page-load
  failure above.

What it does NOT do:
- Does not fix, retry, or work around anything it finds broken.
- Does not use the on-page picker overlay UI (clicks) — uses the JS call
  instead. If a spec agent needs to prove the picker UI itself works, that's
  a separate check this harness does not make.
- Does not validate the widget's behavior beyond "did it render and did the
  console stay clean" — no interaction with the widget's own controls
  (send button, etc.).
- Does not read or touch any widget source file.

PROOF RUN — anchor_chat

- First attempt (before the grid-bind wait was added): `addWidget` returned
  an instance id, but `[data-instance="..."]` never became visible within
  10s — full-page screenshot showed only the header bar, no grid content.
  Diagnosed by hand (temporary throwaway script, not saved): the element
  existed in the DOM with a valid bounding rect once `MX.grid.sid` was set,
  but the grid clearly isn't ready to receive `addWidget` calls immediately
  on page "load". Added a `page.wait_for_function` gate on
  `window.MX.grid.sid` before calling `addWidget`. Second attempt rendered
  correctly.
- Console errors seen on the anchor_chat proof (both attempts, same line):
  `[console:error] Failed to load resource: the server responded with a
  status of 404 (NOT FOUND)`. Source of the 404 was not identified — no
  URL is given in the console text Playwright captures, and tracing it
  further would mean reading widget/network code, which is out of scope
  for this job.
- Outputs written to Docs/Reports/phase3-test/: `anchor_chat-full.png`,
  `anchor_chat-widget.png`, `anchor_chat-console.txt`.
- Widget rendered: "Anchor Chat · anchor_chat-mtqh6e7q-1" header, a message
  textarea ("Message the bound region..."), Send/Stop buttons, and an
  IDLE status row (ctx / cache / t/s / avg, all blank). No crash, no visible
  broken layout.

READS BEYOND THE LIST

None. Read rule was: grep first, read only functions the grep hits, plus
static/matrix.html. What was actually read:
- server.py — grepped for routes, then read only the `api_session_new` /
  `api_session_open` function block (lines 1367-1380ish), a grep hit.
- static/matrix.html — grepped only (script tag list, button ids), never
  opened in full.
- static/js/matrix/widget-picker.js — grepped, then read in full (it is a
  40-line file entirely inside the grep hit region).
- static/js/matrix/widget-frame.js, main.js — grepped only, read only the
  specific matched lines shown in grep output (no separate Read call).
- static/js/matrix/grid.js — grepped, then read the `addWidget` function
  block (lines ~140-160), a grep hit.
- injections/models/*.md, library/registry/*.json — listed and grepped for
  content, never opened.
- No widget source files (static/js/widgets/**) were read.
- No spec files, MEMORY.md, or CLAUDE.md were read beyond what the harness
  itself needed.

BLOCKERS FOR SPEC AGENTS

- Timing: calling `MX.grid.addWidget(type)` right after page load can mount
  a widget that never becomes visible, because the grid isn't bound to the
  session yet. The harness now waits for `window.MX.grid.sid` before
  mounting — spec agents using this harness as-is are already covered, but
  anyone calling `addWidget` a different way should add the same guard.
- Unidentified 404: every widget mount may carry a background 404 resource
  load (seen on anchor_chat). Spec agents should check their own widget's
  console dump for this line and, if it recurs across widgets, flag it as
  a shared issue rather than something per-widget.
- Models registry gap: haiku and gemma4:e4B are not in the registry. Any
  widget spec that assumes those models are selectable (e.g. anchor-chat's
  model picker) will not find them in `/api/library/models` or presets.
