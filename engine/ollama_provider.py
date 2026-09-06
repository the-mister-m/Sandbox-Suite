
import json
import requests

from engine.settings import block_keys, harness_keys


def _to_ollama_messages(messages):
    out = []
    for m in messages:
        media = m.get("media")
        if not media:
            out.append(m)
            continue
        msg = {k: v for k, v in m.items() if k != "media"}
        imgs = [item["data_b64"] for item in media if item.get("kind") == "image"]
        if imgs:
            msg["images"] = imgs
        out.append(msg)
    return out


_OPTION_KEYS = ("temperature", "top_k", "top_p", "min_p", "repeat_penalty",
                "repeat_last_n", "seed", "num_predict", "mirostat",
                "mirostat_tau", "mirostat_eta", "num_gpu", "num_thread")


def split_model(name):
    model, sep, version = (name or "").partition(":")
    return model, (version if sep else "")


class OllamaProvider:

    id = "ollama"
    label = "Ollama"
    kind = "local"
    tool_mode = "native"
    settings_keys = block_keys("ollama") + harness_keys()

    def __init__(self, model: str = "gemma4:26b-mxfp8",
                 host: str = "http://localhost:11434"):
        self.model = model
        self.host = host

    def available(self) -> bool:
        try:
            resp = requests.get(f"{self.host}/api/tags", timeout=5)
            return resp.status_code == 200
        except requests.exceptions.ConnectionError:
            return False

    def list_models(self) -> list[dict]:
        try:
            resp = requests.get(f"{self.host}/api/tags", timeout=5)
            resp.raise_for_status()
            names = sorted(m["name"] for m in resp.json().get("models", []))
        except requests.exceptions.RequestException:
            return []
        rows = []
        for name in names:
            model, version = split_model(name)
            rows.append({"id": name, "provider": self.id,
                         "model": model, "version": version})
        return rows

    def chat(self, messages, model=None, settings=None, tools=None,
             region_id=None, root=None, metrics_sink=None):
        s = settings or {}
        body = {
            "model": model or self.model,
            "messages": _to_ollama_messages(messages),
            "stream": True,
        }
        if s.get("think") is False:
            body["think"] = False
        if tools:
            body["tools"] = tools
        keep_alive = s.get("keep_alive")
        if keep_alive is not None:
            body["keep_alive"] = keep_alive * 60

        opts = {}
        if s.get("num_ctx"):
            opts["num_ctx"] = s["num_ctx"]
        for key in _OPTION_KEYS:
            val = s.get(key)
            if val is not None:
                opts[key] = val
        if opts:
            body["options"] = opts

        timeout = (10, s.get("request_timeout") or 600)
        resp = requests.post(f"{self.host}/api/chat", json=body, stream=True,
                             timeout=timeout)
        resp.raise_for_status()

        try:
            for line in resp.iter_lines():
                if not line:
                    continue
                obj = json.loads(line)
                message = obj.get("message", {})
                if message.get("thinking"):
                    yield ("thinking", message["thinking"])
                if message.get("content"):
                    yield ("content", message["content"])
                if message.get("tool_calls"):
                    yield ("tool_call", message["tool_calls"])
                if obj.get("done"):
                    yield ("metrics", {
                        "in_tokens":   obj.get("prompt_eval_count", 0),
                        "out_tokens":  obj.get("eval_count", 0),
                        "duration_ns": obj.get("eval_duration", 0),
                    })
                    break
        except GeneratorExit:
            resp.close()
            raise

    def unload(self, model=None, region_id=None) -> str:
        try:
            if model is None:
                r = requests.get(f"{self.host}/api/ps", timeout=5)
                r.raise_for_status()
                loaded = [m["name"] for m in r.json().get("models", [])]
            else:
                loaded = [model]
            if not loaded:
                return "[unload] nothing loaded in ollama"
            for m in loaded:
                requests.post(f"{self.host}/api/generate",
                              json={"model": m, "keep_alive": 0}, timeout=10)
            return "[unload] " + ", ".join(loaded)
        except requests.exceptions.RequestException as e:
            return f"[unload failed: {e}]"
