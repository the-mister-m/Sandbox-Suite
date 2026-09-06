
import time

import pytest

from ade import tracks


def _stub_turn(sess):
    return {}


def _await_gone(region_id, timeout=5.0):
    # reset_region hands off to a watcher thread
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if tracks.get_region(region_id) is None:
            return True
        time.sleep(0.01)
    return False


def _await_replacement(track_id, region_id, timeout=5.0):
    # close_region and insert_region are separate steps in the watcher thread
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        fresh = [r for r in tracks.regions_of(track_id) if r.id != region_id]
        if fresh:
            return fresh
        time.sleep(0.01)
    return []


@pytest.fixture
def world():
    tracks._reset_to_scratch()
    yield
    tracks._reset_to_scratch()


def _make_region(reset_on_change):
    track = tracks.create_track("edit test", root=".")
    region = tracks.insert_region(
        track.id, "edit test", "gemma4:26b",
        settings={"reset_on_change": reset_on_change})
    return track, region


def test_setting_edit_with_reset_on_change_replaces_the_region(world):
    track, region = _make_region(True)
    old_id = region.id
    region.apply_edits([{"type": "setting", "key": "num_ctx", "value": 4096}])
    assert _await_gone(old_id)
    fresh = _await_replacement(track.id, old_id)
    assert len(fresh) == 1
    assert fresh[0].sess.settings["num_ctx"] == 4096
    assert any(row.get("id") == old_id for row in tracks.closed_rows())


def test_setting_edit_without_reset_on_change_stays_in_place(world):
    track, region = _make_region(False)
    old_id = region.id
    region.apply_edits([{"type": "setting", "key": "num_ctx", "value": 4096}])
    assert tracks.get_region(old_id) is region
    assert region.sess.settings["num_ctx"] == 4096


def test_rename_never_resets(world):
    for flag in (True, False):
        track, region = _make_region(flag)
        old_id = region.id
        region.apply_edits([{"type": "rename", "value": "renamed"}])
        assert tracks.get_region(old_id) is region
        assert region.name == "renamed"


def test_editing_reset_on_change_itself_applies_in_place(world):
    track, region = _make_region(True)
    old_id = region.id
    region.apply_edits([{"type": "setting", "key": "reset_on_change",
                         "value": False}])
    assert tracks.get_region(old_id) is region
    assert region.sess.settings["reset_on_change"] is False


def test_cloud_model_defaults_reset_on_change_on(world):
    track = tracks.create_track("cloud test", root=".")
    region = tracks.insert_region(track.id, "cloud test", "sonnet")
    assert region.sess.settings["reset_on_change"] is True


def test_local_model_defaults_reset_on_change_off(world):
    track = tracks.create_track("local test", root=".")
    region = tracks.insert_region(track.id, "local test", "gemma4:26b")
    assert region.sess.settings["reset_on_change"] is False


def test_index_entry_carries_the_full_bag(world):
    track, region = _make_region(False)
    row = region.index_entry()
    assert row["settings"]["num_ctx"] == region.sess.settings["num_ctx"]
    assert set(row["settings"]) == set(region.sess.settings)
