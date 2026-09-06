
import json
import os
import threading
from engine import SUITE_ROOT
from engine import read_tool as rt

LEVELS = ("check", "read", "write", "overwrite", "delete", "run")

HOOKS = ("open", "ask", "queue", "locked")

POLICY_PATH = os.path.join(SUITE_ROOT, "policy.json")

CHECK_READ_EDGES = {"read_file", "list_files", "view_image"}


def _edge_key(edge):
    return "check_read" if edge in CHECK_READ_EDGES else edge


def _default_rows():
    return [
        {"edge": "check_read",       "driver": "model", "scope": "inside",  "hook": "ask"},
        {"edge": "check_read",       "driver": "model", "scope": "outside", "hook": "ask"},
        {"edge": "fetch_url",        "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "screen_capture",   "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "write_file",       "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "run_command",      "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "remember",         "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "recall",           "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "send_message",     "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "request_messages", "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "logic_status",     "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "logic_open",       "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "logic_transport",  "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "logic_command",    "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "web_open",         "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "web_read",         "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "web_screenshot",   "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "web_act",          "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "web_eval",         "driver": "model", "scope": "any",     "hook": "ask"},
        {"edge": "default",          "driver": "human", "scope": "any",     "hook": "open"},
    ]


def _stat_mtime():
    try:
        return os.stat(POLICY_PATH).st_mtime_ns
    except OSError:
        return None


def _load():
    if os.path.exists(POLICY_PATH):
        try:
            with open(POLICY_PATH) as fh:
                rows = json.load(fh)
            if isinstance(rows, list) and rows:
                return rows
        except Exception:
            pass
    rows = _default_rows()
    _save(rows)
    return rows


def _save(rows):
    global _mtime
    try:
        with open(POLICY_PATH, "w") as fh:
            json.dump(rows, fh, indent=2)
        _mtime = _stat_mtime()
    except Exception:
        pass


_table = _load()

_mtime = _stat_mtime()

_reload_lock = threading.Lock()


def _match(rows, edge_key, driver, scope):
    for row in rows:
        if row["edge"] == edge_key and row["driver"] == driver and row["scope"] == scope:
            return row
    for row in rows:
        if row["edge"] == edge_key and row["driver"] == driver and row["scope"] == "any":
            return row
    return None


def _find_row(edge_key, driver, scope):
    row = _match(_table, edge_key, driver, scope)
    if row is not None:
        return row
    for row in _table:
        if row["edge"] == "default" and row["driver"] == driver and row["scope"] in (scope, "any"):
            return row
    return None


def resolve(edge, driver, ctx=None):
    if _stat_mtime() != _mtime:
        with _reload_lock:
            if _stat_mtime() != _mtime:
                reload()

    ctx = ctx or {}
    scope = ctx.get("scope", "inside")
    human_attached = ctx.get("human_attached", True)
    overlay = ctx.get("overlay")

    edge_key = _edge_key(edge)
    row = _match(overlay, edge_key, driver, scope) if overlay else None
    if row is None:
        row = _find_row(edge_key, driver, scope)
    hook = row["hook"] if row else "ask"

    if hook == "ask" and not human_attached:
        return "queue"
    return hook


def set_row(edge, driver, scope, hook):
    assert hook in HOOKS, f"unknown hook level: {hook!r}"
    edge_key = _edge_key(edge)
    for row in _table:
        if row["edge"] == edge_key and row["driver"] == driver and row["scope"] == scope:
            row["hook"] = hook
            _save(_table)
            return row
    row = {"edge": edge_key, "driver": driver, "scope": scope, "hook": hook}
    _table.append(row)
    _save(_table)
    return row


def get_row(edge, driver, scope="any"):
    return _find_row(_edge_key(edge), driver, scope)


def all_rows():
    return list(_table)


def reload():
    global _table, _mtime
    seen = _stat_mtime()
    try:
        with open(POLICY_PATH) as fh:
            rows = json.load(fh)
    except Exception:
        return
    if isinstance(rows, list) and rows:
        _table = rows
        _mtime = seen


TOOL_EDGES = {
    "Read":         "check_read",
    "Glob":         "check_read",
    "Grep":         "check_read",
    "NotebookRead": "check_read",
    "Write":        "write_file",
    "Edit":         "write_file",
    "NotebookEdit": "write_file",
    "Bash":         "run_command",
    "BashOutput":   "run_command",
    "KillShell":    "run_command",
    "WebFetch":     "fetch_url",
    "WebSearch":    "fetch_url",
}

_TARGET_KEYS = ("file_path", "notebook_path", "path", "command", "url",
                "pattern", "query")


def edge_for(tool_name):
    return TOOL_EDGES.get(tool_name, tool_name)


def target_of(input_data):
    for key in _TARGET_KEYS:
        if key in (input_data or {}):
            return str(input_data[key])
    return ""


def scope_of(tool_name, input_data):
    data = input_data or {}
    raw = data.get("file_path") or data.get("notebook_path") or data.get("path")
    if not raw:
        return "inside"
    try:
        return "outside" if rt.is_outside_root(rt._resolve(str(raw))) else "inside"
    except Exception:
        return "outside"
