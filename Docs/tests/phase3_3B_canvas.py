"""Headed Playwright harness: Phase 3 job 3B, canvas widget.

Report only. Opens /matrix/<sid>, mounts two canvas widgets, drives the
doc-mode gestures and the file-mode drag and text edit, and writes a
checks dump, a console dump and screenshots.

Usage:
    python3 Docs/tests/phase3_3B_canvas.py --session <sid> \
        --out Docs/Reports/phase3-3B
"""

import argparse
import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROOF_DIR = os.path.join(ROOT, "library", "proof")
DOC_PATH = os.path.join(PROOF_DIR, "3b-doc.json")
HTML_PATH = os.path.join(PROOF_DIR, "3b-doc.html")
DOC2_PATH = os.path.join(PROOF_DIR, "3b-doc2.json")

BUILD_DOC = r"""
async () => {
  const core = await MX.canvasCore();
  const s = core.makeState(core.kit);
  const p1 = s.addPage("Page 1");
  const p2 = s.addPage("Page 2");
  s.setPage(p1);
  const a = s.addWidget(p1, "text.block", {x: 40, y: 40, w: 320, h: 80});
  s.setContent(a, "literal", "Canvas widget proof heading");
  const b = s.addWidget(p1, "text.block", {x: 40, y: 200, w: 320, h: 60});
  s.setContent(b, "literal", "A paragraph of proof text.");
  const c = s.addWidget(p1, "status.badge", {x: 480, y: 40, w: 160, h: 32});
  s.setContent(c, "literal", "badge");
  s.addWidget(p2, "text.block", {x: 20, y: 20, w: 200, h: 40});
  return s.save();
}
"""

MOUNT = r"""
(args) => {
  const inst = MX.grid.addWidget("canvas");
  MX.grid.frames[inst.id].setOption("target", args.target);
  return inst.id;
}
"""

RESIZE = r"""
(args) => {
  const g = MX.grid;
  const inst = g.instances.filter((i) => i.id === args.id)[0];
  inst.slot = {col: args.col, row: 1, w: args.w, h: args.h};
  g._place(g.frames[args.id].el, inst.slot);
  return inst.slot;
}
"""

READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return false;
  const cv = f._canvasState;
  if (cv.docMode === "doc") return !!(cv.idoc && cv.render && cv.state);
  return !!(cv.idoc && cv.source);
}
"""

# box of one iframe element in top-page coordinates
GEO = r"""
(args) => {
  const f = MX.grid.frames[args.id];
  const cv = f._canvasState;
  const host = cv.iframe.getBoundingClientRect();
  const el = args.widgetId
    ? cv.idoc.querySelector('[data-widget-id="' + args.widgetId + '"]')
    : cv.idoc.querySelector(args.sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {x: host.x + r.x, y: host.y + r.y, w: r.width, h: r.height,
          hostX: host.x, hostY: host.y, hostW: host.width, hostH: host.height};
}
"""

STATE = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const out = {docMode: cv.docMode, dirty: cv.dirty, zoom: cv.zoomPct,
               mode: cv.mode, page: cv.pageId, selection: cv.selection.slice(),
               status: cv.statusEl ? cv.statusEl.textContent : ""};
  if (cv.state) {
    const s = cv.state.get();
    const pg = s.pages.filter((p) => p.id === (cv.pageId || s.page))[0];
    out.widgets = pg ? pg.widgets.map((w) => ({id: w.id, box: w.box})) : [];
    out.pages = s.pages.length;
    out.drawn = cv.idoc.querySelectorAll("[data-widget-id]").length;
  }
  if (cv.docMode === "file") {
    out.from = cv.fromDoc;
    out.sourceLen = cv.source.length;
    out.hasTransform = /translate\(/.test(cv.source);
    out.source = cv.source;
  }
  return out;
}
"""


BAR_CLICK = r"""
(args) => {
  const bar = MX.grid.frames[args.id].el.querySelector(".mxcv-bar");
  const btns = Array.prototype.slice.call(bar.querySelectorAll(".mx-btn"));
  const hit = btns.filter((b) => b.textContent === args.label)[0];
  if (!hit) return false;
  hit.click();
  return true;
}
"""


def drag(page, x0, y0, x1, y1, steps=12):
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move(x1, y1, steps=steps)
    page.mouse.up()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3-3b")
    ap.add_argument("--out", default="Docs/Reports/phase3-3B")
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(PROOF_DIR, exist_ok=True)

    console = []
    checks = {}

    # the ADE socket refuses a session that is not open; file frames need it
    req = urllib.request.Request(
        f"http://127.0.0.1:5000/api/sessions/{args.session}/open",
        data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as fh:
        checks["session_open"] = json.loads(fh.read().decode())

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))

        url = f"http://127.0.0.1:5000/matrix/{args.session}?s={args.surface}"
        resp = page.goto(url, wait_until="load", timeout=20000)
        if resp is None or not resp.ok:
            print(f"FAILED TO LOAD: {url}")
            browser.close()
            sys.exit(1)
        page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                               timeout=15000)
        page.wait_for_function("() => window.MX && window.MX.canvasCore", timeout=15000)

        # the doc under test, built with the core so the shape cannot drift
        doc_json = page.evaluate(BUILD_DOC)
        with open(DOC_PATH, "w") as fh:
            fh.write(doc_json)
        with open(DOC2_PATH, "w") as fh:
            fh.write(doc_json)
        if os.path.exists(HTML_PATH):
            os.remove(HTML_PATH)

        # ---- doc mode ----
        a_id = page.evaluate(MOUNT, {"target": DOC_PATH})
        page.evaluate(RESIZE, {"id": a_id, "col": 1, "w": 14, "h": 17})
        page.wait_for_function(READY, arg=a_id, timeout=20000)
        page.wait_for_timeout(400)
        st = page.evaluate(STATE, a_id)
        checks["draws"] = {"drawn": st.get("drawn"), "widgets": len(st.get("widgets", [])),
                           "pages": st.get("pages")}
        first = st["widgets"][0]["id"]
        box_before = st["widgets"][0]["box"]

        # canvas.select on the bus, counted from the page
        page.evaluate("""() => {
          window.__sel = [];
          MX.bus.on("canvas.select", (p) => window.__sel.push(p));
        }""")

        # drag the first widget 80 right, 40 down
        geo = page.evaluate(GEO, {"id": a_id, "widgetId": first})
        drag(page, geo["x"] + 20, geo["y"] + 20, geo["x"] + 100, geo["y"] + 60)
        page.wait_for_timeout(300)
        st = page.evaluate(STATE, a_id)
        checks["drag"] = {"before": box_before, "after": st["widgets"][0]["box"],
                          "dirty": st["dirty"], "status": st["status"],
                          "selection": st["selection"]}

        # save
        page.evaluate(BAR_CLICK, {"id": a_id, "label": "Save"})
        page.wait_for_timeout(1200)
        st = page.evaluate(STATE, a_id)
        with open(DOC_PATH) as fh:
            on_disk = json.load(fh)
        checks["save"] = {"status": st["status"], "dirty": st["dirty"],
                          "disk_box": on_disk["pages"][0]["widgets"][0]["box"]}

        # marquee over the page, then arrows, cmd-d, cmd-z, delete
        hostgeo = page.evaluate(GEO, {"id": a_id, "sel": "#matrix"})
        mq_x = hostgeo["hostX"] + min(700.0, hostgeo["hostW"] - 12)
        mq_y = hostgeo["hostY"] + min(320.0, hostgeo["hostH"] - 12)
        drag(page, hostgeo["x"] + 5, hostgeo["y"] + 5, mq_x, mq_y)
        page.wait_for_timeout(250)
        checks["marquee"] = page.evaluate(STATE, a_id)["selection"]

        page.evaluate("(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()", a_id)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(200)
        checks["nudge"] = page.evaluate(STATE, a_id)["widgets"]

        page.keyboard.press("Meta+z")
        page.wait_for_timeout(200)
        checks["undo"] = page.evaluate(STATE, a_id)["widgets"]

        page.evaluate("(id) => { const cv = MX.grid.frames[id]._canvasState; "
                      "cv.selection = [cv.state.get().pages[0].widgets[0].id]; }", a_id)
        page.keyboard.press("Meta+d")
        page.wait_for_timeout(250)
        checks["duplicate_count"] = len(page.evaluate(STATE, a_id)["widgets"])

        page.keyboard.press("Delete")
        page.wait_for_timeout(250)
        checks["delete_count"] = len(page.evaluate(STATE, a_id)["widgets"])

        # context menu
        geo = page.evaluate(GEO, {"id": a_id, "widgetId":
                                  page.evaluate(STATE, a_id)["widgets"][0]["id"]})
        page.mouse.click(geo["x"] + 20, geo["y"] + 20, button="right")
        page.wait_for_timeout(300)
        checks["context_menu"] = page.evaluate(
            "(id) => { const cv = MX.grid.frames[id]._canvasState; "
            "return cv.menu ? Array.prototype.map.call("
            "cv.menu.children, (c) => c.textContent) : null; }", a_id)
        page.keyboard.press("Escape")
        page.mouse.click(hostgeo["hostX"] + 5, hostgeo["hostY"] + hostgeo["hostH"] - 8)
        page.wait_for_timeout(200)

        # zoom control and cmd-wheel
        page.evaluate("(id) => MX.grid.frames[id].el.querySelectorAll('.mxcv-zoom .mx-btn')[1].click()", a_id)
        page.wait_for_timeout(200)
        zoom_plus = page.evaluate(STATE, a_id)["zoom"]
        page.mouse.move(hostgeo["hostX"] + hostgeo["hostW"] / 2,
                        hostgeo["hostY"] + hostgeo["hostH"] / 2)
        page.keyboard.down("Meta")
        page.mouse.wheel(0, -120)
        page.keyboard.up("Meta")
        page.wait_for_timeout(250)
        checks["zoom"] = {"after_plus": zoom_plus,
                          "after_wheel": page.evaluate(STATE, a_id)["zoom"]}
        page.evaluate("(id) => MX.grid.frames[id].setOption('zoom', 100)", a_id)
        page.wait_for_timeout(200)

        # page tabs
        checks["page_tabs"] = page.evaluate(
            "(id) => Array.prototype.map.call("
            "MX.grid.frames[id].el.querySelectorAll('.mxcv-tab'), (t) => t.textContent)", a_id)

        # export
        page.evaluate(BAR_CLICK, {"id": a_id, "label": "Export"})
        page.wait_for_timeout(1200)
        checks["export_exists"] = os.path.exists(HTML_PATH)
        if checks["export_exists"]:
            with open(HTML_PATH) as fh:
                html = fh.read()
            checks["export_meta"] = [ln for ln in html.split("\n")
                                     if "code-canvas-source" in ln]
            checks["export_len"] = len(html)

        page.screenshot(path=os.path.join(args.out, "doc-mode.png"))

        # fluid width: the page follows the iframe, and a resize rebases it
        checks["fluid"] = page.evaluate(
            "(id) => { const cv = MX.grid.frames[id]._canvasState;"
            "cv.state.setSetting('width', {mode: 'fluid', px: 1280});"
            "const m = cv.idoc.getElementById('matrix');"
            "const before = {css: m.style.width, px: m.clientWidth,"
            " iframe: cv.iframe.clientWidth}; return before; }", a_id)
        page.evaluate(RESIZE, {"id": a_id, "col": 1, "w": 9, "h": 17})
        page.wait_for_timeout(700)
        checks["fluid_after_resize"] = page.evaluate(
            "(id) => { const cv = MX.grid.frames[id]._canvasState;"
            "const m = cv.idoc.getElementById('matrix');"
            "return {css: m.style.width, px: m.clientWidth,"
            " iframe: cv.iframe.clientWidth}; }", a_id)
        page.evaluate(RESIZE, {"id": a_id, "col": 1, "w": 14, "h": 17})
        page.evaluate("(id) => { const cv = MX.grid.frames[id]._canvasState;"
                      "cv.state.setSetting('width', {mode: 'fixed', px: 1280}); }", a_id)
        page.wait_for_timeout(500)

        # preview mode
        page.evaluate("(id) => MX.grid.frames[id].setOption('mode', 'preview')", a_id)
        page.wait_for_timeout(400)
        checks["preview"] = page.evaluate(
            "(id) => { const cv = MX.grid.frames[id]._canvasState; return {"
            "handles: cv.idoc.querySelectorAll('.cc-canvas-handle').length,"
            "grid: cv.idoc.getElementById('matrix').style.backgroundImage,"
            "mode: cv.mode}; }", a_id)
        page.screenshot(path=os.path.join(args.out, "preview-mode.png"))
        page.evaluate("(id) => MX.grid.frames[id].setOption('mode', 'canvas')", a_id)
        page.wait_for_timeout(300)

        # ---- second canvas, second target: no cross-talk ----
        b_id = page.evaluate(MOUNT, {"target": DOC2_PATH})
        page.evaluate(RESIZE, {"id": b_id, "col": 15, "w": 14, "h": 17})
        page.wait_for_function(READY, arg=b_id, timeout=20000)
        page.wait_for_timeout(400)
        page.evaluate("(ids) => { const a = MX.grid.frames[ids[0]]._canvasState;"
                      "const w = a.state.get().pages[0].widgets[0].id;"
                      "a.mirrors.select.emit({ids: [w]}); }", [a_id, b_id])
        page.wait_for_timeout(300)
        checks["two_canvases"] = {
            "a_selection": page.evaluate(STATE, a_id)["selection"],
            "b_selection": page.evaluate(STATE, b_id)["selection"],
            "a_target": page.evaluate("(id) => MX.grid.frames[id].options.target", a_id),
            "b_target": page.evaluate("(id) => MX.grid.frames[id].options.target", b_id),
        }
        checks["bus_canvas_select"] = page.evaluate("() => window.__sel.length")
        checks["bus_canvas_select_sample"] = page.evaluate("() => window.__sel.slice(-2)")
        page.screenshot(path=os.path.join(args.out, "two-canvases.png"))

        # ---- file mode on the exported html ----
        page.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.t)",
                      {"id": b_id, "t": HTML_PATH})
        page.wait_for_function(READY, arg=b_id, timeout=20000)
        page.wait_for_timeout(500)
        st = page.evaluate(STATE, b_id)
        checks["file_mode"] = {"docMode": st["docMode"], "from": st.get("from"),
                               "bar_from": page.evaluate(
                                   "(id) => MX.grid.frames[id]._canvasState.fromEl.textContent", b_id)}

        # drag the first element in the file
        fgeo = page.evaluate(GEO, {"id": b_id, "sel": "body div div"})
        if fgeo:
            drag(page, fgeo["x"] + 10, fgeo["y"] + 10, fgeo["x"] + 70, fgeo["y"] + 50)
            page.wait_for_timeout(400)
        st = page.evaluate(STATE, b_id)
        checks["file_drag"] = {"dirty": st["dirty"], "hasTransform": st["hasTransform"],
                               "status": st["status"]}

        # double-click a text leaf, type, Enter
        tgeo = page.evaluate(GEO, {"id": b_id, "sel": "body div div > *"})
        if tgeo:
            page.mouse.dblclick(tgeo["x"] + tgeo["w"] / 2, tgeo["y"] + tgeo["h"] / 2)
            page.wait_for_timeout(300)
            checks["file_text_session"] = page.evaluate(
                "(id) => { const cv = MX.grid.frames[id]._canvasState;"
                "return cv.textEdit ? cv.textEdit.id : null; }", b_id)
            page.keyboard.press("Meta+a")
            page.keyboard.type("EDITED BY 3B")
            page.keyboard.press("Enter")
            page.wait_for_timeout(400)
        st = page.evaluate(STATE, b_id)
        checks["file_text_edit"] = {"in_source": "EDITED BY 3B" in (st.get("source") or ""),
                                    "dirty": st["dirty"]}

        # save the file, reopen, transform still in the source
        page.evaluate("(id) => { const cv = MX.grid.frames[id]._canvasState;"
                      "cv.frame.send({type: 'save', path: cv.path, content: cv.source,"
                      "inst: cv.frame.id}); }", b_id)
        page.wait_for_timeout(1000)
        page.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.t)",
                      {"id": b_id, "t": HTML_PATH})
        page.wait_for_timeout(1200)
        st = page.evaluate(STATE, b_id)
        checks["file_reopen"] = {"hasTransform": st["hasTransform"],
                                 "edited": "EDITED BY 3B" in (st.get("source") or ""),
                                 "dirty": st["dirty"]}
        page.screenshot(path=os.path.join(args.out, "file-mode.png"))

        # ---- reload: options round-trip ----
        page.evaluate("(id) => MX.grid.frames[id].setOption('mode', 'code')", a_id)
        page.evaluate("(id) => MX.grid.frames[id].setOption('zoom', 75)", a_id)
        page.wait_for_timeout(400)
        checks["options_a"] = page.evaluate("(id) => MX.grid.frames[id].getOptions()", a_id)
        checks["options_b"] = page.evaluate("(id) => MX.grid.frames[id].getOptions()", b_id)

        page.evaluate("() => MX.grid.save()")
        page.wait_for_timeout(600)
        page.reload(wait_until="load")
        page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                               timeout=15000)
        page.wait_for_function(READY, arg=a_id, timeout=20000)
        page.wait_for_timeout(800)
        checks["after_reload_a"] = page.evaluate("(id) => MX.grid.frames[id].getOptions()", a_id)
        checks["after_reload_live"] = page.evaluate(
            "(id) => { const cv = MX.grid.frames[id]._canvasState; return {"
            "zoom: cv.zoomPct, mode: cv.mode, page: cv.pageId,"
            "selection: cv.selection.slice(), drawn: cv.idoc.querySelectorAll("
            "'[data-widget-id]').length}; }", a_id)
        page.screenshot(path=os.path.join(args.out, "after-reload.png"))

        if args.hold:
            page.wait_for_timeout(int(args.hold * 1000))

        # leave the grid as we found it
        page.evaluate("(ids) => { const cv = MX.grid.frames[ids[1]]._canvasState;"
                      "cv.dirty = false; }", [a_id, b_id])
        page.evaluate("(ids) => Promise.all(ids.map((i) => MX.grid.removeWidget(i)))",
                      [a_id, b_id])
        page.wait_for_timeout(600)
        browser.close()

    # the harness's own surface grid file, removed
    grid_file = os.path.join(ROOT, "library", "grids", args.session, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)

    with open(os.path.join(args.out, "checks.json"), "w") as fh:
        json.dump(checks, fh, indent=2)
    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(console))
    slim = dict(checks)
    if isinstance(slim.get("file_text_edit"), dict):
        slim["file_text_edit"] = dict(slim["file_text_edit"])
    print(json.dumps(slim, indent=2)[:9000])
    print("--- CONSOLE ---")
    print("\n".join(console[-40:]))


if __name__ == "__main__":
    main()
