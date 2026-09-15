"""Headless Playwright walk for Phase 3.5-Adobe job 3 — rulers, guides, snap, zoom.

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-03-opus-rulers-guides-snap.md
Shape follows Docs/tests/phase35_01.py — same launch, console capture,
record/shot pair per line, teardown of every surface the run creates.

Fixture: Docs/scratchpad/phase35-magazine.html, copied to
Docs/scratchpad/phase35-03-copy.html for the run. The original is never
opened by the widget; the copy is removed at teardown.

Usage:
    python3 Docs/tests/phase35_03.py --session <sid> \
        --out Docs/Reports/phase35-03/

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
COPY = os.path.join(SCRATCH, "phase35-03-copy.html")

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
  const body = cv.idoc && cv.idoc.body;
  return {
    mode: cv.mode, docMode: cv.docMode, dirty: !!cv.dirty,
    status: cv.statusEl ? cv.statusEl.textContent : "",
    selection: cv.selection.slice(),
    zoomPct: cv.zoomPct, snap: cv.snap, snapTo: cv.snapTo.slice(),
    rulers: cv.rulers, showGuides: cv.showGuides,
    guides: f._canvas ? f._canvas.guides() : null,
    page: f._canvas ? f._canvas.page() : null,
    bodyAttr: body ? body.getAttribute("data-cc-guides") : null,
    bodyTransform: body ? body.style.transform : "",
    apiKeys: f._canvas ? Object.keys(f._canvas).sort() : []
  };
}
"""

# geometry of one element in page px and in the iframe's viewport px
GEOM = r"""
(args) => {
  const f = MX.grid.frames[args.id];
  const cv = f._canvasState;
  const el = cv.patch.find(cv.idoc, args.eid);
  if (!el) return null;
  const s = cv.zoomPct / 100;
  const o = cv.idoc.body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const host = cv.iframe.getBoundingClientRect();
  return {
    view: {x: r.left, y: r.top, w: r.width, h: r.height},
    page: {x: (r.left - o.left) / s, y: (r.top - o.top) / s,
           w: r.width / s, h: r.height / s},
    origin: {x: o.left, y: o.top}, scale: s,
    host: {x: host.x, y: host.y},
    centre: {x: host.x + r.left + r.width / 2, y: host.y + r.top + r.height / 2}
  };
}
"""

# the selection chrome box the canvas drew, in the iframe's viewport px
CHROME_BOX = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const box = cv.idoc.querySelector(
    "[data-od-edit-guides-layer] .od-edit-guide-box-selected");
  if (!box) return null;
  const r = box.getBoundingClientRect();
  return {x: r.left, y: r.top, w: r.width, h: r.height};
}
"""

RULER_STATE = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const host = cv.idoc.querySelector('[data-od-edit-bridge="rulers"]');
  if (!host) return null;
  const top = host.querySelector('[data-cc-ruler="h"]');
  const left = host.querySelector('[data-cc-ruler="v"]');
  const o = cv.idoc.body.getBoundingClientRect();
  const s = cv.zoomPct / 100;
  // every major tick carries the page px it stands for
  const off = (strip, axis) => Array.prototype.map.call(
    strip.querySelectorAll(".cc-tick-major[data-cc-px]"), (t) => {
      const r = t.getBoundingClientRect();
      const px = Number(t.getAttribute("data-cc-px"));
      const want = (axis === "x" ? o.left : o.top) + px * s;
      return Math.abs(want - (axis === "x" ? r.left : r.top));
    });
  const gaps = off(top, "x").concat(off(left, "y"));
  return {
    strips: [!!top, !!left],
    ticksTop: top.querySelectorAll(".cc-tick").length,
    ticksLeft: left.querySelectorAll(".cc-tick").length,
    nums: top.querySelectorAll(".cc-num").length,
    majors: gaps.length,
    worst: gaps.length ? Math.max.apply(null, gaps) : -1,
    inSaved: (MX.grid.frames[id]._canvas.source().indexOf("data-od-edit-bridge") >= 0)
      || (MX.grid.frames[id]._canvas.source().indexOf("cc-ruler") >= 0)
  };
}
"""

# an element to drag: a pull quote when the fixture has one, else the first
# stamped item in a layer that hit-tests to itself
PICK_ITEM = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const doc = cv.idoc;
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  const skip = cv.patch.HOST_NODE_SELECTOR;
  // function: true for a layer section or an svg layer's own root — canvas.js
  // falls through these the same way on a real click.
  const isLayerOrRoot = (n) => n.matches("[data-cc-layer]")
    || (n.tagName.toLowerCase() === "svg" && n.parentElement
        && n.parentElement.matches("[data-cc-layer]"));
  const resolves = (el, x, y) => {
    const stack = doc.elementsFromPoint(x, y);
    for (const n of stack) {
      if (n === doc.body || n === doc.documentElement) return false;
      if (n.matches(skip) || isLayerOrRoot(n)) continue;
      return n === el;
    }
    return false;
  };
  const ok = (el) => {
    if (el.matches(skip) || el.matches("[data-cc-layer]")) return false;
    if (el.closest("svg")) return false;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!(r.width > 24 && r.height > 24 && r.left > 28 && r.top > 28
          && cx < vw - 28 && cy < vh - 28)) return false;
    return resolves(el, cx, cy);
  };
  const all = Array.prototype.filter.call(
    doc.body.querySelectorAll("[data-cc-layer] *"), ok);
  const pull = all.filter((el) => /pull|quote/i.test(
    (typeof el.className === "string" ? el.className : "")))[0];
  const any = pull || all[0];
  const scanned = doc.body.querySelectorAll("[data-cc-layer] *").length;
  if (!any) return {eid: null, scanned: scanned, candidates: 0, vw: vw, vh: vh};
  return {eid: any.getAttribute("data-od-id") || cv.patch.stableId(any),
          tag: any.tagName.toLowerCase(),
          cls: (typeof any.className === "string" ? any.className : ""),
          scanned: scanned, candidates: all.length};
}
"""

SET = r"""
(args) => { MX.grid.frames[args.id].setOption(args.key, args.value); }
"""

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"

STATUS_SAVED = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "saved");
}
"""

JOB3_API = ["addGuide", "guides", "page", "removeGuide", "snapPoint"]


def drag(page, x0, y0, x1, y1, steps=14):
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=steps)
    page.mouse.move(x1, y1, steps=steps)
    page.wait_for_timeout(120)
    page.mouse.up()


def drag_top_to(page, p1id, eid, page_top, page_ref):
    """Drag one element so its top edge aims at page_top. Returns the new top."""
    g = page_ref.evaluate(GEOM, {"id": p1id, "eid": eid})
    dy = (page_top - g["page"]["y"]) * g["scale"]
    drag(page_ref, g["centre"]["x"], g["centre"]["y"],
         g["centre"]["x"], g["centre"]["y"] + dy)
    page_ref.wait_for_timeout(800)
    after = page_ref.evaluate(GEOM, {"id": p1id, "eid": eid})
    return g, after


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase35-03")
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

        # ---- 1. mount, file mode, canvas mode
        a = p1.evaluate(MOUNT, {"type": "canvas", "target": COPY})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 14, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)
        loaded = wait_ok(p1, FILE_READY, a, 45000, "file mode ready")
        p1.evaluate(SET, {"id": a, "key": "mode", "value": "canvas"})
        p1.wait_for_timeout(1000)
        st1 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "01-canvas-mode")
        missing = [k for k in JOB3_API if k not in st1["apiKeys"]]
        ok1 = (loaded and st1["mode"] == "canvas" and not missing
               and st1["page"] and st1["page"]["w"] > 0)
        record(1, "Canvas mounts on the copy in canvas mode. The 3.4 job 3 API "
                  "is on frame._canvas and page() reads the :root tokens.",
               ok1, sh,
               f"mode={st1['mode']!r} missing_from_api={missing} "
               f"page={st1['page']} zoomPct={st1['zoomPct']}")
        if not ok1:
            findings.append("1 — canvas.js mount / frame._canvas / pageMetrics")

        # ---- 2. zoom to 50%
        item = p1.evaluate(PICK_ITEM, a)
        have = bool(item and item.get("eid"))
        g100 = p1.evaluate(GEOM, {"id": a, "eid": item["eid"]}) if have else None
        if have:
            p1.mouse.click(g100["centre"]["x"], g100["centre"]["y"])
            p1.wait_for_timeout(500)
        p1.evaluate(SET, {"id": a, "key": "zoomPct", "value": 50})
        p1.wait_for_timeout(800)
        g50 = p1.evaluate(GEOM, {"id": a, "eid": item["eid"]}) if have else None
        chrome = p1.evaluate(CHROME_BOX, a)
        st2 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "02-zoom-50")
        halved = bool(g100 and g50 and abs(g50["view"]["w"] - g100["view"]["w"] / 2) <= 1.5)
        page_same = bool(g100 and g50 and abs(g50["page"]["w"] - g100["page"]["w"]) <= 1.5)
        tracks = bool(chrome and g50
                      and abs(chrome["x"] - g50["view"]["x"]) <= 1.5
                      and abs(chrome["y"] - g50["view"]["y"]) <= 1.5
                      and abs(chrome["w"] - g50["view"]["w"]) <= 1.5)
        ok2 = halved and page_same and tracks and st2["zoomPct"] == 50
        record(2, "Zoom to 50%. The element's on-screen box is half its box at "
                  "100%, its page px are unchanged, and the chrome sits on it.",
               ok2, sh,
               f"view_w_100={g100['view']['w'] if g100 else None} "
               f"view_w_50={g50['view']['w'] if g50 else None} "
               f"page_w_100={g100['page']['w'] if g100 else None} "
               f"page_w_50={g50['page']['w'] if g50 else None} "
               f"chrome={chrome} transform={st2['bodyTransform']!r}")
        if not ok2:
            findings.append("2 — canvas.js applyZoom / pageRectFor / paintChrome")

        # ---- 3. rulers read page px
        rul = p1.evaluate(RULER_STATE, a)
        sh = shot(p1, args.out, "03-rulers")
        ok3 = bool(rul and all(rul["strips"]) and rul["ticksTop"] > 4
                   and rul["ticksLeft"] > 4 and rul["nums"] > 0
                   and rul["worst"] >= 0 and rul["worst"] <= 1.5
                   and not rul["inSaved"])
        record(3, "Two ruler strips with ticks. Every number sits where its page "
                  "px land at this zoom. No ruler markup in the saved source.",
               ok3, sh, f"rulers={rul}")
        if not ok3:
            findings.append("3 — canvas.js renderRulers")

        # ---- 4. back to 100%, drag a guide out of the top ruler to y=300
        p1.evaluate(SET, {"id": a, "key": "zoomPct", "value": 100})
        p1.wait_for_timeout(800)
        # the fixture ships data-cc-guides="v:120;h:300", so the new guide must
        # be a value the file did not already carry
        st4a = p1.evaluate(CV, a)
        gref = p1.evaluate(GEOM, {"id": a, "eid": item["eid"]}) if have else None
        if gref:
            hx = gref["host"]["x"] + gref["origin"]["x"] + 200
            drag(p1, hx, gref["host"]["y"] + 10,
                 hx, gref["host"]["y"] + gref["origin"]["y"] + 420)
            p1.wait_for_timeout(900)
        st4 = p1.evaluate(CV, a)
        src_has = p1.evaluate(
            "(id) => MX.grid.frames[id]._canvas.source().indexOf('h:420') >= 0", a)
        sh = shot(p1, args.out, "04-guide-drag")
        ok4 = (st4["guides"] is not None
               and 420 not in (st4a["guides"] or {"h": []})["h"]
               and 420 in st4["guides"]["h"]
               and (st4["bodyAttr"] or "").find("h:420") >= 0 and src_has)
        record(4, "Drag out of the top ruler to y=420. data-cc-guides on body "
                  "gains h:420 and the source holds it.", ok4, sh,
               f"guides_before={st4a['guides']} guides_after={st4['guides']} "
               f"body_attr={st4['bodyAttr']!r} in_source={src_has}")
        if not ok4:
            findings.append("4 — canvas.js startGuideDrag / endGuideDrag / writeGuides")

        # ---- 5. snap to the guide
        p1.evaluate(SET, {"id": a, "key": "snapTo", "value": ["guides", "objects"]})
        p1.evaluate(SET, {"id": a, "key": "snap", "value": True})
        p1.wait_for_timeout(400)
        before5, after5 = drag_top_to(p1, a, item["eid"], 297, p1) if have else (None, None)
        sh = shot(p1, args.out, "05-snap-on")
        ok5 = bool(after5 and abs(after5["page"]["y"] - 300) <= 1)
        record(5, "Snap on. Dragging the item's top to 297 lands it on the guide "
                  "at 300.", ok5, sh,
               f"item={item} top_before={before5['page']['y'] if before5 else None} "
               f"top_after={after5['page']['y'] if after5 else None}")
        if not ok5:
            findings.append("5 — canvas.js snapDrag / snapAxis")

        # ---- 6. Cmd-Z restores
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+z")
        p1.wait_for_timeout(900)
        back6 = p1.evaluate(GEOM, {"id": a, "eid": item["eid"]}) if have else None
        sh = shot(p1, args.out, "06-undo")
        ok6 = bool(back6 and before5
                   and abs(back6["page"]["y"] - before5["page"]["y"]) <= 1)
        record(6, "Cmd-Z puts the item back where the drag started.", ok6, sh,
               f"top_now={back6['page']['y'] if back6 else None} "
               f"top_at_drag_start={before5['page']['y'] if before5 else None}")
        if not ok6:
            findings.append("6 — canvas.js fileUndo")

        # ---- 7. snap off
        p1.evaluate(SET, {"id": a, "key": "snap", "value": False})
        p1.wait_for_timeout(400)
        before7, after7 = drag_top_to(p1, a, item["eid"], 297, p1) if have else (None, None)
        st7 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "07-snap-off")
        ok7 = bool(after7 and abs(after7["page"]["y"] - 297) <= 1 and st7["snap"] is False)
        record(7, "Snap off. The same drag lands at 297.", ok7, sh,
               f"snap={st7['snap']} top_after={after7['page']['y'] if after7 else None}")
        if not ok7:
            findings.append("7 — canvas.js snapDrag off path")

        # ---- 8. save, reload, the guide persists
        p1.evaluate(FOCUS_IFRAME, a)
        p1.keyboard.press("Meta+s")
        saved = wait_ok(p1, STATUS_SAVED, a, 8000, "status reads saved")
        p1.wait_for_timeout(1200)
        with open(COPY) as fh:
            disk = fh.read()
        on_disk = "h:420" in disk
        no_chrome = ("data-od-edit-guides-layer" not in disk
                     and 'data-od-edit-bridge="rulers"' not in disk
                     and "cc-ruler" not in disk
                     and "data-cc-chrome" not in disk)
        p1.evaluate("() => MX.grid.save()")
        p1.wait_for_timeout(800)
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a])
        p1.reload(wait_until="load", timeout=30000)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=20000)
        wait_ok(p1, CANVAS_MOUNTED, a, 30000, "canvas mounted after reload")
        reloaded = wait_ok(p1, FILE_READY, a, 45000, "file ready after reload")
        p1.evaluate(SET, {"id": a, "key": "mode", "value": "canvas"})
        p1.wait_for_timeout(2000)
        st8 = p1.evaluate(CV, a)
        sh = shot(p1, args.out, "08-after-reload")
        ok8 = bool(saved and on_disk and no_chrome and reloaded
                   and st8["guides"] and 420 in st8["guides"]["h"])
        record(8, "Save and reload. The guide is on disk and comes back; no "
                  "ruler, guide layer or chrome stylesheet reached the file.",
               ok8, sh,
               f"status_saved={saved} guides_on_disk={on_disk} "
               f"chrome_kept_out={no_chrome} guides_after_reload={st8['guides']}")
        if not ok8:
            findings.append("8 — canvas.js writeGuides / readGuides / doSave")

        # ---- 9. console
        errs = [c for c in CONSOLE
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c or ":http:404]" in c]
        sh = shot(p1, args.out, "09-final")
        ok9 = len(errs) == 0
        record(9, "Console clean the whole way, nothing 404s.", ok9, sh,
               f"pageerrors={len(PAGEERRORS)} error_warning_404_lines={len(errs)} "
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
