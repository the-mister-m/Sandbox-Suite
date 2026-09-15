// canvas widget — one iframe per frame, file mode
//
// Frames: "open" (ask for the target), "file" (its text), "save" (write it),
// "saved" (the gate outcome), "tree_dirty" (someone else wrote).
//
// State: the file's source string, patched in place. No module-level state:
// two canvases in one grid share nothing.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const DRAG_THRESHOLD = 4;
  const MODES = ["code", "canvas", "preview"];
  const SNAPSHOT_MODES = ["raster", "playwright", "none"];
  const ZOOM_MIN = 25;
  const ZOOM_MAX = 400;
  const ZOOM_STOPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];
  const SNAP_TO = ["grid", "guides", "objects"];
  const SNAP_PX = 6;
  const RULER_PX = 20;
  const PAGE_TOKENS = {
    w: "--cc-page-w", h: "--cc-page-h",
    marginTop: "--cc-margin-top", marginRight: "--cc-margin-right",
    marginBottom: "--cc-margin-bottom", marginLeft: "--cc-margin-left",
    columns: "--cc-columns", gutter: "--cc-gutter",
    bleed: "--cc-bleed", grid: "--cc-grid"
  };
  const PAGE_FALLBACK = {
    w: 816, h: 1056, marginTop: 48, marginRight: 48, marginBottom: 48,
    marginLeft: 48, columns: 3, gutter: 16, bleed: 0, grid: 8
  };

  function ensureStyles() {
    if (document.getElementById("mxcv-style")) return;
    const style = document.createElement("style");
    style.id = "mxcv-style";
    style.textContent = `
      .mxcv-wrap { display: flex; flex-direction: column; height: 100%; }
      .mxcv-wrap [hidden] { display: none !important; }
      .mxcv-bar { display: flex; align-items: center; gap: 4px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; flex-wrap: wrap; }
      .mxcv-targets { display: flex; gap: 2px; padding: 2px 6px; flex: 0 0 auto;
        overflow-x: auto; border-bottom: 1px solid var(--border, #333); }
      .mxcv-tab { padding: 2px 6px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--border, #333); color: var(--text-2, #aaa);
        background: none; white-space: nowrap; }
      .mxcv-tab.mxcv-on { background: var(--surface-2, #1c1c1c); color: var(--text-1, #ddd); }
      .mxcv-path { flex: 1 1 auto; font-size: 11px; color: var(--text-2, #aaa);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mxcv-status { font-size: 11px; color: var(--text-3, #888); min-width: 3em; text-align: right; }
      .mxcv-btn-on { border-color: #2a6df4; color: var(--text-1, #ddd); box-shadow: inset 0 -2px 0 #2a6df4; }
      .mxcv-body { flex: 1 1 auto; min-height: 0; display: flex; position: relative; }
      .mxcv-frame { flex: 1 1 auto; border: 0; width: 100%; height: 100%; background: #ffffff; }
    `;
    document.head.appendChild(style);
  }

  function mkBtn(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mx-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function basename(path) {
    if (!path) return "";
    const parts = String(path).replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || String(path);
  }

  // function: writes the status line; one blanking timer per instance.
  function setStatus(cv, text, sticky) {
    if (!cv.statusEl) return;
    if (cv.statusTimer) { clearTimeout(cv.statusTimer); cv.statusTimer = null; }
    cv.statusEl.textContent = text;
    if (text && !sticky && text !== "dirty") {
      cv.statusTimer = setTimeout(() => {
        cv.statusTimer = null;
        if (cv.statusEl) cv.statusEl.textContent = "";
      }, 2500);
    }
  }

  function markDirty(cv) {
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(cv.frame);
  }

  // function: file mode for .html, nothing else.
  function modeForTarget(target) {
    if (/\.html?$/i.test(target)) return "file";
    return "";
  }

  // ---------- iframe ----------

  function loadIframe(cv, html) {
    return new Promise((resolve) => {
      const f = cv.iframe;
      const done = () => {
        f.removeEventListener("load", done);
        resolve(f.contentDocument);
      };
      f.addEventListener("load", done);
      f.srcdoc = html;
    });
  }

  function blankIframe(cv) {
    cv.idoc = null;
    cv.iwin = null;
    if (cv.iframe) cv.iframe.srcdoc = "<!doctype html><html><head></head><body></body></html>";
  }

  // ---------- selection ----------

  // function: set the selection and announce it on the mirror.
  function setSelection(cv, ids) {
    cv.selection = ids.slice();
    paintFileSelection(cv);
    if (cv.mirrors) cv.mirrors.select.emit({ ids: cv.selection.slice() });
    markDirty(cv);
  }

  // function: selection from a sibling. Painted, never re-emitted.
  // state: isolate absent leaves isolate as it is.
  function applySelection(cv, ids, isolate) {
    cv.selection = Array.isArray(ids) ? ids.slice() : [];
    if (isolate !== undefined) {
      cv.isolate = isolate && cv.selection.length ? cv.selection.slice() : null;
    }
    paintFileSelection(cv);
  }

  function closeMenu(cv) {
    if (cv.menu && cv.menu.parentNode) cv.menu.parentNode.removeChild(cv.menu);
    cv.menu = null;
  }

  // function: the context menu element. [label, fn] rows at a point. The
  // inline rules carry the look into file mode, which has no chrome sheet.
  function openMenuItems(cv, x, y, items) {
    closeMenu(cv);
    const menu = cv.idoc.createElement("div");
    menu.className = "cc-canvas-menu";
    menu.setAttribute("data-od-edit-bridge", "menu");
    menu.style.cssText = "position: fixed; z-index: 2147483647; background: #ffffff; "
      + "border: 1px solid #d0d0d0; box-shadow: 0 2px 8px rgba(0,0,0,0.15); "
      + "font: 13px system-ui, sans-serif; padding: 4px 0;";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menuRows(cv, menu, items);
    cv.idoc.body.appendChild(menu);
    cv.menu = menu;
  }

  // function: one menu level. [label, fn] is a leaf, [label, items] opens
  // a submenu on hover.
  function menuRows(cv, host, items) {
    for (let i = 0; i < items.length; i++) {
      const label = items[i][0];
      const body = items[i][1];
      const row = cv.idoc.createElement("div");
      row.style.cssText = "padding: 4px 16px; cursor: default; position: relative;";
      if (Array.isArray(body)) {
        row.textContent = label + " ▸";
        const sub = cv.idoc.createElement("div");
        sub.setAttribute("data-cc-submenu", label);
        sub.style.cssText = "position: absolute; left: 100%; top: -4px; display: none; "
          + "background: #ffffff; border: 1px solid #d0d0d0; min-width: 9em; "
          + "box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 4px 0;";
        menuRows(cv, sub, body);
        row.appendChild(sub);
        row.addEventListener("mouseenter", () => { sub.style.display = "block"; });
        row.addEventListener("mouseleave", () => { sub.style.display = "none"; });
      } else {
        row.textContent = label;
        row.addEventListener("mousedown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          closeMenu(cv);
          body();
        });
      }
      host.appendChild(row);
    }
  }

  // function: menu rows for the current selection. Shared by the canvas's
  // own menus and the Layers panel's right-click.
  function menuItems(cv) {
    const sel = () => cv.selection.slice();
    const layerRows = layerList(cv).map((ly) =>
      [ly.name || ly.id, () => moveToLayer(cv, sel(), ly.id)]);
    return [
      ["Group", () => fileGroup(cv, sel())],
      ["Ungroup", () => fileUngroup(cv, cv.selection[0])],
      ["Isolate", () => setIsolate(cv, sel())],
      ["Arrange", [
        ["Bring to front", () => fileOrder(cv, sel(), "front")],
        ["Bring forward", () => fileOrder(cv, sel(), "forward")],
        ["Send backward", () => fileOrder(cv, sel(), "back")],
        ["Send to back", () => fileOrder(cv, sel(), "toBack")]
      ]],
      ["Lock", () => lockSelection(cv)],
      ["Unlock all", () => unlockAll(cv)],
      ["Hide", () => hideSelection(cv)],
      ["Show all", () => showAll(cv)],
      ["Move to layer", layerRows],
      ["Duplicate", () => fileDuplicate(cv, sel())],
      ["Delete", () => fileRemove(cv, sel())]
    ];
  }

  // function: true when the key belongs to a text field.
  function editingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }

  function detachListeners(cv) {
    for (const [el, type, fn, opts] of cv.listeners) {
      try { el.removeEventListener(type, fn, opts); } catch (e) { /* teardown best effort */ }
    }
    cv.listeners = [];
  }

  // ---------- file mode, ported from Open Design bridge.ts ----------

  function isHostNode(cv, el) {
    const sel = cv.patch.HOST_NODE_SELECTOR;
    return !!(el && el.matches && el.matches(sel));
  }

  // function: true for the port's own chrome inside the iframe.
  function inChrome(target) {
    return !!(target && target.closest
      && target.closest(".cc-canvas-menu, [data-od-edit-guides-layer], [data-od-edit-bridge=\"rulers\"]"));
  }

  // function: true for a layer section, empty click passes through it.
  function isLayerSection(el) {
    return !!(el && el.matches && el.matches("[data-cc-layer]"));
  }

  // function: true for an svg layer's own root, empty click passes through it.
  function isSvgLayerRoot(el) {
    return !!(el && el.tagName && el.tagName.toLowerCase() === "svg"
      && el.parentElement && isLayerSection(el.parentElement));
  }

  // function: elements under the point, next one after a section/svg root.
  function elementBelow(cv, e) {
    if (!cv.idoc.elementsFromPoint) return null;
    const stack = cv.idoc.elementsFromPoint(e.clientX, e.clientY);
    for (let i = 0; i < stack.length; i++) {
      const el = stack[i];
      if (el === cv.idoc.body || el === cv.idoc.documentElement) return null;
      if (isHostNode(cv, el)) continue;
      if (isLayerSection(el) || isSvgLayerRoot(el)) continue;
      return el;
    }
    return null;
  }

  // function: true inside a locked layer or a locked element.
  function isLocked(el) {
    return !!(el && el.closest && el.closest("[data-cc-locked]"));
  }

  // function: the hit, or null. state: locked stops it, isolate narrows it.
  function hitGate(cv, el) {
    if (!el || isLocked(el)) return null;
    if (!cv.isolate || !cv.isolate.length) return el;
    for (let i = 0; i < cv.isolate.length; i++) {
      const root = cv.patch.find(cv.idoc, cv.isolate[i]);
      if (root && (root === el || root.contains(el))) return el;
    }
    return null;
  }

  function closestTarget(cv, e) {
    let el = e.target;
    while (el && el.nodeType === 1) {
      if (el === cv.idoc.body || el === cv.idoc.documentElement) return null;
      if (isHostNode(cv, el)) { el = el.parentElement; continue; }
      if (isLayerSection(el) || isSvgLayerRoot(el)) return hitGate(cv, elementBelow(cv, e));
      return hitGate(cv, el);
    }
    return null;
  }

  function rectFor(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height)
    };
  }

  // ---------- page geometry, zoom ----------

  // function: the page tokens off :root. Falls back to the 3.1 defaults.
  function pageMetrics(cv) {
    const out = Object.assign({}, PAGE_FALLBACK);
    if (!cv.idoc || !cv.iwin || !cv.idoc.documentElement) return out;
    let style = null;
    try { style = cv.iwin.getComputedStyle(cv.idoc.documentElement); } catch (err) { return out; }
    Object.keys(PAGE_TOKENS).forEach((key) => {
      const raw = (style.getPropertyValue(PAGE_TOKENS[key]) || "").trim();
      if (!raw) return;
      const n = parseFloat(raw);
      if (!isNaN(n)) out[key] = n;
    });
    if (!(out.grid > 0)) out.grid = PAGE_FALLBACK.grid;
    return out;
  }

  function clampZoom(pct) {
    const n = Math.round(Number(pct) || 100);
    if (!n) return 100;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n));
  }

  // function: the snapTo option, unknown names dropped.
  function cleanSnapTo(value) {
    if (!Array.isArray(value)) return SNAP_TO.slice();
    const out = value.filter((v) => SNAP_TO.indexOf(v) >= 0);
    return out;
  }

  function zoomScale(cv) {
    const pct = Number(cv.zoomPct) || 100;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pct)) / 100;
  }

  // function: the page's top-left in viewport px.
  function pageOrigin(cv) {
    if (!cv.idoc || !cv.idoc.body) return { x: 0, y: 0 };
    const r = cv.idoc.body.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  // function: viewport point to page px.
  function toPage(cv, clientX, clientY) {
    const o = pageOrigin(cv);
    const s = zoomScale(cv);
    return { x: (clientX - o.x) / s, y: (clientY - o.y) / s };
  }

  // function: page px to viewport point.
  function toView(cv, pageX, pageY) {
    const o = pageOrigin(cv);
    const s = zoomScale(cv);
    return { x: o.x + pageX * s, y: o.y + pageY * s };
  }

  // function: an element's rect in page px.
  function pageRectFor(cv, el) {
    const r = rectFor(el);
    if (!r) return null;
    const o = pageOrigin(cv);
    const s = zoomScale(cv);
    return {
      x: (r.x - o.x) / s, y: (r.y - o.y) / s,
      width: r.width / s, height: r.height / s
    };
  }

  // function: scale on body, scroll room on html. state: origin 0 0.
  function applyZoom(cv) {
    if (!cv.idoc || !cv.idoc.body) return;
    const s = zoomScale(cv);
    const body = cv.idoc.body;
    const html = cv.idoc.documentElement;
    body.style.transformOrigin = "0 0";
    body.style.transform = s === 1 ? "" : "scale(" + s + ")";
    const page = pageMetrics(cv);
    const offset = body.offsetLeft || 0;
    html.style.minWidth = Math.ceil(offset + page.w * s) + "px";
    html.style.minHeight = Math.ceil(page.h * s) + "px";
    if (cv.zoomEl) cv.zoomEl.textContent = Math.round(s * 100) + "%";
  }

  function setZoom(cv, pct, anchor) {
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(Number(pct) || 100)));
    if (next === cv.zoomPct) return;
    const before = anchor ? toPage(cv, anchor.x, anchor.y) : null;
    cv.zoomPct = next;
    applyZoom(cv);
    if (before && cv.iwin) {
      const after = toView(cv, before.x, before.y);
      cv.iwin.scrollBy(after.x - anchor.x, after.y - anchor.y);
    }
    cv.frame.setOption("zoomPct", next);
    paintChrome(cv);
  }

  // function: the next stop up or down from the current zoom.
  function zoomStep(cv, dir) {
    const cur = cv.zoomPct;
    if (dir > 0) {
      for (let i = 0; i < ZOOM_STOPS.length; i++) if (ZOOM_STOPS[i] > cur) return ZOOM_STOPS[i];
      return ZOOM_MAX;
    }
    for (let i = ZOOM_STOPS.length - 1; i >= 0; i--) if (ZOOM_STOPS[i] < cur) return ZOOM_STOPS[i];
    return ZOOM_MIN;
  }

  function zoomFit(cv) {
    if (!cv.iwin || !cv.idoc) return;
    const page = pageMetrics(cv);
    const w = cv.iwin.innerWidth - RULER_PX - 16;
    const h = cv.iwin.innerHeight - RULER_PX - 16;
    if (!(page.w > 0) || !(page.h > 0)) return;
    const s = Math.min(w / page.w, h / page.h);
    setZoom(cv, s * 100);
  }

  // ---------- rulers, page chrome ----------

  const CHROME_CSS = `
[data-od-edit-bridge="rulers"] { position: fixed; inset: 0; z-index: 2147483645;
  pointer-events: none; font: 9px/1 Inter, system-ui, sans-serif; }
[data-od-edit-bridge="rulers"] .cc-ruler { position: fixed; background: #16181c;
  color: #8b929c; pointer-events: auto; overflow: hidden; }
[data-od-edit-bridge="rulers"] .cc-ruler-top { top: 0; left: 20px; right: 0;
  height: 20px; border-bottom: 1px solid #2b3038; cursor: row-resize; }
[data-od-edit-bridge="rulers"] .cc-ruler-left { top: 20px; left: 0; bottom: 0;
  width: 20px; border-right: 1px solid #2b3038; cursor: col-resize; }
[data-od-edit-bridge="rulers"] .cc-ruler-corner { position: fixed; top: 0; left: 0;
  width: 20px; height: 20px; background: #16181c; border-right: 1px solid #2b3038;
  border-bottom: 1px solid #2b3038; }
[data-od-edit-bridge="rulers"] .cc-tick { position: absolute; background: #3d444e; }
[data-od-edit-bridge="rulers"] .cc-tick-v { width: 1px; top: 13px; bottom: 0; }
[data-od-edit-bridge="rulers"] .cc-tick-h { height: 1px; left: 13px; right: 0; }
[data-od-edit-bridge="rulers"] .cc-tick-major { background: #6d7684; }
[data-od-edit-bridge="rulers"] .cc-tick-major.cc-tick-v { top: 6px; }
[data-od-edit-bridge="rulers"] .cc-tick-major.cc-tick-h { left: 6px; }
[data-od-edit-bridge="rulers"] .cc-num { position: absolute; color: #9aa3ae; }
[data-od-edit-bridge="rulers"] .cc-num-v { top: 2px; margin-left: 2px; }
[data-od-edit-bridge="rulers"] .cc-num-h { left: 2px; margin-top: 2px;
  writing-mode: vertical-rl; }
[data-od-edit-guides-layer] .cc-line { position: fixed; }
[data-od-edit-guides-layer] .cc-line-v { width: 1px; }
[data-od-edit-guides-layer] .cc-line-h { height: 1px; }
[data-od-edit-guides-layer] .cc-line-margin { background: rgba(255, 0, 170, 0.55); }
[data-od-edit-guides-layer] .cc-line-column { background: rgba(140, 90, 255, 0.45); }
[data-od-edit-guides-layer] .cc-line-guide { background: rgba(0, 200, 255, 0.85); }
[data-od-edit-guides-layer] .cc-line-snap { background: #ffd23f; }
`;

  // function: the chrome stylesheet inside the iframe. state: a host node.
  function ensureChromeStyles(cv) {
    if (!cv.idoc) return;
    const head = cv.idoc.head || cv.idoc.documentElement;
    if (cv.idoc.querySelector("style[data-cc-chrome]")) return;
    const style = cv.idoc.createElement("style");
    style.setAttribute("data-cc-chrome", "1");
    style.setAttribute("data-od-edit-bridge-style", "");
    style.textContent = CHROME_CSS;
    head.appendChild(style);
  }

  // function: the ruler host, outside body so zoom never scales it.
  function ensureRulerHost(cv) {
    let host = cv.idoc.querySelector('[data-od-edit-bridge="rulers"]');
    if (host) return host;
    host = cv.idoc.createElement("div");
    host.setAttribute("data-od-edit-bridge", "rulers");
    host.setAttribute("aria-hidden", "true");
    cv.idoc.documentElement.appendChild(host);
    return host;
  }

  // function: a tick step that stays at least 4 viewport px apart.
  function tickStep(grid, scale) {
    let step = grid > 0 ? grid : PAGE_FALLBACK.grid;
    while (step * scale < 4) step *= 2;
    return step;
  }

  function addNode(doc, parent, className, style, text) {
    const node = doc.createElement("div");
    node.className = className;
    Object.keys(style || {}).forEach((key) => { node.style[key] = style[key]; });
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  // function: both ruler strips in page px. state: rebuilt only when the
  // view changed.
  function renderRulers(cv) {
    if (!cv.idoc || !cv.iwin) return;
    if (!cv.rulers || cv.mode !== "canvas" || cv.docMode !== "file") {
      const gone = cv.idoc.querySelector('[data-od-edit-bridge="rulers"]');
      if (gone && gone.parentNode) gone.parentNode.removeChild(gone);
      cv.rulerSig = "";
      return;
    }
    const o = pageOrigin(cv);
    const s = zoomScale(cv);
    const sig = [o.x, o.y, s, cv.iwin.innerWidth, cv.iwin.innerHeight].join(":");
    const host = ensureRulerHost(cv);
    if (sig === cv.rulerSig && host.firstChild) return;
    cv.rulerSig = sig;
    host.replaceChildren();
    addNode(cv.idoc, host, "cc-ruler-corner", {});
    const top = addNode(cv.idoc, host, "cc-ruler cc-ruler-top", {});
    const left = addNode(cv.idoc, host, "cc-ruler cc-ruler-left", {});
    top.setAttribute("data-cc-ruler", "h");
    left.setAttribute("data-cc-ruler", "v");

    const page = pageMetrics(cv);
    const step = tickStep(page.grid, s);
    const major = 100;

    const firstX = Math.floor((RULER_PX - o.x) / s / step) * step;
    const lastX = (cv.iwin.innerWidth - o.x) / s;
    for (let x = firstX; x <= lastX; x += step) {
      const vx = o.x + x * s - RULER_PX;
      if (vx < 0) continue;
      const isMajor = Math.abs(x % major) < 0.001;
      const tick = addNode(cv.idoc, top, "cc-tick cc-tick-v" + (isMajor ? " cc-tick-major" : ""),
        { left: Math.round(vx) + "px" });
      tick.setAttribute("data-cc-px", String(Math.round(x)));
      if (isMajor) {
        addNode(cv.idoc, top, "cc-num cc-num-v", { left: Math.round(vx) + "px" }, String(Math.round(x)));
      }
    }

    const firstY = Math.floor((RULER_PX - o.y) / s / step) * step;
    const lastY = (cv.iwin.innerHeight - o.y) / s;
    for (let y = firstY; y <= lastY; y += step) {
      const vy = o.y + y * s - RULER_PX;
      if (vy < 0) continue;
      const isMajor = Math.abs(y % major) < 0.001;
      const tick = addNode(cv.idoc, left, "cc-tick cc-tick-h" + (isMajor ? " cc-tick-major" : ""),
        { top: Math.round(vy) + "px" });
      tick.setAttribute("data-cc-px", String(Math.round(y)));
      if (isMajor) {
        addNode(cv.idoc, left, "cc-num cc-num-h", { top: Math.round(vy) + "px" }, String(Math.round(y)));
      }
    }
  }

  // function: one full-height or full-width line at a page coordinate.
  function drawPageLine(cv, layer, axis, px, className) {
    const v = toView(cv, px, px);
    if (axis === "v") {
      addNode(cv.idoc, layer, "cc-line cc-line-v " + className,
        { left: Math.round(v.x) + "px", top: "0px", height: "100%" });
    } else {
      addNode(cv.idoc, layer, "cc-line cc-line-h " + className,
        { top: Math.round(v.y) + "px", left: "0px", width: "100%" });
    }
  }

  // function: margins, columns and guides, in page px.
  function drawPageChrome(cv, layer) {
    if (cv.mode !== "canvas") return;
    const page = pageMetrics(cv);
    if (cv.showMargins) {
      drawPageLine(cv, layer, "v", page.marginLeft, "cc-line-margin");
      drawPageLine(cv, layer, "v", page.w - page.marginRight, "cc-line-margin");
      drawPageLine(cv, layer, "h", page.marginTop, "cc-line-margin");
      drawPageLine(cv, layer, "h", page.h - page.marginBottom, "cc-line-margin");
    }
    if (cv.showColumns) {
      const cols = Math.max(1, Math.round(page.columns));
      const inner = page.w - page.marginLeft - page.marginRight;
      const colW = (inner - page.gutter * (cols - 1)) / cols;
      for (let i = 0; i < cols; i++) {
        const x0 = page.marginLeft + i * (colW + page.gutter);
        if (i > 0) drawPageLine(cv, layer, "v", x0, "cc-line-column");
        if (i < cols - 1) drawPageLine(cv, layer, "v", x0 + colW, "cc-line-column");
      }
    }
    if (cv.showGuides) {
      for (const px of cv.guides.v) drawPageLine(cv, layer, "v", px, "cc-line-guide");
      for (const px of cv.guides.h) drawPageLine(cv, layer, "h", px, "cc-line-guide");
    }
  }

  // ---------- guides ----------

  // function: "v:120;h:300" to {v:[…], h:[…]}.
  function parseGuides(text) {
    const out = { v: [], h: [] };
    String(text || "").split(";").forEach((part) => {
      const bits = part.split(":");
      const axis = (bits[0] || "").trim();
      const px = Math.round(parseFloat(bits[1]));
      if ((axis !== "v" && axis !== "h") || isNaN(px)) return;
      if (out[axis].indexOf(px) === -1) out[axis].push(px);
    });
    out.v.sort((a, b) => a - b);
    out.h.sort((a, b) => a - b);
    return out;
  }

  function formatGuides(g) {
    const parts = [];
    for (const px of g.v) parts.push("v:" + px);
    for (const px of g.h) parts.push("h:" + px);
    return parts.join(";");
  }

  // function: cv.guides from body's data-cc-guides.
  function readGuides(cv) {
    if (!cv.idoc || !cv.idoc.body) return;
    cv.guides = parseGuides(cv.idoc.body.getAttribute("data-cc-guides"));
  }

  // function: the guide set onto body through set-attr. state: undoable.
  function writeGuides(cv, next) {
    const text = formatGuides(next);
    cv.guides = next;
    return patchSource(cv, {
      kind: "set-attr", id: "__body__",
      name: "data-cc-guides", value: text || null
    });
  }

  function addGuide(cv, axis, px) {
    if (axis !== "v" && axis !== "h") return false;
    const value = Math.round(Number(px));
    if (isNaN(value)) return false;
    const next = { v: cv.guides.v.slice(), h: cv.guides.h.slice() };
    if (next[axis].indexOf(value) >= 0) return false;
    next[axis].push(value);
    next[axis].sort((a, b) => a - b);
    return writeGuides(cv, next);
  }

  function removeGuide(cv, axis, px) {
    if (axis !== "v" && axis !== "h") return false;
    const value = Math.round(Number(px));
    const next = { v: cv.guides.v.slice(), h: cv.guides.h.slice() };
    const at = next[axis].indexOf(value);
    if (at === -1) return false;
    next[axis].splice(at, 1);
    return writeGuides(cv, next);
  }

  // function: the ruler a press landed on, or "".
  function rulerAt(target) {
    const strip = target && target.closest && target.closest("[data-cc-ruler]");
    return strip ? strip.getAttribute("data-cc-ruler") : "";
  }

  // function: an existing guide within 4 viewport px of the press.
  function guideAt(cv, e) {
    const s = zoomScale(cv);
    const o = pageOrigin(cv);
    for (const px of cv.guides.v) {
      if (Math.abs(o.x + px * s - e.clientX) <= 4) return { axis: "v", px: px };
    }
    for (const px of cv.guides.h) {
      if (Math.abs(o.y + px * s - e.clientY) <= 4) return { axis: "h", px: px };
    }
    return null;
  }

  // function: a press that makes or moves a guide. true when claimed.
  function startGuideDrag(cv, e) {
    if (cv.mode !== "canvas" || cv.docMode !== "file") return false;
    const strip = rulerAt(e.target);
    if (strip) {
      cv.guideDrag = { axis: strip === "h" ? "h" : "v", from: null, px: null };
      e.preventDefault();
      return true;
    }
    if (!cv.showGuides || inChrome(e.target)) return false;
    const hit = guideAt(cv, e);
    if (!hit) return false;
    cv.guideDrag = { axis: hit.axis, from: hit.px, px: hit.px };
    e.preventDefault();
    return true;
  }

  function moveGuideDrag(cv, e) {
    const gd = cv.guideDrag;
    if (!gd) return;
    const pt = toPage(cv, e.clientX, e.clientY);
    gd.px = Math.round(gd.axis === "v" ? pt.x : pt.y);
    gd.overRuler = gd.axis === "v" ? e.clientX < RULER_PX : e.clientY < RULER_PX;
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    renderRulers(cv);
    drawPageChrome(cv, layer);
    if (!gd.overRuler) drawPageLine(cv, layer, gd.axis, gd.px, "cc-line-snap");
    drawSelection(cv, layer);
    e.preventDefault();
  }

  function endGuideDrag(cv, e) {
    const gd = cv.guideDrag;
    cv.guideDrag = null;
    if (!gd) return;
    const onRuler = gd.axis === "v" ? e.clientX < RULER_PX : e.clientY < RULER_PX;
    if (gd.from === null) {
      if (!onRuler && gd.px !== null) addGuide(cv, gd.axis, gd.px);
    } else if (onRuler) {
      removeGuide(cv, gd.axis, gd.from);
    } else if (gd.px !== null && gd.px !== gd.from) {
      const next = { v: cv.guides.v.slice(), h: cv.guides.h.slice() };
      const at = next[gd.axis].indexOf(gd.from);
      if (at >= 0) next[gd.axis].splice(at, 1);
      if (next[gd.axis].indexOf(gd.px) === -1) next[gd.axis].push(gd.px);
      next[gd.axis].sort((a, b) => a - b);
      writeGuides(cv, next);
    }
    paintChrome(cv);
  }

  // ---------- snap ----------

  // function: every item element in the page, host nodes and the dragged
  // set left out.
  function snapObjects(cv, exclude) {
    const out = [];
    if (!cv.idoc || !cv.idoc.body) return out;
    const all = cv.idoc.body.querySelectorAll("[data-od-id]");
    for (let i = 0; i < all.length && out.length < 200; i++) {
      const el = all[i];
      if (isHostNode(cv, el) || isLayerSection(el)) continue;
      if (exclude && exclude.indexOf(el.getAttribute("data-od-id")) >= 0) continue;
      const r = pageRectFor(cv, el);
      if (r && r.width >= 0) out.push(r);
    }
    return out;
  }

  // function: snap targets on one axis, in page px.
  function snapTargets(cv, axis, exclude) {
    const list = [];
    if (cv.snapTo.indexOf("guides") >= 0) {
      const set = axis === "x" ? cv.guides.v : cv.guides.h;
      for (const px of set) list.push(px);
    }
    if (cv.snapTo.indexOf("objects") >= 0) {
      for (const r of snapObjects(cv, exclude)) {
        const lo = axis === "x" ? r.x : r.y;
        const size = axis === "x" ? r.width : r.height;
        list.push(lo, lo + size / 2, lo + size);
      }
    }
    return list;
  }

  // function: one axis snapped. {value, line} — line is null when nothing hit.
  function snapAxis(cv, axis, value, exclude, cached) {
    if (!cv.snap) return { value: value, line: null };
    let best = null;
    let bestGap = SNAP_PX + 0.001;
    if (cv.snapTo.indexOf("grid") >= 0) {
      const page = pageMetrics(cv);
      const step = page.grid > 0 ? page.grid : PAGE_FALLBACK.grid;
      const at = Math.round(value / step) * step;
      const gap = Math.abs(at - value);
      if (gap < bestGap) { best = at; bestGap = gap; }
    }
    const targets = cached || snapTargets(cv, axis, exclude);
    for (let i = 0; i < targets.length; i++) {
      const gap = Math.abs(targets[i] - value);
      if (gap < bestGap) { best = targets[i]; bestGap = gap; }
    }
    if (best === null) return { value: value, line: null };
    return { value: best, line: best };
  }

  // function: a page point snapped on both axes.
  function snapPoint(cv, pt) {
    const x = Number(pt && pt.x) || 0;
    const y = Number(pt && pt.y) || 0;
    return {
      x: snapAxis(cv, "x", x, cv.selection).value,
      y: snapAxis(cv, "y", y, cv.selection).value
    };
  }

  // function: the drag delta snapped so the lead's left/top edge lands on a
  // target. state: page px in, page px out.
  function snapDrag(cv, drag, dx, dy) {
    const lines = [];
    if (!cv.snap || !drag.items.length) return { dx: dx, dy: dy, lines: lines };
    if (!drag.startRect) {
      drag.startRect = pageRectFor(cv, drag.items[0].el);
      drag.targetsX = snapTargets(cv, "x", drag.ids);
      drag.targetsY = snapTargets(cv, "y", drag.ids);
    }
    const start = drag.startRect;
    if (!start) return { dx: dx, dy: dy, lines: lines };
    const sx = snapAxis(cv, "x", start.x + dx, drag.ids, drag.targetsX);
    const sy = snapAxis(cv, "y", start.y + dy, drag.ids, drag.targetsY);
    if (sx.line !== null) lines.push({ axis: "v", px: sx.line });
    if (sy.line !== null) lines.push({ axis: "h", px: sy.line });
    return { dx: sx.value - start.x, dy: sy.value - start.y, lines: lines };
  }

  function drawSnapLines(cv, layer, lines) {
    for (const line of lines || []) {
      drawPageLine(cv, layer, line.axis, line.px, "cc-line-snap");
    }
  }

  function siblingRectsFor(cv, el) {
    const parent = el && el.parentElement;
    if (!parent) return [];
    return Array.prototype.slice.call(parent.children)
      .filter((child) => child !== el && !isHostNode(cv, child))
      .map(rectFor)
      .filter(Boolean)
      .slice(0, 24);
  }

  // function: six edge and centre lines for a rect, plus the parent's centres.
  function alignmentGuidesFor(rect, parentRect) {
    const guides = [];
    if (!rect) return guides;
    guides.push({ orientation: "vertical", position: rect.x, label: "left" });
    guides.push({ orientation: "vertical", position: rect.x + Math.round(rect.width / 2), label: "center" });
    guides.push({ orientation: "vertical", position: rect.x + rect.width, label: "right" });
    guides.push({ orientation: "horizontal", position: rect.y, label: "top" });
    guides.push({ orientation: "horizontal", position: rect.y + Math.round(rect.height / 2), label: "middle" });
    guides.push({ orientation: "horizontal", position: rect.y + rect.height, label: "bottom" });
    if (parentRect) {
      guides.push({ orientation: "vertical", position: parentRect.x + Math.round(parentRect.width / 2), label: "parent center" });
      guides.push({ orientation: "horizontal", position: parentRect.y + Math.round(parentRect.height / 2), label: "parent middle" });
    }
    return guides;
  }

  // function: four parent gaps plus the nearest sibling gap.
  function measurementsFor(rect, parentRect, siblings) {
    const out = [];
    if (!rect || !parentRect) return out;
    out.push({ label: "left", value: Math.max(0, Math.round(rect.x - parentRect.x)), orientation: "horizontal", from: parentRect, to: rect });
    out.push({ label: "top", value: Math.max(0, Math.round(rect.y - parentRect.y)), orientation: "vertical", from: parentRect, to: rect });
    out.push({ label: "right", value: Math.max(0, Math.round(parentRect.x + parentRect.width - rect.x - rect.width)), orientation: "horizontal", from: rect, to: parentRect });
    out.push({ label: "bottom", value: Math.max(0, Math.round(parentRect.y + parentRect.height - rect.y - rect.height)), orientation: "vertical", from: rect, to: parentRect });
    const nearest = (siblings || []).map((sibling) => {
      const horizontalGap = sibling.x >= rect.x + rect.width
        ? sibling.x - rect.x - rect.width
        : rect.x >= sibling.x + sibling.width
          ? rect.x - sibling.x - sibling.width
          : null;
      const verticalGap = sibling.y >= rect.y + rect.height
        ? sibling.y - rect.y - rect.height
        : rect.y >= sibling.y + sibling.height
          ? rect.y - sibling.y - sibling.height
          : null;
      const gap = horizontalGap !== null ? horizontalGap : verticalGap;
      return gap === null ? null : { sibling: sibling, gap: Math.round(gap), orientation: horizontalGap !== null ? "horizontal" : "vertical" };
    }).filter(Boolean).sort((a, b) => a.gap - b.gap)[0];
    if (nearest) {
      out.push({ label: "nearest", value: Math.max(0, nearest.gap), orientation: nearest.orientation, from: rect, to: nearest.sibling });
    }
    return out;
  }

  function ensureGuidesLayer(cv) {
    let layer = cv.idoc.querySelector("[data-od-edit-guides-layer]");
    if (layer) return layer;
    layer = cv.idoc.createElement("div");
    layer.setAttribute("data-od-edit-guides-layer", "true");
    // state: a host node, so patch.js skips it when it counts children.
    layer.setAttribute("data-od-edit-bridge", "guides");
    layer.setAttribute("aria-hidden", "true");
    // state: outside body, so the zoom transform never scales the chrome.
    cv.idoc.documentElement.appendChild(layer);
    return layer;
  }

  function clearGuides(cv) {
    const layer = cv.idoc && cv.idoc.querySelector("[data-od-edit-guides-layer]");
    if (layer) layer.replaceChildren();
  }

  function addGuideNode(cv, layer, className, style, text) {
    const node = cv.idoc.createElement("div");
    node.className = className;
    Object.keys(style || {}).forEach((key) => { node.style[key] = style[key]; });
    if (text) node.textContent = text;
    layer.appendChild(node);
  }

  function renderSelectedChrome(cv, layer, rect) {
    if (!rect) return;
    addGuideNode(cv, layer, "od-edit-guide-box od-edit-guide-box-selected", {
      left: rect.x + "px", top: rect.y + "px",
      width: rect.width + "px", height: rect.height + "px"
    });
    const points = [
      [rect.x, rect.y],
      [rect.x + rect.width / 2, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height / 2],
      [rect.x + rect.width, rect.y + rect.height / 2],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width / 2, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height]
    ];
    for (let i = 0; i < points.length; i++) {
      addGuideNode(cv, layer, "od-edit-guide-handle", {
        left: Math.round(points[i][0]) + "px",
        top: Math.round(points[i][1]) + "px"
      });
    }
  }

  // function: alignment lines and gap labels for the element being dragged.
  function renderReferenceGuides(cv, layer, el) {
    const rect = rectFor(el);
    const parentRect = rectFor(el.parentElement);
    const siblings = siblingRectsFor(cv, el);
    const guides = alignmentGuidesFor(rect, parentRect);
    for (const g of guides) {
      if (g.orientation === "vertical") {
        addGuideNode(cv, layer, "od-edit-guide-line od-edit-guide-line-v od-edit-guide-line-reference",
          { left: g.position + "px", top: "0px", height: "100%" });
      } else {
        addGuideNode(cv, layer, "od-edit-guide-line od-edit-guide-line-h od-edit-guide-line-reference",
          { top: g.position + "px", left: "0px", width: "100%" });
      }
    }
    const measures = measurementsFor(rect, parentRect, siblings);
    for (const m of measures) {
      const x = m.orientation === "horizontal"
        ? Math.round((m.from.x + m.to.x) / 2)
        : Math.round(rect.x + rect.width / 2);
      const y = m.orientation === "horizontal"
        ? Math.round(rect.y + rect.height / 2)
        : Math.round((m.from.y + m.to.y) / 2);
      addGuideNode(cv, layer, "od-edit-guide-measure",
        { left: x + "px", top: y + "px" }, m.label + " " + m.value);
    }
  }

  // function: chrome for every selected id. No clear of its own.
  // function: isolate the given ids. No ids leaves isolate.
  function setIsolate(cv, ids) {
    if (!cv.patch || !cv.idoc) return false;
    const next = Array.isArray(ids)
      ? ids.filter((id) => !!cv.patch.find(cv.idoc, id)) : [];
    cv.isolate = next.length ? next : null;
    paintChrome(cv);
    return !!cv.isolate;
  }

  // function: the dim outside the isolated union. Four bands, viewport px.
  function drawIsolate(cv, layer) {
    if (!cv.isolate || !cv.isolate.length || !cv.iwin) return;
    let box = null;
    for (let i = 0; i < cv.isolate.length; i++) {
      const el = cv.patch.find(cv.idoc, cv.isolate[i]);
      const r = el ? rectFor(el) : null;
      if (!r) continue;
      if (!box) { box = { x: r.x, y: r.y, r: r.x + r.width, b: r.y + r.height }; continue; }
      box.x = Math.min(box.x, r.x);
      box.y = Math.min(box.y, r.y);
      box.r = Math.max(box.r, r.x + r.width);
      box.b = Math.max(box.b, r.y + r.height);
    }
    if (!box) return;
    const w = cv.iwin.innerWidth;
    const h = cv.iwin.innerHeight;
    const bands = [
      { left: 0, top: 0, width: w, height: Math.max(0, box.y) },
      { left: 0, top: box.b, width: w, height: Math.max(0, h - box.b) },
      { left: 0, top: box.y, width: Math.max(0, box.x), height: Math.max(0, box.b - box.y) },
      { left: box.r, top: box.y, width: Math.max(0, w - box.r), height: Math.max(0, box.b - box.y) }
    ];
    for (let j = 0; j < bands.length; j++) {
      addGuideNode(cv, layer, "cc-isolate-dim", {
        position: "absolute", pointerEvents: "none",
        background: "rgba(255, 255, 255, 0.72)",
        left: bands[j].left + "px", top: bands[j].top + "px",
        width: bands[j].width + "px", height: bands[j].height + "px"
      });
    }
  }

  function drawSelection(cv, layer) {
    for (let i = 0; i < cv.selection.length; i++) {
      const el = cv.patch.find(cv.idoc, cv.selection[i]);
      if (el) renderSelectedChrome(cv, layer, rectFor(el));
    }
  }

  // function: one repaint — rulers, page chrome, then the selection.
  function paintChrome(cv) {
    if (!cv.idoc || cv.docMode !== "file" || !cv.patch) return;
    if (cv.mode === "preview") { clearGuides(cv); renderRulers(cv); return; }
    if (!cv.guideDrag) readGuides(cv);
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    renderRulers(cv);
    drawPageChrome(cv, layer);
    drawIsolate(cv, layer);
    drawSelection(cv, layer);
  }

  function paintFileSelection(cv) {
    paintChrome(cv);
  }

  // function: split an inline transform into the prefix we keep and the
  // translate we manage.
  function readTranslateBase(el) {
    const raw = (el.style && el.style.transform) || "";
    const base = { prefix: "", tx: 0, ty: 0 };
    const m = raw.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
    if (m) {
      base.tx = parseFloat(m[1]) || 0;
      base.ty = parseFloat(m[2]) || 0;
      base.prefix = raw.replace(m[0], "").replace(/\s+/g, " ").trim();
    } else if (raw && raw !== "none") {
      base.prefix = raw.trim();
    }
    return base;
  }

  // function: an absolutely positioned element's used left/top in px.
  // state: null for anything that is not position absolute.
  function absPlacement(cv, el) {
    if (!cv.iwin || !el) return null;
    let cs = null;
    try { cs = cv.iwin.getComputedStyle(el); } catch (err) { return null; }
    if (!cs || cs.position !== "absolute") return null;
    const left = parseFloat(cs.left);
    const top = parseFloat(cs.top);
    if (isNaN(left) || isNaN(top)) return null;
    return { left: left, top: top };
  }

  function composeTransform(prefix, tx, ty) {
    const t = "translate(" + Math.round(tx) + "px, " + Math.round(ty) + "px)";
    return prefix ? (prefix + " " + t) : t;
  }

  // function: a text leaf. No element children, some text.
  function isTextLeaf(el) {
    if (!el || el.children.length) return false;
    return !!(el.textContent || "").trim();
  }

  // function: true for el, or el wrapping one child down to a text leaf —
  // the snippet frame shape. False past a fork or an empty shape.
  function wrapsTextLeaf(el) {
    let node = el;
    while (node && !isTextLeaf(node)) {
      if (node.children.length !== 1) return false;
      node = node.children[0];
    }
    return !!node;
  }

  // function: el, or its nearest ancestor already carrying a tracked id.
  // state: load stamps every element; a drop stamps only its own root,
  // so an inner node the drop added (unstamped) climbs to that root.
  function trackedAncestor(el) {
    let node = el;
    while (node && !node.hasAttribute("data-od-id")) {
      node = node.parentElement;
    }
    return node;
  }

  function finishTextEdit(cv, commit) {
    const session = cv.textEdit;
    if (!session) return false;
    cv.textEdit = null;
    const el = session.el;
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-od-editing");
    el.removeEventListener("keydown", session.onKey);
    if (session.onBlur) el.removeEventListener("blur", session.onBlur);
    const value = (el.textContent || "").trim();
    const changed = value !== session.originalText.trim();
    if (commit && changed) {
      // state: rewound to the text the edit started from, so the patch's
      // inverse reads that value.
      el.textContent = session.originalText;
      patchSource(cv, { id: session.id, kind: "set-text", value: value });
    } else if (!commit) {
      el.textContent = session.originalText;
    }
    return true;
  }

  function makeEditable(cv, el) {
    if (!el) return;
    if (cv.textEdit && cv.textEdit.el === el) return;
    if (cv.textEdit) finishTextEdit(cv, true);
    const originalText = el.textContent || "";
    el.setAttribute("contenteditable", "plaintext-only");
    el.setAttribute("data-od-editing", "true");
    try { el.focus(); } catch (e) { /* focus best effort */ }
    const onKey = (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        finishTextEdit(cv, true);
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finishTextEdit(cv, false);
      }
    };
    // state: losing focus commits, the same as Enter.
    const onBlur = () => { finishTextEdit(cv, true); };
    cv.textEdit = {
      el: el, id: cv.patch.stableId(el), originalText: originalText,
      onKey: onKey, onBlur: onBlur
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", onBlur);
  }

  // function: dirty, status, the change mirror, the chrome.
  function afterChange(cv) {
    cv.dirty = true;
    setStatus(cv, "dirty", true);
    if (cv.mirrors) cv.mirrors.change.emit({});
    markDirty(cv);
    paintFileSelection(cv);
  }

  // function: undo applied live patches, last first.
  function rollbackLive(cv, inverses) {
    for (let i = inverses.length - 1; i >= 0; i--) {
      cv.patch.applyToDoc(cv.idoc, inverses[i]);
    }
  }

  // function: one list against the live document and a working copy of the
  // source. {text, inverses} on success, null on a refusal, the live
  // document rolled back.
  function runPatches(cv, patches) {
    const inverses = [];
    let text = cv.source;
    let reload = false;
    for (let i = 0; i < patches.length; i++) {
      // state: set-full-source skips the live document; the iframe reloads.
      if (patches[i].kind === "set-full-source") {
        const full = cv.patch.apply(text, patches[i]);
        if (!full.inverse) { rollbackLive(cv, inverses); return null; }
        inverses.push(full.inverse);
        text = full.text;
        reload = true;
        continue;
      }
      const live = cv.patch.applyToDoc(cv.idoc, patches[i]);
      if (!live.ok) { rollbackLive(cv, inverses); return null; }
      const next = cv.patch.apply(text, patches[i]);
      if (!next.inverse) {
        cv.patch.applyToDoc(cv.idoc, live.inverse);
        rollbackLive(cv, inverses);
        return null;
      }
      inverses.push(live.inverse);
      text = next.text;
    }
    return { text: text, inverses: inverses, reload: reload };
  }

  function ensureHistory(cv) {
    if (!cv.history && cv.patch) cv.history = cv.patch.history();
    return cv.history;
  }

  // function: the one file-mode apply path. Live document and source move
  // together, one history entry per call.
  function applyPatches(cv, patches) {
    if (cv.docMode !== "file" || !cv.idoc || !patches || !patches.length) return false;
    const run = runPatches(cv, patches);
    if (!run) { setStatus(cv, "patch refused", true); return false; }
    cv.source = run.text;
    const h = ensureHistory(cv);
    if (h) h.push({ patches: patches.slice(), inverses: run.inverses.slice() });
    afterChange(cv);
    return true;
  }

  // function: one history entry back. Inverses run in reverse, no push.
  function fileUndo(cv) {
    if (cv.docMode !== "file" || !cv.history) return false;
    const entry = cv.history.undo();
    if (!entry) { setStatus(cv, "nothing to undo"); return false; }
    const run = runPatches(cv, entry.inverses.slice().reverse());
    if (!run) { setStatus(cv, "patch refused", true); return false; }
    cv.source = run.text;
    afterChange(cv);
    if (run.reload) { stash(cv); loadFileMode(cv, cv.source); }
    return true;
  }

  // function: one history entry forward. Patches replay, no push.
  function fileRedo(cv) {
    if (cv.docMode !== "file" || !cv.history) return false;
    const entry = cv.history.redo();
    if (!entry) { setStatus(cv, "nothing to redo"); return false; }
    const run = runPatches(cv, entry.patches);
    if (!run) { setStatus(cv, "patch refused", true); return false; }
    cv.source = run.text;
    afterChange(cv);
    if (run.reload) { stash(cv); loadFileMode(cv, cv.source); }
    return true;
  }

  // function: set-full-source rewrites the source and reloads the iframe.
  // The record carries the dirty flag and the history across the reload.
  function setFullSource(cv, patch) {
    const next = cv.patch.apply(cv.source, patch);
    if (!next.inverse) { setStatus(cv, "patch refused", true); return cv.source; }
    cv.source = next.text;
    const h = ensureHistory(cv);
    if (h) h.push({ patches: [patch], inverses: [next.inverse] });
    cv.dirty = true;
    setStatus(cv, "dirty", true);
    if (cv.mirrors) cv.mirrors.change.emit({});
    markDirty(cv);
    stash(cv);
    loadFileMode(cv, cv.source);
    return cv.source;
  }

  // function: one patch from a sibling widget. Routes into applyPatches.
  function patchSource(cv, patch) {
    if (cv.docMode !== "file" || !patch) return cv.source;
    // state: an array of patches is one undo entry.
    if (Array.isArray(patch)) {
      if (patch.length) applyPatches(cv, patch);
      return cv.source;
    }
    const kind = patch.kind === "set-outer-html" ? "replace-outer-html" : patch.kind;
    if (kind === "set-full-source") return setFullSource(cv, patch);
    applyPatches(cv, [patch]);
    return cv.source;
  }

  // function: the marquee node in the guides layer.
  function drawFileMarquee(cv, mq, x1, y1) {
    const layer = ensureGuidesLayer(cv);
    if (!mq.node || mq.node.parentNode !== layer) {
      mq.node = cv.idoc.createElement("div");
      mq.node.className = "od-edit-guide-box od-edit-guide-box-hover";
      layer.appendChild(mq.node);
    }
    mq.node.style.left = Math.min(mq.x0, x1) + "px";
    mq.node.style.top = Math.min(mq.y0, y1) + "px";
    mq.node.style.width = Math.abs(x1 - mq.x0) + "px";
    mq.node.style.height = Math.abs(y1 - mq.y0) + "px";
  }

  // function: ids fully inside the box whose parent is not fully inside.
  function marqueeHits(cv, lo, hi) {
    const all = cv.idoc.body ? cv.idoc.body.querySelectorAll("*") : [];
    const inside = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (isHostNode(cv, el)) continue;
      if (el.closest && el.closest("[data-od-edit-guides-layer]")) continue;
      // state: locked and hidden subtrees are not marquee fodder.
      if (el.closest && el.closest("[data-cc-locked], [data-cc-hidden]")) continue;
      if (!hitGate(cv, el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left >= lo.x && r.right <= hi.x && r.top >= lo.y && r.bottom <= hi.y) inside.push(el);
    }
    const ids = [];
    for (let j = 0; j < inside.length; j++) {
      if (inside.indexOf(inside[j].parentElement) !== -1) continue;
      ids.push(cv.patch.stableId(inside[j]));
    }
    return ids;
  }

  function endFileMarquee(cv, e) {
    const mq = cv.fileMarquee;
    cv.fileMarquee = null;
    if (mq.node && mq.node.parentNode) mq.node.parentNode.removeChild(mq.node);
    if (!mq.moved) return;
    // state: the click after this pointerup is swallowed.
    cv.justDragged = true;
    const lo = { x: Math.min(mq.x0, e.clientX), y: Math.min(mq.y0, e.clientY) };
    const hi = { x: Math.max(mq.x0, e.clientX), y: Math.max(mq.y0, e.clientY) };
    const hits = mq.base.slice();
    const found = marqueeHits(cv, lo, hi);
    for (let i = 0; i < found.length; i++) {
      if (hits.indexOf(found[i]) === -1) hits.push(found[i]);
    }
    setSelection(cv, hits);
  }

  // function: press state for one selected element. The inline transform
  // and display are held so the drag can be rewound before it is patched.
  function dragItem(cv, el) {
    const base = readTranslateBase(el);
    return {
      el: el, id: cv.patch.stableId(el),
      prefix: base.prefix, baseTx: base.tx, baseTy: base.ty,
      abs: absPlacement(cv, el),
      startTransform: (el.style && el.style.transform) || "",
      startDisplay: (el.style && el.style.display) || "",
      bumpedDisplay: false
    };
  }

  // function: rewind a live drag to the state it was pressed in. The live
  // document only; no patch, no history.
  function cancelDrag(cv) {
    const drag = cv.drag;
    cv.drag = null;
    if (!drag) return false;
    for (let i = 0; i < drag.items.length; i++) {
      const item = drag.items[i];
      if (!item.el || !item.el.style) continue;
      item.el.style.transform = item.startTransform;
      item.el.style.display = item.startDisplay;
    }
    if (drag.started) { clearGuides(cv); paintFileSelection(cv); }
    return true;
  }

  // function: drop a live marquee. The selection is left as it was.
  function cancelFileMarquee(cv) {
    const mq = cv.fileMarquee;
    cv.fileMarquee = null;
    if (mq && mq.node && mq.node.parentNode) mq.node.parentNode.removeChild(mq.node);
  }

  // function: close every live gesture. commit sends an open text edit into
  // the source; false rewinds it.
  function endGestures(cv, commit) {
    cancelDrag(cv);
    cancelFileMarquee(cv);
    if (cv.textEdit) finishTextEdit(cv, !!commit);
  }

  function onFilePointerDown(cv, e) {
    if (cv.mirrors) cv.mirrors.focus.emit({});
    if (e.target && e.target.closest && e.target.closest('[data-od-editing="true"]')) return;
    // state: a press outside the edited element commits it.
    if (cv.textEdit) finishTextEdit(cv, true);
    if (cv.frozen || cv.mode === "preview") { cancelDrag(cv); cancelFileMarquee(cv); return; }
    if (e.button !== undefined && e.button !== 0) return;
    if (cv.spaceDown) {
      cv.pan = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    if (startGuideDrag(cv, e)) return;
    if (inChrome(e.target)) return;
    // state: no gesture outlives the press that starts the next one.
    cancelDrag(cv);
    cancelFileMarquee(cv);
    closeMenu(cv);
    const el = closestTarget(cv, e);
    if (!el) {
      if (cv.mode !== "canvas") return;
      cv.fileMarquee = {
        x0: e.clientX, y0: e.clientY, moved: false, node: null,
        base: e.shiftKey ? cv.selection.slice() : []
      };
      if (!e.shiftKey && cv.selection.length) setSelection(cv, []);
      return;
    }
    const id = cv.patch.stableId(el);
    // state: a press on an already-selected element keeps the whole set.
    const ids = cv.selection.indexOf(id) === -1 ? [id] : cv.selection.slice();
    const items = [];
    for (let i = 0; i < ids.length; i++) {
      const target = cv.patch.find(cv.idoc, ids[i]);
      if (target) items.push(dragItem(cv, target));
    }
    // state: an id that no longer resolves never leaves the press empty.
    if (!items.length) items.push(dragItem(cv, el));
    cv.drag = {
      id: id, items: items, ids: items.map((it) => it.id),
      startX: e.clientX, startY: e.clientY, started: false
    };
  }

  function onFilePointerMove(cv, e) {
    // state: the primary button is up, so the press ended off-document and
    // whatever it left behind is stale.
    const down = e.buttons === undefined || (e.buttons & 1) === 1;
    if (!down || cv.frozen || cv.mode === "preview") {
      if (cv.drag || cv.fileMarquee) { cancelDrag(cv); cancelFileMarquee(cv); }
      cv.pan = null;
      return;
    }
    if (cv.pan) {
      cv.iwin.scrollBy(cv.pan.x - e.clientX, cv.pan.y - e.clientY);
      cv.pan = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    if (cv.guideDrag) { moveGuideDrag(cv, e); return; }
    if (cv.fileMarquee) {
      cv.fileMarquee.moved = true;
      drawFileMarquee(cv, cv.fileMarquee, e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    const drag = cv.drag;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.started && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      drag.started = true;
      for (let i = 0; i < drag.items.length; i++) {
        const item = drag.items[i];
        // transform does not move a non-replaced inline element; bump it once.
        try {
          if (cv.iwin.getComputedStyle(item.el).display === "inline") {
            item.el.style.display = "inline-block";
            item.bumpedDisplay = true;
          }
        } catch (err) { /* computed style best effort */ }
      }
      if (cv.selection.indexOf(drag.id) === -1) setSelection(cv, drag.ids.slice());
    }
    if (!drag.started) return;
    // state: pointer px are viewport px; the translate is page px.
    const s = zoomScale(cv);
    const snapped = snapDrag(cv, drag, dx / s, dy / s);
    for (let j = 0; j < drag.items.length; j++) {
      const moved = drag.items[j];
      moved.el.style.transform = composeTransform(moved.prefix,
        moved.baseTx + snapped.dx, moved.baseTy + snapped.dy);
    }
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    renderRulers(cv);
    drawPageChrome(cv, layer);
    const lead = drag.items[0];
    if (lead) {
      renderReferenceGuides(cv, layer, lead.el);
      for (let k = 0; k < drag.items.length; k++) {
        renderSelectedChrome(cv, layer, rectFor(drag.items[k].el));
      }
    }
    drawSnapLines(cv, layer, snapped.lines);
    e.preventDefault();
  }

  function onFilePointerUp(cv, e) {
    if (cv.pan) { cv.pan = null; return; }
    if (cv.guideDrag) { endGuideDrag(cv, e); return; }
    if (cv.fileMarquee) endFileMarquee(cv, e);
    const drag = cv.drag;
    if (!drag) return;
    if (!drag.started) { cv.drag = null; return; }
    if (cv.frozen || cv.mode === "preview") { cancelDrag(cv); return; }
    cv.drag = null;
    cv.justDragged = true;
    e.preventDefault();
    e.stopPropagation();
    const patches = [];
    for (let i = 0; i < drag.items.length; i++) {
      const item = drag.items[i];
      const styles = { transform: item.el.style.transform || "" };
      // state: an absolute element lands on left/top, the translate goes
      // back to what the press started from.
      if (item.abs) {
        const now = readTranslateBase(item.el);
        styles.left = Math.round(item.abs.left + (now.tx - item.baseTx)) + "px";
        styles.top = Math.round(item.abs.top + (now.ty - item.baseTy)) + "px";
        styles.transform = item.startTransform;
      }
      if (item.bumpedDisplay) styles.display = "inline-block";
      // state: rewound to the pressed state, so the patch's inverse reads
      // the value the drag started from.
      item.el.style.transform = item.startTransform;
      item.el.style.display = item.startDisplay;
      patches.push({ id: item.id, kind: "set-style", styles: styles });
    }
    if (patches.length) applyPatches(cv, patches);
    clearGuides(cv);
    paintFileSelection(cv);
  }

  // function: the browser took the pointer. Rewind, patch nothing.
  function onFilePointerCancel(cv) {
    cancelDrag(cv);
    cancelFileMarquee(cv);
  }

  // function: the browser's own drag of a text selection cancels the pointer
  // stream, so an element drag over selected text dies before it starts.
  // state: refused in file canvas mode; an open text edit keeps its own drag.
  function onFileDragStart(cv, e) {
    if (cv.frozen || cv.mode === "preview" || cv.textEdit) return;
    e.preventDefault();
  }

  function onFileClick(cv, e) {
    if (cv.justDragged) {
      cv.justDragged = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (cv.frozen || cv.mode === "preview") return;
    if (e.target && e.target.closest && e.target.closest('[data-od-editing="true"]')) return;
    if (inChrome(e.target)) return;
    const el = closestTarget(cv, e);
    if (!el) { setSelection(cv, []); return; }
    e.preventDefault();
    const id = cv.patch.stableId(el);
    if (!e.shiftKey) { setSelection(cv, [id]); return; }
    const at = cv.selection.indexOf(id);
    setSelection(cv, at === -1
      ? cv.selection.concat([id])
      : cv.selection.filter((x) => x !== id));
  }

  function onFileDblClick(cv, e) {
    if (cv.frozen || cv.mode === "preview") return;
    const hit = closestTarget(cv, e);
    const el = hit && trackedAncestor(hit);
    if (!el || !wrapsTextLeaf(el)) return;
    e.preventDefault();
    makeEditable(cv, el);
  }

  // ---------- file mode elements ----------

  // function: element children, host nodes skipped. Matches patch.js.
  function fileChildren(cv, parent) {
    if (!parent) return [];
    return Array.prototype.slice.call(parent.children)
      .filter((child) => !isHostNode(cv, child));
  }

  // function: the id a patch uses for a parent.
  function parentKeyOf(cv, parent) {
    if (!parent || parent === cv.idoc.body) return "__body__";
    return parent.getAttribute("data-od-id") || cv.patch.stableId(parent);
  }

  function fileDepth(el) {
    let n = 0;
    let node = el;
    while (node && node.parentElement) { n++; node = node.parentElement; }
    return n;
  }

  // function: wrap a set of siblings in a group div.
  function fileGroup(cv, ids) {
    if (cv.docMode !== "file" || !ids || !ids.length) return false;
    const gid = cv.patch.newId("grp");
    if (!applyPatches(cv, [{ kind: "wrap", ids: ids.slice(), id: gid }])) {
      setStatus(cv, "group needs siblings", true);
      return false;
    }
    setSelection(cv, [gid]);
    return true;
  }

  // function: unwrap a group div. The freed children become the selection.
  function fileUngroup(cv, id) {
    if (cv.docMode !== "file" || !id) return false;
    const el = cv.patch.find(cv.idoc, id);
    const kids = fileChildren(cv, el)
      .map((kid) => kid.getAttribute("data-od-id") || cv.patch.stableId(kid));
    if (!applyPatches(cv, [{ kind: "unwrap", id: id }])) {
      setStatus(cv, "not a group", true);
      return false;
    }
    setSelection(cv, kids);
    return true;
  }

  // function: move one element under a parent at a slot index. A move to a
  // later slot in the same parent counts the element itself.
  function fileMove(cv, id, parent, index) {
    if (cv.docMode !== "file" || !id) return false;
    const el = cv.patch.find(cv.idoc, id);
    const target = cv.patch.find(cv.idoc, parent);
    if (!el || !target) return false;
    // state: index is the final slot among siblings, the element out.
    const idx = Math.max(0, Number(index) || 0);
    return applyPatches(cv, [{ kind: "move", id: id, parent: parent, index: idx }]);
  }

  // function: one move per id among its siblings. Slots read before any
  // patch applies.
  function fileOrder(cv, ids, how) {
    if (cv.docMode !== "file" || !ids || !ids.length) return false;
    const patches = [];
    for (let i = 0; i < ids.length; i++) {
      const el = cv.patch.find(cv.idoc, ids[i]);
      if (!el || !el.parentElement) continue;
      const sibs = fileChildren(cv, el.parentElement);
      const at = sibs.indexOf(el);
      if (at === -1) continue;
      let k = at;
      if (how === "forward") k = Math.min(at + 1, sibs.length - 1);
      else if (how === "back") k = Math.max(at - 1, 0);
      else if (how === "front") k = sibs.length - 1;
      else k = 0;
      if (k === at) continue;
      patches.push({
        kind: "move", id: ids[i],
        parent: parentKeyOf(cv, el.parentElement),
        index: k
      });
    }
    if (!patches.length) return false;
    return applyPatches(cv, patches);
  }

  // function: one remove per id, deepest first.
  function fileRemove(cv, ids) {
    if (cv.docMode !== "file" || !ids || !ids.length) return false;
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      const el = cv.patch.find(cv.idoc, ids[i]);
      if (el) rows.push({ id: ids[i], depth: fileDepth(el) });
    }
    rows.sort((a, b) => b.depth - a.depth);
    const patches = rows.map((r) => ({ kind: "remove", id: r.id }));
    if (!patches.length) return false;
    if (!applyPatches(cv, patches)) return false;
    setSelection(cv, []);
    return true;
  }

  // function: an outerHTML copy carrying a new id on every node.
  function freshCopy(cv, el) {
    const clone = el.cloneNode(true);
    const nodes = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*")));
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute("data-od-runtime-id");
      nodes[i].removeAttribute("data-od-editing");
      nodes[i].removeAttribute("contenteditable");
      nodes[i].setAttribute("data-od-id", cv.patch.newId("el"));
    }
    return { id: clone.getAttribute("data-od-id"), html: clone.outerHTML };
  }

  // function: one insert per id, each copy in the slot after its original.
  function fileDuplicate(cv, ids) {
    if (cv.docMode !== "file" || !ids || !ids.length) return false;
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      const el = cv.patch.find(cv.idoc, ids[i]);
      if (!el || !el.parentElement) continue;
      const at = fileChildren(cv, el.parentElement).indexOf(el);
      if (at === -1) continue;
      rows.push({ el: el, parent: parentKeyOf(cv, el.parentElement), index: at });
    }
    // later slots first, so an earlier insert never shifts a later one
    rows.sort((a, b) => b.index - a.index);
    const patches = [];
    const roots = [];
    for (let j = 0; j < rows.length; j++) {
      const copy = freshCopy(cv, rows[j].el);
      patches.push({
        kind: "insert", parent: rows[j].parent,
        index: rows[j].index + 1, html: copy.html
      });
      roots.unshift(copy.id);
    }
    if (!patches.length) return false;
    if (!applyPatches(cv, patches)) return false;
    setSelection(cv, roots);
    return true;
  }

  // function: shift the selection by a pixel offset. One patch per id, one
  // history entry.
  function fileNudge(cv, dx, dy) {
    if (cv.docMode !== "file" || !cv.selection.length) return false;
    const patches = [];
    for (let i = 0; i < cv.selection.length; i++) {
      const el = cv.patch.find(cv.idoc, cv.selection[i]);
      if (!el) continue;
      const abs = absPlacement(cv, el);
      if (abs) {
        patches.push({
          kind: "set-style", id: cv.selection[i],
          styles: { left: Math.round(abs.left + dx) + "px", top: Math.round(abs.top + dy) + "px" }
        });
        continue;
      }
      const base = readTranslateBase(el);
      patches.push({
        kind: "set-style", id: cv.selection[i],
        styles: { transform: composeTransform(base.prefix, base.tx + dx, base.ty + dy) }
      });
    }
    if (!patches.length) return false;
    return applyPatches(cv, patches);
  }

  // ---------- layers ----------

  function escAttr(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // function: body's layer sections, DOM order, first is bottom.
  function layerNodes(cv) {
    if (!cv.idoc || !cv.idoc.body) return [];
    return fileChildren(cv, cv.idoc.body).filter((el) => isLayerSection(el));
  }

  // function: one layers() record.
  function layerRecord(cv, el) {
    return {
      id: cv.patch.stableId(el),
      name: el.getAttribute("data-cc-name") || "",
      plugin: el.getAttribute("data-cc-plugin") || "html",
      locked: el.hasAttribute("data-cc-locked"),
      hidden: el.hasAttribute("data-cc-hidden")
    };
  }

  function layerList(cv) {
    if (!cv.patch) return [];
    return layerNodes(cv).map((el) => layerRecord(cv, el));
  }

  function layerById(cv, id) {
    if (!id || !cv.patch || !cv.idoc) return null;
    const el = cv.patch.find(cv.idoc, id);
    return el && isLayerSection(el) ? el : null;
  }

  // function: the layer an element sits in. "" when none.
  function layerOf(cv, id) {
    const el = id && cv.patch && cv.idoc ? cv.patch.find(cv.idoc, id) : null;
    const layer = el && el.closest ? el.closest("[data-cc-layer]") : null;
    return layer ? cv.patch.stableId(layer) : "";
  }

  // function: the option's layer, else the topmost unlocked one.
  // state: a set-but-missing activeLayer resolves to nothing.
  function activeLayerEl(cv) {
    const nodes = layerNodes(cv);
    if (!nodes.length) return null;
    if (cv.activeLayer) return layerById(cv, cv.activeLayer);
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (!nodes[i].hasAttribute("data-cc-locked")) return nodes[i];
    }
    return null;
  }

  function setActiveLayer(cv, id) {
    const next = id ? String(id) : "";
    if (next && !layerById(cv, next)) return false;
    cv.activeLayer = next;
    cv.frame.setOption("activeLayer", next);
    return true;
  }

  // function: a new layer above the rest. An svg plugin gets its one <svg>.
  function addLayer(cv, name, plugin) {
    if (cv.docMode !== "file" || !cv.idoc || !cv.idoc.body) return "";
    const nodes = layerNodes(cv);
    const id = cv.patch.newId("ly");
    const p = plugin === "svg" ? "svg" : "html";
    const page = pageMetrics(cv);
    const inner = p === "svg"
      ? '<svg viewBox="0 0 ' + page.w + " " + page.h + '" width="100%" height="100%"></svg>'
      : "";
    const html = '<section data-cc-layer data-cc-name="'
      + escAttr(name || ("Layer " + (nodes.length + 1)))
      + '" data-cc-plugin="' + p + '" data-od-id="' + id + '">' + inner + "</section>";
    const index = fileChildren(cv, cv.idoc.body).length;
    if (!applyPatches(cv, [{ kind: "insert", parent: "__body__", index: index, html: html }])) return "";
    return id;
  }

  function removeLayer(cv, id) {
    const el = layerById(cv, id);
    if (!el) return false;
    if (cv.activeLayer === id) setActiveLayer(cv, "");
    return applyPatches(cv, [{ kind: "remove", id: cv.patch.stableId(el) }]);
  }

  function renameLayer(cv, id, name) {
    const el = layerById(cv, id);
    if (!el) return false;
    return applyPatches(cv, [{ kind: "set-attr", id: cv.patch.stableId(el),
      name: "data-cc-name", value: String(name || "") }]);
  }

  // function: locked or hidden on a layer. state: "1" or gone.
  function setLayerFlag(cv, id, flag, on) {
    const el = layerById(cv, id);
    if (!el || (flag !== "locked" && flag !== "hidden")) return false;
    return applyPatches(cv, [{ kind: "set-attr", id: cv.patch.stableId(el),
      name: "data-cc-" + flag, value: on ? "1" : null }]);
  }

  function moveLayer(cv, id, index) {
    const el = layerById(cv, id);
    if (!el) return false;
    return applyPatches(cv, [{ kind: "move", id: cv.patch.stableId(el),
      parent: "__body__", index: Math.max(0, Number(index) || 0) }]);
  }

  // function: a layer's children into the layer below, then the layer goes.
  function mergeDown(cv, id) {
    const el = layerById(cv, id);
    if (!el) return false;
    const nodes = layerNodes(cv);
    const at = nodes.indexOf(el);
    if (at <= 0) { setStatus(cv, "no layer below", true); return false; }
    const below = nodes[at - 1];
    const key = parentKeyOf(cv, below);
    const kids = fileChildren(cv, el);
    let index = fileChildren(cv, below).length;
    const patches = [];
    for (let i = 0; i < kids.length; i++) {
      patches.push({ kind: "move", id: cv.patch.stableId(kids[i]), parent: key, index: index });
      index++;
    }
    patches.push({ kind: "remove", id: cv.patch.stableId(el) });
    return applyPatches(cv, patches);
  }

  function moveToLayer(cv, ids, layerId) {
    const layer = layerById(cv, layerId);
    if (!layer || !ids || !ids.length) return false;
    if (layer.hasAttribute("data-cc-locked")) { setStatus(cv, "layer locked", true); return false; }
    const key = parentKeyOf(cv, layer);
    let index = fileChildren(cv, layer).length;
    const patches = [];
    for (let i = 0; i < ids.length; i++) {
      if (!cv.patch.find(cv.idoc, ids[i])) continue;
      patches.push({ kind: "move", id: ids[i], parent: key, index: index });
      index++;
    }
    if (!patches.length) return false;
    return applyPatches(cv, patches);
  }

  // function: the snippet's root placed at page x,y, stamped with id.
  function placeHtmlAt(cv, html, pt, ns, id) {
    const tpl = cv.idoc.createElement("template");
    let root = null;
    if (ns === "svg") {
      tpl.innerHTML = "<svg>" + html + "</svg>";
      const host = tpl.content.firstElementChild;
      root = host ? host.firstElementChild : null;
      if (!root) return "";
      if (root.hasAttribute("x") || root.hasAttribute("y")) {
        root.setAttribute("x", Math.round(pt.x));
        root.setAttribute("y", Math.round(pt.y));
      } else {
        root.setAttribute("transform",
          "translate(" + Math.round(pt.x) + ", " + Math.round(pt.y) + ")");
      }
    } else {
      tpl.innerHTML = html;
      root = tpl.content.firstElementChild;
      if (!root) return "";
      root.style.position = "absolute";
      root.style.left = Math.round(pt.x) + "px";
      root.style.top = Math.round(pt.y) + "px";
    }
    root.setAttribute("data-od-id", id);
    return root.outerHTML;
  }

  // function: activeLayer if its plugin fits ns, else the topmost
  // unlocked layer of that plugin. Null when none exists.
  function insertLayer(cv, wantPlugin) {
    if (cv.activeLayer) {
      const active = layerById(cv, cv.activeLayer);
      if (active && active.getAttribute("data-cc-plugin") === wantPlugin) return active;
    }
    const nodes = layerNodes(cv);
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (!nodes[i].hasAttribute("data-cc-locked")
        && nodes[i].getAttribute("data-cc-plugin") === wantPlugin) return nodes[i];
    }
    return null;
  }

  // function: a snippet into a layer of matching plugin, at page
  // coordinates. state: no matching layer, one is created in the same
  // patch set, so undo removes both in one step.
  function insertAt(cv, html, pt, ns) {
    if (cv.docMode !== "file" || !cv.idoc || !html) return "";
    const wantPlugin = ns === "svg" ? "svg" : "html";
    const layer = insertLayer(cv, wantPlugin);
    const patches = [];
    let parentKey = "";
    let index = 0;
    if (layer) {
      if (layer.hasAttribute("data-cc-locked")) {
        setStatus(cv, "layer locked", true);
        return "";
      }
      let parent = layer;
      const svg = layer.querySelector("svg");
      if (wantPlugin === "svg" && svg && svg.parentElement === layer) parent = svg;
      parentKey = parentKeyOf(cv, parent);
      index = fileChildren(cv, parent).length;
    } else {
      const nodes = layerNodes(cv);
      const layerId = cv.patch.newId("ly");
      const svgId = wantPlugin === "svg" ? cv.patch.newId("el") : "";
      const page = pageMetrics(cv);
      const inner = wantPlugin === "svg"
        ? '<svg data-od-id="' + svgId + '" viewBox="0 0 ' + page.w + " " + page.h
          + '" width="100%" height="100%"></svg>'
        : "";
      const layerHtml = '<section data-cc-layer data-cc-name="'
        + escAttr("Layer " + (nodes.length + 1))
        + '" data-cc-plugin="' + wantPlugin + '" data-od-id="' + layerId + '">' + inner + "</section>";
      patches.push({ kind: "insert", parent: "__body__",
        index: fileChildren(cv, cv.idoc.body).length, html: layerHtml });
      parentKey = wantPlugin === "svg" ? svgId : layerId;
      index = 0;
    }
    const id = cv.patch.newId("el");
    const placed = placeHtmlAt(cv, html,
      { x: Number(pt && pt.x) || 0, y: Number(pt && pt.y) || 0 }, ns, id);
    if (!placed) return "";
    const insertPatch = { kind: "insert", parent: parentKey, index: index, html: placed };
    if (ns === "svg") insertPatch.ns = "svg";
    patches.push(insertPatch);
    if (!applyPatches(cv, patches)) return "";
    setSelection(cv, [id]);
    return id;
  }

  function selectAllOnLayer(cv, id) {
    const layer = id ? layerById(cv, id) : activeLayerEl(cv);
    if (!layer) return false;
    const kids = fileChildren(cv, layer);
    const ids = [];
    for (let i = 0; i < kids.length; i++) ids.push(cv.patch.stableId(kids[i]));
    setSelection(cv, ids);
    return true;
  }

  // function: data-cc-locked on every selected element.
  function lockSelection(cv) {
    if (cv.docMode !== "file" || !cv.selection.length) return false;
    const patches = [];
    for (let i = 0; i < cv.selection.length; i++) {
      if (!cv.patch.find(cv.idoc, cv.selection[i])) continue;
      patches.push({ kind: "set-attr", id: cv.selection[i], name: "data-cc-locked", value: "1" });
    }
    if (!patches.length) return false;
    if (!applyPatches(cv, patches)) return false;
    setSelection(cv, []);
    return true;
  }

  // function: data-cc-locked off every element and layer carrying it.
  function unlockAll(cv) {
    if (cv.docMode !== "file" || !cv.idoc || !cv.idoc.body) return false;
    const all = cv.idoc.body.querySelectorAll("[data-cc-locked]");
    const patches = [];
    for (let i = 0; i < all.length; i++) {
      patches.push({ kind: "set-attr", id: cv.patch.stableId(all[i]),
        name: "data-cc-locked", value: null });
    }
    if (!patches.length) return false;
    return applyPatches(cv, patches);
  }

  // function: data-cc-hidden plus display none on every selected element.
  function hideSelection(cv) {
    if (cv.docMode !== "file" || !cv.selection.length) return false;
    const patches = [];
    for (let i = 0; i < cv.selection.length; i++) {
      if (!cv.patch.find(cv.idoc, cv.selection[i])) continue;
      patches.push({ kind: "set-attr", id: cv.selection[i], name: "data-cc-hidden", value: "1" });
      patches.push({ kind: "set-style", id: cv.selection[i], styles: { display: "none" } });
    }
    if (!patches.length) return false;
    if (!applyPatches(cv, patches)) return false;
    setSelection(cv, []);
    return true;
  }

  // function: data-cc-hidden off everything. A layer reads display from the
  // page block, an element from its own inline style.
  function showAll(cv) {
    if (cv.docMode !== "file" || !cv.idoc || !cv.idoc.body) return false;
    const all = cv.idoc.body.querySelectorAll("[data-cc-hidden]");
    const patches = [];
    for (let i = 0; i < all.length; i++) {
      const id = cv.patch.stableId(all[i]);
      patches.push({ kind: "set-attr", id: id, name: "data-cc-hidden", value: null });
      if (!isLayerSection(all[i])) {
        patches.push({ kind: "set-style", id: id, styles: { display: "" } });
      }
    }
    if (!patches.length) return false;
    return applyPatches(cv, patches);
  }

  // function: one page token, rewritten as the whole :root rule.
  function setPage(cv, key, value) {
    if (cv.docMode !== "file" || !PAGE_TOKENS[key]) return false;
    const n = Number(value);
    if (isNaN(n)) return false;
    const page = pageMetrics(cv);
    page[key] = n;
    const decls = Object.keys(PAGE_TOKENS).map((k) =>
      PAGE_TOKENS[k] + ": " + page[k] + (k === "columns" ? "" : "px") + ";").join(" ");
    if (!applyPatches(cv, [{ kind: "set-css-rule", block: "page",
      selector: ":root", declarations: decls }])) return false;
    applyZoom(cv);
    paintChrome(cv);
    return true;
  }

  // function: true while file-mode edit gestures are allowed.
  function fileEditable(cv) {
    return cv.docMode === "file" && cv.mode === "canvas" && !cv.frozen && !cv.textEdit;
  }

  function onFileContextMenu(cv, e) {
    if (!fileEditable(cv) || inChrome(e.target)) return;
    const el = closestTarget(cv, e);
    if (!el) { closeMenu(cv); return; }
    e.preventDefault();
    const id = cv.patch.stableId(el);
    if (cv.selection.indexOf(id) === -1) setSelection(cv, [id]);
    openMenuItems(cv, e.clientX, e.clientY, menuItems(cv));
  }

  function onFileKeyDown(cv, e) {
    if (!fileEditable(cv) || editingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = (e.key || "").toLowerCase();

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(cv);
      if (cv.isolate) { setIsolate(cv, []); return; }
      setSelection(cv, []);
      return;
    }
    if (mod && key === "s") { e.preventDefault(); doSave(cv); return; }
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault(); setZoom(cv, zoomStep(cv, 1)); return;
    }
    if (mod && (e.key === "-" || e.key === "_")) {
      e.preventDefault(); setZoom(cv, zoomStep(cv, -1)); return;
    }
    if (mod && e.key === "0") { e.preventDefault(); setZoom(cv, 100); return; }
    if (e.code === "Space") {
      e.preventDefault();
      cv.spaceDown = true;
      return;
    }
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) fileRedo(cv); else fileUndo(cv);
      return;
    }
    if (mod && key === "g") {
      e.preventDefault();
      if (e.shiftKey) fileUngroup(cv, cv.selection[0]);
      else fileGroup(cv, cv.selection.slice());
      return;
    }
    if (mod && key === "d") {
      e.preventDefault();
      fileDuplicate(cv, cv.selection.slice());
      return;
    }
    // state: Option rewrites e.key on mac, so e.code carries the digit.
    if (mod && (e.code === "Digit2" || e.key === "2")) {
      e.preventDefault();
      if (e.altKey) unlockAll(cv); else lockSelection(cv);
      return;
    }
    if (mod && (e.code === "Digit3" || e.key === "3")) {
      e.preventDefault();
      if (e.altKey) showAll(cv); else hideSelection(cv);
      return;
    }
    if (mod && (e.code === "KeyA" || key === "a")) {
      e.preventDefault();
      if (e.shiftKey) setSelection(cv, []); else selectAllOnLayer(cv, "");
      return;
    }
    if (mod && (e.code === "BracketRight" || e.key === "]" || e.key === "}")) {
      e.preventDefault();
      fileOrder(cv, cv.selection.slice(), e.shiftKey ? "front" : "forward");
      return;
    }
    if (mod && (e.code === "BracketLeft" || e.key === "[" || e.key === "{")) {
      e.preventDefault();
      fileOrder(cv, cv.selection.slice(), e.shiftKey ? "toBack" : "back");
      return;
    }
    if (!cv.selection.length) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      fileRemove(cv, cv.selection.slice());
      return;
    }
    let dx = 0, dy = 0;
    if (e.key === "ArrowLeft") dx = -1;
    else if (e.key === "ArrowRight") dx = 1;
    else if (e.key === "ArrowUp") dy = -1;
    else if (e.key === "ArrowDown") dy = 1;
    else return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    fileNudge(cv, dx * step, dy * step);
  }

  function onFileKeyUp(cv, e) {
    if (e.key === "Escape" && cv.menu) closeMenu(cv);
    if (e.code === "Space") { cv.spaceDown = false; cv.pan = null; }
  }

  // function: cmd-wheel zooms around the pointer.
  function onFileWheel(cv, e) {
    if (cv.docMode !== "file" || cv.mode !== "canvas") return;
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(cv, cv.zoomPct * factor, { x: e.clientX, y: e.clientY });
  }

  function bindFileListeners(cv) {
    const d = cv.idoc, w = cv.iwin;
    const on = (el, type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      cv.listeners.push([el, type, fn, opts]);
    };
    on(d, "pointerdown", (e) => onFilePointerDown(cv, e), true);
    on(d, "pointermove", (e) => onFilePointerMove(cv, e), true);
    on(d, "pointerup", (e) => onFilePointerUp(cv, e), true);
    on(d, "pointercancel", () => onFilePointerCancel(cv), true);
    on(d, "dragstart", (e) => onFileDragStart(cv, e), true);
    on(d, "click", (e) => onFileClick(cv, e), true);
    on(d, "dblclick", (e) => onFileDblClick(cv, e), true);
    on(d, "contextmenu", (e) => onFileContextMenu(cv, e), true);
    on(w, "keydown", (e) => onFileKeyDown(cv, e), true);
    on(w, "keyup", (e) => onFileKeyUp(cv, e), true);
    on(w, "wheel", (e) => onFileWheel(cv, e), { capture: true, passive: false });
    on(w, "scroll", () => paintChrome(cv), true);
    on(w, "resize", () => paintChrome(cv), true);
  }

  // ---------- load, save ----------

  // function: the element that scrolls. The iframe document.
  function scrollerFor(cv) {
    if (!cv.idoc) return null;
    return cv.idoc.scrollingElement;
  }

  // function: hold the active tab's text, dirty flag, selection, scroll and
  // history in cv.tabs.
  function stash(cv) {
    if (!cv.path) return;
    const sc = scrollerFor(cv);
    cv.tabs[cv.path] = {
      text: cv.source || "",
      dirty: !!cv.dirty,
      selection: cv.selection.slice(),
      scroll: { left: sc ? sc.scrollLeft : 0, top: sc ? sc.scrollTop : 0 },
      history: cv.history || null
    };
  }

  // function: put a tab's record back after its load. History is kept only
  // when the loaded text matches the record's.
  function restoreTab(cv, rec) {
    if (!rec) return;
    applySelection(cv, rec.selection || []);
    const sc = scrollerFor(cv);
    if (sc && rec.scroll) {
      sc.scrollLeft = rec.scroll.left || 0;
      sc.scrollTop = rec.scroll.top || 0;
    }
    cv.history = (rec.history && (cv.source || "") === rec.text) ? rec.history : null;
    cv.dirty = !!rec.dirty;
  }

  function loadTarget(cv) {
    const frame = cv.frame;
    const target = frame.options.target || "";
    if (cv.idoc) endGestures(cv, true);
    if (cv.path && cv.path !== target) stash(cv);
    detachListeners(cv);
    closeMenu(cv);
    cv.path = target;
    cv.docMode = modeForTarget(target);
    cv.dirty = false;
    cv.history = null;
    cv.drag = null;
    cv.fileMarquee = null;
    cv.textEdit = null;
    cv.source = "";
    if (!target) {
      blankIframe(cv);
      renderBar(cv);
      setStatus(cv, "no target", true);
      return;
    }
    if (!cv.docMode) {
      blankIframe(cv);
      renderBar(cv);
      setStatus(cv, "target must be .html", true);
      return;
    }
    setStatus(cv, "loading…", true);
    renderBar(cv);
    const rec = cv.tabs[target];
    if (rec && rec.dirty) {
      loadFileMode(cv, rec.text);
      return;
    }
    frame.send({ type: "open", path: target, inst: frame.id });
  }

  function loadFileMode(cv, text) {
    const core = cv.core;
    // state: ids stamped before the srcdoc, so iframe and source agree.
    cv.source = cv.patch.normalize(String(text || "")).text;
    // state: relative assets resolve through /raw/ at the file's folder.
    const dir = String(cv.path || "").replace(/\/[^/]*$/, "");
    const baseHref = dir ? "/raw" + encodeURI(dir) + "/" : "";
    loadIframe(cv, core.baseDocument("file", cv.source, baseHref)).then((idoc) => {
      if (!cv.live) return;
      cv.idoc = idoc;
      cv.iwin = cv.iframe.contentWindow;
      bindFileListeners(cv);
      cv.dirty = false;
      restoreTab(cv, cv.tabs[cv.path]);
      ensureHistory(cv);
      ensureChromeStyles(cv);
      readGuides(cv);
      applyZoom(cv);
      renderBar(cv);
      paintChrome(cv);
      setStatus(cv, cv.dirty ? "dirty" : "loaded", cv.dirty);
      if (cv.mirrors) {
        cv.mirrors.focus.emit({});
        cv.mirrors.doc.emit({ mode: "file", path: cv.path });
      }
    });
  }

  function doSave(cv) {
    if (!cv.path || !cv.docMode) return Promise.resolve(false);
    const content = cv.source || "";
    return new Promise((resolve) => {
      cv.pending[cv.path] = { content: content, resolve: resolve };
      setStatus(cv, "saving…", true);
      cv.frame.send({ type: "save", path: cv.path, content: content, inst: cv.frame.id });
    });
  }

  // function: one save frame for a cached tab's held text.
  function saveRecord(cv, path, rec) {
    return new Promise((resolve) => {
      cv.pending[path] = { content: rec.text, resolve: resolve };
      cv.frame.send({ type: "save", path: path, content: rec.text, inst: cv.frame.id });
    });
  }

  // function: the active tab, then every dirty cached tab.
  function doSaveAll(cv) {
    const jobs = [doSave(cv)];
    for (const path of Object.keys(cv.tabs)) {
      const rec = cv.tabs[path];
      if (!rec || !rec.dirty || path === cv.path) continue;
      jobs.push(saveRecord(cv, path, rec));
    }
    return Promise.all(jobs).then((all) => all.every(Boolean));
  }

  // function: basenames of every dirty tab, active one first.
  function dirtyNames(cv) {
    const out = [];
    if (cv.dirty) out.push(basename(cv.path) || "This canvas");
    for (const path of Object.keys(cv.tabs)) {
      const rec = cv.tabs[path];
      if (!rec || !rec.dirty || path === cv.path) continue;
      out.push(basename(path));
    }
    return out;
  }

  // ---------- bar ----------

  // function: one button per open target. Hidden while the list is empty.
  function renderTargetTabs(cv) {
    const host = cv.targetsEl;
    if (!host) return;
    host.textContent = "";
    if (!cv.targets.length) { host.hidden = true; return; }
    host.hidden = false;
    const active = cv.frame.options.target || "";
    for (const path of cv.targets) {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "mxcv-tab" + (path === active ? " mxcv-on" : "");
      t.textContent = basename(path);
      t.title = path;
      t.addEventListener("click", () => switchTab(cv, path));
      host.appendChild(t);
    }
  }

  // function: leave the active tab for another. The record is kept.
  function switchTab(cv, path) {
    if (cv.idoc) endGestures(cv, true);
    stash(cv);
    cv.frame.setOption("target", path);
  }

  function setMode(cv, mode) {
    if (MODES.indexOf(mode) < 0) return;
    if (cv.idoc) endGestures(cv, true);
    cv.mode = mode;
    for (const key of Object.keys(cv.modeBtns)) {
      cv.modeBtns[key].classList.toggle("mxcv-btn-on", key === mode);
    }
    paintFileSelection(cv);
    if (cv.mirrors) cv.mirrors.mode.emit({ mode: mode });
    markDirty(cv);
  }

  function renderBar(cv) {
    if (cv.pathEl) cv.pathEl.textContent = cv.path || "no target";
    renderTargetTabs(cv);
  }

  function buildBar(cv, frame) {
    const bar = document.createElement("div");
    bar.className = "mxcv-bar";

    cv.modeBtns = {};
    for (const m of MODES) {
      const b = mkBtn(m, () => setMode(cv, m));
      if (m === cv.mode) b.classList.add("mxcv-btn-on");
      cv.modeBtns[m] = b;
      bar.appendChild(b);
    }

    cv.pathEl = document.createElement("span");
    cv.pathEl.className = "mxcv-path";
    bar.appendChild(cv.pathEl);

    bar.appendChild(mkBtn("Save", () => doSave(cv)));

    bar.appendChild(mkBtn("−", () => setZoom(cv, zoomStep(cv, -1))));
    cv.zoomEl = document.createElement("span");
    cv.zoomEl.className = "mxcv-status";
    cv.zoomEl.textContent = cv.zoomPct + "%";
    bar.appendChild(cv.zoomEl);
    bar.appendChild(mkBtn("+", () => setZoom(cv, zoomStep(cv, 1))));
    bar.appendChild(mkBtn("Fit", () => zoomFit(cv)));

    cv.snapBtn = mkBtn("snap", () => setSnap(cv, !cv.snap));
    if (cv.snap) cv.snapBtn.classList.add("mxcv-btn-on");
    bar.appendChild(cv.snapBtn);

    cv.annBtn = mkBtn("Annotate", () => setAnnotate(cv, !cv.annotateOn));
    bar.appendChild(cv.annBtn);

    bar.appendChild(mkBtn("⚙", () => frame.toggleOptions()));

    cv.statusEl = document.createElement("span");
    cv.statusEl.className = "mxcv-status";
    bar.appendChild(cv.statusEl);

    return bar;
  }

  // ---------- module ----------

  const MOD = {
    defaults: {
      target: "", targets: [], mode: "preview", selection: [],
      annotate: false, snapshot: "raster", annotateTrack: "",
      zoomPct: 100, snap: true, snapTo: SNAP_TO.slice(),
      rulers: true, showGuides: true, showMargins: true, showColumns: true,
      activeLayer: ""
    },

    optionControls: {
      target: MX.canvasTargetControl(true),
      mode: { kind: "select", values: () => MODES.slice() },
      snapshot: { kind: "select", values: () => SNAPSHOT_MODES.slice() },
      annotateTrack: { kind: "select", values: (f) => trackNamesFor(f) }
    },

    mount(frame) {
      ensureStyles();

      const cv = frame._canvasState = {
        frame: frame, live: true, core: null, patch: null,
        iframe: null, idoc: null, iwin: null,
        mode: "preview",
        targets: Array.isArray(frame.options.targets) ? frame.options.targets.slice() : [],
        tabs: Object.create(null),
        history: null,
        selection: Array.isArray(frame.options.selection) ? frame.options.selection.slice() : [],
        annotateOn: false,
        snapshotMethod: SNAPSHOT_MODES.indexOf(frame.options.snapshot) >= 0 ? frame.options.snapshot : "raster",
        annotateTrack: frame.options.annotateTrack || "",
        trackNames: [],
        ann: null, annBtn: null,
        path: "", docMode: "", source: "",
        dirty: false, frozen: false,
        menu: null,
        drag: null, fileMarquee: null, textEdit: null,
        justDragged: false, selfSavedAt: 0,
        listeners: [], mirrors: null,
        pending: Object.create(null),
        modeBtns: {}, statusEl: null, statusTimer: null, pathEl: null,
        targetsEl: null,
        zoomPct: clampZoom(frame.options.zoomPct),
        snap: frame.options.snap !== false,
        snapTo: cleanSnapTo(frame.options.snapTo),
        rulers: frame.options.rulers !== false,
        showGuides: frame.options.showGuides !== false,
        showMargins: frame.options.showMargins !== false,
        showColumns: frame.options.showColumns !== false,
        guides: { v: [], h: [] },
        rulerSig: "", zoomEl: null, snapBtn: null,
        spaceDown: false, pan: null, guideDrag: null,
        activeLayer: frame.options.activeLayer || "",
        isolate: null
      };

      const wrap = document.createElement("div");
      wrap.className = "mxcv-wrap";
      wrap.appendChild(buildBar(cv, frame));

      cv.targetsEl = document.createElement("div");
      cv.targetsEl.className = "mxcv-targets";
      cv.targetsEl.hidden = true;
      wrap.appendChild(cv.targetsEl);

      const body = document.createElement("div");
      body.className = "mxcv-body";
      cv.iframe = document.createElement("iframe");
      cv.iframe.className = "mxcv-frame";
      body.appendChild(cv.iframe);
      cv.ann = MX.annotate(frame, body);
      body.appendChild(cv.ann.el);
      wrap.appendChild(body);
      frame.host.appendChild(wrap);

      // state: the active target always has a tab.
      if (frame.options.target && cv.targets.indexOf(frame.options.target) < 0) {
        cv.targets.push(frame.options.target);
        frame.setOption("targets", cv.targets.slice());
      }
      renderTargetTabs(cv);

      frame.subscribe(["file", "saved", "tree_dirty", "ade_init", "track_list"]);
      frame.send({ type: "roster", inst: frame.id });

      // the sibling-facing handle. 3C to 3E read it.
      frame._canvas = {
        selected: () => cv.selection.slice(),
        freeze: (on) => applyFreeze(cv, on),
        redraw: () => paintFileSelection(cv),
        source: () => cv.source || "",
        patchSource: (patch) => patchSource(cv, patch),
        mode: () => cv.mode,
        doc: () => cv.idoc,
        undo: () => fileUndo(cv),
        redo: () => fileRedo(cv),
        group: (ids) => fileGroup(cv, ids || cv.selection.slice()),
        ungroup: (id) => fileUngroup(cv, id),
        move: (id, parent, index) => fileMove(cv, id, parent, index),
        forward: (ids) => fileOrder(cv, ids || cv.selection.slice(), "forward"),
        back: (ids) => fileOrder(cv, ids || cv.selection.slice(), "back"),
        front: (ids) => fileOrder(cv, ids || cv.selection.slice(), "front"),
        toBack: (ids) => fileOrder(cv, ids || cv.selection.slice(), "toBack"),
        remove: (ids) => fileRemove(cv, ids || cv.selection.slice()),
        duplicate: (ids) => fileDuplicate(cv, ids || cv.selection.slice()),
        menuItems: () => menuItems(cv),
        page: () => pageMetrics(cv),
        setPage: (key, value) => setPage(cv, key, value),
        guides: () => ({ v: cv.guides.v.slice(), h: cv.guides.h.slice() }),
        addGuide: (axis, px) => addGuide(cv, axis, px),
        removeGuide: (axis, px) => removeGuide(cv, axis, px),
        snapPoint: (pt) => snapPoint(cv, pt),
        patchMany: (patches) => applyPatches(cv, patches),
        layers: () => layerList(cv),
        addLayer: (name, plugin) => addLayer(cv, name, plugin),
        removeLayer: (id) => removeLayer(cv, id),
        renameLayer: (id, name) => renameLayer(cv, id, name),
        setLayerFlag: (id, flag, on) => setLayerFlag(cv, id, flag, on),
        moveLayer: (id, index) => moveLayer(cv, id, index),
        mergeDown: (id) => mergeDown(cv, id),
        moveToLayer: (ids, layerId) => moveToLayer(cv, ids || cv.selection.slice(), layerId),
        layerOf: (id) => layerOf(cv, id),
        activeLayer: () => {
          const el = activeLayerEl(cv);
          return el ? cv.patch.stableId(el) : "";
        },
        setActiveLayer: (id) => setActiveLayer(cv, id),
        insertAt: (html, pt, ns) => insertAt(cv, html, pt, ns),
        selectAllOnLayer: (id) => selectAllOnLayer(cv, id),
        lockSelection: () => lockSelection(cv),
        unlockAll: () => unlockAll(cv),
        hideSelection: () => hideSelection(cv),
        showAll: () => showAll(cv),
        isolate: (ids) => setIsolate(cv, ids)
      };

      MX.canvasCore().then((core) => {
        if (!cv.live) return;
        cv.core = core;
        cv.patch = core.patch;
        cv.mirrors = core.mirrors(frame, {
          select: (payload) => applySelection(cv, payload.ids, payload.isolate),
          freeze: (payload) => applyFreeze(cv, payload.on)
        });
        loadTarget(cv);
      });
    },

    canClose(frame) {
      const cv = frame._canvasState;
      if (!cv) return true;
      const names = dirtyNames(cv);
      if (!names.length) return true;
      return MX.ui.choose("Unsaved changes",
        names.join(", ") + (names.length > 1 ? " have" : " has") + " unsaved changes.", [
          { label: "Save", value: "save", cls: "mx-go" },
          { label: "Discard", value: "discard" },
          { label: "Cancel", value: "cancel" }
        ]).then((choice) => {
          if (choice === "cancel") return false;
          if (choice === "discard") return true;
          return doSaveAll(cv).then((ok) => !!ok);
        });
    },

    unmount(frame) {
      const cv = frame._canvasState;
      if (!cv) return;
      if (cv.idoc) endGestures(cv, false);
      cv.live = false;
      if (cv.statusTimer) { clearTimeout(cv.statusTimer); cv.statusTimer = null; }
      detachListeners(cv);
      closeMenu(cv);
      if (cv.mirrors) cv.mirrors.off();
      blankIframe(cv);
      frame._canvas = null;
      frame._canvasState = null;
    },

    onFrame(frame, msg) {
      const cv = frame._canvasState;
      if (!cv) return;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        cv.trackNames = (Array.isArray(msg.tracks) ? msg.tracks : [])
          .filter((r) => r && r.id).map((r) => r.id);
        if (cv.ann && cv.ann.refreshTracks) cv.ann.refreshTracks();
        return;
      }

      if (!cv.core) return;

      if (msg.type === "file") {
        if (msg.inst !== frame.id) return;
        if (msg.path !== cv.path) return;
        loadFileMode(cv, msg.content || "");
        return;
      }

      if (msg.type === "saved") {
        const rec = cv.pending[msg.path];
        const denied = msg.ok === false || (typeof msg.result === "string"
          && (msg.result.startsWith("[save denied")
            || msg.result.startsWith("[WRITE refused")
            || msg.result.startsWith("[WRITE failed")));
        const held = cv.tabs[msg.path];
        if (rec && msg.inst === frame.id) {
          delete cv.pending[msg.path];
          cv.selfSavedAt = Date.now();
          if (!denied && msg.path === cv.path) cv.dirty = false;
          if (!denied && held && held.text === rec.content) held.dirty = false;
          setStatus(cv, denied ? (msg.result || "refused") : "saved", denied);
          rec.resolve(!denied);
          return;
        }
        // another instance wrote this path: take its copy when we hold none
        if (msg.inst !== frame.id && msg.path === cv.path && !denied) reopenIfClean(cv);
        // a cached tab goes clean only when the write matches what it holds
        if (msg.inst !== frame.id && !denied && held
          && typeof msg.content === "string" && held.text === msg.content) {
          held.dirty = false;
        }
        return;
      }

      if (msg.type === "tree_dirty") reopenIfClean(cv);
    },

    onOption(frame, key, value) {
      const cv = frame._canvasState;
      if (!cv) return;
      if (key === "target") {
        renderTargetTabs(cv);
        if (cv.core) loadTarget(cv);
        return;
      }
      if (key === "targets") {
        cv.targets = Array.isArray(value) ? value.slice() : [];
        const active = frame.options.target || "";
        if (active && cv.targets.indexOf(active) < 0) {
          frame.setOption("target", cv.targets[0] || "");
        }
        renderTargetTabs(cv);
        return;
      }
      if (key === "mode") { setMode(cv, value); return; }
      if (key === "selection") { applySelection(cv, value); return; }
      if (key === "annotate") { setAnnotate(cv, !!value); return; }
      if (key === "snapshot") {
        cv.snapshotMethod = SNAPSHOT_MODES.indexOf(value) >= 0 ? value : "raster";
        return;
      }
      if (key === "annotateTrack") { cv.annotateTrack = value || ""; return; }
      if (key === "zoomPct") {
        cv.zoomPct = clampZoom(value);
        applyZoom(cv);
        paintChrome(cv);
        return;
      }
      if (key === "snap") { setSnap(cv, value !== false); return; }
      if (key === "snapTo") { cv.snapTo = cleanSnapTo(value); return; }
      if (key === "rulers" || key === "showGuides"
        || key === "showMargins" || key === "showColumns") {
        cv[key] = value !== false;
        paintChrome(cv);
      }
    },

    getOptions(frame) {
      const cv = frame._canvasState;
      if (!cv) return JSON.parse(JSON.stringify(frame.options));
      return {
        target: frame.options.target || "",
        targets: cv.targets.slice(),
        mode: cv.mode,
        selection: cv.selection.slice(),
        annotate: false,
        snapshot: cv.snapshotMethod,
        annotateTrack: cv.annotateTrack,
        zoomPct: cv.zoomPct,
        snap: cv.snap,
        snapTo: cv.snapTo.slice(),
        rulers: cv.rulers,
        showGuides: cv.showGuides,
        showMargins: cv.showMargins,
        showColumns: cv.showColumns,
        activeLayer: cv.activeLayer
      };
    }
  };

  // function: toggle the annotate draw layer. Freezes this canvas while on.
  function setAnnotate(cv, on) {
    cv.annotateOn = on;
    if (cv.ann) cv.ann.toggle(on);
    if (cv.frame._canvas) cv.frame._canvas.freeze(on);
    if (cv.annBtn) cv.annBtn.classList.toggle("mxcv-btn-on", on);
  }

  // function: toggle snapping. The bar button mirrors it.
  function setSnap(cv, on) {
    cv.snap = !!on;
    if (cv.snapBtn) cv.snapBtn.classList.toggle("mxcv-btn-on", cv.snap);
    if (cv.frame.options.snap !== cv.snap) cv.frame.setOption("snap", cv.snap);
  }

  // function: cached track ids for the annotateTrack select.
  function trackNamesFor(frame) {
    const cv = frame._canvasState;
    return (cv && cv.trackNames) ? cv.trackNames.slice() : [];
  }

  // function: freeze from a sibling. Gestures are refused, the view stays.
  function applyFreeze(cv, on) {
    cv.frozen = !!on;
    if (cv.frozen) closeMenu(cv);
  }

  // function: someone else wrote the tree. Take their copy when this
  // instance holds nothing unsaved and no gesture is live.
  function reopenIfClean(cv) {
    if (!cv.path || !cv.docMode) return;
    if (cv.dirty || cv.drag || cv.textEdit) return;
    // our own save echoes back as tree_dirty; the copy on disk is ours
    if (cv.selfSavedAt && Date.now() - cv.selfSavedAt < 2000) return;
    cv.frame.send({ type: "open", path: cv.path, inst: cv.frame.id });
  }

  MX.registerWidget("canvas", MOD);
})();
