"""Headed Playwright walk for Phase 3F job H4 — Code, Targets, tab cache.

Copy of Docs/tests/phase3F_headed_keys.py: same launch, console capture,
record/shot pair per line, fixture hold and restore, teardown.

Fixtures, its own copies, never shared with the other walks:
    Docs/scratchpad/phase3F-fixture-code.html
    Docs/scratchpad/phase3F-fixture-code-2.html
    Docs/scratchpad/phase3F-fixture-code.json

Surface: Canvas, Targets, Tools, Code, all bound to the one canvas.

Usage:
    python3 Docs/tests/phase3F_headed_code.py --session <sid> \
        --out Docs/Reports/phase3F-headed-code/

Exit code 0 once the page loads; the receipt is the record.
"""

import argparse
import hashlib
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

# originals, read only, never driven
SRC_HTML = os.path.join(SCRATCH, "phase3F-fixture.html")
SRC_HTML2 = os.path.join(SCRATCH, "phase3F-fixture-2.html")
SRC_JSON = os.path.join(SCRATCH, "fixture.json")
# copies, this walk's own, made at start and restored at teardown
FIXTURE = os.path.join(SCRATCH, "phase3F-fixture-code.html")
FIXTURE2 = os.path.join(SCRATCH, "phase3F-fixture-code-2.html")
FIXJSON = os.path.join(SCRATCH, "phase3F-fixture-code.json")

RESULTS = []
CONSOLE = []
PAGEERRORS = []
REQS = []


def record(num, name, passed, shot, note=""):
    # console_at: console lines seen when this line closed, for placing errors
    RESULTS.append({"n": num, "name": name, "pass": bool(passed),
                    "shot": os.path.basename(shot or ""), "note": note,
                    "console_at": len(CONSOLE)})
    print(f"[{num}] {'PASS' if passed else 'FAIL'} — {name}" + (f"\n      {note}" if note else ""))


def note_response(tag, resp):
    REQS.append(resp.url)
    if resp.status >= 400:
        CONSOLE.append(f"[{tag}:http:{resp.status}] {resp.url}")


def wire(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"[{tag}:console:{m.type}] {m.text}"))
    page.on("response", lambda r: note_response(tag, r))
    page.on("pageerror", lambda e: (PAGEERRORS.append(f"[{tag}:pageerror] {e}"),
                                    CONSOLE.append(f"[{tag}:pageerror] {e}")))


def reqs_since(mark, sub):
    # server hits carrying sub since the mark, for the reopen check
    return [u for u in REQS[mark:] if sub in u]


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


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()[:12]


# ---- page-side snippets --------------------------------------------------

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

DOC_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return false;
  return f._canvasState.docMode === "doc";
}
"""

TOOLS_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  return !!(f && f._toolsState && f._toolsState.core && f._toolsState.tools);
}
"""

CODE_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  return !!(f && f._codeState && f._codeState.editor);
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
    canUndo: cv.history ? cv.history.canUndo() : null,
    canRedo: cv.history ? cv.history.canRedo() : null,
    optTarget: f.options.target || "",
    optTargets: (f.options.targets || []).slice(),
    optMode: f.options.mode
  };
}
"""

# picker stub: the suite picker is native on this machine, a macOS dialog no
# browser driver can reach. The stub commits the path the walk wants.
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
  return Array.prototype.map.call(el.querySelectorAll(".mxtl-tab"), (t) => {
    const cs = getComputedStyle(t), r = t.getBoundingClientRect();
    return {name: t.textContent, on: /-on\b|active/.test(String(t.className || "")),
            cls: String(t.className || ""), display: cs.display,
            vis: cs.visibility, w: Math.round(r.width), hid: !!t.hidden,
            shown: cs.display !== "none" && cs.visibility !== "hidden"
                   && r.width > 0 && !t.hidden};
  });
}
"""

# flat state of the Tools widget, primitives only
TOOLS_STATE = r"""
(id) => {
  const ts = MX.grid.frames[id]._toolsState;
  const flat = {};
  if (ts) for (const k of Object.keys(ts)) {
    const v = ts[k];
    if (v === null || ["string", "number", "boolean"].indexOf(typeof v) >= 0)
      flat[k] = typeof v === "string" ? v.slice(0, 60) : v;
  }
  if (ts && ts.tools) flat.__hasTools = true;
  return flat;
}
"""

TL_LAYER_ROWS = r"""
(id) => {
  const body = MX.grid.frames[id].el.querySelector(".mxtl-body");
  if (!body) return [];
  return Array.prototype.map.call(body.querySelectorAll(".cc-panel-row"), (r) => ({
    id: r.dataset.id || "",
    name: r.querySelector(".cc-panel-row-name")
      ? r.querySelector(".cc-panel-row-name").textContent : "",
    indent: parseInt(r.style.paddingLeft || "0", 10),
    active: r.classList.contains("cc-panel-row-active")
  }));
}
"""

TL_ROW_CLICK = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  if (!body) return false;
  for (const r of body.querySelectorAll(".cc-panel-row"))
    if (r.dataset.id === args.gid) {
      const n = r.querySelector(".cc-panel-row-name") || r;
      n.click();
      return true;
    }
  return false;
}
"""

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"

STATUS_SAVED = r"""
(id) => {
  const f = MX.grid.frames[id];
  const cv = f && f._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "saved");
}
"""

SOURCE_TEXT = "(id) => MX.grid.frames[id]._canvas.source()"

# ---- walk-specific snippets ---------------------------------------------

# iframe geometry plus one click point per named element
PROBE = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const out = {vw: vw, vh: vh, hostW: host.width, hostH: host.height, els: {}};
  for (const key of Object.keys(args.sels)) {
    const el = doc.querySelector(args.sels[key]);
    if (!el) { out.els[key] = null; continue; }
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    out.els[key] = {
      odId: el.getAttribute("data-od-id") || "",
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().slice(0, 40),
      x: host.x + cx, y: host.y + cy,
      hit: doc.elementFromPoint(cx, cy) === el
    };
  }
  return out;
}
"""

# the stage's element children, live document and held source, in order
KIDS = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  let src = null;
  try { src = cv.patch.parse(f._canvas.source()); } catch (e) { src = null; }
  const skip = cv.patch.HOST_NODE_SELECTOR;
  const kids = (doc) => {
    const st = doc ? doc.querySelector(args.sel) : null;
    if (!st) return null;
    return Array.prototype.filter.call(st.children, (c) => !c.matches(skip))
      .map((c) => ({id: c.getAttribute("data-od-id") || "",
                    tag: c.tagName.toLowerCase(),
                    grp: c.getAttribute("data-od-group") || ""}));
  };
  return {live: kids(cv.idoc), src: kids(src)};
}
"""

# one element's text, live document and held source
TEXT_OF = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  let src = null;
  try { src = cv.patch.parse(f._canvas.source()); } catch (e) { src = null; }
  const one = (doc) => {
    const el = doc ? doc.querySelector(args.sel) : null;
    return el ? (el.textContent || "").trim() : null;
  };
  return {live: one(cv.idoc), src: one(src)};
}
"""

# ---- Code widget ---------------------------------------------------------

CODE_TEXT = r"""
(id) => {
  const cs = MX.grid.frames[id]._codeState;
  return cs && cs.editor ? cs.editor.getValue() : null;
}
"""

CODE_HAS = r"""
(args) => {
  const cs = MX.grid.frames[args.id]._codeState;
  return !!(cs && cs.editor && cs.editor.getValue().indexOf(args.sub) >= 0);
}
"""

# head buttons and flat state, read off the DOM: no widget source is read
CODE_DUMP = r"""
(id) => {
  const f = MX.grid.frames[id], cs = f._codeState, el = f.el;
  const btns = Array.prototype.map.call(el.querySelectorAll("button"), (b) => ({
    cls: String(b.className || ""), text: (b.textContent || "").trim().slice(0, 24),
    shown: !b.hidden && b.getBoundingClientRect().width > 0}));
  const flat = {};
  if (cs) for (const k of Object.keys(cs)) {
    const v = cs[k];
    if (v === null || ["string", "number", "boolean"].indexOf(typeof v) >= 0)
      flat[k] = typeof v === "string" ? v.slice(0, 80) : v;
  }
  return {buttons: btns, state: flat, len: cs && cs.editor ? cs.editor.getValue().length : -1};
}
"""

# set the editor's text, then commit through the widget's own button
CODE_COMMIT = r"""
(args) => {
  const f = MX.grid.frames[args.id], cs = f._codeState;
  if (!cs || !cs.editor) return {ok: false, why: "no editor"};
  cs.editor.setValue(args.text);
  const rx = new RegExp(args.rx, "i");
  const btns = Array.prototype.slice.call(f.el.querySelectorAll("button"));
  const hit = btns.filter((b) => rx.test(b.className || "")
                                 || rx.test((b.textContent || "").trim()))[0];
  if (!hit) return {ok: false, why: "no button",
                    saw: btns.map((b) => (b.textContent || "").trim())};
  hit.click();
  return {ok: true, btn: (hit.textContent || "").trim(), cls: String(hit.className || "")};
}
"""

# ---- Targets widget ------------------------------------------------------

# rows read off the DOM by their title, which carries the full path
TG_ROWS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  const rows = Array.prototype.slice.call(el.querySelectorAll("[title]"))
    .filter((r) => /\.(html|json)$/i.test(r.title || ""));
  return rows.map((r) => ({
    title: r.title, cls: String(r.className || ""),
    text: (r.textContent || "").trim().slice(0, 60),
    draggable: !!r.draggable,
    kids: Array.prototype.map.call(r.children, (c) => ({
      cls: String(c.className || ""), text: (c.textContent || "").trim().slice(0, 6)}))
  }));
}
"""

TG_DUMP = "(id) => MX.grid.frames[id].el.innerHTML.slice(0, 2400)"

# markup of a widget's host, for finding its own controls without reading source
HOST_DUMP = r"""
(args) => {
  const h = MX.grid.frames[args.id].el.querySelector(".mx-host");
  return h ? h.innerHTML.slice(0, args.n || 2400) : "(no host)";
}
"""

# click the widget's own control whose text or class matches, for driving it
CTRL_CLICK = r"""
(args) => {
  const el = MX.grid.frames[args.id].el;
  const rx = new RegExp(args.rx, "i");
  const all = Array.prototype.slice.call(
    el.querySelectorAll("button, [role=tab], .mxcd-tab, .mxcd-btn, option, "
                        + "[data-view], [data-mode], select"));
  const seen = all.map((n) => ({tag: n.tagName.toLowerCase(),
    cls: String(n.className || ""), text: (n.textContent || "").trim().slice(0, 20),
    view: n.dataset ? (n.dataset.view || n.dataset.mode || "") : ""}));
  for (const n of all) {
    if (n.tagName.toLowerCase() === "select") {
      const opt = Array.prototype.slice.call(n.options)
        .filter((o) => rx.test(o.value) || rx.test(o.textContent || ""))[0];
      if (opt) {
        n.value = opt.value;
        n.dispatchEvent(new Event("change", {bubbles: true}));
        return {ok: true, how: "select", value: opt.value, seen: seen};
      }
      continue;
    }
    const key = (n.dataset && (n.dataset.view || n.dataset.mode)) || "";
    if (rx.test(key) || rx.test((n.textContent || "").trim())
        || rx.test(String(n.className || ""))) {
      n.click();
      return {ok: true, how: "click", text: (n.textContent || "").trim(),
              cls: String(n.className || ""), view: key, seen: seen};
    }
  }
  return {ok: false, seen: seen};
}
"""

# fetch, XHR and ADE socket taps: HTTP alone does not see a socket read
# one select, chosen by its whole option list, set to one value
VIEW_SET = r"""
(args) => {
  const el = MX.grid.frames[args.id].el;
  for (const s of el.querySelectorAll("select")) {
    const vals = Array.prototype.map.call(s.options, (o) => o.value);
    if (args.options && vals.join(",") !== args.options) continue;
    if (vals.indexOf(args.value) < 0) continue;
    s.value = args.value;
    s.dispatchEvent(new Event("change", {bubbles: true}));
    return {ok: true, set: args.value, options: vals};
  }
  return {ok: false,
          selects: Array.prototype.map.call(el.querySelectorAll("select"),
            (s) => Array.prototype.map.call(s.options, (o) => o.value).join(","))};
}
"""

NET_TAP = r"""
() => {
  window.__net = [];
  if (!window.__netOn) {
    window.__netOn = true;
    const of = window.fetch;
    window.fetch = function (a, b) {
      try { window.__net.push("fetch " + String(a && a.url ? a.url : a)); } catch (e) {}
      return of.apply(this, arguments);
    };
    const ox = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (m, u) {
      try { window.__net.push("xhr " + String(u)); } catch (e) {}
      return ox.apply(this, arguments);
    };
    if (MX.socket && typeof MX.socket.send === "function") {
      const os = MX.socket.send.bind(MX.socket);
      MX.socket.send = function () {
        try { window.__net.push("socket " + JSON.stringify(
          Array.prototype.slice.call(arguments)).slice(0, 240)); } catch (e) {
          window.__net.push("socket (unserializable)"); }
        return os.apply(null, arguments);
      };
      window.__sockTapped = true;
    }
  }
  return {sock: !!window.__sockTapped};
}
"""

NET_TAKE = "() => { const n = window.__net || []; window.__net = []; return n; }"

TG_ROW_CLICK = r"""
(args) => {
  const el = MX.grid.frames[args.id].el;
  for (const r of el.querySelectorAll("[title]")) {
    if (r.title !== args.path) continue;
    const n = Array.prototype.slice.call(r.children)
      .filter((c) => (c.textContent || "").trim().length > 2)[0] || r;
    n.click();
    return true;
  }
  return false;
}
"""

TG_ROW_X = r"""
(args) => {
  const el = MX.grid.frames[args.id].el;
  for (const r of el.querySelectorAll("[title]")) {
    if (r.title !== args.path) continue;
    const all = Array.prototype.slice.call(r.querySelectorAll("*"));
    const x = all.filter((c) => /^[x×✕✖]$/i.test((c.textContent || "").trim())
                                || /(close|remove|-x\b|del)/i.test(String(c.className || "")))[0];
    if (!x) return {ok: false, saw: all.map((c) => (c.textContent || "").trim())};
    x.click();
    return {ok: true, cls: String(x.className || ""), text: (x.textContent || "").trim()};
  }
  return {ok: false, why: "no row"};
}
"""

# HTML5 drag of one row onto another, top quarter meaning "before"
TG_DND = r"""
(args) => {
  const el = MX.grid.frames[args.id].el;
  const byTitle = (p) => Array.prototype.slice.call(el.querySelectorAll("[title]"))
    .filter((r) => r.title === p)[0];
  const src = byTitle(args.from), dst = byTitle(args.to);
  if (!src || !dst) return {ok: false, why: "row missing"};
  const dt = new DataTransfer();
  const rc = dst.getBoundingClientRect();
  const y = args.where === "before" ? rc.top + rc.height * 0.1
                                    : rc.bottom - rc.height * 0.1;
  const fire = (node, type, target) => {
    const ev = new DragEvent(type, {bubbles: true, cancelable: true,
      dataTransfer: dt, clientX: rc.left + rc.width / 2, clientY: y});
    (target || node).dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const started = fire(src, "dragstart");
  const over = fire(dst, "dragover");
  const dropped = fire(dst, "drop");
  fire(src, "dragend");
  return {ok: true, started: started, over_prevented: over, drop_prevented: dropped,
          draggable: !!src.draggable};
}
"""

STAGE = ".stage"
SELS = {"h1": ".stage > h1", "p": ".stage > p", "red": ".box.red",
        "blue": ".box.blue", "green": ".box.green", "gold": ".box.gold",
        "span": ".stage > span"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3F-headed-code")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    for src in (SRC_HTML, SRC_HTML2, SRC_JSON):
        if not os.path.exists(src):
            print(f"MISSING FIXTURE {src}")
            sys.exit(1)

    held = {}
    for src, dst in ((SRC_HTML, FIXTURE), (SRC_HTML2, FIXTURE2), (SRC_JSON, FIXJSON)):
        with open(src) as fh:
            held[dst] = fh.read()
        with open(dst, "w") as fh:
            fh.write(held[dst])
        CONSOLE.append(f"[harness] copied {os.path.basename(src)} -> "
                       f"{os.path.basename(dst)}, {len(held[dst])} bytes, "
                       f"sha={sha(held[dst])}")
    origs = {p: sha(open(p).read()) for p in (SRC_HTML, SRC_HTML2, SRC_JSON)}

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] cleared a stale grid file at {grid_file}")

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")

    findings = []
    ids = {}

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
        socket_live = wait_ok(p1, '() => MX.socket.state() === "live"', None, 10000,
                              "ade socket live")
        if not socket_live:
            p1.evaluate("(sid) => MX.socket.bind(sid)", sid)
            socket_live = wait_ok(p1, '() => MX.socket.state() === "live"', None, 15000,
                                  "ade socket live after rebind")
        CONSOLE.append(f"[harness] ade socket live: {socket_live} "
                       f"(state={p1.evaluate('() => MX.socket.state()')!r})")

        stale = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        if stale:
            p1.evaluate("() => { for (const f of Object.values(MX.grid.frames))"
                        " if (f._canvasState) f._canvasState.dirty = false; }")
            p1.evaluate("() => Promise.all(MX.grid.instances.map((i) => i.id)"
                        ".map((id) => MX.grid.removeWidget(id)))")
            p1.wait_for_timeout(1500)
        CONSOLE.append(f"[harness] widgets on the surface at start: {stale}")

        # ---- setup: Canvas, Targets, Tools, Code, no target yet
        a = p1.evaluate(MOUNT, {"type": "canvas"})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 8, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        p1.wait_for_timeout(800)
        g = p1.evaluate(MOUNT, {"type": "canvas_targets"})
        p1.evaluate(RESIZE, {"id": g, "col": 9, "row": 1, "w": 4, "h": 7})
        p1.wait_for_timeout(700)
        t = p1.evaluate(MOUNT, {"type": "canvas_tools"})
        p1.evaluate(RESIZE, {"id": t, "col": 9, "row": 8, "w": 4, "h": 11})
        wait_ok(p1, TOOLS_READY, t, 30000, "tools ready")
        p1.wait_for_timeout(700)
        c = p1.evaluate(MOUNT, {"type": "canvas_code"})
        p1.evaluate(RESIZE, {"id": c, "col": 13, "row": 1, "w": 6, "h": 18})
        code_up = wait_ok(p1, CODE_READY, c, 40000, "code editor ready")
        p1.wait_for_timeout(1200)
        st_pre = p1.evaluate(CV, a)
        dump0 = p1.evaluate(CODE_DUMP, c)
        CONSOLE.append(f"[harness] code widget buttons: {dump0['buttons']}")
        CONSOLE.append(f"[harness] code widget state: {dump0['state']}")
        CONSOLE.append(f"[harness] code widget markup: "
                       f"{p1.evaluate(HOST_DUMP, {'id': c, 'n': 3000})}")
        CONSOLE.append(f"[harness] targets widget markup: {p1.evaluate(TG_DUMP, g)}")
        CONSOLE.append(f"[harness] net tap: {p1.evaluate(NET_TAP)}")
        sh = shot(p1, args.out, "00-setup")
        ok0 = (bool(a) and bool(g) and bool(t) and code_up
               and st_pre["mode"] == "preview" and st_pre["targets"] == [])
        record(0, "Setup. Canvas, Targets, Tools, Code on one surface, no target.",
               ok0, sh,
               f"canvas={a} targets={g} tools={t} code={c} code_editor_ready={code_up} "
               f"canvas mode={st_pre['mode']!r} docMode={st_pre['docMode']!r} "
               f"targets={st_pre['targets']} status={st_pre['status']!r}")
        if not ok0:
            findings.append("0 — setup: see note; the walk below runs on this state")

        def kids(sel=STAGE):
            k = p1.evaluate(KIDS, {"id": a, "sel": sel})
            return ([x["id"] for x in (k["live"] or [])],
                    [x["id"] for x in (k["src"] or [])], k)

        def key(seq, ms=900):
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press(seq)
            p1.wait_for_timeout(ms)

        def click(key_name, shift=False):
            e = probe["els"][key_name]
            if shift:
                p1.keyboard.down("Shift")
            p1.mouse.click(e["x"], e["y"])
            if shift:
                p1.keyboard.up("Shift")
            p1.wait_for_timeout(500)

        def refresh():
            probe.update(p1.evaluate(PROBE, {"id": a, "sels": SELS}))
            return probe

        # ---- 1. Code follows the active tab
        p1.evaluate(STUB_PICKER, FIXTURE)
        add1 = p1.evaluate(CLICK_ADD, g)
        f1 = wait_ok(p1, FILE_READY, a, 45000, "file ready (fixture-code)")
        p1.wait_for_timeout(1500)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'canvas')",
                    {"id": a})
        p1.wait_for_timeout(900)
        guide1 = p1.evaluate(CODE_TEXT, c) or ""
        pick1 = {"tried": False}
        if len(guide1) < 200:
            # the widget opens on its blocks view; its own control is used to
            # reach the file's source, nothing is set behind its back
            pick1 = p1.evaluate(CTRL_CLICK, {"id": c, "rx": "source|file|html"})
            pick1["tried"] = True
            p1.wait_for_timeout(1200)
            # no view control on the head: the widget's ⚙ panel carries the
            # view select, blocks/doc/source, and only that select is touched
            p1.evaluate(CTRL_CLICK, {"id": c, "rx": "⚙"})
            p1.wait_for_timeout(900)
            pick1["view_select"] = p1.evaluate(
                VIEW_SET, {"id": c, "value": "source", "options": "blocks,doc,source"})
            p1.wait_for_timeout(1400)
            p1.evaluate(CTRL_CLICK, {"id": c, "rx": "^close$"})
            p1.wait_for_timeout(900)
        code1 = p1.evaluate(CODE_TEXT, c) or ""
        ids1 = len(re.findall(r'data-od-id="', code1))
        probe = p1.evaluate(PROBE, {"id": a, "sels": SELS})
        for k, v in probe["els"].items():
            ids[k] = v["odId"] if v else ""
        p1.evaluate(STUB_PICKER, FIXTURE2)
        add2 = p1.evaluate(CLICK_ADD, g)
        f2 = wait_ok(p1, FILE_READY, a, 45000, "file ready (fixture-code-2)")
        p1.wait_for_timeout(1600)
        saw2 = wait_ok(p1, CODE_HAS, {"id": c, "sub": "Fixture two"}, 6000,
                       "code shows fixture two")
        code2 = p1.evaluate(CODE_TEXT, c) or ""
        st1b = p1.evaluate(CV, a)
        p1.evaluate(TG_ROW_CLICK, {"id": g, "path": FIXTURE})
        p1.wait_for_timeout(2200)
        back1 = wait_ok(p1, CODE_HAS, {"id": c, "sub": "fixture heading"}, 8000,
                        "code shows fixture one again")
        code1b = p1.evaluate(CODE_TEXT, c) or ""
        st1c = p1.evaluate(CV, a)
        rows1 = p1.evaluate(TG_ROWS, g)
        sh = shot(p1, args.out, "01-code-follows")
        ok1 = (add1 and f1 and add2 and f2 and ids1 >= 8
               and "fixture heading" in code1 and "Fixture two" not in code1
               and saw2 and "Fixture two" in code2 and "fixture heading" not in code2
               and back1 and "fixture heading" in code1b
               and st1c["path"] == FIXTURE and len(st1c["targets"]) == 2)
        record(1, "Code follows the active tab. Add one, add two, click tab one.",
               ok1, sh,
               f"add1={add1} file1_ready={f1} add2={add2} file2_ready={f2}; "
               f"code_on_load={guide1!r} view_control_used={pick1} "
               f"code_after_the_view_change={code1[:200]!r}; "
               f"code_after_1: {len(code1)} bytes data-od-id_count={ids1} "
               f"has_fixture_one_heading={'fixture heading' in code1} "
               f"has_fixture_two={'Fixture two' in code1}; "
               f"code_after_2: {len(code2)} bytes has_fixture_two="
               f"{'Fixture two' in code2} has_one={'fixture heading' in code2} "
               f"within_6s={saw2} active={os.path.basename(st1b['path'])}; "
               f"after clicking tab one: code has one={back1} "
               f"active={os.path.basename(st1c['path'])} "
               f"targets={[os.path.basename(x) for x in st1c['targets']]} "
               f"canvas_tabs={[x['name'] for x in st1c['tabs']]} "
               f"targets_rows={[os.path.basename(r['title']) for r in rows1]}; "
               f"ids={ids}")
        if not ok1:
            findings.append("1 — code.js follow on canvas.doc / canvas.js tab switch")

        # ---- 2. Code updates on a canvas change
        refresh()
        click("red")
        click("blue", shift=True)
        sel2 = p1.evaluate(CV, a)["selection"]
        key("Meta+g", 1200)
        st2 = p1.evaluate(CV, a)
        gid2 = st2["selection"][0] if st2["selection"] else ""
        saw_grp = bool(gid2) and wait_ok(p1, CODE_HAS, {"id": c, "sub": gid2}, 2000,
                                        "code shows the group within 2s")
        code2a = p1.evaluate(CODE_TEXT, c) or ""
        l_grp, s_grp, _ = kids()
        key("Meta+z", 1200)
        p1.wait_for_timeout(900)
        code2b = p1.evaluate(CODE_TEXT, c) or ""
        l_un, s_un, _ = kids()
        sh = shot(p1, args.out, "02-code-updates")
        gone2 = bool(gid2) and gid2 not in code2b
        ok2 = (sorted(sel2) == sorted([ids["red"], ids["blue"]])
               and gid2.startswith("grp_") and saw_grp
               and 'data-od-group' in code2a and gone2
               and gid2 in l_grp and gid2 not in l_un)
        record(2, "Code updates on change. Cmd-G shows the group inside 2s, Cmd-Z "
                  "drops it.", ok2, sh,
               f"selection_before_G={sel2} group_id={gid2!r} "
               f"code_showed_group_within_2s={saw_grp} "
               f"code_has_data-od-group={'data-od-group' in code2a} "
               f"code_bytes {len(code2a)} -> {len(code2b)}; "
               f"group_gone_from_code_after_undo={gone2}; "
               f"stage live after G={l_grp} after Z={l_un}; src after Z={s_un}")
        if not ok2:
            findings.append("2 — code.js canvas.change refresh, or canvas.js group/undo")

        # ---- 3. an edit made in Code lands on the canvas
        before3 = p1.evaluate(TEXT_OF, {"id": a, "sel": ".stage > p"})
        code3 = p1.evaluate(CODE_TEXT, c) or ""
        old_p = "A paragraph of fixture text for the text edit line."
        new3 = code3.replace(old_p, "edited in code")
        unlock3 = p1.evaluate(CTRL_CLICK, {"id": c, "rx": "^locked$|unlock|edit"})
        p1.wait_for_timeout(800)
        lock3 = p1.evaluate(CODE_DUMP, c)["state"]
        commit3 = p1.evaluate(CODE_COMMIT, {"id": c, "text": new3,
                                            "rx": "apply|commit|write|^save$"})
        p1.wait_for_timeout(1200)
        if not commit3.get("ok"):
            # no commit button: the widget's own editor key is tried instead
            p1.evaluate("(id) => MX.grid.frames[id]._codeState.editor.focus()", c)
            p1.keyboard.press("Meta+s")
            p1.wait_for_timeout(1400)
            commit3["fallback"] = "Meta+s in the editor"
        live3 = wait_ok(p1, '(args) => { const cv = MX.grid.frames[args.id]._canvasState;'
                            ' const p = cv.idoc && cv.idoc.querySelector(".stage > p");'
                            ' return !!p && p.textContent.indexOf(args.sub) >= 0; }',
                        {"id": a, "sub": "edited in code"}, 8000, "iframe shows the edit")
        p1.wait_for_timeout(800)
        after3 = p1.evaluate(TEXT_OF, {"id": a, "sel": ".stage > p"})
        st3 = p1.evaluate(CV, a)
        src3 = p1.evaluate(SOURCE_TEXT, a) or ""
        sh = shot(p1, args.out, "03a-code-edit")
        key("Meta+z", 1400)
        p1.wait_for_timeout(1200)
        undo3 = p1.evaluate(TEXT_OF, {"id": a, "sel": ".stage > p"})
        src3b = p1.evaluate(SOURCE_TEXT, a) or ""
        code3b = p1.evaluate(CODE_TEXT, c) or ""
        st3b = p1.evaluate(CV, a)
        # the widget is put back the way it was found before the walk goes on
        relock3 = p1.evaluate(CTRL_CLICK, {"id": c, "rx": "^unlocked$"})
        p1.keyboard.press("Escape")
        p1.wait_for_timeout(800)
        CONSOLE.append(f"[harness] code widget re-locked: {relock3.get('ok')} "
                       f"state={p1.evaluate(CODE_DUMP, c)['state']}")
        sh = shot(p1, args.out, "03-code-edit-undo")
        ok3 = (new3 != code3 and live3
               and after3["live"] == "edited in code"
               and after3["src"] == "edited in code"
               and "edited in code" in src3 and st3["dirty"]
               and undo3["live"] == old_p and undo3["src"] == old_p
               and old_p in src3b and old_p in code3b
               and "edited in code" not in code3b)
        record(3, "An edit made in Code lands on the canvas. Cmd-Z in the canvas "
                  "puts it back.", ok3, sh,
               f"unlock_control={unlock3.get('ok')} text={unlock3.get('text')!r} "
               f"locked_after={lock3.get('locked')} view={lock3.get('view')!r}; "
               f"commit={commit3} text_changed={new3 != code3} "
               f"code_text_the_edit_was_made_in={code3[:160]!r}; "
               f"paragraph before live={before3['live']!r}; "
               f"after commit live={after3['live']!r} src={after3['src']!r} "
               f"iframe_showed_it={live3} source_has_it={'edited in code' in src3} "
               f"dirty={st3['dirty']} status={st3['status']!r}; "
               f"after Cmd-Z live={undo3['live']!r} src={undo3['src']!r} "
               f"source_has_old={old_p in src3b} code_has_old={old_p in code3b} "
               f"code_still_has_edit={'edited in code' in code3b} "
               f"dirty={st3b['dirty']} status={st3b['status']!r}")
        if not ok3:
            findings.append("3 — code.js apply / canvas.js set-full-source and its inverse")

        # ---- 4. Targets removes the active row
        # tab one is dirty from line 3; saved first so the × never meets a
        # save prompt and line 6 starts on a clean tab, per P7
        key("Meta+s", 1200)
        pre4_saved = wait_ok(p1, STATUS_SAVED, a, 8000, "tab one saved before line 4")
        CONSOLE.append(f"[harness] saved tab one before line 4: {pre4_saved}")
        st4a = p1.evaluate(CV, a)
        if FIXTURE2 not in st4a["targets"]:
            p1.evaluate(STUB_PICKER, FIXTURE2)
            p1.evaluate(CLICK_ADD, g)
            wait_ok(p1, FILE_READY, a, 45000, "file ready (re-added two)")
            p1.wait_for_timeout(1500)
            p1.evaluate(TG_ROW_CLICK, {"id": g, "path": FIXTURE})
            p1.wait_for_timeout(2000)
        st4b = p1.evaluate(CV, a)
        active4 = st4b["path"]
        x4 = p1.evaluate(TG_ROW_X, {"id": g, "path": active4})
        p1.wait_for_timeout(2200)
        st4c = p1.evaluate(CV, a)
        rows4 = p1.evaluate(TG_ROWS, g)
        key("Meta+z", 1000)
        st4d = p1.evaluate(CV, a)
        p1.evaluate(STUB_PICKER, active4)
        add4 = p1.evaluate(CLICK_ADD, g)
        wait_ok(p1, FILE_READY, a, 45000, "file ready (re-add removed tab)")
        p1.wait_for_timeout(1800)
        st4e = p1.evaluate(CV, a)
        rows4b = p1.evaluate(TG_ROWS, g)
        sh = shot(p1, args.out, "04-targets-remove")
        ok4 = (x4.get("ok") and len(st4c["targets"]) == 1
               and active4 not in st4c["targets"]
               and st4c["path"] != active4 and st4c["path"] in st4c["targets"]
               and len(rows4) == 1
               and add4 and st4e["targets"][-1] == active4
               and st4e["path"] == active4 and len(st4e["targets"]) == 2)
        record(4, "Targets × removes the active row. + Add appends it back and "
                  "activates it.", ok4, sh,
               f"canvas_saved_before_this_line={pre4_saved}; "
               f"targets_before={[os.path.basename(x) for x in st4b['targets']]} "
               f"active_before={os.path.basename(active4)}; x_button={x4}; "
               f"after_x targets={[os.path.basename(x) for x in st4c['targets']]} "
               f"active={os.path.basename(st4c['path'])} "
               f"rows={[os.path.basename(r['title']) for r in rows4]} "
               f"canvas_tabs={[x['name'] for x in st4c['tabs']]}; "
               f"after Cmd-Z targets={[os.path.basename(x) for x in st4d['targets']]} "
               f"(not expected to come back); "
               f"after re-add targets={[os.path.basename(x) for x in st4e['targets']]} "
               f"active={os.path.basename(st4e['path'])} "
               f"rows={[os.path.basename(r['title']) for r in rows4b]}")
        if not ok4:
            findings.append("4 — targets.js row × / + Add, canvas.js targets option")

        # ---- 5. Targets reorder by drag
        st5a = p1.evaluate(CV, a)
        one, two = st5a["targets"][0], st5a["targets"][1]
        active5 = st5a["path"]
        dnd5 = p1.evaluate(TG_DND, {"id": g, "from": two, "to": one, "where": "before"})
        p1.wait_for_timeout(1600)
        st5b = p1.evaluate(CV, a)
        rows5 = p1.evaluate(TG_ROWS, g)
        sh = shot(p1, args.out, "05-targets-reorder")
        flipped = st5b["targets"] == [two, one]
        tabs5 = [x["path"] for x in st5b["tabs"]]
        ok5 = (dnd5.get("ok") and flipped and tabs5 == [two, one]
               and [r["title"] for r in rows5] == [two, one]
               and st5b["path"] == active5)
        record(5, "Targets reorder. Row two above row one flips the order; the "
                  "active tab holds.", ok5, sh,
               f"drag={dnd5}; before={[os.path.basename(x) for x in st5a['targets']]} "
               f"after={[os.path.basename(x) for x in st5b['targets']]} flipped={flipped}; "
               f"canvas_tab_row={[os.path.basename(x) for x in tabs5]}; "
               f"targets_rows={[os.path.basename(r['title']) for r in rows5]}; "
               f"active before={os.path.basename(active5)} "
               f"after={os.path.basename(st5b['path'])} "
               f"held={st5b['path'] == active5}")
        if not ok5:
            findings.append("5 — targets.js drag reorder / canvas.js targets order")

        def switch(path, kind="file", label=""):
            # tab switch through the Targets row, then wait for the load
            p1.evaluate(TG_ROW_CLICK, {"id": g, "path": path})
            p1.wait_for_timeout(700)
            ok = wait_ok(p1, DOC_READY if kind == "doc" else FILE_READY, a, 30000,
                         label or f"switch to {os.path.basename(path)}")
            p1.wait_for_timeout(1600)
            return ok

        # ---- 6. tab cache, P7 clean reopen
        st6a = p1.evaluate(CV, a)
        one6 = st6a["targets"][0]
        two6 = st6a["targets"][1]
        if st6a["path"] != one6:
            switch(one6)
        clean6 = not p1.evaluate(CV, a)["dirty"]
        if not clean6:
            key("Meta+s", 1200)
            wait_ok(p1, STATUS_SAVED, a, 8000, "tab one clean for line 6")
            clean6 = not p1.evaluate(CV, a)["dirty"]
        refresh()
        click("red")
        click("blue", shift=True)
        sel6 = p1.evaluate(CV, a)["selection"]
        mark6 = len(REQS)
        p1.evaluate(NET_TAKE)
        switch(two6)
        st6b = p1.evaluate(CV, a)
        net6a = p1.evaluate(NET_TAKE)
        switch(one6)
        st6c = p1.evaluate(CV, a)
        net6 = net6a + p1.evaluate(NET_TAKE)
        hits6 = ([u for u in net6 if "fixture-code.html" in u]
                 + reqs_since(mark6, "fixture-code.html"))
        sel6b = st6c["selection"]
        refresh()
        key("Meta+g", 1200)
        st6d = p1.evaluate(CV, a)
        gid6 = st6d["selection"][0] if st6d["selection"] else ""
        l6g, s6g, _ = kids()
        key("Meta+z", 1200)
        l6z, s6z, _ = kids()
        sh = shot(p1, args.out, "06-clean-reopen")
        ok6 = (clean6 and len(sel6) == 2 and sorted(sel6b) == sorted(sel6)
               and len(hits6) >= 1 and st6c["path"] == one6
               and gid6.startswith("grp_") and gid6 in l6g and gid6 in s6g
               and gid6 not in l6z and gid6 not in s6z
               and l6z == s6z)
        record(6, "Tab cache, clean reopen. Re-requested from the server, selection "
                  "restored, Cmd-G and Cmd-Z still work.", ok6, sh,
               f"tab_one_clean_before_switch={clean6} selection_before={sel6}; "
               f"server hits carrying 'fixture-code.html' across the two switches="
               f"{[u.split('/')[-1][:80] for u in hits6]} count={len(hits6)}; "
               f"all http in that window={[u.split('/api/')[-1][:70] for u in REQS[mark6:]][:12]}; "
               f"all fetch/xhr/socket in that window={[u[:110] for u in net6][:12]}; "
               f"selection_after_switch_back={sel6b} restored="
               f"{sorted(sel6b) == sorted(sel6)}; "
               f"active={os.path.basename(st6c['path'])} dirty={st6c['dirty']} "
               f"cached_tabs={[os.path.basename(x) for x in st6c['cached']]}; "
               f"tab two docMode={st6b['docMode']!r}; "
               f"Cmd-G group={gid6!r} live={l6g}; Cmd-Z live={l6z} src={s6z}")
        if not ok6:
            findings.append("6 — canvas.js loadTarget reopen / stash of selection")

        # ---- 7. tab cache, P7 history across a switch and a disk change
        refresh()
        click("red")
        click("blue", shift=True)
        key("Meta+g", 1200)
        st7a = p1.evaluate(CV, a)
        gid7 = st7a["selection"][0] if st7a["selection"] else ""
        key("Meta+z", 1200)
        st7b = p1.evaluate(CV, a)
        l7z, s7z, _ = kids()
        switch(two6)
        switch(one6)
        st7c = p1.evaluate(CV, a)
        key("Meta+Shift+z", 1400)
        l7r, s7r, _ = kids()
        st7d = p1.evaluate(CV, a)
        redone = bool(gid7) and gid7 in l7r and gid7 in s7r
        sh = shot(p1, args.out, "07a-history-survives")
        key("Meta+z", 1400)
        l7u, s7u, _ = kids()
        # clean the tab so the reopen comes from the server, then change the
        # file underneath it
        key("Meta+s", 1400)
        saved7 = wait_ok(p1, STATUS_SAVED, a, 8000, "tab one saved before the disk edit")
        p1.wait_for_timeout(1000)
        with open(FIXTURE) as fh:
            disk7 = fh.read()
        disk7b = disk7.replace("Phase 3F fixture heading",
                               "Phase 3F fixture heading changed on disk")
        with open(FIXTURE, "w") as fh:
            fh.write(disk7b)
        CONSOLE.append(f"[harness] edited {os.path.basename(FIXTURE)} on disk: "
                       f"{len(disk7)} -> {len(disk7b)} bytes, "
                       f"h1 text changed, differs={disk7 != disk7b}")
        switch(two6)
        switch(one6)
        st7e = p1.evaluate(CV, a)
        text7 = p1.evaluate(SOURCE_TEXT, a) or ""
        key("Meta+Shift+z", 1400)
        l7f, s7f, _ = kids()
        st7f = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "07-history-dropped")
        dropped = bool(gid7) and gid7 not in l7f and gid7 not in s7f
        ok7 = (bool(gid7) and st7b["canRedo"] and redone and l7u == s7u
               and gid7 not in l7u and saved7
               and "changed on disk" in text7
               and st7e["canRedo"] is False and dropped)
        record(7, "Tab cache, history. Redo survives a switch; it drops when the "
                  "file changed underneath.", ok7, sh,
               f"group={gid7!r} after Cmd-Z canUndo={st7b['canUndo']} "
               f"canRedo={st7b['canRedo']} live={l7z}; "
               f"after switch away and back canUndo={st7c['canUndo']} "
               f"canRedo={st7c['canRedo']} dirty={st7c['dirty']}; "
               f"Shift-Cmd-Z redid the group={redone} live={l7r} "
               f"canRedo_now={st7d['canRedo']}; then Cmd-Z live={l7u}; "
               f"saved_before_disk_edit={saved7}; "
               f"after the disk edit and a switch: source carries the disk text="
               f"{'changed on disk' in text7} canUndo={st7e['canUndo']} "
               f"canRedo={st7e['canRedo']} (want False) "
               f"cached={[os.path.basename(x) for x in st7e['cached']]}; "
               f"Shift-Cmd-Z after that: live={l7f} group_absent={dropped} "
               f"canRedo={st7f['canRedo']}")
        if not ok7:
            findings.append("7 — canvas.js tab cache history keep/drop on reopen")

        # ---- 8. mixed tabs, .json beside .html
        mark8 = len(CONSOLE)
        p1.evaluate(STUB_PICKER, FIXJSON)
        add8 = p1.evaluate(CLICK_ADD, g)
        doc8 = wait_ok(p1, DOC_READY, a, 45000, "doc mode after adding the json")
        p1.wait_for_timeout(2000)
        st8a = p1.evaluate(CV, a)
        tabs8 = p1.evaluate(TL_TABS, t)
        ts8 = p1.evaluate(TOOLS_STATE, t)
        lib_on = [x for x in tabs8 if x["name"] == "library" and x["shown"]]
        pg_on = [x for x in tabs8 if x["name"] == "pages" and x["shown"]]
        p1.evaluate(TL_TAB_CLICK, {"id": t, "name": "library"})
        p1.wait_for_timeout(900)
        tabs8b = p1.evaluate(TL_TABS, t)
        sec8 = [x["name"] for x in tabs8b if x["on"]]
        sh = shot(p1, args.out, "08a-doc-tab")
        back8 = switch(one6, "file", "back to the html tab")
        st8b = p1.evaluate(CV, a)
        tabs8c = p1.evaluate(TL_TABS, t)
        lib_off = [x for x in tabs8c if x["name"] == "library" and x["shown"]]
        pg_off = [x for x in tabs8c if x["name"] == "pages" and x["shown"]]
        sec8b = [x["name"] for x in tabs8c if x["on"]]
        new8 = [c for c in CONSOLE[mark8:]
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c]
        sh = shot(p1, args.out, "08-mixed-tabs")
        ok8 = (add8 and doc8 and len(st8a["targets"]) == 3
               and st8a["docMode"] == "doc" and bool(lib_on) and bool(pg_on)
               and back8 and st8b["docMode"] == "file"
               and not lib_off and not pg_off
               and sec8 == ["library"] and sec8b == ["tools"]
               and not new8)
        record(8, "Mixed tabs. The json opens in doc mode with library and pages; "
                  "the html tab hides them and falls back to tools.", ok8, sh,
               f"added={add8} doc_mode_reached={doc8} "
               f"targets={[os.path.basename(x) for x in st8a['targets']]} "
               f"docMode={st8a['docMode']!r} "
               f"canvas_tabs={[x['name'] for x in st8a['tabs']]}; "
               f"tools tabs on the json={tabs8} tools state on the json={ts8} "
               f"library_shown={bool(lib_on)} pages_shown={bool(pg_on)}; "
               f"section after clicking library={sec8}; "
               f"back on the html tab docMode={st8b['docMode']!r} "
               f"tools tabs={tabs8c} "
               f"library_shown={bool(lib_off)} pages_shown={bool(pg_off)} "
               f"section_now={sec8b}; "
               f"console across both switches={new8 or 'clean'}")
        if not ok8:
            findings.append("8 — tools.js doc/file section fallback, canvas.js doc tab")

        # ---- 9. ungroup refused on markup the port did not make
        p1.evaluate(TL_TAB_CLICK, {"id": t, "name": "layers"})
        p1.wait_for_timeout(900)
        stage9 = p1.evaluate(PROBE, {"id": a, "sels": {"stage": STAGE}})
        gid9 = (stage9["els"]["stage"] or {}).get("odId", "")
        picked9 = p1.evaluate(TL_ROW_CLICK, {"id": t, "gid": gid9}) if gid9 else False
        p1.wait_for_timeout(800)
        sel9 = p1.evaluate(CV, a)["selection"]
        src9 = p1.evaluate(SOURCE_TEXT, a) or ""
        l9, s9, _ = kids()
        body9 = p1.evaluate(CV, a)["bodyKids"]
        mark9 = len(CONSOLE)
        key("Meta+Shift+g", 1400)
        src9b = p1.evaluate(SOURCE_TEXT, a) or ""
        l9b, s9b, _ = kids()
        st9 = p1.evaluate(CV, a)
        warn9 = [c for c in CONSOLE[mark9:]
                 if ":console:warning]" in c or ":console:error]" in c
                 or ":console:log]" in c or ":pageerror]" in c]
        sh = shot(p1, args.out, "09-ungroup-refused")
        ok9 = (bool(gid9) and picked9 and sel9 == [gid9]
               and src9 == src9b and l9 == l9b and s9 == s9b
               and st9["bodyKids"] == body9 and len(warn9) >= 1)
        record(9, "Ungroup refused on the stage div. Nothing changes and the console "
                  "says so.", ok9, sh,
               f"stage_id={gid9!r} selected_from_layers_row={picked9} selection={sel9}; "
               f"source bytes {len(src9)} -> {len(src9b)} unchanged={src9 == src9b}; "
               f"stage children live {l9} -> {l9b} unchanged={l9 == l9b}; "
               f"src {s9} -> {s9b} unchanged={s9 == s9b}; "
               f"body children {body9} -> {st9['bodyKids']}; "
               f"console lines from the refusal={warn9 or '(none)'}")
        if not ok9:
            findings.append("9 — canvas.js ungroup guard / patch.js unwrap refusal (P6)")

        # ---- 10. save, reload
        src_before = p1.evaluate(SOURCE_TEXT, a)
        key("Meta+s", 1400)
        saved10 = wait_ok(p1, STATUS_SAVED, a, 8000, "status reads saved")
        p1.wait_for_timeout(1400)
        with open(FIXTURE) as fh:
            disk10 = fh.read()
        src10 = p1.evaluate(SOURCE_TEXT, a) or ""
        ids10 = len(re.findall(r'data-od-id="', disk10))
        p1.evaluate("() => MX.grid.save()")
        p1.wait_for_timeout(1400)
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        mark10 = len(CONSOLE)
        p1.reload(wait_until="load", timeout=30000)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=20000)
        wait_ok(p1, CANVAS_MOUNTED, a, 30000, "canvas mounted after reload")
        ready10 = wait_ok(p1, FILE_READY, a, 45000, "file ready after reload")
        p1.wait_for_timeout(2800)
        st10 = p1.evaluate(CV, a)
        after10 = [c for c in CONSOLE[mark10:]
                   if ":console:error]" in c or ":pageerror]" in c
                   or ":console:warning]" in c]
        sh = shot(p1, args.out, "10-save-reload")
        ok10 = (saved10 and disk10 == src10 and ids10 >= 8 and ready10
                and len(st10["targets"]) == 3 and st10["mode"] == "preview"
                and st10["path"] == FIXTURE and not after10)
        record(10, "Cmd-S writes the html tab. Reload brings three tabs back in "
                   "preview, console clean.", ok10, sh,
               f"status_reached_saved={saved10} disk_bytes={len(disk10)} "
               f"source_bytes={len(src10)} disk_equals_source={disk10 == src10} "
               f"data-od-id_on_disk={ids10} "
               f"source_changed_by_save={src_before != src10}; "
               f"after reload mode={st10['mode']!r} docMode={st10['docMode']!r} "
               f"active={os.path.basename(st10['path'])} "
               f"targets={[os.path.basename(x) for x in st10['targets']]} "
               f"canvas_tabs={[x['name'] for x in st10['tabs']]} "
               f"body_children={st10['bodyKids']} status={st10['status']!r} "
               f"file_ready={ready10}; "
               f"console since the reload={after10 or 'clean'}")
        if not ok10:
            findings.append("10 — canvas.js doSave / options round-trip on reload")

        # ---- console, the whole run
        errs = [(i, c) for i, c in enumerate(CONSOLE)
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c]
        CONSOLE.append(f"[harness] console error or warning lines, whole run: "
                       f"{len(errs)} of {len(CONSOLE)}")
        for i, c in errs:
            CONSOLE.append(f"[harness] flagged: {c}")

        if args.hold:
            time.sleep(args.hold)

        # teardown: every widget this run made comes back down
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.evaluate("(ws) => Promise.all(ws.map((w) => MX.grid.removeWidget(w)))",
                    [a, g, t, c])
        p1.wait_for_timeout(1500)
        left = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        CONSOLE.append(f"[harness] widgets left on the surface: {left}")
        browser.close()

    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] removed {grid_file}")

    restored = {}
    for dst in (FIXTURE, FIXTURE2, FIXJSON):
        with open(dst) as fh:
            ran = fh.read()
        with open(dst, "w") as fh:
            fh.write(held[dst])
        restored[os.path.basename(dst)] = {
            "run_left_bytes": len(ran), "wrote_back_bytes": len(held[dst]),
            "changed_by_run": sha(ran) != sha(held[dst])}
    untouched = {os.path.basename(p): sha(open(p).read()) == origs[p]
                 for p in (SRC_HTML, SRC_HTML2, SRC_JSON)}
    CONSOLE.append(f"[harness] copies restored: {restored}")
    CONSOLE.append(f"[harness] originals untouched: {untouched}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump({"results": RESULTS, "findings": findings,
                   "fixtures_restored": restored, "originals_untouched": untouched,
                   "ids": ids, "surface_left": left}, fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
    print(f"\nfixtures restored: {restored}")
    print(f"originals untouched: {untouched}")
    print(f"findings: {findings}")
    sys.exit(0)


if __name__ == "__main__":
    main()
