
# Context builder: tiers, seat handling, and the capabilities paragraph.

from engine import compiler
from engine import tools


class StubSession:
    def __init__(self, nick=None, model=""):
        self.nick = nick
        self.settings = {"model": model}


ROOT = "/tmp/a-workspace"
LOCAL_MODEL = "gemma4:12b-mxfp8"
CLOUD_MODEL = "sonnet"


def _build(sess, **kw):
    kw.setdefault("region_id", "r-1")
    kw.setdefault("region_name", "Deckhand")
    return compiler.build_context(sess, root=ROOT, **kw)


def test_no_seat_still_builds():
    system, _ = _build(StubSession(model=LOCAL_MODEL))
    assert compiler.root_note(ROOT) in system
    assert "## Who you are here" in system
    assert "r-1" in system
    assert "## Your persona" not in system
    assert "## Who you are\n" not in system
    assert "Who is speaking" not in system


def test_seat_in_the_roster_brings_its_persona():
    system, _ = _build(StubSession(nick="Scotty", model=LOCAL_MODEL))
    assert "## Your persona" in system
    assert "Who is speaking" in system
    assert "## Your own memories" in system


def test_native_provider_gets_the_tool_list_not_the_marker_hint():
    system, _ = _build(StubSession(model=LOCAL_MODEL))
    assert "You have these tools:" in system
    for name in tools.tool_names():
        assert name in system
    assert "---BEGIN---" not in system


def test_text_provider_gets_the_marker_hint():
    system, _ = _build(StubSession(model=CLOUD_MODEL))
    assert "---BEGIN---" in system
    assert "You have these tools:" not in system


def test_context_carries_the_session_file_and_the_matching_skills():
    _, context = _build(StubSession(nick="Scotty", model=LOCAL_MODEL))
    assert "You are seated in the ADE" in context
    assert "how memories are kept with the remember tool" in context
    assert "how you use `screen_capture`" in context


def test_a_folderless_seat_drops_the_folder_only_skills():
    _, context = _build(StubSession(nick="Nobody", model=LOCAL_MODEL))
    assert "You are seated in the ADE" in context
    assert "how memories are kept with the remember tool" not in context
    assert "how you use `screen_capture`" in context


def test_task_lands_at_the_end_of_context():
    _, context = _build(StubSession(model=LOCAL_MODEL), task="do the thing")
    assert context.endswith("do the thing")


def test_roster_folders_resolve():
    assert compiler.resolve_agent("Scotty")
    assert compiler.resolve_agent("Ford")
