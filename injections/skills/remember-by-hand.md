# Skill: remember-by-hand

**Applies:** every seat with an agent folder, all shells
**Constrains:** how to file a memory manually with write_file

This is the manual filing path.

Step 1: write your full memory as a new file in your memories folder, named
with today's date and a short dashed slug (example:
`2026-07-06-first-shared-room.md`), using write_file.

Step 2: update your index — READ your `agentmemory.md` first, then write_file
it back with ALL existing lines kept plus your new line appended at the end,
in the shape `- [Title](memories/<filename>) — one-sentence summary`.

Warning: write_file REPLACES the whole file — if you drop existing lines when
rewriting the index, they are gone.
