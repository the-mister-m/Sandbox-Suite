# a session's settings bag survives autosave and reload

import os

import pytest

from ade import tracks


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


def test_a_session_key_survives_autosave_and_reload(sandbox):
    environment = tracks.Environment()
    tracks._ensure_session(environment)
    tracks.save_session("named", environment)
    sid = environment.sid()

    environment.settings["skin"] = "midnight"
    tracks.autosave(environment)
    tracks.unregister_environment(sid)

    back = tracks.reload_session(sid)

    assert back is not None
    assert back.settings["skin"] == "midnight"


def test_a_session_archived_before_the_bag_seeds_from_global(sandbox):
    environment = tracks.Environment()
    tracks._ensure_session(environment)
    tracks.save_session("named", environment)
    sid = environment.sid()
    tracks.unregister_environment(sid)

    back = tracks.reload_session(sid)

    assert back is not None
    assert back.settings["skin"] is None
