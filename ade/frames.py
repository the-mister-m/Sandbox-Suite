
import os
import shutil
import threading

from engine import agent_loop as al
from engine import daemon_queue as dq
from engine import ledger
from engine import read_tool as rt
from engine import settings_stack
from ade import rails
from ade import tracks


def _human_path(path):
    path = path or "."
    expanded = os.path.expanduser(path)
    if os.path.isabs(expanded):
        return os.path.abspath(expanded)
    return os.path.abspath(os.path.join(rt.WORKSPACE_ROOT, expanded))


_conns_lock = threading.Lock()
_conns = []


def register_conn(webio):
    with _conns_lock:
        _conns.append(webio)


def unregister_conn(webio):
    with _conns_lock:
        if webio in _conns:
            _conns.remove(webio)


def _broadcast(method, *args):
    with _conns_lock:
        conns = list(_conns)
    for w in conns:
        try:
            getattr(w, method)(*args)
        except Exception:
            pass


def broadcast_reload(reason=""):
    _broadcast("send_reload", reason)


def broadcast_gate(kind, gid, prompt, track_id, track_name):
    _broadcast("send_gate_broadcast", kind, gid, prompt, track_id, track_name)


def broadcast_track_status(track_id, phase):
    _broadcast("send_track_status", track_id, phase)


def broadcast_context_warn(track_id, peak, cap):
    _broadcast("send_context_warn", track_id, peak, cap)


def broadcast_roster():
    _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())


def broadcast_region_replaced(old_id, new_id):
    _broadcast("send_region_replaced", old_id, new_id)


def broadcast_human_mail():
    waiting = tracks.waypoint.peek(tracks.HUMAN_SENDER)
    if not waiting:
        return
    displays = []
    for line in waiting:
        sender = tracks.get_region(line.get("from"))
        displays.append(sender.name if sender is not None else line.get("from"))
    _broadcast("send_activity", {
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
        _broadcast("send_feed_dirty", stores)


class AdeCtx:

    def __init__(self, webio, conn_sid, live_runner, rebind, sanitize_media=None):
        self.webio       = webio
        self.conn_sid    = conn_sid
        self.live_runner = live_runner
        self.rebind      = rebind
        self.sanitize_media = sanitize_media
        self.anchored    = None
        self.mirror      = None


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
    return [_name_receivers(r) for r in ledger.ade_snapshot(since=0)
            if r.get("kind") == "action" and r.get("track") == track_id]


def _anchor(ctx, track):
    _detach(ctx)
    track.hub.add(ctx.webio, ctx.conn_sid)
    ctx.anchored = track
    ctx.rebind(track.sess)
    ctx.webio.send_track_transcript(track.id, track.sess.messages)
    ctx.webio.send_chat_history(track.id, _track_gatelog(track.id))
    for e in dq.waiting_gates(track.sess.sid):
        ctx.webio.post_gate(e["id"], e.get("prompt") or "")


def _detach(ctx):
    old = ctx.anchored
    if old is not None:
        old.hub.remove(ctx.webio)
        ctx.anchored = None
        if old.hub.empty():
            dq.abandon_session(old.sess.sid)
    ctx.rebind(None)


def disconnect(ctx):
    _detach(ctx)
    if ctx.mirror is not None:
        ctx.mirror.hub.remove_mirror_for(ctx.webio)
        ctx.mirror = None




def _do_create_track(msg):
    name     = (msg.get("name") or "untitled").strip() or "untitled"
    settings = msg.get("settings")
    has_region = ("model" in msg or "seat" in msg or settings is not None
                  or bool(msg.get("region")))
    return tracks.create_track(
        name,
        root=msg.get("root") or rt.WORKSPACE_ROOT,
        overlay_rows=msg.get("overlay", msg.get("overlay_rows")),
        provider=msg.get("provider"), loop_class=msg.get("loop_class"),
        mechanism=msg.get("mechanism"),
        model=(msg.get("model") or "") if has_region else None,
        seat=((msg.get("seat") or "").strip() or None) if has_region else None,
        settings=settings, region=msg.get("region"))





def _do_load_preset(track, name):
    fields, warnings = settings_stack.read_preset_file("claude", name)

    items = []
    for key in settings_stack.preset_keys():
        how = settings_stack.PRESET_TABLE[key]["how"]
        if how == "gates":
            continue
        if how == "name":
            items.append({"type": "setting", "key": key, "value": name})
            continue
        if how == "layer":
            items.append({"type": "setting", "key": key,
                          "value": settings_stack.preset_default(key)})
            continue
        value = fields.get(key, settings_stack.preset_default(key))
        if key == "seat":
            items.append({"type": "seat", "value": value or ""})
        else:
            items.append({"type": "setting", "key": key, "value": value})

    model_val = fields.get("model")
    if model_val:
        prov, lclass, mech = rails.normalize(
            provider=rails.infer_provider(model_val), model=model_val)
        items.append({"type": "rail",
                      "value": {"provider": prov, "loop_class": lclass,
                                "mechanism": mech}})

    edge_names = tracks.stack_gate_edges() | tracks.model_gate_edges()
    new_overlay = tracks.apply_gate_subset(track.overlay_rows, edge_names,
                                           fields.get("gates") or {})
    items.append({"type": "overlay", "value": new_overlay})
    track.apply_edits(items)
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


def _capture_preset_fields(track, pending=None):
    out = {}
    pending = pending or {}
    loaded = (track.sess.settings.get("claude_preset") or "").strip()
    inherited = settings_stack.read_preset_file("claude", loaded)[0] if loaded else {}

    for key in settings_stack.preset_keys():
        how = settings_stack.PRESET_TABLE[key]["how"]
        if how == "gates":
            continue
        if how == "name":
            continue
        if key in pending:
            val = pending[key]
        elif key == "model":
            val = track.model
        elif key == "seat":
            val = track.seat
        else:
            val = track.sess.settings.get(key)
        default = settings_stack.preset_default(key)
        if val is None:
            val = default
        if val == default and key in inherited:
            val = inherited[key]
        if key == "model" or val != default:
            out[key] = val
    return out


def _capture_gates(track, edge_names, pending_overlay=None):
    rows = pending_overlay or track.overlay_rows or tracks.default_overlay_rows()
    out, seen = {}, set()
    for r in rows:
        edge = r.get("edge")
        if edge not in edge_names or edge in seen:
            continue
        seen.add(edge)
        if r.get("hook") != "ask":
            out[edge] = r.get("hook")
    return out


def _do_save_preset(track, name, pending=None):
    pending = dict(pending or {})
    pending_overlay = pending.pop("overlay", None)
    edge_names = tracks.stack_gate_edges() | tracks.model_gate_edges()
    fields = _capture_preset_fields(track, pending)
    gates = _capture_gates(track, edge_names, pending_overlay)
    if gates:
        fields["gates"] = gates
    if not (fields.get("model") or "").strip():
        return False, (f"nothing to save — this track has no model, and a "
                       f"preset with no model loads onto the wrong rail. "
                       f"{name!r} was left alone")
    if not fields:
        return False, (f"nothing to save — this track is at the engine "
                       f"defaults on every field, so {name!r} was left alone")
    return settings_stack.write_preset_file("claude", name, fields)


def _do_insert_region(msg):
    r = msg.get("region") or {}
    return tracks.insert_region(
        msg.get("track", ""),
        (r.get("name") or msg.get("name") or "untitled").strip() or "untitled",
        r.get("model") or msg.get("model") or "",
        root=r.get("wt") or r.get("root") or msg.get("root"),
        seat=(r.get("agent") or r.get("seat") or "").strip() or None,
        overlay_rows=r.get("overlay_rows"),
        settings=msg.get("settings"),
        provider=r.get("provider") or msg.get("provider"),
        loop_class=r.get("loop_class") or msg.get("loop_class"),
        mechanism=r.get("mechanism") or msg.get("mechanism"),
        region=r)


def _do_duplicate_region(region_id, name=None):
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
        mechanism=src.mechanism)
    reg = tracks.insert_region(
        track.id, new_name, src.model,
        root=src.root,
        seat=src.seat,
        overlay_rows=src.overlay_rows,
        settings=dict(src.sess.settings),
        provider=src.provider,
        loop_class=src.loop_class,
        mechanism=src.mechanism,
        region=dict(src.carried))
    return track, reg



_PLAN_NODE_FIELDS   = ("wt", "notes", "status", "stxt")
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


def handle(ctx, msg):
    webio = ctx.webio
    t = msg.get("type")

    if t == "create_track":
        track = _do_create_track(msg)
        made = tracks.regions_of(track.id)
        if made:
            _apply_spawn_presets(made[0], msg, webio)
            webio.send_track_created(made[0], track)
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())
        if made:
            _anchor(ctx, made[0])

    elif t == "insert_region":
        reg = _do_insert_region(msg)
        if reg is None:
            webio.out("[insert_region: unknown track]", dim=True)
            return
        if msg.get("node_id") is not None:
            reg.node_id = msg.get("node_id")
        _apply_spawn_presets(reg, msg, webio)
        webio.send_track_created(reg, tracks.get_track(reg.track))
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())
        _anchor(ctx, reg)

    elif t == "anchor":
        target = msg.get("track", "")
        track = tracks.get_region(target)
        if track is None:
            kids = tracks.regions_of(target)
            track = kids[0] if kids else None
        if track is None:
            webio.out("[anchor: unknown track]", dim=True)
            return
        _anchor(ctx, track)

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
            _broadcast("send_track_removed", tid)
            _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())

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
            webio.send_track_list(tracks.list_regions(), tracks.list_tracks())
            return
        for rid in doomed:
            _broadcast("send_track_removed", rid)
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())

    elif t == "duplicate_region":
        track, reg = _do_duplicate_region(msg.get("region", msg.get("track", "")),
                                          msg.get("name"))
        if reg is None:
            webio.out("[duplicate_region: unknown region]", dim=True)
            webio.send_track_list(tracks.list_regions(), tracks.list_tracks())
            return
        webio.send_track_created(reg, track)
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())
        _anchor(ctx, reg)

    elif t == "edit_track_row":
        row = tracks.get_track(msg.get("track", ""))
        if row is None:
            webio.out("[edit_track_row: unknown track]", dim=True)
            webio.send_track_list(tracks.list_regions(), tracks.list_tracks())
            return
        fields = dict(msg.get("fields") or {})
        if "name" in fields:
            new = (fields.get("name") or "").strip()
            if new:
                row.name = new
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())

    elif t == "killswitch":
        stopped = tracks.stop_all_regions()
        webio.out(f"[killswitch: ended {stopped} turn(s) — every seat, "
                  f"transcript and warm session kept]", dim=True)

    elif t == "answer":
        raw = msg.get("track")
        track_id = raw if isinstance(raw, str) else None
        track = tracks.get_region(track_id) if track_id else None
        if track_id and track is None:
            webio.out("[answer: unknown track]", dim=True)
        elif track is not None:
            gid = msg.get("id")
            if not gid:
                webio.out("[answer: track named without a gate id]", dim=True)
            else:
                track.hub.resolve_gate(gid, msg.get("text", ""))
        elif not webio.resolve_gate(msg.get("id"), msg.get("text", "")):
            if ctx.anchored is not None:
                ctx.anchored.hub.resolve_gate(msg.get("id"), msg.get("text", ""))

    elif t == "ade_plan":
        plan = msg.get("plan")
        if not isinstance(plan, dict):
            webio.out("[plan: nothing to pipe]", dim=True)
            return
        tracks.set_plan(plan)
        rows = _plan_rows(plan)
        if not rows:
            webio.out("[plan: no regions on the selected phase]", dim=True)
            return
        n_tracks = n_regions = 0
        for track_name, nodes in rows:
            track = _do_create_track({"name": track_name})
            n_tracks += 1
            for node in nodes:
                reg = _do_insert_region({"track": track.id,
                                         "region": _plan_region(node)})
                if reg is not None:
                    reg.node_id = node.get("id")
                    n_regions += 1
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())
        webio.out(f"[plan piped: {n_tracks} track(s), {n_regions} region(s) — "
                  f"nothing started]", dim=True)

    elif t == "ade_save":
        tracks.set_plan(msg.get("plan"))
        name = (msg.get("name") or "").strip()
        if name and msg.get("template"):
            d = tracks.save_template(name)
            webio.out(f"[template saved: {name}]" if d else
                      "[no live session to template]", dim=True)
        elif name:
            tracks.save_session(name)
            _broadcast("send_ade_init", tracks.session_meta(),
                       tracks.list_regions(), tracks.list_tracks())

    elif t == "ade_load":
        back = tracks.reload_session(msg.get("sid", ""))
        if back is not None:
            _detach(ctx)
            _broadcast("send_ade_init", tracks.session_meta(),
                       tracks.list_regions(), tracks.list_tracks())
            for track in back:
                if tracks.waypoint.has_mail(track.id) and track.nudge():
                    threading.Thread(target=track.run_pump, args=(ctx.live_runner,),
                                     daemon=True).start()

    elif t == "ade_new":
        tid = (msg.get("template") or "").strip()
        if tid:
            if tracks.instantiate_template(tid) is None:
                webio.out("[no such template]", dim=True)
                return
        else:
            tracks.new_session()
        _detach(ctx)
        _broadcast("send_ade_init", tracks.session_meta(),
                       tracks.list_regions(), tracks.list_tracks())

    elif t == "ade_end":
        tracks.set_plan(msg.get("plan"))
        tracks.end_session()
        _detach(ctx)
        _broadcast("send_ade_init", tracks.session_meta(),
                       tracks.list_regions(), tracks.list_tracks())

    elif t == "feed":
        _since = msg.get("since", tracks.session_started_ms())
        webio.send_feed(
            ledger.ade_snapshot(limit=msg.get("limit") or None, since=_since),
            ledger.region_totals(since=_since))

    elif t == "ledger_detail":
        webio.send_ledger_detail(ledger.detail(msg.get("id", ""), shell="ade"))

    elif t == "wp_feed":
        webio.send_wp_feed(tracks.waypoint.display_lines(),
                           tracks.waypoint.waiting_counts())

    elif t == "wp_send":
        receivers = [r for r in (msg.get("to") or []) if r]
        body = (msg.get("body") or "").strip()
        if receivers and body:
            tracks.waypoint.append_message(tracks.HUMAN_SENDER, receivers, body)

    elif t == "wp_mute":
        region_id = msg.get("id") or ""
        if region_id:
            tracks.set_muted(region_id, msg.get("muted"))

    elif t == "wp_read":
        ids = [i for i in (msg.get("ids") or []) if isinstance(i, int)]
        if ids:
            tracks.waypoint.collect(tracks.HUMAN_SENDER, ids=ids)

    elif t == "transcript":
        track = tracks.get_region(msg.get("track", ""))
        if track is not None:
            webio.send_transcript(track.id, track.sess.messages)

    elif t == "gate_action":
        action = msg.get("action")
        gid    = msg.get("id")
        if action == "approve":
            dq.answer_gate(gid, True)
            dq.notify("gate_answered")
        elif action == "deny":
            if dq.deny(gid) is None:
                ledger._deny_orphan(gid)
        elif action == "queue":
            dq.defer_gate(gid)

    elif t == "tree":
        text = rt.list_dir(_human_path(msg.get("path")), show_hidden=msg.get("hidden", False))
        if isinstance(text, dict) and msg.get("tag"):
            text["tag"] = msg["tag"]
        webio.send_tree(text)

    elif t == "open":
        path = msg.get("path", "")
        full = _human_path(path)
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
        webio.send_file(path, content)

    elif t == "save":
        path    = msg.get("path", "")
        content = msg.get("content", "")
        result  = rt.write_file(_human_path(path), content)
        webio.send_saved(path, result)
        _broadcast("send_tree_dirty", "*")
        dq.notify("file_save")

    elif t == "delete":
        path = msg.get("path", "")
        try:
            result = rt.delete_file(_human_path(path))
        except OSError as e:
            result = f"[DELETE failed: {e}]"
        webio.send_deleted(path, result)
        _broadcast("send_tree_dirty", "*")

    elif t == "move":
        src = msg.get("src", "")
        dst = msg.get("dst", "")
        src_full = _human_path(src)
        dst_full = _human_path(dst)
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
        _broadcast("send_tree_dirty", "*")

    elif t == "rename":
        src    = msg.get("src", "")
        name   = msg.get("name", "")
        parent = os.path.dirname(src)
        dst    = os.path.join(parent, name) if parent else name
        src_full = _human_path(src)
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
        _broadcast("send_tree_dirty", "*")

    elif t == "mkdir":
        path = msg.get("path", "")
        if not path:
            result = f"[MKDIR refused: invalid path: {path}]"
        else:
            full = _human_path(path)
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
        _broadcast("send_tree_dirty", "*")

    elif t == "rmdir":
        path = msg.get("path", "")
        if not path:
            result = f"[RMDIR refused: invalid path: {path}]"
        else:
            full = _human_path(path)
            full_real = os.path.realpath(full)
            session_real = os.path.realpath(rt.WORKSPACE_ROOT)
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
        _broadcast("send_tree_dirty", "*")

    elif t == "setroot":
        result = al.set_and_persist_root(msg.get("path", ""))
        webio.out(result, dim=True)
        if not result.startswith("[workspace root"):
            return
        moved = []
        for region in tracks.list_regions():
            try:
                region.apply_edits([{"type": "root", "value": rt.WORKSPACE_ROOT}])
                moved.append(region.name)
            except Exception:
                pass
        if moved:
            webio.out(f"[session root → {rt.WORKSPACE_ROOT} — moved {len(moved)} "
                      f"agent(s): {', '.join(moved)}]", dim=True)
        else:
            webio.out(f"[session root → {rt.WORKSPACE_ROOT} — no agents yet; every "
                      f"agent added from here starts in it]", dim=True)
        broadcast_reload(f"session root moved to {rt.WORKSPACE_ROOT}")

    elif t == "input":
        track = ctx.anchored
        if track is None:
            webio.out("[input: no track anchored]", dim=True)
            return
        os.write(track.shell_master(), msg["data"].encode())

    elif t == "close_shell":
        track = tracks.get_region(msg.get("track", ""))
        if track is not None:
            track.close_shell()

    elif t == "focus":
        if ctx.mirror is not None:
            ctx.mirror.hub.remove_mirror_for(webio)
            ctx.mirror = None
        tid = msg.get("track")
        if tid:
            track = tracks.get_region(tid)
            if track is None:
                webio.out("[focus: unknown track]", dim=True)
            else:
                view = tracks.MirrorView(webio, track.id)
                track.hub.add_mirror(view, ctx.conn_sid)
                ctx.mirror = track
                view.transcript(track.sess.messages)
                view.gatelog(_track_gatelog(track.id))

    elif t == "edit_track":
        track = tracks.get_region(msg.get("track", ""))
        if track is None:
            webio.out("[edit_track: unknown track]", dim=True)
            webio.send_track_list(tracks.list_regions(), tracks.list_tracks())
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
                webio.send_track_list(tracks.list_regions(), tracks.list_tracks())
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
        track.apply_edits(items)
        _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())

    elif t == "load_preset":
        track = tracks.get_region(msg.get("track", ""))
        name = (msg.get("name") or "").strip()
        if track is None:
            webio.out("[load_preset: unknown track]", dim=True)
            return
        if not name:
            webio.out("[load_preset: bad name]", dim=True)
            return
        ok, warnings = _do_load_preset(track, name)
        for w in warnings:
            webio.out(f"[preset {name!r}] {w}", dim=True)
        if ok:
            _broadcast("send_track_list", tracks.list_regions(), tracks.list_tracks())
        else:
            webio.send_track_list(tracks.list_regions(), tracks.list_tracks())

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
        ok, result = _do_save_preset(track, name,
                                     pending if isinstance(pending, dict) else None)
        webio.out(f"[preset saved: {result}]" if ok else f"[save_preset failed: {result}]", dim=True)

    elif t == "rename_preset":
        old_name = (msg.get("old_name") or "").strip()
        new_name = (msg.get("new_name") or "").strip()
        if not old_name or not new_name:
            webio.out("[rename_preset: bad name]", dim=True)
            return
        ok, result = settings_stack.rename_preset_file("claude", old_name, new_name)
        webio.out(f"[preset renamed: {result}]" if ok else f"[rename_preset failed: {result}]", dim=True)

    elif t == "delete_preset":
        name = (msg.get("name") or "").strip()
        if not name:
            webio.out("[delete_preset: bad name]", dim=True)
            return
        ok, result = settings_stack.delete_preset_file("claude", name)
        webio.out(f"[preset deleted: {result}]" if ok else f"[delete_preset failed: {result}]", dim=True)

    else:
        webio.out(f"[ade: unknown frame {t}]", dim=True)
