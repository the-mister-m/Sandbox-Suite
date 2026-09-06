<!-- The skill template (2026-07-06). A skill is written instruction a model
loads — it constrains behavior; it never acts (tools act; skills constrain).
Files starting with "_" are never injected. Copy this file to make a new
skill; keep it as short as it can be while staying unambiguous. -->

# Skill: <name>

**Applies:** <when this skill is in force — which shells, which seats>
**Constrains:** <the behavior it shapes, in one line>

<The instruction itself — written TO the model, plain prose.>

<!-- Applies is two comma-separated clauses, "<seat-scope>, <shell-scope>"
(a trailing parenthetical note is fine and ignored by the matcher):
  seat-scope:  "every seat" (all) | "every seat with an agent folder"
               (only nicks with a roster folder) | one or more nicknames
               joined with "/" (e.g. "Fable/Ratchet")
  shell-scope: "all shells" (all) | one or more shell names joined with
               "/" (e.g. "conference/private")
A skill injects only when BOTH clauses match the compiling seat. Anything
that isn't this exact two-clause shape — missing, blank, unparseable —
FAILS OPEN and injects for everyone (a parse bug must never silently strip
a seat's constraints). -->

