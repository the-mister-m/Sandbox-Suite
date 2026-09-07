# matrix templates through the routes — write, list, read, delete

import json

import pytest

import server


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "MATRIX_TEMPLATES_DIR", str(tmp_path))
    server.app.config["TESTING"] = True
    with server.app.test_client() as c:
        yield c


def _body():
    return {
        "grid": {"cols": 12, "rows": 12},
        "widgets": [
            {"type": "mount", "slot": {"col": 1, "row": 1, "w": 4, "h": 4},
             "options": {"note": "left", "echo": False}},
            {"type": "mount", "slot": {"col": 5, "row": 1, "w": 8, "h": 6},
             "options": {"note": "right", "echo": True}},
        ],
    }


def test_list_is_empty_before_any_write(client):
    assert client.get("/api/matrix-templates").get_json() == {"list": []}


def test_write_then_list_then_read(client, tmp_path):
    r = client.post("/api/matrix-templates/two-up", json=_body())
    assert r.status_code == 200
    assert r.get_json() == {"ok": True, "name": "two-up"}

    assert client.get("/api/matrix-templates").get_json() == {"list": ["two-up"]}

    tpl = client.get("/api/matrix-templates/two-up").get_json()["template"]
    assert tpl["name"] == "two-up"
    assert tpl["grid"] == {"cols": 12, "rows": 12}
    assert [w["type"] for w in tpl["widgets"]] == ["mount", "mount"]
    assert tpl["widgets"][1]["slot"] == {"col": 5, "row": 1, "w": 8, "h": 6}
    assert tpl["widgets"][1]["options"] == {"note": "right", "echo": True}

    on_disk = json.loads((tmp_path / "two-up.json").read_text())
    assert on_disk == tpl


def test_write_replaces_the_file(client):
    client.post("/api/matrix-templates/one", json=_body())
    smaller = {"grid": {"cols": 6, "rows": 6}, "widgets": []}
    client.post("/api/matrix-templates/one", json=smaller)
    tpl = client.get("/api/matrix-templates/one").get_json()["template"]
    assert tpl["grid"] == {"cols": 6, "rows": 6}
    assert tpl["widgets"] == []


def test_delete_removes_it_from_the_list(client):
    client.post("/api/matrix-templates/gone", json=_body())
    assert client.delete("/api/matrix-templates/gone").get_json()["ok"] is True
    assert client.get("/api/matrix-templates").get_json() == {"list": []}
    assert client.get("/api/matrix-templates/gone").status_code == 404
    assert client.delete("/api/matrix-templates/gone").status_code == 404


def test_a_name_with_a_separator_is_refused(client):
    assert client.post("/api/matrix-templates/..", json=_body()).status_code == 400
    assert client.get("/api/matrix-templates/..").status_code == 400
    assert client.delete("/api/matrix-templates/..").status_code == 400


def test_a_body_that_is_not_an_object_is_refused(client):
    assert client.post("/api/matrix-templates/bad", json=[1, 2]).status_code == 400
    assert client.get("/api/matrix-templates").get_json() == {"list": []}


def test_junk_fields_are_dropped_on_write(client):
    client.post("/api/matrix-templates/clean", json={
        "grid": {"cols": 12, "rows": 12},
        "widgets": [{"type": "mount", "slot": {"col": 1}, "options": {},
                     "transcript": ["not template data"]},
                    "not a widget row"],
        "session": "not template data",
    })
    tpl = client.get("/api/matrix-templates/clean").get_json()["template"]
    assert "session" not in tpl
    assert len(tpl["widgets"]) == 1
    assert set(tpl["widgets"][0]) == {"type", "slot", "options"}


def test_widget_registry_route_carries_types_and_defaults(client):
    d = client.get("/api/widget-registry").get_json()
    types = [row["type"] for row in d["list"]]
    assert "chat" in types and "mount" in types
    assert d["defaults"]["chat"]["speech_enabled"] is False
    assert d["defaults"]["mount"] == {}
