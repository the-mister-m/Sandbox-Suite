"""Headed Playwright pass for Phase 1 — targets, mirrors, files, agent bus.

Spec: Docs/Specs/Code Canvas port/Phase1 Boilerplate/SPEC-phase1-1H-opus-headed.md
Launch pattern copied from Docs/tests/matrix_harness.py (chrome, headless=False,
console + pageerror collected per page).

Usage:
    python3 Docs/tests/phase1_headed.py --session <sid> --out Docs/Reports/phase1-headed/

Surfaces: made through the session panel's "Add surface" button, the same
path a user takes. Tabs: separate Playwright pages in one context, each with
its own sessionStorage, so a tab adopts a surface through ?s=<id>.

Exit code 0 always once the page loads; the receipt is the record.
"""

import argparse
import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5000"

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
        page.screenshot(path=path, full_page=True)
    except Exception as exc:
        CONSOLE.append(f"[harness] screenshot {name} failed: {exc}")
    return path


def curl_targets(sid):
    try:
        raw = subprocess.run(["curl", "-s", "-m", "5", f"{BASE}/api/targets/{sid}"],
                             capture_output=True, text=True).stdout
        return [t["value"] for t in json.loads(raw).get("targets", [])]
    except Exception:
        return []


def wait_targets(sid, want, present, timeout=10.0):
    """poll the targets route until `want` is (or is not) in the list"""
    end = time.time() + timeout
    while time.time() < end:
        vals = curl_targets(sid)
        if (want in vals) == present:
            return True, vals
        time.sleep(0.5)
    return False, curl_targets(sid)


def add_surface(page):
    """session panel -> Empty surface -> Add surface; returns the new surface id + name

    Exact-match on the template row's .mx-grow ("Empty surface"), so an
    existing surface row ("Empty surface · 1 widget") never wins.
    """
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


def close_surface_from_session_window(page, name):
    """session panel -> Surfaces row for `name` -> Close -> confirm in the modal"""
    # the corner buttons live in a collapsed drawer; the handle opens it
    if "open" not in (page.locator("#mxCorners").get_attribute("class") or ""):
        page.locator("#mxDrawerHandle").click()
        page.wait_for_timeout(500)
    page.locator("#mxSession").click()
    page.wait_for_selector("text=Surfaces", timeout=10000)
    page.wait_for_timeout(700)
    hit = page.evaluate(
        """(name) => {
          for (const row of document.querySelectorAll('.mx-overlay .mx-row')) {
            const grow = row.querySelector('.mx-grow');
            if (!grow || !grow.textContent.startsWith(name + ' \\u00b7')) continue;
            const btn = Array.from(row.querySelectorAll('button'))
              .find(b => b.textContent === 'Close');
            if (btn) { btn.click(); return true; }
          }
          return false;
        }""", name)
    if not hit:
        raise RuntimeError(f"surface row {name!r} not found in the session panel")
    page.wait_for_timeout(500)
    confirmed = page.evaluate(
        """() => {
          const overlays = document.querySelectorAll('.mx-overlay');
          const modal = overlays[overlays.length - 1];
          if (!modal) return false;
          const btn = Array.from(modal.querySelectorAll('.mx-actions button'))
            .find(b => b.textContent === 'Close');
          if (btn) { btn.click(); return true; }
          return false;
        }""")
    if not confirmed:
        raise RuntimeError("Close Surface confirm button not found")
    page.wait_for_timeout(900)


def clear_overlays(page):
    page.evaluate("() => document.querySelectorAll('.mx-overlay').forEach(o => o.remove())")
    page.wait_for_timeout(300)


def mount_pipes(page):
    inst = page.evaluate("() => window.MX.grid.addWidget('pipes').id")
    page.wait_for_selector(f'[data-instance="{inst}"]', timeout=10000)
    page.wait_for_timeout(400)
    return inst


def open_options(page, inst):
    page.locator(f'[data-instance="{inst}"] .mx-bar button', has_text="options").first.click()
    page.wait_for_selector(f'[data-instance="{inst}"] .mx-options', timeout=5000)
    page.wait_for_timeout(600)


def close_options(page, inst):
    """no-op when the panel is already closed"""
    if page.locator(f'[data-instance="{inst}"] .mx-options').count() == 0:
        return
    page.locator(f'[data-instance="{inst}"] .mx-options button', has_text="Close").first.click()
    page.wait_for_timeout(200)


def reopen_options(page, inst):
    close_options(page, inst)
    open_options(page, inst)


def target_row(page, inst):
    """the options panel row keyed `target`: tag name, values, New button present"""
    return page.evaluate(
        """(inst) => {
          const panel = document.querySelector(`[data-instance="${inst}"] .mx-options`);
          if (!panel) return null;
          for (const row of panel.querySelectorAll('.mx-opt-row')) {
            const label = row.querySelector('label');
            if (!label || label.textContent !== 'target') continue;
            const sel = row.querySelector('select');
            const btns = Array.from(row.querySelectorAll('button')).map(b => b.textContent);
            return {
              tag: sel ? 'select' : (row.querySelector('input') || {}).type || 'none',
              values: sel ? Array.from(sel.options).map(o => o.value) : [],
              value: sel ? sel.value : null,
              buttons: btns,
            };
          }
          return null;
        }""", inst)


def pipes_text(page, inst):
    return page.evaluate(
        "(inst) => (document.querySelector(`[data-instance=\"${inst}\"]`) || {}).innerText || ''",
        inst)


def pipes_log(page, inst):
    """the log div is the 3rd child of the widget body wrap (pipes.js:95-101)"""
    return page.evaluate(
        """(inst) => {
          const el = document.querySelector(`[data-instance="${inst}"]`);
          if (!el) return '';
          const divs = el.querySelectorAll('div');
          for (const d of divs) {
            if (d.style && d.style.maxHeight === '120px') return d.innerText;
          }
          return '';
        }""", inst)


def click_body_button(page, inst, label):
    page.locator(f'[data-instance="{inst}"] button', has_text=label).first.click()
    page.wait_for_timeout(400)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--file", required=True, help="absolute path for the open/save test")
    ap.add_argument("--hold", type=float, default=0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sid = args.session

    with open(args.file, "w", encoding="utf-8") as f:
        f.write("phase1 headed open/save witness\n")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        ctx = browser.new_context(viewport={"width": 1500, "height": 950})

        # ---- surface one, tab one
        p1 = ctx.new_page()
        wire(p1, "p1")
        resp = p1.goto(f"{BASE}/matrix/{sid}", wait_until="load", timeout=20000)
        if resp is None or not resp.ok:
            print(f"FAILED TO LOAD /matrix/{sid}")
            browser.close()
            sys.exit(1)
        s1, s1name = add_surface(p1)
        print(f"surface one = {s1} ({s1name})")

        # ---- 1. mount pipes, options panel draws target as a select with graph + New
        inst1 = mount_pipes(p1)
        open_options(p1, inst1)
        row = target_row(p1, inst1)
        sh = shot(p1, args.out, "01-options-target-select")
        ok1 = bool(row) and row["tag"] == "select" and "graph" in row["values"] and "New" in row["buttons"]
        record(1, "Pipes options: target is a select with graph + New button", ok1, sh,
               json.dumps(row))

        # ---- 2. pick graph, Load target shows 84 nodes, 142 edges
        p1.locator(f'[data-instance="{inst1}"] .mx-options select').first.select_option("graph")
        p1.wait_for_timeout(500)
        close_options(p1, inst1)
        click_body_button(p1, inst1, "Load target")
        p1.wait_for_timeout(1200)
        body = pipes_text(p1, inst1)
        sh = shot(p1, args.out, "02-load-target")
        ok2 = "84 nodes, 142 edges" in body
        record(2, "Load target reads 84 nodes, 142 edges", ok2, sh,
               "" if ok2 else body.replace("\n", " | ")[:200])

        # ---- 3. surface two, pipes on graph too, one graph entry not two
        p3 = ctx.new_page()
        wire(p3, "p3")
        p3.goto(f"{BASE}/matrix/{sid}", wait_until="load", timeout=20000)
        s2, s2name = add_surface(p3)
        print(f"surface two = {s2} ({s2name})")
        inst2 = mount_pipes(p3)
        open_options(p3, inst2)
        p3.locator(f'[data-instance="{inst2}"] .mx-options select').first.select_option("graph")
        p3.wait_for_timeout(600)
        wait_targets(sid, "graph", True, timeout=8)
        reopen_options(p3, inst2)
        row3 = target_row(p3, inst2)
        sh = shot(p3, args.out, "03-dedupe-graph-once")
        ok3 = bool(row3) and row3["values"].count("graph") == 1
        record(3, "graph listed once, not twice", ok3, sh, json.dumps(row3))

        # ---- 4. surface two set to other, surface one's panel lists it
        close_options(p3, inst2)
        p3.evaluate("(inst) => window.MX.grid.frames[inst].setOption('target','other')", inst2)
        p3.wait_for_timeout(600)
        got, vals = wait_targets(sid, "other", True, timeout=10)
        reopen_options(p1, inst1)
        row4 = target_row(p1, inst1)
        sh = shot(p1, args.out, "04-other-listed-on-surface-one")
        ok4 = bool(row4) and "other" in row4["values"]
        record(4, "surface two's other shows in surface one's select", ok4, sh,
               f"route targets={vals} panel={json.dumps(row4)}")

        # ---- 5. close surface two from the session window, other leaves
        close_options(p1, inst1)
        close_surface_from_session_window(p1, s2name)
        gone, vals5 = wait_targets(sid, "other", False, timeout=8)
        # surface two's tab stays open here — the spec's order is close the
        # surface, then reread surface one's panel
        clear_overlays(p1)
        open_options(p1, inst1)
        row5 = target_row(p1, inst1)
        sh = shot(p1, args.out, "05-other-gone")
        ok5 = bool(row5) and "other" not in row5["values"]
        record(5, "closing surface two drops other from the select", ok5, sh,
               f"route targets={vals5} panel=" + json.dumps(row5))
        close_options(p1, inst1)
        # state: does surface two's tab write its deleted file back on close
        p3.close()
        time.sleep(2)
        after_close = curl_targets(sid)
        print(f"[note] targets after surface two's tab closed: {after_close}")
        CONSOLE.append(f"[harness] targets after surface two's tab closed: {after_close}")

        # ---- 6. second tab on surface one, emit in tab one, tab two logs remote
        p2 = ctx.new_page()
        wire(p2, "p2")
        p2.goto(f"{BASE}/matrix/{sid}?s={s1}", wait_until="load", timeout=20000)
        p2.wait_for_selector(f'[data-instance="{inst1}"]', timeout=10000)
        p2.wait_for_timeout(1000)
        click_body_button(p1, inst1, "Emit")
        p2.wait_for_timeout(1500)
        log2 = pipes_log(p2, inst1)
        sh = shot(p2, args.out, "06-tab-two-remote")
        ok6 = "remote" in log2
        record(6, "tab two logs tab one's emit with remote", ok6, sh,
               f"tab two log={log2.replace(chr(10), ' | ')[:200]!r}")

        # ---- 7. two pipes on surface one, same target mirrors, different target does not
        p2.close()
        instB = mount_pipes(p1)
        open_options(p1, instB)
        p1.locator(f'[data-instance="{instB}"] .mx-options select').first.select_option("graph")
        p1.wait_for_timeout(400)
        close_options(p1, instB)
        click_body_button(p1, inst1, "Emit")
        p1.wait_for_timeout(600)
        logB = pipes_log(p1, instB)
        ok7a = logB.strip() != "" and "remote" not in logB
        p1.evaluate("(inst) => window.MX.grid.frames[inst].setOption('target','elsewhere')", instB)
        p1.wait_for_timeout(400)
        beforeB = pipes_log(p1, instB)
        click_body_button(p1, inst1, "Emit")
        p1.wait_for_timeout(800)
        afterB = pipes_log(p1, instB)
        ok7b = beforeB == afterB
        sh = shot(p1, args.out, "07-same-target-mirror")
        record(7, "same-target sibling logs without remote; different target lands nothing",
               ok7a and ok7b, sh,
               f"logged={logB.replace(chr(10),' | ')[:120]!r} unchanged_after_retarget={ok7b}")
        # take the second pipes back off the surface
        p1.evaluate("(inst) => window.MX.grid.removeWidget(inst)", instB)
        p1.wait_for_timeout(400)

        # ---- 8. open a file by path, save, reopen shows the appended line
        open_options(p1, inst1)
        p1.evaluate("(a) => window.MX.grid.frames[a[0]].setOption('path', a[1])",
                    [inst1, args.file])
        p1.wait_for_timeout(300)
        close_options(p1, inst1)
        click_body_button(p1, inst1, "Open")
        p1.wait_for_timeout(1200)
        first_open = pipes_text(p1, inst1)
        ok8a = "phase1 headed open/save witness" in first_open
        click_body_button(p1, inst1, "Save")
        p1.wait_for_timeout(1500)
        after_save = pipes_text(p1, inst1)
        ok8b = "ok" in after_save
        click_body_button(p1, inst1, "Open")
        p1.wait_for_timeout(1200)
        reopened = pipes_text(p1, inst1)
        ok8c = "pipes " in reopened
        on_disk = open(args.file, encoding="utf-8").read()
        sh = shot(p1, args.out, "08-open-save-reopen")
        record(8, "open shows first 200 chars, save says ok, reopen shows the appended line",
               ok8a and ok8b and ok8c, sh,
               f"open={ok8a} saved_ok={ok8b} reopen_has_appended={ok8c} disk={on_disk!r}")

        # ---- 9. curl the widget-bus route; graph-target pipes log it, another does not
        instC = mount_pipes(p1)
        open_options(p1, instC)
        p1.evaluate("(inst) => window.MX.grid.frames[inst].setOption('target','somewhere-else')", instC)
        p1.wait_for_timeout(400)
        close_options(p1, instC)
        before_main = pipes_log(p1, inst1)
        before_other = pipes_log(p1, instC)
        subprocess.run(["curl", "-s", "-m", "5", "-X", "POST", f"{BASE}/api/widget-bus",
                        "-H", "Content-Type: application/json",
                        "-d", json.dumps({"channel": "pipes.ping",
                                          "payload": {"target": "graph", "note": "from-curl"}})],
                       capture_output=True, text=True)
        p1.wait_for_timeout(1500)
        after_main = pipes_log(p1, inst1)
        after_other = pipes_log(p1, instC)
        ok9a = "from-curl" in after_main and "remote" in after_main and after_main != before_main
        ok9b = after_other == before_other
        sh = shot(p1, args.out, "09-curl-widget-bus")
        record(9, "curl lands on target graph only, tagged remote", ok9a and ok9b, sh,
               f"graph_widget_got_it={ok9a} other_target_untouched={ok9b}")
        p1.evaluate("(inst) => window.MX.grid.removeWidget(inst)", instC)
        p1.wait_for_timeout(400)

        # ---- 10. reload the tab, options survive
        p1.evaluate("(a) => window.MX.grid.frames[a[0]].setOption('note', a[1])",
                    [inst1, "survive-reload"])
        p1.wait_for_timeout(1200)
        p1.reload(wait_until="load", timeout=20000)
        p1.wait_for_selector(f'[data-instance="{inst1}"]', timeout=10000)
        p1.wait_for_timeout(1200)
        opts = p1.evaluate("(inst) => window.MX.grid.frames[inst].getOptions()", inst1)
        sh = shot(p1, args.out, "10-reload-options-survive")
        ok10 = (opts.get("target") == "graph" and opts.get("path") == args.file
                and opts.get("note") == "survive-reload")
        record(10, "reload keeps target, path, note", ok10, sh, json.dumps(opts))

        # ---- 11. zero pageerrors
        sh = shot(p1, args.out, "11-final-state")
        record(11, "zero pageerrors across the pass", len(PAGEERRORS) == 0, sh,
               " ;; ".join(PAGEERRORS[:5]) if PAGEERRORS else "none")

        print(f"\nsurface one left behind: {s1} ({s1name}) on session {sid}")
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
