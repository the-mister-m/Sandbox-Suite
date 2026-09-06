
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from typing import Any, Iterator


CODEX_MODELS: tuple[str, ...] = ()
CODEX_IDLE_TIMEOUT = 300.0


def _zero_metrics() -> dict[str, Any]:
    return {
        "in_tokens": 0,
        "out_tokens": 0,
        "cache_read": 0,
        "cache_creation": 0,
        "cost_usd": 0.0,
        "duration_ns": 0,
    }


class _StderrTail:

    MAX_BYTES = 4096

    def __init__(self, proc: subprocess.Popen[bytes]):
        self._buf = b""
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._drain, args=(proc,), daemon=True)
        self._thread.start()

    def _drain(self, proc: subprocess.Popen[bytes]) -> None:
        assert proc.stderr is not None
        try:
            while chunk := proc.stderr.read(65536):
                with self._lock:
                    self._buf = (self._buf + chunk)[-self.MAX_BYTES:]
        except OSError:
            pass

    def text(self) -> str:
        self._thread.join(0.3)
        with self._lock:
            return self._buf.decode("utf-8", errors="replace").strip()


class CodexProvider:

    DEFAULT_MODEL: str | None = None

    def _get_binary(self) -> str | None:
        configured = os.environ.get("CODEX_EXECPATH")
        if configured and os.path.isfile(configured):
            return configured
        found = shutil.which("codex")
        if found:
            return found
        return None

    def available(self) -> bool:
        return self._get_binary() is not None

    def list_models(self) -> list[str]:
        return list(CODEX_MODELS) if self.available() else []

    def _build_cmd(self, binary: str, model: str | None, workspace_root: str | None) -> list[str]:
        cmd = [
            binary,
            "exec",
            "--json",
            "--ephemeral",
            "--sandbox",
            "read-only",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
        ]
        if workspace_root:
            cmd += ["--cd", workspace_root]
        if model:
            cmd += ["--model", model]
        return cmd

    @staticmethod
    def _render(messages: list[dict[str, Any]]) -> str:
        system_parts = [
            m.get("content") or ""
            for m in messages
            if m.get("role") == "system" and (m.get("content") or "")
        ]
        rows: list[tuple[str, str]] = []
        for message in messages:
            role = message.get("role")
            if role == "system":
                continue
            text = message.get("content") or ""
            image_count = sum(1 for item in (message.get("media") or [])
                              if item.get("kind") == "image")
            if image_count:
                text += f"\n\n[{image_count} image(s) attached — image input is not wired for CodexProvider]"
            if text.strip():
                rows.append(("assistant" if role == "assistant" else "user", text))

        instruction = """You are a text-only worker embedded in the ADE.
Do not use Codex tools, skills, plugins, shell commands, browser access, or
computer use. Do not inspect or modify the workspace. Answer only in plain
text. If work requires an ADE action, emit the ADE text action marker required
by the supplied system instructions; the ADE will gate and perform it itself."""
        if system_parts:
            instruction += "\n\nADE system instructions:\n" + "\n\n".join(system_parts)

        if not rows:
            return instruction
        if len(rows) == 1:
            body = rows[0][1]
        else:
            body = (
                "Conversation so far — you are the assistant. Reply only to the final user turn.\n\n"
                + "\n\n".join(f"{role}: {text}" for role, text in rows)
            )
        return instruction + "\n\n" + body

    @staticmethod
    def _item_text(item: dict[str, Any]) -> str:
        text = item.get("text") or item.get("content") or ""
        if isinstance(text, str):
            return text
        if isinstance(text, list):
            return "".join(
                part.get("text", "") for part in text
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            )
        return ""

    @staticmethod
    def _usage_metrics(event: dict[str, Any], start_ns: int) -> dict[str, Any]:
        usage = event.get("usage") or event.get("token_usage") or {}
        if not isinstance(usage, dict):
            usage = {}
        return {
            "in_tokens": usage.get("input_tokens", usage.get("prompt_tokens", 0)) or 0,
            "out_tokens": usage.get("output_tokens", usage.get("completion_tokens", 0)) or 0,
            "cache_read": usage.get("cached_input_tokens", usage.get("cache_read_input_tokens", 0)) or 0,
            "cache_creation": usage.get("cache_creation_input_tokens", 0) or 0,
            "cost_usd": 0.0,
            "duration_ns": time.monotonic_ns() - start_ns,
        }

    def chat(self, messages: list[dict[str, Any]], model: str | None = None,
             workspace_root: str | None = None, metrics_sink: dict[str, Any] | None = None,
             **_kwargs: Any) -> Iterator[tuple[str, Any]]:
        binary = self._get_binary()
        if not binary:
            yield ("content", "[CodexProvider] codex binary not found\n")
            yield ("metrics", _zero_metrics())
            return

        prompt = self._render(messages)
        cmd = self._build_cmd(binary, model or self.DEFAULT_MODEL, workspace_root)
        start_ns = time.monotonic_ns()
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        errtail = _StderrTail(proc)
        assert proc.stdin is not None and proc.stdout is not None

        try:
            proc.stdin.write(prompt.encode("utf-8"))
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass

        metrics = _zero_metrics()
        saw_terminal_event = False
        violations: list[str] = []
        try:
            for raw in iter(proc.stdout.readline, b""):
                try:
                    event = json.loads(raw.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
                    continue
                event_type = event.get("type", "")
                item = event.get("item") if isinstance(event.get("item"), dict) else None
                item_type = item.get("type") if item else None

                if event_type == "item.completed" and item_type == "agent_message":
                    text = self._item_text(item)
                    if text:
                        yield ("content", text)
                elif event_type == "item.completed" and item_type in {
                    "command_execution", "tool_call", "mcp_tool_call", "web_search",
                }:
                    violations.append(str(item_type))
                elif event_type in {"turn.completed", "turn.failed"}:
                    saw_terminal_event = True
                    metrics = self._usage_metrics(event, start_ns)
                    if event_type == "turn.failed":
                        error = event.get("error") or "Codex turn failed"
                        yield ("content", f"[CodexProvider] {error}\n")
        finally:
            if proc.poll() is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
            proc.wait()
            metrics["duration_ns"] = time.monotonic_ns() - start_ns
            if metrics_sink is not None:
                metrics_sink.clear()
                metrics_sink.update(metrics)

        if violations:
            kinds = ", ".join(sorted(set(violations)))
            yield ("content", f"[CodexProvider protocol violation: attempted {kinds}; no ADE tool call was forwarded]\n")
        elif not saw_terminal_event:
            detail = errtail.text()
            note = f"[CodexProvider exited without a completed turn (code {proc.returncode})]"
            if detail:
                note += "\n" + detail
            yield ("content", note + "\n")
        yield ("metrics", metrics)
