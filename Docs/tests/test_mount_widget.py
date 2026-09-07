
# D11b — mount widget in, stub widget out

import json
import os
import shutil
import subprocess

import pytest

from engine import settings as st

SUITE_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WIDGET_DIR = os.path.join(SUITE_ROOT, "static", "js", "widgets")
MOUNT_JS = os.path.join(WIDGET_DIR, "mount", "mount.js")
MATRIX_HTML = os.path.join(SUITE_ROOT, "static", "matrix.html")
REGISTRY_JSON = os.path.join(SUITE_ROOT, "library", "registry", "widgets.json")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def test_stub_folder_is_gone():
    assert not os.path.isdir(os.path.join(WIDGET_DIR, "stub"))


def test_mount_widget_file_exists():
    assert os.path.isfile(MOUNT_JS)


def test_registry_carries_mount_not_stub():
    rows = json.loads(_read(REGISTRY_JSON))
    types = [r["type"] for r in rows]
    assert "mount" in types
    assert "stub" not in types
    row = [r for r in rows if r["type"] == "mount"][0]
    assert row["path"] == "/static/js/widgets/mount/mount.js"


def test_widget_defaults_carries_mount_empty():
    assert st.GLOBAL_DEFAULTS["widget_defaults"]["mount"] == {}
    assert "stub" not in st.GLOBAL_DEFAULTS["widget_defaults"]


def test_matrix_html_loads_mount_not_stub():
    src = _read(MATRIX_HTML)
    assert "/static/js/widgets/mount/mount.js" in src
    assert "/static/js/widgets/stub/stub.js" not in src


def test_mount_widget_uses_the_shared_model_picker():
    src = _read(MOUNT_JS)
    assert "MX.mountModelPicker" in src


def test_mount_widget_sends_create_track_then_insert_region():
    src = _read(MOUNT_JS)
    assert '"create_track"' in src
    assert '"insert_region"' in src
    assert src.index('"create_track"') < src.index('"insert_region"')


def test_mount_widget_frames_carry_the_instance_id():
    src = _read(MOUNT_JS)
    assert "inst: frame.id" in src


def test_banned_words_are_absent():
    src = _read(MOUNT_JS).lower()
    assert "spine" not in src
    assert "world" not in src


def test_mount_widget_file_parses():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not on this machine")
    r = subprocess.run([node, "--check", MOUNT_JS], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
