
import json
import os
import shutil
import threading

from engine import agent_loop
from engine import compiler
from engine import daemon_queue as dq
from engine import read_tool as rt
from engine import ledger
from shells import turn_gate


class IdeCtx:

    def __init__(self, webio, sess, get_master, sanitize_media, agent_respond_safe):
        self.webio              = webio
        self.sess                = sess
        self.get_master          = get_master
        self.sanitize_media      = sanitize_media
        self.agent_respond_safe  = agent_respond_safe
        self.agent_thread        = None


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

    elif msg["type"] == "ledger_list":
        webio.send_ledger_state(ledger.snapshot(), sid=getattr(sess, "sid", None))

    elif msg["type"] == "ledger_action":
        ledger.apply_action(msg.get("action"), msg.get("id"), msg.get("payload"))
        webio.send_ledger_state(ledger.snapshot(), sid=getattr(sess, "sid", None))

    elif msg["type"] == "ledger_detail":
        webio.send_ledger_detail(ledger.detail(msg.get("id", "")))

    elif msg["type"] == "stop":
        webio.stop_requested.set()

    elif msg["type"] == "speak_test":
        eng = msg.get("engine") or sess.settings.get("tts_engine", "browser")
        voc = msg.get("voice", sess.settings.get("tts_voice", ""))
        threading.Thread(
            target=lambda: sess.io.speak(
                "This is how the selected voice sounds.", engine=eng, voice=voc),
            daemon=True).start()

    elif msg["type"] == "input":
        os.write(ctx.get_master(), msg["data"].encode())

    elif msg["type"] == "open":
        path = msg.get("path", "")
        full = rt._resolve(path)
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

    elif msg["type"] == "tree":
        text = rt.list_dir(msg.get("path") or ".", show_hidden=msg.get("hidden", False))
        if isinstance(text, dict) and msg.get("tag"):
            text["tag"] = msg["tag"]
        webio.send_tree(text)

    elif msg["type"] == "setroot":
        result = agent_loop.set_and_persist_root(msg.get("path", ""))
        agent_loop.reseat(sess, shell="ide")
        webio.out(result, dim=True)
        _tree = rt.list_dir(".")
        if isinstance(_tree, dict):
            _tree["tag"] = "root"
        webio.send_tree(_tree)
        webio.send_settings(dict(sess.settings))

    elif msg["type"] == "move":
        src = msg.get("src", "")
        dst = msg.get("dst", "")
        src_full = rt._resolve(src)
        dst_full = rt._resolve(dst)
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

    elif msg["type"] == "rename":
        src    = msg.get("src", "")
        name   = msg.get("name", "")
        parent = os.path.dirname(src)
        dst    = os.path.join(parent, name) if parent else name
        src_full = rt._resolve(src)
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

    elif msg["type"] == "mkdir":
        path = msg.get("path", "")
        if not path:
            result = f"[MKDIR refused: invalid path: {path}]"
        else:
            full = rt._resolve(path)
            if os.path.exists(full):
                result = f"[MKDIR refused: {path} already exists]"
            elif not os.path.isdir(os.path.dirname(full)):
                result = f"[MKDIR refused: parent does not exist: {path}]"
            else:
                try:
                    os.mkdir(full)
                    result = f"[MKDIR ok: {path}]"
                except OSError as e:
                    result = f"[MKDIR failed: {e}]"
        webio.send_made(path, result)

    elif msg["type"] == "rmdir":
        path = msg.get("path", "")
        if not path:
            result = f"[RMDIR refused: invalid path: {path}]"
        else:
            full = rt._resolve(path)
            full_real = os.path.realpath(full)
            root_real = os.path.realpath(rt.WORKSPACE_ROOT)
            if not os.path.exists(full):
                result = f"[RMDIR failed: no such directory: {path}]"
            elif not os.path.isdir(full):
                result = f"[RMDIR refused: not a directory: {path}]"
            elif os.path.islink(full):
                result = f"[RMDIR refused: {path} is a symlink]"
            elif full_real == root_real:
                result = "[RMDIR refused: will not delete the root]"
            elif not full_real.startswith(root_real + os.sep):
                result = f"[RMDIR refused: {path} is outside the workspace root]"
            else:
                try:
                    shutil.rmtree(full)
                    result = f"[RMDIR ok: {path}]"
                except OSError as e:
                    result = f"[RMDIR failed: {e}]"
        webio.send_deleted(path, result)

    elif msg["type"] == "set_crew":
        nick = (msg.get("nick") or "").strip() or None
        sess.nick = nick
        agent_loop.reseat(sess, shell="ide")
        if nick:
            webio.out(f"[crew → {nick}]", dim=True)
        else:
            webio.out("[crew → (none — bare model)]", dim=True)
        webio.send_settings(dict(sess.settings))
        webio.send_crew_list(compiler.roster_entries(), sess.nick)

    elif msg["type"] == "delete":
        path   = msg.get("path", "")
        result = rt.delete_file(path)
        webio.send_deleted(path, result)

    elif msg["type"] == "session_new":
        sess.messages = [{"role": "system", "content": ""}]
        agent_loop.reseat(sess, shell="ide")
        sess.autosave = False
        sess.save_name = None
        sess.activity = []
        webio.send_transcript(sess.messages)
        webio.send_activity_log([])
        webio.send_session_ack(None)

    elif msg["type"] == "session_save":
        import re as _re
        name = msg.get("name", "")
        clean = _re.sub(r'[^\w\-]', '-', name)[:80].strip('-')
        if not clean:
            webio.out("[session_save: invalid name]", dim=True)
        else:
            agent_loop.persist_session(sess, clean)
            sess.save_name = clean
            sess.autosave = True
            webio.send_session_ack(clean)

    elif msg["type"] == "session_load":
        import re as _re
        name = msg.get("name", "")
        path = msg.get("path", "")
        if path:
            known = {e.get("file") for e in agent_loop._load_index()}
            if path not in known or not os.path.isfile(path):
                webio.out("[session_load: unknown path]", dim=True)
            else:
                with open(path) as fh:
                    data = json.load(fh)
                sess.messages = ([{"role": "system", "content": ""}]
                                 + data["messages"][1:])
                agent_loop.reseat(sess, shell="ide")
                sess.activity = data.get("activity", [])
                sess.autosave = False
                sess.save_name = None
                webio.send_transcript(sess.messages)
                webio.send_activity_log(sess.activity)
                webio.send_session_ack(None)
        elif not _re.fullmatch(r'[\w\-]+', name):
            webio.out(f"[session_load: invalid name]", dim=True)
        else:
            save_path = os.path.join(agent_loop.sessions_dir(), f"{name}.json")
            if os.path.isfile(save_path):
                with open(save_path) as fh:
                    data = json.load(fh)
                sess.messages = ([{"role": "system", "content": ""}]
                                 + data["messages"][1:])
                agent_loop.reseat(sess, shell="ide")
                sess.activity = data.get("activity", [])
                sess.autosave = False
                sess.save_name = None
                webio.send_transcript(sess.messages)
                webio.send_activity_log(sess.activity)
                webio.send_session_ack(None)
            else:
                webio.out(f"[session not found: {name}]", dim=True)

    elif msg["type"] == "save":
        path    = msg.get("path", "")
        content = msg.get("content", "")
        result = rt.write_file(path, content)
        webio.send_saved(path, result)
        dq.notify("file_save")

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
        if sess.settings.get("listen"):
            import speech as _sp, base64 as _b64
            from engine.providers import normalize_audio as _norm
            heard = []
            for a in [x for x in media if x["kind"] == "audio"]:
                raw = _norm(_b64.b64decode(a["data_b64"]), a.get("mime"))
                t = _sp.transcribe(raw, "audio/wav", sess.settings.get("stt_engine"))
                if t and not t.startswith("[stt"): heard.append(t)
                elif t: webio.out(t, dim=True)
            if heard:
                spoken = " ".join(heard).strip()
                text = (text + "\n" + spoken).strip() if text else spoken
                media = [x for x in media if x["kind"] != "audio"]
        user_msg = {"role": "user", "content": text}
        if media:
            user_msg["media"] = media
        sess.messages.append(user_msg)
        turn_gate.spawn_turn(ctx, ctx.agent_respond_safe, sess)
