
# Tool table shape, text detection, gate edges, and the dispatch refusals.

from engine import agent_loop as al
from engine import policy
from engine import tools


SAMPLES = {
    "write_file": ("WRITE: notes/a.md\n---BEGIN---\nhello\n---END---",
                   {"path": "notes/a.md", "content": "hello\n"}),
    "send_message": ("SEND: r-1, r-2\n---BEGIN---\nping\n---END---",
                     {"receivers": ["r-1", "r-2"], "body": "ping\n"}),
    "remember": ("REMEMBER: a title\nCARRY: the essence\nPIN: agent\nBODY: the body",
                 {"title": "a title", "carry": "the essence",
                  "pin": "agent", "body": "the body"}),
    "run_command": ("RUN: ls -la", {"command": "ls -la"}),
    "view_image": ("VIEW_IMAGE: pics/a.png", {"path": "pics/a.png"}),
    "screen_capture": ("SCREEN_CAPTURE: 2", {"display": "2"}),
    "fetch_url": ("FETCH: https://example.com", {"url": "https://example.com"}),
    "recall": ("RECALL: the harbor", {"query": "the harbor"}),
    "web_open": ("WEB_OPEN: https://example.com", {"url": "https://example.com"}),
    "web_read": ("WEB_READ", {}),
    "web_screenshot": ("WEB_SCREENSHOT", {}),
    "web_act": ("WEB_ACT: #go | click |",
                {"selector": "#go", "action": "click", "text": ""}),
    "web_eval": ("WEB_EVAL: document.title", {"js": "document.title"}),
    "initiate": ("INITIATE", {}),
    "reset_region": ("RESET_REGION: r-9", {"region": "r-9"}),
    "reset_self": ("RESET_SELF", {}),
    "request_messages": ("REQUEST: 12", {"since_id": 12}),
    "read_file": ("READ: notes/a.md", {"path": "notes/a.md"}),
    "list_files": ("LIST: notes", {"path": "notes"}),
}


class StubIO:
    def out(self, *a, **k): pass
    def term(self, *a, **k): pass
    def status(self, *a, **k): pass
    def event(self, *a, **k): pass
    def ask(self, prompt): return "n"


class StubSession:
    def __init__(self, region=None):
        self.io = StubIO()
        self.region = region
        self.region_name = None
        self.nick = None
        self.root = None
        self.settings = {"model": "", "allow_agent_reset": True}
        self.activity = []
        self.shell = None


def test_every_row_is_complete():
    for t in tools.TOOLS:
        assert t.name and isinstance(t.name, str)
        assert t.edge and isinstance(t.edge, str)
        assert isinstance(t.schema, dict) and t.schema["function"]["name"] == t.name
        assert t.hint and isinstance(t.hint, str)
        for field in ("scope", "prompt", "run", "summary", "parse", "denied"):
            assert callable(getattr(t, field)), f"{t.name}.{field}"


def test_table_order_and_index():
    assert [t.name for t in tools.TOOLS] == [
        "write_file", "send_message", "remember", "run_command", "view_image",
        "screen_capture", "fetch_url", "recall", "web_open", "web_read",
        "web_screenshot", "web_act", "web_eval", "initiate", "reset_region",
        "reset_self", "request_messages", "read_file", "list_files"]
    assert set(tools.TOOL_INDEX) == set(SAMPLES)
    assert len(tools.tool_schema()) == len(tools.TOOLS)


def test_detect_text_round_trips_every_marker():
    for t in tools.TOOLS:
        if t.marker is None:
            continue
        reply, expected = SAMPLES[t.name]
        assert tools.detect_text(reply) == (t.name, expected), t.name


def test_detect_text_returns_none_without_a_marker():
    assert tools.detect_text("just a plain answer, no tool blocks here") is None


def test_detect_native_reads_the_first_call():
    calls = [{"function": {"name": "read_file", "arguments": '{"path": "a.md"}'}}]
    assert tools.detect_native(calls) == ("read_file", {"path": "a.md"})
    assert tools.detect_native([]) is None


def test_gate_edges():
    edges = tools.gate_edges()
    assert ("check_read", "inside") in edges
    assert ("check_read", "outside") in edges
    assert ("write_file", "any") in edges
    assert ("reset_self", "any") in edges
    assert not [e for e, _ in edges if e.startswith("logic_")]
    assert len(edges) == len(set(edges))


def test_policy_defaults_match_gate_edges():
    rows = policy._default_rows()
    assert {r["edge"] for r in rows} == {e for e, _ in tools.gate_edges()} | {"default"}


def test_text_hint_names_every_keyword_once():
    hint = tools.text_hint()
    for t in tools.TOOLS:
        if t.marker is None:
            continue
        assert len(t.marker.findall(hint)) == 1, t.keyword
    assert "LOGIC_" not in hint


def test_no_logic_trace_in_the_table():
    blob = tools.text_hint() + repr(tools.tool_schema())
    for name in ("logic_status", "logic_open", "logic_transport", "logic_command"):
        assert name not in blob


def test_list_files_carries_its_own_defaults():
    props = tools.TOOL_INDEX["list_files"].schema["function"]["parameters"]["properties"]
    assert set(props) == {"path", "recursive", "show_size", "show_hidden"}


def test_execute_tool_refuses_an_unknown_name(monkeypatch):
    monkeypatch.setattr(al, "_resolve_gate", _no_gate)
    assert al.execute_tool(StubSession(), "logic_status", {}) == "[unknown tool: logic_status]"


def test_execute_tool_refuses_a_region_tool_without_a_region(monkeypatch):
    monkeypatch.setattr(al, "_resolve_gate", _no_gate)
    sess = StubSession(region=None)
    for name in [t.name for t in tools.TOOLS if t.needs_region]:
        out = al.execute_tool(sess, name, {})
        assert out == f"[{name} refused: this session has no track identity]"


def _no_gate(*a, **k):
    raise AssertionError("the gate was touched")
