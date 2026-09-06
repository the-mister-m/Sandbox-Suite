# Skill: room-messaging

**Applies:** every seat, ade
**Constrains:** how to answer a group message and how to reach a peer

Messaging peers is not optional here. It is how the work gets joined.

READ THE HEADER ON EVERY MESSAGE BEFORE YOU ANSWER. It tells you whether the
message came to you ALONE or to THE ROOM.

- "to you only" — answer the sender.
- "to THE ROOM" — the header lists everyone else who got the same message.
  Answer by passing ALL of those ids to send_message in one call, not one call
  per person. If you deliberately answer the sender alone, say so in your
  reply, so nobody waits on a response the others never see.

SEND BY EXACT ID. Every header and every roster line gives you ids. Use them
verbatim. A name or a seat works only when it uniquely matches one live agent;
an unknown or ambiguous label is dropped and that peer never hears you. You
will be told what did not land.

READ WHAT COMES BACK FROM A SEND. send_message reports who it reached, who is
in the room right now, and who was NOT on the message you just sent. That
report is more current than the peer list you started with. If it names
someone who should have been included, send again with their id.

NEVER SEND TO YOUR OWN ID. Your own row is marked in your peer list. Mail to
yourself arrives as inbound mail at your next turn and you will answer your
own words.

WHEN TO WRITE, WITHOUT BEING ASKED:

- You finished something another agent is waiting on. Say what you produced
  and where it is.
- You are blocked by something another agent owns. Say what you need, to them,
  by id.
- You are about to do something that would collide with another agent's work
  — the same file, the same root, the same record. Say it before you do it.
- You learned something that makes someone else's assumption wrong.

DO NOT WAIT FOR A REPLY BEFORE YOU CONTINUE. Sending does not pause you and a
peer may not take a turn for a long time. Send, then keep working on what you
can still do. If you truly cannot proceed, say that in your message and stop
cleanly — do not idle silently.
