"""Headed Playwright pass for Phase 3 — canvas, tools, code, annotate.

Spec: Docs/Specs/Code Canvas port/Phase3 Canvas 2D/SPEC-phase3-3H-opus-headed.md
Extends Docs/tests/phase2_headed.py — same launch pattern (chrome,
headless=False, console + pageerror collected per page), same record/shot
pair per test line. Widget plumbing follows Docs/tests/phase3_3B_canvas.py
and phase3_3C_tools.py, which drove these same widgets.

Usage:
    python3 Docs/tests/phase3_headed.py --session <sid> \
        --out Docs/Reports/phase3-headed/

Every surface this pass creates is removed at the end; the fixture copies
under docs/scratchpad/ are named in the receipt.

Exit code 0 always once the page loads; the receipt is the record.
"""

import argparse
import glob
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(ROOT, "docs", "scratchpad")
FIXTURE = os.path.join(SCRATCH, "fixture.json")
FIXTURE2 = os.path.join(SCRATCH, "fixture2.json")
EXPORT = os.path.join(SCRATCH, "fixture.html")

RESULTS = []
CONSOLE = []
PAGEERRORS = []


def record(num, name, passed, shot, note=""):
    RESULTS.append({"n": num, "name": name, "pass": bool(passed), "shot": shot, "note": note})
    print(f"[{num}] {'PASS' if passed else 'FAIL'} — {name}" + (f" — {note}" if note else ""))


def wire(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"[{tag}:console:{m.type}] {m.text}"))
    page.on("pageerror", lambda e: (PAGEERRORS.append(f"[{tag}:pageerror] {e}"),
                                    CONSOLE.append(f"[{tag}:pageerror] {e}")))


def shot(page, out, name):
    path = os.path.join(out, f"{name}.png")
    try:
        page.screenshot(path=path)
    except Exception as exc:
        CONSOLE.append(f"[harness] screenshot {name} failed: {exc}")
    return path


# ---- page-side snippets (3B / 3C) ----------------------------------------

BUILD_DOC = r"""
async () => {
  const core = await MX.canvasCore();
  const s = core.makeState(core.kit);
  const p1 = s.addPage("Page 1");
  const p2 = s.addPage("Page 2");
  s.setPage(p1);
  const a = s.addWidget(p1, "text.block", {x: 40, y: 40, w: 320, h: 80});
  s.setContent(a, "literal", "Phase 3 headed heading");
  const b = s.addWidget(p1, "text.block", {x: 40, y: 180, w: 320, h: 70});
  s.setContent(b, "literal", "A paragraph of headed proof text.");
  const c = s.addWidget(p1, "status.badge", {x: 40, y: 300, w: 160, h: 32});
  s.setContent(c, "literal", "badge");
  s.addWidget(p2, "text.block", {x: 20, y: 20, w: 200, h: 40});
  return {json: s.save(), ids: {a: a, b: b, c: c}};
}
"""

MOUNT = r"""
(args) => {
  const inst = MX.grid.addWidget(args.type);
  if (args.type === "canvas") MX.grid.frames[inst.id].setOption("mode", "canvas");
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

CODE_READY = r"""
(id) => {
  const f = MX.grid.frames[id];
  return !!(f && f._codeState && f._codeState.editor && f._codeState.core);
}
"""

STATE = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const out = {docMode: cv.docMode, dirty: cv.dirty, zoom: cv.zoomPct,
               mode: cv.mode, page: cv.pageId, selection: cv.selection.slice(),
               status: cv.statusEl ? cv.statusEl.textContent : "",
               frozen: !!cv.frozen, annotateOn: !!cv.annotateOn,
               tracks: (cv.trackNames || []).slice()};
  if (cv.state) {
    const s = cv.state.get();
    const pg = s.pages.filter((p) => p.id === (cv.pageId || s.page))[0];
    out.widgets = pg ? pg.widgets.map((w) => ({id: w.id, box: w.box,
                                               content: w.content.value})) : [];
    out.pages = s.pages.length;
    out.order = Array.prototype.map.call(
      cv.idoc.querySelectorAll("[data-widget-id]"), (e) => e.dataset.widgetId);
    out.drawn = out.order.length;
    out.text = cv.idoc.body ? cv.idoc.body.textContent.slice(0, 300) : "";
  }
  if (cv.docMode === "file") {
    out.from = cv.fromDoc;
    out.barFrom = cv.fromEl ? cv.fromEl.textContent : "";
    out.sourceLen = cv.source.length;
    out.hasTransform = /translate\(/.test(cv.source);
    out.source = cv.source;
  }
  return out;
}
"""

TOOLS_BODY = r"""
(id) => {
  const f = MX.grid.frames[id];
  const tl = f._toolsState;
  const body = f.el.querySelector(".mxtl-body");
  const pick = (sel) => Array.prototype.map.call(
    body.querySelectorAll(sel), (e) => e.textContent);
  const fields = {};
  for (const l of body.querySelectorAll(".cc-panel-label")) {
    const k = l.querySelector("span");
    const i = l.querySelector("input") || l.querySelector("textarea")
      || l.querySelector("select");
    if (k && i) fields[k.textContent] = i.value;
  }
  return {
    section: tl.section, canvasOpt: tl.canvasOpt, focusedInst: tl.focusedInst,
    who: f.el.querySelector(".mxtl-who").textContent,
    titles: pick(".cc-panel-tool-title"),
    rows: pick(".cc-panel-row-id"),
    cards: pick(".cc-nav-card-type"),
    fields: fields
  };
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
  const opts = {dataTransfer: dt, bubbles: true, cancelable: true,
                clientX: rect.left + 4, clientY: rect.top + rect.height * args.frac};
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

TAB_CLICK = r"""
(args) => {
  const tabs = MX.grid.frames[args.id].el.querySelectorAll(".mxtl-tab");
  for (const t of tabs) if (t.textContent === args.name) { t.click(); return true; }
  return false;
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

CODE_STATE = r"""
(id) => {
  const cs = MX.grid.frames[id]._codeState;
  if (!cs || !cs.editor) return null;
  const vr = cs.editor.getVisibleRanges();
  return {view: cs.view, locked: cs.locked, docEditable: cs.docEditable,
          canvasOpt: cs.canvasOpt, focusedInst: cs.focusedInst,
          lockLabel: cs.lockBtn ? cs.lockBtn.textContent : "",
          notice: cs.noticeEl ? cs.noticeEl.textContent : "",
          decor: (cs.decor || []).length,
          index: cs.blocksIndex ? Object.assign({}, cs.blocksIndex) : null,
          visible: vr.length ? [vr[0].startLineNumber, vr[0].endLineNumber] : null,
          lines: cs.editor.getModel() ? cs.editor.getModel().getLineCount() : 0,
          head: cs.editor.getValue().slice(0, 120)};
}
"""

CODE_SET = r"""
(args) => {
  const cs = MX.grid.frames[args.id]._codeState;
  if (!cs || !cs.editor) return false;
  cs.editor.setValue(args.text);
  return true;
}
"""

CODE_GET = r"""
(id) => {
  const cs = MX.grid.frames[id]._codeState;
  return cs && cs.editor ? cs.editor.getValue() : "";
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

TAG_NODES = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const out = {};
  for (const e of cv.idoc.querySelectorAll("[data-widget-id]")) {
    e.__probe = e.dataset.widgetId;
    out[e.dataset.widgetId] = true;
  }
  return out;
}
"""

READ_PROBES = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const out = {};
  for (const e of cv.idoc.querySelectorAll("[data-widget-id]")) {
    out[e.dataset.widgetId] = e.__probe === e.dataset.widgetId;
  }
  return out;
}
"""

ANN_GEO = r"""
(id) => {
  const c = MX.grid.frames[id].el.querySelector(".mxann-canvas");
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return {x: r.x, y: r.y, w: r.width, h: r.height};
}
"""

ANN_BAR = r"""
(args) => {
  const bar = MX.grid.frames[args.id].el.querySelector(".mxann-bar");
  if (!bar) return false;
  if (args.note !== undefined) {
    const n = bar.querySelector(".mxann-note");
    if (n) n.value = args.note;
  }
  const btns = Array.prototype.slice.call(bar.querySelectorAll("button"));
  const hit = btns.filter((b) => b.textContent === args.label)[0];
  if (!hit) return false;
  hit.click();
  return true;
}
"""

ANN_STATUS = r"""
(id) => {
  const s = MX.grid.frames[id].el.querySelector(".mxann-status");
  return s ? s.textContent : "";
}
"""


def drag(page, x0, y0, x1, y1, steps=14):
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move(x1, y1, steps=steps)
    page.mouse.up()


def pngs():
    return set(glob.glob(os.path.join(SCRATCH, "annotate-*.png")))


def post(path, body=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as fh:
        return json.loads(fh.read().decode())


# ---- the pass ------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3-headed")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(SCRATCH, exist_ok=True)
    sid = args.session

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")
    pre_pngs = pngs()
    marker = "3H-" + str(int(time.time()))

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

        built = p1.evaluate(BUILD_DOC)
        ids = built["ids"]
        for path in (FIXTURE, FIXTURE2):
            with open(path, "w") as fh:
                fh.write(built["json"])
        if os.path.exists(EXPORT):
            os.remove(EXPORT)

        # ---- 1. canvas on the fixture draws inside the iframe
        a = p1.evaluate(MOUNT, {"type": "canvas", "target": FIXTURE})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 11, "h": 18})
        p1.wait_for_function(CANVAS_READY, arg=a, timeout=25000)
        p1.wait_for_timeout(700)
        st = p1.evaluate(STATE, a)
        sh = shot(p1, args.out, "01-canvas-draws")
        record(1, "Canvas on the fixture draws inside the iframe",
               st.get("drawn", 0) >= 3 and st["docMode"] == "doc", sh,
               f"docMode={st['docMode']} drawn={st.get('drawn')} "
               f"widgets={len(st.get('widgets', []))} pages={st.get('pages')}")

        # ---- 2. tools beside it, canvas focused, click a widget
        t = p1.evaluate(MOUNT, {"type": "canvas_tools", "target": FIXTURE})
        p1.evaluate(RESIZE, {"id": t, "col": 12, "row": 1, "w": 6, "h": 18})
        p1.wait_for_function(TOOLS_READY, arg=t, timeout=25000)
        p1.wait_for_timeout(500)
        geo = p1.evaluate(GEO, {"id": a, "widgetId": ids["a"]})
        p1.mouse.click(geo["x"] + 20, geo["y"] + 20)
        p1.wait_for_timeout(600)
        body = p1.evaluate(TOOLS_BODY, t)
        sh = shot(p1, args.out, "02-tools-fields")
        ok2 = (body["canvasOpt"] == "focused" and len(body["titles"]) > 0
               and p1.evaluate(STATE, a)["selection"] == [ids["a"]])
        record(2, "Tools beside the canvas, canvas focused: a click shows fields", ok2, sh,
               f"canvasOpt={body['canvasOpt']!r} titles={body['titles']} "
               f"fields={list(body['fields'].keys())} who={body['who']!r}")

        # ---- 3. drag 40px right, tools box x, dirty, cmd-s, file on disk
        before3 = [w for w in p1.evaluate(STATE, a)["widgets"] if w["id"] == ids["a"]][0]
        fields_before = p1.evaluate(TOOLS_BODY, t)["fields"]
        geo = p1.evaluate(GEO, {"id": a, "widgetId": ids["a"]})
        drag(p1, geo["x"] + 20, geo["y"] + 20, geo["x"] + 60, geo["y"] + 20)
        p1.wait_for_timeout(500)
        st = p1.evaluate(STATE, a)
        after3 = [w for w in st["widgets"] if w["id"] == ids["a"]][0]
        fields_after = p1.evaluate(TOOLS_BODY, t)["fields"]
        dirty_status = st["status"]
        dirty_flag = st["dirty"]
        p1.evaluate("(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()", a)
        p1.keyboard.press("Meta+s")
        p1.wait_for_timeout(1600)
        st = p1.evaluate(STATE, a)
        with open(FIXTURE) as fh:
            disk = json.load(fh)
        disk_box = [w for w in disk["pages"][0]["widgets"] if w["id"] == ids["a"]][0]["box"]
        sh = shot(p1, args.out, "03-drag-save")
        moved = after3["box"]["x"] != before3["box"]["x"]
        has_x_field = any(k.lower() in ("x", "left") for k in fields_after)
        ok3 = (moved and dirty_status == "dirty" and st["status"] == "saved"
               and disk_box["x"] == after3["box"]["x"] and has_x_field)
        record(3, "drag 40px right: Tools box x moves, dirty, cmd-s saves, file changed",
               ok3, sh,
               f"box {before3['box']} -> {after3['box']} disk={disk_box} "
               f"status after drag={dirty_status!r} cv.dirty={dirty_flag} "
               f"after_save={st['status']!r} "
               f"tools_box_fields_before={fields_before} after={fields_after} "
               f"x_field_present={has_x_field}")

        # ---- 4. type a new text value in Tools
        p1.evaluate(TYPE_FIELD, {"id": t, "label": "Content", "value": "3H TYPED TEXT"})
        p1.wait_for_timeout(900)
        st = p1.evaluate(STATE, a)
        sh = shot(p1, args.out, "04-tools-typed")
        ok4 = "3H TYPED TEXT" in (st.get("text") or "")
        record(4, "typing in Tools shows on the canvas after the debounce", ok4, sh,
               f"iframe_text={(st.get('text') or '')[:90]!r}")

        # ---- 5. layers: drag the last widget to the top
        p1.evaluate(TAB_CLICK, {"id": t, "name": "layers"})
        p1.wait_for_timeout(400)
        order_before = p1.evaluate(STATE, a)["order"]
        payload = p1.evaluate(ROW_DRAG, {"id": t, "from": order_before[-1],
                                         "to": order_before[0], "frac": 0.1})
        p1.wait_for_timeout(600)
        order_after = p1.evaluate(STATE, a)["order"]
        sh = shot(p1, args.out, "05-layers-reorder")
        ok5 = order_after != order_before and order_after[0] == order_before[-1]
        record(5, "Layers: dragging the last widget to the top reorders the canvas DOM",
               ok5, sh, f"before={order_before} after={order_after} payload={payload!r}")

        # ---- 6. library: drag a card into the canvas
        p1.evaluate(TAB_CLICK, {"id": t, "name": "library"})
        p1.wait_for_timeout(400)
        count_before = len(p1.evaluate(STATE, a)["widgets"])
        hostgeo = p1.evaluate(GEO, {"id": a, "sel": "#matrix"})
        payload6 = p1.evaluate(LIB_DROP, {
            "id": t, "canvasId": a, "tab": "status", "type": "status.badge",
            "x": 140, "y": 420})
        p1.wait_for_timeout(700)
        st = p1.evaluate(STATE, a)
        sh = shot(p1, args.out, "06-library-drop")
        ok6 = len(st["widgets"]) == count_before + 1 and st["drawn"] == len(st["widgets"])
        record(6, "Library: dragging a card into the canvas adds a widget", ok6, sh,
               f"widgets {count_before} -> {len(st['widgets'])} drawn={st['drawn']} "
               f"payload={payload6!r}")

        # ---- 7. marquee two, arrow right, cmd-z
        p1.evaluate(TAB_CLICK, {"id": t, "name": "tools"})
        p1.wait_for_timeout(300)
        g_a = p1.evaluate(GEO, {"id": a, "widgetId": ids["a"]})
        g_b = p1.evaluate(GEO, {"id": a, "widgetId": ids["b"]})
        mq_x0 = min(g_a["x"], g_b["x"]) - 12
        mq_y0 = min(g_a["y"], g_b["y"]) - 12
        mq_x = max(g_a["x"] + g_a["w"], g_b["x"] + g_b["w"]) + 12
        mq_y = max(g_a["y"] + g_a["h"], g_b["y"] + g_b["h"]) + 12
        drag(p1, mq_x0, mq_y0, mq_x, mq_y)
        p1.wait_for_timeout(400)
        sel7 = p1.evaluate(STATE, a)["selection"]
        boxes_before = {w["id"]: dict(w["box"]) for w in p1.evaluate(STATE, a)["widgets"]}
        p1.evaluate("(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()", a)
        p1.keyboard.press("ArrowRight")
        p1.wait_for_timeout(400)
        boxes_nudged = {w["id"]: dict(w["box"]) for w in p1.evaluate(STATE, a)["widgets"]}
        p1.keyboard.press("Meta+z")
        p1.wait_for_timeout(500)
        boxes_undone = {w["id"]: dict(w["box"]) for w in p1.evaluate(STATE, a)["widgets"]}
        sh = shot(p1, args.out, "07-marquee-nudge-undo")
        movedn = [i for i in sel7 if boxes_nudged[i]["x"] != boxes_before[i]["x"]]
        back = [i for i in sel7 if boxes_undone[i]["x"] == boxes_before[i]["x"]]
        ok7 = len(sel7) >= 2 and len(movedn) == len(sel7) and len(back) == len(sel7)
        record(7, "marquee two, arrow right moves both, cmd-z returns both", ok7, sh,
               f"selection={sel7} moved={movedn} returned={back}")

        # ---- 8. second canvas on a second fixture copy
        b = p1.evaluate(MOUNT, {"type": "canvas", "target": FIXTURE2})
        p1.evaluate(RESIZE, {"id": b, "col": 18, "row": 1, "w": 11, "h": 9})
        p1.wait_for_function(CANVAS_READY, arg=b, timeout=25000)
        p1.wait_for_timeout(700)
        ga = p1.evaluate(GEO, {"id": a, "sel": "#matrix"})
        gb = p1.evaluate(GEO, {"id": b, "sel": "#matrix"})
        p1.mouse.click(ga["hostX"] + 20, ga["hostY"] + 20)
        p1.wait_for_timeout(500)
        follow_a = p1.evaluate(TOOLS_BODY, t)
        p1.mouse.click(gb["hostX"] + 20, gb["hostY"] + 20)
        p1.wait_for_timeout(500)
        follow_b = p1.evaluate(TOOLS_BODY, t)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('canvas', args.v)",
                    {"id": t, "v": a})
        p1.wait_for_timeout(400)
        p1.mouse.click(gb["hostX"] + 20, gb["hostY"] + 20)
        p1.wait_for_timeout(500)
        pinned = p1.evaluate(TOOLS_BODY, t)
        sh = shot(p1, args.out, "08-two-canvases")
        ok8 = (follow_a["focusedInst"] == a and follow_b["focusedInst"] == b
               and pinned["canvasOpt"] == a and pinned["who"].endswith(follow_a["who"].split(" ", 1)[-1]))
        record(8, "Tools follows each canvas, then pins to the first and stays", ok8, sh,
               f"a={a} b={b} clicked_a_focused={follow_a['focusedInst']!r} "
               f"clicked_b_focused={follow_b['focusedInst']!r} "
               f"pinned canvasOpt={pinned['canvasOpt']!r} who={pinned['who']!r} "
               f"who_a={follow_a['who']!r} who_b={follow_b['who']!r}")
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('canvas', 'focused')",
                    {"id": t, "v": "focused"})
        p1.wait_for_timeout(300)

        # ---- 9. code widget: scroll to header, unlock, css edit, apply
        c = p1.evaluate(MOUNT, {"type": "canvas_code", "target": FIXTURE})
        p1.evaluate(RESIZE, {"id": c, "col": 18, "row": 10, "w": 11, "h": 9})
        p1.wait_for_function(CODE_READY, arg=c, timeout=30000)
        p1.wait_for_timeout(1200)
        p1.mouse.click(ga["hostX"] + 20, ga["hostY"] + 20)
        p1.wait_for_timeout(400)
        geo = p1.evaluate(GEO, {"id": a, "widgetId": ids["b"]})
        p1.mouse.click(geo["x"] + 20, geo["y"] + 20)
        p1.wait_for_timeout(800)
        cs = p1.evaluate(CODE_STATE, c)
        want_line = (cs["index"] or {}).get(ids["b"], -1) + 1
        scrolled = bool(cs["visible"] and cs["visible"][0] <= want_line <= cs["visible"][1]
                        and cs["decor"] > 0)
        p1.evaluate(TAG_NODES, a)
        p1.evaluate("(id) => MX.grid.frames[id].el.querySelector('.mxcd-btn').click()", c)
        p1.wait_for_timeout(600)
        unlocked = p1.evaluate(CODE_STATE, c)
        text = p1.evaluate(CODE_GET, c)
        lines = text.split("\n")
        hdr = "// " + ids["b"] + " "
        edited = False
        for i, ln in enumerate(lines):
            if ln.startswith(hdr):
                for j in range(i, min(i + 8, len(lines))):
                    if lines[j] == "// css":
                        lines[j + 1] = "outline: 3px solid rgb(0, 128, 0);"
                        edited = True
                        break
                break
        p1.evaluate(CODE_SET, {"id": c, "text": "\n".join(lines)})
        p1.wait_for_timeout(300)
        p1.evaluate("(id) => MX.grid.frames[id].el.querySelector('.mxcd-btn').click()", c)
        p1.wait_for_timeout(500)
        applied = p1.evaluate(MODAL_CLICK, "Apply")
        p1.wait_for_timeout(1200)
        probes = p1.evaluate(READ_PROBES, a)
        css_now = p1.evaluate(
            "(args) => { const cv = MX.grid.frames[args.id]._canvasState;"
            "const e = cv.idoc.querySelector('[data-widget-id=\"' + args.w + '\"]');"
            "return e ? {outline: getComputedStyle(e).outlineColor,"
            " probe: e.__probe === args.w} : null; }", {"id": a, "w": ids["b"]})
        sh = shot(p1, args.out, "09-code-apply")
        others = [k for k, v in probes.items() if k != ids["b"] and v]
        ok9 = (scrolled and edited and applied and css_now
               and not css_now["probe"] and len(others) >= 1)
        record(9, "Code scrolls to the header; a css edit re-renders one widget only",
               ok9, sh,
               f"scrolled={scrolled} want_line={want_line} visible={cs['visible']} "
               f"decor={cs['decor']} lock={unlocked['lockLabel']!r} edited={edited} "
               f"apply_clicked={applied} target_node_replaced={css_now and not css_now['probe']} "
               f"untouched_nodes={others} notice="
               f"{p1.evaluate(CODE_STATE, c)['notice']!r}")

        # ---- 10. code doc view, docEditable, move a box
        p1.evaluate("(id) => MX.grid.frames[id].setOption('docEditable', true)", c)
        p1.evaluate("(id) => MX.grid.frames[id].setOption('view', 'doc')", c)
        p1.wait_for_timeout(900)
        doc_text = p1.evaluate(CODE_GET, c)
        box_before10 = [w for w in p1.evaluate(STATE, a)["widgets"]
                        if w["id"] == ids["c"]][0]["box"]
        try:
            doc = json.loads(doc_text)
            for pg in doc["pages"]:
                for w in pg["widgets"]:
                    if w["id"] == ids["c"]:
                        w["box"]["y"] = int(w["box"]["y"]) + 120
            new_doc = json.dumps(doc, indent=2)
            parsed_ok = True
        except Exception as exc:
            new_doc = doc_text
            parsed_ok = False
            CONSOLE.append(f"[harness] doc view parse failed: {exc}")
        p1.evaluate("(id) => MX.grid.frames[id].el.querySelector('.mxcd-btn').click()", c)
        p1.wait_for_timeout(500)
        p1.evaluate(CODE_SET, {"id": c, "text": new_doc})
        p1.wait_for_timeout(300)
        p1.evaluate("(id) => MX.grid.frames[id].el.querySelector('.mxcd-btn').click()", c)
        p1.wait_for_timeout(500)
        applied10 = p1.evaluate(MODAL_CLICK, "Apply")
        p1.wait_for_timeout(1200)
        box_after10 = [w for w in p1.evaluate(STATE, a)["widgets"]
                       if w["id"] == ids["c"]][0]["box"]
        sh = shot(p1, args.out, "10-code-doc-view")
        ok10 = parsed_ok and applied10 and box_after10["y"] == box_before10["y"] + 120
        record(10, "Code doc view with docEditable: an edited box moves the canvas",
               ok10, sh,
               f"parsed={parsed_ok} apply_clicked={applied10} "
               f"box {box_before10} -> {box_after10} "
               f"notice={p1.evaluate(CODE_STATE, c)['notice']!r}")
        p1.evaluate("(id) => MX.grid.frames[id].setOption('view', 'blocks')", c)
        p1.wait_for_timeout(400)

        # ---- 11. export
        p1.evaluate(BAR_CLICK, {"id": a, "label": "Export"})
        p1.wait_for_timeout(1800)
        exists11 = os.path.exists(EXPORT)
        meta11 = []
        if exists11:
            with open(EXPORT) as fh:
                html = fh.read()
            meta11 = [ln.strip() for ln in html.split("\n") if "code-canvas-source" in ln]
        sh = shot(p1, args.out, "11-export")
        ok11 = exists11 and len(meta11) >= 1
        record(11, "Export writes the HTML next to the doc with the back-link meta",
               ok11, sh, f"path={EXPORT} exists={exists11} meta={meta11}")

        # ---- 12. third canvas on the export: file mode, drag, save, reopen
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 11, "h": 9})
        d = p1.evaluate(MOUNT, {"type": "canvas", "target": EXPORT})
        p1.evaluate(RESIZE, {"id": d, "col": 1, "row": 10, "w": 11, "h": 9})
        p1.wait_for_function(CANVAS_READY, arg=d, timeout=25000)
        p1.wait_for_timeout(800)
        st = p1.evaluate(STATE, d)
        file_mode = st["docMode"] == "file"
        bar_from = st.get("barFrom", "")
        hgeo = p1.evaluate(GEO, {"id": d, "widgetId": ids["a"]})
        if hgeo:
            drag(p1, hgeo["x"] + 12, hgeo["y"] + 10, hgeo["x"] + 82, hgeo["y"] + 60)
            p1.wait_for_timeout(500)
        st = p1.evaluate(STATE, d)
        dragged12 = st.get("hasTransform")
        p1.evaluate(BAR_CLICK, {"id": d, "label": "Save"})
        p1.wait_for_timeout(1600)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.t)",
                    {"id": d, "t": EXPORT})
        p1.wait_for_timeout(1800)
        st = p1.evaluate(STATE, d)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.t)",
                    {"id": c, "t": EXPORT})
        p1.evaluate("(id) => MX.grid.frames[id].setOption('view', 'source')", c)
        p1.wait_for_timeout(1500)
        code_src = p1.evaluate(CODE_GET, c)
        sh = shot(p1, args.out, "12-file-mode")
        ok12 = (file_mode and bar_from.startswith("from ") and dragged12
                and st.get("hasTransform") and "translate(" in code_src)
        record(12, "export opens in file mode, bar reads from <doc>, drag saves and reopens",
               ok12, sh,
               f"docMode={st['docMode']!r} bar={bar_from!r} from={st.get('from')!r} "
               f"transform_after_drag={dragged12} transform_after_reopen={st.get('hasTransform')} "
               f"code_source_has_transform={'translate(' in code_src} "
               f"code_len={len(code_src)}")

        # ---- 13. double-click a text leaf, type, Enter
        tgeo = p1.evaluate(GEO, {"id": d,
                                 "sel": '[data-widget-id="' + ids["b"] + '"] > *'})
        typed13 = False
        if tgeo:
            p1.mouse.dblclick(tgeo["x"] + tgeo["w"] / 2, tgeo["y"] + tgeo["h"] / 2)
            p1.wait_for_timeout(400)
            session13 = p1.evaluate(
                "(id) => { const cv = MX.grid.frames[id]._canvasState;"
                "return cv.textEdit ? cv.textEdit.id : null; }", d)
            p1.keyboard.press("Meta+a")
            p1.keyboard.type("3H INLINE EDIT")
            p1.keyboard.press("Enter")
            p1.wait_for_timeout(600)
            typed13 = True
        else:
            session13 = None
        st = p1.evaluate(STATE, d)
        sh = shot(p1, args.out, "13-file-text-edit")
        ok13 = typed13 and "3H INLINE EDIT" in (st.get("source") or "")
        record(13, "double-click a paragraph, type, Enter: the source changed", ok13, sh,
               f"leaf_found={bool(tgeo)} textEdit={session13!r} "
               f"in_source={'3H INLINE EDIT' in (st.get('source') or '')} dirty={st['dirty']}")

        # ---- 14. annotate: draw and send with each snapshot method
        st = p1.evaluate(STATE, a)
        tracks = st.get("tracks") or []
        sends = {}
        if tracks:
            p1.evaluate("(args) => MX.grid.frames[args.id].setOption('annotateTrack', args.v)",
                        {"id": a, "v": tracks[0]})
        p1.evaluate(BAR_CLICK, {"id": a, "label": "Annotate"})
        p1.wait_for_timeout(600)
        ann_on = p1.evaluate(STATE, a)
        for method in ("none", "raster", "playwright"):
            p1.evaluate("(args) => MX.grid.frames[args.id].setOption('snapshot', args.v)",
                        {"id": a, "v": method})
            p1.wait_for_timeout(300)
            g = p1.evaluate(ANN_GEO, a)
            if not g:
                sends[method] = {"error": "no annotate canvas"}
                continue
            p1.evaluate(ANN_BAR, {"id": a, "label": "box"})
            drag(p1, g["x"] + 60, g["y"] + 60, g["x"] + 200, g["y"] + 160, steps=8)
            p1.wait_for_timeout(300)
            was = pngs()
            p1.evaluate(ANN_BAR, {"id": a, "label": "Send",
                                  "note": f"{marker} {method}"})
            p1.wait_for_timeout(4000)
            sends[method] = {"status": p1.evaluate(ANN_STATUS, a),
                             "new_png": sorted(os.path.basename(x) for x in pngs() - was)}
        sh = shot(p1, args.out, "14-annotate")
        p1.evaluate(BAR_CLICK, {"id": a, "label": "Annotate"})
        p1.wait_for_timeout(400)
        time.sleep(8)
        post(f"/api/sessions/{sid}/save")
        time.sleep(3)
        turns = []
        if tracks:
            jl = os.path.join(ROOT, "archives", sid, tracks[0] + ".jsonl")
            if os.path.exists(jl):
                with open(jl) as fh:
                    turns = [ln for ln in fh if marker in ln]
        made = [m for m in sends if sends[m].get("new_png")]
        ok14 = bool(tracks) and len(made) == 3 and len(turns) >= 3
        record(14, "Annotate: a box sent with none, raster, playwright; PNGs and user turns",
               ok14, sh,
               f"tracks={tracks} annotate_on={ann_on['annotateOn']} "
               f"frozen={ann_on['frozen']} sends={sends} user_turns_in_archive={len(turns)}")

        # ---- 15. preview mode
        errs15 = len(PAGEERRORS)
        p1.evaluate("(id) => MX.grid.frames[id].setOption('mode', 'preview')", a)
        p1.wait_for_timeout(600)
        prev = p1.evaluate(
            "(id) => { const cv = MX.grid.frames[id]._canvasState; return {"
            "handles: cv.idoc.querySelectorAll('.cc-canvas-handle').length,"
            "grid: cv.idoc.getElementById('matrix').style.backgroundImage,"
            "mode: cv.mode}; }", a)
        boxes15 = {w["id"]: dict(w["box"]) for w in p1.evaluate(STATE, a)["widgets"]}
        pgeo = p1.evaluate(GEO, {"id": a, "widgetId": ids["a"]})
        if pgeo:
            drag(p1, pgeo["x"] + 12, pgeo["y"] + 12, pgeo["x"] + 92, pgeo["y"] + 52)
            p1.wait_for_timeout(400)
        boxes15b = {w["id"]: dict(w["box"]) for w in p1.evaluate(STATE, a)["widgets"]}
        sh = shot(p1, args.out, "15-preview")
        ok15 = (prev["handles"] == 0 and prev["grid"] in ("", "none", None, False) and boxes15 == boxes15b
                and len(PAGEERRORS) == errs15)
        record(15, "preview mode: chrome hidden, nothing moves, no new errors", ok15, sh,
               f"handles={prev['handles']} grid={prev['grid']!r} "
               f"moved={boxes15 != boxes15b} new_pageerrors={len(PAGEERRORS) - errs15}")
        p1.evaluate("(id) => MX.grid.frames[id].setOption('mode', 'canvas')", a)
        p1.wait_for_timeout(400)

        # ---- 16. reload
        opts_before = {w: p1.evaluate("(i) => MX.grid.frames[i].getOptions()", w)
                       for w in (a, b, c, d, t)}
        p1.evaluate("() => MX.grid.save()")
        p1.wait_for_timeout(900)
        for w in (a, b, d):
            p1.evaluate("(i) => { MX.grid.frames[i]._canvasState.dirty = false; }", w)
        p1.reload(wait_until="load", timeout=30000)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=20000)
        p1.wait_for_function(CANVAS_READY, arg=a, timeout=30000)
        p1.wait_for_function(TOOLS_READY, arg=t, timeout=30000)
        p1.wait_for_timeout(2500)
        back = p1.evaluate("(ws) => ws.filter((w) => !!MX.grid.frames[w])",
                           [a, b, c, d, t])
        opts_after = {w: p1.evaluate("(i) => MX.grid.frames[i] ? "
                                     "MX.grid.frames[i].getOptions() : null", w)
                      for w in (a, b, c, d, t)}
        diffs = {}
        canvas_ids = (a, b, d)
        followers = (c, t)
        canvas_targets_after = {w: (opts_after[w] or {}).get("target") for w in canvas_ids}
        for w in (a, b, c, d, t):
            if not opts_after[w]:
                diffs[w] = "gone"
                continue
            bad = {}
            for k in opts_before[w]:
                bv, av = opts_before[w].get(k), opts_after[w].get(k)
                if json.dumps(bv) == json.dumps(av):
                    continue
                # canvas: mode always reads back "preview" after reload
                if w in canvas_ids and k == "mode" and av == "preview":
                    continue
                # code/tools: target follows the bound canvas's target after reload
                if w in followers and k == "target" and av in canvas_targets_after.values():
                    continue
                # canvas: targets picks up its own target on remount, once
                if w in canvas_ids and k == "targets" and isinstance(bv, list) and \
                        av == bv + [opts_after[w].get("target")]:
                    continue
                bad[k] = [bv, av]
            if bad:
                diffs[w] = bad
        sh = shot(p1, args.out, "16-after-reload")
        ok16 = len(back) == 5 and not diffs
        record(16, "reload returns every widget with its options", ok16, sh,
               f"returned={len(back)}/5 diffs={json.dumps(diffs)[:600]}")

        # ---- 17. close an unrelated widget
        st_a = p1.evaluate(STATE, a)
        st_b = p1.evaluate(STATE, b)
        q = p1.evaluate(MOUNT, {"type": "queue_log"})
        p1.wait_for_timeout(900)
        p1.evaluate("(i) => MX.grid.removeWidget(i)", q)
        p1.wait_for_timeout(1000)
        st_a2 = p1.evaluate(STATE, a)
        st_b2 = p1.evaluate(STATE, b)
        sh = shot(p1, args.out, "17-unrelated-close")
        ok17 = (st_a2["drawn"] == st_a["drawn"] and st_b2["drawn"] == st_b["drawn"]
                and st_a2["selection"] == st_a["selection"]
                and st_b2["selection"] == st_b["selection"])
        record(17, "closing an unrelated widget leaves both canvases as they were", ok17, sh,
               f"a drawn {st_a['drawn']} -> {st_a2['drawn']} sel {st_a['selection']} -> "
               f"{st_a2['selection']}; b drawn {st_b['drawn']} -> {st_b2['drawn']} "
               f"sel {st_b['selection']} -> {st_b2['selection']}")

        # ---- 18. zero pageerrors
        sh = shot(p1, args.out, "18-final")
        record(18, "zero pageerrors across the pass", len(PAGEERRORS) == 0, sh,
               " ;; ".join(PAGEERRORS[:6]) if PAGEERRORS else "none")

        if args.hold:
            time.sleep(args.hold)

        # every surface this pass made comes back down
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    "if (f && f._canvasState) f._canvasState.dirty = false; } }",
                    [a, b, d])
        p1.evaluate("(ws) => Promise.all(ws.map((w) => MX.grid.removeWidget(w)))",
                    [a, b, c, d, t])
        p1.wait_for_timeout(1200)
        left = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        CONSOLE.append(f"[harness] widgets left on the surface: {left}")
        browser.close()

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] removed {grid_file}")

    new_pngs = sorted(os.path.basename(x) for x in pngs() - pre_pngs)
    CONSOLE.append(f"[harness] annotate PNGs written: {new_pngs}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump(RESULTS, fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
        if r["note"]:
            print(f"      {r['note'][:400]}")
    print(f"\nfixtures left: {FIXTURE}, {FIXTURE2}, {EXPORT}")
    print(f"annotate PNGs: {new_pngs}")
    sys.exit(0)


if __name__ == "__main__":
    main()
