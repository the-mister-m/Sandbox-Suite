
from engine import providers as pv
from engine import settings as st


def test_provider_for_routes_by_model_name():
    r = pv.Router()
    assert r.provider_for("gemini-2.5-flash").id == "gemini"
    assert r.provider_for("sonnet").id == "claude"
    assert r.provider_for("gemma4:26b").id == "ollama"


class FakeProvider:

    id = "fake"
    label = "Fake"
    kind = "local"
    tool_mode = "native"
    settings_keys = ("num_ctx", "request_timeout")

    def __init__(self):
        self.seen = None

    def available(self):
        return True

    def list_models(self):
        return [{"id": "fake:1", "provider": "fake",
                 "model": "fake", "version": "1"}]

    def chat(self, messages, model=None, settings=None, tools=None,
             region_id=None, root=None, metrics_sink=None):
        self.seen = settings
        yield ("metrics", {"in_tokens": 0, "out_tokens": 0, "duration_ns": 0})

    def unload(self, model=None, region_id=None):
        return "[fake] nothing to unload"


def test_a_provider_receives_only_its_block_keys_plus_harness_keys():
    fake = FakeProvider()
    bag = st.region_defaults("local")
    bag["model"] = "gemma4:26b"
    settings = {k: bag[k] for k in st.block_keys("ollama") + st.harness_keys()}
    r = pv.Router()
    r.providers["ollama"] = fake
    list(r.chat([], model="gemma4:26b", settings=settings))
    assert set(settings) == set(st.block_keys("ollama")) | set(st.harness_keys())
    assert "claude_tools" not in fake.seen
    assert "model" not in fake.seen
    assert fake.seen["num_ctx"] == bag["num_ctx"]


def test_list_models_rows_carry_the_four_columns(monkeypatch):
    monkeypatch.setattr(st, "GLOBAL_PATH", "/nonexistent/global.json")
    r = pv.Router()
    r.providers = {"fake": FakeProvider()}
    rows = r.list_models()
    assert rows
    for row in rows:
        assert set(row) == {"id", "provider", "model", "version"}


def test_list_models_applies_the_hidden_list(tmp_path, monkeypatch):
    path = tmp_path / "global.json"
    path.write_text('{"models": {"hidden": ["fake:1"]}}')
    monkeypatch.setattr(st, "GLOBAL_PATH", str(path))
    r = pv.Router()
    r.providers = {"fake": FakeProvider()}
    assert r.list_models() == []


def test_claude_model_rows_split_alias_and_dated_ids():
    assert pv.ClaudeProvider.split_model("sonnet") == ("sonnet", "")
    assert pv.ClaudeProvider.split_model("claude-opus-4-8") == ("opus", "4-8")


def test_ollama_and_gemini_row_splits():
    from engine.ollama_provider import split_model
    assert split_model("gemma4:26b-mxfp8") == ("gemma4", "26b-mxfp8")
    assert split_model("gemma4") == ("gemma4", "")
    assert pv.GeminiProvider.split_model("gemini-2.5-flash") == ("gemini", "2.5-flash")


def test_provider_surface_is_uniform():
    for provider in pv.Router().providers.values():
        assert provider.kind in ("local", "cloud")
        assert provider.tool_mode in ("native", "text")
        assert isinstance(provider.settings_keys, tuple)
