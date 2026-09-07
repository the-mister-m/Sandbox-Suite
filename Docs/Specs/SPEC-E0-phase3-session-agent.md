# SCOPE — Phase 3 session agent — Sandbox Suite

Written 2026-09-06 by the Phase 3 scoping session agent (Fable). For the
session agent that runs Phase 3. Brandon gates every wave.

## What Phase 3 is

Port the old ADE views onto the new backend as matrix widgets, after the
backend is fixed. Old UI is the design. Swap only the wire. The Phase 2
widgets stay registered beside the ports. Arrange is out of Phase 3.

## How to run it

- Every job is one Goto subagent with a model override. Sonnet unless the
  spec header says opus.
- Spawn a wave, wait for every receipt, show Brandon, then the next wave.
- A spec names its read list with byte sizes. The builder reads that and
  nothing else. If a builder needs more, it stops and asks through you.
- Receipts land in Docs/Reports/RECEIPT-E<n>-<name>.md before the builder
  passes 200K tokens. A spec that needs work after a big read says so.
- Code comments: label, function, state only.
- Every write by a builder is visible in the receipt. No INDEX.md or
  SESSIONLOG.md edits by builders; you append one line per receipt.
- The closer runs at the end of the phase, not per wave.

## Waves

```
WAVE 1  E1 root          E2 ledger                        sonnet, parallel
WAVE 2  E3 lifecycle     E4 archives + context            sonnet, parallel
WAVE 3  E5 chrome        E6 devagent     E7 chat + gate list   sonnet, parallel
WAVE 4  E8 timeline (opus)  E9 queue  E10 ledger  E11 changes  E12 messenger
WAVE 5  E13 transcript                                    sonnet
WAVE 6  E14 retire + redpen checklist                     sonnet
```

Wave 3 and 4 jobs each own one widget folder and append one registry row.
Nothing else in static/js/matrix is theirs unless the spec says so.

## Specs

- Docs/Specs/SPEC-E1-session-root.md
- Docs/Specs/SPEC-E2-ledger-per-session.md
- Docs/Specs/SPEC-E3-lifecycle.md
- Docs/Specs/SPEC-E4-archives-context.md
- Docs/Specs/SPEC-E5-matrix-chrome.md
- Docs/Specs/SPEC-E6-devagent.md
- Docs/Specs/SPEC-E7-chat-gatelist.md
- Docs/Specs/SPEC-E8-timeline.md
- Docs/Specs/SPEC-E9-queue.md
- Docs/Specs/SPEC-E10-ledger.md
- Docs/Specs/SPEC-E11-changes.md
- Docs/Specs/SPEC-E12-messenger.md
- Docs/Specs/SPEC-E13-transcript.md
- Docs/Specs/SPEC-E14-retire.md

## Decisions Brandon made this session

- Root cascades: global default ~/Desktop, then session root set from the
  file browser and cascading to every track and region, then a track may
  diverge, then a region may diverge.
- Shutdown Suite shows one line per live session: name field, save
  checkbox, date and time. Saved sessions are archived, the rest dropped.
- Date and time show on every saved session anywhere it is listed.
- Global toggle, session override only, for archives as the library home.
  Transcripts are saved on our side.
- The old track settings modal is not needed. Devagent edits in place.
- Context files open in a read-only textarea inside devagent. Unlock makes
  it editable, Save writes through the save frame, then it locks again.
- Region settings on devagent are filtered to the rail. Unwired keys show
  greyed with their reason.
- The session rung lives on a matrix corner button beside Settings, expand
  and collapse, draggable around the perimeter.
- Agent strip stays exactly as it is.
- Old chat comes over detached from the gate list below it. Both become
  widgets. Old and new both stay registered.
- Add-widget picker shows one column per type.
- Queue vocabulary and web_io vocabulary stay separate for the port.
- Arrange waits. It merges with the map editor in Phase 4.

## Open, decided after a build

- Per-session save on the shutdown modal is built. All-or-nothing is the
  easy switch if Brandon wants it back.
- claude_mode and claude_partial are on devagent. Brandon decides after
  driving whether they stay.
- Picker column shape is a guess. Brandon checks it in wave 3.
- Follow mode on the ported chat is a blocker item in E7.
- One region per track on the old timeline, against a backend that allows
  many, is a blocker item in E8.

## Where the audit lives

Docs/Reports/SESSION-REVIEW-2026-09-06-phase3-scope.md, AUDIT section.
The findings became the E1 through E4 specs. No separate report.

## Read this only when a spec is silent

- MEMORY.md, DURABLE FACTS.
- static/js/matrix/widget-frame.js, 6 KB, the widget contract and binding.
- static/js/matrix/session-panel.js, 6 KB, the corner buttons.
- static/js/suite/suite.js, 15 KB, the Suite page controls.
- No Phase 2 spec, receipt, or handoff. The code is the map.
