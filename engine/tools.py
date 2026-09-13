
# The tool table. One row per tool: schema, marker, hint, gate prompt, executor.

import difflib
import json
import os
import re
import urllib.request

from engine import read_tool as rt
from engine import compiler
from engine import waypoint
from engine import tools_web


class Tool:

    __slots__ = ("name", "edge", "scope", "schema", "marker", "keyword",
                 "parse", "hint", "prompt", "run", "summary", "needs_region",
                 "fenced", "queue_type", "queue_identity", "denied")

    def __init__(self, name, edge, scope, schema, marker, keyword, parse, hint,
                 prompt, run, summary, needs_region=False, fenced=False,
                 queue_type=None, queue_identity=None, denied=None):
        self.name = name
        self.edge = edge
        self.scope = scope
        self.schema = schema
        self.marker = marker
        self.keyword = keyword
        self.parse = parse
        self.hint = hint
        self.prompt = prompt
        self.run = run
        self.summary = summary
        self.needs_region = needs_region
        self.fenced = fenced
        self.queue_type = queue_type or name
        self.queue_identity = queue_identity
        self.denied = denied or _denied_default(name)


# scope: "any" for a tool with no path, inside/outside for one that resolves a path

def _scope_any(args):
    return "any"


def _scope_path(args):
    path = (args or {}).get("path") or "."
    try:
        return "outside" if rt.is_outside_root(rt._resolve(path)) else "inside"
    except Exception:
        return "outside"


def _denied_default(name):
    def denied(sess, args):
        return f"[{name} denied by user: it was not performed]"
    return denied


# log extras: a row hands the dispatch the log_event fields the generic ones miss

def _log(sess, **fields):
    sess._tool_log = fields


def _region(sess):
    return getattr(sess, "region", None)


# ---------------------------------------------------------------- read_file

_READ_MARKER = re.compile(r"^\s*READ:\s*(.+?)\s*$", re.MULTILINE)

_READ_HINT = ("To READ, output a line:\n"
              "    READ: <relative/path>")

_READ_SCHEMA = {
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
}


def _boundary_prompt(op, full):
    return (f"⚠ outside workspace  [{op}]\n"
            f"root: {rt.WORKSPACE_ROOT}\n"
            f"path: {full}\n\n"
            f"allow? [y/N] ")


def _read_prompt(sess, args):
    full = rt._resolve(args.get("path", ""))
    if rt.is_outside_root(full):
        return _boundary_prompt("read", full)
    return f"read  {full}\n\napprove? [y/N] "


def _read_run(sess, args):
    path = args.get("path", "")
    result = rt.read_file(path)
    lines = result.splitlines()
    _log(sess, detail="\n".join(ln[:120] for ln in lines[:4]))
    return result


def _read_summary(args, result):
    text = result[0] if isinstance(result, tuple) else result
    return f"{len(text)} chars, {len(text.splitlines())} lines"


def _read_denied(sess, args):
    path = args.get("path", "")
    if rt.is_outside_root(rt._resolve(path)):
        return f"[READ denied: '{path}' is outside the workspace and access was refused]"
    return f"[READ denied by user: '{path}' was not read]"


# ---------------------------------------------------------------- list_files

_LIST_MARKER = re.compile(r"^\s*LIST:\s*(.*?)\s*$", re.MULTILINE)

_LIST_HINT = ("To LIST a directory, output a line:\n"
              "    LIST: <relative/path>   (omit the path to list the project root)")

_LIST_SCHEMA = {
    "type": "function",
    "function": {
        "name": "list_files",
        "description": "List the files and subdirectories in a project directory. "
                       "Directories end with '/'; files show their byte size.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string",
                         "description": "Relative directory path. Defaults to the project root."},
                "recursive": {"type": "boolean",
                              "description": "Walk subdirectories too. Defaults to false."},
                "show_size": {"type": "boolean",
                              "description": "Show each file's byte size. Defaults to true."},
                "show_hidden": {"type": "boolean",
                                "description": "Include dotfiles and __pycache__. Defaults to false."},
            },
            "required": [],
        },
    },
}


def _list_prompt(sess, args):
    full = rt._resolve(args.get("path") or ".")
    if rt.is_outside_root(full):
        return _boundary_prompt("list", full)
    return f"list  {full}\n\napprove? [y/N] "


def _list_run(sess, args):
    result = rt.list_files(args.get("path") or ".",
                           recursive=bool(args.get("recursive", False)),
                           show_size=bool(args.get("show_size", True)),
                           show_hidden=bool(args.get("show_hidden", False)))
    entries = [l for l in result.splitlines() if l.strip()]
    _log(sess, detail="\n".join(entries[:8]))
    return result


def _list_summary(args, result):
    text = result[0] if isinstance(result, tuple) else result
    return f"{len([l for l in text.splitlines() if l.strip()])} entries"


def _list_denied(sess, args):
    path = args.get("path") or "."
    if rt.is_outside_root(rt._resolve(path)):
        return f"[LIST denied: '{path}' is outside the workspace and access was refused]"
    return f"[LIST denied by user: '{path}' was not listed]"


# ---------------------------------------------------------------- write_file

_WRITE_MARKER = re.compile(
    r"^[ \t]*WRITE:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*---BEGIN---[ \t]*\r?\n"
    r"(.*?)"
    r"^[ \t]*---END---[ \t]*$",
    re.MULTILINE | re.DOTALL,
)

_WRITE_HINT = ("To WRITE, output:\n"
               "    WRITE: <relative/path>\n"
               "    ---BEGIN---\n"
               "    <full file contents>\n"
               "    ---END---")

_WRITE_SCHEMA = {
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
}


def _write_prompt(sess, args):
    path, content = args.get("path", ""), args.get("content", "")
    existing = rt.file_exists(path)
    lines = [f"write  {path}  [{'overwrite' if existing else 'create'}]"]
    if rt.is_outside_root(rt._resolve(path)):
        lines.append("⚠ outside workspace root")
    if existing:
        diff = "".join(difflib.unified_diff(
            rt.read_file(path).splitlines(keepends=True),
            content.splitlines(keepends=True),
            fromfile=path, tofile=path, n=2))
        lines.append(diff.rstrip() if diff else "(no change)")
    else:
        lines.append(content.rstrip())
    return "\n".join(lines) + "\n\napply? [y/N] "


def _write_run(sess, args):
    path, content = args.get("path", ""), args.get("content", "")
    prior = None
    try:
        from engine import ledger
        prior = ledger.prior_state(path)
    except Exception:
        pass
    result = rt.write_file(path, content)
    wrote = result.startswith("[WRITE ok:")
    on_write = getattr(sess.io, "on_write", None)
    if on_write:
        on_write(path)
    if wrote:
        _log(sess, _full=content, _prior=prior)
    else:
        _log(sess, _full=None, failed=True)
    return result


def _write_summary(args, result):
    text = result[0] if isinstance(result, tuple) else result
    if not text.startswith("[WRITE ok:"):
        return text
    content = args.get("content", "")
    return f"{len(content)} chars, {len(content.splitlines())} lines"


def _write_denied(sess, args):
    return f"[WRITE denied by user: '{args.get('path', '')}' was not written]"


# ---------------------------------------------------------------- run_command

_RUN_MARKER = re.compile(r"^\s*RUN:\s*(.+?)\s*$", re.MULTILINE)

_RUN_HINT = ("To RUN a shell command, output a line:\n"
             "    RUN: <shell command>")

_RUN_SCHEMA = {
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
}


def _run_run(sess, args):
    command = args.get("command", "")
    sess.io.term(f"$ {command}\n")
    return rt.run_command(command, on_output=sess.io.term)


def _run_summary(args, result):
    text = result[0] if isinstance(result, tuple) else result
    return next((l for l in text.splitlines() if l.strip()), "")[:120]


# ---------------------------------------------------------------- view_image

_VIEW_IMAGE_MARKER = re.compile(r"^\s*VIEW_IMAGE:\s*(.+?)\s*$", re.MULTILINE)

_VIEW_IMAGE_HINT = ("To VIEW an image file and have the model see its pixels, output a line:\n"
                    "    VIEW_IMAGE: <relative/path>")

_VIEW_IMAGE_SCHEMA = {
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
                "path": {"type": "string", "description": "Relative path to the image file."},
            },
            "required": ["path"],
        },
    },
}


def _view_prompt(sess, args):
    full = rt._resolve(args.get("path", ""))
    if rt.is_outside_root(full):
        return _boundary_prompt("view_image", full)
    return f"view_image  {full}\n\napprove? [y/N] "


def _media_summary(label):
    def summary(args, result):
        media = result[1] if isinstance(result, tuple) else None
        return f"{label}  {len(media[0]['data_b64'])} b64 chars" if media else "failed"
    return summary


def _view_denied(sess, args):
    path = args.get("path", "")
    if rt.is_outside_root(rt._resolve(path)):
        return (f"[VIEW_IMAGE denied: '{path}' is outside the workspace "
                f"and access was refused]", [])
    return (f"[VIEW_IMAGE denied by user: '{path}' was not viewed]", [])


# ---------------------------------------------------------------- screen_capture

_SCREEN_MARKER = re.compile(r"^\s*SCREEN_CAPTURE:?\s*(.*?)\s*$", re.MULTILINE)

_SCREEN_HINT = ("To SEE THE HUMAN'S SCREEN (their actual monitor, not a file), output a line:\n"
                "    SCREEN_CAPTURE: <display number, or x,y,w,h for a region>   "
                "(omit the argument for the main display — a human approves every capture)")

_SCREEN_SCHEMA = {
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
                    "description": ("Which display to capture, 1-based. 1 is the main "
                                    "display. Ignored if 'region' is given."),
                },
                "region": {
                    "type": "string",
                    "description": ("Optional 'x,y,w,h' rectangle in global screen "
                                    "coordinates. Use to zoom in on part of a display "
                                    "you already captured."),
                },
            },
            "required": [],
        },
    },
}


def _screen_what(args):
    region = str(args.get("region", "") or "")
    display = args.get("display", 1) or 1
    return f"region {region}" if region else f"display {display}"


def _screen_prompt(sess, args):
    return f"SEE YOUR SCREEN  ({_screen_what(args)})\n\napprove? [y/N] "


def _screen_run(sess, args):
    region = str(args.get("region", "") or "")
    display = args.get("display", 1) or 1
    text, media = rt.screen_capture(display=display, region=region)
    _log(sess, target=_screen_what(args))
    return text, media


def _screen_denied(sess, args):
    what = _screen_what(args)
    return f"[SCREEN_CAPTURE denied by user: {what} was not captured]", []


# ---------------------------------------------------------------- fetch_url

_FETCH_MARKER = re.compile(r"^\s*FETCH:\s*(.+?)\s*$", re.MULTILINE)

_FETCH_HINT = ("To FETCH a URL and get the page as plain text, output a line:\n"
               "    FETCH: <url>   (http:// or https:// only — a human approves before it runs)")

_FETCH_SCHEMA = {
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
                "url": {"type": "string",
                        "description": "The URL to fetch (http:// or https:// only)."},
            },
            "required": ["url"],
        },
    },
}


def _chars_summary(args, result):
    text = result[0] if isinstance(result, tuple) else result
    return f"{len(text)} chars"


# ---------------------------------------------------------------- remember

_REMEMBER_MARKER = re.compile(
    r"^[ \t]*REMEMBER:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*CARRY:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*PIN:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*BODY:[ \t]*(.*)",
    re.MULTILINE | re.DOTALL,
)

_REMEMBER_HINT = (
    "To keep a personal memory, output:\n"
    "    REMEMBER: <a few words>\n"
    "    CARRY: <the essence, 20-50% of the body, standalone prose>\n"
    "    PIN: <user|agent|none>\n"
    "    BODY: <the memory in full — write long and reflective, length is not a concern>\n\n"
    "  PIN 'user' = the Captain asked you to remember this (carry goes to usermemory.md)\n"
    "  PIN 'agent' = your own choice to carry it up front (carry goes to agentmemory.md)\n"
    "  PIN 'none' = your own choice, keep it in the store only (no carry pointer)\n"
    "  BODY always goes to your long-form memory store regardless of PIN.")

_REMEMBER_SCHEMA = {
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
}


def _remember_prompt(sess, args):
    return f"remember  {args.get('title', '')}  → {args.get('pin', 'none')}\n\napprove? [y/N] "


def _remember_run(sess, args):
    nick = getattr(sess, "nick", None)
    if not nick or not compiler.resolve_agent(nick):
        return "[remember refused: no identity bound]"
    path = compiler.remember(nick, args.get("title", ""), args.get("carry", ""),
                             args.get("body", ""), args.get("pin", "none"))
    if not path:
        return "[remember refused: no identity bound]"
    _log(sess, target=nick)
    return f"[memory kept: {os.path.basename(path)}]"


def _remember_summary(args, result):
    return f"{args.get('title', '')[:80]} → {args.get('pin', 'none')}"


def _remember_denied(sess, args):
    return f"[REMEMBER denied by user: '{args.get('title', '')}' was not kept]"


# ---------------------------------------------------------------- recall

_RECALL_MARKER = re.compile(r"^\s*RECALL:\s*(.+?)\s*$", re.MULTILINE)

_RECALL_HINT = ("To search your own memory store, output a line:\n"
                "    RECALL: <query>")

_RECALL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "recall",
        "description": "Search your own long-form memory store (your memories/ folder, "
                       "recursive) for a query string. Returns matching lines with their "
                       "file and a little surrounding context.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string",
                          "description": "Text to search for in your memory store."},
            },
            "required": ["query"],
        },
    },
}


def _recall_prompt(sess, args):
    return f"recall  {args.get('query', '')!r}\n\napprove? [y/N] "


def _recall_run(sess, args):
    nick = getattr(sess, "nick", None)
    folder = compiler.resolve_agent(nick) if nick else None
    if not folder:
        return "[recall refused: no identity bound]"
    _log(sess, target=nick)
    return rt.recall_memory(os.path.join(folder, "memories"), args.get("query", ""))


def _recall_summary(args, result):
    return args.get("query", "")[:80]


def _recall_denied(sess, args):
    return f"[RECALL denied by user: {args.get('query', '')!r} was not searched]"


# ---------------------------------------------------------------- send_message

_SEND_MARKER = re.compile(
    r"^[ \t]*SEND:[ \t]*(.+?)[ \t]*\r?\n"
    r"^[ \t]*---BEGIN---[ \t]*\r?\n"
    r"(.*?)"
    r"^[ \t]*---END---[ \t]*$",
    re.MULTILINE | re.DOTALL,
)

_SEND_HINT = (
    "To SEND a message to one or more other agents, output:\n"
    "    SEND: <peer1>[, <peer2>...]\n"
    "    (prefer the EXACT id from YOUR PEERS — guaranteed to land; a unique name "
    "or seat of a live peer also resolves)\n"
    "    ---BEGIN---\n"
    "    <message body>\n"
    "    ---END---")

_SEND_SCHEMA = {
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
}


def _send_receivers(args):
    recv = args.get("receivers", [])
    return recv if isinstance(recv, list) else []


def _send_prompt(sess, args):
    return (f"send  → {', '.join(str(r) for r in _send_receivers(args))}\n\n"
            f"{args.get('body', '')}\n\napprove? [y/N] ")


def _send_run(sess, args):
    receivers = args.get("receivers", [])
    body = args.get("body", "")
    sender = _region(sess)
    if not isinstance(receivers, list) or not receivers or not all(
        isinstance(r, str) and r.strip() for r in receivers
    ):
        return "[send refused: receivers must be a list of track names]"
    if not isinstance(body, str):
        return "[send refused: body must be text]"
    if sender in receivers:
        return "[send refused: cannot send a message to yourself]"
    _log(sess, target=", ".join(receivers))
    return rt.send_message(sender, receivers, body)


def _send_summary(args, result):
    return (f"{len(args.get('body', ''))} chars to "
            f"{len(_send_receivers(args))} receiver(s)")


def _send_denied(sess, args):
    waypoint.append_denied(_region(sess), _send_receivers(args), args.get("body", ""))
    return "[send denied]"


# ---------------------------------------------------------------- request_messages

_REQUEST_MARKER = re.compile(r"^\s*REQUEST:?\s*(.*?)\s*$", re.MULTILINE)

_REQUEST_HINT = (
    "To READ your own messages from other agents, output a line:\n"
    "    REQUEST: <since_id, optional — omit to see everything you're on>\n"
    "    (you only see lines you sent, received, or were denied on — a human "
    "approves before it runs)")

_REQUEST_SCHEMA = {
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
}


def _request_prompt(sess, args):
    since_id = args.get("since_id")
    scope_desc = f"since #{since_id}" if since_id is not None else "everything you're on"
    return f"request messages  ({scope_desc})\n\napprove? [y/N] "


def _request_run(sess, args):
    since_id = args.get("since_id")
    caller = _region(sess)
    if since_id is not None and (
        isinstance(since_id, bool) or not isinstance(since_id, int)
    ):
        return "[request refused: since_id must be a whole number]"
    _log(sess, target=caller)
    return rt.request_messages(caller, since_id)


def _request_summary(args, result):
    since_id = args.get("since_id")
    return f"since_id={since_id}" if since_id is not None else "all"


def _request_denied(sess, args):
    waypoint.append_denied(_region(sess), [], "")
    return "[request denied]"


# ---------------------------------------------------------------- web

_WEB_OPEN_MARKER = re.compile(r"^\s*WEB_OPEN:\s*(.+?)\s*$", re.MULTILINE)
_WEB_READ_MARKER = re.compile(r"^\s*WEB_READ\s*$", re.MULTILINE)
_WEB_SCREENSHOT_MARKER = re.compile(r"^\s*WEB_SCREENSHOT\s*$", re.MULTILINE)
_WEB_ACT_MARKER = re.compile(r"^\s*WEB_ACT:\s*(.+?)\s*$", re.MULTILINE)
_WEB_EVAL_MARKER = re.compile(r"^\s*WEB_EVAL:\s*(.+?)\s*$", re.MULTILINE)

_WEB_OPEN_HINT = ("To open a URL in the browser channel, output a line:\n"
                  "    WEB_OPEN: <url>   (http:// or https:// — a human approves before it runs)")
_WEB_READ_HINT = ("To read the current page's visible text, output a line:\n"
                  "    WEB_READ")
_WEB_SCREENSHOT_HINT = ("To take a screenshot of the current page, output a line:\n"
                        "    WEB_SCREENSHOT")
_WEB_ACT_HINT = ("To click or type into the current page, output a line:\n"
                 "    WEB_ACT: <css selector> | click|type | <text, only if typing>   "
                 "(a human approves before it runs)")
_WEB_EVAL_HINT = ("To run JavaScript in the current page and get its return value, output a line:\n"
                  "    WEB_EVAL: <javascript expression, one line>   (a human approves before it runs)")

_WEB_OPEN_SCHEMA = {
    "type": "function",
    "function": {
        "name": "web_open",
        "description": ("Navigate the browser channel's headless Chrome tab to a URL. "
                        "A human approves before it runs."),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string",
                        "description": "The URL to open (http:// or https://)."},
            },
            "required": ["url"],
        },
    },
}

_WEB_READ_SCHEMA = {
    "type": "function",
    "function": {
        "name": "web_read",
        "description": ("Read the current page's visible text (innerText) from the browser "
                        "channel. Reads whatever page web_open last navigated to."),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}

_WEB_SCREENSHOT_SCHEMA = {
    "type": "function",
    "function": {
        "name": "web_screenshot",
        "description": "Take a screenshot of the current page in the browser channel "
                       "and return the image.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}

_WEB_ACT_SCHEMA = {
    "type": "function",
    "function": {
        "name": "web_act",
        "description": ("Click or type into an element on the current page via a CSS "
                        "selector. A human approves before it runs."),
        "parameters": {
            "type": "object",
            "properties": {
                "selector": {"type": "string",
                             "description": "CSS selector for the target element."},
                "action": {"type": "string", "description": "One of: click, type."},
                "text": {"type": "string",
                         "description": "Text to type — only used when action is 'type'."},
            },
            "required": ["selector", "action"],
        },
    },
}

_WEB_EVAL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "web_eval",
        "description": ("Evaluate arbitrary JavaScript in the current page and return its "
                        "value. Unbounded — the browser channel's run_command equivalent. "
                        "A human approves before it runs."),
        "parameters": {
            "type": "object",
            "properties": {
                "js": {"type": "string", "description": "JavaScript expression to evaluate."},
            },
            "required": ["js"],
        },
    },
}


def _head_summary(args, result):
    text = result[0] if isinstance(result, tuple) else result
    return text[:120]


def _web_open_run(sess, args):
    return tools_web.web_open(args.get("url", ""))


def _web_read_run(sess, args):
    _log(sess, target="browser")
    return tools_web.web_read()


def _web_screenshot_run(sess, args):
    _log(sess, target="browser")
    return tools_web.web_screenshot()


def _web_act_run(sess, args):
    return tools_web.web_act(args.get("selector", ""), args.get("action", ""),
                             args.get("text", ""))


def _web_eval_run(sess, args):
    _log(sess, target=args.get("js", "")[:80])
    return tools_web.web_eval(args.get("js", ""))


def _web_act_prompt(sess, args):
    action, selector = args.get("action", ""), args.get("selector", "")
    detail = f"{action} on {selector!r}" + (f"  text={args.get('text', '')!r}"
                                            if action == "type" else "")
    return f"web_act  {detail}\n\napprove? [y/N] "


def _web_screenshot_denied(sess, args):
    return "[web_screenshot denied by user: screenshot was not taken]", []


# ---------------------------------------------------------------- initiate

_INITIATE_MARKER = re.compile(r"^\s*INITIATE\s*$", re.MULTILINE)

_INITIATE_HINT = (
    "To START THE NEXT NODE after you, output a line on its own:\n"
    "    INITIATE\n"
    "    (no argument — the cable a human drew already says which node follows "
    "you, and if nothing follows you this does nothing)")

_INITIATE_SCHEMA = {
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
}


def _initiate_run(sess, args):
    caller = _region(sess)
    _log(sess, target=caller or "-")
    return rt.initiate(caller)


def _whole_summary(args, result):
    return result[0] if isinstance(result, tuple) else result


# ---------------------------------------------------------------- reset

_RESET_REGION_MARKER = re.compile(r"^\s*RESET_REGION:\s*(.+?)\s*$", re.MULTILINE)
_RESET_SELF_MARKER = re.compile(r"^\s*RESET_SELF\s*$", re.MULTILINE)

_RESET_SELF_HINT = (
    "To RESET YOUR OWN REGION — same track, same settings, clean context, no "
    "memory of this run — output a line on its own:\n"
    "    RESET_SELF\n"
    "    (no argument. Your transcript and your cache are thrown away and you "
    "come back as the agent you were authored as. A human approves it, and the "
    "track has to allow it at all.)")

_RESET_REGION_HINT = (
    "To RESET ANOTHER REGION the same way, output a line:\n"
    "    RESET_REGION: <peer>\n"
    "    (prefer the EXACT id from YOUR PEERS; a unique name or seat of a live "
    "peer also resolves. That peer's own track has to allow being reset, and a "
    "human approves it.)")

_RESET_SELF_SCHEMA = {
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
}

_RESET_REGION_SCHEMA = {
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
}


def _reset_self_prompt(sess, args):
    name = getattr(sess, "region_name", None) or _region(sess)
    return (f"RESET  {name}\n\ncontext, transcript and cache thrown "
            f"away; same track, same settings\n\napprove? [y/N] ")


def _reset_self_run(sess, args):
    caller = _region(sess)
    if not sess.settings.get("allow_agent_reset"):
        _log(sess, target=caller)
        return ("[reset refused: this track does not allow an agent to reset "
                "it. A human turns that on in the track menu.]")
    _log(sess, target=caller)
    return rt.reset_self(caller)


def _reset_self_denied(sess, args):
    return "[reset_self denied by user: the region was not reset]"


def _reset_region_prompt(sess, args):
    return (f"RESET ANOTHER REGION  → {args.get('region', '')}\n\n"
            f"context, transcript and cache thrown away\n\napprove? [y/N] ")


def _reset_region_run(sess, args):
    target = (args.get("region") or "").strip()
    if not target:
        return "[reset: no region named]"
    _log(sess, target=target)
    return rt.reset_region(_region(sess), target)


def _reset_region_denied(sess, args):
    return f"[reset_region denied by user: '{args.get('region', '')}' was not reset]"


# ---------------------------------------------------------------- widget_bus_emit

_SUITE_PORT = 5000  # matches server.py app.run port

_BUS_MARKER = re.compile(r"^\s*BUS:\s*(\S+)\s+(\{.*\})\s*$", re.MULTILINE)

_BUS_HINT = ("To EMIT on the widget bus, output a line:\n"
             "    BUS: <channel> <json payload>")

_BUS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "widget_bus_emit",
        "description": "Emit a payload on a widget bus channel.",
        "parameters": {
            "type": "object",
            "properties": {
                "channel": {"type": "string", "description": "Widget bus channel."},
                "payload": {"type": "object", "description": "JSON payload to emit."},
            },
            "required": ["channel", "payload"],
        },
    },
}


def _bus_parse(m):
    try:
        payload = json.loads(m.group(2))
    except ValueError:
        return None
    return {"channel": m.group(1), "payload": payload}


def _bus_prompt(sess, args):
    return f"emit {args.get('channel', '')} on the widget bus\n\napprove? [y/N] "


def _bus_run(sess, args):
    channel = args.get("channel", "")
    body = json.dumps({"channel": channel, "payload": args.get("payload")}).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:{_SUITE_PORT}/api/widget-bus", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5):
            pass
        return f"[bus: emitted {channel}]"
    except Exception as e:
        return f"[bus failed: {e}]"


def _bus_summary(args, result):
    return f"{args.get('channel', '')}"


# ---------------------------------------------------------------- the table

TOOLS = [
    Tool("write_file", "write_file", _scope_any, _WRITE_SCHEMA,
         _WRITE_MARKER, "WRITE",
         lambda m: {"path": m.group(1), "content": m.group(2)},
         _WRITE_HINT, _write_prompt, _write_run, _write_summary,
         fenced=True, queue_type="write", denied=_write_denied),

    Tool("send_message", "send_message", _scope_any, _SEND_SCHEMA,
         _SEND_MARKER, "SEND",
         lambda m: {"receivers": [r.strip() for r in m.group(1).split(",") if r.strip()],
                    "body": m.group(2)},
         _SEND_HINT, _send_prompt, _send_run, _send_summary,
         needs_region=True, fenced=True, queue_type="send",
         queue_identity="sender", denied=_send_denied),

    Tool("remember", "remember", _scope_any, _REMEMBER_SCHEMA,
         _REMEMBER_MARKER, "REMEMBER",
         lambda m: {"title": m.group(1), "carry": m.group(2),
                    "pin": m.group(3), "body": m.group(4)},
         _REMEMBER_HINT, _remember_prompt, _remember_run, _remember_summary,
         fenced=True, queue_type="remember", denied=_remember_denied),

    Tool("run_command", "run_command", _scope_any, _RUN_SCHEMA,
         _RUN_MARKER, "RUN",
         lambda m: {"command": m.group(1)},
         _RUN_HINT,
         lambda sess, a: f"run\n\n  $ {a.get('command', '')}\n\napprove? [y/N] ",
         _run_run, _run_summary, queue_type="run",
         denied=lambda sess, a: "[RUN denied by user: command was not executed]"),

    Tool("view_image", "check_read", _scope_path, _VIEW_IMAGE_SCHEMA,
         _VIEW_IMAGE_MARKER, "VIEW_IMAGE",
         lambda m: {"path": m.group(1)},
         _VIEW_IMAGE_HINT, _view_prompt,
         lambda sess, a: rt.view_image(a.get("path", "")),
         _media_summary("image"), queue_type="read", denied=_view_denied),

    Tool("screen_capture", "screen_capture", _scope_any, _SCREEN_SCHEMA,
         _SCREEN_MARKER, "SCREEN_CAPTURE",
         lambda m: ({"region": m.group(1)} if "," in m.group(1)
                    else {"display": m.group(1) or 1}),
         _SCREEN_HINT, _screen_prompt, _screen_run, _media_summary("capture"),
         queue_type="screen", denied=_screen_denied),

    Tool("fetch_url", "fetch_url", _scope_any, _FETCH_SCHEMA,
         _FETCH_MARKER, "FETCH",
         lambda m: {"url": m.group(1)},
         _FETCH_HINT,
         lambda sess, a: f"fetch  {a.get('url', '')}\n\napprove? [y/N] ",
         lambda sess, a: rt.fetch_url(a.get("url", "")),
         _chars_summary, queue_type="fetch",
         denied=lambda sess, a: f"[FETCH denied by user: '{a.get('url', '')}' was not fetched]"),

    Tool("recall", "recall", _scope_any, _RECALL_SCHEMA,
         _RECALL_MARKER, "RECALL",
         lambda m: {"query": m.group(1)},
         _RECALL_HINT, _recall_prompt, _recall_run, _recall_summary,
         queue_type="recall", denied=_recall_denied),

    Tool("web_open", "web_open", _scope_any, _WEB_OPEN_SCHEMA,
         _WEB_OPEN_MARKER, "WEB_OPEN",
         lambda m: {"url": m.group(1)},
         _WEB_OPEN_HINT,
         lambda sess, a: f"web_open  {a.get('url', '')}\n\napprove? [y/N] ",
         _web_open_run, _head_summary, queue_type="web_open",
         denied=lambda sess, a: f"[web_open denied by user: '{a.get('url', '')}' was not opened]"),

    Tool("web_read", "web_read", _scope_any, _WEB_READ_SCHEMA,
         _WEB_READ_MARKER, "WEB_READ",
         lambda m: {},
         _WEB_READ_HINT,
         lambda sess, a: "web_read\n\napprove? [y/N] ",
         _web_read_run, _head_summary, queue_type="web_read",
         denied=lambda sess, a: "[web_read denied by user: page was not read]"),

    Tool("web_screenshot", "web_screenshot", _scope_any, _WEB_SCREENSHOT_SCHEMA,
         _WEB_SCREENSHOT_MARKER, "WEB_SCREENSHOT",
         lambda m: {},
         _WEB_SCREENSHOT_HINT,
         lambda sess, a: "web_screenshot\n\napprove? [y/N] ",
         _web_screenshot_run, _media_summary("image"), queue_type="web_screenshot",
         denied=_web_screenshot_denied),

    Tool("web_act", "web_act", _scope_any, _WEB_ACT_SCHEMA,
         _WEB_ACT_MARKER, "WEB_ACT",
         lambda m: dict(zip(("selector", "action", "text"),
                            [p.strip() for p in m.group(1).split("|")] + ["", "", ""])),
         _WEB_ACT_HINT, _web_act_prompt, _web_act_run, _head_summary,
         queue_type="web_act",
         denied=lambda sess, a: (f"[web_act denied by user: '{a.get('action', '')}' on "
                                 f"'{a.get('selector', '')}' was not performed]")),

    Tool("web_eval", "web_eval", _scope_any, _WEB_EVAL_SCHEMA,
         _WEB_EVAL_MARKER, "WEB_EVAL",
         lambda m: {"js": m.group(1)},
         _WEB_EVAL_HINT,
         lambda sess, a: f"web_eval\n\n{a.get('js', '')}\n\napprove? [y/N] ",
         _web_eval_run, _head_summary, queue_type="web_eval",
         denied=lambda sess, a: "[web_eval denied by user: expression was not evaluated]"),

    Tool("initiate", "initiate", _scope_any, _INITIATE_SCHEMA,
         _INITIATE_MARKER, "INITIATE",
         lambda m: {},
         _INITIATE_HINT,
         lambda sess, a: "INITIATE the next node\n\napprove? [y/N] ",
         _initiate_run, _whole_summary, needs_region=True, queue_type="initiate",
         denied=lambda sess, a: "[initiate denied by user: nothing was started]"),

    Tool("reset_region", "reset_region", _scope_any, _RESET_REGION_SCHEMA,
         _RESET_REGION_MARKER, "RESET_REGION",
         lambda m: {"region": m.group(1)},
         _RESET_REGION_HINT, _reset_region_prompt, _reset_region_run, _head_summary,
         queue_type="reset", queue_identity="requester", denied=_reset_region_denied),

    Tool("reset_self", "reset_self", _scope_any, _RESET_SELF_SCHEMA,
         _RESET_SELF_MARKER, "RESET_SELF",
         lambda m: {},
         _RESET_SELF_HINT, _reset_self_prompt, _reset_self_run, _head_summary,
         needs_region=True, queue_type="reset", queue_identity="requester",
         denied=_reset_self_denied),

    Tool("request_messages", "request_messages", _scope_any, _REQUEST_SCHEMA,
         _REQUEST_MARKER, "REQUEST",
         lambda m: ({} if not m.group(1).strip() else
                    {"since_id": (int(m.group(1).strip())
                                  if m.group(1).strip().lstrip("-").isdigit()
                                  else m.group(1).strip())}),
         _REQUEST_HINT, _request_prompt, _request_run, _request_summary,
         needs_region=True, queue_type="request", queue_identity="caller",
         denied=_request_denied),

    Tool("read_file", "check_read", _scope_path, _READ_SCHEMA,
         _READ_MARKER, "READ",
         lambda m: {"path": m.group(1)},
         _READ_HINT, _read_prompt, _read_run, _read_summary,
         queue_type="read", denied=_read_denied),

    Tool("list_files", "check_read", _scope_path, _LIST_SCHEMA,
         _LIST_MARKER, "LIST",
         lambda m: {"path": m.group(1) or "."},
         _LIST_HINT, _list_prompt, _list_run, _list_summary,
         queue_type="read", denied=_list_denied),

    Tool("widget_bus_emit", "widget_bus_emit", _scope_any, _BUS_SCHEMA,
         _BUS_MARKER, "BUS", _bus_parse,
         _BUS_HINT, _bus_prompt, _bus_run, _bus_summary,
         queue_type="widget_bus_emit"),
]

TOOL_INDEX = {t.name: t for t in TOOLS}

_CLOSING_HINT = (
    "Emit a tool block only when you actually want to act. After a tool runs "
    "you'll be shown the result and may act again or give your final answer. A "
    "human approves every write and command before it happens.\n\n"
    "You work inside a WORKSPACE directory. Relative paths resolve there; prefer "
    "relative paths and stay inside the workspace. Accessing a path OUTSIDE the "
    "workspace (absolute paths elsewhere) requires the human's explicit approval "
    "each time and may be refused — don't reach outside unless asked to.")


def tool_schema():
    return [t.schema for t in TOOLS]


def text_hint():
    return "\n\n".join([t.hint for t in TOOLS if t.hint] + [_CLOSING_HINT])


def tool_names():
    return [t.name for t in TOOLS]


def detect_text(reply):
    for t in TOOLS:
        if t.marker is None:
            continue
        m = t.marker.search(reply)
        if m:
            return (t.name, t.parse(m))
    return None


def detect_native(tool_calls):
    if not tool_calls:
        return None
    fn = tool_calls[0].get("function", {})
    name = fn.get("name")
    args = fn.get("arguments", {})
    if isinstance(args, str):
        args = json.loads(args)
    return (name, args) if name else None


def gate_edges():
    out = []
    for t in TOOLS:
        scopes = ("inside", "outside") if t.scope is _scope_path else ("any",)
        for s in scopes:
            if (t.edge, s) not in out:
                out.append((t.edge, s))
    return out


# Claude's own tool names mapped to this table's edges; the pretooluse hook reads it.
CLAUDE_NATIVE_EDGES = {
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


rt.set_marker_keywords([t.keyword for t in TOOLS
                        if t.marker is not None and t.marker.groups])
