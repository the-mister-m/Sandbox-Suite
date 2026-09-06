# SPEC D5 — Matrix Window, Widget Frame, Matrix Templates

Wave 3. Front end. Opus. Ceiling 180 thousand tokens. Receipt before
250. Scope: Docs/Scope/SCOPE-phase2-build.md. Read it first. Then
Docs/Reports/RECEIPT-D3b-sockets.md for the socket path and page route.

```
WAVE 2   Job 3a ─ Job 3b  done
              │
         ┌────┴────┐
WAVE 3   Job 4  [Job 5 YOU]
         └────┬────┘
WAVE 4   Job 6 ─ Job 7 ─ Job 8
```

Job 4 runs beside you and owns static/suite.html and static/js/suite/.
You do not touch those. Wave 4 mounts six widgets into your frame. If
your frame contract is wrong, three jobs fail. That is why a stub widget
ships with you.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language.
- Stay in your lane. Files below. Nothing else.
- Two corner buttons. Not three. Not four. Settings and Context corner
  buttons are Phase 3 and already in the handoff.
- Add nothing not in this spec or the scope.

## LANE

- static/matrix.html, new
- static/js/matrix/, new
- static/css/matrix.css, new
- server.py: one labeled block, matrix template routes only
- library/matrix-templates/, new folder
- Docs/tests/test_matrix_templates.py, new

## PART 1 — THE WINDOW

/matrix opens blank. /matrix/<sid> opens bound. A blank window shows a
session picker built from /api/sessions/open plus a New Session entry.
Picking binds: the page opens the socket at the path Job 3b named, with
that session id. One session may have any number of matrix windows on
any number of screens. Two windows on one session both stay live.

The grid: widgets sit in a grid. Every border between widgets drags to
resize. Each widget carries a move button; holding it lifts the widget
and drops it into a new slot, the way an Android home screen moves an
icon. Nothing else on the widget is a drag handle.

Two corner buttons:

- Session: opens a panel. Top half is the bound session: name, saved
  state, and Save, Save Session Template, Save Matrix Template, End. End
  opens the modal with Save, End, Cancel. Save Session Template calls
  the session template save from Job 1 through the frame Job 1 added.
  Bottom half lists every open session from /api/sessions/open with how
  many matrix windows are open on each. Click one and this window
  switches to that session: the socket closes, a new socket opens at
  the new session id, the grid stays, every widget rebinds. A blank
  window's session picker is this same list.
- New Widget: opens the widget selection page. It reads the widget
  registry from Job 1 through a route you add or the settings route
  that exposes it. One entry per type. Pick one, a new instance mounts
  into the grid with its options at widget_defaults for that type.

Grid state lives with the matrix window. Persist it in the browser
under a key that includes the session id, so two windows on one session
each keep their own layout. It is not on the session tier and it is not
in the session archive.

## PART 2 — THE WIDGET FRAME

Every widget is an independent instance mounted into a frame the grid
owns. The frame gives a widget: a host element, the bound session id,
a send function for frames, a subscribe function for incoming frames
filtered to what the widget asked for, and an options object. The
frame contract is mount, unmount, onFrame, and getOptions. Write it in
one file, static/js/matrix/widget-frame.js, with a header comment that
is label and function only.

Each widget has its own options panel, opened from a button on the
widget's own bar, separate from the corner buttons. Options are per
instance. Closing a widget discards its options. Opening a new one of
the same type starts at widget_defaults again. No carryover.

Ship a stub widget, type stub, that mounts, shows its instance id and
options, saves an option change, unmounts, and remounts with defaults.
It is in the registry during wave 3 and removed from the registry by
Job 9. Wave 4 copies the stub to start each real widget.

## PART 3 — MATRIX TEMPLATES

A matrix template is one window's grid and widget list: slot layout,
widget types, and each instance's options at save time. Separate from
session templates. Save from the Session panel with a Save Matrix
Template button beside Save Session Template. Files go to
library/matrix-templates/<name>.json. Routes in server.py: list, read,
write, delete, in one labeled block. Loading a matrix template into a
blank or bound window replaces the grid with the template's layout and
mounts each widget fresh.

Job 4's library draws the matrix templates tab from your list route.
Name the route in your receipt.

## PART 4 — TESTS

Docs/tests/test_matrix_templates.py: write, list, read, delete a
template file through the routes. The window and frame are checked by
hand in Job 9.

## RECEIPT

Docs/Reports/RECEIPT-D5-matrix.md. Sections: EDITS, DELETED, TESTS,
QUESTIONS, PHASE 3, STRAY FILES. State the frame contract in four
lines. State the matrix template routes. Wave 4 copies both from your
receipt.
