// canvas core — the one door every canvas widget opens
//
// MX.canvasCore(): a memoized promise of {patch, baseDocument, channels,
// optionControls, mirrors}.
// baseDocument(mode, fileText, baseHref): the iframe srcdoc. The caller's
// file text with a base tag in head when baseHref is given, the guides
// stylesheet and the id-assign script appended.
// channels: the six canvas.* names, contract 2.7.
// optionControls(): the target select, current targets filtered to
// .html, New opens the shared root browser.
// MX.canvasTargetControl(withNew): the same target select, sync.
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

  // function: the iframe srcdoc. The caller's text with the guides sheet
  // and the id script appended.
  function baseDocument(mode, fileText, baseHref) {
    let text = String(fileText || "");
    if (baseHref) {
      const tag = '<base href="' + baseHref + '">';
      const head = text.match(/<head[^>]*>/i);
      const html = text.match(/<html[^>]*>/i);
      if (head) text = text.slice(0, head.index + head[0].length) + tag + text.slice(head.index + head[0].length);
      else if (html) text = text.slice(0, html.index + html[0].length) + tag + text.slice(html.index + html[0].length);
      else text = tag + text;
    }
    return text + "\n" + GUIDES_CSS + "\n" + ID_SCRIPT;
  }

  // state: widget types of the canvas family.
  const CANVAS_TYPES = ["canvas", "canvas_code", "canvas_tools"];

  // function: the target select, sync. Targets held by canvas family
  // widgets, .html only. withNew adds New, the shared root browser.
  MX.canvasTargetControl = function (withNew) {
    function listFn() {
      const sid = MX.grid && MX.grid.sid;
      return MX.targetsFor(sid, CANVAS_TYPES).then((values) =>
        values.filter((v) => /\.html?$/i.test(String(v))));
    }

    // shared root browser, native or suite per global.json
    function onNew(frame) {
      return new Promise((resolve) => {
        MX.openRootBrowser("/", (path) => {
          if (path) frame.setOption("target", path);
          resolve();
        }, { ext: [".html"] });
      });
    }

    return MX.targetControl(listFn, withNew ? onNew : null);
  };

  // function: the Canvas widget's target entry, with New.
  function optionControls() {
    return { target: MX.canvasTargetControl(true) };
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
      patch: MX.canvasPatch(),
      baseDocument: baseDocument,
      channels: CHANNELS,
      optionControls: optionControls,
      mirrors: mirrors
    }));
  };
})();
