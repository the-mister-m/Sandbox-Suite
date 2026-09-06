
import atexit
import json
import os
import subprocess
import tempfile
import time
import urllib.request

try:
    import websocket
except ImportError:
    websocket = None

EDGES = [
    {"name": "web_open",       "level": "check", "grade": "enforced"},
    {"name": "web_read",       "level": "read",  "grade": "enforced"},
    {"name": "web_screenshot", "level": "check", "grade": "enforced"},
    {"name": "web_act",        "level": "run",   "grade": "enforced"},
    {"name": "web_eval",       "level": "run",   "grade": "enforced"},
]

STUBS = ["receive", "render-a-gate"]

AUTH_NOTE = "none — local headless Chrome via CDP, dedicated port 9223 (never 9222)"

CDP_PORT = 9223
CHROME_PATHS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)
LAUNCH_TIMEOUT = 8
NAV_TIMEOUT = 10
EVAL_TIMEOUT = 8
SCREENSHOT_TIMEOUT = 10
MAX_TEXT_BYTES = 20_000

_proc = None
_ws = None
_msg_id = 0


def _next_id():
    global _msg_id
    _msg_id += 1
    return _msg_id


def _find_chrome():
    for p in CHROME_PATHS:
        if os.path.isfile(p):
            return p
    return None


def _chrome_alive():
    return _proc is not None and _proc.poll() is None


def _ws_alive():
    return _ws is not None and getattr(_ws, "connected", False)



def _launch_chrome():
    global _proc
    chrome = _find_chrome()
    if not chrome:
        return False, "[browse refused: Google Chrome not found at the expected path]"
    try:
        subprocess.run(["pkill", "-f", f"remote-debugging-port={CDP_PORT}"],
                        capture_output=True, timeout=5)
    except Exception:
        pass
    user_data_dir = tempfile.mkdtemp(prefix="cdp-browser-channel-")
    cmd = [
        chrome,
        "--headless=new",
        f"--remote-debugging-port={CDP_PORT}",
        "--remote-allow-origins=*",
        f"--user-data-dir={user_data_dir}",
        "about:blank",
    ]
    try:
        _proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as e:
        return False, f"[browse failed: could not launch Chrome — {e}]"
    deadline = time.time() + LAUNCH_TIMEOUT
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json", timeout=1)
            return True, "[browse: Chrome launched]"
        except Exception:
            time.sleep(0.3)
    return False, "[browse failed: Chrome did not open its CDP endpoint in time]"


def _open_ws():
    global _ws
    if websocket is None:
        return False, "[browse failed: websocket-client package not available]"
    try:
        targets = json.load(urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json", timeout=3))
        page = next((t for t in targets if t.get("type") == "page"), None)
        if not page:
            return False, "[browse failed: no page target found on the CDP endpoint]"
        _ws = websocket.create_connection(page["webSocketDebuggerUrl"], max_size=None, suppress_origin=True)
    except Exception as e:
        return False, f"[browse failed: could not open the CDP websocket — {e}]"
    try:
        _cdp_call("Runtime.enable")
        _cdp_call("Page.enable")
        _cdp_call("Log.enable")
    except Exception as e:
        return False, f"[browse failed: CDP handshake error — {e}]"
    return True, "[browse: CDP websocket connected]"


def _cdp_call(method, timeout=EVAL_TIMEOUT, **params):
    if not _ws_alive():
        raise RuntimeError("CDP websocket is not open")
    mid = _next_id()
    _ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    _ws.settimeout(timeout)
    while True:
        raw = _ws.recv()
        if not raw:
            continue
        msg = json.loads(raw)
        if msg.get("id") == mid:
            if "error" in msg:
                raise RuntimeError(msg["error"].get("message", "CDP error"))
            return msg.get("result", {})


def _ensure_connected():
    if _chrome_alive() and _ws_alive():
        return ""
    result = connect()
    if _chrome_alive() and _ws_alive():
        return ""
    return f"[browse refused: could not establish a browser connection — {result}]"



def web_open(url: str) -> str:
    err = _ensure_connected()
    if err:
        return err
    url = (url or "").strip()
    if not url:
        return "[web_open refused: empty url]"
    scheme = url.split(":", 1)[0].lower() if ":" in url else ""
    if scheme not in ("http", "https"):
        return f"[web_open refused: unsupported scheme {scheme!r} — http(s) only]"
    try:
        _cdp_call("Page.navigate", timeout=NAV_TIMEOUT, url=url)
    except Exception as e:
        return f"[web_open failed: {e}]"
    deadline = time.time() + NAV_TIMEOUT
    state = "unknown"
    while time.time() < deadline:
        try:
            res = _cdp_call("Runtime.evaluate", timeout=3,
                             expression="document.readyState", returnByValue=True)
            state = res.get("result", {}).get("value", "unknown")
            if state == "complete":
                break
        except Exception:
            pass
        time.sleep(0.3)
    try:
        res = _cdp_call("Runtime.evaluate", timeout=3,
                         expression="document.title", returnByValue=True)
        title = res.get("result", {}).get("value", "")
    except Exception:
        title = ""
    return f"[web_open ok: {url}  (readyState={state}, title={title!r})]"


def web_read() -> str:
    err = _ensure_connected()
    if err:
        return err
    try:
        res = _cdp_call(
            "Runtime.evaluate", timeout=EVAL_TIMEOUT,
            expression="document.body ? document.body.innerText : document.documentElement.outerHTML",
            returnByValue=True,
        )
    except Exception as e:
        return f"[web_read failed: {e}]"
    if res.get("exceptionDetails"):
        return f"[web_read failed: {res['exceptionDetails'].get('text', 'JS exception')}]"
    text = res.get("result", {}).get("value")
    if text is None:
        return "[web_read: page has no readable body text]"
    text = str(text).strip()
    if len(text) > MAX_TEXT_BYTES:
        text = text[:MAX_TEXT_BYTES] + f"\n[...truncated at {MAX_TEXT_BYTES} bytes]"
    return text or "[web_read: empty page text]"


def web_screenshot():
    err = _ensure_connected()
    if err:
        return err, []
    try:
        res = _cdp_call("Page.captureScreenshot", timeout=SCREENSHOT_TIMEOUT, format="png")
    except Exception as e:
        return f"[web_screenshot failed: {e}]", []
    data_b64 = res.get("data")
    if not data_b64:
        return "[web_screenshot failed: no image data returned]", []
    media = [{"kind": "image", "mime": "image/png", "data_b64": data_b64}]
    return f"[web_screenshot ok: {len(data_b64)} b64 chars]", media


def web_act(selector: str, action: str, text: str = "") -> str:
    err = _ensure_connected()
    if err:
        return err
    action = (action or "").strip().lower()
    if action not in ("click", "type"):
        return f"[web_act refused: unknown action {action!r} — expected 'click' or 'type']"
    if not selector or not isinstance(selector, str):
        return "[web_act refused: empty selector]"
    sel_js = json.dumps(selector)
    if action == "click":
        expr = (f"(() => {{ const el = document.querySelector({sel_js}); "
                 f"if (!el) return 'no-match'; el.click(); return 'clicked'; }})()")
    else:
        text_js = json.dumps(text or "")
        expr = (f"(() => {{ const el = document.querySelector({sel_js}); "
                 f"if (!el) return 'no-match'; el.focus(); el.value = {text_js}; "
                 f"el.dispatchEvent(new Event('input', {{bubbles: true}})); "
                 f"el.dispatchEvent(new Event('change', {{bubbles: true}})); return 'typed'; }})()")
    try:
        res = _cdp_call("Runtime.evaluate", timeout=EVAL_TIMEOUT, expression=expr, returnByValue=True)
    except Exception as e:
        return f"[web_act failed: {e}]"
    if res.get("exceptionDetails"):
        return f"[web_act failed: {res['exceptionDetails'].get('text', 'JS exception')}]"
    value = res.get("result", {}).get("value")
    if value == "no-match":
        return f"[web_act failed: no element matched selector {selector!r}]"
    return f"[web_act ok: {action} on {selector!r}]"


def web_eval(js: str) -> str:
    err = _ensure_connected()
    if err:
        return err
    if not js or not isinstance(js, str):
        return "[web_eval refused: empty expression]"
    try:
        res = _cdp_call("Runtime.evaluate", timeout=EVAL_TIMEOUT, expression=js, returnByValue=True)
    except Exception as e:
        return f"[web_eval failed: {e}]"
    if res.get("exceptionDetails"):
        return f"[web_eval failed: {res['exceptionDetails'].get('text', 'JS exception')}]"
    result = res.get("result", {})
    value = result["value"] if "value" in result else result.get("description", "undefined")
    return str(value)



def connect() -> str:
    global _proc, _ws
    if _chrome_alive() and _ws_alive():
        return f"[browse: already connected — Chrome pid {_proc.pid}, port {CDP_PORT}]"
    if _chrome_alive() and not _ws_alive():
        ok, msg = _open_ws()
        return msg
    ok, msg = _launch_chrome()
    if not ok:
        return msg
    ok2, msg2 = _open_ws()
    if not ok2:
        return msg2
    return "[browse connect: Chrome launched (headless, port 9223) and CDP websocket open]"


def disconnect() -> str:
    global _proc, _ws
    try:
        if _ws is not None:
            _ws.close()
    except Exception:
        pass
    _ws = None
    try:
        subprocess.run(["pkill", "-f", f"remote-debugging-port={CDP_PORT}"],
                        capture_output=True, timeout=5)
    except Exception:
        pass
    _proc = None
    return f"[browse disconnect: Chrome (port {CDP_PORT}) killed, websocket closed]"


def capabilities() -> list:
    return list(EDGES)


def receive() -> str:
    return "[browser receive: not implemented — declared stub, no inbound event source]"


def render_a_gate(gate: dict = None) -> str:
    return "not-renderable"


def _state() -> str:
    if _proc is None:
        return "[browser state: not connected — no Chrome process]"
    code = _proc.poll()
    if code is not None:
        return f"[browser state: Chrome process exited (code {code})]"
    if not _ws_alive():
        return f"[browser state: Chrome running (pid {_proc.pid}), CDP websocket not open]"
    return f"[browser state: connected — Chrome pid {_proc.pid}, ws open, port {CDP_PORT}]"


atexit.register(disconnect)


from engine import channel_registry

channel_registry.register("webbrowser", {
    "edges": EDGES,
    "auth": AUTH_NOTE,
    "state": _state,
    "stubs": STUBS,
})
