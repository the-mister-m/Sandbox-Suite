"""Headed Playwright walk for Phase 3F job H5 — pointer drag and the close prompt.

Copied from Docs/tests/phase3F_headed_keys.py: same launch, console capture,
record/shot pair per line, fixture hold and restore, teardown. The walk body
below is this job's, the scaffolding above it is the keys harness verbatim.

Fixtures, own copies, made at start and restored at teardown:
    Docs/scratchpad/phase3F-fixture-drag.html    (from phase3F-fixture.html)
    Docs/scratchpad/phase3F-fixture-drag-2.html  (from phase3F-fixture-2.html)

Stage children of fixture one, in order: h1, p, red, blue, green, gold, span.

Usage:
    python3 Docs/tests/phase3F_headed_drag.py --session <sid> \
        --out Docs/Reports/phase3F-headed-drag/

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
ORIG = os.path.join(SCRATCH, "phase3F-fixture.html")
ORIG2 = os.path.join(SCRATCH, "phase3F-fixture-2.html")
FIXTURE = os.path.join(SCRATCH, "phase3F-fixture-drag.html")
FIXTURE2 = os.path.join(SCRATCH, "phase3F-fixture-drag-2.html")

RESULTS = []
CONSOLE = []
PAGEERRORS = []


def record(num, name, passed, shot, note=""):
    # console_at: console lines seen when this line closed, for placing errors
    RESULTS.append({"n": num, "name": name, "pass": bool(passed),
                    "shot": os.path.basename(shot or ""), "note": note,
                    "console_at": len(CONSOLE)})
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
  const held = {};
  for (const k of Object.keys(cv.tabs || {})) held[k] = !!cv.tabs[k].dirty;
  return {
    mode: cv.mode, docMode: cv.docMode, path: cv.path,
    targets: cv.targets.slice(), selection: cv.selection.slice(),
    dirty: !!cv.dirty, status: cv.statusEl ? cv.statusEl.textContent : "",
    tabs: tabs, tabsHidden: cv.targetsEl ? !!cv.targetsEl.hidden : null,
    cached: Object.keys(cv.tabs), cachedDirty: held,
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

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"

HISTORY = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return cv.history ? {canUndo: cv.history.canUndo(), canRedo: cv.history.canRedo()} : null;
}
"""

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
      docRect: {left: r.left, top: r.top, right: r.right, bottom: r.bottom},
      x: host.x + cx, y: host.y + cy,
      hit: doc.elementFromPoint(cx, cy) === el,
      hitTag: doc.elementFromPoint(cx, cy)
        ? doc.elementFromPoint(cx, cy).tagName.toLowerCase() : "(none)"
    };
  }
  return out;
}
"""

# a doc-coordinate point mapped into the host page, with what sits under it
GROUND = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const el = doc.elementFromPoint(args.x, args.y);
  return {x: host.x + args.x, y: host.y + args.y,
          tag: el ? el.tagName.toLowerCase() : "(none)",
          cls: el ? String(el.className || "") : ""};
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

# one element by id, out of the live document and out of the held source
ELEM = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  let src = null;
  try { src = cv.patch.parse(f._canvas.source()); } catch (e) { src = null; }
  const skip = cv.patch.HOST_NODE_SELECTOR;
  const one = (doc) => {
    const el = doc ? cv.patch.find(doc, args.gid) : null;
    if (!el || !el.parentElement) return null;
    const sibs = Array.prototype.filter.call(el.parentElement.children,
      (c) => !c.matches(skip));
    const i = sibs.indexOf(el), n = sibs[i + 1] || null;
    const cs = el.ownerDocument.defaultView
      ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
    return {slot: i, count: sibs.length, tag: el.tagName.toLowerCase(),
            left: el.style.left, top: el.style.top,
            tf: el.style.transform || "",
            tfComputed: cs ? cs.transform : "",
            text: (el.textContent || "").trim(),
            outer: el.outerHTML,
            nextId: n ? (n.getAttribute("data-od-id") || "") : null,
            next: n ? n.outerHTML : null};
  };
  return {live: one(cv.idoc), src: one(src)};
}
"""

# bus tap: every canvas.select the walk causes
BUS_TAP = r"""
() => {
  window.__sel = [];
  MX.bus.on("canvas.select", (msg) => {
    try { window.__sel.push(JSON.parse(JSON.stringify(msg || {}))); }
    catch (e) { window.__sel.push({unserializable: String(e)}); }
  });
  return true;
}
"""

BUS_TAKE = "() => { const out = window.__sel || []; window.__sel = []; return out; }"

# keydown tap inside the iframe: what the document actually saw
KEY_TAP = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const d = cv.idoc;
  if (d.__tap) { window.__keys = []; return "already"; }
  d.__tap = true;
  window.__keys = [];
  const log = (phase) => (e) => window.__keys.push(
    {phase: phase, key: e.key, code: e.code, meta: e.metaKey, shift: e.shiftKey,
     prevented: e.defaultPrevented,
     target: (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ""});
  d.addEventListener("keydown", log("capture"), true);
  d.addEventListener("keydown", log("bubble"), false);
  return "installed";
}
"""

KEY_TAKE = "() => { const k = window.__keys || []; window.__keys = []; return k; }"

# text-edit session plus where the caret and focus actually are
TEXT_EDIT = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const d = cv.idoc, ae = d.activeElement;
  const sel = d.getSelection ? d.getSelection() : null;
  return {
    session: cv.textEdit ? (cv.textEdit.id || String(cv.textEdit)) : null,
    docHasFocus: d.hasFocus ? d.hasFocus() : null,
    active: ae ? ae.tagName.toLowerCase() : "(none)",
    activeEditable: ae ? String(ae.isContentEditable) : "",
    activeOdId: ae ? (ae.getAttribute("data-od-id") || "") : "",
    ranges: sel ? sel.rangeCount : -1,
    anchor: sel && sel.anchorNode
      ? (sel.anchorNode.nodeName + "@" + sel.anchorOffset) : "(none)"
  };
}
"""

# caret to the end of the edited element, without leaving the iframe
CARET_END = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const d = cv.idoc, ae = d.activeElement;
  if (!ae || !ae.isContentEditable) return "not editable";
  ae.focus();
  const r = d.createRange();
  r.selectNodeContents(ae);
  r.collapse(false);
  const s = d.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  return "caret at end of " + ae.tagName.toLowerCase();
}
"""

# canvas-bar tab switch, by the tab's title (the full path)
TAB_SWITCH = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  if (!cv.targetsEl) return "no tab strip";
  const tabs = Array.prototype.slice.call(cv.targetsEl.querySelectorAll(".mxcv-tab"));
  const hit = tabs.filter((t) => t.title === args.path)[0];
  if (!hit) return "no tab for " + args.path;
  hit.click();
  return true;
}
"""

# send tap: every frame the canvas widget puts on the wire
SEND_TAP = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f) return false;
  window.__sent = [];
  if (f.__sendTap) return "already";
  f.__sendTap = true;
  const orig = f.send.bind(f);
  f.send = function (msg) {
    try {
      window.__sent.push({type: msg && msg.type, path: msg && msg.path,
                          bytes: msg && msg.content ? msg.content.length : 0,
                          hasPlus: !!(msg && msg.content
                                      && msg.content.indexOf(" plus") >= 0),
                          hasTf: !!(msg && msg.content
                                    && msg.content.indexOf("translate(") >= 0)});
    } catch (e) { /* tap best effort */ }
    return orig(msg);
  };
  return "installed";
}
"""

SEND_TAKE = "() => { const s = window.__sent || []; window.__sent = []; return s; }"

MODAL_DUMP = r"""
() => {
  const w = document.querySelector(".mx-overlay");
  if (!w) return null;
  const h = w.querySelector("h3");
  const d = w.querySelector(".mx-dim");
  return {title: h ? h.textContent : "", message: d ? d.textContent : "",
          buttons: Array.prototype.map.call(
            w.querySelectorAll(".mx-actions button"), (b) => b.textContent)};
}
"""

MODAL_CLICK = r"""
(label) => {
  const btns = Array.prototype.slice.call(
    document.querySelectorAll(".mx-overlay .mx-actions button"));
  const hit = btns.filter((b) => b.textContent === label)[0];
  if (!hit) return false;
  hit.click();
  return true;
}
"""

CLOSE_FIRE = r"""
(id) => {
  window.__closed = "pending";
  MX.grid.removeWidget(id).then((ok) => { window.__closed = ok; },
                               (e) => { window.__closed = "threw: " + e; });
  return true;
}
"""


def keyline(log):
    # one short line per keydown the iframe document saw
    return "; ".join(f"{e['phase']}:{e['key']!r} code={e['code']} meta={e['meta']} "
                     f"shift={e['shift']} prevented={e['prevented']}" for e in log) or "(none)"


def tf_xy(e, which):
    # translate pair out of an inline transform; None when there is no transform
    v = e[which]
    if not v:
        return "missing"
    s = (v.get("tf") or "").strip()
    if not s or s == "none":
        return None
    m = re.search(r"translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px", s)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    m = re.search(r"translate(?:X)?\(\s*(-?[\d.]+)px\s*\)", s)
    if m:
        return (float(m.group(1)), 0.0)
    m = re.search(r"translateY\(\s*(-?[\d.]+)px\s*\)", s)
    if m:
        return (0.0, float(m.group(1)))
    m = re.search(r"matrix\((?:\s*-?[\d.]+\s*,){4}\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)", s)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    return s


STAGE = ".stage"
SELS = {"h1": ".stage > h1", "p": ".stage > p", "red": ".box.red",
        "blue": ".box.blue", "green": ".box.green", "gold": ".box.gold",
        "span": ".stage > span"}
SELS2 = {"tile1": ".stage > .tile", "h2": ".stage > h2"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3F-headed-drag")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    for src in (ORIG, ORIG2):
        if not os.path.exists(src):
            print(f"MISSING SOURCE FIXTURE {src}")
            sys.exit(1)

    # own copies, made here, restored at teardown; the originals are never touched
    with open(ORIG) as fh:
        held = fh.read()
    with open(ORIG2) as fh:
        held2 = fh.read()
    with open(FIXTURE, "w") as fh:
        fh.write(held)
    with open(FIXTURE2, "w") as fh:
        fh.write(held2)
    CONSOLE.append(f"[harness] copied {os.path.basename(ORIG)} -> "
                   f"{os.path.basename(FIXTURE)} ({len(held)} bytes) and "
                   f"{os.path.basename(ORIG2)} -> {os.path.basename(FIXTURE2)} "
                   f"({len(held2)} bytes)")

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

        # ---- setup: Canvas, Targets, the drag fixture copy, Tools, canvas mode
        a = p1.evaluate(MOUNT, {"type": "canvas"})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 13, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        p1.wait_for_timeout(800)
        g = p1.evaluate(MOUNT, {"type": "canvas_targets"})
        p1.evaluate(RESIZE, {"id": g, "col": 14, "row": 1, "w": 4, "h": 8})
        p1.wait_for_timeout(900)
        p1.evaluate(STUB_PICKER, FIXTURE)
        added = p1.evaluate(CLICK_ADD, g)
        loaded = wait_ok(p1, FILE_READY, a, 45000, "file ready (drag fixture)")
        p1.wait_for_timeout(1500)
        t = p1.evaluate(MOUNT, {"type": "canvas_tools"})
        p1.evaluate(RESIZE, {"id": t, "col": 14, "row": 9, "w": 4, "h": 10})
        wait_ok(p1, TOOLS_READY, t, 30000, "tools ready")
        p1.wait_for_timeout(1000)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'canvas')",
                    {"id": a})
        p1.wait_for_timeout(900)
        p1.evaluate(BUS_TAP)
        CONSOLE.append(f"[harness] iframe keydown tap: {p1.evaluate(KEY_TAP, a)}")

        probe = p1.evaluate(PROBE, {"id": a, "sels": SELS})
        for k, v in probe["els"].items():
            ids[k] = v["odId"] if v else ""
        base = p1.evaluate(KIDS, {"id": a, "sel": STAGE})
        st0 = p1.evaluate(CV, a)
        src0 = p1.evaluate(SOURCE_TEXT, a)
        sh = shot(p1, args.out, "00-setup")
        missing = [k for k, v in probe["els"].items() if not v or not v["hit"]]
        ok0 = (added and loaded and st0["mode"] == "canvas"
               and st0["docMode"] == "file" and not missing
               and [x["tag"] for x in (base["live"] or [])]
                   == ["h1", "p", "div", "div", "div", "div", "span"]
               and base["live"] == base["src"])
        record(0, "Setup. Canvas plus Tools plus Targets, drag fixture copy, canvas mode.",
               ok0, sh,
               f"add_clicked={added} file_ready={loaded} mode={st0['mode']!r} "
               f"docMode={st0['docMode']!r} iframe_viewport={probe['vw']}x{probe['vh']} "
               f"stage_live={[x['tag'] for x in (base['live'] or [])]} "
               f"stage_src={[x['tag'] for x in (base['src'] or [])]} "
               f"live_eq_src={base['live'] == base['src']} "
               f"not_hit_testable={missing} ids={ids}")
        if not ok0:
            findings.append("0 — setup: see note; the walk below runs on this state")

        want0 = [ids[k] for k in ("h1", "p", "red", "blue", "green", "gold", "span")]

        def refresh(sels=None):
            # click points are re-measured before each line
            probe.update(p1.evaluate(PROBE, {"id": a, "sels": sels or SELS}))
            return probe

        def drain():
            # wind history back to the load state so each line starts clean
            n = 0
            while n < 14 and p1.evaluate(HISTORY, a)["canUndo"]:
                p1.evaluate(FOCUS_IFRAME, a)
                p1.keyboard.press("Meta+z")
                p1.wait_for_timeout(600)
                n += 1
            return n

        def reset():
            # clear selection, wind history back, finish any half-open pointer state
            drained = drain()
            CONSOLE.append(f"[harness] reset drained {drained} history entries")
            p1.keyboard.press("Escape")
            p1.wait_for_timeout(300)
            gp = p1.evaluate(GROUND, {"id": a, "x": 6, "y": 400})
            p1.mouse.click(gp["x"], gp["y"])
            p1.wait_for_timeout(300)
            p1.keyboard.press("Escape")
            p1.wait_for_timeout(300)
            refresh()

        retries = {"n": 0}

        def click(key, shift=False):
            # click, then read selection; one retry, counted and reported
            e = probe["els"][key]
            for attempt in (1, 2):
                if shift:
                    p1.keyboard.down("Shift")
                p1.mouse.click(e["x"], e["y"])
                if shift:
                    p1.keyboard.up("Shift")
                p1.wait_for_timeout(500)
                if ids[key] in p1.evaluate(CV, a)["selection"] or attempt == 2:
                    return
                retries["n"] += 1

        def press_drag(key, dx, dy, steps=12, hold=250):
            # press on the element, move in steps, release; page coordinates
            e = probe["els"][key]
            p1.mouse.move(e["x"], e["y"])
            p1.mouse.down()
            p1.wait_for_timeout(hold)
            p1.mouse.move(e["x"] + dx / 3, e["y"] + dy / 3, steps=steps)
            p1.mouse.move(e["x"] + dx, e["y"] + dy, steps=steps)
            p1.wait_for_timeout(hold)
            p1.mouse.up()
            p1.wait_for_timeout(700)

        def key(seq, ms=900):
            p1.evaluate(KEY_TAP, a)
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press(seq)
            p1.wait_for_timeout(ms)
            return p1.evaluate(KEY_TAKE)

        def elem(gid):
            return p1.evaluate(ELEM, {"id": a, "gid": gid})

        # ---- 1. drag one
        reset()
        p1.evaluate(BUS_TAKE)
        r_before = elem(ids["red"])
        press_drag("red", 100, 50)
        st1 = p1.evaluate(CV, a)
        r_after = elem(ids["red"])
        ev1 = p1.evaluate(BUS_TAKE)
        sh = shot(p1, args.out, "01-drag-one")
        ok1 = (tf_xy(r_after, "live") == (100.0, 50.0)
               and tf_xy(r_after, "src") == (100.0, 50.0)
               and st1["dirty"] and st1["status"] == "dirty"
               and st1["selection"] == [ids["red"]])
        record(1, "Drag one. Press on red, 100 right and 50 down, release.", ok1, sh,
               f"start transform live={tf_xy(r_before, 'live')} src={tf_xy(r_before, 'src')} "
               f"left/top={(r_before['live'] or {}).get('left')!r}/"
               f"{(r_before['live'] or {}).get('top')!r}; "
               f"after transform live={tf_xy(r_after, 'live')} src={tf_xy(r_after, 'src')} "
               f"want (100.0,50.0); left/top={(r_after['live'] or {}).get('left')!r}/"
               f"{(r_after['live'] or {}).get('top')!r}; "
               f"raw inline={(r_after['live'] or {}).get('tf')!r}; "
               f"dirty={st1['dirty']} status={st1['status']!r} "
               f"selection={st1['selection']} want=[{ids['red']!r}]; "
               f"canvas.select events={ev1}")
        if not ok1:
            findings.append("1 — canvas.js pointer drag: transform, dirty, or selection")

        # ---- 2. undo one
        hist2 = p1.evaluate(HISTORY, a)
        log2 = key("Meta+z", 1000)
        r_un = elem(ids["red"])
        st2 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "02-undo-one")
        ok2 = tf_xy(r_un, "live") is None and tf_xy(r_un, "src") is None
        record(2, "Undo one. Cmd-Z clears the transform in live and source.", ok2, sh,
               f"history_before={hist2} keydown[{keyline(log2)}] "
               f"after transform live={tf_xy(r_un, 'live')} src={tf_xy(r_un, 'src')} "
               f"want None (empty); raw inline={(r_un['live'] or {}).get('tf')!r}; "
               f"history_after={p1.evaluate(HISTORY, a)} status={st2['status']!r}")
        if not ok2:
            findings.append("2 — canvas.js drag inverse patch")

        # ---- 3. drag many
        reset()
        click("red")
        click("blue", shift=True)
        sel3_before = p1.evaluate(CV, a)["selection"]
        press_drag("blue", 30, 0)
        st3 = p1.evaluate(CV, a)
        r3 = elem(ids["red"])
        b3 = elem(ids["blue"])
        sh = shot(p1, args.out, "03-drag-many")
        ok3 = (sorted(sel3_before) == sorted([ids["red"], ids["blue"]])
               and tf_xy(r3, "live") == (30.0, 0.0) and tf_xy(r3, "src") == (30.0, 0.0)
               and tf_xy(b3, "live") == (30.0, 0.0) and tf_xy(b3, "src") == (30.0, 0.0)
               and sorted(st3["selection"]) == sorted([ids["red"], ids["blue"]]))
        record(3, "Drag many. Red plus shift-blue, press on blue, 30 right.", ok3, sh,
               f"selection_before_drag={sel3_before} "
               f"want={sorted([ids['red'], ids['blue']])}; "
               f"red transform live={tf_xy(r3, 'live')} src={tf_xy(r3, 'src')}; "
               f"blue transform live={tf_xy(b3, 'live')} src={tf_xy(b3, 'src')}; "
               f"want (30.0,0.0) on both; selection_after={st3['selection']} "
               f"dirty={st3['dirty']} status={st3['status']!r}")
        if not ok3:
            findings.append("3 — canvas.js multi-select drag")

        # ---- 4. undo many
        hist4 = p1.evaluate(HISTORY, a)
        log4 = key("Meta+z", 1100)
        r4 = elem(ids["red"])
        b4 = elem(ids["blue"])
        hist4b = p1.evaluate(HISTORY, a)
        # a second undo would show a second entry for the same drag
        log4b = key("Meta+z", 1100)
        r4b = elem(ids["red"])
        b4b = elem(ids["blue"])
        one_entry = (tf_xy(r4, "live") is None and tf_xy(b4, "live") is None)
        sh = shot(p1, args.out, "04-undo-many")
        moved3 = tf_xy(r3, "live") == (30.0, 0.0) and tf_xy(b3, "live") == (30.0, 0.0)
        ok4 = (moved3 and one_entry
               and tf_xy(r4, "src") is None and tf_xy(b4, "src") is None)
        record(4, "Undo many. One Cmd-Z clears both; one history entry for the pair.",
               ok4, sh,
               f"line 3 actually moved both={moved3} (this line has no verdict without it); "
               f"history_before={hist4} keydown[{keyline(log4)}] "
               f"after one undo: red live={tf_xy(r4, 'live')} src={tf_xy(r4, 'src')} "
               f"blue live={tf_xy(b4, 'live')} src={tf_xy(b4, 'src')} want None on all; "
               f"history_after_one={hist4b}; "
               f"a second Cmd-Z[{keyline(log4b)}] then gave red live={tf_xy(r4b, 'live')} "
               f"blue live={tf_xy(b4b, 'live')} "
               f"(evidence the pair was one entry, not two)")
        if not ok4:
            findings.append("4 — canvas.js one history entry per multi-select drag")

        # ---- 5. drag then click
        reset()
        r5_0 = retries["n"]
        click("red")
        click("green", shift=True)
        sel5_before = p1.evaluate(CV, a)["selection"]
        p1.evaluate(BUS_TAKE)
        press_drag("green", 25, 0)
        sel5_after = p1.evaluate(CV, a)["selection"]
        ev5 = p1.evaluate(BUS_TAKE)
        p1.wait_for_timeout(600)
        sel5_settled = p1.evaluate(CV, a)["selection"]
        # undo the drag so the baseline comes back for line 6
        key("Meta+z", 1000)
        sh = shot(p1, args.out, "05-drag-then-click")
        want5 = sorted([ids["red"], ids["green"]])
        ok5 = (sorted(sel5_before) == want5 and sorted(sel5_after) == want5
               and sorted(sel5_settled) == want5)
        record(5, "Drag then click. The click after a drag release leaves the selection.",
               ok5, sh,
               f"selection_before_drag={sel5_before} want={want5} "
               f"click_retries={retries['n'] - r5_0}; "
               f"selection right after mouseup={sel5_after}; "
               f"selection 600ms later={sel5_settled}; "
               f"a click that got through would collapse it to [{ids['green']!r}]; "
               f"canvas.select during and after the drag={ev5}")
        if not ok5:
            findings.append("5 — canvas.js drag suppressing the trailing click")

        # ---- 6. drag in preview
        reset()
        src6_before = p1.evaluate(SOURCE_TEXT, a)
        r6_before = elem(ids["red"])
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'preview')",
                    {"id": a})
        p1.wait_for_timeout(900)
        refresh()
        st6_mode = p1.evaluate(CV, a)["mode"]
        press_drag("red", 60, 40)
        st6 = p1.evaluate(CV, a)
        r6_after = elem(ids["red"])
        src6_after = p1.evaluate(SOURCE_TEXT, a)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'canvas')",
                    {"id": a})
        p1.wait_for_timeout(900)
        refresh()
        st6_back = p1.evaluate(CV, a)["mode"]
        sh = shot(p1, args.out, "06-preview-drag")
        ok6 = (st6_mode == "preview" and st6["selection"] == []
               and tf_xy(r6_after, "live") == tf_xy(r6_before, "live")
               and tf_xy(r6_after, "src") == tf_xy(r6_before, "src")
               and src6_after == src6_before and st6_back == "canvas")
        record(6, "Drag in preview. Nothing moves, nothing selected, source unchanged.",
               ok6, sh,
               f"mode_during={st6_mode!r} selection_after_drag={st6['selection']} want []; "
               f"red transform before={tf_xy(r6_before, 'live')} "
               f"after={tf_xy(r6_after, 'live')} src before={tf_xy(r6_before, 'src')} "
               f"after={tf_xy(r6_after, 'src')}; "
               f"source bytes {len(src6_before)} -> {len(src6_after)} "
               f"unchanged={src6_after == src6_before}; "
               f"dirty={st6['dirty']} status={st6['status']!r}; "
               f"mode back to {st6_back!r}")
        if not ok6:
            findings.append("6 — canvas.js preview gate on pointer drag")

        # ---- 7. text edit
        def edit_paragraph(tag):
            # double-click the paragraph, append " plus", commit; returns a note
            refresh()
            e = probe["els"]["p"]
            p1.mouse.dblclick(e["x"], e["y"])
            p1.wait_for_timeout(700)
            opened = p1.evaluate(TEXT_EDIT, a)
            p1.evaluate(FOCUS_IFRAME, a)
            caret = p1.evaluate(CARET_END, a)
            p1.wait_for_timeout(200)
            p1.keyboard.type(" plus", delay=60)
            p1.wait_for_timeout(600)
            typed = p1.evaluate(ELEM, {"id": a, "gid": ids["p"]})
            live_has = " plus" in ((typed["live"] or {}).get("text") or "")
            p1.keyboard.press("Enter")
            p1.wait_for_timeout(1000)
            by = "Enter"
            got = p1.evaluate(SOURCE_TEXT, a)
            if " plus" not in got:
                gp = p1.evaluate(GROUND, {"id": a, "x": 6, "y": 400})
                p1.mouse.click(gp["x"], gp["y"])
                p1.wait_for_timeout(1000)
                got = p1.evaluate(SOURCE_TEXT, a)
                by = "click away" if " plus" in got else "neither"
            CONSOLE.append(f"[harness] {tag}: opened={opened} caret={caret!r} "
                           f"typing_landed_live={live_has} committed_by={by}")
            return {"opened": opened, "caret": caret, "live_after_typing": live_has,
                    "by": by, "in_source": " plus" in got}

        reset()
        p_before = elem(ids["p"])
        r7 = edit_paragraph("line 7")
        p_after = elem(ids["p"])
        st7 = p1.evaluate(CV, a)
        log7 = key("Meta+z", 1100)
        p_undone = elem(ids["p"])
        src7_undone = p1.evaluate(SOURCE_TEXT, a)
        sh = shot(p1, args.out, "07-text-edit")
        ok7 = (r7["in_source"] and " plus" in (p_after["src"] or {}).get("text", "")
               and " plus" not in (p_undone["src"] or {}).get("text", "")
               and " plus" not in src7_undone)
        record(7, "Text edit. Double-click the paragraph, append ' plus', commit, Cmd-Z.",
               ok7, sh,
               f"dblclick opened={r7['opened']} caret={r7['caret']!r} "
               f"typing_landed_in_live_dom={r7['live_after_typing']} "
               f"committed_by={r7['by']!r}; "
               f"text before live={(p_before['live'] or {}).get('text')!r}; "
               f"after live={(p_after['live'] or {}).get('text')!r} "
               f"src={(p_after['src'] or {}).get('text')!r} "
               f"in_source={r7['in_source']} dirty={st7['dirty']}; "
               f"Cmd-Z[{keyline(log7)}] -> live="
               f"{(p_undone['live'] or {}).get('text')!r} "
               f"src={(p_undone['src'] or {}).get('text')!r} "
               f"plus_gone_from_source={' plus' not in src7_undone}")
        if not ok7:
            findings.append("7 — canvas.js inline text edit commit or its inverse")

        # ---- 8. dirty tabs
        reset()
        r8 = edit_paragraph("line 8")
        st8_one = p1.evaluate(CV, a)
        p1.evaluate(STUB_PICKER, FIXTURE2)
        added2 = p1.evaluate(CLICK_ADD, g)
        ready2 = wait_ok(p1, FILE_READY, a, 45000, "file ready (fixture two)")
        p1.wait_for_timeout(1800)
        st8_two = p1.evaluate(CV, a)
        switched = st8_two["path"] == FIXTURE2
        if not switched:
            switched = p1.evaluate(TAB_SWITCH, {"id": a, "path": FIXTURE2})
            p1.wait_for_timeout(2000)
            st8_two = p1.evaluate(CV, a)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'canvas')",
                    {"id": a})
        p1.wait_for_timeout(900)
        probe2 = p1.evaluate(PROBE, {"id": a, "sels": SELS2})
        for k, v in probe2["els"].items():
            ids[k] = v["odId"] if v else ""
        probe.update(probe2)
        tile_before = elem(ids["tile1"])
        press_drag("tile1", 40, 0)
        tile_after = elem(ids["tile1"])
        st8_drag = p1.evaluate(CV, a)
        both_dirty = (st8_drag["dirty"]
                      and st8_drag["cachedDirty"].get(FIXTURE) is True)
        p1.evaluate(SEND_TAP, a)
        log8 = key("Meta+s", 1200)
        saved8 = wait_ok(p1, STATUS_SAVED, a, 8000, "status saved on tab two")
        p1.wait_for_timeout(1500)
        sent8 = p1.evaluate(SEND_TAKE)
        with open(FIXTURE) as fh:
            disk1_8 = fh.read()
        with open(FIXTURE2) as fh:
            disk2_8 = fh.read()
        st8_after = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "08-dirty-tabs")
        two_has_drag = "translate(" in disk2_8
        one_has_edit = " plus" in disk1_8
        ok8 = (r8["in_source"] and added2 and ready2 and switched
               and tf_xy(tile_after, "live") == (40.0, 0.0)
               and tf_xy(tile_after, "src") == (40.0, 0.0)
               and both_dirty and saved8 and two_has_drag and not one_has_edit
               and st8_after["cachedDirty"].get(FIXTURE) is True)
        record(8, "Dirty tabs. Edit tab one, drag on tab two, Cmd-S saves tab two only.",
               ok8, sh,
               f"tab one edit typing_landed={r8['live_after_typing']} "
               f"committed_by={r8['by']!r} in_source={r8['in_source']} "
               f"dirty={st8_one['dirty']}; "
               f"add_two={added2} file_ready={ready2} active_is_two={switched} "
               f"active_path={os.path.basename(st8_two['path'])} "
               f"tabs={[x['name'] for x in st8_two['tabs']]}; "
               f"tile one transform before={tf_xy(tile_before, 'live')} "
               f"after live={tf_xy(tile_after, 'live')} src={tf_xy(tile_after, 'src')} "
               f"want (40.0,0.0); "
               f"dirty active={st8_drag['dirty']} cached={st8_drag['cachedDirty']} "
               f"both_dirty={both_dirty}; "
               f"Cmd-S[{keyline(log8)}] reached_saved={saved8} "
               f"frames_sent={sent8}; "
               f"disk fixture-drag-2 has translate={two_has_drag}; "
               f"disk fixture-drag has ' plus'={one_has_edit} (want False); "
               f"tab one still dirty after the save="
               f"{st8_after['cachedDirty'].get(FIXTURE)}")
        if not ok8:
            findings.append("8 — canvas.js per-tab dirty flags or Cmd-S scope (P8)")

        # ---- 9. close prompt, P8
        p1.evaluate(SEND_TAP, a)
        p1.evaluate(SEND_TAKE)
        dirty9_before = p1.evaluate(CV, a)["cachedDirty"]
        p1.evaluate(CLOSE_FIRE, a)
        p1.wait_for_timeout(1500)
        modal9 = p1.evaluate(MODAL_DUMP)
        sh = shot(p1, args.out, "09a-close-prompt")
        clicked9 = False
        if modal9 and "Save" in (modal9["buttons"] or []):
            clicked9 = p1.evaluate(MODAL_CLICK, "Save")
        p1.wait_for_timeout(4000)
        sent9 = p1.evaluate(SEND_TAKE)
        closed9 = p1.evaluate("() => window.__closed")
        gone9 = p1.evaluate("(id) => !MX.grid.frames[id]", a)
        with open(FIXTURE) as fh:
            disk1_9 = fh.read()
        with open(FIXTURE2) as fh:
            disk2_9 = fh.read()
        one_saved = " plus" in disk1_9
        sent_for_one = [s for s in sent9 if s.get("type") == "save"
                        and s.get("path") == FIXTURE]
        # the disk proof, edit text aside: tab one's bytes on disk are the ones sent
        landed = bool(sent_for_one) and len(disk1_9) == sent_for_one[-1]["bytes"]
        sh = shot(p1, args.out, "09-close-prompt")
        ok9 = (bool(modal9) and clicked9 and bool(sent_for_one) and landed and gone9)
        record(9, "Close prompt, P8. The dirty tab one saves when the widget closes.",
               ok9, sh,
               f"close path in canvas.js is canClose(frame), not beforeunload: it calls "
               f"MX.ui.choose with Save / Discard / Cancel and Save runs doSaveAll(cv), "
               f"which saves the active tab then every dirty cached tab; "
               f"dirty tabs before the close={dirty9_before}; "
               f"modal={modal9}; Save_clicked={clicked9}; "
               f"frames on the wire after Save={sent9}; "
               f"save frame for tab one={sent_for_one}; "
               f"disk fixture-drag bytes after close={len(disk1_9)} "
               f"equals the bytes sent for tab one={landed}; "
               f"disk fixture-drag has ' plus' after close={one_saved} "
               f"(only meaningful if line 7 or 8 committed the text edit); "
               f"disk fixture-drag-2 still has translate="
               f"{'translate(' in disk2_9}; "
               f"removeWidget resolved={closed9!r} frame_gone={gone9}")
        if not ok9:
            findings.append("9 — canvas.js canClose / doSaveAll (P8)")

        # ---- 10. console
        errs = [(i, c) for i, c in enumerate(CONSOLE)
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c]

        def after_line(i):
            # the last walk line closed before console entry i
            done = [r["n"] for r in RESULTS if r["console_at"] <= i]
            return done[-1] if done else "setup"

        sh = shot(p1, args.out, "10-final")
        ok10 = len(errs) == 0
        record(10, "Console clean the whole way.", ok10, sh,
               f"pageerrors={len(PAGEERRORS)} error_or_warning_lines={len(errs)} "
               f"total_console_lines={len(CONSOLE)}"
               + ("" if ok10 else " ;; " + " ;; ".join(
                   f"(after line {after_line(i)}) {c}" for i, c in errs[:8])))
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

    # the two copies go back to the originals' bytes; the originals were never opened for write
    restored = {}
    for path, want, src in ((FIXTURE, held, ORIG), (FIXTURE2, held2, ORIG2)):
        with open(path) as fh:
            ran = fh.read()
        with open(path, "w") as fh:
            fh.write(want)
        with open(path) as fh:
            back = fh.read()
        with open(src) as fh:
            orig_now = fh.read()
        restored[os.path.basename(path)] = {
            "run_left_bytes": len(ran), "wrote_back_bytes": len(want),
            "matches_original": back == want,
            "original_untouched": orig_now == want}
    CONSOLE.append(f"[harness] restored copies: {restored}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump({"results": RESULTS, "findings": findings,
                   "fixtures_restored": restored, "ids": ids,
                   "surface_left": left}, fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
    print(f"\nfixtures restored: {restored}")
    print(f"findings: {findings}")
    sys.exit(0)


if __name__ == "__main__":
    main()
