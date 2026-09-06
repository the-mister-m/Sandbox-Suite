
import json
import os
import threading
import uuid
import queue

from engine import agent_loop
from engine import ledger
from shells import turn_gate
from shells.conference import persistence as rp


class RoomHub:

    def __init__(self):
        self._lock          = threading.Lock()
        self._members       = {}
        self._guest_counter = 0
        self._answer_queue    = queue.Queue()
        self._pending_gate_id = None


    def add(self, webio, label):
        with self._lock:
            self._members[webio] = label

    def remove(self, webio):
        with self._lock:
            self._members.pop(webio, None)

    def empty(self):
        with self._lock:
            return not self._members

    def next_guest_label(self):
        with self._lock:
            self._guest_counter += 1
            return f"guest-{self._guest_counter}"


    def _fanout(self, name, *args, **kwargs):
        with self._lock:
            members = list(self._members.items())
        for m, label in members:
            try:
                getattr(m, name)(*args, **kwargs)
            except Exception as e:
                print(f"[RoomHub._fanout] {name} failed for member '{label}': {e}")

    def out(self, text="", *, dim=False, end="\n"):
        self._fanout("out", text, dim=dim, end=end)

    def meters(self, d):
        self._fanout("meters", d)

    def term(self, data):
        self._fanout("term", data)

    def status(self, phase):
        self._fanout("status", phase)

    def turn_start(self):
        self._fanout("turn_start")

    def send_room_init(self, participants, mode):
        self._fanout("send_room_init", participants, mode)

    def send_room_entry(self, entry):
        self._fanout("send_room_entry", entry)

    def send_room_reset(self):
        self._fanout("send_room_reset")

    def send_room_status(self, model, phase):
        self._fanout("send_room_status", model, phase)

    def send_gate_history(self, entries):
        self._fanout("send_gate_history", entries)

    def send_room_queue(self, bids):
        self._fanout("send_room_queue", bids)


    def ask(self, prompt):
        gid = uuid.uuid4().hex[:8]
        with self._lock:
            self._pending_gate_id = gid
        self._fanout("_send", {"type": "ask", "prompt": prompt, "id": gid})
        answer = self._answer_queue.get()
        with self._lock:
            self._pending_gate_id = None
        return answer

    def resolve_gate(self, gid, text):
        with self._lock:
            active = self._pending_gate_id
        if active and (gid is None or gid == active):
            self._answer_queue.put(text)
            return True
        from engine import daemon_queue as dq
        if gid:
            entry = dq.find(gid)
            if entry is not None and entry.get("outcome") is None:
                _t = str(text).strip().lower()
                if _t in ("queue", "defer"):
                    dq.defer_gate(gid)
                    self.out("[parked — the model is waiting; approve from the Ledger]",
                             dim=True)
                else:
                    dq.answer_gate(gid, _t in ("y", "yes"))
                return True
        return False


class RoomCtx:

    def __init__(self, hub, webio, room):
        self.hub          = hub
        self.webio         = webio
        self.room          = room
        self.turn_thread   = None
        self.sess          = getattr(room, "_coord_sess", None)


ROOM_OWNED = {"/remember", "/harvest"}

ROOM_BLOCKED = {
    "/model":   "models are per-seat here — add or remove one from the roster",
    "/save":    "that would save the coordinator's empty session, not this room — use the room's save",
    "/load":    "that loads a session, not a room — use the room's load",
    "/new":     "that clears the coordinator's empty session, not this room",
    "/trim":    "that trims the coordinator's empty session, not this room",
    "/history": "that prints the coordinator's empty session, not this room",
}


class _CmdEcho:

    def __init__(self, webio):
        self._w = webio

    def out(self, text="", *, dim=False, end="\n"):
        if not str(text).strip():
            return
        self._w.out(text, dim=True, end="\n")

    def __getattr__(self, name):
        return getattr(self._w, name)


class _CmdSession:

    def __init__(self, sess, io):
        object.__setattr__(self, "_sess", sess)
        object.__setattr__(self, "io", io)

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_sess"), name)

    def __setattr__(self, name, value):
        setattr(object.__getattribute__(self, "_sess"), name, value)


def _room_command(ctx, text):
    webio, room = ctx.webio, ctx.room
    sess  = _CmdSession(room._coord_sess, _CmdEcho(webio))
    parts = text.split()
    name  = parts[0]

    if name in ROOM_BLOCKED:
        webio.out(f"[{name} does nothing in a room — {ROOM_BLOCKED[name]}]", dim=True)
        return

    if name == "/killswitch" and parts[1:2] != ["server"]:
        room._stop_flag.set()
        webio.stop_requested.set()

    try:
        if not agent_loop.handle_command(sess, text):
            webio.out(f"[unknown command: {text}]", dim=True)
    except SystemExit:
        webio.out("[/quit ignored on web — just close the tab]", dim=True)
    except Exception as e:
        webio.out(f"[command error: {e}]", dim=True)

    if name == "/help":
        webio.out("  room: /remember   (roster + save/load are buttons, not commands)")

    webio.send_settings(dict(sess.settings))


def handle(ctx, msg):
    if not hasattr(ctx, "pending"):
        turn_gate.attach(ctx, _dispatch)
    text = msg.get("text", "") or ""
    is_slash = msg.get("type") == "user" and text.startswith("/")
    panic_slash = is_slash and text.split()[0] not in ROOM_OWNED
    if panic_slash:
        ctx.dispatch(msg)
        return
    if turn_gate.gate(ctx, msg, force=is_slash):
        return
    ctx.dispatch(msg)


def _dispatch(ctx, msg):
    hub, webio, room = ctx.hub, ctx.webio, ctx.room

    if msg["type"] == "answer":
        hub.resolve_gate(msg.get("id"), msg["text"])

    elif msg["type"] == "stop":
        webio.stop_requested.set()

    elif msg["type"] == "user":
        text = msg["text"]

        if text.startswith("/") and text.split()[0] not in ROOM_OWNED:
            _room_command(ctx, text)
            return

        webio.stop_requested.clear()
        room._stop_flag.clear()

        def _run(t=text):
            try:
                room.handle_message(t)
            except Exception as e:
                webio.out(f"[room error: {e}]", dim=True)

        turn_gate.spawn_turn(ctx, _run)

    elif msg["type"] == "room_queue_dispatch":
        model = msg.get("model", "")
        webio.stop_requested.clear()
        room._stop_flag.clear()

        def _run_dispatch(m=model):
            try:
                room.dispatch_seat(m)
            except Exception as e:
                webio.out(f"[room error: {e}]", dim=True)

        turn_gate.spawn_turn(ctx, _run_dispatch)

    elif msg["type"] == "room_add":
        room.add_participant(msg.get("model", ""), msg.get("nick", ""))

    elif msg["type"] == "room_remove":
        room.remove_participant(msg.get("model", ""))

    elif msg["type"] == "room_reorder":
        room.reorder(msg.get("order", []))

    elif msg["type"] == "room_mode":
        room.set_mode(msg.get("mode", "dictate"))

    elif msg["type"] == "turn_pass":
        room.pass_turn()

    elif msg["type"] == "turn_claim":
        room.claim_turn(msg.get("model", ""))

    elif msg["type"] == "room_stop":
        room._stop_flag.set()

    elif msg["type"] == "room_config":
        if "max_turns" in msg:  room.max_turns  = max(1, int(msg["max_turns"]))
        if "turn_delay" in msg: room.turn_delay = max(0, float(msg["turn_delay"]))

    elif msg["type"] == "room_save":
        import re as _re
        name  = msg.get("name", "")
        clean = _re.sub(r'[^\w\-]', '-', name)[:80].strip('-')
        if not clean:
            webio.out("[room_save: invalid name]", dim=True)
        else:
            rp.persist_room(room, clean)
            webio.out(f"[room saved -> {clean}]", dim=True)

    elif msg["type"] == "room_load":
        import re as _re
        name = msg.get("name", "")
        if not _re.fullmatch(r'[\w\-]+', name):
            webio.out("[room_load: invalid name]", dim=True)
        else:
            path = os.path.join(rp.rooms_dir(), f"{name}.json")
            if os.path.isfile(path):
                with open(path) as fh:
                    data = json.load(fh)
                room.restore(data)
            else:
                webio.out(f"[room not found: {name}]", dim=True)

    elif msg["type"] == "ledger_list":
        webio.send_ledger_state(ledger.snapshot(),
                                sid=getattr(ctx.sess, "sid", None))

    elif msg["type"] == "ledger_action":
        ledger.apply_action(msg.get("action"), msg.get("id"), msg.get("payload"))
        webio.send_ledger_state(ledger.snapshot(),
                                sid=getattr(ctx.sess, "sid", None))

    elif msg["type"] == "ledger_detail":
        webio.send_ledger_detail(ledger.detail(msg.get("id", "")))
