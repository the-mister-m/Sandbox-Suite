// canvas core — the one door every canvas widget opens
//
// MX.canvasCore(): a memoized promise of {kit, makeState, makeResolve,
// makeRender, patch, baseDocument, channels, optionControls, mirrors}.
// baseDocument(mode, fileText): the iframe srcdoc. doc mode returns the
// chrome stylesheet plus <div id="matrix"></div>; file mode returns the
// caller's file text with the guides stylesheet and the id-assign
// script appended.
// channels: the six canvas.* names, contract 2.7.
// optionControls(): the target select, current targets filtered to
// .json and .html, New opens the root browser.
// mirrors(frame, handlers): one mirror per channel, plus off().

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // state: the six canvas family channels, contract 2.7.
  const CHANNELS = Object.freeze({
    select: "canvas.select",
    focus: "canvas.focus",
    doc: "canvas.doc",
    change: "canvas.change",
    freeze: "canvas.freeze",
    mode: "canvas.mode"
  });

  // state: app chrome stylesheet, style.css.
  const CHROME_CSS = `
:root {
  --cc-bar: 44px;
  --cc-lib-w: 240px;
  --cc-panel-left: 0px;
  --cc-left: 0px;
  --cc-ink: #e8e8e8;
  --cc-dim: #9a9a9a;
  --cc-bg: #1b1b1b;
  --cc-bg2: #232323;
  --cc-line: #3a3a3a;
  --cc-accent: #2a6df4;
}

html, body { height: 100%; }

body {
  margin: 0;
  background: var(--cc-bg);
  color: var(--cc-ink);
  font: 13px system-ui, sans-serif;
}

#matrix { margin: 0 auto; }

.cc-nav-btn {
  background: #2f2f2f;
  color: var(--cc-ink);
  border: 1px solid var(--cc-line);
  padding: 4px 10px;
  font: 12px system-ui, sans-serif;
  cursor: pointer;
}

.cc-nav-btn:hover { background: #3a3a3a; }
.cc-nav-btn-on { border-color: var(--cc-accent); color: #fff; }

.cc-nav-title { font-weight: bold; margin: 0 0 8px; font-size: 13px; }

.cc-nav-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid var(--cc-line);
}

.cc-nav-row-name { flex: 1; }
.cc-nav-row-date { color: var(--cc-dim); font-size: 11px; }
.cc-nav-empty { color: var(--cc-dim); padding: 6px 0; }

.cc-nav-tabs { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }

.cc-nav-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
}

.cc-nav-card {
  background: #2f2f2f;
  border: 1px solid var(--cc-line);
  padding: 8px 6px;
  text-align: center;
  cursor: grab;
  user-select: none;
}

.cc-nav-card-type { display: block; color: var(--cc-dim); font-size: 10px; }

.cc-nav-field { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
.cc-nav-field label { flex: 1; color: var(--cc-dim); }

.cc-nav-field input,
.cc-nav-field select {
  width: 110px;
  background: #2f2f2f;
  color: var(--cc-ink);
  border: 1px solid var(--cc-line);
  padding: 2px 4px;
  font: 12px system-ui, sans-serif;
}

.cc-nav-spacer { flex: 1; }

.cc-nav-tab {
  background: #2f2f2f;
  color: var(--cc-dim);
  border: 1px solid var(--cc-line);
  padding: 3px 8px;
  font: 12px system-ui, sans-serif;
  cursor: pointer;
}

.cc-nav-tab-on { color: #fff; border-color: var(--cc-accent); }
.cc-nav-drop { outline: 2px dashed var(--cc-accent); }
`;

  // state: canvas chrome stylesheet, canvas.js STYLE block.
  const CANVAS_CSS = [
    "#matrix.cc-canvas-matrix { position: relative; min-height: 600px;",
    "  background-color: #ffffff; background-repeat: repeat;",
    "  background-position: 0 0; overflow: hidden; }",
    ".cc-canvas-widget { position: absolute; box-sizing: border-box; }",
    ".cc-canvas-selected { outline: 2px solid #2a6df4; outline-offset: 0; }",
    ".cc-canvas-handle { position: absolute; width: 8px; height: 8px;",
    "  background: #ffffff; border: 1px solid #2a6df4; box-sizing: border-box; }",
    ".cc-canvas-handle-nw { left: -5px; top: -5px; cursor: nwse-resize; }",
    ".cc-canvas-handle-n { left: 50%; top: -5px; margin-left: -4px; cursor: ns-resize; }",
    ".cc-canvas-handle-ne { right: -5px; top: -5px; cursor: nesw-resize; }",
    ".cc-canvas-handle-e { right: -5px; top: 50%; margin-top: -4px; cursor: ew-resize; }",
    ".cc-canvas-handle-se { right: -5px; bottom: -5px; cursor: nwse-resize; }",
    ".cc-canvas-handle-s { left: 50%; bottom: -5px; margin-left: -4px; cursor: ns-resize; }",
    ".cc-canvas-handle-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }",
    ".cc-canvas-handle-w { left: -5px; top: 50%; margin-top: -4px; cursor: ew-resize; }",
    ".cc-canvas-marquee { position: absolute; border: 1px solid #2a6df4;",
    "  background: rgba(42,109,244,0.10); pointer-events: none; }",
    ".cc-canvas-schematic { width: 100%; height: 100%; box-sizing: border-box;",
    "  border: 1px solid #6b6b6b; background: #ffffff; color: #1a1a1a;",
    "  font: 12px ui-monospace, monospace; padding: 4px; overflow: hidden; }",
    ".cc-canvas-menu { position: fixed; z-index: 9999; background: #ffffff;",
    "  border: 1px solid #d0d0d0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);",
    "  font: 13px system-ui, sans-serif; padding: 4px 0; }",
    ".cc-canvas-menu div { padding: 4px 16px; cursor: default; }",
    ".cc-canvas-menu div:hover { background: #eef3ff; }",
    ".cc-canvas-frozen { pointer-events: none; }",
    ".cc-canvas-viewport { position: relative; overflow: auto; width: 100%;",
    "  height: 100%; box-sizing: border-box; }",
    ".cc-canvas-zoom { position: absolute; right: 8px; bottom: 8px; z-index: 30;",
    "  display: flex; align-items: center; gap: 4px; background: #232323;",
    "  border: 1px solid #3a3a3a; padding: 4px; border-radius: 4px; }",
    ".cc-canvas-zoom-btn { background: #2f2f2f; color: #e8e8e8;",
    "  border: 1px solid #3a3a3a; padding: 2px 8px; font: 12px system-ui, sans-serif;",
    "  cursor: pointer; }",
    ".cc-canvas-zoom-btn:hover { background: #3a3a3a; }",
    ".cc-canvas-zoom-readout { color: #e8e8e8; font: 12px system-ui, sans-serif;",
    "  min-width: 36px; text-align: center; }"
  ].join("\n");

  // state: edit guides stylesheet, Open Design bridge.ts.
  const GUIDES_CSS = `<style data-od-edit-bridge-style>
html[data-od-edit-mode] body * { cursor: pointer !important; }
html[data-od-edit-mode] [data-od-edit-selected] {
  outline: none !important;
}
html[data-od-edit-mode] [data-od-editing="true"] {
  outline: none !important;
  cursor: text !important;
}
[data-od-edit-guides-layer] {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  font: 11px/1.2 Inter, system-ui, sans-serif;
}
[data-od-edit-guides-layer] .od-edit-guide-box {
  position: fixed;
  border: 1px solid var(--selected, var(--accent, CanvasText));
  box-sizing: border-box;
}
[data-od-edit-guides-layer] .od-edit-guide-box-hover {
  border-style: dashed;
}
[data-od-edit-guides-layer] .od-edit-guide-box-selected {
  border-style: solid;
}
[data-od-edit-guides-layer] .od-edit-guide-handle {
  position: fixed;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  margin-top: -5px;
  border: 2px solid var(--selected, var(--accent, CanvasText));
  border-radius: 999px;
  background: Canvas;
  box-sizing: border-box;
}
[data-od-edit-guides-layer] .od-edit-guide-line {
  position: fixed;
  background: color-mix(in srgb, var(--amber, var(--selected, var(--accent, CanvasText))) 70%, transparent);
}
[data-od-edit-guides-layer] .od-edit-guide-line-v {
  width: 1px;
}
[data-od-edit-guides-layer] .od-edit-guide-line-h {
  height: 1px;
}
[data-od-edit-guides-layer] .od-edit-guide-line-distance {
  background: var(--amber, var(--selected, var(--accent, CanvasText)));
}
[data-od-edit-guides-layer] .od-edit-guide-line-reference {
  background: color-mix(in srgb, var(--amber, var(--selected, var(--accent, CanvasText))) 36%, transparent);
}
[data-od-edit-guides-layer] .od-edit-guide-measure {
  position: fixed;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--amber, var(--selected, var(--accent, CanvasText)));
  color: var(--accent-contrast, Canvas);
  box-shadow: 0 5px 16px color-mix(in srgb, var(--selected, var(--accent, CanvasText)) 18%, transparent);
}
html[data-od-hide-edit-chrome] [data-od-edit-guides-layer],
html[data-od-hide-edit-chrome] [data-od-edit-selected],
html[data-od-hide-edit-chrome] [data-od-editing="true"] {
  opacity: 0 !important;
  box-shadow: none !important;
  outline-color: transparent !important;
}
</style>`;

  // state: id-assign script, file mode. Stamps data-od-id from the dom
  // path on every body element that lacks one, on load.
  const ID_SCRIPT = `<script data-od-edit-bridge>(function () {
  var HOST = '[data-od-sandbox-shim],[data-od-deck-bridge],[data-od-comment-bridge],' +
    '[data-od-edit-bridge],[data-od-comment-bridge-style],[data-od-edit-bridge-style],' +
    '[data-od-deck-fix]';
  function isHost(el) { return !!(el.matches && el.matches(HOST)); }
  function domPath(el) {
    var parts = [], node = el;
    while (node && node !== document.body) {
      var parentEl = node.parentElement;
      if (!parentEl) break;
      var kids = Array.prototype.slice.call(parentEl.children)
        .filter(function (c) { return !isHost(c); });
      parts.unshift(kids.indexOf(node));
      node = parentEl;
    }
    return parts.length ? 'path-' + parts.join('-') : '';
  }
  function assign() {
    var all = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.getAttribute('data-od-id') || isHost(el)) continue;
      var p = domPath(el);
      if (p) el.setAttribute('data-od-id', p);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', assign);
  else assign();
})();<\/script>`;

  // function: the iframe srcdoc. doc mode builds the chrome and an empty
  // matrix; file mode appends the guides sheet and the id script to the
  // caller's text.
  function baseDocument(mode, fileText) {
    if (mode === "file") {
      return String(fileText || "") + "\n" + GUIDES_CSS + "\n" + ID_SCRIPT;
    }
    return "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
      + "<style>" + CHROME_CSS + "</style>\n"
      + "<style>" + CANVAS_CSS + "</style>\n"
      + "</head>\n<body>\n<div id=\"matrix\"></div>\n</body>\n</html>";
  }

  // function: the target select. Current targets filtered to .json and
  // .html; New picks a file from the root browser.
  function optionControls() {
    function listFn() {
      const sid = MX.grid && MX.grid.sid;
      return MX.targetsFor(sid).then((values) =>
        values.filter((v) => /\.(json|html)$/i.test(String(v))));
    }

    function onNew(frame) {
      return new Promise((resolve) => {
        MX.openRootBrowser("/", (path) => {
          if (path) frame.setOption("target", path);
          resolve();
        }, { ext: [".json", ".html"] });
      });
    }

    return { target: MX.targetControl(listFn, onNew) };
  }

  // function: one mirror per canvas channel. handlers keyed by short name.
  function mirrors(frame, handlers) {
    handlers = handlers || {};
    const out = {};
    const keys = Object.keys(CHANNELS);
    for (const key of keys) {
      out[key] = MX.mirror(frame, CHANNELS[key], handlers[key] || (() => {}));
    }
    out.off = function () {
      for (const key of keys) out[key].off();
    };
    return out;
  }

  MX.canvasCore = function () {
    return MX.moduleReady("canvas", () => Promise.resolve({
      kit: MX.canvasKit(),
      makeState: MX.canvasState,
      makeResolve: MX.canvasResolve,
      makeRender: MX.canvasRender,
      patch: MX.canvasPatch(),
      baseDocument: baseDocument,
      channels: CHANNELS,
      optionControls: optionControls,
      mirrors: mirrors
    }));
  };
})();
