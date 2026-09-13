# SPEC D3b — Socket binding, one gate vocabulary, route stubs

Wave 2, second half. Server. Opus. Ceiling 150 thousand tokens. Receipt
before 250. Scope: Docs/Scope/SCOPE-phase2-build.md. Read it first. Then
read Docs/Reports/RECEIPT-D3a-worlds.md for the function list that
gained a world argument.

```
WAVE 2   Job 3a  done
              │
         [Job 3b  YOU]
              │
WAVE 3   Job 4 ─ Job 5
              │
WAVE 4   Job 6 ─ Job 7 ─ Job 8
```

Nothing runs beside you. Job 4 and Job 5 start when your receipt lands.
They need your two page routes and your bound socket.

## RULES

- Code comments are label, function, and state only.
- Reset and persistence language.
- Stay in your lane. Files below. Nothing else.
- Add nothing not in this spec or the scope. Smallest thing, named in
  the receipt.

## LANE

- server.py: the websocket handler, the two page route stubs, the
  gate notifier
- ade/frames.py: the frame dispatcher's session lookup, the gate frames
- ade/web_io.py
- Docs/tests/test_sockets.py, new

## PART 1 — ONE SOCKET, ONE SESSION

Today /ws/ade is one viewing tab against the one world. Change the
handler so a socket opens against a session id: /ws/ade/<sid>. The
handler looks up the World in the registry, refuses with one frame if
it is missing, and binds the connection to that World for its lifetime.
Every frame the connection sends dispatches against its World. Every
broadcast a World makes reaches only sockets bound to it.

The gate notifier in server.py fans gate events to the World that owns
the region, not to every open tab.

Window count on the open-sessions row is the number of sockets bound to
that World. Fill it in the route Job 3a added.

## PART 2 — ONE GATE VOCABULARY

Two wire forms exist for approve, deny, queue: gate_action with an
action word, and answer with y, n, queue. Keep gate_action. Make the
answer form a thin translation into gate_action on the server side, so
old client code still works during wave 4, and mark the translation
with a state comment. Wave 4 widgets send gate_action only. Job 6
removes the translation when chat is rebuilt; you do not remove it.

## PART 3 — PAGE ROUTE STUBS

Two routes, serving one placeholder line each, so wave 3 can run side
by side without touching server.py again:

- GET /suite serves static/suite.html. Job 4 writes the file.
- GET /matrix/<sid> serves static/matrix.html. Job 5 writes the file.
- GET /matrix with no session id serves the same file blank. Binding
  to a session happens in the page.

Do not touch route "/". Job 4 repoints it when the Suite Page exists.

## PART 4 — TESTS

Docs/tests/test_sockets.py, offline where possible:

- Two Worlds, two sockets, one each. A broadcast on World A reaches
  socket A only.
- A socket against a missing session id gets the refusal frame.
- An answer frame with y arrives at the region as gate_action approve.

## RECEIPT

Docs/Reports/RECEIPT-D3b-sockets.md. Sections: EDITS, DELETED, TESTS,
QUESTIONS, PHASE 3, STRAY FILES. Name the socket path and the two page
routes exactly. Wave 3 copies them from your receipt.
