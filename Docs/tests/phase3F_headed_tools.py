"""Headed Playwright walk for Phase 3F job H3 — Tools panel, cross-instance
saves, socket first bind.

Built on Docs/tests/phase3F_headed.py: same launch, console capture, waits,
record/shot pair per line, fixture hold and restore, socket rebind fallback,
teardown of every surface the run creates.

Walk: ten lines, job H3 brief.
Scope: Docs/Scope/Code Canvas port/SCOPE-phase3F-file-mode.md, 3.2 and 3.7.

Fixtures, copies of the plain fixtures, only the copies are driven:
    phase3F-fixture-tools.html   — canvas A and canvas B
    phase3F-fixture-tools-2.html — canvas B's second tab

Both copies are made at start from the originals and written back at teardown.

Usage:
    python3 Docs/tests/phase3F_headed_tools.py --session <sid> \
        --out Docs/Reports/phase3F-headed-tools/

Exit code 0 once the page loads; the receipt is the record.
"""

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(ROOT, "Docs", "scratchpad")
ORIG1 = os.path.join(SCRATCH, "phase3F-fixture.html")
ORIG2 = os.path.join(SCRATCH, "phase3F-fixture-2.html")
TAB1 = os.path.join(SCRATCH, "phase3F-fixture-tools.html")
TAB2 = os.path.join(SCRATCH, "phase3F-fixture-tools-2.html")

RESULTS = []
CONSOLE = []
PAGEERRORS = []


def record(num, name, passed, shot, note=""):
    RESULTS.append({"n": num, "name": name, "pass": bool(passed),
                    "shot": os.path.basename(shot or ""), "note": note})
    print(f"[{num}] {'PASS' if passed else 'FAIL'} — {name}" + (f"\n      {note}" if note else ""))


def measure(num, name, shot, note=""):
    RESULTS.append({"n": num, "name": name, "pass": None,
                    "shot": os.path.basename(shot or ""), "note": note})
    print(f"[{num}] MEASUREMENT — {name}\n      {note}")


def note_response(tag, resp):
    if resp.status >= 400:
        CONSOLE.append(f"[{tag}:http:{resp.status}] {resp.url}")


def wire(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"[{tag}:console:{m.type}] {m.text}"))
    page.on("response", lambda r: note_response(tag, r))
    page.on("pageerror", lambda e: (
        PAGEERRORS.append(f"[{tag}:pageerror] {e}"),
        CONSOLE.append(f"[{tag}:pageerror] {e}"),
        CONSOLE.append(f"[{tag}:pageerror:stack] "
                       f"{str(getattr(e, 'stack', '') or '').replace(chr(10), ' | ')[:600]}")))


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
  return !!(f && f._toolsState && f._toolsState.core && f._toolsState.tools);
}
"""

CV = r"""
(id) => {
  const f = MX.grid.frames[id];
  if (!f || !f._canvasState) return null;
  const cv = f._canvasState;
  const tabs = cv.targetsEl
    ? Array.prototype.map.call(cv.targetsEl.querySelectorAll(".mxcv-tab"),
        (t) => ({name: t.textContent, path: t.title, on: t.classList.contains("mxcv-on")}))
    : [];
  return {
    mode: cv.mode, docMode: cv.docMode, path: cv.path,
    targets: cv.targets.slice(), selection: cv.selection.slice(),
    dirty: !!cv.dirty, status: cv.statusEl ? cv.statusEl.textContent : "",
    tabs: tabs, tabsHidden: cv.targetsEl ? !!cv.targetsEl.hidden : null,
    cached: Object.keys(cv.tabs),
    sourceLen: (cv.source || "").length,
    bodyKids: cv.idoc && cv.idoc.body ? cv.idoc.body.children.length : -1,
    text: cv.idoc && cv.idoc.body
      ? cv.idoc.body.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : "",
    canUndo: cv.history ? cv.history.canUndo() : null,
    canRedo: cv.history ? cv.history.canRedo() : null,
    optTarget: f.options.target || "",
    optTargets: (f.options.targets || []).slice(),
    optMode: f.options.mode
  };
}
"""

# picker stub: the suite picker is native on this machine, a macOS dialog no
# browser driver can reach. The stub commits the path and leaves the widget's
# own onAdd path, option writes and re-render untouched.
STUB_PICKER = r"""
(path) => {
  window.__pickCalls = [];
  MX.openRootBrowser = (start, commit, opts) => {
    window.__pickCalls.push({start: start, opts: opts});
    commit(path);
    return Promise.resolve();
  };
  return true;
}
"""

CLICK_ADD = r"""
(id) => {
  const btn = MX.grid.frames[id].el.querySelector(".mxtg-add");
  if (!btn) return false;
  btn.click();
  return true;
}
"""

TG_ROWS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  const empty = el.querySelector(".mxtg-empty");
  return {
    empty: empty ? empty.textContent : null,
    rows: Array.prototype.map.call(el.querySelectorAll(".mxtg-row"), (r) => ({
      name: r.querySelector(".mxtg-name").textContent,
      path: r.title, on: r.classList.contains("mxtg-on")
    })),
    picks: window.__pickCalls || []
  };
}
"""

TL_TAB_CLICK = r"""
(args) => {
  const tabs = MX.grid.frames[args.id].el.querySelectorAll(".mxtl-tab");
  for (const t of tabs) if (t.textContent === args.name) { t.click(); return true; }
  return false;
}
"""

TL_TABS = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  return Array.prototype.map.call(el.querySelectorAll(".mxtl-tab"), (t) => ({
    name: t.textContent, hidden: !!t.hidden,
    on: t.classList.contains("mxtl-on")
  }));
}
"""

TL_WHO = r"""
(id) => {
  const tl = MX.grid.frames[id]._toolsState;
  const who = MX.grid.frames[id].el.querySelector(".mxtl-who");
  return {canvasOpt: tl ? tl.canvasOpt : null,
          focusedInst: tl ? tl.focusedInst : null,
          optTarget: MX.grid.frames[id].options.target || "",
          who: who ? who.textContent : ""};
}
"""

TL_LAYER_ROWS = r"""
(id) => {
  const body = MX.grid.frames[id].el.querySelector(".mxtl-body");
  return Array.prototype.map.call(body.querySelectorAll(".cc-panel-row"), (r) => {
    const parts = Array.prototype.map.call(
      r.querySelectorAll(".cc-panel-row-content"), (e) => e.textContent);
    return {
      id: r.dataset.id || "",
      name: r.querySelector(".cc-panel-row-name")
        ? r.querySelector(".cc-panel-row-name").textContent : "",
      parts: parts,
      indent: parseInt(r.style.paddingLeft || "0", 10),
      active: r.classList.contains("cc-panel-row-active")
    };
  });
}
"""

TL_INSPECTOR = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  const body = el.querySelector(".mxtl-body");
  const fields = {};
  for (const l of body.querySelectorAll(".cc-panel-label")) {
    const k = l.querySelector("span");
    const i = l.querySelector("textarea") || l.querySelector("input") || l.querySelector("select");
    if (k && i) fields[k.textContent] = i.value;
  }
  const ids = Array.prototype.map.call(body.querySelectorAll(".cc-panel-row-id"),
    (e) => e.textContent);
  return {section: MX.grid.frames[id]._toolsState.section, ids: ids,
          text: fields["Text"] === undefined ? null : fields["Text"]};
}
"""

TL_TYPE_TEXT = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  const labels = Array.prototype.slice.call(body.querySelectorAll(".cc-panel-label"));
  const hit = labels.filter((l) => l.querySelector("span").textContent === "Text")[0];
  if (!hit) return false;
  const input = hit.querySelector("textarea") || hit.querySelector("input");
  if (!input) return false;
  input.value = args.value;
  input.dispatchEvent(new Event("input", {bubbles: true}));
  return true;
}
"""

# state: one layer row clicked, shift optional
ROW_CLICK = r"""
(args) => {
  const rows = MX.grid.frames[args.id].el.querySelectorAll(".cc-panel-row");
  for (const r of rows) {
    if (r.dataset.id !== args.rid) continue;
    r.dispatchEvent(new MouseEvent("click",
      {bubbles: true, cancelable: true, shiftKey: !!args.shift}));
    return true;
  }
  return false;
}
"""

# function: HTML5 drag of one layer row onto another at a height fraction
ROW_DRAG = r"""
(args) => {
  const body = MX.grid.frames[args.id].el.querySelector(".mxtl-body");
  const rows = Array.prototype.slice.call(body.querySelectorAll(".cc-panel-row"));
  const src = rows.filter((r) => r.dataset.id === args.fromId)[0];
  const dst = rows.filter((r) => r.dataset.id === args.toId)[0];
  if (!src || !dst) return {ok: false, reason: "row missing",
                            ids: rows.map((r) => r.dataset.id)};
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent("dragstart",
    {bubbles: true, cancelable: true, dataTransfer: dt}));
  const carried = dt.getData("text/plain");
  const rect = dst.getBoundingClientRect();
  const init = {bubbles: true, cancelable: true, dataTransfer: dt,
                clientX: rect.left + 10, clientY: rect.top + rect.height * args.frac};
  dst.dispatchEvent(new DragEvent("dragover", init));
  dst.dispatchEvent(new DragEvent("drop", init));
  return {ok: true, carried: carried, frac: args.frac,
          rowHeight: Math.round(rect.height)};
}
"""

# state: the eye button on one layer row
ROW_EYE = r"""
(args) => {
  const rows = MX.grid.frames[args.id].el.querySelectorAll(".cc-panel-row");
  for (const r of rows) {
    if (r.dataset.id !== args.rid) continue;
    const b = r.querySelector(".cc-panel-row-btn");
    if (!b) return {ok: false, reason: "no eye button"};
    const before = {title: b.title, text: b.textContent};
    b.click();
    return {ok: true, before: before};
  }
  return {ok: false, reason: "row missing"};
}
"""

# state: Group / Ungroup in the layers head
HEAD_BTN = r"""
(args) => {
  const head = MX.grid.frames[args.id].el.querySelector(".cc-panel-order-head");
  if (!head) return {ok: false, reason: "no layers head"};
  const btns = Array.prototype.slice.call(head.querySelectorAll(".cc-panel-toggle"));
  const hit = btns.filter((b) => b.textContent === args.label)[0];
  if (!hit) return {ok: false, reason: "no button",
                    labels: btns.map((b) => b.textContent)};
  if (hit.disabled) return {ok: false, reason: "disabled"};
  hit.click();
  return {ok: true};
}
"""

# function: the stage's element children, read out of the live document and
# out of the parsed source, as tag.class|own text labels
STAGE_ORDER = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  const lab = (el) => el.tagName.toLowerCase()
    + (el.classList && el.classList[1] ? "." + el.classList[1]
       : (el.classList && el.classList[0] ? "." + el.classList[0] : ""))
    + "|" + (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 14);
  const kids = (doc) => {
    if (!doc || !doc.body) return null;
    const stage = doc.body.querySelector(".stage");
    if (!stage) return null;
    return Array.prototype.filter.call(stage.children,
      (c) => !(c.matches && c.matches(cv.patch.HOST_NODE_SELECTOR))).map(lab);
  };
  const src = cv.patch.parse(f._canvas.source());
  return {live: kids(cv.idoc), source: kids(src)};
}
"""

# function: one element's display, live and source
DISPLAY_BOTH = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  const src = cv.patch.parse(f._canvas.source());
  const live = cv.patch.find(cv.idoc, args.rid);
  const s = src ? cv.patch.find(src, args.rid) : null;
  return {
    inLive: !!live, inSource: !!s,
    liveDisplay: live ? live.style.display : null,
    srcDisplay: s ? s.style.display : null,
    liveStyle: live ? (live.getAttribute("style") || "") : null,
    srcStyle: s ? (s.getAttribute("style") || "") : null
  };
}
"""

# function: first element matching a selector, with the id the port would use
FIND_EL = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  if (!cv.idoc || !cv.idoc.body) return null;
  for (const el of cv.idoc.body.querySelectorAll(args.sel)) {
    if (el.matches(cv.patch.HOST_NODE_SELECTOR)) continue;
    return {id: el.getAttribute("data-od-id") || cv.patch.stableId(el),
            stamped: !!el.getAttribute("data-od-id"),
            text: (el.textContent || "").trim().slice(0, 90)};
  }
  return null;
}
"""

# function: one element's text, live and source
TEXT_BOTH = r"""
(args) => {
  const f = MX.grid.frames[args.id], cv = f._canvasState;
  const src = cv.patch.parse(f._canvas.source());
  const l = cv.patch.find(cv.idoc, args.rid);
  const s = src ? cv.patch.find(src, args.rid) : null;
  return {live: l ? l.textContent.trim().slice(0, 120) : null,
          source: s ? s.textContent.trim().slice(0, 120) : null};
}
"""

SET_TEXT = r"""
(args) => {
  MX.grid.frames[args.id]._canvas.patchSource(
    {id: args.rid, kind: "set-text", value: args.text});
  return true;
}
"""

SET_FULL_SOURCE = r"""
(args) => {
  MX.grid.frames[args.id]._canvas.patchSource(
    {kind: "set-full-source", source: args.text});
  return true;
}
"""

# state: the layers head buttons and which rows are lit
HEAD_STATE = r"""
(id) => {
  const el = MX.grid.frames[id].el;
  const head = el.querySelector(".cc-panel-order-head");
  const btns = head
    ? Array.prototype.map.call(head.querySelectorAll(".cc-panel-toggle"),
        (b) => ({label: b.textContent, disabled: !!b.disabled}))
    : [];
  const lit = Array.prototype.filter.call(el.querySelectorAll(".cc-panel-row"),
    (r) => r.classList.contains("cc-panel-row-active")).map((r) => r.dataset.id);
  const tl = MX.grid.frames[id]._toolsState;
  return {buttons: btns, rows_lit: lit, section: tl ? tl.section : null};
}
"""

SET_TARGETS = r"""
(args) => {
  const f = MX.grid.frames[args.id];
  f.setOption("targets", args.targets);
  f.setOption("target", args.target);
  return f.getOptions();
}
"""

TAB_RECORD = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  const rec = cv.tabs[args.path];
  if (!rec) return {has: false, cached: Object.keys(cv.tabs)};
  return {has: true, dirty: !!rec.dirty, len: (rec.text || "").length,
          text: rec.text || "", cached: Object.keys(cv.tabs)};
}
"""

LIVE_HAS = r"""
(args) => {
  const cv = MX.grid.frames[args.id]._canvasState;
  if (!cv.idoc || !cv.idoc.body) return false;
  return cv.idoc.body.textContent.indexOf(args.needle) >= 0;
}
"""

SRC_HAS = r"""
(args) => {
  const s = MX.grid.frames[args.id]._canvas.source();
  return {hit: s.indexOf(args.needle) >= 0, len: s.length};
}
"""

HISTORY = r"""
(id) => {
  const cv = MX.grid.frames[id]._canvasState;
  return cv.history ? {canUndo: cv.history.canUndo(), canRedo: cv.history.canRedo()} : null;
}
"""

STATUS_SAVED = r"""
(id) => {
  const f = MX.grid.frames[id];
  const cv = f && f._canvasState;
  return !!(cv && cv.statusEl && cv.statusEl.textContent === "saved");
}
"""

FOCUS_IFRAME = "(id) => MX.grid.frames[id]._canvasState.iframe.contentWindow.focus()"


def row_by_words(rows, needle):
    for r in rows:
        if any(needle in p for p in r["parts"]):
            return r
    return None


def stage_row(rows):
    for r in rows:
        if "stage" in r["name"]:
            return r
    return rows[0] if rows else None


def undo(page, cid, times=1, settle=900):
    for _ in range(times):
        page.evaluate(FOCUS_IFRAME, cid)
        page.keyboard.press("Meta+z")
        page.wait_for_timeout(settle)


def save(page, cid, label=""):
    page.evaluate(FOCUS_IFRAME, cid)
    page.keyboard.press("Meta+s")
    ok = wait_ok(page, STATUS_SAVED, cid, 6000, f"status reads saved {label}")
    page.wait_for_timeout(1000)
    return ok


# function: one child moved out of the baseline order and reinserted
def reorder(base, frm, to):
    out = base[:]
    el = out.pop(frm)
    out.insert(to, el)
    return out


def index_of(order, word):
    for i, s in enumerate(order):
        if word in s:
            return i
    return -1


# function: baseline order with the child at frm landed before or after the
# child at ti, both indexes read in baseline coordinates
def move_to(base, frm, ti, after):
    if frm > ti:
        to = ti + 1 if after else ti
    else:
        to = ti if after else ti - 1
    return reorder(base, frm, to)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--surface", default="phase3F-headed-tools")
    ap.add_argument("--out", required=True)
    ap.add_argument("--boots", type=int, default=10)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    for path in (ORIG1, ORIG2):
        if not os.path.exists(path):
            print(f"MISSING FIXTURE {path}")
            sys.exit(1)

    # fixture copies: made here, driven by the walk, written back at teardown
    shutil.copyfile(ORIG1, TAB1)
    shutil.copyfile(ORIG2, TAB2)
    held = {}
    for path in (TAB1, TAB2):
        with open(path) as fh:
            held[path] = fh.read()
        CONSOLE.append(f"[harness] copy held before the run: "
                       f"{os.path.basename(path)}, {len(held[path])} bytes")

    grid_file = os.path.join(ROOT, "library", "grids", sid, args.surface + ".json")
    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] cleared a stale grid file at {grid_file}")

    CONSOLE.append(f"[harness] session open: {post(f'/api/sessions/{sid}/open')}")

    marker = "3F-H3 " + str(int(time.time()))
    findings = []
    boot_rows = []

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
        CONSOLE.append(f"[harness] socket right after load: "
                       f"{p1.evaluate('() => [MX.socket.state(), MX.socket.sid()]')}")
        socket_live = wait_ok(p1, '() => MX.socket.state() === "live"', None, 10000,
                              "ade socket live")
        if not socket_live:
            p1.evaluate("(sid) => MX.socket.bind(sid)", sid)
            socket_live = wait_ok(p1, '() => MX.socket.state() === "live"', None, 15000,
                                  "ade socket live after rebind")
        CONSOLE.append(f"[harness] ade socket live: {socket_live} "
                       f"(state={p1.evaluate('() => MX.socket.state()')!r})")

        stale = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        if stale:
            p1.evaluate("() => { for (const f of Object.values(MX.grid.frames))"
                        " if (f._canvasState) f._canvasState.dirty = false; }")
            p1.evaluate("() => Promise.all(MX.grid.instances.map((i) => i.id)"
                        ".map((id) => MX.grid.removeWidget(id)))")
            p1.wait_for_timeout(1500)
        CONSOLE.append(f"[harness] widgets on the surface at start: {stale}; "
                       f"after clearing: "
                       f"{p1.evaluate('() => MX.grid.instances.map((i) => i.type)')}")

        # ---- surface: canvas A, Targets on A, canvas B, Tools on A
        a = p1.evaluate(MOUNT, {"type": "canvas"})
        p1.evaluate(RESIZE, {"id": a, "col": 1, "row": 1, "w": 8, "h": 18})
        p1.wait_for_function(CANVAS_MOUNTED, arg=a, timeout=25000)

        g = p1.evaluate(MOUNT, {"type": "canvas_targets"})
        p1.evaluate(RESIZE, {"id": g, "col": 14, "row": 13, "w": 4, "h": 6})
        p1.wait_for_timeout(700)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('canvas', args.a)",
                    {"id": g, "a": a})
        p1.wait_for_timeout(500)

        p1.evaluate(STUB_PICKER, TAB1)
        added = p1.evaluate(CLICK_ADD, g)
        a_ready = wait_ok(p1, FILE_READY, a, 45000, "canvas A file ready")
        if not a_ready:
            p1.evaluate("(sid) => MX.socket.bind(sid)", sid)
            a_ready = wait_ok(p1, FILE_READY, a, 30000, "canvas A file ready after rebind")
        p1.wait_for_timeout(1200)

        b = p1.evaluate(MOUNT, {"type": "canvas"})
        p1.evaluate(RESIZE, {"id": b, "col": 9, "row": 1, "w": 5, "h": 10})
        p1.wait_for_function(CANVAS_MOUNTED, arg=b, timeout=25000)
        p1.evaluate(SET_TARGETS, {"id": b, "targets": [TAB1, TAB2], "target": TAB1})
        b_ready = wait_ok(p1, FILE_READY, b, 45000, "canvas B file ready")
        p1.wait_for_timeout(1000)

        t = p1.evaluate(MOUNT, {"type": "canvas_tools"})
        p1.evaluate(RESIZE, {"id": t, "col": 14, "row": 1, "w": 4, "h": 12})
        wait_ok(p1, TOOLS_READY, t, 30000, "tools ready")
        p1.wait_for_timeout(800)
        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('canvas', args.a)",
                    {"id": t, "a": a})
        p1.wait_for_timeout(800)

        p1.evaluate("(args) => MX.grid.frames[args.id].setOption('mode', 'canvas')",
                    {"id": a})
        p1.wait_for_timeout(800)
        p1.evaluate(TL_TAB_CLICK, {"id": t, "name": "layers"})
        p1.wait_for_timeout(800)

        who = p1.evaluate(TL_WHO, t)
        tg_rows = p1.evaluate(TG_ROWS, g)
        st_a = p1.evaluate(CV, a)
        st_b = p1.evaluate(CV, b)
        CONSOLE.append(f"[harness] setup: A={a} B={b} tools={t} targets={g}; "
                       f"add_clicked={added} A_ready={a_ready} B_ready={b_ready}; "
                       f"tools_binding={who}; targets_rows={tg_rows['rows']}; "
                       f"A mode={st_a['mode']!r} path={os.path.basename(st_a['path'])}; "
                       f"B mode={st_b['mode']!r} path={os.path.basename(st_b['path'])} "
                       f"targets={len(st_b['optTargets'])}")

        rows0 = p1.evaluate(TL_LAYER_ROWS, t)
        order0 = p1.evaluate(STAGE_ORDER, {"id": a})
        CONSOLE.append(f"[harness] layer rows at start: "
                       f"{[(r['name'], r['parts'], r['indent']) for r in rows0]}")
        CONSOLE.append(f"[harness] stage order at start: {order0}")

        gold = row_by_words(rows0, "gold box")
        red = row_by_words(rows0, "red box")
        blue = row_by_words(rows0, "blue box")
        stage = stage_row(rows0)
        setup_ok = bool(gold and red and blue and stage and a_ready and b_ready)
        if not setup_ok:
            findings.append("setup — layer rows or file load missing; the walk ran blind")

        # baseline: the stage's order as the file was loaded, live and source
        baseline = order0["live"] or []
        gi = index_of(baseline, "gold box")
        ri = index_of(baseline, "red box")
        if len(baseline) != 7 or gi < 0 or ri < 0:
            setup_ok = False
            findings.append("setup — the stage did not load with its seven children")

        def order_now():
            return p1.evaluate(STAGE_ORDER, {"id": a})

        def restored():
            o = order_now()
            return (o["live"] == baseline and o["source"] == baseline), o

        # function: one drag, order read live and in source, one undo, restore
        # check; the layer rows are re-read each time so ids stay current
        def drag_case(from_word, to_word, frac, want, shot_name):
            rows = p1.evaluate(TL_LAYER_ROWS, t)
            src_row = row_by_words(rows, from_word)
            dst_row = (stage_row(rows) if to_word == "stage"
                       else row_by_words(rows, to_word))
            if not src_row or not dst_row:
                sh_ = shot(p1, args.out, shot_name)
                return {"ok": False, "shot": sh_,
                        "note": f"row missing: from={from_word} to={to_word}"}
            d = p1.evaluate(ROW_DRAG, {"id": t, "fromId": src_row["id"],
                                       "toId": dst_row["id"], "frac": frac})
            p1.wait_for_timeout(1100)
            o = order_now()
            sh_ = shot(p1, args.out, shot_name)
            undo(p1, a, 1)
            back, ob = restored()
            ok = bool(d.get("ok")) and o["live"] == want and o["source"] == want and back
            return {"ok": ok, "shot": sh_,
                    "note": (f"{from_word} onto {to_word} at frac {frac}: drag={d} "
                             f"want={want} live_after={o['live']} "
                             f"source_after={o['source']} undo_live={ob['live']} "
                             f"undo_source={ob['source']} restored={back}")}

        # ---- 1. layers drag, before, both directions
        if setup_ok:
            c1a = drag_case("gold box", "red box", 0.1,
                            move_to(baseline, gi, ri, False), "01a-gold-before-red")
            c1b = drag_case("red box", "gold box", 0.1,
                            move_to(baseline, ri, gi, False), "01b-red-before-gold")
            ok1 = c1a["ok"] and c1b["ok"]
            record(1, "Layers drag onto the target row's top quarter, both directions. "
                      "Dragged row lands right before the target, live and source. "
                      "Cmd-Z restores.", ok1, c1b["shot"],
                   c1a["note"] + " ;; " + c1b["note"])
            if not ok1:
                findings.append("1 — tools.js renderFileLayers drop / canvas.js move")
        else:
            sh = shot(p1, args.out, "01b-red-before-gold")
            record(1, "Layers drag, before.", False, sh, "skipped: setup incomplete")

        # ---- 2. layers drag, after, both directions
        if setup_ok:
            c2a = drag_case("gold box", "red box", 0.9,
                            move_to(baseline, gi, ri, True), "02a-gold-after-red")
            c2b = drag_case("red box", "gold box", 0.9,
                            move_to(baseline, ri, gi, True), "02b-red-after-gold")
            ok2 = c2a["ok"] and c2b["ok"]
            record(2, "Layers drag onto the target row's bottom quarter, both "
                      "directions. Dragged row lands right after the target, live and "
                      "source. Cmd-Z restores.", ok2, c2b["shot"],
                   c2a["note"] + " ;; " + c2b["note"])
            if not ok2:
                findings.append("2 — tools.js renderFileLayers drop / canvas.js move")
        else:
            sh = shot(p1, args.out, "02b-red-after-gold")
            record(2, "Layers drag, after.", False, sh, "skipped: setup incomplete")

        # ---- 3. layers drag, into, both directions
        if setup_ok:
            c3a = drag_case("gold box", "stage", 0.5,
                            reorder(baseline, gi, len(baseline) - 1), "03a-gold-into")
            c3b = drag_case("red box", "stage", 0.5,
                            reorder(baseline, ri, len(baseline) - 1), "03b-red-into")
            ok3 = c3a["ok"] and c3b["ok"]
            record(3, "Layers drag onto the stage row's middle, both directions. The "
                      "dragged row is the stage's last child, live and source. Cmd-Z "
                      "restores.", ok3, c3b["shot"], c3a["note"] + " ;; " + c3b["note"])
            if not ok3:
                findings.append("3 — tools.js renderFileLayers drop-into / canvas.js move")
        else:
            sh = shot(p1, args.out, "03b-red-into")
            record(3, "Layers drag, into.", False, sh, "skipped: setup incomplete")

        # ---- 4. eye
        if setup_ok:
            e1 = p1.evaluate(ROW_EYE, {"id": t, "rid": blue["id"]})
            p1.wait_for_timeout(1000)
            hid = p1.evaluate(DISPLAY_BOTH, {"id": a, "rid": blue["id"]})
            rows4 = p1.evaluate(TL_LAYER_ROWS, t)
            blue4 = row_by_words(rows4, "blue box")
            e2 = p1.evaluate(ROW_EYE, {"id": t, "rid": blue4["id"] if blue4 else blue["id"]})
            p1.wait_for_timeout(1000)
            shown = p1.evaluate(DISPLAY_BOTH, {"id": a, "rid": blue["id"]})
            undo(p1, a, 2)
            back4, o4 = restored()
            after_undo = p1.evaluate(DISPLAY_BOTH, {"id": a, "rid": blue["id"]})
            sh = shot(p1, args.out, "04-eye")
            ok4 = (e1.get("ok") and e2.get("ok")
                   and hid["liveDisplay"] == "none" and hid["srcDisplay"] == "none"
                   and shown["liveDisplay"] == "" and shown["srcDisplay"] == ""
                   and back4 and after_undo["liveDisplay"] == ""
                   and after_undo["srcDisplay"] == "")
            record(4, "Eye on blue's row hides it, live and source. Click again: display "
                      "back to empty, not 'block'. Cmd-Z twice restores.", ok4, sh,
                   f"first_click={e1} hidden live_display={hid['liveDisplay']!r} "
                   f"source_display={hid['srcDisplay']!r} live_style={hid['liveStyle']!r} "
                   f"source_style={hid['srcStyle']!r}; second_click={e2} "
                   f"live_display={shown['liveDisplay']!r} "
                   f"source_display={shown['srcDisplay']!r} "
                   f"live_style={shown['liveStyle']!r} source_style={shown['srcStyle']!r}; "
                   f"after_two_undos live={after_undo['liveDisplay']!r} "
                   f"source={after_undo['srcDisplay']!r} order_restored={back4}")
            if not ok4:
                findings.append("4 — tools.js eye set-style / canvas.js applyPatches undo")
        else:
            sh = shot(p1, args.out, "04-eye")
            record(4, "Eye.", False, sh, "skipped: setup incomplete")

        # ---- 5. Group and Ungroup buttons
        if setup_ok:
            rows5 = p1.evaluate(TL_LAYER_ROWS, t)
            r5 = row_by_words(rows5, "red box")
            b5 = row_by_words(rows5, "blue box")
            p1.evaluate(ROW_CLICK, {"id": t, "rid": r5["id"], "shift": False})
            p1.wait_for_timeout(600)
            p1.evaluate(ROW_CLICK, {"id": t, "rid": b5["id"], "shift": True})
            p1.wait_for_timeout(700)
            sel5 = p1.evaluate(CV, a)["selection"]
            head5 = p1.evaluate(HEAD_STATE, t)
            gb = gb_walk = p1.evaluate(HEAD_BTN, {"id": t, "label": "Group"})
            p1.wait_for_timeout(2000)
            st5 = p1.evaluate(CV, a)
            gid = st5["selection"][0] if st5["selection"] else ""
            rows5g = p1.evaluate(TL_LAYER_ROWS, t)
            grp_row = [r for r in rows5g if r["id"] == gid]
            kids_after = []
            if grp_row:
                base = grp_row[0]["indent"]
                seen = False
                for r in rows5g:
                    if r["id"] == gid:
                        seen = True
                        continue
                    if not seen:
                        continue
                    if r["indent"] <= base:
                        break
                    kids_after.append(r["parts"])
            order5g = order_now()
            head5u = p1.evaluate(HEAD_STATE, t)
            ub = p1.evaluate(HEAD_BTN, {"id": t, "label": "Ungroup"})
            p1.wait_for_timeout(1200)
            order5u = order_now()
            undo(p1, a, 2)
            back5, o5 = restored()
            sh = shot(p1, args.out, "05-group-ungroup")
            want_after_ungroup = baseline
            ok5 = (len(sel5) == 2 and gb_walk.get("ok") and gid.startswith("grp_")
                   and bool(grp_row) and len(kids_after) == 2
                   and any("red box" in "".join(p) for p in kids_after)
                   and any("blue box" in "".join(p) for p in kids_after)
                   and ub.get("ok")
                   and order5u["live"] == want_after_ungroup
                   and order5u["source"] == want_after_ungroup
                   and back5)
            record(5, "Click red, shift-click blue, Group. The group row holds both. "
                      "Ungroup. Back to red, blue. Cmd-Z twice.", ok5, sh,
                   f"selection_before_group={sel5} head_before_group={head5} "
                   f"head_after_group={head5u} group_button={gb_walk} "
                   f"group_id={gid!r} "
                   f"group_row_present={bool(grp_row)} rows_under_it={kids_after} "
                   f"stage_live_after_group={order5g['live']} "
                   f"stage_source_after_group={order5g['source']}; ungroup_button={ub} "
                   f"stage_live_after_ungroup={order5u['live']} "
                   f"stage_source_after_ungroup={order5u['source']}; "
                   f"after_two_undos live={o5['live']} source={o5['source']} "
                   f"restored={back5}")
            if not ok5:
                findings.append("5 — tools.js Group/Ungroup head buttons / "
                                "canvas.js group-ungroup / patch.js wrap-unwrap")
        else:
            sh = shot(p1, args.out, "05-group-ungroup")
            record(5, "Group and Ungroup buttons.", False, sh, "skipped: setup incomplete")

        # ---- 6. cross-instance reopen
        pa = p1.evaluate(FIND_EL, {"id": a, "sel": "p"})
        pb = p1.evaluate(FIND_EL, {"id": b, "sel": "p"})
        text6 = marker + " A EDIT"
        ok6 = False
        note6 = "no paragraph found"
        if pa and pb:
            b_dirty_before = p1.evaluate(CV, b)["dirty"]
            p1.evaluate(SET_TEXT, {"id": a, "rid": pa["id"], "text": text6})
            p1.wait_for_timeout(900)
            a_src = p1.evaluate(SRC_HAS, {"id": a, "needle": text6})
            saved6 = save(p1, a, "line 6")
            t0 = time.time()
            seen = False
            for _ in range(25):
                if p1.evaluate(LIVE_HAS, {"id": b, "needle": text6}):
                    seen = True
                    break
                p1.wait_for_timeout(200)
            secs6 = time.time() - t0
            st_b6 = p1.evaluate(CV, b)
            with open(TAB1) as fh:
                disk6 = fh.read()
            # A undoes and saves so the file goes back
            undo(p1, a, 1)
            back_src = p1.evaluate(SRC_HAS, {"id": a, "needle": text6})
            saved6b = save(p1, a, "line 6 restore")
            p1.wait_for_timeout(1500)
            with open(TAB1) as fh:
                disk6b = fh.read()
            ok6 = (b_dirty_before is False and a_src["hit"] and saved6 and seen
                   and secs6 <= 5.0 and not back_src["hit"] and saved6b
                   and text6 not in disk6b)
            note6 = (f"B dirty before={b_dirty_before}; A text edit in source="
                     f"{a_src['hit']} saved_status={saved6}; on disk after A's save="
                     f"{text6 in disk6}; B showed the new text={seen} in "
                     f"{secs6:.2f}s (limit 5s) B_path={os.path.basename(st_b6['path'])} "
                     f"B_dirty={st_b6['dirty']} B_status={st_b6['status']!r}; "
                     f"A undo removed it from source={not back_src['hit']} "
                     f"resave_status={saved6b} text_gone_from_disk="
                     f"{text6 not in disk6b} disk_bytes={len(disk6b)}")
        sh = shot(p1, args.out, "06-cross-instance-reopen")
        record(6, "A edits the paragraph and saves. B, clean on the same path, reopens "
                  "on its own within 5 seconds. A undoes and saves the file back.",
               ok6, sh, note6)
        if not ok6:
            findings.append("6 — canvas.js doSave broadcast / clean-tab reopen")

        # ---- 7. cross-instance dirty clear
        text7 = marker + " B EDIT"
        ok7 = False
        note7 = "no paragraph found"
        if pa and pb:
            p1.evaluate(SET_TEXT, {"id": b, "rid": pb["id"], "text": text7})
            p1.wait_for_timeout(900)
            b_src7 = p1.evaluate(SRC_HAS, {"id": b, "needle": text7})
            p1.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.path)",
                        {"id": b, "path": TAB2})
            wait_ok(p1, FILE_READY, b, 30000, "B on the second copy")
            p1.wait_for_timeout(1500)
            rec_dirty = p1.evaluate(TAB_RECORD, {"id": b, "path": TAB1})
            held_text = rec_dirty.get("text", "")
            p1.evaluate(SET_FULL_SOURCE, {"id": a, "text": held_text})
            wait_ok(p1, FILE_READY, a, 30000, "A after set-full-source")
            p1.wait_for_timeout(1500)
            a_has7 = p1.evaluate(SRC_HAS, {"id": a, "needle": text7})
            a_len7 = p1.evaluate("(id) => (MX.grid.frames[id]._canvas.source() || '').length", a)
            saved7 = save(p1, a, "line 7")
            p1.wait_for_timeout(2000)
            rec_after = p1.evaluate(TAB_RECORD, {"id": b, "path": TAB1})
            p1.evaluate("(args) => MX.grid.frames[args.id].setOption('target', args.path)",
                        {"id": b, "path": TAB1})
            wait_ok(p1, FILE_READY, b, 30000, "B back on the tools copy")
            p1.wait_for_timeout(1800)
            st_b7 = p1.evaluate(CV, b)
            b_live7 = p1.evaluate(LIVE_HAS, {"id": b, "needle": text7})
            b_src7b = p1.evaluate(SRC_HAS, {"id": b, "needle": text7})
            ok7 = (b_src7["hit"] and rec_dirty.get("has") and rec_dirty.get("dirty")
                   and a_has7["hit"] and saved7
                   and rec_after.get("has") and rec_after.get("dirty") is False
                   and b_live7 and b_src7b["hit"] and st_b7["dirty"] is False)
            note7 = (f"B edit in B's source={b_src7['hit']}; B's held record for the "
                     f"tools copy after switching away: has={rec_dirty.get('has')} "
                     f"dirty={rec_dirty.get('dirty')} bytes={rec_dirty.get('len')}; "
                     f"A set-full-source to that text ({len(held_text)} bytes), A's "
                     f"source now {a_len7} bytes, holds B's text={a_has7['hit']} "
                     f"saved_status={saved7}; B's record after A's save: "
                     f"has={rec_after.get('has')} dirty={rec_after.get('dirty')} "
                     f"bytes={rec_after.get('len')}; B switched back: live_has_text="
                     f"{b_live7} source_has_text={b_src7b['hit']} dirty={st_b7['dirty']} "
                     f"status={st_b7['status']!r} path={os.path.basename(st_b7['path'])}")
        sh = shot(p1, args.out, "07-cross-instance-dirty-clear")
        record(7, "B edits and switches away, its record stashed dirty. A saves that "
                  "exact text. B's record goes clean and shows the text on return.",
               ok7, sh, note7)
        if not ok7:
            findings.append("7 — canvas.js stash / saved broadcast clearing a dirty tab record")

        # ---- 8. socket first bind, ten fresh contexts
        # state: the boots measure the socket, so the file they open must be
        # whole; a walk that damaged it is a finding and the copy is remade
        with open(TAB1) as fh:
            before_boots = fh.read()
        if len(before_boots) < 200 or "stage" not in before_boots:
            findings.append(f"8 — the walk left the tools copy at {len(before_boots)} "
                            f"bytes; re-copied from the original before the boots")
            CONSOLE.append(f"[harness] tools copy was {len(before_boots)} bytes before "
                           f"the boots; re-copied from the original")
            shutil.copyfile(ORIG1, TAB1)
        else:
            CONSOLE.append(f"[harness] tools copy before the boots: "
                           f"{len(before_boots)} bytes")

        for i in range(args.boots):
            tag = f"boot{i + 1}"
            surface = f"{args.surface}-{tag}"
            gf = os.path.join(ROOT, "library", "grids", sid, surface + ".json")
            if os.path.exists(gf):
                os.remove(gf)
            bctx = browser.new_context(viewport={"width": 1200, "height": 900})
            bp = bctx.new_page()
            wire(bp, tag)
            row = {"n": i + 1, "rebound": False, "secs": None, "ready": False,
                   "state_at_mount": "", "state_end": ""}
            try:
                bp.goto(f"{BASE}/matrix/{sid}?s={surface}", wait_until="load", timeout=25000)
                bp.wait_for_function("() => window.MX && window.MX.grid && MX.grid.sid",
                                     timeout=15000)
                bp.wait_for_function("() => window.MX && window.MX.canvasCore", timeout=15000)
                stale_b = bp.evaluate("() => MX.grid.instances.map((i) => i.id)")
                if stale_b:
                    bp.evaluate("() => Promise.all(MX.grid.instances.map((i) => i.id)"
                                ".map((id) => MX.grid.removeWidget(id)))")
                    bp.wait_for_timeout(800)
                t0 = time.time()
                row["state_at_mount"] = bp.evaluate("() => MX.socket.state()")
                cid = bp.evaluate(MOUNT, {"type": "canvas"})
                bp.evaluate(RESIZE, {"id": cid, "col": 1, "row": 1, "w": 10, "h": 14})
                bp.wait_for_function(CANVAS_MOUNTED, arg=cid, timeout=25000)
                bp.evaluate(SET_TARGETS, {"id": cid, "targets": [TAB1], "target": TAB1})
                ready = wait_ok(bp, FILE_READY, cid, 12000, f"{tag} file ready")
                if not ready:
                    row["rebound"] = True
                    bp.evaluate("(s) => MX.socket.bind(s)", sid)
                    ready = wait_ok(bp, FILE_READY, cid, 30000, f"{tag} file ready after rebind")
                row["secs"] = round(time.time() - t0, 2)
                row["ready"] = ready
                row["state_end"] = bp.evaluate("() => MX.socket.state()")
                if i == 0:
                    shot(bp, args.out, "08-first-boot")
                bp.evaluate("(id) => { const f = MX.grid.frames[id];"
                            " if (f && f._canvasState) f._canvasState.dirty = false; }", cid)
                bp.evaluate("(id) => MX.grid.removeWidget(id)", cid)
                bp.wait_for_timeout(400)
            except Exception as exc:
                row["error"] = str(exc)[:160]
                CONSOLE.append(f"[harness] {tag} failed: {str(exc)[:160]}")
            bctx.close()
            if os.path.exists(gf):
                os.remove(gf)
            boot_rows.append(row)
            CONSOLE.append(f"[harness] {tag}: {row}")

        rebinds = len([r for r in boot_rows if r["rebound"]])
        sh = shot(p1, args.out, "08-socket-first-bind")
        measure(8, "Socket first bind over ten fresh contexts.", sh,
                f"rebinds_needed={rebinds} of {len(boot_rows)}; "
                f"seconds_to_file_ready={[r['secs'] for r in boot_rows]}; "
                f"ready={[r['ready'] for r in boot_rows]}; "
                f"socket_state_at_mount={[r['state_at_mount'] for r in boot_rows]}")

        # ---- 9. reload
        p1.evaluate("() => MX.grid.save()")
        p1.wait_for_timeout(1200)
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a, b])
        p1.reload(wait_until="load", timeout=30000)
        p1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                             timeout=20000)
        wait_ok(p1, CANVAS_MOUNTED, a, 30000, "canvas A mounted after reload")
        wait_ok(p1, CANVAS_MOUNTED, b, 30000, "canvas B mounted after reload")
        ra = wait_ok(p1, FILE_READY, a, 45000, "canvas A file ready after reload")
        rb = wait_ok(p1, FILE_READY, b, 45000, "canvas B file ready after reload")
        p1.wait_for_timeout(2500)
        st9a = p1.evaluate(CV, a)
        st9b = p1.evaluate(CV, b)
        who9 = p1.evaluate(TL_WHO, t)
        rows9 = p1.evaluate(TG_ROWS, g)
        tl9 = p1.evaluate(TL_TABS, t)
        sh = shot(p1, args.out, "09-after-reload")
        ok9 = (ra and rb and st9a["mode"] == "preview" and st9b["mode"] == "preview"
               and st9a["bodyKids"] > 0 and st9b["bodyKids"] > 0
               and who9["canvasOpt"] == a and len(rows9["rows"]) >= 1)
        record(9, "Reload. Two canvases come back in preview, Tools and Targets bound.",
               ok9, sh,
               f"A ready={ra} mode={st9a['mode']!r} path={os.path.basename(st9a['path'])} "
               f"body_children={st9a['bodyKids']}; B ready={rb} mode={st9b['mode']!r} "
               f"path={os.path.basename(st9b['path'])} body_children={st9b['bodyKids']} "
               f"targets={len(st9b['optTargets'])}; tools_binding={who9} "
               f"tools_tabs={[x['name'] for x in tl9 if not x['hidden']]}; "
               f"targets_rows={[r['name'] for r in rows9['rows']]}")
        if not ok9:
            findings.append("9 — canvas.js mount option round-trip / tools binding after reload")

        # ---- 10. console
        errs = [c for c in CONSOLE
                if ":console:error]" in c or ":pageerror]" in c
                or ":console:warning]" in c]
        others = [c for c in CONSOLE if c.startswith("[p1:console:")
                  or c.startswith("[boot")]
        sh = shot(p1, args.out, "10-final")
        ok10 = len(errs) == 0
        record(10, "Console clean the whole way.", ok10, sh,
               f"pageerrors={len(PAGEERRORS)} error_or_warning_lines={len(errs)} "
               f"page_console_lines={len(others)} total_console_lines={len(CONSOLE)}"
               + ("" if ok10 else " ;; " + " ;; ".join(errs[:10])))
        if not ok10:
            findings.append("10 — see console.txt")

        if args.hold:
            time.sleep(args.hold)

        # teardown: every widget this run made comes back down
        p1.evaluate("(ws) => { for (const w of ws) { const f = MX.grid.frames[w];"
                    " if (f && f._canvasState) f._canvasState.dirty = false; } }", [a, b])
        p1.evaluate("(ws) => Promise.all(ws.map((w) => MX.grid.removeWidget(w)))",
                    [a, b, g, t])
        p1.wait_for_timeout(1500)
        left = p1.evaluate("() => MX.grid.instances.map((i) => i.type)")
        CONSOLE.append(f"[harness] widgets left on the surface: {left}")
        browser.close()

    if os.path.exists(grid_file):
        os.remove(grid_file)
        CONSOLE.append(f"[harness] removed {grid_file}")
    else:
        CONSOLE.append(f"[harness] no grid file at {grid_file}")

    # the copies go back to their pre-run text; the originals are never written
    restored_map = {}
    for path in (TAB1, TAB2):
        with open(path) as fh:
            ran = fh.read()
        with open(path, "w") as fh:
            fh.write(held[path])
        with open(path) as fh:
            back = fh.read()
        restored_map[os.path.basename(path)] = {
            "run_left_bytes": len(ran), "wrote_back_bytes": len(held[path]),
            "matches_before": back == held[path],
            "data_od_id_after": len(re.findall(r'data-od-id="', back))}
        CONSOLE.append(f"[harness] restored {os.path.basename(path)}: run left "
                       f"{len(ran)} bytes, wrote back {len(held[path])}, "
                       f"matches_before={back == held[path]}")

    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump({"results": RESULTS, "findings": findings,
                   "boots": boot_rows, "fixtures_restored": restored_map},
                  fh, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        verdict = "MEAS" if r["pass"] is None else ("PASS" if r["pass"] else "FAIL")
        print(f"{r['n']:>2}  {verdict}  {r['name']}")
    print(f"\nboots: {boot_rows}")
    print(f"fixtures restored: {restored_map}")
    print(f"findings: {findings}")
    sys.exit(0)


if __name__ == "__main__":
    main()
