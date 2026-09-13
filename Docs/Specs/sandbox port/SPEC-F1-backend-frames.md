# SPEC F1 — Backend frames

Goto agent. Ceiling 100 thousand tokens. Receipt before 130. Comments are
label, function, state only. "spine" is a banned word. No README files.

Read in this order, nothing else:

1. This spec.
2. ade/frames.py, whole file.
3. ade/web_io.py lines 60 to 130.
4. ade/tracks.py lines 1571 to 1620.

## 1. FRAME TABLE

Write `Docs/HOWTO-frames.md`. Drawn from `handle()` in frames.py and the
`send_*` methods in web_io.py. Nothing invented.

Two tables.

**Client to server.** One row per `t ==` branch in `handle()`:

| frame | fields read | replies to sender | broadcast to environment | roster fires | parks behind change prompt |

**Server to client.** One row per `send_*` method in web_io.py:

| frame | fields | who sends it (frames.py line or tracks.py listener) |

Note above the tables: `inst` is echoed on replies that carry it. The
roster listener in tracks.py fires `track_list` after reset and after
region replacement, outside `handle()`.

## 2. THREE EDITS IN frames.py

**Change prompt broadcasts.** `_send_change_prompt` reaches only the socket
that asked. Change it to reach every socket on the environment, the way
`_roster()` does. Signature becomes `_send_change_prompt(ctx, region_id,
token, action, items)` and the body calls `_broadcast(ctx.environment,
"_send", payload)`. Three call sites: edit_track, load_preset, save_preset.
A second answer on a taken token already prints "unknown token" and stops.
That is fine. Say so in the HOWTO row.

**Create returns the row.** `create_track` sends `track_created` only when a
region was made. Send it every time. In web_io.py `send_track_created`
draws `_region_row(region)` and must accept `region=None`:
`"track": _region_row(region) if region is not None else None`. Widgets
already guard on `msg.track`.

**Load preset takes a mode.** `load_preset` always parks. Read
`msg.get("mode")`. If it is `"reset"` or `"in_place"`, call
`_do_load_preset(track, name, mode=mode)`, print its warnings through
`webio.out` the way `change_answer` does, then `_roster()`. No prompt.
Any other value keeps today's path.

## 3. CHECK

- `python3 -c "import ade.frames, ade.web_io"` from the project root.
- If `Docs/tests/` runs under one minute with `python3 -m pytest Docs/tests -q -x`, run it. Report pass or fail. Do not fix tests.

## 4. NOT IN SCOPE

- Any widget file.
- tracks.py edits.
- Any handler not named above.

## 5. RECEIPT

`Docs/Reports/RECEIPT-F1-backend-frames.md`, session review format from the
global rules. Add one line to `INDEX.md` for the HOWTO and one for the
receipt. Append one block to `SESSIONLOG.md`: what changed, links. Do not
touch MEMORY.md or CLAUDE.md.

If blocked, write what you have to the receipt and end your turn with
`BLOCKED: <one question>`.
