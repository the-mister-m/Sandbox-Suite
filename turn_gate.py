
import threading

from engine import ledger


MODEL_SLASH = {"/model", "/ctx", "/think", "/mode", "/param"}

QUEUE_TYPES = {
    "user",
    "session_new", "session_load",
    "set_crew", "setroot",
    "room_add", "room_remove", "room_reorder", "room_mode", "room_config",
    "turn_pass", "turn_claim", "room_queue_dispatch",
}

LOGGED_TYPES = QUEUE_TYPES | {"save", "move", "delete", "rename", "mkdir",
                              "rmdir", "session_save",
                              "queue_action", "ledger_action",
                              "gate_reorder", "room_save", "room_load"}


def route(msg):
    t = msg.get("type")
    if t in ("stop", "answer"):
        return "IMMEDIATE"
    if t == "user":
        txt = msg.get("text", "") or ""
        if txt.startswith("/"):
            parts = txt.split()
            cmd = parts[0] if parts else txt
            return "QUEUE" if cmd in MODEL_SLASH else "RUN_NOW"
        return "QUEUE"
    if t in QUEUE_TYPES:
        return "QUEUE"
    return "RUN_NOW"


def attach(ctx, dispatch):
    ctx.pending      = []
    ctx.lock         = threading.Lock()
    ctx.turn_running = False
    ctx.turn_thread  = None
    ctx.dispatch = lambda m: _dispatch_and_log(ctx, dispatch, m)


def _dispatch_and_log(ctx, dispatch, msg):
    dispatch(ctx, msg)
    _log_user_action(getattr(ctx, "sess", None), msg)


def gate(ctx, msg, force=False):
    if not force and route(msg) != "QUEUE":
        return False
    with ctx.lock:
        if ctx.turn_running:
            ctx.pending.append(msg)
            return True
    return False


def spawn_turn(ctx, target, *args):
    def _wrap():
        try:
            target(*args)
        finally:
            _drain(ctx)
    with ctx.lock:
        ctx.turn_running = True
        th = threading.Thread(target=_wrap, daemon=True)
        ctx.turn_thread = th
    th.start()
    return th


def _drain(ctx):
    me = threading.current_thread()
    while True:
        with ctx.lock:
            th = ctx.turn_thread
            if th is not None and th is not me and th.is_alive():
                return
            if not ctx.pending:
                ctx.turn_running = False
                return
            msg = ctx.pending.pop(0)
        ctx.dispatch(msg)



def _log_user_action(sess, msg):
    if sess is None:
        return
    t = msg.get("type")
    try:
        if t == "answer":
            ans = str(msg.get("text", "")).strip().lower()
            if ans not in ("y", "yes", "n", "no"):
                return
            edge, summary = "gate_answer", f"gate {ans}"
        elif t == "user":
            txt = msg.get("text", "") or ""
            edge = "command" if txt.startswith("/") else "message"
            summary = txt[:80]
        elif t in LOGGED_TYPES:
            edge = t
            summary = (msg.get("path") or msg.get("name")
                       or msg.get("action") or msg.get("mode") or "")[:80]
        else:
            return
        payload = {"type": t}
        for k in ("id", "action", "path", "name", "mode"):
            if msg.get(k) is not None:
                payload[k] = msg[k]
        rec = ledger.action_record(
            custody=ledger.custody(sess, driver="human"),
            action_type="user_action",
            edge=edge,
            payload=payload,
            hook="open",
            outcome="fired",
            summary=summary or None,
        )
        ledger.append(rec)
    except Exception:
        pass
