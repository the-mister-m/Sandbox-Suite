"""Headless Playwright test for Phase 3.5 job 4 — layers panel.

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-04-opus-layers-panel.md
Fixture: Docs/scratchpad/phase35-magazine.html, copied before the run,
copy removed at teardown. Original untouched. A plain no-layer html is
written and removed the same way.

Usage:
    python3 Docs/tests/phase35_04.py --session <sid> --out Docs/Reports/

Exit code 0 when every check passes.
"""

import argparse
import json
import os
import shutil
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(ROOT, "Docs", "scratchpad")
MAGAZINE = os.path.join(SCRATCH, "phase35-magazine.html")
MAGAZINE_COPY = os.path.join(SCRATCH, "phase35_04-magazine-copy.html")
PLAIN = os.path.join(SCRATCH, "phase35_04-plain.html")

PLAIN_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>plain</title></head>
<body>
<h1>Plain heading</h1>
<p>One paragraph.</p>
</body></html>
"""

RESULTS = []
CONSOLE = []


def record(num, name, passed, note=""):
    RESULTS.append({"n": num, "name": name, "pass": bool(passed), "note": note})
    print(f"[{num}] {'PASS' if passed else 'FAIL'} - {name}" + (f"\n      {note}" if note else ""))


def post(path, body=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as fh:
        return json.loads(fh.read().decode())


MOUNT_CANVAS = r"""
(target) => {
  const inst = MX.grid.addWidget("canvas");
  MX.grid.frames[inst.id].setOption("target", target);
  return inst.id;
}
"""

MOUNT_TOOLS = r"""
(target) => {
  const inst = MX.grid.addWidget("canvas_tools");
  const f = MX.grid.frames[inst.id];
  f.setOption("target", target);
  f.setOption("section", "layers");
  return inst.id;
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

# doc-side layer names, DOM order (first is bottom)
DOC_LAYERS = r"""
(id) => {
  const doc = MX.grid.frames[id]._canvas.doc();
  return Array.prototype.slice.call(doc.body.children)
    .filter((n) => n.matches("[data-cc-layer]"))
    .map((n) => ({
      name: n.getAttribute("data-cc-name") || "",
      plugin: n.getAttribute("data-cc-plugin") || "",
      locked: n.hasAttribute("data-cc-locked"),
      hidden: n.hasAttribute("data-cc-hidden"),
      kids: n.children.length
    }));
}
"""

# panel-side layer rows, top first
PANEL_LAYERS = r"""
(id) => {
  const host = MX.grid.frames[id].el;
  return Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-layer-row"))
    .map((r) => ({
      name: r.querySelector(".cc-panel-row-name").textContent,
      plugin: r.querySelector(".cc-layer-plugin").textContent,
      hiddenClass: r.classList.contains("cc-layer-hidden"),
      lockTitle: r.querySelectorAll(".cc-panel-row-btn")[1].title
    }));
}
"""

CLICK_HEAD_BTN = r"""
({id, label}) => {
  const host = MX.grid.frames[id].el;
  for (const b of host.querySelectorAll(".mxtl-body .cc-panel-order-head button")) {
    if (b.textContent === label) { b.click(); return true; }
  }
  return false;
}
"""

RENAME_TOP_LAYER = r"""
({id, name}) => {
  const host = MX.grid.frames[id].el;
  const row = host.querySelector(".mxtl-body .cc-layer-row");
  if (!row) return false;
  const nameEl = row.querySelector(".cc-panel-row-name");
  nameEl.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  const input = nameEl.querySelector("input");
  if (!input) return false;
  input.value = name;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return true;
}
"""

# drag an item row onto a layer row's middle band
DRAG_ROW_TO_LAYER = r"""
({id, rowText, layerName}) => {
  const host = MX.grid.frames[id].el;
  const rows = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-panel-row"));
  const src = rows.filter((r) => !r.classList.contains("cc-layer-row")
    && r.querySelector(".cc-panel-row-name").textContent.indexOf(rowText) === 0)[0];
  const dst = rows.filter((r) => r.classList.contains("cc-layer-row")
    && r.querySelector(".cc-panel-row-name").textContent === layerName)[0];
  if (!src || !dst) return { ok: false, note: "row missing" };
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

# the bottom item of a named layer, then its ▲
ARROW_UP_BOTTOM_ITEM = r"""
({tid, cid, layerName}) => {
  const doc = MX.grid.frames[cid]._canvas.doc();
  const layer = Array.prototype.slice.call(doc.body.children)
    .filter((n) => n.matches("[data-cc-layer]")
      && n.getAttribute("data-cc-name") === layerName)[0];
  if (!layer) return { ok: false, note: "no layer" };
  const first = layer.children[0];
  const before = first.tagName + ":" + Array.prototype.slice.call(layer.children).indexOf(first);
  const host = MX.grid.frames[tid].el;
  const rows = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-panel-row"))
    .filter((r) => !r.classList.contains("cc-layer-row"));
  const row = rows[rows.length - 1];
  if (!row) return { ok: false, note: "no item row" };
  const btns = row.querySelectorAll(".cc-panel-row-btn");
  btns[0].click();
  return { ok: true, before: before, tag: first.tagName,
           after: Array.prototype.slice.call(layer.children).indexOf(first) };
}
"""

# right-click a layer row, then pick a menu line by label
MENU_PICK = r"""
({id, layerName, label}) => {
  const host = MX.grid.frames[id].el;
  const row = Array.prototype.slice.call(host.querySelectorAll(".mxtl-body .cc-layer-row"))
    .filter((r) => r.querySelector(".cc-panel-row-name").textContent === layerName)[0];
  if (!row) return { ok: false, note: "no layer row" };
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

SELECTED = r"""
(id) => MX.grid.frames[id]._canvas.selected()
"""

LAYER_OF_TAG = r"""
({id, tag}) => {
  const doc = MX.grid.frames[id]._canvas.doc();
  const node = doc.body.querySelector(tag);
  if (!node) return "";
  const layer = node.closest("[data-cc-layer]");
  return layer ? (layer.getAttribute("data-cc-name") || "") : "";
}
"""

UNDO = r"""
(id) => { MX.grid.frames[id]._canvas.undo(); return true; }
"""

CLICK_SAVE = r"""
(id) => {
  const host = MX.grid.frames[id].el;
  for (const b of host.querySelectorAll("button")) {
    if (b.textContent === "Save") { b.click(); return true; }
  }
  return false;
}
"""

DROP_WIDGETS = r"""
() => Promise.all(MX.grid.instances.map((i) => MX.grid.removeWidget(i.id)))
"""


def wait_ok(page, expr, arg=None, timeout=20000, label=""):
    try:
        page.wait_for_function(expr, arg=arg, timeout=timeout)
        return True
    except Exception as exc:
        CONSOLE.append(f"[harness] wait {label} timed out: {str(exc)[:150]}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase35-04-headless")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    if not os.path.exists(MAGAZINE):
        print("MISSING FIXTURE")
        sys.exit(1)
    shutil.copyfile(MAGAZINE, MAGAZINE_COPY)
    with open(PLAIN, "w") as fh:
        fh.write(PLAIN_HTML)

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")

    ok_all = True
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
            page = ctx.new_page()
            page.on("console", lambda m: CONSOLE.append(f"[console:{m.type}] {m.text}"))
            page.on("pageerror", lambda e: CONSOLE.append(f"[pageerror] {e}"))
            url = f"{BASE}/matrix/{sid}?s={args.surface}"
            resp = page.goto(url, wait_until="load", timeout=25000)
            if resp is None or not resp.ok:
                print(f"FAILED TO LOAD {url}")
                sys.exit(1)
            page.wait_for_function(
                "() => window.MX && window.MX.grid && window.MX.canvasCore", timeout=15000)

            stale = page.evaluate("() => MX.grid.instances.map((i) => i.id)")
            if stale:
                page.evaluate("(ids) => Promise.all(ids.map((id) => MX.grid.removeWidget(id)))", stale)
                page.wait_for_timeout(1000)

            cv_id = page.evaluate(MOUNT_CANVAS, MAGAZINE_COPY)
            tl_id = page.evaluate(MOUNT_TOOLS, MAGAZINE_COPY)
            loaded = wait_ok(page, FILE_READY, cv_id, 20000, "magazine file ready")
            record(1, "Fixture copy opens in file mode", loaded)
            ok_all = ok_all and loaded
            page.wait_for_timeout(400)

            panel = page.evaluate(PANEL_LAYERS, tl_id)
            names = [r["name"] for r in panel]
            ok2 = names == ["Art", "Text"]
            record(2, "Layers tab shows Text and Art, top is front", ok2, json.dumps(panel))
            ok_all = ok_all and ok2

            page.evaluate(CLICK_HEAD_BTN, {"id": tl_id, "label": "+ Layer"})
            page.wait_for_timeout(300)
            page.evaluate(RENAME_TOP_LAYER, {"id": tl_id, "name": "Notes"})
            page.wait_for_timeout(300)
            doc_layers = page.evaluate(DOC_LAYERS, cv_id)
            ok3 = [l["name"] for l in doc_layers] == ["Text", "Art", "Notes"]
            record(3, "+ Layer then rename gives Notes on top", ok3, json.dumps(doc_layers))
            ok_all = ok_all and ok3

            drag = page.evaluate(DRAG_ROW_TO_LAYER,
                                 {"id": tl_id, "rowText": "blockquote", "layerName": "Notes"})
            page.wait_for_timeout(300)
            where = page.evaluate(LAYER_OF_TAG, {"id": cv_id, "tag": "blockquote"})
            ok4 = where == "Notes"
            record(4, "Drag the pull quote row into Notes", ok4,
                   f"layer={where} drag={json.dumps(drag)}")
            ok_all = ok_all and ok4

            up = page.evaluate(ARROW_UP_BOTTOM_ITEM,
                               {"tid": tl_id, "cid": cv_id, "layerName": "Text"})
            page.wait_for_timeout(300)
            after = page.evaluate(
                """({id, tag}) => {
                     const doc = MX.grid.frames[id]._canvas.doc();
                     const layer = Array.prototype.slice.call(doc.body.children)
                       .filter((n) => n.matches("[data-cc-layer]")
                         && n.getAttribute("data-cc-name") === "Text")[0];
                     const kids = Array.prototype.slice.call(layer.children);
                     return kids.indexOf(layer.querySelector(tag));
                   }""",
                {"id": cv_id, "tag": (up.get("tag") or "div").lower()})
            ok5 = bool(up.get("ok")) and after == 1
            record(5, "▲ once moves the bottom item one slot forward", ok5,
                   f"{json.dumps(up)} after={after}")
            ok_all = ok_all and ok5

            page.evaluate(MENU_PICK, {"id": tl_id, "layerName": "Notes", "label": "Lock"})
            page.wait_for_timeout(300)
            panel = page.evaluate(PANEL_LAYERS, tl_id)
            notes = [r for r in panel if r["name"] == "Notes"]
            ok6 = bool(notes) and notes[0]["lockTitle"] == "locked"
            record(6, "Lock Notes: the lock shows", ok6, json.dumps(panel))
            ok_all = ok_all and ok6

            page.evaluate(MENU_PICK, {"id": tl_id, "layerName": "Notes", "label": "Hide"})
            page.wait_for_timeout(300)
            panel = page.evaluate(PANEL_LAYERS, tl_id)
            notes = [r for r in panel if r["name"] == "Notes"]
            ok7 = bool(notes) and notes[0]["hiddenClass"]
            record(7, "Hide Notes: the row greys", ok7, json.dumps(panel))
            ok_all = ok_all and ok7

            kids = [l["kids"] for l in page.evaluate(DOC_LAYERS, cv_id) if l["name"] == "Text"]
            pick = page.evaluate(MENU_PICK,
                                 {"id": tl_id, "layerName": "Text", "label": "Select all on layer"})
            page.wait_for_timeout(300)
            sel = page.evaluate(SELECTED, cv_id)
            ok8 = bool(kids) and len(sel) == kids[0]
            record(8, "Select all on layer: count equals the layer's children", ok8,
                   f"selected={len(sel)} kids={kids} menu={json.dumps(pick)}")
            ok_all = ok_all and ok8

            page.evaluate(MENU_PICK, {"id": tl_id, "layerName": "Notes", "label": "Merge down"})
            page.wait_for_timeout(400)
            doc_layers = page.evaluate(DOC_LAYERS, cv_id)
            where = page.evaluate(LAYER_OF_TAG, {"id": cv_id, "tag": "blockquote"})
            ok9 = [l["name"] for l in doc_layers] == ["Text", "Art"] and where == "Art"
            record(9, "Merge down Notes into the layer below", ok9,
                   f"{json.dumps(doc_layers)} quote in {where}")
            ok_all = ok_all and ok9

            for _ in range(3):
                page.evaluate(UNDO, cv_id)
                page.wait_for_timeout(250)
            doc_layers = page.evaluate(DOC_LAYERS, cv_id)
            where = page.evaluate(LAYER_OF_TAG, {"id": cv_id, "tag": "blockquote"})
            ok10 = "Notes" in [l["name"] for l in doc_layers] and where == "Notes"
            record(10, "Undo x3 brings Notes and the pull quote back", ok10,
                   f"{json.dumps(doc_layers)} quote in {where}")
            ok_all = ok_all and ok10

            before_tree = page.evaluate(DOC_LAYERS, cv_id)
            page.evaluate(CLICK_SAVE, cv_id)
            page.wait_for_timeout(1500)
            page.evaluate(DROP_WIDGETS)
            page.wait_for_timeout(800)
            cv2 = page.evaluate(MOUNT_CANVAS, MAGAZINE_COPY)
            tl2 = page.evaluate(MOUNT_TOOLS, MAGAZINE_COPY)
            wait_ok(page, FILE_READY, cv2, 20000, "reload file ready")
            page.wait_for_timeout(500)
            after_tree = page.evaluate(DOC_LAYERS, cv2)
            ok11 = [l["name"] for l in after_tree] == [l["name"] for l in before_tree]
            record(11, "Save, reload: the tree matches", ok11,
                   f"before={json.dumps(before_tree)} after={json.dumps(after_tree)}")
            ok_all = ok_all and ok11

            page.evaluate(DROP_WIDGETS)
            page.wait_for_timeout(800)
            cv3 = page.evaluate(MOUNT_CANVAS, PLAIN)
            tl3 = page.evaluate(MOUNT_TOOLS, PLAIN)
            wait_ok(page, FILE_READY, cv3, 20000, "plain file ready")
            page.wait_for_timeout(700)
            plain_layers = page.evaluate(DOC_LAYERS, cv3)
            ok12 = (len(plain_layers) == 1 and plain_layers[0]["name"] == "Layer 1"
                    and plain_layers[0]["plugin"] == "html" and plain_layers[0]["kids"] == 2)
            record(12, "A plain html with no layers gets Layer 1", ok12,
                   json.dumps(plain_layers) + f" panel={json.dumps(page.evaluate(PANEL_LAYERS, tl3))}")
            ok_all = ok_all and ok12

            browser.close()
    finally:
        for path in (MAGAZINE_COPY, PLAIN):
            if os.path.exists(path):
                os.remove(path)

    out_path = os.path.join(args.out, "phase35_04-results.json")
    with open(out_path, "w") as fh:
        json.dump({"results": RESULTS, "console": CONSOLE}, fh, indent=2)
    print(f"\n{sum(1 for r in RESULTS if r['pass'])}/{len(RESULTS)} passed. Log: {out_path}")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
