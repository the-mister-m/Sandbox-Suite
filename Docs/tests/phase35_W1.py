"""Headed Playwright walk W1 — Phase 3.5-Adobe, layers seam.

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-W-opus-headed.md
Scope section 6 lines 1, 2, 4, 5, 6, 13, 14, 15.
Fixture: a copy of Docs/scratchpad/phase35-magazine.html. The original and
Docs/scratchpad/spread.master.html are never written; sha256 recorded before
and after. Shots land in Docs/Reports/phase35-W1/.

Usage:
    python3 Docs/tests/phase35_W1.py --session <sid> --out Docs/Reports/phase35-W1

Exit code 0 when every walk line passes.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(ROOT, "Docs", "scratchpad")
MAGAZINE = os.path.join(SCRATCH, "phase35-magazine.html")
MASTER = os.path.join(SCRATCH, "spread.master.html")
COPY = os.path.join(SCRATCH, "phase35_W1-magazine.html")

RESULTS = []
CONSOLE = []
PAGEERRORS = []

# contract 3.4 job 4 — layer row menu, spec 04 stage "menu"
LAYER_MENU_REQUIRED = ["New layer", "Duplicate layer", "Delete layer", "Rename",
                       "Merge down", "Select all on layer", "Move selection here"]
LAYER_MENU_EITHER = [("Lock", "Unlock"), ("Hide", "Show")]

# contract 3.4 job 5 — item menu, spec 05 stage 4
ITEM_MENU_REQUIRED = ["Group", "Ungroup", "Isolate", "Arrange", "Lock", "Unlock all",
                      "Hide", "Show all", "Move to layer", "Duplicate", "Delete"]
ITEM_MENU_ARRANGE = ["Bring to front", "Bring forward", "Send backward", "Send to back"]


def sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def record(num, name, passed, shot_path, note=""):
    RESULTS.append({"line": num, "name": name, "pass": bool(passed),
                    "shot": os.path.basename(shot_path or ""), "note": note})
    print(f"[line {num}] {'PASS' if passed else 'FAIL'} — {name}"
          + (f"\n      {note}" if note else ""))


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


def post(path, body=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as fh:
        return json.loads(fh.read().decode())


def wait_ok(page, expr, arg=None, timeout=20000, label=""):
    try:
        page.wait_for_function(expr, arg=arg, timeout=timeout)
        return True
    except Exception as exc:
        CONSOLE.append(f"[harness] wait {label} timed out: {str(exc)[:150]}")
        return False


# ---------- page-side helpers ----------

MOUNT = r"""
(args) => {
  const inst = MX.grid.addWidget(args.type);
  if (args.target !== undefined) MX.grid.frames[inst.id].setOption("target", args.target);
  if (args.section !== undefined) MX.grid.frames[inst.id].setOption("section", args.section);
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

SET = r"""
(args) => { MX.grid.frames[args.id].setOption(args.key, args.value); }
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

MODE = r"""
(id) => MX.grid.frames[id]._canvasState.mode
"""

SELECTED = r"""
(id) => MX.grid.frames[id]._canvas.selected()
"""

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"

STATUS_SAVED = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "saved");
}
"""

# pointer down/up/click on the first match inside the canvas document
CLICK_SEL = r"""
({id, sel}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  const node = doc.querySelector(sel);
  if (!node) return { ok: false, note: "no match for " + sel, selected: cv.selected() };
  const r = node.getBoundingClientRect();
  const W = doc.defaultView;
  const opts = { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true,
                 clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  const PE = W.PointerEvent || W.MouseEvent;
  node.dispatchEvent(new PE("pointerdown", opts));
  node.dispatchEvent(new PE("pointerup", opts));
  node.dispatchEvent(new W.MouseEvent("click", opts));
  return { ok: true, tag: node.tagName, selected: cv.selected() };
}
"""

# every control in the tools panel body, label + kind + value
READ_PANEL = r"""
(id) => {
  const root = MX.grid.frames[id].el;
  const out = [];
  for (const l of root.querySelectorAll(".mxtl-body label.cc-panel-label")) {
    const span = l.querySelector("span");
    const sel = l.querySelector("select");
    const inp = l.querySelector("input");
    out.push({
      label: span ? span.textContent : "",
      kind: sel ? "select" : (inp ? inp.type : "?"),
      value: sel ? sel.value : (inp ? inp.value : ""),
      options: sel ? Array.prototype.slice.call(sel.options).map((o) => o.value) : []
    });
  }
  return out;
}
"""

SET_SELECT = r"""
({id, label, value}) => {
  const root = MX.grid.frames[id].el;
  for (const l of root.querySelectorAll(".mxtl-body label.cc-panel-label")) {
    const span = l.querySelector("span");
    if (span && span.textContent === label) {
      const sel = l.querySelector("select");
      if (!sel) return false;
      sel.value = value;
      sel.dispatchEvent(new Event("change", {bubbles: true}));
      return true;
    }
  }
  return false;
}
"""

SET_NUMBER = r"""
({id, label, value}) => {
  const root = MX.grid.frames[id].el;
  for (const l of root.querySelectorAll(".mxtl-body label.cc-panel-label")) {
    const span = l.querySelector("span");
    if (span && span.textContent === label) {
      const inp = l.querySelector("input[type=number]");
      if (!inp) return false;
      inp.value = String(value);
      inp.dispatchEvent(new Event("input", {bubbles: true}));
      inp.dispatchEvent(new Event("blur", {bubbles: true}));
      return true;
    }
  }
  return false;
}
"""

PAGE_STATE = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const W = cv.idoc.defaultView;
  const cs = W.getComputedStyle(cv.idoc.documentElement);
  const tok = (t) => cs.getPropertyValue(t).trim();
  return {
    bodyWidth: W.getComputedStyle(cv.idoc.body).width,
    bodyHeight: W.getComputedStyle(cv.idoc.body).height,
    w: tok("--cc-page-w"), h: tok("--cc-page-h"),
    columns: tok("--cc-columns"), marginTop: tok("--cc-margin-top"),
    marginLeft: tok("--cc-margin-left"),
    marginLines: cv.idoc.querySelectorAll(".cc-line-margin").length,
    columnLines: cv.idoc.querySelectorAll(".cc-line-column").length,
    guideLines: cv.idoc.querySelectorAll(".cc-line-guide").length
  };
}
"""

DOC_LAYERS = r"""
(id) => {
  const doc = MX.grid.frames[id]._canvas.doc();
  const W = doc.defaultView;
  return Array.prototype.slice.call(doc.body.children)
    .filter((n) => n.matches("[data-cc-layer]"))
    .map((n) => ({
      name: n.getAttribute("data-cc-name") || "",
      plugin: n.getAttribute("data-cc-plugin") || "",
      locked: n.hasAttribute("data-cc-locked"),
      hidden: n.hasAttribute("data-cc-hidden"),
      display: W.getComputedStyle(n).display,
      kids: n.children.length
    }));
}
"""

PANEL_LAYERS = r"""
(id) => {
  const host = MX.grid.frames[id].el;
  return Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-layer-row"))
    .map((r) => ({
      name: r.querySelector(".cc-panel-row-name").textContent,
      plugin: (r.querySelector(".cc-layer-plugin") || {}).textContent || "",
      greyed: r.classList.contains("cc-layer-hidden") || r.classList.contains("cc-layer-locked"),
      lockedClass: r.classList.contains("cc-layer-locked"),
      hiddenClass: r.classList.contains("cc-layer-hidden"),
      lockTitle: r.querySelectorAll(".cc-panel-row-btn")[1].title
    }));
}
"""

ITEM_ROWS = r"""
(id) => {
  const host = MX.grid.frames[id].el;
  return Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-panel-row"))
    .filter((r) => !r.classList.contains("cc-layer-row"))
    .map((r, i) => ({ i: i, id: r.dataset.id || "",
                      name: r.querySelector(".cc-panel-row-name").textContent }));
}
"""

# the od-id of the photo row — the layer's own child that holds the img
PHOTO_ID = r"""
(id) => {
  const doc = MX.grid.frames[id]._canvas.doc();
  const img = doc.querySelector("img");
  if (!img) return "";
  let node = img;
  while (node && node.parentElement && !node.parentElement.matches("[data-cc-layer]")) {
    node = node.parentElement;
  }
  return node ? (node.getAttribute("data-od-id") || "") : "";
}
"""

WHERE_IS = r"""
({id, eid}) => {
  const doc = MX.grid.frames[id]._canvas.doc();
  const node = doc.querySelector('[data-od-id="' + eid + '"]');
  if (!node) return { found: false };
  const layer = node.closest("[data-cc-layer]");
  const sibs = layer ? Array.prototype.slice.call(layer.children) : [];
  return { found: true, layer: layer ? (layer.getAttribute("data-cc-name") || "") : "",
           index: sibs.indexOf(node), count: sibs.length };
}
"""

DRAG_ROW_TO_LAYER = r"""
({id, eid, layerName}) => {
  const host = MX.grid.frames[id].el;
  const rows = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-panel-row"));
  const src = rows.filter((r) => !r.classList.contains("cc-layer-row") && r.dataset.id === eid)[0];
  const dst = rows.filter((r) => r.classList.contains("cc-layer-row")
    && r.querySelector(".cc-panel-row-name").textContent === layerName)[0];
  if (!src || !dst) return { ok: false, note: "row missing src=" + !!src + " dst=" + !!dst };
  let held = "";
  const dt = { setData: (t, v) => { held = v; }, getData: () => held };
  const start = new DragEvent("dragstart", { bubbles: true });
  Object.defineProperty(start, "dataTransfer", { value: dt });
  src.dispatchEvent(start);
  const rect = dst.getBoundingClientRect();
  const drop = new DragEvent("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: dt });
  Object.defineProperty(drop, "clientY", { value: rect.top + rect.height / 2 });
  dst.dispatchEvent(drop);
  return { ok: true, dragged: held };
}
"""

ARROW_UP = r"""
({id, eid}) => {
  const host = MX.grid.frames[id].el;
  const row = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-panel-row"))
    .filter((r) => !r.classList.contains("cc-layer-row") && r.dataset.id === eid)[0];
  if (!row) return { ok: false, note: "no row for " + eid };
  const btn = row.querySelectorAll(".cc-panel-row-btn")[0];
  if (!btn) return { ok: false, note: "no arrow" };
  if (btn.disabled) return { ok: false, note: "arrow disabled" };
  btn.click();
  return { ok: true, label: btn.textContent };
}
"""

# right-click a row, read the floating menu, leave it open
OPEN_MENU = r"""
({id, eid, layerName}) => {
  const host = MX.grid.frames[id].el;
  const rows = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-panel-row"));
  const row = layerName
    ? rows.filter((r) => r.classList.contains("cc-layer-row")
        && r.querySelector(".cc-panel-row-name").textContent === layerName)[0]
    : rows.filter((r) => !r.classList.contains("cc-layer-row") && r.dataset.id === eid)[0];
  if (!row) return { ok: false, note: "no row" };
  const rect = row.getBoundingClientRect();
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true,
    clientX: rect.left + 20, clientY: rect.top + rect.height / 2 });
  row.dispatchEvent(ev);
  const menus = Array.prototype.slice.call(document.body.children)
    .filter((n) => n.style && n.style.zIndex === "2147483647");
  const menu = menus[menus.length - 1];
  if (!menu) return { ok: false, note: "no menu opened" };
  return { ok: true,
           labels: Array.prototype.slice.call(menu.children).map((c) => c.textContent) };
}
"""

CLOSE_MENU = r"""
() => {
  for (const n of Array.prototype.slice.call(document.body.children)) {
    if (n.style && n.style.zIndex === "2147483647") n.remove();
  }
  return true;
}
"""

# flat label list from the canvas menuItems() tree
MENU_ITEMS_API = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvas;
  if (typeof cv.menuItems !== "function") return { ok: false, note: "no menuItems()" };
  const flat = [];
  const walk = (rows, depth) => {
    for (const r of rows || []) {
      if (!r) continue;
      flat.push(depth + r[0]);
      if (Array.isArray(r[1])) walk(r[1], depth + "> ");
    }
  };
  walk(cv.menuItems(), "");
  return { ok: true, labels: flat };
}
"""

SET_ACTIVE_LAYER = r"""
({id, name}) => {
  const cv = MX.grid.frames[id]._canvas;
  const rec = cv.layers().filter((l) => l.name === name)[0];
  if (!rec) return { ok: false, note: "no layer " + name };
  cv.setActiveLayer(rec.id);
  return { ok: true, active: cv.activeLayer() };
}
"""

MENU_PICK = r"""
({id, layerName, label}) => {
  const host = MX.grid.frames[id].el;
  const row = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-layer-row"))
    .filter((r) => r.querySelector(".cc-panel-row-name").textContent === layerName)[0];
  if (!row) return { ok: false, note: "no layer row " + layerName };
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  const menus = Array.prototype.slice.call(document.body.children)
    .filter((n) => n.style && n.style.zIndex === "2147483647");
  const menu = menus[menus.length - 1];
  if (!menu) return { ok: false, note: "no menu" };
  const labels = Array.prototype.slice.call(menu.children).map((c) => c.textContent);
  for (const line of menu.children) {
    if (line.textContent === label) {
      line.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      return { ok: true, labels: labels };
    }
  }
  return { ok: false, note: "no line " + label, labels: labels };
}
"""

DROP_SNIPPET = r"""
({id, name, x, y}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  const rect = doc.body.getBoundingClientRect();
  const dt = { getData: () => name, dropEffect: "copy" };
  const ev = new doc.defaultView.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  Object.defineProperty(ev, "clientX", { value: rect.left + x });
  Object.defineProperty(ev, "clientY", { value: rect.top + y });
  doc.dispatchEvent(ev);
  return true;
}
"""

FIND_DROPPED = r"""
({id, x, y}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  for (const layer of doc.querySelectorAll("[data-cc-layer]")) {
    for (const n of Array.prototype.slice.call(layer.children)) {
      if (n.style && n.style.left === x + "px" && n.style.top === y + "px") {
        return { found: true, eid: n.getAttribute("data-od-id") || "",
                 layer: layer.getAttribute("data-cc-name") || "",
                 tag: n.tagName, text: (n.textContent || "").trim().slice(0, 40),
                 editable: n.isContentEditable };
      }
    }
  }
  return { found: false };
}
"""

TYPE_INTO = r"""
({id, eid, text}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  const node = doc.querySelector('[data-od-id="' + eid + '"]');
  if (!node) return { ok: false, note: "gone" };
  const r = node.getBoundingClientRect();
  const W = doc.defaultView;
  const opts = { bubbles: true, cancelable: true, button: 0, detail: 2,
                 clientX: r.left + 10, clientY: r.top + 10 };
  node.dispatchEvent(new W.MouseEvent("dblclick", opts));
  return { ok: true, editable: node.isContentEditable, focused: doc.activeElement === node };
}
"""

READ_TEXT = r"""
({id, eid}) => {
  const doc = MX.grid.frames[id]._canvas.doc();
  const node = doc.querySelector('[data-od-id="' + eid + '"]');
  return node ? (node.textContent || "").trim() : "";
}
"""

PAGE_NUMBER = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const doc = cv.idoc;
  const node = doc.querySelector('[data-cc-var="page-number"]');
  const meta = doc.querySelector('meta[name="cc-page-number"]');
  const master = doc.querySelector('[data-cc-layer][data-cc-name="Master"]');
  return {
    varText: node ? (node.textContent || "").trim() : null,
    metaSource: /cc-page-number"\s+content="([^"]*)"/.test(cv.source || "")
      ? RegExp.$1 : (meta ? meta.getAttribute("content") : null),
    masterLayer: !!master,
    masterLocked: !!(master && master.hasAttribute("data-cc-locked"))
  };
}
"""

DROP_WIDGETS = r"""
() => Promise.all(MX.grid.instances.map((i) => MX.grid.removeWidget(i.id)))
"""


def attempt(fn):
    """two tries per walk line, second wins, both noted"""
    ok, note = fn()
    if ok:
        return ok, note
    CONSOLE.append("[harness] retry after fail")
    ok2, note2 = fn()
    return ok2, f"attempt1: {note} || attempt2: {note2}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase35-W1")
    ap.add_argument("--out", required=True)
    ap.add_argument("--run", default="1")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    for path in (MAGAZINE, MASTER):
        if not os.path.exists(path):
            print(f"MISSING FIXTURE {path}")
            sys.exit(1)
    sha_before = {"magazine": sha(MAGAZINE), "master": sha(MASTER)}
    shutil.copyfile(MAGAZINE, COPY)

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")
    ok_all = True
    findings = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=False)
            ctx = browser.new_context(viewport={"width": 1720, "height": 1060})
            p = ctx.new_page()
            wire(p, "p1")
            url = f"{BASE}/matrix/{sid}?s={args.surface}"
            resp = p.goto(url, wait_until="load", timeout=25000)
            if resp is None or not resp.ok:
                print(f"FAILED TO LOAD {url}")
                browser.close()
                sys.exit(1)
            p.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                                timeout=15000)
            stale = p.evaluate("() => MX.grid.instances.map((i) => i.id)")
            if stale:
                p.evaluate("(ids) => Promise.all(ids.map((id) => MX.grid.removeWidget(id)))", stale)
                p.wait_for_timeout(1000)

            # ---------- line 1 — surface, three widgets, preview selects nothing
            cv = p.evaluate(MOUNT, {"type": "canvas", "target": COPY})
            p.evaluate(RESIZE, {"id": cv, "col": 1, "row": 1, "w": 13, "h": 18})
            tl = p.evaluate(MOUNT, {"type": "canvas_tools", "target": COPY, "section": "layers"})
            p.evaluate(RESIZE, {"id": tl, "col": 14, "row": 1, "w": 5, "h": 12})
            tg = p.evaluate(MOUNT, {"type": "canvas_targets"})
            p.evaluate(RESIZE, {"id": tg, "col": 14, "row": 13, "w": 5, "h": 6})
            p.wait_for_function(CANVAS_MOUNTED, arg=cv, timeout=25000)
            loaded = wait_ok(p, FILE_READY, cv, 45000, "file mode ready")
            p.wait_for_timeout(800)

            def line1():
                mode = p.evaluate(MODE, cv)
                hit = p.evaluate(CLICK_SEL, {"id": cv, "sel": "h1"})
                sel = p.evaluate(SELECTED, cv)
                widgets = p.evaluate("() => MX.grid.instances.map((i) => i.type)")
                ok = (loaded and mode == "preview" and len(sel) == 0
                      and set(["canvas", "canvas_tools", "canvas_targets"]).issubset(set(widgets)))
                return ok, (f"widgets={widgets} mode={mode!r} click={json.dumps(hit)} "
                            f"selected={sel}")

            ok1, note1 = attempt(line1)
            sh = shot(p, args.out, "line01-preview-nothing-selects")
            record(1, "Canvas, Tools, Targets on a new surface; the copy opens; preview "
                      "mode; clicking the headline selects nothing", ok1, sh, note1)
            ok_all = ok_all and ok1
            if not ok1:
                findings.append("1 — static/js/widgets/codecanvas/canvas/canvas.js (mount, "
                                "preview hit-testing) / library/registry/widgets.json")

            # ---------- line 2 — canvas mode, page setup
            p.evaluate(SET, {"id": cv, "key": "mode", "value": "canvas"})
            p.evaluate(SET, {"id": tl, "key": "section", "value": "page"})
            p.wait_for_timeout(900)

            def line2():
                panel = p.evaluate(READ_PANEL, tl)
                size_label = ""
                other = ""
                for row in panel:
                    if row["kind"] == "select" and any(
                            o.lower().startswith("letter") for o in row["options"]):
                        size_label = row["label"]
                        other = [o for o in row["options"] if not o.lower().startswith("letter")]
                        other = other[0] if other else ""
                        break
                moved = None
                if size_label and other:
                    p.evaluate(SET_SELECT, {"id": tl, "label": size_label, "value": other})
                    p.wait_for_timeout(700)
                    moved = p.evaluate(PAGE_STATE, cv)
                    letter = [o for o in panel
                              if o["label"] == size_label][0]["options"]
                    letter = [o for o in letter if o.lower().startswith("letter")][0]
                    p.evaluate(SET_SELECT, {"id": tl, "label": size_label, "value": letter})
                    p.wait_for_timeout(700)
                for lbl in ("Columns", "columns"):
                    if p.evaluate(SET_NUMBER, {"id": tl, "label": lbl, "value": 3}):
                        break
                p.wait_for_timeout(400)
                for lbl in ("Margin top", "Top", "margin-top"):
                    if p.evaluate(SET_NUMBER, {"id": tl, "label": lbl, "value": 48}):
                        break
                p.wait_for_timeout(700)
                st = p.evaluate(PAGE_STATE, cv)
                resized = bool(moved and moved["bodyWidth"] != st["bodyWidth"])
                ok = (st["bodyWidth"] == "816px" and st["columns"] == "3"
                      and st["marginTop"] == "48px" and st["marginLines"] == 4
                      and st["columnLines"] == 4 and resized)
                return ok, (f"panel={json.dumps(panel)} off_letter={json.dumps(moved)} "
                            f"letter={json.dumps(st)} resized_between={resized}")

            ok2, note2 = attempt(line2)
            sh = shot(p, args.out, "line02-page-letter-3col-48")
            record(2, "Pages tab: Letter, 3 columns, 48px margins. The page is 816px wide "
                      "and margin and column lines draw", ok2, sh, note2)
            ok_all = ok_all and ok2
            if not ok2:
                findings.append("2 — static/js/widgets/codecanvas/tools/tools.js (page "
                                "section) / canvas/canvas.js (page chrome)")

            # ---------- line 4 — layers, master, lock, hide
            p.evaluate(SET, {"id": tl, "key": "section", "value": "layers"})
            p.wait_for_timeout(700)

            def line4():
                panel = p.evaluate(PANEL_LAYERS, tl)
                names = [r["name"] for r in panel]
                master_row = [r for r in panel if r["name"] == "Master"]
                footer = p.evaluate(CLICK_SEL, {"id": cv, "sel": '[data-cc-var="page-number"]'})
                foot_sel = p.evaluate(SELECTED, cv)
                p.evaluate(MENU_PICK, {"id": tl, "layerName": "Art", "label": "Lock"})
                p.wait_for_timeout(500)
                shape = p.evaluate(CLICK_SEL, {"id": cv, "sel": "ellipse"})
                shape_sel = p.evaluate(SELECTED, cv)
                p.evaluate(MENU_PICK, {"id": tl, "layerName": "Art", "label": "Hide"})
                p.wait_for_timeout(500)
                hidden = p.evaluate(DOC_LAYERS, cv)
                art_hidden = [l for l in hidden if l["name"] == "Art"]
                shot(p, args.out, "line04b-art-hidden")
                p.evaluate(MENU_PICK, {"id": tl, "layerName": "Art", "label": "Show"})
                p.wait_for_timeout(500)
                shown = p.evaluate(DOC_LAYERS, cv)
                art_shown = [l for l in shown if l["name"] == "Art"]
                p.evaluate(MENU_PICK, {"id": tl, "layerName": "Art", "label": "Unlock"})
                p.wait_for_timeout(400)
                ok = (names == ["Master", "Art", "Text"]
                      and bool(master_row) and master_row[0]["lockTitle"] == "locked"
                      and master_row[0]["greyed"]
                      and len(foot_sel) == 0 and len(shape_sel) == 0
                      and bool(art_hidden) and art_hidden[0]["hidden"]
                      and art_hidden[0]["display"] == "none"
                      and bool(art_shown) and not art_shown[0]["hidden"])
                return ok, (f"panel={json.dumps(panel)} footer_click={json.dumps(footer)} "
                            f"footer_selected={foot_sel} locked_shape_click={json.dumps(shape)} "
                            f"shape_selected={shape_sel} art_hidden={json.dumps(art_hidden)} "
                            f"art_shown={json.dumps(art_shown)}")

            ok4, note4 = attempt(line4)
            sh = shot(p, args.out, "line04a-layers")
            record(4, "Layers shows Text, Art, Master (locked, greyed); the footer does not "
                      "select; a locked Art shape does not select; Hide empties Art, Show "
                      "brings it back", ok4, sh, note4)
            ok_all = ok_all and ok4
            if not ok4:
                findings.append("4 — static/js/widgets/codecanvas/canvas/canvas.js (masters, "
                                "job 14, no 'master' anywhere in the file) / tools/tools.js "
                                "(layer rows)")

            # ---------- line 5 — move layer, arrows, both menus
            photo = p.evaluate(PHOTO_ID, cv)

            def line5():
                before = p.evaluate(WHERE_IS, {"id": cv, "eid": photo})
                drag = p.evaluate(DRAG_ROW_TO_LAYER,
                                  {"id": tl, "eid": photo, "layerName": "Art"})
                p.wait_for_timeout(600)
                moved = p.evaluate(WHERE_IS, {"id": cv, "eid": photo})
                up1 = p.evaluate(ARROW_UP, {"id": tl, "eid": photo})
                p.wait_for_timeout(400)
                mid = p.evaluate(WHERE_IS, {"id": cv, "eid": photo})
                up2 = p.evaluate(ARROW_UP, {"id": tl, "eid": photo})
                p.wait_for_timeout(400)
                after = p.evaluate(WHERE_IS, {"id": cv, "eid": photo})
                item_menu = p.evaluate(OPEN_MENU, {"id": tl, "eid": photo, "layerName": ""})
                shot(p, args.out, "line05b-item-menu")
                p.evaluate(CLOSE_MENU)
                api = p.evaluate(MENU_ITEMS_API, cv)
                layer_menu = p.evaluate(OPEN_MENU, {"id": tl, "eid": "", "layerName": "Text"})
                shot(p, args.out, "line05c-layer-menu")
                p.evaluate(CLOSE_MENU)
                ilabels = [s.strip() for s in (item_menu.get("labels") or [])]
                llabels = [s.strip() for s in (layer_menu.get("labels") or [])]
                alabels = [s.strip("> ").strip() for s in (api.get("labels") or [])]
                item_missing = [x for x in ITEM_MENU_REQUIRED
                                if not any(x in s for s in ilabels)]
                arrange_missing = [x for x in ITEM_MENU_ARRANGE
                                   if not any(x in s for s in (ilabels + alabels))]
                layer_missing = [x for x in LAYER_MENU_REQUIRED
                                 if not any(x in s for s in llabels)]
                for a, b in LAYER_MENU_EITHER:
                    if not any(a in s or b in s for s in llabels):
                        layer_missing.append(f"{a}/{b}")
                ok = (moved.get("layer") == "Art"
                      and moved.get("index") is not None and after.get("index") is not None
                      and after["index"] - moved["index"] == 2
                      and not item_missing and not arrange_missing and not layer_missing)
                return ok, (f"before={json.dumps(before)} drag={json.dumps(drag)} "
                            f"moved={json.dumps(moved)} up1={json.dumps(up1)} "
                            f"mid={json.dumps(mid)} up2={json.dumps(up2)} "
                            f"after={json.dumps(after)} item_menu={json.dumps(ilabels)} "
                            f"missing_item={item_missing} missing_arrange={arrange_missing} "
                            f"menuItems_api={json.dumps(alabels)} "
                            f"layer_menu={json.dumps(llabels)} missing_layer={layer_missing}")

            ok5, note5 = attempt(line5)
            sh = shot(p, args.out, "line05a-photo-in-art")
            record(5, "Drag the photo row from Text into Art; it changes layer; two ▲ move "
                      "it up two; both right-click menus carry every 3.4 job 4 and job 5 line",
                   ok5, sh, note5)
            ok_all = ok_all and ok5
            if not ok5:
                findings.append("5 — static/js/widgets/codecanvas/tools/tools.js "
                                "(openLayerMenu, item rows) / canvas/canvas.js (menuItems)")

            # ---------- line 6 — snippet drop on the active layer
            p.evaluate(SET, {"id": tl, "key": "section", "value": "snippets"})
            p.wait_for_timeout(700)
            active = p.evaluate(SET_ACTIVE_LAYER, {"id": cv, "name": "Text"})
            dropped = {"found": False}

            def line6():
                nonlocal dropped
                p.evaluate(DROP_SNIPPET, {"id": cv, "name": "Text frame", "x": 120, "y": 820})
                p.wait_for_timeout(800)
                dropped = p.evaluate(FIND_DROPPED, {"id": cv, "x": 120, "y": 820})
                typed = {"ok": False}
                text = ""
                if dropped.get("found"):
                    typed = p.evaluate(TYPE_INTO,
                                       {"id": cv, "eid": dropped["eid"], "text": "W1"})
                    p.wait_for_timeout(400)
                    p.keyboard.type("W1 typed here")
                    p.wait_for_timeout(600)
                    text = p.evaluate(READ_TEXT, {"id": cv, "eid": dropped["eid"]})
                ok = (dropped.get("found") and dropped.get("layer") == "Text"
                      and "W1 typed here" in text)
                return ok, (f"active={json.dumps(active)} dropped={json.dumps(dropped)} "
                            f"typing={json.dumps(typed)} text={text!r}")

            ok6, note6 = attempt(line6)
            sh = shot(p, args.out, "line06-snippet-dropped")
            record(6, "Snippets: a text frame dropped at page 120,820 lands on the active "
                      "layer at that point and takes typing", ok6, sh, note6)
            ok_all = ok_all and ok6
            if not ok6:
                findings.append("6 — static/js/widgets/codecanvas/tools/tools.js (snippet "
                                "drop) / canvas/canvas.js (insertAt, text editing)")

            # ---------- line 13 — save, then what the file holds
            before_layers = p.evaluate(DOC_LAYERS, cv)
            p.evaluate(FOCUS_IFRAME, cv)
            p.keyboard.press("Meta+s")
            saved = wait_ok(p, STATUS_SAVED, cv, 10000, "status reads saved")
            p.wait_for_timeout(1500)

            def line13():
                with open(COPY) as fh:
                    disk = fh.read()
                names = re.findall(r'data-cc-layer[^>]*data-cc-name="([^"]*)"', disk)
                page_block = 'data-cc="page"' in disk and "--cc-page-w" in disk
                no_translate = "translate(" not in disk
                no_chrome = ("data-od-edit-guides-layer" not in disk
                             and 'data-od-edit-bridge="rulers"' not in disk
                             and "cc-ruler" not in disk
                             and "data-cc-chrome" not in disk)
                no_master = ('data-cc-var="page-number"' not in disk
                             and 'data-cc-name="Master"' not in disk)
                ok = (saved and page_block and len(names) == 3 and no_translate
                      and no_chrome and no_master)
                return ok, (f"status_saved={saved} layers_on_disk={names} "
                            f"page_block={page_block} translate_folded={no_translate} "
                            f"no_chrome={no_chrome} no_master_content={no_master} "
                            f"layers_in_dom={json.dumps(before_layers)}")

            ok13, note13 = attempt(line13)
            sh = shot(p, args.out, "line13-saved")
            record(13, "Cmd-S: status reads saved; the file holds the page block, three "
                       "layers, folded translate, and no rulers, guides layer, chrome or "
                       "master content", ok13, sh, note13)
            ok_all = ok_all and ok13
            if not ok13:
                findings.append("13 — static/js/widgets/codecanvas/canvas/canvas.js "
                                "(doSave, serialize, chrome strip)")

            # ---------- line 14 — reload
            p.evaluate("() => MX.grid.save()")
            p.wait_for_timeout(800)
            p.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                       " if (f && f._canvasState) f._canvasState.dirty = false; } }", [cv])
            p.reload(wait_until="load", timeout=30000)
            p.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                                timeout=20000)
            wait_ok(p, CANVAS_MOUNTED, cv, 30000, "canvas mounted after reload")
            back = wait_ok(p, FILE_READY, cv, 45000, "file ready after reload")
            p.evaluate(SET, {"id": cv, "key": "mode", "value": "canvas"})
            p.wait_for_timeout(1500)

            def line14():
                after_layers = p.evaluate(DOC_LAYERS, cv)
                pn = p.evaluate(PAGE_NUMBER, cv)
                still = p.evaluate(WHERE_IS, {"id": cv, "eid": photo})
                snip = (p.evaluate(WHERE_IS, {"id": cv, "eid": dropped.get("eid", "")})
                        if dropped.get("found") else {"found": False})
                names_before = [l["name"] for l in before_layers]
                names_after = [l["name"] for l in after_layers]
                ok = (back and names_after == names_before
                      and still.get("layer") == "Art" and snip.get("found")
                      and pn["masterLayer"] and pn["masterLocked"] and pn["varText"] == "1")
                return ok, (f"reloaded={back} layers_before={names_before} "
                            f"layers_after={names_after} photo={json.dumps(still)} "
                            f"snippet={json.dumps(snip)} page_number={json.dumps(pn)}")

            ok14, note14 = attempt(line14)
            sh = shot(p, args.out, "line14-after-reload")
            record(14, "Reload the surface: the layers, the moved photo and the snippet "
                       "return; the master footer is present and locked; the page number "
                       "reads 1", ok14, sh, note14)
            ok_all = ok_all and ok14
            if not ok14:
                findings.append("14 — static/js/widgets/codecanvas/canvas/canvas.js "
                                "(masters job 14, reload restore)")

            # ---------- line 15 — console
            def line15():
                bad = [c for c in CONSOLE
                       if ":console:error" in c or ":console:warning" in c or "pageerror" in c]
                return not bad, f"pageerrors={len(PAGEERRORS)} noisy_lines={len(bad)} " \
                                f"first={bad[:4]}"

            ok15, note15 = attempt(line15)
            sh = shot(p, args.out, "line15-console")
            record(15, "Console clean the whole way", ok15, sh, note15)
            ok_all = ok_all and ok15
            if not ok15:
                findings.append("15 — see the console dump in phase35-W1-results.json")

            p.evaluate(DROP_WIDGETS)
            p.wait_for_timeout(600)
            browser.close()
    finally:
        if os.path.exists(COPY):
            os.remove(COPY)

    sha_after = {"magazine": sha(MAGAZINE), "master": sha(MASTER)}
    out_path = os.path.join(args.out, f"phase35-W1-results-run{args.run}.json")
    with open(out_path, "w") as fh:
        json.dump({"run": args.run, "results": RESULTS, "findings": findings,
                   "sha_before": sha_before, "sha_after": sha_after,
                   "pageerrors": PAGEERRORS, "console": CONSOLE}, fh, indent=2)
    print(f"\nsha before {sha_before}")
    print(f"sha after  {sha_after}")
    print(f"{sum(1 for r in RESULTS if r['pass'])}/{len(RESULTS)} lines passed. Log: {out_path}")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
