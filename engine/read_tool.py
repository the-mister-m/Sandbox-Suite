
import base64
import html
import io
import mimetypes
import os
import re
import json
import subprocess
import sys
import tempfile
import time
import pty
import select
import shutil
import urllib.request
import contextvars
from engine import SUITE_ROOT
from engine import waypoint

DEFAULT_WORKSPACE_ROOT = os.path.expanduser("~/Desktop")
if not os.path.isdir(DEFAULT_WORKSPACE_ROOT):
    DEFAULT_WORKSPACE_ROOT = SUITE_ROOT

WORKSPACE_ROOT = DEFAULT_WORKSPACE_ROOT

_track_root = contextvars.ContextVar("track_root", default=None)

MAX_BYTES = 20_000
MAX_IMG_BYTES = 10 * 1024 * 1024
RUN_TIMEOUT = 30
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

SCREEN_MAX_EDGE = 1568
SCREEN_TIMEOUT = 15


def set_workspace_root(path: str) -> str:
    global WORKSPACE_ROOT
    full = os.path.abspath(os.path.expanduser(path.strip()))
    if not os.path.isdir(full):
        return f"[root unchanged: no directory at '{path}']"
    WORKSPACE_ROOT = full
    return f"[workspace root → {full}]"


def usable_root(path):
    want = (path or "").strip()
    if not want:
        return None, None
    if os.path.isdir(want):
        return want, None
    fallback = DEFAULT_WORKSPACE_ROOT if os.path.isdir(DEFAULT_WORKSPACE_ROOT) else SUITE_ROOT
    return fallback, f"[root missing: {want} — falling back to {fallback}]"


def _resolve(path: str) -> str:
    if os.path.isabs(path):
        return os.path.abspath(os.path.expanduser(path))
    base = _track_root.get() or WORKSPACE_ROOT
    return os.path.abspath(os.path.join(base, os.path.expanduser(path)))


def is_outside_root(full: str) -> bool:
    base = _track_root.get() or WORKSPACE_ROOT
    return not (full == base or full.startswith(base + os.sep))


def read_file(path: str) -> str:
    full = _resolve(path)
    if not os.path.isfile(full):
        return f"[READ failed: no file at '{path}']"
    mime, _ = mimetypes.guess_type(full)
    if mime and mime.startswith("image/"):
        return (f"[READ failed: '{path}' is a binary image ({mime}). "
                f"Use VIEW_IMAGE: {path} to have the model see it.]")
    with open(full, "r", encoding="utf-8", errors="replace") as f:
        body = f.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        body = body[:MAX_BYTES] + f"\n[...truncated at {MAX_BYTES} bytes]"
    return body


BACKUP_KEEP = 3


def _prune_backups(backup_dir: str, filename: str, keep: int = BACKUP_KEEP) -> None:
    pat = re.compile(re.escape(filename) + r"\.\d{8}-\d{6}-\d{6}(-\d+)?$")
    try:
        names = sorted(n for n in os.listdir(backup_dir) if pat.match(n))
    except OSError:
        return
    for stale in names[:-keep]:
        try:
            os.remove(os.path.join(backup_dir, stale))
        except OSError:
            pass


def write_file(path: str, content: str) -> str:
    full = _resolve(path)
    if os.path.isdir(full):
        return f"[WRITE refused: '{path}' is a directory]"
    parent = os.path.dirname(full)
    if parent and not os.path.isdir(parent):
        return (f"[WRITE failed: parent directory does not exist:\n  {parent}\n"
                f"Relative paths resolve against your workspace root. Check the path, "
                f"or run_command 'mkdir -p' first if you really mean to create it.]")

    backup_note = ""
    if os.path.isfile(full):
        filename = os.path.basename(full)
        backup_dir = os.path.join(parent, ".backups")
        try:
            os.makedirs(backup_dir, exist_ok=True)
            now = time.time()
            stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + \
                f"-{int((now % 1) * 1_000_000):06d}"
            backup_path = os.path.join(backup_dir, f"{filename}.{stamp}")
            bump = 0
            while os.path.exists(backup_path):
                bump += 1
                backup_path = os.path.join(backup_dir, f"{filename}.{stamp}-{bump}")
            shutil.copy2(full, backup_path)
            _prune_backups(backup_dir, filename)
        except OSError as e:
            backup_note = f" [backup failed: {e}]"

    try:
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
    except OSError as e:
        return f"[WRITE failed: {e}]"
    return f"[WRITE ok: {len(content)} chars → {path}]{backup_note}"


def file_exists(path: str) -> bool:
    return os.path.isfile(_resolve(path))


def delete_file(path: str) -> str:
    full = _resolve(path)
    if not os.path.isfile(full):
        return f"[DELETE failed: no file at '{path}']"
    os.remove(full)
    return f"[DELETE ok: {path}]"


def view_image(path: str):
    full = _resolve(path)
    if not os.path.isfile(full):
        return f"[VIEW_IMAGE failed: no file at '{path}']", []
    with open(full, "rb") as f:
        raw = f.read(MAX_IMG_BYTES + 1)
    if len(raw) > MAX_IMG_BYTES:
        return (f"[VIEW_IMAGE refused: '{path}' exceeds "
                f"{MAX_IMG_BYTES // (1024 * 1024)}MB cap]", [])
    mime, _ = mimetypes.guess_type(full)
    if not mime or not mime.startswith("image/"):
        mime = "image/jpeg"
    data_b64 = base64.b64encode(raw).decode("ascii")
    media = [{"kind": "image", "mime": mime, "data_b64": data_b64}]
    return f"[VIEW_IMAGE ok: {path}  ({len(raw)} bytes, {mime})]", media


def screen_capture(display: int = 1, region: str = ""):
    if sys.platform != "darwin":
        return ("[SCREEN_CAPTURE refused: screen capture is macOS-only "
                f"(platform is {sys.platform!r})]", [])

    cmd = ["screencapture", "-x"]
    if region:
        parts = [p.strip() for p in str(region).split(",")]
        if len(parts) != 4 or not all(p.lstrip("-").isdigit() for p in parts):
            return (f"[SCREEN_CAPTURE refused: region must be 'x,y,w,h' "
                    f"(got {region!r})]", [])
        cmd += ["-R", ",".join(parts)]
        what = f"region {','.join(parts)}"
    else:
        try:
            display = int(display)
        except (TypeError, ValueError):
            return (f"[SCREEN_CAPTURE refused: display must be a number "
                    f"(got {display!r})]", [])
        if display < 1:
            return (f"[SCREEN_CAPTURE refused: display is 1-based "
                    f"(got {display})]", [])
        cmd += ["-D", str(display)]
        what = f"display {display}"

    tmp = tempfile.NamedTemporaryFile(prefix="screen-", suffix=".png", delete=False)
    tmp.close()
    try:
        cmd.append(tmp.name)
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True,
                                  timeout=SCREEN_TIMEOUT)
        except subprocess.TimeoutExpired:
            return (f"[SCREEN_CAPTURE failed: screencapture timed out after "
                    f"{SCREEN_TIMEOUT}s]", [])
        except FileNotFoundError:
            return "[SCREEN_CAPTURE failed: `screencapture` not found on PATH]", []

        if proc.returncode != 0 or not os.path.getsize(tmp.name):
            err = (proc.stderr or proc.stdout or "").strip()
            return (f"[SCREEN_CAPTURE failed: could not capture {what}"
                    f"{' — ' + err if err else ''}. If this is a display number, "
                    f"try 1 (the main display).]", [])

        try:
            from PIL import Image
        except ImportError:
            return ("[SCREEN_CAPTURE failed: Pillow is not installed "
                    "(pip install Pillow)]", [])

        try:
            with Image.open(tmp.name) as img:
                img = img.convert("RGB")
                w, h = img.size
                scale = min(1.0, SCREEN_MAX_EDGE / max(w, h))
                if scale < 1.0:
                    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                                     Image.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="PNG", optimize=True)
        except Exception as exc:
            return f"[SCREEN_CAPTURE failed: could not encode image — {exc}]", []
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    raw = buf.getvalue()
    if len(raw) > MAX_IMG_BYTES:
        return (f"[SCREEN_CAPTURE refused: encoded image exceeds "
                f"{MAX_IMG_BYTES // (1024 * 1024)}MB cap]", [])
    data_b64 = base64.b64encode(raw).decode("ascii")
    media = [{"kind": "image", "mime": "image/png", "data_b64": data_b64}]
    scaled = f"{w}x{h}" if scale >= 1.0 else f"{w}x{h} downscaled to {img.size[0]}x{img.size[1]}"
    return f"[SCREEN_CAPTURE ok: {what}  ({scaled}, {len(raw)} bytes)]", media


def _hidden(name: str) -> bool:
    return name.startswith(".") or name == "__pycache__"


def _entry(child: str, label: str, show_size: bool) -> str:
    if os.path.isdir(child):
        return f"{label}/"
    if show_size:
        return f"{label}  ({os.path.getsize(child)} bytes)"
    return label


def list_files(path: str = ".", *, recursive: bool = False,
               show_size: bool = True, show_hidden: bool = False) -> str:
    full = _resolve(path)
    if not os.path.isdir(full):
        return f"[LIST failed: no directory at '{path}']"
    header = path if path not in ("", ".") else "."

    entries = []
    if recursive:
        for root, dirs, files in os.walk(full):
            if not show_hidden:
                dirs[:] = [d for d in dirs if not _hidden(d)]
            for name in dirs + files:
                if not show_hidden and _hidden(name):
                    continue
                child = os.path.join(root, name)
                entries.append(_entry(child, os.path.relpath(child, full), show_size))
        entries.sort()
    else:
        for name in sorted(os.listdir(full)):
            if not show_hidden and _hidden(name):
                continue
            child = os.path.join(full, name)
            entries.append(_entry(child, name, show_size))

    if not entries:
        return f"[empty directory: '{header}']"
    return f"{header}:\n" + "\n".join(entries)


def list_dir(path: str = ".", *, show_hidden: bool = False) -> dict:
    full = _resolve(path)
    if not os.path.isdir(full):
        return {"error": f"no directory at '{path}'", "path": full}
    entries = []
    for name in sorted(os.listdir(full)):
        if not show_hidden and _hidden(name):
            continue
        child = os.path.join(full, name)
        entries.append({"name": name, "path": child, "isDir": os.path.isdir(child)})
    entries.sort(key=lambda e: (not e["isDir"], e["name"].lower()))
    return {
        "root": _track_root.get() or WORKSPACE_ROOT,
        "path": full,
        "parent": os.path.dirname(full) if full != os.path.dirname(full) else None,
        "outside": is_outside_root(full),
        "entries": entries,
    }


def run_command(command: str, on_output=None) -> str:
    if not command.strip():
        return "[RUN refused: empty command]"

    if on_output is None:
        try:
            proc = subprocess.run(
                command, shell=True, cwd=(_track_root.get() or WORKSPACE_ROOT),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, errors="replace",
                timeout=RUN_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return f"[RUN timed out after {RUN_TIMEOUT}s: {command!r}]"
        out = proc.stdout or ""
        if len(out) > MAX_BYTES:
            out = out[:MAX_BYTES] + f"\n[...truncated at {MAX_BYTES} bytes]"
        if not out:
            return f"[exit {proc.returncode}, no output]"
        return f"[exit {proc.returncode}]\n{out}"

    master, slave = pty.openpty()
    try:
        proc = subprocess.Popen(
            command, shell=True, cwd=(_track_root.get() or WORKSPACE_ROOT),
            stdin=slave, stdout=slave, stderr=slave,
            close_fds=True,
        )
    except OSError as e:
        os.close(master)
        os.close(slave)
        return f"[RUN failed to start: {e}]"
    os.close(slave)

    buf = []
    deadline = time.monotonic() + RUN_TIMEOUT
    timed_out = False
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                proc.kill()
                timed_out = True
                break
            rlist, _, _ = select.select([master], [], [], remaining)
            if not rlist:
                proc.kill()
                timed_out = True
                break
            try:
                chunk = os.read(master, 4096)
            except OSError:
                break
            if not chunk:
                break
            text = chunk.decode("utf-8", errors="replace")
            on_output(text)
            buf.append(text)
    finally:
        proc.wait()
        try:
            os.close(master)
        except OSError:
            pass

    suffix = f"\n[...timed out after {RUN_TIMEOUT}s]" if timed_out else ""
    raw = "".join(buf) + suffix
    clean = ANSI_ESCAPE.sub("", raw)
    if len(clean) > MAX_BYTES:
        clean = clean[:MAX_BYTES] + f"\n[...truncated at {MAX_BYTES} bytes]"
    if not clean.strip() and not timed_out:
        return f"[exit {proc.returncode}, no output]"
    return f"[exit {proc.returncode}]\n{clean}"


def fetch_url(url: str, timeout: int = 10) -> str:
    scheme = url.split("://", 1)[0].lower() if "://" in url else ""
    if scheme not in ("http", "https"):
        return "[fetch_url refused: only http/https allowed]"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LLMSandbox/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(MAX_BYTES + 1).decode("utf-8", errors="replace")
        raw = re.sub(r"<(script|style)[^>]*>.*?</(script|style)>", "", raw,
                     flags=re.DOTALL | re.IGNORECASE)
        raw = re.sub(r"<[^>]+>", "", raw)
        raw = html.unescape(raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw).strip()
        if len(raw) > MAX_BYTES:
            raw = raw[:MAX_BYTES] + f"\n[...truncated at {MAX_BYTES} bytes]"
        return raw or "[fetch_url: empty response]"
    except Exception as e:
        return f"[fetch_url failed: {e}]"


def recall_memory(memories_dir: str, query: str, *, context: int = 1) -> str:
    query = (query or "").strip()
    if not query:
        return "[RECALL refused: empty query]"
    if not memories_dir or not os.path.isdir(memories_dir):
        return "[RECALL failed: no memory store for this identity]"

    needle = query.lower()
    hits = []
    for root, dirs, files in os.walk(memories_dir):
        dirs[:] = sorted(d for d in dirs if not _hidden(d))
        for name in sorted(files):
            if not name.endswith(".md"):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, memories_dir)
            try:
                with open(full, encoding="utf-8", errors="replace") as fh:
                    lines = fh.read().splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines):
                if needle in line.lower():
                    lo, hi = max(0, i - context), min(len(lines), i + context + 1)
                    hits.append(f"{rel}:{i + 1}\n" + "\n".join(lines[lo:hi]))

    if not hits:
        return f"[RECALL: no matches for {query!r}]"
    body = "\n\n".join(hits)
    if len(body) > MAX_BYTES:
        body = body[:MAX_BYTES] + f"\n[...truncated at {MAX_BYTES} bytes]"
    return f"[RECALL: {len(hits)} match(es) for {query!r}]\n\n{body}"


def send_message(sender: str, receivers, body: str) -> str:
    if _is_muted(sender):
        return MUTED_LINE
    receivers = list(receivers)
    _line, undelivered = waypoint.append_message(sender, receivers, body)
    note = _room_note(sender, receivers)
    if not undelivered:
        return f"[sent to {', '.join(receivers)}]" + note
    dead = {u["to"] for u in undelivered}
    landed = [r for r in receivers if r not in dead]
    out = []
    if landed:
        out.append(f"[sent to {', '.join(landed)}]")
    for u in undelivered:
        if u["why"] == "unknown":
            why = "no live track goes by that name — use the EXACT id from YOUR PEERS"
        elif u["why"] == "muted":
            why = "muted, do not try again"
        else:
            why = "that region was closed; its cache is gone"
        out.append(f"[NOT DELIVERED to {u['to']}: {why}]")
    return "\n".join(out) + note


def request_messages(caller: str, since_id=None) -> str:
    if _is_muted(caller):
        return MUTED_LINE
    path = waypoint.store_for(caller).path
    if not os.path.exists(path):
        return "[no messages]"

    lines = {}
    order = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except Exception:
                continue
            oid = obj.get("id")
            if oid is None:
                continue
            lines[oid] = obj
            order.append(oid)

    def _self_carrying_readable(obj):
        return caller == obj.get("from") or caller in (obj.get("to") or [])

    rows = []
    for oid in order:
        if since_id is not None and oid <= since_id:
            continue
        obj = lines[oid]
        kind = obj.get("kind")
        if kind == "message":
            if not _self_carrying_readable(obj):
                continue
            to = ", ".join(obj.get("to") or [])
            rows.append(f"#{oid} message {obj.get('from')}→{to}: {obj.get('body')}")
        elif kind == "receipt" and obj.get("receipt") == "denied":
            if not _self_carrying_readable(obj):
                continue
            to = ", ".join(obj.get("to") or [])
            rows.append(f"#{oid} receipt denied {obj.get('from')}→{to}")
        elif kind == "receipt":
            ref_line = lines.get(obj.get("ref"))
            if ref_line is None or not _self_carrying_readable(ref_line):
                continue
            rows.append(f"#{oid} receipt {obj.get('receipt')} ref=#{obj.get('ref')} "
                        f"actor={obj.get('actor')}")

    body = "\n".join(rows) if rows else "[no messages]"
    if len(body) > MAX_BYTES:
        body = body[:MAX_BYTES] + f"\n[...truncated at {MAX_BYTES} bytes]"
    return body


_room_reporter = None


def set_room_reporter(fn):
    global _room_reporter
    _room_reporter = fn


def _room_note(sender, receivers):
    if _room_reporter is None:
        return ""
    try:
        return _room_reporter(sender, receivers) or ""
    except Exception:
        return ""


_mute_prober = None
MUTED_LINE = "[Waypoint unavailable, see The Captain]"


def set_mute_prober(fn):
    global _mute_prober
    _mute_prober = fn


def _is_muted(ident):
    if _mute_prober is None:
        return False
    try:
        return bool(_mute_prober(ident))
    except Exception:
        return False


_initiator = None


def set_initiator(fn):
    global _initiator
    _initiator = fn


def initiate(caller: str) -> str:
    if _initiator is None:
        return "[initiate: nothing to start]"
    started = _initiator(caller) or []
    if not started:
        return "[initiate: nothing to start]"
    return "[initiated: " + ", ".join(started) + "]"


_resetter = None


def set_resetter(fn):
    global _resetter
    _resetter = fn


def reset_self(caller: str) -> str:
    if _resetter is None or not caller:
        return "[reset: nothing to reset]"
    try:
        return _resetter(None, caller) or "[reset: nothing to reset]"
    except Exception as e:
        return f"[reset failed: {e}]"


def reset_region(caller: str, target: str) -> str:
    target = (target or "").strip()
    if not target:
        return "[reset: no region named]"
    if _resetter is None:
        return "[reset: nothing to reset]"
    try:
        return _resetter(target, caller) or "[reset: nothing to reset]"
    except Exception as e:
        return f"[reset failed: {e}]"


_MARKER_KEYWORDS = ()
_attempted_marker = None


# marker keywords: pushed in by engine.tools at import, the only source
def set_marker_keywords(words):
    global _MARKER_KEYWORDS, _attempted_marker
    _MARKER_KEYWORDS = tuple(words)
    alternation = "|".join(sorted(_MARKER_KEYWORDS, key=len, reverse=True))
    _attempted_marker = (re.compile(r"^[ \t]*(" + alternation + r"):", re.MULTILINE)
                         if alternation else None)


_FENCED_MARKERS = ("WRITE", "SEND", "REMEMBER")


def detect_malformed(reply: str):
    if _attempted_marker is None:
        return None
    m = _attempted_marker.search(reply)
    return m.group(1) if m else None


def malformed_hint(keyword: str) -> str:
    if keyword == "SEND":
        shape = ("SEND: <receiver>[, <receiver>]\n"
                 "---BEGIN---\n<message body>\n---END---")
    elif keyword == "WRITE":
        shape = "WRITE: <relative/path>\n---BEGIN---\n<content>\n---END---"
    elif keyword == "REMEMBER":
        shape = ("REMEMBER: <title>\nCARRY: <distilled essence>\n"
                 "PIN: <where or none>\nBODY: <the memory>")
    else:
        shape = f"{keyword}: <argument>"
    extra = ""
    if keyword in _FENCED_MARKERS and keyword != "REMEMBER":
        extra = ("\nBoth ---BEGIN--- and ---END--- must be present, each alone "
                 "on its own line, starting at the left margin.")
    return (f"[{keyword} not performed: the {keyword} block was malformed, so no "
            f"tool ran and nothing happened. Nothing was sent, written, or read. "
            f"Emit it again in exactly this shape:\n\n{shape}{extra}]")


def result_text(messages: list, label: str, result: str, media=None):
    msg = {"role": "user", "content": f"[{label} result]\n{result}"}
    if media:
        msg["media"] = media
    messages.append(msg)


def result_native(messages: list, label: str, result: str, media=None):
    msg = {"role": "tool", "content": f"[{label} result]\n{result}"}
    if media:
        msg["media"] = media
    messages.append(msg)
