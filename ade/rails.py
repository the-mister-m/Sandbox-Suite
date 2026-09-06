
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


CODEX_MODELS = ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5")


PROVIDERS = [
    {"id": "ollama",   "label": "Ollama",        "kind": "local"},
    {"id": "llamacpp", "label": "llama.cpp",     "kind": "local"},
    {"id": "litert",   "label": "LiteRT",        "kind": "local"},
    {"id": "gemini",   "label": "Gemini",        "kind": "remote-api"},
    {"id": "claude",   "label": "Claude",        "kind": "remote-sub"},
    {"id": "codex",    "label": "Codex",         "kind": "remote-sub"},
]


RAILS = [
    {
        "provider": "ollama", "loop_class": USER_LOOP, "mechanism": MECH_NATIVE,
        "label": "Ollama · native tool-calling", "piped": True,
        "params": ["num_ctx", "request_timeout", "think"] + HARNESS_USER_LOOP + SAMPLING_14,
        "unwired": [],
    },
    {
        "provider": "llamacpp", "loop_class": USER_LOOP, "mechanism": MECH_NATIVE,
        "label": "llama.cpp · llama-server", "piped": True,
        "params": ["request_timeout"] + HARNESS_USER_LOOP
                  + ["temperature", "top_p", "seed", "num_predict"],
        "unwired": [
            _unwired("num_ctx", "llama-server fixes the window at spawn, not per request"),
            _unwired("think", "text-protocol only — no thinking channel"),
        ] + [_unwired(k, "not mapped onto llama-server's OpenAI endpoint")
             for k in ("top_k", "min_p", "repeat_penalty", "repeat_last_n",
                       "keep_alive", "mirostat", "mirostat_tau", "mirostat_eta",
                       "num_gpu", "num_thread")],
    },
    {
        "provider": "litert", "loop_class": USER_LOOP, "mechanism": MECH_NATIVE,
        "label": "LiteRT · in-process", "piped": True,
        "params": list(HARNESS_USER_LOOP),
        "unwired": [_unwired(k, "maps to SamplerConfig — left default for v1")
                    for k in ("temperature", "top_k", "top_p", "seed")],
    },
    {
        "provider": "gemini", "loop_class": USER_LOOP, "mechanism": MECH_NATIVE,
        "label": "Gemini · metered API", "piped": True,
        "params": list(HARNESS_USER_LOOP),
        "unwired": [
            _unwired("request_timeout", "passed to chat() and discarded — no enforcement path"),
            _unwired("think", "the Gemini API exposes thinking config; this provider never passes it"),
        ],
    },

    {
        "provider": "claude", "loop_class": USER_LOOP, "mechanism": MECH_CLI,
        "label": "Claude CLI · tools OFF", "piped": True,
        "params": HARNESS_USER_LOOP + ["claude_effort", "claude_keep_warm",
                                       "claude_cache_ttl", "claude_exclude_dynamic",
                                       "request_timeout",
                                       "claude_setting_sources", "claude_system_prompt",
                                       "claude_bare", "claude_config_dir",
                                       "claude_memory_enabled", "claude_md_excludes",
                                       "claude_output_style", "claude_settings_file",
                                       "claude_preset",
                                       "claude_disallowed_tools",
                                       "claude_add_dirs"],
        "unwired": [],
    },

    {
        "provider": "claude", "loop_class": AGENT_LOOP, "mechanism": MECH_SDK,
        "label": "Claude Agent SDK · Claude owns the loop", "piped": False,
        "hidden": True,
        "params": ["sdk_effort", "sdk_thinking", "sdk_max_thinking_tokens",
                   "sdk_max_budget_usd", "sdk_task_budget", "sdk_add_dirs",
                   "sdk_disallowed_tools", "sdk_system_prompt",
                   "sdk_max_turns", "gate_wait_s"],
        "replaces": {"max_tools": ["sdk_max_turns", "sdk_max_budget_usd"]},
        "unwired": [],
    },
    {
        "provider": "claude", "loop_class": USER_LOOP, "mechanism": MECH_SDK,
        "label": "Claude Agent SDK · tools=[] (harness owns the loop)", "piped": False,
        "hidden": True,
        "params": ["sdk_effort", "sdk_thinking", "sdk_max_thinking_tokens",
                   "sdk_max_budget_usd", "sdk_task_budget", "sdk_add_dirs",
                   "sdk_disallowed_tools", "sdk_system_prompt"] + HARNESS_USER_LOOP,
        "unwired": [],
    },

    {
        "provider": "claude", "loop_class": AGENT_LOOP, "mechanism": MECH_CLI,
        "label": "Claude CLI · tools ON (hook-governed)", "piped": True,
        "params": ["claude_tools", "claude_effort", "gate_wait_s",
                   "claude_keep_warm", "claude_cache_ttl", "claude_exclude_dynamic",
                   "request_timeout",
                   "claude_hook_ask_blocking", "claude_setting_sources",
                   "claude_system_prompt", "claude_bare", "claude_config_dir",
                   "claude_memory_enabled", "claude_md_excludes",
                   "claude_output_style", "claude_settings_file",
                   "claude_preset",
                   "claude_disallowed_tools", "claude_add_dirs"],
        "unwired": [],
    },
    {
        "provider": "claude", "loop_class": LOOPLESS, "mechanism": MECH_API,
        "label": "Claude Messages API · direct HTTP", "piped": False,
        "params": [],
        "unwired": [],
    },
    {
        "provider": "codex", "loop_class": AGENT_LOOP, "mechanism": MECH_CLI,
        "label": "Codex CLI", "piped": False,
        "hidden": True,
        "params": ["request_timeout", "gate_wait_s", "codex_sandbox_mode",
                   "codex_approval_policy"],
        "unwired": [],
    },
]


def infer_provider(model):
    if not model:
        return "ollama"
    if model.startswith("gemini"):
        return "gemini"
    if model.startswith("llamacpp"):
        return "llamacpp"
    if model in pv.CLAUDE_MODELS:
        return "claude"
    if model.endswith(".litertlm"):
        return "litert"
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
    out = {"ollama": [], "gemini": [], "litert": [], "claude": [], "llamacpp": [],
           "codex": list(CODEX_MODELS)}
    try:
        if r.ollama.available():
            out["ollama"] = list(r.ollama.list_models())
    except Exception:
        pass
    try:
        if r.gemini.available():
            out["gemini"] = list(r.gemini.list_models())
    except Exception:
        pass
    try:
        if r.litert.available():
            out["litert"] = list(r.litert.list_models())
    except Exception:
        pass
    try:
        if r.claude.available():
            out["claude"] = list(r.claude.list_models())
    except Exception:
        pass
    try:
        out["llamacpp"] = list(r.llamacpp.list_models())
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


