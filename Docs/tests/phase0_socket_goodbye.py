# headed check: bind a session, switch to another, look for the socket line
import sys, json, urllib.request, time
from playwright.sync_api import sync_playwright

rows = json.load(urllib.request.urlopen("http://127.0.0.1:5000/api/sessions/open"))["list"]
if len(rows) < 2:
    print("need two open sessions"); sys.exit(2)
a, b = rows[0]["id"], rows[1]["id"]
lines = []
with sync_playwright() as p:
    br = p.chromium.launch(headless=False)
    pg = br.new_page()
    pg.on("console", lambda m: lines.append(f"[{m.type}] {m.text}"))
    pg.goto(f"http://127.0.0.1:5000/matrix/{a}")
    pg.wait_for_function("window.MX && MX.socket && MX.socket.state() === 'live'", timeout=10000)
    for _ in range(3):
        pg.evaluate(f"MX.socket.bind('{b}')")
        pg.wait_for_function("MX.socket.state() === 'live'", timeout=10000)
        time.sleep(1)
        pg.evaluate(f"MX.socket.bind('{a}')")
        pg.wait_for_function("MX.socket.state() === 'live'", timeout=10000)
        time.sleep(1)
    br.close()
bad = [l for l in lines if "WebSocket" in l or "error" in l.lower()]
print("switches: 6")
print("socket or error lines:", len(bad))
for l in bad: print(" ", l)
