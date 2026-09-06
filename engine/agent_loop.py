
import contextlib
import datetime
import difflib
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid

from engine.providers import Router, CLAUDE_MODELS, is_text_only_provider
from engine import read_tool as rt
from engine import policy
from engine import daemon_queue as dq
from engine import compiler
from engine import waypoint
from engine import SUITE_ROOT
from channels import logicpro as channel_logicpro
from channels import webbrowser as channel_webbrowser


@contextlib.contextmanager
def _default_stop_key_watch():
    yield lambda: False

_DEFAULT_STOP_LABEL = "Stop"

router = None


def _is_claude(model):
    return bool(model) and model in CLAUDE_MODELS

def _is_litert(model):
    return bool(router) and router.litert.handles(model or "")

def _is_llamacpp(model):
    return bool(model) and model.startswith("llamacpp")

DEFAULT_SETTINGS = {
    "mode": "native",
    "model": "",
    "num_ctx": 32768,
    "max_tools": None,
    "list_recursive": False,
    "list_size": True,
    "list_hidden": False,
    "gate_read": False,
    "gate_list": False,
    "step": False,
    "run_stream": True,
    "think": True,

    "allow_agent_reset": True,
  
    "context_reset_cap_k": 300,

    "reset_instruction": ("You have been reset, message The Captain directly "
                          "or agents in chat for instructions"),
  
    "start_turn_on_reset": True,
    "speak":        False,
    "listen":       False,
    "listen_mode":  "ptt",
    "tts_engine":   "say",
    "tts_voice":    "",
    "stt_engine":   "parakeet_mlx",
    "request_timeout": 200,
    "gate_wait_s": 150,
    "temperature":    0.8,
    "top_k":          40,
    "top_p":          0.9,
    "min_p":          0.0,
    "repeat_penalty": 1.1,
    "repeat_last_n":  64,
    "seed":           0,
    "num_predict":    -1,
    "keep_alive":     30,
    "mirostat":       0,
    "mirostat_tau":   5.0,
    "mirostat_eta":   0.1,
    "num_gpu":        None,
    "num_thread":     None,
    "claude_gated":   ["Bash", "Edit", "Write"],
    "claude_mode":    "persistent",
    "claude_effort":  None,
    "claude_partial": True,
    "claude_cache_ttl": "1h",
    "claude_keep_warm": False,
    "claude_exclude_dynamic": False,
    "claude_tools":   [],
    "claude_setting_sources": None,
    "claude_system_prompt": "",
    "claude_bare":    False,
    "claude_config_dir": "",
    "claude_memory_enabled": False,
    "claude_md_excludes": [],
    "claude_output_style": "",
    "claude_disallowed_tools": [],
    "claude_add_dirs": [],
    "claude_hook_ask_blocking": True,
    "claude_settings_file": "",
    "claude_preset":  "",
    "litert_mode":    "oneshot",
    "worker_transport": "pipe",
}


CONTEXT_WARN_FRACTION = 0.75


_GLOBAL_DEFAULTS = {
    "skin": "og",
    "modal_mode": "fullscreen",
    "gate_keyboard": True,
    "approve_hold": False,
    "confirm": {
        "editor_save": "ask", "file_delete": "ask", "file_move": "ask",
        "terminal_run": "ask", "setroot": "ask", "session_new": "ask",
        "session_load": "ask", "delete_saved_session": "ask",
        "delete_voice": "ask", "room_remove": "ask", "room_load": "ask",
        "gate_matrix_save": "ask",
    },
    "killswitch": {"scope": "models",
                    "hold_to_fire": True},
}


def _global_path():
    from engine import SUITE_ROOT
    return os.path.join(SUITE_ROOT, "global.json")


def load_global():
    try:
        with open(_global_path(), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    conf = json.loads(json.dumps(_GLOBAL_DEFAULTS))
    if isinstance(data, dict):
        for k, v in data.items():
            if k in ("killswitch", "confirm"):
                if isinstance(v, dict):
                    conf[k].update({kk: vv for kk, vv in v.items() if kk in conf[k]})
            elif k in conf:
                conf[k] = v
    return conf


def modal_mode():
    return load_global().get("modal_mode", "fullscreen")


def save_global_key(key, value):
    conf = load_global()
    if key.startswith("killswitch."):
        conf["killswitch"][key.split(".", 1)[1]] = value
    elif key.startswith("confirm."):
        conf["confirm"][key.split(".", 1)[1]] = value
    else:
        conf[key] = value
    with open(_global_path(), "w", encoding="utf-8") as f:
        json.dump(conf, f, indent=2)
    return conf

SAFETY_TURNS = 20
MALFORMED_RETRIES = 2
WORKER_COORDINATOR_URL = "http://localhost:5000"

ROOT_CONFIG_PATH = os.path.join(SUITE_ROOT,
                                ".sandbox_config.json")
SESSIONS_INDEX_PATH = os.path.join(SUITE_ROOT,
                                   ".sessions_index.json")


def sessions_dir():
    return os.path.join(SUITE_ROOT, "sessions")


def _project_meta():
    root = rt.WORKSPACE_ROOT
    name = os.path.basename(root.rstrip(os.sep)) or root
    return {"project_path": root, "project_name": name}


def load_persisted_root():
    try:
        with open(ROOT_CONFIG_PATH) as fh:
            path = json.load(fh).get("workspace_root", "")
        if path and os.path.isdir(path):
            rt.set_workspace_root(path)
    except Exception:
        pass


def persist_root(path):
    try:
        with open(ROOT_CONFIG_PATH, "w") as fh:
            json.dump({"workspace_root": path}, fh)
    except Exception:
        pass


def set_and_persist_root(path):
    result = rt.set_workspace_root(path)
    if result.startswith("[workspace root"):
        persist_root(rt.WORKSPACE_ROOT)
    return result


class WorkerIO:

    def __init__(self, transport):
        self._t = transport

    def out(self, text="", *, dim=False, end="\n"):
        self._t.send({"type": "output", "text": text, "dim": dim, "end": end})

    def ask(self, prompt):
        import uuid as _uuid
        req_id = _uuid.uuid4().hex[:8]
        self._t.send({"type": "gate_req", "id": req_id, "prompt": prompt})
        while True:
            event = self._t.recv()
            if event is None:
                return "n"
            t = event.get("type")
            if t == "gate_answer" and event.get("id") == req_id:
                return event.get("answer", "n")
            if t == "stop":
                return "n"

    def meters(self, d):
        self._t.send({"type": "metrics", "data": d})

    def term(self, data):
        self._t.send({"type": "term", "data": data})

    def speak(self, text, *, engine="say", voice=""):
        pass

    def status(self, phase):
        self._t.send({"type": "status", "phase": phase})

    def on_write(self, path):
        pass

    def turn_start(self):
        pass

    def event(self, evt):
        pass


class Session:

    def __init__(self, io_surface=None, sid=None, shell=None):
        self.io             = io_surface
        self.sid            = sid or uuid.uuid4().hex[:8]
        self.shell          = shell
        self.settings       = dict(DEFAULT_SETTINGS)
        self.messages       = []
        self.throughput     = {"tokens": 0, "ns": 0}
        self.stop_key_watch = _default_stop_key_watch
        self.stop_label     = _DEFAULT_STOP_LABEL
        _ts = datetime.datetime.now()
        self.save_id        = _ts.strftime("%Y%m%d-%H%M%S")
        self.created        = _ts.isoformat(timespec="seconds")
        self.autosave       = False
        self.save_name      = None
        self.activity       = []
        self.turn_active    = False
        self.nick           = None


ACTIVITY_CAP = 500

LOG_JSONL_PATH = os.path.join(SUITE_ROOT, "log.jsonl")
_LOG_LOCK = threading.Lock()


def _append_durable_log(evt, shell=None):
    try:
        from engine import ledger
        path = ledger._log_path_for(shell)
    except Exception:
        path = LOG_JSONL_PATH
    with _LOG_LOCK:
        try:
            with open(path, "a") as fh:
                fh.write(json.dumps(evt) + "\n")
        except Exception:
            pass


def log_event(sess, kind, _full=None, _prior=None, **data):
    evt = {"ts": int(time.time() * 1000), "kind": kind, **data}
    rec_id = _record_event(sess, kind, data, _full, _prior)
    if rec_id:
        evt["rec"] = rec_id
    sess.activity.append(evt)
    if len(sess.activity) > ACTIVITY_CAP:
        del sess.activity[:-ACTIVITY_CAP]
    sess.io.event(evt)
    _append_durable_log(evt, getattr(sess, "shell", None))
    return evt


ARGS_CAP = 2048


def _capped_args(args):
    if not isinstance(args, dict):
        return None
    out = {}
    for k, v in args.items():
        if isinstance(v, str) and len(v) > ARGS_CAP:
            v = v[:ARGS_CAP] + f"\n… [{len(v)} chars total — full text in output]"
        out[k] = v
    return out


def _record_event(sess, kind, data, full=None, prior=None):
    try:
        from engine import ledger
        now = int(time.time() * 1000)
        if kind == "alert":
            ledger.append({"schema": ledger.SCHEMA_VERSION, "id": ledger.new_id(),
                           "kind": "alert", **ledger.custody(sess),
                           "trigger": data.get("trigger"), "ts": now})
            return None
        if kind == "tool":
            args = _capped_args(getattr(sess, "_tool_args", None))
            sess._tool_args = None
            rec = ledger.action_record(
                custody=ledger.custody(sess),
                action_type=data.get("verb"),
                edge=data.get("verb"),
                payload={"target": data.get("target"),
                         **({"args": args} if args else {}),
                         **(prior or {})},
                parked=now, resolved=now, outcome="fired",
                summary=data.get("summary"),
                result=full if full is not None else data.get("detail"))
            if data.get("failed"):
                rec["failed"] = True
            stamp = getattr(sess, "_gate_stamp", None)
            sess._gate_stamp = None
            if stamp and stamp.get("target") == data.get("target"):
                rec["gate_id"] = stamp["rec"]
                rec["gate_hook"] = stamp.get("hook")
                rec["gate_answer"] = True
        elif kind == "gate":
            answer = data.get("answer")
            answered_by = data.get("answered_by")
            if answer is None and answered_by in ("disconnect", "timeout"):
                outcome = "parked"
            elif answer is None:
                outcome = None
            else:
                outcome = "fired" if answer else "denied"
            rec = ledger.action_record(
                custody=ledger.custody(sess),
                action_type="gate", edge=data.get("action"),
                payload={"target": data.get("target"),
                         "queue_id": data.get("queue_id")},
                hook=data.get("hook"), answer=answer,
                answered_by=answered_by,
                parked=now, resolved=None if outcome is None else now,
                outcome=outcome,
                summary=f"{data.get('action')}  {data.get('target')}")
        else:
            return None
        ledger.append(rec)
        return rec.get("id")
    except Exception:
        return None


def _stamp_gate_for_execution(sess, evt, target, hook):
    rec = (evt or {}).get("rec")
    sess._gate_stamp = ({"rec": rec, "target": target, "hook": hook}
                        if rec else None)


def system_message(sess):
    root_note = (f"\n\nYour workspace root is: {rt.WORKSPACE_ROOT}\n"
                 "Relative paths resolve there. Reaching outside the workspace "
                 "needs the human's approval each time.")
    if (sess.settings["mode"] == "text" or _is_claude(sess.settings["model"])
            or _is_llamacpp(sess.settings["model"])):
        return {"role": "system", "content": rt.TEXT_SYSTEM_HINT + root_note}
    return {"role": "system",
            "content": "You can read, list, and write project files and run shell "
                       "commands with the read_file, list_files, write_file, and "
                       "run_command tools. A human approves writes and commands."
                       "ask or wait for instructions before you do any of these."
                       + root_note}


def reseat(sess, *, shell="ide"):
    sess.messages = [m for m in sess.messages if not m.get("_seat_context")]

    region_id   = getattr(sess, "region", None)
    region_name = getattr(sess, "region_name", None)
    if sess.nick:
        system, context = compiler.compile_injections(
            sess.nick, sess.settings["model"], shell=shell,
            region_id=region_id, region_name=region_name)
        sess.messages[0] = {"role": "system", "content": system}
        if context:
            sess.messages.insert(1, {"role": "system", "content": context, "_seat_context": True})
    else:
      
        msg  = system_message(sess)
        blk  = compiler.self_block(region_id, region_name)
        if blk:
            msg = {**msg, "content": msg["content"] + "\n\n" + blk}
        sess.messages[0] = msg


def _worker_system_message():
    root_note = (f"\n\nYour workspace root is: {rt.WORKSPACE_ROOT}\n"
                 "Relative paths resolve there. Reaching outside the workspace "
                 "needs the human's approval each time.")
    return {"role": "system", "content": rt.TEXT_WORKER_HINT + root_note}


_HANDOVER_LINE_RE = re.compile(
    r"^====\s*handover\s*->\s*[A-Za-z0-9?]+/[A-Za-z0-9?]+\s*====\s*\n?", re.IGNORECASE)
_TAG_VESSEL_PREFIX_RE = re.compile(r"^[A-Z0-9?]{1,12}/[A-Z0-9?]{1,12}:\s?")


def _strip_self_handover(content):
    stripped = _HANDOVER_LINE_RE.sub("", content, count=1)
    stripped = _TAG_VESSEL_PREFIX_RE.sub("", stripped, count=1)
    return stripped


def _current_author(sess):
    return {"tag": compiler.resolve_tag(sess.nick),
            "vessel": compiler.vessel_handle(sess.settings["model"])}


def build_payload(messages):
    out = []
    last_author = None
    have_author = False
    for m in messages:
        author = m.get("_author") if m.get("role") == "assistant" else None
        if author is not None:
            if have_author and author != last_author:
                tag    = author.get("tag", "??")
                vessel = author.get("vessel", "??")
                out.append({"role": "user",
                            "content": f"==== handover -> {tag}/{vessel} ===="})
            last_author = author
            have_author = True
        d = {"role": m["role"], "content": m["content"]}
        if m.get("tool_calls"):
            d["tool_calls"] = m["tool_calls"]
        if m.get("media"):
            d["media"] = m["media"]
        out.append(d)
    return out


def run_turn(sess, client, payload):
    s = sess.settings
    _provider = getattr(sess, "provider", None)
    _is_text_only = (_is_claude(s["model"]) or _is_litert(s["model"]) or _is_llamacpp(s["model"])
                      or is_text_only_provider(_provider, s["model"]))
    tools = rt.NATIVE_TOOLS if s["mode"] == "native" and not _is_text_only else None
    content, thinking, tool_calls, aborted = [], [], None, False
    metrics = None
    seen_thinking, seen_content = False, False
    abort_metrics = {}

    _root_arg, _root_note = rt.usable_root(getattr(sess, "root", None))
    if _root_note:
        sess.io.out(_root_note, dim=True)

    sess.io.turn_start()
    with sess.stop_key_watch() as stop_pressed:
        stream = client.chat(
            payload,
            model=s["model"] or None,
            provider=_provider,
            num_ctx=s["num_ctx"],
            tools=tools,
            timeout=(10, s["request_timeout"]),
            temperature=s["temperature"],
            top_k=s["top_k"],
            top_p=s["top_p"],
            min_p=s["min_p"],
            repeat_penalty=s["repeat_penalty"],
            repeat_last_n=s["repeat_last_n"],
            seed=s["seed"],
            num_predict=s["num_predict"],
            keep_alive=s["keep_alive"],
            mirostat=s["mirostat"],
            mirostat_tau=s["mirostat_tau"],
            mirostat_eta=s["mirostat_eta"],
            num_gpu=s["num_gpu"],
            num_thread=s["num_thread"],
            claude_gated=s["claude_gated"],
            claude_mode=s["claude_mode"],
            claude_effort=s["claude_effort"],
            claude_partial=s["claude_partial"],
            claude_cache_ttl=s["claude_cache_ttl"],
            claude_keep_warm=s["claude_keep_warm"],
            claude_exclude_dynamic=s["claude_exclude_dynamic"],
            claude_tools=s["claude_tools"],
            claude_setting_sources=s["claude_setting_sources"],
            claude_system_prompt=s["claude_system_prompt"],
            claude_bare=s["claude_bare"],
            claude_config_dir=s["claude_config_dir"],
            claude_memory_enabled=s["claude_memory_enabled"],
            claude_md_excludes=s["claude_md_excludes"],
            claude_output_style=s["claude_output_style"],
            claude_settings_file=s["claude_settings_file"],
            claude_preset=s["claude_preset"],
            claude_disallowed_tools=s["claude_disallowed_tools"],
            claude_add_dirs=s["claude_add_dirs"],
            claude_root=_root_arg,
            gate_wait_s=s["gate_wait_s"],
            claude_track_id=sess.sid,
            litert_mode=s["litert_mode"],
            metrics_sink=abort_metrics,
            think=(None if s["think"] else False),
        )
        for channel, data in stream:
            if stop_pressed():
                aborted = True
                sess.io.out(f"\n[stopped — you hit {sess.stop_label}]", dim=True)
                break
            if channel == "thinking":
                if not seen_thinking:
                    seen_thinking = True
                    sess.io.status("thinking")
                sess.io.out(data, dim=True, end="")
                thinking.append(data)
            elif channel == "content":
                if not seen_content:
                    seen_content = True
                    sess.io.status("working")
                sess.io.out(data, end="")
                content.append(data)
            elif channel == "tool_call":
                tool_calls = data
            elif channel == "metrics":
                metrics = data
        if not aborted and stop_pressed():
            aborted = True
            sess.io.out(f"\n[stopped — you hit {sess.stop_label}]", dim=True)
        if aborted:
            try:
                stream.close()
            except Exception:
                pass
    sess.io.out()

    if metrics is None and abort_metrics:
        metrics = dict(abort_metrics)

    if metrics:
        out_tok        = metrics.get("out_tokens", 0)
        in_tok         = metrics.get("in_tokens", 0)
        cache_read     = metrics.get("cache_read", 0)
        cache_creation = metrics.get("cache_creation", 0)
        dur_ns         = metrics.get("duration_ns", 0)
        cost_usd       = metrics.get("cost_usd", 0.0)
        cached         = cache_read + cache_creation
        _acc = getattr(sess, "_turn_usage", None)
        if _acc is not None:
            _acc["out_tokens"]     += out_tok
            _acc["in_tokens"]      += in_tok
            _acc["cache_read"]      = max(_acc["cache_read"], cache_read)
            _acc["cache_creation"] += cache_creation
            _acc["duration_ns"]    += dur_ns
            _acc["cost_usd"]       += cost_usd
            _seen = {c.get("id") for c in _acc.setdefault("calls", [])}
            for _c in (metrics.get("calls") or []):
                if _c.get("id") not in _seen:
                    _seen.add(_c.get("id"))
                    _acc["calls"].append(_c)

    if metrics and not aborted:
        sess.throughput["tokens"] += out_tok
        sess.throughput["ns"]     += dur_ns
        ts_now = out_tok / (dur_ns / 1e9) if dur_ns else 0.0
        ts_avg = (sess.throughput["tokens"] / (sess.throughput["ns"] / 1e9)) if sess.throughput["ns"] else 0.0
        sess.io.meters({
            "ctx_used": in_tok + cached,
            "ctx_max": 200000 if _is_claude(s["model"]) else s["num_ctx"],
            "ts_now": ts_now, "ts_avg": ts_avg,
            "in_tokens": in_tok, "out_tokens": out_tok,
            "cached": cached,
        })

    return "".join(content), "".join(thinking), tool_calls, aborted



def _resolve_gate(sess, edge, driver, ctx, prompt, *, action, target,
                   queue_action_type=None, queue_payload=None):
    ctx = dict(ctx or {})
    if modal_mode() == "off":
        ctx["human_attached"] = False
    _overlay = getattr(sess, "policy_overlay", None)
    if _overlay:
        ctx.setdefault("overlay", _overlay)
    _troot = rt._track_root.get()
    if _troot and queue_payload is not None:
        queue_payload = {**queue_payload, "root": _troot}
    hook = policy.resolve(edge, driver, ctx)
    meta = None
    try:
        from engine import ledger
        meta = ledger.custody(sess, driver=driver)
    except Exception:
        pass

    if hook == "open":
        dq.record_resolved(queue_action_type or action, queue_payload or {},
                           driver, hook="open", outcome="fired", meta=meta)
        evt = log_event(sess, "gate", action=action, target=target, answer=True, hook="open")
        _stamp_gate_for_execution(sess, evt, target, "open")
        return True

    if hook == "locked":
        dq.record_resolved(queue_action_type or action, queue_payload or {},
                           driver, hook="locked", outcome="locked", meta=meta)
        log_event(sess, "gate", action=action, target=target, answer=False, hook="locked")
        sess.io.out(f"[locked: {action} → {target} refused by policy]", dim=True)
        return False

    if hook == "queue":
        entry = None
        if queue_action_type is not None:
            entry = dq.park(queue_action_type, queue_payload or {}, driver,
                            hook="queue", meta=meta, prompt=prompt, ensure_gate=True)
        log_event(sess, "gate", action=action, target=target, answer=None,
                  hook="queue", queue_id=entry["id"] if entry else None)
        sess.gate_parked = True
        return False

    if not dq.has_notifier():
        log_event(sess, "alert", trigger="gate")
        ans = sess.io.ask(prompt).strip().lower() in ("y", "yes")
        evt = log_event(sess, "gate", action=action, target=target, answer=ans, hook="ask")
        if ans:
            _stamp_gate_for_execution(sess, evt, target, "ask")
        dq.notify("gate_answered")
        return ans

    getattr(sess.io, "assert_off_receiver", lambda: None)()
    entry = dq.park(queue_action_type or action, queue_payload or {}, driver,
                    hook="ask", meta=meta, prompt=prompt, register_waiter=True)
    log_event(sess, "alert", trigger="gate")
    ans = dq.await_answer(entry["id"], timeout=sess.settings.get("gate_wait_s"))
    if ans is None:
        dq.downgrade(entry["id"], reason="timeout")
        sess.io.out("[gate timed out — parked in the queue]", dim=True)
        log_event(sess, "gate", action=action, target=target, answer=None,
                  hook="ask", answered_by="timeout", queue_id=entry["id"])
        sess.gate_parked = True
        return False
    if ans == "parked":
        sess.io.out("[no human attached — parked]", dim=True)
        log_event(sess, "gate", action=action, target=target, answer=None,
                  hook="ask", answered_by="disconnect", queue_id=entry["id"])
        sess.gate_parked = True
        return False
    if ans == "deferred":
        sess.io.out("[queued — approve later from the Ledger]", dim=True)
        sess.gate_parked = True
        return False
    ans = bool(ans)
    evt = log_event(sess, "gate", action=action, target=target, answer=ans,
                    hook="ask", answered_by="human")
    if ans:
        _stamp_gate_for_execution(sess, evt, target, "ask")
    dq.notify("gate_answered")
    return ans


def approve_write(sess, path, content, outside=False, driver="model"):
    existing = rt.file_exists(path)
    state = "overwrite" if existing else "create"
    lines = [f"write  {path}  [{state}]"]
    if outside:
        lines.append(f"⚠ outside workspace root")
    if existing:
        old = rt.read_file(path)
        diff_lines = list(difflib.unified_diff(
            old.splitlines(keepends=True),
            content.splitlines(keepends=True),
            fromfile=path, tofile=path, n=2,
        ))
        diff_str = "".join(diff_lines)
        if not diff_str:
            lines.append("(no change)")
        else:
            lines.append(diff_str.rstrip())
    else:
        lines.append(content.rstrip())
    prompt = "\n".join(lines) + "\n\napply? [y/N] "
    edge = "write_file" if driver == "model" else "editor_save"
    ctx = {"scope": "outside" if outside else "inside"}
    return _resolve_gate(sess, edge, driver, ctx, prompt, action="write", target=path,
                          queue_action_type="write", queue_payload={"path": path, "content": content})


def approve_read(sess, op, full):
    prompt = f"{op}  {full}\n\napprove? [y/N] "
    return _resolve_gate(sess, "check_read", "model", {"scope": "inside"}, prompt,
                          action=op, target=full,
                          queue_action_type="read", queue_payload={"op": op, "path": full})


def approve_boundary(sess, op, full):
    prompt = (f"⚠ outside workspace  [{op}]\n"
              f"root: {rt.WORKSPACE_ROOT}\n"
              f"path: {full}\n\n"
              f"allow? [y/N] ")
    return _resolve_gate(sess, "check_read", "model", {"scope": "outside"}, prompt,
                          action=f"boundary:{op}", target=full,
                          queue_action_type="read", queue_payload={"op": op, "path": full})


def approve_run(sess, command):
    prompt = f"run\n\n  $ {command}\n\napprove? [y/N] "
    return _resolve_gate(sess, "run_command", "model", {"scope": "inside"}, prompt,
                          action="run", target=command,
                          queue_action_type="run", queue_payload={"command": command})


def approve_fetch(sess, url):
    prompt = f"fetch  {url}\n\napprove? [y/N] "
    return _resolve_gate(sess, "fetch_url", "model", {"scope": "inside"}, prompt,
                          action="fetch", target=url,
                          queue_action_type="fetch", queue_payload={"url": url})


def approve_screen(sess, what):
    prompt = f"SEE YOUR SCREEN  ({what})\n\napprove? [y/N] "
    return _resolve_gate(sess, "screen_capture", "model", {"scope": "inside"}, prompt,
                          action="screen", target=what,
                          queue_action_type="screen", queue_payload={"what": what})


def approve_recall(sess, query):
    prompt = f"recall  {query!r}\n\napprove? [y/N] "
    return _resolve_gate(sess, "recall", "model", {"scope": "inside"}, prompt,
                          action="recall", target=query,
                          queue_action_type="recall", queue_payload={"query": query})


def approve_send(sess, receivers, body):
    prompt = f"send  → {', '.join(receivers)}\n\n{body}\n\napprove? [y/N] "
    return _resolve_gate(sess, "send_message", "model", {"scope": "any"}, prompt,
                          action="send", target=", ".join(receivers),
                          queue_action_type="send",
                          queue_payload={"receivers": receivers, "body": body,
                                         "sender": getattr(sess, "region", None)})


def approve_request(sess, since_id):
    scope_desc = f"since #{since_id}" if since_id is not None else "everything you're on"
    prompt = f"request messages  ({scope_desc})\n\napprove? [y/N] "
    return _resolve_gate(sess, "request_messages", "model", {"scope": "any"}, prompt,
                          action="request",
                          target=str(since_id) if since_id is not None else "all",
                          queue_action_type="request",
                          queue_payload={"since_id": since_id,
                                         "caller": getattr(sess, "region", None)})


def approve_reset_self(sess, region_name):
    prompt = (f"RESET  {region_name}\n\ncontext, transcript and cache thrown "
              f"away; same track, same settings\n\napprove? [y/N] ")
    return _resolve_gate(sess, "reset_self", "model", {"scope": "any"}, prompt,
                          action="reset", target=region_name,
                          queue_action_type="reset",
                          queue_payload={"region": None,
                                         "requester": getattr(sess, "region", None)})


def approve_reset_region(sess, target):
    prompt = f"RESET ANOTHER REGION  → {target}\n\ncontext, transcript and cache thrown away\n\napprove? [y/N] "
    return _resolve_gate(sess, "reset_region", "model", {"scope": "any"}, prompt,
                          action="reset", target=target,
                          queue_action_type="reset",
                          queue_payload={"region": target,
                                         "requester": getattr(sess, "region", None)})


def approve_remember(sess, title, pin="none"):
    prompt = f"remember  {title}  → {pin}\n\napprove? [y/N] "
    return _resolve_gate(sess, "remember", "model", {"scope": "inside"}, prompt,
                          action="remember", target=title,
                          queue_action_type="remember", queue_payload={"title": title, "pin": pin})



def approve_logic_status(sess):
    prompt = "logic_status\n\napprove? [y/N] "
    return _resolve_gate(sess, "logic_status", "model", {"scope": "inside"}, prompt,
                          action="logic_status", target="logicpro",
                          queue_action_type="logic_status", queue_payload={})


def approve_logic_open(sess, path):
    target = path or "Logic Pro"
    prompt = f"logic_open  {target}\n\napprove? [y/N] "
    return _resolve_gate(sess, "logic_open", "model", {"scope": "inside"}, prompt,
                          action="logic_open", target=target,
                          queue_action_type="logic_open", queue_payload={"path": path})


def approve_logic_transport(sess, action):
    prompt = f"logic_transport  {action}\n\napprove? [y/N] "
    return _resolve_gate(sess, "logic_transport", "model", {"scope": "inside"}, prompt,
                          action="logic_transport", target=action,
                          queue_action_type="logic_transport", queue_payload={"action": action})


def approve_logic_command(sess, command):
    prompt = f"logic_command  {command}\n\napprove? [y/N] "
    return _resolve_gate(sess, "logic_command", "model", {"scope": "inside"}, prompt,
                          action="logic_command", target=command,
                          queue_action_type="logic_command", queue_payload={"command": command})



def approve_web_open(sess, url):
    prompt = f"web_open  {url}\n\napprove? [y/N] "
    return _resolve_gate(sess, "web_open", "model", {"scope": "inside"}, prompt,
                          action="web_open", target=url,
                          queue_action_type="web_open", queue_payload={"url": url})


def approve_web_read(sess):
    prompt = "web_read\n\napprove? [y/N] "
    return _resolve_gate(sess, "web_read", "model", {"scope": "inside"}, prompt,
                          action="web_read", target="browser",
                          queue_action_type="web_read", queue_payload={})


def approve_web_screenshot(sess):
    prompt = "web_screenshot\n\napprove? [y/N] "
    return _resolve_gate(sess, "web_screenshot", "model", {"scope": "inside"}, prompt,
                          action="web_screenshot", target="browser",
                          queue_action_type="web_screenshot", queue_payload={})


def approve_web_act(sess, selector, action, text):
    detail = f"{action} on {selector!r}" + (f"  text={text!r}" if action == "type" else "")
    prompt = f"web_act  {detail}\n\napprove? [y/N] "
    return _resolve_gate(sess, "web_act", "model", {"scope": "inside"}, prompt,
                          action="web_act", target=selector,
                          queue_action_type="web_act",
                          queue_payload={"selector": selector, "action": action, "text": text})


def approve_web_eval(sess, js):
    prompt = f"web_eval\n\n{js}\n\napprove? [y/N] "
    return _resolve_gate(sess, "web_eval", "model", {"scope": "inside"}, prompt,
                          action="web_eval", target="eval",
                          queue_action_type="web_eval", queue_payload={"js": js})


def approve_step(sess, name, args, reason):
    prompt = f"{name}  [{reason}]\n\n{args}\n\nrun? [y/N] "
    log_event(sess, "alert", trigger="gate")
    ans = sess.io.ask(prompt).strip().lower() in ("y", "yes")
    log_event(sess, "gate", action=f"step:{name}",
              target=str(args.get("path") or args.get("command") or name), answer=ans)
    return ans


def _drain_worker(sess, target, channel, display_name=None):
    label = display_name or target
    header_shown = False
    try:
        while True:
            event = channel.recv()
            if event is None:
                return "[agent terminated unexpectedly]"
            t = event.get("type")

            if t == "output":
                if not header_shown:
                    sess.io.out(f"\n[agent → {label}]", dim=True)
                    header_shown = True
                sess.io.out(event.get("text", ""),
                            dim=event.get("dim", False),
                            end=event.get("end", "\n"))

            elif t == "gate_req":
                base = event.get("prompt", "proceed? [y/N] ")
                answer = sess.io.ask(f"[{label}]\n{base}")
                channel.send({"type": "gate_answer",
                              "id": event.get("id", ""), "answer": answer})

            elif t == "metrics":
                sess.io.meters(event.get("data", {}))

            elif t == "term":
                sess.io.term(event.get("data", ""))

            elif t == "status":
                sess.io.status(event.get("phase", ""))

            elif t == "done":
                return event.get("text", "")

            elif t == "error":
                return f"[agent error: {event.get('message', 'unknown')}]"

    finally:
        channel.close()


def add_agent(sess, target, task, display_name=None, system=None):
    import uuid as _uuid
    from engine.worker_transports import PipeChannel, HTTPChannel, register_worker

    worker_id     = _uuid.uuid4().hex[:8]
    worker_cmd    = [sys.executable, "-m", "engine.worker"]
    transport     = sess.settings.get("worker_transport", "pipe")

    start_event = {
        "type":           "start",
        "model":          target,
        "task":           task,
        "settings":       dict(sess.settings),
        "workspace_root": rt.WORKSPACE_ROOT,
    }
    if system:
        start_event["system"] = system
    if display_name:
        start_event["nick"] = display_name

    if transport == "http":
        register_worker(worker_id)
        proc = subprocess.Popen(
            worker_cmd + ["--coordinator", WORKER_COORDINATOR_URL, "--id", worker_id],
            cwd=SUITE_ROOT,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        channel = HTTPChannel(worker_id, proc)
    else:
        proc = subprocess.Popen(
            worker_cmd,
            cwd=SUITE_ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        channel = PipeChannel(proc)

    channel.send(start_event)
    return _drain_worker(sess, target, channel, display_name=display_name)


def execute_tool(sess, name, args):
    sess.gate_parked = False
    sess._tool_args = args if isinstance(args, dict) else None
    _root_token = rt._track_root.set(getattr(sess, "root", None))
    try:
        out = _execute_tool(sess, name, args)
    finally:
        rt._track_root.reset(_root_token)
    if not getattr(sess, "gate_parked", False):
        return _with_context_warning(sess, out)
    parked = (f"[{name.upper()} PARKED: no human answered, so it is queued for "
              f"approval. It was NOT denied — do not retry it and do not tell "
              f"the human they refused it. It fires if and when they approve.]")
    out = (parked, []) if isinstance(out, tuple) else parked
    return _with_context_warning(sess, out)


def _with_context_warning(sess, out):
    note = getattr(sess, "_ctx_warn", None)
    if not note:
        return out
    sess._ctx_warn = None
    if isinstance(out, tuple):
        text, rest = out[0], out[1:]
        return (note + "\n\n" + str(text),) + rest
    return note + "\n\n" + str(out)


def _execute_tool(sess, name, args):
    s = sess.settings
    if name == "read_file":
        path = args.get("path", "")
        full = rt._resolve(path)
        if rt.is_outside_root(full):
            if not approve_boundary(sess, "read", full):
                return f"[READ denied: '{path}' is outside the workspace and access was refused]"
        elif not approve_read(sess, "read", full):
            return f"[READ denied by user: '{path}' was not read]"
        result = rt.read_file(path)
        lines = result.splitlines()
        log_event(sess, "tool", verb="read", target=path,
                  summary=f"{len(result)} chars, {len(lines)} lines",
                  detail="\n".join(ln[:120] for ln in lines[:4]),
                  _full=result)
        return result
    if name == "list_files":
        path = args.get("path") or "."
        full = rt._resolve(path)
        if rt.is_outside_root(full):
            if not approve_boundary(sess, "list", full):
                return f"[LIST denied: '{path}' is outside the workspace and access was refused]"
        elif not approve_read(sess, "list", full):
            return f"[LIST denied by user: '{path}' was not listed]"
        result = rt.list_files(path,
                               recursive=s["list_recursive"],
                               show_size=s["list_size"],
                               show_hidden=s["list_hidden"])
        entries = [l for l in result.splitlines() if l.strip()]
        log_event(sess, "tool", verb="list", target=path,
                  summary=f"{len(entries)} entries",
                  detail="\n".join(entries[:8]))
        return result
    if name == "view_image":
        path = args.get("path", "")
        full = rt._resolve(path)
        if rt.is_outside_root(full):
            if not approve_boundary(sess, "view_image", full):
                return (f"[VIEW_IMAGE denied: '{path}' is outside the workspace "
                        f"and access was refused]", [])
        elif not approve_read(sess, "view_image", full):
            return (f"[VIEW_IMAGE denied by user: '{path}' was not viewed]", [])
        text, media = rt.view_image(path)
        log_event(sess, "tool", verb="view", target=path,
                  summary=(f"image  {len(media[0]['data_b64'])} b64 chars"
                           if media else "failed"))
        return text, media
    if name == "screen_capture":
        region = str(args.get("region", "") or "")
        display = args.get("display", 1) or 1
        what = f"region {region}" if region else f"display {display}"
        if not approve_screen(sess, what):
            return f"[SCREEN_CAPTURE denied by user: {what} was not captured]", []
        text, media = rt.screen_capture(display=display, region=region)
        log_event(sess, "tool", verb="screen", target=what,
                  summary=(f"capture  {len(media[0]['data_b64'])} b64 chars"
                           if media else "failed"))
        return text, media
    if name == "write_file":
        path, content = args.get("path", ""), args.get("content", "")
        outside = rt.is_outside_root(rt._resolve(path))
        if not approve_write(sess, path, content, outside=outside):
            return f"[WRITE denied by user: '{path}' was not written]"
        prior = None
        try:
            from engine import ledger
            prior = ledger.prior_state(path)
        except Exception:
            pass
        result = rt.write_file(path, content)
        wrote = result.startswith("[WRITE ok:")
        on_write = getattr(sess.io, "on_write", None)
        if on_write:
            on_write(path)
        lines = content.splitlines()
        log_event(sess, "tool", verb="write", target=path,
                  summary=(f"{len(content)} chars, {len(lines)} lines" if wrote
                           else result),
                  _full=content if wrote else None,
                  _prior=prior if wrote else None,
                  **({"failed": True} if not wrote else {}))
        return result
    if name == "run_command":
        command = args.get("command", "")
        if not approve_run(sess, command):
            return "[RUN denied by user: command was not executed]"
        if s["run_stream"]:
            sess.io.term(f"$ {command}\n")
            result = rt.run_command(command, on_output=sess.io.term)
        else:
            result = rt.run_command(command)
            sess.io.term(f"$ {command}\n{result}\n")
        first = next((l for l in result.splitlines() if l.strip()), "")
        log_event(sess, "tool", verb="run", target=command, summary=first[:120],
                  _full=result)
        return result
    if name == "fetch_url":
        url = args.get("url", "")
        if not approve_fetch(sess, url):
            return f"[FETCH denied by user: '{url}' was not fetched]"
        result = rt.fetch_url(url)
        log_event(sess, "tool", verb="fetch", target=url, summary=f"{len(result)} chars",
                  _full=result)
        return result
    if name == "remember":
        title = args.get("title", "")
        carry = args.get("carry", "")
        body  = args.get("body", "")
        pin   = args.get("pin", "none")
        nick = getattr(sess, "nick", None)
        if not nick or not compiler.resolve_agent(nick):
            return "[remember refused: no identity bound]"
        if not approve_remember(sess, title, pin):
            return f"[REMEMBER denied by user: '{title}' was not kept]"
        path = compiler.remember(nick, title, carry, body, pin)
        if not path:
            return "[remember refused: no identity bound]"
        log_event(sess, "tool", verb="remember", target=nick, summary=f"{title[:80]} → {pin}")
        return f"[memory kept: {os.path.basename(path)}]"
    if name == "recall":
        query = args.get("query", "")
        nick = getattr(sess, "nick", None)
        folder = compiler.resolve_agent(nick) if nick else None
        if not folder:
            return "[recall refused: no identity bound]"
        if not approve_recall(sess, query):
            return f"[RECALL denied by user: {query!r} was not searched]"
        result = rt.recall_memory(os.path.join(folder, "memories"), query)
        log_event(sess, "tool", verb="recall", target=nick, summary=query[:80])
        return result
    if name == "send_message":
        receivers = args.get("receivers", [])
        body = args.get("body", "")
        sender = getattr(sess, "region", None)
        if not sender:
            return "[send refused: this session has no track identity]"
        if not isinstance(receivers, list) or not receivers or not all(
            isinstance(r, str) and r.strip() for r in receivers
        ):
            return "[send refused: receivers must be a list of track names]"
        if not isinstance(body, str):
            return "[send refused: body must be text]"
        if sender in receivers:
            return "[send refused: cannot send a message to yourself]"
        if not approve_send(sess, receivers, body):
            if getattr(sess, "gate_parked", False):
                return "[send parked]"
            waypoint.append_denied(sender, receivers, body)
            return "[send denied]"
        result = rt.send_message(sender, receivers, body)
        log_event(sess, "tool", verb="send", target=", ".join(receivers),
                  summary=f"{len(body)} chars to {len(receivers)} receiver(s)")
        return result
    if name == "request_messages":
        since_id = args.get("since_id")
        caller = getattr(sess, "region", None)
        if not caller:
            return "[request refused: this session has no track identity]"
        if since_id is not None and (
            isinstance(since_id, bool) or not isinstance(since_id, int)
        ):
            return "[request refused: since_id must be a whole number]"
        if not approve_request(sess, since_id):
            if getattr(sess, "gate_parked", False):
                return "[request parked]"
            waypoint.append_denied(caller, [], "")
            return "[request denied]"
        result = rt.request_messages(caller, since_id)
        log_event(sess, "tool", verb="request", target=caller,
                  summary=f"since_id={since_id}" if since_id is not None else "all")
        return result
    if name == "logic_status":
        if not approve_logic_status(sess):
            return "[logic_status denied by user: status was not checked]"
        result = channel_logicpro.logic_status()
        log_event(sess, "tool", verb="logic_status", target="logicpro", summary=result[:120])
        return result
    if name == "logic_open":
        path = args.get("path", "")
        if not approve_logic_open(sess, path):
            return f"[logic_open denied by user: '{path or 'Logic Pro'}' was not opened]"
        result = channel_logicpro.logic_open(path)
        log_event(sess, "tool", verb="logic_open", target=path or "Logic Pro", summary=result[:120])
        return result
    if name == "logic_transport":
        action = args.get("action", "")
        if not approve_logic_transport(sess, action):
            return f"[logic_transport denied by user: '{action}' was not sent]"
        result = channel_logicpro.logic_transport(action)
        log_event(sess, "tool", verb="logic_transport", target=action, summary=result[:120])
        return result
    if name == "logic_command":
        command = args.get("command", "")
        if not approve_logic_command(sess, command):
            return f"[logic_command denied by user: '{command}' was not sent]"
        result = channel_logicpro.logic_command(command)
        log_event(sess, "tool", verb="logic_command", target=command, summary=result[:120])
        return result
    if name == "web_open":
        url = args.get("url", "")
        if not approve_web_open(sess, url):
            return f"[web_open denied by user: '{url}' was not opened]"
        result = channel_webbrowser.web_open(url)
        log_event(sess, "tool", verb="web_open", target=url, summary=result[:120])
        return result
    if name == "web_read":
        if not approve_web_read(sess):
            return "[web_read denied by user: page was not read]"
        result = channel_webbrowser.web_read()
        log_event(sess, "tool", verb="web_read", target="browser", summary=result[:120])
        return result
    if name == "web_screenshot":
        if not approve_web_screenshot(sess):
            return ("[web_screenshot denied by user: screenshot was not taken]", [])
        text, media = channel_webbrowser.web_screenshot()
        log_event(sess, "tool", verb="web_screenshot", target="browser",
                  summary=(f"image  {len(media[0]['data_b64'])} b64 chars" if media else "failed"))
        return text, media
    if name == "web_act":
        selector = args.get("selector", "")
        action_arg = args.get("action", "")
        text_arg = args.get("text", "")
        if not approve_web_act(sess, selector, action_arg, text_arg):
            return f"[web_act denied by user: '{action_arg}' on '{selector}' was not performed]"
        result = channel_webbrowser.web_act(selector, action_arg, text_arg)
        log_event(sess, "tool", verb="web_act", target=selector, summary=result[:120])
        return result
    if name == "web_eval":
        js = args.get("js", "")
        if not approve_web_eval(sess, js):
            return "[web_eval denied by user: expression was not evaluated]"
        result = channel_webbrowser.web_eval(js)
        log_event(sess, "tool", verb="web_eval", target=js[:80], summary=result[:120])
        return result
    if name == "initiate":
        caller = getattr(sess, "region", None)
        result = rt.initiate(caller) if caller else "[initiate: nothing to start]"
        log_event(sess, "tool", verb="initiate", target=caller or "-",
                  summary=result)
        return result
    if name == "reset_self":
        caller = getattr(sess, "region", None)
        if not caller:
            return "[reset: nothing to reset]"
        if not sess.settings.get("allow_agent_reset"):
            log_event(sess, "tool", verb="reset_self", target=caller,
                      summary="refused: track does not allow agent reset")
            return ("[reset refused: this track does not allow an agent to reset "
                    "it. A human turns that on in the track menu.]")
        region_name = getattr(sess, "region_name", None) or caller
        if not approve_reset_self(sess, region_name):
            return "[reset_self denied by user: the region was not reset]"
        result = rt.reset_self(caller)
        log_event(sess, "tool", verb="reset_self", target=caller,
                  summary=result[:120])
        return result
    if name == "reset_region":
        target = (args.get("region") or "").strip()
        if not target:
            return "[reset: no region named]"
        caller = getattr(sess, "region", None)
        if not approve_reset_region(sess, target):
            return f"[reset_region denied by user: '{target}' was not reset]"
        result = rt.reset_region(caller, target)
        log_event(sess, "tool", verb="reset_region", target=target,
                  summary=result[:120])
        return result
    return f"[unknown tool: {name}]"


def _load_index():
    try:
        with open(SESSIONS_INDEX_PATH) as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except Exception:
        return []

def _save_index(entries):
    try:
        with open(SESSIONS_INDEX_PATH, "w") as fh:
            json.dump(entries, fh)
    except Exception:
        pass

def index_upsert(entry):
    entries = [e for e in _load_index() if e.get("file") != entry["file"]]
    entries.append(entry)
    _save_index(entries)

def index_remove(file_path):
    _save_index([e for e in _load_index() if e.get("file") != file_path])

def load_index_healed():
    entries = _load_index()
    kept = [e for e in entries if e.get("file") and os.path.isfile(e["file"])]
    if len(kept) != len(entries):
        _save_index(kept)
    return kept

def persist_session(sess, name):
    d = sessions_dir()
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{name}.json")
    meta = _project_meta()
    with open(path, "w") as fh:
        json.dump({"id": name, "created": sess.created, **meta,
                   "messages": sess.messages, "activity": sess.activity}, fh)
    first_user = next((m["content"] for m in sess.messages if m["role"] == "user"), "")
    index_upsert({"id": name, **meta, "created": sess.created, "file": path,
                  "preview": (first_user[:80].replace("\n", " ")
                              if isinstance(first_user, str) else "")})
    return path


def _save_transcript(sess):
    if not sess.autosave or not sess.save_name:
        return
    persist_session(sess, sess.save_name)


def agent_respond(sess, client):
    used = 0
    sess.io.status("waiting")
    sess.turn_active = True
    try:
        _agent_loop_body(sess, client, used)
    finally:
        sess.turn_active = False
        sess.io.status("idle")
        log_event(sess, "alert", trigger="done")
        _save_transcript(sess)
        dq.notify("turn_end", state={"turn_idle": lambda: True})


def _agent_loop_body(sess, client, used):
    s = sess.settings
    effective_mode = "text" if (_is_claude(s["model"]) or _is_litert(s["model"])
                                or _is_llamacpp(s["model"])) else s["mode"]
    malformed_retries = 0
    for _ in range(SAFETY_TURNS):
        payload = build_payload(sess.messages)
        payload.append({"role": "system",
                        "content": f"[current workspace root: {rt.WORKSPACE_ROOT}]\n"
                                   "Relative paths resolve here NOW. Do not reuse a path "
                                   "from an earlier turn unless it starts at this root."})
        content, thinking, tool_calls, aborted = run_turn(sess, client, payload)
        sess.messages.append({
            "role": "assistant", "content": _strip_self_handover(content),
            "thinking": thinking, "tool_calls": tool_calls,
            "_author": _current_author(sess),
        })
        if aborted:
            return

        call = rt.detect_native(tool_calls) if effective_mode == "native" else rt.detect_text(content)
        if call is None:
            keyword = (rt.detect_malformed(content)
                       if effective_mode != "native" else None)
            if keyword and malformed_retries < MALFORMED_RETRIES:
                malformed_retries += 1
                hint = rt.malformed_hint(keyword)
                sess.io.out(f"[{keyword} block malformed — nothing ran, "
                            f"asking again ({malformed_retries}/{MALFORMED_RETRIES})]",
                            dim=True)
                rt.result_text(sess.messages, keyword, hint)
                continue
            if s.get("speak") and content.strip():
                sess.io.speak(content, engine=s["tts_engine"], voice=s["tts_voice"])
            return

        name, args = call
        limit = s["max_tools"]
        if limit is not None and used >= limit:
            result = f"[refused: tool budget of {limit} used. Answer now.]"
        else:
            per_tool = (name in ("read_file", "view_image") and s["gate_read"]) or \
                       (name == "list_files" and s["gate_list"])
            gated = name not in ("write_file", "run_command") and (s["step"] or per_tool)
            reason = "step mode" if s["step"] else f"gate:{name}"
            if gated and not approve_step(sess, name, args, reason):
                result = f"[{name} skipped by user]"
            else:
                sess.io.status("working")
                result = execute_tool(sess, name, args)
            used += 1
            _text = result[0] if isinstance(result, tuple) else result
            budget_disp = limit if limit is not None else "∞"
            sess.io.out(f"[{name} → {len(_text)} chars  ({used}/{budget_disp})]", dim=True)

        text_result, media_result = result if isinstance(result, tuple) else (result, None)
        if effective_mode == "native":
            rt.result_native(sess.messages, name, text_result, media=media_result)
        else:
            rt.result_text(sess.messages, name, text_result, media=media_result)

    sess.io.out(f"[safety cap hit after {SAFETY_TURNS} turns — stopping]", dim=True)


GATE_EDGES = (
    ("check_read", "inside"),
    ("fetch_url", "any"),
    ("screen_capture", "any"),
    ("write_file", "any"),
    ("run_command", "any"),
    ("remember", "any"),
    ("recall", "any"),
    ("send_message", "any"),
    ("request_messages", "any"),
    ("reset_self", "any"),
    ("reset_region", "any"),
    ("logic_status", "any"),
    ("logic_open", "any"),
    ("logic_transport", "any"),
    ("logic_command", "any"),
    ("web_open", "any"),
    ("web_read", "any"),
    ("web_screenshot", "any"),
    ("web_act", "any"),
    ("web_eval", "any"),
)


def show_status(sess):
    s = sess.settings
    sess.io.out(f"  mode       : {s['mode']}")
    sess.io.out(f"  model      : {s['model'] or '(client default)'}")
    sess.io.out(f"  num_ctx    : {s['num_ctx']}")
    sess.io.out(f"  timeout    : {s['request_timeout']}s  (silence allowed before/between chunks)")
    sess.io.out(f"  keep_alive : {s['keep_alive']}m  (-1 = keep loaded forever)")
    sess.io.out(f"  root       : {rt.WORKSPACE_ROOT}  (outside = gated)")
    sess.io.out(f"  max_tools  : {s['max_tools']}")
    sess.io.out(f"  sampling   : temp={s['temperature']}  top_k={s['top_k']}  top_p={s['top_p']}  min_p={s['min_p']}")
    sess.io.out(f"  repetition : penalty={s['repeat_penalty'
    ]}  last_n={s['repeat_last_n']}")
    sess.io.out(f"  generation : seed={s['seed']}  num_predict={s['num_predict']}")
    sess.io.out(f"  mirostat   : {s['mirostat']}  tau={s['mirostat_tau']}  eta={s['mirostat_eta']}")
    sess.io.out(f"  hardware   : num_gpu={s['num_gpu']}  num_thread={s['num_thread']}")
    sess.io.out(f"  list       : recursive={s['list_recursive']} "
                f"size={s['list_size']} hidden={s['list_hidden']}")
    sess.io.out(f"  step       : read={s['gate_read']} list={s['gate_list']}  (observability pause, not policy — /step read|list)")
    sess.io.out( "  gates      : (all default ask — /gate lists every edge, /gate <edge> on|off toggles)")
    for edge, scope in GATE_EDGES:
        row = policy.get_row(edge, "model", scope)
        hook = row["hook"] if row else "ask"
        state = "on (gated)" if hook == "ask" else hook
        sess.io.out(f"    {edge:<18} {state}")
    if _is_claude(s["model"]):
        sess.io.out(f"  claude     : mode={s['claude_mode']}  gated={s['claude_gated']}  effort={s['claude_effort']}  partial={s['claude_partial']}  cache_ttl={s['claude_cache_ttl']}  keep_warm={s['claude_keep_warm']}  exclude_dynamic={s['claude_exclude_dynamic']}  protocol=text (forced)")
    if _is_litert(s["model"]):
        sess.io.out(f"  litert     : mode={s['litert_mode']}  backend=GPU(Metal)  protocol=text (forced)")
    if _is_llamacpp(s["model"]):
        sess.io.out(f"  llamacpp   : base_url={router.llamacpp.base_url if router else '?'}  protocol=text (forced)")
    sess.io.out(f"  worker     : transport={s['worker_transport']}  (spawned-agent subprocess mode)")
    sess.io.out(f"  step       : {s['step']}  (gates everything)")
    sess.io.out(f"  run_stream : {s['run_stream']}  (live trickle vs one block to terminal pane)")
    sess.io.out(f"  modal      : {modal_mode()}  (gate presentation — global.json; /modal fullscreen|window|off)")
    sess.io.out(f"  gate keys  : {'on' if load_global().get('gate_keyboard', True) else 'off (mouse-only)'}  (keyboard gate answers — global.json / control center)")
    sess.io.out(f"  approve    : {'hold-to-fire' if load_global().get('approve_hold', False) else 'click'}  (Ledger/queue approve — global.json / control center)")
    _ks = load_global()["killswitch"]
    sess.io.out(f"  killswitch : scope={_ks['scope']}  "
                f"hold-to-fire={'on' if _ks['hold_to_fire'] else 'off'}  (global.json; /killswitch scope|browser)")
    sess.io.out(f"  think      : {s['think']}  (off → no chain-of-thought emitted)")
    sess.io.out(f"  speak      : {s['speak']}  engine={s['tts_engine']} voice={s['tts_voice'] or '(default)'}")
    sess.io.out(f"  listen     : {s['listen']}  mode={s['listen_mode']}  stt={s['stt_engine']}")
    sess.io.out(f"  stop key   : {sess.stop_label} (during streaming)")


def handle_command(sess, cmd):
    handled = _handle_command_impl(sess, cmd)
    if handled:
        dq.notify("settings_change")
    return handled


def _handle_command_impl(sess, cmd):
    s = sess.settings
    parts = cmd.split()
    name = parts[0]
    if name in ("/quit", "/exit"):
        raise SystemExit
    if name == "/status":
        show_status(sess)
        return True
    if name == "/help":
        sess.io.out("  /mode text|native   /model NAME   /ctx N   /tools N   /root PATH")
        sess.io.out("  /list recursive|size|hidden on|off   /step read|list on|off")
        sess.io.out("  /gate (list edges)   /gate <edge> on|off   /step on|off   /step read|list on|off   /run stream on|off   /think on|off   /killswitch (panic — fires per global.json scope)   /killswitch scope models|hosts|suite   /status   /history   /quit")
        sess.io.out("  /modal fullscreen|window|off   (global gate presentation — off parks every ask to the queue)")
        sess.io.out("  /speak on|off   /listen on|off|ptt|continuous   /tts engine|voice   /stt engine   /voice clone|list")
        sess.io.out("  /trim N   /new   /save NAME   /saves   /load NAME    transcript tools")
        sess.io.out("  /unload [model]   /litert mode oneshot|persistent   /litert reset")
        sess.io.out("  /param <name> <value>  — tune sampling/generation params:")
        sess.io.out("    temperature  top_k  top_p  min_p  repeat_penalty  repeat_last_n")
        sess.io.out("    seed  num_predict  keep_alive  mirostat  mirostat_tau  mirostat_eta")
        sess.io.out("    num_gpu (None=-1)  num_thread (None=0)")
        return True
    if name == "/root":
        if len(parts) >= 2:
            result = set_and_persist_root(" ".join(parts[1:]))
            sess.io.out(f"  {result}")
            reseat(sess)
        else:
            sess.io.out(f"  workspace root: {rt.WORKSPACE_ROOT}")
            sess.io.out("  usage: /root <path>   (outside the root is gated, not refused)")
        return True
    if name == "/modal":
        if len(parts) == 2 and parts[1] in ("fullscreen", "window", "off"):
            save_global_key("modal_mode", parts[1])
            sess.io.out(f"  modal presentation → {parts[1]}  (global.json — applies to every shell)")
        else:
            sess.io.out(f"  modal presentation: {modal_mode()}  (global.json — every shell)")
            sess.io.out("  usage: /modal fullscreen|window|off   "
                        "(off degrades every ask to the queue)")
        return True
    if name == "/mode":
        if len(parts) == 2 and parts[1] in ("text", "native"):
            s["mode"] = parts[1]
            reseat(sess)
            sess.io.out(f"  mode → {s['mode']}")
        else:
            sess.io.out("  usage: /mode text|native")
        return True
    if name == "/model":
        if len(parts) == 2:
            old = s["model"]
            s["model"] = parts[1]
            sess.io.out(f"  model → {s['model']} (applies next turn)")
            if router is not None:
                if _is_llamacpp(s["model"]):
                    router.llamacpp.ensure_serving(s["model"], sess.io)
                elif _is_llamacpp(old):
                    router.llamacpp.stop(sess.io)
                if old != s["model"] and not _is_llamacpp(old):
                    if _is_claude(old) and s["claude_keep_warm"]:
                        sess.io.out(f"  [claude] keep_warm on — leaving '{old}' session warm", dim=True)
                    else:
                        sess.io.out("  " + router.unload(old, track_id=sess.sid), dim=True)
        else:
            sess.io.out("  usage: /model <name>")
        return True
    if name == "/ctx":
        if len(parts) == 2 and parts[1].isdigit():
            s["num_ctx"] = int(parts[1])
            sess.io.out(f"  num_ctx → {s['num_ctx']} (applies next turn)")
        else:
            sess.io.out("  usage: /ctx N   (context window in tokens)")
        return True
    if name == "/timeout":
        if len(parts) == 2 and parts[1].isdigit():
            s["request_timeout"] = int(parts[1])
            sess.io.out(f"  request_timeout → {s['request_timeout']}s (applies next turn)")
        else:
            sess.io.out("  usage: /timeout N   (seconds of silence allowed before/between chunks)")
        return True
    if name == "/think":
        if len(parts) == 2 and parts[1] in ("on", "off"):
            s["think"] = (parts[1] == "on")
            sess.io.out(f"  think → {parts[1]}  (off suppresses model thinking/CoT)")
        else:
            sess.io.out("  usage: /think on|off   (off = no chain-of-thought, faster replies)")
        return True
    if name == "/tools":
        if len(parts) == 2 and parts[1].isdigit():
            s["max_tools"] = int(parts[1])
            sess.io.out(f"  max_tools → {s['max_tools']}")
        else:
            sess.io.out("  usage: /tools N")
        return True
    if name == "/list":
        knobs = {"recursive": "list_recursive", "size": "list_size", "hidden": "list_hidden"}
        if len(parts) == 3 and parts[1] in knobs and parts[2] in ("on", "off"):
            s[knobs[parts[1]]] = (parts[2] == "on")
            sess.io.out(f"  list {parts[1]} → {parts[2]}")
        else:
            sess.io.out("  usage: /list recursive|size|hidden on|off")
        return True
    if name == "/gate":
        edge_scopes = dict(GATE_EDGES)
        if len(parts) == 1:
            sess.io.out("  gates (default ask — /gate <edge> on|off to toggle):")
            for edge, scope in GATE_EDGES:
                row = policy.get_row(edge, "model", scope)
                hook = row["hook"] if row else "ask"
                state = "on (gated)" if hook == "ask" else hook
                sess.io.out(f"    {edge:<18} {state}")
        elif len(parts) == 3 and parts[1] in edge_scopes and parts[2] in ("on", "off"):
            edge, scope = parts[1], edge_scopes[parts[1]]
            new_hook = "ask" if parts[2] == "on" else "open"
            policy.set_row(edge, "model", scope, new_hook)
            state = "on (gated)" if new_hook == "ask" else "off (ungated)"
            sess.io.out(f"  {edge} gate → {state}")
        else:
            sess.io.out("  usage: /gate                 list every edge + state\n"
                        "         /gate <edge> on|off   toggle one edge\n"
                        f"         edges: {', '.join(e for e, _ in GATE_EDGES)}")
        return True
    if name == "/step":
        step_knobs = {"read": "gate_read", "list": "gate_list"}
        if len(parts) == 2 and parts[1] in ("on", "off"):
            s["step"] = (parts[1] == "on")
            sess.io.out(f"  step → {parts[1]}")
        elif len(parts) == 3 and parts[1] in step_knobs and parts[2] in ("on", "off"):
            s[step_knobs[parts[1]]] = (parts[2] == "on")
            sess.io.out(f"  step {parts[1]} → {parts[2]}")
        else:
            sess.io.out("  usage: /step on|off   or   /step read|list on|off")
        return True
    if name == "/killswitch":
        if len(parts) == 3 and parts[1] == "scope" and parts[2] in ("models", "hosts", "suite"):
            save_global_key("killswitch.scope", parts[2])
            sess.io.out(f"  killswitch scope → {parts[2]}  (global.json — applies to every shell)")
            return True
        if len(parts) >= 2 and parts[1] == "browser":
            sess.io.out("  [retired 2026-08-21: /killswitch browser — the killswitch "
                        "no longer touches the browser at all]")
            return True
        if len(parts) >= 2 and parts[1] == "server":
            sess.io.out("  [retired 2026-07-13: /killswitch server — use /killswitch scope models|hosts|suite]")
            return True

        ks = load_global()["killswitch"]
        scope = ks.get("scope", "models")
        label = {"models": "MODELS", "hosts": "MODELS + HOSTS",
                 "suite": "MODELS + HOSTS + THE SUITE ITSELF"}.get(scope, scope)
        sess.io.out(f"  killswitch: {label}...")
        results = []
        try:
            r = subprocess.run(["pkill", "-f", "ollama runner"],
                               capture_output=True, text=True)
            results.append(f"model: {'killed' if r.returncode == 0 else 'none loaded'}")
        except Exception as e:
            results.append(f"model: ERROR {e}")
        try:
            if router is not None:
                was_serving = router.llamacpp._serving
                router.llamacpp.stop()
                results.append(f"llamacpp: {'killed ' + was_serving if was_serving else 'none loaded'}")
            else:
                results.append("llamacpp: router not initialized")
        except Exception as e:
            results.append(f"llamacpp: ERROR {e}")
        if scope in ("hosts", "suite"):
            try:
                r1 = subprocess.run(["pkill", "-f", "ollama serve"],
                                    capture_output=True, text=True)
                r2 = subprocess.run(["pkill", "-x", "ollama"],
                                    capture_output=True, text=True)
                hit = (r1.returncode == 0 or r2.returncode == 0)
                results.append(f"server: {'killed' if hit else 'not running'}")
            except Exception as e:
                results.append(f"server: ERROR {e}")
        else:
            results.append("server: left up")
        summary = "[killswitch: " + " · ".join(results) + "]"
        sess.io.out(f"  {summary}")
        log_event(sess, "tool", verb="killswitch",
                  target=scope,
                  summary=summary[:200])
        if scope == "suite":
            sess.io.out("  [suite: going dark]")
            time.sleep(0.3)
            os._exit(0)
        return True
    if name == "/speak":
        if len(parts) == 2 and parts[1] in ("on", "off"):
            s["speak"] = (parts[1] == "on"); sess.io.out(f"  speak → {parts[1]}")
        else: sess.io.out("  usage: /speak on|off")
        return True
    if name == "/listen":
        if len(parts) == 2 and parts[1] in ("on", "off"):
            s["listen"] = (parts[1] == "on"); sess.io.out(f"  listen → {parts[1]}")
        elif len(parts) == 2 and parts[1] in ("ptt", "continuous"):
            s["listen_mode"] = parts[1]; sess.io.out(f"  listen_mode → {parts[1]}")
        else: sess.io.out("  usage: /listen on|off   |   /listen ptt|continuous")
        return True
    if name == "/tts":
        import speech as _sp
        if len(parts) == 3 and parts[1] == "engine":
            s["tts_engine"] = parts[2]; sess.io.out(f"  tts_engine → {parts[2]}")
        elif len(parts) >= 2 and parts[1] == "voice":
            s["tts_voice"] = " ".join(parts[2:])
            sess.io.out(f"  tts_voice → {s['tts_voice'] or '(default)'}")
        else:
            caps = _sp.capabilities()["tts"]
            sess.io.out("  usage: /tts engine NAME  |  /tts voice NAME")
            sess.io.out("  engines: " + "  ".join(f"{k}{'' if v else '(missing)'}" for k,v in caps.items()))
        return True
    if name == "/stt":
        import speech as _sp
        if len(parts) == 3 and parts[1] == "engine":
            s["stt_engine"] = parts[2]; sess.io.out(f"  stt_engine → {parts[2]}")
        else:
            caps = _sp.capabilities()["stt"]
            sess.io.out("  usage: /stt engine NAME")
            sess.io.out("  engines: " + "  ".join(f"{k}{'' if v else '(missing)'}" for k,v in caps.items()))
        return True
    if name == "/voice":
        import speech as _sp
        if len(parts) >= 2 and parts[1] == "list":
            caps = _sp.capabilities()
            sess.io.out("  cloned voices: " + (", ".join(_sp.list_voices()) or "(none)"))
            sess.io.out("  clone engines: " + "  ".join(f"{k}{'' if v else '(missing)'}" for k,v in caps["clone"].items()))
        elif len(parts) >= 3 and parts[1] == "clone":
            name_v = parts[2]
            last_audio = None
            for msg_m in reversed(sess.messages):
                for it in (msg_m.get("media") or []):
                    if it.get("kind") == "audio": last_audio = it; break
                if last_audio: break
            if not last_audio:
                sess.io.out("  [/voice clone: attach an audio clip first, then run this]")
            else:
                import base64 as _b64
                from engine.providers import normalize_audio
                raw = normalize_audio(_b64.b64decode(last_audio["data_b64"]), last_audio.get("mime"))
                eng = "xtts" if _sp.capabilities()["clone"]["xtts"] else "f5"
                sess.io.out("  " + _sp.register_voice(name_v, raw, engine=eng))
                sess.io.out(f"  → select it with: /tts voice {name_v}  and  /tts engine {eng}")
        else:
            sess.io.out("  usage: /voice clone NAME   |   /voice list")
        return True
    if name == "/run":
        if len(parts) == 3 and parts[1] == "stream" and parts[2] in ("on", "off"):
            s["run_stream"] = (parts[2] == "on")
            sess.io.out(f"  run_stream → {parts[2]}")
        else:
            sess.io.out("  usage: /run stream on|off")
        return True
    if name == "/param":
        _PARAM_TYPES = {
            "temperature": float, "top_k": int, "top_p": float, "min_p": float,
            "repeat_penalty": float, "repeat_last_n": int,
            "seed": int, "num_predict": int, "keep_alive": int,
            "mirostat": int, "mirostat_tau": float, "mirostat_eta": float,
            "num_gpu": int, "num_thread": int,
        }
        if len(parts) == 3 and parts[1] in _PARAM_TYPES:
            key = parts[1]
            try:
                val = _PARAM_TYPES[key](float(parts[2]))
                if key == "num_gpu" and val < 0:
                    s[key] = None
                    sess.io.out(f"  num_gpu → auto (Ollama decides)")
                elif key == "num_thread" and val <= 0:
                    s[key] = None
                    sess.io.out(f"  num_thread → auto (Ollama decides)")
                else:
                    s[key] = val
                    sess.io.out(f"  {key} → {s[key]} (applies next turn)")
            except ValueError:
                sess.io.out(f"  invalid value for {key}: expected {_PARAM_TYPES[key].__name__}")
        else:
            sess.io.out(f"  usage: /param <name> <value>   /help for param names")
        return True
    if name == "/claude":
        _EFFORT_VALUES = ("low", "medium", "high", "xhigh", "max")
        if len(parts) >= 3 and parts[1] == "mode" and parts[2] in ("oneshot", "persistent"):
            s["claude_mode"] = parts[2]
            sess.io.out(f"  claude_mode → {parts[2]} (applies next turn)")
        elif len(parts) >= 3 and parts[1] == "effort":
            if parts[2] in _EFFORT_VALUES:
                s["claude_effort"] = parts[2]
                sess.io.out(f"  claude_effort → {parts[2]} (applies next turn)")
            else:
                sess.io.out(f"  invalid effort: expected one of {', '.join(_EFFORT_VALUES)}")
        elif len(parts) >= 3 and parts[1] == "partial" and parts[2] in ("on", "off"):
            s["claude_partial"] = (parts[2] == "on")
            sess.io.out(f"  claude_partial → {s['claude_partial']} (applies next turn)")
        elif len(parts) >= 3 and parts[1] == "cache":
            if parts[2] in ("5m", "1h"):
                s["claude_cache_ttl"] = parts[2]
                sess.io.out(f"  claude_cache_ttl → {parts[2]} (applies next turn)")
            else:
                sess.io.out(f"  invalid cache ttl: expected 5m or 1h")
        elif len(parts) >= 3 and parts[1] == "keep_warm" and parts[2] in ("on", "off"):
            s["claude_keep_warm"] = (parts[2] == "on")
            sess.io.out(f"  claude_keep_warm → {s['claude_keep_warm']} (applies next switch)")
        elif len(parts) >= 3 and parts[1] == "exclude_dynamic" and parts[2] in ("on", "off"):
            s["claude_exclude_dynamic"] = (parts[2] == "on")
            sess.io.out(f"  claude_exclude_dynamic → {s['claude_exclude_dynamic']} (applies next turn — a warm persistent session respawns to pick it up)")
        elif len(parts) >= 2 and parts[1] == "reset":
            sweep_all = len(parts) >= 3 and parts[2] == "all"
            if router and hasattr(router, "claude_p"):
                if sweep_all:
                    for p in router.claude_p.values():
                        p.shutdown()
                    router.claude_p.clear()
                else:
                    router.claude_close_track(sess.sid)
            if sweep_all:
                sess.io.out("  every claude persistent session reset — each respawns on its next turn")
            else:
                sess.io.out("  claude persistent session reset (this track only) — respawns on next turn")
        else:
            sess.io.out("  usage: /claude mode oneshot|persistent")
            sess.io.out(f"         /claude effort {'|'.join(_EFFORT_VALUES)}")
            sess.io.out("         /claude partial on|off")
            sess.io.out("         /claude cache 5m|1h")
            sess.io.out("         /claude keep_warm on|off")
            sess.io.out("         /claude exclude_dynamic on|off   (default off — trims date/cwd/git from sys prompt for a stabler cache)")
            sess.io.out("         /claude reset       (kill THIS track's persistent session)")
            sess.io.out("         /claude reset all   (kill every track's)")
        return True
    if name == "/unload":
        target = parts[1] if len(parts) >= 2 else None
        sess.io.out("  " + router.unload(target), dim=True)
        return True
    if name == "/litert":
        if len(parts) >= 3 and parts[1] == "mode" and parts[2] in ("oneshot", "persistent"):
            s["litert_mode"] = parts[2]
            sess.io.out(f"  litert_mode → {parts[2]} (applies next turn)")
        elif len(parts) >= 2 and parts[1] == "reset":
            if router and hasattr(router, "litert_p"):
                router.litert_p.reset()
            sess.io.out("  litert persistent session reset — reprimes next turn")
        else:
            sess.io.out("  usage: /litert mode oneshot|persistent")
            sess.io.out("         /litert reset   (drop persistent conv, reprime next turn)")
        return True
    if name == "/worker":
        if len(parts) == 3 and parts[1] == "transport" and parts[2] in ("pipe", "http"):
            s["worker_transport"] = parts[2]
            sess.io.out(f"  worker_transport → {parts[2]}")
            if parts[2] == "http":
                sess.io.out(f"  (coordinator URL: {WORKER_COORDINATOR_URL} — web front-end only)")
        else:
            sess.io.out(f"  worker_transport: {s['worker_transport']}")
            sess.io.out("  usage: /worker transport pipe|http")
            sess.io.out("    pipe  — subprocess stdin/stdout (terminal + web)")
            sess.io.out("    http  — HTTP long-poll (web only; needs server running)")
        return True
    if name == "/history":
        for i, m in enumerate(sess.messages):
            sess.io.out(f"\n  [{i}] {m['role'].upper()}")
            if m.get("thinking"):
                sess.io.out(f"  [thinking] {m['thinking']}", dim=True)
            sess.io.out(f"  {m['content']}")
        sess.io.out()
        return True
    if name == "/trim":
        if len(parts) == 2 and parts[1].isdigit():
            n = int(parts[1])
            total = len(sess.messages)
            if total > n + 1:
                sess.messages = sess.messages[:1] + sess.messages[-n:]
                sess.io.out(f"  trimmed {total - len(sess.messages)} messages → {len(sess.messages)} remain")
            else:
                sess.io.out(f"  already at or under {n} messages ({total} total)")
        else:
            sess.io.out("  usage: /trim N   (keep system + last N messages)")
        return True
    if name == "/new":
        sess.messages = [{"role": "system", "content": ""}]
        reseat(sess)
        sess.autosave = False
        sess.save_name = None
        sess.activity = []
        sess.io.out("  transcript cleared  (autosave off)")
        return True
    if name == "/save":
        import re as _re
        if len(parts) < 2:
            sess.io.out("  usage: /save NAME")
            return True
        raw = " ".join(parts[1:])
        clean = _re.sub(r'[^\w\-]', '-', raw)[:80].strip('-')
        if not clean:
            sess.io.out("  invalid name (use letters, digits, hyphens)")
            return True
        sess.save_name = clean
        sess.autosave = True
        _save_transcript(sess)
        sess.io.out(f"  saved → sessions/{clean}.json  (autosave on)")
        return True
    if name == "/saves":
        d = sessions_dir()
        if not os.path.isdir(d):
            sess.io.out("  (no saves yet)")
        else:
            files = sorted(f for f in os.listdir(d) if f.endswith(".json"))
            if not files:
                sess.io.out("  (no saves yet)")
            for fname in files:
                with open(os.path.join(d, fname)) as fh:
                    data = json.load(fh)
                first_user = next((m["content"] for m in data["messages"] if m["role"] == "user"), "(empty)")
                label = first_user[:60].replace("\n", " ")
                stem = os.path.splitext(fname)[0]
                sess.io.out(f"  {stem}  {data.get('created', '')}  {label}")
        return True
    if name == "/load":
        import re as _re
        if len(parts) < 2:
            sess.io.out("  usage: /load <name>")
            return True
        save_name = parts[1]
        if not _re.fullmatch(r'[\w\-]+', save_name):
            sess.io.out(f"  [invalid name: {save_name}]")
            return True
        save_path = os.path.join(sessions_dir(), f"{save_name}.json")
        if not os.path.isfile(save_path):
            sess.io.out(f"  [not found: {save_name}]")
            return True
        with open(save_path) as fh:
            data = json.load(fh)
        sess.messages = [{"role": "system", "content": ""}] + data["messages"][1:]
        reseat(sess)
        sess.activity = data.get("activity", [])
        sess.autosave = False
        sess.save_name = None
        sess.io.out(f"  loaded {save_name} ({len(sess.messages)} messages)  (autosave off — /save NAME to bind)")
        for i, m in enumerate(sess.messages):
            sess.io.out(f"\n  [{i}] {m['role'].upper()}")
            if m.get("thinking"):
                sess.io.out(f"  [thinking] {m['thinking']}", dim=True)
            sess.io.out(f"  {m['content']}")
        sess.io.out()
        return True
    return False
