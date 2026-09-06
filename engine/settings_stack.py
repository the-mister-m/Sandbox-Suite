
import json
import os

from engine import SUITE_ROOT

LAYERS = ("global", "file", "preset", "track")


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


_NORMALIZERS = {
    "outputStyle": _norm_output_style,
    "autoMemoryEnabled": _norm_memory,
    "claudeMdExcludes": _norm_excludes,
}

_TRACK_FIELDS = {
    "outputStyle": "claude_output_style",
    "autoMemoryEnabled": "claude_memory_enabled",
    "claudeMdExcludes": "claude_md_excludes",
}


PRESETS_ROOT = os.path.join(SUITE_ROOT, "injections", "presets")


_DEFAULT_SENTINEL = object()


def _row(type_, default, how, nullable=False):
    return {"type": type_, "default": default, "how": how, "nullable": nullable}


_NUM = (int, float)

PRESET_TABLE = {
    "model":                    _row(str,  "",    "identity"),
    "seat":                     _row(str,  "",    "identity"),

    "claude_config_dir":        _row(str,  "",    "layer"),
    "claude_setting_sources":   _row(str,  None,  "layer", nullable=True),
    "claude_system_prompt":     _row(str,  "",    "layer"),
    "claude_output_style":      _row(str,  "",    "layer"),
    "claude_md_excludes":       _row(list, [],    "layer"),
    "claude_bare":              _row(bool, False, "layer"),

    "claude_memory_enabled":    _row(bool, False, "bag"),
    "claude_exclude_dynamic":   _row(bool, False, "bag"),
    "claude_add_dirs":          _row(list, [],    "bag"),
    "claude_settings_file":     _row(str,  "",    "bag"),

    "claude_tools":             _row(list, [],    "bag"),
    "claude_disallowed_tools":  _row(list, [],    "bag"),
    "max_tools":                _row(int,  None,  "bag", nullable=True),
    "gate_wait_s":              _row(_NUM, 150,   "bag", nullable=True),
    "claude_hook_ask_blocking": _row(bool, True,  "bag"),

    "claude_effort":            _row(str,  None,  "bag", nullable=True),
    "claude_keep_warm":         _row(bool, False, "bag"),
    "claude_cache_ttl":         _row(str,  "1h",  "bag"),
    "request_timeout":          _row(_NUM, 200,   "bag"),
    "num_ctx":                  _row(int,  32768, "bag"),
    "think":                    _row(bool, True,  "bag"),

    "allow_agent_reset":        _row(bool, True,  "bag"),
    "context_reset_cap_k":      _row(int,  300,   "bag", nullable=True),
    "start_turn_on_reset":      _row(bool, True,  "bag"),
    "reset_instruction":        _row(str,  _DEFAULT_SENTINEL, "bag"),

    "temperature":              _row(_NUM, 0.8,   "bag"),
    "top_k":                    _row(int,  40,    "bag"),
    "top_p":                    _row(_NUM, 0.9,   "bag"),
    "min_p":                    _row(_NUM, 0.0,   "bag"),
    "repeat_penalty":           _row(_NUM, 1.1,   "bag"),
    "repeat_last_n":            _row(int,  64,    "bag"),
    "seed":                     _row(int,  0,     "bag"),
    "num_predict":              _row(int,  -1,    "bag"),
    "keep_alive":               _row(_NUM, 30,    "bag"),
    "mirostat":                 _row(int,  0,     "bag"),
    "mirostat_tau":             _row(_NUM, 5.0,   "bag"),
    "mirostat_eta":             _row(_NUM, 0.1,   "bag"),
    "num_gpu":                  _row(int,  None,  "bag", nullable=True),
    "num_thread":               _row(int,  None,  "bag", nullable=True),

    "codex_sandbox_mode":       _row(str,  "",    "bag"),
    "codex_approval_policy":    _row(str,  "",    "bag"),

    "gates":                    _row(dict, {},    "gates"),

    "claude_preset":            _row(str,  "",    "name"),
}


_APPLY_ORDER = ("name", "identity", "layer", "bag", "gates")

PRESET_EXCLUDED = ("name", "provider", "loop_class", "mechanism", "root")


def preset_default(key):
    from engine import agent_loop as _al
    row = PRESET_TABLE[key]
    if key in _al.DEFAULT_SETTINGS:
        return _al.DEFAULT_SETTINGS[key]
    if row["default"] is _DEFAULT_SENTINEL:
        raise KeyError(f"preset field {key!r} claims an engine default it does not have")
    return row["default"]


def preset_keys(how=None):
    keys = [k for k, r in PRESET_TABLE.items() if how is None or r["how"] == how]
    return sorted(keys, key=lambda k: _APPLY_ORDER.index(PRESET_TABLE[k]["how"]))


CLAUDE_PRESET_FIELDS = {k: r["type"] for k, r in PRESET_TABLE.items()}

_NULLABLE_MODEL_FIELDS = {k for k, r in PRESET_TABLE.items() if r["nullable"]}


def _preset_dir(kind):
    assert kind in ("claude",), f"unknown preset kind: {kind!r}"
    return os.path.join(PRESETS_ROOT, kind)


def _safe_preset_name(name):
    name = (name or "").strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        return None
    return name


def _type_ok(value, want):
    if isinstance(want, tuple):
        return any(_type_ok(value, w) for w in want)
    if want is bool:
        return isinstance(value, bool)
    if want in (int, float):
        return isinstance(value, want) and not isinstance(value, bool)
    return isinstance(value, want)


def list_presets(kind):
    try:
        return sorted(f[:-5] for f in os.listdir(_preset_dir(kind))
                      if f.endswith(".json") and not f.startswith("."))
    except OSError:
        return []


def read_preset_file(kind, name, warnings=None):
    warnings = warnings if warnings is not None else []
    vocab = CLAUDE_PRESET_FIELDS
    safe = _safe_preset_name(name)
    if not safe:
        warnings.append(f"preset name {name!r} is not valid")
        return {}, warnings
    path = os.path.join(_preset_dir(kind), safe + ".json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except OSError as exc:
        warnings.append(f"preset {path!r} unreadable: {exc}")
        return {}, warnings
    except ValueError as exc:
        warnings.append(f"preset {path!r} is not valid JSON: {exc}")
        return {}, warnings
    if not isinstance(raw, dict):
        warnings.append(f"preset {path!r} is not a JSON object — ignored")
        return {}, warnings

    fields = {}
    for key, value in raw.items():
        if key == "name":
            continue
        if key not in vocab:
            warnings.append(f"preset {name!r}: {key!r} not carried — unknown field")
            continue
        if value is None and key in _NULLABLE_MODEL_FIELDS:
            fields[key] = None
            continue
        if not _type_ok(value, vocab[key]):
            warnings.append(f"preset {name!r}: {key!r} dropped — wrong type")
            continue
        fields[key] = value
    return fields, warnings


def write_preset_file(kind, name, fields):
    safe = _safe_preset_name(name)
    if not safe:
        return False, f"invalid preset name: {name!r}"
    d = _preset_dir(kind)
    try:
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, safe + ".json")
        data = dict(fields)
        data["name"] = safe
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except OSError as exc:
        return False, str(exc)
    return True, path


def delete_preset_file(kind, name):
    safe = _safe_preset_name(name)
    if not safe:
        return False, f"invalid preset name: {name!r}"
    path = os.path.join(_preset_dir(kind), safe + ".json")
    try:
        os.remove(path)
    except OSError as exc:
        return False, str(exc)
    return True, path


def rename_preset_file(kind, old_name, new_name):
    old_safe = _safe_preset_name(old_name)
    new_safe = _safe_preset_name(new_name)
    if not old_safe or not new_safe:
        return False, f"invalid preset name: {old_name!r} -> {new_name!r}"
    d = _preset_dir(kind)
    old_path = os.path.join(d, old_safe + ".json")
    new_path = os.path.join(d, new_safe + ".json")
    if os.path.exists(new_path):
        return False, f"preset {new_safe!r} already exists"
    try:
        with open(old_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data["name"] = new_safe
        os.rename(old_path, new_path)
        with open(new_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except OSError as exc:
        return False, str(exc)
    except ValueError:
        try:
            os.rename(old_path, new_path)
        except OSError as exc:
            return False, str(exc)
    return True, new_path


def _read_override_file(path, warnings):
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except OSError as exc:
        warnings.append(f"override file {path!r} unreadable: {exc}")
        return {}
    except ValueError as exc:
        warnings.append(f"override file {path!r} is not valid JSON: {exc}")
        return {}
    if not isinstance(raw, dict):
        warnings.append(f"override file {path!r} is not a JSON object — ignored")
        return {}

    contributions = {}
    for key, value in raw.items():
        if key == "hooks":
            warnings.append("override file: 'hooks' dropped — not preset-settable")
            continue
        if key in _NORMALIZERS:
            contributions[key] = value
        else:
            warnings.append(f"override file: {key!r} not carried")
    return contributions


def resolve(track_settings: dict) -> dict:
    warnings = []
    provenance = {}

    file_path = (track_settings.get("claude_settings_file") or "").strip()
    file_raw = _read_override_file(file_path, warnings) if file_path else {}

    preset_name = (track_settings.get("claude_preset") or "").strip()
    preset_fields = read_preset_file("claude", preset_name, warnings)[0] if preset_name else {}
    preset_raw = {}
    for settings_key, track_field in _TRACK_FIELDS.items():
        if track_field in preset_fields:
            preset_raw[settings_key] = preset_fields[track_field]

    overlay = {}
    for settings_key, norm in _NORMALIZERS.items():
        track_field = _TRACK_FIELDS[settings_key]
        for raw_value, layer in (
            (track_settings.get(track_field), "track"),
            (preset_raw.get(settings_key), "preset"),
            (file_raw.get(settings_key), "file"),
        ):
            value = norm(raw_value)
            if value is not None:
                overlay[settings_key] = value
                provenance[settings_key] = layer
                break

    setting_sources = track_settings.get("claude_setting_sources") or None
    if setting_sources:
        provenance["setting_sources"] = "track"
    elif preset_fields.get("claude_setting_sources"):
        setting_sources = preset_fields["claude_setting_sources"]
        provenance["setting_sources"] = "preset"

    config_dir = track_settings.get("claude_config_dir") or None
    if config_dir:
        provenance["config_dir"] = "track"
    elif preset_fields.get("claude_config_dir"):
        config_dir = preset_fields["claude_config_dir"]
        provenance["config_dir"] = "preset"

    system_prompt = track_settings.get("claude_system_prompt") or None
    if system_prompt:
        provenance["system_prompt"] = "track"
    elif preset_fields.get("claude_system_prompt"):
        system_prompt = preset_fields["claude_system_prompt"]
        provenance["system_prompt"] = "preset"

    bare = bool(track_settings.get("claude_bare"))
    if bare:
        provenance["bare"] = "track"
    elif preset_fields.get("claude_bare"):
        bare = True
        provenance["bare"] = "preset"

    return {
        "overlay": overlay or None,
        "setting_sources": setting_sources,
        "config_dir": config_dir,
        "system_prompt": system_prompt,
        "bare": bare,
        "provenance": provenance,
        "warnings": warnings,
    }
