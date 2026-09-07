# CHECKLIST — Phase 3 redpen — Sandbox Suite

Manual checklist. Brandon ticks each box by hand, one click or look per line.

## Retirement (E14)

- [ ] Load /matrix — no console error naming a deleted ade file
- [ ] Visit /ade — 404
- [ ] Visit /ade/ledger — 404
- [ ] Visit /ade/retired — 404
- [ ] Visit /ade/arrange — 404

## Phase 3 user functions (cleanup scope)

- [ ] Timeline shows agent interaction as subway-map lines with notches, from messages/diffs
- [ ] Arrange: left side panel collapses/expands for phases
- [ ] Arrange: track pane mirrors timeline/mode, edits track/region, jumps to job via map icon
- [ ] Arrange: nodes are jobs, visualizing past/current/future work and loops
- [ ] Arrange: mapdocs library imported into the view
- [ ] Arrange: edges/notches driven by messages/changes/queue; nodes show track/region info + reset count + notes; notches show files/git; edges show shared files/messages
- [ ] Messages widget works the same as before the port
- [ ] Changes widget works the same as before the port
- [ ] Queue widget works the same as before the port
- [ ] Ledger widget works the same as before the port
- [ ] Transcripts widget works the same as before the port
- [ ] Multi-agent redpen run: this checklist can be run bullet by bullet
- [ ] Multi-agent redpen run: multi-agent workflow runs end to end

## Widget acceptance — E5 matrix chrome

- [ ] Add-widget picker draws one column per registry type
- [ ] Agent strip: one chip per track, popover opens, kill button stops the track
- [ ] Session rung: corner button opens a panel, drags to any of the four edges, shows session id/name/root, Set root and settings controls save

## Widget acceptance — E6 devagent

- [ ] Tree lists tracks/regions, dot fill reflects track status
- [ ] Add track and add region both work from the tree
- [ ] Track rung: name/root/order fields save, context textarea loads and saves
- [ ] Region rung settings tab: rail params, model picker, change_prompt choices all work
- [ ] Region rung context tab: textarea loads, unlocks, saves

## Widget acceptance — E7 chat and gate list

- [ ] Anchor chat: pane sends/receives, binds to a region, re-anchors on region change
- [ ] Anchor chat: Send and Stop both work
- [ ] Gate list: pending gates show and can be settled

## Widget acceptance — E8 timeline

- [ ] Timeline widget shows the same markup and interaction as the old timeline view

## Widget acceptance — E9 queue log

- [ ] Queue log: rows/columns match the old queuelog, same localStorage column key
- [ ] Cache TTL and exclude-dynamic toggles work

## Widget acceptance — E10 ledger

- [ ] Ledger: rows/columns/sort match the old ledger view
- [ ] mx:open-ledger event focuses/opens/flashes the right row

## Widget acceptance — E11 changes

- [ ] Changes widget shows the same markup as before
- [ ] Jump button and diff-line clicks open the right ledger row

## Widget acceptance — E12 messenger

- [ ] Messenger: roster updates from track_list
- [ ] Send, mute, and read all work

## Widget acceptance — E13 transcript

- [ ] Transcript widget lists live regions then retired regions, with caches under each
- [ ] Opening a cache renders turns
- [ ] Suite page: Transcripts toggle on adds a per-row transcripts link; toggle off restores the row
