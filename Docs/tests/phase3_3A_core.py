"""Headed Playwright harness: Phase 3 job 3A, canvas core.

Report only. Opens /matrix, exercises MX.canvasCore() in the page, and
writes one screenshot of the rendered iframe plus a console dump.

Usage:
    python3 Docs/tests/phase3_3A_core.py --out Docs/Reports/phase3-3A
"""

import argparse
import json
import os

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5000/matrix"

CHECKS = r"""
async () => {
  const out = {};
  const core = await MX.canvasCore();
  out.names = Object.keys(core).sort();

  // state load, undo after one moveWidget
  const s = core.makeState(core.kit);
  const pageId = s.addPage("Page 1");
  const wid = s.addWidget(pageId, "text.block", {x: 40, y: 40, w: 320, h: 80});
  s.setContent(wid, "literal", "Canvas core proof");
  const wid2 = s.addWidget(pageId, "status.badge", {x: 40, y: 160, w: 160, h: 32});
  s.setContent(wid2, "literal", "badge");
  const json = s.save();

  const s2 = core.makeState(core.kit);
  s2.load(json);
  const pid = s2.get().page;
  const before = JSON.stringify(s2.get().pages[0].widgets[0].box);
  s2.moveWidget(s2.get().pages[0].widgets[0].id, {x: 999, y: 999});
  const moved = JSON.stringify(s2.get().pages[0].widgets[0].box);
  s2.undo();
  const after = JSON.stringify(s2.get().pages[0].widgets[0].box);
  out.load_ok = s2.get().pages.length === 1 && s2.get().pages[0].widgets.length === 2;
  out.undo_restores_box = (before === after) && (before !== moved);
  out.box_before = before;
  out.box_moved = moved;
  out.box_after = after;

  // v1 migration on load
  const v1 = {app: "Code Canvas", page: "pg_a", pages: [{id: "pg_a", name: "p",
    notes: "", widgets: [{id: "wg_a", type: "text.heading", parent: null,
    box: {x: 0, y: 0, w: 100, h: 40}, content: {mode: "literal", value: "h"},
    props: {}, link: null, notes: "", locked: false, behaviors: [],
    animations: [], code: {custom: false, html: "", css: "", js: ""}}]}],
    library: {objects: [], animations: [], behaviors: []}, assets: []};
  const s3 = core.makeState(core.kit);
  s3.load(JSON.stringify(v1));
  out.migrated_type = s3.get().pages[0].widgets[0].type;
  out.migrated_tag = s3.get().pages[0].widgets[0].props.tag;
  out.migrated_version = s3.get().version;

  // motion writers
  s2.setAnimations(s2.get().pages[0].widgets[0].id, [{name: "fade"}]);
  s2.setBehaviors(s2.get().pages[0].widgets[0].id, [{on: "click"}]);
  s2.setLibraryMotion("animations", [{name: "shared"}]);
  out.animations = s2.get().pages[0].widgets[0].animations;
  out.behaviors = s2.get().pages[0].widgets[0].behaviors;
  out.library_animations = s2.get().library.animations;

  // base document
  const base = core.baseDocument("doc");
  out.base_head = base.slice(0, 60);
  out.base_has_matrix = base.indexOf('<div id="matrix"></div>') > -1;
  out.base_len = base.length;
  window.__ccBase = base;

  // render into an iframe
  const fr = document.createElement("iframe");
  fr.id = "cc-proof-frame";
  fr.style.cssText = "position:fixed;right:12px;bottom:12px;width:560px;height:360px;z-index:99999;border:2px solid #2a6df4;background:#fff";
  fr.srcdoc = base;
  document.body.appendChild(fr);
  await new Promise((r) => fr.addEventListener("load", r, {once: true}));
  const doc = fr.contentDocument;
  doc.getElementById("matrix").className = "cc-canvas-matrix";
  const resolve = core.makeResolve(core.kit, s2);
  const render = core.makeRender(s2, resolve, doc);
  render.page(pid);
  out.drawn = doc.querySelectorAll(".cc-canvas-widget").length;
  out.drawn_html = doc.getElementById("matrix").innerHTML;
  out.style_block = (doc.getElementById("cc-render-style") || {}).textContent || "";

  // play seam produces the same output
  const htmlNoPlay = doc.getElementById("matrix").innerHTML;
  const cssNoPlay = doc.getElementById("cc-render-style").textContent;
  render.page(pid, {play: true});
  out.play_same_html = doc.getElementById("matrix").innerHTML === htmlNoPlay;
  out.play_same_css = doc.getElementById("cc-render-style").textContent === cssNoPlay;

  // patch
  const p = core.patch;
  const src = '<div data-od-id="a"><p data-od-id="b">hello</p></div>';
  out.patch_style = p.apply(src, {id: "b", kind: "set-style",
    styles: {color: "red", fontSize: "20px"}});
  out.patch_text = p.apply(src, {id: "b", kind: "set-text", value: "bye"});
  out.patch_outer = p.apply(src, {id: "b", kind: "replace-outer-html",
    html: "<h2>swapped</h2>"});
  out.patch_full = p.apply(src, {kind: "set-full-source", source: "<p>new</p>"});
  const tokenSrc = '<!doctype html><html><head><style>:root{--brand: #111;}</style></head><body><p data-od-id="b">x</p></body></html>';
  out.patch_token = p.apply(tokenSrc, {kind: "set-css-token", token: "--brand", value: "#f00"});
  const plain = "<section><h1>Title</h1><p>Body</p></section>";
  const pdoc = p.parse(plain);
  out.assign_count = p.assignIds(pdoc);
  out.assigned = p.serialize(pdoc);
  out.find_by_path = !!p.find(p.parse(out.assigned), "path-0-0");

  // file-mode base document
  const fileBase = core.baseDocument("file", plain);
  out.file_has_guides = fileBase.indexOf("data-od-edit-bridge-style") > -1;
  out.file_has_script = fileBase.indexOf("data-od-edit-bridge") > -1;

  out.channels = core.channels;
  out.kit_types = core.kit.types();
  out.kit_tools = core.kit.tools.map((t) => t.name);
  out.kit_taxonomies = Object.keys(core.kit.byTaxonomy());
  return out;
}
"""

ASSET_CHECKS = r"""
async () => {
  const out = {};
  const core = await MX.canvasCore();
  // 1x1 red png
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  async function run(mode, docPath) {
    const s = core.makeState(core.kit);
    s.setAssetMode(mode);
    s.setDocPath(docPath);
    const pageId = s.addPage("P");
    const wid = s.addWidget(pageId, "media.image", {x: 10, y: 10, w: 120, h: 120});
    const aid = await s.putAsset("proof.png", "image/png", PNG);
    s.setProp(wid, "src", aid);
    const resolve = core.makeResolve(core.kit, s);
    const rec = s.get().assets[0];
    return {mode: s.assetMode(), record_data: rec.data, resolved: resolve.asset(aid),
            doc_json_assets: s.get().assets};
  }

  out.data = await run("data", "library/proof/doc.json");
  out.raw = await run("raw", "library/proof/doc.json");
  out.folder = await run("folder", "library/proof/doc.json");
  return out;
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="Docs/Reports/phase3-3A")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    console = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="load")
        page.wait_for_function("() => window.MX && window.MX.canvasCore")
        result = page.evaluate(CHECKS)
        page.wait_for_timeout(600)
        page.locator("#cc-proof-frame").screenshot(
            path=os.path.join(args.out, "render-iframe.png"))
        page.screenshot(path=os.path.join(args.out, "page.png"))
        assets = page.evaluate(ASSET_CHECKS)
        browser.close()

    with open(os.path.join(args.out, "checks.json"), "w") as fh:
        json.dump(result, fh, indent=2)
    with open(os.path.join(args.out, "assets.json"), "w") as fh:
        json.dump(assets, fh, indent=2)
    with open(os.path.join(args.out, "console.txt"), "w") as fh:
        fh.write("\n".join(console))
    print(json.dumps(result, indent=2)[:6000])
    print("--- ASSETS ---")
    print(json.dumps(assets, indent=2))
    print("--- CONSOLE ---")
    print("\n".join(console[-40:]))


if __name__ == "__main__":
    main()
