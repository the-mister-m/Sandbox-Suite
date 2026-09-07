
# editor and terminal widgets — registry, banned words, wire vocabulary

import json
import os
import shutil
import subprocess

import pytest

from engine import settings as engine_settings

SUITE_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WIDGET_DIR = os.path.join(SUITE_ROOT, "static", "js", "widgets")
MATRIX_HTML = os.path.join(SUITE_ROOT, "static", "matrix.html")

# one folder per widget: static/js/widgets/<name>/<name>.js
MINE = {
    "editor": "editor/editor.js",
    "terminal": "terminal/terminal.js",
}


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def test_the_registry_seeds_editor_and_terminal():
    rows = engine_settings.load_widget_registry()
    types = [r.get("type") for r in rows]
    for wanted in MINE:
        assert wanted in types


@pytest.mark.parametrize("wtype,filename", sorted(MINE.items()))
def test_each_widget_file_registers_its_type(wtype, filename):
    src = _read(os.path.join(WIDGET_DIR, filename))
    assert 'MX.registerWidget("%s"' % wtype in src


@pytest.mark.parametrize("filename", sorted(MINE.values()))
def test_no_widget_of_mine_sends_the_answer_form(filename):
    src = _read(os.path.join(WIDGET_DIR, filename))
    assert '"answer"' not in src
    assert 'type: "answer"' not in src


@pytest.mark.parametrize("filename", sorted(MINE.values()))
def test_the_banned_words_are_absent(filename):
    src = _read(os.path.join(WIDGET_DIR, filename)).lower()
    assert "spine" not in src
    assert "world" not in src


def test_matrix_html_loads_editor_and_terminal():
    html = _read(MATRIX_HTML)
    for filename in MINE.values():
        assert "/static/js/widgets/%s" % filename in html


@pytest.mark.parametrize("filename", sorted(MINE.values()))
def test_each_widget_file_parses(filename):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not on this machine")
    path = os.path.join(WIDGET_DIR, filename)
    r = subprocess.run([node, "--check", path], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_terminal_uses_the_shell_frames_only():
    src = _read(os.path.join(WIDGET_DIR, MINE["terminal"]))
    for frame_type in ("follow", "unfollow", "input", "term", "close_shell"):
        assert '"%s"' % frame_type in src


def test_editor_uses_the_existing_file_and_save_frames():
    src = _read(os.path.join(WIDGET_DIR, MINE["editor"]))
    assert '"file"' in src
    assert '"save"' in src
    assert '"saved"' in src


def test_the_widget_registry_route_carries_editor_and_terminal():
    import server
    with server.app.test_client() as c:
        body = json.loads(c.get("/api/widget-registry").data)
    types = [r.get("type") for r in body.get("list", [])]
    for wanted in MINE:
        assert wanted in types
