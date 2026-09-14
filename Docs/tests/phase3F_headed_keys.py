"""Headed Playwright walk for Phase 3F job H2 — keys and patches.

Built on Docs/tests/phase3F_headed.py: same launch, console capture,
record/shot pair per line, fixture hold and restore, teardown.

Fixture, its own copy, never shared with the other walk:
    Docs/scratchpad/phase3F-fixture-keys.html

Stage children in order: h1, p, red, blue, green, gold, span.

Usage:
    python3 Docs/tests/phase3F_headed_keys.py --session <sid> \
        --out Docs/Reports/phase3F-headed-keys/

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
FIXTURE = os.path.join(SCRATCH, "phase3F-fixture-keys.html")

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


def strip_id(html):
    # id-blind outerHTML, for duplicate comparison
    return re.sub(r'\s*data-od-id="[^"]*"', "", html or "")


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

TL_LAYER_ROWS = r"""
(id) => {
  const body = MX.grid.frames[id].el.querySelector(".mxtl-body");
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

TARGETS_TAG_IN_DOM = ('() => !!document.querySelector('
                      '\'script[src*="codecanvas/targets/targets.js"]\')')

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

# context menu: mark every node, then diff after the right-click
MENU_MARK = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  window.__mk = {top: new Set(document.querySelectorAll("*")),
                 doc: new Set(cv.idoc.querySelectorAll("*"))};
  return [window.__mk.top.size, window.__mk.doc.size];
}
"""

MENU_DIFF = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const grab = (root, seen, where) => {
    const add = [];
    for (const el of root.querySelectorAll("*")) if (!seen.has(el)) add.push(el);
    return add.filter((e) => add.indexOf(e.parentElement) < 0)
              .map((e) => ({el: e, where: where}));
  };
  const roots = grab(document, window.__mk.top, "top")
    .concat(grab(cv.idoc, window.__mk.doc, "iframe"));
  window.__menu = roots;
  return roots.map((r) => {
    const e = r.el, rc = e.getBoundingClientRect();
    const cs = e.ownerDocument.defaultView.getComputedStyle(e);
    const items = Array.prototype.map.call(e.querySelectorAll("*"),
      (c) => (c.children.length ? "" : (c.textContent || "").trim())).filter((t) => t);
    return {where: r.where, tag: e.tagName.toLowerCase(),
            cls: String(e.className || ""), items: items.slice(0, 30),
            w: Math.round(rc.width), h: Math.round(rc.height),
            vis: rc.width > 0 && rc.height > 0 && cs.display !== "none"
                 && cs.visibility !== "hidden"};
  });
}
"""

MENU_STATE = r"""
() => (window.__menu || []).map((r) => {
  const e = r.el, inDoc = e.ownerDocument.contains(e);
  const rc = e.getBoundingClientRect();
  const cs = e.ownerDocument.defaultView.getComputedStyle(e);
  return {where: r.where, tag: e.tagName.toLowerCase(),
          cls: String(e.className || ""), inDoc: inDoc,
          vis: inDoc && rc.width > 0 && rc.height > 0 && cs.display !== "none"
               && cs.visibility !== "hidden"};
})
"""

MENU_FIND = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const host = cv.iframe.getBoundingClientRect();
  const rx = new RegExp(args.rx, "i");
  for (const r of (window.__menu || [])) {
    const e = r.el;
    const all = Array.prototype.slice.call(e.querySelectorAll("*")).concat([e]);
    const hit = all.filter((c) => c.children.length === 0
      && rx.test(c.textContent || ""))[0];
    if (!hit) continue;
    const rc = hit.getBoundingClientRect();
    const off = r.where === "iframe" ? {x: host.x, y: host.y} : {x: 0, y: 0};
    return {text: (hit.textContent || "").trim(), where: r.where,
            x: off.x + rc.left + rc.width / 2, y: off.y + rc.top + rc.height / 2};
  }
  return null;
}
"""

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3F-headed-keys")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    if not os.path.exists(FIXTURE):
        print(f"MISSING FIXTURE {FIXTURE}")
        sys.exit(1)

    with open(FIXTURE) as fh:
        held = fh.read()
    CONSOLE.append(f"[harness] held before the run: "
                   f"{os.path.basename(FIXTURE)}, {len(held)} bytes")

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

        # ---- setup: Canvas, Targets, the keys fixture, Tools, canvas mode
        a = p1.evaluate(MOUNT, {"type": "canvas"})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 13, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        p1.wait_for_timeout(800)
        g = p1.evaluate(MOUNT, {"type": "canvas_targets"})
        p1.evaluate(RESIZE, {"id": g, "col": 14, "row": 1, "w": 4, "h": 8})
        p1.wait_for_timeout(900)
        p1.evaluate(STUB_PICKER, FIXTURE)
        added = p1.evaluate(CLICK_ADD, g)
        loaded = wait_ok(p1, FILE_READY, a, 45000, "file ready (keys fixture)")
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
        sh = shot(p1, args.out, "00-setup")
        missing = [k for k, v in probe["els"].items() if not v or not v["hit"]]
        ok0 = (added and loaded and st0["mode"] == "canvas"
               and st0["docMode"] == "file" and not missing
               and [x["tag"] for x in (base["live"] or [])]
                   == ["h1", "p", "div", "div", "div", "div", "span"]
               and base["live"] == base["src"])
        record(0, "Setup. Canvas plus Targets plus Tools, keys fixture, canvas mode.",
               ok0, sh,
               f"add_clicked={added} file_ready={loaded} mode={st0['mode']!r} "
               f"docMode={st0['docMode']!r} iframe_viewport={probe['vw']}x{probe['vh']} "
               f"stage_live={[x['tag'] for x in (base['live'] or [])]} "
               f"stage_src={[x['tag'] for x in (base['src'] or [])]} "
               f"live_eq_src={base['live'] == base['src']} "
               f"not_hit_testable={missing} ids={ids}")
        if not ok0:
            findings.append("0 — setup: see note; the walk below runs on this state")

        order0 = [x["id"] for x in (base["live"] or [])]
        want0 = [ids[k] for k in ("h1", "p", "red", "blue", "green", "gold", "span")]

        def kids(tag=""):
            k = p1.evaluate(KIDS, {"id": a, "sel": STAGE})
            return ([x["id"] for x in (k["live"] or [])],
                    [x["id"] for x in (k["src"] or [])], k)

        retries = {"n": 0}

        def refresh():
            # click points are re-measured before each line
            probe.update(p1.evaluate(PROBE, {"id": a, "sels": SELS}))
            return probe

        def reset():
            # clear selection and finish any half-open pointer state
            p1.keyboard.press("Escape")
            p1.wait_for_timeout(300)
            gp = p1.evaluate(GROUND, {"id": a, "x": 6, "y": 400})
            p1.mouse.click(gp["x"], gp["y"])
            p1.wait_for_timeout(300)
            p1.keyboard.press("Escape")
            p1.wait_for_timeout(300)
            refresh()

        def click(key, shift=False, want=True):
            # click, then read selection; one retry, counted and reported
            e = probe["els"][key]
            for attempt in (1, 2):
                if shift:
                    p1.keyboard.down("Shift")
                p1.mouse.click(e["x"], e["y"])
                if shift:
                    p1.keyboard.up("Shift")
                p1.wait_for_timeout(500)
                if not want:
                    return
                sel = p1.evaluate(CV, a)["selection"]
                if ids[key] in sel or attempt == 2:
                    return
                retries["n"] += 1

        def key(seq, ms=800):
            p1.evaluate(KEY_TAP, a)
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press(seq)
            p1.wait_for_timeout(ms)
            return p1.evaluate(KEY_TAKE)

        # ---- 1. non-contiguous group, ungroup, undo, undo
        click("red")
        click("green", shift=True)
        sel1 = p1.evaluate(CV, a)["selection"]
        key("Meta+g", 1000)
        st1 = p1.evaluate(CV, a)
        gid = st1["selection"][0] if st1["selection"] else ""
        l_grp, s_grp, _ = kids()
        p1.evaluate(TL_TAB_CLICK, {"id": t, "name": "layers"})
        p1.wait_for_timeout(800)
        rows = p1.evaluate(TL_LAYER_ROWS, t)
        gidx = [i for i, r in enumerate(rows) if r["id"] == gid]
        under = []
        if gidx:
            b = rows[gidx[0]]["indent"]
            for r in rows[gidx[0] + 1:]:
                if r["indent"] <= b:
                    break
                under.append(r["id"])
        blue_row = [i for i, r in enumerate(rows) if r["id"] == ids["blue"]]
        blue_out = bool(blue_row) and ids["blue"] not in under
        sh = shot(p1, args.out, "01a-group")
        key("Meta+Shift+g", 1000)
        l_ung, s_ung, _ = kids()
        key("Meta+z", 1000)
        l_re, s_re, _ = kids()
        key("Meta+z", 1000)
        l_back, s_back, _ = kids()
        sh = shot(p1, args.out, "01-group-ungroup-undo")
        want_grp = [ids["h1"], ids["p"], gid, ids["blue"], ids["gold"], ids["span"]]
        # unwrap drops both members at the group's slot, by contract
        want_ung = [ids["h1"], ids["p"], ids["red"], ids["green"], ids["blue"],
                    ids["gold"], ids["span"]]
        ok1 = (sorted(sel1) == sorted([ids["red"], ids["green"]])
               and gid.startswith("grp_")
               and l_grp == want_grp and s_grp == want_grp
               and bool(gidx) and sorted(under) == sorted([ids["red"], ids["green"]])
               and blue_out
               and l_ung == want_ung and s_ung == want_ung
               and l_re == want_grp and s_re == want_grp
               and l_back == want0 and s_back == want0)
        record(1, "Non-contiguous group. Cmd-G, shift-Cmd-G, Cmd-Z, Cmd-Z.", ok1, sh,
               f"selection_before_G={sel1} (want red+green) group_id={gid!r} "
               f"after_G live={l_grp} src={s_grp} want={want_grp}; "
               f"layers_group_row_at={gidx} rows_under_it={under} "
               f"blue_outside_group={blue_out}; "
               f"after_shift_G live={l_ung} src={s_ung} want={want_ung}; "
               f"after_undo_1 live={l_re} src={s_re}; "
               f"after_undo_2 live={l_back} src={s_back} want={want0}")
        if not ok1:
            findings.append("1 — canvas.js group/ungroup/undo, patch.js wrap/unwrap slots")

        # ---- 2. order keys and undo
        def order_step(label, sel_key, seq):
            click(sel_key)
            sel = p1.evaluate(CV, a)["selection"]
            log = key(seq, 900)
            l_a, s_a, _ = kids()
            key("Meta+z", 900)
            l_u, s_u, _ = kids()
            return {"label": label, "after": l_a, "after_src": s_a,
                    "undone": l_u, "undone_src": s_u, "sel": sel,
                    "log": keyline(log),
                    "back": l_u == want0 and s_u == want0}

        i_ = {k: want0.index(ids[k]) for k in ("red", "blue", "green", "gold")}
        s_a = order_step("gold Cmd-[", "gold", "Meta+BracketLeft")
        want_a = want0[:]
        want_a.insert(i_["green"], want_a.pop(i_["gold"]))
        s_b = order_step("gold shift-Cmd-[", "gold", "Meta+Shift+BracketLeft")
        want_b = [ids["gold"]] + [x for x in want0 if x != ids["gold"]]
        s_c = order_step("blue shift-Cmd-]", "blue", "Meta+Shift+BracketRight")
        want_c = [x for x in want0 if x != ids["blue"]] + [ids["blue"]]
        s_d = order_step("red Cmd-]", "red", "Meta+BracketRight")
        want_d = want0[:]
        want_d.insert(i_["blue"], want_d.pop(i_["red"]))
        sh = shot(p1, args.out, "02-order-undo")
        got = [(s_a, want_a), (s_b, want_b), (s_c, want_c), (s_d, want_d)]
        ok2 = all(s["after"] == w and s["after_src"] == w and s["back"] for s, w in got)
        record(2, "Order keys. Cmd-[, shift-Cmd-[, shift-Cmd-], Cmd-]. Each Cmd-Z restores.",
               ok2, sh,
               "; ".join(f"{s['label']}: selected={s['sel']} keydown[{s['log']}] "
                         f"live={s['after']} src={s['after_src']} "
                         f"want={w} moved={s['after'] == w and s['after_src'] == w} "
                         f"undo_back={s['back']}" for s, w in got)
               + f"; baseline={want0}")
        if not ok2:
            findings.append("2 — canvas.js forward/back/front/toBack or their inverses")

        # ---- 3. marquee
        p1.evaluate(BUS_TAKE)
        r_red = probe["els"]["red"]["docRect"]
        r_blue = probe["els"]["blue"]["docRect"]
        r_green = probe["els"]["green"]["docRect"]
        # body margin 0, stage margin 20: x and y under 20 are body ground
        narrow = probe["vw"] < r_green["right"] + 10
        p0 = p1.evaluate(GROUND, {"id": a, "x": 8, "y": 150})
        p2 = p1.evaluate(GROUND, {"id": a, "x": 350, "y": 250})
        p1.mouse.move(p0["x"], p0["y"])
        p1.mouse.down()
        p1.mouse.move((p0["x"] + p2["x"]) / 2, (p0["y"] + p2["y"]) / 2, steps=6)
        p1.mouse.move(p2["x"], p2["y"], steps=6)
        p1.wait_for_timeout(300)
        # selection while the button is still down, before mouse-up
        sel3_mid = p1.evaluate(CV, a)["selection"]
        ev3_mid = p1.evaluate(BUS_TAKE)
        p1.mouse.up()
        p1.wait_for_timeout(800)
        sel3 = p1.evaluate(CV, a)["selection"]
        ev3_up = p1.evaluate(BUS_TAKE)
        ev3 = ev3_mid + ev3_up
        g0 = p1.evaluate(GROUND, {"id": a, "x": 8, "y": 150})
        g1 = p1.evaluate(GROUND, {"id": a, "x": 510, "y": 250})
        p1.keyboard.down("Shift")
        p1.mouse.move(g0["x"], g0["y"])
        p1.mouse.down()
        p1.mouse.move((g0["x"] + g1["x"]) / 2, (g0["y"] + g1["y"]) / 2, steps=6)
        p1.mouse.move(g1["x"], g1["y"], steps=6)
        p1.wait_for_timeout(300)
        sel3b_mid = p1.evaluate(CV, a)["selection"]
        p1.mouse.up()
        p1.keyboard.up("Shift")
        p1.wait_for_timeout(800)
        sel3b = p1.evaluate(CV, a)["selection"]
        ev3b = p1.evaluate(BUS_TAKE)
        log3 = key("Escape", 600)
        sel3c = p1.evaluate(CV, a)["selection"]
        stage3 = p1.evaluate(ELEM, {"id": a, "gid": "path-0"})
        red3 = p1.evaluate(PROBE, {"id": a, "sels": {"red": SELS["red"]}})
        sh = shot(p1, args.out, "03-marquee")
        ok3 = (sorted(sel3) == sorted([ids["red"], ids["blue"]])
               and len(ev3) > 0
               and sorted(sel3b) == sorted([ids["red"], ids["blue"], ids["green"]])
               and sel3c == [])
        record(3, "Marquee on empty ground. Two ids. Shift-drag extends to three. "
                  "Escape clears.", ok3, sh,
               f"iframe_viewport={probe['vw']}x{probe['vh']} "
               f"green_right_edge={r_green['right']:.0f} "
               f"iframe_narrower_than_stage={narrow}; "
               f"drag1 doc (8,150) to (350,250) = page "
               f"({p0['x']:.0f},{p0['y']:.0f}) over {p0['tag']!r}.{p0['cls']!r} "
               f"to ({p2['x']:.0f},{p2['y']:.0f}) over {p2['tag']!r}; "
               f"selection_before_mouseup={sel3_mid} "
               f"selection_after_mouseup={sel3} want={[ids['red'], ids['blue']]} "
               f"canvas.select events during drag={ev3_mid} "
               f"events at and after mouseup={ev3_up}; "
               f"shift_drag doc (8,150) to (510,250) = page "
               f"({g0['x']:.0f},{g0['y']:.0f}) over {g0['tag']!r} to "
               f"({g1['x']:.0f},{g1['y']:.0f}) over {g1['tag']!r}: "
               f"selection_before_mouseup={sel3b_mid} "
               f"selection_after_mouseup={sel3b} want 3 events={ev3b}; "
               f"after Escape={sel3c} "
               f"keydown[{keyline(log3)}]; stage div.stage after the drags: live style "
               f"left={(stage3['live'] or {}).get('left')!r} "
               f"top={(stage3['live'] or {}).get('top')!r} src left="
               f"{(stage3['src'] or {}).get('left')!r} top="
               f"{(stage3['src'] or {}).get('top')!r}; red box rect now="
               f"{[round(n) for n in red3['els']['red']['docRect'].values()]} "
               f"(was left 60 top 160 at setup)")
        if not ok3:
            findings.append("3 — canvas.js marquee hit test / shift extend / Escape")

        # state after the drags: what sits under each click point now
        probe_after = p1.evaluate(PROBE, {"id": a, "sels": SELS})
        hits_after = {k: ((v or {}).get("hitTag"), (v or {}).get("hit"),
                          [round(n) for n in ((v or {}).get("docRect") or {}).values()])
                      for k, v in probe_after["els"].items()}
        vp_after = (probe_after["vw"], probe_after["vh"],
                    round(probe_after["hostW"]), round(probe_after["hostH"]))
        r0 = retries["n"]

        # ---- 4. delete and undo
        reset()
        hits_reset = {k: (v or {}).get("hit") for k, v in probe["els"].items()}
        gold_before = p1.evaluate(ELEM, {"id": a, "gid": ids["gold"]})
        click("gold")
        sel4 = p1.evaluate(CV, a)["selection"]
        via_row = False
        if ids["gold"] not in sel4:
            # the click cannot reach gold after line 3; select from the
            # Layers row instead so the Delete key still gets a verdict
            via_row = p1.evaluate(TL_ROW_CLICK, {"id": t, "gid": ids["gold"]})
            p1.wait_for_timeout(600)
            sel4 = p1.evaluate(CV, a)["selection"]
        log4 = key("Delete", 900)
        l_del, s_del, _ = kids()
        used = "Delete"
        log4b = []
        if ids["gold"] in l_del:
            log4b = key("Backspace", 900)
            l_del2, s_del2, _ = kids()
            used = "Delete did nothing; Backspace removed it" \
                if ids["gold"] not in l_del2 \
                else "neither Delete nor Backspace removed it"
        key("Meta+z", 1000)
        p1.keyboard.press("Escape")
        p1.wait_for_timeout(400)
        gold_after = p1.evaluate(ELEM, {"id": a, "gid": ids["gold"]})
        l_undo, s_undo, _ = kids()
        sh = shot(p1, args.out, "04-delete-undo")
        del_ok = ids["gold"] not in l_del and ids["gold"] not in s_del
        same_slot = (gold_after["src"] and gold_before["src"]
                     and gold_after["src"]["slot"] == gold_before["src"]["slot"])
        same_html = (gold_after["src"] and gold_before["src"]
                     and gold_after["src"]["outer"] == gold_before["src"]["outer"])
        ok4 = (del_ok and same_slot and same_html
               and l_undo == want0 and s_undo == want0)
        record(4, "Delete key removes gold. Cmd-Z restores it at the same slot.", ok4, sh,
               f"hit_test_after_marquee={hits_after} "
               f"iframe_vw_vh_hostW_hostH_after_marquee={vp_after} "
               f"hit_test_after_reset={hits_reset} "
               f"click_retries={retries['n'] - r0}; "
               f"selected_before_key={sel4} selected_via_layers_row={via_row} "
               f"key_used={used!r} "
               f"keydown[{keyline(log4)}] backspace_keydown[{keyline(log4b)}] "
               f"after_delete live={l_del} src={s_del} "
               f"gone_from_both={del_ok}; after_undo live={l_undo} src={s_undo}; "
               f"gold slot before={gold_before['src']['slot'] if gold_before['src'] else None} "
               f"after={gold_after['src']['slot'] if gold_after['src'] else None} "
               f"(same={same_slot}) outerHTML_identical={same_html}; "
               f"src_outer_after={(gold_after['src'] or {}).get('outer')!r}")
        if not ok4:
            findings.append("4 — canvas.js remove / Delete key binding, insert inverse")

        # ---- 5. arrow nudge, 1px and shift 10px, undo twice
        reset()
        click("red")
        sel5 = p1.evaluate(CV, a)["selection"]
        r_start = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        log5a = key("ArrowRight", 900)
        r_right = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        log5b = key("Shift+ArrowDown", 900)
        r_down = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        key("Meta+z", 900)
        r_u1 = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        key("Meta+z", 900)
        r_u2 = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        sh = shot(p1, args.out, "05-arrows")

        def lt(e, which):
            v = e[which]
            return (v["left"], v["top"]) if v else (None, None)

        # left stays put across the whole line; the nudge rides on transform
        left_held = all(lt(e, w)[0] == "40px"
                        for e in (r_start, r_right, r_down, r_u1, r_u2)
                        for w in ("live", "src"))
        ok5 = (tf_xy(r_right, "live") == (1.0, 0.0)
               and tf_xy(r_right, "src") == (1.0, 0.0)
               and tf_xy(r_down, "live") == (1.0, 10.0)
               and tf_xy(r_down, "src") == (1.0, 10.0)
               and tf_xy(r_u2, "live") is None and tf_xy(r_u2, "src") is None
               and tf_xy(r_u2, "live") == tf_xy(r_start, "live")
               and left_held)
        record(5, "Arrows nudge red. Right 1px, shift-Down 10px. Cmd-Z twice restores.",
               ok5, sh,
               f"selected={sel5} start transform live={tf_xy(r_start, 'live')} "
               f"src={tf_xy(r_start, 'src')} left/top live={lt(r_start, 'live')}; "
               f"ArrowRight keydown[{keyline(log5a)}] -> transform live="
               f"{tf_xy(r_right, 'live')} src={tf_xy(r_right, 'src')} want (1.0,0.0) "
               f"left/top live={lt(r_right, 'live')}; "
               f"Shift+ArrowDown keydown[{keyline(log5b)}] -> transform live="
               f"{tf_xy(r_down, 'live')} src={tf_xy(r_down, 'src')} want (1.0,10.0) "
               f"left/top live={lt(r_down, 'live')}; "
               f"after undo 1 transform live={tf_xy(r_u1, 'live')} "
               f"src={tf_xy(r_u1, 'src')}; "
               f"after undo 2 transform live={tf_xy(r_u2, 'live')} "
               f"src={tf_xy(r_u2, 'src')} want None (empty); "
               f"left stayed 40px everywhere={left_held}; "
               f"raw inline transform after ArrowRight="
               f"{(r_right['live'] or {}).get('tf')!r} computed="
               f"{(r_right['live'] or {}).get('tfComputed')!r}")
        if not ok5:
            findings.append("5 — canvas.js arrow nudge / set-style patch or its inverse")

        # ---- 6. cmd-D duplicate, cmd-Z removes it
        reset()
        click("blue")
        sel6 = p1.evaluate(CV, a)["selection"]
        log6 = key("Meta+d", 1000)
        p1.keyboard.press("Escape")
        p1.wait_for_timeout(400)
        dup6 = p1.evaluate(ELEM, {"id": a, "gid": ids["blue"]})
        l_dup, s_dup, _ = kids()
        key("Meta+z", 1000)
        l_un6, s_un6, _ = kids()
        sh = shot(p1, args.out, "06-duplicate")
        live6, src6 = dup6["live"], dup6["src"]
        fresh = bool(src6 and src6["nextId"] and src6["nextId"] != ids["blue"]
                     and src6["nextId"] not in want0)
        same6 = bool(src6 and strip_id(src6["next"]) == strip_id(src6["outer"]))
        same6_live = bool(live6 and strip_id(live6["next"]) == strip_id(live6["outer"]))
        ok6 = (fresh and same6 and same6_live
               and len(l_dup) == len(want0) + 1
               and l_dup[i_["blue"] + 1] == src6["nextId"]
               and s_dup[i_["blue"] + 1] == src6["nextId"]
               and l_un6 == want0 and s_un6 == want0)
        record(6, "Cmd-D duplicates blue right after it with a fresh id. Cmd-Z removes it.",
               ok6, sh,
               f"selected={sel6} keydown[{keyline(log6)}] "
               f"after_dup live={l_dup} src={s_dup}; "
               f"new_id={(src6 or {}).get('nextId')!r} fresh={fresh} "
               f"id_blind_outerHTML_matches src={same6} live={same6_live}; "
               f"dup_src={(src6 or {}).get('next')!r}; "
               f"after_undo live={l_un6} src={s_un6} want={want0}")
        if not ok6:
            findings.append("6 — canvas.js duplicate / insert patch and its inverse")

        # ---- 7. context menu, escape, duplicate item
        reset()
        p1.evaluate(MENU_MARK, a)
        red_pt = probe["els"]["red"]
        p1.mouse.click(red_pt["x"], red_pt["y"], button="right")
        p1.wait_for_timeout(900)
        menu7 = p1.evaluate(MENU_DIFF, a)
        sh = shot(p1, args.out, "07a-context-menu")
        # the menu root among the new nodes; the rest are panel re-renders
        mi = [i for i, m in enumerate(menu7) if "menu" in m["cls"].lower()]
        if not mi:
            mi = [i for i, m in enumerate(menu7) if len(m["items"]) >= 4]
        opened = bool(mi) and all(menu7[i]["vis"] for i in mi)
        log7 = key("Escape", 700)
        closed7 = p1.evaluate(MENU_STATE)
        gone = bool(mi) and all(not closed7[i]["vis"] for i in mi)
        p1.evaluate(MENU_MARK, a)
        p1.mouse.click(red_pt["x"], red_pt["y"], button="right")
        p1.wait_for_timeout(900)
        menu7b = p1.evaluate(MENU_DIFF, a)
        item = p1.evaluate(MENU_FIND, {"id": a, "rx": "duplicate"})
        picked = False
        if item:
            p1.mouse.click(item["x"], item["y"])
            p1.wait_for_timeout(1000)
            picked = True
        p1.keyboard.press("Escape")
        p1.wait_for_timeout(400)
        dup7 = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        l_dup7, s_dup7, _ = kids()
        src7 = dup7["src"]
        fresh7 = bool(src7 and src7["nextId"] and src7["nextId"] != ids["red"]
                      and src7["nextId"] not in want0)
        same7 = bool(src7 and strip_id(src7["next"]) == strip_id(src7["outer"]))
        key("Meta+z", 1000)
        l_un7, s_un7, _ = kids()
        sh = shot(p1, args.out, "07-context-menu")
        ok7 = (opened and gone and bool(item) and picked and fresh7 and same7
               and len(l_dup7) == len(want0) + 1
               and l_dup7[i_["red"] + 1] == src7["nextId"]
               and s_dup7[i_["red"] + 1] == src7["nextId"]
               and l_un7 == want0 and s_un7 == want0)
        record(7, "Right-click red. A menu appears. Escape closes it. Right-click, "
                  "pick duplicate. Cmd-Z.", ok7, sh,
               f"menu_root={[menu7[i] for i in mi]} opened={opened}; "
               f"other_new_nodes={[m['cls'] for i, m in enumerate(menu7) if i not in mi]}; "
               f"Escape keydown[{keyline(log7)}] closed={gone} "
               f"menu_root_after={[closed7[i] for i in mi]}; "
               f"second_open_menu_roots="
               f"{[m['cls'] for m in menu7b if 'menu' in m['cls'].lower()]} "
               f"duplicate_item={item}; after_pick live={l_dup7} src={s_dup7} "
               f"new_id={(src7 or {}).get('nextId')!r} fresh={fresh7} "
               f"id_blind_outerHTML_matches={same7}; "
               f"after_undo live={l_un7} src={s_un7} want={want0}")
        if not ok7:
            findings.append("7 — canvas.js context menu open/close or its duplicate item")

        # ---- 8. redo the duplicate, then undo again
        hist8 = p1.evaluate(HISTORY, a)
        log8 = key("Meta+Shift+z", 1000)
        l_re8, s_re8, _ = kids()
        redo8 = p1.evaluate(ELEM, {"id": a, "gid": ids["red"]})
        src8 = redo8["src"]
        key("Meta+z", 1000)
        l_un8, s_un8, _ = kids()
        hist8b = p1.evaluate(HISTORY, a)
        sh = shot(p1, args.out, "08-redo")
        ok8 = (bool(hist8 and hist8["canRedo"])
               and len(l_re8) == len(want0) + 1 and len(s_re8) == len(want0) + 1
               and bool(src8 and src8["nextId"] and src8["nextId"] not in want0)
               and l_un8 == want0 and s_un8 == want0)
        record(8, "Shift-Cmd-Z redoes the duplicate. Cmd-Z again.", ok8, sh,
               f"history_before={hist8} keydown[{keyline(log8)}] "
               f"after_redo live={l_re8} src={s_re8} "
               f"redone_id={(src8 or {}).get('nextId')!r}; "
               f"after_undo live={l_un8} src={s_un8} want={want0} history={hist8b}")
        if not ok8:
            findings.append("8 — canvas.js redo / history stack")

        # ---- 9. save, disk, reload
        src_before = p1.evaluate(SOURCE_TEXT, a)
        log9 = key("Meta+s", 1000)
        saved_status = wait_ok(p1, STATUS_SAVED, a, 6000, "status reads saved")
        p1.wait_for_timeout(1200)
        with open(FIXTURE) as fh:
            disk = fh.read()
        src_after = p1.evaluate(SOURCE_TEXT, a)
        ids_on_disk = len(re.findall(r'data-od-id="', disk))
        opts_before = p1.evaluate("(i) => MX.grid.frames[i].getOptions()", a)
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
        sh = shot(p1, args.out, "09-save-reload")
        disk_matches = disk == src_after
        ok9 = (saved_status and ids_on_disk >= 8 and disk_matches and reloaded
               and st9["mode"] == "preview" and st9["path"] == FIXTURE
               and FIXTURE in st9["targets"] and st9["bodyKids"] > 0)
        record(9, "Cmd-S saves. Disk has ids and matches cv.source. Reload comes back "
                  "in preview with the target set.", ok9, sh,
               f"keydown[{keyline(log9)}] status_reached_saved={saved_status} "
               f"data-od-id_on_disk={ids_on_disk} (at least 8: stage plus seven children)"
               f"disk_bytes={len(disk)} source_bytes={len(src_after)} "
               f"disk_equals_source={disk_matches} "
               f"source_changed_by_save={src_before != src_after}; "
               f"after reload mode={st9['mode']!r} target={os.path.basename(st9['path'])} "
               f"target_set={st9['path'] == FIXTURE} "
               f"targets={[os.path.basename(x) for x in st9['targets']]} "
               f"body_children={st9['bodyKids']} status={st9['status']!r} "
               f"file_ready={reloaded} mode_before_reload={opts_before['mode']!r}")
        if not ok9:
            findings.append("9 — canvas.js doSave / option round-trip on reload")

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

    with open(FIXTURE) as fh:
        ran = fh.read()
    with open(FIXTURE, "w") as fh:
        fh.write(held)
    with open(FIXTURE) as fh:
        back = fh.read()
    restored = {"run_left_bytes": len(ran), "wrote_back_bytes": len(held),
                "matches_before": back == held,
                "data_od_id_after": len(re.findall(r'data-od-id="', back))}
    CONSOLE.append(f"[harness] restored {os.path.basename(FIXTURE)}: run left "
                   f"{len(ran)} bytes, wrote back {len(held)}, "
                   f"matches_before={back == held}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump({"results": RESULTS, "findings": findings,
                   "fixture_restored": restored, "ids": ids,
                   "surface_left": left}, fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
    print(f"\nfixture restored: {restored}")
    print(f"findings: {findings}")
    sys.exit(0)


if __name__ == "__main__":
    main()
