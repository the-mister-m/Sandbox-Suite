"""Headed Playwright walk for Phase 3F — file mode, tabs, targets, layers.

Spec: Docs/Specs/Code Canvas port/Phase3F File Mode/SPEC-phase3F-H-opus-headed.md
Walk: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md section 6, ten lines.
Shape follows Docs/tests/phase3_headed.py — same launch, console capture,
record/shot pair per line, teardown of every surface the run creates.

Fixtures, both in Docs/scratchpad, plain HTML, every element in the source:
    phase3F-fixture.html   — tab one
    phase3F-fixture-2.html — tab two, run 4 (was the nirvana copy)

Both fixtures' text is read before the run and written back at teardown.

Usage:
    python3 Docs/tests/phase3F_headed.py --session <sid> \
        --out Docs/Reports/phase3F-headed/

Exit code 0 once the page loads; the receipt is the record.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(ROOT, "Docs", "scratchpad")
FIXTURE = os.path.join(SCRATCH, "phase3F-fixture.html")
FIXTURE2 = os.path.join(SCRATCH, "phase3F-fixture-2.html")

# both tabs are plain fixtures
TAB1 = FIXTURE
TAB2 = FIXTURE2

RESULTS = []
CONSOLE = []
PAGEERRORS = []


def record(num, name, passed, shot, note=""):
    RESULTS.append({"n": num, "name": name, "pass": bool(passed),
                    "shot": os.path.basename(shot or ""), "note": note})
    print(f"[{num}] {'PASS' if passed else 'FAIL'} — {name}" + (f"\n      {note}" if note else ""))


def note_response(tag, resp):
    if resp.status >= 400:
        CONSOLE.append(f"[{tag}:http:{resp.status}] {resp.url}")


def wire(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"[{tag}:console:{m.type}] {m.text}"))
    page.on("response", lambda r: note_response(tag, r))
    page.on("pageerror", lambda e: (PAGEERRORS.append(f"[{tag}:pageerror] {e}"),
                                    CONSOLE.append(f"[{tag}:pageerror] {e}")))


def shot(page, out, name):
    path = os.path.join(out, f"{name}.png")
    try:
        page.screenshot(path=path)
    except Exception as exc:
        CONSOLE.append(f"[harness] screenshot {name} failed: {exc}")
    return path


def wait_ok(page, expr, arg=None, timeout=30000, label=""):
    try:
        page.wait_for_function(expr, arg=arg, timeout=timeout)
        return True
    except Exception as exc:
        CONSOLE.append(f"[harness] wait {label} timed out: {str(exc)[:120]}")
        return False


def post(path, body=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as fh:
        return json.loads(fh.read().decode())


# ---- page-side snippets --------------------------------------------------

# mount with no mode: the canvas must open on its own default
MOUNT = r"""
(args) => {
  const inst = MX.grid.addWidget(args.type);
  if (args.target !== undefined) MX.grid.frames[inst.id].setOption("target", args.target);
  return inst.id;
}
"""

RESIZE = r"""
(args) => {
  const g = MX.grid;
  const inst = g.instances.filter((i) => i.id === args.id)[0];
  inst.slot = {col: args.col, row: args.row, w: args.w, h: args.h};
  g._place(g.frames[args.id].el, inst.slot);
  g.save();
  window.dispatchEvent(new Event("resize"));
  return inst.slot;
}
"""

CANVAS_MOUNTED = r"""
(id) => {
  const f = MX.grid.frames[id];
  return !!(f && f._canvasState && f._canvasState.core);
}
"""

FILE_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return false;
  const cv = f._canvasState;
  return cv.docMode === "file" && !!cv.idoc && !!cv.idoc.body && !!cv.source;
}
"""

TOOLS_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  return !!(f && f._toolsState && f._toolsState.core && f._toolsState.tools);
}
"""

CV = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return null;
  const cv = f._canvasState;
  const tabs = cv.targetsEl
    ? Array.prototype.map.call(cv.targetsEl.querySelectorAll(".mxcv-tab"),
        (t) => ({name: t.textContent, path: t.title, on: t.classList.contains("mxcv-on")}))
    : [];
  return {
    mode: cv.mode, docMode: cv.docMode, path: cv.path,
    targets: cv.targets.slice(), selection: cv.selection.slice(),
    dirty: !!cv.dirty, status: cv.statusEl ? cv.statusEl.textContent : "",
    tabs: tabs, tabsHidden: cv.targetsEl ? !!cv.targetsEl.hidden : null,
    cached: Object.keys(cv.tabs),
    sourceLen: (cv.source || "").length,
    bodyKids: cv.idoc && cv.idoc.body ? cv.idoc.body.children.length : -1,
    text: cv.idoc && cv.idoc.body
      ? cv.idoc.body.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : "",
    canUndo: cv.history ? cv.history.canUndo() : null,
    canRedo: cv.history ? cv.history.canRedo() : null,
    optTarget: f.options.target || "",
    optTargets: (f.options.targets || []).slice(),
    optMode: f.options.mode
  };
}
"""

# picker stub: the suite picker is native on this machine (global.json
# "picker": "native"), a macOS dialog no browser driver can reach. The stub
# commits the path the walk wants and leaves the widget's own onAdd path,
# option writes and re-render untouched.
STUB_PICKER = r"""
(path) => {
  window.__pickCalls = [];
  MX.openRootBrowser = (start, commit, opts) => {
    window.__pickCalls.push({start: start, opts: opts});
    commit(path);
    return Promise.resolve();
  };
  return true;
}
"""

CLICK_ADD = r"""
(id) => {
  const btn = MX.grid.frames[id].el.querySelector(".mxtg-add");
  if (!btn) return false;
  btn.click();
  return true;
}
"""

TG_ROWS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  const empty = el.querySelector(".mxtg-empty");
  return {
    empty: empty ? empty.textContent : null,
    rows: Array.prototype.map.call(el.querySelectorAll(".mxtg-row"), (r) => ({
      name: r.querySelector(".mxtg-name").textContent,
      path: r.title, on: r.classList.contains("mxtg-on")
    })),
    picks: window.__pickCalls || []
  };
}
"""

TG_ROW_CLICK = r"""
(args) => {
  const rows = MX.grid.frames[args.id].el.querySelectorAll(".mxtg-row");
  for (const r of rows) if (r.title === args.path) { r.click(); return true; }
  return false;
}
"""

CV_TAB_CLICK = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const tabs = cv.targetsEl.querySelectorAll(".mxcv-tab");
  for (const t of tabs) if (t.title === args.path) { t.click(); return true; }
  return false;
}
"""

TL_TAB_CLICK = r"""
(args) => {
  const tabs = MX.grid.frames[args.id].el.querySelectorAll(".mxtl-tab");
  for (const t of tabs) if (t.textContent === args.name) { t.click(); return true; }
  return false;
}
"""

TL_TABS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  return Array.prototype.map.call(el.querySelectorAll(".mxtl-tab"), (t) => ({
    name: t.textContent, hidden: !!t.hidden,
    on: t.classList.contains("mxtl-on")
  }));
}
"""

TL_INSPECTOR = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  const body = el.querySelector(".mxtl-body");
  const fields = {};
  for (const l of body.querySelectorAll(".cc-panel-label")) {
    const k = l.querySelector("span");
    const i = l.querySelector("textarea") || l.querySelector("input") || l.querySelector("select");
    if (k && i) fields[k.textContent] = i.value;
  }
  const ids = Array.prototype.map.call(body.querySelectorAll(".cc-panel-row-id"),
    (e) => e.textContent);
  const titles = Array.prototype.map.call(body.querySelectorAll(".cc-panel-tool-title"),
    (e) => e.textContent);
  return {section: MX.grid.frames[id]._toolsState.section, ids: ids,
          titles: titles, fieldKeys: Object.keys(fields),
          text: fields["Text"] === undefined ? null : fields["Text"],
          empty: body.querySelector(".cc-panel-empty")
            ? body.querySelector(".cc-panel-empty").textContent : null,
          bodyText: body.textContent.slice(0, 200)};
}
"""

TL_LAYER_ROWS = r"""
(id) => {
  const body = MX.grid.frames[id].el.querySelector(".mxtl-body");
  return Array.prototype.map.call(body.querySelectorAll(".cc-panel-row"), (r) => {
    const parts = Array.prototype.map.call(
      r.querySelectorAll(".cc-panel-row-content"), (e) => e.textContent);
    return {
      id: r.dataset.id || "",
      name: r.querySelector(".cc-panel-row-name")
        ? r.querySelector(".cc-panel-row-name").textContent : "",
      parts: parts,
      indent: parseInt(r.style.paddingLeft || "0", 10),
      active: r.classList.contains("cc-panel-row-active")
    };
  });
}
"""

TL_TYPE_TEXT = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  const labels = Array.prototype.slice.call(body.querySelectorAll(".cc-panel-label"));
  const hit = labels.filter((l) => l.querySelector("span").textContent === "Text")[0];
  if (!hit) return false;
  const input = hit.querySelector("textarea") || hit.querySelector("input");
  if (!input) return false;
  input.value = args.value;
  input.dispatchEvent(new Event("input", {bubbles: true}));
  return true;
}
"""

# two adjacent element siblings whose own box hit-tests to themselves, so a
# click selects the element and not a descendant
PICK_SIBLINGS = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  if (!cv.idoc || !cv.idoc.body) return null;
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  const probe = (el, r) => {
    const xs = [0.08, 0.5, 0.92], ys = [0.08, 0.5, 0.92];
    for (const fy of ys) for (const fx of xs) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 1 || y < 1 || x > vw - 1 || y > vh - 1) continue;
      if (doc.elementFromPoint(x, y) === el) return {x: x, y: y};
    }
    return null;
  };
  const fits = (r) => r.width > 14 && r.height > 14 && r.top >= 0 && r.left >= 0
    && r.bottom <= vh && r.right <= vw;
  // stamped = both carry data-od-id; like = same tag and same first class
  const alike = (a, b) => a.tagName === b.tagName
    && (a.classList[0] || "") === (b.classList[0] || "");
  const scan = (stampedOnly, likeOnly) => {
    for (const el of doc.body.querySelectorAll("*")) {
      if (el.matches(skip) || !el.parentElement) continue;
      const sibs = Array.prototype.filter.call(el.parentElement.children,
        (c) => !c.matches(skip));
      const i = sibs.indexOf(el);
      if (i < 0 || i + 1 >= sibs.length) continue;
      const b = sibs[i + 1];
      const sa = el.getAttribute("data-od-id"), sb = b.getAttribute("data-od-id");
      if (stampedOnly && !(sa && sb)) continue;
      if (likeOnly && !alike(el, b)) continue;
      const ra = el.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (!fits(ra) || !fits(rb)) continue;
      const pa = probe(el, ra), pb = probe(b, rb);
      if (!pa || !pb) continue;
      return {
        aId: sa || cv.patch.stableId(el), bId: sb || cv.patch.stableId(b),
        stamped: !!(sa && sb), alike: alike(el, b),
        aTag: el.tagName.toLowerCase(), bTag: b.tagName.toLowerCase(),
        aPt: {x: host.x + pa.x, y: host.y + pa.y},
        bPt: {x: host.x + pb.x, y: host.y + pb.y},
        aIndex: i, sibCount: sibs.length,
        parentTag: el.parentElement.tagName.toLowerCase()
      };
    }
    return null;
  };
  return scan(true, true) || scan(true, false) || scan(false, true)
    || scan(false, false);
}
"""

# a text leaf that hit-tests to itself, for the line 7 text edit
PICK_TEXT_LEAF = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  if (!cv.idoc || !cv.idoc.body) return null;
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  // paragraphs first, then any other text leaf
  const scan = (sel) => {
    for (const el of doc.body.querySelectorAll(sel)) {
      if (el.matches(skip)) continue;
      if (el.children.length !== 0) continue;
      const own = (el.textContent || "").trim();
      if (own.length < 4) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 14 && r.height > 10 && r.top >= 0 && r.left >= 0
            && r.bottom <= vh && r.right <= vw)) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (doc.elementFromPoint(x, y) !== el) continue;
      return {id: el.getAttribute("data-od-id") || cv.patch.stableId(el),
              tag: el.tagName.toLowerCase(),
              text: own.slice(0, 80), pt: {x: host.x + x, y: host.y + y}};
    }
    return null;
  };
  return scan("p") || scan("p, h1, h2, h3, h4, span, li, td, div");
}
"""

# a point on empty page ground, for the preview-mode dead click
GROUND_POINT = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  if (!cv.idoc || !cv.idoc.body) {
    const fr = cv.iframe.getBoundingClientRect();
    return {x: fr.x + fr.width / 2, y: fr.y + fr.height / 2, tag: "(no document)"};
  }
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  for (const el of doc.body.querySelectorAll("*")) {
    if (el.matches(skip)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20 || r.top < 0 || r.left < 0
        || r.bottom > vh || r.right > vw) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (doc.elementFromPoint(x, y) !== el) continue;
    return {x: host.x + x, y: host.y + y, tag: el.tagName.toLowerCase()};
  }
  const r = cv.iframe.getBoundingClientRect();
  return {x: r.x + r.width / 2, y: r.y + r.height / 2, tag: "(fallback centre)"};
}
"""

# the same element read out of the live document and out of the held source
BOTH_DOCS = r"""
(args) => {
  const f = MX.grid.frames[args.id];
  const cv = f._canvasState;
  if (!cv.idoc) return null;
  const src = cv.patch.parse(f._canvas.source());
  const liveEl = cv.patch.find(cv.idoc, args.gid);
  const srcEl = src ? cv.patch.find(src, args.gid) : null;
  const kidsOf = (el) => el ? Array.prototype.map.call(el.children,
    (c) => c.getAttribute("data-od-id") || cv.patch.stableId(c)) : null;
  const tagsOf = (el) => el ? Array.prototype.map.call(el.children,
    (c) => c.tagName.toLowerCase()) : null;
  const slotOf = (doc, id) => {
    const el = cv.patch.find(doc, id);
    if (!el || !el.parentElement) return -1;
    return Array.prototype.filter.call(el.parentElement.children,
      (c) => !c.matches(cv.patch.HOST_NODE_SELECTOR)).indexOf(el);
  };
  return {
    inLive: !!liveEl, inSource: !!srcEl,
    liveKids: kidsOf(liveEl), srcKids: kidsOf(srcEl),
    liveKidTags: tagsOf(liveEl), srcKidTags: tagsOf(srcEl),
    liveSlot: slotOf(cv.idoc, args.gid),
    srcSlot: src ? slotOf(src, args.gid) : -1,
    aSlotLive: slotOf(cv.idoc, args.aId),
    aSlotSrc: src ? slotOf(src, args.aId) : -1,
    liveGroupAttr: liveEl ? liveEl.getAttribute("data-od-group") : null,
    srcGroupAttr: srcEl ? srcEl.getAttribute("data-od-group") : null
  };
}
"""

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"

SRC_HAS = r"""
(args) => {
  const s = MX.grid.frames[args.id]._canvas.source();
  return {hit: s.indexOf(args.needle) >= 0, len: s.length};
}
"""

HISTORY = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return cv.history ? {canUndo: cv.history.canUndo(), canRedo: cv.history.canRedo()} : null;
}
"""

# status reads "saved" for 2.5s then clears; the walk waits on it
STATUS_SAVED = r"""
(id) => {
  const f = MX.grid.frames[id];
  const cv = f && f._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "saved");
}
"""

TARGETS_MODULE = '() => !!MX.widgetModule("canvas_targets")'

# targets.js script tag as served, read off the parsed document
TARGETS_TAG_IN_DOM = ('() => !!document.querySelector('
                      '\'script[src*="codecanvas/targets/targets.js"]\')')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3F-headed")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    for path in (TAB1, TAB2):
        if not os.path.exists(path):
            print(f"MISSING FIXTURE {path}")
            sys.exit(1)

    # both fixtures: text held here, written back at teardown
    held = {}
    for path in (TAB1, TAB2):
        with open(path) as fh:
            held[path] = fh.read()
        CONSOLE.append(f"[harness] held before the run: "
                       f"{os.path.basename(path)}, {len(held[path])} bytes")

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] cleared a stale grid file at {grid_file}")

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")

    marker = "3F-H " + str(int(time.time()))
    findings = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        ctx = browser.new_context(viewport={"width": 1720, "height": 1060})
        p1 = ctx.new_page()
        wire(p1, "p1")
        url = f"{BASE}/matrix/{sid}?s={args.surface}"
        resp = p1.goto(url, wait_until="load", timeout=25000)
        if resp is None or not resp.ok:
            print(f"FAILED TO LOAD {url}")
            browser.close()
            sys.exit(1)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=15000)
        p1.wait_for_function("() => window.MX && window.MX.canvasCore", timeout=15000)
        CONSOLE.append(f"[harness] socket right after load: "
                       f"{p1.evaluate('() => [MX.socket.state(), MX.socket.sid()]')}")
        socket_live = wait_ok(p1, '() => MX.socket.state() === "live"', None, 10000,
                              "ade socket live")
        if not socket_live:
            p1.evaluate("(sid) => MX.socket.bind(sid)", sid)
            socket_live = wait_ok(p1, '() => MX.socket.state() === "live"', None, 15000,
                                  "ade socket live after rebind")
        CONSOLE.append(f"[harness] ade socket live: {socket_live} "
                       f"(state={p1.evaluate('() => MX.socket.state()')!r})")

        # state: the walk starts on an empty surface
        stale = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        if stale:
            p1.evaluate("() => { for (const f of Object.values(MX.grid.frames))"
                        " if (f._canvasState) f._canvasState.dirty = false; }")
            p1.evaluate("() => Promise.all(MX.grid.instances.map((i) => i.id)"
                        ".map((id) => MX.grid.removeWidget(id)))")
            p1.wait_for_timeout(1500)
        CONSOLE.append(f"[harness] widgets on the surface at start: {stale}; "
                       f"after clearing: "
                       f"{p1.evaluate('() => MX.grid.instances.map((i) => i.type)')}")

        # ---- 1. new surface, add Canvas: preview, no target
        a = p1.evaluate(MOUNT, {"type": "canvas"})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 13, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        p1.wait_for_timeout(800)
        st = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "01-canvas-preview-no-target")
        ok1 = (st["mode"] == "preview" and st["status"] == "no target"
               and st["targets"] == [] and st["tabsHidden"] is True)
        record(1, "New surface. Add Canvas. It opens in preview, 'no target'.", ok1, sh,
               f"mode={st['mode']!r} status={st['status']!r} targets={st['targets']} "
               f"tabRowHidden={st['tabsHidden']} optMode={st['optMode']!r}")
        if not ok1:
            findings.append("1 — canvas.js MOD.defaults / mount: mode or status wrong")

        # ---- 2. add Targets, bind, "+ Add" the copy, page draws, clicks dead
        module_shipped = p1.evaluate(TARGETS_TAG_IN_DOM)
        module_live = p1.evaluate(TARGETS_MODULE)
        CONSOLE.append(f"[harness] targets.js script tag in the served matrix.html: "
                       f"{module_shipped}; module registered: {module_live}")
        g = p1.evaluate(MOUNT, {"type": "canvas_targets"})
        p1.evaluate(RESIZE, {"id": g, "col": 14, "row": 1, "w": 4, "h": 8})
        p1.wait_for_timeout(900)
        bound_before = p1.evaluate(TG_ROWS, g)
        p1.evaluate(STUB_PICKER, TAB1)
        clicked = p1.evaluate(CLICK_ADD, g)
        loaded = wait_ok(p1, FILE_READY, a, 45000, "file ready (fixture)")
        CONSOLE.append(f"[harness] '+ Add' clicked={clicked} file_ready={loaded}")
        p1.wait_for_timeout(1800)
        st = p1.evaluate(CV, a)
        rows = p1.evaluate(TG_ROWS, g)
        ground = p1.evaluate(GROUND_POINT, a)
        p1.mouse.click(ground["x"], ground["y"])
        p1.wait_for_timeout(500)
        after_click = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "02-targets-add-nirvana")
        ok2 = (module_shipped and module_live and clicked and loaded
               and bound_before["empty"] is None
               and len(rows["rows"]) == 1 and rows["rows"][0]["on"]
               and len(st["tabs"]) == 1 and st["tabs"][0]["on"]
               and st["docMode"] == "file" and st["bodyKids"] > 0
               and st["mode"] == "preview"
               and after_click["selection"] == [])
        record(2, "Add Targets. It binds. '+ Add' the copy. A tab appears. "
                  "The page draws. Clicks do nothing.", ok2, sh,
               f"targets.js tag shipped in matrix.html={module_shipped} "
               f"module_registered={module_live} "
               f"add_clicked={clicked} file_ready={loaded} "
               f"targets_empty_before={bound_before['empty']!r} rows={rows['rows']} "
               f"canvas_tabs={st['tabs']} docMode={st['docMode']!r} "
               f"body_children={st['bodyKids']} sourceLen={st['sourceLen']} "
               f"status={st['status']!r} clicked={ground['tag']!r} at "
               f"({ground['x']:.0f},{ground['y']:.0f}) selection_after_click="
               f"{after_click['selection']} picker_opts={rows['picks']}")
        if not ok2:
            findings.append("2 — targets.js tag / canvas_targets module, "
                            "or the add-and-load path in targets.js / canvas.js")

        # ---- 3. second .html, two tabs, switch and back
        p1.evaluate(STUB_PICKER, TAB2)
        p1.evaluate(CLICK_ADD, g)
        p1.wait_for_timeout(3500)
        st_two = p1.evaluate(CV, a)
        p1.evaluate(CV_TAB_CLICK, {"id": a, "path": TAB1})
        p1.wait_for_timeout(2500)
        st_back1 = p1.evaluate(CV, a)
        p1.evaluate(CV_TAB_CLICK, {"id": a, "path": TAB2})
        p1.wait_for_timeout(3000)
        st_second = p1.evaluate(CV, a)
        p1.evaluate(CV_TAB_CLICK, {"id": a, "path": TAB1})
        p1.wait_for_timeout(2500)
        st_back2 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "03-two-tabs")
        ok3 = (len(st_two["tabs"]) == 2 and st_two["path"] == TAB2
               and st_back1["path"] == TAB1 and st_second["path"] == TAB2
               and st_back2["path"] == TAB1 and st_back2["bodyKids"] > 0
               and st_back2["docMode"] == "file"
               and [t["path"] for t in st_back2["tabs"]] == [TAB1, TAB2])
        record(3, "Add a second small .html. Two tabs. Switch. Switch back.", ok3, sh,
               f"tabs={[t['name'] for t in st_two['tabs']]} "
               f"after_add_active={os.path.basename(st_two['path'])} "
               f"switch1={os.path.basename(st_back1['path'])} "
               f"switch2={os.path.basename(st_second['path'])} "
               f"switch3={os.path.basename(st_back2['path'])} "
               f"cached={[os.path.basename(c) for c in st_back2['cached']]} "
               f"body_children={st_back2['bodyKids']} status={st_back2['status']!r}")
        if not ok3:
            findings.append("3 — canvas.js switchTab / loadTarget / tab cache")

        # ---- 4. canvas mode, click, inspector, layers lit
        t = p1.evaluate(MOUNT, {"type": "canvas_tools"})
        p1.evaluate(RESIZE, {"id": t, "col": 14, "row": 9, "w": 4, "h": 10})
        wait_ok(p1, TOOLS_READY, t, 30000, "tools ready")
        p1.wait_for_timeout(1200)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'canvas')", {"id": a})
        p1.wait_for_timeout(600)
        pair = p1.evaluate(PICK_SIBLINGS, a)
        if not pair:
            sh = shot(p1, args.out, "04-click-inspector-layers")
            record(4, "Canvas mode. Click an element. Tools inspector shows it. "
                      "Layers shows the tree with that row lit.", False, sh,
                   "no clickable sibling pair found in the visible page")
            findings.append("4 — harness could not find a hit-testable sibling pair")
            pair = {}
        else:
            p1.mouse.click(pair["aPt"]["x"], pair["aPt"]["y"])
            p1.wait_for_timeout(800)
            st4 = p1.evaluate(CV, a)
            insp = p1.evaluate(TL_INSPECTOR, t)
            tl_tabs = p1.evaluate(TL_TABS, t)
            p1.evaluate(TL_TAB_CLICK, {"id": t, "name": "layers"})
            p1.wait_for_timeout(800)
            layers4 = p1.evaluate(TL_LAYER_ROWS, t)
            lit = [r["id"] for r in layers4 if r["active"]]
            sh = shot(p1, args.out, "04-click-inspector-layers")
            hidden_tabs = sorted(x["name"] for x in tl_tabs if x["hidden"])
            ok4 = (st4["mode"] == "canvas" and st4["selection"] == [pair["aId"]]
                   and insp["ids"] == [pair["aId"]] and len(layers4) > 1
                   and lit == [pair["aId"]] and hidden_tabs == ["library", "page"])
            record(4, "Canvas mode. Click an element. Tools inspector shows it. "
                      "Layers shows the tree with that row lit.", ok4, sh,
                   f"clicked {pair['aTag']}#{pair['aId']} "
                   f"pair_carries_data-od-id={pair['stamped']} "
                   f"pair_alike={pair['alike']} sibling={pair['bTag']}#{pair['bId']} "
                   f"selection={st4['selection']} "
                   f"inspector_ids={insp['ids']} inspector_titles={insp['titles'][:4]} "
                   f"tools_tabs_hidden={hidden_tabs} layer_rows={len(layers4)} "
                   f"rows_lit={lit}")
            if not ok4:
                findings.append("4 — tools.js renderInspector / renderFileLayers")

        # ---- 5. shift-click the sibling, cmd-G, group row holds both
        gid = ""
        if pair:
            p1.keyboard.down("Shift")
            p1.mouse.click(pair["bPt"]["x"], pair["bPt"]["y"])
            p1.keyboard.up("Shift")
            p1.wait_for_timeout(700)
            sel5 = p1.evaluate(CV, a)["selection"]
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+g")
            p1.wait_for_timeout(1000)
            st5 = p1.evaluate(CV, a)
            gid = st5["selection"][0] if st5["selection"] else ""
            layers5 = p1.evaluate(TL_LAYER_ROWS, t)
            both = p1.evaluate(BOTH_DOCS, {"id": a, "gid": gid, "aId": pair["aId"]})
            idx = [i for i, r in enumerate(layers5) if r["id"] == gid]
            kids_after = []
            if idx:
                base = layers5[idx[0]]["indent"]
                for r in layers5[idx[0] + 1:]:
                    if r["indent"] <= base:
                        break
                    kids_after.append(r["id"])
            sh = shot(p1, args.out, "05-group")
            want_kids = sorted([pair["aId"], pair["bId"]])
            src_kids_ok = (sorted(both["srcKids"] or []) == want_kids
                           if pair["stamped"]
                           else (both["srcKidTags"] or []) == [pair["aTag"], pair["bTag"]])
            ok5 = (len(sel5) == 2 and gid.startswith("grp_")
                   and both["inLive"] and both["inSource"]
                   and both["liveGroupAttr"] == "1" and both["srcGroupAttr"] == "1"
                   and sorted(both["liveKids"] or []) == want_kids
                   and src_kids_ok
                   and bool(idx)
                   and sorted(kids_after[:2]) == want_kids)
            record(5, "Shift-click a sibling. Cmd-G. Layers shows a group row holding both.",
                   ok5, sh,
                   f"selection_before_G={sel5} group_id={gid!r} "
                   f"in_live={both['inLive']} in_source={both['inSource']} "
                   f"live_children={both['liveKids']} source_children={both['srcKids']} "
                   f"source_child_tags={both['srcKidTags']} "
                   f"group_attr live={both['liveGroupAttr']!r} src={both['srcGroupAttr']!r} "
                   f"layers_group_row_at={idx} rows_under_it={kids_after[:3]} "
                   f"dirty={p1.evaluate(CV, a)['dirty']}")
            if not ok5:
                findings.append("5 — canvas.js fileGroup / patch.js wrap / tools.js renderFileLayers")
        else:
            sh = shot(p1, args.out, "05-group")
            record(5, "Shift-click a sibling. Cmd-G. Layers shows a group row holding both.",
                   False, sh, "skipped: no sibling pair from line 4")

        # ---- 6. cmd-[ moves the group back one, cmd-z twice undoes both
        if gid:
            slot_before = p1.evaluate(BOTH_DOCS, {"id": a, "gid": gid, "aId": pair["aId"]})
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+BracketLeft")
            p1.wait_for_timeout(900)
            slot_back = p1.evaluate(BOTH_DOCS, {"id": a, "gid": gid, "aId": pair["aId"]})
            hist_before = p1.evaluate(HISTORY, a)
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+z")
            p1.wait_for_timeout(900)
            after_u1 = p1.evaluate(BOTH_DOCS, {"id": a, "gid": gid, "aId": pair["aId"]})
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+z")
            p1.wait_for_timeout(900)
            after_u2 = p1.evaluate(BOTH_DOCS, {"id": a, "gid": gid, "aId": pair["aId"]})
            hist_after = p1.evaluate(HISTORY, a)
            sh = shot(p1, args.out, "06-order-and-undo")
            moved = (slot_back["liveSlot"] == slot_before["liveSlot"] - 1
                     and slot_back["srcSlot"] == slot_before["srcSlot"] - 1)
            undo1 = (after_u1["liveSlot"] == slot_before["liveSlot"]
                     and after_u1["srcSlot"] == slot_before["srcSlot"])
            # source slot gated on a stamped pair, reported on a path-shaped id
            undo2 = (not after_u2["inLive"] and not after_u2["inSource"]
                     and after_u2["aSlotLive"] == pair["aIndex"]
                     and (after_u2["aSlotSrc"] == pair["aIndex"]
                          if pair["stamped"] else True))
            ok6 = moved and undo1 and undo2
            record(6, "Cmd-[. The group moves back one. Cmd-Z twice. Both undone.", ok6, sh,
                   f"group slot live {slot_before['liveSlot']} -> {slot_back['liveSlot']}, "
                   f"source {slot_before['srcSlot']} -> {slot_back['srcSlot']} "
                   f"(moved_back={moved}); after undo 1 live slot={after_u1['liveSlot']} "
                   f"source slot={after_u1['srcSlot']} (move_undone={undo1}); "
                   f"after undo 2 group in_live={after_u2['inLive']} "
                   f"in_source={after_u2['inSource']} first_child_slot live="
                   f"{after_u2['aSlotLive']} src={after_u2['aSlotSrc']} "
                   f"expected={pair['aIndex']} (group_undone={undo2}); "
                   f"history {hist_before} -> {hist_after}")
            if not ok6:
                findings.append("6 — canvas.js fileOrder/fileUndo, patch.js doMove/doWrap inverse")
        else:
            sh = shot(p1, args.out, "06-order-and-undo")
            record(6, "Cmd-[. The group moves back one. Cmd-Z twice. Both undone.",
                   False, sh, "skipped: no group from line 5")

        # ---- 7. text edit on tab one, switch away and back, cmd-z
        leaf = p1.evaluate(PICK_TEXT_LEAF, a)
        typed = marker + " EDIT"
        if leaf:
            p1.mouse.click(leaf["pt"]["x"], leaf["pt"]["y"])
            p1.wait_for_timeout(700)
            p1.evaluate(TL_TAB_CLICK, {"id": t, "name": "tools"})
            p1.wait_for_timeout(600)
            insp7 = p1.evaluate(TL_INSPECTOR, t)
            p1.evaluate(TL_TYPE_TEXT, {"id": t, "value": typed})
            p1.wait_for_timeout(1400)
            edited = p1.evaluate(SRC_HAS, {"id": a, "needle": typed})
            st7a = p1.evaluate(CV, a)
            p1.evaluate(CV_TAB_CLICK, {"id": a, "path": TAB2})
            p1.wait_for_timeout(3000)
            st7b = p1.evaluate(CV, a)
            p1.evaluate(CV_TAB_CLICK, {"id": a, "path": TAB1})
            p1.wait_for_timeout(2500)
            kept = p1.evaluate(SRC_HAS, {"id": a, "needle": typed})
            st7c = p1.evaluate(CV, a)
            live_kept = p1.evaluate(
                "(args) => { const cv = MX.grid.frames[args.id]._canvasState;"
                " return cv.idoc.body.textContent.indexOf(args.needle) >= 0; }",
                {"id": a, "needle": typed})
            hist7 = p1.evaluate(HISTORY, a)
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+z")
            p1.wait_for_timeout(900)
            undone = p1.evaluate(SRC_HAS, {"id": a, "needle": typed})
            sh = shot(p1, args.out, "07-text-edit-across-tabs")
            ok7 = (edited["hit"] and st7a["dirty"] and st7b["path"] == TAB2
                   and kept["hit"] and live_kept and not undone["hit"])
            record(7, "Edit text on tab one. Switch to tab two. Switch back. "
                      "The edit is there. Cmd-Z undoes it.", ok7, sh,
                   f"leaf={leaf['tag']}#{leaf['id']} was={leaf['text']!r} "
                   f"inspector_text_field={insp7['text'] is not None} "
                   f"in_source_after_typing={edited['hit']} dirty={st7a['dirty']} "
                   f"switched_to={os.path.basename(st7b['path'])} "
                   f"back_on={os.path.basename(st7c['path'])} "
                   f"in_source_after_return={kept['hit']} in_live_after_return={live_kept} "
                   f"history_after_return={hist7} in_source_after_cmdZ={undone['hit']} "
                   f"status={st7c['status']!r}")
            if not ok7:
                findings.append("7 — canvas.js stash/restoreTab/loadTarget cache, fileUndo")
        else:
            sh = shot(p1, args.out, "07-text-edit-across-tabs")
            record(7, "Edit text on tab one. Switch to tab two. Switch back. "
                      "The edit is there. Cmd-Z undoes it.", False, sh,
                   "no hit-testable text leaf found")
            findings.append("7 — harness could not find a text leaf")

        # ---- 8. redo the text edit, cmd-G the pair again, save
        # line 7's cmd-Z left the edit on the redo stack; the group cannot be
        # redone (line 7's push truncated it), so it is remade with cmd-G
        hist8a = p1.evaluate(HISTORY, a)
        redone = False
        if hist8a and hist8a["canRedo"]:
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+Shift+z")
            p1.wait_for_timeout(900)
            redone = p1.evaluate(SRC_HAS, {"id": a, "needle": typed})["hit"]
        # fresh click points: the text edit can move the page under them
        pair8 = p1.evaluate(PICK_SIBLINGS, a) or pair
        gid2 = ""
        sel8 = []
        if pair8:
            p1.mouse.click(pair8["aPt"]["x"], pair8["aPt"]["y"])
            p1.wait_for_timeout(500)
            p1.keyboard.down("Shift")
            p1.mouse.click(pair8["bPt"]["x"], pair8["bPt"]["y"])
            p1.keyboard.up("Shift")
            p1.wait_for_timeout(600)
            sel8 = p1.evaluate(CV, a)["selection"]
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+g")
            p1.wait_for_timeout(1000)
            st8g = p1.evaluate(CV, a)
            gid2 = st8g["selection"][0] if st8g["selection"] else ""
        regrouped = p1.evaluate(BOTH_DOCS, {"id": a, "gid": gid2,
                                            "aId": pair8.get("aId", "")}) if gid2 else None
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+s")
        saved_status = wait_ok(p1, STATUS_SAVED, a, 5000, "status reads saved")
        p1.wait_for_timeout(1200)
        st8 = p1.evaluate(CV, a)
        with open(TAB1) as fh:
            disk = fh.read()
        ids_on_disk = len(re.findall(r'data-od-id="', disk))
        groups_on_disk = len(re.findall(r'data-od-group="', disk))
        group_on_disk = bool(gid2) and (gid2 in disk)
        text_on_disk = typed in disk
        sh = shot(p1, args.out, "08-save")
        ok8 = (saved_status and ids_on_disk > 0 and group_on_disk and text_on_disk)
        record(8, "Cmd-G the pair again. Save. Status reads saved. The file on disk "
                  "has ids, the text edit and the group.", ok8, sh,
               f"redo_pressed={bool(hist8a and hist8a['canRedo'])} "
               f"text_edit_back_in_source={redone} history_before_regroup={hist8a}; "
               f"pair={pair8.get('aId')!r}+{pair8.get('bId')!r} "
               f"same_pair_as_line_5={pair8.get('aId') == pair.get('aId')} "
               f"selection_before_G={sel8} group_id={gid2!r} "
               f"group in_live={regrouped['inLive'] if regrouped else None} "
               f"in_source={regrouped['inSource'] if regrouped else None} "
               f"children={regrouped['liveKids'] if regrouped else None}; "
               f"status_reached_saved={saved_status} status_now={st8['status']!r} "
               f"dirty_after={st8['dirty']}; on disk: data-od-id={ids_on_disk} "
               f"data-od-group={groups_on_disk} group_id_present={group_on_disk} "
               f"text_edit_present={text_on_disk} file_bytes={len(disk)}")
        if not ok8:
            findings.append("8 — canvas.js doSave status / fileGroup, patch.js wrap")

        # ---- 9. reload: two tabs, preview, nothing lost
        opts_before = p1.evaluate("(i) => MX.grid.frames[i].getOptions()", a)
        tg_before = p1.evaluate("(i) => MX.grid.frames[i].getOptions()", g)
        p1.evaluate("() => MX.grid.save()")
        p1.wait_for_timeout(1200)
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.reload(wait_until="load", timeout=30000)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=20000)
        wait_ok(p1, CANVAS_MOUNTED, a, 30000, "canvas mounted after reload")
        reloaded = wait_ok(p1, FILE_READY, a, 45000, "file ready after reload")
        p1.wait_for_timeout(2500)
        st9 = p1.evaluate(CV, a)
        rows9 = p1.evaluate(TG_ROWS, g)
        opts_after = p1.evaluate("(i) => MX.grid.frames[i] ? MX.grid.frames[i].getOptions() : null", a)
        sh = shot(p1, args.out, "09-after-reload")
        tabs_back = [x["path"] for x in st9["tabs"]] == [TAB1, TAB2]
        same_active = st9["path"] == opts_before["target"]
        preview = st9["mode"] == "preview"
        ok9 = tabs_back and same_active and preview and reloaded and st9["bodyKids"] > 0
        record(9, "Reload the page. Two tabs return. Preview mode. Nothing lost.", ok9, sh,
               f"tabs={[x['name'] for x in st9['tabs']]} (two_back={tabs_back}) "
               f"active={os.path.basename(st9['path'])} same_as_before={same_active} "
               f"mode={st9['mode']!r} (preview={preview}) "
               f"mode_before_reload={opts_before['mode']!r} "
               f"targets_option before={len(opts_before['targets'])} "
               f"after={len(opts_after['targets']) if opts_after else None} "
               f"body_children={st9['bodyKids']} status={st9['status']!r} "
               f"targets_widget_rows={[r['name'] for r in rows9['rows']]} "
               f"targets_widget_opts={tg_before}")
        if not ok9:
            findings.append("9 — canvas.js getOptions/mount option round-trip (mode persists)")

        # ---- 10. console
        errs = [c for c in CONSOLE
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c]
        sh = shot(p1, args.out, "10-final")
        ok10 = len(errs) == 0
        record(10, "Console clean the whole way.", ok10, sh,
               f"pageerrors={len(PAGEERRORS)} error_or_warning_lines={len(errs)} "
               f"total_console_lines={len(CONSOLE)}"
               + ("" if ok10 else " ;; " + " ;; ".join(errs[:8])))
        if not ok10:
            findings.append("10 — see console.txt")

        if args.hold:
            time.sleep(args.hold)

        # teardown: every widget this run made comes back down
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.evaluate("(ws) => Promise.all(ws.map((w) => MX.grid.removeWidget(w)))",
                    [a, g, t])
        p1.wait_for_timeout(1500)
        left = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        CONSOLE.append(f"[harness] widgets left on the surface: {left}")
        browser.close()

    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] removed {grid_file}")
    else:
        CONSOLE.append(f"[harness] no grid file at {grid_file}")

    # both fixtures restored to their pre-run text
    restored = {}
    for path in (TAB1, TAB2):
        with open(path) as fh:
            ran = fh.read()
        with open(path, "w") as fh:
            fh.write(held[path])
        with open(path) as fh:
            back = fh.read()
        restored[os.path.basename(path)] = {
            "run_left_bytes": len(ran), "wrote_back_bytes": len(held[path]),
            "matches_before": back == held[path],
            "data_od_id_after": len(re.findall(r'data-od-id="', back))}
        CONSOLE.append(f"[harness] restored {os.path.basename(path)}: run left "
                       f"{len(ran)} bytes, wrote back {len(held[path])}, "
                       f"matches_before={back == held[path]}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump({"results": RESULTS, "findings": findings,
                   "fixtures_restored": restored,
                   "surface_left": left}, fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
    print(f"\nfixtures restored: {restored}")
    print(f"fixtures: {TAB1}, {TAB2}")
    print(f"findings: {findings}")
    sys.exit(0)


if __name__ == "__main__":
    main()
