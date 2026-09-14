
import json
import queue
import threading
import uuid

from engine import daemon_queue as dq

MODAL_MAX = 200_000


class WebIO:

    def __init__(self, ws):
        self.ws = ws
        self.stop_requested = threading.Event()
        self._send_lock = threading.Lock()
        self._receiver_thread = threading.current_thread()
        self._gate_lock    = threading.Lock()
        self._gate_cv      = threading.Condition(self._gate_lock)
        self._gate_pending = []
        self._gate_active  = None

    def out(self, text="", *, dim=False, end="\n"):
        # state: raw member copy removed, mirror carries this stream
        pass

    def turn_start(self):
        pass

    def _send(self, frame):
        with self._send_lock:
            try:
                self.ws.send(json.dumps(frame))
            except Exception:
                pass  # socket already closed on the client's side

    def ask(self, prompt, region=""):
        gid  = uuid.uuid4().hex[:8]
        slot = queue.Queue(maxsize=1)
        with self._gate_cv:
            self._gate_pending.append({"id": gid, "prompt": prompt, "slot": slot,
                                       "region": region})
            self._push_pending_locked()
            while (self._gate_active is not None
                   or not self._gate_pending
                   or self._gate_pending[0]["id"] != gid):
                self._gate_cv.wait()
            self._gate_pending = [p for p in self._gate_pending if p["id"] != gid]
            self._gate_active  = {"id": gid, "prompt": prompt, "slot": slot,
                                  "region": region}
            self._push_pending_locked()
        self._send({"type": "ask", "prompt": prompt, "id": gid, "region": region})
        answer = slot.get()
        with self._gate_cv:
            self._gate_active = None
            self._advance_locked()
            self._gate_cv.notify_all()
            self._push_pending_locked()
        return answer


    def assert_off_receiver(self):
        if threading.current_thread() is self._receiver_thread:
            raise RuntimeError(
                "gate wait on the receiver thread — this deadlocks: spawn the "
                "turn on an agent thread (MAP.md §Threading)")

    def post_gate(self, gid, prompt, region=""):
        with self._gate_cv:
            if any(p["id"] == gid for p in self._gate_pending) or \
               (self._gate_active and self._gate_active["id"] == gid):
                return
            self._gate_pending.append({"id": gid, "prompt": prompt, "slot": None,
                                       "region": region})
            self._advance_locked()
            self._push_pending_locked()

    def gate_resolved(self, gid):
        with self._gate_cv:
            self._gate_pending = [p for p in self._gate_pending if p["id"] != gid]
            if (self._gate_active and self._gate_active["id"] == gid
                    and self._gate_active.get("slot") is None):
                self._gate_active = None
            self._advance_locked()
            self._gate_cv.notify_all()
            self._push_pending_locked()

    def _advance_locked(self):
        if self._gate_active is not None or not self._gate_pending:
            return
        if self._gate_pending[0].get("slot") is not None:
            return
        head = self._gate_pending.pop(0)
        self._gate_active = head
        prompt = head["prompt"]
        if len(prompt) > MODAL_MAX:
            prompt = (prompt[:MODAL_MAX]
                      + f"\n…[+{len(head['prompt']) - MODAL_MAX} more — open the record]")
        self._send({"type": "ask", "prompt": prompt, "id": head["id"],
                    "region": head.get("region") or ""})

    def resolve_gate(self, gid, text):
        with self._gate_cv:
            active = self._gate_active
        if not active or (gid is not None and active["id"] != gid):
            return False
        if active.get("slot") is not None:
            active["slot"].put(text)
            return True
        with self._gate_cv:
            if self._gate_active is active:
                self._gate_active = None
            self._advance_locked()
            self._gate_cv.notify_all()
            self._push_pending_locked()
        _t = str(text).strip().lower()
        if _t in ("queue", "defer"):
            dq.defer_gate(active["id"])
            self.out("[parked — the model is waiting; approve from the Ledger]",
                     dim=True)
        else:
            dq.answer_gate(active["id"], _t in ("y", "yes"))
        return True

    def reorder_gates(self, order):
        with self._gate_cv:
            index = {p["id"]: p for p in self._gate_pending}
            newp  = [index[i] for i in order if i in index]
            for p in self._gate_pending:
                if p["id"] not in order:
                    newp.append(p)
            self._gate_pending = newp
            record_ids = [p["id"] for p in newp if p.get("slot") is None]
            self._push_pending_locked()
            self._gate_cv.notify_all()
        if record_ids:
            dq.reorder(record_ids)

    # every pending row names the region its gate belongs to
    def _push_pending_locked(self):
        pending = [{"id": p["id"], "prompt": p["prompt"],
                    "region": p.get("region") or ""} for p in self._gate_pending]
        active  = ({"id": self._gate_active["id"],
                    "prompt": self._gate_active["prompt"],
                    "region": self._gate_active.get("region") or ""}
                   if self._gate_active else None)
        self._send({"type": "gate_pending", "pending": pending, "active": active})

    def event(self, evt):
        self._send({"type": "activity", "event": evt})

    def send_activity_log(self, events):
        self._send({"type": "activity_log", "events": events})

    def send_settings(self, settings):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "settings", "settings": settings}))

    def meters(self, d):
        # state: raw member copy removed, mirror carries this stream
        pass

    def tool(self, row):
        # state: mirror carries this stream
        pass

    # shell is the tab's own PTY key; region is the PTY's region
    def term(self, data, shell="", region=""):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "term", "data": data,
                                     "shell": shell, "region": region}))

    def speak(self, text, *, engine="browser", voice=""):
        if not text.strip():
            return
        if engine in ("browser", "say"):
            with self._send_lock:
                self.ws.send(json.dumps({"type": "speak", "text": text, "voice": voice}))
            return
        import base64, speech
        audio, mime = speech.synthesize(text, engine=engine, voice=voice)
        if audio is None:
            self.out(mime, dim=True); return
        with self._send_lock:
            self.ws.send(json.dumps({"type": "audio",
                                     "data": base64.b64encode(audio).decode(), "mime": mime}))

    def status(self, phase):
        # state: raw member copy removed, mirror carries this stream
        pass

    def send_models(self, rows, current):
        # rows carry id/provider/model/version; list stays for phase 2 JS
        rows = list(rows or [])
        with self._send_lock:
            self.ws.send(json.dumps({"type": "models",
                                     "list": [r["id"] for r in rows],
                                     "rows": rows,
                                     "current": current}))

    def send_gate_history(self, entries):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "gate_history", "entries": entries}))

    def send_transcript(self, messages):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "transcript", "messages": messages}))

    def send_session_ack(self, name):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "session_save_ack", "name": name}))

    def send_queue_state(self, pending):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "queue_state", "pending": pending}))

    def send_log_tail(self, lines):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "log_tail", "lines": lines}))

    def send_ledger_state(self, records, sid=None):
        self._send({"type": "ledger_state", "records": records, "sid": sid})

    def send_ledger_detail(self, detail, inst=""):
        self._send({"type": "ledger_detail", "detail": detail, "inst": inst})
