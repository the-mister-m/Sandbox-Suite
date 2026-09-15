"""Headless Playwright walk for Phase 3.5-Adobe job 1 — doc mode stripped.

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-01-opus-strip-doc-mode.md
Shape follows Docs/tests/phase3F_headed.py — same launch, console capture,
record/shot pair per line, teardown of every surface the run creates.

Fixture: Docs/scratchpad/phase35-magazine.html, copied to
Docs/scratchpad/phase35-01-copy.html for the run. The original is never
opened by the widget; the copy is removed at teardown.

Usage:
    python3 Docs/tests/phase35_01.py --session <sid> \
        --out Docs/Reports/phase35-01/

Exit code 0 once the page loads; the receipt is the record.
"""

import argparse
import json
import os
import shutil
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(ROOT, "Docs", "scratchpad")
SOURCE_FIXTURE = os.path.join(SCRATCH, "phase35-magazine.html")
COPY = os.path.join(SCRATCH, "phase35-01-copy.html")
JSON_TARGET = os.path.join(SCRATCH, "phase35-01-copy.json")

RESULTS = []
CONSOLE = []
PAGEERRORS = []


def record(num, name, passed, shot_path, note=""):
    RESULTS.append({"n": num, "name": name, "pass": bool(passed),
                    "shot": os.path.basename(shot_path or ""), "note": note})
    print(f"[{num}] {'PASS' if passed else 'FAIL'} — {name}"
          + (f"\n      {note}" if note else ""))


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
  return !!(f && f._toolsState && f._toolsState.core);
}
"""

CV = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return null;
  const cv = f._canvasState;
  return {
    mode: cv.mode, docMode: cv.docMode, path: cv.path,
    targets: cv.targets.slice(), selection: cv.selection.slice(),
    dirty: !!cv.dirty, status: cv.statusEl ? cv.statusEl.textContent : "",
    sourceLen: (cv.source || "").length,
    bodyKids: cv.idoc && cv.idoc.body ? cv.idoc.body.children.length : -1,
    canUndo: cv.history ? cv.history.canUndo() : null,
    canRedo: cv.history ? cv.history.canRedo() : null,
    optMode: f.options.mode,
    apiKeys: f._canvas ? Object.keys(f._canvas).sort() : []
  };
}
"""

# two adjacent element siblings whose own box hit-tests to themselves
PICK_SIBLINGS = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  if (!cv.idoc || !cv.idoc.body) return null;
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  // function: true for a layer section or an svg layer's own root — canvas.js
  // falls through these the same way on a real click.
  const isLayerOrRoot = (n) => n.matches("[data-cc-layer]")
    || (n.tagName.toLowerCase() === "svg" && n.parentElement
        && n.parentElement.matches("[data-cc-layer]"));
  // function: what a real click at x,y resolves to, layer/svg-root skipped.
  const resolves = (el, x, y) => {
    const stack = doc.elementsFromPoint(x, y);
    for (const n of stack) {
      if (n === doc.body || n === doc.documentElement) return false;
      if (n.matches(skip) || isLayerOrRoot(n)) continue;
      return n === el;
    }
    return false;
  };
  const probe = (el, r) => {
    const xs = [0.08, 0.5, 0.92], ys = [0.08, 0.5, 0.92];
    for (const fy of ys) for (const fx of xs) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 1 || y < 1 || x > vw - 1 || y > vh - 1) continue;
      if (resolves(el, x, y)) return {x: x, y: y};
    }
    return null;
  };
  const fits = (r) => r.width > 14 && r.height > 14 && r.top >= 0 && r.left >= 0
    && r.bottom <= vh && r.right <= vw;
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

# a text leaf that hit-tests to itself, for the text edit line
PICK_TEXT_LEAF = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  if (!cv.idoc || !cv.idoc.body) return null;
  const doc = cv.idoc, host = cv.iframe.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  // function: true for a layer section or an svg layer's own root — canvas.js
  // falls through these the same way on a real click.
  const isLayerOrRoot = (n) => n.matches("[data-cc-layer]")
    || (n.tagName.toLowerCase() === "svg" && n.parentElement
        && n.parentElement.matches("[data-cc-layer]"));
  // function: what a real click at x,y resolves to, layer/svg-root skipped.
  const resolves = (el, x, y) => {
    const stack = doc.elementsFromPoint(x, y);
    for (const n of stack) {
      if (n === doc.body || n === doc.documentElement) return false;
      if (n.matches(skip) || isLayerOrRoot(n)) continue;
      return n === el;
    }
    return false;
  };
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
      if (!resolves(el, x, y)) continue;
      return {id: el.getAttribute("data-od-id") || cv.patch.stableId(el),
              tag: el.tagName.toLowerCase(),
              text: own.slice(0, 80), pt: {x: host.x + x, y: host.y + y}};
    }
    return null;
  };
  return scan("p") || scan("p, h1, h2, h3, h4, span, li, td, div");
}
"""

# slot of an id among its non-host siblings, live document and held source
SLOT = r"""
(args) => {
  const f = MX.grid.frames[args.id];
  const cv = f._canvasState;
  if (!cv.idoc) return null;
  const src = cv.patch.parse(f._canvas.source());
  const slotOf = (doc, id) => {
    const el = cv.patch.find(doc, id);
    if (!el || !el.parentElement) return -1;
    return Array.prototype.filter.call(el.parentElement.children,
      (c) => !c.matches(cv.patch.HOST_NODE_SELECTOR)).indexOf(el);
  };
  return {live: slotOf(cv.idoc, args.gid), source: src ? slotOf(src, args.gid) : -1};
}
"""

LAYER_ROWS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  return Array.prototype.map.call(el.querySelectorAll(".cc-panel-row"), (r) => ({
    name: (r.querySelector(".cc-panel-row-name") || {}).textContent || "",
    tags: Array.prototype.map.call(r.querySelectorAll(".cc-panel-row-content"),
      (c) => c.textContent),
    active: r.classList.contains("cc-panel-row-active")
  }));
}
"""

TAB_LABELS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  return Array.prototype.map.call(el.querySelectorAll(".mxtl-tab"),
    (t) => t.textContent);
}
"""

SRC_HAS = r"""
(args) => {
  const s = MX.grid.frames[args.id]._canvas.source();
  return {hit: s.indexOf(args.needle) >= 0, len: s.length};
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

STATUS_REFUSED = r"""
(id) => {
  const f = MX.grid.frames[id];
  const cv = f && f._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "target must be .html");
}
"""

# every name contract 3.4 job 1 keeps on frame._canvas
STAY = ["back", "doc", "duplicate", "forward", "freeze", "front", "group",
        "menuItems", "mode", "move", "patchSource", "redo", "redraw", "remove",
        "selected", "source", "toBack", "undo", "ungroup"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase35-01")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    if not os.path.exists(SOURCE_FIXTURE):
        print(f"MISSING FIXTURE {SOURCE_FIXTURE}")
        sys.exit(1)
    shutil.copyfile(SOURCE_FIXTURE, COPY)
    with open(COPY) as fh:
        held = fh.read()
    CONSOLE.append(f"[harness] copy made: {COPY}, {len(held)} bytes")

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] cleared a stale grid file at {grid_file}")

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")

    typed = "phase35-01 " + str(int(time.time()))
    findings = []
    left = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
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
        CONSOLE.append(f"[harness] ade socket live: {socket_live}")

        stale = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        if stale:
            p1.evaluate("() => { for (const f of Object.values(MX.grid.frames))"
                        " if (f._canvasState) f._canvasState.dirty = false; }")
            p1.evaluate("() => Promise.all(MX.grid.instances.map((i) => i.id)"
                        ".map((id) => MX.grid.removeWidget(id)))")
            p1.wait_for_timeout(1500)
        CONSOLE.append(f"[harness] widgets on the surface at start: {stale}")

        # ---- 1. mount Canvas + Tools + Targets on the copy
        a = p1.evaluate(MOUNT, {"type": "canvas", "target": COPY})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 12, "h": 18})
        t = p1.evaluate(MOUNT, {"type": "canvas_tools", "target": COPY})
        p1.evaluate(RESIZE, {"id": t, "col": 13, "row": 1, "w": 6, "h": 12})
        g = p1.evaluate(MOUNT, {"type": "canvas_targets", "target": COPY})
        p1.evaluate(RESIZE, {"id": g, "col": 13, "row": 13, "w": 6, "h": 6})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        loaded = wait_ok(p1, FILE_READY, a, 45000, "file mode ready")
        wait_ok(p1, TOOLS_READY, t, 25000, "tools mounted")
        p1.wait_for_timeout(1200)
        st1 = p1.evaluate(CV, a)
        tabs1 = p1.evaluate(TAB_LABELS, t)
        sh = shot(p1, args.out, "01-mounted")
        stay_ok = [k for k in STAY if k not in st1["apiKeys"]]
        gone_ok = [k for k in ("state", "place") if k in st1["apiKeys"]]
        ok1 = (loaded and st1["docMode"] == "file" and st1["bodyKids"] > 0
               and not stay_ok and not gone_ok
               and tabs1[:4] == ["tools", "layers", "snippets", "pages"])
        record(1, "Canvas, Tools and Targets mount on the copy. File mode loads. "
                  "Tools shows four tabs. frame._canvas keeps the 3.4 stay list.",
               ok1, sh,
               f"docMode={st1['docMode']!r} bodyKids={st1['bodyKids']} "
               f"sourceLen={st1['sourceLen']} status={st1['status']!r} "
               f"tools_tabs={tabs1} missing_from_api={stay_ok} "
               f"still_on_api={gone_ok}")
        if not ok1:
            findings.append("1 — canvas.js mount/loadTarget, tools.js SECTIONS, "
                            "canvas.js frame._canvas")

        # ---- 2. canvas mode
        p1.evaluate("(i) => MX.grid.frames[i].setOption('mode', 'canvas')", a)
        p1.wait_for_timeout(700)
        st2 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "02-canvas-mode")
        ok2 = st2["mode"] == "canvas"
        record(2, "Canvas mode.", ok2, sh, f"mode={st2['mode']!r}")
        if not ok2:
            findings.append("2 — canvas.js setMode")

        # ---- 3. click an element
        pair = p1.evaluate(PICK_SIBLINGS, a)
        sel3 = []
        if pair:
            p1.mouse.click(pair["aPt"]["x"], pair["aPt"]["y"])
            p1.wait_for_timeout(600)
            sel3 = p1.evaluate(CV, a)["selection"]
        sh = shot(p1, args.out, "03-click")
        ok3 = bool(pair) and sel3 == [pair["aId"]]
        record(3, "Click an element. It selects.", ok3, sh,
               f"pair={pair['aTag'] if pair else None}+{pair['bTag'] if pair else None} "
               f"in {pair['parentTag'] if pair else None}; selection={sel3}")
        if not ok3:
            findings.append("3 — canvas.js onFileClick / setSelection")

        # ---- 4. shift-click a sibling
        sel4 = []
        if pair:
            p1.keyboard.down("Shift")
            p1.mouse.click(pair["bPt"]["x"], pair["bPt"]["y"])
            p1.keyboard.up("Shift")
            p1.wait_for_timeout(600)
            sel4 = p1.evaluate(CV, a)["selection"]
        sh = shot(p1, args.out, "04-shift-click")
        ok4 = len(sel4) == 2 and pair and pair["bId"] in sel4
        record(4, "Shift-click a sibling. Both are selected.", ok4, sh,
               f"selection={sel4}")
        if not ok4:
            findings.append("4 — canvas.js onFileClick shift branch")

        # ---- 5. Cmd-G, the group row shows in layers
        p1.evaluate("(i) => MX.grid.frames[i].setOption('section', 'layers')", t)
        p1.wait_for_timeout(500)
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+g")
        p1.wait_for_timeout(1000)
        st5 = p1.evaluate(CV, a)
        gid = st5["selection"][0] if st5["selection"] else ""
        rows5 = p1.evaluate(LAYER_ROWS, t)
        grouped_rows = [r for r in rows5 if "group" in r["tags"]]
        sh = shot(p1, args.out, "05-group")
        ok5 = bool(gid) and len(grouped_rows) >= 1
        record(5, "Cmd-G. A group row shows in layers.", ok5, sh,
               f"group_id={gid!r} layer_rows={len(rows5)} "
               f"rows_tagged_group={[r['name'] for r in grouped_rows]}")
        if not ok5:
            findings.append("5 — canvas.js fileGroup, tools.js renderLayers")

        # ---- 6. Cmd-[
        slot_before = p1.evaluate(SLOT, {"id": a, "gid": gid}) if gid else None
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+[")
        p1.wait_for_timeout(900)
        slot_after = p1.evaluate(SLOT, {"id": a, "gid": gid}) if gid else None
        sh = shot(p1, args.out, "06-send-backward")
        ok6 = bool(slot_before and slot_after
                   and slot_after["live"] == max(0, slot_before["live"] - 1)
                   and slot_after["source"] == slot_after["live"])
        record(6, "Cmd-[ sends the group backward one slot.", ok6, sh,
               f"slot_before={slot_before} slot_after={slot_after}")
        if not ok6:
            findings.append("6 — canvas.js fileOrder / onFileKeyDown BracketLeft")

        # ---- 7. Cmd-Z twice
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+z")
        p1.wait_for_timeout(700)
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+z")
        p1.wait_for_timeout(900)
        st7 = p1.evaluate(CV, a)
        gone = p1.evaluate(SRC_HAS, {"id": a, "needle": gid}) if gid else {"hit": False}
        sh = shot(p1, args.out, "07-undo-twice")
        ok7 = bool(gid) and not gone["hit"] and st7["canRedo"] is True
        record(7, "Cmd-Z twice. The order move and the group are both undone.",
               ok7, sh,
               f"group_still_in_source={gone['hit']} canUndo={st7['canUndo']} "
               f"canRedo={st7['canRedo']} sourceLen={st7['sourceLen']}")
        if not ok7:
            findings.append("7 — canvas.js fileUndo / patch.js inverses")

        # ---- 8. double-click a text leaf, type, Enter
        leaf = p1.evaluate(PICK_TEXT_LEAF, a)
        typed_in = False
        if leaf:
            p1.mouse.dblclick(leaf["pt"]["x"], leaf["pt"]["y"])
            p1.wait_for_timeout(600)
            p1.keyboard.press("Meta+a")
            p1.keyboard.type(typed)
            p1.wait_for_timeout(400)
            p1.keyboard.press("Enter")
            p1.wait_for_timeout(900)
            typed_in = p1.evaluate(SRC_HAS, {"id": a, "needle": typed})["hit"]
        st8 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "08-text-edit")
        ok8 = bool(leaf) and typed_in and st8["dirty"]
        record(8, "Double-click a text leaf, type, Enter. The edit is in the source.",
               ok8, sh,
               f"leaf={leaf['tag'] if leaf else None} "
               f"was={(leaf['text'][:40] if leaf else None)!r} "
               f"typed_in_source={typed_in} dirty={st8['dirty']}")
        if not ok8:
            findings.append("8 — canvas.js makeEditable / finishTextEdit")

        # ---- 9. Save
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+s")
        saved_status = wait_ok(p1, STATUS_SAVED, a, 6000, "status reads saved")
        p1.wait_for_timeout(1200)
        with open(COPY) as fh:
            disk = fh.read()
        sh = shot(p1, args.out, "09-save")
        on_disk = typed in disk
        ok9 = saved_status and on_disk
        record(9, "Save. Status reads saved and the edit is on disk.", ok9, sh,
               f"status_reached_saved={saved_status} text_on_disk={on_disk} "
               f"file_bytes={len(disk)}")
        if not ok9:
            findings.append("9 — canvas.js doSave")

        # ---- 10. reload, the edit persists
        p1.evaluate("() => MX.grid.save()")
        p1.wait_for_timeout(1000)
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.reload(wait_until="load", timeout=30000)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=20000)
        wait_ok(p1, CANVAS_MOUNTED, a, 30000, "canvas mounted after reload")
        reloaded = wait_ok(p1, FILE_READY, a, 45000, "file ready after reload")
        p1.wait_for_timeout(2000)
        st10 = p1.evaluate(CV, a)
        back = p1.evaluate(SRC_HAS, {"id": a, "needle": typed})["hit"]
        sh = shot(p1, args.out, "10-after-reload")
        ok10 = reloaded and back and st10["bodyKids"] > 0
        record(10, "Reload. The edit persists.", ok10, sh,
               f"file_ready={reloaded} edit_back_in_source={back} "
               f"bodyKids={st10['bodyKids']} path={os.path.basename(st10['path'])}")
        if not ok10:
            findings.append("10 — canvas.js loadTarget after reload")

        # ---- 11. a .json target is refused
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.path)",
                    {"id": a, "path": JSON_TARGET})
        refused = wait_ok(p1, STATUS_REFUSED, a, 8000, "json target refused")
        p1.wait_for_timeout(600)
        st11 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "11-json-refused")
        ok11 = refused and st11["docMode"] == ""
        record(11, "A .json target is refused with 'target must be .html'.", ok11, sh,
               f"status={st11['status']!r} docMode={st11['docMode']!r}")
        if not ok11:
            findings.append("11 — canvas.js modeForTarget / loadTarget status")

        # ---- 12. console
        errs = [c for c in CONSOLE
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c or ":http:404]" in c]
        sh = shot(p1, args.out, "12-final")
        ok12 = len(errs) == 0
        record(12, "Console clean the whole way, nothing 404s.", ok12, sh,
               f"pageerrors={len(PAGEERRORS)} error_warning_404_lines={len(errs)} "
               f"total_console_lines={len(CONSOLE)}"
               + ("" if ok12 else " ;; " + " ;; ".join(errs[:8])))
        if not ok12:
            findings.append("12 — see console.txt")

        if args.hold:
            time.sleep(args.hold)

        # teardown: every widget this run made comes back down
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.evaluate("(ws) => Promise.all(ws.map((w) => MX.grid.removeWidget(w)))",
                    [a, t, g])
        p1.wait_for_timeout(1500)
        left = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        CONSOLE.append(f"[harness] widgets left on the surface: {left}")
        browser.close()

    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] removed {grid_file}")

    if os.path.exists(COPY):
        os.remove(COPY)
        CONSOLE.append(f"[harness] removed the copy {COPY}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump({"results": RESULTS, "findings": findings,
                   "surface_left": left}, fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
    print(f"\nfindings: {findings}")
    sys.exit(0)


if __name__ == "__main__":
    main()
