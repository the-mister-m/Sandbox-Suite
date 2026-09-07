
# change modal frame pair and session templates

import json
import os
import time

import pytest

from ade import frames
from ade import tracks


@pytest.fixture
def environment(tmp_path, monkeypatch):
    monkeypatch.setattr(tracks, "archives_dir", lambda: str(tmp_path))
    environment = tracks.Environment()
    tracks._ensure_session(environment)
    yield environment
    tracks._reset_to_scratch(environment)


def _make_region(environment, reset_on_change):
    track = tracks.create_track("modal test", root=".", environment=environment)
    region = tracks.insert_region(
        track.id, "modal test", "gemma4:26b",
        settings={"reset_on_change": reset_on_change}, environment=environment)
    return track, region


def _await_replacement(track_id, region_id, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        fresh = [r for r in tracks.regions_of(track_id) if r.id != region_id]
        if fresh:
            return fresh[0]
        time.sleep(0.01)
    return None


def test_a_setting_change_with_reset_on_change_off_needs_a_choice(environment):
    track, region = _make_region(environment, False)
    assert region.prompts_on_change(
        [{"type": "setting", "key": "num_ctx", "value": 4096}])


def test_a_setting_change_with_reset_on_change_on_needs_no_choice(environment):
    track, region = _make_region(environment, True)
    assert not region.prompts_on_change(
        [{"type": "setting", "key": "num_ctx", "value": 4096}])


def test_a_rename_never_prompts(environment):
    track, region = _make_region(environment, False)
    assert not region.prompts_on_change([{"type": "rename", "value": "new"}])


def test_a_gate_edit_never_prompts(environment):
    track, region = _make_region(environment, False)
    assert not region.prompts_on_change([{"type": "overlay", "value": []}])


def test_rewrite_cache_applies_and_keeps_the_transcript(environment):
    track, region = _make_region(environment, False)
    region.sess.messages.append({"role": "user", "content": "hello"})
    before = len(region.sess.messages)
    region.apply_in_place([{"type": "setting", "key": "num_ctx", "value": 4096}])
    assert region.sess.settings["num_ctx"] == 4096
    assert len(region.sess.messages) == before
    assert tracks.get_region(region.id) is region


def test_reset_region_applies_and_resets(environment):
    track, region = _make_region(environment, False)
    old_id = region.id
    region.apply_with_reset([{"type": "setting", "key": "num_ctx", "value": 4096}])
    fresh = _await_replacement(track.id, old_id)
    assert fresh is not None
    assert fresh.sess.settings["num_ctx"] == 4096


def test_the_three_choices_are_the_frame_vocabulary():
    assert frames.CHANGE_CHOICES == ("reset_region", "rewrite_cache", "cancel")


def test_a_parked_change_is_taken_once():
    token = frames._park_change("r-1", "edit", items=[])
    assert frames._take_change(token)["region"] == "r-1"
    assert frames._take_change(token) is None


def test_a_session_template_holds_tracks_and_no_regions(environment):
    track, region = _make_region(environment, False)
    d = tracks.save_session_template("plan a", environment)
    assert d
    with open(os.path.join(d, "master.json")) as fh:
        master = json.load(fh)
    assert master["kind"] == tracks.SESSION_TEMPLATE_KIND
    assert master["regions"] == []
    assert master["plan"] is None
    assert len(master["tracks"]) == 1
    row = master["tracks"][0]
    assert row["name"] == "modal test"
    assert row["regions"] == []
    assert "order" in row and "root" in row


def test_session_templates_list_apart_from_matrix_templates(environment):
    track, region = _make_region(environment, False)
    tracks.save_session_template("plan b", environment)
    tracks.save_template("environment b", environment)
    rows = tracks.list_session_templates()
    assert [r["name"] for r in rows] == ["plan b"]
    assert rows[0]["tracks"] == 1
