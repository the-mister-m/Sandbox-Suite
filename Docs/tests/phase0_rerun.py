"""Headed Playwright harness: Phase 0 Code Canvas port rerun, blocks E and D.

Report only. Reruns block D and the steps Sonnet 3 changed. Records
PASS / FAIL / OBSERVED per step with a screenshot for each.

Usage:
    python3 Docs/tests/phase0_rerun.py --block E --out Docs/Reports/phase0-rerun
    python3 Docs/tests/phase0_rerun.py --block D --out Docs/Reports/phase0-rerun

Session: first row of GET /api/sessions/open unless --session is given.
Fence: the surface ids present at start are off limits. Every surface this
harness makes is deleted on the way out and both lists are printed.
"""

import argparse
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"
OUT = None
RESULTS = []
CONSOLE = []
FENCE = {}          # sid -> set of surface ids present before the run
GRID_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "library", "grids")


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else {}


def http_status(path):
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def surfaces(sid):
    return [r["id"] for r in (api(f"/api/grid/{sid}").get("list") or [])]


def surface_rows(sid):
    return api(f"/api/grid/{sid}").get("list") or []


def fence(sid):
    if sid not in FENCE:
        FENCE[sid] = set(surfaces(sid))
        CONSOLE.append(f"[fence] {sid} before: {sorted(FENCE[sid])}")
    return FENCE[sid]


def sweep():
    lines = []
    for sid, before in FENCE.items():
        now = set(surfaces(sid))
        mine = sorted(now - before)
        for wid in mine:
            try:
                api(f"/api/grid/{sid}/{wid}", method="DELETE")
            except Exception as exc:
                lines.append(f"[sweep] {sid}/{wid} DELETE failed: {exc}")
        after = set(surfaces(sid))
        lines.append(f"[sweep] {sid} before={sorted(before)}")
        lines.append(f"[sweep] {sid} made={mine}")
        lines.append(f"[sweep] {sid} after={sorted(after)}")
        lines.append(f"[sweep] {sid} intact={after == before}")
    CONSOLE.extend(lines)
    for line in lines:
        print(line, flush=True)
    return lines


def stamp():
    return time.strftime("%H:%M:%S")


def watch(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"{stamp()} [{tag}:console:{m.type}] {m.text}"))
    page.on("pageerror", lambda e: CONSOLE.append(f"{stamp()} [{tag}:pageerror] {e}"))
    page.on("requestfailed", lambda r: CONSOLE.append(
        f"{stamp()} [{tag}:requestfailed] {r.url} {r.failure}"))


def errors_since(mark):
    bad = []
    for line in CONSOLE[mark:]:
        if ":console:error]" in line or "pageerror]" in line:
            bad.append(line)
    return bad


def shot(page, name):
    p = os.path.join(OUT, name + ".png")
    try:
        page.screenshot(path=p, full_page=False)
    except Exception as exc:
        CONSOLE.append(f"[harness] screenshot {name} failed: {exc}")
    return p


def step(num, status, note, shot_path):
    CONSOLE.append(f"{stamp()} [step] {num} {status}")
    RESULTS.append(f"{num}: {status} — {note} — {shot_path}")
    print(RESULTS[-1], flush=True)


def open_matrix(context, sid, surface=None, tag="t1"):
    page = context.new_page()
    watch(page, tag)
    url = f"{BASE}/matrix/{sid}" + (f"?s={surface}" if surface else "")
    page.goto(url, wait_until="load", timeout=20000)
    page.wait_for_function("() => window.MX && window.MX.grid", timeout=15000)
    page.wait_for_timeout(1200)
    return page


def press_session_button(page):
    btn = page.locator("#mxSession")
    try:
        btn.click(timeout=2500)
        return
    except Exception:
        pass
    page.click("#mxDrawerHandle")
    page.wait_for_timeout(500)
    btn.click(timeout=5000)


def open_session_window(page):
    if page.locator(".mx-overlay").count() == 0:
        press_session_button(page)
    page.wait_for_selector(".mx-overlay", timeout=6000)
    page.wait_for_timeout(900)


def close_overlay(page):
    page.evaluate("() => document.querySelectorAll('.mx-overlay').forEach(o => o.remove())")


def panel_map(page):
    """Tag and read the session window's sections: templates, surfaces, sessions."""
    return page.evaluate("""() => {
      const panel = document.querySelector('.mx-overlay .mx-panel');
      if (!panel) return null;
      const kids = Array.from(panel.children);
      const cut = (start) => {
        const out = [];
        for (let i = start + 1; i < kids.length; i++) {
          if (kids[i].tagName === 'H4') break;
          if (kids[i].classList.contains('mx-actions')) break;
          out.push(kids[i]);
        }
        return out;
      };
      const head = (t) => kids.findIndex(k => k.tagName === 'H4' && k.textContent === t);
      const readRows = (els, cls) => els.map((e, i) => {
        e.classList.add(cls);
        e.dataset.rpIdx = String(i);
        return { i, label: (e.querySelector('.mx-grow') || e).textContent,
                 buttons: Array.from(e.querySelectorAll('button')).map(b => b.textContent.trim()) };
      });
      const ti = head('Surface templates');
      const si = head('Surfaces');
      const oi = head('Open sessions');
      const body = si >= 0 ? kids[si + 1] : null;
      if (body) body.id = 'rp-surfaces';
      return {
        templates: ti >= 0 ? readRows(cut(ti), 'rp-tplrow') : null,
        surfaces: body ? Array.from(body.children).map((r, i) => {
            r.classList.add('rp-surfrow'); return r.textContent; }) : null,
        sessions: oi >= 0 ? readRows(cut(oi), 'rp-sessrow') : null,
        allButtons: Array.from(panel.querySelectorAll('button')).map(b => b.textContent.trim()),
      };
    }""")


def add_empty_surface(page):
    """Session window up (or open it), press Add surface on the Empty surface row."""
    open_session_window(page)
    info = panel_map(page)
    rows = (info or {}).get("templates") or []
    idx = next((r["i"] for r in rows if r["label"].strip() == "Empty surface"), None)
    if idx is None:
        return None
    page.locator(f'.rp-tplrow[data-rp-idx="{idx}"]').locator(
        "button", has_text="Add surface").first.click()
    page.wait_for_timeout(2000)
    return page.evaluate("() => window.MX.WINDOW_ID")


def add_template_surface(page, name):
    open_session_window(page)
    info = panel_map(page)
    rows = (info or {}).get("templates") or []
    idx = next((r["i"] for r in rows if r["label"].strip() == name), None)
    if idx is None:
        return None
    page.locator(f'.rp-tplrow[data-rp-idx="{idx}"]').locator(
        "button", has_text="Add surface").first.click()
    page.wait_for_timeout(2500)
    return page.evaluate("() => window.MX.WINDOW_ID")


def add_widget(page, wtype):
    return page.evaluate("(t) => window.MX.grid.addWidget(t).id", wtype)


def browser_rows(page, inst):
    return page.evaluate(
        """(id) => Array.from(document.querySelectorAll(
             `[data-instance="${id}"] .mx-browser-row`)).map((r, i) => ({
               i, chev: r.querySelector('.mx-browser-chev').textContent,
               name: r.querySelector('.mx-browser-name').textContent }))""",
        inst)


def expand_first_dir(page, inst):
    for _ in range(3):
        rows = browser_rows(page, inst)
        target = next((r for r in rows if r["chev"] == "▸"), None)
        if target is None:
            page.wait_for_timeout(1200)
            continue
        page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(target["i"]).click()
        page.wait_for_timeout(1500)
        rows = browser_rows(page, inst)
        if any(r["chev"] == "▾" for r in rows):
            return next(r["name"] for r in rows if r["chev"] == "▾")
        again = next((r for r in browser_rows(page, inst) if r["name"] == target["name"]), None)
        if again:
            page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(again["i"]).click()
            page.wait_for_timeout(1200)
            if any(r["chev"] == "▾" for r in browser_rows(page, inst)):
                return next(r["name"] for r in browser_rows(page, inst) if r["chev"] == "▾")
    return None


def open_file_via_menu(page, inst):
    rows = browser_rows(page, inst)
    files = [r for r in rows if r["chev"].strip() == ""]
    if not files:
        return None
    page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(
        files[0]["i"]).click(button="right")
    page.wait_for_timeout(500)
    menu = page.locator("body > .mx-panel").last
    btn = menu.locator("button", has_text="Open in Editor")
    if btn.count() == 0:
        return None
    btn.first.click()
    page.wait_for_timeout(2500)
    return files[0]["name"]


def editor_tabs(page, inst):
    return page.evaluate(
        "(id) => { const f = window.MX.grid.frames[id];"
        " return f ? (f.getOptions().tabs || []) : null; }", inst)


def disk_widgets(sid, wid):
    p = os.path.join(GRID_DIR, sid, wid + ".json")
    try:
        with open(p) as f:
            d = json.load(f)
        return d.get("widgets") or []
    except Exception as exc:
        CONSOLE.append(f"[harness] disk read {p}: {exc}")
        return None


def shape(snap):
    return sorted((w["type"], json.dumps(w["slot"], sort_keys=True)) for w in snap)


# ---------------- block E: Sonnet 3 changes ----------------

def block_e(context, sid, other_sid):
    fence(sid)
    fence(other_sid)
    page = open_matrix(context, sid, tag="E")
    mark = len(CONSOLE)

    # E1 — Empty surface fixed row, no Delete, no New blank surface button
    open_session_window(page)
    info = panel_map(page)
    rows = (info or {}).get("templates") or []
    first = rows[0] if rows else None
    p = shot(page, "E1-templates")
    ok1 = (first is not None
           and first["label"].strip() == "Empty surface"
           and first["buttons"] == ["Add surface"]
           and not any("New blank surface" in b for b in (info or {}).get("allButtons") or []))
    step("E1", "PASS" if ok1 else "FAIL",
         f"template rows={[(r['label'], r['buttons']) for r in rows]}; "
         f"panel buttons={(info or {}).get('allButtons')}", p)
    close_overlay(page)

    # E2 — Add surface from Empty surface twice
    id_a = add_empty_surface(page)
    name_a = page.evaluate("() => window.MX.grid.surfaceName")
    n_a = page.evaluate("() => window.MX.grid.instances.length")
    id_b = add_empty_surface(page)
    name_b = page.evaluate("() => window.MX.grid.surfaceName")
    n_b = page.evaluate("() => window.MX.grid.instances.length")
    p = shot(page, "E2-two-empty-surfaces")
    ok2 = (name_a == "Empty surface" and name_b == "Empty surface 2"
           and n_a == 0 and n_b == 0 and id_a != id_b)
    step("E2", "PASS" if ok2 else "FAIL",
         f"first {id_a} name={name_a!r} widgets={n_a}; "
         f"second {id_b} name={name_b!r} widgets={n_b}", p)

    # E3 — save a template, add from it twice
    tpls = api("/api/matrix-templates").get("list") or []
    tpl = tpls[0] if tpls else None
    if tpl is None:
        p = shot(page, "E3-no-template")
        step("E3", "FAIL", "no saved matrix template to add from", p)
    else:
        close_overlay(page)
        id_c = add_template_surface(page, tpl)
        name_c = page.evaluate("() => window.MX.grid.surfaceName")
        n_c = page.evaluate("() => window.MX.grid.instances.length")
        close_overlay(page)
        id_d = add_template_surface(page, tpl)
        name_d = page.evaluate("() => window.MX.grid.surfaceName")
        n_d = page.evaluate("() => window.MX.grid.instances.length")
        p = shot(page, "E3-template-surfaces")
        ok3 = (name_c == tpl and name_d == f"{tpl} 2" and id_c != id_d)
        step("E3", "PASS" if ok3 else "FAIL",
             f"template {tpl!r}: first {id_c} name={name_c!r} widgets={n_c}; "
             f"second {id_d} name={name_d!r} widgets={n_d}", p)

    # E5 — state line says surface
    close_overlay(page)
    line = page.evaluate("() => { const e = document.querySelector('#mxState')"
                         " || document.querySelector('.mx-state'); return e ? e.textContent : null; }")
    if line is None:
        line = page.evaluate("""() => {
          const c = document.getElementById('mxCorners');
          return c ? c.textContent : null; }""")
    p = shot(page, "E5-state-line")
    ok5 = bool(line) and "surface" in line and "window" not in line
    step("E5", "PASS" if ok5 else "FAIL", f"state line {line!r}", p)

    # E4 — switch session from a bound tab with widgets
    close_overlay(page)
    add_empty_surface(page)
    close_overlay(page)
    mine = page.evaluate("() => window.MX.WINDOW_ID")
    add_widget(page, "editor")
    page.wait_for_timeout(1200)
    add_widget(page, "browser")
    page.wait_for_timeout(2500)
    before_other = surface_rows(other_sid)
    before_dir = sorted(os.listdir(os.path.join(GRID_DIR, other_sid))) \
        if os.path.isdir(os.path.join(GRID_DIR, other_sid)) else []
    before_mt = {f: os.path.getmtime(os.path.join(GRID_DIR, other_sid, f)) for f in before_dir}
    had = page.evaluate("() => window.MX.grid.instances.length")
    open_session_window(page)
    info4 = panel_map(page)
    srows = (info4 or {}).get("sessions") or []
    sidx = next((r["i"] for r in srows if other_sid in r["label"]), None)
    if sidx is None:
        sidx = next((r["i"] for r in srows if "Switch" in r["buttons"]), None)
    if sidx is None:
        step("E4", "FAIL", f"no other session row to switch to; rows={srows}",
             shot(page, "E4-no-row"))
    else:
        target = srows[sidx]["label"]
        page.locator(f'.rp-sessrow[data-rp-idx="{sidx}"]').locator(
            "button", has_text="Switch").first.click()
        page.wait_for_timeout(3000)
        url = page.url
        left = page.evaluate("() => window.MX.grid.instances.length")
        sock = page.evaluate("() => window.MX.socket.sid()")
        panel_up = page.locator(".mx-overlay").count() > 0
        info4b = panel_map(page)
        after_dir = sorted(os.listdir(os.path.join(GRID_DIR, other_sid))) \
            if os.path.isdir(os.path.join(GRID_DIR, other_sid)) else []
        after_mt = {f: os.path.getmtime(os.path.join(GRID_DIR, other_sid, f))
                    for f in after_dir}
        untouched = (before_dir == after_dir and before_mt == after_mt)
        p = shot(page, "E4-after-switch")
        want_url = f"/matrix/{other_sid}"
        ok4 = (left == 0 and had > 0 and url.endswith(want_url) and "?s=" not in url
               and panel_up and sock == other_sid and untouched)
        step("E4", "PASS" if ok4 else "FAIL",
             f"switched from {sid} (surface {mine}, {had} widgets) to {target!r}; "
             f"url={url}; grid instances after={left}; socket sid={sock}; "
             f"session window up={panel_up}; other-session files "
             f"{before_dir} -> {after_dir} untouched={untouched}; "
             f"panel surfaces now={(info4b or {}).get('surfaces')}", p)

    # E6 — favicon
    code = http_status("/favicon.ico")
    p = shot(page, "E6-favicon")
    step("E6", "PASS" if code == 204 else "FAIL", f"GET /favicon.ico -> {code}", p)

    bad = errors_since(mark)
    fav = [b for b in bad if "favicon" in b]
    CONSOLE.append(f"[harness] block E console errors: {len(bad)} "
                   f"(favicon among them: {len(fav)})")
    return bad


# ---------------- block D: bus and mirror ----------------

def block_d(context, sid):
    fence(sid)
    writes = []

    def track(tag, r):
        if r.method in ("PUT", "POST") and "/api/grid/" in r.url:
            writes.append((time.time(), tag, r.method, r.url))

    t1 = open_matrix(context, sid, tag="D-t1")
    mark = len(CONSOLE)
    surface = add_empty_surface(t1)
    close_overlay(t1)
    url = t1.url
    t1.on("request", lambda r: track("t1", r))

    t2 = context.new_page()
    watch(t2, "D-t2")
    t2.on("request", lambda r: track("t2", r))
    t2.goto(url, wait_until="load", timeout=20000)
    t2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    t2.wait_for_timeout(2500)

    ids = {
        "t1_tab": t1.evaluate("() => window.MX.TAB_ID"),
        "t2_tab": t2.evaluate("() => window.MX.TAB_ID"),
        "t1_win": t1.evaluate("() => window.MX.WINDOW_ID"),
        "t2_win": t2.evaluate("() => window.MX.WINDOW_ID"),
    }
    CONSOLE.append(f"[harness] {ids} surface={surface}")

    # D1 — add in tab one, appears in tab two
    ed = add_widget(t1, "editor")
    t1.wait_for_timeout(3000)
    seen = t2.locator(f'[data-instance="{ed}"]').count()
    p = shot(t2, "D1-tab2-after-add")
    step("D1", "PASS" if seen else "FAIL",
         f"surface {surface}; TAB_ID t1={ids['t1_tab']} t2={ids['t2_tab']}; "
         f"WINDOW_ID t1={ids['t1_win']} t2={ids['t2_win']}; added {ed} in tab1; "
         f"tab2 elements with that instance={seen}", p)

    # D2 — move and resize in tab two, tab one follows
    term = add_widget(t2, "terminal")
    t2.wait_for_timeout(2000)
    box = t2.locator(f'[data-instance="{term}"] .mx-bar-name').bounding_box()
    if box:
        t2.mouse.move(box["x"] + 10, box["y"] + box["height"] / 2)
        t2.mouse.down()
        t2.mouse.move(box["x"] + 300, box["y"] + 200, steps=12)
        t2.mouse.up()
        t2.wait_for_timeout(2500)
    t2.evaluate("""(id) => { const i = window.MX.grid.instances.find(x => x.id === id);
      if (i) { i.slot.w = Math.min(window.MX.grid.cols, i.slot.w + 2);
               i.slot.h = i.slot.h + 1;
               window.MX.grid.render(); window.MX.grid.save(); window.MX.grid._announce(); } }""", term)
    t2.wait_for_timeout(2500)
    slot2 = t2.evaluate("(id) => { const i = window.MX.grid.instances.find(x => x.id === id);"
                        " return i ? JSON.parse(JSON.stringify(i.slot)) : null; }", term)
    slot1 = t1.evaluate("(id) => { const i = window.MX.grid.instances.find(x => x.id === id);"
                        " return i ? JSON.parse(JSON.stringify(i.slot)) : null; }", term)
    p = shot(t1, "D2-tab1-after-move")
    step("D2", "PASS" if slot1 and slot1 == slot2 else "FAIL",
         f"tab2 moved+resized {term} to {slot2}; tab1 slot={slot1}", p)

    # D3 — close in tab one, leaves tab two
    had = t2.locator(f'[data-instance="{ed}"]').count()
    t1.evaluate("(id) => window.MX.grid.removeWidget(id)", ed)
    t1.wait_for_timeout(2500)
    left = t2.locator(f'[data-instance="{ed}"]').count()
    p = shot(t2, "D3-tab2-after-close")
    step("D3", "PASS" if had and left == 0 else "FAIL",
         f"closed {ed} in tab1; tab2 held it before={had}; tab2 shows {left} after"
         + ("" if had else " — tab2 never had it, removal not demonstrated"), p)

    # D4 — open a file in tab one's editor; does tab two's editor show it
    ed3 = add_widget(t1, "editor")
    t1.wait_for_timeout(1500)
    br = add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    expand_first_dir(t1, br)
    opened = open_file_via_menu(t1, br)
    t1.wait_for_timeout(4000)
    tabs1 = editor_tabs(t1, ed3)
    tabs2 = t2.evaluate("(id) => { const f = window.MX.grid.frames[id];"
                        " return f ? (f.getOptions().tabs || []) : null; }", ed3)
    p = shot(t2, "D4-tab2-editor")
    step("D4", "OBSERVED",
         f"opened {opened} in tab1 editor {ed3}; tab1 tabs={tabs1}; "
         f"tab2 same instance tabs={tabs2}; "
         f"mirrors={'yes' if tabs2 and tabs1 and [x['path'] for x in tabs2] == [x['path'] for x in tabs1] else 'no'}", p)

    # D5 — raw bus
    t2.evaluate("""() => { window.__frames = [];
      window.MX.socket.onFrame((m) => { if (m.type === 'widget_bus')
        window.__frames.push({ channel: m.channel, inst: m.inst }); }); }""")
    for t in (t1, t2):
        t.evaluate("() => { window.__rp = 0; window.MX.bus.on('t', () => { window.__rp++; }); }")
    t1.evaluate("() => window.MX.bus.emit('t', {}, {remote: true})")
    t1.wait_for_timeout(2000)
    c1 = t1.evaluate("() => window.__rp")
    c2 = t2.evaluate("() => window.__rp")
    t1.evaluate("() => window.MX.bus.emit('t', {})")
    t1.wait_for_timeout(1500)
    c1b = t1.evaluate("() => window.__rp")
    c2b = t2.evaluate("() => window.__rp")
    frames = t2.evaluate("() => window.__frames")
    p = shot(t1, "D5-bus")
    ids_ok = (ids["t1_tab"] != ids["t2_tab"]) and (ids["t1_win"] == ids["t2_win"])
    ok5 = (c1 == 1 and c2 == 1) and (c1b == 2 and c2b == 1) and ids_ok
    step("D5", "PASS" if ok5 else "FAIL",
         f"remote emit: tab1 fired {c1}, tab2 fired {c2}; local emit: tab1 total {c1b}, "
         f"tab2 total {c2b}; TAB_ID differs={ids['t1_tab'] != ids['t2_tab']}; "
         f"WINDOW_ID matches={ids['t1_win'] == ids['t2_win']}; "
         f"widget_bus frames at tab2 socket={frames}", p)

    # D6 — two surfaces, one session: surface two must not change
    t3 = open_matrix(context, sid, tag="D-t3")
    t3.on("request", lambda r: track("t3", r))
    s3 = add_empty_surface(t3)
    close_overlay(t3)
    ed_s2 = add_widget(t3, "editor")
    t3.wait_for_timeout(2500)
    snap_s2_before = t3.evaluate("() => window.MX.grid.snapshot()")
    disk_s2_before = disk_widgets(sid, s3)
    new_on_s1 = add_widget(t1, "viewer")
    t1.wait_for_timeout(3500)
    snap_s2_after = t3.evaluate("() => window.MX.grid.snapshot()")
    leaked = t3.locator(f'[data-instance="{new_on_s1}"]').count()
    p = shot(t3, "D6-other-surface")
    ok6 = (shape(snap_s2_before) == shape(snap_s2_after) and leaked == 0
           and len(snap_s2_after) == 1)
    step("D6", "PASS" if ok6 else "FAIL",
         f"surface one={surface}, surface two={s3}; added {new_on_s1} on surface one; "
         f"surface two widgets before={[w['type'] for w in snap_s2_before]} "
         f"after={[w['type'] for w in snap_s2_after]}; "
         f"surface-one instance present on surface two={leaked}", p)

    # D7 — burst in tab two, reload tab one (the D7b overwrite check)
    for _ in range(3):
        add_widget(t2, "viewer")
        t2.wait_for_timeout(500)
    t2.wait_for_timeout(1500)
    inst_t2 = t2.evaluate("() => window.MX.grid.instances.map(i => i.id)")
    mover = inst_t2[-1]
    t2.evaluate("""(id) => { const i = window.MX.grid.instances.find(x => x.id === id);
      if (i) { i.slot.col = Math.min(window.MX.grid.cols - i.slot.w, i.slot.col + 4);
               i.slot.row = i.slot.row + 2;
               window.MX.grid.render(); window.MX.grid.save(); window.MX.grid._announce(); } }""",
                mover)
    t2.wait_for_timeout(2500)
    snap2 = t2.evaluate("() => window.MX.grid.snapshot()")
    burst_end = time.time()
    t2.wait_for_timeout(1500)

    t1.reload(wait_until="load")
    t1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    t1.wait_for_timeout(4000)
    snap1 = t1.evaluate("() => window.MX.grid.snapshot()")
    on_disk = disk_widgets(sid, surface)
    p = shot(t1, "D7-after-burst-reload")
    tabs_match = shape(snap1) == shape(snap2)
    disk_match = on_disk is not None and shape(on_disk) == shape(snap2)
    step("D7", "PASS" if tabs_match and disk_match else "FAIL",
         f"tab2 {len(snap2)} widgets, tab1 after reload {len(snap1)} widgets, "
         f"layouts match={tabs_match}; file {surface}.json holds {len(on_disk or [])} "
         f"widgets, matches tab2={disk_match}", p)

    # D8 — no save loop across step 7
    quiet = [w for w in writes if w[0] >= burst_end]
    worst, window = 0, []
    times = sorted(w[0] for w in quiet)
    for t0 in times:
        n = [x for x in times if t0 <= x < t0 + 2.0]
        if len(n) > worst:
            worst, window = len(n), n
    p = shot(t1, "D8-writes")
    step("D8", "PASS" if worst <= 3 else "FAIL",
         f"grid-route writes after the burst settled: {len(quiet)}; busiest 2s window "
         f"held {worst} (threshold >3); all writes this block={len(writes)}", p)

    bad = errors_since(mark)
    CONSOLE.append(f"[harness] block D console errors: {len(bad)}")
    return bad


def dump_console(block):
    p = os.path.join(OUT, f"console-{block}.txt")
    with open(p, "w") as f:
        f.write("\n".join(CONSOLE) + "\n")
    return p


def main():
    global OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--block", required=True)
    ap.add_argument("--session", default=None)
    ap.add_argument("--other", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    ap.add_argument("--no-sweep", action="store_true")
    args = ap.parse_args()
    OUT = args.out
    os.makedirs(OUT, exist_ok=True)

    rows = api("/api/sessions/open").get("list") or []
    sid = args.session or (rows[0]["id"] if rows else None)
    other = args.other or next((r["id"] for r in rows if r["id"] != sid), None)
    if other is None:
        d = api("/api/sessions/new", method="POST")
        other = (d.get("session") or {}).get("id") or d.get("sid") or d.get("id")
    print(f"session {sid}  other {other}", flush=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        try:
            if args.block == "E":
                block_e(context, sid, other)
            elif args.block == "D":
                block_d(context, sid)
            else:
                print(f"unknown block {args.block}")
        except Exception:
            import traceback
            CONSOLE.append("[harness] " + traceback.format_exc())
            print("HARNESS THREW:", traceback.format_exc(), flush=True)
        time.sleep(max(0, args.hold))
        browser.close()

    if not args.no_sweep:
        sweep()
    cp = dump_console(args.block)
    rp = os.path.join(OUT, f"results-{args.block}.txt")
    with open(rp, "w") as f:
        f.write(f"session {sid} other {other}\n" + "\n".join(RESULTS) + "\n")
    print(f"wrote {rp}\nwrote {cp}")
    sys.exit(0)


if __name__ == "__main__":
    main()
