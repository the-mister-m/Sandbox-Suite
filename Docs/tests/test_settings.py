
import json
import pytest

from engine import settings as st


def test_every_row_has_a_legal_tier_and_block():
    for row in st.ROWS:
        assert row.tier in st.TIERS, row.key
        assert row.block in st.BLOCKS, row.key


def test_reset_on_change_defaults_on_for_every_provider_kind():
    assert st.region_defaults("cloud")["reset_on_change"] is True
    assert st.region_defaults("local")["reset_on_change"] is True


def test_preset_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "PRESETS_DIR", str(tmp_path))
    bag = st.region_defaults("cloud")
    bag["model"] = "sonnet"
    bag["claude_tools"] = ["Read", "Bash"]
    fields = {k: bag[k] for k in st.preset_keys()}
    ok, path = st.write_preset("round trip", fields)
    assert ok, path
    back, warnings = st.read_preset("round trip")
    assert warnings == []
    assert back == fields


def test_unknown_preset_key_is_dropped_with_a_warning(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "PRESETS_DIR", str(tmp_path))
    (tmp_path / "odd.json").write_text(json.dumps({"model": "sonnet",
                                                   "not_a_setting": 1}))
    fields, warnings = st.read_preset("odd")
    assert fields == {"model": "sonnet"}
    assert any("not_a_setting" in w for w in warnings)


def test_wrong_type_preset_value_is_dropped_with_a_warning(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "PRESETS_DIR", str(tmp_path))
    (tmp_path / "bad.json").write_text(json.dumps({"model": "sonnet",
                                                   "num_ctx": "big"}))
    fields, warnings = st.read_preset("bad")
    assert fields == {"model": "sonnet"}
    assert any("num_ctx" in w for w in warnings)


def test_load_global_on_a_missing_file_returns_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "GLOBAL_PATH", str(tmp_path / "nope.json"))
    assert st.load_global() == st.GLOBAL_DEFAULTS


def test_save_global_rejects_an_unknown_key(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "GLOBAL_PATH", str(tmp_path / "global.json"))
    with pytest.raises(st.GlobalError):
        st.save_global({"not_a_global": True})


def test_save_global_writes_a_known_key(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "GLOBAL_PATH", str(tmp_path / "global.json"))
    out = st.save_global({"gate_keyboard": False})
    assert out["gate_keyboard"] is False
    assert st.load_global()["gate_keyboard"] is False


def test_harness_keys_exclude_identity_and_gates():
    keys = st.harness_keys()
    for k in ("model", "seat", "preset_name", st.OVERLAY_KEY):
        assert k not in keys


def test_block_keys_are_disjoint():
    ollama = set(st.block_keys("ollama"))
    claude = set(st.block_keys("claude"))
    harness = set(st.harness_keys())
    assert not ollama & claude
    assert not ollama & harness
    assert not claude & harness
