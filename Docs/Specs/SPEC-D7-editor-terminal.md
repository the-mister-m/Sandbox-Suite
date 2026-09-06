# SPEC D7 — Editor and Terminal

Wave 4. Front end. Sonnet. Ceiling 150 thousand tokens. Receipt before
250. Scope: Docs/Scope/SCOPE-phase2-build.md. Read it first. Then
Docs/Reports/RECEIPT-D5-matrix.md for the frame contract.

```
WAVE 3   Job 4 ─ Job 5  done
              │
         ┌────┼─────────┐
WAVE 4   Job 6  [Job 7 YOU]  Job 8
         └────┴─────────┘
CLOSE    Job 9
```

Job 6 and Job 8 run beside you. You own editor and terminal. Nothing
else. No server files.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language.
- Stay in your lane.
- Rewrites against the widget frame, not ports. The old panes in
  Docs/reference/ide-panes/editor.js and terminal.js are reference only.
- Add nothing not in this spec or the scope.

## LANE

- static/js/widgets/editor/, new
- static/js/widgets/terminal/, new

## PART 1 — EDITOR

Start from the stub in Job 5's receipt. Each editor instance is
independent: its own Monaco instance, its own path, its own content.
Two editors in one grid do not share state.

- Monaco from the vendored copy in static/vendor/monaco. Create the
  instance after the frame's host is attached; the old pane's comment
  about attached nodes still holds.
- Language from the file extension, the way the old pane guessed it.
- True markdown: a markdown file opens with a rendered view beside the
  source, toggled from the widget bar.
- Save opens the macOS browser save dialog. Use the browser's file
  system access API for the dialog. The chosen path then goes through
  the existing save frame. No custom directory picker.
- Exit with unsaved content prompts a save modal: Save, Discard, Cancel.
  Exit means closing the widget or closing the window.
- The confirm diff the old pane drew before overwrite stays: line diff
  of loaded content against current content, shown in the save modal
  when the target is the loaded file.

## PART 2 — TERMINAL

Start from the stub. Each terminal instance is independent, with its
own shell process through the existing term frames. More than one
terminal window at once. Closing a widget ends its shell.

## RECEIPT

Docs/Reports/RECEIPT-D7-editor-terminal.md. Sections: EDITS, DELETED,
TESTS, QUESTIONS, PHASE 3, STRAY FILES.
