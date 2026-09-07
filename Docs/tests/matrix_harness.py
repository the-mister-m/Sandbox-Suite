"""Headed Playwright harness: mount one widget on /matrix, capture console + screenshots.

Job 1 (Phase 3 test pass) tool. Opus spec agents run this, one per widget, to look
at a mounted widget and write a spec. This harness does not fix anything.

Usage:
    python Docs/tests/matrix_harness.py --widget anchor_chat --session <sid> \
        --hold 30 --out Docs/Reports/phase3-test/

Mount path: opens /matrix/<sid>, then calls MX.grid.addWidget(type) directly in
page JS (same call the "New Widget" picker button makes when you click a
registry row) and reads back the new instance id. The widget element is
found at [data-instance="<id>"] inside .mx-widget (see static/js/matrix/grid.js).

Exit code: 0 unless the /matrix page itself fails to load. A widget that
mounts with an error (missing module, JS exception) still exits 0 — the
console dump and screenshots are the record for the spec agent to read.
"""

import argparse
import os
import sys
import time

from playwright.sync_api import sync_playwright


def parse_args():
    p = argparse.ArgumentParser(description="Mount a matrix widget, capture console + screenshots.")
    p.add_argument("--widget", required=True, help="registry type string, e.g. anchor_chat, queue_log, chat, queue")
    p.add_argument("--session", required=True, help="session id")
    p.add_argument("--hold", type=float, default=30, help="seconds to hold the window open (default 30)")
    p.add_argument("--out", required=True, help="output directory")
    return p.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    console_lines = []
    load_ok = {"value": False}

    def on_console(msg):
        console_lines.append(f"[console:{msg.type}] {msg.text}")

    def on_pageerror(exc):
        console_lines.append(f"[pageerror] {exc}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        url = f"http://127.0.0.1:5000/matrix/{args.session}"
        try:
            resp = page.goto(url, wait_until="load", timeout=15000)
            if resp is None or not resp.ok:
                print(f"FAILED TO LOAD: {url} (response={resp})")
                browser.close()
                sys.exit(1)
            load_ok["value"] = True
        except Exception as exc:
            print(f"FAILED TO LOAD: {url} ({exc})")
            browser.close()
            sys.exit(1)

        # state: wait for the grid to bind to the session before mounting anything.
        # calling addWidget before MX.grid.sid is set produced a widget element
        # that never became visible (observed during harness proof, phase 3 test pass).
        try:
            page.wait_for_function(
                "() => window.MX && window.MX.grid && window.MX.grid.sid",
                timeout=10000,
            )
        except Exception as exc:
            console_lines.append(f"[harness] grid never bound to session: {exc}")

        # state: mount the widget by calling the same grid API the picker button uses
        try:
            inst_id = page.evaluate(
                "(type) => window.MX.grid.addWidget(type).id",
                args.widget,
            )
        except Exception as exc:
            console_lines.append(f"[harness] addWidget threw: {exc}")
            inst_id = None

        widget_selector = f'[data-instance="{inst_id}"]' if inst_id else None

        # wait for render
        widget_locator = None
        if widget_selector:
            try:
                page.wait_for_selector(widget_selector, timeout=10000)
                widget_locator = page.locator(widget_selector)
            except Exception as exc:
                console_lines.append(f"[harness] widget element never appeared: {exc}")
        page.wait_for_timeout(1500)

        full_path = os.path.join(args.out, f"{args.widget}-full.png")
        widget_path = os.path.join(args.out, f"{args.widget}-widget.png")
        console_path = os.path.join(args.out, f"{args.widget}-console.txt")

        page.screenshot(path=full_path, full_page=True)
        if widget_locator is not None:
            try:
                widget_locator.screenshot(path=widget_path)
            except Exception as exc:
                console_lines.append(f"[harness] widget screenshot failed: {exc}")
        else:
            console_lines.append("[harness] no widget element to screenshot")

        # hold the window open for observation
        time.sleep(max(0, args.hold))

        with open(console_path, "w") as f:
            f.write("\n".join(console_lines) + "\n")

        browser.close()

    print(f"wrote {full_path}")
    if os.path.exists(widget_path):
        print(f"wrote {widget_path}")
    print(f"wrote {console_path}")
    sys.exit(0)


if __name__ == "__main__":
    main()
