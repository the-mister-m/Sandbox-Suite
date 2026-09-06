#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request

ENDPOINT = "http://localhost:5000/api/policy/resolve-hook"

OUTCOME_ENDPOINT = "http://localhost:5000/api/policy/record-tool-outcome"

REQUEST_TIMEOUT_S = 3600

OUTCOME_REQUEST_TIMEOUT_S = 3

_BASH_WRITE_SIGNS = (">", ">>", "|", ";", "&&")
_BASH_READ_ONLY_CMDS = ("cat", "grep", "ls", "head", "tail", "wc", "find")


def _bash_edge(command):
    command = command or ""
    if any(sign in command for sign in _BASH_WRITE_SIGNS):
        return None
    leading = command.strip().split(" ", 1)[0] if command.strip() else ""
    if leading in _BASH_READ_ONLY_CMDS:
        return "check_read"
    return None


def _respond(decision, reason=None):
    out = {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow" if decision == "open" else "deny",
    }}
    if reason:
        out["hookSpecificOutput"]["permissionDecisionReason"] = reason
    print(json.dumps(out))
    sys.exit(0)


def _respond_post():
    print(json.dumps({}))
    sys.exit(0)


def _handle_pre(payload, region_id):
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    tool_use_id = payload.get("tool_use_id", "")

    body_obj = {
        "region_id": region_id,
        "tool_name": tool_name,
        "tool_input": tool_input,
        "tool_use_id": tool_use_id,
    }
    if tool_name == "Bash":
        edge = _bash_edge(tool_input.get("command"))
        if edge:
            body_obj["edge"] = edge
    body = json.dumps(body_obj).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            answer = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        _respond("locked", f"ADE hook endpoint unreachable: {e}")
        return

    decision = answer.get("decision", "locked")
    reason = (f"[{decision}: {tool_name} refused or parked by ADE policy — "
              "do not retry, a human will release it if parked]"
              if decision != "open" else None)
    _respond(decision, reason)


def _handle_post(payload, region_id):
    if not region_id:
        _respond_post()
        return

    body = json.dumps({
        "region_id": region_id,
        "tool_name": payload.get("tool_name", ""),
        "tool_input": payload.get("tool_input") or {},
        "tool_response": payload.get("tool_response"),
        "tool_use_id": payload.get("tool_use_id", ""),
        "duration_ms": payload.get("duration_ms"),
    }).encode("utf-8")
    req = urllib.request.Request(
        OUTCOME_ENDPOINT, data=body, method="POST",
        headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=OUTCOME_REQUEST_TIMEOUT_S)
    except (urllib.error.URLError, TimeoutError, OSError):
        pass
    _respond_post()


def main():
    region_id = os.environ.get("ADE_REGION_ID", "")

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        payload = {}

    event = payload.get("hook_event_name", "PreToolUse")

    if event == "PostToolUse":
        _handle_post(payload, region_id)
        return

    if not region_id:
        _respond("locked", "ADE hook: no ADE_REGION_ID in the subprocess environment")
        return
    if not payload:
        _respond("locked", "ADE hook: could not parse the tool-call JSON on stdin")
        return
    _handle_pre(payload, region_id)


if __name__ == "__main__":
    main()
