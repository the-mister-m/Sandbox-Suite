"""Headless Playwright test for Phase 3.5 job 2 — page setup (pages tab).

Spec: Docs/Specs/Code Canvas port/Phase3.5 Adobe/SPEC-phase3.5-02-sonnet-page-setup.md
Fixtures: Docs/scratchpad/phase35-magazine.html (has a page block),
          Docs/scratchpad/second.html (plain, no page block).
Both copied before the run; copies removed at teardown. Originals untouched.

Usage:
    python3 Docs/tests/phase35_02.py --session <sid> --out Docs/Reports/

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
PLAIN = os.path.join(SCRATCH, "second.html")
MAGAZINE_COPY = os.path.join(SCRATCH, "phase35_02-magazine-copy.html")
PLAIN_COPY = os.path.join(SCRATCH, "phase35_02-plain-copy.html")

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
  f.setOption("section", "page");
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

RETARGET = r"""
({id, target}) => { MX.grid.frames[id].setOption("target", target); }
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

BODY_WIDTH = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return cv.idoc.defaultView.getComputedStyle(cv.idoc.body).width;
}
"""

TOKEN_VALUE = r"""
({id, token}) => {
  const cv = MX.grid.frames[id]._canvasState;
  return cv.idoc.defaultView.getComputedStyle(cv.idoc.documentElement).getPropertyValue(token).trim();
}
"""

SOURCE_HAS_TOKENS = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  const src = cv.source || "";
  const toks = ["--cc-page-w", "--cc-page-h", "--cc-margin-top", "--cc-margin-right",
    "--cc-margin-bottom", "--cc-margin-left", "--cc-columns", "--cc-gutter", "--cc-bleed", "--cc-grid"];
  return toks.every((t) => src.indexOf(t) >= 0);
}
"""

SET_OPTION = r"""
({id, key, value}) => { MX.grid.frames[id].setOption(key, value); }
"""

# state: canvas.js writes to disk only on an explicit Meta/Ctrl+S (doSave,
# canvas.js:1989); markDirty/afterChange never autosaves, and doSave only
# fires when fileEditable(cv) is true, which requires cv.mode === "canvas"
# (canvas.js:1963-1965) — default mount mode is "preview". Set mode to
# "canvas", then focus the canvas iframe and press the save chord before
# any reload check, same as job 3.
FOCUS_IFRAME = r"""
(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()
"""

STATUS_SAVED = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "saved");
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
    ap.add_argument("--surface", default="phase35-02-headless")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    if not os.path.exists(MAGAZINE) or not os.path.exists(PLAIN):
        print("MISSING FIXTURE")
        sys.exit(1)
    shutil.copyfile(MAGAZINE, MAGAZINE_COPY)
    shutil.copyfile(PLAIN, PLAIN_COPY)

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
            page.evaluate(SET_OPTION, {"id": cv_id, "key": "mode", "value": "canvas"})

            did2 = page.evaluate(SET_SELECT, {"id": tl_id, "label": "Size", "value": "A4"})
            page.wait_for_timeout(300)
            bw = page.evaluate(BODY_WIDTH, cv_id)
            ok2 = did2 and bw == "794px"
            record(2, "Pages tab: set A4, body computed width 794px", ok2, f"got {bw!r}")
            ok_all = ok_all and ok2

            did3 = page.evaluate(SET_NUMBER, {"id": tl_id, "label": "Count", "value": 2})
            page.wait_for_timeout(300)
            col = page.evaluate(TOKEN_VALUE, {"id": cv_id, "token": "--cc-columns"})
            ok3 = did3 and col == "2"
            record(3, "Pages tab: set columns 2, token reads 2", ok3, f"got {col!r}")
            ok_all = ok_all and ok3

            page.evaluate(FOCUS_IFRAME, cv_id)
            page.keyboard.press("Meta+s")
            saved = wait_ok(page, STATUS_SAVED, cv_id, 8000, "status reads saved")
            CONSOLE.append(f"[harness] save before reload: saved={saved}")
            page.wait_for_timeout(1200)
            page.reload(wait_until="load", timeout=25000)
            page.wait_for_function("() => window.MX && window.MX.grid && window.MX.canvasCore", timeout=15000)
            loaded2 = wait_ok(page, FILE_READY, cv_id, 20000, "magazine file ready after reload")
            bw2 = page.evaluate(BODY_WIDTH, cv_id) if loaded2 else None
            col2 = page.evaluate(TOKEN_VALUE, {"id": cv_id, "token": "--cc-columns"}) if loaded2 else None
            ok4 = bool(loaded2) and bw2 == "794px" and col2 == "2"
            record(4, "Reload: A4 width and columns 2 persist", ok4, f"width={bw2!r} columns={col2!r}")
            ok_all = ok_all and ok4

            page.evaluate(RETARGET, {"id": cv_id, "target": PLAIN_COPY})
            page.evaluate(RETARGET, {"id": tl_id, "target": PLAIN_COPY})
            loaded3 = wait_ok(page, FILE_READY, cv_id, 20000, "plain file ready")
            did5 = page.evaluate(SET_SELECT, {"id": tl_id, "label": "Size", "value": "Letter"})
            page.wait_for_timeout(300)
            has_toks = page.evaluate(SOURCE_HAS_TOKENS, cv_id)
            ok5 = bool(loaded3) and bool(did5) and bool(has_toks)
            record(5, "Plain html with no page block: set Letter creates the block with all tokens", ok5)
            ok_all = ok_all and ok5

            browser.close()
    finally:
        if os.path.exists(MAGAZINE_COPY):
            os.remove(MAGAZINE_COPY)
        if os.path.exists(PLAIN_COPY):
            os.remove(PLAIN_COPY)

    out_path = os.path.join(args.out, "phase35_02-results.json")
    with open(out_path, "w") as fh:
        json.dump({"results": RESULTS, "console": CONSOLE}, fh, indent=2)
    print(f"\n{sum(1 for r in RESULTS if r['pass'])}/{len(RESULTS)} passed. Log: {out_path}")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
