
# suite page route, library routes, save_global_defaults round trip

import os

import pytest

from ade import tracks as ade_tracks
from engine import settings as engine_settings


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(ade_tracks, "archives_dir", lambda: str(tmp_path / "archives"))
    monkeypatch.setattr(engine_settings, "PRESETS_DIR", str(tmp_path / "presets"))
    for sid in [w.sid() for w in ade_tracks.list_environments()]:
        ade_tracks.unregister_environment(sid)
    yield tmp_path
    for w in ade_tracks.list_environments():
        w.halt()
    for sid in [w.sid() for w in ade_tracks.list_environments()]:
        ade_tracks.unregister_environment(sid)


@pytest.fixture
def app_client(sandbox):
    import server
    return server.app.test_client()


def test_route_root_serves_the_suite_page(app_client):
    resp = app_client.get("/")
    assert resp.status_code == 200
    assert b"suite" in resp.data.lower()


def test_route_suite_serves_the_same_page(app_client):
    resp = app_client.get("/suite")
    assert resp.status_code == 200


def test_sessions_new_registers_and_lists_a_environment(app_client):
    resp = app_client.post("/api/sessions/new")
    sid = resp.get_json()["sid"]
    open_ids = [r["id"] for r in app_client.get("/api/sessions/open").get_json()["list"]]
    assert sid in open_ids


def test_sessions_open_on_an_unknown_sid_is_404(app_client):
    resp = app_client.post("/api/sessions/nosuchsid/open")
    assert resp.status_code == 404


def test_preset_routes_round_trip(app_client):
    write = app_client.post("/api/library/presets/mypreset",
                            json={"claude_bare": True})
    assert write.get_json()["ok"] is True

    listed = app_client.get("/api/library/presets").get_json()["list"]
    assert "mypreset" in listed

    read = app_client.get("/api/library/presets/mypreset").get_json()
    assert read["fields"]["claude_bare"] is True

    renamed = app_client.post("/api/library/presets/mypreset/rename",
                              json={"new": "renamed"})
    assert renamed.get_json()["ok"] is True

    deleted = app_client.delete("/api/library/presets/renamed")
    assert deleted.get_json()["ok"] is True
    assert "renamed" not in app_client.get("/api/library/presets").get_json()["list"]


def test_providers_route_lists_the_registry(app_client):
    ids = [p["id"] for p in app_client.get("/api/library/providers").get_json()["list"]]
    assert {"ollama", "gemini", "claude", "cloud", "docker"} <= set(ids)


def test_models_route_has_list_and_hidden_keys(app_client):
    data = app_client.get("/api/library/models").get_json()
    assert "list" in data
    assert "hidden" in data


def test_context_files_route_lists_known_folders(app_client):
    data = app_client.get("/api/library/context-files").get_json()
    kinds = {f["kind"] for f in data["list"]}
    assert "global" in kinds


def test_fs_write_then_read_round_trips(app_client, tmp_path):
    f = tmp_path / "note.md"
    f.write_text("before")
    resp = app_client.post("/api/fs/write", json={"path": str(f), "text": "after"})
    assert resp.get_json()["ok"] is True
    read = app_client.get(f"/api/fs/read?path={f}")
    assert read.get_json()["text"] == "after"


def test_session_template_load_then_delete(app_client):
    environment = ade_tracks.new_session()
    d = ade_tracks.save_session_template("a template", environment)
    tid = os.path.basename(d)

    loaded = app_client.post(f"/api/session-templates/{tid}/load")
    assert loaded.status_code == 200
    assert "sid" in loaded.get_json()

    deleted = app_client.delete(f"/api/session-templates/{tid}")
    assert deleted.get_json()["ok"] is True

    missing = app_client.post(f"/api/session-templates/{tid}/load")
    assert missing.status_code == 404


def test_session_template_delete_unknown_is_404(app_client):
    resp = app_client.delete("/api/session-templates/nosuchtid")
    assert resp.status_code == 404


def test_save_global_defaults_route_writes_and_reads_back(app_client, monkeypatch, tmp_path):
    monkeypatch.setattr(engine_settings, "GLOBAL_PATH", str(tmp_path / "global.json"))
    resp = app_client.post("/api/global/update-default", json={"gate_keyboard": False})
    body = resp.get_json()
    assert body["written"] == ["gate_keyboard"]
    after = app_client.get("/api/global").get_json()
    assert after["gate_keyboard"] is False
