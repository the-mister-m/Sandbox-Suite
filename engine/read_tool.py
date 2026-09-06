
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
    path = waypoint.default.path
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


READ_MARKER = re.compile(r"^\s*READ:\s*(.+?)\s*$", re.MULTILINE)
LIST_MARKER = re.compile(r"^\s*LIST:\s*(.*?)\s*$", re.MULTILINE)
RUN_MARKER = re.compile(r"^\s*RUN:\s*(.+?)\s*$", re.MULTILINE)
VIEW_IMAGE_MARKER = re.compile(r"^\s*VIEW_IMAGE:\s*(.+?)\s*$", re.MULTILINE)
SCREEN_CAPTURE_MARKER = re.compile(r"^\s*SCREEN_CAPTURE:?\s*(.*?)\s*$", re.MULTILINE)
FETCH_MARKER = re.compile(r"^\s*FETCH:\s*(.+?)\s*$", re.MULTILINE)
RECALL_MARKER = re.compile(r"^\s*RECALL:\s*(.+?)\s*$", re.MULTILINE)
REQUEST_MARKER = re.compile(r"^\s*REQUEST:?\s*(.*?)\s*$", re.MULTILINE)
LOGIC_STATUS_MARKER = re.compile(r"^\s*LOGIC_STATUS\s*$", re.MULTILINE)
LOGIC_OPEN_MARKER = re.compile(r"^\s*LOGIC_OPEN:\s*(.*?)\s*$", re.MULTILINE)
LOGIC_TRANSPORT_MARKER = re.compile(r"^\s*LOGIC_TRANSPORT:\s*(.+?)\s*$", re.MULTILINE)
LOGIC_COMMAND_MARKER = re.compile(r"^\s*LOGIC_COMMAND:\s*(.+?)\s*$", re.MULTILINE)
WEB_OPEN_MARKER = re.compile(r"^\s*WEB_OPEN:\s*(.+?)\s*$", re.MULTILINE)
WEB_READ_MARKER = re.compile(r"^\s*WEB_READ\s*$", re.MULTILINE)
WEB_SCREENSHOT_MARKER = re.compile(r"^\s*WEB_SCREENSHOT\s*$", re.MULTILINE)
WEB_ACT_MARKER = re.compile(r"^\s*WEB_ACT:\s*(.+?)\s*$", re.MULTILINE)
WEB_EVAL_MARKER = re.compile(r"^\s*WEB_EVAL:\s*(.+?)\s*$", re.MULTILINE)
INITIATE_MARKER = re.compile(r"^\s*INITIATE\s*$", re.MULTILINE)
RESET_REGION_MARKER = re.compile(r"^\s*RESET_REGION:\s*(.+?)\s*$", re.MULTILINE)
RESET_SELF_MARKER = re.compile(r"^\s*RESET_SELF\s*$", re.MULTILINE)
WRITE_MARKER = re.compile(
    r"^[ \t]*WRITE:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*---BEGIN---[ \t]*\r?\n"
    r"(.*?)"
    r"^[ \t]*---END---[ \t]*$",
    re.MULTILINE | re.DOTALL,
)
SEND_MARKER = re.compile(
    r"^[ \t]*SEND:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*---BEGIN---[ \t]*\r?\n"
    r"(.*?)"
    r"^[ \t]*---END---[ \t]*$",
    re.MULTILINE | re.DOTALL,
)
REMEMBER_MARKER = re.compile(
    r"^[ \t]*REMEMBER:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*CARRY:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*PIN:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*BODY:[ \t]*(.*)",
    re.MULTILINE | re.DOTALL,
)

_BASE_HINT = (
    "You can read, list, and write files in the project.\n\n"
    "To READ, output a line:\n"
    "    READ: <relative/path>\n\n"
    "To LIST a directory, output a line:\n"
    "    LIST: <relative/path>   (omit the path to list the project root)\n\n"
    "To WRITE, output:\n"
    "    WRITE: <relative/path>\n"
    "    ---BEGIN---\n"
    "    <full file contents>\n"
    "    ---END---\n\n"
    "To SEND a message to one or more other agents, output:\n"
    "    SEND: <peer1>[, <peer2>...]\n"
    "    (prefer the EXACT id from YOUR PEERS — guaranteed to land; a unique name "
    "or seat of a live peer also resolves)\n"
    "    ---BEGIN---\n"
    "    <message body>\n"
    "    ---END---\n\n"
    "To READ your own messages from other agents, output a line:\n"
    "    REQUEST: <since_id, optional — omit to see everything you're on>\n"
    "    (you only see lines you sent, received, or were denied on — a human "
    "approves before it runs)\n\n"
    "To keep a personal memory, output:\n"
    "    REMEMBER: <a few words>\n"
    "    CARRY: <the essence, 20-50% of the body, standalone prose>\n"
    "    PIN: <user|agent|none>\n"
    "    BODY: <the memory in full — write long and reflective, length is not a concern>\n\n"
    "  PIN 'user' = the Captain asked you to remember this (carry goes to usermemory.md)\n"
    "  PIN 'agent' = your own choice to carry it up front (carry goes to agentmemory.md)\n"
    "  PIN 'none' = your own choice, keep it in the store only (no carry pointer)\n"
    "  BODY always goes to your long-form memory store regardless of PIN.\n\n"
    "To search your own memory store, output a line:\n"
    "    RECALL: <query>\n\n"
    "To RUN a shell command, output a line:\n"
    "    RUN: <shell command>\n\n"
    "To VIEW an image file and have the model see its pixels, output a line:\n"
    "    VIEW_IMAGE: <relative/path>\n\n"
    "To SEE THE HUMAN'S SCREEN (their actual monitor, not a file), output a line:\n"
    "    SCREEN_CAPTURE: <display number, or x,y,w,h for a region>   "
    "(omit the argument for the main display — a human approves every capture)\n\n"
    "To FETCH a URL and get the page as plain text, output a line:\n"
    "    FETCH: <url>   (http:// or https:// only — a human approves before it runs)\n\n"
    "To check on Logic Pro (installed? running? frontmost window?), output a line:\n"
    "    LOGIC_STATUS\n\n"
    "To open Logic Pro, or a .logicx project, output a line:\n"
    "    LOGIC_OPEN: <path, or leave blank to just launch Logic Pro>\n\n"
    "To send a transport command to Logic Pro, output a line:\n"
    "    LOGIC_TRANSPORT: <play|stop|record>   (assumes Logic's default key commands)\n\n"
    "To click a Logic Pro menu item, output a line:\n"
    "    LOGIC_COMMAND: <Menu>Item[>SubItem]>   (e.g. File>Save — a human approves before it runs)\n\n"
    "To open a URL in the browser channel, output a line:\n"
    "    WEB_OPEN: <url>   (http:// or https:// — a human approves before it runs)\n\n"
    "To read the current page's visible text, output a line:\n"
    "    WEB_READ\n\n"
    "To take a screenshot of the current page, output a line:\n"
    "    WEB_SCREENSHOT\n\n"
    "To click or type into the current page, output a line:\n"
    "    WEB_ACT: <css selector> | click|type | <text, only if typing>   "
    "(a human approves before it runs)\n\n"
    "To run JavaScript in the current page and get its return value, output a line:\n"
    "    WEB_EVAL: <javascript expression, one line>   (a human approves before it runs)\n\n"
    "To START THE NEXT NODE after you, output a line on its own:\n"
    "    INITIATE\n"
    "    (no argument — the cable a human drew already says which node follows "
    "you, and if nothing follows you this does nothing)\n\n"    "To RESET YOUR OWN REGION — same track, same settings, clean context, no "
    "memory of this run — output a line on its own:\n"
    "    RESET_SELF\n"
    "    (no argument. Your transcript and your cache are thrown away and you "
    "come back as the agent you were authored as. A human approves it, and the "
    "track has to allow it at all.)\n\n"
    "To RESET ANOTHER REGION the same way, output a line:\n"
    "    RESET_REGION: <peer>\n"
    "    (prefer the EXACT id from YOUR PEERS; a unique name or seat of a live "
    "peer also resolves. That peer's own track has to allow being reset, and a "
    "human approves it.)\n\n"
    "Emit a tool block only when you actually want to act. After a tool runs "
    "you'll be shown the result and may act again or give your final answer. A "
    "human approves every write and command before it happens.\n\n"
    "You work inside a WORKSPACE directory. Relative paths resolve there; prefer "
    "relative paths and stay inside the workspace. Accessing a path OUTSIDE the "
    "workspace (absolute paths elsewhere) requires the human's explicit approval "
    "each time and may be refused — don't reach outside unless asked to."
)

TEXT_SYSTEM_HINT = _BASE_HINT

TEXT_WORKER_HINT = _BASE_HINT


def detect_text(reply: str):
    w = WRITE_MARKER.search(reply)
    if w:
        return ("write_file", {"path": w.group(1), "content": w.group(2)})
    sm = SEND_MARKER.search(reply)
    if sm:
        receivers = [r.strip() for r in sm.group(1).split(",") if r.strip()]
        return ("send_message", {"receivers": receivers, "body": sm.group(2)})
    rm = REMEMBER_MARKER.search(reply)
    if rm:
        return ("remember", {"title": rm.group(1), "carry": rm.group(2),
                              "pin": rm.group(3), "body": rm.group(4)})
    x = RUN_MARKER.search(reply)
    if x:
        return ("run_command", {"command": x.group(1)})
    vi = VIEW_IMAGE_MARKER.search(reply)
    if vi:
        return ("view_image", {"path": vi.group(1)})
    sc = SCREEN_CAPTURE_MARKER.search(reply)
    if sc:
        arg = sc.group(1)
        if "," in arg:
            return ("screen_capture", {"region": arg})
        return ("screen_capture", {"display": arg or 1})
    f = FETCH_MARKER.search(reply)
    if f:
        return ("fetch_url", {"url": f.group(1)})
    rc = RECALL_MARKER.search(reply)
    if rc:
        return ("recall", {"query": rc.group(1)})
    lst = LOGIC_STATUS_MARKER.search(reply)
    if lst:
        return ("logic_status", {})
    lo = LOGIC_OPEN_MARKER.search(reply)
    if lo:
        return ("logic_open", {"path": lo.group(1)})
    ltr = LOGIC_TRANSPORT_MARKER.search(reply)
    if ltr:
        return ("logic_transport", {"action": ltr.group(1)})
    lc = LOGIC_COMMAND_MARKER.search(reply)
    if lc:
        return ("logic_command", {"command": lc.group(1)})
    bo = WEB_OPEN_MARKER.search(reply)
    if bo:
        return ("web_open", {"url": bo.group(1)})
    br = WEB_READ_MARKER.search(reply)
    if br:
        return ("web_read", {})
    bs = WEB_SCREENSHOT_MARKER.search(reply)
    if bs:
        return ("web_screenshot", {})
    ba = WEB_ACT_MARKER.search(reply)
    if ba:
        parts = [p.strip() for p in ba.group(1).split("|")]
        selector = parts[0] if len(parts) > 0 else ""
        act = parts[1] if len(parts) > 1 else ""
        text = parts[2] if len(parts) > 2 else ""
        return ("web_act", {"selector": selector, "action": act, "text": text})
    be = WEB_EVAL_MARKER.search(reply)
    if be:
        return ("web_eval", {"js": be.group(1)})
    ini = INITIATE_MARKER.search(reply)
    if ini:
        return ("initiate", {})
    rr = RESET_REGION_MARKER.search(reply)
    if rr:
        return ("reset_region", {"region": rr.group(1)})
    rs = RESET_SELF_MARKER.search(reply)
    if rs:
        return ("reset_self", {})
    rq = REQUEST_MARKER.search(reply)
    if rq:
        arg = rq.group(1).strip()
        if not arg:
            return ("request_messages", {})
        return ("request_messages", {"since_id": int(arg) if arg.lstrip("-").isdigit() else arg})
    r = READ_MARKER.search(reply)
    if r:
        return ("read_file", {"path": r.group(1)})
    l = LIST_MARKER.search(reply)
    if l:
        return ("list_files", {"path": l.group(1) or "."})
    return None


ATTEMPTED_MARKER = re.compile(
    r"^[ \t]*(WRITE|SEND|REMEMBER|RUN|VIEW_IMAGE|SCREEN_CAPTURE|FETCH|RECALL"
    r"|LOGIC_OPEN|LOGIC_TRANSPORT|LOGIC_COMMAND|WEB_OPEN|WEB_ACT|WEB_EVAL"
    r"|RESET_REGION|REQUEST|READ|LIST):",
    re.MULTILINE,
)

_FENCED_MARKERS = ("WRITE", "SEND", "REMEMBER")


def detect_malformed(reply: str):
    m = ATTEMPTED_MARKER.search(reply)
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


NATIVE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a UTF-8 text file from the project directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file."},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List the files and subdirectories in a project directory. "
                           "Directories end with '/'; files show their byte size.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative directory path. Defaults to the project root."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write a UTF-8 text file in the project directory. "
                           "Overwrites if it exists. A human approves before it runs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file."},
                    "content": {"type": "string", "description": "Full file contents to write."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a shell command in the project directory and get its "
                           "combined stdout/stderr and exit code. A human approves "
                           "before it runs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to run."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "view_image",
            "description": (
                "Read an image file from the project directory and return its pixel "
                "data so you can see it. Supports JPEG, PNG, GIF, WebP, and other "
                "common formats. A human approves access outside the workspace root."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the image file.",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "screen_capture",
            "description": (
                "See the human's actual screen — their real monitor, with whatever "
                "they are looking at on it right now. This is NOT the headless web "
                "browser (that is web_screenshot) and NOT an image file (that is "
                "view_image). The human approves every single capture. "
                "The image is downscaled, so small text may be unreadable on a full "
                "display grab: capture the display first, then re-capture a region "
                "to zoom in on the part you need to read. "
                "Their screen may show private things — passwords, messages, keys. "
                "Only capture when the human's request actually needs it, describe "
                "what you need to see, and do not repeat a capture without a reason."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "display": {
                        "type": "integer",
                        "description": (
                            "Which display to capture, 1-based. 1 is the main display. "
                            "Ignored if 'region' is given."
                        ),
                    },
                    "region": {
                        "type": "string",
                        "description": (
                            "Optional 'x,y,w,h' rectangle in global screen coordinates. "
                            "Use to zoom in on part of a display you already captured."
                        ),
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": (
                "Fetch the text content of a URL over HTTP or HTTPS. "
                "HTML is stripped to plain text. A human approves before the request is sent."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch (http:// or https:// only).",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember",
            "description": "Keep a personal memory. The full body is always filed into "
                           "your own long-form memory store; carry is the distilled essence "
                           "that actually rides in your context, pinned per the pin argument.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "A few words naming the memory."},
                    "carry": {"type": "string",
                              "description": "The operative essence, 20-50% the length of body, "
                                             "standalone prose — not required to resemble the long "
                                             "form. This is what gets injected and drives your "
                                             "decisions later, so write it as the reason this "
                                             "memory sticks with you, not a topic label."},
                    "body":  {"type": "string",
                              "description": "The memory in full — write long and reflective; "
                                             "length is not a concern."},
                    "pin":   {"type": "string", "enum": ["user", "agent", "none"],
                              "description": "'user' = the Captain asked you to remember this "
                                             "(carry goes to usermemory.md). 'agent' = your own "
                                             "choice to carry it up front (carry goes to "
                                             "agentmemory.md). 'none' = your own choice, keep it "
                                             "in the store only (no carry pointer)."},
                },
                "required": ["title", "carry", "body", "pin"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recall",
            "description": "Search your own long-form memory store (your memories/ folder, "
                           "recursive) for a query string. Returns matching lines with their "
                           "file and a little surrounding context. Read-only — never gated.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Text to search for in your memory store."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_message",
            "description": "Send a message to one or more other agents (tracks). Who you "
                           "are is stamped automatically — you cannot claim to be someone "
                           "else. A human approves before it sends.",
            "parameters": {
                "type": "object",
                "properties": {
                    "receivers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "The peers to message. Prefer the EXACT id from "
                                       "YOUR PEERS (guaranteed to land); a unique name or "
                                       "seat of a live peer also resolves. An unknown or "
                                       "ambiguous label is dropped and never delivered.",
                    },
                    "body": {"type": "string", "description": "The message text."},
                },
                "required": ["receivers", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_messages",
            "description": "Read your own messages from other agents (tracks). You only "
                           "see lines you sent, received, or were denied on — never a "
                           "conversation you weren't part of. Who you are is stamped "
                           "automatically, same as send_message. A human approves before "
                           "it runs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "since_id": {
                        "type": "integer",
                        "description": "Only return lines newer than this id. Omit to see "
                                       "everything you're on.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "logic_status",
            "description": (
                "Check whether Logic Pro is installed and running, and read the "
                "frontmost window/project name if available via System Events. "
                "Never launches Logic Pro. Declared-grade: reports what UI "
                "scripting observed, not a verified guarantee of Logic's state."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "logic_open",
            "description": (
                "Open Logic Pro, or a .logicx project file when a path is given, "
                "via `open -a \"Logic Pro\"`. A human approves before it runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Optional path to a .logicx project. Omit to just launch Logic Pro.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "logic_transport",
            "description": (
                "Send a transport key command to Logic Pro (play, stop, or "
                "record) via System Events. Assumes Logic's default key "
                "commands — a rebound key command will do the wrong thing "
                "silently. Requires Logic Pro already running. A human "
                "approves before it runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "description": "One of: play, stop, record."},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "logic_command",
            "description": (
                "Click a Logic Pro menu item by a '>'-separated path (e.g. "
                "'File>Save') via System Events UI scripting. Brittle by "
                "design — Logic Pro has no AppleScript dictionary. Requires "
                "Logic Pro already running. A human approves before it runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Menu path, e.g. 'File>Save'."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_open",
            "description": (
                "Navigate the browser channel's headless Chrome tab to a URL. "
                "A human approves before it runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to open (http:// or https://)."},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_read",
            "description": (
                "Read the current page's visible text (innerText) from the browser "
                "channel. Reads whatever page web_open last navigated to."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_screenshot",
            "description": "Take a screenshot of the current page in the browser channel and return the image.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_act",
            "description": (
                "Click or type into an element on the current page via a CSS "
                "selector. A human approves before it runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS selector for the target element."},
                    "action": {"type": "string", "description": "One of: click, type."},
                    "text": {"type": "string", "description": "Text to type — only used when action is 'type'."},
                },
                "required": ["selector", "action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_eval",
            "description": (
                "Evaluate arbitrary JavaScript in the current page and return its "
                "value. Unbounded — the browser channel's run_command equivalent. "
                "A human approves before it runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "js": {"type": "string", "description": "JavaScript expression to evaluate."},
                },
                "required": ["js"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "initiate",
            "description": (
                "Start the next node after you. A human draws the map: a cable "
                "from your node to another one, marked 'initiate', means that "
                "node begins when you press this. You do not choose which node "
                "— the cable already decided, which is why this tool takes no "
                "arguments. If nothing follows you, it does nothing."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_self",
            "description": (
                "Reset your own region: same track, same settings, same name — "
                "but your transcript and your cache are thrown away and you come "
                "back as the agent you were authored as, with no memory of this "
                "run. Takes no arguments; it can only ever land on you. A human "
                "approves before it happens, and the track has to allow it at all."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_region",
            "description": (
                "Reset ANOTHER region the same way yours would be reset: it keeps "
                "its track, settings and name, and loses its transcript and its "
                "cache. That region's own track has to allow being reset, and a "
                "human approves before it happens."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {
                        "type": "string",
                        "description": "The region to reset. Prefer the EXACT id "
                                       "from YOUR PEERS (guaranteed to land); a "
                                       "unique name or seat of a live peer also "
                                       "resolves. An unknown or ambiguous label "
                                       "resets nothing.",
                    },
                },
                "required": ["region"],
            },
        },
    },
]


def detect_native(tool_calls):
    if not tool_calls:
        return None
    fn = tool_calls[0].get("function", {})
    name = fn.get("name")
    args = fn.get("arguments", {})
    if isinstance(args, str):
        args = json.loads(args)
    return (name, args) if name else None


def result_native(messages: list, label: str, result: str, media=None):
    msg = {"role": "tool", "content": f"[{label} result]\n{result}"}
    if media:
        msg["media"] = media
    messages.append(msg)
