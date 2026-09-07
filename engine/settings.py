
# settings table — every setting the engine knows, one row each

import json
import os

from engine import SUITE_ROOT


TIERS = ("global", "session", "widget", "track", "region")
BLOCKS = (None, "ollama", "gemini", "claude")

_NUM = (int, float)

RESET_INSTRUCTION = ("You have been reset, message The Captain directly "
                     "or agents in chat for instructions")

# gates ride on the Region object, not in the settings bag
OVERLAY_KEY = "overlay_rows"


class Row:

    __slots__ = ("key", "tier", "type", "default", "block", "preset",
                 "live", "nullable")

    def __init__(self, key, tier, type, default, block=None, preset=True,
                 live=False, nullable=False):
        self.key = key
        self.tier = tier
        self.type = type
        self.default = default
        self.block = block
        self.preset = preset
        self.live = live
        self.nullable = nullable


def _sampling():
    return [
        Row("temperature",    "region", _NUM, 0.8,  "ollama", live=True),
        Row("top_k",          "region", int,  40,   "ollama", live=True),
        Row("top_p",          "region", _NUM, 0.9,  "ollama", live=True),
        Row("min_p",          "region", _NUM, 0.0,  "ollama", live=True),
        Row("repeat_penalty", "region", _NUM, 1.1,  "ollama", live=True),
        Row("repeat_last_n",  "region", int,  64,   "ollama", live=True),
        Row("seed",           "region", int,  0,    "ollama", live=True),
        Row("num_predict",    "region", int,  -1,   "ollama", live=True),
        Row("mirostat",       "region", int,  0,    "ollama", live=True),
        Row("mirostat_tau",   "region", _NUM, 5.0,  "ollama", live=True),
        Row("mirostat_eta",   "region", _NUM, 0.1,  "ollama", live=True),
        Row("num_gpu",        "region", int,  None, "ollama", live=True, nullable=True),
        Row("num_thread",     "region", int,  None, "ollama", live=True, nullable=True),
    ]


ROWS = [
    Row("model",               "region", str,  ""),
    Row("seat",                "region", str,  ""),
    Row("preset_name",         "region", str,  "",   preset=False, live=True),
    Row("reset_on_change",     "region", bool, True, live=True, nullable=True),
    Row("gate_wait_s",         "region", _NUM, 150,  live=True, nullable=True),
    Row("max_tools",           "region", int,  None, live=True, nullable=True),
    Row("request_timeout",     "region", _NUM, 200,  live=True),
    Row("allow_agent_reset",   "region", bool, True, live=True),
    Row("context_reset_cap_k", "region", int,  300,  live=True, nullable=True),
    Row("start_turn_on_reset", "region", bool, True, live=True),
    Row("reset_instruction",   "region", str,  RESET_INSTRUCTION, live=True),

    Row("num_ctx",    "region", int,  32768, "ollama", live=True),
    Row("think",      "region", bool, True,  "ollama", live=True),
    Row("keep_alive", "region", _NUM, 30,    "ollama", live=True),
] + _sampling() + [
    Row("claude_mode",              "region", str,  "persistent", "claude"),
    Row("claude_effort",            "region", str,  None,  "claude", nullable=True),
    Row("claude_partial",           "region", bool, True,  "claude", live=True),
    Row("claude_cache_ttl",         "region", str,  "1h",  "claude"),
    Row("claude_keep_warm",         "region", bool, False, "claude", live=True),
    Row("claude_exclude_dynamic",   "region", bool, False, "claude"),
    Row("claude_tools",             "region", list, [],    "claude"),
    Row("claude_disallowed_tools",  "region", list, [],    "claude"),
    Row("claude_add_dirs",          "region", list, [],    "claude"),
    Row("claude_hook_ask_blocking", "region", bool, True,  "claude", live=True),
    Row("claude_setting_sources",   "region", str,  None,  "claude", nullable=True),
    Row("claude_system_prompt",     "region", str,  "",    "claude"),
    Row("claude_bare",              "region", bool, False, "claude"),
    Row("claude_config_dir",        "region", str,  "",    "claude"),
    Row("claude_memory_enabled",    "region", bool, False, "claude"),
    Row("claude_md_excludes",       "region", list, [],    "claude"),
    Row("claude_output_style",      "region", str,  "",    "claude"),
    Row("claude_settings_file",     "region", str,  "",    "claude"),

    Row(OVERLAY_KEY, "region", list, None, live=True, nullable=True),

    Row("name",  "track", str, "untitled", preset=False, live=True),
    Row("root",  "track", str, "",         preset=False, live=True),
    Row("order", "track", int, 0,          preset=False, live=True),
]

BY_KEY = {r.key: r for r in ROWS}

_HARNESS_EXCLUDE = ("model", "seat", "preset_name", OVERLAY_KEY)


def region_defaults(provider_kind):
    out = {}
    for r in ROWS:
        if r.tier != "region" or r.key == OVERLAY_KEY:
            continue
        if r.key == "reset_on_change":
            out[r.key] = True
        elif isinstance(r.default, (list, dict)):
            out[r.key] = json.loads(json.dumps(r.default))
        else:
            out[r.key] = r.default
    return out


def block_keys(block):
    return tuple(r.key for r in ROWS if r.block == block and r.tier == "region")


def harness_keys():
    return tuple(r.key for r in ROWS
                 if r.tier == "region" and r.block is None
                 and r.key not in _HARNESS_EXCLUDE)


def preset_keys():
    return tuple(r.key for r in ROWS
                 if r.tier == "region" and r.preset and r.key != OVERLAY_KEY)


def type_ok(value, want):
    if isinstance(want, tuple):
        return any(type_ok(value, w) for w in want)
    if want is bool:
        return isinstance(value, bool)
    if want in (int, float):
        return isinstance(value, want) and not isinstance(value, bool)
    return isinstance(value, want)


# global tier

GLOBAL_PATH = os.path.join(SUITE_ROOT, "global.json")

CONFIRM_KEYS = (
    "editor_save", "file_delete", "file_move", "terminal_run", "setroot",
    "session_new", "session_load", "delete_saved_session", "delete_voice",
    "room_remove", "room_load", "gate_matrix_save",
)
CONFIRM_STATES = ("ask", "silent")

MODAL_MODES = ("fullscreen", "window", "corner", "off")

ADE_MODAL_MODES = ("inherit",) + MODAL_MODES

KILL_ROW_KEYS = ("end_all_turns", "unload_weights", "kill_hosts",
                 "end_all_sessions", "shutdown_suite")

KILLSWITCH_SCOPES = ("models", "hosts", "suite")

TTS_ENGINES = ("say", "browser")
STT_ENGINES = ("parakeet_mlx", "whisper", "browser")
LISTEN_MODES = ("ptt", "vad", "off")

GLOBAL_DEFAULTS = {
    "skin": "og",
    "modal_mode": "fullscreen",
    "modal_mode_ade": "inherit",
    "gate_keyboard": True,
    "approve_hold": False,
    "library_archives": True,
    "confirm": {k: "ask" for k in CONFIRM_KEYS},
    "killswitch": {"scope": "models", "hold_to_fire": True},
    "kill_holds": {"end_all_turns": False, "unload_weights": False,
                   "kill_hosts": True, "end_all_sessions": True,
                   "shutdown_suite": True},
    "voices": {"tts_engine": "say", "tts_voice": "",
               "stt_engine": "parakeet_mlx", "listen_mode": "ptt"},
    "models": {"order": [], "hidden": []},
    # one entry per widget type; the registry reads it, widgets carry none
    "widget_defaults": {"chat": {}, "mini_queue": {}, "queue": {},
                        "editor": {"showPreview": False, "tabs": [],
                                   "active": ""},
                        "terminal": {"region": "", "tabs": [], "active": ""},
                        "browser": {},
                        "viewer": {"path": "", "tabs": []}, "mount": {}},
}

GLOBAL_KEYS = tuple(GLOBAL_DEFAULTS)


def _fresh_global():
    return json.loads(json.dumps(GLOBAL_DEFAULTS))


def skins_available():
    try:
        d = os.path.join(SUITE_ROOT, "static", "css", "skins")
        return sorted(f[:-4] for f in os.listdir(d) if f.endswith(".css"))
    except OSError:
        return ["og", "default"]


def load_global():
    data = None
    if os.path.exists(GLOBAL_PATH):
        try:
            with open(GLOBAL_PATH) as fh:
                data = json.load(fh)
        except Exception:
            data = None
    merged = _fresh_global()
    if not isinstance(data, dict):
        return merged
    if isinstance(data.get("skin"), str):
        merged["skin"] = data["skin"]
    if data.get("modal_mode") in MODAL_MODES:
        merged["modal_mode"] = data["modal_mode"]
    if data.get("modal_mode_ade") in ADE_MODAL_MODES:
        merged["modal_mode_ade"] = data["modal_mode_ade"]
    if isinstance(data.get("gate_keyboard"), bool):
        merged["gate_keyboard"] = data["gate_keyboard"]
    if isinstance(data.get("approve_hold"), bool):
        merged["approve_hold"] = data["approve_hold"]
    if isinstance(data.get("confirm"), dict):
        for k in CONFIRM_KEYS:
            if data["confirm"].get(k) in CONFIRM_STATES:
                merged["confirm"][k] = data["confirm"][k]
    if isinstance(data.get("killswitch"), dict):
        if data["killswitch"].get("scope") in KILLSWITCH_SCOPES:
            merged["killswitch"]["scope"] = data["killswitch"]["scope"]
        if isinstance(data["killswitch"].get("hold_to_fire"), bool):
            merged["killswitch"]["hold_to_fire"] = data["killswitch"]["hold_to_fire"]
    if isinstance(data.get("kill_holds"), dict):
        for k in KILL_ROW_KEYS:
            if isinstance(data["kill_holds"].get(k), bool):
                merged["kill_holds"][k] = data["kill_holds"][k]
    if isinstance(data.get("voices"), dict):
        for k, v in data["voices"].items():
            if k in merged["voices"] and isinstance(v, str):
                merged["voices"][k] = v
    if isinstance(data.get("models"), dict):
        for k in ("order", "hidden"):
            v = data["models"].get(k)
            if isinstance(v, list):
                merged["models"][k] = [x for x in v if isinstance(x, str)]
    return merged


class GlobalError(ValueError):
    pass


def _validate_global(body):
    unknown = set(body) - set(GLOBAL_KEYS)
    if unknown:
        raise GlobalError(f"unknown key(s): {sorted(unknown)}")
    if "skin" in body and body["skin"] not in skins_available():
        raise GlobalError(f"unknown skin: {body['skin']!r}")
    if "modal_mode" in body and body["modal_mode"] not in MODAL_MODES:
        raise GlobalError(f"unknown modal_mode: {body['modal_mode']!r}")
    if "modal_mode_ade" in body and body["modal_mode_ade"] not in ADE_MODAL_MODES:
        raise GlobalError(f"unknown modal_mode_ade: {body['modal_mode_ade']!r}")
    for k in ("gate_keyboard", "approve_hold"):
        if k in body and not isinstance(body[k], bool):
            raise GlobalError(f"{k} must be a boolean")
    if "confirm" in body:
        cf = body["confirm"]
        if not isinstance(cf, dict):
            raise GlobalError("confirm must be an object")
        unknown_cf = set(cf) - set(CONFIRM_KEYS)
        if unknown_cf:
            raise GlobalError(f"unknown confirm key(s): {sorted(unknown_cf)}")
        for k, v in cf.items():
            if v not in CONFIRM_STATES:
                raise GlobalError(f"confirm.{k} must be one of {CONFIRM_STATES}")
    if "killswitch" in body:
        ks = body["killswitch"]
        if not isinstance(ks, dict):
            raise GlobalError("killswitch must be an object")
        unknown_ks = set(ks) - {"scope", "hold_to_fire"}
        if unknown_ks:
            raise GlobalError(f"unknown killswitch key(s): {sorted(unknown_ks)}")
        if "scope" in ks and ks["scope"] not in KILLSWITCH_SCOPES:
            raise GlobalError(f"unknown killswitch scope: {ks['scope']!r}")
        if "hold_to_fire" in ks and not isinstance(ks["hold_to_fire"], bool):
            raise GlobalError("hold_to_fire must be a boolean")
    if "kill_holds" in body:
        kh = body["kill_holds"]
        if not isinstance(kh, dict):
            raise GlobalError("kill_holds must be an object")
        unknown_kh = set(kh) - set(KILL_ROW_KEYS)
        if unknown_kh:
            raise GlobalError(f"unknown kill_holds key(s): {sorted(unknown_kh)}")
        for k, v in kh.items():
            if not isinstance(v, bool):
                raise GlobalError(f"kill_holds.{k} must be a boolean")
    if "voices" in body:
        vc = body["voices"]
        if not isinstance(vc, dict):
            raise GlobalError("voices must be an object")
        unknown_vc = set(vc) - set(GLOBAL_DEFAULTS["voices"])
        if unknown_vc:
            raise GlobalError(f"unknown voices key(s): {sorted(unknown_vc)}")
        for k, v in vc.items():
            if not isinstance(v, str):
                raise GlobalError(f"voices.{k} must be a string")
    if "models" in body:
        md = body["models"]
        if not isinstance(md, dict):
            raise GlobalError("models must be an object")
        unknown_md = set(md) - {"order", "hidden"}
        if unknown_md:
            raise GlobalError(f"unknown models key(s): {sorted(unknown_md)}")
        for k, v in md.items():
            if not isinstance(v, list) or any(not isinstance(x, str) for x in v):
                raise GlobalError(f"models.{k} must be a list of strings")


def _write_global(conf):
    try:
        with open(GLOBAL_PATH, "w") as fh:
            json.dump(conf, fh, indent=2)
    except OSError:
        pass


def save_global(data):
    if not isinstance(data, dict):
        raise GlobalError("expected a JSON object")
    _validate_global(data)
    current = load_global()
    for k, v in data.items():
        if isinstance(current.get(k), dict) and isinstance(v, dict):
            current[k].update(v)
        else:
            current[k] = v
    _write_global(current)
    return current


def save_global_key(key, value):
    head, _, tail = key.partition(".")
    conf = load_global()
    if tail and isinstance(conf.get(head), dict):
        _validate_global({head: {tail: value}})
        conf[head][tail] = value
    else:
        _validate_global({key: value})
        conf[key] = value
    _write_global(conf)
    return conf


def modal_mode():
    return load_global().get("modal_mode", "fullscreen")


# session tier — one row per global key, unset reads global

SESSION_GLOBAL_PATH = {
    "skin":            ("skin",),
    "modal_mode":      ("modal_mode",),
    "modal_mode_ade":  ("modal_mode_ade",),
    "gate_keyboard":   ("gate_keyboard",),
    "approve_hold":    ("approve_hold",),
    "library_archives": ("library_archives",),
    "confirm":         ("confirm",),
    "killswitch":      ("killswitch",),
    "kill_holds":      ("kill_holds",),
    "kill_hosts":      ("kill_holds", "kill_hosts"),
    "shutdown_suite":  ("kill_holds", "shutdown_suite"),
    "voices":          ("voices",),
    "stt_engine":      ("voices", "stt_engine"),
    "models":          ("models",),
}

SESSION_KEYS = tuple(SESSION_GLOBAL_PATH)


def _global_default_at(path):
    node = GLOBAL_DEFAULTS
    for part in path:
        node = node[part]
    return node


def _type_of(value):
    if isinstance(value, bool):
        return bool
    if isinstance(value, str):
        return str
    if isinstance(value, dict):
        return dict
    if isinstance(value, list):
        return list
    return _NUM


SESSION_ROWS = [
    Row(key, "session", _type_of(_global_default_at(path)),
        _global_default_at(path), preset=False, live=True, nullable=True)
    for key, path in SESSION_GLOBAL_PATH.items()
]

SESSION_BY_KEY = {r.key: r for r in SESSION_ROWS}


def session_defaults():
    # unset means inherit from global
    return {k: None for k in SESSION_KEYS}


def global_value(key, conf=None):
    path = SESSION_GLOBAL_PATH.get(key)
    if path is None:
        return None
    node = conf if conf is not None else load_global()
    for part in path:
        if not isinstance(node, dict) or part not in node:
            return _global_default_at(path)
        node = node[part]
    return node


def session_value(bag, key, conf=None):
    value = (bag or {}).get(key)
    if value is None:
        return global_value(key, conf)
    return value


def session_effective(bag, conf=None):
    conf = conf if conf is not None else load_global()
    return {k: session_value(bag, k, conf) for k in SESSION_KEYS}


def save_global_defaults(session_values):
    # every set session value becomes the global default
    written = []
    for key in SESSION_KEYS:
        value = (session_values or {}).get(key)
        if value is None:
            continue
        path = SESSION_GLOBAL_PATH[key]
        save_global_key(".".join(path), value)
        written.append(key)
    return written, load_global()


# widget tier — rows keyed by widget type, per instance, no carryover

WIDGET_ROWS = {
    "chat": [
        Row("speech_enabled", "widget", bool, False, preset=False, live=True),
        Row("tts_engine",     "widget", str,  "say", preset=False, live=True),
        Row("listen_mode",    "widget", str,  "ptt", preset=False, live=True),
    ],
    "queue": [
        Row("claude_cache_ttl",       "widget", str,  "1h",  preset=False, live=True),
        Row("claude_exclude_dynamic", "widget", bool, False, preset=False, live=True),
    ],
    "mini_queue": [],
    "editor":     [],
    "terminal":   [],
    "browser":    [],
    "viewer":     [],
}


def widget_types():
    return tuple(WIDGET_ROWS)


def _row_defaults(widget_type):
    out = {}
    for r in WIDGET_ROWS.get(widget_type, ()):
        if isinstance(r.default, (list, dict)):
            out[r.key] = json.loads(json.dumps(r.default))
        else:
            out[r.key] = r.default
    return out


# the session tier's widget block, outside the thirteen session keys
WIDGET_DEFAULTS_KEY = "widget_defaults"


def _widget_block(source, widget_type):
    block = (source or {}).get(WIDGET_DEFAULTS_KEY)
    if not isinstance(block, dict):
        return {}
    entry = block.get(widget_type)
    return entry if isinstance(entry, dict) else {}


# rows, then global.json, then the session bag — one entry wins per key
def widget_defaults(widget_type, bag=None, conf=None):
    out = _row_defaults(widget_type)
    conf = conf if conf is not None else load_global()
    out.update(_widget_block(conf, widget_type))
    out.update(_widget_block(bag, widget_type))
    return out


def widget_defaults_all(bag=None, conf=None):
    conf = conf if conf is not None else load_global()
    return {t: widget_defaults(t, bag, conf) for t in WIDGET_ROWS}


# registries

REGISTRY_DIR = os.path.join(SUITE_ROOT, "library", "registry")


def _load_registry(filename):
    path = os.path.join(REGISTRY_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return []
    if isinstance(data, dict):
        data = data.get("list", [])
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


def load_widget_registry():
    return _load_registry("widgets.json")


def load_provider_registry():
    return _load_registry("providers.json")


# presets

PRESETS_DIR = os.path.join(SUITE_ROOT, "library", "presets")


def _safe_name(name):
    name = (name or "").strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        return None
    return name


def _preset_path(safe):
    return os.path.join(PRESETS_DIR, safe + ".json")


def list_presets():
    try:
        return sorted(f[:-5] for f in os.listdir(PRESETS_DIR)
                      if f.endswith(".json") and not f.startswith("."))
    except OSError:
        return []


def read_preset(name):
    warnings = []
    safe = _safe_name(name)
    if not safe:
        warnings.append(f"preset name {name!r} is not valid")
        return {}, warnings
    path = _preset_path(safe)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except OSError as exc:
        warnings.append(f"preset {path!r} unreadable: {exc}")
        return {}, warnings
    except ValueError as exc:
        warnings.append(f"preset {path!r} is not valid JSON: {exc}")
        return {}, warnings
    if not isinstance(raw, dict):
        warnings.append(f"preset {path!r} is not a JSON object — ignored")
        return {}, warnings

    allowed = set(preset_keys()) | {OVERLAY_KEY}
    fields = {}
    for key, value in raw.items():
        if key == "name":
            continue
        if key not in allowed:
            warnings.append(f"preset {name!r}: {key!r} dropped — unknown key")
            continue
        row = BY_KEY[key]
        if value is None and row.nullable:
            fields[key] = None
            continue
        if not type_ok(value, row.type):
            warnings.append(f"preset {name!r}: {key!r} dropped — wrong type")
            continue
        fields[key] = value
    return fields, warnings


def write_preset(name, fields):
    safe = _safe_name(name)
    if not safe:
        return False, f"invalid preset name: {name!r}"
    try:
        os.makedirs(PRESETS_DIR, exist_ok=True)
        data = dict(fields)
        data["name"] = safe
        with open(_preset_path(safe), "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
    except OSError as exc:
        return False, str(exc)
    return True, _preset_path(safe)


def delete_preset(name):
    safe = _safe_name(name)
    if not safe:
        return False, f"invalid preset name: {name!r}"
    try:
        os.remove(_preset_path(safe))
    except OSError as exc:
        return False, str(exc)
    return True, _preset_path(safe)


def rename_preset(old, new):
    old_safe, new_safe = _safe_name(old), _safe_name(new)
    if not old_safe or not new_safe:
        return False, f"invalid preset name: {old!r} -> {new!r}"
    old_path, new_path = _preset_path(old_safe), _preset_path(new_safe)
    if os.path.exists(new_path):
        return False, f"preset {new_safe!r} already exists"
    try:
        with open(old_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            data["name"] = new_safe
        os.rename(old_path, new_path)
        with open(new_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
    except ValueError:
        try:
            os.rename(old_path, new_path)
        except OSError as exc:
            return False, str(exc)
    except OSError as exc:
        return False, str(exc)
    return True, new_path
