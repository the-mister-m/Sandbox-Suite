
# a environment per session, the environment registry, end, and shutdown autosave

import json
import os

import pytest

from ade import frames
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


class _FakeSocket:
    def __init__(self):
        self.closed = 0

    def close(self):
        self.closed += 1


class _FakeWebIO:
    def __init__(self):
        self.ws = _FakeSocket()


def _environment_with_one_region(name):
    environment = tracks.Environment()
    tracks._ensure_session(environment)
    track = tracks.create_track(name, root=".", environment=environment)
    region = tracks.insert_region(track.id, name, "gemma4:26b", environment=environment)
    return environment, region


def test_two_environments_each_hold_their_own_region(sandbox):
    a, ra = _environment_with_one_region("alpha")
    b, rb = _environment_with_one_region("bravo")

    assert a is not b
    assert [r.id for r in tracks.list_regions(a)] == [ra.id]
    assert [r.id for r in tracks.list_regions(b)] == [rb.id]
    assert len(tracks.list_tracks(a)) == 1
    assert len(tracks.list_tracks(b)) == 1


def test_each_environment_owns_its_log_path(sandbox):
    a, _ = _environment_with_one_region("alpha")
    b, _ = _environment_with_one_region("bravo")

    assert a.log_dir != b.log_dir
    assert a.log_dir == tracks.session_dir(a.sid())
    assert b.log_dir == tracks.session_dir(b.sid())
    assert a.waypoint_path != b.waypoint_path


def test_a_region_is_found_from_either_environment(sandbox):
    a, ra = _environment_with_one_region("alpha")
    b, rb = _environment_with_one_region("bravo")

    assert tracks.get_region(ra.id) is ra
    assert tracks.get_region(rb.id) is rb
    assert tracks.environment_of_region(ra.id) is a
    assert tracks.environment_of_region(rb.id) is b


def test_ending_one_environment_leaves_the_other_untouched(sandbox):
    a, ra = _environment_with_one_region("alpha")
    b, rb = _environment_with_one_region("bravo")

    tracks.end_session(a.sid())

    assert tracks.get_environment(a.sid()) is None
    assert tracks.get_environment(b.sid()) is b
    assert [r.id for r in tracks.list_regions(b)] == [rb.id]
    assert tracks.get_region(rb.id) is rb


def test_open_rows_list_every_live_environment(sandbox):
    a, _ = _environment_with_one_region("alpha")
    b, _ = _environment_with_one_region("bravo")

    ids = [row["id"] for row in tracks.environment_rows()]
    assert a.sid() in ids
    assert b.sid() in ids
    row = [r for r in tracks.environment_rows() if r["id"] == a.sid()][0]
    assert row["tracks"] == 1
    assert row["windows"] == 0
    assert row["saved"] is False


def test_save_on_shutdown_writes_an_unnamed_environment(sandbox):
    a, _ = _environment_with_one_region("alpha")

    written = tracks.save_all_on_shutdown()
    assert a.sid() in written

    mpath = os.path.join(tracks.session_dir(a.sid()), "master.json")
    with open(mpath) as fh:
        master = json.load(fh)
    assert master["shutdown"] is True
    assert master["saved"] is False
    assert master["name"] is None
    assert master["schema"] == tracks.ARCHIVE_SCHEMA


def test_boot_registration_lists_a_shutdown_environment(sandbox):
    a, _ = _environment_with_one_region("alpha")
    sid = a.sid()
    tracks.save_all_on_shutdown()
    tracks.unregister_environment(sid)

    assert sid in tracks.register_open_archives()

    back = tracks.get_environment(sid)
    assert back is not None
    assert back.hydrated is False
    row = [r for r in tracks.environment_rows() if r["id"] == sid][0]
    assert row["tracks"] == 1
    assert row["windows"] == 0


def test_an_ordinary_save_clears_the_shutdown_flag(sandbox):
    a, _ = _environment_with_one_region("alpha")
    tracks.save_all_on_shutdown()

    tracks.save_session("named", a)

    mpath = os.path.join(tracks.session_dir(a.sid()), "master.json")
    with open(mpath) as fh:
        master = json.load(fh)
    assert master["shutdown"] is False
    assert master["saved"] is True
    assert master["name"] == "named"


def test_a_boot_registered_environment_hydrates_on_reload(sandbox):
    a, ra = _environment_with_one_region("alpha")
    sid = a.sid()
    tracks.save_all_on_shutdown()
    tracks.unregister_environment(sid)
    tracks.register_open_archives()

    back = tracks.reload_session(sid)

    assert back is not None
    assert [r.id for r in tracks.list_regions(back)] == [ra.id]
    assert tracks.get_environment(sid).hydrated is True


def test_an_old_schema_master_reads_with_the_flag_off(sandbox, tmp_path):
    sid = "0123456789ab"
    d = os.path.join(str(tmp_path), sid)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "master.json"), "w") as fh:
        json.dump({"schema": 5, "kind": tracks.SESSION_KIND, "id": sid,
                   "name": "old", "created": "2026-01-01T00:00:00",
                   "tracks": [], "regions": []}, fh)

    master = tracks._read_master(os.path.join(d, "master.json"))

    assert master["shutdown"] is False
    assert master["saved"] is True
    assert master["schema"] == tracks.ARCHIVE_SCHEMA
    assert tracks.register_open_archives() == []


def test_each_environment_writes_its_own_waypoint_file(sandbox):
    a, ra = _environment_with_one_region("alpha")
    b, rb = _environment_with_one_region("bravo")

    tracks.waypoint.append_message(ra.id, [ra.id], "alpha turn", wake=False)
    tracks.waypoint.append_message(rb.id, [rb.id], "bravo turn", wake=False)

    with open(a.waypoint_path) as fh:
        a_bodies = [json.loads(line)["body"] for line in fh if line.strip()]
    with open(b.waypoint_path) as fh:
        b_bodies = [json.loads(line)["body"] for line in fh if line.strip()]

    assert a_bodies == ["alpha turn"]
    assert b_bodies == ["bravo turn"]


def test_ending_one_environment_closes_only_its_own_sockets(sandbox):
    a, _ = _environment_with_one_region("alpha")
    b, _ = _environment_with_one_region("bravo")

    io_a, io_b = _FakeWebIO(), _FakeWebIO()
    frames.register_conn(io_a, a)
    frames.register_conn(io_b, b)

    tracks.end_session(a.sid())
    closed = frames.close_conns(a)

    assert closed == 1
    assert frames.conn_count(a) == 0
    assert frames.conn_count(b) == 1
    assert b.windows == 1
    assert io_a.ws.closed == 1
    assert io_b.ws.closed == 0
