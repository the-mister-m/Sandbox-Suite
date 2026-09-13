"""Headed Playwright harness: Phase 0 Code Canvas port, last once-over.

Report only. Block H reruns the six lines the third redpen failed or
observed, after Sonnet 5's ordering fixes. Block I is one full mirror
regression pass. Block J tallies the console dumps H and I left behind.

Usage:
    python3 Docs/tests/phase0_onceover.py --block H --out Docs/Reports/phase0-onceover
    python3 Docs/tests/phase0_onceover.py --block I --out Docs/Reports/phase0-onceover
    python3 Docs/tests/phase0_onceover.py --block J --out Docs/Reports/phase0-onceover

Session: first row of GET /api/sessions/open unless --session is given.
The brief wants one with a live region so chat and terminal can run.
Fence, sweep, helpers and widget readers come from phase0_rerun.py and
phase0_rerun2.py; nothing is copied.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import phase0_rerun as H            # noqa: E402  fence, sweep, helpers
import phase0_rerun2 as R           # noqa: E402  widget readers, drivers
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = H.BASE
TYPED = "abcdefghij0123456789"      # twenty characters


def log(line):
    H.CONSOLE.append(f"{H.stamp()} {line}")


def step(num, status, note, shot_path):
    H.step(num, status, note, shot_path)


def instances(page):
    return page.evaluate("""() => window.MX.grid.instances.map(i => ({
        id: i.id, type: i.type, slot: i.slot }))""")


def slot_of(page, inst):
    return page.evaluate("""(id) => { const i = window.MX.grid.instances.find(
        x => x.id === id); return i ? i.slot : null; }""", inst)


def resize_widget(page, inst):
    """Grow a widget one column and one row: where a resize drag ends."""
    return page.evaluate("""(id) => {
      const g = window.MX.grid;
      const i = g.instances.find(x => x.id === id);
      if (!i) return null;
      const maxW = g.cols - i.slot.col + 1;
      const maxH = g.rows - i.slot.row + 1;
      i.slot.w = i.slot.w + 1 <= maxW ? i.slot.w + 1 : Math.max(1, i.slot.w - 1);
      i.slot.h = i.slot.h + 1 <= maxH ? i.slot.h + 1 : Math.max(1, i.slot.h - 1);
      g.render(); g.save(); g._announce();
      return i.slot;
    }""", inst)


def two_tabs(context, sid, tag):
    """One surface of our own, two tabs on it, both watched."""
    t1 = H.open_matrix(context, sid, tag=f"{tag}-t1")
    surface = H.add_empty_surface(t1)
    H.close_overlay(t1)
    url = t1.url
    t2 = context.new_page()
    H.watch(t2, f"{tag}-t2")
    t2.goto(url, wait_until="load", timeout=20000)
    t2.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                         timeout=15000)
    t2.wait_for_timeout(2500)
    log(f"[harness] {tag} surface={surface} url={url} "
        f"t1={R.tab_id(t1)} t2={R.tab_id(t2)}")
    return t1, t2, surface, url


def settle_reload(page, seconds=14):
    page.reload(wait_until="load")
    page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                           timeout=15000)
    page.wait_for_timeout(int(seconds * 1000))


# ---------------- block H: the six lines, rerun ----------------

def block_h(context, sid, other_sid):
    H.fence(sid)
    if other_sid:
        H.fence(other_sid)
    t1, t2, surface, url = two_tabs(context, sid, "H")
    mark = len(H.CONSOLE)
    R.observe(t1)
    R.observe(t2)

    br = H.add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    ed = H.add_widget(t1, "editor")
    t1.wait_for_timeout(3000)
    docs = os.path.dirname(os.path.abspath(__file__))          # Docs/tests
    root = os.path.dirname(docs)                               # Docs, has nesting
    t1.evaluate("([id, p]) => window.MX.grid.frames[id].setOption('root', p)", [br, root])
    t1.wait_for_timeout(3000)
    H.expand_first_dir(t1, br)          # so more than one file row is in reach
    t1.wait_for_timeout(2000)

    # ---- H1: browser right-click open reaches tab two in three seconds ----
    one = R.open_file_in(t1, br, 0, "Editor")
    ok1, secs1 = R.wait_until(
        t2, """(id) => { const f = window.MX.grid.frames[id];
          if (!f) return false; const o = f.getOptions();
          return !!(o && o.tabs && o.tabs.length); }""", ed, timeout=3.0)
    e1 = R.ed_state(t1, ed)
    e2 = R.ed_state(t2, ed)
    ob1 = R.observed(t1)
    log(f"[obs] H1 t1 dirty={ob1['dirty']}")
    log(f"[obs] H1 t1 mirror-out={ob1['mirror']}")
    p = R.shot(t2, "H1-editor-open")
    paths1 = [t.get("path") for t in (e1["opt"] or {}).get("tabs", [])]
    paths2 = [t.get("path") for t in (e2["opt"] or {}).get("tabs", [])]
    step("H1", "PASS" if ok1 and paths1 == paths2 and (e2["dom"] or []) else "FAIL",
         f"opened {one!r} in tab1 through the browser right-click; tab2 showed it in "
         f"{secs1}s (threshold 3s); tab1 tabs={paths1}; tab2 tabs={paths2}; "
         f"tab2 DOM tabs={e2['dom']}; tab1 markDirty calls={ob1['dirty']}", p)

    # ---- H2: active tab carries and stays carried for five seconds ----
    # read-only tap: every frame the editor module is handed, every remote
    # option set, and the tab count either side of each
    t1.evaluate("""(id) => {
      const f = window.MX.grid.frames[id];
      const mod = window.MX.widgetModule('editor');
      const rec = window.__rpEd = [];
      const t0 = Date.now();
      const count = () => { try { return (f.getOptions().tabs || []).length; }
                            catch (e) { return 'ERR'; } };
      const of = mod.onFrame;
      mod.onFrame = function (fr, msg) {
        const before = count(); let err = null;
        try { of.call(mod, fr, msg); }
        catch (e) { err = String(e && e.stack ? e.stack.split('\\n')[0] : e); }
        rec.push({ at: Date.now() - t0, kind: 'onFrame', type: msg.type,
                   path: msg.path, before: before, after: count(), err: err });
      };
      const ao = f.applyOptions.bind(f);
      f.applyOptions = function (o) {
        const before = count();
        ao(o);
        rec.push({ at: Date.now() - t0, kind: 'applyOptions',
                   incoming: o && o.tabs ? o.tabs.length : null,
                   before: before, after: count() });
      };
    }""", ed)
    two = R.open_file_in(t1, br, 1, "Editor")
    timeline = []
    t0 = time.time()
    while time.time() - t0 < 6.0:
        timeline.append((round(time.time() - t0, 1), t1.evaluate(
            "(id) => { const f = window.MX.grid.frames[id];"
            " return f ? (f.getOptions().tabs || []).length : null; }", ed)))
        t1.wait_for_timeout(400)
    counts = [c for _, c in timeline]
    log(f"[obs] H2 tab1 editor tab-count timeline={timeline}")
    ob1h2 = R.observed(t1)
    ob2h2 = R.observed(t2)
    in1 = [(m["at"], len(m["tabs"] or [])) for m in ob1h2["mirror"] if m["id"] == ed]
    in2 = [(m["at"], len(m["tabs"] or [])) for m in ob2h2["mirror"] if m["id"] == ed]
    files1 = ob1h2["file"]
    log(f"[obs] H2 t1 socket file frames={files1}")
    log(f"[obs] H2 t1 surface.widget for editor (own + arriving)={in1}")
    log(f"[obs] H2 t2 surface.widget for editor={in2}")
    s1 = R.ed_state(t1, ed)
    keys = [t.get("key") for t in (s1["opt"] or {}).get("tabs", [])]
    target = None
    if len(keys) >= 2:
        target = keys[0] if (s1["opt"] or {}).get("active") != keys[0] else keys[1]
        t1.locator(f'[data-instance="{ed}"] .mxed-tab').nth(keys.index(target)).click()
        t1.wait_for_timeout(2500)
    ok2, secs2 = R.wait_until(
        t2, """([id, key]) => { const f = window.MX.grid.frames[id];
          return !!(f && f.getOptions().active === key); }""",
        [ed, target], timeout=4.0) if target else (False, 0)
    held = []
    t0 = time.time()
    while time.time() - t0 < 5.0:
        held.append(t2.evaluate(
            "(id) => { const f = window.MX.grid.frames[id];"
            " return f ? f.getOptions().active : null; }", ed))
        t2.wait_for_timeout(400)
    s1b = R.ed_state(t1, ed)
    s2b = R.ed_state(t2, ed)
    p = R.shot(t2, "H2-editor-active")
    stayed = bool(held) and all(h == target for h in held)
    on2 = [d["label"] for d in (s2b["dom"] or []) if d["on"]]
    on1 = [d["label"] for d in (s1b["dom"] or []) if d["on"]]
    step("H2", "PASS" if ok2 and stayed else "FAIL",
         f"second file {two!r}; tab1 switched active to {target}; tab2 followed in "
         f"{secs2}s; tab2 active sampled {len(held)} times over 5s, distinct="
         f"{sorted(set(str(h) for h in held))}; held for the whole five seconds="
         f"{stayed}; tab1 active={(s1b['opt'] or {}).get('active')} highlight={on1}; "
         f"tab2 active={(s2b['opt'] or {}).get('active')} highlight={on2}; "
         f"tab1 editor tab-count over the 6s after the open={counts}; "
         f"surface.widget frames for the editor seen by tab1 (at ms, tab count)={in1}; "
         f"seen by tab2={in2}; file frames the server sent tab1={files1}; "
         f"editor delivery tap on tab1={t1.evaluate('() => window.__rpEd')}", p)

    # ---- H7: two widgets changed inside two seconds ----
    R.observe(t2)
    ed_before = [t.get("path") for t in (R.ed_state(t2, ed)["opt"] or {}).get("tabs", [])]
    br_before = (R.browse_state(t2, br)["opt"] or {}).get("expanded") or []
    t7 = time.time()
    three = None
    for idx in (2, 1, 0):
        three = R.open_file_in(t1, br, idx, "Editor")
        if three:
            break
    rows = t1.evaluate(R.VISIBLE_ROWS, br)
    closed = [r for r in rows if r["chev"] == "\u25b8" and r["shown"]]
    folder = None
    if closed:
        folder = closed[0]["name"]
        try:
            t1.locator(f'[data-instance="{br}"] .mx-browser-row').nth(
                closed[0]["i"]).click(timeout=6000)
        except Exception as exc:
            log(f"[harness] H7 expand click: {exc}")
            folder = None
    gap = round(time.time() - t7, 2)
    ok7e, secs7e = R.wait_until(
        t2, """([id, n]) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().tabs || []).length >= n); }""",
        [ed, len(ed_before) + 1], timeout=8.0)
    ok7b, secs7b = R.wait_until(
        t2, """([id, n]) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().expanded || []).length >= n); }""",
        [br, len(br_before) + 1], timeout=8.0)
    e7a = R.ed_state(t1, ed)
    e7b = R.ed_state(t2, ed)
    b7a = R.browse_state(t1, br)
    b7b = R.browse_state(t2, br)
    ob2 = R.observed(t2)
    ids_in = sorted(set(m["id"] for m in ob2["mirror"] if m["id"] in (ed, br)))
    p = R.shot(t2, "H7-two-widgets")
    same_ed = [t.get("path") for t in (e7b["opt"] or {}).get("tabs", [])] == \
        [t.get("path") for t in (e7a["opt"] or {}).get("tabs", [])]
    same_br = sorted((b7b["opt"] or {}).get("expanded") or []) == \
        sorted((b7a["opt"] or {}).get("expanded") or [])
    step("H7", "PASS" if ok7e and ok7b and same_ed and same_br else "FAIL",
         f"inside {gap}s tab1 opened {three!r} in the editor and expanded {folder!r} in the "
         f"browser; tab2 editor followed={ok7e} ({secs7e}s), browser followed={ok7b} "
         f"({secs7b}s); tab2 mirror frames arrived for={ids_in} (editor={ed}, browser={br}); "
         f"tab1 editor tabs={[t.get('path') for t in (e7a['opt'] or {}).get('tabs', [])]}; "
         f"tab2 editor tabs={[t.get('path') for t in (e7b['opt'] or {}).get('tabs', [])]}; "
         f"tab1 expanded={(b7a['opt'] or {}).get('expanded')}; "
         f"tab2 expanded={(b7b['opt'] or {}).get('expanded')}", p)

    # ---- H3a: untitled buffer travels with its text ----
    made = t1.evaluate("""(id) => {
      const el = document.querySelector(`[data-instance="${id}"]`);
      if (!el) return false;
      const b = Array.from(el.querySelectorAll('button')).find(
        x => x.textContent.trim() === 'New');
      if (!b) return false; b.click(); return true; }""", ed)
    t1.wait_for_timeout(1200)
    try:
        t1.locator(f'[data-instance="{ed}"] .monaco-editor').first.click(timeout=8000)
    except Exception as exc:
        log(f"[harness] H3 monaco click: {exc}")
    t1.wait_for_timeout(400)
    t1.keyboard.type(TYPED, delay=25)
    t1.wait_for_timeout(3000)
    u1 = R.ed_state(t1, ed)
    u2 = R.ed_state(t2, ed)

    def untitled(state):
        return [t for t in (state["opt"] or {}).get("tabs", []) if t.get("untitled")]

    before = untitled(u2)
    p = R.shot(t2, "H3a-untitled-mirror")
    ok3a = bool(before) and any(t.get("text") == TYPED for t in before)
    step("H3a", "PASS" if ok3a else "FAIL",
         f"New pressed in tab1={made}; typed {len(TYPED)} characters {TYPED!r}; waited 3s; "
         f"tab1 untitled tabs={untitled(u1)}; tab2 untitled tabs={before}; "
         f"tab1 active={(u1['opt'] or {}).get('active')}; "
         f"tab2 active={(u2['opt'] or {}).get('active')}; tab2 DOM tabs="
         f"{[d['label'] for d in (u2['dom'] or [])]}", p)

    # ---- H4 setup: a second nested folder, mirrored live before any reload ----
    names = R.expand_nested(t1, br)
    t1.wait_for_timeout(3000)
    okx, secsx = R.wait_until(
        t2, """([id, root]) => { const f = window.MX.grid.frames[id];
          if (!f) return false; const o = f.getOptions();
          return o.root === root && (o.expanded || []).length >= 2; }""",
        [br, root], timeout=8.0)
    b1 = R.browse_state(t1, br)
    b2pre = R.browse_state(t2, br)
    on_disk = {w["id"]: w.get("options") for w in (H.disk_widgets(sid, surface) or [])}
    log(f"[harness] H4 disk before reload: {on_disk}")

    # ---- one reload of tab two answers H3b and H4 ----
    settle_reload(t2, 14)
    u2r = R.ed_state(t2, ed)
    after = untitled(u2r)
    p = R.shot(t2, "H3b-untitled-after-reload")
    ok3b = bool(after) and any(t.get("text") == TYPED for t in after)
    step("H3b", "PASS" if ok3b else "FAIL",
         f"reloaded tab2 and gave it 14s; untitled tabs back={after}; text survived="
         f"{ok3b}; tab2 DOM tabs={[d['label'] for d in (u2r['dom'] or [])]}; "
         f"tab2 all tabs={(u2r['opt'] or {}).get('tabs')}", p)

    b2 = R.browse_state(t2, br)
    p = R.shot(t2, "H4-browser-after-reload")
    ok4 = (bool(b2["rows"]) and bool(b2["nodes"])
           and len((b2["opt"] or {}).get("expanded") or []) >= 2)
    step("H4", "PASS" if ok4 else "FAIL",
         f"root={root!r}, nested folders expanded in tab1={names}, mirrored live to tab2 "
         f"before the reload={okx} ({secsx}s, tab2 expanded then="
         f"{(b2pre['opt'] or {}).get('expanded')}); reloaded tab2 and gave it 14s; "
         f"tab2 rows={b2['rows']} nodes={b2['nodes']} "
         f"expanded={(b2['opt'] or {}).get('expanded')} rootline={b2['rootline']!r} "
         f"open folders={b2['open']} expandedWant={b2['want']}; tab1 expanded="
         f"{(b1['opt'] or {}).get('expanded')}; surface file before the reload held "
         f"{on_disk.get(br)}", p)

    # ---- H4b: if the tree never came, ask again by hand and see what answers ----
    sock_state = t2.evaluate("() => window.MX.socket.state()")
    retry = None
    if not b2["rows"]:
        t2.evaluate("""([id, p]) => { const f = window.MX.grid.frames[id];
          if (f && f._browserHooks) f._browserHooks.setRoot(p); }""", [br, root])
        t2.wait_for_timeout(4000)
        retry = R.browse_state(t2, br)
    p = R.shot(t2, "H4b-browser-retry")
    step("H4b", "OBSERVED",
         f"tab2 socket state after the reload={sock_state!r}; the same setRoot({root!r}) "
         f"called by hand once the page had settled returned rows="
         f"{(retry or {}).get('rows')} nodes={(retry or {}).get('nodes')} "
         f"(not run if the reload had already filled the tree); "
         f"tab2 browser options after the retry={(retry or {}).get('opt')}", p)

    # ---- H5: rename reaches both corners with no reload ----
    boot1, boot2 = R.tab_id(t1), R.tab_id(t2)
    H.open_session_window(t1)
    rows = R.surface_rows_panel(t1)
    myrow = next((r for r in (rows or []) if surface in r["text"]), None)
    if myrow is None:
        nm = t1.evaluate("() => window.MX.grid.surfaceName")
        myrow = next((r for r in (rows or []) if r["text"].startswith(str(nm))), None)
    renamed = None
    if myrow and any("Rename" in b for b in myrow["buttons"]):
        try:
            t1.locator(f'.rp2-surfrow[data-rp2="{myrow["i"]}"]').locator(
                "button", has_text="Rename").first.click(timeout=8000)
            t1.wait_for_timeout(900)
            renamed = "redpen-onceover"
            box = t1.locator(".mx-overlay input[type=text]").last
            box.fill(renamed, timeout=8000)
            box.press("Enter")
            t1.wait_for_timeout(3000)
        except Exception as exc:
            log(f"[harness] H5 rename: {exc}")
            renamed = None
    H.close_overlay(t1)
    t1.wait_for_timeout(1200)
    ok5b, secs5b = R.wait_until(
        t2, "(n) => (document.getElementById('mxState').textContent || '').indexOf(n) >= 0",
        renamed, timeout=8.0) if renamed else (False, 0)
    c1 = R.corner(t1)
    c2 = R.corner(t2)
    disk_name = next((r.get("name") for r in H.surface_rows(sid) if r["id"] == surface), None)
    p = R.shot(t2, "H5-rename-corners")
    no_reload = R.tab_id(t1) == boot1 and R.tab_id(t2) == boot2
    ok5 = bool(renamed) and renamed in (c1 or "") and renamed in (c2 or "") and no_reload
    step("H5", "PASS" if ok5 else "FAIL",
         f"renamed surface {surface} to {renamed!r} in tab1's session window; saved row "
         f"name={disk_name!r}; tab1 corner={c1!r}; tab2 corner={c2!r} (followed in "
         f"{secs5b}s); neither tab reloaded={no_reload}; tab1 grid.surfaceName="
         f"{t1.evaluate('() => window.MX.grid.surfaceName')!r}; tab2 grid.surfaceName="
         f"{t2.evaluate('() => window.MX.grid.surfaceName')!r}", p)

    # ---- H6: session switch in a bound tab, no WebSocket line at all ----
    t4 = context.new_page()
    H.watch(t4, "H-switch")
    t4.goto(url, wait_until="load", timeout=20000)
    t4.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                         timeout=15000)
    t4.wait_for_timeout(3000)
    had = t4.evaluate("() => window.MX.grid.instances.length")
    sock_mark = len(H.CONSOLE)
    H.open_session_window(t4)
    info = H.panel_map(t4)
    srows = (info or {}).get("sessions") or []
    sidx = next((r["i"] for r in srows if other_sid and other_sid in r["label"]), None)
    if sidx is None:
        sidx = next((r["i"] for r in srows if "Switch" in r["buttons"]), None)
    switched = None
    if sidx is not None:
        switched = srows[sidx]["label"]
        t4.locator(f'.rp-sessrow[data-rp-idx="{sidx}"]').locator(
            "button", has_text="Switch").first.click()
        t4.wait_for_timeout(6000)
    H.close_overlay(t4)
    ws_lines = [c for c in H.CONSOLE[sock_mark:]
                if "H-switch" in c and ("WebSocket" in c or "ws/ade" in c)]
    after_calls = {}
    for path in ("/api/sessions/open", f"/api/grid/{sid}"):
        try:
            H.api(path)
            after_calls[path] = "ok"
        except Exception as exc:
            after_calls[path] = f"threw {exc}"
    p = R.shot(t4, "H6-session-switch")
    step("H6", "PASS" if switched and not ws_lines else ("FAIL" if switched else "OBSERVED"),
         f"fresh tab bound to {sid} held {had} widgets, switched to {switched!r}; console "
         f"lines mentioning WebSocket or ws/ade on that tab, any type="
         f"{ws_lines if ws_lines else 'none'}; API after the switch={after_calls}", p)

    bad = H.errors_since(mark)
    log(f"[harness] block H console errors: {len(bad)}")
    return bad


# ---------------- block I: mirror regression, one pass ----------------

def block_i(context, sid):
    H.fence(sid)
    t1, t2, surface, url = two_tabs(context, sid, "I")
    mark = len(H.CONSOLE)

    # ---- I1 add ----
    vw = H.add_widget(t1, "viewer")
    t1.wait_for_timeout(1500)
    ok1, secs1 = R.wait_until(
        t2, "(id) => window.MX.grid.instances.some(i => i.id === id)", vw, timeout=6.0)
    p = R.shot(t2, "I1-add")
    step("I1", "PASS" if ok1 else "FAIL",
         f"added viewer {vw} in tab1; tab2 showed it in {secs1}s; "
         f"tab2 instances={instances(t2)}", p)

    # ---- I2 move ----
    R.nudge_widget(t1, vw)
    t1.wait_for_timeout(1500)
    want = slot_of(t1, vw)
    ok2, secs2 = R.wait_until(
        t2, """([id, s]) => { const i = window.MX.grid.instances.find(x => x.id === id);
          return !!(i && i.slot.col === s.col && i.slot.row === s.row); }""",
        [vw, want], timeout=6.0)
    p = R.shot(t2, "I2-move")
    step("I2", "PASS" if ok2 else "FAIL",
         f"moved {vw} one column in tab1 to {want}; tab2 matched in {secs2}s; "
         f"tab2 slot={slot_of(t2, vw)}", p)

    # ---- I3 resize ----
    want3 = resize_widget(t1, vw)
    t1.wait_for_timeout(1500)
    ok3, secs3 = R.wait_until(
        t2, """([id, s]) => { const i = window.MX.grid.instances.find(x => x.id === id);
          return !!(i && i.slot.w === s.w && i.slot.h === s.h); }""",
        [vw, want3], timeout=6.0)
    p = R.shot(t2, "I3-resize")
    step("I3", "PASS" if ok3 else "FAIL",
         f"resized {vw} in tab1 to {want3}; tab2 matched in {secs3}s; "
         f"tab2 slot={slot_of(t2, vw)}", p)

    # ---- I4 close ----
    t1.evaluate("(id) => window.MX.grid.removeWidget(id)", vw)
    t1.wait_for_timeout(1200)
    ok4, secs4 = R.wait_until(
        t2, "(id) => !window.MX.grid.instances.some(i => i.id === id)", vw, timeout=6.0)
    p = R.shot(t2, "I4-close")
    step("I4", "PASS" if ok4 else "FAIL",
         f"closed {vw} in tab1; tab2 dropped it in {secs4}s; "
         f"tab2 instances={instances(t2)}", p)

    # ---- I5 viewer two files then close one ----
    br = H.add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    t1.evaluate("([id, p]) => window.MX.grid.frames[id].setOption('root', p)", [br, root])
    t1.wait_for_timeout(2500)
    H.expand_first_dir(t1, br)
    vw2 = H.add_widget(t1, "viewer")
    t1.wait_for_timeout(2000)
    v1 = R.open_file_in(t1, br, 0, "Viewer")
    t1.wait_for_timeout(1200)
    v2 = R.open_file_in(t1, br, 1, "Viewer")
    t1.wait_for_timeout(2000)
    ok5a, secs5a = R.wait_until(
        t2, "(id) => { const f = window.MX.grid.frames[id];"
            " return !!(f && (f.getOptions().tabs || []).length >= 2); }", vw2, timeout=6.0)
    vs1 = R.view_state(t1, vw2)
    vs2 = R.view_state(t2, vw2)
    p = R.shot(t2, "I5a-viewer-two")
    step("I5a", "PASS" if ok5a and (vs2["opt"] or {}).get("tabs") == (vs1["opt"] or {}).get("tabs")
         else "FAIL",
         f"opened {v1!r} and {v2!r} in tab1 viewer {vw2}; tab2 in {secs5a}s; "
         f"tab1 tabs={(vs1['opt'] or {}).get('tabs')}; "
         f"tab2 tabs={(vs2['opt'] or {}).get('tabs')}", p)

    tabs_now = (vs1["opt"] or {}).get("tabs") or []
    active = (vs1["opt"] or {}).get("path")
    background = next((t for t in tabs_now if t != active), None)
    if background is not None:
        t1.locator(f'[data-instance="{vw2}"] .mx-viewer-tab').nth(
            tabs_now.index(background)).locator(".mx-viewer-tab-x").click()
    t1.wait_for_timeout(800)
    ok5b, secs5b = R.wait_until(
        t2, """([id, path]) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().tabs || []).indexOf(path) < 0); }""",
        [vw2, background], timeout=6.0)
    vs1b = R.view_state(t1, vw2)
    vs2b = R.view_state(t2, vw2)
    p = R.shot(t2, "I5b-viewer-close")
    step("I5b", "PASS" if ok5b and (vs2b["opt"] or {}).get("tabs")
         == (vs1b["opt"] or {}).get("tabs") else "FAIL",
         f"closed background tab {background!r} in tab1; tab2 dropped it in {secs5b}s; "
         f"tab1 tabs={(vs1b['opt'] or {}).get('tabs')}; "
         f"tab2 tabs={(vs2b['opt'] or {}).get('tabs')}", p)

    # ---- I6 chat region, I7 terminal second shell ----
    ch = H.add_widget(t1, "chat")
    t1.wait_for_timeout(4000)
    cs = R.chat_state(t1, ch)
    log(f"[harness] chat roster on {sid}: {cs['regions']}")
    if cs["regions"]:
        R.run_region_steps(t1, t2, ch, sid, "I6", "I7")
    else:
        p = R.shot(t1, "I6-no-regions")
        step("I6", "OBSERVED", f"session {sid} roster came back {cs['regions']}, no region "
             f"to pick; picker options={cs['pickOptions']}", p)
        step("I7", "OBSERVED", f"blocked for the same reason as I6 on {sid}", p)

    bad = H.errors_since(mark)
    log(f"[harness] block I console errors: {len(bad)}")
    return bad


# ---------------- block J: console across H and I ----------------

def block_j(out):
    tally = {}
    lines = []
    for block in ("H", "I"):
        path = os.path.join(out, f"console-{block}.txt")
        try:
            with open(path) as f:
                body = f.read().splitlines()
        except Exception as exc:
            tally[block] = f"missing ({exc})"
            continue
        errs = [x for x in body if ":console:error]" in x]
        perr = [x for x in body if "pageerror]" in x]
        rfail = [x for x in body if "requestfailed]" in x]
        fav = [x for x in body if "favicon" in x]
        ws = [x for x in body if "WebSocket" in x or "ws/ade" in x]
        tally[block] = {"errors": len(errs), "pageerrors": len(perr),
                        "requestfailed": len(rfail), "favicon": len(fav),
                        "websocket": len(ws)}
        lines.extend(errs + perr + rfail + fav + ws)
    clean = all(isinstance(v, dict) and v["errors"] == 0 and v["pageerrors"] == 0
                for v in tally.values()) and len(tally) == 2
    dump = os.path.join(out, "console-J.txt")
    with open(dump, "w") as f:
        f.write(f"tally {json.dumps(tally, indent=2)}\n\n" + "\n".join(lines) + "\n")
    step("J", "PASS" if clean else "FAIL",
         f"across blocks H and I: {json.dumps(tally)}; every line of interest copied into "
         f"the dump", dump)
    return dump


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--block", required=True)
    ap.add_argument("--session", default=None)
    ap.add_argument("--other", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    ap.add_argument("--no-sweep", action="store_true")
    args = ap.parse_args()
    H.OUT = args.out
    R.REGIONS = "auto"
    os.makedirs(H.OUT, exist_ok=True)

    if args.block == "J":
        block_j(H.OUT)
        rp = os.path.join(H.OUT, "results-J.txt")
        with open(rp, "w") as f:
            f.write("\n".join(H.RESULTS) + "\n")
        print(f"wrote {rp}")
        sys.exit(0)

    rows = H.api("/api/sessions/open").get("list") or []
    sid = args.session or (rows[0]["id"] if rows else None)
    others = [r["id"] for r in rows if r["id"] != sid]
    other = args.other or (others[0] if others else None)
    print(f"session {sid}  other {other}", flush=True)
    log(f"[harness] block {args.block} session {sid} other {other}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        try:
            if args.block == "H":
                block_h(context, sid, other)
            elif args.block == "I":
                block_i(context, sid)
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
