"""Headed Playwright harness: Phase 0 Code Canvas port, blocks F and G.

Report only. F proves widget insides mirror between two tabs on one
surface. G proves the corner line, the save retry, the unsaved flag and
the socket goodbye. Records PASS / FAIL / OBSERVED per step with a
screenshot for each.

Usage:
    python3 Docs/tests/phase0_rerun2.py --block F --out Docs/Reports/phase0-rerun2
    python3 Docs/tests/phase0_rerun2.py --block G --out Docs/Reports/phase0-rerun2

Session: first row of GET /api/sessions/open unless --session is given.
Fence: the surface ids present at start are off limits. Every surface this
harness makes is deleted on the way out and both lists are printed.
Helpers, fence and sweep come from phase0_rerun.py.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import phase0_rerun as H  # noqa: E402  helpers, fence, sweep
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = H.BASE
REGIONS = "auto"   # auto | skip | only


# ---------------- shared state lives in H ----------------

def log(line):
    H.CONSOLE.append(f"{H.stamp()} {line}")


def shot(page, name):
    return H.shot(page, name)


def step(num, status, note, shot_path):
    H.step(num, status, note, shot_path)


def wait_until(page, js, arg=None, timeout=3.0, poll=0.2):
    """Poll a page predicate. Returns (ok, seconds waited)."""
    t0 = time.time()
    while True:
        try:
            if page.evaluate(js, arg):
                return True, round(time.time() - t0, 2)
        except Exception:
            pass
        if time.time() - t0 >= timeout:
            return False, round(time.time() - t0, 2)
        page.wait_for_timeout(int(poll * 1000))


def corner(page):
    return page.evaluate("() => { const e = document.getElementById('mxState');"
                         " return e ? e.textContent : null; }")


def tab_id(page):
    return page.evaluate("() => window.MX.TAB_ID")


# ---------------- widget readers ----------------

ED_STATE = """(id) => {
  const f = window.MX.grid.frames[id];
  const el = document.querySelector(`[data-instance="${id}"]`);
  const dom = el ? Array.from(el.querySelectorAll('.mxed-tab')).map(t => {
    const s = t.querySelector('span');
    return { label: s ? s.textContent : t.textContent,
             path: s ? s.title : '', on: t.classList.contains('mxed-on') };
  }) : null;
  return { dom, opt: f ? f.getOptions() : null };
}"""

TERM_STATE = """(id) => {
  const f = window.MX.grid.frames[id];
  const el = document.querySelector(`[data-instance="${id}"]`);
  const dom = el ? Array.from(el.querySelectorAll('.mxtm-tab')).map(t => ({
    label: t.textContent, on: t.classList.contains('mxtm-on') })) : null;
  const t = f ? f._term : null;
  const screens = t ? t.tabs.map(x => {
    let text = null;
    if (x.term && x.term.buffer) {
      const b = x.term.buffer.active;
      const lines = [];
      for (let i = Math.max(0, b.length - 40); i < b.length; i++) {
        const ln = b.getLine(i);
        if (ln) lines.push(ln.translateToString(true));
      }
      text = lines.join('\\n');
    }
    return { key: x.key, region: x.region, live: !!x.term, text };
  }) : null;
  return { dom, opt: f ? f.getOptions() : null, screens,
           status: el ? (el.querySelector('.mxtm-status') || {}).textContent : null };
}"""

VIEW_STATE = """(id) => {
  const f = window.MX.grid.frames[id];
  const el = document.querySelector(`[data-instance="${id}"]`);
  const dom = el ? Array.from(el.querySelectorAll('.mx-viewer-tab')).map(
    t => t.textContent) : null;
  return { dom, opt: f ? f.getOptions() : null };
}"""

BROWSE_STATE = """(id) => {
  const f = window.MX.grid.frames[id];
  const el = document.querySelector(`[data-instance="${id}"]`);
  const rootline = el ? (el.querySelector('.mx-browser-rootline') || {}).textContent : null;
  const open = el ? Array.from(el.querySelectorAll('.mx-browser-row'))
    .filter(r => (r.querySelector('.mx-browser-chev') || {}).textContent === '\\u25BE')
    .map(r => (r.querySelector('.mx-browser-name') || {}).textContent) : null;
  const rows = el ? el.querySelectorAll('.mx-browser-row').length : null;
  const st = f ? f._browser : null;
  return { rootline, open, rows,
           nodes: st && st.nodeMap ? st.nodeMap.size : null,
           want: st && st.expandedWant ? Array.from(st.expandedWant) : null,
           opt: f ? f.getOptions() : null };
}"""

CHAT_STATE = """(id) => {
  const f = window.MX.grid.frames[id];
  const el = document.querySelector(`[data-instance="${id}"]`);
  const c = f ? f._chat : null;
  const pick = el ? el.querySelector('.cq-pick') : null;
  return { opt: f ? f.getOptions() : null,
           region: f ? (f.options.region || '') : null,
           regions: c ? (c.regions || []).map(r => ({ id: r.id, name: r.name })) : null,
           pickValue: pick ? pick.value : null,
           pickOptions: pick ? Array.from(pick.options).map(o => o.value) : null,
           head: el ? (el.querySelector('.cq-head') || el).textContent.slice(0, 120) : null };
}"""


def ed_state(page, inst):
    return page.evaluate(ED_STATE, inst)


def term_state(page, inst):
    return page.evaluate(TERM_STATE, inst)


def view_state(page, inst):
    return page.evaluate(VIEW_STATE, inst)


def browse_state(page, inst):
    return page.evaluate(BROWSE_STATE, inst)


def chat_state(page, inst):
    return page.evaluate(CHAT_STATE, inst)


# ---------------- drivers ----------------

def open_file_in(page, inst, which, target):
    """Right-click the Nth file row in browser `inst`, choose Open in <target>."""
    rows = H.browser_rows(page, inst)
    files = [r for r in rows if r["chev"].strip() == ""]
    if len(files) <= which:
        return None
    page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(
        files[which]["i"]).click(button="right")
    page.wait_for_timeout(400)
    menu = page.locator("body > .mx-panel").last
    btn = menu.locator("button", has_text=f"Open in {target}")
    if btn.count() == 0:
        page.keyboard.press("Escape")
        return None
    btn.first.click()
    page.wait_for_timeout(2500)
    return files[which]["name"]


VISIBLE_ROWS = """(id) => Array.from(document.querySelectorAll(
    `[data-instance="${id}"] .mx-browser-row`)).map((r, i) => ({
      i, chev: (r.querySelector('.mx-browser-chev') || {}).textContent,
      name: (r.querySelector('.mx-browser-name') || {}).textContent,
      shown: !!(r.offsetParent || r.getClientRects().length) }))"""


def expand_nested(page, inst):
    """Expand one folder, then one folder inside it. Returns the two names."""
    first = H.expand_first_dir(page, inst)
    if not first:
        return [None, None]
    page.wait_for_timeout(1000)
    for _ in range(6):
        rows = page.evaluate(VISIBLE_ROWS, inst)
        closed = [r for r in rows if r["chev"] == "▸" and r["shown"]]
        if not closed:
            return [first, None]
        r = closed[0]
        try:
            page.locator(f'[data-instance="{inst}"] .mx-browser-row').nth(
                r["i"]).click(timeout=6000)
        except Exception as exc:
            log(f"[harness] expand click {r['name']}: {exc}")
            return [first, None]
        page.wait_for_timeout(1800)
        now = browse_state(page, inst)
        if now["opt"] and len(now["opt"].get("expanded") or []) >= 2:
            return [first, r["name"]]
    return [first, None]


def grid_writes_probe(page):
    page.evaluate("""() => {
      if (window.__rpFetch) return;
      window.__rpFetch = { attempts: [], mode: 'off' };
      const real = window.fetch.bind(window);
      window.__rpReal = real;
      window.fetch = function (input, init) {
        const url = String((input && input.url) || input || '');
        const method = (init && init.method) || (input && input.method) || 'GET';
        if (url.indexOf('/api/grid/') >= 0 && method === 'PUT') {
          window.__rpFetch.attempts.push(Date.now());
          const m = window.__rpFetch.mode;
          if (m === 'fail') return Promise.reject(new Error('rp-blocked'));
          if (m === 'once' && window.__rpFetch.attempts.length === 1) {
            return Promise.reject(new Error('rp-blocked'));
          }
        }
        return real(input, init);
      };
    }""")


def set_fetch_mode(page, mode):
    page.evaluate("(m) => { window.__rpFetch.mode = m; }", mode)


def reset_attempts(page):
    page.evaluate("() => { window.__rpFetch.attempts = []; }")


def attempts(page):
    return page.evaluate("() => window.__rpFetch.attempts.length")


def nudge_widget(page, inst):
    """Move a widget one column: the same path a drag ends in."""
    page.evaluate("""(id) => {
      const g = window.MX.grid;
      const i = g.instances.find(x => x.id === id);
      if (!i) return;
      i.slot.col = (i.slot.col + 1) % Math.max(1, g.cols - i.slot.w);
      g.render(); g.save(); g._announce();
    }""", inst)


def sample_corner(page, seconds=5.0, poll=0.25):
    seen = []
    t0 = time.time()
    while time.time() - t0 < seconds:
        seen.append(corner(page))
        page.wait_for_timeout(int(poll * 1000))
    return seen


def observe(page):
    """Read-only taps: mirror payloads, socket file frames, markDirty calls."""
    page.evaluate("""() => {
      if (window.__rpObs) return;
      const obs = window.__rpObs = { mirror: [], file: [], dirty: [] };
      const t0 = Date.now();
      MX.bus.on('surface.widget', (p) => obs.mirror.push({
        at: Date.now() - t0, id: p && p.id,
        keys: p && p.options ? Object.keys(p.options) : null,
        tabs: p && p.options && p.options.tabs ? p.options.tabs : null }));
      MX.socket.onFrame((m) => { if (m && m.type === 'file') obs.file.push({
        at: Date.now() - t0, path: m.path, inst: m.inst }); });
      const real = MX.grid.markDirty.bind(MX.grid);
      MX.grid.markDirty = function (frame) {
        obs.dirty.push({ at: Date.now() - t0, id: frame ? frame.id : null });
        return real(frame);
      };
    }""")


def observed(page):
    return page.evaluate("() => window.__rpObs || null")


def surface_rows_panel(page):
    """Tag the session window's surface rows and read their buttons."""
    return page.evaluate("""() => {
      const panel = document.querySelector('.mx-overlay .mx-panel');
      if (!panel) return null;
      const kids = Array.from(panel.children);
      const si = kids.findIndex(k => k.tagName === 'H4' && k.textContent === 'Surfaces');
      const body = si >= 0 ? kids[si + 1] : null;
      if (!body) return null;
      return Array.from(body.children).map((r, i) => {
        r.classList.add('rp2-surfrow'); r.dataset.rp2 = String(i);
        return { i, text: r.textContent,
                 buttons: Array.from(r.querySelectorAll('button')).map(b => b.textContent.trim()) };
      });
    }""")


# ---------------- block F: widget insides mirror ----------------

def block_f(context, sid, fallback_sids):
    H.fence(sid)
    writes = []

    def track(tag, r):
        if r.method in ("PUT", "POST") and "/api/grid/" in r.url:
            writes.append((time.time(), tag, r.method, r.url))

    t1 = H.open_matrix(context, sid, tag="F-t1")
    mark = len(H.CONSOLE)
    surface = H.add_empty_surface(t1)
    H.close_overlay(t1)
    url = t1.url
    t1.on("request", lambda r: track("t1", r))

    t2 = context.new_page()
    H.watch(t2, "F-t2")
    t2.on("request", lambda r: track("t2", r))
    t2.goto(url, wait_until="load", timeout=20000)
    t2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    t2.wait_for_timeout(2500)
    t2_boot = tab_id(t2)
    log(f"[harness] F surface={surface} url={url} t1={tab_id(t1)} t2={t2_boot}")

    f_start = time.time()
    observe(t1)
    observe(t2)

    # ---- F1 editor ----
    br = H.add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    ed = H.add_widget(t1, "editor")
    t1.wait_for_timeout(2500)
    H.expand_first_dir(t1, br)
    one = open_file_in(t1, br, 0, "Editor")
    ok_a, secs_a = wait_until(
        t2, """(id) => { const f = window.MX.grid.frames[id];
          if (!f) return false; const o = f.getOptions();
          return !!(o && o.tabs && o.tabs.length); }""", ed, timeout=3.0)
    s1a = ed_state(t1, ed)
    s2a = ed_state(t2, ed)
    late_ok, late_secs = (True, secs_a) if ok_a else wait_until(
        t2, """(id) => { const f = window.MX.grid.frames[id];
          if (!f) return false; const o = f.getOptions();
          return !!(o && o.tabs && o.tabs.length); }""", ed, timeout=12.0)
    obs1 = observed(t1)
    obs2 = observed(t2)
    log(f"[obs] t1 dirty={obs1['dirty']}")
    log(f"[obs] t1 mirror-out={obs1['mirror']}")
    log(f"[obs] t2 mirror-in={obs2['mirror']}")
    log(f"[obs] t2 file-frames={obs2['file']}")
    p = shot(t2, "F1a-editor-open")
    same_a = bool(s2a["opt"] and s1a["opt"]
                  and [t["path"] for t in s2a["opt"]["tabs"]]
                  == [t["path"] for t in s1a["opt"]["tabs"]])
    dom_a = bool(s2a["dom"]) and len(s2a["dom"]) == len(s1a["dom"] or [])
    no_reload_a = tab_id(t2) == t2_boot
    step("F1a", "PASS" if (ok_a and same_a and dom_a and no_reload_a) else "FAIL",
         f"opened {one!r} in tab1 editor {ed}; tab2 showed it in {secs_a}s; "
         f"tab1 tabs={[t['path'] for t in (s1a['opt'] or {}).get('tabs', [])]}; "
         f"tab2 tabs={[t['path'] for t in (s2a['opt'] or {}).get('tabs', [])]}; "
         f"tab2 DOM tabs={s2a['dom']}; tab2 TAB_ID unchanged={no_reload_a}; "
         f"arrived at all within 12s={late_ok} ({late_secs}s); "
         f"tab1 markDirty calls={obs1['dirty']}; tab1 surface.widget out={obs1['mirror']}; "
         f"tab2 surface.widget in={obs2['mirror']}; tab2 socket file frames={obs2['file']}", p)

    two = open_file_in(t1, br, 1, "Editor")
    t1.wait_for_timeout(2500)
    s1 = ed_state(t1, ed)
    keys = [t["key"] for t in (s1["opt"] or {}).get("tabs", [])]
    switched_to = None
    if len(keys) >= 2:
        target = keys[0] if s1["opt"]["active"] != keys[0] else keys[1]
        idx = keys.index(target)
        t1.locator(f'[data-instance="{ed}"] .mxed-tab').nth(idx).click()
        switched_to = target
        t1.wait_for_timeout(3000)
    ok_b, secs_b = wait_until(
        t2, """([id, key]) => { const f = window.MX.grid.frames[id];
          return !!(f && f.getOptions().active === key); }""",
        [ed, switched_to], timeout=4.0) if switched_to else (False, 0)
    s1b = ed_state(t1, ed)
    s2b = ed_state(t2, ed)
    p = shot(t2, "F1b-editor-switch")
    on_b = [d["label"] for d in (s2b["dom"] or []) if d["on"]]
    ob1 = observed(t1)
    ob2 = observed(t2)
    ed_out = [m for m in ob1["mirror"] if m["id"] == ed]
    ed_in = [m for m in ob2["mirror"] if m["id"] == ed]
    log(f"[obs] F1b t1 editor announces={ed_out}")
    log(f"[obs] F1b t2 editor arrivals={ed_in}")
    log(f"[obs] F1b t2 file frames={ob2['file']}")
    log(f"[obs] F1b t1 dirty={ob1['dirty']}")
    step("F1b", "PASS" if ok_b and s2b["opt"] and s2b["opt"]["active"] == s1b["opt"]["active"]
         else ("FAIL" if switched_to else "OBSERVED"),
         f"second file {two!r}; tab1 switched active to {switched_to}; tab2 followed in "
         f"{secs_b}s; tab1 active={(s1b['opt'] or {}).get('active')}; "
         f"tab2 active={(s2b['opt'] or {}).get('active')}; tab2 DOM highlight={on_b}; "
         f"tab1 editor announces so far={ed_out}; tab2 editor arrivals={ed_in}; "
         f"tab2 file frames={ob2['file']}", p)

    closed_key = (s1b["opt"] or {}).get("active")
    ci = keys.index(closed_key) if closed_key in keys else 0
    t1.locator(f'[data-instance="{ed}"] .mxed-tab').nth(ci).locator(".mxed-tab-x").click()
    t1.wait_for_timeout(500)
    ok_c, secs_c = wait_until(
        t2, """([id, key]) => { const f = window.MX.grid.frames[id];
          if (!f) return false;
          return !f.getOptions().tabs.some(t => t.key === key); }""",
        [ed, closed_key], timeout=4.0)
    s1c = ed_state(t1, ed)
    s2c = ed_state(t2, ed)
    p = shot(t2, "F1c-editor-close")
    step("F1c", "PASS" if ok_c and len(s2c["dom"] or []) == len(s1c["dom"] or []) else "FAIL",
         f"closed tab {closed_key} in tab1; tab2 dropped it in {secs_c}s; "
         f"tab1 tabs={[t['key'] for t in (s1c['opt'] or {}).get('tabs', [])]}; "
         f"tab2 tabs={[t['key'] for t in (s2c['opt'] or {}).get('tabs', [])]}; "
         f"tab2 DOM tabs={len(s2c['dom'] or [])}", p)

    # ---- F1d extra: an untitled buffer in tab two while tab one changes tabs ----
    made_new = t1.evaluate("""(id) => {
      const el = document.querySelector(`[data-instance="${id}"]`);
      if (!el) return false;
      const b = Array.from(el.querySelectorAll('button')).find(
        x => x.textContent.trim() === 'New');
      if (!b) return false; b.click(); return true; }""", ed)
    if made_new:
        t2.wait_for_timeout(1500)
    made_new2 = t2.evaluate("""(id) => {
      const el = document.querySelector(`[data-instance="${id}"]`);
      if (!el) return false;
      const b = Array.from(el.querySelectorAll('button')).find(
        x => x.textContent.trim() === 'New');
      if (!b) return false; b.click(); return true; }""", ed)
    t2.wait_for_timeout(1200)
    before_untitled = ed_state(t2, ed)
    three = open_file_in(t1, br, 2, "Editor")
    t1.wait_for_timeout(4000)
    after_untitled = ed_state(t2, ed)
    p = shot(t2, "F1d-untitled")
    kept = len(after_untitled["dom"] or []) >= len(before_untitled["dom"] or [])
    step("F1d", "OBSERVED",
         f"tab2 New button pressed={made_new2}; tab2 DOM tabs before tab1 opened "
         f"{three!r}: {len(before_untitled['dom'] or [])}, after: "
         f"{len(after_untitled['dom'] or [])}; untitled tab survived={kept}; "
         f"tab2 tabs now={[d['label'] for d in (after_untitled['dom'] or [])]}", p)

    # ---- F2 browser ----
    root_before = browse_state(t1, br)
    newroot = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Docs/, has nesting
    t1.evaluate("([id, p]) => window.MX.grid.frames[id].setOption('root', p)", [br, newroot])
    t1.wait_for_timeout(3000)
    names = expand_nested(t1, br)
    t1.wait_for_timeout(3000)
    ok2, secs2 = wait_until(
        t2, """([id, root]) => { const f = window.MX.grid.frames[id];
          if (!f) return false; const o = f.getOptions();
          return o.root === root && (o.expanded || []).length >= 2; }""",
        [br, newroot], timeout=6.0)
    b1 = browse_state(t1, br)
    b2 = browse_state(t2, br)
    p = shot(t2, "F2-browser")
    same_root = (b2["opt"] or {}).get("root") == (b1["opt"] or {}).get("root")
    same_exp = sorted((b2["opt"] or {}).get("expanded") or []) == \
        sorted((b1["opt"] or {}).get("expanded") or [])
    step("F2", "PASS" if same_root and same_exp and len(b1["opt"]["expanded"]) >= 2 else "FAIL",
         f"root before={root_before['rootline']!r}; set root={newroot!r} (the folder button "
         f"calls /api/fs/pick, a native OS dialog, so root was set through the widget's own "
         f"option); expanded nested {names} by clicking rows; settled in {secs2}s; "
         f"tab1 root={(b1['opt'] or {}).get('root')!r} expanded={(b1['opt'] or {}).get('expanded')}; "
         f"tab2 root={(b2['opt'] or {}).get('root')!r} expanded={(b2['opt'] or {}).get('expanded')}; "
         f"tab2 rootline={b2['rootline']!r}; tab2 open folders={b2['open']}", p)

    # ---- F3 viewer ----
    vw = H.add_widget(t1, "viewer")
    t1.wait_for_timeout(2500)
    v1 = open_file_in(t1, br, 0, "Viewer")
    t1.wait_for_timeout(1500)
    v2 = open_file_in(t1, br, 1, "Viewer")
    t1.wait_for_timeout(2500)
    ok3a, secs3a = wait_until(
        t2, """(id) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().tabs || []).length >= 2); }""", vw, timeout=5.0)
    vs1 = view_state(t1, vw)
    vs2 = view_state(t2, vw)
    p = shot(t2, "F3a-viewer-two")
    step("F3a", "PASS" if ok3a and (vs2["opt"] or {}).get("tabs") == (vs1["opt"] or {}).get("tabs")
         else "FAIL",
         f"opened {v1!r} and {v2!r} in tab1 viewer {vw}; tab2 in {secs3a}s; "
         f"tab1 tabs={(vs1['opt'] or {}).get('tabs')}; tab2 tabs={(vs2['opt'] or {}).get('tabs')}; "
         f"tab2 DOM tabs={vs2['dom']}", p)

    tabs_now = (vs1["opt"] or {}).get("tabs") or []
    active = (vs1["opt"] or {}).get("path")
    background = next((t for t in tabs_now if t != active), None)
    if background is not None:
        bi = tabs_now.index(background)
        t1.locator(f'[data-instance="{vw}"] .mx-viewer-tab').nth(bi).locator(
            ".mx-viewer-tab-x").click()
    t1.wait_for_timeout(500)
    ok3b, secs3b = wait_until(
        t2, """([id, path]) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().tabs || []).indexOf(path) < 0); }""",
        [vw, background], timeout=5.0)
    vs1b = view_state(t1, vw)
    vs2b = view_state(t2, vw)
    p = shot(t2, "F3b-viewer-close")
    step("F3b", "PASS" if ok3b and (vs2b["opt"] or {}).get("tabs") == (vs1b["opt"] or {}).get("tabs")
         else "FAIL",
         f"closed background tab {background!r} in tab1 (active was {active!r}); tab2 dropped "
         f"it in {secs3b}s; tab1 tabs={(vs1b['opt'] or {}).get('tabs')}; "
         f"tab2 tabs={(vs2b['opt'] or {}).get('tabs')}", p)

    # ---- F4 chat, F5 terminal: both need a live region ----
    used_sid = sid
    if REGIONS == "skip":
        p = shot(t1, "F4-skipped")
        step("F4", "OBSERVED", "run separately as block R to keep this browser session "
             "small; see F4b", p)
        step("F5", "OBSERVED", "run separately as block R; see F5b", p)
        regions = ["skipped"]
    else:
        ch = H.add_widget(t1, "chat")
        t1.wait_for_timeout(3500)
        cs = chat_state(t1, ch)
        regions = cs["regions"] or []
        log(f"[harness] chat roster on {sid}: {regions}")
    if REGIONS != "skip" and not regions:
        p = shot(t1, "F4-no-regions")
        step("F4", "OBSERVED",
             f"session {sid} has no live region: chat roster returned {regions}, picker "
             f"options={cs['pickOptions']}. A region cannot be picked here and terminal "
             f"newTab refuses with 'pick a region first' (terminal.js:167). Retrying on a "
             f"session that has one; see F4b / F5b", p)
        step("F5", "OBSERVED",
             f"blocked for the same reason as F4 on {sid}; see F5b", p)
    elif REGIONS != "skip":
        run_region_steps(t1, t2, ch, sid, "F4", "F5")

    if REGIONS == "auto" and not regions:
        for alt in fallback_sids:
            done = try_regions_on(context, alt, track)
            if done:
                used_sid = alt
                break
        else:
            p = shot(t1, "F4-no-regions")
            step("F4b", "OBSERVED", "no open session had a live region this run", p)
            step("F5b", "OBSERVED", "no open session had a live region this run", p)

    # ---- F6 refresh tab two ----
    t2.wait_for_timeout(3000)
    want = t2.evaluate("() => window.MX.grid.instances.map(i => "
                       "({ id: i.id, type: i.type, options: window.MX.grid.frames[i.id] "
                       "? window.MX.grid.frames[i.id].getOptions() : null }))")
    on_disk = H.disk_widgets(sid, surface) or []
    disk_opts = {w["id"]: w.get("options") for w in on_disk}
    t2.reload(wait_until="load")
    t2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    t2.wait_for_timeout(14000)
    got = t2.evaluate("() => window.MX.grid.instances.map(i => "
                      "({ id: i.id, type: i.type, options: window.MX.grid.frames[i.id] "
                      "? window.MX.grid.frames[i.id].getOptions() : null }))")
    p = shot(t2, "F6-after-reload")
    diffs = []
    wmap = {w["id"]: w for w in want}
    gmap = {w["id"]: w for w in got}
    for wid, w in wmap.items():
        g = gmap.get(wid)
        if not g:
            diffs.append(f"{w['type']} {wid} gone")
            continue
        for key in sorted((w["options"] or {}).keys()):
            a, b = (w["options"] or {}).get(key), (g["options"] or {}).get(key)
            if json.dumps(a, sort_keys=True) != json.dumps(b, sort_keys=True):
                diffs.append(f"{w['type']} {wid}.{key}: {a!r} -> {b!r}")
    for wid in gmap:
        if wid not in wmap:
            diffs.append(f"extra {gmap[wid]['type']} {wid}")
    step("F6", "PASS" if not diffs else "FAIL",
         f"reloaded tab2 and gave it 14s to settle; {len(want)} widgets before, "
         f"{len(got)} after; differences: {diffs if diffs else 'none'}; "
         f"what the surface file {surface}.json held at reload time: {disk_opts}; "
         f"browser in tab2 after the reload: {browse_state(t2, br)}", p)

    # ---- F7 cross surface ----
    t3 = H.open_matrix(context, sid, tag="F-t3")
    t3.on("request", lambda r: track("t3", r))
    s3 = H.add_empty_surface(t3)
    H.close_overlay(t3)
    other_ed = H.add_widget(t3, "editor")
    t3.wait_for_timeout(2500)
    before3 = t3.evaluate("() => window.MX.grid.instances.map(i => "
                          "({ id: i.id, type: i.type, options: window.MX.grid.frames[i.id] "
                          "? window.MX.grid.frames[i.id].getOptions() : null }))")
    open_file_in(t1, br, 0, "Editor")
    t1.wait_for_timeout(1500)
    nudge_widget(t1, ed)
    t1.wait_for_timeout(4000)
    after3 = t3.evaluate("() => window.MX.grid.instances.map(i => "
                         "({ id: i.id, type: i.type, options: window.MX.grid.frames[i.id] "
                         "? window.MX.grid.frames[i.id].getOptions() : null }))")
    leaked = t3.locator(f'[data-instance="{ed}"]').count()
    p = shot(t3, "F7-cross-surface")
    unchanged = json.dumps(before3, sort_keys=True) == json.dumps(after3, sort_keys=True)
    step("F7", "PASS" if unchanged and leaked == 0 else "FAIL",
         f"surface one={surface}, surface three={s3} with editor {other_ed}; after all of "
         f"F1-F5 plus one more open and a move on surface one, surface three "
         f"unchanged={unchanged}; surface-one instance present on surface three={leaked}; "
         f"before={before3}; after={after3}", p)

    # ---- G5 save loop across all of F ----
    mine = [w for w in writes if w[0] >= f_start]
    times = sorted(w[0] for w in mine)
    worst, window = 0, []
    for t0 in times:
        n = [x for x in times if t0 <= x < t0 + 2.0]
        if len(n) > worst:
            worst, window = len(n), n
    p = shot(t1, "G5-writes")
    step("G5", "PASS" if worst <= 3 else "FAIL",
         f"grid-route writes across all of F: {len(mine)}; busiest 2s window held {worst} "
         f"(threshold >3); session used for region steps={used_sid}", p)

    bad = H.errors_since(mark)
    log(f"[harness] block F console errors: {len(bad)}")
    return bad


def run_region_steps(t1, t2, ch, sid, f4, f5):
    """F4 chat region pick, F5 terminal second shell tab and echo."""
    cs = chat_state(t1, ch)
    regions = cs["regions"] or []
    rid = None
    for r in regions:
        if r["id"] != cs["region"]:
            rid = r["id"]
            break
    if rid is None and regions:
        rid = regions[0]["id"]
    t1.locator(f'[data-instance="{ch}"] .cq-pick').select_option(rid)
    t1.wait_for_timeout(3000)
    ok4, secs4 = wait_until(
        t2, """([id, rid]) => { const f = window.MX.grid.frames[id];
          return !!(f && f.options.region === rid); }""", [ch, rid], timeout=5.0)
    c1 = chat_state(t1, ch)
    c2 = chat_state(t2, ch)
    p = shot(t2, f"{f4}-chat-region")
    step(f4, "PASS" if ok4 and c2["region"] == c1["region"] else "FAIL",
         f"session {sid}; roster={regions}; picked {rid!r} in tab1 chat {ch}; tab2 in "
         f"{secs4}s; tab1 region={c1['region']!r} pick={c1['pickValue']!r}; "
         f"tab2 region={c2['region']!r} pick={c2['pickValue']!r}; tab2 head={c2['head']!r}", p)

    tm = H.add_widget(t1, "terminal")
    t1.wait_for_timeout(3500)
    t1.locator(f'[data-instance="{tm}"] .mxtm-region').select_option(rid)
    t1.wait_for_timeout(1000)
    for _ in range(5):
        have = len(term_state(t1, tm)["opt"].get("tabs") or [])
        if have >= 2:
            break
        t1.evaluate("""(id) => { const el = document.querySelector(`[data-instance="${id}"]`);
          const b = Array.from(el.querySelectorAll('button')).find(
            x => x.textContent.trim() === 'New Tab');
          if (b) b.click(); }""", tm)
        t1.wait_for_timeout(3500)
    ok5, secs5 = wait_until(
        t2, """(id) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().tabs || []).length >= 2); }""", tm, timeout=6.0)
    ts1 = term_state(t1, tm)
    ts2 = term_state(t2, tm)
    p = shot(t2, f"{f5}-terminal-tabs")
    step(f5 + "a", "PASS" if ok5 and (ts2["opt"] or {}).get("tabs") == (ts1["opt"] or {}).get("tabs")
         else "FAIL",
         f"opened two shell tabs in tab1 terminal {tm} on region {rid!r}; tab2 in {secs5}s; "
         f"tab1 tabs={(ts1['opt'] or {}).get('tabs')}; tab2 tabs={(ts2['opt'] or {}).get('tabs')}; "
         f"tab2 DOM tabs={ts2['dom']}; tab1 status={ts1['status']!r}", p)

    active = (ts1["opt"] or {}).get("active")
    pane = t1.locator(f'[data-instance="{tm}"] .mxtm-pane:not([hidden])').first
    try:
        pane.click(timeout=8000)
    except Exception as exc:
        log(f"[harness] terminal pane click: {exc}")
    t1.wait_for_timeout(600)
    t1.keyboard.type("echo mirror")
    t1.keyboard.press("Enter")
    t1.wait_for_timeout(4000)
    ts1b = term_state(t1, tm)
    ts2b = term_state(t2, tm)
    p = shot(t2, f"{f5}-terminal-echo")

    def screen_for(state, key):
        for s in (state["screens"] or []):
            if s["key"] == key:
                return s["text"] or ""
        return ""

    in1 = "mirror" in screen_for(ts1b, active)
    in2 = "mirror" in screen_for(ts2b, active)
    step(f5 + "b", "OBSERVED",
         f"typed `echo mirror` into tab1's active shell {active!r}; output reached tab1's "
         f"pane={in1}; the same shell in tab2={in2}; tab2 shells live="
         f"{[(s['key'], s['live']) for s in (ts2b['screens'] or [])]}; "
         f"tab2 tail={screen_for(ts2b, active)[-200:]!r}", p)
    return True


def try_regions_on(context, alt, track):
    """Fallback: run F4/F5 on a session that has a live region. Fenced and swept."""
    H.fence(alt)
    a1 = H.open_matrix(context, alt, tag="F-alt1")
    a1.on("request", lambda r: track("alt1", r))
    H.add_empty_surface(a1)
    H.close_overlay(a1)
    url = a1.url
    a2 = context.new_page()
    H.watch(a2, "F-alt2")
    a2.on("request", lambda r: track("alt2", r))
    a2.goto(url, wait_until="load", timeout=20000)
    a2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid", timeout=15000)
    a2.wait_for_timeout(2500)
    ch = H.add_widget(a1, "chat")
    a1.wait_for_timeout(4000)
    cs = chat_state(a1, ch)
    log(f"[harness] chat roster on {alt}: {cs['regions']}")
    if not cs["regions"]:
        return False
    run_region_steps(a1, a2, ch, alt, "F4b", "F5b")
    return True


# ---------------- block G: quiet fixes ----------------

def block_g(context, sid, other_sid):
    H.fence(sid)
    H.fence(other_sid)
    t1 = H.open_matrix(context, sid, tag="G-t1")
    mark = len(H.CONSOLE)

    # ---- G1 corner line on a new surface, then a rename ----
    made = H.add_empty_surface(t1)
    H.close_overlay(t1)
    t1.wait_for_timeout(1200)
    line = corner(t1)
    name = t1.evaluate("() => window.MX.grid.surfaceName")
    sock = t1.evaluate("() => window.MX.socket.sid()")
    p = shot(t1, "G1a-corner-new-surface")
    want = f"live · {sock} · {name}"
    ok1 = line == want and str(name).startswith("Empty surface")
    step("G1a", "PASS" if ok1 else "FAIL",
         f"added surface {made} from Empty surface; corner reads {line!r}; expected "
         f"{want!r}; grid.surfaceName={name!r} (the counter suffix comes from surfaces "
         f"already named Empty surface in this session)", p)

    H.open_session_window(t1)
    rows = surface_rows_panel(t1)
    myrow = next((r for r in (rows or []) if made in r["text"]), None)
    if myrow is None:
        myrow = next((r for r in (rows or []) if r["text"].startswith(str(name))), None)
    renamed = None
    if myrow and any("Rename" in b for b in myrow["buttons"]):
        try:
            t1.locator(f'.rp2-surfrow[data-rp2="{myrow["i"]}"]').locator(
                "button", has_text="Rename").first.click(timeout=8000)
            t1.wait_for_timeout(900)
            renamed = "redpen-renamed"
            box = t1.locator(".mx-overlay input[type=text]").last
            box.fill(renamed, timeout=8000)
            box.press("Enter")
            t1.wait_for_timeout(3000)
        except Exception as exc:
            log(f"[harness] rename: {exc}")
            renamed = None
    H.close_overlay(t1)
    t1.wait_for_timeout(1200)
    line_after = corner(t1)
    name_after = t1.evaluate("() => window.MX.grid.surfaceName")
    on_disk = next((r.get("name") for r in H.surface_rows(sid) if r["id"] == made), None)
    p = shot(t1, "G1b-corner-after-rename")
    step("G1b", "OBSERVED",
         f"renamed surface {made} to {renamed!r} in the session window; the saved row now "
         f"reads name={on_disk!r}; corner without a reload reads {line_after!r}; "
         f"grid.surfaceName={name_after!r}; corner followed the rename="
         f"{bool(renamed) and renamed in (line_after or '')}"
         + ("" if myrow else f"; no Rename button found, rows={rows}"), p)

    # ---- G2 save failure shows unsaved ----
    grid_writes_probe(t1)
    w = H.add_widget(t1, "editor")
    t1.wait_for_timeout(2500)
    reset_attempts(t1)
    set_fetch_mode(t1, "fail")
    nudge_widget(t1, w)
    ok2, secs2 = wait_until(
        t1, "() => (document.getElementById('mxState').textContent || '').endsWith('unsaved')",
        None, timeout=3.5, poll=0.15)
    fail_line = corner(t1)
    tries = attempts(t1)
    p = shot(t1, "G2a-unsaved")
    step("G2a", "PASS" if ok2 else "FAIL",
         f"window.fetch made to reject every PUT to the grid route, then moved widget {w}; "
         f"corner reached {fail_line!r} after {secs2}s (threshold 3s); PUT attempts made "
         f"inside the page={tries}; grid.saveFailed="
         f"{t1.evaluate('() => window.MX.grid.saveFailed')}", p)

    set_fetch_mode(t1, "off")
    nudge_widget(t1, w)
    ok2b, secs2b = wait_until(
        t1, "() => !(document.getElementById('mxState').textContent || '').endsWith('unsaved')",
        None, timeout=4.0, poll=0.15)
    clear_line = corner(t1)
    p = shot(t1, "G2b-unsaved-cleared")
    step("G2b", "PASS" if ok2b else "FAIL",
         f"fetch restored and the widget moved again; corner cleared in {secs2b}s and reads "
         f"{clear_line!r}; grid.saveFailed="
         f"{t1.evaluate('() => window.MX.grid.saveFailed')}", p)

    # ---- G3 save retry: fail once, pass on the retry ----
    net = []
    t1.on("request", lambda r: net.append((time.time(), r.method, r.url))
          if r.method in ("PUT", "POST") and "/api/grid/" in r.url else None)
    t1.wait_for_timeout(2500)
    reset_attempts(t1)
    net.clear()
    set_fetch_mode(t1, "once")
    t0 = time.time()
    nudge_widget(t1, w)
    seen = sample_corner(t1, seconds=5.0, poll=0.2)
    tries3 = attempts(t1)
    net3 = [n for n in net if n[0] >= t0]
    set_fetch_mode(t1, "off")
    p = shot(t1, "G3-retry")
    ever_unsaved = [s for s in seen if s and s.endswith("unsaved")]
    step("G3", "PASS" if tries3 == 2 and not ever_unsaved else "FAIL",
         f"fetch set to reject the first grid PUT then pass; moved widget {w}; PUT attempts "
         f"inside the page={tries3} (want exactly 2); requests that actually left the "
         f"browser={len(net3)}; corner sampled {len(seen)} times over 5s, distinct values="
         f"{sorted(set(x for x in seen if x))}; ever showed unsaved={bool(ever_unsaved)}", p)

    # ---- G4 socket goodbye on a session switch ----
    H.add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    had = t1.evaluate("() => window.MX.grid.instances.length")
    sock_mark = len(H.CONSOLE)
    H.open_session_window(t1)
    info = H.panel_map(t1)
    srows = (info or {}).get("sessions") or []
    sidx = next((r["i"] for r in srows if other_sid in r["label"]), None)
    if sidx is None:
        sidx = next((r["i"] for r in srows if "Switch" in r["buttons"]), None)
    switched = None
    if sidx is not None:
        switched = srows[sidx]["label"]
        t1.locator(f'.rp2-sessrow[data-rp-idx="{sidx}"], .rp-sessrow[data-rp-idx="{sidx}"]'
                   ).locator("button", has_text="Switch").first.click()
        t1.wait_for_timeout(4000)
    sock_errs = [c for c in H.CONSOLE[sock_mark:]
                 if ("WebSocket" in c or "ws/ade" in c)
                 and (":console:error]" in c or "pageerror]" in c or "requestfailed]" in c)]
    after_calls = {}
    for path in ("/api/sessions/open", f"/api/grid/{sid}", f"/api/grid/{other_sid}"):
        try:
            body = json.dumps(H.api(path))[:200]
            after_calls[path] = ("ok", body)
        except Exception as exc:
            after_calls[path] = ("threw", str(exc))
    traceback_seen = any("Traceback" in str(v) for v in after_calls.values())
    p = shot(t1, "G4-socket-goodbye")
    step("G4", "PASS" if switched and not sock_errs and not traceback_seen else
         ("FAIL" if switched else "OBSERVED"),
         f"bound tab on {sid} held {had} widgets, switched to {switched!r}; websocket "
         f"console errors during the switch={sock_errs if sock_errs else 'none'}; API calls "
         f"after the switch all answered without a traceback={not traceback_seen}; "
         f"{ {k: v[0] for k, v in after_calls.items()} }", p)

    bad = H.errors_since(mark)
    log(f"[harness] block G console errors: {len(bad)}")
    return bad


def block_r(context, sid, others):
    """Only the two steps that need a live region: F4b chat, F5b terminal."""
    writes = []

    def track(tag, r):
        if r.method in ("PUT", "POST") and "/api/grid/" in r.url:
            writes.append((time.time(), tag, r.method, r.url))

    for alt in [sid] + list(others):
        if try_regions_on(context, alt, track):
            return []
    step("F4b", "OBSERVED", "no open session had a live region this run", "")
    step("F5b", "OBSERVED", "no open session had a live region this run", "")
    return []


def main():
    global REGIONS
    ap = argparse.ArgumentParser()
    ap.add_argument("--block", required=True)
    ap.add_argument("--regions", default="auto")
    ap.add_argument("--session", default=None)
    ap.add_argument("--other", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    ap.add_argument("--no-sweep", action="store_true")
    args = ap.parse_args()
    REGIONS = args.regions
    H.OUT = args.out
    os.makedirs(H.OUT, exist_ok=True)

    rows = H.api("/api/sessions/open").get("list") or []
    sid = args.session or (rows[0]["id"] if rows else None)
    others = [r["id"] for r in rows if r["id"] != sid]
    other = args.other or (others[0] if others else None)
    print(f"session {sid}  other {other}  fallbacks {others}", flush=True)
    log(f"[harness] session {sid} other {other} fallbacks {others}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        try:
            if args.block == "F":
                block_f(context, sid, others)
            elif args.block == "R":
                block_r(context, sid, others)
            elif args.block == "G":
                block_g(context, sid, other)
            else:
                print(f"unknown block {args.block}")
        except Exception:
            import traceback
            H.CONSOLE.append("[harness] " + traceback.format_exc())
            print("HARNESS THREW:", traceback.format_exc(), flush=True)
        time.sleep(max(0, args.hold))
        browser.close()

    if not args.no_sweep:
        H.sweep()
    cp = os.path.join(H.OUT, f"console-{args.block}.txt")
    with open(cp, "w") as f:
        f.write("\n".join(H.CONSOLE) + "\n")
    rp = os.path.join(H.OUT, f"results-{args.block}.txt")
    with open(rp, "w") as f:
        f.write(f"session {sid} other {other}\n" + "\n".join(H.RESULTS) + "\n")
    print(f"wrote {rp}\nwrote {cp}")
    sys.exit(0)


if __name__ == "__main__":
    main()
