"""Headless Playwright walk for Phase 3.5-Adobe job 5 — layers on the canvas.

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-05-opus-layers-canvas.md
Shape follows Docs/tests/phase35_03.py — same launch, console capture,
record/shot pair per line, teardown of every surface the run creates.

Fixture: Docs/scratchpad/phase35-magazine.html, copied to
Docs/scratchpad/phase35-05-copy.html for the run. The original is never
opened by the widget; the copy is removed at teardown.

Usage:
    python3 Docs/tests/phase35_05.py --session <sid> \
        --out Docs/Reports/phase35-05/

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
COPY = os.path.join(SCRATCH, "phase35-05-copy.html")

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

CV = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return null;
  const cv = f._canvasState;
  return {
    mode: cv.mode, docMode: cv.docMode, dirty: !!cv.dirty,
    status: cv.statusEl ? cv.statusEl.textContent : "",
    selection: cv.selection.slice(),
    activeLayer: cv.activeLayer,
    resolvedLayer: f._canvas ? f._canvas.activeLayer() : "",
    layers: f._canvas ? f._canvas.layers() : null,
    apiKeys: f._canvas ? Object.keys(f._canvas).sort() : []
  };
}
"""

SET = r"""
(args) => { MX.grid.frames[args.id].setOption(args.key, args.value); }
"""

CALL = r"""
(args) => {
  const api = MX.grid.frames[args.id]._canvas;
  return api[args.fn].apply(api, args.args || []);
}
"""

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"

# a clickable shape inside the svg layer, plus its centre in host px
PICK_SHAPE = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const doc = cv.idoc;
  const host = cv.iframe.getBoundingClientRect();
  const layer = doc.body.querySelector('[data-cc-layer][data-cc-plugin="svg"]')
    || doc.body.querySelector("[data-cc-layer] svg");
  const svg = layer && layer.tagName.toLowerCase() === "svg" ? layer : (layer && layer.querySelector("svg"));
  if (!svg) return null;
  const kids = Array.prototype.slice.call(svg.querySelectorAll("*"));
  for (const el of kids) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 10 && r.height > 10)) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const stack = doc.elementsFromPoint(cx, cy);
    if (stack[0] !== el) continue;
    return {eid: cv.patch.stableId(el), tag: el.tagName.toLowerCase(),
            layer: cv.patch.stableId(el.closest("[data-cc-layer]")),
            centre: {x: host.x + cx, y: host.y + cy}};
  }
  return null;
}
"""

# an absolutely positioned element in a non-svg layer, matched on class
PICK_ABS = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const doc = cv.idoc;
  const win = cv.iwin;
  const host = cv.iframe.getBoundingClientRect();
  const re = new RegExp(args.match, "i");
  const all = Array.prototype.slice.call(
    doc.body.querySelectorAll('[data-cc-layer]:not([data-cc-plugin="svg"]) *'));
  const ok = all.filter((el) => {
    if (el.closest("svg")) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 20 && r.height > 12)) return false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const stack = doc.elementsFromPoint(cx, cy);
    for (const n of stack) {
      if (n === doc.body || n === doc.documentElement) return false;
      if (n.matches(cv.patch.HOST_NODE_SELECTOR)) continue;
      if (n.matches("[data-cc-layer]")) continue;
      if (n.tagName.toLowerCase() === "svg" && n.parentElement
          && n.parentElement.matches("[data-cc-layer]")) continue;
      return n === el || el.contains(n);
    }
    return false;
  });
  const named = ok.filter((el) => re.test(
    (typeof el.className === "string" ? el.className : "") + " " + el.id));
  const el = named[0] || ok[0];
  if (!el) return {eid: null, candidates: ok.length, scanned: all.length};
  const cs = win.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    eid: cv.patch.stableId(el), tag: el.tagName.toLowerCase(),
    cls: (typeof el.className === "string" ? el.className : ""),
    pos: cs.position, left: parseFloat(cs.left), top: parseFloat(cs.top),
    styleLeft: el.style.left, styleTransform: el.style.transform,
    layer: cv.patch.stableId(el.closest("[data-cc-layer]")),
    centre: {x: host.x + r.left + r.width / 2, y: host.y + r.top + r.height / 2},
    candidates: ok.length, scanned: all.length
  };
}
"""

EL_STATE = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const el = cv.patch.find(cv.idoc, args.eid);
  if (!el) return null;
  const cs = cv.iwin.getComputedStyle(el);
  const host = cv.iframe.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    centre: {x: host.x + r.left + r.width / 2, y: host.y + r.top + r.height / 2},
    pos: cs.position,
    hidden: el.hasAttribute("data-cc-hidden"),
    locked: el.hasAttribute("data-cc-locked"),
    display: cs.display,
    styleDisplay: el.style.display,
    styleLeft: el.style.left, styleTop: el.style.top,
    styleTransform: el.style.transform,
    usedLeft: parseFloat(cs.left), usedTop: parseFloat(cs.top),
    parentLayer: el.closest("[data-cc-layer]")
      ? cv.patch.stableId(el.closest("[data-cc-layer]")) : ""
  };
}
"""

MENU_TEXT = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const menu = cv.idoc.querySelector(".cc-canvas-menu");
  if (!menu) return null;
  const rows = Array.prototype.slice.call(menu.children).map((r) => {
    const sub = r.querySelector("[data-cc-submenu]");
    const label = sub ? r.firstChild.textContent : r.textContent;
    return {label: (label || "").replace("▸", "").trim(),
            sub: sub ? Array.prototype.slice.call(sub.children)
              .map((s) => s.textContent.trim()) : null};
  });
  return {rows: rows, text: menu.textContent};
}
"""

LAYER_KIDS = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const layer = cv.patch.find(cv.idoc, args.lid);
  if (!layer) return null;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  return Array.prototype.slice.call(layer.children)
    .filter((c) => !c.matches(skip))
    .map((c) => cv.patch.stableId(c));
}
"""

JOB5_API = ["activeLayer", "addLayer", "hideSelection", "insertAt", "isolate",
            "layerOf", "layers", "lockSelection", "mergeDown", "moveLayer",
            "moveToLayer", "patchMany", "removeLayer", "renameLayer",
            "selectAllOnLayer", "setActiveLayer", "setLayerFlag", "setPage",
            "showAll", "unlockAll"]

MENU_ROWS = ["Group", "Ungroup", "Isolate", "Arrange", "Lock", "Unlock all",
             "Hide", "Show all", "Move to layer", "Duplicate", "Delete"]
ARRANGE_ROWS = ["Bring to front", "Bring forward", "Send backward", "Send to back"]


def drag(page, x0, y0, x1, y1, steps=14):
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=steps)
    page.mouse.move(x1, y1, steps=steps)
    page.wait_for_timeout(120)
    page.mouse.up()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase35-05")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    if not os.path.exists(SOURCE_FIXTURE):
        print(f"MISSING FIXTURE {SOURCE_FIXTURE}")
        sys.exit(1)
    shutil.copyfile(SOURCE_FIXTURE, COPY)
    CONSOLE.append(f"[harness] copy made: {COPY}")

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] cleared a stale grid file at {grid_file}")

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")

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

        # ---- 1. mount, file mode, canvas mode, the job 5 API
        a = p1.evaluate(MOUNT, {"type": "canvas", "target": COPY})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 14, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        loaded = wait_ok(p1, FILE_READY, a, 45000, "file mode ready")
        p1.evaluate(SET, {"id": a, "key": "mode", "value": "canvas"})
        p1.evaluate(SET, {"id": a, "key": "snap", "value": False})
        p1.wait_for_timeout(1000)
        st1 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "01-canvas-mode")
        missing = [k for k in JOB5_API if k not in (st1["apiKeys"] or [])]
        layers = st1["layers"] or []
        ok1 = (loaded and st1["mode"] == "canvas" and not missing and len(layers) >= 2
               and all("plugin" in ly for ly in layers))
        record(1, "Canvas mounts on the copy in canvas mode. Every 3.4 job 2, 4 "
                  "and 5 name is on frame._canvas and layers() reads the sections.",
               ok1, sh,
               f"mode={st1['mode']!r} missing_from_api={missing} layers={layers}")
        if not ok1:
            findings.append("1 — canvas.js mount / frame._canvas / layerList")

        svg_layer = next((ly for ly in layers if ly["plugin"] == "svg"), None)
        text_layer = next((ly for ly in layers if ly["plugin"] != "svg"), None)

        # ---- 2. a locked layer's children never select by click
        shape = p1.evaluate(PICK_SHAPE, a)
        locked = p1.evaluate(CALL, {"id": a, "fn": "setLayerFlag",
                                    "args": [svg_layer["id"] if svg_layer else "",
                                             "locked", True]}) if svg_layer else False
        p1.wait_for_timeout(400)
        if shape:
            p1.mouse.click(shape["centre"]["x"], shape["centre"]["y"])
            p1.wait_for_timeout(400)
        st2 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "02-locked-layer")
        ok2 = bool(shape and locked and st2["selection"] == [])
        record(2, "setLayerFlag locks the svg layer. A click on one of its shapes "
                  "selects nothing.",
               ok2, sh,
               f"shape={shape and shape['tag']} locked={locked} "
               f"selection={st2['selection']} layers={st2['layers']}")
        if not ok2:
            findings.append("2 — canvas.js setLayerFlag / hitGate / closestTarget")

        # ---- 3. unlocked again, the same click selects
        p1.evaluate(CALL, {"id": a, "fn": "setLayerFlag",
                           "args": [svg_layer["id"] if svg_layer else "", "locked", False]})
        p1.wait_for_timeout(400)
        if shape:
            p1.mouse.click(shape["centre"]["x"], shape["centre"]["y"])
            p1.wait_for_timeout(400)
        st3 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "03-unlocked")
        ok3 = bool(st3["selection"])
        record(3, "The lock comes off and the same click selects the shape.",
               ok3, sh, f"selection={st3['selection']}")
        if not ok3:
            findings.append("3 — canvas.js setLayerFlag inverse / hitGate")

        # ---- 4. Cmd-3 hides the pull quote, Cmd-Opt-3 brings it back
        quote = p1.evaluate(PICK_ABS, {"id": a, "match": "pull|quote"})
        have_q = bool(quote and quote.get("eid"))
        if have_q:
            p1.mouse.click(quote["centre"]["x"], quote["centre"]["y"])
            p1.wait_for_timeout(300)
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+3")
            p1.wait_for_timeout(600)
        hid = p1.evaluate(EL_STATE, {"id": a, "eid": quote["eid"]}) if have_q else None
        sh = shot(p1, args.out, "04-hidden")
        ok4a = bool(hid and hid["hidden"] and hid["display"] == "none")
        if have_q:
            p1.evaluate(FOCUS_IFRAME, a)
            p1.keyboard.press("Meta+Alt+3")
            p1.wait_for_timeout(600)
        back = p1.evaluate(EL_STATE, {"id": a, "eid": quote["eid"]}) if have_q else None
        sh = shot(p1, args.out, "04b-shown")
        ok4 = ok4a and bool(back and not back["hidden"] and back["display"] != "none")
        record(4, "Cmd-3 hides the pull quote — data-cc-hidden and display none. "
                  "Cmd-Opt-3 brings it back.",
               ok4, sh, f"quote={quote} hidden={hid} shown={back}")
        if not ok4:
            findings.append("4 — canvas.js hideSelection / showAll / key handler")

        # ---- 5. insertAt lands in the active layer at 100,100
        if text_layer:
            p1.evaluate(CALL, {"id": a, "fn": "setActiveLayer", "args": [text_layer["id"]]})
        p1.wait_for_timeout(300)
        new_id = p1.evaluate(CALL, {"id": a, "fn": "insertAt", "args": [
            '<div style="width:60px;height:24px;background:#ff00ff">x</div>',
            {"x": 100, "y": 100}]})
        p1.wait_for_timeout(600)
        placed = p1.evaluate(EL_STATE, {"id": a, "eid": new_id}) if new_id else None
        st5 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "05-insert-at")
        ok5 = bool(placed and placed["styleLeft"] == "100px" and placed["styleTop"] == "100px"
                   and text_layer and placed["parentLayer"] == text_layer["id"])
        record(5, "insertAt drops a snippet into the active layer at left 100 top 100.",
               ok5, sh,
               f"new_id={new_id} placed={placed} active={st5['resolvedLayer']} "
               f"want_layer={text_layer and text_layer['id']}")
        if not ok5:
            findings.append("5 — canvas.js insertAt / placeHtmlAt / activeLayerEl")

        # ---- 6. a drag of an absolute element lands on left/top
        # the fixture holds no absolutely positioned caption, so the subject is
        # the snippet line 5 inserted — absolute by contract, left 100 top 100
        base = p1.evaluate(EL_STATE, {"id": a, "eid": new_id}) if new_id else None
        have_c = bool(base and base["pos"] == "absolute")
        if have_c:
            p1.mouse.click(base["centre"]["x"], base["centre"]["y"])
            p1.wait_for_timeout(300)
            drag(p1, base["centre"]["x"], base["centre"]["y"],
                 base["centre"]["x"] + 30, base["centre"]["y"])
            p1.wait_for_timeout(800)
        moved = p1.evaluate(EL_STATE, {"id": a, "eid": new_id}) if have_c else None
        sh = shot(p1, args.out, "06-drag-left-top")
        ok6 = bool(moved and base and abs(moved["usedLeft"] - (base["usedLeft"] + 30)) <= 1.5
                   and moved["styleLeft"]
                   and moved["styleTransform"] in ("", "none"))
        record(6, "A 30px drag of an absolute element writes left +30 and leaves "
                  "no transform behind.",
               ok6, sh,
               f"before={base} after={moved}")
        if not ok6:
            findings.append("6 — canvas.js absPlacement / onFilePointerUp")

        # ---- 7. the right-click menu carries every stage 4 row
        target = moved or base or quote
        if target and target.get("centre"):
            p1.mouse.click(target["centre"]["x"], target["centre"]["y"], button="right")
            p1.wait_for_timeout(500)
        menu = p1.evaluate(MENU_TEXT, a)
        sh = shot(p1, args.out, "07-menu")
        labels = [r["label"] for r in menu["rows"]] if menu else []
        arrange = next((r["sub"] for r in (menu["rows"] if menu else [])
                        if r["label"] == "Arrange"), None) or []
        movers = next((r["sub"] for r in (menu["rows"] if menu else [])
                       if r["label"] == "Move to layer"), None) or []
        missing_rows = [r for r in MENU_ROWS if r not in labels]
        missing_arr = [r for r in ARRANGE_ROWS if r not in arrange]
        ok7 = (not missing_rows and not missing_arr and len(movers) == len(layers))
        record(7, "Right-click gives Group, Ungroup, Isolate, Arrange with four "
                  "rows, Lock, Unlock all, Hide, Show all, Move to layer with one "
                  "row per layer, Duplicate, Delete.",
               ok7, sh,
               f"labels={labels} arrange={arrange} move_to_layer={movers} "
               f"missing={missing_rows} missing_arrange={missing_arr}")
        if not ok7:
            findings.append("7 — canvas.js menuItems / menuRows")

        # ---- 8. Cmd-A selects the active layer's children
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Escape")
        p1.wait_for_timeout(300)
        p1.keyboard.press("Meta+a")
        p1.wait_for_timeout(600)
        st8 = p1.evaluate(CV, a)
        kids = p1.evaluate(LAYER_KIDS, {"id": a, "lid": text_layer["id"]}) if text_layer else None
        sh = shot(p1, args.out, "08-select-all")
        ok8 = bool(kids and st8["selection"] and sorted(st8["selection"]) == sorted(kids))
        record(8, "Cmd-A selects every child of the active layer, nothing else.",
               ok8, sh, f"selection={st8['selection']} layer_children={kids}")
        if not ok8:
            findings.append("8 — canvas.js selectAllOnLayer / key handler")

        # ---- 9. console clean
        errs = [c for c in CONSOLE if ":pageerror]" in c or ":console:error]" in c
                or ":http:" in c]
        sh = shot(p1, args.out, "09-console")
        ok9 = not errs
        record(9, "No page errors, no console errors, nothing 404s.",
               ok9, sh,
               f"total_console_lines={len(CONSOLE)}"
               + ("" if ok9 else " ;; " + " ;; ".join(errs[:8])))
        if not ok9:
            findings.append("9 — see console.txt")

        if args.hold:
            time.sleep(args.hold)

        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.evaluate("(ws) => Promise.all(ws.map((w) => MX.grid.removeWidget(w)))", [a])
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
