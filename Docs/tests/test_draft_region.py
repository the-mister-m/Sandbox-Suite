# settings drafted before a region exists — the create frame carries the
# whole bag, plus seat and overlay_rows as their own top-level fields

import pytest

from ade import frames
from ade import tracks
from engine import settings as settings_table


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(tracks, "archives_dir", lambda: str(tmp_path))
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


def test_settings_bag_lands_at_creation(sandbox):
    environment = tracks.Environment()
    track = _track(environment)
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
        "settings": {"gate_wait_s": 42, "max_tools": 7,
                     "reset_on_change": False, "temperature": 0.15},
    }, environment)
    assert reg is not None
    assert reg.sess.settings["gate_wait_s"] == 42
    assert reg.sess.settings["max_tools"] == 7
    assert reg.sess.settings["reset_on_change"] is False
    assert reg.sess.settings["temperature"] == 0.15


def test_untouched_keys_keep_their_defaults(sandbox):
    environment = tracks.Environment()
    track = _track(environment)
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
        "settings": {"gate_wait_s": 42},
    }, environment)
    defaults = settings_table.region_defaults("")
    assert reg.sess.settings["max_tools"] == defaults["max_tools"]
    assert reg.sess.settings["claude_mode"] == defaults["claude_mode"]


def test_seat_rides_top_level(sandbox):
    environment = tracks.Environment()
    track = _track(environment)
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
        "seat": "navigator",
    }, environment)
    assert reg.seat == "navigator"
    assert reg.sess.settings["seat"] == "navigator"


def test_overlay_rows_ride_top_level(sandbox):
    environment = tracks.Environment()
    track = _track(environment)
    rows = [{"edge": "tool", "driver": "model", "scope": "*", "hook": "deny"}]
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
        "overlay_rows": rows,
    }, environment)
    assert reg.overlay_rows == rows
    assert reg.sess.policy_overlay == rows


def test_no_overlay_falls_back_to_the_server_default(sandbox):
    environment = tracks.Environment()
    track = _track(environment)
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
    }, environment)
    assert reg.overlay_rows == tracks.default_overlay_rows()


def test_a_full_draft_bag_applies_without_dropping_keys(sandbox):
    # the shape devagent.commitDraft actually sends: every region default
    # copied, a few edited, model and seat set
    environment = tracks.Environment()
    track = _track(environment)
    bag = settings_table.region_defaults("")
    bag["model"] = "gemma4:26b"
    bag["gate_wait_s"] = 99
    bag["claude_effort"] = "high"
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
        "settings": bag, "seat": "scout",
    }, environment)
    assert reg.sess.settings["gate_wait_s"] == 99
    assert reg.sess.settings["claude_effort"] == "high"
    assert reg.sess.settings["model"] == "gemma4:26b"
    assert reg.model == "gemma4:26b"
    assert reg.seat == "scout"
    for key in bag:
        assert key in reg.sess.settings


def test_rails_are_normalized_even_when_the_client_sends_none(sandbox):
    environment = tracks.Environment()
    track = _track(environment)
    reg = frames._do_insert_region({
        "track": track.id, "name": "drafted", "model": "gemma4:26b",
    }, environment)
    assert reg.provider
    assert reg.loop_class
    assert reg.mechanism
