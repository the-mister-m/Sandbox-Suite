"""Headed Playwright pass for Phase 2 — the four graph widgets.

Spec: Docs/Specs/Code Canvas port/Phase2 Graph Widgets/SPEC-phase2-2H-opus-headed.md
Extends Docs/tests/phase1_headed.py — same launch pattern (chrome,
headless=False, console + pageerror collected per page), same surface path
through the session panel's "Add surface" button.

Usage:
    python3 Docs/tests/phase2_headed.py --session <sid> --out Docs/Reports/phase2-headed/

Node picks go through real pointer events at a point where elementFromPoint
already resolves to the wanted node, so an overlapping box never steals the
click.

Exit code 0 always once the page loads; the receipt is the record.
"""

import argparse
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"

TARGET = "graph"
N_VIEWER = "viewer.html"
N_PANEL = "viewer/panel.js"
N_SCORE = "viewer/score.js"
N_DATA = "viewer/data.js"
DIR_VIEWER = "dir:viewer"
SCORE_PATH = ("/Users/moth3rship/Desktop/AI Design/Wayfinder/fixtures/viewer"
              "/viewer/score.js")

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


# ---- surface / widget plumbing (phase1_headed.py) --------------------------


def add_surface(page):
    """session panel -> Empty surface -> Add surface; returns the new surface id + name"""
    page.wait_for_selector("text=Surface templates", timeout=10000)
    page.wait_for_timeout(400)
    clicked = page.evaluate(
        """() => {
          for (const row of document.querySelectorAll('.mx-overlay .mx-row')) {
            const grow = row.querySelector('.mx-grow');
            if (!grow || grow.textContent.trim() !== 'Empty surface') continue;
            const btn = Array.from(row.querySelectorAll('button'))
              .find(b => b.textContent === 'Add surface');
            if (btn) { btn.click(); return true; }
          }
          return false;
        }""")
    if not clicked:
        raise RuntimeError("Add surface button not found in the session panel")
    page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=10000)
    page.wait_for_timeout(900)
    return page.evaluate("() => window.MX.WINDOW_ID"), page.evaluate("() => window.MX.grid.surfaceName")


def mount(page, wtype, slot=None):
    """addWidget, then move it to `slot` so a drawn graph gets room"""
    inst = page.evaluate("(t) => window.MX.grid.addWidget(t).id", wtype)
    page.wait_for_selector(f'[data-instance="{inst}"]', timeout=10000)
    if slot:
        page.evaluate(
            """(a) => {
              const [id, slot] = a;
              const inst = window.MX.grid.instances.find(i => i.id === id);
              if (!inst) return;
              inst.slot = slot;
              const el = window.MX.grid.el.querySelector(`[data-instance="${id}"]`);
              if (el) window.MX.grid._place(el, slot);
              window.MX.grid.save();
              window.dispatchEvent(new Event('resize'));
            }""", [inst, slot])
    page.wait_for_timeout(600)
    return inst


def open_options(page, inst):
    page.locator(f'[data-instance="{inst}"] .mx-bar button', has_text="options").first.click()
    page.wait_for_selector(f'[data-instance="{inst}"] .mx-options', timeout=5000)
    page.wait_for_timeout(400)


def close_options(page, inst):
    if page.locator(f'[data-instance="{inst}"] .mx-options').count() == 0:
        return
    page.locator(f'[data-instance="{inst}"] .mx-options button', has_text="Close").first.click()
    page.wait_for_timeout(200)


def _control_index(page, inst, label, tag):
    """index of the options row's control among the panel's controls of that tag"""
    return page.evaluate(
        """(a) => {
          const [inst, label, tag] = a;
          const panel = document.querySelector(`[data-instance="${inst}"] .mx-options`);
          if (!panel) return -1;
          const all = Array.from(panel.querySelectorAll(
            tag === 'select' ? 'select' : 'input[type=checkbox]'));
          for (const row of panel.querySelectorAll('.mx-opt-row')) {
            const lbl = row.querySelector('label');
            if (!lbl || lbl.textContent !== label) continue;
            const ctl = row.querySelector(tag === 'select' ? 'select' : 'input[type=checkbox]');
            return ctl ? all.indexOf(ctl) : -1;
          }
          return -1;
        }""", [inst, label, tag])


def options_select(page, inst, label, value):
    """pick `value` in the options row keyed `label` — the user path"""
    open_options(page, inst)
    i = _control_index(page, inst, label, "select")
    if i < 0:
        close_options(page, inst)
        raise RuntimeError(f"{inst}: no select row {label!r} in the options panel")
    page.locator(f'[data-instance="{inst}"] .mx-options select').nth(i).select_option(value)
    page.wait_for_timeout(500)
    close_options(page, inst)


def options_check(page, inst, label, want):
    """tick/untick the options row keyed `label`; returns how it was set"""
    open_options(page, inst)
    i = _control_index(page, inst, label, "checkbox")
    if i < 0:
        close_options(page, inst)
        CONSOLE.append(f"[harness] {inst}: no checkbox row {label!r} in the options panel")
        set_option(page, inst, label, want)
        return "setOption"
    box = page.locator(f'[data-instance="{inst}"] .mx-options input[type=checkbox]').nth(i)
    if box.is_checked() != want:
        box.click()
    page.wait_for_timeout(400)
    close_options(page, inst)
    return "panel"


def get_options(page, inst):
    return page.evaluate("(i) => window.MX.grid.frames[i].getOptions()", inst)


def set_option(page, inst, key, value):
    page.evaluate("(a) => window.MX.grid.frames[a[0]].setOption(a[1], a[2])", [inst, key, value])
    page.wait_for_timeout(400)


# ---- graph reads ---------------------------------------------------------


PICK_POINTS_JS = """(a) => {
  const [inst, id] = a;
  const el = document.querySelector(`[data-instance="${inst}"] svg.mx-map [data-id="${id}"]`);
  if (!el) return { found: false, pts: [] };
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return { found: true, pts: [], box: null };
  const pts = [];
  for (const fx of [0.5, 0.35, 0.65, 0.25, 0.75]) {
    for (const fy of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && hit.getAttribute && hit.getAttribute('data-id') === id) pts.push({ x, y });
    }
  }
  return { found: true, pts, box: { x: r.left, y: r.top, w: r.width, h: r.height } };
}"""


def press_fit(page, inst):
    btn = page.locator(f'[data-instance="{inst}"] button', has_text="fit")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(600)


def pick_node(page, inst, node_id, shift=False, timeout=8.0, settle=900, verify=True):
    """real pointerdown/up on a point that already resolves to `node_id`

    The sim spreads nodes past the box after the one fit at show time, so a
    node off the widget gets one fit press before the pick is given up on.
    """
    end = time.time() + timeout
    info = {"found": False, "pts": []}
    fitted = False
    while time.time() < end:
        info = page.evaluate(PICK_POINTS_JS, [inst, node_id])
        if info.get("pts"):
            break
        if not fitted and time.time() > end - timeout + 1.0:
            fitted = True
            CONSOLE.append(f"[harness] {node_id} off the box in {inst}; pressing fit")
            press_fit(page, inst)
            continue
        page.wait_for_timeout(250)
    if not info.get("pts"):
        CONSOLE.append(f"[harness] pick {node_id} in {inst}: no clickable point ({json.dumps(info)})")
        return False
    for n, p in enumerate(info["pts"][:6]):
        page.mouse.move(p["x"], p["y"])
        if shift:
            page.keyboard.down("Shift")
        page.mouse.down()
        page.wait_for_timeout(80)
        page.mouse.up()
        if shift:
            page.keyboard.up("Shift")
        page.wait_for_timeout(250)
        if not verify or view_holds(page, inst, node_id, shift):
            if n:
                CONSOLE.append(f"[harness] pick {node_id} in {inst}: landed on candidate {n}")
            if settle:
                page.wait_for_timeout(max(0, settle - 250))
            return True
    CONSOLE.append(f"[harness] pick {node_id} in {inst}: {len(info['pts'][:6])} points clicked, "
                   "the map selected none of them")
    return False


def view_holds(page, inst, node_id, shift):
    """did the map's own selection take the pick"""
    return page.evaluate(
        """(a) => {
          const [inst, id, shift] = a;
          const f = window.MX.grid.frames[inst];
          const st = f && (f._force || f._stack || f._files);
          if (!st || !st.view) return false;
          return shift ? st.view.selectedIds.indexOf(id) >= 0 : st.view.focusedId === id;
        }""", [inst, node_id, shift])


def node_classes(page, inst, node_id):
    return page.evaluate(
        """(a) => {
          const el = document.querySelector(
            `[data-instance="${a[0]}"] svg.mx-map [data-id="${a[1]}"]`);
          return el ? el.getAttribute('class') : null;
        }""", [inst, node_id])


def mermaid_lines(page, inst):
    return page.evaluate(
        """(inst) => {
          const pre = document.querySelector(`[data-instance="${inst}"] pre.mx-mermaid-pre`);
          if (!pre) return [];
          return Array.from(pre.children).map(d => d.textContent);
        }""", inst)


def mermaid_text(page, inst):
    return page.evaluate(
        """(inst) => {
          const pre = document.querySelector(`[data-instance="${inst}"] pre.mx-mermaid-pre`);
          return pre ? pre.innerText : '';
        }""", inst)


def cards_who(page, inst):
    return page.evaluate(
        """(inst) => {
          const el = document.querySelector(`[data-instance="${inst}"] .cg-who-name`);
          return el ? el.textContent : '';
        }""", inst)


def cards_text(page, inst):
    return page.evaluate(
        "(i) => (document.querySelector(`[data-instance=\"${i}\"] .cg-card-host`) || {}).innerText || ''",
        inst)


def cards_tabs(page, inst):
    return page.evaluate(
        """(inst) => Array.from(
             document.querySelectorAll(`[data-instance="${inst}"] .cg-tab`)
           ).map(t => t.textContent)""", inst)


def force_state(page, inst):
    return page.evaluate(
        """(inst) => {
          const f = window.MX.grid.frames[inst];
          const st = f && f._force;
          if (!st) return null;
          let sum = 0, n = 0;
          for (const [, p] of st.positions) { sum += Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z); n++; }
          return { sum: Math.round(sum * 1000) / 1000, n, running: !!st.raf,
                   ticks: st.ticks, settleMs: st.settleMs,
                   edges: st.simEdges ? st.simEdges.length : -1,
                   drawn: st.vm && st.vm.placed ? st.vm.placed.size : -1 };
        }""", inst)


def files_corner(page, inst):
    return page.evaluate(
        """(inst) => {
          const el = document.querySelector(`[data-instance="${inst}"] .flg-path`);
          return el ? { hidden: el.hidden, text: el.textContent } : null;
        }""", inst)


def editor_state(page, inst):
    return page.evaluate(
        """(inst) => {
          const f = window.MX.grid.frames[inst];
          const ed = f && f._editor;
          const o = f ? f.getOptions() : {};
          const tab = ed ? (ed.tabs.find(t => t.key === ed.active) || {}) : {};
          return { tabs: o.tabs || [], active: o.active || '',
                   path: tab.path || '',
                   pos: (ed && ed.editor) ? ed.editor.getPosition() : null };
        }""", inst)


# ---- the pass ------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        ctx = browser.new_context(viewport={"width": 1720, "height": 1060})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)

        p1 = ctx.new_page()
        wire(p1, "p1")
        resp = p1.goto(f"{BASE}/matrix/{sid}", wait_until="load", timeout=20000)
        if resp is None or not resp.ok:
            print(f"FAILED TO LOAD /matrix/{sid}")
            browser.close()
            sys.exit(1)
        s1, s1name = add_surface(p1)
        print(f"surface = {s1} ({s1name})")

        # ---- 1. cards on the graph target, empty text
        cards = mount(p1, "graph_cards", {"col": 1, "row": 1, "w": 7, "h": 10})
        options_select(p1, cards, "target", TARGET)
        p1.wait_for_timeout(1500)
        body = cards_text(p1, cards)
        sh = shot(p1, args.out, "01-cards-empty")
        ok1 = ("Pick a node in any graph widget on this target." in body
               and get_options(p1, cards).get("target") == TARGET)
        record(1, "Cards on target graph shows the empty text", ok1, sh,
               body.replace("\n", " | ")[:140])

        # ---- 2. force graph draws, settles under 4s, freeze stops it
        force = mount(p1, "graph_force", {"col": 8, "row": 1, "w": 11, "h": 12})
        options_select(p1, force, "target", TARGET)
        started = time.time()
        settle_ms = None
        samples = []
        while time.time() - started < 4.0:
            stt = force_state(p1, force)
            if stt:
                samples.append(stt["sum"])
                if stt["drawn"] > 0 and not stt["running"] and stt["ticks"] > 0:
                    settle_ms = int((time.time() - started) * 1000)
                    break
            p1.wait_for_timeout(150)
        after = force_state(p1, force)
        drew = bool(after and after["drawn"] > 0)
        sh = shot(p1, args.out, "02a-force-settled")
        # freeze
        p1.locator(f'[data-instance="{force}"] .gf-check input[type=checkbox]').first.check()
        p1.wait_for_timeout(600)
        f1 = force_state(p1, force)
        p1.wait_for_timeout(1200)
        f2 = force_state(p1, force)
        frozen_ok = bool(f1 and f2 and not f1["running"] and not f2["running"]
                         and f1["sum"] == f2["sum"])
        sh2 = shot(p1, args.out, "02b-force-frozen")
        ok2 = drew and settle_ms is not None and frozen_ok
        record(2, "Force Graph draws, settles inside 4s, freeze stops movement", ok2, sh2,
               f"drawn={after and after['drawn']} settle_ms={settle_ms} "
               f"ticks={after and after['ticks']} frozen_stable={frozen_ok} "
               f"samples={samples[:6]}")
        RESULTS[-1]["shot"] = sh + " ;; " + sh2

        # ---- 3. click viewer.html — cards WHO, mermaid line
        got = pick_node(p1, force, N_VIEWER)
        p1.wait_for_timeout(800)
        who = cards_who(p1, cards)
        lines = mermaid_lines(p1, force)
        starts = [ln for ln in lines if ln.startswith(f"{N_VIEWER} -->")]
        sh = shot(p1, args.out, "03-pick-viewer-html")
        ok3 = got and who == N_VIEWER and len(starts) >= 1
        record(3, "pick viewer.html: Cards WHO + mermaid line viewer.html -->", ok3, sh,
               f"clicked={got} who={who!r} lines={len(lines)} matching={len(starts)} "
               f"first={(lines[0] if lines else '')!r}")

        # ---- 4. shift+click panel.js — two tabs, panel.js lines
        got4 = pick_node(p1, force, N_PANEL, shift=True)
        p1.wait_for_timeout(800)
        tabs = cards_tabs(p1, cards)
        lines4 = mermaid_lines(p1, force)
        starts4 = [ln for ln in lines4 if ln.startswith("panel.js -->")]
        sh = shot(p1, args.out, "04-shift-pick-panel-js")
        ok4 = got4 and len(tabs) == 2 and len(starts4) >= 1
        record(4, "shift+click panel.js: two Cards tabs, mermaid gains panel.js -->", ok4, sh,
               f"clicked={got4} tabs={tabs} lines={len(lines4)} matching={len(starts4)}")

        # ---- 5. copy button puts the stripped text on the clipboard
        want = mermaid_text(p1, force)
        p1.locator(f'[data-instance="{force}"] .mx-mermaid-btn[title="copy"]').first.click()
        p1.wait_for_timeout(700)
        clip = p1.evaluate("() => navigator.clipboard.readText()")
        sh = shot(p1, args.out, "05-copy-clipboard")
        ok5 = clip.strip() != "" and clip.strip() == want.strip()
        record(5, "copy button clipboard equals the frame's stripped text", ok5, sh,
               f"clip_len={len(clip)} pre_len={len(want)} equal={clip.strip() == want.strip()}")

        # ---- 6. cards search "score", click the hit
        p1.locator(f'[data-instance="{cards}"] .cg-search').fill("score")
        p1.wait_for_timeout(700)
        hits = p1.locator(f'[data-instance="{cards}"] .cg-hit')
        hit_ids = hits.all_text_contents()
        target_hit = p1.locator(f'[data-instance="{cards}"] .cg-hit[data-id="{N_SCORE}"]')
        clicked6 = target_hit.count() > 0
        if clicked6:
            target_hit.first.click()
            p1.wait_for_timeout(900)
        cls = node_classes(p1, force, N_SCORE) or ""
        who6 = cards_who(p1, cards)
        sh = shot(p1, args.out, "06-search-score")
        ok6 = clicked6 and "picked" in cls and who6 == "score.js"
        record(6, "Cards search score, click the hit: Force picks score.js, Cards shows it",
               ok6, sh, f"hits={hit_ids[:6]} force_class={cls!r} who={who6!r}")

        # ---- 7. editor follows the cards open
        editor = mount(p1, "editor", {"col": 1, "row": 11, "w": 7, "h": 8})
        p1.wait_for_timeout(1200)
        how_follow = options_check(p1, editor, "followGraph", True)
        how_open = options_check(p1, cards, "openInEditor", True)
        # step off score.js so the pick below is a real change
        pick_node(p1, force, N_VIEWER)
        p1.wait_for_timeout(600)
        got7 = pick_node(p1, force, N_SCORE)
        p1.wait_for_timeout(2500)
        ed = editor_state(p1, editor)
        sh = shot(p1, args.out, "07-editor-follows")
        ok7 = got7 and ed["path"] == SCORE_PATH and ed["pos"] and ed["pos"]["lineNumber"] == 1
        record(7, "Editor opens fixtures/viewer/viewer/score.js at the span's first line",
               ok7, sh, f"clicked={got7} path={ed['path']!r} pos={ed['pos']} tabs={ed['tabs']} "
                        f"followGraph_set_by={how_follow} openInEditor_set_by={how_open}")

        # ---- 8. stack + files, pick data.js in stack
        stack = mount(p1, "graph_stack", {"col": 19, "row": 1, "w": 10, "h": 9})
        options_select(p1, stack, "target", TARGET)
        files = mount(p1, "graph_files", {"col": 19, "row": 10, "w": 10, "h": 9})
        options_select(p1, files, "target", TARGET)
        p1.wait_for_timeout(2000)
        got8 = pick_node(p1, stack, N_DATA)
        p1.wait_for_timeout(1200)
        fcls = node_classes(p1, force, N_DATA) or ""
        flcls = node_classes(p1, files, N_DATA) or ""
        who8 = cards_who(p1, cards)
        sh = shot(p1, args.out, "08-stack-pick-data-js")
        ok8 = got8 and "picked" in fcls and "picked" in flcls and who8 == "data.js"
        record(8, "pick data.js in Stack: Force, Files and Cards all show it picked", ok8, sh,
               f"clicked={got8} force={fcls!r} files={flcls!r} who={who8!r}")

        # ---- 9. files local view, drill, home
        p1.locator(f'[data-instance="{files}"] .flg-btn', has_text="global").first.click()
        p1.wait_for_timeout(1200)
        c_top = files_corner(p1, files)
        sh9a = shot(p1, args.out, "09a-files-local-everything")
        got9 = pick_node(p1, files, DIR_VIEWER, verify=False)
        p1.wait_for_timeout(1200)
        c_drill = files_corner(p1, files)
        sh9b = shot(p1, args.out, "09b-files-drilled")
        home = p1.locator(f'[data-instance="{files}"] .flg-btn', has_text="home")
        home_seen = home.count() > 0 and home.first.is_visible()
        if home_seen:
            home.first.click()
            p1.wait_for_timeout(1200)
        c_home = files_corner(p1, files)
        sh9c = shot(p1, args.out, "09c-files-home")
        ok9 = (c_top and not c_top["hidden"] and c_top["text"] == "everything"
               and got9 and c_drill and c_drill["text"] == "everything / viewer/"
               and home_seen and c_home and c_home["text"] == "everything")
        record(9, "Files local: corner everything, drill viewer/, home returns", ok9,
               sh9a + " ;; " + sh9b + " ;; " + sh9c,
               f"top={c_top} drilled={c_drill} home_btn={home_seen} back={c_home}")

        # ---- 10. guesses off mirrors into every drawn widget
        before10 = force_state(p1, force)
        errs_before = len(PAGEERRORS)
        options_select(p1, cards, "guesses", "off")
        p1.wait_for_timeout(1800)
        after10 = force_state(p1, force)
        g = {w: get_options(p1, w).get("guesses") for w in (cards, force, stack, files)}
        sh = shot(p1, args.out, "10-guesses-off")
        mirrored = all(v == "off" for v in g.values())
        edges_ok = bool(before10 and after10 and after10["edges"] <= before10["edges"])
        ok10 = mirrored and edges_ok and len(PAGEERRORS) == errs_before
        record(10, "guesses off mirrors into every drawn widget, edges drop or hold", ok10, sh,
               f"guesses={g} edges {before10 and before10['edges']} -> "
               f"{after10 and after10['edges']} new_pageerrors={len(PAGEERRORS) - errs_before}")

        # ---- 11. reload keeps target, selection, camera, files view + trail
        set_option(p1, files, "view", "local")
        set_option(p1, files, "trail", ["viewer"])
        p1.wait_for_timeout(3000)   # markDirty batches saves two seconds apart
        pre = {w: get_options(p1, w) for w in (cards, force, stack, files)}
        stored_pre = p1.evaluate(
            """async (a) => {
              const r = await fetch(`/api/grid/${a[0]}/${a[1]}`);
              const d = await r.json();
              const ws = ((d.grid || d).widgets) || [];
              return ws.filter(w => w.type && w.type.indexOf('graph_') === 0)
                       .map(w => [w.type, (w.options || {}).camera]);
            }""", [sid, s1])
        p1.reload(wait_until="load", timeout=25000)
        p1.wait_for_selector(f'[data-instance="{force}"]', timeout=15000)
        p1.wait_for_timeout(4000)
        post = {w: get_options(p1, w) for w in (cards, force, stack, files)}
        raw = {w: p1.evaluate("(i) => window.MX.grid.frames[i].options.camera", w)
               for w in (force, stack, files)}
        checks = []
        for w in (cards, force, stack, files):
            a, b = pre[w], post[w]
            checks.append(b.get("target") == TARGET)
            checks.append(b.get("selectedIds") == a.get("selectedIds"))
            checks.append(b.get("focusedId") == a.get("focusedId"))
            if "camera" in a:
                checks.append(json.dumps(b.get("camera")) == json.dumps(a.get("camera")))
        checks.append(post[files].get("view") == "local")
        checks.append(post[files].get("trail") == ["viewer"])
        sh = shot(p1, args.out, "11-after-reload")
        ok11 = all(checks)
        record(11, "reload returns all four with target, selection, camera, files view + trail",
               ok11, sh,
               "; ".join(f"{w}: target={post[w].get('target')!r} sel={post[w].get('selectedIds')} "
                         f"focus={post[w].get('focusedId')!r} cam={post[w].get('camera')}"
                         for w in (cards, force, stack, files))
               + f" ;; files view={post[files].get('view')!r} trail={post[files].get('trail')}"
               + f" ;; SERVER before reload {stored_pre} ;; RAW restored camera {raw}"
               + " ;; PRE "
               + "; ".join(f"{w}: sel={pre[w].get('selectedIds')} focus={pre[w].get('focusedId')!r} "
                           f"cam={pre[w].get('camera')}" for w in (cards, force, stack, files)))

        # ---- 12. second tab on the surface follows a pick
        # one pick with no second tab open, to place the blame if 12 fails
        solo = pick_node(p1, force, N_VIEWER)
        solo_focus = get_options(p1, force).get("focusedId")
        CONSOLE.append(f"[harness] solo pick before tab two: clicked={solo} focus={solo_focus!r}")
        p2 = ctx.new_page()
        wire(p2, "p2")
        p2.goto(f"{BASE}/matrix/{sid}?s={s1}", wait_until="load", timeout=25000)
        p2.wait_for_selector(f'[data-instance="{cards}"]', timeout=15000)
        p2.wait_for_timeout(3000)
        before12 = cards_who(p2, cards)
        p1.bring_to_front()      # the tab being clicked is the one in front
        p1.wait_for_timeout(600)
        set_option(p1, force, "frozen", True)
        p1.wait_for_timeout(500)
        p1.evaluate(
            """(inst) => {
              const svg = document.querySelector(`[data-instance="${inst}"] svg.mx-map`);
              window.__pe = [];
              for (const t of ['pointerdown', 'pointerup', 'click']) {
                svg.addEventListener(t, (ev) => window.__pe.push(
                  t + ':' + (ev.target.getAttribute ? ev.target.getAttribute('data-id') : '?')
                  + ':btn' + ev.button), true);
              }
            }""", force)
        # the map's own search list, not a raw map click: after the reload the
        # graph redraws at the stored camera and a wanted node can sit buried
        p1.locator(f'[data-instance="{force}"] .gf-search').fill("score")
        p1.wait_for_timeout(700)
        row12 = p1.locator(f'[data-instance="{force}"] .gf-hit[data-id="{N_SCORE}"]')
        got12 = row12.count() > 0
        if got12:
            row12.first.click()
        trace0 = []
        for _ in range(5):
            trace0.append(p1.evaluate(
                """(a) => {
                  const st = window.MX.grid.frames[a[0]]._force;
                  return [window.MX.grid.frames[a[0]].options.focusedId,
                          st.view ? st.view.focusedId : null,
                          window.MX.grid.frames[a[1]].options.focusedId];
                }""", [force, cards]))
        pe = p1.evaluate("() => window.__pe || []")
        view12 = p1.evaluate(
            """(inst) => {
              const st = window.MX.grid.frames[inst]._force;
              const f = window.MX.grid.frames[inst];
              return { sel: st.view ? st.view.selectedIds : null,
                       focus: st.view ? st.view.focusedId : null,
                       placed: st.vm ? st.vm.placed.size : -1,
                       nodes: st.vm ? st.vm.nodes.size : -1,
                       hasNode: st.vm ? st.vm.nodes.has('viewer/score.js') : null,
                       optFocus: f.options.focusedId, frozen: st.raf === null };
            }""", force)
        trace = []
        for ms in (50, 60, 150, 1000, 3000):
            p1.wait_for_timeout(ms)
            trace.append({"at": ms, "t1_force": get_options(p1, force).get("focusedId"),
                          "t1_cards": get_options(p1, cards).get("focusedId"),
                          "t2_cards": get_options(p2, cards).get("focusedId")})
        after12 = cards_who(p2, cards)
        sh = shot(p2, args.out, "12-second-tab-follows")
        ok12 = got12 and after12 == "score.js"
        t1 = {"force_sel": get_options(p1, force).get("selectedIds"),
              "force_focus": get_options(p1, force).get("focusedId"),
              "cards_focus": get_options(p1, cards).get("focusedId"),
              "who": cards_who(p1, cards)}
        t2 = {"cards_focus": get_options(p2, cards).get("focusedId")}
        record(12, "second tab's Cards follows a pick made in the first tab", ok12, sh,
               f"clicked={got12} tab2 who {before12!r} -> {after12!r} tab1={t1} tab2={t2} "
               f"solo_before_tab2=({solo}, {solo_focus!r}) events={pe} immediate={trace0} "
               f"view_after_click={view12} trace={trace}")

        # ---- 13. zero pageerrors
        sh = shot(p1, args.out, "13-final-state")
        record(13, "zero pageerrors across the pass", len(PAGEERRORS) == 0, sh,
               " ;; ".join(PAGEERRORS[:5]) if PAGEERRORS else "none")

        print(f"\nsurface left behind: {s1} ({s1name}) on session {sid}")
        if args.hold:
            time.sleep(args.hold)
        browser.close()

    with open(os.path.join(args.out, "console.txt"), "w") as f:
        f.write("\n".join(CONSOLE) + "\n")
    with open(os.path.join(args.out, "results.json"), "w") as f:
        json.dump(RESULTS, f, indent=2)

    print("\n=== SUMMARY ===")
    for r in RESULTS:
        print(f"{r['n']:>2}  {'PASS' if r['pass'] else 'FAIL'}  {r['name']}")
    sys.exit(0)


if __name__ == "__main__":
    main()
