# presets loaded onto and saved from a draft region — the client works the
# REST routes directly, so these pin the client's mirror of the server rules

import pytest

from ade import frames
from ade import tracks
from engine import settings as settings_table


OVERLAY_KEY = settings_table.OVERLAY_KEY


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(tracks, "archives_dir", lambda: str(tmp_path))
    monkeypatch.setattr(settings_table, "PRESETS_DIR", str(tmp_path / "presets"))
    for sid in [w.sid() for w in tracks.list_environments()]:
        tracks.unregister_environment(sid)
    yield tmp_path
    for w in tracks.list_environments():
        w.halt()
    for sid in [w.sid() for w in tracks.list_environments()]:
        tracks.unregister_environment(sid)


def _track(environment, name="t1"):
    tracks._ensure_session(environment)
    return tracks.create_track(name, root=".", environment=environment)


def _region(environment, **kw):
    track = _track(environment)
    msg = {"track": track.id, "name": "drafted", "model": "gemma4:26b"}
    msg.update(kw)
    return frames._do_insert_region(msg, environment)


# ---- what settings-rows.js does, transcribed ----

def js_preset_keys(region_defaults):
    return [k for k in region_defaults
            if k != "preset_name" and k != OVERLAY_KEY]


def js_load(region_defaults, fields, name, draft_settings):
    bag = dict(region_defaults)
    bag.update(fields)
    overlay = bag.pop(OVERLAY_KEY, None)
    if "reset_on_change" not in fields:
        bag["reset_on_change"] = draft_settings.get("reset_on_change")
    bag["preset_name"] = name
    return bag, overlay


def js_save(region_defaults, draft_settings, draft_overlay):
    fields = {k: draft_settings[k] for k in js_preset_keys(region_defaults)
              if k in draft_settings}
    if isinstance(draft_overlay, list):
        fields[OVERLAY_KEY] = draft_overlay
    return fields


def server_bag(items):
    bag, overlay = {}, None
    for it in items:
        if it["type"] == "setting":
            bag[it["key"]] = it["value"]
        elif it["type"] == "seat":
            bag["seat"] = it["value"]
        elif it["type"] == "overlay":
            overlay = it["value"]
    return bag, overlay


# ---- the derivation the client depends on ----

def test_preset_keys_are_region_defaults_less_preset_name(sandbox):
    defaults = settings_table.region_defaults("")
    assert js_preset_keys(defaults) == list(settings_table.preset_keys())


def test_region_defaults_ignores_provider_kind(sandbox):
    assert settings_table.region_defaults("") \
        == settings_table.region_defaults("claude") \
        == settings_table.region_defaults("ollama")


# ---- load parity ----

def test_draft_load_matches_the_server_item_list(sandbox):
    settings_table.write_preset("p1", {
        "model": "claude-opus-5", "gate_wait_s": 77, "max_tools": 3,
        "claude_tools": ["Read", "Grep"], "temperature": 0.4,
    })
    environment = tracks.Environment()
    reg = _region(environment)

    fields, warnings = settings_table.read_preset("p1")
    assert warnings == []

    items, _ = frames._preset_load_items(reg, "p1")
    want, want_overlay = server_bag(items)

    got, got_overlay = js_load(settings_table.region_defaults(""), fields,
                               "p1", reg.sess.settings)
    got["seat"] = got.get("seat") or ""

    assert got == want
    assert got_overlay == want_overlay


def test_draft_load_resets_keys_the_preset_does_not_name(sandbox):
    settings_table.write_preset("p2", {"model": "claude-opus-5"})
    environment = tracks.Environment()
    reg = _region(environment, settings={"gate_wait_s": 999})
    assert reg.sess.settings["gate_wait_s"] == 999

    fields, _ = settings_table.read_preset("p2")
    got, _ = js_load(settings_table.region_defaults(""), fields, "p2",
                     reg.sess.settings)
    assert got["gate_wait_s"] == settings_table.region_defaults("")["gate_wait_s"]


def test_draft_load_holds_reset_on_change_when_the_preset_omits_it(sandbox):
    settings_table.write_preset("p3", {"model": "claude-opus-5"})
    environment = tracks.Environment()
    reg = _region(environment, settings={"reset_on_change": False})

    fields, _ = settings_table.read_preset("p3")
    got, _ = js_load(settings_table.region_defaults(""), fields, "p3",
                     reg.sess.settings)
    assert got["reset_on_change"] is False


def test_draft_load_carries_the_overlay(sandbox):
    settings_table.write_preset("p4", {
        "model": "claude-opus-5",
        OVERLAY_KEY: [{"edge": "tool", "scope": "session"}],
    })
    fields, _ = settings_table.read_preset("p4")
    _, overlay = js_load(settings_table.region_defaults(""), fields, "p4", {})
    assert overlay == [{"edge": "tool", "scope": "session"}]


def test_draft_load_sets_preset_name_last(sandbox):
    settings_table.write_preset("p5", {"model": "claude-opus-5"})
    fields, _ = settings_table.read_preset("p5")
    got, _ = js_load(settings_table.region_defaults(""), fields, "p5", {})
    assert got["preset_name"] == "p5"


# ---- save parity ----

def test_draft_save_captures_what_the_server_captures(sandbox):
    environment = tracks.Environment()
    reg = _region(environment, settings={"gate_wait_s": 55, "max_tools": 9})

    want = frames._capture_preset_fields(reg)
    got = js_save(settings_table.region_defaults(""), reg.sess.settings, None)
    assert got == want


def test_draft_save_writes_no_key_the_reader_would_drop(sandbox):
    environment = tracks.Environment()
    reg = _region(environment)
    fields = js_save(settings_table.region_defaults(""), reg.sess.settings,
                     [{"edge": "tool", "scope": "session"}])
    ok, path = settings_table.write_preset("p6", fields)
    assert ok

    back, warnings = settings_table.read_preset("p6")
    assert warnings == []
    assert back[OVERLAY_KEY] == [{"edge": "tool", "scope": "session"}]


def test_draft_save_does_not_write_preset_name(sandbox):
    environment = tracks.Environment()
    reg = _region(environment)
    reg.sess.settings["preset_name"] = "stale"
    fields = js_save(settings_table.region_defaults(""), reg.sess.settings, None)
    assert "preset_name" not in fields


def test_a_saved_draft_preset_loads_back_onto_a_draft(sandbox):
    environment = tracks.Environment()
    reg = _region(environment, settings={"gate_wait_s": 61, "max_tools": 4})

    fields = js_save(settings_table.region_defaults(""), reg.sess.settings, None)
    ok, _ = settings_table.write_preset("roundtrip", fields)
    assert ok

    read_back, warnings = settings_table.read_preset("roundtrip")
    assert warnings == []
    got, _ = js_load(settings_table.region_defaults(""), read_back,
                     "roundtrip", {})
    assert got["gate_wait_s"] == 61
    assert got["max_tools"] == 4
    assert got["model"] == "gemma4:26b"
