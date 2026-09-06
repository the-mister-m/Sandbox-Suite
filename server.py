
import atexit
import contextlib
import json
import os
import re
import signal
import subprocess
import threading
import time
import uuid

from flask import Flask, jsonify, request
from flask_sock import Sock

from engine import SUITE_ROOT
from engine import agent_loop
from engine import compiler
from engine import policy
from engine import daemon_queue as dq
from engine import ledger
from engine import read_tool as rt
from engine import settings as engine_settings
from engine import waypoint
from engine.providers import Router
from engine.web_io import WebIO
from ade import frames as ade_frames
from ade import rails as ade_rails
from ade import tracks as ade_tracks
from ade.web_io import AdeSenders

app = Flask(__name__)
sock = Sock(app)

app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

@app.after_request
def _no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, max-age=0"
    return resp

client = Router()
agent_loop.router = client

_registry      = {}
_registry_lock = threading.Lock()


def _execute_queue_entry(entry):
    action_type = entry.get("action_type")
    payload = entry.get("payload") or {}
    _root_token = rt._track_root.set(payload["root"]) if payload.get("root") else None
    started = int(time.time() * 1000)
    result = None
    prior = {}
    exec_exc = None

    def _append_minimal_marker(reason, failed=True):
        try:
            target = (payload.get("path") or payload.get("command")
                      or payload.get("url") or payload.get("target"))
            gs = (entry.get("conditions") or {}).get("gate_satisfied") or {}
            rec = ledger.action_record(
                custody={k: entry.get(k) for k in
                         ("machine", "session", "shell", "root",
                          "driver", "seat", "vessel", "source",
                          "track", "turn")},
                action_type=action_type,
                edge=entry.get("edge") or action_type,
                payload={"target": target},
                hook=entry.get("hook"),
                answer=True,
                answered_by="human" if gs.get("answer") is not None else None,
                prompt=entry.get("prompt"),
                parked=entry.get("parked"),
                resolved=int(time.time() * 1000),
                outcome="fired",
                duration_ms=int(time.time() * 1000) - started,
                summary=reason)
            if failed:
                rec["failed"] = True
            ledger.append(rec)
        except Exception:
            pass

    try:
        if action_type == "write":
            try:
                prior = ledger.prior_state(payload.get("path", ""))
            except Exception:
                prior = {}
            result = rt.write_file(payload.get("path", ""), payload.get("content") or "")
        elif action_type == "run":
            result = rt.run_command(payload.get("command", ""))
        elif action_type == "fetch":
            result = rt.fetch_url(payload.get("url", ""))
        elif action_type == "send":
            _recv = list(payload.get("receivers", []))
            _line, _undelivered = waypoint.append_message(
                payload.get("sender"), _recv, payload.get("body", ""))
            if not _undelivered:
                result = f"[sent to {', '.join(_recv)}]"
            else:
                _dead = {u["to"] for u in _undelivered}
                _landed = [r for r in _recv if r not in _dead]
                _out = ([f"[sent to {', '.join(_landed)}]"] if _landed else [])
                for u in _undelivered:
                    _out.append(f"[NOT DELIVERED to {u['to']}: "
                                + ("no live track goes by that name"
                                   if u["why"] == "unknown" else "that region was closed; its cache is gone")
                                + "]")
                result = "\n".join(_out)
        elif action_type == "reset":
            result = _ade_resetter(payload.get("region"), payload.get("requester"))
    except Exception as e:
        exec_exc = e
    finally:
        if _root_token is not None:
            rt._track_root.reset(_root_token)
    if result is None:
        if action_type in ("write", "run", "fetch", "send", "reset"):
            reason = (f"[fire raised before completion: {type(exec_exc).__name__}]"
                       if exec_exc is not None else "[fire produced no result]")
            _append_minimal_marker(reason)
        return
    try:
        content = payload.get("content") or ""
        wrote = result.startswith("[WRITE ok:") if action_type == "write" else True
        target = (payload.get("path") or payload.get("command")
                  or payload.get("url") or payload.get("target"))
        if action_type == "send" and not target:
            target = ", ".join(payload.get("receivers", []))
        if action_type == "reset" and not target:
            target = payload.get("region") or payload.get("requester")
        if action_type == "write":
            summary = (f"{len(content)} chars, {len(content.splitlines())} lines"
                       if wrote else result)
            res_field = content if wrote else None
        elif action_type == "run":
            summary = next((l for l in result.splitlines() if l.strip()), "")[:120]
            res_field = result
        elif action_type == "send":
            summary = (f"{len(payload.get('body', ''))} chars to "
                       f"{len(payload.get('receivers', []))} receiver(s)")
            res_field = result
        else:
            summary = f"{len(result)} chars"
            res_field = result
        gs = (entry.get("conditions") or {}).get("gate_satisfied") or {}
        rec = ledger.action_record(
            custody={k: entry.get(k) for k in
                     ("machine", "session", "shell", "root",
                      "driver", "seat", "vessel", "source",
                      "track", "turn")},
            action_type=action_type,
            edge=entry.get("edge") or action_type,
            payload={"target": target,
                     **(prior if (action_type == "write" and wrote) else {})},
            hook=entry.get("hook"),
            answer=True,
            answered_by="human" if gs.get("answer") is not None else None,
            prompt=entry.get("prompt"),
            parked=entry.get("parked"),
            resolved=int(time.time() * 1000),
            outcome="fired",
            duration_ms=int(time.time() * 1000) - started,
            summary=summary,
            result=res_field)
        if action_type == "write" and not wrote:
            rec["failed"] = True
        ledger.append(rec)
    except Exception as e:
        _append_minimal_marker(f"[fire executed but record build raised: {type(e).__name__}]",
                               failed=False)


dq.set_resolver(_execute_queue_entry)


def _gate_notifier(kind, entry, prompt=None):
    target_sid = entry.get("session")
    if not target_sid:
        return
    with _registry_lock:
        webios = list({id(d["webio"]): d["webio"] for d in _registry.values()
                       if getattr(d["sess"], "sid", None) == target_sid}.values())
    for w in webios:
        try:
            if kind == "ask":
                w.post_gate(entry["id"], prompt or entry.get("prompt") or "")
            elif kind == "resolved":
                w.gate_resolved(entry["id"])
        except Exception:
            pass

    track = ade_tracks.get_region(target_sid)
    if track is not None:
        ade_frames.broadcast_gate(kind, entry["id"], prompt or entry.get("prompt") or "",
                                   track.id, track.name)


dq.set_notifier(_gate_notifier)

dq.set_endpoint_prober(lambda model: client.ollama.available())


def _waypoint_nudger(track_ident):
    if track_ident == ade_tracks.HUMAN_SENDER:
        ade_frames.broadcast_human_mail()
        return
    track = ade_tracks.get_region(track_ident)
    if track is None or track.muted:
        return
    if track.nudge():
        threading.Thread(target=track.run_pump, args=(_ade_live_runner,),
                         daemon=True).start()


def _ade_mute_prober(region_id):
    region = ade_tracks.get_region(region_id)
    return region is not None and region.muted


def _waypoint_track_prober(track_ident):
    if track_ident == ade_tracks.HUMAN_SENDER:
        return "live"
    region = ade_tracks.get_region(track_ident)
    if region is not None:
        return "muted" if region.muted else "live"
    for row in ade_tracks.closed_rows():
        if row.get("id") == track_ident:
            return "closed"
    return "unknown"


def _waypoint_track_resolver(receiver):
    tracks = [t for t in ade_tracks.list_regions() if not t.muted]
    for t in tracks:
        if t.id == receiver:
            return t.id
    key = (receiver or "").strip().lower()
    if not key:
        return None
    if key in ("captain", "brandon", "the human"):
        return ade_tracks.HUMAN_SENDER
    named = [t for t in tracks if (t.name or "").strip().lower() == key]
    if len(named) == 1:
        return named[0].id
    if len(named) > 1:
        return None
    seated = [t for t in tracks if t.seat and t.seat.strip().lower() == key]
    if len(seated) == 1:
        return seated[0].id
    return None


def _ade_initiator(region_ident):
    for target, content in ade_tracks.initiate_deliveries(region_ident):
        waypoint.append_message(region_ident, [target.id], content, wake=False)
    started = []
    for target in ade_tracks.initiate_targets(region_ident):
        if target.nudge():
            threading.Thread(target=target.run_pump, args=(_ade_live_runner,),
                             daemon=True).start()
        started.append(target.name or target.id)
    return started


def _ade_room_reporter(sender, receivers):
    rows = ade_tracks._live_peers()
    if not rows:
        return ""
    reached = [ade_tracks.display_name(r) for r in receivers]
    room = []
    for r in rows:
        name = r.get("name") or "(unnamed)"
        seat = r.get("seat")
        if r.get("id") == sender:
            room.append(f"{name} (you)")
        elif r.get("id") == ade_tracks.HUMAN_SENDER:
            room.append(f"{name} (the human)")
        elif seat:
            room.append(f"{name} · {seat}")
        else:
            room.append(name)
    out = "\n  → "
    if reached:
        out += ", ".join(reached) + ". "
    out += "The room right now: " + ", ".join(room) + "."
    missed = [r for r in rows
              if r.get("id") not in receivers
              and r.get("id") != sender
              and r.get("id") != ade_tracks.HUMAN_SENDER]
    if missed:
        out += ("\n    Not on this message: "
                + ", ".join((m.get("name") or "(unnamed)") + f" (id: {m.get('id')})"
                            for m in missed)
                + " — include those ids to reach the whole room.")
    return out


def _ade_reset_starter(region):
    if region.nudge():
        threading.Thread(target=region.run_pump, args=(_ade_live_runner,),
                         daemon=True).start()


def _ade_resetter(target_ident, requester_ident):
    if target_ident is None:
        region_id = requester_ident
        if not region_id:
            return "[reset: nothing to reset]"
    else:
        region_id = _waypoint_track_resolver(target_ident)
        if region_id is None:
            return (f"[reset: no live region goes by '{target_ident}' — use the "
                    f"EXACT id from YOUR PEERS]")
    region = ade_tracks.get_region(region_id)
    if region is None:
        return "[reset: no such region]"
    if not region.sess.settings.get("allow_agent_reset"):
        who = region.name or region_id
        if target_ident is None:
            return ("[reset refused: this track does not allow an agent to reset "
                    "it. A human turns that on in the track menu.]")
        return (f"[reset refused: {who} does not allow an agent to reset it. "
                f"A human turns that on in that track's menu.]")
    return ade_tracks.reset_region(region_id)


waypoint.set_nudger(_waypoint_nudger)
rt.set_initiator(_ade_initiator)
rt.set_resetter(_ade_resetter)
rt.set_room_reporter(_ade_room_reporter)
rt.set_mute_prober(_ade_mute_prober)
ade_tracks.set_starter(_ade_reset_starter)
ade_tracks.set_roster_listener(ade_frames.broadcast_roster)
ade_tracks.set_replaced_listener(ade_frames.broadcast_region_replaced)
waypoint.set_track_prober(_waypoint_track_prober)
waypoint.set_track_resolver(_waypoint_track_resolver)
compiler.set_peers_provider(ade_tracks._live_peers)

ledger.set_append_listener(lambda rec: ade_frames.mark_dirty("record")
                           if (rec or {}).get("shell") == "ade" else None)
dq.set_change_listener(lambda: ade_frames.mark_dirty("record"))
waypoint.set_append_listener(lambda: ade_frames.mark_dirty("waypoint"))

ade_tracks.set_status_listener(ade_frames.broadcast_track_status)


MAX_MEDIA_ITEMS       = 16
MAX_MEDIA_ITEM_BYTES  = {"image": 10 * 1024 * 1024, "audio": 50 * 1024 * 1024}


def _sanitize_media(media):
    if not isinstance(media, list):
        return []
    out = []
    for item in media[:MAX_MEDIA_ITEMS]:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if kind not in MAX_MEDIA_ITEM_BYTES:
            continue
        mime = item.get("mime")
        data = item.get("data_b64")
        if not isinstance(mime, str) or not isinstance(data, str) or not data:
            continue
        if (len(data) * 3) // 4 > MAX_MEDIA_ITEM_BYTES[kind]:
            continue
        out.append({"kind": kind, "mime": mime, "data_b64": data})
    return out


def _sessions_snapshot():
    with _registry_lock:
        return [{"id": sid, "model": d["sess"].settings["model"],
                 "status": d["webio"].current_status}
                for sid, d in _registry.items()]


class MonitoredWebIO(WebIO):

    def __init__(self, ws):
        super().__init__(ws)
        self.current_status = "idle"

    def status(self, phase):
        super().status(phase)
        self.current_status = phase or "idle"


class AdeMemberWebIO(AdeSenders, MonitoredWebIO):
    pass




from engine.settings import (CONFIRM_KEYS, CONFIRM_STATES, MODAL_MODES,
                             ADE_MODAL_MODES, GLOBAL_DEFAULTS, KILL_ROW_KEYS,
                             KILLSWITCH_SCOPES, GlobalError)

_SKIN_LINK_RE = re.compile(r'href="/static/css/skins/[\w-]+\.css"')


def _serve_skinned(path):
    with open(path, encoding="utf-8") as fh:
        html = fh.read()
    skin = engine_settings.load_global().get("skin", "og")
    html = _SKIN_LINK_RE.sub(f'href="/static/css/skins/{skin}.css"', html, count=1)
    return app.response_class(html, mimetype="text/html")


@app.route("/")
def index():
    if request.args.get("room") is not None:
        return _serve_skinned("static/index.html")
    return _serve_skinned("static/control.html")


@app.route("/ade")
def ade_page():
    return _serve_skinned("static/ade.html")


@app.route("/ade/ledger")
def ade_ledger_window():
    return _serve_skinned("static/ade-ledger.html")


@app.route("/ade/retired")
def ade_retired_window():
    return _serve_skinned("static/ade-retired.html")


@app.route("/ade/arrange")
def ade_arrange_window():
    return _serve_skinned("static/ade-arrange.html")




def _pkill(pattern, exact=False):
    try:
        r = subprocess.run(["pkill", "-x" if exact else "-f", pattern],
                           capture_output=True, text=True)
        return "killed" if r.returncode == 0 else "not running"
    except Exception as e:
        return f"ERROR {e}"


@app.route("/api/end-all-turns", methods=["POST"])
def api_end_all_turns():
    try:
        return jsonify({"turns_ended": ade_tracks.stop_all_regions()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/unload-weights", methods=["POST"])
def api_unload_weights():
    out = {}
    try:
        out["unloaded"] = client.unload(None) or "nothing loaded"
    except Exception as e:
        out["unloaded"] = f"ERROR {e}"
    out["model"] = _pkill("ollama runner")
    return jsonify(out)


@app.route("/api/kill-hosts", methods=["POST"])
def api_kill_hosts():
    return jsonify({"server": _pkill("ollama serve"),
                    "ollama": _pkill("ollama", exact=True)})


@app.route("/api/shutdown-suite", methods=["POST"])
def api_shutdown_suite():
    results = _end_all_sessions()
    try:
        ade_frames.broadcast_reload("suite shutting down")
    except Exception:
        pass
    threading.Timer(0.5, lambda: os._exit(0)).start()
    results["suite"] = "going dark"
    return jsonify(results)


def _end_all_sessions():
    results = {}
    killed = 0
    for rid in [r.id for r in ade_tracks.list_regions()]:
        try:
            if ade_tracks.close_region(rid) is not None:
                killed += 1
        except Exception as e:
            results.setdefault("region_errors", []).append(f"{rid}: {e}")
    results["regions_closed"] = killed
    try:
        results["unloaded"] = client.unload(None) or "nothing loaded"
    except Exception as e:
        results["unloaded"] = f"ERROR {e}"
    results["model"] = _pkill("ollama runner")
    return results


@app.route("/api/end-all", methods=["POST"])
def api_end_all():
    results = _end_all_sessions()
    try:
        ade_frames.broadcast_reload("all sessions ended")
        results["tabs"] = "reload sent"
    except Exception as e:
        results["tabs"] = f"ERROR {e}"
    return jsonify(results)


@app.route("/api/global")
def api_global_get():
    return jsonify(engine_settings.load_global())


@app.route("/api/global", methods=["POST"])
def api_global_post():
    body = request.get_json(silent=True)
    try:
        return jsonify(engine_settings.save_global(body))
    except GlobalError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/policy")
def api_policy_get():
    return jsonify({"rows": policy.all_rows(), "hooks": list(policy.HOOKS)})


@app.route("/api/policy", methods=["POST"])
def api_policy_post():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "expected a JSON object"}), 400
    edge   = body.get("edge")
    level  = body.get("level")
    driver = body.get("driver", "model")
    scope  = body.get("scope", "any")
    if not isinstance(edge, str) or not edge:
        return jsonify({"error": "missing edge"}), 400
    if level not in policy.HOOKS:
        return jsonify({"error": f"level must be one of {policy.HOOKS}"}), 400
    if not any(r["edge"] == edge and r["driver"] == driver and r["scope"] == scope
               for r in policy.all_rows()):
        return jsonify({"error": f"unknown row: {edge}/{driver}/{scope}"}), 400
    row = policy.set_row(edge, driver, scope, level)
    return jsonify({"ok": True, "row": row})


def _open_rail_c_tool_record(meta, action_type, edge, tool_input, tool_use_id, hook, prompt):
    if not meta or not tool_use_id:
        return
    try:
        rec = ledger.action_record(
            custody=meta,
            action_type=action_type,
            edge=edge,
            payload={"tool_input": tool_input, "tool_use_id": tool_use_id},
            hook=hook,
            resolved=None,
            outcome=None,
            summary=prompt)
        ledger.append(rec)
    except Exception:
        pass


@app.route("/api/policy/resolve-hook", methods=["POST"])
def api_policy_resolve_hook():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"decision": "locked", "error": "expected a JSON object"}), 400
    region_id   = body.get("region_id")
    tool_name   = body.get("tool_name", "")
    tool_input  = body.get("tool_input") or {}
    tool_use_id = body.get("tool_use_id", "")

    region = ade_tracks.get_region(region_id) if region_id else None
    if region is None:
        return jsonify({"decision": "locked", "error": "region not found"}), 404

    edge_override = body.get("edge")
    edge   = edge_override if edge_override == "check_read" else policy.edge_for(tool_name)
    target = policy.target_of(tool_input)
    _root_token = rt._track_root.set(region.sess.root)
    try:
        scope = policy.scope_of(tool_name, tool_input)
    finally:
        rt._track_root.reset(_root_token)

    human_attached = (agent_loop.modal_mode() != "off")
    ctx = {"scope": scope, "overlay": region.sess.policy_overlay,
           "human_attached": human_attached}
    hook = policy.resolve(edge, "model", ctx)

    meta = None
    try:
        meta = ledger.custody(region.sess, driver="model")
    except Exception:
        pass
    payload = {"tool_name": tool_name, "tool_input": tool_input, "region": region_id}
    prompt = f"{tool_name} → {target}" if target else tool_name
    action_type = f"claude_hook:{tool_name}"

    if hook == "open":
        dq.record_resolved(action_type, payload, "model", hook="open", outcome="fired", meta=meta)
        agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                             answer=True, hook="open")
        _open_rail_c_tool_record(meta, action_type, edge, tool_input, tool_use_id,
                                 "open", prompt)
        return jsonify({"decision": "open"})

    if hook == "locked":
        dq.record_resolved(action_type, payload, "model", hook="locked", outcome="locked", meta=meta)
        agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                             answer=False, hook="locked")
        return jsonify({"decision": "locked"})

    if hook == "queue":
        dq.park(action_type, payload, "model", hook="queue", meta=meta,
                prompt=prompt, ensure_gate=True)
        agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                             answer=None, hook="queue")
        return jsonify({"decision": "queue"})

    if not region.sess.settings.get("claude_hook_ask_blocking", True):
        dq.park(action_type, payload, "model", hook="queue", meta=meta,
                prompt=prompt, ensure_gate=True)
        agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                             answer=None, hook="queue")
        return jsonify({"decision": "queue"})

    entry = dq.park(action_type, payload, "model", hook="ask", meta=meta,
                    prompt=prompt, register_waiter=True)
    agent_loop.log_event(region.sess, "alert", trigger="gate")
    gate_wait_s = region.sess.settings.get("gate_wait_s")
    ans = dq.await_answer(entry["id"], timeout=gate_wait_s)
    if ans is None:
        dq.downgrade(entry["id"], reason="timeout")
        agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                             answer=None, hook="ask", answered_by="timeout",
                             queue_id=entry["id"])
        return jsonify({"decision": "queue"})
    if ans in ("parked", "deferred"):
        agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                             answer=None, hook="ask", answered_by="disconnect",
                             queue_id=entry["id"])
        return jsonify({"decision": "queue"})
    agent_loop.log_event(region.sess, "gate", action=tool_name, target=target,
                         answer=bool(ans), hook="ask", queue_id=entry["id"])
    if ans:
        _open_rail_c_tool_record(meta, action_type, edge, tool_input, tool_use_id,
                                 "ask", prompt)
    return jsonify({"decision": "open" if ans else "locked"})


@app.route("/api/policy/record-tool-outcome", methods=["POST"])
def api_policy_record_tool_outcome():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"ok": False}), 200
    region_id   = body.get("region_id")
    tool_name   = body.get("tool_name", "")
    tool_use_id = body.get("tool_use_id", "")
    if not (region_id and tool_use_id):
        return jsonify({"ok": False}), 200

    region = ade_tracks.get_region(region_id)
    if region is None:
        return jsonify({"ok": False}), 200

    try:
        meta = ledger.custody(region.sess, driver="model")
        rec = ledger.action_record(
            custody=meta,
            action_type=f"claude_hook_result:{tool_name}",
            edge=policy.edge_for(tool_name),
            payload={"tool_use_id": tool_use_id,
                     "tool_response": body.get("tool_response"),
                     "duration_ms": body.get("duration_ms")},
            resolved=int(time.time() * 1000),
            outcome="fired",
            summary=f"{tool_name} outcome")
        ledger.append(rec)
    except Exception:
        pass
    return jsonify({"ok": True})


@app.route("/api/sessions")
def api_sessions():
    return jsonify({"list": _sessions_snapshot()})


@app.route("/api/voices")
def api_voices():
    import speech
    return jsonify({"voices": speech.list_voices(), "caps": speech.capabilities()})


@app.route("/api/voices", methods=["POST"])
def api_voices_add():
    import re, base64, speech
    from engine.providers import normalize_audio
    data = request.get_json(silent=True) or {}
    name = re.sub(r'[^\w\-]', '-', data.get("name", ""))[:60].strip('-')
    b64  = data.get("audio_b64", "")
    if not name or not b64:
        return jsonify({"error": "need name + audio"}), 400
    try:
        raw = normalize_audio(base64.b64decode(b64), data.get("mime"))
    except Exception as e:
        return jsonify({"error": f"audio decode failed: {e}"}), 400
    caps = speech.capabilities()["clone"]
    engine = "xtts" if caps.get("xtts") else ("f5" if caps.get("f5") else "xtts")
    speech.register_voice(name, raw, engine=engine)
    return jsonify({"ok": True, "name": name, "engine": engine, "clone_ready": bool(caps.get("xtts") or caps.get("f5"))})


@app.route("/api/voices/<name>", methods=["DELETE"])
def api_voices_del(name):
    import re, speech
    if not re.fullmatch(r'[\w\-]+', name):
        return jsonify({"error": "invalid name"}), 400
    return jsonify({"result": speech.delete_voice(name)})


@app.route("/api/fs/browse")
def api_fs_browse():
    path = os.path.abspath(request.args.get("path") or "/")
    if not os.path.isdir(path):
        return jsonify({"error": f"not a directory: {path}"}), 400
    try:
        names = os.listdir(path)
    except OSError as e:
        return jsonify({"error": str(e)}), 400
    dirs = sorted(n for n in names if os.path.isdir(os.path.join(path, n)))
    files = sorted(n for n in names if os.path.isfile(os.path.join(path, n)))
    return jsonify({"path": path, "dirs": dirs, "files": files})


_FS_READ_CAP = 256 * 1024


@app.route("/api/fs/read")
def api_fs_read():
    path = os.path.abspath(request.args.get("path") or "")
    if not os.path.isfile(path):
        return jsonify({"error": f"not a file: {path}"}), 400
    try:
        if os.path.getsize(path) > _FS_READ_CAP:
            return jsonify({"error": "file too large to load into a prompt field"}), 400
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except (OSError, UnicodeDecodeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"path": path, "text": text})



def _output_style_name(path):
    try:
        with open(path, encoding="utf-8") as fh:
            first = fh.readline()
            if first.strip() == "---":
                for line in fh:
                    if line.strip() == "---":
                        break
                    m = re.match(r"\s*name\s*:\s*(.+?)\s*$", line)
                    if m:
                        return m.group(1).strip().strip("'\"")
    except OSError:
        pass
    return os.path.splitext(os.path.basename(path))[0]


@app.route("/api/claude/output-styles")
def api_claude_output_styles():
    d = os.path.join(os.path.expanduser("~"), ".claude", "output-styles")
    out = []
    if os.path.isdir(d):
        try:
            for fname in sorted(os.listdir(d)):
                if not fname.endswith(".md"):
                    continue
                full = os.path.join(d, fname)
                if os.path.isfile(full):
                    out.append({"name": _output_style_name(full), "file": full})
        except OSError as e:
            return jsonify({"dir": d, "styles": [], "error": str(e)})
    return jsonify({"dir": d, "styles": out})


_MD_SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "__pycache__",
                 "dist", "build", ".next", "site-packages"}
_MD_CAP = 300


@app.route("/api/claude/md-files")
def api_claude_md_files():
    root = os.path.abspath(request.args.get("root") or rt.WORKSPACE_ROOT)
    found, seen = [], set()

    def add(path, where):
        full = os.path.abspath(path)
        if full in seen or not os.path.isfile(full):
            return
        seen.add(full)
        found.append({"path": full, "where": where})

    add(os.path.join(os.path.expanduser("~"), ".claude", "CLAUDE.md"), "global")

    cur = root
    while True:
        add(os.path.join(cur, "CLAUDE.md"), "up")
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent

    truncated = False
    if os.path.isdir(root):
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames
                           if d not in _MD_SKIP_DIRS and not d.startswith(".")]
            if "CLAUDE.md" in filenames:
                add(os.path.join(dirpath, "CLAUDE.md"), "below")
            if len(found) >= _MD_CAP:
                truncated = True
                break

    return jsonify({"root": root, "files": found, "truncated": truncated})



_SETTINGS_CARRY_KEYS = ("outputStyle", "autoMemoryEnabled", "claudeMdExcludes")


@app.route("/api/settings/browse")
def api_settings_browse():
    presets = request.args.get("presets")
    if presets:
        return jsonify({"kind": presets, "names": engine_settings.list_presets()})
    root = os.path.abspath(rt.WORKSPACE_ROOT)
    path = os.path.abspath(request.args.get("path") or root)
    if os.path.commonpath([path, root]) != root:
        return jsonify({"error": "path outside configured root"}), 400
    if not os.path.isdir(path):
        return jsonify({"error": f"not a directory: {path}"}), 400
    try:
        names = os.listdir(path)
    except OSError as e:
        return jsonify({"error": str(e)}), 400
    dirs = sorted(n for n in names if os.path.isdir(os.path.join(path, n)))
    files = sorted(n for n in names
                   if n.endswith(".json") and os.path.isfile(os.path.join(path, n)))
    return jsonify({"path": path, "dirs": dirs, "files": files})


@app.route("/api/settings/read")
def api_settings_read():
    preset_name = request.args.get("preset_name")
    if preset_name:
        fields, warnings = engine_settings.read_preset(preset_name)
        return jsonify({"fields": fields, "carried": list(fields.keys()),
                        "dropped": [], "warnings": warnings})
    path = os.path.abspath(request.args.get("path") or "")
    if not os.path.isfile(path):
        return jsonify({"error": f"not a file: {path}"}), 400
    try:
        with open(path) as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        return jsonify({"error": str(e)}), 400
    if not isinstance(data, dict):
        return jsonify({"error": "expected a JSON object at top level"}), 400

    fields, carried, dropped, warnings = {}, [], [], []
    for key, value in data.items():
        if key in _SETTINGS_CARRY_KEYS:
            fields[key] = value
            carried.append(key)
        elif key == "hooks":
            dropped.append(key)
            warnings.append(f"{key}: dropped — not preset-settable")
        else:
            dropped.append(key)
            warnings.append(f"{key}: not carried")
    return jsonify({"fields": fields, "carried": carried, "dropped": dropped,
                    "warnings": warnings})


@app.route("/api/settings/resolved")
def api_settings_resolved():
    track_id = request.args.get("track")
    region = ade_tracks.get_region(track_id) if track_id else None
    if region is None:
        return jsonify({"error": "region not found"}), 404
    bag = region.sess.settings
    overlay, warnings = client.claude._overlay(bag)
    # provenance: which layer set each key — file, preset, track, else global
    bag_key_of = {
        "outputStyle": "claude_output_style",
        "autoMemoryEnabled": "claude_memory_enabled",
        "claudeMdExcludes": "claude_md_excludes",
        "setting_sources": "claude_setting_sources",
        "config_dir": "claude_config_dir",
        "system_prompt": "claude_system_prompt",
        "bare": "claude_bare",
    }
    from engine.providers import _NORMALIZERS
    preset_name = (bag.get("preset_name") or "").strip()
    preset_fields = {}
    if preset_name and preset_name in engine_settings.list_presets():
        preset_fields, _ = engine_settings.read_preset(preset_name)
    provenance = {}
    for key, bag_key in bag_key_of.items():
        value = bag.get(bag_key)
        row = engine_settings.BY_KEY[bag_key]
        norm = _NORMALIZERS.get(key)
        if norm and norm(value) is None and overlay and overlay.get(key) is not None:
            provenance[key] = "file"
        elif preset_name and bag_key in preset_fields and preset_fields[bag_key] == value:
            provenance[key] = "preset"
        elif value != row.default:
            provenance[key] = "track"
        else:
            provenance[key] = "global"
    return jsonify({
        "overlay": overlay,
        "setting_sources": bag.get("claude_setting_sources") or None,
        "config_dir": bag.get("claude_config_dir") or None,
        "system_prompt": bag.get("claude_system_prompt") or None,
        "bare": bool(bag.get("claude_bare")),
        "preset_name": bag.get("preset_name") or "",
        "provenance": provenance,
        "warnings": warnings,
    })


@app.route("/api/ade-sessions")
def api_ade_sessions():
    import glob as _glob
    d = ade_tracks.archives_dir()
    if not os.path.isdir(d):
        return jsonify({"list": []})
    out = []
    for mpath in _glob.glob(os.path.join(d, "*", "master.json")):
        try:
            with open(mpath) as fh:
                master = json.load(fh)
            if master.get("kind") == ade_tracks.TEMPLATE_KIND:
                continue
            rows = master.get("regions", master.get("tracks", []))
            live_count = sum(
                1 for r in rows
                if not ade_tracks._is_closed(r)
            )
            out.append({
                "id":      master.get("id", ""),
                "name":    master.get("name", ""),
                "created": master.get("created", ""),
                "saved":   master.get("saved_ts", 0),
                "tracks":  live_count,
            })
        except Exception:
            pass
    out.sort(key=lambda x: x["saved"], reverse=True)
    return jsonify({"list": out})



_HEXNAME = set("0123456789abcdef")


def _archive_id_ok(s):
    return bool(s) and len(s) <= 64 and all(c in _HEXNAME for c in s)


def _retired_caches(sdir, rid):
    out = []
    cur = os.path.join(sdir, f"{rid}.jsonl")
    if os.path.isfile(cur):
        out.append({"cache": None, "bytes": os.path.getsize(cur)})
    for fn in os.listdir(sdir):
        if not (fn.startswith(f"{rid}.reset-") and fn.endswith(".jsonl")):
            continue
        try:
            n = int(fn[len(rid) + 7:-6])
        except ValueError:
            continue
        out.append({"cache": n, "bytes": os.path.getsize(os.path.join(sdir, fn))})
    out.sort(key=lambda c: (1, -c["cache"]) if c["cache"] is not None else (0, 0))
    return out


@app.route("/api/retired-chats")
def api_retired_chats():
    import glob as _glob
    d = ade_tracks.archives_dir()
    if not os.path.isdir(d):
        return jsonify({"list": []})
    out = []
    for mpath in _glob.glob(os.path.join(d, "*", "master.json")):
        sdir = os.path.dirname(mpath)
        try:
            with open(mpath) as fh:
                master = json.load(fh)
            if master.get("kind") == ade_tracks.TEMPLATE_KIND:
                continue
            agents = []
            for r in master.get("regions", master.get("tracks", [])):
                rid = r.get("id") or ""
                if not _archive_id_ok(rid):
                    continue
                agents.append({
                    "id":      rid,
                    "name":    r.get("name") or rid,
                    "seat":    r.get("seat") or "",
                    "vessel":  r.get("vessel") or "",
                    "retired": ade_tracks._is_closed(r),
                    "created": r.get("created") or "",
                    "caches":  _retired_caches(sdir, rid),
                })
            if not agents:
                continue
            out.append({
                "id":      os.path.basename(sdir),
                "name":    master.get("name") or "(unnamed)",
                "saved":   master.get("saved_ts", 0),
                "agents":  agents,
            })
        except Exception:
            pass
    out.sort(key=lambda s: s["saved"], reverse=True)
    return jsonify({"list": out})


@app.route("/api/retired-chats/<sid>/<rid>")
def api_retired_chat(sid, rid):
    if not (_archive_id_ok(sid) and _archive_id_ok(rid)):
        return jsonify({"error": "bad id"}), 400
    sdir = ade_tracks.session_dir(sid)
    which = (request.args.get("cache") or "").strip()
    if which:
        if not which.isdigit():
            return jsonify({"error": "bad cache"}), 400
        path = os.path.join(sdir, f"{rid}.reset-{int(which)}.jsonl")
    else:
        path = os.path.join(sdir, f"{rid}.jsonl")
    if not os.path.isfile(path):
        return jsonify({"messages": [], "missing": True})
    msgs = []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                msgs.append(json.loads(line))
            except ValueError:
                pass
    return jsonify({"messages": msgs, "missing": False})


@app.route("/api/ade-sessions/<sid>", methods=["DELETE"])
def api_delete_ade_session(sid):
    import re, shutil
    if not re.fullmatch(r'[\w\-]+', sid):
        return jsonify({"error": "invalid id"}), 400
    if sid == ade_tracks.session_meta()["id"]:
        return jsonify({"error": "cannot delete the live session"}), 400
    sdir = ade_tracks.session_dir(sid)
    if not os.path.isdir(sdir):
        return jsonify({"error": "not found"}), 404
    shutil.rmtree(sdir)
    return jsonify({"ok": True})


@app.route("/api/ade-templates")
def api_ade_templates():
    import glob as _glob
    d = ade_tracks.archives_dir()
    if not os.path.isdir(d):
        return jsonify({"list": []})
    out = []
    for mpath in _glob.glob(os.path.join(d, "*", "master.json")):
        try:
            with open(mpath) as fh:
                master = json.load(fh)
            if master.get("kind") != ade_tracks.TEMPLATE_KIND:
                continue
            rows = master.get("regions", master.get("tracks", []))
            out.append({
                "id":      master.get("id", ""),
                "name":    master.get("name", ""),
                "created": master.get("created", ""),
                "saved":   master.get("saved_ts", 0),
                "tracks":  sum(
                    1 for r in rows
                    if not ade_tracks._is_closed(r)
                ),
            })
        except Exception:
            pass
    out.sort(key=lambda x: x["saved"], reverse=True)
    return jsonify({"list": out})


@app.route("/api/ade-templates/<tid>", methods=["DELETE"])
def api_delete_ade_template(tid):
    import re, shutil
    if not re.fullmatch(r'[\w\-]+', tid):
        return jsonify({"error": "invalid id"}), 400
    tdir = ade_tracks.session_dir(tid)
    mpath = os.path.join(tdir, "master.json")
    if not os.path.isfile(mpath):
        return jsonify({"error": "not found"}), 404
    try:
        with open(mpath) as fh:
            kind = (json.load(fh) or {}).get("kind")
    except Exception:
        return jsonify({"error": "unreadable"}), 400
    if kind != ade_tracks.TEMPLATE_KIND:
        return jsonify({"error": "not a template"}), 400
    shutil.rmtree(tdir)
    return jsonify({"ok": True})


@app.route("/api/ade-sessions/save", methods=["POST"])
def api_save_ade_session():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    if ade_tracks.session_meta()["id"] is None:
        return jsonify({"error": "no live ADE session to save"}), 400
    ade_tracks.save_session(name)
    ade_frames._broadcast("send_ade_init", ade_tracks.session_meta(),
                          ade_tracks.list_regions(), ade_tracks.list_tracks())
    return jsonify({"ok": True, "session": ade_tracks.session_meta()})


def agent_respond_safe(sess):
    try:
        agent_loop.agent_respond(sess, client)
    except Exception as e:
        sess.io.out(f"[server error: {e}]", dim=True)
        dq.notify("endpoint_change")


def _ade_live_runner(sess):
    sess._turn_usage = {"out_tokens": 0, "in_tokens": 0, "cache_read": 0,
                        "cache_creation": 0, "duration_ns": 0, "cost_usd": 0.0,
                        "calls": []}
    agent_respond_safe(sess)
    usage = dict(sess._turn_usage, calls=list(sess._turn_usage["calls"]))
    return {"usage": usage, "cost_usd": usage["cost_usd"], "stop_reason": "stop"}


@sock.route("/ws/ade")
def ws_ade_handler(ws):
    webio    = AdeMemberWebIO(ws)
    conn_sid = "ade-" + uuid.uuid4().hex[:8]

    with _registry_lock:
        _registry[conn_sid] = {"ws": ws, "sess": None, "webio": webio}
    ade_frames.register_conn(webio)

    def _rebind(sess):
        with _registry_lock:
            if conn_sid in _registry:
                _registry[conn_sid]["sess"] = sess

    webio.send_models(client.list_models(), client.model)
    webio.send_crew_list(compiler.roster_entries(), None)
    webio.send_gate_edges(ade_tracks.gate_edge_list())
    webio.send_rail_catalog(ade_rails.catalog())
    webio.send_ade_init(ade_tracks.session_meta(), ade_tracks.list_regions(),
                        ade_tracks.list_tracks())

    ctx = ade_frames.AdeCtx(webio, conn_sid, _ade_live_runner, _rebind,
                            _sanitize_media)

    try:
        while True:
            raw = ws.receive()
            if raw is None:
                break
            try:
                msg = json.loads(raw)
                ade_frames.handle(ctx, msg)
            except Exception as e:
                webio.out(f"[frame error — skipped: {e}]", dim=True)
    finally:
        with _registry_lock:
            _registry.pop(conn_sid, None)
        ade_frames.unregister_conn(webio)
        ade_frames.disconnect(ctx)


if __name__ == "__main__":
    agent_loop.load_persisted_root()

    _ollama_proc = None
    if not client.ollama.available():
        import shutil, time
        if shutil.which("ollama"):
            print("ollama not running — starting it...")
            _ollama_proc = subprocess.Popen(["ollama", "serve"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(10):
                time.sleep(0.5)
                if client.ollama.available():
                    print("ollama ready")
                    break

    _reaped = False
    def _shutdown_children():
        global _reaped
        if _reaped:
            return
        _reaped = True
        if _ollama_proc is not None and _ollama_proc.poll() is None:
            try:
                _ollama_proc.terminate()
            except Exception:
                pass

    atexit.register(_shutdown_children)

    def _on_sigterm(signum, frame):
        _shutdown_children()
        os._exit(0)
    signal.signal(signal.SIGTERM, _on_sigterm)

    if not client.available():
        raise SystemExit(
            "No LLM backend reachable.\n"
            "  • Ollama : install from ollama.ai, then run `ollama serve`\n"
            "  • Gemini : set GEMINI_API_KEY in your environment\n"
        )
    print(f"model : {client.model}")
    print("serving on http://localhost:5000  (Ctrl+C to stop)")
    app.run(port=5000, threaded=True)
