
import json
import requests


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


class OllamaProvider:
    def __init__(self, model: str = "gemma4:26b-mxfp8", host: str = "http://localhost:11434"):
        self.model = model
        self.host = host

    def available(self) -> bool:
        try:
            resp = requests.get(f"{self.host}/api/tags", timeout=5)
            return resp.status_code == 200
        except requests.exceptions.ConnectionError:
            return False

    def list_models(self) -> list[str]:
        try:
            resp = requests.get(f"{self.host}/api/tags", timeout=5)
            resp.raise_for_status()
            return sorted(m["name"] for m in resp.json().get("models", []))
        except requests.exceptions.RequestException:
            return []

    def chat(self, messages: list[dict], model: str = None, think: bool = None,
             tools: list = None, num_ctx: int = None, timeout=None,
             temperature: float = None, top_k: int = None, top_p: float = None,
             min_p: float = None, repeat_penalty: float = None,
             repeat_last_n: int = None, seed: int = None, num_predict: int = None,
             keep_alive: int = None, mirostat: int = None,
             mirostat_tau: float = None, mirostat_eta: float = None,
             num_gpu: int = None, num_thread: int = None, **_kwargs):
        body = {
            "model": model or self.model,
            "messages": _to_ollama_messages(messages),
            "stream": True,
        }
        if think is not None:
            body["think"] = think
        if tools:
            body["tools"] = tools
        if keep_alive is not None:
            body["keep_alive"] = keep_alive * 60
        opts = {}
        if num_ctx:
            opts["num_ctx"] = num_ctx
        for key, val in [
            ("temperature", temperature), ("top_k", top_k), ("top_p", top_p),
            ("min_p", min_p), ("repeat_penalty", repeat_penalty),
            ("repeat_last_n", repeat_last_n), ("seed", seed),
            ("num_predict", num_predict), ("mirostat", mirostat),
            ("mirostat_tau", mirostat_tau), ("mirostat_eta", mirostat_eta),
            ("num_gpu", num_gpu), ("num_thread", num_thread),
        ]:
            if val is not None:
                opts[key] = val
        if opts:
            body["options"] = opts

        resp = requests.post(f"{self.host}/api/chat", json=body, stream=True,
                             timeout=timeout or (10, 600))
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

    def unload(self, model: str = None) -> str:
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
