"""Headed Playwright harness: Phase 0 Code Canvas port, final proof.

Report only. Six steps, one run, one surface, two tabs on the same ?s=.
Fence, sweep, helpers, widget readers and drivers come from
phase0_rerun.py, phase0_rerun2.py and phase0_onceover.py; nothing is
copied. Starts no region: step 5 picks from the roster the session
already has.

Usage:
    python3 Docs/tests/phase0_final.py --session e76d0d6f4e3e \
        --out Docs/Reports/phase0-final
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import phase0_rerun as H            # noqa: E402  fence, sweep, helpers
import phase0_rerun2 as R           # noqa: E402  widget readers, drivers
import phase0_onceover as O         # noqa: E402  two_tabs, resize, instances
from playwright.sync_api import sync_playwright  # noqa: E402


def log(line):
    H.CONSOLE.append(f"{H.stamp()} {line}")


def step(num, status, note, shot_path):
    H.step(num, status, note, shot_path)


def track_grid_puts(page, tag, sent, failed):
    """Read-only request taps: every grid PUT and every one that aborted."""
    def on_request(r):
        if r.method == "PUT" and "/api/grid/" in r.url:
            try:
                body = r.post_data or ""
            except Exception:
                body = ""
            sent.append({"at": time.time(), "tag": tag, "url": r.url, "body": body})

    def on_failed(r):
        if r.method == "PUT" and "/api/grid/" in r.url:
            try:
                body = r.post_data or ""
            except Exception:
                body = ""
            failed.append({"at": time.time(), "tag": tag, "url": r.url,
                           "body": body, "why": str(r.failure)})

    page.on("request", on_request)
    page.on("requestfailed", on_failed)


def reload_and_settle(page, seconds=6.0):
    page.reload(wait_until="load")
    page.wait_for_function("() => window.MX && window.MX.grid && window.MX.grid.sid",
                           timeout=15000)
    page.wait_for_timeout(int(seconds * 1000))


# ---------------- the six steps ----------------

def run(context, sid):
    # fence every open session up front: step 4 switches into three of them
    H.fence(sid)
    for row in (H.api("/api/sessions/open").get("list") or []):
        H.fence(row["id"])
    t1, t2, surface, url = O.two_tabs(context, sid, "P")
    mark = len(H.CONSOLE)
    R.observe(t1)
    R.observe(t2)
    sent, failed = [], []
    track_grid_puts(t2, "t2", sent, failed)

    docs = os.path.dirname(os.path.abspath(__file__))          # Docs/tests
    root = os.path.dirname(docs)                               # Docs, has nesting

    # ---- 1: two files open in tab one, active switched, tab two follows ----
    br = H.add_widget(t1, "browser")
    t1.wait_for_timeout(2500)
    ed = H.add_widget(t1, "editor")
    t1.wait_for_timeout(3000)
    t1.evaluate("([id, p]) => window.MX.grid.frames[id].setOption('root', p)", [br, root])
    t1.wait_for_timeout(3000)
    H.expand_first_dir(t1, br)
    t1.wait_for_timeout(2000)

    one = R.open_file_in(t1, br, 0, "Editor")
    t1.wait_for_timeout(2000)
    two = R.open_file_in(t1, br, 1, "Editor")
    t1.wait_for_timeout(3000)

    s1 = R.ed_state(t1, ed)
    keys = [t.get("key") for t in (s1["opt"] or {}).get("tabs", [])]
    target = keys[0] if keys else None
    if len(keys) >= 2:
        t1.locator(f'[data-instance="{ed}"] .mxed-tab').nth(0).click()
        t1.wait_for_timeout(2500)
    ok_active, secs_active = R.wait_until(
        t2, """([id, key]) => { const f = window.MX.grid.frames[id];
          return !!(f && f.getOptions().active === key); }""",
        [ed, target], timeout=5.0) if target else (False, 0)

    held2, held1 = [], []
    t0 = time.time()
    while time.time() - t0 < 5.0:
        held2.append(t2.evaluate(
            "(id) => { const f = window.MX.grid.frames[id]; if (!f) return null;"
            " const o = f.getOptions(); return { n: (o.tabs || []).length, a: o.active }; }", ed))
        held1.append(t1.evaluate(
            "(id) => { const f = window.MX.grid.frames[id]; if (!f) return null;"
            " const o = f.getOptions(); return { n: (o.tabs || []).length, a: o.active }; }", ed))
        t2.wait_for_timeout(400)

    e1 = R.ed_state(t1, ed)
    e2 = R.ed_state(t2, ed)
    p1 = R.shot(t2, "1-editor-two-tabs")
    paths1 = [t.get("path") for t in (e1["opt"] or {}).get("tabs", [])]
    paths2 = [t.get("path") for t in (e2["opt"] or {}).get("tabs", [])]
    two_held = bool(held2) and all(h and h["n"] >= 2 and h["a"] == target for h in held2)
    one_held = bool(held1) and all(h and h["n"] >= 2 for h in held1)
    ob1 = R.observed(t1)
    log(f"[obs] 1 t1 markDirty calls={ob1['dirty']}")
    log(f"[obs] 1 t1 socket file frames={ob1['file']}")
    log(f"[obs] 1 t2 held={held2}")
    log(f"[obs] 1 t1 held={held1}")
    step("1", "PASS" if (ok_active and two_held and one_held and paths1 == paths2) else "FAIL",
         f"opened {one!r} then {two!r} in tab1 through the browser right-click, then clicked "
         f"tab one active; tab2 matched active in {secs_active}s; tab1 tabs={paths1}; "
         f"tab2 tabs={paths2}; over 5s tab2 always held both with the same active={two_held}; "
         f"tab1 always held both={one_held}; tab1 markDirty count={len(ob1['dirty'])}", p1)

    # ---- 2: nested browser survives a reload of tab two ----
    names = R.expand_nested(t1, br)
    t1.wait_for_timeout(3000)
    b1 = R.browse_state(t1, br)
    log(f"[obs] 2 t1 browser expanded={(b1['opt'] or {}).get('expanded')} rows={b1['rows']}")
    reload_and_settle(t2, 8.0)
    b2 = R.browse_state(t2, br)
    p2 = R.shot(t2, "2-browser-after-reload")
    exp2 = (b2["opt"] or {}).get("expanded") or []
    ok2 = bool(b2["rows"]) and bool(b2["nodes"]) and len(exp2) >= 2
    step("2", "PASS" if ok2 else "FAIL",
         f"expanded {names!r} in tab1's browser {br}, then reloaded tab2; tab2 rows={b2['rows']}; "
         f"nodes={b2['nodes']}; expanded={exp2}; want={b2['want']}; rootline={b2['rootline']!r}; "
         f"open folders in tab2 DOM={b2['open']}", p2)

    # ---- 3: reload after a burst of three moves leaves no retry pair ----
    vw = H.add_widget(t1, "viewer")
    t1.wait_for_timeout(2000)
    sent.clear()
    failed.clear()
    mark3 = len(H.CONSOLE)
    for _ in range(3):
        R.nudge_widget(t1, vw)
        t1.wait_for_timeout(150)
    t1.wait_for_timeout(400)
    reload_and_settle(t2, 6.0)
    aborted = [f for f in failed if "ABORTED" in (f["why"] or "").upper()]
    bodies = {}
    for f in aborted:
        bodies[f["body"]] = bodies.get(f["body"], 0) + 1
    doubled = {b[:60]: n for b, n in bodies.items() if n > 1}
    console_aborts = [c for c in H.CONSOLE[mark3:] if "ERR_ABORTED" in c]
    p3 = R.shot(t2, "3-burst-reload")
    log(f"[obs] 3 grid PUTs from tab2={len(sent)} aborted={len(aborted)}")
    step("3", "PASS" if not doubled else "FAIL",
         f"three moves in tab1 then an immediate reload of tab2; grid PUTs seen from "
         f"tab2={len(sent)}; "
         f"aborted={len(aborted)}; distinct aborted bodies={len(bodies)}; bodies aborted more "
         f"than once={doubled if doubled else 'none'}; ERR_ABORTED console lines={len(console_aborts)}",
         p3)

    # ---- 4: three session switches in a bound tab, no WebSocket lines ----
    mark4 = len(H.CONSOLE)
    rows = H.api("/api/sessions/open").get("list") or []
    others = [r["id"] for r in rows if r["id"] != sid]
    switched = []
    t3 = H.open_matrix(context, sid, tag="P-t3")
    t3.wait_for_timeout(2000)
    H.add_widget(t3, "browser")
    t3.wait_for_timeout(2500)
    for i in range(3):
        want = others[i % len(others)] if others else None
        H.open_session_window(t3)
        info = H.panel_map(t3)
        srows = (info or {}).get("sessions") or []
        sidx = next((r["i"] for r in srows if want and want in r["label"]), None)
        if sidx is None:
            sidx = next((r["i"] for r in srows if "Switch" in r["buttons"]), None)
        if sidx is None:
            log(f"[harness] 4 no Switch row on pass {i + 1}")
            break
        label = srows[sidx]["label"]
        t3.locator(f'.rp-sessrow[data-rp-idx="{sidx}"]').locator(
            "button", has_text="Switch").first.click()
        t3.wait_for_timeout(4000)
        H.close_overlay(t3)
        switched.append((label.strip()[:40], t3.url.split("/matrix/")[-1][:12]))
    ws_lines = [c for c in H.CONSOLE[mark4:] if "WebSocket" in c or "ws/ade" in c]
    p4 = R.shot(t3, "4-session-switches")
    step("4", "PASS" if len(switched) == 3 and not ws_lines else "FAIL",
         f"bound tab switched session {len(switched)} times: {switched}; WebSocket console "
         f"lines during the three switches={len(ws_lines)}"
         + (f"; first={ws_lines[0]!r}" if ws_lines else ""), p4)
    try:
        t3.close()
    except Exception as exc:
        log(f"[harness] 4 close tab3: {exc}")

    # ---- 5: mirror pass ----
    ok5a, secs5a = R.wait_until(
        t2, "(id) => window.MX.grid.instances.some(i => i.id === id)", vw, timeout=6.0)
    p5a = R.shot(t2, "5a-add")
    step("5a", "PASS" if ok5a else "FAIL",
         f"viewer {vw} added in tab1; tab2 showed it in {secs5a}s; "
         f"tab2 instances={O.instances(t2)}", p5a)

    R.nudge_widget(t1, vw)
    t1.wait_for_timeout(1500)
    want5b = O.slot_of(t1, vw)
    ok5b, secs5b = R.wait_until(
        t2, """([id, s]) => { const i = window.MX.grid.instances.find(x => x.id === id);
          return !!(i && i.slot.col === s.col && i.slot.row === s.row); }""",
        [vw, want5b], timeout=6.0)
    p5b = R.shot(t2, "5b-move")
    step("5b", "PASS" if ok5b else "FAIL",
         f"moved {vw} one column in tab1 to {want5b}; tab2 matched in {secs5b}s; "
         f"tab2 slot={O.slot_of(t2, vw)}", p5b)

    want5c = O.resize_widget(t1, vw)
    t1.wait_for_timeout(1500)
    ok5c, secs5c = R.wait_until(
        t2, """([id, s]) => { const i = window.MX.grid.instances.find(x => x.id === id);
          return !!(i && i.slot.w === s.w && i.slot.h === s.h); }""",
        [vw, want5c], timeout=6.0)
    p5c = R.shot(t2, "5c-resize")
    step("5c", "PASS" if ok5c else "FAIL",
         f"resized {vw} in tab1 to {want5c}; tab2 matched in {secs5c}s; "
         f"tab2 slot={O.slot_of(t2, vw)}", p5c)

    t1.evaluate("(id) => window.MX.grid.removeWidget(id)", vw)
    t1.wait_for_timeout(1500)
    ok5d, secs5d = R.wait_until(
        t2, "(id) => !window.MX.grid.instances.some(i => i.id === id)", vw, timeout=6.0)
    p5d = R.shot(t2, "5d-close")
    step("5d", "PASS" if ok5d else "FAIL",
         f"closed {vw} in tab1; tab2 dropped it in {secs5d}s; "
         f"tab2 instances={O.instances(t2)}", p5d)

    vw2 = H.add_widget(t1, "viewer")
    t1.wait_for_timeout(2000)
    v1 = R.open_file_in(t1, br, 0, "Viewer")
    t1.wait_for_timeout(1200)
    v2 = R.open_file_in(t1, br, 1, "Viewer")
    t1.wait_for_timeout(2500)
    ok5e, secs5e = R.wait_until(
        t2, "(id) => { const f = window.MX.grid.frames[id];"
            " return !!(f && (f.getOptions().tabs || []).length >= 2); }", vw2, timeout=6.0)
    vs1 = R.view_state(t1, vw2)
    vs2 = R.view_state(t2, vw2)
    p5e = R.shot(t2, "5e-viewer-two")
    step("5e", "PASS" if ok5e and (vs2["opt"] or {}).get("tabs") == (vs1["opt"] or {}).get("tabs")
         else "FAIL",
         f"opened {v1!r} and {v2!r} in tab1 viewer {vw2}; tab2 in {secs5e}s; "
         f"tab1 tabs={(vs1['opt'] or {}).get('tabs')}; "
         f"tab2 tabs={(vs2['opt'] or {}).get('tabs')}", p5e)

    tabs_now = (vs1["opt"] or {}).get("tabs") or []
    active = (vs1["opt"] or {}).get("path")
    background = next((t for t in tabs_now if t != active), None)
    if background is not None:
        t1.locator(f'[data-instance="{vw2}"] .mx-viewer-tab').nth(
            tabs_now.index(background)).locator(".mx-viewer-tab-x").click()
    t1.wait_for_timeout(1000)
    ok5f, secs5f = R.wait_until(
        t2, """([id, path]) => { const f = window.MX.grid.frames[id];
          return !!(f && (f.getOptions().tabs || []).indexOf(path) < 0); }""",
        [vw2, background], timeout=6.0)
    vs1b = R.view_state(t1, vw2)
    vs2b = R.view_state(t2, vw2)
    p5f = R.shot(t2, "5f-viewer-close")
    step("5f", "PASS" if ok5f and (vs2b["opt"] or {}).get("tabs")
         == (vs1b["opt"] or {}).get("tabs") else "FAIL",
         f"closed background tab {background!r} in tab1; tab2 dropped it in {secs5f}s; "
         f"tab1 tabs={(vs1b['opt'] or {}).get('tabs')}; "
         f"tab2 tabs={(vs2b['opt'] or {}).get('tabs')}", p5f)

    ch = H.add_widget(t1, "chat")
    t1.wait_for_timeout(4000)
    cs = R.chat_state(t1, ch)
    log(f"[harness] chat roster on {sid}: {cs['regions']}")
    if cs["regions"]:
        R.run_region_steps(t1, t2, ch, sid, "5g", "5h")
    else:
        p = R.shot(t1, "5g-no-regions")
        step("5g", "OBSERVED", f"session {sid} roster came back {cs['regions']}; no region to "
             f"pick and this run starts none; picker options={cs['pickOptions']}", p)
        step("5h", "OBSERVED", f"blocked for the same reason as 5g on {sid}", p)

    # ---- 6: console across every step ----
    tail = H.CONSOLE[mark:]
    errs = [c for c in tail if ":console:error]" in c]
    perr = [c for c in tail if "pageerror]" in c]
    rfail = [c for c in tail if "requestfailed]" in c]
    p6 = R.shot(t2, "6-console")
    step("6", "PASS" if not errs and not perr else "FAIL",
         f"across steps 1 to 5: console errors={len(errs)}; pageerrors={len(perr)}; "
         f"requestfailed={len(rfail)}"
         + (f"; first error={errs[0]!r}" if errs else "")
         + (f"; first pageerror={perr[0]!r}" if perr else ""), p6)
    return errs + perr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default="e76d0d6f4e3e")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hold", type=float, default=0)
    ap.add_argument("--no-sweep", action="store_true")
    args = ap.parse_args()
    H.OUT = args.out
    R.REGIONS = "auto"
    os.makedirs(H.OUT, exist_ok=True)

    sid = args.session
    print(f"session {sid}", flush=True)
    log(f"[harness] final run session {sid}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        try:
            run(context, sid)
        except Exception:
            import traceback
            H.CONSOLE.append("[harness] " + traceback.format_exc())
            print("HARNESS THREW:", traceback.format_exc(), flush=True)
        time.sleep(max(0, args.hold))
        browser.close()

    if not args.no_sweep:
        H.sweep()
    cp = os.path.join(H.OUT, "console-final.txt")
    with open(cp, "w") as f:
        f.write("\n".join(H.CONSOLE) + "\n")
    rp = os.path.join(H.OUT, "results-final.txt")
    with open(rp, "w") as f:
        f.write(f"session {sid}\n" + "\n".join(H.RESULTS) + "\n")
    print(f"wrote {rp}\nwrote {cp}")
    sys.exit(0)


if __name__ == "__main__":
    main()
