
import os
import subprocess

EDGES = [
    {"name": "logic_status",    "level": "check", "grade": "declared"},
    {"name": "logic_open",      "level": "run",    "grade": "declared"},
    {"name": "logic_transport", "level": "run",    "grade": "declared"},
    {"name": "logic_command",   "level": "run",    "grade": "declared"},
]

STUBS = ["receive", "render-a-gate"]

AUTH_NOTE = "none — local UI scripting (System Events; needs macOS Accessibility grant)"

LOGIC_APP_NAME = "Logic Pro"
LOGIC_BUNDLE_PATHS = (
    "/Applications/Logic Pro.app",
    os.path.expanduser("~/Applications/Logic Pro.app"),
)

OSASCRIPT_TIMEOUT = 10

TRANSPORT_KEYS = {
    "play": 'keystroke space',
    "stop": 'keystroke space',
    "record": 'keystroke "r"',
}



def _logic_installed() -> bool:
    return any(os.path.isdir(p) for p in LOGIC_BUNDLE_PATHS)


def _osascript(script: str, timeout: int = OSASCRIPT_TIMEOUT):
    try:
        proc = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, "", f"osascript timed out after {timeout}s"
    except OSError as e:
        return False, "", str(e)
    if proc.returncode != 0:
        return False, proc.stdout, proc.stderr
    return True, proc.stdout, proc.stderr


def _logic_running() -> tuple:
    ok, out, err = _osascript(
        'tell application "System Events" to return (exists process "Logic Pro")'
    )
    if not ok:
        return False, False, err
    return True, out.strip() == "true", err



def logic_status() -> str:
    if not _logic_installed():
        return "[logic_status: Logic Pro not found in /Applications — not installed (or installed elsewhere)]"

    script = '''
    tell application "System Events"
        if not (exists process "Logic Pro") then
            return "not-running"
        end if
        tell process "Logic Pro"
            try
                return "running|" & (name of front window)
            on error
                return "running|no-window"
            end try
        end tell
    end tell
    '''
    ok, out, err = _osascript(script)
    if not ok:
        return f"[logic_status failed: System Events error — {(err or '').strip() or 'unknown'}]"
    out = out.strip()
    if out == "not-running":
        return "[logic_status: Logic Pro is installed, not running]"
    if out.startswith("running|"):
        window = out.split("running|", 1)[1]
        return f"[logic_status: Logic Pro is installed and running — frontmost window: {window}]"
    return f"[logic_status: Logic Pro installed; unrecognized System Events response: {out!r}]"


def logic_open(path: str = "") -> str:
    cmd = ["open", "-a", LOGIC_APP_NAME]
    target = LOGIC_APP_NAME
    if path:
        full = os.path.abspath(os.path.expanduser(path))
        cmd.append(full)
        target = full
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        return "[logic_open failed: `open` timed out]"
    except OSError as e:
        return f"[logic_open failed: {e}]"
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip() or f"exit {proc.returncode}"
        return f"[logic_open failed: {detail}]"
    return f"[logic_open: opened {target}]"


def logic_transport(action: str) -> str:
    action = (action or "").strip().lower()
    if action not in TRANSPORT_KEYS:
        return f"[logic_transport failed: unknown action {action!r} — expected one of play, stop, record]"

    ok, running, err = _logic_running()
    if not ok:
        return f"[logic_transport failed: System Events error checking process — {(err or '').strip() or 'unknown'}]"
    if not running:
        return "[logic_transport failed: Logic Pro is not running — refusing to launch it (use logic_open first)]"

    keystroke = TRANSPORT_KEYS[action]
    script = f'''
    tell application "System Events"
        tell process "Logic Pro"
            set frontmost to true
        end tell
        {keystroke}
    end tell
    '''
    ok, out, err = _osascript(script)
    if not ok:
        return f"[logic_transport failed: System Events error sending {action!r} — {(err or '').strip() or 'unknown'}]"
    return f"[logic_transport: sent {action!r} to Logic Pro (assumes default key commands)]"


def logic_command(command: str) -> str:
    parts = [p.strip() for p in (command or "").split(">") if p.strip()]
    if not parts:
        return f"[logic_command failed: empty or malformed command {command!r} — expected 'Menu>Item[>SubItem]']"

    ok, running, err = _logic_running()
    if not ok:
        return f"[logic_command failed: System Events error checking process — {(err or '').strip() or 'unknown'}]"
    if not running:
        return "[logic_command failed: Logic Pro is not running — refusing to launch it (use logic_open first)]"

    chain = f'menu bar item "{parts[0]}" of menu bar 1'
    for item in parts[1:-1]:
        chain = f'menu item "{item}" of menu of {chain}'
    if len(parts) == 1:
        click_script = f'click {chain}'
    else:
        click_script = f'click menu item "{parts[-1]}" of menu of {chain}'

    script = f'''
    tell application "System Events"
        tell process "Logic Pro"
            set frontmost to true
            {click_script}
        end tell
    end tell
    '''
    ok, out, err = _osascript(script)
    if not ok:
        detail = (err or "").strip() or "unknown"
        return (f"[logic_command failed: could not click {command!r} via System Events UI "
                f"scripting — {detail}. Common causes: macOS Accessibility permission not "
                f"granted to this process, or the menu path doesn't match Logic's actual UI "
                f"right now (brittle by design).]")
    return f"[logic_command: clicked {command!r}]"



def connect() -> str:
    if not _logic_installed():
        return "[logicpro connect: Logic Pro not found in /Applications — no channel to open]"
    ok, running, err = _logic_running()
    if not ok:
        return f"[logicpro connect: installed, but System Events check failed — {(err or '').strip() or 'unknown'}]"
    if running:
        return "[logicpro connect: Logic Pro installed and running — UI scripting available (no persistent pipe held)]"
    return "[logicpro connect: Logic Pro installed, not running — UI scripting unavailable until launched]"


def capabilities() -> list:
    return list(EDGES)


def receive() -> str:
    return "[logicpro receive: not implemented — declared stub, no inbound event source]"


def render_a_gate(gate: dict = None) -> str:
    return "not-renderable"


from engine import channel_registry

channel_registry.register("logicpro", {
    "edges": EDGES,
    "auth": AUTH_NOTE,
    "state": connect,
    "stubs": STUBS,
})
