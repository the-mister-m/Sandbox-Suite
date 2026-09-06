
from engine import agent_loop as al
from engine import providers as pv


AGENT_LOOP = "agent-loop"
USER_LOOP  = "user-loop"
LOOPLESS   = "loopless"

MECH_NATIVE = "native"
MECH_CLI    = "cli"
MECH_SDK    = "sdk"
MECH_API    = "api"


HARNESS_USER_LOOP = ["gate_wait_s", "max_tools"]

SAMPLING_14 = [
    "temperature", "top_k", "top_p", "min_p", "repeat_penalty", "repeat_last_n",
    "seed", "num_predict", "keep_alive", "mirostat", "mirostat_tau",
    "mirostat_eta", "num_gpu", "num_thread",
]

def _unwired(key, why, marker=None):
    row = {"key": key, "why": why}
    if marker:
        row["marker"] = marker
    return row


PROVIDERS = [
    {"id": "ollama", "label": "Ollama", "kind": "local"},
    {"id": "gemini", "label": "Gemini", "kind": "cloud"},
    {"id": "claude", "label": "Claude", "kind": "cloud"},
]


CLAUDE_BLOCK = ["claude_effort", "claude_keep_warm", "claude_cache_ttl",
                "claude_exclude_dynamic", "request_timeout",
                "claude_setting_sources", "claude_system_prompt",
                "claude_bare", "claude_config_dir", "claude_memory_enabled",
                "claude_md_excludes", "claude_output_style",
                "claude_settings_file", "claude_disallowed_tools",
                "claude_add_dirs"]


RAILS = [
    {
        "provider": "ollama", "loop_class": USER_LOOP, "mechanism": MECH_NATIVE,
        "label": "Ollama · native tool-calling", "piped": True,
        "params": ["num_ctx", "request_timeout", "think"] + HARNESS_USER_LOOP + SAMPLING_14,
        "unwired": [],
    },
    {
        "provider": "gemini", "loop_class": USER_LOOP, "mechanism": MECH_NATIVE,
        "label": "Gemini · metered API", "piped": True,
        "params": list(HARNESS_USER_LOOP),
        "unwired": [
            _unwired("request_timeout", "passed to chat() and discarded — no enforcement path"),
        ],
    },
    {
        "provider": "claude", "loop_class": USER_LOOP, "mechanism": MECH_CLI,
        "label": "Claude CLI · tools OFF", "piped": True,
        "params": HARNESS_USER_LOOP + CLAUDE_BLOCK,
        "unwired": [],
    },
    {
        "provider": "claude", "loop_class": AGENT_LOOP, "mechanism": MECH_CLI,
        "label": "Claude CLI · tools ON (hook-governed)", "piped": True,
        "params": ["claude_tools", "gate_wait_s", "claude_hook_ask_blocking"]
                  + CLAUDE_BLOCK,
        "unwired": [],
    },
]


def infer_provider(model):
    if not model:
        return "ollama"
    if model.startswith("gemini"):
        return "gemini"
    if model in pv.CLAUDE_MODELS:
        return "claude"
    return "ollama"


def rails_for(provider):
    return [r for r in RAILS if r["provider"] == provider]


def loop_classes_for(provider):
    return list(dict.fromkeys(r["loop_class"] for r in rails_for(provider)))


def mechanisms_for(provider, loop_class):
    return [r["mechanism"] for r in RAILS
            if r["provider"] == provider and r["loop_class"] == loop_class]


def find_rail(provider, loop_class, mechanism):
    for r in RAILS:
        if (r["provider"] == provider and r["loop_class"] == loop_class
                and r["mechanism"] == mechanism):
            return r
    return None


def normalize(provider=None, loop_class=None, mechanism=None, model=None):
    known = {p["id"] for p in PROVIDERS}
    if provider not in known:
        provider = infer_provider(model)
    classes = loop_classes_for(provider)
    if loop_class not in classes:
        loop_class = classes[0] if classes else USER_LOOP
    mechs = mechanisms_for(provider, loop_class)
    if mechanism not in mechs:
        mechanism = mechs[0] if mechs else MECH_NATIVE
    return provider, loop_class, mechanism


def _models_by_provider():
    r = getattr(al, "router", None) or pv.Router()
    out = {p["id"]: [] for p in PROVIDERS}
    for pid, prov in r.providers.items():
        try:
            if prov.available():
                out[pid] = [row["id"] for row in prov.list_models()]
        except Exception:
            pass
    return out


MARKERS = {
    "not_piped": {
        "level": "warn",
        "title": "not piped",
        "text": ("This rail is fully described but not yet wired to run a turn. "
                 "Enabling it is a flag flip in ade/rails.py plus provider "
                 "wiring — no UI work."),
    },
}



def catalog():
    return {
        "providers": PROVIDERS,
        "rails": [r for r in RAILS if not r.get("hidden")],
        "models": _models_by_provider(),
        "markers": MARKERS,
        "loop_classes": [AGENT_LOOP, USER_LOOP, LOOPLESS],
        "sampling": SAMPLING_14,
    }
