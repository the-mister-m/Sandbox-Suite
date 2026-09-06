
import json
import os

from ade import tracks
from engine import settings as st


# FIX 1 — send_models lives on WebIO, not AdeSenders

def test_send_models_moved_to_engine_web_io():
    from engine.web_io import WebIO
    from ade.web_io import AdeSenders
    assert "send_models" not in AdeSenders.__dict__
    assert "send_models" in WebIO.__dict__


class _FakeWS:
    def __init__(self):
        self.sent = None

    def send(self, payload):
        self.sent = json.loads(payload)


def test_web_io_send_models_carries_list_and_rows():
    from engine.web_io import WebIO
    import threading
    io = WebIO.__new__(WebIO)
    io.ws = _FakeWS()
    io._send_lock = threading.Lock()
    rows = [{"id": "sonnet", "provider": "claude", "model": "sonnet", "version": ""}]
    io.send_models(rows, "sonnet")
    assert io.ws.sent["list"] == ["sonnet"]
    assert io.ws.sent["rows"] == rows
    assert io.ws.sent["current"] == "sonnet"


# FIX 2 — provenance on /api/settings/resolved

class _StubSess:
    def __init__(self, settings):
        self.settings = settings


class _StubRegion:
    def __init__(self, settings):
        self.sess = _StubSess(settings)


def _resolved(monkeypatch, settings):
    import server
    monkeypatch.setattr(server.ade_tracks, "get_region",
                         lambda tid: _StubRegion(settings))
    client = server.app.test_client()
    resp = client.get("/api/settings/resolved?track=x")
    return resp.get_json()


def test_resolved_defaults_have_no_non_global_provenance(monkeypatch):
    bag = dict(st.region_defaults("cloud"))
    data = _resolved(monkeypatch, bag)
    assert all(v == "global" for v in data["provenance"].values())


def test_resolved_edited_key_is_track_layer(monkeypatch):
    bag = dict(st.region_defaults("cloud"))
    bag["claude_bare"] = True
    data = _resolved(monkeypatch, bag)
    assert data["provenance"]["bare"] == "track"


def test_resolved_value_matching_preset_is_preset_layer(tmp_path, monkeypatch):
    monkeypatch.setattr(st, "PRESETS_DIR", str(tmp_path))
    (tmp_path / "mypreset.json").write_text(json.dumps({"claude_bare": True}))
    bag = dict(st.region_defaults("cloud"))
    bag["claude_bare"] = True
    bag["preset_name"] = "mypreset"
    data = _resolved(monkeypatch, bag)
    assert data["provenance"]["bare"] == "preset"


# FIX 3 — Track.apply_edits: name, root, order, in code

def test_track_apply_edits_sets_three_and_rejects_the_rest(tmp_path):
    track = tracks.Track("t1", "old name")
    rejected = track.apply_edits(
        {"name": "x", "root": str(tmp_path), "order": 2, "provider": "ollama"})
    assert rejected == ["provider"]
    assert track.name == "x"
    assert track.root == os.path.abspath(str(tmp_path))
    assert track.order == 2


def test_track_apply_edits_rejects_bad_root():
    track = tracks.Track("t1", "old name", root="/original/root")
    rejected = track.apply_edits({"root": "/no/such/directory/at/all"})
    assert rejected == ["root"]
    assert track.root == "/original/root"
