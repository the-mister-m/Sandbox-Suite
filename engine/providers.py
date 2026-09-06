
import os
import re
import json
import time
import uuid
import base64
import subprocess
import shutil
import tempfile
import glob
import atexit
import select
import shlex
import threading
import queue

from engine.ollama_provider import OllamaProvider
from engine import SUITE_ROOT
from engine import settings as st


def _load_dotenv():
    path = os.path.join(SUITE_ROOT, ".env")
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

_load_dotenv()

AUDIO_TARGET_SR = 16000

def normalize_audio(raw: bytes, mime: str | None = None, target_sr: int = AUDIO_TARGET_SR) -> bytes:
    if not (shutil.which("afconvert") or shutil.which("ffmpeg")):
        return raw
    suffix = {"audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/aac": ".m4a",
              "audio/aiff": ".aiff", "audio/x-aiff": ".aiff",
              "audio/wav": ".wav", "audio/x-wav": ".wav",
              "audio/webm": ".webm", "audio/ogg": ".ogg"}.get(mime or "", ".audio")
    src = dst = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(raw)
            src = f.name
        dst = src + ".16k.wav"
        if shutil.which("afconvert"):
            try:
                subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{target_sr}", "-c", "1", src, dst],
                               check=True, capture_output=True)
                with open(dst, "rb") as f:
                    return f.read()
            except (subprocess.CalledProcessError, OSError):
                pass
        if shutil.which("ffmpeg"):
            subprocess.run(["ffmpeg", "-y", "-i", src, "-ar", str(target_sr),
                            "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", dst],
                           check=True, capture_output=True)
            with open(dst, "rb") as f:
                return f.read()
        return raw
    except (subprocess.CalledProcessError, OSError):
        return raw
    finally:
        for p in (src, dst):
            if p:
                try:
                    os.remove(p)
                except OSError:
                    pass


CLAUDE_MODELS = ("sonnet", "haiku", "fable", "opus", "claude-opus-4-5",
                  "claude-opus-4-6", "claude-sonnet-4-5", "claude-sonnet-4-6",
                  "claude-opus-4-8", "claude-fable-5")

CLAUDE_ALIASES = ("sonnet", "opus", "haiku", "fable")


def _provider_for(model: str) -> str:
    if model and model.startswith("gemini"):
        return "gemini"
    if model in CLAUDE_MODELS:
        return "claude"
    return "ollama"


class GeminiProvider:

    id = "gemini"
    label = "Gemini"
    kind = "cloud"
    tool_mode = "native"
    settings_keys = st.block_keys("gemini") + st.harness_keys()

    MODELS = ["gemini-2.5-flash", "gemini-3.1-pro-preview"]

    def __init__(self, default_model="gemini-2.5-flash"):
        self.model = default_model
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        return self._client

    def available(self) -> bool:
        return bool(os.environ.get("GEMINI_API_KEY"))

    @staticmethod
    def split_model(name):
        model, sep, version = (name or "").partition("-")
        return model, (version if sep else "")

    def list_models(self) -> list[dict]:
        rows = []
        for name in self.MODELS:
            model, version = self.split_model(name)
            rows.append({"id": name, "provider": self.id,
                         "model": model, "version": version})
        return rows

    def chat(self, messages, model=None, settings=None, tools=None,
             region_id=None, root=None, metrics_sink=None):
        from google.genai import types
        client = self._get_client()
        system_text, contents = self._translate(messages)

        cfg = {}
        if system_text:
            cfg["system_instruction"] = system_text
        if tools:
            cfg["tools"] = [self._to_gemini_tools(tools)]
        config = types.GenerateContentConfig(**cfg) if cfg else None

        start = time.monotonic_ns()
        in_tok = out_tok = 0
        pending_call = None

        stream = client.models.generate_content_stream(
            model=model or self.model, contents=contents, config=config,
        )
        for chunk in stream:
            for cand in (getattr(chunk, "candidates", None) or []):
                content = getattr(cand, "content", None)
                for part in (getattr(content, "parts", None) or []):
                    if getattr(part, "text", None):
                        yield ("content", part.text)
                    fc = getattr(part, "function_call", None)
                    if fc:
                        pending_call = {"function": {
                            "name": fc.name,
                            "arguments": dict(fc.args) if fc.args else {},
                        }}
            um = getattr(chunk, "usage_metadata", None)
            if um:
                in_tok  = getattr(um, "prompt_token_count", 0) or in_tok
                out_tok = getattr(um, "candidates_token_count", 0) or out_tok

        if pending_call:
            yield ("tool_call", [pending_call])
        yield ("metrics", {
            "in_tokens": in_tok, "out_tokens": out_tok,
            "duration_ns": time.monotonic_ns() - start,
        })

    def unload(self, model=None, region_id=None) -> str:
        return "[gemini] metered API — nothing to unload here"

    def _translate(self, messages):
        from google.genai import types
        system_chunks, contents, last_tool_name = [], [], None
        for m in messages:
            role, text = m["role"], (m.get("content") or "")
            if role == "system":
                if text:
                    system_chunks.append(text)
            elif role == "user":
                parts = [types.Part(text=text)] if text else []
                for item in (m.get("media") or []):
                    if item.get("kind") == "image":
                        parts.append(types.Part.from_bytes(
                            data=base64.b64decode(item["data_b64"]),
                            mime_type=item.get("mime", "image/png"),
                        ))
                contents.append(types.Content(
                    role="user", parts=parts or [types.Part(text="")]))
            elif role == "assistant":
                parts = [types.Part(text=text)] if text else []
                for tc in (m.get("tool_calls") or []):
                    fn = tc.get("function", {})
                    args = fn.get("arguments", {})
                    if isinstance(args, str):
                        args = json.loads(args)
                    last_tool_name = fn.get("name")
                    parts.append(types.Part(function_call=types.FunctionCall(
                        name=last_tool_name, args=args)))
                if parts:
                    contents.append(types.Content(role="model", parts=parts))
            elif role == "tool":
                contents.append(types.Content(role="user", parts=[types.Part(
                    function_response=types.FunctionResponse(
                        name=last_tool_name or "tool", response={"result": text}))]))
        return "\n\n".join(system_chunks), contents

    def _to_gemini_tools(self, native_tools):
        from google.genai import types
        decls = [types.FunctionDeclaration(
            name=t["function"]["name"],
            description=t["function"].get("description", ""),
            parameters=t["function"].get("parameters"),
        ) for t in native_tools]
        return types.Tool(function_declarations=decls)


CLAUDE_RATES = {
    "claude-fable-5":     {"in": 10, "out": 50, "read": 1.00, "w5m": 12.5, "w1h": 20},
    "claude-fable-5-1":   {"in": 10, "out": 50, "read": 0.25, "w5m": 12.5, "w1h": 20},
    "claude-opus-4-5":    {"in": 5,  "out": 25, "read": 0.50, "w5m": 6.25, "w1h": 10},
    "claude-opus-4-6":    {"in": 5,  "out": 25, "read": 0.50, "w5m": 6.25, "w1h": 10},
    "claude-opus-4-8":    {"in": 5,  "out": 25, "read": 0.50, "w5m": 6.25, "w1h": 10},
    "claude-opus-5":      {"in": 5,  "out": 25, "read": 0.50, "w5m": 6.25, "w1h": 10},
    "claude-sonnet-4-5":  {"in": 3,  "out": 15, "read": 0.30, "w5m": 3.75, "w1h": 6},
    "claude-sonnet-4-6":  {"in": 3,  "out": 15, "read": 0.30, "w5m": 3.75, "w1h": 6},
    "claude-sonnet-5":    {"in": 3,  "out": 15, "read": 0.30, "w5m": 3.75, "w1h": 6},
    "claude-haiku-4-5":   {"in": 1,  "out": 5,  "read": 0.10, "w5m": 1.25, "w1h": 2},
}

CLAUDE_ALIAS_TO_RATE_KEY = {
    "opus": "claude-opus-5", "sonnet": "claude-sonnet-5",
    "haiku": "claude-haiku-4-5", "fable": "claude-fable-5-1",
}


def _claude_rate_for(alias, resolved_model_id=None):
    if resolved_model_id:
        rate = CLAUDE_RATES.get(resolved_model_id) or \
               CLAUDE_RATES.get(re.sub(r"-\d{8}$", "", resolved_model_id))
        if rate:
            return rate
    return CLAUDE_RATES.get(CLAUDE_ALIAS_TO_RATE_KEY.get(alias))


def _claude_turn_cost(alias, resolved_model_id, usage, cache_ttl="1h"):
    rate = _claude_rate_for(alias, resolved_model_id)
    if not rate:
        return 0.0
    creation = usage.get("cache_creation") or {}
    w5m = creation.get("ephemeral_5m_input_tokens", 0) or 0
    w1h = creation.get("ephemeral_1h_input_tokens", 0) or 0
    if (w5m + w1h) == 0:
        flat = usage.get("cache_creation_input_tokens", 0) or 0
        if flat:
            if cache_ttl == "5m":
                w5m = flat
            else:
                w1h = flat
    return (
        usage.get("input_tokens", 0) * rate["in"] +
        usage.get("cache_read_input_tokens", 0) * rate["read"] +
        w5m * rate["w5m"] +
        w1h * rate["w1h"] +
        usage.get("output_tokens", 0) * rate["out"]
    ) / 1e6


def _claude_call_row(msg, alias, cache_ttl="1h"):
    if not isinstance(msg, dict):
        return None
    usage = msg.get("usage")
    mid = msg.get("id")
    if not isinstance(usage, dict) or not mid:
        return None
    creation = usage.get("cache_creation") or {}
    w5m = int(creation.get("ephemeral_5m_input_tokens", 0) or 0)
    w1h = int(creation.get("ephemeral_1h_input_tokens", 0) or 0)
    if (w5m + w1h) == 0:
        flat = int(usage.get("cache_creation_input_tokens", 0) or 0)
        if flat:
            if cache_ttl == "5m":
                w5m = flat
            else:
                w1h = flat
    model = msg.get("model")
    return {
        "id":             mid,
        "model":          model,
        "input":          int(usage.get("input_tokens", 0) or 0),
        "cache_read":     int(usage.get("cache_read_input_tokens", 0) or 0),
        "cache_write_5m": w5m,
        "cache_write_1h": w1h,
        "output":         int(usage.get("output_tokens", 0) or 0),
        "cost_usd":       _claude_turn_cost(alias, model, usage, cache_ttl),
        "ts":             int(time.time() * 1000),
    }


def _collect_call(obj, calls, seen, alias, cache_ttl):
    try:
        row = _claude_call_row(obj.get("message"), alias, cache_ttl)
    except Exception:
        return
    if row is not None and row["id"] not in seen:
        seen.add(row["id"])
        calls.append(row)


def _zero_metrics():
    return {"in_tokens": 0, "out_tokens": 0, "cache_read": 0,
            "cache_creation": 0, "cost_usd": 0.0, "duration_ns": 0,
            "calls": []}


class _StderrTail:

    MAX = 4096

    def __init__(self, proc):
        self._buf = b""
        self._lock = threading.Lock()
        self._t = threading.Thread(target=self._pump, args=(proc,), daemon=True)
        self._t.start()

    def _pump(self, proc):
        try:
            while True:
                chunk = proc.stderr.read1(65536)
                if not chunk:
                    return
                with self._lock:
                    self._buf = (self._buf + chunk)[-self.MAX:]
        except Exception:
            pass

    def text(self, wait=0.3):
        if wait:
            self._t.join(wait)
        with self._lock:
            return self._buf.decode("utf-8", errors="replace").strip()


class _StdinPump:

    def __init__(self, proc):
        self._proc = proc
        self._q = queue.Queue()
        threading.Thread(target=self._run, daemon=True).start()

    def send(self, data, close=False):
        self._q.put((data, close))

    def stop(self):
        self._q.put(None)

    def _run(self):
        while True:
            item = self._q.get()
            if item is None:
                return
            data, close = item
            try:
                if data:
                    self._proc.stdin.write(data)
                    self._proc.stdin.flush()
                if close:
                    self._proc.stdin.close()
                    return
            except (BrokenPipeError, OSError, ValueError):
                return


class _LineReader:

    def __init__(self, fileobj):
        self._fd = fileobj.fileno()
        self._buf = b""
        self._eof = False

    def readline(self, timeout=None):
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            i = self._buf.find(b"\n")
            if i >= 0:
                line, self._buf = self._buf[:i + 1], self._buf[i + 1:]
                return line
            if self._eof:
                if self._buf:
                    line, self._buf = self._buf, b""
                    return line
                return b""
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                ready, _, _ = select.select([self._fd], [], [], remaining)
                if not ready:
                    return None
            try:
                chunk = os.read(self._fd, 65536)
            except OSError:
                chunk = b""
            if not chunk:
                self._eof = True
                continue
            self._buf += chunk


CLAUDE_IDLE_TIMEOUT = 300.0


def _claude_idle_seconds(timeout):
    if isinstance(timeout, (tuple, list)) and len(timeout) == 2:
        return timeout[1] if timeout[1] is not None else CLAUDE_IDLE_TIMEOUT
    if isinstance(timeout, (int, float)):
        return timeout
    return CLAUDE_IDLE_TIMEOUT


CLI_HOOK_FAIL_OPEN_S = 300.0


def _rail_c_gate_pending(region_id):
    if not region_id:
        return False
    try:
        from engine import daemon_queue as dq
        for entry in dq.pending():
            if (entry.get("outcome") is None
                    and str(entry.get("action_type") or "").startswith("claude_hook:")
                    and (entry.get("region") == region_id
                         or entry.get("session") == region_id)):
                return True
    except Exception:
        return False
    return False


def _gate_grace_deadline(idle_timeout):
    return time.monotonic() + max(0.0, CLI_HOOK_FAIL_OPEN_S - (idle_timeout or 0.0))

HOOK_SCRIPT_PATH = os.path.join(SUITE_ROOT, "hooks", "ade_pretooluse_hook.py")

POST_TOOL_USE_TIMEOUT_S = 5.0

# keys read out of the settings block on every call
_WANT_KEYS = ("claude_cache_ttl", "claude_exclude_dynamic", "claude_tools",
              "claude_setting_sources", "claude_system_prompt", "claude_bare",
              "claude_config_dir", "claude_memory_enabled", "claude_md_excludes",
              "claude_output_style", "claude_settings_file", "gate_wait_s",
              "claude_disallowed_tools", "claude_add_dirs")

# settings file keys carried into the CLI overlay
_CARRIED_FILE_KEYS = ("outputStyle", "autoMemoryEnabled", "claudeMdExcludes")

_OVERLAY_FROM_BLOCK = {"outputStyle": "claude_output_style",
                       "autoMemoryEnabled": "claude_memory_enabled",
                       "claudeMdExcludes": "claude_md_excludes"}


def _norm_output_style(v):
    return v if isinstance(v, str) and v else None


def _norm_memory(v):
    if v in ("on", True):
        return True
    if v in ("off", False):
        return False
    return None


def _norm_excludes(v):
    if isinstance(v, list):
        return list(v) if v else None
    if isinstance(v, str) and v.strip():
        return [p.strip() for p in v.split(",") if p.strip()]
    return None


_NORMALIZERS = {"outputStyle": _norm_output_style,
                "autoMemoryEnabled": _norm_memory,
                "claudeMdExcludes": _norm_excludes}


class ClaudeProvider:

    id = "claude"
    label = "Claude"
    kind = "cloud"
    tool_mode = "text"
    settings_keys = st.block_keys("claude") + st.harness_keys()

    DEFAULT_MODEL = "sonnet"

    _THINKING_DISPLAY_REQ = json.dumps({
        "type": "control_request",
        "request_id": "ade-thinking-display",
        "request": {
            "subtype": "set_max_thinking_tokens",
            "max_thinking_tokens": None,
            "thinking_display": "summarized",
        },
    }) + "\n"

    def _get_binary(self):
        env = os.environ.get("CLAUDE_CODE_EXECPATH")
        if env and os.path.isfile(env):
            return env
        found = shutil.which("claude")
        if found:
            return found
        pattern = os.path.expanduser(
            "~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude"
        )
        matches = sorted(glob.glob(pattern), reverse=True)
        return matches[0] if matches else None

    def available(self):
        return bool(self._get_binary())

    @staticmethod
    def split_model(name):
        if name in CLAUDE_ALIASES:
            return name, ""
        stem = name[len("claude-"):] if name.startswith("claude-") else name
        model, sep, version = stem.partition("-")
        return model, (version if sep else "")

    def list_models(self) -> list[dict]:
        if not self.available():
            return []
        rows = []
        for name in CLAUDE_MODELS:
            model, version = self.split_model(name)
            rows.append({"id": name, "provider": self.id,
                         "model": model, "version": version})
        return rows

    @staticmethod
    def _read_settings_file(path, warnings):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
        except OSError as exc:
            warnings.append(f"settings file {path!r} unreadable: {exc}")
            return {}
        except ValueError as exc:
            warnings.append(f"settings file {path!r} is not valid JSON: {exc}")
            return {}
        if not isinstance(raw, dict):
            warnings.append(f"settings file {path!r} is not a JSON object — ignored")
            return {}
        return {k: raw[k] for k in _CARRIED_FILE_KEYS if k in raw}

    def _overlay(self, settings):
        # settings file first, the block's own keys win
        warnings = []
        path = (settings.get("claude_settings_file") or "").strip()
        file_raw = self._read_settings_file(path, warnings) if path else {}
        overlay = {}
        for cli_key, block_key in _OVERLAY_FROM_BLOCK.items():
            norm = _NORMALIZERS[cli_key]
            value = norm(settings.get(block_key))
            if value is None:
                value = norm(file_raw.get(cli_key))
            if value is not None:
                overlay[cli_key] = value
        return overlay or None, warnings

    def _want_from(self, settings, model, root):
        want = {k: settings.get(k) for k in _WANT_KEYS}
        for k in ("claude_tools", "claude_disallowed_tools", "claude_add_dirs",
                  "claude_md_excludes"):
            want[k] = list(want[k]) if want[k] else []
        want["model"] = model
        want["root"] = root or None
        return want

    def _build_cmd(self, binary, model, sys_text, want, overlay,
                   claude_effort=None, claude_partial=True,
                   session_id=None, resume=False):
        cmd = [
            binary, "-p",
            "--output-format", "stream-json",
            "--input-format", "stream-json",
            "--model", model,
        ]
        if session_id:
            cmd += (["--resume", session_id] if resume else ["--session-id", session_id])
        if sys_text:
            cmd += ["--append-system-prompt", sys_text]
        if claude_effort is not None:
            cmd += ["--effort", claude_effort]
        if claude_partial:
            cmd += ["--include-partial-messages"]
        if want["claude_exclude_dynamic"]:
            cmd += ["--exclude-dynamic-system-prompt-sections"]
        if want["claude_setting_sources"]:
            cmd += ["--setting-sources", want["claude_setting_sources"]]
        if want["claude_system_prompt"]:
            cmd += ["--system-prompt", want["claude_system_prompt"]]
        if want["claude_bare"]:
            cmd += ["--bare"]
        settings_obj = self._settings_obj(want["claude_tools"], overlay,
                                          want["gate_wait_s"])
        if settings_obj:
            cmd += ["--settings", json.dumps(settings_obj)]
        if want["claude_disallowed_tools"]:
            cmd += ["--disallowedTools", ",".join(want["claude_disallowed_tools"])]
        for d in want["claude_add_dirs"]:
            cmd += ["--add-dir", d]
        cmd += ["--tools", ",".join(want["claude_tools"]) if want["claude_tools"] else ""]
        return cmd

    def _cache_env(self, cache_ttl, region_id=None, claude_config_dir=None):
        env = os.environ.copy()
        env.pop("FORCE_PROMPT_CACHING_5M", None)
        env.pop("ENABLE_PROMPT_CACHING_1H", None)
        if cache_ttl == "5m":
            env["FORCE_PROMPT_CACHING_5M"] = "1"
        else:
            env["ENABLE_PROMPT_CACHING_1H"] = "1"
        if region_id:
            env["ADE_REGION_ID"] = region_id
        if claude_config_dir:
            env["CLAUDE_CONFIG_DIR"] = claude_config_dir
        return env

    def _settings_obj(self, claude_tools, overlay, gate_wait_s):
        obj = dict(overlay) if overlay else {}
        if claude_tools:
            hook_timeout_s = (gate_wait_s + 15) if gate_wait_s else CLAUDE_IDLE_TIMEOUT
            hook_cmd = f"python3 {shlex.quote(HOOK_SCRIPT_PATH)}"
            obj["hooks"] = {
                "PreToolUse": [{"hooks": [{
                    "type": "command",
                    "command": hook_cmd,
                    "timeout": hook_timeout_s,
                }]}],
                "PostToolUse": [{"hooks": [{
                    "type": "command",
                    "command": hook_cmd,
                    "timeout": POST_TOOL_USE_TIMEOUT_S,
                }]}],
            }
        return obj or None

    @staticmethod
    def _failure_note(proc, errtail, idle=False):
        try:
            proc.poll()
        except Exception:
            pass
        rc = getattr(proc, "returncode", None)
        detail = errtail.text() if errtail is not None else ""
        note = ("\n[tool run ended — no output from the CLI before the idle "
                "timeout. Try again.]" if idle else
                f"\n[claude CLI exited without a result (code {rc})]")
        if detail:
            note += "\n" + detail
        return note + "\n"

    def _read_events(self, reader, on_result, claude_partial, idle_timeout,
                     region_id, alias, cache_ttl, calls, seen_calls,
                     on_resolved_model):
        # one stream reader for oneshot chat and the persistent turn
        gate_deadline = None
        while True:
            raw = reader.readline(timeout=idle_timeout)
            if raw is None:
                if _rail_c_gate_pending(region_id):
                    if gate_deadline is None:
                        gate_deadline = _gate_grace_deadline(idle_timeout)
                    if time.monotonic() < gate_deadline:
                        continue
                yield ("_idle", None)
                return
            if not raw:
                return
            gate_deadline = None
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = obj.get("type")
            if t == "system" and obj.get("subtype") == "init":
                if obj.get("model"):
                    on_resolved_model(obj["model"])
            if t == "assistant":
                _collect_call(obj, calls, seen_calls, alias, cache_ttl)
            if claude_partial:
                if t == "stream_event":
                    delta = (obj.get("event") or {}).get("delta") or {}
                    dt = delta.get("type")
                    if dt == "thinking_delta":
                        yield ("thinking", delta.get("thinking", ""))
                    elif dt == "text_delta":
                        yield ("content", delta.get("text", ""))
            elif t == "assistant":
                for block in (obj.get("message", {}).get("content") or []):
                    bt = block.get("type")
                    if bt == "thinking":
                        yield ("thinking", block.get("thinking", ""))
                    elif bt == "text":
                        yield ("content", block.get("text", ""))
            if t == "result":
                on_result(obj.get("usage", {}) or {})
                return

    def chat(self, messages, model=None, settings=None, tools=None,
             region_id=None, root=None, metrics_sink=None):
        s = settings or {}
        idle_timeout = _claude_idle_seconds((10, s.get("request_timeout")))
        binary = self._get_binary()
        if not binary:
            yield ("content", "[ClaudeProvider] claude binary not found\n")
            yield ("metrics", _zero_metrics())
            return

        stdin_text, sys_text = self._serialize(messages)
        target_model = model or self.DEFAULT_MODEL
        claude_partial = bool(s.get("claude_partial", True))
        cache_ttl = s.get("claude_cache_ttl") or "1h"
        want = self._want_from(s, target_model, root)
        overlay, _warnings = self._overlay(s)
        cmd = self._build_cmd(binary, target_model, sys_text, want, overlay,
                              claude_effort=s.get("claude_effort"),
                              claude_partial=claude_partial)

        start = time.monotonic_ns()
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=root or None,
            env=self._cache_env(cache_ttl, region_id=region_id,
                                claude_config_dir=want["claude_config_dir"] or None),
        )
        errtail = _StderrTail(proc)
        stdin_pump = _StdinPump(proc)
        stdin_pump.send(stdin_text.encode("utf-8"), close=True)
        reader = _LineReader(proc.stdout)

        state = {"in": 0, "out": 0, "cache_read": 0, "cache_creation": 0,
                 "usage": None, "resolved": None, "idle": False}
        calls, seen_calls = [], set()

        def _on_result(usage):
            state["usage"] = usage
            state["in"] = usage.get("input_tokens", 0)
            state["out"] = usage.get("output_tokens", 0)
            state["cache_read"] = usage.get("cache_read_input_tokens", 0)
            state["cache_creation"] = usage.get("cache_creation_input_tokens", 0)

        def _metrics():
            return {
                "in_tokens": state["in"],
                "out_tokens": state["out"],
                "cache_read": state["cache_read"],
                "cache_creation": state["cache_creation"],
                "cost_usd": (_claude_turn_cost(target_model, state["resolved"],
                                               state["usage"], cache_ttl)
                             if state["usage"] else 0.0),
                "duration_ns": time.monotonic_ns() - start,
                "calls": list(calls),
            }

        try:
            for channel, data in self._read_events(
                    reader, _on_result, claude_partial, idle_timeout, region_id,
                    target_model, cache_ttl, calls, seen_calls,
                    lambda m: state.__setitem__("resolved", m)):
                if channel == "_idle":
                    state["idle"] = True
                    break
                yield (channel, data)
        finally:
            if metrics_sink is not None:
                metrics_sink.clear()
                metrics_sink.update(_metrics())
            stdin_pump.stop()
            if proc.poll() is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
            proc.wait()

        if state["usage"] is None:
            yield ("content", self._failure_note(proc, errtail, state["idle"]))
        yield ("metrics", _metrics())

    def unload(self, model=None, region_id=None) -> str:
        return "[claude] ephemeral subprocess — nothing to unload here"

    def _render(self, messages):
        rows = []
        for m in messages:
            role = m.get("role")
            if role == "system":
                continue
            text = m.get("content") or ""
            if not text.strip():
                continue
            rows.append(("assistant" if role == "assistant" else "user", text))
        if not rows:
            return ""
        if len(rows) == 1:
            return rows[0][1]
        return ("Conversation so far — you are the assistant. Reply only to the "
                "final user turn.\n\n" +
                "\n\n".join(f"{who}: {text}" for who, text in rows))

    _IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/webp"}

    def _image_blocks(self, messages):
        blocks = []
        for m in messages:
            if m.get("role") == "system":
                continue
            for item in (m.get("media") or []):
                if item.get("kind") != "image":
                    continue
                mime = item.get("mime")
                data = item.get("data_b64")
                if mime not in self._IMAGE_MIMES or not data:
                    continue
                blocks.append({"type": "image",
                               "source": {"type": "base64",
                                          "media_type": mime,
                                          "data": data}})
        return blocks

    def _serialize(self, messages):
        sys_parts = [m.get("content") or "" for m in messages
                     if m.get("role") == "system" and (m.get("content") or "")]
        sys_text = "\n\n".join(sys_parts)
        body = self._render(messages)
        imgs = self._image_blocks(messages)
        if not body and not imgs:
            return "", sys_text
        content = list(imgs)
        if body:
            content.append({"type": "text", "text": body})
        evt = {"type": "user",
               "message": {"role": "user", "content": content}}
        return self._THINKING_DISPLAY_REQ + json.dumps(evt) + "\n", sys_text


class ClaudePersistentProvider(ClaudeProvider):

    def __init__(self, session_id=None):
        super().__init__()
        self._proc = None
        self._stdin = None
        self._reader = None
        self._stderr = None
        self._sent_count = 0
        self._sent_sig = []
        self._active_model = None
        self._resolved_model = None
        self._want = {}
        self._spawned = None
        self._idle_timeout = CLAUDE_IDLE_TIMEOUT
        self._region_id = None
        self.claude_session_id = session_id or str(uuid.uuid4())
        self._session_established = bool(session_id)
        atexit.register(self.shutdown)

    @staticmethod
    def _convo(messages):
        return [m for m in messages if m.get("role") != "system"]

    def seed_delivered(self, messages):
        convo = self._convo(messages)
        self._sent_sig = self._signature(convo)
        self._sent_count = len(convo)

    def _signature(self, messages):
        return [(m.get("role"), hash(m.get("content") or ""),
                 len(m.get("media") or []))
                for m in messages]

    def _continues(self, messages):
        convo = self._convo(messages)
        sig = self._signature(convo)
        if len(sig) < self._sent_count or sig[:self._sent_count] != self._sent_sig:
            return False
        tail = convo[self._sent_count:]
        for i, m in enumerate(tail):
            if m.get("role") == "assistant" and i != 0:
                return False
        return any(m.get("role") in ("user", "tool") and (m.get("content") or "")
                   for m in tail)

    def _catches_up(self, messages):
        convo = self._convo(messages)
        sig = self._signature(convo)
        if len(sig) < self._sent_count or sig[:self._sent_count] != self._sent_sig:
            return False
        return bool(convo[self._sent_count:])

    def chat(self, messages, model=None, settings=None, tools=None,
             region_id=None, root=None, metrics_sink=None):
        s = settings or {}
        target = model or self.DEFAULT_MODEL
        self._idle_timeout = _claude_idle_seconds((10, s.get("request_timeout")))
        self._region_id = region_id
        self._want = self._want_from(s, target, root)
        self._overlay_cache = self._overlay(s)[0]
        claude_partial = bool(s.get("claude_partial", True))
        stale = (self._proc is None or self._proc.poll() is not None
                 or self._want != self._spawned)
        if stale:
            yield from self._spawn_and_prime(messages, target,
                                             s.get("claude_effort"),
                                             claude_partial, metrics_sink)
        elif self._continues(messages):
            yield from self._send_turn(messages, claude_partial, metrics_sink)
        elif s.get("claude_keep_warm") and self._catches_up(messages):
            yield from self._send_catchup(messages, claude_partial, metrics_sink)
        else:
            yield from self._spawn_and_prime(messages, target,
                                             s.get("claude_effort"),
                                             claude_partial, metrics_sink)

    def _spawn_and_prime(self, messages, model, claude_effort, claude_partial,
                         metrics_sink=None):
        self._kill_process()
        binary = self._get_binary()
        if not binary:
            yield ("content", "[ClaudePersistentProvider] claude binary not found\n")
            yield ("metrics", _zero_metrics())
            return

        _, sys_text = self._serialize(messages)
        resuming = self._session_established
        cmd = self._build_cmd(binary, model, sys_text, self._want,
                              self._overlay_cache,
                              claude_effort=claude_effort,
                              claude_partial=claude_partial,
                              session_id=self.claude_session_id,
                              resume=resuming)

        self._proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=self._want["root"],
            env=self._cache_env(self._want["claude_cache_ttl"],
                                region_id=self._region_id,
                                claude_config_dir=self._want["claude_config_dir"] or None),
        )
        self._stderr = _StderrTail(self._proc)
        self._stdin  = _StdinPump(self._proc)
        self._reader = _LineReader(self._proc.stdout)
        self._stdin.send(self._THINKING_DISPLAY_REQ.encode("utf-8"))
        self._active_model = model
        self._resolved_model = None
        self._spawned = dict(self._want)
        self._session_established = True

        if resuming:
            yield from self._send_turn(messages, claude_partial, metrics_sink)
            return

        convo = self._convo(messages)
        self._send_messages(convo)
        self._sent_sig = self._signature(convo)
        self._sent_count = len(convo)

        yield from self._read_turn(claude_partial, metrics_sink)

    def _send_turn(self, messages, claude_partial, metrics_sink=None):
        convo = self._convo(messages)
        new_msgs = convo[self._sent_count:]
        wrote = self._send_messages(new_msgs, user_only=True)
        self._sent_sig = self._signature(convo)
        self._sent_count = len(convo)
        if not wrote:
            yield ("metrics", _zero_metrics())
            return
        yield from self._read_turn(claude_partial, metrics_sink)

    def _send_catchup(self, messages, claude_partial, metrics_sink=None):
        convo = self._convo(messages)
        tail = convo[self._sent_count:]
        new_msgs = tail[1:] if (tail and tail[0].get("role") == "assistant") else tail
        wrote = self._send_messages(new_msgs, user_only=False)
        self._sent_sig = self._signature(convo)
        self._sent_count = len(convo)
        if not wrote:
            yield ("metrics", _zero_metrics())
            return
        yield from self._read_turn(claude_partial, metrics_sink)

    def _send_messages(self, messages, user_only=False):
        msgs = [m for m in messages
                if not (user_only and m.get("role") == "assistant")]
        body = self._render(msgs)
        imgs = self._image_blocks(msgs)
        if not body and not imgs:
            return False
        content = list(imgs)
        if body:
            content.append({"type": "text", "text": body})
        evt = {"type": "user",
               "message": {"role": "user", "content": content}}
        self._stdin.send((json.dumps(evt) + "\n").encode("utf-8"))
        return True

    def _read_turn(self, claude_partial, metrics_sink=None):
        start = time.monotonic_ns()
        cache_ttl = self._want["claude_cache_ttl"] or "1h"
        state = {"in": 0, "out": 0, "cache_read": 0, "cache_creation": 0,
                 "usage": None, "idle": False}
        calls, seen_calls = [], set()

        def _apply(usage):
            state["usage"] = usage
            state["in"] = usage.get("input_tokens", 0)
            state["out"] = usage.get("output_tokens", 0)
            state["cache_read"] = usage.get("cache_read_input_tokens", 0)
            state["cache_creation"] = usage.get("cache_creation_input_tokens", 0)

        def _metrics():
            return {
                "in_tokens": state["in"],
                "out_tokens": state["out"],
                "cache_read": state["cache_read"],
                "cache_creation": state["cache_creation"],
                "cost_usd": (_claude_turn_cost(self._active_model,
                                               self._resolved_model,
                                               state["usage"], cache_ttl)
                             if state["usage"] else 0.0),
                "duration_ns": time.monotonic_ns() - start,
                "calls": list(calls),
            }

        def _set_resolved(m):
            self._resolved_model = m

        try:
            for channel, data in self._read_events(
                    self._reader, _apply, claude_partial, self._idle_timeout,
                    self._region_id, self._active_model, cache_ttl, calls,
                    seen_calls, _set_resolved):
                if channel == "_idle":
                    state["idle"] = True
                    break
                yield (channel, data)
        except GeneratorExit:
            drained = self._interrupt_and_drain()
            if drained:
                _apply(drained)
            raise
        finally:
            if metrics_sink is not None:
                metrics_sink.clear()
                metrics_sink.update(_metrics())

        turn_metrics = _metrics()
        if state["usage"] is None:
            if state["idle"]:
                drained = self._interrupt_and_drain()
                if drained:
                    _apply(drained)
                    turn_metrics = _metrics()
                note = (f"\n[tool run ended — nothing from the CLI for "
                        f"{int(self._idle_timeout)}s. The session is still live; "
                        f"try again.]\n")
                detail = self._stderr.text() if self._stderr is not None else ""
                if detail:
                    note += detail + "\n"
                yield ("content", note)
            else:
                note = self._failure_note(self._proc, self._stderr, False)
                self.shutdown()
                yield ("content", note)
        yield ("metrics", turn_metrics)

    def interrupt(self):
        if not self._proc or self._proc.poll() is not None or self._stdin is None:
            return False
        req = {"type": "control_request",
               "request_id": f"stop-{time.monotonic_ns()}",
               "request": {"subtype": "interrupt"}}
        try:
            self._stdin.send((json.dumps(req) + "\n").encode("utf-8"))
        except Exception:
            return False
        return True

    def _interrupt_and_drain(self, timeout=10.0, settle=0.5):
        if not self._proc or self._proc.poll() is not None or self._reader is None:
            return None
        req = {"type": "control_request",
               "request_id": f"abort-{time.monotonic_ns()}",
               "request": {"subtype": "interrupt"}}
        self._stdin.send((json.dumps(req) + "\n").encode("utf-8"))

        usage = None
        acked = False
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            raw = self._reader.readline(timeout=min(remaining, settle) if acked
                                        else remaining)
            if raw is None:
                if acked:
                    return usage
                break
            if not raw:
                break
            try:
                obj = json.loads(raw.decode("utf-8", errors="replace").strip())
            except json.JSONDecodeError:
                continue
            t = obj.get("type")
            if t == "result":
                acked = True
                usage = obj.get("usage") or usage
            elif t == "control_response":
                acked = True
        self.shutdown()
        return usage

    def _kill_process(self):
        if self._stdin is not None:
            self._stdin.stop()
        if self._proc and self._proc.poll() is None:
            try:
                self._proc.stdin.close()
            except (OSError, ValueError):
                pass
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait()
        self._proc = None
        self._stdin = None
        self._reader = None
        self._stderr = None

    def shutdown(self):
        killed = bool(self._proc and self._proc.poll() is None)
        self._kill_process()
        self._sent_count = 0
        self._sent_sig = []
        self._active_model = None
        self._resolved_model = None
        self._spawned = None
        return killed


class Router:

    def __init__(self):
        """Adding a provider: one class with the Provider interface, one line here."""
        self.providers = {"ollama": OllamaProvider(),
                          "gemini": GeminiProvider(),
                          "claude": ClaudeProvider()}
        self.ollama = self.providers["ollama"]
        self.gemini = self.providers["gemini"]
        self.claude = self.providers["claude"]
        self.claude_p = {}
        self.model = self.ollama.model

    def provider_for(self, model):
        return self.providers[_provider_for(model or self.model)]

    def claude_provider_for(self, region_id, model):
        key = (region_id, model)
        p = self.claude_p.get(key)
        if p is None:
            p = ClaudePersistentProvider()
            self.claude_p[key] = p
        return p

    def claude_reattach(self, region_id, model, session_id, delivered_messages):
        key = (region_id, model)
        if key in self.claude_p:
            return False
        p = ClaudePersistentProvider(session_id=session_id)
        p.seed_delivered(delivered_messages)
        self.claude_p[key] = p
        return True

    def claude_session_id(self, region_id, model):
        p = self.claude_p.get((region_id, model))
        return p.claude_session_id if p is not None else None

    def claude_close_track(self, region_id):
        for key in [k for k in self.claude_p if k[0] == region_id]:
            self.claude_p.pop(key).shutdown()

    def claude_interrupt_track(self, region_id):
        n = 0
        for key, prov in list(self.claude_p.items()):
            if key[0] == region_id:
                try:
                    if prov.interrupt():
                        n += 1
                except Exception:
                    pass
        return n

    def available(self) -> bool:
        return any(p.available() for p in self.providers.values())

    def list_models(self) -> list[dict]:
        hidden = set(st.load_global().get("models", {}).get("hidden") or [])
        rows = []
        for p in self.providers.values():
            if not p.available():
                continue
            rows += [r for r in p.list_models() if r["id"] not in hidden]
        return rows

    def chat(self, messages, model=None, settings=None, region_id=None,
             root=None, tools=None, metrics_sink=None):
        s = settings or {}
        picked = self.provider_for(model)
        if picked.id == "claude" and s.get("claude_mode", "persistent") == "persistent":
            picked = self.claude_provider_for(region_id, model or picked.DEFAULT_MODEL)
        return picked.chat(messages, model=model, settings=s, tools=tools,
                           region_id=region_id, root=root,
                           metrics_sink=metrics_sink)

    def unload(self, model=None, region_id=None):
        if model is None:
            return self.ollama.unload(None)
        kind = _provider_for(model)
        if kind == "claude":
            if region_id is not None:
                p = self.claude_p.pop((region_id, model), None)
                if p is None or not p.shutdown():
                    return "[claude] subprocess model — no live session"
                return "[claude] persistent session ended (this region only)"
            n = sum(1 for p in self.claude_p.values() if p.shutdown())
            self.claude_p.clear()
            return (f"[claude] {n} persistent session(s) ended" if n
                    else "[claude] subprocess model — no live session")
        return self.providers[kind].unload(model, region_id=region_id)
