
# session tier, widget tier, registries

import json
import os

import pytest

from engine import settings as st


@pytest.fixture
def conf(tmp_path, monkeypatch):
    path = str(tmp_path / "global.json")
    monkeypatch.setattr(st, "GLOBAL_PATH", path)
    monkeypatch.setattr(st, "skins_available", lambda: ["og", "default"])
    return path


def test_session_tier_has_one_row_per_global_key():
    assert "session" in st.TIERS
    assert len(st.SESSION_ROWS) == 13
    assert set(st.SESSION_KEYS) == {
        "skin", "modal_mode", "modal_mode_ade", "gate_keyboard",
        "approve_hold", "confirm", "killswitch", "kill_holds", "kill_hosts",
        "shutdown_suite", "voices", "stt_engine", "models"}


def test_session_rows_carry_the_global_type_and_default():
    for row in st.SESSION_ROWS:
        assert row.tier == "session"
        assert row.default == st.global_value(row.key, st.GLOBAL_DEFAULTS)


def test_an_unset_session_value_reads_global(conf):
    bag = st.session_defaults()
    assert bag["skin"] is None
    assert st.session_value(bag, "skin") == "og"
    assert st.session_value(bag, "stt_engine") == "parakeet_mlx"


def test_a_set_session_value_wins_and_global_is_unchanged(conf):
    bag = dict(st.session_defaults(), skin="default")
    assert st.session_value(bag, "skin") == "default"
    assert st.load_global()["skin"] == "og"


def test_session_effective_covers_every_key(conf):
    out = st.session_effective(st.session_defaults())
    assert set(out) == set(st.SESSION_KEYS)


def test_save_global_defaults_writes_only_the_set_values(conf):
    bag = dict(st.session_defaults(), skin="default", gate_keyboard=False,
               stt_engine="whisper")
    written, current = st.save_global_defaults(bag)
    assert sorted(written) == ["gate_keyboard", "skin", "stt_engine"]
    assert current["skin"] == "default"
    assert current["gate_keyboard"] is False
    assert current["voices"]["stt_engine"] == "whisper"
    with open(conf) as fh:
        assert json.load(fh)["skin"] == "default"


def test_save_global_defaults_leaves_unset_keys_alone(conf):
    st.save_global_defaults(dict(st.session_defaults(), skin="default"))
    assert st.load_global()["modal_mode"] == "fullscreen"


def test_widget_tier_is_keyed_by_type():
    assert "widget" in st.TIERS
    assert "chat" in st.widget_types()
    for rows in st.WIDGET_ROWS.values():
        for row in rows:
            assert row.tier == "widget"


def test_widget_defaults_for_chat_and_queue():
    chat = st.widget_defaults("chat")
    assert chat["speech_enabled"] is False
    assert "tts_engine" in chat and "listen_mode" in chat
    queue = st.widget_defaults("queue")
    assert queue == {"claude_cache_ttl": "1h",
                     "claude_exclude_dynamic": False,
                     "merge_gates": True}


def test_widget_defaults_for_an_unknown_type_is_empty():
    assert st.widget_defaults("nothing-here") == {}


def test_widget_options_do_not_carry_between_instances():
    one = st.widget_defaults("chat")
    one["speech_enabled"] = True
    assert st.widget_defaults("chat")["speech_enabled"] is False


def test_widget_registry_seeds_every_type():
    rows = st.load_widget_registry()
    types = [r["type"] for r in rows]
    assert types == ["chat", "mini_queue", "queue", "editor", "terminal",
                     "browser", "viewer", "mount"]
    for row in rows:
        assert row["label"]
        assert "rows" not in row
    # mount carries no settings rows; it is a throwaway dev widget
    for wtype in types:
        if wtype != "mount":
            assert wtype in st.WIDGET_ROWS


def test_provider_registry_seeds_three_providers_and_two_slots():
    rows = st.load_provider_registry()
    assert [r["id"] for r in rows] == ["ollama", "gemini", "claude",
                                       "cloud", "docker"]
    slots = [r["id"] for r in rows if r["kind"] == "slot"]
    assert slots == ["cloud", "docker"]


def test_a_missing_registry_file_is_an_empty_list(monkeypatch, tmp_path):
    monkeypatch.setattr(st, "REGISTRY_DIR", str(tmp_path))
    assert st.load_widget_registry() == []
    assert st.load_provider_registry() == []
