
import contextlib
import datetime
import fcntl
import json
import os
import pty
import queue
import signal
import subprocess
import termios
import threading
import time
import uuid

from engine import SUITE_ROOT
from engine import agent_loop as al
from engine import daemon_queue as dq
from engine import ledger
from engine import read_tool as rt
from engine import settings as settings_table
from engine import waypoint

from ade import rails


def kind_of(model):
    # provider kind for a model name — drives the reset_on_change default
    provider = rails.infer_provider(model)
    for row in rails.PROVIDERS:
        if row["id"] == provider:
            return row["kind"]
    return "local"


SYSTEM_SENDER = "«harness»"

HUMAN_SENDER = "Captain"


def archives_dir():
    return os.path.join(SUITE_ROOT, "archives")


def session_dir(ade_session_id):
    return os.path.join(archives_dir(), ade_session_id)


def _now_iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def _now_ms():
    return int(datetime.datetime.now().timestamp() * 1000)


def _archive_lines(messages):
    lines = []
    pending = None
    for i, m in enumerate(messages):
        entry = dict(m)
        role = m.get("role")
        if pending is not None and role in ("tool", "user"):
            entry["tool_call_id"] = pending
            pending = None
        if role == "assistant" and m.get("tool_calls"):
            calls = [{**c, "id": (c.get("id") or f"call-{i:04d}-{j}")}
                     for j, c in enumerate(m["tool_calls"])]
            entry["tool_calls"] = calls
            pending = calls[0]["id"] if calls else None
        lines.append(entry)
    return lines


_status_listener = None


def set_status_listener(fn):
    global _status_listener
    _status_listener = fn


def _fire_status(region_id, phase):
    fn = _status_listener
    if fn is None or region_id is None:
        return
    try:
        fn(region_id, phase)
    except Exception as e:
        print(f"[tracks._fire_status] listener failed for '{region_id}': {e}")


_roster_listener = None
_starter = None


def set_roster_listener(fn):
    global _roster_listener
    _roster_listener = fn


def _fire_roster():
    fn = _roster_listener
    if fn is None:
        return
    try:
        fn()
    except Exception as e:
        print(f"[tracks._fire_roster] listener failed: {e}")


def set_starter(fn):
    global _starter
    _starter = fn


def _fire_starter(region):
    fn = _starter
    if fn is None:
        return
    try:
        fn(region)
    except Exception as e:
        print(f"[tracks._fire_starter] starter failed for '{region.id}': {e}")


_replaced_listener = None


def set_replaced_listener(fn):
    global _replaced_listener
    _replaced_listener = fn


def _fire_replaced(old_id, new_id):
    fn = _replaced_listener
    if fn is None:
        return
    try:
        fn(old_id, new_id)
    except Exception as e:
        print(f"[tracks._fire_replaced] listener failed "
              f"for '{old_id}' -> '{new_id}': {e}")


class MirrorView:

    def __init__(self, webio, track_id):
        self.webio    = webio
        self.track_id = track_id

    def _tag(self, kind, payload):
        self.webio._send({"type": "mirror", "track": self.track_id,
                          "kind": kind, **payload})

    def out(self, text="", *, dim=False, end="\n"):
        self._tag("out", {"text": text, "dim": dim, "end": end})

    def meters(self, d):
        self._tag("meters", {"d": d})

    def term(self, data):
        self._tag("term", {"data": data})

    def status(self, phase):
        self._tag("status", {"phase": phase})

    def on_write(self, path):
        return None

    def turn_start(self):
        return None

    def event(self, evt):
        self._tag("event", {"evt": evt})

    def transcript(self, messages):
        self._tag("transcript", {"messages": messages})

    def gatelog(self, records):
        self._tag("gatelog", {"records": records})

    def speak(self, text, *, engine="browser", voice=""):
        return None

    def _send(self, frame):
        self._tag("gate", {"frame": frame})


class TrackHub:

    def __init__(self, region_id=None):
        self.region_id      = region_id
        self._lock          = threading.Lock()
        self._members       = {}
        self._mirrors       = {}
        self._guest_counter = 0
        self._answer_queue    = queue.Queue()
        self._pending_gate_id = None
        self.stop_requested  = threading.Event()

    def add(self, webio, label):
        with self._lock:
            self._members[webio] = label

    def remove(self, webio):
        with self._lock:
            self._members.pop(webio, None)

    def add_mirror(self, view, label):
        with self._lock:
            self._mirrors[view] = label

    def remove_mirror_for(self, webio):
        with self._lock:
            for v in [v for v in self._mirrors if v.webio is webio]:
                self._mirrors.pop(v, None)

    def empty(self):
        with self._lock:
            return not self._members

    def members(self):
        with self._lock:
            return list(self._members.values())

    def next_guest_label(self):
        with self._lock:
            self._guest_counter += 1
            return f"guest-{self._guest_counter}"

    def _fanout(self, name, *args, **kwargs):
        with self._lock:
            members = list(self._members.items()) + list(self._mirrors.items())
        for m, label in members:
            try:
                getattr(m, name)(*args, **kwargs)
            except Exception as e:
                print(f"[TrackHub._fanout] {name} failed for member '{label}': {e}")

    def out(self, text="", *, dim=False, end="\n"):
        self._fanout("out", text, dim=dim, end=end)

    def meters(self, d):
        self._fanout("meters", d)

    def term(self, data):
        self._fanout("term", data)

    def status(self, phase):
        self._fanout("status", phase)
        _fire_status(self.region_id, phase)

    def on_write(self, path):
        self._fanout("on_write", path)

    def turn_start(self):
        self._fanout("turn_start")

    def event(self, evt):
        self._fanout("event", evt)

    def speak(self, text, *, engine="browser", voice=""):
        self._fanout("speak", text, engine=engine, voice=voice)

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
                self._pending_gate_id = None
                self._answer_queue.put(text)
                return True
        return False

    def assert_off_receiver(self):
        return None


CARRIED_FIELDS = ("job", "input", "output", "git", "notes", "status", "stxt")



def _carried(src):
    src = src or {}
    return {k: src.get(k) for k in CARRIED_FIELDS}


class Track:

    def __init__(self, track_id, name, regions=None, root=None, order=None,
                 created=None):
        self.id      = track_id
        self.name    = name
        self.regions = list(regions or [])
        self.root    = root
        self.order   = order
        self.created = created or _now_iso()

    def index_entry(self):
        return {
            "id":      self.id,
            "name":    self.name,
            "regions": list(self.regions),
            "root":    self.root,
            "order":   self.order,
            "created": self.created,
        }

    def apply_edits(self, fields):
        # name, root, order only — everything else rejected
        rejected = []
        for key, val in fields.items():
            if key == "name":
                new = val.strip() if isinstance(val, str) else ""
                if new:
                    self.name = new
                else:
                    rejected.append(key)
            elif key == "root":
                new = (os.path.abspath(os.path.expanduser(val.strip()))
                       if isinstance(val, str) and val.strip() else "")
                if new and os.path.isdir(new):
                    self.root = new
                    for region_id in self.regions:
                        region = get_region(region_id)
                        if region is not None:
                            region.apply_edits([{"type": "root", "value": new}])
                else:
                    rejected.append(key)
            elif key == "order":
                if isinstance(val, int) and not isinstance(val, bool):
                    self.order = val
                else:
                    rejected.append(key)
            else:
                rejected.append(key)
        return rejected


class Region:

    def __init__(self, region_id, name, model, root, seat=None,
                 overlay_rows=None, hub=None,
                 provider=None, loop_class=None, mechanism=None,
                 track=None, carried=None, node_id=None):
        self.id     = region_id
        self.name   = name
        self.model  = model
        self.seat   = seat
        self.root   = root
        self.overlay_rows = overlay_rows
        self.hub    = hub or TrackHub(region_id)
        self.track  = track
        self.node_id = node_id
        self.carried = _carried(carried)
        self.muted = False

        self.provider, self.loop_class, self.mechanism = rails.normalize(
            provider=provider, loop_class=loop_class, mechanism=mechanism,
            model=model)

        self.sess = al.Session(io_surface=self.hub, sid=region_id, shell="ade")
        self.sess.settings = settings_table.region_defaults(kind_of(model))
        self.sess.settings["model"] = model
        self.sess.settings["seat"] = seat or ""
        if seat:
            self.sess.nick = seat
        self.sess.stop_key_watch = self._stop_watch
        self.sess.stop_label     = "Stop"
        self.sess.root           = root
        self.sess.policy_overlay = overlay_rows
        self.sess.region         = self.id
        self.sess.track          = track
        self.sess.turn           = 0
        self.sess.region_name    = self.name

        self.sess.messages = [{"role": "system", "content": ""}]
        al.rebuild_context(self.sess)

        self.inbox  = []
        self.outbox = []
        self._inbox_lock   = threading.Lock()
        self._turn_ordinal = 0
        self._pumping      = False
        self._closed       = False
        self._reset_armed  = False

        self._shell      = {"master": None, "proc": None}
        self._shell_lock = threading.Lock()

        self.created   = self.sess.created
        self.lifecycle = [{"event": "created", "ts": _now_iso()}]

        self._flushed    = 0
        self._flush_lock = threading.Lock()

    @contextlib.contextmanager
    def root_scope(self):
        token = rt._track_root.set(self.root)
        try:
            yield
        finally:
            rt._track_root.reset(token)

    def shell_master(self):
        with self._shell_lock:
            if self._shell["master"] is not None:
                return self._shell["master"]

            master, slave = pty.openpty()
            shell = os.environ.get("SHELL", "/bin/bash")
            env   = {**os.environ, "TERM": "xterm-256color"}

            def _set_ctty():
                os.setsid()
                fcntl.ioctl(0, termios.TIOCSCTTY, 0)

            shell_cwd, root_note = rt.usable_root(self.root or rt.WORKSPACE_ROOT)
            if root_note:
                self.hub.term(root_note + "\r\n")

            self._shell["proc"] = subprocess.Popen(
                [shell, "-i"],
                stdin=slave, stdout=slave, stderr=slave,
                cwd=shell_cwd,
                env=env,
                preexec_fn=_set_ctty,
                close_fds=True,
            )
            os.close(slave)
            self._shell["master"] = master

            def _pump():
                while True:
                    try:
                        data = os.read(master, 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    self.hub.term(data.decode("utf-8", errors="replace"))

            threading.Thread(target=_pump, daemon=True).start()
            return self._shell["master"]

    def close_shell(self):
        with self._shell_lock:
            proc, master = self._shell["proc"], self._shell["master"]
            self._shell = {"master": None, "proc": None}
        if proc is not None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                pass
        if master is not None:
            try:
                os.close(master)
            except Exception:
                pass

    def index_entry(self):
        return {
            "id":        self.id,
            "track":     self.track,
            "node_id":   self.node_id,
            "name":      self.name,
            "seat":      self.seat,
            "vessel":    self.model,
            "root":      self.root,
            **{k: self.carried.get(k) for k in CARRIED_FIELDS},
            "provider":   self.provider,
            "loop_class": self.loop_class,
            "mechanism":  self.mechanism,
            "overlay_rows": self.overlay_rows,
            "created":   self.created,
            "lifecycle": list(self.lifecycle),
            "turn_ordinal": self._turn_ordinal,
            "claude_session_id": (al.router.claude_session_id(self.id, self.model)
                                  if al.router is not None else None),
            "settings": dict(self.sess.settings),
        }

    def flush(self, sdir):
        with self._flush_lock:
            lines = _archive_lines(self.sess.messages)
            new = lines[self._flushed:]
            if not new:
                return
            os.makedirs(sdir, exist_ok=True)
            with open(os.path.join(sdir, f"{self.id}.jsonl"), "a") as fh:
                for entry in new:
                    fh.write(json.dumps(entry) + "\n")
            self._flushed = len(lines)

    @contextlib.contextmanager
    def _stop_watch(self):
        yield lambda: self.hub.stop_requested.is_set()

    def enqueue(self, item):
        with self._inbox_lock:
            self.inbox.append(item)
            if self._pumping:
                return False
            self._pumping = True
            return True

    def nudge(self):
        with self._inbox_lock:
            if self._pumping:
                return False
            self._pumping = True
            return True

    def drain_inbox(self):
        with self._inbox_lock:
            items, self.inbox = self.inbox, []
        pending_keep_warm = self._pending_keep_warm(items)
        for item in items:
            if item.get("type") == "message":
                m = {"role": "user", "content": item.get("content", "")}
                if item.get("media"):
                    m["media"] = item["media"]
                self.sess.messages.append(m)
            else:
                self._apply_edit(item, pending_keep_warm=pending_keep_warm)
        return len(items)

    def _mail_head(self, sender_id, sender_display, to_list):
        to = [t for t in (to_list or []) if isinstance(t, str)]
        others = [t for t in to if t != self.id]
        if not others:
            return (f"[A message from {sender_display} (id: {sender_id}) — to "
                    "you only. Reply to that id with send_message.]\n")
        also = " · ".join(f"{display_name(t)} (id: {t})" for t in others)
        ids  = ", ".join([sender_id] + others)
        return (f"[A message to THE ROOM from {sender_display} "
                f"(id: {sender_id}).\n"
                f" Also sent to: {also} · you.\n"
                f" Everyone above got this same message. Reply to the room by "
                f"passing all of these ids to send_message ({ids}), or to "
                f"{sender_display} alone — say which you are doing.]\n")

    def drain_messages(self):
        pairs = waypoint.collect(self.id)
        if not pairs:
            return 0
        displays = [display_name(pair["line"]["from"]) for pair in pairs]
        peers = [d for d, p in zip(displays, pairs)
                 if p["line"]["from"] != SYSTEM_SENDER]
        if peers:
            who = ", ".join(dict.fromkeys(peers))
            self.sess.messages.append({
                "role": "user",
                "content": (f"● NEW MAIL — {len(peers)} message(s) just arrived "
                            f"from {who}. They follow this line. If one asks you "
                            f"something, answer it with send_message; the sender "
                            f"is waiting."),
            })
        for pair, sender_display in zip(pairs, displays):
            if pair["line"]["from"] == SYSTEM_SENDER:
                head = "[NOTICE from the harness — not a user, not another agent]\n"
            else:
                sender_id = pair["line"]["from"]
                head = self._mail_head(sender_id, sender_display,
                                       pair["line"].get("to"))
            self.sess.messages.append({
                "role": "user",
                "content": head + pair["line"]["body"],
            })
        try:
            self.hub.event({
                "kind":   "mail",
                "track":  self.id,
                "count":  len(pairs),
                "from":   list(dict.fromkeys(displays)),
                "system": [d for d, p in zip(displays, pairs)
                           if p["line"]["from"] == SYSTEM_SENDER],
                "bodies": [p["line"]["body"] for p in pairs],
                "ts":     _now_ms(),
            })
        except Exception:
            pass
        return len(pairs)

    @staticmethod
    def _pending_keep_warm(items):
        val = None
        for item in items:
            if item.get("type") == "setting" and item.get("key") == "claude_keep_warm":
                val = item.get("value")
        return val

    @staticmethod
    def _in_place_only(item):
        # rename, gates and preset_name never touch model context
        t = item.get("type")
        if t in ("rename", "overlay"):
            return True
        return t == "setting" and item.get("key") in ("preset_name",
                                                      "reset_on_change")

    def apply_edits(self, items):
        if self.sess.settings.get("reset_on_change") and \
                any(not self._in_place_only(i) for i in items):
            self._reset_with(items)
            return
        with self._inbox_lock:
            if self._pumping:
                held = []
                for item in items:
                    if item.get("type") == "overlay":
                        self._apply_edit(item)
                    else:
                        held.append(item)
                self.inbox.extend(held)
                return
            pending_keep_warm = self._pending_keep_warm(items)
            for item in items:
                self._apply_edit(item, pending_keep_warm=pending_keep_warm)

    def _reset_with(self, items):
        # the fresh region is born with the edited settings
        row = self.index_entry()
        row.pop("claude_session_id", None)
        settings = dict(row.get("settings") or {})
        for item in items:
            t = item.get("type")
            val = item.get("value")
            if t == "setting":
                key = item.get("key")
                settings[key] = val
                if key == "model":
                    row["vessel"] = val
            elif t == "rename":
                row["name"] = (val or "").strip() or row["name"]
            elif t == "root":
                new = os.path.abspath(os.path.expanduser((val or "").strip()))
                if new and os.path.isdir(new):
                    row["root"] = new
            elif t == "seat":
                nick = (val or "").strip() or None
                row["seat"] = nick
                settings["seat"] = nick or ""
            elif t == "rail":
                rail = val or {}
                prov, lclass, mech = rails.normalize(
                    provider=rail.get("provider", row.get("provider")),
                    loop_class=rail.get("loop_class", row.get("loop_class")),
                    mechanism=rail.get("mechanism", row.get("mechanism")),
                    model=settings.get("model") or row.get("vessel"))
                row["provider"], row["loop_class"], row["mechanism"] = prov, lclass, mech
            elif t == "overlay":
                row["overlay_rows"] = val
        row["settings"] = settings
        reset_region(self.id, row=row)

    def _apply_edit(self, item, pending_keep_warm=None):
        t = item.get("type")
        if t == "setting":
            key, val = item.get("key"), item.get("value")
            if key == "model":
                old = self.sess.settings.get("model")
                self.sess.settings[key] = val
                self.model = val
                if old != val and al.router is not None:
                    keep_warm = (pending_keep_warm if pending_keep_warm is not None
                                 else self.sess.settings.get("claude_keep_warm"))
                    if al._is_claude(old) and keep_warm:
                        self.sess.io.out(f"  [claude] keep_warm on — leaving '{old}' session warm", dim=True)
                    else:
                        msg = al.router.unload(old, region_id=self.id)
                        if msg:
                            self.sess.io.out("  " + msg, dim=True)
            elif key == "claude_keep_warm":
                if al._is_claude(self.sess.settings.get("model")):
                    self.sess.settings[key] = val
            else:
                self.sess.settings[key] = val

        elif t == "root":
            new = os.path.abspath(os.path.expanduser((item.get("value") or "").strip()))
            if new and os.path.isdir(new):
                self.root      = new
                self.sess.root = new
                al.rebuild_context(self.sess)
                self.lifecycle.append({"event": "rerooted", "root": new,
                                       "ts": _now_iso()})

        elif t == "rename":
            new = (item.get("value") or "").strip()
            if new:
                self.name = new
                self.lifecycle.append({"event": "renamed", "name": new,
                                       "ts": _now_iso()})

        elif t == "seat":
            nick = (item.get("value") or "").strip() or None
            self.seat      = nick
            self.sess.nick = nick
            self.sess.settings["seat"] = nick or ""
            al.rebuild_context(self.sess)

        elif t == "rail":
            val = item.get("value") or {}
            before = {"provider": self.provider, "loop_class": self.loop_class,
                      "mechanism": self.mechanism}
            self.provider, self.loop_class, self.mechanism = rails.normalize(
                provider=val.get("provider", self.provider),
                loop_class=val.get("loop_class", self.loop_class),
                mechanism=val.get("mechanism", self.mechanism),
                model=self.sess.settings.get("model") or self.model)
            after = {"provider": self.provider, "loop_class": self.loop_class,
                     "mechanism": self.mechanism}
            if after != before:
                self.lifecycle.append({"event": "rerailed", "from": before,
                                       "to": after, "ts": _now_iso()})

        elif t == "overlay":
            self.overlay_rows        = item.get("value")
            self.sess.policy_overlay = self.overlay_rows

    def post_outbox(self, record_id, summary=""):
        hedge = " ".join((summary or "").split()[:5])
        entry = {"id": record_id, "summary": hedge}
        self.outbox.append(entry)
        return entry

    def take_turn(self, turn_runner):
        self._turn_ordinal += 1
        self.sess.turn = self._turn_ordinal
        self.drain_inbox()
        self.drain_messages()
        started = _now_ms()
        info = turn_runner(self.sess) or {}
        ended = _now_ms()
        rec = self._emit_turn_record(started, ended, info)
        for m in self.sess.messages:
            if "_turn" not in m:
                m["_turn"] = self._turn_ordinal
        autosave()
        self._check_context_cap(rec)
        return rec

    def _check_context_cap(self, rec):
        try:
            cap_k = self.sess.settings.get("context_reset_cap_k")
            cap = int(cap_k or 0) * 1000
            if cap <= 0:
                return
            usage = (rec or {}).get("usage") or {}
            peak = usage.get("cache_read_peak")
            if peak is None:
                peak = usage.get("cache_read")
            peak = int(peak or 0)
            if peak <= 0:
                return
            if peak >= cap:
                self.sess._ctx_warn = None
                reset_region(self.id)
                return
            if peak >= cap * al.CONTEXT_WARN_FRACTION:
                pct = int(round(100.0 * peak / cap))
                self.sess._ctx_warn = (
                    f"[CONTEXT {pct}% OF CAP — {peak:,} of {cap:,} tokens. At "
                    f"100% this region is RESET: no transcript, no context, no "
                    f"cache, a new id, and an agent who does not remember this "
                    f"message. Nothing carries across except what is written "
                    f"down. Record what the next you needs to resume — where "
                    f"the work stands, what was decided, which files — and put "
                    f"it somewhere on disk that survives you.]"
                )
                try:
                    from ade import frames as _frames
                    _frames.broadcast_context_warn(self.id, peak, cap)
                except Exception:
                    pass
        except Exception as e:
            print(f"[tracks._check_context_cap] '{self.id}': {e}")

    def run_pump(self, turn_runner):
        self.hub.stop_requested.clear()
        try:
            while True:
                if self._halted():
                    return
                self.take_turn(turn_runner)
                if self._halted():
                    return
                if self.hub.stop_requested.is_set():
                    self.hub.stop_requested.clear()
                    with self._inbox_lock:
                        self._pumping = False
                    return
                with self._inbox_lock:
                    if not self.inbox and not waypoint.has_mail(self.id):
                        self._pumping = False
                        return
        except BaseException:
            with self._inbox_lock:
                self._pumping = False
            raise

    def _halted(self):
        with self._inbox_lock:
            if not self._closed and not self._reset_armed:
                return False
            if self._closed:
                self.inbox.clear()
            self._pumping = False
        _final_flush(self)
        return True

    def _emit_turn_record(self, started, ended, info):
        cust = ledger.custody(self.sess)
        cust["root"] = self.root or cust.get("root")
        ledger._derive_turn_usage(info.get("usage"))
        rec = ledger.turn_record(
            custody=cust,
            turn=self._turn_ordinal,
            started=started,
            ended=ended,
            usage=info.get("usage"),
            cost_usd=info.get("cost_usd"),
            stop_reason=info.get("stop_reason"),
            actions=info.get("actions"),
        )
        ledger.append(rec)
        return rec

    def close(self):
        self.lifecycle.append({"event": "closed", "ts": _now_iso()})
        self.close_shell()


_regions     = {}
_tracks      = {}
_tracks_lock = threading.Lock()
_closed_rows = []

_session = {"id": None, "name": None, "saved": False, "created": None,
            "plan": None}
_session_lock = threading.Lock()


def default_overlay_rows():
    from engine import tools
    return [{"edge": e, "driver": "model", "scope": s, "hook": "ask"}
            for e, s in tools.gate_edges()]


def stack_gate_edges():
    from engine.tools import CLAUDE_NATIVE_EDGES
    return frozenset(CLAUDE_NATIVE_EDGES.values())


def model_gate_edges():
    from engine import tools
    cli = stack_gate_edges()
    return frozenset(e for e, _ in tools.gate_edges() if e not in cli)


def apply_gate_subset(overlay_rows, edge_names, hooks_by_edge):
    base = overlay_rows if isinstance(overlay_rows, list) and overlay_rows else default_overlay_rows()
    out = []
    for r in base:
        edge = r.get("edge")
        if edge in edge_names:
            out.append({**r, "hook": hooks_by_edge.get(edge, "ask")})
        else:
            out.append(dict(r))
    return out


def gate_edge_list():
    return [{"edge": r["edge"], "scope": r["scope"]}
            for r in default_overlay_rows()]


def _point_stores_at(sid):
    if sid is None:
        ledger.set_ade_log_dir(None)
        waypoint.repoint(waypoint.WAYPOINT_PATH)
    else:
        d = session_dir(sid)
        os.makedirs(d, exist_ok=True)
        ledger.set_ade_log_dir(d)
        waypoint.repoint(os.path.join(d, "waypoint.jsonl"))


def _ensure_session():
    with _session_lock:
        is_new_session = _session["id"] is None
        if is_new_session:
            _session["id"]      = uuid.uuid4().hex[:12]
            _session["created"] = _now_iso()
        sid = _session["id"]
    if is_new_session:
        _point_stores_at(sid)
        _move_floor(_now_ms())
    return sid


def create_track(name, root=None, overlay_rows=None, provider=None,
                 loop_class=None, mechanism=None,
                 model=None, seat=None, settings=None, region=None):
    _ensure_session()
    with _tracks_lock:
        order = len(_tracks)
    track = Track(uuid.uuid4().hex[:12], name, root=root, order=order)
    with _tracks_lock:
        _tracks[track.id] = track
    if model is not None or seat is not None or settings is not None or region:
        insert_region(track.id, name, model or "", root=root, seat=seat,
                      overlay_rows=overlay_rows, settings=settings,
                      provider=provider, loop_class=loop_class,
                      mechanism=mechanism, region=region)
    return track


def _split_stamp(nm):
    base, sep, tail = nm.rpartition(".")
    if sep and base and tail.isdigit():
        return base, int(tail)
    return nm, 1


def _stamp_name(name):
    typed = (name or "").strip()
    base, _ = _split_stamp(typed)
    if not base:
        return name
    highest = 0
    with _tracks_lock:
        used = [r.name for r in _regions.values()]
        used += [row.get("name") or "" for row in _closed_rows]
    for other in used:
        ob, on = _split_stamp((other or "").strip())
        if ob == base and on > highest:
            highest = on
    return typed if highest == 0 else f"{base}.{highest + 1}"


def insert_region(track_id, name, model, root=None, seat=None,
                  overlay_rows=None, settings=None, provider=None,
                  loop_class=None, mechanism=None, region=None):
    _ensure_session()
    with _tracks_lock:
        track = _tracks.get(track_id)
    if track is None:
        return None
    use_root = root or track.root or rt.WORKSPACE_ROOT
    gates = overlay_rows if isinstance(overlay_rows, list) else default_overlay_rows()
    name = _stamp_name(name)
    reg = Region(uuid.uuid4().hex[:12], name, model, use_root,
                 seat=seat, overlay_rows=gates,
                 provider=provider, loop_class=loop_class,
                 mechanism=mechanism, track=track.id,
                 carried=(region or {}))
    for key, val in (settings or {}).items():
        reg._apply_edit({"type": "setting", "key": key, "value": val})
    with _tracks_lock:
        _regions[reg.id] = reg
        if reg.id not in track.regions:
            track.regions.append(reg.id)
    _announce_new_track(reg)
    return reg


def _announce_new_track(track):
    others = [t.id for t in list_regions() if t.id != track.id]
    if not others:
        return
    try:
        waypoint.append_message(
            SYSTEM_SENDER, others,
            f"A new agent joined the room: {track.name} (id: {track.id}, "
            f"seat: {track.seat or 'no seat'}, model: {track.model}). "
            f"Reach it with send_message using that id.",
            wake=False)
    except Exception:
        pass


_session_floor_ms = _now_ms()


def session_started_ms():
    return _session_floor_ms


def _move_floor(ms):
    global _session_floor_ms
    _session_floor_ms = ms


def session_meta():
    with _session_lock:
        return {"id": _session["id"], "name": _session["name"],
                "saved": _session["saved"], "plan": _session["plan"]}


def set_plan(plan):
    if plan is None:
        return
    with _session_lock:
        _session["plan"] = plan


def session_plan():
    with _session_lock:
        return _session["plan"]


def _initiate_cable_walk(region_id):
    with _tracks_lock:
        caller = _regions.get(region_id)
        node_id = caller.node_id if caller is not None else None
    if not node_id:
        return []
    with _session_lock:
        plan = _session["plan"]
    if not isinstance(plan, dict):
        return []
    phases = [p for p in (plan.get("phases") or []) if isinstance(p, dict)]
    if not phases:
        return []
    sel = plan.get("selPhase")
    chosen = next((p for p in phases if p.get("id") == sel), phases[0])
    out = []
    for cable in (chosen.get("cables") or []):
        if not isinstance(cable, dict):
            continue
        act = cable.get("action")
        if not isinstance(act, str) or act.strip() != "initiate":
            continue
        a, b = cable.get("a"), cable.get("b")
        if not isinstance(a, dict) or not isinstance(b, dict):
            continue
        if a.get("n") != node_id:
            continue
        target = b.get("n")
        if target:
            out.append((target, cable.get("content")))
    return out


def _initiate_by_node():
    with _tracks_lock:
        by_node = {}
        for reg in _regions.values():
            if reg.node_id and reg.node_id not in by_node:
                by_node[reg.node_id] = reg
        return by_node


def initiate_targets(region_id):
    wanted = []
    for target, _content in _initiate_cable_walk(region_id):
        if target not in wanted:
            wanted.append(target)
    if not wanted:
        return []
    by_node = _initiate_by_node()
    return [by_node[n] for n in wanted if n in by_node]


def initiate_deliveries(region_id):
    by_node = _initiate_by_node()
    out = []
    for target, content in _initiate_cable_walk(region_id):
        if not isinstance(content, str) or not content:
            continue
        reg = by_node.get(target)
        if reg is not None:
            out.append((reg, content))
    return out


def get_region(region_id):
    with _tracks_lock:
        return _regions.get(region_id)


def display_name(ident):
    if ident == HUMAN_SENDER:
        return "Brandon"
    if ident == SYSTEM_SENDER:
        return "the harness"
    reg = get_region(ident)
    return reg.name if reg is not None else ident


def list_regions():
    with _tracks_lock:
        return list(_regions.values())


def get_track(track_id):
    with _tracks_lock:
        return _tracks.get(track_id)


def list_tracks():
    with _tracks_lock:
        return list(_tracks.values())


def track_of(region_id):
    with _tracks_lock:
        reg = _regions.get(region_id)
        return _tracks.get(reg.track) if reg is not None else None


def regions_of(track_id):
    with _tracks_lock:
        track = _tracks.get(track_id)
        if track is None:
            return []
        return [_regions[rid] for rid in track.regions if rid in _regions]


def _live_peers():
    return ([{"id": HUMAN_SENDER, "name": "Brandon", "seat": "the human"}] +
            [{"id": t.id, "name": t.name, "seat": t.seat}
             for t in list_regions() if not t.muted])


def set_muted(region_id, muted):
    reg = get_region(region_id)
    if reg is None:
        return None
    muted = bool(muted)
    if reg.muted == muted:
        return reg
    reg.muted = muted
    others = [t.id for t in list_regions() if t.id != reg.id and not t.muted]
    if others:
        word = "is no longer available" if muted else "is now available"
        try:
            waypoint.append_message(
                SYSTEM_SENDER, others, f"{reg.name or reg.id} {word}.", wake=False)
        except Exception:
            pass
    _fire_roster()
    return reg


def closed_rows():
    with _tracks_lock:
        return [dict(r) for r in _closed_rows]


def remove_region(region_id):
    with _tracks_lock:
        reg = _regions.pop(region_id, None)
        if reg is not None:
            track = _tracks.get(reg.track)
            if track is not None and region_id in track.regions:
                track.regions.remove(region_id)
        return reg


def remove_track(track_id):
    with _tracks_lock:
        track = _tracks.pop(track_id, None)
        if track is None:
            return None
        for rid in list(track.regions):
            _regions.pop(rid, None)
        return track


def stop_region(region_id):
    region = get_region(region_id)
    if region is None:
        return False
    region.hub.stop_requested.set()
    region.hub.resolve_gate(None, "n")
    if al.router is not None:
        al.router.claude_interrupt_track(region_id)
    return True


def stop_all_regions():
    n = 0
    for region in list_regions():
        try:
            if stop_region(region.id):
                n += 1
        except Exception:
            pass
    return n


def close_region(region_id):
    region = get_region(region_id)
    if region is None:
        return None
    with region._inbox_lock:
        region._closed = True
        region.inbox.clear()
    region.hub.stop_requested.set()
    region.hub.resolve_gate(None, "n")
    region.close()
    if al.router is not None:
        al.router.claude_close_track(region_id)
    autosave()
    removed = remove_region(region_id)
    if removed is not None:
        with _tracks_lock:
            _closed_rows.append(removed.index_entry())
    dropped = waypoint.dead_letter_all(region_id)
    if dropped:
        name = removed.name if removed is not None else region_id
        by_sender = {}
        for d in dropped:
            if d.get("from"):
                by_sender[d["from"]] = by_sender.get(d["from"], 0) + 1
        for sender_id, n in by_sender.items():
            try:
                waypoint.append_message(
                    SYSTEM_SENDER, [sender_id],
                    f"{n} message(s) you sent to {name} were NOT delivered — "
                    f"that region was closed before it read them. No reply is "
                    f"coming; do not keep waiting on it.")
            except Exception:
                pass
    return removed




def _archive_reset_transcript(region_id, reset_n):
    with _session_lock:
        if not _session["saved"]:
            return None
        sid = _session["id"]
    src = os.path.join(session_dir(sid), f"{region_id}.jsonl")
    if not os.path.isfile(src):
        return None
    dst_name = f"{region_id}.reset-{reset_n}.jsonl"
    try:
        with _archive_lock:
            os.replace(src, os.path.join(session_dir(sid), dst_name))
        return dst_name
    except Exception as e:
        print(f"[tracks._archive_reset_transcript] '{region_id}': {e}")
        return None


def _rebuild_from_row(row, hub=None):
    reg = Region(row["id"], row["name"], row.get("vessel"), row.get("root"),
                 seat=row.get("seat"), overlay_rows=row.get("overlay_rows"),
                 provider=row.get("provider"), loop_class=row.get("loop_class"),
                 mechanism=row.get("mechanism"), track=row.get("track"),
                 carried={k: row.get(k) for k in CARRIED_FIELDS},
                 node_id=row.get("node_id"), hub=hub)
    saved_settings = row.get("settings")
    if isinstance(saved_settings, dict):
        reg.sess.settings.update({k: v for k, v in saved_settings.items()
                                  if k != "model"})
    return reg


def _do_reset(old, row):
    track_id = row.get("track")

    with _tracks_lock:
        track = _tracks.get(track_id)
        slot = track.regions.index(old.id) if (
            track is not None and old.id in track.regions) else None
        if _regions.get(old.id) is not old:
            return None

    dropped = waypoint.dead_letter_all(old.id)

    close_region(old.id)

    fresh = insert_region(
        track_id, row.get("name"), row.get("vessel"), root=row.get("root"),
        seat=row.get("seat"), overlay_rows=row.get("overlay_rows"),
        settings=row.get("settings"), provider=row.get("provider"),
        loop_class=row.get("loop_class"), mechanism=row.get("mechanism"),
        region={k: row.get(k) for k in CARRIED_FIELDS})
    if fresh is None:
        return None

    fresh.node_id = row.get("node_id")

    if slot is not None:
        with _tracks_lock:
            track = _tracks.get(track_id)
            if track is not None and fresh.id in track.regions:
                track.regions.remove(fresh.id)
                track.regions.insert(min(slot, len(track.regions)), fresh.id)


    reset_note = (fresh.sess.settings.get("reset_instruction") or "").strip()
    if reset_note:
        with fresh._inbox_lock:
            fresh.inbox.append({"type": "message", "content": reset_note})

    if dropped:
        by_sender = {}
        for d in dropped:
            if d.get("from"):
                by_sender[d["from"]] = by_sender.get(d["from"], 0) + 1
        for sender_id, n in by_sender.items():
            try:
                waypoint.append_message(
                    SYSTEM_SENDER, [sender_id],
                    f"{n} message(s) you sent to {fresh.name} were NOT delivered "
                    f"— that region was RESET before it read them, and a reset "
                    f"region comes back with a NEW id. It is live and it can "
                    f"answer you, but it has no memory of anything you sent it "
                    f"and the id you used is dead. Its new id is {fresh.id} — "
                    f"send to that, and re-send anything that still matters.")
            except Exception:
                pass


    _fire_replaced(old.id, fresh.id)
    _fire_roster()
    autosave()

    
    if fresh.sess.settings.get("start_turn_on_reset", True):
        _fire_starter(fresh)
    return fresh


def reset_region(region_id, row=None):
    region = get_region(region_id)
    if region is None:
        return "[reset: no such region]"
    with region._inbox_lock:
        if region._reset_armed:
            return f"[reset: {region.name} is already resetting]"
        if region._closed:
            return "[reset: that region is closed]"
        region._reset_armed = True
        live = region._pumping
    if row is None:
        row = region.index_entry()
    row = dict(row)
    row.pop("claude_session_id", None)
    region.hub.stop_requested.set()
    region.hub.resolve_gate(None, "n")
    region.close_shell()
    if al.router is not None:
        al.router.claude_close_track(region_id)
    threading.Thread(target=_reset_watch, args=(region, row),
                     daemon=True).start()
    if live:
        return (f"[reset armed: {region.name} finishes this turn, then comes back "
                f"as a NEW region — same track, same slot, same settings, and a "
                f"NEW id. No transcript, no context, no cache. Anything you were "
                f"holding this id for is about to be stale; the new one announces "
                f"itself to every live region when it arrives]")
    return (f"[reset: {region.name} comes back as a NEW region — same track, same "
            f"slot, same settings, and a NEW id. No transcript, no context, no "
            f"cache. Anything you were holding this id for is now stale; the new "
            f"one announces itself to every live region when it arrives]")


def _reset_watch(old, row):
    deadline = time.monotonic() + 3600
    while time.monotonic() < deadline:
        with old._inbox_lock:
            if not old._pumping:
                break
        time.sleep(0.25)
    else:
        print(f"[tracks._reset_watch] '{old.id}' never left its turn — reset abandoned")
        return
    _do_reset(old, row)


def attach(region_id, webio, label=None):
    region = get_region(region_id)
    if region is None:
        return None
    lbl = label or region.hub.next_guest_label()
    region.hub.add(webio, lbl)
    return lbl


def detach(region_id, webio):
    region = get_region(region_id)
    if region is not None:
        region.hub.remove(webio)


_archive_lock = threading.Lock()


def _final_flush(track):
    twin = get_region(track.id)
    if twin is not None and twin is not track:
        return
    with _session_lock:
        if not _session["saved"]:
            return
        sid = _session["id"]
    with _archive_lock:
        track.flush(session_dir(sid))


SESSION_KIND  = "ade-session"
TEMPLATE_KIND = "ade-template"

ARCHIVE_SCHEMA = 5


def _is_closed(row):
    return any(e.get("event") in ("killed", "closed")
               for e in row.get("lifecycle", []))


def _write_archive(sid, name, created):
    with _archive_lock:
        d = session_dir(sid)
        os.makedirs(d, exist_ok=True)
        regions = list_regions()
        tracks  = list_tracks()
        with _tracks_lock:
            dead_rows = [dict(r) for r in _closed_rows]
        plan = session_plan()
        master = {
            "schema":  ARCHIVE_SCHEMA,
            "kind":    SESSION_KIND,
            "id":      sid,
            "name":    name,
            "created": created,
            "workspace_root": rt.WORKSPACE_ROOT,
            "saved_ts": int(datetime.datetime.now().timestamp() * 1000),
            "tracks":  [t.index_entry() for t in tracks],
            "regions": [r.index_entry() for r in regions] + dead_rows,
            "plan":    plan,
        }
        with open(os.path.join(d, "master.json"), "w") as fh:
            json.dump(master, fh, indent=2)
        for r in regions:
            r.flush(d)


def _read_master(mpath):
    with open(mpath) as fh:
        master = json.load(fh)
    if master.get("schema", 1) < 2 and "regions" not in master:
        rows, tracks, regions = master.get("tracks", []), [], []
        for row in rows:
            row = dict(row)
            if _is_closed(row):
                row.setdefault("track", None)
                regions.append(row)
                continue
            tid = uuid.uuid4().hex[:12]
            tracks.append({
                "id": tid, "name": row.get("name"), "regions": [row["id"]],
                "root": row.get("root"), "order": len(tracks),
                "created": row.get("created"),
            })
            row["track"] = tid
            regions.append(row)
        master["tracks"]  = tracks
        master["regions"] = regions
    master.setdefault("plan", None)
    master["schema"] = ARCHIVE_SCHEMA
    return master


def save_session(name):
    with _session_lock:
        if _session["id"] is None:
            return None
        _session["name"]  = name
        _session["saved"] = True
        sid, created = _session["id"], _session["created"]
    _write_archive(sid, name, created)
    return session_dir(sid)


def autosave():
    with _session_lock:
        if not _session["saved"]:
            return
        sid, name, created = _session["id"], _session["name"], _session["created"]
    _write_archive(sid, name, created)


TEMPLATE_BLANKED = ("status", "stxt")


def save_template(name):
    with _session_lock:
        if _session["id"] is None:
            return None
    regions, tracks = list_regions(), list_tracks()
    plan    = session_plan()
    tid     = uuid.uuid4().hex[:12]
    created = _now_iso()

    rows = []
    for r in regions:
        row = r.index_entry()
        row["lifecycle"]         = [{"event": "created", "ts": created}]
        row["turn_ordinal"]      = 0
        row["claude_session_id"] = None
        for k in TEMPLATE_BLANKED:
            row[k] = None
        rows.append(row)

    live = {row["id"] for row in rows}
    track_rows = []
    for t in tracks:
        row = t.index_entry()
        row["regions"] = [rid for rid in row["regions"] if rid in live]
        track_rows.append(row)

    master = {
        "schema":   ARCHIVE_SCHEMA,
        "kind":     TEMPLATE_KIND,
        "id":       tid,
        "name":     name,
        "created":  created,
        "saved_ts": _now_ms(),
        "tracks":   track_rows,
        "regions":  rows,
        "plan":     plan,
    }
    d = session_dir(tid)
    with _archive_lock:
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "master.json"), "w") as fh:
            json.dump(master, fh, indent=2)
    return d


def _hydrate_region(track, sdir):
    path = os.path.join(sdir, f"{track.id}.jsonl")
    if os.path.isfile(path):
        msgs = []
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    msgs.append(json.loads(line))
        if msgs:
            for m in msgs:
                m.setdefault("_turn", 0)
            track.sess.messages = msgs
    track._flushed = len(_archive_lines(track.sess.messages))
    track.sess.autosave  = True
    track.sess.save_name = track.id


def _halt_live_world():
    for old in list_regions():
        with old._inbox_lock:
            old._closed = True
            old.inbox.clear()
        old.hub.stop_requested.set()
        old.hub.resolve_gate(None, "n")
        old.close_shell()


def _world_from_master(master, hydrate_dir):
    fresh_tracks = [Track(row["id"], row.get("name"),
                          regions=row.get("regions") or [],
                          root=row.get("root"),
                          order=(row.get("order") if row.get("order") is not None
                                 else i),
                          created=row.get("created"))
                    for i, row in enumerate(master.get("tracks", []))]
    fresh, dead = [], []
    for row in master.get("regions", []):
        if _is_closed(row):
            dead.append(dict(row))
            continue
        t = Region(row["id"], row["name"], row.get("vessel"), row.get("root"),
                   seat=row.get("seat"), overlay_rows=row.get("overlay_rows"),
                   provider=row.get("provider"), loop_class=row.get("loop_class"),
                   mechanism=row.get("mechanism"), track=row.get("track"),
                   carried={k: row.get(k) for k in CARRIED_FIELDS},
                   node_id=row.get("node_id"))
        saved_settings = row.get("settings")
        if isinstance(saved_settings, dict):
            t.sess.settings.update({k: v for k, v in saved_settings.items()
                                    if k != "model"})
        t.lifecycle = list(row.get("lifecycle", t.lifecycle))
        t.created = row.get("created") or t.created
        t.sess.created = t.created
        t._turn_ordinal = int(row.get("turn_ordinal") or 0)
        if hydrate_dir is not None:
            _hydrate_region(t, hydrate_dir)
        saved_claude_id = row.get("claude_session_id")
        if saved_claude_id and al.router is not None:
            al.router.claude_reattach(t.id, t.model, saved_claude_id,
                                      al.build_payload(t.sess.messages))
        fresh.append(t)
    known = {tr.id for tr in fresh_tracks}
    for t in fresh:
        if t.track not in known:
            orphan = Track(uuid.uuid4().hex[:12], t.name, regions=[t.id],
                           root=t.root, order=len(fresh_tracks),
                           created=t.created)
            t.track = orphan.id
            t.sess.track = orphan.id
            fresh_tracks.append(orphan)
            known.add(orphan.id)
    live_ids = {t.id for t in fresh}
    for tr in fresh_tracks:
        tr.regions = [r for r in tr.regions if r in live_ids]
    return fresh_tracks, fresh, dead


def reload_session(sid):
    mpath = os.path.join(session_dir(sid), "master.json")
    if not os.path.isfile(mpath):
        return None
    master = _read_master(mpath)
    if master.get("kind") == TEMPLATE_KIND:
        return None
    _halt_live_world()
    saved_root = master.get("workspace_root")
    if saved_root and saved_root != rt.WORKSPACE_ROOT:
        al.set_and_persist_root(saved_root)
    fresh_tracks, fresh, dead = _world_from_master(master, session_dir(sid))
    with _session_lock:
        with _tracks_lock:
            _regions.clear()
            _regions.update({t.id: t for t in fresh})
            _tracks.clear()
            _tracks.update({tr.id: tr for tr in fresh_tracks})
            _closed_rows[:] = dead
        _session.update({"id": master["id"], "name": master.get("name"),
                         "saved": True, "created": master.get("created"),
                         "plan": master.get("plan")})
    _point_stores_at(master["id"])
    _move_floor(0)
    return list_regions()


def instantiate_template(tid):
    mpath = os.path.join(session_dir(tid), "master.json")
    if not os.path.isfile(mpath):
        return None
    master = _read_master(mpath)
    if master.get("kind") != TEMPLATE_KIND:
        return None
    _halt_live_world()
    fresh_tracks, fresh, dead = _world_from_master(master, None)
    sid, created = uuid.uuid4().hex[:12], _now_iso()
    with _session_lock:
        with _tracks_lock:
            _regions.clear()
            _regions.update({t.id: t for t in fresh})
            _tracks.clear()
            _tracks.update({tr.id: tr for tr in fresh_tracks})
            _closed_rows[:] = dead
        _session.update({"id": sid, "name": None, "saved": False,
                         "created": created, "plan": master.get("plan")})
    _point_stores_at(sid)
    _move_floor(_now_ms())
    return list_regions()


def _reset_to_scratch():
    autosave()
    for old in list_regions():
        with old._inbox_lock:
            old._closed = True
            old.inbox.clear()
        old.hub.stop_requested.set()
        old.hub.resolve_gate(None, "n")
        old.close_shell()
        dq.terminate_session(old.sess.sid)
    with _session_lock:
        with _tracks_lock:
            _regions.clear()
            _tracks.clear()
            _closed_rows[:] = []
        _session.update({"id": None, "name": None, "saved": False,
                         "created": None, "plan": None})
    _point_stores_at(None)
    _move_floor(_now_ms())
    return list_regions()


def new_session():
    return _reset_to_scratch()


def end_session():
    return _reset_to_scratch()


def unsaved_summary():
    with _session_lock:
        if _session["id"] is None or _session["saved"]:
            return None
    regions = list_regions()
    if not regions:
        return None
    return {"session_id": _session["id"],
            "tracks": [{"id": t.id, "name": t.name} for t in regions]}


def close():
    autosave()
