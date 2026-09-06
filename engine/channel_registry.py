
LEVELS = ("check", "read", "write", "overwrite", "delete", "run")
GRADES = ("enforced", "declared")

_ENTRY_KEYS = ("edges", "auth", "state", "stubs")
_EDGE_KEYS = ("name", "level", "grade")

_CHANNELS = {}


def register(name, entry):
    if not isinstance(name, str) or not name:
        raise ValueError(
            f"channel_registry.register: channel name must be a non-empty string (got {name!r})"
        )
    if not isinstance(entry, dict):
        raise ValueError(
            f"channel_registry.register({name!r}): entry must be a dict (got {type(entry).__name__})"
        )

    missing = [k for k in _ENTRY_KEYS if k not in entry]
    if missing:
        raise ValueError(
            f"channel_registry.register({name!r}): entry missing required key(s): {', '.join(missing)}"
        )

    edges = entry["edges"]
    if not isinstance(edges, list):
        raise ValueError(
            f"channel_registry.register({name!r}): 'edges' must be a list (got {type(edges).__name__})"
        )
    for i, edge in enumerate(edges):
        if not isinstance(edge, dict):
            raise ValueError(
                f"channel_registry.register({name!r}): edges[{i}] must be a dict (got {type(edge).__name__})"
            )
        edge_missing = [k for k in _EDGE_KEYS if k not in edge]
        if edge_missing:
            raise ValueError(
                f"channel_registry.register({name!r}): edges[{i}] missing key(s): {', '.join(edge_missing)}"
            )
        edge_name = edge["name"]
        if not isinstance(edge_name, str) or not edge_name:
            raise ValueError(
                f"channel_registry.register({name!r}): edges[{i}] 'name' must be a non-empty string (got {edge_name!r})"
            )
        level = edge["level"]
        if level not in LEVELS:
            raise ValueError(
                f"channel_registry.register({name!r}): edges[{i}] ({edge_name!r}) 'level' must be one "
                f"of {LEVELS} (got {level!r})"
            )
        grade = edge["grade"]
        if grade not in GRADES:
            raise ValueError(
                f"channel_registry.register({name!r}): edges[{i}] ({edge_name!r}) 'grade' must be one "
                f"of {GRADES} (got {grade!r})"
            )

    auth = entry["auth"]
    if not isinstance(auth, str):
        raise ValueError(
            f"channel_registry.register({name!r}): 'auth' must be a string (got {type(auth).__name__})"
        )

    state = entry["state"]
    if not callable(state):
        raise ValueError(
            f"channel_registry.register({name!r}): 'state' must be a callable () -> str "
            f"(got {type(state).__name__})"
        )

    stubs = entry["stubs"]
    if not isinstance(stubs, list) or not all(isinstance(s, str) for s in stubs):
        raise ValueError(
            f"channel_registry.register({name!r}): 'stubs' must be a list of strings (got {stubs!r})"
        )

    _CHANNELS[name] = entry
    return entry


def get(name):
    return _CHANNELS.get(name)


def names():
    return list(_CHANNELS.keys())


def _render_state(entry):
    state_fn = entry.get("state")
    try:
        return str(state_fn())
    except Exception as exc:
        return f"[state error: {exc}]"


def describe(name):
    entry = _CHANNELS.get(name)
    if entry is None:
        return f"channel: {name}\n  [not registered]"

    lines = [f"channel: {name}"]

    edges = entry.get("edges", [])
    if edges:
        lines.append("  edges:")
        for edge in edges:
            lines.append(f"    {edge['name']}: level={edge['level']} grade={edge['grade']}")
    else:
        lines.append("  edges: (none)")

    lines.append(f"  auth: {entry.get('auth', '')}")
    lines.append(f"  state: {_render_state(entry)}")

    stubs = entry.get("stubs", [])
    lines.append(f"  stubs: {', '.join(stubs) if stubs else '(none)'}")

    return "\n".join(lines)


def describe_all():
    if not _CHANNELS:
        return "(no channels registered)"
    return "\n\n".join(describe(name) for name in names())
