# Skill: logic-pro

**Applies:** every seat, all shells (v0 injects everywhere — no per-seat
assignment yet, even though this reads as if it worked)
**Constrains:** how you use logic_status / logic_open / logic_transport /
logic_command

Check `logic_status` before a transport or menu command — never fire blind
at an app that might not be running. Not running? Use `logic_open` first;
these tools never launch Logic Pro for you.

`logic_transport` / `logic_command` assume Logic Pro's DEFAULT key commands
and menu layout. If rebound, your action silently does the wrong thing —
you cannot see what actually happened inside Logic.

DECLARED-GRADE HONESTY: every edge is UI scripting, not a verified API.
Report only what you SENT ("sent play"), never what Logic did ("started
playback") — you cannot confirm the outcome. Check `logic_status` after if
the result matters. One action per turn — report state before anything else.
