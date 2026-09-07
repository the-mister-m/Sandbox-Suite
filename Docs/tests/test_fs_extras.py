
# browser/viewer routes: stat, raw, duplicate, reveal

import subprocess

import pytest


@pytest.fixture
def app_client():
    import server
    return server.app.test_client()


def test_fs_stat_reports_file_size(app_client, tmp_path):
    f = tmp_path / "note.txt"
    f.write_text("hello")
    resp = app_client.get(f"/api/fs/stat?path={f}")
    body = resp.get_json()
    assert body["size"] == 5
    assert body["isDir"] is False


def test_fs_stat_directory_has_no_size(app_client, tmp_path):
    resp = app_client.get(f"/api/fs/stat?path={tmp_path}")
    body = resp.get_json()
    assert body["isDir"] is True
    assert body["size"] is None


def test_fs_stat_missing_path_is_404(app_client, tmp_path):
    resp = app_client.get(f"/api/fs/stat?path={tmp_path / 'nope.txt'}")
    assert resp.status_code == 404


def test_fs_raw_serves_bytes_with_guessed_mime(app_client, tmp_path):
    f = tmp_path / "pic.png"
    f.write_bytes(b"\x89PNG\r\n\x1a\n")
    resp = app_client.get(f"/api/fs/raw?path={f}")
    assert resp.status_code == 200
    assert resp.mimetype == "image/png"
    assert resp.data == b"\x89PNG\r\n\x1a\n"


def test_fs_raw_missing_is_404(app_client, tmp_path):
    resp = app_client.get(f"/api/fs/raw?path={tmp_path / 'nope.png'}")
    assert resp.status_code == 404


def test_fs_duplicate_creates_a_copy(app_client, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("content")
    resp = app_client.post("/api/fs/duplicate", json={"path": str(f)})
    body = resp.get_json()
    assert body["ok"] is True
    assert body["name"] == "doc copy.txt"
    assert (tmp_path / "doc copy.txt").read_text() == "content"


def test_fs_duplicate_increments_when_the_copy_exists(app_client, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("content")
    (tmp_path / "doc copy.txt").write_text("already here")
    resp = app_client.post("/api/fs/duplicate", json={"path": str(f)})
    body = resp.get_json()
    assert body["name"] == "doc copy 2.txt"


def test_fs_duplicate_missing_path_is_404(app_client, tmp_path):
    resp = app_client.post("/api/fs/duplicate", json={"path": str(tmp_path / "nope.txt")})
    assert resp.status_code == 404


def test_fs_reveal_runs_open_dash_r(app_client, tmp_path, monkeypatch):
    f = tmp_path / "doc.txt"
    f.write_text("content")
    calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda args: calls.append(args))
    resp = app_client.post("/api/fs/reveal", json={"path": str(f)})
    assert resp.get_json()["ok"] is True
    assert calls == [["open", "-R", str(f)]]


def test_fs_reveal_missing_is_404(app_client, tmp_path):
    resp = app_client.post("/api/fs/reveal", json={"path": str(tmp_path / "nope.txt")})
    assert resp.status_code == 404
