
import contextlib
import datetime
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid

from engine.providers import Router, CLAUDE_MODELS
from engine.settings import (region_defaults, block_keys, harness_keys,
                             modal_mode)
from engine import read_tool as rt
from engine import policy
from engine import daemon_queue as dq
from engine import compiler
from engine import tools
from engine import SUITE_ROOT


@contextlib.contextmanager
def _default_stop_key_watch():
    yield lambda: False

_DEFAULT_STOP_LABEL = "Stop"

router = None


def _is_claude(model):
    return bool(model) and model in CLAUDE_MODELS


CONTEXT_WARN_FRACTION = 0.75

SAFETY_TURNS = 20
MALFORMED_RETRIES = 2

ROOT_CONFIG_PATH = os.path.join(SUITE_ROOT,
                                ".sandbox_config.json")


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


class Session:

    def __init__(self, io_surface=None, sid=None, shell=None):
        self.io             = io_surface
        self.sid            = sid or uuid.uuid4().hex[:8]
        self.shell          = shell
        self.settings       = region_defaults("local")
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
                         "queue_id": data.get("queue_id"),
                         "command": data.get("command")},
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


def rebuild_context(sess):
    sess.messages = [m for m in sess.messages if not m.get("_seat_context")]
    system, context = compiler.build_context(
        sess,
        root=getattr(sess, "root", None) or rt.WORKSPACE_ROOT,
        region_id=getattr(sess, "region", None),
        region_name=getattr(sess, "region_name", None))
    sess.messages[0] = {"role": "system", "content": system}
    if context:
        sess.messages.insert(1, {"role": "system", "content": context,
                                 "_seat_context": True})


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


def tool_schema():
    return tools.tool_schema()


def run_turn(sess, client, payload):
    bag = sess.settings
    provider = client.provider_for(bag["model"])
    settings = {k: bag[k] for k in block_keys(provider.id) + harness_keys()
                if k in bag}
    tools = tool_schema() if provider.tool_mode == "native" else None
    content, thinking, tool_calls, aborted = [], [], None, False
    metrics = None
    seen_thinking, seen_content = False, False
    abort_metrics = {}

    root_arg, root_note = rt.usable_root(getattr(sess, "root", None))
    if root_note:
        sess.io.out(root_note, dim=True)

    sess.io.turn_start()
    with sess.stop_key_watch() as stop_pressed:
        stream = client.chat(
            payload,
            model=bag["model"] or None,
            settings=settings,
            region_id=sess.sid,
            root=root_arg,
            tools=tools,
            metrics_sink=abort_metrics,
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
            "ctx_max": 200000 if provider.id == "claude" else bag["num_ctx"],
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
                  hook="queue", queue_id=entry["id"] if entry else None,
                  command=(entry.get("payload") or {}).get("command") if entry else None)
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
                  hook="ask", answered_by="timeout", queue_id=entry["id"],
                  command=(entry.get("payload") or {}).get("command"))
        sess.gate_parked = True
        return False
    if ans == "parked":
        sess.io.out("[no human attached — parked]", dim=True)
        log_event(sess, "gate", action=action, target=target, answer=None,
                  hook="ask", answered_by="disconnect", queue_id=entry["id"],
                  command=(entry.get("payload") or {}).get("command"))
        sess.gate_parked = True
        return False
    if ans == "deferred":
        sess.io.out("[queued — approve later from the Ledger]", dim=True)
        sess.gate_parked = True
        return False
    ans = bool(ans)
    evt = log_event(sess, "gate", action=action, target=target, answer=ans,
                    hook="ask", answered_by="human", queue_id=entry["id"],
                    command=(entry.get("payload") or {}).get("command"))
    if ans:
        _stamp_gate_for_execution(sess, evt, target, "ask")
    dq.notify("gate_answered")
    return ans


_TARGET_KEYS = ("path", "command", "url", "query", "title", "region",
                "selector", "js", "receivers")


def _target(args):
    args = args if isinstance(args, dict) else {}
    for key in _TARGET_KEYS:
        if key in args:
            v = args[key]
            return ", ".join(str(x) for x in v) if isinstance(v, list) else str(v)
    return ""


def _full_text(out):
    return out[0] if isinstance(out, tuple) else out


def _with_context_warning(sess, out):
    note = getattr(sess, "_ctx_warn", None)
    if not note:
        return out
    sess._ctx_warn = None
    if isinstance(out, tuple):
        text, rest = out[0], out[1:]
        return (note + "\n\n" + str(text),) + rest
    return note + "\n\n" + str(out)


def _queue_payload(sess, tool, args):
    payload = dict(args) if isinstance(args, dict) else {}
    if tool.queue_identity:
        payload.setdefault(tool.queue_identity, getattr(sess, "region", None))
    if tool.queue_type == "reset":
        payload.setdefault("region", None)
    return payload


def _denied_or_parked(sess, tool, args):
    if not getattr(sess, "gate_parked", False):
        return tool.denied(sess, args)
    parked = (f"[{tool.name.upper()} PARKED: no human answered, so it is queued "
              f"for approval. It was NOT denied — do not retry it and do not "
              f"tell the human they refused it. It fires if and when they "
              f"approve.]")
    out = tool.denied(sess, args)
    return (parked, out[1]) if isinstance(out, tuple) else parked


def execute_tool(sess, name, args):
    tool = tools.TOOL_INDEX.get(name)
    if tool is None:
        return f"[unknown tool: {name}]"
    if tool.needs_region and not getattr(sess, "region", None):
        return f"[{name} refused: this session has no track identity]"
    sess.gate_parked = False
    sess._tool_args = args if isinstance(args, dict) else None
    sess._tool_log = None
    token = rt._track_root.set(getattr(sess, "root", None))
    try:
        ok = _resolve_gate(sess, tool.edge, "model", {"scope": tool.scope(args)},
                           tool.prompt(sess, args), action=name,
                           target=_target(args), queue_action_type=tool.queue_type,
                           queue_payload=_queue_payload(sess, tool, args))
        if not ok:
            out = _denied_or_parked(sess, tool, args)
        else:
            out = tool.run(sess, args)
            fields = {"verb": name, "target": _target(args),
                      "summary": tool.summary(args, out),
                      "_full": _full_text(out)}
            fields.update(getattr(sess, "_tool_log", None) or {})
            log_event(sess, "tool", **fields)
    finally:
        sess._tool_log = None
        rt._track_root.reset(token)
    return _with_context_warning(sess, out)


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
        dq.notify("turn_end", state={"turn_idle": lambda: True})


def _agent_loop_body(sess, client, used):
    s = sess.settings
    provider = client.provider_for(s["model"])
    effective_mode = "native" if provider.tool_mode == "native" else "text"
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

        call = (tools.detect_native(tool_calls) if effective_mode == "native"
                else tools.detect_text(content))
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
            return

        name, args = call
        limit = s["max_tools"]
        if limit is not None and used >= limit:
            result = f"[refused: tool budget of {limit} used. Answer now.]"
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
