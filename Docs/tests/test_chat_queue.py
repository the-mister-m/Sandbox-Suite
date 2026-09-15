
# chat, mini queue and queue widgets — registry, options, one gate vocabulary

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
    "chat": "chat/chat.js",
    "mini_queue": "mini-queue/mini-queue.js",
    "queue": "queue/queue.js",
}

SHARED = "shared/gate-common.js"


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def test_the_registry_seeds_the_three_types():
    rows = engine_settings.load_widget_registry()
    types = [r.get("type") for r in rows]
    for wanted in MINE:
        assert wanted in types


def test_the_chat_widget_rows_are_the_speech_options():
    d = engine_settings.widget_defaults("chat")
    assert set(d) == {"speech_enabled", "tts_engine", "listen_mode"}


def test_the_queue_widget_rows_are_the_two_old_edit_track_fields():
    d = engine_settings.widget_defaults("queue")
    assert set(d) == {"claude_cache_ttl", "claude_exclude_dynamic", "merge_gates"}


@pytest.mark.parametrize("wtype,filename", sorted(MINE.items()))
def test_each_widget_file_registers_its_type(wtype, filename):
    src = _read(os.path.join(WIDGET_DIR, filename))
    assert 'MX.registerWidget("%s"' % wtype in src


@pytest.mark.parametrize("filename", sorted(MINE.values()) + [SHARED])
def test_no_widget_of_mine_sends_the_answer_form(filename):
    src = _read(os.path.join(WIDGET_DIR, filename))
    assert '"answer"' not in src
    assert "type: \"answer\"" not in src


@pytest.mark.parametrize("filename", sorted(MINE.values()))
def test_every_settle_word_rides_gate_action(filename):
    src = _read(os.path.join(WIDGET_DIR, filename))
    if "approve" in src or "deny" in src:
        assert "gate_action" in src


@pytest.mark.parametrize("filename", sorted(MINE.values()) + [SHARED])
def test_the_banned_words_are_absent(filename):
    src = _read(os.path.join(WIDGET_DIR, filename)).lower()
    assert "spine" not in src
    assert "world" not in src


def test_matrix_html_loads_every_widget_of_mine():
    html = _read(MATRIX_HTML)
    for filename in list(MINE.values()) + [SHARED]:
        assert "/static/js/widgets/%s" % filename in html
    assert "/static/css/matrix-chat-queue.css" in html


def test_the_markdown_libraries_are_vendored():
    html = _read(MATRIX_HTML)
    assert "/static/vendor/marked/marked.min.js" in html
    assert "/static/vendor/dompurify/purify.min.js" in html
    assert "cdnjs.cloudflare.com" not in html


@pytest.mark.parametrize("filename", sorted(MINE.values()) + [SHARED])
def test_each_widget_file_parses(filename):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not on this machine")
    path = os.path.join(WIDGET_DIR, filename)
    r = subprocess.run([node, "--check", path], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_the_widget_registry_route_carries_the_three_types():
    import server
    with server.app.test_client() as c:
        body = json.loads(c.get("/api/widget-registry").data)
    types = [r.get("type") for r in body.get("list", [])]
    for wanted in MINE:
        assert wanted in types
    assert set(body["defaults"]["chat"]) == {"speech_enabled", "tts_engine", "listen_mode"}
