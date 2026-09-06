
import hashlib
import json
import os
import threading
import time
import uuid
from engine import SUITE_ROOT

QUEUE_PATH = os.path.join(SUITE_ROOT, "queue.json")

LOG_PATH = os.path.join(SUITE_ROOT, "log.jsonl")


DEFAULT_CONDITIONS = {
    "write":           ["file_unchanged", "gate_satisfied", "turn_idle"],
    "run":             ["gate_satisfied", "turn_idle"],
    "model_call":      ["endpoint_up", "gate_satisfied", "budget_ok"],
    "spawn":           ["endpoint_up", "gate_satisfied", "budget_ok"],
    "fetch":           ["gate_satisfied", "endpoint_up"],
    "settings_change": ["turn_idle"],
}


def _now_ms():
    return int(time.time() * 1000)


def _hash_file(path):
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()
    except Exception:
        return None


def _target_key(payload):
    return payload.get("path") or payload.get("command") or payload.get("url") or payload.get("model")



def _check_endpoint_up(entry, params, state):
    probe = state.get("endpoint_up")
    if probe is None:
        return True
    return bool(probe(entry.get("payload", {}).get("model")))


def _check_turn_idle(entry, params, state):
    probe = state.get("turn_idle")
    if probe is None:
        return True
    return bool(probe())


def _check_file_unchanged(entry, params, state):
    path = entry.get("payload", {}).get("path")
    stamped = params.get("hash")
    if not path:
        return True
    probe = state.get("file_hash", _hash_file)
    return probe(path) == stamped


def _check_gate_satisfied(entry, params, state):
    return params.get("answer") is True


def _check_depends_on(entry, params, state):
    dep_id = params.get("id")
    if not dep_id:
        return True
    dep = state.get("resolved_index", {}).get(dep_id)
    return bool(dep and dep.get("outcome") == "fired")


def _check_not_superseded(entry, params, state):
    return not entry.get("superseded", False)


def _check_window(entry, params, state):
    now = state.get("now", _now_ms())
    lo, hi = params.get("not_before"), params.get("not_after")
    if lo is not None and now < lo:
        return False
    if hi is not None and now >= hi:
        return False
    return True


def _check_expiry(entry, params, state):
    at = params.get("at")
    if at is None:
        return True
    return state.get("now", _now_ms()) < at


def _check_budget_ok(entry, params, state):
    probe = state.get("budget_ok")
    if probe is None:
        return True
    return bool(probe(entry))


CONDITIONS = {
    "endpoint_up":     _check_endpoint_up,
    "turn_idle":       _check_turn_idle,
    "file_unchanged":  _check_file_unchanged,
    "gate_satisfied":  _check_gate_satisfied,
    "depends_on":      _check_depends_on,
    "not_superseded":  _check_not_superseded,
    "window":          _check_window,
    "expiry":          _check_expiry,
    "budget_ok":       _check_budget_ok,
}

_resolver = None


def set_resolver(fn):
    global _resolver
    _resolver = fn


_endpoint_prober = None


def set_endpoint_prober(fn):
    global _endpoint_prober
    _endpoint_prober = fn


_notifier = None


def set_notifier(fn):
    global _notifier
    _notifier = fn


def has_notifier():
    return _notifier is not None


_change_listener = None


def set_change_listener(fn):
    global _change_listener
    _change_listener = fn


def condition_status(entry, state=None):
    state = dict(state or {})
    state.setdefault("now", _now_ms())
    state.setdefault("resolved_index", default.resolved_index)
    state.setdefault("endpoint_up", _endpoint_prober)
    out = {}
    for cname, params in entry.get("conditions", {}).items():
        fn = CONDITIONS.get(cname)
        out[cname] = bool(fn(entry, params, state)) if fn else True
    return out

_TERMINAL_ON_FALSE = (
    ("file_unchanged", "stale"),
    ("expiry",         "expired"),
)


class Queue:

    def __init__(self, path=None):
        self.path = path or QUEUE_PATH
        self.pending = []
        self.defaults = dict(DEFAULT_CONDITIONS)
        self.resolved_index = {}
        self._lock     = threading.RLock()
        self._waiters  = {}
        self._answers  = {}
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path) as fh:
                    data = json.load(fh)
                self.pending  = data.get("pending", [])
                self.defaults = data.get("defaults", dict(DEFAULT_CONDITIONS))
                return
            except Exception:
                pass
        self.pending, self.defaults = [], dict(DEFAULT_CONDITIONS)

    def _persist(self):
        try:
            with open(self.path, "w") as fh:
                json.dump({"pending": self.pending, "defaults": self.defaults}, fh, indent=2)
        except Exception:
            pass
        if _change_listener is not None:
            try:
                _change_listener()
            except Exception:
                pass

    def reload(self):
        self._load()

    def _append_log(self, evt):
        try:
            from engine import ledger
            path = ledger._log_path_for(evt.get("shell"))
        except Exception:
            path = LOG_PATH
        try:
            with open(path, "a") as fh:
                fh.write(json.dumps(evt) + "\n")
        except Exception:
            pass

    def park(self, action_type, payload, driver, conditions=None, expires_at=None,
             hook="queue", meta=None, prompt=None, ensure_gate=False,
             register_waiter=False):
        names = conditions if conditions is not None else self.defaults.get(action_type, [])
        names = list(names)
        if (ensure_gate or hook == "ask") and "gate_satisfied" not in names:
            names.append("gate_satisfied")
        cond_params = {}
        for cname in names:
            if cname == "file_unchanged":
                path = payload.get("path")
                cond_params[cname] = {"hash": _hash_file(path) if path else None}
            elif cname == "expiry":
                cond_params[cname] = {"at": payload.get("expires_at")}
            elif cname == "depends_on":
                cond_params[cname] = {"id": payload.get("depends_on_id")}
            elif cname == "window":
                cond_params[cname] = {"not_before": payload.get("not_before"),
                                       "not_after": payload.get("not_after")}
            else:
                cond_params[cname] = {}

        entry = {
            "id":           uuid.uuid4().hex[:12],
            "action_type":  action_type,
            "payload":      payload,
            "driver":       driver,
            "conditions":   cond_params,
            "hook":         hook,
            "parked":       _now_ms(),
            "expires":      expires_at,
            "fired":        None,
            "denied":       None,
            "expired":      None,
            "stale":        None,
            "outcome":      None,
            "superseded":   False,
        }
        if meta:
            entry.update({k: v for k, v in meta.items() if k not in entry or k == "driver"})
        if prompt:
            if len(prompt.encode("utf-8", errors="replace")) <= 2048:
                entry["prompt"] = prompt
                entry["prompt_blob"] = None
            else:
                blob = None
                try:
                    from engine import ledger
                    blob = ledger.write_blob(entry["id"], "prompt", prompt)
                except Exception:
                    blob = None
                entry["prompt_blob"] = blob
                if blob is None:
                    entry["prompt"] = prompt[:2048]

        with self._lock:
            key = _target_key(payload)
            if key is not None:
                for other in self.pending:
                    if other["action_type"] == action_type and _target_key(other["payload"]) == key:
                        other["superseded"] = True

            self.pending.append(entry)
            if register_waiter:
                self._waiters[entry["id"]] = threading.Event()
            self._persist()
            self._append_log({"kind": "queue", "outcome": "parked", **entry})
        self.evaluate({"event": "entry_added", "now": _now_ms()})
        if hook == "ask" and _notifier is not None and entry.get("outcome") is None:
            try:
                _notifier("ask", entry, prompt)
            except Exception:
                pass
        return entry

    def notify(self, event_name, state=None):
        state = dict(state or {})
        state.setdefault("event", event_name)
        state.setdefault("now", _now_ms())
        state.setdefault("resolved_index", self.resolved_index)
        self.evaluate(state)

    def evaluate(self, state=None):
        state = dict(state or {})
        state.setdefault("now", _now_ms())
        state.setdefault("resolved_index", self.resolved_index)
        state.setdefault("endpoint_up", _endpoint_prober)
        fire, resolved = [], []
        with self._lock:
            still_pending = []
            for entry in self.pending:
                outcome = self._check_entry(entry, state)
                if outcome is None:
                    still_pending.append(entry)
                else:
                    if self._resolve(entry, outcome):
                        fire.append(entry)
                    resolved.append(entry)
            self.pending = still_pending
            self._persist()
        for entry in fire:
            if _resolver is not None:
                try:
                    _resolver(entry)
                except Exception:
                    pass
        for entry in resolved:
            if _notifier is not None:
                try:
                    _notifier("resolved", entry)
                except Exception:
                    pass

    def _check_entry(self, entry, state):
        conditions = entry.get("conditions", {})
        for cname, outcome in _TERMINAL_ON_FALSE:
            if cname in conditions:
                fn = CONDITIONS[cname]
                if not fn(entry, conditions[cname], state):
                    return outcome
        all_pass = True
        for cname, params in conditions.items():
            if cname in dict(_TERMINAL_ON_FALSE):
                continue
            fn = CONDITIONS.get(cname)
            if fn is None:
                continue
            if not fn(entry, params, state):
                all_pass = False
        return "fired" if all_pass else None

    def _resolve(self, entry, outcome):
        entry["outcome"] = outcome
        entry[outcome] = _now_ms()
        self.resolved_index[entry["id"]] = entry
        self._append_log({"kind": "queue", "outcome": outcome, **entry})
        ev = self._waiters.get(entry["id"])
        if ev is not None:
            self._answers.setdefault(entry["id"], outcome == "fired")
            ev.set()
            return False
        if (outcome == "fired" and _resolver is not None
                and entry.get("action_type") in ("write", "run", "fetch", "send")):
            return True
        try:
            from engine import ledger
            gs = (entry.get("conditions") or {}).get("gate_satisfied") or {}
            rec = ledger.action_record(
                custody={k: entry.get(k) for k in
                         ("machine", "session", "shell", "root",
                          "driver", "seat", "vessel", "source",
                          "region", "track", "turn")},
                action_type=entry.get("action_type"),
                edge=entry.get("edge") or entry.get("action_type"),
                payload=entry.get("payload"),
                hook=entry.get("hook"),
                answer={"fired": True, "denied": False}.get(outcome),
                answered_by="human" if gs.get("answer") is not None else None,
                prompt=entry.get("prompt"),
                parked=entry.get("parked"),
                resolved=_now_ms(),
                outcome=outcome,
                summary=entry.get("summary"),
            )
            ledger.append(rec)
        except Exception:
            pass
        return outcome == "fired"

    def update_payload(self, entry_id, patch):
        with self._lock:
            for entry in self.pending:
                if entry["id"] == entry_id:
                    entry["payload"].update(patch or {})
                    self._persist()
                    self._append_log({"kind": "queue", "outcome": "edited", **entry})
                    return entry
        return None

    def delete(self, entry_id):
        deleted = None
        with self._lock:
            for i, entry in enumerate(self.pending):
                if entry["id"] == entry_id:
                    deleted = self.pending.pop(i)
                    self._resolve(deleted, "deleted")
                    self._recompute_supersession(deleted["action_type"],
                                                 _target_key(deleted["payload"]))
                    self._persist()
                    break
        if deleted is None:
            return None
        if _notifier is not None:
            try:
                _notifier("resolved", deleted)
            except Exception:
                pass
        self.evaluate({"event": "entry_deleted", "now": _now_ms()})
        return deleted

    def _recompute_supersession(self, action_type, key):
        if key is None:
            return
        siblings = [e for e in self.pending
                    if e["action_type"] == action_type and _target_key(e["payload"]) == key]
        if not siblings:
            return
        newest = max(siblings, key=lambda e: e["parked"])
        for e in siblings:
            e["superseded"] = (e is not newest)

    def unsupersede(self, entry_id):
        with self._lock:
            for entry in self.pending:
                if entry["id"] == entry_id:
                    entry["superseded"] = False
                    self._persist()
                    return entry
        return None

    def answer_gate(self, entry_id, answer):
        answer = bool(answer)
        woke = None
        with self._lock:
            entry = next((e for e in self.pending if e["id"] == entry_id), None)
            if entry is None:
                return None
            if "gate_satisfied" in entry["conditions"]:
                entry["conditions"]["gate_satisfied"]["answer"] = answer
            if entry_id in self._waiters:
                self._answers[entry_id] = answer
                self.pending.remove(entry)
                self._resolve(entry, "fired" if answer else "denied")
                woke = entry
            self._persist()
        if woke is not None and _notifier is not None:
            try:
                _notifier("resolved", woke)
            except Exception:
                pass
        return entry

    def defer_gate(self, entry_id):
        with self._lock:
            entry = next((e for e in self.pending if e["id"] == entry_id), None)
            if entry is None:
                return None
            entry["hook"] = "queue"
            entry["downgraded"] = "deferred"
            self._persist()
        return entry

    def await_answer(self, entry_id, timeout=None):
        with self._lock:
            if entry_id in self._answers:
                self._waiters.pop(entry_id, None)
                return self._answers.pop(entry_id)
            entry = self.find(entry_id)
            if entry is not None and entry.get("outcome"):
                self._waiters.pop(entry_id, None)
                return entry["outcome"] == "fired"
            ev = self._waiters.get(entry_id)
            if ev is None:
                ev = threading.Event()
                self._waiters[entry_id] = ev
        answered = ev.wait(timeout)
        with self._lock:
            self._waiters.pop(entry_id, None)
            if entry_id in self._answers:
                return self._answers.pop(entry_id)
        return None if not answered else None

    def downgrade(self, entry_id, reason="timeout"):
        with self._lock:
            entry = next((e for e in self.pending if e["id"] == entry_id), None)
            if entry is None:
                return None
            entry["hook"] = "queue"
            entry["downgraded"] = reason
            self._persist()
            return entry

    def abandon_session(self, sid):
        woken = 0
        with self._lock:
            for entry in self.pending:
                eid = entry["id"]
                if (entry.get("hook") == "ask" and entry.get("session") == sid
                        and eid in self._waiters):
                    entry["hook"] = "queue"
                    entry["downgraded"] = "disconnect"
                    self._answers[eid] = "parked"
                    self._waiters[eid].set()
                    woken += 1
            if woken:
                self._persist()
        return woken

    def terminate_session(self, sid):
        stamped = {"closed": 0, "timeout": 0}
        swept = []
        with self._lock:
            doomed = [e for e in self.pending
                      if e.get("session") == sid and not e.get("outcome")]
            for entry in doomed:
                eid = entry["id"]
                outcome = "closed" if eid in self._waiters else "timeout"
                self.pending.remove(entry)
                entry["answered_by"] = "session-end"
                self._answers.setdefault(eid, False)
                self._resolve(entry, outcome)
                stamped[outcome] += 1
                swept.append(entry)
            if swept:
                self._persist()
        for entry in swept:
            if _notifier is not None:
                try:
                    _notifier("resolved", entry)
                except Exception:
                    pass
        return stamped

    def waiting_gates(self, sid):
        with self._lock:
            return [dict(e) for e in self.pending
                    if e.get("hook") == "ask" and e.get("outcome") is None
                    and e.get("session") == sid and e["id"] in self._waiters]

    def reorder(self, ids):
        with self._lock:
            index = {e["id"]: e for e in self.pending}
            newp = [index[i] for i in ids if i in index]
            for e in self.pending:
                if e["id"] not in set(ids):
                    newp.append(e)
            self.pending = newp
            self._persist()

    def record_resolved(self, action_type, payload, driver, hook, outcome, meta=None):
        entry = {
            "id":          uuid.uuid4().hex[:12],
            "action_type": action_type,
            "payload":     payload,
            "driver":      driver,
            "conditions":  {},
            "hook":        hook,
            "parked":      _now_ms(),
            "expires":     None,
            "outcome":     None,
            "superseded":  False,
        }
        if meta:
            entry.update({k: v for k, v in meta.items() if k not in entry or k == "driver"})
        with self._lock:
            entry["outcome"] = outcome
            entry[outcome] = _now_ms()
            self.resolved_index[entry["id"]] = entry
            self._append_log({"kind": "queue", "outcome": outcome, **entry})
        return entry

    def deny(self, entry_id):
        denied = None
        with self._lock:
            for i, entry in enumerate(self.pending):
                if entry["id"] == entry_id:
                    denied = self.pending.pop(i)
                    self._answers.setdefault(entry_id, False)
                    self._resolve(denied, "denied")
                    self._persist()
                    break
        if denied is not None and _notifier is not None:
            try:
                _notifier("resolved", denied)
            except Exception:
                pass
        return denied

    def mark_superseded(self, entry_id):
        with self._lock:
            for entry in self.pending:
                if entry["id"] == entry_id:
                    entry["superseded"] = True
                    self._persist()
                    return entry
        return None

    def find(self, entry_id):
        with self._lock:
            for entry in self.pending:
                if entry["id"] == entry_id:
                    return entry
            return self.resolved_index.get(entry_id)


default = Queue()


def park(action_type, payload, driver, **kw):
    return default.park(action_type, payload, driver, **kw)

def notify(event_name, state=None):
    return default.notify(event_name, state=state)

def evaluate(state=None):
    return default.evaluate(state=state)

def answer_gate(entry_id, answer):
    return default.answer_gate(entry_id, answer)

def defer_gate(entry_id):
    return default.defer_gate(entry_id)

def waiting_gates(sid):
    return default.waiting_gates(sid)

def await_answer(entry_id, timeout=None):
    return default.await_answer(entry_id, timeout=timeout)

def downgrade(entry_id, reason="timeout"):
    return default.downgrade(entry_id, reason=reason)

def abandon_session(sid):
    return default.abandon_session(sid)

def terminate_session(sid):
    return default.terminate_session(sid)

def reorder(ids):
    return default.reorder(ids)

def record_resolved(action_type, payload, driver, hook, outcome, meta=None):
    return default.record_resolved(action_type, payload, driver, hook, outcome, meta=meta)

def deny(entry_id):
    return default.deny(entry_id)

def update_payload(entry_id, patch):
    return default.update_payload(entry_id, patch)

def delete(entry_id):
    return default.delete(entry_id)

def unsupersede(entry_id):
    return default.unsupersede(entry_id)

def mark_superseded(entry_id):
    return default.mark_superseded(entry_id)

def pending():
    with default._lock:
        return list(default.pending)

def find(entry_id):
    return default.find(entry_id)

def reload():
    default.reload()
