
import os
import shutil
import threading
import uuid

from engine import agent_loop as al
from engine import daemon_queue as dq
from engine import ledger
from engine import read_tool as rt
from engine import settings as st
from engine.providers import ClaudeProvider
from ade import rails
from ade import tracks

# provider default model, used when insert_region gets no model of its own;
# ollama's is its __init__ default (engine/ollama_provider.py:38), claude's
# is ClaudeProvider.DEFAULT_MODEL (engine/providers.py:498)
_DEFAULT_MODEL_BY_PROVIDER = {
    "claude": ClaudeProvider.DEFAULT_MODEL,
    "ollama": "gemma4:26b-mxfp8",
}


def _human_path(environment, path):
    path = path or "."
    expanded = os.path.expanduser(path)
    if os.path.isabs(expanded):
        return os.path.abspath(expanded)
    # context files (injections/track, injections/region) live at the
    # project root, resolved the same way /api/fs/read resolves them
    if expanded == "injections" or expanded.startswith("injections/"):
        return os.path.abspath(expanded)
    return os.path.abspath(os.path.join(environment.root, expanded))


_conns_lock = threading.Lock()
# one row per open socket: the sender and the environment it is bound to
_conns = []


def _recount(environment):
    if environment is None:
        return
    environment.windows = sum(1 for c in _conns if c["environment"] is environment)


def register_conn(webio, environment):
    with _conns_lock:
        _conns.append({"webio": webio, "environment": environment})
        _recount(environment)


def unregister_conn(webio):
    with _conns_lock:
        gone = [c for c in _conns if c["webio"] is webio]
        for c in gone:
            _conns.remove(c)
        for c in gone:
            _recount(c["environment"])


def bind_conn(webio, environment):
    # moves one open socket from the environment it held to another
    with _conns_lock:
        old = None
        for c in _conns:
            if c["webio"] is webio:
                old = c["environment"]
                c["environment"] = environment
        _recount(old)
        _recount(environment)


def conn_count(environment):
    with _conns_lock:
        return sum(1 for c in _conns if c["environment"] is environment)


def close_conns(environment):
    # closes every socket bound to this environment, returns the count closed
    with _conns_lock:
        gone = [c for c in _conns if c["environment"] is environment]
        for c in gone:
            _conns.remove(c)
        _recount(environment)
    for c in gone:
        try:
            c["webio"].ws.close()
        except Exception:
            pass
    return len(gone)


def _broadcast(environment, method, *args):
    # reaches only the sockets bound to this environment
    with _conns_lock:
        conns = [c["webio"] for c in _conns if c["environment"] is environment]
    for w in conns:
        try:
            getattr(w, method)(*args)
        except Exception:
            pass


def _broadcast_all(method, *args):
    # suite-level fanout: every open socket, whatever it is bound to
    with _conns_lock:
        conns = [c["webio"] for c in _conns]
    for w in conns:
        try:
            getattr(w, method)(*args)
        except Exception:
            pass


def refuse(webio, reason):
    try:
        webio.send_session_refused(reason)
    except Exception:
        pass


def broadcast_reload(reason=""):
    _broadcast_all("send_reload", reason)


def broadcast_gate(environment, kind, gid, prompt, track_id, track_name):
    _broadcast(environment, "send_gate_broadcast", kind, gid, prompt,
               track_id, track_name)


def broadcast_track_status(track_id, phase):
    _broadcast(tracks.environment_of_region(track_id),
               "send_track_status", track_id, phase)


def broadcast_context_warn(track_id, peak, cap):
    _broadcast(tracks.environment_of_region(track_id),
               "send_context_warn", track_id, peak, cap)


def broadcast_roster(environment):
    _broadcast(environment, "send_track_list", tracks.list_regions(environment),
               tracks.list_tracks(environment))


def broadcast_region_replaced(old_id, new_id):
    _broadcast(tracks.environment_of_region(new_id),
               "send_region_replaced", old_id, new_id)


def broadcast_human_mail():
    for environment in tracks.list_environments():
        waiting = environment.waypoint.peek(tracks.HUMAN_SENDER)
        if not waiting:
            continue
        displays = []
        for line in waiting:
            sender = tracks.get_region(line.get("from"))
            displays.append(sender.name if sender is not None else line.get("from"))
        _broadcast(environment, "send_activity", {
            "kind":   "mail",
            "track":  tracks.HUMAN_SENDER,
            "count":  len(waiting),
            "from":   list(dict.fromkeys(displays)),
            "system": [d for d, l in zip(displays, waiting)
                       if l.get("from") == tracks.SYSTEM_SENDER],
            "bodies": [l.get("body", "") for l in waiting],
            "ts":     waiting[-1].get("said"),
        })


_dirty_lock  = threading.Lock()
_dirty_stores = set()
_dirty_timer  = None


def mark_dirty(store):
    global _dirty_timer
    with _dirty_lock:
        _dirty_stores.add(store)
        if _dirty_timer is None:
            t = threading.Timer(0.3, _fire_dirty)
            t.daemon = True
            _dirty_timer = t
            t.start()


def _fire_dirty():
    global _dirty_timer
    with _dirty_lock:
        stores = sorted(_dirty_stores)
        _dirty_stores.clear()
        _dirty_timer = None
    if stores:
        _broadcast_all("send_feed_dirty", stores)


class AdeCtx:

    def __init__(self, webio, conn_sid, live_runner, rebind, environment,
                 sanitize_media=None):
        self.webio       = webio
        self.conn_sid    = conn_sid
        self.live_runner = live_runner
        self.rebind      = rebind
        # the one environment this socket dispatches against for its lifetime
        self.environment = environment
        self.sanitize_media = sanitize_media
        self.anchored    = None
        # region id -> Region: every instance in this window streams its own
        self.mirrors     = {}


_DRAG_IMAGE_MIMES = {".png": "image/png", ".jpg": "image/jpeg",
                     ".jpeg": "image/jpeg", ".gif": "image/gif",
                     ".webp": "image/webp"}


def _media_from_paths(paths, webio):
    out = []
    for p in paths or []:
        if not isinstance(p, str) or not p.strip():
            continue
        mime = _DRAG_IMAGE_MIMES.get(os.path.splitext(p)[1].lower())
        if not mime:
            webio.out(f"[not an image — skipped: {os.path.basename(p)}]", dim=True)
            continue
        text, media = rt.view_image(p)
        if not media:
            webio.out(text, dim=True)
            continue
        item = dict(media[0])
        item["mime"] = mime
        out.append(item)
    return out


def _name_receiver_token(tok):
    tok = (tok or "").strip()
    if not tok:
        return tok
    t = tracks.get_region(tok)
    return t.name if t is not None else tok


def _name_receivers(r):
    if r.get("action_type") != "send":
        return r
    p = r.get("payload")
    if not isinstance(p, dict):
        return r
    np = dict(p)
    changed = False
    if isinstance(p.get("receivers"), list):
        np["receivers"] = [_name_receiver_token(x) for x in p["receivers"]]
        changed = True
    if isinstance(p.get("target"), str) and p["target"]:
        np["target"] = ", ".join(_name_receiver_token(x) for x in p["target"].split(","))
        changed = True
    return {**r, "payload": np} if changed else r


def _track_gatelog(track_id):
    w = tracks.environment_of_region(track_id)
    log_dir = w.log_dir if w is not None else None
    return [_name_receivers(r) for r in ledger.ade_snapshot(since=0, log_dir=log_dir)
            if r.get("kind") == "action" and r.get("region") == track_id]


def _join_hub(ctx, track):
    _detach(ctx)
    track.hub.add(ctx.webio, ctx.conn_sid)
    ctx.anchored = track
    ctx.rebind(track.sess)
    ctx.webio.send_track_transcript(track.id, track.sess.messages)
    ctx.webio.send_chat_history(track.id, _track_gatelog(track.id))
    for e in dq.waiting_gates(track.sess.sid):
        ctx.webio.post_gate(e["id"], e.get("prompt") or "", track.id)


def _detach(ctx):
    old = ctx.anchored
    if old is not None:
        old.hub.remove(ctx.webio)
        ctx.anchored = None
        if old.hub.empty():
            dq.abandon_session(old.sess.sid)
    ctx.rebind(None)


def _rebind_environment(ctx, environment):
    # the socket follows a load or a new session onto that environment
    if environment is None or environment is ctx.environment:
        return
    ctx.environment = environment
    bind_conn(ctx.webio, environment)


# one socket, many followed regions
def _follow(ctx, region):
    if region.id in ctx.mirrors:
        return
    view = tracks.MirrorView(ctx.webio, region.id)
    region.hub.add_mirror(view, ctx.conn_sid)
    ctx.mirrors[region.id] = region
    view.transcript(region.sess.messages)
    view.gatelog(_track_gatelog(region.id))


def _unfollow(ctx, region_id):
    region = ctx.mirrors.pop(region_id, None)
    if region is None:
        return
    # remove_mirror_for drops every view this socket holds on that region
    region.hub.remove_mirror_for(ctx.webio)


def disconnect(ctx):
    _detach(ctx)
    for region_id in list(ctx.mirrors):
        _unfollow(ctx, region_id)




def _do_create_track(msg, environment):
    name     = (msg.get("name") or "untitled").strip() or "untitled"
    settings = msg.get("settings")
    has_region = ("model" in msg or "seat" in msg or settings is not None
                  or bool(msg.get("region")))
    return tracks.create_track(
        name,
        root=msg.get("root"),
        overlay_rows=msg.get("overlay", msg.get("overlay_rows")),
        provider=msg.get("provider"), loop_class=msg.get("loop_class"),
        mechanism=msg.get("mechanism"),
        model=(msg.get("model") or "") if has_region else None,
        seat=((msg.get("seat") or "").strip() or None) if has_region else None,
        settings=settings, region=msg.get("region"), environment=environment)





CHANGE_CHOICES = ("reset_region", "rewrite_cache", "cancel")

# pending change-modal records, keyed by token
_pending_changes = {}
_pending_lock = threading.Lock()


def _park_change(region_id, action, items=None, name=None, fields=None):
    token = uuid.uuid4().hex[:12]
    with _pending_lock:
        _pending_changes[token] = {"region": region_id, "action": action,
                                   "items": items or [], "name": name,
                                   "fields": fields}
    return token


def _take_change(token):
    with _pending_lock:
        return _pending_changes.pop(token, None)


def _send_change_prompt(ctx, region_id, token, action, items):
    payload = {"type": "change_prompt", "token": token,
               "region": region_id, "action": action,
               "edits": items, "choices": list(CHANGE_CHOICES),
               "text": "How would you like to change?"}
    _broadcast(ctx.environment, "_send", payload)


def _preset_load_items(region, name):
    fields, warnings = st.read_preset(name)

    model_val = fields.get("model", region.sess.settings.get("model"))
    new_bag = st.region_defaults(tracks.kind_of(model_val))
    new_bag.update(fields)
    if "reset_on_change" not in fields:
        new_bag["reset_on_change"] = region.sess.settings.get("reset_on_change")

    items = []
    for key, value in new_bag.items():
        if key == "seat":
            items.append({"type": "seat", "value": value or ""})
        else:
            items.append({"type": "setting", "key": key, "value": value})

    if model_val and model_val != region.sess.settings.get("model"):
        prov, lclass, mech = rails.normalize(
            provider=rails.infer_provider(model_val), model=model_val)
        items.append({"type": "rail",
                      "value": {"provider": prov, "loop_class": lclass,
                                "mechanism": mech}})

    overlay = fields.get(st.OVERLAY_KEY)
    if isinstance(overlay, list):
        items.append({"type": "overlay", "value": overlay})

    items.append({"type": "setting", "key": "preset_name", "value": name})
    return items, warnings


def _do_load_preset(region, name, mode="auto"):
    items, warnings = _preset_load_items(region, name)
    if mode == "reset":
        region.apply_with_reset(items)
    elif mode == "in_place":
        region.apply_in_place(items)
    else:
        region.apply_edits(items)
    return True, warnings


def _apply_spawn_presets(region, msg, webio):
    name = (msg.get("presets") or "").strip()
    if not name or region is None:
        return
    ok, warnings = _do_load_preset(region, name)
    for w in warnings:
        webio.out(f"[preset {name!r}] {w}", dim=True)
    if not ok:
        webio.out(f"[preset {name!r}: not applied at creation]", dim=True)


def _capture_preset_fields(region, pending=None):
    bag = dict(region.sess.settings)
    bag.update(pending or {})
    return {k: bag[k] for k in st.preset_keys() if k in bag}


def _do_save_preset(region, name, pending=None):
    pending = dict(pending or {})
    pending_overlay = pending.pop("overlay", None)
    fields = _capture_preset_fields(region, pending)
    overlay = pending_overlay if isinstance(pending_overlay, list) \
        else region.overlay_rows
    if isinstance(overlay, list):
        fields[st.OVERLAY_KEY] = overlay
    if not (fields.get("model") or "").strip():
        return False, (f"nothing to save — this region has no model, and a "
                       f"preset with no model loads onto the wrong rail. "
                       f"{name!r} was left alone")
    return st.write_preset(name, fields)


def _do_insert_region(msg, environment):
    r = msg.get("region") or {}
    provider = r.get("provider") or msg.get("provider")
    model = r.get("model") or msg.get("model") or ""
    if not model:
        # no preset, no explicit model: default to the provider's own
        # default rather than "", which left the region unable to run
        model = _DEFAULT_MODEL_BY_PROVIDER.get(provider or "claude", "")
    return tracks.insert_region(
        msg.get("track", ""),
        (r.get("name") or msg.get("name") or "untitled").strip() or "untitled",
        model,
        root=r.get("wt") or r.get("root") or msg.get("root"),
        seat=(r.get("agent") or r.get("seat") or "").strip() or None,
        overlay_rows=r.get("overlay_rows"),
        settings=msg.get("settings"),
        provider=provider,
        loop_class=r.get("loop_class") or msg.get("loop_class"),
        mechanism=r.get("mechanism") or msg.get("mechanism"),
        region=r, environment=environment)


def _do_duplicate_region(region_id, environment, name=None):
    src = tracks.get_region(region_id)
    if src is None:
        return None, None
    new_name = (name or "").strip() or (src.name + " copy")
    track = tracks.create_track(
        new_name,
        root=src.root,
        overlay_rows=src.overlay_rows,
        provider=src.provider,
        loop_class=src.loop_class,
        mechanism=src.mechanism,
        environment=environment)
    reg = tracks.insert_region(
        track.id, new_name, src.model,
        root=src.root,
        seat=src.seat,
        overlay_rows=src.overlay_rows,
        settings=dict(src.sess.settings),
        provider=src.provider,
        loop_class=src.loop_class,
        mechanism=src.mechanism,
        region=dict(src.carried), environment=environment)
    return track, reg



_PLAN_NODE_FIELDS   = ("wt", "notes", "status", "stxt", "provider")
_PLAN_DETAIL_FIELDS = ("agent",)


def _plan_region(node):
    region = {"name": node.get("name") or "", "model": node.get("model") or ""}
    for k in _PLAN_NODE_FIELDS:
        region[k] = node.get(k)
    detail = node.get("detail") or {}
    for k in _PLAN_DETAIL_FIELDS:
        region[k] = detail.get(k)
    return region


def _plan_rows(plan):
    phases = [p for p in (plan.get("phases") or []) if isinstance(p, dict)]
    if not phases:
        return []
    sel = plan.get("selPhase")
    chosen = next((p for p in phases if p.get("id") == sel), phases[0])
    rows = []
    index = {}
    for node in (chosen.get("nodes") or []):
        if not isinstance(node, dict):
            continue
        if node.get("kind") in ("group", "branch", "merge"):
            continue
        own = (node.get("name").strip()
               if isinstance(node.get("name"), str) else "") or "untitled"
        raw = node.get("track")
        named = raw.strip() if isinstance(raw, str) else ""
        if not named:
            rows.append((own, [node]))
            continue
        if named in index:
            index[named].append(node)
        else:
            index[named] = [node]
            rows.append((named, index[named]))
    return rows


def _do_gate_action(action, gid, log_dir=None):
    if action == "approve":
        dq.answer_gate(gid, True)
        dq.notify("gate_answered")
    elif action == "deny":
        if dq.deny(gid) is None:
            ledger._deny_orphan(gid, log_dir=log_dir)
    elif action == "queue":
        dq.defer_gate(gid)


# a write result that did not land
_WRITE_REFUSALS = ("[WRITE refused", "[WRITE failed", "[WRITE denied", "[save denied")


def _write_refused(result):
    text = result if isinstance(result, str) else ""
    return any(text.startswith(m) for m in _WRITE_REFUSALS)


def handle(ctx, msg):
    webio = ctx.webio
    t = msg.get("type")
    # the instance that sent this frame; every reply echoes it back
    _inst = msg.get("inst") or ""

    def _roster():
        _broadcast(ctx.environment, "send_track_list",
                   tracks.list_regions(ctx.environment),
                   tracks.list_tracks(ctx.environment))

    def _init():
        _broadcast(ctx.environment, "send_ade_init",
                   tracks.session_meta(ctx.environment),
                   tracks.list_regions(ctx.environment),
                   tracks.list_tracks(ctx.environment))

    if t == "roster":
        _roster()
        return

    if t == "gate_edges":
        # same send the socket-open path uses (server.py); a devagent
        # mounted after open never saw that one-time send
        webio.send_gate_edges(tracks.gate_edge_list())
        return

    if t == "create_track":
        track = _do_create_track(msg, ctx.environment)
        made = tracks.regions_of(track.id)
        if made:
            _apply_spawn_presets(made[0], msg, webio)
        webio.send_track_created(made[0] if made else None, track)
        _roster()
        if made:
            _join_hub(ctx, made[0])

    elif t == "insert_region":
        reg = _do_insert_region(msg, ctx.environment)
        if reg is None:
            webio.out("[insert_region: unknown track]", dim=True)
            return
        if msg.get("node_id") is not None:
            reg.node_id = msg.get("node_id")
        _apply_spawn_presets(reg, msg, webio)
        webio.send_track_created(reg, tracks.get_track(reg.track))
        _roster()
        _join_hub(ctx, reg)

    elif t == "user":
        raw = msg.get("track")
        track_id = raw if isinstance(raw, str) else None
        track = tracks.get_region(track_id) if track_id else ctx.anchored
        if track_id and track is None:
            webio.out("[user: unknown track]", dim=True)
            return
        if track is None:
            webio.out("[no track anchored]", dim=True)
            return
        if track._closed:
            webio.out("[region closed — anchor another]", dim=True)
            return
        media = []
        if ctx.sanitize_media:
            media += ctx.sanitize_media(msg.get("media"))
        media += _media_from_paths(msg.get("image_paths"), webio)
        item = {"type": "message", "content": msg.get("text", "")}
        if media:
            item["media"] = media
        if track.enqueue(item):
            threading.Thread(target=track.run_pump, args=(ctx.live_runner,),
                             daemon=True).start()

    elif t == "stop":
        tid = msg.get("track", "")
        target = tracks.get_region(tid) if tid else ctx.anchored
        if target is not None:
            tracks.stop_region(target.id)

    elif t in ("kill_track", "close_track"):
        tid = msg.get("track", "")
        killed = tracks.close_region(tid)
        if killed is not None:
            if ctx.anchored is killed:
                _detach(ctx)
            _broadcast(ctx.environment, "send_track_removed",tid)
            _roster()

    elif t == "reset_track":
        tid = msg.get("track", "")
        webio.out(tracks.reset_region(tid), dim=True)

    elif t == "delete_track":
        tid = msg.get("track", "")
        doomed = [r.id for r in tracks.regions_of(tid)]
        for rid in doomed:
            killed = tracks.close_region(rid)
            if killed is not None and ctx.anchored is killed:
                _detach(ctx)
        removed = tracks.remove_track(tid)
        if removed is None and not doomed:
            webio.out("[delete_track: unknown track]", dim=True)
            webio.send_track_list(tracks.list_regions(ctx.environment),
                                  tracks.list_tracks(ctx.environment))
            return
        for rid in doomed:
            _broadcast(ctx.environment, "send_track_removed",rid)
        _roster()

    elif t == "duplicate_region":
        track, reg = _do_duplicate_region(msg.get("region", msg.get("track", "")),
                                          ctx.environment, msg.get("name"))
        if reg is None:
            webio.out("[duplicate_region: unknown region]", dim=True)
            webio.send_track_list(tracks.list_regions(ctx.environment),
                                  tracks.list_tracks(ctx.environment))
            return
        webio.send_track_created(reg, track)
        _roster()
        _join_hub(ctx, reg)

    elif t == "edit_track_row":
        row = tracks.get_track(msg.get("track", ""))
        if row is None:
            webio.out("[edit_track_row: unknown track]", dim=True)
            webio.send_track_list(tracks.list_regions(ctx.environment),
                                  tracks.list_tracks(ctx.environment))
            return
        fields = dict(msg.get("fields") or {})
        rejected = row.apply_edits(fields)
        if rejected:
            webio.out("[edit_track_row: rejected keys: %s]" % ", ".join(rejected), dim=True)
        _roster()

    elif t == "killswitch":
        stopped = tracks.stop_all_regions(ctx.environment)
        webio.out(f"[killswitch: ended {stopped} turn(s) — every seat, "
                  f"transcript and warm session kept]", dim=True)

    elif t == "answer":
        # the in-turn ask reply only; approve, deny and queue ride gate_action
        raw = msg.get("track")
        track_id = raw if isinstance(raw, str) else None
        track = tracks.get_region(track_id) if track_id else None
        gid  = msg.get("id")
        text = msg.get("text", "")
        if track_id and track is None:
            webio.out("[answer: unknown track]", dim=True)
            return
        if track is not None:
            if not gid:
                webio.out("[answer: track named without a gate id]", dim=True)
                return
            track.hub.resolve_gate(gid, text)
        else:
            if not webio.resolve_gate(gid, text) and ctx.anchored is not None:
                ctx.anchored.hub.resolve_gate(gid, text)

    elif t == "ade_plan":
        plan = msg.get("plan")
        if not isinstance(plan, dict):
            webio.out("[plan: nothing to pipe]", dim=True)
            return
        tracks.set_plan(plan, ctx.environment)
        rows = _plan_rows(plan)
        if not rows:
            webio.out("[plan: no regions on the selected phase]", dim=True)
            return
        n_tracks = n_regions = 0
        for track_name, nodes in rows:
            track = _do_create_track({"name": track_name}, ctx.environment)
            n_tracks += 1
            for node in nodes:
                reg = _do_insert_region({"track": track.id,
                                         "region": _plan_region(node)},
                                        ctx.environment)
                if reg is not None:
                    reg.node_id = node.get("id")
                    n_regions += 1
        _roster()
        webio.out(f"[plan piped: {n_tracks} track(s), {n_regions} region(s) — "
                  f"nothing started]", dim=True)

    elif t == "ade_save":
        environment = ctx.environment
        tracks.set_plan(msg.get("plan"), environment)
        name = (msg.get("name") or "").strip()
        if name and msg.get("session_template"):
            d = tracks.save_session_template(name, environment)
            webio.out(f"[session template saved: {name}]" if d else
                      "[no live session to template]", dim=True)
        elif name and msg.get("template"):
            d = tracks.save_template(name, environment)
            webio.out(f"[template saved: {name}]" if d else
                      "[no live session to template]", dim=True)
        elif name:
            tracks.save_session(name, environment)
            _init()

    elif t == "ade_load":
        back = tracks.reload_session(msg.get("sid", ""))
        if back is not None:
            _detach(ctx)
            _rebind_environment(ctx, back)
            _init()
            for track in tracks.list_regions(back):
                if back.waypoint.has_mail(track.id) and track.nudge():
                    threading.Thread(target=track.run_pump, args=(ctx.live_runner,),
                                     daemon=True).start()

    elif t == "ade_new":
        tid = (msg.get("template") or "").strip()
        if tid:
            fresh = tracks.instantiate_template(tid)
            if fresh is None:
                webio.out("[no such template]", dim=True)
                return
        else:
            fresh = tracks.new_session()
        _detach(ctx)
        _rebind_environment(ctx, fresh)
        _init()

    elif t == "ade_end":
        environment = ctx.environment
        tracks.set_plan(msg.get("plan"), environment)
        tracks.end_session(environment.sid())
        close_conns(environment)
        _detach(ctx)

    elif t == "feed":
        _since = msg.get("since", tracks.session_started_ms(ctx.environment))
        webio.send_feed(
            ledger.ade_snapshot(limit=msg.get("limit") or None, since=_since,
                                log_dir=ctx.environment.log_dir),
            ledger.region_totals(since=_since, log_dir=ctx.environment.log_dir), inst=_inst)

    elif t == "ledger_detail":
        webio.send_ledger_detail(ledger.detail(msg.get("id", ""), shell="ade",
                                               log_dir=ctx.environment.log_dir),
                                 inst=_inst)

    elif t == "wp_feed":
        webio.send_wp_feed(ctx.environment.waypoint.display_lines(),
                           ctx.environment.waypoint.waiting_counts())

    elif t == "wp_send":
        receivers = [r for r in (msg.get("to") or []) if r]
        body = (msg.get("body") or "").strip()
        if receivers and body:
            ctx.environment.waypoint.append_message(
                tracks.HUMAN_SENDER, receivers, body)

    elif t == "wp_mute":
        region_id = msg.get("id") or ""
        if region_id:
            tracks.set_muted(region_id, msg.get("muted"))
            broadcast_roster(ctx.environment)

    elif t == "wp_read":
        ids = [i for i in (msg.get("ids") or []) if isinstance(i, int)]
        if ids:
            ctx.environment.waypoint.collect(tracks.HUMAN_SENDER, ids=ids)

    elif t == "transcript":
        track = tracks.get_region(msg.get("track", ""))
        if track is not None:
            webio.send_transcript(track.id, track.sess.messages, inst=_inst)

    # gate history for one region, asked for by the widget that binds it
    elif t == "chat_history":
        track = tracks.get_region(msg.get("track", ""))
        if track is not None:
            webio.send_chat_history(track.id, _track_gatelog(track.id))

    elif t == "gate_action":
        _do_gate_action(msg.get("action"), msg.get("id"), ctx.environment.log_dir)

    elif t == "tree":
        text = rt.list_dir(_human_path(ctx.environment, msg.get("path")), show_hidden=msg.get("hidden", False))
        if isinstance(text, dict) and msg.get("tag"):
            text["tag"] = msg["tag"]
        webio.send_tree(text, inst=_inst)

    elif t == "open":
        path = msg.get("path", "")
        full = _human_path(ctx.environment, path)
        try:
            import mimetypes as _mt
            _mime, _ = _mt.guess_type(full)
            if _mime and _mime.startswith("image/"):
                content = (f"[binary image file — {_mime}]\n"
                           f"To have the model view it, type in chat:\n"
                           f"  VIEW_IMAGE: {path}")
            else:
                with open(full, "r", encoding="utf-8", errors="replace") as _f:
                    content = _f.read()
        except OSError as e:
            content = f"[open failed: {e}]"
        webio.send_file(path, content, inst=_inst)

    elif t == "save":
        path    = msg.get("path", "")
        content = msg.get("content", "")
        # the server owns the write: the gate answers here, not the browser
        result  = rt.write_file(_human_path(ctx.environment, path), content)
        ok      = not _write_refused(result)
        webio.send_saved(path, result, inst=_inst, ok=ok)
        if ok:
            _broadcast_all("send_tree_dirty", "*")
            dq.notify("file_save")

    elif t == "delete":
        path = msg.get("path", "")
        try:
            result = rt.delete_file(_human_path(ctx.environment, path))
        except OSError as e:
            result = f"[DELETE failed: {e}]"
        webio.send_deleted(path, result)
        _broadcast_all("send_tree_dirty", "*")

    elif t == "move":
        src = msg.get("src", "")
        dst = msg.get("dst", "")
        src_full = _human_path(ctx.environment, src)
        dst_full = _human_path(ctx.environment, dst)
        src_real = os.path.realpath(src_full)
        dst_real = os.path.realpath(dst_full)
        src_is_tree = os.path.isdir(src_full) and not os.path.islink(src_full)
        if not os.path.exists(src_full):
            result = f"[MOVE failed: no such file or directory: {src}]"
        elif not os.path.isdir(dst_full):
            result = f"[MOVE refused: destination is not a directory: {dst}]"
        elif src_is_tree and (src_real == dst_real
                              or dst_real.startswith(src_real + os.sep)):
            result = "[MOVE refused: cannot move a folder into its own subtree]"
        else:
            base = os.path.basename(src_full.rstrip(os.sep))
            target = os.path.join(dst_full, base)
            if os.path.realpath(target) == src_real:
                result = f"[MOVE refused: '{base}' is already in that folder]"
            elif os.path.exists(target):
                result = f"[MOVE refused: '{base}' already exists in destination]"
            else:
                try:
                    shutil.move(src_full, dst_full)
                    result = f"[MOVE ok: {src} → {dst}]"
                except OSError as e:
                    result = f"[MOVE failed: {e}]"
        webio.send_moved(src, dst, result)
        _broadcast_all("send_tree_dirty", "*")

    elif t == "rename":
        src    = msg.get("src", "")
        name   = msg.get("name", "")
        parent = os.path.dirname(src)
        dst    = os.path.join(parent, name) if parent else name
        src_full = _human_path(ctx.environment, src)
        if not os.path.exists(src_full):
            result = f"[RENAME failed: no such file or directory: {src}]"
        elif not name or os.sep in name or ".." in name:
            result = f"[RENAME refused: invalid name: {name}]"
        else:
            dst_full = os.path.join(os.path.dirname(src_full), name)
            target_exists = os.path.exists(dst_full)
            case_only = (target_exists and name != os.path.basename(src_full)
                         and os.path.samefile(src_full, dst_full))
            if target_exists and not case_only:
                result = f"[RENAME refused: {name} already exists]"
            else:
                try:
                    os.rename(src_full, dst_full)
                    result = f"[RENAME ok: {src} → {dst}]"
                except OSError as e:
                    result = f"[RENAME failed: {e}]"
        webio.send_renamed(src, dst, result)
        _broadcast_all("send_tree_dirty", "*")

    elif t == "mkdir":
        path = msg.get("path", "")
        if not path:
            result = f"[MKDIR refused: invalid path: {path}]"
        else:
            full = _human_path(ctx.environment, path)
            if os.path.exists(full):
                result = f"[MKDIR refused: {path} already exists]"
            elif not os.path.isdir(os.path.dirname(full)):
                result = f"[MKDIR refused: parent does not exist: {path}]"
            else:
                try:
                    os.mkdir(full)
                    result = f"[MKDIR ok: {full}]"
                except OSError as e:
                    result = f"[MKDIR failed: {e}]"
        webio.send_made(path, result)
        _broadcast_all("send_tree_dirty", "*")

    elif t == "rmdir":
        path = msg.get("path", "")
        if not path:
            result = f"[RMDIR refused: invalid path: {path}]"
        else:
            full = _human_path(ctx.environment, path)
            full_real = os.path.realpath(full)
            session_real = os.path.realpath(ctx.environment.root)
            if not os.path.exists(full):
                result = f"[RMDIR failed: no such directory: {path}]"
            elif not os.path.isdir(full):
                result = f"[RMDIR refused: not a directory: {path}]"
            elif os.path.islink(full):
                result = f"[RMDIR refused: {path} is a symlink]"
            elif full_real == os.sep:
                result = "[RMDIR refused: will not delete the filesystem root]"
            elif full_real == session_real:
                result = (f"[RMDIR refused: {path} is the session root — move the "
                          f"session root first, then delete it]")
            else:
                try:
                    shutil.rmtree(full)
                    result = f"[RMDIR ok: {full}]"
                except OSError as e:
                    result = f"[RMDIR failed: {e}]"
        webio.send_deleted(path, result)
        _broadcast_all("send_tree_dirty", "*")

    elif t == "setroot":
        path = msg.get("path", "")
        full = os.path.abspath(os.path.expanduser(path.strip()))
        if not os.path.isdir(full):
            webio.out(f"[root unchanged: no directory at '{path}']", dim=True)
            return
        ctx.environment.root = full
        webio.out(f"[workspace root → {full}]", dim=True)
        moved = []
        for region in tracks.list_regions(ctx.environment):
            try:
                region.apply_edits([{"type": "root", "value": full}])
                moved.append(region.name)
            except Exception:
                pass
        if moved:
            webio.out(f"[session root → {full} — moved {len(moved)} "
                      f"agent(s): {', '.join(moved)}]", dim=True)
        else:
            webio.out(f"[session root → {full} — no agents yet; every "
                      f"agent added from here starts in it]", dim=True)
        broadcast_reload(f"session root moved to {full}")

    elif t == "input":
        tid = msg.get("track", "")
        track = tracks.get_region(tid) if tid else ctx.anchored
        if track is None:
            webio.out("[input: unknown region]", dim=True)
            return
        os.write(track.shell_master(msg.get("shell", "")), msg["data"].encode())

    elif t == "close_shell":
        track = tracks.get_region(msg.get("track", ""))
        if track is not None:
            track.close_shell(msg.get("shell") or None)

    elif t in ("focus", "follow"):
        tid = msg.get("track")
        if tid:
            track = tracks.get_region(tid)
            if track is None:
                webio.out("[follow: unknown region]", dim=True)
            else:
                _follow(ctx, track)

    elif t == "unfollow":
        _unfollow(ctx, msg.get("track", ""))

    elif t == "edit_track":
        track = tracks.get_region(msg.get("track", ""))
        if track is None:
            webio.out("[edit_track: unknown track]", dim=True)
            webio.send_track_list(tracks.list_regions(ctx.environment),
                                  tracks.list_tracks(ctx.environment))
            return
        items = []
        fields = dict(msg.get("fields") or {})
        rail = {k: fields.pop(k) for k in ("provider", "loop_class", "mechanism")
                if k in fields}
        if "root" in fields:
            want = (fields.get("root") or "").strip()
            if not want or not os.path.isdir(os.path.abspath(os.path.expanduser(want))):
                fields.pop("root")
                webio.out("[root unchanged — no such directory: %s]" % (want or "(blank)"), dim=True)
                webio.send_track_list(tracks.list_regions(ctx.environment),
                                  tracks.list_tracks(ctx.environment))
        for key, value in fields.items():
            if key == "name":
                item = {"type": "rename", "value": value}
            elif key == "root":
                item = {"type": "root", "value": value}
            elif key == "seat":
                item = {"type": "seat", "value": value}
            elif key == "overlay":
                item = {"type": "overlay", "value": value}
            else:
                item = {"type": "setting", "key": key, "value": value}
            items.append(item)
        if rail:
            items.append({"type": "rail", "value": rail})
        if track.prompts_on_change(items):
            token = _park_change(track.id, "edit", items=items)
            _send_change_prompt(ctx, track.id, token, "edit", items)
            return
        track.apply_edits(items)
        _roster()

    elif t == "change_answer":
        token  = (msg.get("token") or "").strip()
        choice = (msg.get("choice") or "").strip()
        rec = _take_change(token)
        if rec is None:
            webio.out("[change_answer: unknown token]", dim=True)
            return
        if choice not in CHANGE_CHOICES:
            webio.out("[change_answer: unknown choice]", dim=True)
            return
        if choice == "cancel":
            webio.send_track_list(tracks.list_regions(ctx.environment),
                                  tracks.list_tracks(ctx.environment))
            return
        region = tracks.get_region(rec["region"])
        if region is None:
            webio.out("[change_answer: unknown region]", dim=True)
            return
        mode = "reset" if choice == "reset_region" else "in_place"
        if rec["action"] == "edit":
            if mode == "reset":
                region.apply_with_reset(rec["items"])
            else:
                region.apply_in_place(rec["items"])
        elif rec["action"] == "load_preset":
            ok, warnings = _do_load_preset(region, rec["name"], mode=mode)
            for w in warnings:
                webio.out(f"[preset {rec['name']!r}] {w}", dim=True)
        elif rec["action"] == "save_preset":
            ok, result = _do_save_preset(region, rec["name"], rec["fields"])
            webio.out(f"[preset saved: {result}]" if ok
                      else f"[save_preset failed: {result}]", dim=True)
            if mode == "reset":
                tracks.reset_region(region.id)
        _roster()

    elif t == "load_preset":
        track = tracks.get_region(msg.get("track", ""))
        name = (msg.get("name") or "").strip()
        if track is None:
            webio.out("[load_preset: unknown track]", dim=True)
            return
        if not name:
            webio.out("[load_preset: bad name]", dim=True)
            return
        mode = msg.get("mode")
        if mode in ("reset", "in_place"):
            ok, warnings = _do_load_preset(track, name, mode=mode)
            for w in warnings:
                webio.out(f"[preset {name!r}] {w}", dim=True)
            _roster()
            return
        token = _park_change(track.id, "load_preset", name=name)
        _send_change_prompt(ctx, track.id, token, "load_preset", [])

    elif t == "save_preset":
        track = tracks.get_region(msg.get("track", ""))
        name = (msg.get("name") or "").strip()
        if track is None:
            webio.out("[save_preset: unknown track]", dim=True)
            return
        if not name:
            webio.out("[save_preset: bad name]", dim=True)
            return
        pending = msg.get("fields")
        token = _park_change(track.id, "save_preset", name=name,
                             fields=pending if isinstance(pending, dict) else None)
        _send_change_prompt(ctx, track.id, token, "save_preset", [])

    elif t == "rename_preset":
        old_name = (msg.get("old_name") or "").strip()
        new_name = (msg.get("new_name") or "").strip()
        if not old_name or not new_name:
            webio.out("[rename_preset: bad name]", dim=True)
            return
        ok, result = st.rename_preset(old_name, new_name)
        webio.out(f"[preset renamed: {result}]" if ok else f"[rename_preset failed: {result}]", dim=True)

    elif t == "delete_preset":
        name = (msg.get("name") or "").strip()
        if not name:
            webio.out("[delete_preset: bad name]", dim=True)
            return
        ok, result = st.delete_preset(name)
        webio.out(f"[preset deleted: {result}]" if ok else f"[delete_preset failed: {result}]", dim=True)

    else:
        webio.out(f"[ade: unknown frame {t}]", dim=True)
