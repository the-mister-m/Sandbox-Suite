SESSION REVIEW — Sandbox Suite — 2026-09-13T21:14Z to 22:16Z

EDITS
- [anchor-chat.js](../../static/js/widgets/chat/anchor-chat/anchor-chat.js) — tighter spacing, pre-wrap off bubbles, zoom bar in head saved as `zoom` option, every text size scales by `--cp-zoom`
- [anchor-chat.js](../../static/js/widgets/chat/anchor-chat/anchor-chat.js) — meters: cloud regions show cache only (live, peak of the turn), local regions show ctx used/max only; provider kinds fetched from /api/library/providers
- [frames.py](../../ade/frames.py) — follow/unfollow counted per instance per socket; every follow sends transcript and gatelog; mirror drops when the last instance leaves
- [HOWTO-frames.md](../HOWTO-frames.md) — follow and unfollow rows note the per-instance count

STRAY FILES
- none

GOALS DONE
- Anchor Chat line spacing brought close to Chat
- Zoom bar on Anchor Chat
- Anchor Chat meters split cloud cache / local ctx
- Server fix for two chat widgets on one region

BRANDON'S TODOS
- Restart the server to load the frames.py change
- Reload the page to pick up Anchor Chat's injected styles
- Zoom bar on Chat — asked for, held back: changes this session were Anchor Chat only

CLOSER REVIEW
- Gets copy of review, not a contract.
- Nothing tested or run; node syntax check on anchor-chat.js only — closer
- Cache meter is the peak of the live `cached` value (cache read + cache write per call) within a turn, not the ledger's `cache_read_peak`; the meters frame carries no read-only number — Brandon
- Chat already unfollows on region change and unmount ([chat.js:228](../../static/js/widgets/chat/chat/chat.js#L228)); an earlier claim otherwise in session was wrong — closer
