
import json
import os
import threading
import time

from engine import SUITE_ROOT

WAYPOINT_PATH = os.path.join(SUITE_ROOT, "waypoint.jsonl")


def _now_ms():
    return int(time.time() * 1000)


class Waypoint:

    def __init__(self, path=None):
        self.path = path or WAYPOINT_PATH
        self._lock = threading.Lock()
        self._waiting = {}
        self._next_id = 1
        self._nudger = None
        self._track_prober = None
        self._track_resolver = None
        self._append_listener = None
        self.replay()

    def _next(self):
        i = self._next_id
        self._next_id += 1
        return i

    def _append_line(self, kind, fields):
        obj = {"id": self._next(), "kind": kind}
        obj.update(fields)
        try:
            with open(self.path, "a") as fh:
                fh.write(json.dumps(obj) + "\n")
        except Exception:
            pass
        if self._append_listener is not None:
            try:
                self._append_listener()
            except Exception:
                pass
        return obj

    def append_message(self, sender, receivers, body, *, wake=True):
        receivers = list(receivers)
        if self._track_resolver is not None:
            receivers = [self._track_resolver(r) or r for r in receivers]
            receivers = list(dict.fromkeys(receivers))
        to_nudge = []
        undelivered = []
        with self._lock:
            line = self._append_line("message", {
                "said": _now_ms(), "from": sender, "to": receivers, "body": body,
            })
            for receiver in receivers:
                status = self._track_prober(receiver) if self._track_prober else "live"
                if status in ("closed", "unknown", "muted"):
                    self._append_line("receipt", {
                        "receipt": "dead-letter", "ref": line["id"],
                        "actor": receiver, "ts": _now_ms(),
                    })
                    undelivered.append({"to": receiver, "why": status})
                else:
                    self._waiting.setdefault(receiver, []).append(line)
                    to_nudge.append(receiver)
        for receiver in (to_nudge if wake else ()):
            if self._nudger is not None:
                try:
                    self._nudger(receiver)
                except Exception:
                    pass
        return line, undelivered

    def append_denied(self, sender, receivers, body):
        with self._lock:
            return self._append_line("receipt", {
                "receipt": "denied", "ref": None, "actor": sender,
                "ts": _now_ms(), "from": sender, "to": list(receivers),
                "body": body, "denied_by": None,
            })

    def collect(self, track_ident, ids=None):
        with self._lock:
            if ids is None:
                lines = self._waiting.pop(track_ident, [])
            else:
                want = set(ids)
                queue = self._waiting.get(track_ident, [])
                lines = [l for l in queue if l["id"] in want]
                rest  = [l for l in queue if l["id"] not in want]
                if rest:
                    self._waiting[track_ident] = rest
                else:
                    self._waiting.pop(track_ident, None)
            pairs = []
            for line in lines:
                receipt = self._append_line("receipt", {
                    "receipt": "received", "ref": line["id"],
                    "actor": track_ident, "ts": _now_ms(),
                })
                pairs.append({"line": line, "received_receipt": receipt})
            return pairs

    def peek(self, track_ident):
        with self._lock:
            return [dict(l) for l in self._waiting.get(track_ident, [])]

    def has_mail(self, track_ident):
        with self._lock:
            return bool(self._waiting.get(track_ident))

    def dead_letter_all(self, track_ident):
        with self._lock:
            lines = self._waiting.pop(track_ident, [])
            dropped = []
            for line in lines:
                self._append_line("receipt", {
                    "receipt": "dead-letter", "ref": line["id"],
                    "actor": track_ident, "ts": _now_ms(),
                })
                dropped.append({"from": line.get("from"), "ref": line["id"],
                                "body": line.get("body", "")})
            return dropped

    def set_nudger(self, fn):
        self._nudger = fn

    def set_track_prober(self, fn):
        self._track_prober = fn

    def set_track_resolver(self, fn):
        self._track_resolver = fn

    def set_append_listener(self, fn):
        self._append_listener = fn

    def repoint(self, path):
        with self._lock:
            self.path = path
        self.replay()

    def waiting_counts(self):
        with self._lock:
            return {k: len(v) for k, v in self._waiting.items() if v}

    def display_lines(self):
        messages = {}
        order = []
        received = {}
        deadletter = set()
        denied = []
        if os.path.exists(self.path):
            with open(self.path) as fh:
                for raw in fh:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        obj = json.loads(raw)
                    except Exception:
                        continue
                    kind = obj.get("kind")
                    if kind == "message":
                        messages[obj["id"]] = obj
                        order.append(obj["id"])
                    elif kind == "receipt":
                        r = obj.get("receipt")
                        if r == "received":
                            ref, ts = obj.get("ref"), obj.get("ts")
                            if ref is not None and (ref not in received or (ts or 0) > (received[ref] or 0)):
                                received[ref] = ts
                        elif r == "dead-letter":
                            if obj.get("ref") is not None:
                                deadletter.add(obj.get("ref"))
                        elif r == "denied":
                            denied.append(obj)
        lines = []
        for obj in denied:
            lines.append({
                "id": obj.get("id"),
                "from": obj.get("from"), "to": obj.get("to", []),
                "body": obj.get("body", ""), "said": obj.get("ts"),
                "status": "denied", "heard": None,
            })
        for mid in order:
            m = messages[mid]
            if mid in received:
                status, heard = "", received[mid]
            elif mid in deadletter:
                status, heard = "dead", None
            else:
                status, heard = "pending", None
            lines.append({
                "id": mid,
                "from": m.get("from"), "to": m.get("to", []),
                "body": m.get("body", ""), "said": m.get("said"),
                "status": status, "heard": heard,
            })
        lines.sort(key=lambda l: l.get("said") or 0)
        return lines

    def replay(self):
        with self._lock:
            self._waiting = {}
            max_id = 0
            messages = {}
            delivered = set()
            if os.path.exists(self.path):
                with open(self.path) as fh:
                    for raw in fh:
                        raw = raw.strip()
                        if not raw:
                            continue
                        try:
                            obj = json.loads(raw)
                        except Exception:
                            continue
                        max_id = max(max_id, obj.get("id", 0))
                        if obj.get("kind") == "message":
                            messages[obj["id"]] = obj
                        elif (obj.get("kind") == "receipt"
                              and obj.get("receipt") in ("received", "dead-letter")):
                            delivered.add((obj.get("ref"), obj.get("actor")))
            for mid, line in messages.items():
                for receiver in line.get("to", []):
                    if (mid, receiver) not in delivered:
                        self._waiting.setdefault(receiver, []).append(line)
            self._next_id = max_id + 1


default = Waypoint()


def append_message(sender, receivers, body, *, wake=True):
    return default.append_message(sender, receivers, body, wake=wake)

def append_denied(sender, receivers, body):
    return default.append_denied(sender, receivers, body)

def collect(track_ident, ids=None):
    return default.collect(track_ident, ids=ids)

def peek(track_ident):
    return default.peek(track_ident)

def has_mail(track_ident):
    return default.has_mail(track_ident)

def dead_letter_all(track_ident):
    return default.dead_letter_all(track_ident)

def set_nudger(fn):
    return default.set_nudger(fn)

def set_track_prober(fn):
    return default.set_track_prober(fn)

def set_track_resolver(fn):
    return default.set_track_resolver(fn)

def set_append_listener(fn):
    return default.set_append_listener(fn)

def repoint(path):
    return default.repoint(path)

def waiting_counts():
    return default.waiting_counts()

def display_lines():
    return default.display_lines()

def replay():
    return default.replay()
