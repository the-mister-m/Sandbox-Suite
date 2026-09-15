"""Headless Playwright test for Phase 3.5 job 15 — snippets drawer.

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-15-sonnet-snippets.md
Fixture: Docs/scratchpad/phase35-magazine.html, copied before the run,
copy removed at teardown. Original untouched.

Usage:
    python3 Docs/tests/phase35_15.py --session <sid> --out Docs/Reports/

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
MAGAZINE_COPY = os.path.join(SCRATCH, "phase35_15-magazine-copy.html")

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
  f.setOption("section", "snippets");
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

CARD_COUNT = r"""
(id) => MX.grid.frames[id].el.querySelectorAll(".mxtl-body .cc-nav-card").length
"""

DROP_TEXT_FRAME = r"""
({id, x, y}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  const rect = doc.body.getBoundingClientRect();
  const dt = { getData: () => "Text frame", dropEffect: "copy" };
  const ev = new doc.defaultView.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  Object.defineProperty(ev, "clientX", { value: rect.left + x });
  Object.defineProperty(ev, "clientY", { value: rect.top + y });
  doc.dispatchEvent(ev);
  return true;
}
"""

DROPPED_STATE = r"""
({id, x, y}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  const layer = doc.querySelector("[data-cc-layer]");
  if (!layer) return { found: false, note: "no layer" };
  const hit = Array.prototype.slice.call(layer.children).filter((n) =>
    n.tagName === "DIV" && n.style.left === x + "px" && n.style.top === y + "px");
  if (!hit.length) return { found: false, note: "no div at " + x + "," + y };
  const elId = hit[0].getAttribute("data-od-id");
  const selected = cv.selected();
  return { found: true, count: hit.length, selected: selected.indexOf(elId) >= 0, elId: elId };
}
"""

UNDO = r"""
(id) => { MX.grid.frames[id]._canvas.undo(); return true; }
"""

LAYER_DIV_COUNT = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvas;
  const layer = cv.doc().querySelector("[data-cc-layer]");
  return layer ? layer.querySelectorAll(":scope > div").length : -1;
}
"""

SET_MODE = r"""
({id, mode}) => { MX.grid.frames[id].setOption("mode", mode); return true; }
"""

EDIT_TEXT_FRAME = r"""
({id, x, y}) => {
  const cv = MX.grid.frames[id]._canvas;
  const doc = cv.doc();
  const layer = doc.querySelector("[data-cc-layer]");
  const hit = layer ? Array.prototype.slice.call(layer.children).filter((n) =>
    n.tagName === "DIV" && n.style.left === x + "px" && n.style.top === y + "px") : [];
  if (!hit.length) return { ok: false, note: "no div at " + x + "," + y };
  const el = hit[0];
  const rect = el.getBoundingClientRect();
  const dbl = new doc.defaultView.MouseEvent("dblclick", {
    bubbles: true, cancelable: true,
    clientX: rect.left + 5, clientY: rect.bottom - 5
  });
  el.dispatchEvent(dbl);
  const wasEditing = el.getAttribute("contenteditable") !== null;
  el.textContent = "hello";
  el.dispatchEvent(new doc.defaultView.Event("blur", { bubbles: true }));
  return { ok: true, editing: wasEditing, source: cv.source() };
}
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
    ap.add_argument("--surface", default="phase35-15-headless")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    if not os.path.exists(MAGAZINE):
        print("MISSING FIXTURE")
        sys.exit(1)
    shutil.copyfile(MAGAZINE, MAGAZINE_COPY)

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
            page.wait_for_function("() => window.MX && window.MX.grid && window.MX.canvasCore", timeout=15000)

            stale = page.evaluate("() => MX.grid.instances.map((i) => i.id)")
            if stale:
                page.evaluate("(ids) => Promise.all(ids.map((id) => MX.grid.removeWidget(id)))", stale)
                page.wait_for_timeout(1000)

            cv_id = page.evaluate(MOUNT_CANVAS, MAGAZINE_COPY)
            tl_id = page.evaluate(MOUNT_TOOLS, MAGAZINE_COPY)
            loaded = wait_ok(page, FILE_READY, cv_id, 20000, "magazine file ready")
            record(1, "Fixture copy opens in file mode", loaded)
            ok_all = ok_all and loaded
            page.wait_for_timeout(300)

            count = page.evaluate(CARD_COUNT, tl_id)
            ok2 = count == 9
            record(2, "Snippets tab shows nine cards", ok2, f"got {count}")
            ok_all = ok_all and ok2

            before = page.evaluate(LAYER_DIV_COUNT, cv_id)
            page.evaluate(DROP_TEXT_FRAME, {"id": cv_id, "x": 200, "y": 300})
            page.wait_for_timeout(300)
            state = page.evaluate(DROPPED_STATE, {"id": cv_id, "x": 200, "y": 300})
            ok3 = bool(state.get("found")) and state.get("count") == 1 and bool(state.get("selected"))
            record(3, "Drop Text frame at 200,300: one div, selected", ok3, json.dumps(state))
            ok_all = ok_all and ok3

            page.evaluate(UNDO, cv_id)
            page.wait_for_timeout(300)
            after = page.evaluate(LAYER_DIV_COUNT, cv_id)
            ok4 = before is not None and after == before
            record(4, "Undo removes the dropped element", ok4, f"before={before} after={after}")
            ok_all = ok_all and ok4

            page.evaluate(SET_MODE, {"id": cv_id, "mode": "canvas"})
            page.evaluate(DROP_TEXT_FRAME, {"id": cv_id, "x": 200, "y": 300})
            page.wait_for_timeout(300)
            edit = page.evaluate(EDIT_TEXT_FRAME, {"id": cv_id, "x": 200, "y": 300})
            src = edit.get("source", "")
            ok5 = bool(edit.get("editing")) and "hello" in src and "contenteditable" not in src
            record(5, "Double-click the dropped frame, type hello, blur, source "
                   "contains hello, source has no contenteditable", ok5, json.dumps(edit)[:200])
            ok_all = ok_all and ok5

            browser.close()
    finally:
        if os.path.exists(MAGAZINE_COPY):
            os.remove(MAGAZINE_COPY)

    out_path = os.path.join(args.out, "phase35_15-results.json")
    with open(out_path, "w") as fh:
        json.dump({"results": RESULTS, "console": CONSOLE}, fh, indent=2)
    print(f"\n{sum(1 for r in RESULTS if r['pass'])}/{len(RESULTS)} passed. Log: {out_path}")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
