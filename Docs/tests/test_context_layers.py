
# track and region context layers

import os

import pytest

from engine import compiler


class StubSession:
    def __init__(self, track=None):
        self.nick = None
        self.settings = {"model": "gemma4:12b-mxfp8"}
        self.track = track


ROOT = "/tmp/a-workspace"


@pytest.fixture
def layers(tmp_path, monkeypatch):
    monkeypatch.setattr(compiler, "INJECTIONS", str(tmp_path))
    os.makedirs(os.path.join(str(tmp_path), "track"))
    os.makedirs(os.path.join(str(tmp_path), "region"))
    os.makedirs(os.path.join(str(tmp_path), "session"))
    os.makedirs(os.path.join(str(tmp_path), "global"))
    os.makedirs(os.path.join(str(tmp_path), "skills"))
    return str(tmp_path)


def _write(root, folder, ident, text):
    with open(os.path.join(root, folder, ident + ".md"), "w") as fh:
        fh.write(text)


def test_track_layer_lands_in_context(layers):
    _write(layers, "track", "t-1", "the track note")
    _, context = compiler.build_context(
        StubSession(track="t-1"), root=ROOT,
        region_id="r-1", region_name="Deckhand")
    assert "the track note" in context


def test_region_layer_lands_in_context(layers):
    _write(layers, "region", "r-1", "the region note")
    _, context = compiler.build_context(
        StubSession(), root=ROOT,
        region_id="r-1", region_name="Deckhand")
    assert "the region note" in context


def test_a_missing_file_means_no_layer(layers):
    _, context = compiler.build_context(
        StubSession(track="t-9"), root=ROOT,
        region_id="r-9", region_name="Deckhand")
    assert context.strip() == ""


def test_both_layers_land_in_order(layers):
    _write(layers, "track", "t-2", "the track note")
    _write(layers, "region", "r-2", "the region note")
    _, context = compiler.build_context(
        StubSession(track="t-2"), root=ROOT,
        region_id="r-2", region_name="Deckhand")
    assert context.index("the track note") < context.index("the region note")
