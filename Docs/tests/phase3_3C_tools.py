"""Headed Playwright harness: Phase 3 job 3C, tools widget.

Report only. Opens /matrix/<sid>, mounts a canvas and a Tools widget on one
target, drives every section, then a second canvas for focus/pin, then a
file-mode canvas for the inspector. Writes checks, a console dump and shots.

Usage:
    python3 Docs/tests/phase3_3C_tools.py --session <sid> \
        --out Docs/Reports/phase3-3C
"""

import argparse
import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROOF_DIR = os.path.join(ROOT, "library", "proof")
DOC_PATH = os.path.join(PROOF_DIR, "3c-doc.json")
HTML_PATH = os.path.join(PROOF_DIR, "3c-file.html")

FILE_HTML = (
    "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
    "<title>3C file mode</title>\n</head>\n<body>\n"
    "<div id=\"wrap\">\n<h1>3C heading</h1>\n"
    "<p>Paragraph for the inspector.</p>\n"
    "<a href=\"#one\">a link</a>\n</div>\n</body>\n</html>\n"
)

BUILD_DOC = r"""
async () => {
  const core = await MX.canvasCore();
  const s = core.makeState(core.kit);
  const p1 = s.addPage("Page 1");
  s.setPage(p1);
  const a = s.addWidget(p1, "text.block", {x: 40, y: 40, w: 320, h: 80});
  s.setContent(a, "literal", "Tools widget proof heading");
  const b = s.addWidget(p1, "text.block", {x: 40, y: 200, w: 320, h: 60});
  s.setContent(b, "literal", "A paragraph of proof text.");
  const c = s.addWidget(p1, "container.box", {x: 460, y: 40, w: 300, h: 240});
  return {json: s.save(), ids: {a: a, b: b, c: c}};
}
"""

MOUNT = r"""
(args) => {
  const inst = MX.grid.addWidget(args.type);
  MX.grid.frames[inst.id].setOption("target", args.target);
  return inst.id;
}
"""

RESIZE = r"""
(args) => {
  const g = MX.grid;
  const inst = g.instances.filter((i) => i.id === args.id)[0];
  inst.slot = {col: args.col, row: args.row, w: args.w, h: args.h};
  g._place(g.frames[args.id].el, inst.slot);
  return inst.slot;
}
"""

CANVAS_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return false;
  const cv = f._canvasState;
  if (cv.docMode === "doc") return !!(cv.idoc && cv.render && cv.state);
  return !!(cv.idoc && cv.source);
}
"""

TOOLS_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  return !!(f && f._toolsState && f._toolsState.core && f._toolsState.tools);
}
"""

TOOLS_BODY = r"""
(id) => {
  const f = MX.grid.frames[id];
  const tl = f._toolsState;
  const body = f.el.querySelector(".mxtl-body");
  const pick = (sel) => Array.prototype.map.call(
    body.querySelectorAll(sel), (e) => e.textContent);
  return {
    section: tl.section,
    canvasOpt: tl.canvasOpt,
    focusedInst: tl.focusedInst,
    who: f.el.querySelector(".mxtl-who").textContent,
    titles: pick(".cc-panel-tool-title"),
    rows: pick(".cc-panel-row-id"),
    cards: pick(".cc-nav-card-type"),
    labels: pick(".cc-panel-label > span"),
    text: body.textContent.slice(0, 160)
  };
}
"""

DOC_STATE = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const out = {docMode: cv.docMode, selection: cv.selection.slice()};
  if (cv.state) {
    const s = cv.state.get();
    const pg = s.pages.filter((p) => p.id === (cv.pageId || s.page))[0];
    out.widgets = pg ? pg.widgets.map((w) => ({
      id: w.id, type: w.type, parent: w.parent, hidden: !!w.hidden,
      locked: !!w.locked, content: w.content.value, notes: w.notes})) : [];
    out.pages = s.pages.map((p) => p.name);
    out.page = s.page;
    out.settings = {grid: s.settings.grid, gridStyle: s.settings.gridStyle,
                    width: s.settings.width, palette: s.settings.palette};
    out.drawn = cv.idoc.querySelectorAll("[data-widget-id]").length;
  }
  if (cv.docMode === "file") {
    out.source = cv.source;
    out.sourceLen = cv.source.length;
  }
  return out;
}
"""

GEO = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
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

TYPE_FIELD = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  const labels = Array.prototype.slice.call(body.querySelectorAll(".cc-panel-label"));
  const hit = labels.filter((l) => l.querySelector("span").textContent === args.label)[0];
  if (!hit) return false;
  const input = hit.querySelector("textarea") || hit.querySelector("input");
  if (!input) return false;
  input.value = args.value;
  input.dispatchEvent(new Event("input", {bubbles: true}));
  return true;
}
"""

ROW_DRAG = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  const rows = Array.prototype.slice.call(body.querySelectorAll(".cc-panel-row"));
  const from = rows.filter((r) => r.dataset.id === args.from)[0];
  const to = rows.filter((r) => r.dataset.id === args.to)[0];
  if (!from || !to) return "missing row";
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent("dragstart", {dataTransfer: dt, bubbles: true}));
  const rect = to.getBoundingClientRect();
  const y = rect.top + rect.height * args.frac;
  const opts = {dataTransfer: dt, bubbles: true, cancelable: true,
                clientX: rect.left + 4, clientY: y};
  to.dispatchEvent(new DragEvent("dragover", opts));
  to.dispatchEvent(new DragEvent("drop", opts));
  return dt.getData("text/plain");
}
"""

LIB_DROP = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  if (args.tab) {
    const tabs = Array.prototype.slice.call(body.querySelectorAll(".cc-nav-tab"));
    const t = tabs.filter((x) => x.textContent === args.tab)[0];
    if (!t) return "no tab";
    t.click();
  }
  const cards = Array.prototype.slice.call(body.querySelectorAll(".cc-nav-card"));
  const card = cards.filter((c) =>
    c.querySelector(".cc-nav-card-type").textContent === args.type)[0];
  if (!card) return "no card";
  const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent("dragstart", {dataTransfer: dt, bubbles: true}));
  const cv = MX.grid.frames[args.canvasId]._canvasState;
  const opts = {dataTransfer: dt, bubbles: true, cancelable: true,
                clientX: args.x, clientY: args.y};
  cv.idoc.dispatchEvent(new DragEvent("dragover", opts));
  cv.idoc.dispatchEvent(new DragEvent("drop", opts));
  return dt.getData("text/plain");
}
"""

ROW_BTN = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  const rows = Array.prototype.slice.call(body.querySelectorAll(".cc-panel-row"));
  const row = rows.filter((r) => r.dataset.id === args.widgetId)[0];
  if (!row) return false;
  const btns = row.querySelectorAll(".cc-panel-row-btn");
  btns[args.index].click();
  return true;
}
"""

DROPDOWN = r"""
(id) => Promise.resolve(
  MX.widgetModule("canvas_tools").optionControls.canvas.values(MX.grid.frames[id]))
"""

TAB_CLICK = r"""
(args) => {
  const tabs = MX.grid.frames[args.id].el.querySelectorAll(".mxtl-tab");
  for (const t of tabs) if (t.textContent === args.name) { t.click(); return true; }
  return false;
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3-3c")
    ap.add_argument("--out", default="Docs/Reports/phase3-3C")
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

    with open(HTML_PATH, "w") as fh:
        fh.write(FILE_HTML)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1700, "height": 1000})
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

        built = page.evaluate(BUILD_DOC)
        with open(DOC_PATH, "w") as fh:
            fh.write(built["json"])
        ids = built["ids"]

        # ---- canvas A and Tools on one target ----
        a_id = page.evaluate(MOUNT, {"type": "canvas", "target": DOC_PATH})
        page.evaluate(RESIZE, {"id": a_id, "col": 1, "row": 1, "w": 12, "h": 17})
        page.wait_for_function(CANVAS_READY, arg=a_id, timeout=20000)

        t_id = page.evaluate(MOUNT, {"type": "canvas_tools", "target": DOC_PATH})
        page.evaluate(RESIZE, {"id": t_id, "col": 13, "row": 1, "w": 6, "h": 17})
        page.wait_for_function(TOOLS_READY, arg=t_id, timeout=20000)
        page.wait_for_timeout(400)
        checks["mounted"] = page.evaluate(TOOLS_BODY, t_id)

        # ---- tools section: select a widget, then type ----
        geo = page.evaluate(GEO, {"id": a_id, "widgetId": ids["a"]})
        page.mouse.click(geo["x"] + 20, geo["y"] + 20)
        page.wait_for_timeout(400)
        checks["after_select"] = page.evaluate(TOOLS_BODY, t_id)

        page.evaluate(TYPE_FIELD, {"id": t_id, "label": "Content",
                                   "value": "EDITED BY 3C TOOLS"})
        page.wait_for_timeout(900)
        st = page.evaluate(DOC_STATE, a_id)
        checks["typed"] = {
            "content": [w["content"] for w in st["widgets"]],
            "drawn": st["drawn"],
            "in_iframe": page.evaluate(
                "(id) => MX.grid.frames[id]._canvasState.idoc.body.textContent"
                ".indexOf('EDITED BY 3C TOOLS') >= 0", a_id)}
        page.screenshot(path=os.path.join(args.out, "tools-section.png"))

        # ---- layers: reorder, then reparent into the container ----
        page.evaluate(TAB_CLICK, {"id": t_id, "name": "layers"})
        page.wait_for_timeout(300)
        before = [w["id"] for w in page.evaluate(DOC_STATE, a_id)["widgets"]]
        checks["layers_rows"] = page.evaluate(TOOLS_BODY, t_id)["rows"]

        page.evaluate(ROW_DRAG, {"id": t_id, "from": ids["b"], "to": ids["a"],
                                 "frac": 0.1})
        page.wait_for_timeout(400)
        after = [w["id"] for w in page.evaluate(DOC_STATE, a_id)["widgets"]]
        checks["layers_reorder"] = {"before": before, "after": after}

        page.evaluate(ROW_DRAG, {"id": t_id, "from": ids["b"], "to": ids["c"],
                                 "frac": 0.5})
        page.wait_for_timeout(400)
        st = page.evaluate(DOC_STATE, a_id)
        checks["layers_reparent"] = {w["id"]: w["parent"] for w in st["widgets"]}

        page.evaluate(ROW_BTN, {"id": t_id, "widgetId": ids["a"], "index": 0})
        page.wait_for_timeout(300)
        page.evaluate(ROW_BTN, {"id": t_id, "widgetId": ids["a"], "index": 1})
        page.wait_for_timeout(300)
        st = page.evaluate(DOC_STATE, a_id)
        checks["layers_toggles"] = [{"id": w["id"], "hidden": w["hidden"],
                                     "locked": w["locked"]} for w in st["widgets"]]
        checks["hidden_in_iframe"] = page.evaluate(
            "(args) => { const cv = MX.grid.frames[args.id]._canvasState;"
            "const el = cv.idoc.querySelector('[data-widget-id=\"' + args.w + '\"]');"
            "return el ? el.style.display : 'gone'; }",
            {"id": a_id, "w": ids["a"]})
        page.evaluate(ROW_BTN, {"id": t_id, "widgetId": ids["a"], "index": 0})
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(args.out, "layers-section.png"))

        # ---- part 2: canvas.select {notes: true} lands in the inline textarea ----
        page.evaluate(
            "(args) => MX.bus.emit('canvas.select', {target: args.target,"
            " inst: args.inst, ids: [args.w], notes: true}, {remote: true})",
            {"target": DOC_PATH, "inst": a_id, "w": ids["a"]})
        page.wait_for_timeout(500)
        jumped = page.evaluate(TOOLS_BODY, t_id)
        page.evaluate(
            "(args) => { const ta = MX.grid.frames[args.id].el.querySelector("
            "'.cc-panel-notes-field'); if (!ta) return false; ta.value = args.v;"
            "ta.dispatchEvent(new Event('input', {bubbles: true})); return true; }",
            {"id": t_id, "v": "note written by 3C"})
        page.wait_for_timeout(900)
        checks["notes_inline"] = {
            "section": jumped["section"],
            "focused": page.evaluate(
                "() => document.activeElement ? document.activeElement.className : ''"),
            "notes": [w["notes"] for w in page.evaluate(DOC_STATE, a_id)["widgets"]]}
        page.screenshot(path=os.path.join(args.out, "notes-inline.png"))

        # ---- library: drag a card into the canvas ----
        page.evaluate(TAB_CLICK, {"id": t_id, "name": "library"})
        page.wait_for_timeout(300)
        checks["library_cards"] = page.evaluate(TOOLS_BODY, t_id)["cards"]
        count_before = len(page.evaluate(DOC_STATE, a_id)["widgets"])
        checks["library_drag_payload"] = page.evaluate(
            LIB_DROP, {"id": t_id, "canvasId": a_id, "tab": "status",
                       "type": "status.badge", "x": 120, "y": 360})
        page.wait_for_timeout(500)
        st = page.evaluate(DOC_STATE, a_id)
        checks["library_drop"] = {
            "before": count_before, "after": len(st["widgets"]),
            "types": [w["type"] for w in st["widgets"]]}
        page.screenshot(path=os.path.join(args.out, "library-section.png"))

        # ---- page section ----
        page.evaluate(TAB_CLICK, {"id": t_id, "name": "page"})
        page.wait_for_timeout(300)
        checks["page_labels"] = page.evaluate(TOOLS_BODY, t_id)["labels"]
        page.evaluate(TYPE_FIELD, {"id": t_id, "label": "Grid size", "value": "40"})
        page.wait_for_timeout(900)
        checks["page_grid"] = page.evaluate(DOC_STATE, a_id)["settings"]
        page.evaluate(
            "(id) => { const b = MX.grid.frames[id].el.querySelectorAll('.cc-nav-tab');"
            "for (const t of b) if (t.textContent === '+ Page') { t.click(); return true; }"
            "return false; }", t_id)
        page.wait_for_timeout(600)
        st = page.evaluate(DOC_STATE, a_id)
        checks["page_add"] = {"pages": st["pages"],
                              "canvas_page_option": page.evaluate(
                                  "(id) => MX.grid.frames[id].getOptions().page", a_id),
                              "state_page": st["page"]}
        page.screenshot(path=os.path.join(args.out, "page-section.png"))

        # ---- two canvases: follow, then pin, then close the pinned one ----
        b_id = page.evaluate(MOUNT, {"type": "canvas", "target": DOC_PATH})
        page.evaluate(RESIZE, {"id": a_id, "col": 1, "row": 1, "w": 6, "h": 17})
        page.evaluate(RESIZE, {"id": b_id, "col": 7, "row": 1, "w": 6, "h": 17})
        page.wait_for_function(CANVAS_READY, arg=b_id, timeout=20000)
        page.wait_for_timeout(500)
        checks["dropdown_two"] = page.evaluate(DROPDOWN, t_id)
        checks["dropdown_expected"] = ["focused", a_id, b_id]

        page.evaluate(TAB_CLICK, {"id": t_id, "name": "tools"})
        ga = page.evaluate(GEO, {"id": a_id, "sel": "#matrix"})
        gb = page.evaluate(GEO, {"id": b_id, "sel": "#matrix"})
        page.mouse.click(ga["hostX"] + 20, ga["hostY"] + 20)
        page.wait_for_timeout(400)
        follow_a = page.evaluate(TOOLS_BODY, t_id)
        page.mouse.click(gb["hostX"] + 20, gb["hostY"] + 20)
        page.wait_for_timeout(400)
        follow_b = page.evaluate(TOOLS_BODY, t_id)
        checks["follow_focus"] = {
            "clicked_a": {"a": a_id, "focusedInst": follow_a["focusedInst"],
                          "who": follow_a["who"]},
            "clicked_b": {"b": b_id, "focusedInst": follow_b["focusedInst"],
                          "who": follow_b["who"]}}

        page.evaluate("(args) => MX.grid.frames[args.id].setOption('canvas', args.v)",
                      {"id": t_id, "v": b_id})
        page.wait_for_timeout(300)
        page.mouse.click(ga["hostX"] + 20, ga["hostY"] + 20)
        page.wait_for_timeout(400)
        pinned = page.evaluate(TOOLS_BODY, t_id)
        checks["pinned"] = {"pin": b_id, "clicked": a_id,
                            "focusedInst": pinned["focusedInst"],
                            "who": pinned["who"]}
        page.screenshot(path=os.path.join(args.out, "two-canvases.png"))

        page.evaluate("(id) => { MX.grid.frames[id]._canvasState.dirty = false; }", b_id)
        page.evaluate("(id) => MX.grid.removeWidget(id)", b_id)
        page.wait_for_timeout(700)
        checks["pinned_closed"] = page.evaluate(TOOLS_BODY, t_id)
        page.evaluate("(args) => MX.grid.frames[args.id].setOption('canvas', 'focused')",
                      {"id": t_id, "v": "focused"})
        page.wait_for_timeout(400)
        checks["back_to_focused"] = page.evaluate(TOOLS_BODY, t_id)["who"]

        # ---- file mode inspector ----
        page.evaluate("(id) => { MX.grid.frames[id]._canvasState.dirty = false; }", a_id)
        page.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.t)",
                      {"id": a_id, "t": HTML_PATH})
        page.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.t)",
                      {"id": t_id, "t": HTML_PATH})
        page.wait_for_function(CANVAS_READY, arg=a_id, timeout=20000)
        page.evaluate(RESIZE, {"id": a_id, "col": 1, "row": 1, "w": 12, "h": 17})
        page.wait_for_timeout(800)
        fgeo = page.evaluate(GEO, {"id": a_id, "sel": "h1"})
        page.mouse.click(fgeo["x"] + 10, fgeo["y"] + 10)
        page.wait_for_timeout(600)
        checks["file_select"] = {
            "selection": page.evaluate(DOC_STATE, a_id)["selection"],
            "body": page.evaluate(TOOLS_BODY, t_id)}

        page.evaluate(TYPE_FIELD, {"id": t_id, "label": "color", "value": "rgb(255, 0, 0)"})
        page.wait_for_timeout(1000)
        src = page.evaluate(DOC_STATE, a_id)["source"]
        checks["file_style_patch"] = {
            "has_style": "style=" in src,
            "h1_line": [ln.strip() for ln in src.split("\n") if "<h1" in ln]}

        page.evaluate(TYPE_FIELD, {"id": t_id, "label": "Text", "value": "3C SET TEXT"})
        page.wait_for_timeout(1000)
        src = page.evaluate(DOC_STATE, a_id)["source"]
        checks["file_set_text"] = [ln.strip() for ln in src.split("\n") if "<h1" in ln]
        page.screenshot(path=os.path.join(args.out, "file-mode.png"))

        # ---- reload: options round-trip ----
        page.evaluate(TAB_CLICK, {"id": t_id, "name": "layers"})
        page.wait_for_timeout(300)
        checks["options_before_reload"] = page.evaluate(
            "(id) => MX.grid.frames[id].getOptions()", t_id)
        page.evaluate("() => MX.grid.save()")
        page.wait_for_timeout(700)
        page.evaluate("(id) => { MX.grid.frames[id]._canvasState.dirty = false; }", a_id)
        page.reload(wait_until="load")
        page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                               timeout=15000)
        page.wait_for_function(TOOLS_READY, arg=t_id, timeout=20000)
        page.wait_for_timeout(900)
        checks["options_after_reload"] = page.evaluate(
            "(id) => MX.grid.frames[id].getOptions()", t_id)
        checks["after_reload_body"] = page.evaluate(TOOLS_BODY, t_id)
        page.screenshot(path=os.path.join(args.out, "after-reload.png"))

        if args.hold:
            page.wait_for_timeout(int(args.hold * 1000))

        # leave the grid as we found it
        page.evaluate("(id) => { const f = MX.grid.frames[id];"
                      "if (f && f._canvasState) f._canvasState.dirty = false; }", a_id)
        page.evaluate("(ids) => Promise.all(ids.map((i) => MX.grid.removeWidget(i)))",
                      [a_id, t_id])
        page.wait_for_timeout(700)
        browser.close()

    grid_file = os.path.join(ROOT, "library", "grids", args.session, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)

    with open(os.path.join(args.out, "checks.json"), "w") as fh:
        json.dump(checks, fh, indent=2)
    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(console))
    print(json.dumps(checks, indent=2)[:11000])
    print("--- CONSOLE ---")
    print("\n".join(console[-40:]))


if __name__ == "__main__":
    main()
