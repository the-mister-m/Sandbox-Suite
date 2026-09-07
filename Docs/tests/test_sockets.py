
# one socket bound to one environment, the window count, one gate vocabulary

import json
import threading

import pytest

from ade import frames
from ade import tracks
from ade import web_io


class _FakeWS:

    def __init__(self):
        self.sent = []

    def send(self, raw):
        self.sent.append(json.loads(raw))


class _FakeWebIO(web_io.AdeSenders):

    def __init__(self):
        self.ws = _FakeWS()
        self._send_lock = threading.Lock()

    def types(self):
        return [f.get("type") for f in self.ws.sent]

    def out(self, text, dim=False):
        pass

    def resolve_gate(self, gid, text):
        return False


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


def _environment():
    environment = tracks.Environment()
    tracks._ensure_session(environment)
    return environment


def _ctx(webio, environment):
    return frames.AdeCtx(webio, "conn-test", lambda sess: None,
                         lambda sess: None, environment)


def test_a_broadcast_reaches_only_the_sockets_bound_to_that_environment(sandbox):
    a, b = _environment(), _environment()
    io_a, io_b = _FakeWebIO(), _FakeWebIO()
    frames.register_conn(io_a, a)
    frames.register_conn(io_b, b)
    try:
        frames._broadcast(a, "send_reload", "a only")
        assert io_a.types() == ["reload"]
        assert io_b.types() == []
    finally:
        frames.unregister_conn(io_a)
        frames.unregister_conn(io_b)


def test_the_window_count_is_the_sockets_bound_to_that_environment(sandbox):
    a, b = _environment(), _environment()
    io_a, io_b, io_c = _FakeWebIO(), _FakeWebIO(), _FakeWebIO()
    frames.register_conn(io_a, a)
    frames.register_conn(io_b, a)
    frames.register_conn(io_c, b)
    try:
        rows = {r["id"]: r for r in tracks.environment_rows()}
        assert rows[a.sid()]["windows"] == 2
        assert rows[b.sid()]["windows"] == 1
        frames.unregister_conn(io_b)
        rows = {r["id"]: r for r in tracks.environment_rows()}
        assert rows[a.sid()]["windows"] == 1
    finally:
        frames.unregister_conn(io_a)
        frames.unregister_conn(io_b)
        frames.unregister_conn(io_c)


def test_a_socket_against_a_missing_session_id_is_refused(sandbox):
    io = _FakeWebIO()

    assert tracks.get_environment("nosuchsession") is None
    frames.refuse(io, "no open session nosuchsession")

    assert io.types() == ["session_refused"]
    assert io.ws.sent[0]["reason"] == "no open session nosuchsession"


def test_an_answer_of_y_no_longer_reaches_the_gate_queue(sandbox, monkeypatch):
    seen = []
    monkeypatch.setattr(frames.dq, "answer_gate",
                        lambda gid, ok: seen.append((gid, ok)))
    monkeypatch.setattr(frames.dq, "notify", lambda reason: None)
    environment = _environment()
    io = _FakeWebIO()
    ctx = _ctx(io, environment)

    frames.handle(ctx, {"type": "answer", "id": "g-1", "text": "y"})

    assert seen == []


def test_an_answer_of_n_no_longer_reaches_the_gate_queue(sandbox, monkeypatch):
    seen = []
    monkeypatch.setattr(frames.dq, "deny", lambda gid: seen.append(gid) or {})
    environment = _environment()
    io = _FakeWebIO()
    ctx = _ctx(io, environment)

    frames.handle(ctx, {"type": "answer", "id": "g-2", "text": "n"})

    assert seen == []


def test_the_answer_translation_is_gone():
    assert not hasattr(frames, "ANSWER_ACTIONS")


def test_gate_action_approve_answers_the_gate(sandbox, monkeypatch):
    seen = []
    monkeypatch.setattr(frames.dq, "answer_gate",
                        lambda gid, ok: seen.append((gid, ok)))
    monkeypatch.setattr(frames.dq, "notify", lambda reason: None)
    environment = _environment()
    ctx = _ctx(_FakeWebIO(), environment)

    frames.handle(ctx, {"type": "gate_action", "action": "approve", "id": "g-3"})

    assert seen == [("g-3", True)]


def test_gate_action_deny_denies_the_gate(sandbox, monkeypatch):
    seen = []
    monkeypatch.setattr(frames.dq, "deny", lambda gid: seen.append(gid) or {})
    environment = _environment()
    ctx = _ctx(_FakeWebIO(), environment)

    frames.handle(ctx, {"type": "gate_action", "action": "deny", "id": "g-4"})

    assert seen == ["g-4"]


def test_gate_action_queue_defers_the_gate(sandbox, monkeypatch):
    seen = []
    monkeypatch.setattr(frames.dq, "defer_gate", lambda gid: seen.append(gid))
    environment = _environment()
    ctx = _ctx(_FakeWebIO(), environment)

    frames.handle(ctx, {"type": "gate_action", "action": "queue", "id": "g-5"})

    assert seen == ["g-5"]


def test_a_bound_socket_reads_its_own_environments_waypoint(sandbox):
    a, b = _environment(), _environment()
    io = _FakeWebIO()
    ctx = _ctx(io, a)
    a.waypoint.append_message("sender-a", [tracks.HUMAN_SENDER], "for a",
                              wake=False)
    b.waypoint.append_message("sender-b", [tracks.HUMAN_SENDER], "for b",
                              wake=False)

    frames.handle(ctx, {"type": "wp_feed"})

    bodies = [l["body"] for l in io.ws.sent[0]["lines"]]
    assert bodies == ["for a"]
