
# Job 10 — instance targets, many live regions, server-side save,
# the pre-close hook, grid state, and the settings trickle

import json
import os
import shutil
import subprocess
import threading

import pytest

from ade import frames
from ade import tracks
from ade import web_io
from engine import settings as engine_settings
from engine import web_io as engine_web_io

SUITE_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WIDGET_DIR = os.path.join(SUITE_ROOT, "static", "js", "widgets")
MATRIX_JS = os.path.join(SUITE_ROOT, "static", "js", "matrix")
MATRIX_HTML = os.path.join(SUITE_ROOT, "static", "matrix.html")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


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

    def frames_of(self, kind):
        return [f for f in self.ws.sent if f.get("type") == kind]

    def out(self, text, dim=False):
        pass

    def resolve_gate(self, gid, text):
        return False

    def _send(self, frame):
        self.ws.send(json.dumps(frame))


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


def _region(environment, name="r"):
    track = tracks.create_track(name, model="", seat=None,
                                environment=environment)
    return tracks.regions_of(track.id)[0]


# ---- Part 2 — frames carry a target ----------------------------------------

def test_the_file_reply_echoes_the_instance_that_asked(sandbox, tmp_path):
    target = tmp_path / "note.txt"
    target.write_text("hello", encoding="utf-8")
    ctx = _ctx(_FakeWebIO(), _environment())

    frames.handle(ctx, {"type": "open", "path": str(target), "inst": "editor-7"})

    reply = ctx.webio.frames_of("file")[0]
    assert reply["inst"] == "editor-7"
    assert reply["content"] == "hello"


def test_the_saved_reply_echoes_the_instance_that_asked(sandbox, tmp_path):
    target = tmp_path / "out.txt"
    ctx = _ctx(_FakeWebIO(), _environment())

    frames.handle(ctx, {"type": "save", "path": str(target),
                        "content": "x", "inst": "editor-9"})

    reply = ctx.webio.frames_of("saved")[0]
    assert reply["inst"] == "editor-9"


def test_the_tree_reply_echoes_the_instance_that_asked(sandbox, tmp_path):
    ctx = _ctx(_FakeWebIO(), _environment())

    frames.handle(ctx, {"type": "tree", "path": str(tmp_path),
                        "inst": "browser-2"})

    assert ctx.webio.frames_of("tree")[0]["inst"] == "browser-2"


def test_the_transcript_reply_echoes_the_instance_and_the_region(sandbox):
    environment = _environment()
    region = _region(environment)
    ctx = _ctx(_FakeWebIO(), environment)

    frames.handle(ctx, {"type": "transcript", "track": region.id, "inst": "chat-4"})

    reply = ctx.webio.frames_of("transcript")[0]
    assert reply["inst"] == "chat-4"
    assert reply["region"] == region.id


def test_a_gate_row_never_shows_a_blank_region():
    ws = _FakeWS()
    io = engine_web_io.WebIO(ws)

    io.post_gate("g-1", "may i", "region-abc")

    sent = ws.sent
    ask = [f for f in sent if f.get("type") == "ask"][0]
    assert ask["region"] == "region-abc"
    pending = [f for f in sent if f.get("type") == "gate_pending"][-1]
    rows = list(pending["pending"]) + ([pending["active"]] if pending["active"] else [])
    assert rows and all(r["region"] == "region-abc" for r in rows)


# ---- Part 3 — one socket, many live regions --------------------------------

def test_one_socket_follows_two_regions_at_once(sandbox):
    environment = _environment()
    a = _region(environment, "a")
    b = _region(environment, "b")
    ctx = _ctx(_FakeWebIO(), environment)

    frames.handle(ctx, {"type": "follow", "track": a.id, "inst": "chat-1"})
    frames.handle(ctx, {"type": "follow", "track": b.id, "inst": "chat-2"})

    assert set(ctx.mirrors) == {a.id, b.id}


def test_a_followed_region_streams_tagged_with_its_own_id(sandbox):
    environment = _environment()
    a = _region(environment, "a")
    b = _region(environment, "b")
    io = _FakeWebIO()
    ctx = _ctx(io, environment)
    frames.handle(ctx, {"type": "follow", "track": a.id})
    frames.handle(ctx, {"type": "follow", "track": b.id})

    a.hub.out("from a")

    outs = [f for f in io.frames_of("mirror") if f.get("kind") == "out"]
    assert [f["track"] for f in outs] == [a.id]


def test_unfollow_drops_only_that_region(sandbox):
    environment = _environment()
    a = _region(environment, "a")
    b = _region(environment, "b")
    ctx = _ctx(_FakeWebIO(), environment)
    frames.handle(ctx, {"type": "follow", "track": a.id})
    frames.handle(ctx, {"type": "follow", "track": b.id})

    frames.handle(ctx, {"type": "unfollow", "track": a.id})

    assert set(ctx.mirrors) == {b.id}


def test_every_terminal_tab_is_its_own_pty(sandbox):
    environment = _environment()
    region = _region(environment, "shells")
    try:
        one = region.shell_master("tab-1")
        two = region.shell_master("tab-2")
        assert one != two
        assert region.shell_master("tab-1") == one
        region.close_shell("tab-1")
        assert set(region._shells) == {"tab-2"}
    finally:
        region.close_shell()


# ---- Part 5 — save is server-side only -------------------------------------

def test_a_refused_save_answers_not_ok(sandbox, tmp_path):
    ctx = _ctx(_FakeWebIO(), _environment())

    frames.handle(ctx, {"type": "save", "path": str(tmp_path),
                        "content": "x", "inst": "editor-1"})

    reply = ctx.webio.frames_of("saved")[0]
    assert reply["ok"] is False
    assert "refused" in reply["result"]


def test_an_accepted_save_answers_ok_and_writes(sandbox, tmp_path, monkeypatch):
    monkeypatch.setattr(frames.dq, "notify", lambda reason: None)
    target = tmp_path / "written.txt"
    ctx = _ctx(_FakeWebIO(), _environment())

    frames.handle(ctx, {"type": "save", "path": str(target),
                        "content": "landed", "inst": "editor-1"})

    assert ctx.webio.frames_of("saved")[0]["ok"] is True
    assert target.read_text(encoding="utf-8") == "landed"


def test_the_editor_never_writes_the_file_itself():
    src = _read(os.path.join(WIDGET_DIR, "editor", "editor.js"))
    assert "showSaveFilePicker" not in src
    assert "createWritable" not in src


# ---- Part 6 — pre-close hook -----------------------------------------------

def test_the_frame_exposes_a_pre_close_hook():
    src = _read(os.path.join(MATRIX_JS, "widget-frame.js"))
    assert "WidgetFrame.prototype.canClose" in src


def test_the_grid_asks_before_it_removes():
    src = _read(os.path.join(MATRIX_JS, "grid.js"))
    assert "canClose()" in src
    assert "if (!ok) return false;" in src


@pytest.mark.parametrize("name", ["editor/editor.js", "terminal/terminal.js"])
def test_the_widgets_that_refuse_a_close_wire_the_hook(name):
    assert "canClose(frame)" in _read(os.path.join(WIDGET_DIR, name))


# ---- Part 8 — layout persists ----------------------------------------------

def test_a_window_with_no_stored_grid_starts_blank(tmp_path, monkeypatch):
    import server
    monkeypatch.setattr(server, "GRIDS_DIR", str(tmp_path))
    with server.app.test_client() as c:
        body = json.loads(c.get("/api/grid/sid-1/win-1").data)
    assert body["grid"] is None


def test_a_grid_round_trips_per_session_per_window(tmp_path, monkeypatch):
    import server
    monkeypatch.setattr(server, "GRIDS_DIR", str(tmp_path))
    grid = {"cols": 12, "rows": 12, "widgets": [
        {"id": "chat-1", "type": "chat", "slot": {"col": 1, "row": 1, "w": 4, "h": 4},
         "options": {"region": "r-1"}}]}
    with server.app.test_client() as c:
        assert c.put("/api/grid/sid-1/win-1", json=grid).status_code == 200
        one = json.loads(c.get("/api/grid/sid-1/win-1").data)["grid"]
        two = json.loads(c.get("/api/grid/sid-1/win-2").data)["grid"]
    assert one["widgets"][0]["options"] == {"region": "r-1"}
    assert two is None


def test_a_stored_grid_is_removable(tmp_path, monkeypatch):
    import server
    monkeypatch.setattr(server, "GRIDS_DIR", str(tmp_path))
    with server.app.test_client() as c:
        c.put("/api/grid/sid-2/win-1", json={"cols": 12, "rows": 12, "widgets": []})
        assert c.delete("/api/grid/sid-2/win-1").status_code == 200
        assert c.delete("/api/grid/sid-2/win-1").status_code == 404


def test_the_browser_tab_storage_key_is_gone():
    src = _read(os.path.join(MATRIX_JS, "grid.js"))
    assert "mx.grid." not in src
    assert "localStorage" not in src


# ---- Part 9 — settings trickle ---------------------------------------------

def test_a_new_session_inherits_from_global_not_from_another_session(sandbox):
    a = _environment()
    b = _environment()
    a.settings["skin"] = "not-og"

    assert b.settings["skin"] is None
    assert engine_settings.session_effective(b.settings)["skin"] == \
        engine_settings.global_value("skin")


def test_the_session_tier_serves_and_writes(sandbox):
    import server
    environment = _environment()
    sid = environment.sid()
    with server.app.test_client() as c:
        before = json.loads(c.get("/api/session-settings/%s" % sid).data)
        wrote = json.loads(c.post("/api/session-settings/%s" % sid,
                                  json={"skin": "mine"}).data)
        after = json.loads(c.get("/api/session-settings/%s" % sid).data)
    assert before["bag"]["skin"] is None
    assert wrote["written"] == ["skin"]
    assert after["bag"]["skin"] == "mine"
    assert after["effective"]["skin"] == "mine"


def test_an_unknown_session_has_no_settings_tier(sandbox):
    import server
    with server.app.test_client() as c:
        assert c.get("/api/session-settings/nosuchsession").status_code == 404


def test_widget_defaults_live_in_global_json():
    assert "widget_defaults" in engine_settings.GLOBAL_DEFAULTS
    block = engine_settings.GLOBAL_DEFAULTS["widget_defaults"]
    for wtype in engine_settings.widget_types():
        assert wtype in block


def test_widget_defaults_trickle_global_then_session():
    conf = {"widget_defaults": {"chat": {"tts_engine": "from-global"}}}
    bag = {"widget_defaults": {"chat": {"tts_engine": "from-session"}}}

    rows_only = engine_settings.widget_defaults("chat", None, {})
    with_global = engine_settings.widget_defaults("chat", None, conf)
    with_session = engine_settings.widget_defaults("chat", bag, conf)

    assert rows_only["tts_engine"] == "say"
    assert with_global["tts_engine"] == "from-global"
    assert with_session["tts_engine"] == "from-session"
    assert with_session["speech_enabled"] is False


def test_the_widget_registry_route_serves_a_sessions_defaults(sandbox):
    import server
    environment = _environment()
    environment.settings["widget_defaults"] = {"chat": {"tts_engine": "mine"}}
    with server.app.test_client() as c:
        plain = json.loads(c.get("/api/widget-registry").data)
        mine = json.loads(c.get("/api/widget-registry?sid=%s" % environment.sid()).data)
    assert plain["defaults"]["chat"]["tts_engine"] == "say"
    assert mine["defaults"]["chat"]["tts_engine"] == "mine"


def test_the_registry_rows_name_each_widgets_file():
    rows = engine_settings.load_widget_registry()
    for row in rows:
        path = row.get("path") or ""
        assert path.startswith("/static/js/widgets/")
        assert os.path.isfile(os.path.join(SUITE_ROOT, path.lstrip("/")))


def test_set_to_default_lives_on_the_global_page_only():
    suite = _read(os.path.join(SUITE_ROOT, "static", "js", "suite", "suite.js"))
    assert "update-default-btn" in suite
    for name in ("chat/chat.js", "queue/queue.js", "editor/editor.js",
                 "terminal/terminal.js", "viewer/viewer.js", "browser/browser.js"):
        assert "update-default" not in _read(os.path.join(WIDGET_DIR, name))


# ---- Part 11 — model picker ------------------------------------------------

def test_the_model_picker_is_nested_not_flat():
    src = _read(os.path.join(WIDGET_DIR, "shared", "model-picker.js"))
    for step in ("mx-mp-provider", "mx-mp-model", "mx-mp-version"):
        assert step in src
    assert "/static/js/widgets/shared/model-picker.js" in _read(MATRIX_HTML)


# ---- house rules -----------------------------------------------------------

WIDGET_FILES = [
    "chat/chat.js", "mini-queue/mini-queue.js", "queue/queue.js",
    "editor/editor.js", "terminal/terminal.js", "browser/browser.js",
    "viewer/viewer.js", "mount/mount.js", "shared/gate-common.js",
    "shared/monaco-readonly.js", "shared/model-picker.js",
]


@pytest.mark.parametrize("name", WIDGET_FILES)
def test_every_widget_lives_in_its_own_folder(name):
    assert os.path.isfile(os.path.join(WIDGET_DIR, name))


def test_the_old_widget_folder_is_gone():
    assert not os.path.isdir(os.path.join(MATRIX_JS, "widgets"))


@pytest.mark.parametrize("name", WIDGET_FILES)
def test_the_banned_words_are_absent(name):
    src = _read(os.path.join(WIDGET_DIR, name)).lower()
    assert "spine" not in src
    assert "world" not in src


@pytest.mark.parametrize("name", WIDGET_FILES)
def test_every_widget_file_parses(name):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not on this machine")
    path = os.path.join(WIDGET_DIR, name)
    r = subprocess.run([node, "--check", path], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_only_one_monaco_loader_remains():
    editor = _read(os.path.join(WIDGET_DIR, "editor", "editor.js"))
    shared = _read(os.path.join(WIDGET_DIR, "shared", "monaco-readonly.js"))
    assert "MX.monacoReady" in shared
    assert "MX.monacoReady()" in editor
    assert "loader.js" not in editor
