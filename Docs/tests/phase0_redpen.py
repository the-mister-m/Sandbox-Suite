"""Headed Playwright harness: Phase 0 Code Canvas port redpen, blocks A-D.

Report only. Mounts widgets, drives the session window, opens second tabs,
records PASS / FAIL / OBSERVED per step with a screenshot for each.

Usage:
    python3 Docs/tests/phase0_redpen.py --block A --out Docs/Reports/phase0-redpen
    python3 Docs/tests/phase0_redpen.py --block B --out Docs/Reports/phase0-redpen
    ...

Session: first row of GET /api/sessions/open unless --session is given.
Exit code is always 0 unless /matrix itself will not load; the result lines
and console dumps are the record.
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


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def pick_session(given):
    if given:
        return given
    rows = api("/api/sessions/open").get("list") or []
    if rows:
        return rows[0]["id"]
    d = api("/api/sessions/new", method="POST")
    s = d.get("session") or {}
    return s.get("id") or d.get("sid") or d.get("id")


def watch(page, tag):
    page.on("console", lambda m: CONSOLE.append(f"[{tag}:console:{m.type}] {m.text}"))
    page.on("pageerror", lambda e: CONSOLE.append(f"[{tag}:pageerror] {e}"))


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


def click_text(page, text, root="body", timeout=5000):
    """Click the first visible button whose exact text matches."""
    loc = page.locator(f"{root} button", has_text=text)
    loc = page.locator(f"{root} button").filter(has_text=text)
    n = loc.count()
    for i in range(n):
        b = loc.nth(i)
        if b.is_visible() and b.inner_text().strip() == text:
            b.click(timeout=timeout)
            return True
    for i in range(n):
        b = loc.nth(i)
        if b.is_visible():
            b.click(timeout=timeout)
            return True
    return False


def press_session_button(page):
    """The Session button lives in the corner drawer; open the drawer first."""
    btn = page.locator("#mxSession")
    try:
        btn.click(timeout=2500)
        return
    except Exception:
        pass
    page.click("#mxDrawerHandle")
    page.wait_for_timeout(500)
    btn.click(timeout=5000)


def new_blank_surface(page):
    """Session window is up (or open it), press New blank surface."""
    if page.locator(".mx-overlay").count() == 0:
        press_session_button(page)
        page.wait_for_selector(".mx-overlay", timeout=5000)
    page.wait_for_timeout(400)
    ok = click_text(page, "New blank surface", root=".mx-overlay")
    page.wait_for_timeout(900)
    return ok


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
    """Click a collapsed dir row; browser loads the tree then expands."""
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
        # first click only requested the tree; click again
        rows = browser_rows(page, inst)
        again = next((r for r in rows if r["name"] == target["name"]), None)
        if again:
            page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(again["i"]).click()
            page.wait_for_timeout(1200)
            rows = browser_rows(page, inst)
            if any(r["chev"] == "▾" for r in rows):
                return next(r["name"] for r in rows if r["chev"] == "▾")
    return None


def expanded_names(page, inst):
    return [r["name"] for r in browser_rows(page, inst) if r["chev"] == "▾"]


def open_file_via_menu(page, inst):
    """Right-click the first file row, click Open in Editor. Returns path."""
    rows = browser_rows(page, inst)
    files = [r for r in rows if r["chev"].strip() == ""]
    if not files:
        return None
    page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(files[0]["i"]).click(button="right")
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


def monaco_count(page):
    return page.evaluate("() => document.querySelectorAll('.monaco-editor').length")


# ---------------- blocks ----------------

def block_a(context, sid):
    page = open_matrix(context, sid, tag="A")
    mark = len(CONSOLE)

    ok = new_blank_surface(page)
    surface = page.evaluate("() => window.MX.WINDOW_ID")
    p = shot(page, "A1-blank-surface")
    step("A1", "PASS" if ok and surface else "FAIL",
         f"blank surface added, surface id {surface}" if ok else "New blank surface button not found",
         p)

    ed = add_widget(page, "editor")
    page.wait_for_timeout(1500)
    br = add_widget(page, "browser")
    page.wait_for_timeout(2500)
    p = shot(page, "A2-editor-browser-mounted")

    folder = expand_first_dir(page, br)
    p3 = shot(page, "A3-folder-expanded")

    opened = open_file_via_menu(page, br)
    tabs = editor_tabs(page, ed)
    p2 = shot(page, "A2-file-open-in-editor")
    step("A2", "PASS" if tabs else "FAIL",
         f"editor {ed}; right-click Open in Editor on {opened}; tabs={tabs}",
         p2)
    step("A3", "PASS" if folder else "FAIL",
         f"browser {br}; expanded folder {folder}" if folder
         else "no collapsed folder row ever expanded",
         p3)

    before_tabs = tabs
    before_exp = expanded_names(page, br)
    before_monaco = monaco_count(page)

    third = add_widget(page, "terminal")
    page.wait_for_timeout(1500)
    page.locator(f'[data-instance="{third}"] button[title="close this widget"]').click()
    page.wait_for_timeout(1500)
    gone = page.locator(f'[data-instance="{third}"]').count() == 0
    p = shot(page, "A4-third-closed")
    step("A4", "PASS" if gone else "FAIL",
         f"third widget {third} (terminal) closed with x; element gone={gone}", p)

    after_tabs = editor_tabs(page, ed)
    after_exp = expanded_names(page, br)
    after_monaco = monaco_count(page)
    bad = errors_since(mark)
    held = (after_tabs == before_tabs and after_exp == before_exp
            and after_monaco == before_monaco and bool(before_tabs))
    p = shot(page, "A5-survivors")
    step("A5", "PASS" if held and not bad else "FAIL",
         f"tabs {before_tabs} -> {after_tabs}; expanded {before_exp} -> {after_exp}; "
         f"monaco {before_monaco} -> {after_monaco}"
         + (f"; console errors {bad}" if bad else ""), p)

    return page, surface, ed, br


# ---------------- block B ----------------

def click_in_last_overlay(page, text, timeout=6000):
    """Prompts and modals stack on top of the session window; act on the top one."""
    root = page.locator(".mx-overlay").last
    btns = root.locator("button")
    for i in range(btns.count()):
        b = btns.nth(i)
        if b.is_visible() and b.inner_text().strip() == text:
            b.click(timeout=timeout)
            return True
    return False


def open_session_window(page):
    if page.locator(".mx-overlay").count() == 0:
        press_session_button(page)
    page.wait_for_selector(".mx-overlay", timeout=6000)
    page.wait_for_timeout(900)


def close_overlay(page):
    page.evaluate("() => document.querySelectorAll('.mx-overlay').forEach(o => o.remove())")


def mark_sections(page):
    """Tag the Surfaces body and Surface templates rows so locators can reach them."""
    return page.evaluate("""() => {
      const panel = document.querySelector('.mx-overlay .mx-panel');
      if (!panel) return null;
      const kids = Array.from(panel.children);
      const si = kids.findIndex(k => k.tagName === 'H4' && k.textContent === 'Surfaces');
      if (si >= 0 && kids[si+1]) kids[si+1].id = 'rp-surfaces';
      const ti = kids.findIndex(k => k.tagName === 'H4' && k.textContent === 'Surface templates');
      const tpl = [];
      if (ti >= 0) {
        for (let i = ti+1; i < kids.length; i++) {
          if (kids[i].tagName === 'H4' || kids[i].classList.contains('mx-actions')) break;
          kids[i].classList.add('rp-tplrow');
          tpl.push(kids[i].textContent);
        }
      }
      const body = document.getElementById('rp-surfaces');
      return { surfaces: body ? Array.from(body.children).map(r => r.textContent) : null,
               templates: tpl };
    }""")


def surfaces_list(page):
    open_session_window(page)
    return mark_sections(page)


def block_b(context, sid):
    page = open_matrix(context, sid, tag="B1")
    mark = len(CONSOLE)
    new_blank_surface(page)
    surface = page.evaluate("() => window.MX.WINDOW_ID")
    ed = add_widget(page, "editor")
    page.wait_for_timeout(1200)
    br = add_widget(page, "browser")
    page.wait_for_timeout(2500)
    expand_first_dir(page, br)
    open_file_via_menu(page, br)
    page.wait_for_timeout(1000)
    url = page.url
    p = shot(page, "B1-url")
    step("B1", "PASS" if f"?s={surface}" in url else "FAIL",
         f"url {url}; surface {surface}", p)

    before = page.evaluate("() => window.MX.grid.snapshot()")
    page.close()
    time.sleep(2)
    page2 = context.new_page()
    watch(page2, "B2")
    page2.goto(url, wait_until="load", timeout=20000)
    page2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    page2.wait_for_timeout(3000)
    after = page2.evaluate("() => window.MX.grid.snapshot()")
    p = shot(page2, "B2-reopened")
    same = ([ (w["type"], w["slot"]) for w in before ] == [ (w["type"], w["slot"]) for w in after ]
            and len(before) == len(after) and len(before) > 0)
    opts_same = [w.get("options") for w in before] == [w.get("options") for w in after]
    step("B2", "PASS" if same and opts_same else "FAIL",
         f"before {json.dumps(before)[:400]} / after {json.dumps(after)[:400]}", p)
    page = page2

    info = surfaces_list(page)
    p = shot(page, "B3-surfaces-section")
    listed = [s for s in (info or {}).get("surfaces") or [] if surface in s or "Surface" in s]
    named = any(("Surface" in s) for s in listed)
    step("B3", "PASS" if info and info["surfaces"] and named else "FAIL",
         f"Surfaces rows: {info['surfaces'] if info else None}", p)

    # B4 rename
    rows = info["surfaces"]
    idx = next((i for i, s in enumerate(rows) if s.startswith("Surface")), 0)
    page.locator("#rp-surfaces .mx-row").nth(idx).locator("button", has_text="Rename").click()
    page.wait_for_timeout(500)
    page.locator(".mx-overlay input[type=text]").last.fill("RedpenRenamed")
    click_in_last_overlay(page, "Save")
    page.wait_for_timeout(1200)
    close_overlay(page)
    page.reload(wait_until="load")
    page.wait_for_function("() => window.MX && window.MX.grid", timeout=15000)
    page.wait_for_timeout(2500)
    info4 = surfaces_list(page)
    p = shot(page, "B4-renamed")
    step("B4", "PASS" if info4 and any("RedpenRenamed" in s for s in info4["surfaces"]) else "FAIL",
         f"after rename+reload: {info4['surfaces'] if info4 else None}", p)

    # B5 template surface
    before_url = page.url
    before_count = len(api(f"/api/grid/{sid}")["list"])
    tpls = api("/api/matrix-templates").get("list") or []
    if not tpls:
        click_text(page, "Save Matrix Template", root=".mx-overlay")
        page.wait_for_timeout(500)
        page.locator(".mx-overlay input[type=text]").last.fill("redpen-tpl")
        click_in_last_overlay(page, "Save")
        page.wait_for_timeout(1200)
    close_overlay(page)
    info5 = surfaces_list(page)
    tplrows = page.locator(".rp-tplrow")
    if tplrows.count():
        tplrows.first.locator("button", has_text="Add surface").click()
    page.wait_for_timeout(2500)
    after_url = page.url
    after_count = len(api(f"/api/grid/{sid}")["list"])
    snap5 = page.evaluate("() => window.MX.grid.snapshot()")
    name5 = page.evaluate("() => window.MX.grid.surfaceName")
    p = shot(page, "B5-template-surface")
    ok5 = after_count == before_count + 1 and after_url != before_url and len(snap5) > 0
    step("B5", "PASS" if ok5 else "FAIL",
         f"surfaces {before_count}->{after_count}; url changed={after_url != before_url}; "
         f"new surface name={name5!r}; widgets={[w['type'] for w in snap5]}", p)

    # B6 new blank
    before_count = after_count
    before_url = page.url
    close_overlay(page)
    new_blank_surface(page)
    page.wait_for_timeout(1500)
    snap6 = page.evaluate("() => window.MX.grid.snapshot()")
    name6 = page.evaluate("() => window.MX.grid.surfaceName")
    info6 = surfaces_list(page)
    p = shot(page, "B6-new-blank")
    ok6 = (len(snap6) == 0 and info6 and any(name6 in s for s in info6["surfaces"])
           and page.url != before_url)
    step("B6", "PASS" if ok6 else "FAIL",
         f"name={name6!r} widgets={len(snap6)} rows={info6['surfaces'] if info6 else None}", p)

    # B7 close another surface
    mine = page.evaluate("() => window.MX.WINDOW_ID")
    api_rows = api(f"/api/grid/{sid}")["list"]
    other = next((r for r in api_rows if r["id"] != mine), None)
    info7 = mark_sections(page)
    rows7 = info7["surfaces"]
    label = other["name"] or other["id"]
    oidx = next((i for i, s in enumerate(rows7) if s.startswith(label)), None)
    if oidx is None:
        step("B7", "FAIL", f"other surface {label} not listed in {rows7}", shot(page, "B7-missing"))
    else:
        page.locator("#rp-surfaces .mx-row").nth(oidx).locator("button", has_text="Close").click()
        page.wait_for_timeout(600)
        click_in_last_overlay(page, "Close")
        page.wait_for_timeout(1500)
        info7b = mark_sections(page)
        still = api(f"/api/grid/{sid}")["list"]
        gone_api = all(r["id"] != other["id"] for r in still)
        gone_row = info7b and not any(s.startswith(label) for s in info7b["surfaces"])
        p = shot(page, "B7-other-closed")
        step("B7", "PASS" if gone_api and gone_row else "FAIL",
             f"closed {other['id']} ({label}); gone from api={gone_api}; gone from rows={gone_row}", p)

    # B8 close own surface
    info8 = mark_sections(page)
    rows8 = info8["surfaces"] if info8 else []
    midx = next((i for i, s in enumerate(rows8) if s.startswith(page.evaluate("() => window.MX.grid.surfaceName") or "@@")), None)
    if midx is None:
        midx = next((i for i, s in enumerate(rows8) if mine in s), None)
    if midx is None:
        step("B8", "FAIL", f"own surface {mine} not listed in {rows8}", shot(page, "B8-missing"))
    else:
        page.locator("#rp-surfaces .mx-row").nth(midx).locator("button", has_text="Close").click()
        page.wait_for_timeout(600)
        click_in_last_overlay(page, "Close")
        page.wait_for_timeout(2000)
        empty = page.evaluate("() => window.MX.grid.instances.length")
        panel_up = page.locator(".mx-overlay").count() > 0
        p = shot(page, "B8-own-closed")
        step("B8", "PASS" if empty == 0 and panel_up else "FAIL",
             f"instances={empty}; session window up={panel_up}", p)

    bad = errors_since(mark)
    if bad:
        CONSOLE.append(f"[harness] block B console errors: {len(bad)}")

    # B9-B12 suite page
    suite = context.new_page()
    watch(suite, "Bsuite")
    suite.goto(BASE + "/", wait_until="load", timeout=20000)
    suite.wait_for_timeout(2000)
    hdr = suite.evaluate("""() => {
      const t = document.querySelector('#open-sessions-body').closest('table');
      const th = Array.from(t.querySelectorAll('thead th')).map(x => x.textContent.trim());
      const first = t.querySelector('tbody tr');
      const td = first ? Array.from(first.children).map(x => x.textContent.trim()) : [];
      const thx = Array.from(t.querySelectorAll('thead th')).map(x => Math.round(x.getBoundingClientRect().left));
      const tdx = first ? Array.from(first.children).map(x => Math.round(x.getBoundingClientRect().left)) : [];
      return { th, td, thx, tdx };
    }""")
    p = shot(suite, "B9-suite-header")
    want = ["name", "saved", "last", "tracks", "surfaces"]
    aligned = hdr["thx"][:5] == hdr["tdx"][:5] and hdr["th"][:5] == want
    step("B9", "PASS" if aligned else "FAIL",
         f"th={hdr['th']} td={hdr['td']} th_x={hdr['thx']} td_x={hdr['tdx']}", p)

    btns = suite.evaluate("""() => {
      const r = document.querySelector('#open-sessions-body tr');
      return r ? Array.from(r.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
    }""")
    p = shot(suite, "B10-suite-buttons")
    step("B10", "PASS" if btns == ["Select", "Save", "End"] else "FAIL",
         f"row buttons {btns}", p)

    before_files = len(api(f"/api/grid/{sid}")["list"])
    with context.expect_page() as pinfo:
        suite.locator("#open-sessions-body tr").first.locator('[data-act="select"]').click()
    newtab = pinfo.value
    watch(newtab, "B11")
    newtab.wait_for_load_state("load")
    newtab.wait_for_timeout(3000)
    after_files = len(api(f"/api/grid/{sid}")["list"])
    panel_up = newtab.locator(".mx-overlay").count() > 0
    p = shot(newtab, "B11-select-tab")
    ok11 = ("/matrix/" in newtab.url) and panel_up and after_files == before_files
    step("B11", "PASS" if ok11 else "FAIL",
         f"url {newtab.url}; session window up={panel_up}; grid files {before_files}->{after_files}", p)

    # B12 last moves
    last_before = suite.evaluate("""() => {
      const r = document.querySelector('#open-sessions-body tr');
      return r ? r.children[2].textContent.trim() : null; }""")
    new_blank_surface(newtab)
    newtab.wait_for_timeout(800)
    b = add_widget(newtab, "browser")
    newtab.wait_for_timeout(3000)
    suite.reload(wait_until="load")
    suite.wait_for_timeout(2500)
    last_after = suite.evaluate("""() => {
      const r = document.querySelector('#open-sessions-body tr');
      return r ? r.children[2].textContent.trim() : null; }""")
    p = shot(suite, "B12-last")
    step("B12", "PASS" if last_after and last_after != last_before else "FAIL",
         f"last {last_before!r} -> {last_after!r} after adding a browser widget "
         f"(sends a client tree frame)", p)


# ---------------- block C ----------------

def block_c(context, sid):
    page = open_matrix(context, sid, tag="C")
    mark = len(CONSOLE)
    new_blank_surface(page)
    surface = page.evaluate("() => window.MX.WINDOW_ID")
    ed = add_widget(page, "editor")
    page.wait_for_timeout(1200)
    br = add_widget(page, "browser")
    page.wait_for_timeout(2500)
    expand_first_dir(page, br)
    opened = open_file_via_menu(page, br)
    tabs_before = editor_tabs(page, ed)
    p = shot(page, "C1-file-open")
    step("C1", "PASS" if tabs_before else "FAIL",
         f"surface {surface}; opened {opened}; tabs={tabs_before}; no options panel touched", p)

    page.reload(wait_until="load")
    page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    page.wait_for_timeout(3500)
    snap = page.evaluate("() => window.MX.grid.snapshot()")
    ed2 = next((w["id"] for w in snap if w["type"] == "editor"), None)
    tabs_after = editor_tabs(page, ed2) if ed2 else None
    p = shot(page, "C2-after-reload")
    step("C2", "PASS" if tabs_after and tabs_before and
         [t["path"] for t in tabs_after] == [t["path"] for t in tabs_before] else "FAIL",
         f"tabs before {tabs_before} / after {tabs_after}", p)

    br2 = next((w["id"] for w in snap if w["type"] == "browser"), None)
    slot_before = page.evaluate("(id) => JSON.parse(JSON.stringify("
                               "window.MX.grid.instances.find(i => i.id === id).slot))", br2)
    box = page.locator(f'[data-instance="{br2}"] .mx-bar-name').bounding_box()
    page.mouse.move(box["x"] + 10, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + 260, box["y"] + 180, steps=12)
    page.mouse.up()
    page.wait_for_timeout(800)
    slot_moved = page.evaluate("(id) => JSON.parse(JSON.stringify("
                               "window.MX.grid.instances.find(i => i.id === id).slot))", br2)
    page.reload(wait_until="load")
    page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    page.wait_for_timeout(3000)
    snap3 = page.evaluate("() => window.MX.grid.snapshot()")
    slot_after = next((w["slot"] for w in snap3 if w["id"] == br2), None)
    p = shot(page, "C3-after-move-reload")
    moved = slot_moved != slot_before
    held = slot_after == slot_moved
    step("C3", "PASS" if moved and held else "FAIL",
         f"slot {slot_before} -> moved {slot_moved} -> after reload {slot_after} "
         f"(drag actually moved it={moved})", p)
    bad = errors_since(mark)
    if bad:
        CONSOLE.append(f"[harness] block C console errors: {bad}")


# ---------------- block D ----------------

def block_d(context, sid):
    t1 = open_matrix(context, sid, tag="D1")
    new_blank_surface(t1)
    surface = t1.evaluate("() => window.MX.WINDOW_ID")
    url = t1.url
    puts = []
    t2 = context.new_page()
    watch(t2, "D2")
    t2.on("request", lambda r: puts.append((time.time(), r.method, r.url))
          if r.method in ("PUT", "POST") and "/api/grid/" in r.url else None)
    t1.on("request", lambda r: puts.append((time.time(), r.method, r.url))
          if r.method in ("PUT", "POST") and "/api/grid/" in r.url else None)
    t2.goto(url, wait_until="load", timeout=20000)
    t2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    t2.wait_for_timeout(2500)
    w1 = t1.evaluate("() => window.MX.WINDOW_ID")
    w2 = t2.evaluate("() => window.MX.WINDOW_ID")
    CONSOLE.append(f"[harness] tab1 WINDOW_ID={w1} tab2 WINDOW_ID={w2} surface={surface}")

    ed = add_widget(t1, "editor")
    t1.wait_for_timeout(3000)
    seen = t2.locator(f'[data-instance="{ed}"]').count()
    p = shot(t2, "D1-tab2-after-add")
    step("D1", "PASS" if seen else "FAIL",
         f"tab1 WINDOW_ID={w1}, tab2 WINDOW_ID={w2}; added {ed} in tab1; "
         f"tab2 elements with that instance={seen}", p)

    # D2 move+resize in tab two
    ed2 = add_widget(t2, "terminal")
    t2.wait_for_timeout(2000)
    box = t2.locator(f'[data-instance="{ed2}"] .mx-bar-name').bounding_box()
    if box:
        t2.mouse.move(box["x"] + 10, box["y"] + box["height"] / 2)
        t2.mouse.down()
        t2.mouse.move(box["x"] + 300, box["y"] + 200, steps=12)
        t2.mouse.up()
        t2.wait_for_timeout(2500)
    slot2 = t2.evaluate("(id) => { const i = window.MX.grid.instances.find(x => x.id === id);"
                        " return i ? JSON.parse(JSON.stringify(i.slot)) : null; }", ed2)
    slot1 = t1.evaluate("(id) => { const i = window.MX.grid.instances.find(x => x.id === id);"
                        " return i ? JSON.parse(JSON.stringify(i.slot)) : null; }", ed2)
    p = shot(t1, "D2-tab1-after-move")
    step("D2", "PASS" if slot1 and slot1 == slot2 else "FAIL",
         f"tab2 slot for {ed2}={slot2}; tab1 slot={slot1}", p)

    # D3 close in tab one
    had = t2.locator(f'[data-instance="{ed}"]').count()
    t1.evaluate("(id) => window.MX.grid.removeWidget(id)", ed)
    t1.wait_for_timeout(2500)
    left = t2.locator(f'[data-instance="{ed}"]').count()
    p = shot(t2, "D3-tab2-after-close")
    step("D3", "PASS" if had and left == 0 else "FAIL",
         f"closed {ed} in tab1; tab2 held it before close={had}; tab2 shows {left} after"
         + ("" if had else " — tab2 never had it, removal not demonstrated"), p)

    # D4 open a file in tab one's editor
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
    step("D4", "PASS" if tabs2 and tabs1 and
         [t["path"] for t in tabs2] == [t["path"] for t in tabs1] else "FAIL",
         f"tab1 editor tabs={tabs1}; tab2 editor tabs={tabs2}", p)

    # D5 raw bus — also count widget_bus frames that reach tab two's socket
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
    ok5 = (c1 == 1 and c2 == 1) and (c1b == 2 and c2b == 1)
    step("D5", "PASS" if ok5 else "FAIL",
         f"remote emit: tab1 fired {c1}, tab2 fired {c2}; "
         f"local emit: tab1 total {c1b}, tab2 total {c2b}; "
         f"widget_bus frames that reached tab2's socket: {frames}; tab2 WINDOW_ID={w2}", p)

    # D6 two surfaces, same session — OBSERVED
    t3 = open_matrix(context, sid, tag="D3tab")
    new_blank_surface(t3)
    s3 = t3.evaluate("() => window.MX.WINDOW_ID")
    ed_s2 = add_widget(t3, "editor")
    t3.wait_for_timeout(2500)
    tabs_s2_before = editor_tabs(t3, ed_s2)
    br1 = add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    expand_first_dir(t1, br1)
    opened2 = open_file_via_menu(t1, br1)
    t1.wait_for_timeout(4000)
    tabs_s2_after = editor_tabs(t3, ed_s2)
    snap_s2 = t3.evaluate("() => window.MX.grid.snapshot()")
    p = shot(t3, "D6-other-surface")
    step("D6", "OBSERVED",
         f"surface one={surface}, surface two={s3}; opened {opened2} on surface one; "
         f"surface two editor tabs before={tabs_s2_before} after={tabs_s2_after}; "
         f"surface two widgets now={[w['type'] for w in snap_s2]}", p)

    # D7 burst in tab two, reload tab one
    for _ in range(4):
        add_widget(t2, "viewer")
        t2.wait_for_timeout(400)
    t2.wait_for_timeout(1500)
    puts.clear()  # the burst's own four writes are not a loop; watch the quiet after
    t2.wait_for_timeout(5000)
    snap2 = t2.evaluate("() => window.MX.grid.snapshot()")
    t1.reload(wait_until="load")
    t1.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    t1.wait_for_timeout(3500)
    snap1 = t1.evaluate("() => window.MX.grid.snapshot()")
    worst = 0
    times = sorted(t for t, m, u in puts)
    for i, t0 in enumerate(times):
        n = len([x for x in times if t0 <= x < t0 + 2.0])
        worst = max(worst, n)
    p = shot(t1, "D7-after-burst-reload")
    matches = sorted((w["type"], json.dumps(w["slot"])) for w in snap1) == \
              sorted((w["type"], json.dumps(w["slot"])) for w in snap2)
    step("D7", "PASS" if matches and worst <= 3 else "FAIL",
         f"tab1 {len(snap1)} widgets, tab2 {len(snap2)} widgets, layouts match={matches}; "
         f"most grid writes inside any 2s window={worst} (loop threshold >3)", p)


def dump_console():
    p = os.path.join(OUT, "console.txt")
    with open(p, "a") as f:
        f.write("\n".join(CONSOLE) + "\n")
    return p


def main():
    global OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--block", required=True)
    ap.add_argument("--session", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    OUT = args.out
    os.makedirs(OUT, exist_ok=True)

    sid = pick_session(args.session)
    print(f"session {sid}", flush=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        try:
            fn = {"A": block_a, "B": block_b, "C": block_c, "D": block_d}.get(args.block)
            if fn is None:
                print(f"unknown block {args.block}")
            else:
                fn(context, sid)
        except Exception as exc:
            import traceback
            CONSOLE.append("[harness] " + traceback.format_exc())
            print("HARNESS THREW:", exc, flush=True)
        time.sleep(max(0, args.hold))
        browser.close()

    cp = dump_console()
    rp = os.path.join(OUT, f"results-{args.block}.txt")
    with open(rp, "w") as f:
        f.write(f"session {sid}\n" + "\n".join(RESULTS) + "\n")
    print(f"wrote {rp}\nwrote {cp}")
    sys.exit(0)


if __name__ == "__main__":
    main()
