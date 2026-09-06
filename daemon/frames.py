
import json
import os
import threading

from engine import agent_loop
from engine import daemon_queue as dq
from engine import ledger
from shells import turn_gate

LOG_TAIL_MAX = 500


def queue_snapshot():
    out = []
    for entry in dq.pending():
        e = dict(entry)
        e["_condition_status"] = dq.condition_status(entry)
        gs = entry.get("conditions", {}).get("gate_satisfied")
        e["_awaiting_human"] = bool(gs is not None and gs.get("answer") is not True)
        out.append(e)
    return out


def read_log_tail(limit=200, kind=None):
    path = agent_loop.LOG_JSONL_PATH
    events = []
    if os.path.isfile(path):
        try:
            with open(path) as fh:
                for raw in fh:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        evt = json.loads(raw)
                    except Exception:
                        continue
                    if kind and evt.get("kind") != kind:
                        continue
                    events.append(evt)
        except Exception:
            pass
    limit = max(1, min(int(limit or 200), LOG_TAIL_MAX))
    return list(reversed(events[-limit:]))


class DaemonCtx:

    def __init__(self, webio, sess, sanitize_media, agent_respond_safe):
        self.webio               = webio
        self.sess                 = sess
        self.sanitize_media       = sanitize_media
        self.agent_respond_safe   = agent_respond_safe
        self.agent_thread         = None


def handle(ctx, msg):
    if not hasattr(ctx, "pending"):
        turn_gate.attach(ctx, _dispatch)
    if turn_gate.gate(ctx, msg):
        return
    ctx.dispatch(msg)


def _dispatch(ctx, msg):
    webio, sess = ctx.webio, ctx.sess

    if msg["type"] == "answer":
        webio.resolve_gate(msg.get("id"), msg["text"])

    elif msg["type"] == "gate_reorder":
        webio.reorder_gates(msg.get("order", []))

    elif msg["type"] == "stop":
        webio.stop_requested.set()

    elif msg["type"] == "speak_test":
        eng = msg.get("engine") or sess.settings.get("tts_engine", "browser")
        voc = msg.get("voice", sess.settings.get("tts_voice", ""))
        threading.Thread(
            target=lambda: sess.io.speak(
                "This is how the selected voice sounds.", engine=eng, voice=voc),
            daemon=True).start()

    elif msg["type"] == "setroot":
        result = agent_loop.set_and_persist_root(msg.get("path", ""))
        sess.messages[0] = agent_loop.system_message(sess)
        webio.out(result, dim=True)
        webio.send_settings(dict(sess.settings))

    elif msg["type"] == "queue_list":
        webio.send_queue_state(queue_snapshot())

    elif msg["type"] == "queue_action":
        action = msg.get("action")
        eid    = msg.get("id")
        if action == "approve":
            dq.answer_gate(eid, True)
            dq.notify("gate_answered")
        elif action == "deny":
            dq.deny(eid)
        elif action == "edit":
            dq.update_payload(eid, msg.get("payload") or {})
        elif action == "delete":
            dq.delete(eid)
        elif action == "unsupersede":
            dq.unsupersede(eid)
        webio.send_queue_state(queue_snapshot())

    elif msg["type"] == "queue_test_park":
        dq.park("write",
                {"path": msg.get("path", ""), "content": msg.get("content", "")},
                "model")
        webio.send_queue_state(queue_snapshot())

    elif msg["type"] == "log_tail":
        webio.send_log_tail(
            read_log_tail(msg.get("limit", 200), msg.get("kind") or None))

    elif msg["type"] == "ledger_list":
        webio.send_ledger_state(ledger.snapshot(), sid=getattr(sess, "sid", None))

    elif msg["type"] == "ledger_action":
        ledger.apply_action(msg.get("action"), msg.get("id"), msg.get("payload"))
        webio.send_ledger_state(ledger.snapshot(), sid=getattr(sess, "sid", None))

    elif msg["type"] == "ledger_detail":
        webio.send_ledger_detail(ledger.detail(msg.get("id", "")))

    elif msg["type"] == "user":
        text = msg["text"]

        if text.startswith("/"):
            try:
                if not agent_loop.handle_command(sess, text):
                    webio.out(f"[unknown command: {text}]", dim=True)
            except SystemExit:
                webio.out("[/quit ignored on web — just close the tab]", dim=True)
            webio.send_settings(dict(sess.settings))
            return

        webio.stop_requested.clear()
        media = ctx.sanitize_media(msg.get("media"))
        user_msg = {"role": "user", "content": text}
        if media:
            user_msg["media"] = media
        sess.messages.append(user_msg)
        turn_gate.spawn_turn(ctx, ctx.agent_respond_safe, sess)
