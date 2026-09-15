RECEIPT — phase3.5-00 — fixture — sonnet

SESSION REVIEW — Sandbox Suite — [timestamps: ask Brandon]

EDITS
- Docs/scratchpad/phase35-magazine.html — magazine page fixture, Text + Art layers
- Docs/scratchpad/spread.master.html — master file, footer with page-number var

STRAY FILES
- Docs/Reports/phase35-00/magazine.png — verify screenshot
- Docs/Reports/phase35-00/master.png — verify screenshot

GOALS DONE
- Both files written per contract 3.1, verified through /raw/ with server up, zero console errors

BRANDON'S TODOS
- none

CLOSER REVIEW
- Fold this receipt into MEMORY.md warm start when phase3.5 continues — closer

## STAGES

- [x] Stage 1 — receipt outline
- [x] Stage 2 — phase35-magazine.html
- [x] Stage 3 — spread.master.html
- [x] Stage 4 — verify and receipt

## ELEMENT TABLE (Stage 1)

| element | layer | data-cc attrs |
|---|---|---|
| masthead h1 | Text | class cc-style-headline |
| column frame 1 | Text | class cc-style-body, data-cc-story="lead", data-cc-thread="1" |
| column frame 2 | Text | class cc-style-body, data-cc-story="lead", data-cc-thread="2" |
| column frame 3 | Text | class cc-style-body, data-cc-story="lead", data-cc-thread="3" |
| pull quote blockquote | Text | (none required) |
| caption p | Text | class cc-style-caption |
| image frame div + img | Text | (none required) |
| svg rect | Art | (none) |
| svg ellipse | Art | (none) |
| svg line | Art | (none) |
| svg polygon | Art | (none) |
| svg path (d, 4+ commands) | Art | (none) |
| footer p (master file) | Master | span data-cc-var="page-number" |

## PICKS I MADE

- Masthead h1 overlaps top margin full-bleed (left:0 width:816), the
  one allowed exception per spec. All other Text elements stay inside
  the 48px margins.
- All three .cc-style-* rules marked data-cc-style-kind="paragraph" —
  none are character- or object-level styles in this fixture.
- Art layer left unlocked/unhidden — spec's stage 2 bullet for Art
  doesn't require data-cc-locked; contract 3.1's locked Art is shown
  as an illustrative example, not a stage-2 requirement.
- SVG shapes in Art allowed to bleed past the page margins (a page
  border rect at 24px inset, a line near the top). The "nothing
  overlaps the margins except the masthead" rule read as scoped to
  the Text layer's absolutely-positioned divs, since SVG shapes don't
  use left/top/width/height inline styling the way that bullet
  describes.
- Path `d` uses M, L, C, Z — four explicit commands, satisfies "at
  least four commands."
- Masthead needed top:30px + line-height:1.2 (not top:0) so cap
  height didn't clip at the page's own top edge — pure CSS metrics,
  not a margin/layer issue.

## CONTRACT FIELDS ADDED

- none — job 0 owns no contract fields, fixture only.

## STUCK

- none
