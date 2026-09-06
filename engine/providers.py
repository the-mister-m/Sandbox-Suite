
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

import requests

from engine.ollama_provider import OllamaProvider
from engine.codex_provider import CodexProvider
from engine import SUITE_ROOT
from engine import settings_stack


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

LITERT_MODELS_DIR = os.environ.get("LITERT_MODELS_DIR") or \
    os.path.join(SUITE_ROOT, "models")

LLAMACPP_PORT = int(os.environ.get("LLAMACPP_PORT", "8033"))
LLAMACPP_NGL  = os.environ.get("LLAMACPP_NGL", "99")

def _first_glob(pattern):
    hits = glob.glob(os.path.expanduser(pattern))
    return hits[0] if hits else ""

LLAMACPP_MODELS = {
    "llamacpp:gemma-4-12b-bf16": (
        os.environ.get("LLAMACPP_GEMMA_MODEL")
            or os.path.expanduser("~/Downloads/gemma-4-12b-it-BF16.gguf"),
        os.environ.get("LLAMACPP_GEMMA_MMPROJ") or _first_glob(
            "~/.cache/huggingface/hub/models--unsloth--gemma-4-12B-it-qat-GGUF/snapshots/*/mmproj-F16.gguf"),
    ),
    "llamacpp:qwen2.5-omni-7b": (
        os.environ.get("LLAMACPP_QWEN_MODEL")
            or os.path.expanduser("~/.lmstudio/models/unsloth/Qwen2.5-Omni-7B-GGUF/Qwen2.5-Omni-7B-Q4_K_S.gguf"),
        os.environ.get("LLAMACPP_QWEN_MMPROJ")
            or os.path.expanduser("~/.lmstudio/models/unsloth/Qwen2.5-Omni-7B-GGUF/mmproj-F32.gguf"),
    ),
}

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


CODEX_MODELS = ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5")


def _provider_for(model: str) -> str:
    if model and model.startswith("gemini"):
        return "gemini"
    if model and model.startswith("llamacpp"):
        return "llamacpp"
    if model in CLAUDE_MODELS:
        return "claude"
    if model in CODEX_MODELS:
        return "codex"
    return "ollama"


def is_text_only_provider(provider=None, model=None) -> bool:
    kind = provider or _provider_for(model or "")
    return kind in ("codex", "claude")


class GeminiProvider:

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

    def list_models(self):
        return list(self.MODELS)

    def chat(self, messages, model=None, think=None, tools=None, num_ctx=None, timeout=None, **_kwargs):
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


class ClaudeProvider:

    DEFAULT_MODEL = "sonnet"
    DEFAULT_GATED = ["Bash", "Edit", "Write"]

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

    def list_models(self):
        return list(CLAUDE_MODELS) if self.available() else []

    def _build_cmd(self, binary, model, sys_text, claude_effort, claude_partial,
                    session_id=None, resume=False, claude_exclude_dynamic=False,
                    claude_tools=None, claude_setting_sources=None,
                    claude_system_prompt=None, claude_bare=False,
                    claude_settings_obj=None, claude_disallowed_tools=None,
                    claude_add_dirs=None):
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
        if claude_exclude_dynamic:
            cmd += ["--exclude-dynamic-system-prompt-sections"]
        if claude_setting_sources:
            cmd += ["--setting-sources", claude_setting_sources]
        if claude_system_prompt:
            cmd += ["--system-prompt", claude_system_prompt]
        if claude_bare:
            cmd += ["--bare"]
        if claude_settings_obj:
            cmd += ["--settings", json.dumps(claude_settings_obj)]
        if claude_disallowed_tools:
            cmd += ["--disallowedTools", ",".join(claude_disallowed_tools)]
        if claude_add_dirs:
            for d in claude_add_dirs:
                cmd += ["--add-dir", d]
        cmd += ["--tools", ",".join(claude_tools) if claude_tools else ""]
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

    def chat(self, messages, model=None, claude_gated=None, claude_effort=None,
             claude_partial=True, claude_cache_ttl="1h", claude_exclude_dynamic=False,
             claude_tools=None, claude_setting_sources=None, claude_system_prompt=None,
             claude_bare=False, claude_config_dir=None, claude_memory_enabled=None,
             claude_md_excludes=None, claude_output_style=None, claude_settings_file=None,
             claude_preset=None, claude_track_id=None, claude_root=None,
             claude_disallowed_tools=None, claude_add_dirs=None,
             gate_wait_s=None, timeout=None, metrics_sink=None, **_kwargs):
        idle_timeout = _claude_idle_seconds(timeout)
        binary = self._get_binary()
        if not binary:
            yield ("content", "[ClaudeProvider] claude binary not found\n")
            yield ("metrics", _zero_metrics())
            return

        stdin_text, sys_text = self._serialize(messages)
        target_model = model or self.DEFAULT_MODEL
        resolved = settings_stack.resolve({
            "claude_settings_file": claude_settings_file,
            "claude_preset": claude_preset,
            "claude_output_style": claude_output_style,
            "claude_memory_enabled": claude_memory_enabled,
            "claude_md_excludes": claude_md_excludes,
            "claude_setting_sources": claude_setting_sources,
            "claude_config_dir": claude_config_dir,
            "claude_system_prompt": claude_system_prompt,
            "claude_bare": claude_bare,
        })
        settings_obj = self._settings_obj(claude_tools, resolved["overlay"], gate_wait_s)
        cmd = self._build_cmd(binary, target_model, sys_text, claude_effort, claude_partial,
                              claude_exclude_dynamic=claude_exclude_dynamic,
                              claude_tools=claude_tools,
                              claude_setting_sources=resolved["setting_sources"],
                              claude_system_prompt=resolved["system_prompt"],
                              claude_bare=resolved["bare"],
                              claude_settings_obj=settings_obj,
                              claude_disallowed_tools=claude_disallowed_tools,
                              claude_add_dirs=claude_add_dirs)

        start = time.monotonic_ns()
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=claude_root or None,
            env=self._cache_env(claude_cache_ttl, region_id=claude_track_id,
                                claude_config_dir=resolved["config_dir"]),
        )
        errtail = _StderrTail(proc)
        stdin_pump = _StdinPump(proc)
        stdin_pump.send(stdin_text.encode("utf-8"), close=True)
        reader = _LineReader(proc.stdout)

        in_tok = out_tok = cache_read = cache_creation = 0
        usage_final = None
        resolved_model = None
        idle = False
        calls = []
        seen_calls = set()

        def _metrics():
            return {
                "in_tokens": in_tok,
                "out_tokens": out_tok,
                "cache_read": cache_read,
                "cache_creation": cache_creation,
                "cost_usd": (_claude_turn_cost(target_model, resolved_model,
                                               usage_final, claude_cache_ttl)
                             if usage_final else 0.0),
                "duration_ns": time.monotonic_ns() - start,
                "calls": list(calls),
            }

        try:
            gate_deadline = None
            while True:
                raw = reader.readline(timeout=idle_timeout)
                if raw is None:
                    if _rail_c_gate_pending(claude_track_id):
                        if gate_deadline is None:
                            gate_deadline = _gate_grace_deadline(idle_timeout)
                        if time.monotonic() < gate_deadline:
                            continue
                    idle = True
                    break
                if not raw:
                    break
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
                    resolved_model = obj.get("model") or resolved_model
                if t == "assistant":
                    _collect_call(obj, calls, seen_calls, target_model,
                                  claude_cache_ttl)
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
                    usage_final = obj.get("usage", {}) or {}
                    in_tok = usage_final.get("input_tokens", 0)
                    out_tok = usage_final.get("output_tokens", 0)
                    cache_read = usage_final.get("cache_read_input_tokens", 0)
                    cache_creation = usage_final.get("cache_creation_input_tokens", 0)
                    break
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

        if usage_final is None:
            yield ("content", self._failure_note(proc, errtail, idle))
        yield ("metrics", _metrics())

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
        self._cache_ttl = "1h"
        self._spawned_cache_ttl = None
        self._exclude_dynamic = False
        self._spawned_exclude_dynamic = None
        self._tools = []
        self._spawned_tools = None
        self._setting_sources = None
        self._spawned_setting_sources = None
        self._system_prompt = None
        self._spawned_system_prompt = None
        self._bare = False
        self._spawned_bare = None
        self._config_dir = None
        self._spawned_config_dir = None
        self._memory_enabled = None
        self._spawned_memory_enabled = "unset"
        self._md_excludes = None
        self._spawned_md_excludes = None
        self._output_style = None
        self._spawned_output_style = None
        self._settings_file = None
        self._spawned_settings_file = None
        self._preset = None
        self._spawned_preset = None
        self._gate_wait_s = None
        self._spawned_gate_wait_s = "unset"
        self._disallowed_tools = []
        self._spawned_disallowed_tools = None
        self._add_dirs = []
        self._spawned_add_dirs = None
        self._idle_timeout = CLAUDE_IDLE_TIMEOUT
        self._region_id = None
        self._root = None
        self._spawned_root = None
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

    def chat(self, messages, model=None, claude_gated=None, claude_effort=None,
             claude_partial=True, claude_cache_ttl="1h", claude_keep_warm=False,
             claude_exclude_dynamic=False, claude_tools=None, claude_setting_sources=None,
             claude_system_prompt=None, claude_bare=False, claude_config_dir=None,
             claude_memory_enabled=None, claude_md_excludes=None, claude_output_style=None,
             claude_settings_file=None, claude_preset=None, claude_root=None,
             claude_track_id=None, claude_disallowed_tools=None, claude_add_dirs=None,
             gate_wait_s=None, timeout=None, metrics_sink=None, **_kwargs):
        target = model or self.DEFAULT_MODEL
        self._idle_timeout = _claude_idle_seconds(timeout)
        self._cache_ttl = claude_cache_ttl or "1h"
        self._exclude_dynamic = bool(claude_exclude_dynamic)
        self._tools = list(claude_tools) if claude_tools else []
        self._setting_sources = claude_setting_sources or None
        self._system_prompt = claude_system_prompt or None
        self._bare = bool(claude_bare)
        self._config_dir = claude_config_dir or None
        self._memory_enabled = claude_memory_enabled
        self._md_excludes = list(claude_md_excludes) if claude_md_excludes else None
        self._output_style = claude_output_style or None
        self._disallowed_tools = list(claude_disallowed_tools) if claude_disallowed_tools else []
        self._add_dirs = list(claude_add_dirs) if claude_add_dirs else []
        self._settings_file = claude_settings_file or None
        self._preset = claude_preset or None
        self._gate_wait_s = gate_wait_s
        self._region_id = claude_track_id
        self._root = claude_root or None
        if (self._proc is None or self._proc.poll() is not None
                or target != self._active_model
                or self._cache_ttl != self._spawned_cache_ttl
                or self._exclude_dynamic != self._spawned_exclude_dynamic
                or self._tools != self._spawned_tools
                or self._setting_sources != self._spawned_setting_sources
                or self._system_prompt != self._spawned_system_prompt
                or self._bare != self._spawned_bare
                or self._config_dir != self._spawned_config_dir
                or self._memory_enabled != self._spawned_memory_enabled
                or self._md_excludes != self._spawned_md_excludes
                or self._output_style != self._spawned_output_style
                or self._settings_file != self._spawned_settings_file
                or self._preset != self._spawned_preset
                or self._gate_wait_s != self._spawned_gate_wait_s
                or self._disallowed_tools != self._spawned_disallowed_tools
                or self._add_dirs != self._spawned_add_dirs
                or self._root != self._spawned_root):
            yield from self._spawn_and_prime(messages, target, claude_effort,
                                             claude_partial, metrics_sink)
        elif self._continues(messages):
            yield from self._send_turn(messages, claude_partial, metrics_sink)
        elif claude_keep_warm and self._catches_up(messages):
            yield from self._send_catchup(messages, claude_partial, metrics_sink)
        else:
            yield from self._spawn_and_prime(messages, target, claude_effort,
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
        resolved = settings_stack.resolve({
            "claude_settings_file": self._settings_file,
            "claude_preset": self._preset,
            "claude_output_style": self._output_style,
            "claude_memory_enabled": self._memory_enabled,
            "claude_md_excludes": self._md_excludes,
            "claude_setting_sources": self._setting_sources,
            "claude_config_dir": self._config_dir,
            "claude_system_prompt": self._system_prompt,
            "claude_bare": self._bare,
        })
        settings_obj = self._settings_obj(self._tools, resolved["overlay"],
                                          self._gate_wait_s)
        cmd = self._build_cmd(binary, model, sys_text, claude_effort, claude_partial,
                              session_id=self.claude_session_id, resume=resuming,
                              claude_exclude_dynamic=self._exclude_dynamic,
                              claude_tools=self._tools,
                              claude_setting_sources=resolved["setting_sources"],
                              claude_system_prompt=resolved["system_prompt"],
                              claude_bare=resolved["bare"],
                              claude_settings_obj=settings_obj,
                              claude_disallowed_tools=self._disallowed_tools,
                              claude_add_dirs=self._add_dirs)

        self._proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=self._root,
            env=self._cache_env(self._cache_ttl, region_id=self._region_id,
                                claude_config_dir=resolved["config_dir"]),
        )
        self._stderr = _StderrTail(self._proc)
        self._stdin  = _StdinPump(self._proc)
        self._reader = _LineReader(self._proc.stdout)
        self._stdin.send(self._THINKING_DISPLAY_REQ.encode("utf-8"))
        self._active_model = model
        self._resolved_model = None
        self._spawned_cache_ttl = self._cache_ttl
        self._spawned_exclude_dynamic = self._exclude_dynamic
        self._spawned_tools = self._tools
        self._spawned_setting_sources = self._setting_sources
        self._spawned_system_prompt = self._system_prompt
        self._spawned_bare = self._bare
        self._spawned_config_dir = self._config_dir
        self._spawned_memory_enabled = self._memory_enabled
        self._spawned_md_excludes = self._md_excludes
        self._spawned_output_style = self._output_style
        self._spawned_settings_file = self._settings_file
        self._spawned_preset = self._preset
        self._spawned_gate_wait_s = self._gate_wait_s
        self._spawned_disallowed_tools = self._disallowed_tools
        self._spawned_add_dirs = self._add_dirs
        self._spawned_root = self._root
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
        in_tok = out_tok = cache_read = cache_creation = 0
        usage_final = None
        idle = False
        calls = []
        seen_calls = set()

        def _metrics():
            return {
                "in_tokens": in_tok,
                "out_tokens": out_tok,
                "cache_read": cache_read,
                "cache_creation": cache_creation,
                "cost_usd": (_claude_turn_cost(self._active_model, self._resolved_model,
                                               usage_final, self._cache_ttl)
                             if usage_final else 0.0),
                "duration_ns": time.monotonic_ns() - start,
                "calls": list(calls),
            }

        try:
            gate_deadline = None
            while True:
                raw = self._reader.readline(timeout=self._idle_timeout)
                if raw is None:
                    if _rail_c_gate_pending(self._region_id):
                        if gate_deadline is None:
                            gate_deadline = _gate_grace_deadline(self._idle_timeout)
                        if time.monotonic() < gate_deadline:
                            continue
                    idle = True
                    break
                if not raw:
                    break
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
                    self._resolved_model = obj.get("model") or self._resolved_model
                if t == "assistant":
                    _collect_call(obj, calls, seen_calls, self._active_model,
                                  self._cache_ttl)
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
                    usage_final = obj.get("usage", {}) or {}
                    in_tok = usage_final.get("input_tokens", 0)
                    out_tok = usage_final.get("output_tokens", 0)
                    cache_read = usage_final.get("cache_read_input_tokens", 0)
                    cache_creation = usage_final.get("cache_creation_input_tokens", 0)
                    break
        except GeneratorExit:
            drained = self._interrupt_and_drain()
            if drained:
                usage_final = drained
                in_tok = usage_final.get("input_tokens", 0)
                out_tok = usage_final.get("output_tokens", 0)
                cache_read = usage_final.get("cache_read_input_tokens", 0)
                cache_creation = usage_final.get("cache_creation_input_tokens", 0)
            raise
        finally:
            if metrics_sink is not None:
                metrics_sink.clear()
                metrics_sink.update(_metrics())

        turn_metrics = _metrics()
        if usage_final is None:
            if idle:
                drained = self._interrupt_and_drain()
                if drained:
                    usage_final = drained
                    in_tok = usage_final.get("input_tokens", 0)
                    out_tok = usage_final.get("output_tokens", 0)
                    cache_read = usage_final.get("cache_read_input_tokens", 0)
                    cache_creation = usage_final.get("cache_creation_input_tokens", 0)
                    turn_metrics = _metrics()
                note = (f"\n[tool run ended — nothing from the CLI for "
                        f"{int(self._idle_timeout)}s. The session is still live; "
                        f"try again.]\n")
                detail = self._stderr.text() if self._stderr is not None else ""
                if detail:
                    note += detail + "\n"
                yield ("content", note)
            else:
                note = self._failure_note(self._proc, self._stderr, idle)
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
        return killed


class LiteRTProvider:

    def __init__(self):
        self._engines = {}

    def _scan(self):
        d = LITERT_MODELS_DIR
        if not os.path.isdir(d):
            return {}
        return {os.path.splitext(f)[0]: os.path.join(d, f)
                for f in os.listdir(d) if f.endswith(".litertlm")}

    def available(self):
        return bool(self._scan())

    def list_models(self):
        return sorted(self._scan())

    def handles(self, model):
        return model in self._scan()

    def _engine(self, model):
        import litert_lm
        path = self._scan()[model]
        eng = self._engines.get(path)
        if eng is None:
            eng = litert_lm.Engine(path, backend=litert_lm.Backend.GPU(),
                                   audio_backend=litert_lm.Backend.GPU())
            self._engines[path] = eng
        return eng

    def unload(self, model=None):
        if model is None:
            paths = list(self._engines)
        else:
            scan = self._scan()
            paths = [scan[model]] if model in scan else []
        n = 0
        for p in paths:
            eng = self._engines.pop(p, None)
            if eng is not None:
                try: eng.close()
                except Exception: pass
                n += 1
        return n

    def chat(self, messages, model=None, litert_mode=None, **_kwargs):
        target = model or (self.list_models() or [None])[0]
        if target is None or not self.handles(target):
            yield ("content", "[LiteRT] no .litertlm model found in models/ — download one first\n")
            yield ("metrics", {"in_tokens": 0, "out_tokens": 0, "duration_ns": 0})
            return
        eng = self._engine(target)
        system_text, history, last = self._translate(messages)
        conv = eng.create_conversation(
            messages=history or None,
            system_message=system_text or None,
            automatic_tool_calling=False,
        )
        yield from self._stream(conv, last)

    def _stream(self, conv, contents):
        import time as _t
        start = _t.monotonic_ns()
        out_chars = 0
        try:
            for chunk in conv.send_message_async(contents):
                for block in (chunk.get("content") or []):
                    if isinstance(block, dict) and block.get("type") == "text":
                        t = block.get("text", "")
                        out_chars += len(t)
                        yield ("content", t)
        except GeneratorExit:
            try: conv.cancel_process()
            except Exception: pass
            raise
        in_tok = getattr(conv, "token_count", 0) or 0
        yield ("metrics", {
            "in_tokens": in_tok,
            "out_tokens": max(1, out_chars // 4),
            "duration_ns": _t.monotonic_ns() - start,
        })

    def _content_parts(self, m):
        from litert_lm import Content
        text = m.get("content") or ""
        parts = [Content.Text(text)] if text else []
        for item in (m.get("media") or []):
            raw = base64.b64decode(item["data_b64"])
            if item.get("kind") == "audio":
                parts.append(Content.AudioBytes(normalize_audio(raw, item.get("mime"))))
            elif item.get("kind") == "image":
                parts.append(Content.ImageBytes(raw))
        return parts

    def _translate(self, messages):
        from litert_lm import Contents, Message
        system_text = "\n\n".join(m["content"] for m in messages
                                  if m["role"] == "system" and m.get("content"))
        non_system = [m for m in messages if m["role"] != "system"]
        if not non_system:
            return system_text, [], Contents.of("")
        *history_msgs, last = non_system
        history = []
        for m in history_msgs:
            parts = self._content_parts(m)
            contents = Contents.of(*parts) if parts else Contents.of("")
            history.append(Message.model(contents) if m["role"] == "assistant"
                           else Message.user(contents))
        last_parts = self._content_parts(last)
        return system_text, history, (Contents.of(*last_parts) if last_parts else Contents.of(""))


class LiteRTPersistentProvider(LiteRTProvider):

    def __init__(self):
        super().__init__()
        self._conv = None
        self._active_model = None
        self._sent_count = 0

    def reset(self):
        if self._conv is not None:
            try: self._conv.close()
            except Exception: pass
        self._conv = None
        self._active_model = None
        self._sent_count = 0

    def chat(self, messages, model=None, litert_mode=None, **_kwargs):
        target = model or (self.list_models() or [None])[0]
        if target is None or not self.handles(target):
            yield ("content", "[LiteRT/persistent] no .litertlm model found in models/\n")
            yield ("metrics", {"in_tokens": 0, "out_tokens": 0, "duration_ns": 0})
            return
        if self._conv is None or target != self._active_model:
            yield from self._prime(messages, target)
        else:
            yield from self._send_turn(messages)

    def _prime(self, messages, model):
        self.reset()
        eng = self._engine(model)
        system_text, history, last = self._translate(messages)
        self._conv = eng.create_conversation(
            messages=history or None, system_message=system_text or None,
            automatic_tool_calling=False)
        self._active_model = model
        self._sent_count = len(messages)
        yield from self._stream(self._conv, last)

    def _send_turn(self, messages):
        from litert_lm import Contents
        new = messages[self._sent_count:]
        self._sent_count = len(messages)
        parts = []
        for m in new:
            if m["role"] in ("system", "assistant"):
                continue
            parts.extend(self._content_parts(m))
        if not parts:
            yield ("metrics", {"in_tokens": getattr(self._conv, "token_count", 0) or 0,
                               "out_tokens": 0, "duration_ns": 0})
            return
        yield from self._stream(self._conv, Contents.of(*parts))


class LlamaCppProvider:

    MODELS = list(LLAMACPP_MODELS)

    def __init__(self, base_url=None):
        self.base_url = (base_url or os.environ.get("LLAMACPP_BASE_URL")
                          or f"http://127.0.0.1:{LLAMACPP_PORT}").rstrip("/")
        self._proc = None
        self._serving = None
        atexit.register(self.stop)

    def available(self) -> bool:
        try:
            r = requests.get(f"{self.base_url}/health", timeout=3)
            return r.status_code == 200
        except requests.exceptions.RequestException:
            return False

    def list_models(self):
        return list(self.MODELS)

    def ensure_serving(self, model, io=None):
        say = io.out if io else (lambda *a, **k: None)
        spec = LLAMACPP_MODELS.get(model)
        if not spec:
            say(f"  [llamacpp] unknown model '{model}'"); return False
        gguf, mmproj = spec
        if not (gguf and os.path.isfile(gguf)):
            say(f"  [llamacpp] model file missing: {gguf}"); return False
        if not (mmproj and os.path.isfile(mmproj)):
            say(f"  [llamacpp] mmproj (audio encoder) missing: {mmproj}"); return False
        if self._serving == model and self.available():
            say(f"  [llamacpp] {model} already up"); return True
        if not shutil.which("llama-server"):
            say("  [llamacpp] llama-server not found (brew install llama.cpp)"); return False
        self.stop(io)
        say(f"  [llamacpp] loading {model} … (one-model server, ~20-40s for a cold load)")
        self._proc = subprocess.Popen(
            ["llama-server", "-m", gguf, "--mmproj", mmproj,
             "--host", "127.0.0.1", "--port", str(LLAMACPP_PORT),
             "--jinja", "-ngl", str(LLAMACPP_NGL)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._serving = model
        for _ in range(180):
            time.sleep(1)
            if self._proc.poll() is not None:
                say("  [llamacpp] llama-server exited during load — check the model/mmproj pair")
                self._serving = None; return False
            if self.available():
                say(f"  [llamacpp] {model} ready"); return True
        say("  [llamacpp] timed out waiting for /health (server still loading?)")
        return False

    def stop(self, io=None):
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
            if io:
                io.out(f"  [llamacpp] stopped {self._serving}")
        self._proc = None
        self._serving = None

    def _to_openai_messages(self, messages):
        out = []
        for m in messages:
            role, text, media = m.get("role"), (m.get("content") or ""), m.get("media")
            if not media:
                out.append({"role": role, "content": text})
                continue
            parts = [{"type": "text", "text": text}] if text else []
            for item in media:
                if item.get("kind") == "audio":
                    raw = base64.b64decode(item["data_b64"])
                    norm = normalize_audio(raw, item.get("mime"))
                    parts.append({"type": "input_audio", "input_audio": {
                        "data": base64.b64encode(norm).decode(), "format": "wav"}})
                elif item.get("kind") == "image":
                    mime = item.get("mime", "image/png")
                    parts.append({"type": "image_url", "image_url": {
                        "url": f"data:{mime};base64,{item['data_b64']}"}})
            out.append({"role": role, "content": parts or text})
        return out

    def chat(self, messages, model=None, timeout=None, temperature=None, top_p=None,
             num_predict=None, seed=None, **_kwargs):
        body = {
            "model": model or self.MODELS[0],
            "messages": self._to_openai_messages(messages),
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if temperature is not None:
            body["temperature"] = temperature
        if top_p is not None:
            body["top_p"] = top_p
        if seed is not None:
            body["seed"] = seed
        if num_predict is not None:
            body["max_tokens"] = num_predict

        start = time.monotonic_ns()
        resp = requests.post(f"{self.base_url}/v1/chat/completions", json=body,
                             stream=True, timeout=timeout or (10, 600))
        resp.raise_for_status()

        in_tok = out_tok = 0
        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8") if isinstance(line, bytes) else line
            if not line.startswith("data: "):
                continue
            data = line[len("data: "):]
            if data == "[DONE]":
                break
            obj = json.loads(data)
            for choice in obj.get("choices", []):
                delta = choice.get("delta", {})
                if delta.get("content"):
                    yield ("content", delta["content"])
            usage = obj.get("usage")
            if usage:
                in_tok = usage.get("prompt_tokens", 0)
                out_tok = usage.get("completion_tokens", 0)
        yield ("metrics", {
            "in_tokens": in_tok, "out_tokens": out_tok,
            "duration_ns": time.monotonic_ns() - start,
        })


class Router:

    def __init__(self):
        self.ollama   = OllamaProvider()
        self.gemini   = GeminiProvider()
        self.litert   = LiteRTProvider()
        self.litert_p = LiteRTPersistentProvider()
        self.llamacpp = LlamaCppProvider()
        self.claude   = ClaudeProvider()
        self.codex    = CodexProvider()
        self.claude_p = {}
        self.model    = self.ollama.model

    def claude_provider_for(self, track_id, model):
        key = (track_id, model)
        p = self.claude_p.get(key)
        if p is None:
            p = ClaudePersistentProvider()
            self.claude_p[key] = p
        return p

    def claude_reattach(self, track_id, model, session_id, delivered_messages):
        key = (track_id, model)
        if key in self.claude_p:
            return False
        p = ClaudePersistentProvider(session_id=session_id)
        p.seed_delivered(delivered_messages)
        self.claude_p[key] = p
        return True

    def claude_session_id(self, track_id, model):
        p = self.claude_p.get((track_id, model))
        return p.claude_session_id if p is not None else None

    def claude_close_track(self, track_id):
        for key in [k for k in self.claude_p if k[0] == track_id]:
            self.claude_p.pop(key).shutdown()

    def claude_interrupt_track(self, track_id):
        n = 0
        for key, prov in list(self.claude_p.items()):
            if key[0] == track_id:
                try:
                    if prov.interrupt():
                        n += 1
                except Exception:
                    pass
        return n

    def _pick(self, model, litert_mode="oneshot", claude_mode="persistent", claude_track_id=None,
              provider=None):
        m = model or self.model
        if provider is not None:
            if provider == "codex":
                return self.codex
            raise ValueError(
                f"Router: unknown provider {provider!r} "
                f"(known explicit providers: 'codex'; pass provider=None to route by model name)"
            )
        kind = _provider_for(m)
        if kind == "codex":
            return self.codex
        if kind == "gemini":
            return self.gemini
        if kind == "llamacpp":
            return self.llamacpp
        if kind == "claude":
            return (self.claude_provider_for(claude_track_id, m)
                    if claude_mode == "persistent" else self.claude)
        if self.litert.handles(m):
            return self.litert_p if litert_mode == "persistent" else self.litert
        return self.ollama

    def available(self) -> bool:
        return (self.ollama.available() or self.gemini.available()
                or self.llamacpp.available() or self.claude.available())

    def list_models(self):
        models = []
        if self.ollama.available():
            models += self.ollama.list_models()
        if self.gemini.available():
            models += self.gemini.list_models()
        if self.litert.available():
            models += self.litert.list_models()
        if self.claude.available():
            models += self.claude.list_models()
        if self.codex.available():
            models += list(CODEX_MODELS)
        models += self.llamacpp.list_models()
        return models

    def chat(self, messages, model=None, litert_mode="oneshot", claude_mode="persistent",
             claude_track_id=None, provider=None, **kwargs):
        picked = self._pick(model, litert_mode, claude_mode, claude_track_id, provider)
        if picked is self.codex:
            if kwargs.get("workspace_root") is None:
                kwargs["workspace_root"] = kwargs.get("claude_root")
        return picked.chat(
            messages, model=model, claude_track_id=claude_track_id, **kwargs)

    def unload(self, model=None, track_id=None):
        if model is None:
            msgs = [self.ollama.unload(None)]
            n = self.litert.unload(None)
            if n: msgs.append(f"[litert] dropped {n} engine(s)")
            return "  ".join(x for x in msgs if x)
        if _provider_for(model) == "llamacpp":
            return "[llamacpp] external server — nothing to unload here"
        if _provider_for(model) == "codex":
            return "[codex] ephemeral subprocess — nothing to unload here"
        if _provider_for(model) == "claude":
            if track_id is not None:
                p = self.claude_p.pop((track_id, model), None)
                if p is None or not p.shutdown():
                    return "[claude] subprocess model — no live session"
                return "[claude] persistent session ended (this track only)"
            n = sum(1 for p in self.claude_p.values() if p.shutdown())
            self.claude_p.clear()
            return (f"[claude] {n} persistent session(s) ended" if n
                    else "[claude] subprocess model — no live session")
        if self.litert.handles(model):
            n = self.litert.unload(model)
            return f"[litert] dropped {n} engine(s)" if n else "[unload] not loaded"
        return self.ollama.unload(model)
