
import json
import os
import re
import threading
import time
import uuid

from engine import agent_loop as al
from engine import compiler

_ECHO_TAG_RE = re.compile(r'^\[[^\]\n]+\]:\s?')

_ECHO_MD_RE = re.compile(r'^(?:\*\*|__)([^*_\n]+)(?:\*\*|__):\s?')

_ECHO_BARE_RE = re.compile(r'^([^\s:]+):\s?')


class _LockedIO:

    def __init__(self, delegate, on_gate):
        self._d      = delegate
        self._lock   = threading.Lock()
        self._on_gate = on_gate

    def ask(self, prompt):
        with self._lock:
            answer = self._d.ask(prompt)
        self._on_gate(prompt, answer)
        return answer

    def __getattr__(self, name):
        return getattr(self._d, name)


class ConferenceRoom:

    def __init__(self, webio, participants=None, mode="dictate"):
        self.webio        = webio
        self.participants = list(participants or [])
        self.mode         = mode
        self.transcript   = []
        self._gate_history = []

        self.current_speaker = None
        self._speaker_lock = threading.Lock()

        self._stop_flag = threading.Event()
        self.max_turns  = 5
        self.turn_delay = 0

        _locked_io = _LockedIO(webio, self._record_gate)
        self._coord_sess = al.Session(io_surface=_locked_io, shell="conference")
        self._coord_sess.settings["worker_transport"] = "pipe"


    def add_participant(self, model, nick=""):
        if not model or any(p["model"] == model for p in self.participants):
            return
        self.participants.append({"model": model, "nick": nick or model})
        self._add_entry("system", "system", f"added {model}")
        self._broadcast_init()

    def remove_participant(self, model):
        was_present = any(p["model"] == model for p in self.participants)
        self.participants = [p for p in self.participants if p["model"] != model]
        if was_present:
            self._add_entry("system", "system", f"removed {model}")
        self._broadcast_init()

    def reorder(self, order):
        by_model = {p["model"]: p for p in self.participants}
        new_list = [by_model[m] for m in order if m in by_model]
        for p in self.participants:
            if p["model"] not in order:
                new_list.append(p)
        self.participants = new_list
        self._broadcast_init()

    def set_mode(self, mode):
        if mode in ("dictate", "turn-based", "reactive", "roundtable", "queue"):
            self.mode = mode
            self._broadcast_init()

    def claim_turn(self, model):
        with self._speaker_lock:
            self.current_speaker = model

    def pass_turn(self):
        if not self.participants:
            return
        with self._speaker_lock:
            if self.current_speaker is None:
                self.current_speaker = self.participants[0]["model"]
            else:
                models = [p["model"] for p in self.participants]
                try:
                    idx = models.index(self.current_speaker)
                    self.current_speaker = models[(idx + 1) % len(models)]
                except (ValueError, ZeroDivisionError):
                    self.current_speaker = models[0] if models else None

    def _nick(self, model):
        for p in self.participants:
            if p["model"] == model:
                return p["nick"]
        return model

    def _resolve_name(self, name):
        name = name.strip().rstrip(",.;:!?")
        for p in self.participants:
            if p["nick"] == name or p["model"] == name:
                return p["model"]
        return name


    def _broadcast_init(self):
        self.webio.send_room_init(self.participants, self.mode)

    def _record_gate(self, prompt, answer):
        entry = {
            "id":     uuid.uuid4().hex[:8],
            "prompt": prompt[:300],
            "answer": answer,
            "ts":     int(time.time() * 1000),
        }
        self._gate_history.append(entry)
        if len(self._gate_history) > 100:
            self._gate_history = self._gate_history[-100:]
        self.webio.send_gate_history(self._gate_history)

    def _is_known_nick(self, name):
        return any(p["nick"] == name for p in self.participants)

    def _strip_echo(self, content):
        stripped = _ECHO_TAG_RE.sub("", content, count=1)
        if stripped != content:
            return stripped

        m = _ECHO_MD_RE.match(content)
        if m and self._is_known_nick(m.group(1)):
            return content[m.end():]

        m = _ECHO_BARE_RE.match(content)
        if m and self._is_known_nick(m.group(1)):
            return content[m.end():]

        return content

    def _add_entry(self, role, model, content):
        if role == "assistant":
            content = self._strip_echo(content)
        entry = {
            "id":      uuid.uuid4().hex[:8],
            "role":    role,
            "model":   model,
            "nick":    self._nick(model),
            "content": content,
            "ts":      int(time.time() * 1000),
        }
        self.transcript.append(entry)
        self.webio.send_room_entry(entry)
        return entry


    def snapshot(self):
        return {
            "participants": list(self.participants),
            "mode":         self.mode,
            "transcript":   list(self.transcript),
            "gate_history": list(self._gate_history),
            "max_turns":    self.max_turns,
            "turn_delay":   self.turn_delay,
        }

    def restore(self, data):
        self.participants    = list(data.get("participants", []))
        self.mode            = data.get("mode", "dictate")
        self.transcript      = list(data.get("transcript", []))
        self._gate_history   = list(data.get("gate_history", []))
        self.max_turns       = data.get("max_turns", 5)
        self.turn_delay      = data.get("turn_delay", 0)
        self.current_speaker = None
        self.webio.send_room_reset()
        self._broadcast_init()
        for entry in self.transcript:
            self.webio.send_room_entry(entry)
        self.webio.send_gate_history(self._gate_history)

    def _ctx_string(self, tail=15):
        lines = []
        for e in self.transcript[-tail:]:
            tag = e.get("nick") or e["model"] or e["role"]
            lines.append(f"[{tag}]: {e['content']}")
        return "\n".join(lines)

    def _injections(self, model, task):
        return compiler.compile_injections(self._nick(model), model,
                                           shell="conference", task=task)


    def handle_message(self, text):
        stripped = text.strip().lower()
        if stripped == "/harvest":
            self.webio.out("[/harvest is retired — use /remember]", dim=True)
            return
        if stripped == "/remember":
            self._remember_pass()
            return
        self._add_entry("user", "human", text)
        if self.mode == "dictate":
            self._route_dictate(text)
        elif self.mode == "turn-based":
            self._route_turnbased(text)
        elif self.mode == "reactive":
            self._route_reactive(text)
        elif self.mode == "roundtable":
            self._route_roundtable(text)
        elif self.mode == "queue":
            self._route_queue(text)


    def _route_dictate(self, text):
        at = text.strip()
        if at.startswith("@"):
            parts  = at[1:].split(None, 1)
            model  = self._resolve_name(parts[0])
            prompt = parts[1].strip() if len(parts) > 1 else ""
        elif len(self.participants) == 1:
            model  = self.participants[0]["model"]
            prompt = text
        else:
            self.webio.out("[address a participant with @nick message]", dim=True)
            return
        self._call_one(model, prompt)


    def _route_turnbased(self, text):
        if not self.participants:
            self.webio.out("[no participants — add models first]", dim=True)
            return

        with self._speaker_lock:
            if self.current_speaker is None:
                self.current_speaker = self.participants[0]["model"]
            speaker = self.current_speaker

        ctx = self._ctx_string()
        task = (f"Conversation so far:\n{ctx}\n\n{text}") if ctx else text
        system, context = self._injections(speaker, task)
        self.webio.send_room_status(speaker, "working")
        result = al.add_agent(self._coord_sess, speaker, context,
                                 display_name=self._nick(speaker),
                                 system=system)
        self._add_entry("assistant", speaker, result)
        self.webio.send_room_status(speaker, "idle")

        other_models = [p["model"] for p in self.participants if p["model"] != speaker]
        if other_models:
            control_content = "CONTROL:" + json.dumps(
                {"speaker": speaker, "others": other_models})
            self._add_entry("control", "system", control_content)


    def _route_reactive(self, text):
        if not self.participants:
            self.webio.out("[no participants — add models first]", dim=True)
            return
        ctx  = self._ctx_string()
        lock = threading.Lock()

        def run(model):
            task = (
                f"Conversation so far:\n{ctx}\n\n"
                f"Human: {text}\n\n"
                f"Respond if you have something relevant to add."
            )
            system, context = self._injections(model, task)
            self.webio.send_room_status(model, "working")
            result = al.add_agent(self._coord_sess, model, context,
                                      display_name=self._nick(model),
                                      system=system)
            with lock:
                self._add_entry("assistant", model, result)
            self.webio.send_room_status(model, "idle")

        threads = [threading.Thread(target=run, args=(p["model"],), daemon=True)
                   for p in self.participants]
        for t in threads:
            t.start()
        for t in threads:
            t.join()


    def _route_roundtable(self, seed):
        if not self.participants:
            self.webio.out("[no participants — add models first]", dim=True)
            return

        self._stop_flag.clear()
        with self._speaker_lock:
            if self.current_speaker is None:
                self.current_speaker = self.participants[0]["model"]

        turns = 0
        while turns < self.max_turns:
            if self._stop_flag.is_set():
                break

            models = [p["model"] for p in self.participants]
            if not models:
                break
            if self.current_speaker not in models:
                self.current_speaker = models[0]
            speaker = self.current_speaker

            ctx  = self._ctx_string()
            task = (f"Conversation so far:\n{ctx}\n\n"
                    f"Add your next contribution to the discussion.")
            system, context = self._injections(speaker, task)
            self.webio.send_room_status(speaker, "working")
            result = al.add_agent(self._coord_sess, speaker, context,
                                      display_name=self._nick(speaker),
                                      system=system)
            self._add_entry("assistant", speaker, result)
            self.webio.send_room_status(speaker, "idle")

            self.pass_turn()
            turns += 1
            if self.turn_delay:
                time.sleep(self.turn_delay)

        self._add_entry("system", "system", f"round-table ended ({turns} turns)")


    def _call_one(self, model, prompt):
        if self._stop_flag.is_set():
            return
        ctx  = self._ctx_string()
        task = (f"Conversation so far:\n{ctx}\n\n{prompt}") if ctx else prompt
        system, context = self._injections(model, task)
        self.webio.send_room_status(model, "working")
        result = al.add_agent(self._coord_sess, model, context,
                                  display_name=self._nick(model),
                                  system=system)
        self._add_entry("assistant", model, result)
        self.webio.send_room_status(model, "idle")


    @staticmethod
    def _is_pass(text):
        t = (text or "").strip()
        if not t or len(t) <= 3:
            return True
        return t.lower().startswith("pass")

    def _route_queue(self, seed):
        if not self.participants:
            self.webio.out("[no participants — add models first]", dim=True)
            return
        self._run_bid_round()

    def _run_bid_round(self):
        if not self.participants:
            self.webio.send_room_queue([])
            return
        ctx  = self._ctx_string()
        lock = threading.Lock()
        bids = []

        def run(model):
            task = (
                f"Conversation so far:\n{ctx}\n\n"
                "Want the floor? Reply with ONE line on what you'd add. "
                "If you have nothing to add, reply only: PASS"
            )
            system, context = self._injections(model, task)
            self.webio.send_room_status(model, "working")
            result = al.add_agent(self._coord_sess, model, context,
                                      display_name=self._nick(model),
                                      system=system)
            self.webio.send_room_status(model, "idle")
            if not self._is_pass(result):
                with lock:
                    bids.append({"model": model, "nick": self._nick(model),
                                 "bid": self._strip_echo(result).strip()})

        threads = [threading.Thread(target=run, args=(p["model"],), daemon=True)
                   for p in self.participants]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        if not bids:
            self._add_entry("system", "system", "[queue] all seats passed")
        self.webio.send_room_queue(bids)

    def dispatch_seat(self, model):
        if not any(p["model"] == model for p in self.participants):
            return
        self._call_one(model, "You have the floor — give your full reply now.")
        self._run_bid_round()


    def _remember_pass(self):
        ctx = self._ctx_string(tail=40)
        for p in self.participants:
            nick = p["nick"]
            folder = compiler.resolve_agent(nick)
            if not folder:
                continue
            mem_dir = os.path.join(folder, "memories")
            before = len(os.listdir(mem_dir)) if os.path.isdir(mem_dir) else 0
            task = (
                f"The session is closing. Conversation so far:\n{ctx}\n\n"
                "Store up to 3 memories from this conversation worth "
                "keeping — in your own voice, using the means you have for "
                "keeping memories. If nothing is worth keeping, reply only: "
                "NOTHING TO KEEP"
            )
            system, context = self._injections(p["model"], task)
            self.webio.send_room_status(p["model"], "working")
            al.add_agent(self._coord_sess, p["model"], context,
                             display_name=nick, system=system)
            self.webio.send_room_status(p["model"], "idle")
            after = len(os.listdir(mem_dir)) if os.path.isdir(mem_dir) else 0
            kept = max(after - before, 0)
            self.webio.out(f"[memory store — {nick}: {kept} kept]", dim=True)
