
# preset rules: one write, one copy, one removal, no region state read

import json
import os
import time

import pytest

from ade import frames
from ade import tracks
from engine import settings as st


@pytest.fixture
def environment(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "PRESETS_DIR", str(tmp_path))
    monkeypatch.setattr(tracks, "archives_dir", lambda: str(tmp_path))
    environment = tracks.Environment()
    tracks._ensure_session(environment)
    yield environment
    tracks._reset_to_scratch(environment)


def _make_region(environment, reset_on_change):
    track = tracks.create_track("preset test", root=".", environment=environment)
    region = tracks.insert_region(
        track.id, "preset test", "gemma4:26b",
        settings={"reset_on_change": reset_on_change}, environment=environment)
    return track, region


def _file_fields(name):
    with open(os.path.join(st.PRESETS_DIR, name + ".json")) as fh:
        raw = json.load(fh)
    raw.pop("name", None)
    return raw


def _await_replacement(track_id, region_id, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        fresh = [r for r in tracks.regions_of(track_id) if r.id != region_id]
        if fresh:
            return fresh[0]
        time.sleep(0.01)
    return None


def test_save_from_a_live_region_writes_the_whole_bag(environment):
    track, region = _make_region(environment, False)
    region.sess.settings["num_ctx"] = 4096
    ok, path = frames._do_save_preset(region, "alpha")
    assert ok, path
    fields = _file_fields("alpha")
    bag = region.sess.settings
    for key, value in fields.items():
        if key == st.OVERLAY_KEY:
            continue
        assert bag[key] == value, key
    assert fields["num_ctx"] == 4096


def test_load_onto_a_live_region_copies_the_whole_bag(environment):
    track, region = _make_region(environment, False)
    region.sess.settings["num_ctx"] = 8192
    ok, _ = frames._do_save_preset(region, "beta")
    assert ok
    region.sess.settings["num_ctx"] = 1024

    ok, warnings = frames._do_load_preset(region, "beta", mode="in_place")
    assert ok and not warnings
    fields = _file_fields("beta")
    bag = region.sess.settings
    for key, value in fields.items():
        assert bag[key] == value, key
    assert bag["preset_name"] == "beta"


def test_delete_removes_one_file_and_the_list_re_reads_from_disk(environment):
    track, region = _make_region(environment, False)
    frames._do_save_preset(region, "gamma")
    frames._do_save_preset(region, "delta")
    assert st.list_presets() == ["delta", "gamma"]
    ok, _ = st.delete_preset("gamma")
    assert ok
    assert st.list_presets() == ["delta"]
    assert not os.path.exists(os.path.join(st.PRESETS_DIR, "gamma.json"))


def test_load_with_reset_on_change_true_lands_on_the_fresh_region(environment):
    track, region = _make_region(environment, True)
    region.sess.settings["num_ctx"] = 2048
    ok, _ = frames._do_save_preset(region, "hot")
    assert ok
    old_id = region.id

    frames._do_load_preset(region, "hot", mode="reset")
    fresh = _await_replacement(track.id, old_id)
    assert fresh is not None
    fields = _file_fields("hot")
    for key, value in fields.items():
        if key == st.OVERLAY_KEY:
            continue
        assert fresh.sess.settings[key] == value, key


def test_load_with_reset_on_change_false_lands_in_place(environment):
    track, region = _make_region(environment, False)
    region.sess.settings["num_ctx"] = 16384
    ok, _ = frames._do_save_preset(region, "cold")
    assert ok
    region.sess.settings["num_ctx"] = 1024
    old_id = region.id

    frames._do_load_preset(region, "cold", mode="in_place")
    assert tracks.get_region(old_id) is region
    fields = _file_fields("cold")
    for key, value in fields.items():
        assert region.sess.settings[key] == value, key


def test_save_and_load_do_not_read_region_liveness(environment):
    track, region = _make_region(environment, False)
    ok, _ = frames._do_save_preset(region, "idle")
    assert ok
    tracks.stop_region(region.id)
    ok, _ = frames._do_save_preset(region, "idle")
    assert ok
    ok, warnings = frames._do_load_preset(region, "idle", mode="in_place")
    assert ok and not warnings
