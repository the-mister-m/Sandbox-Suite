// canvas widget — one iframe per frame, doc mode and file mode
//
// Frames: "open" (ask for the target), "file" (its text), "save" (write it),
// "saved" (the gate outcome), "tree_dirty" (someone else wrote).
//
// State: doc mode holds a canvas document in a per-instance State and draws
// it with the core's render into the iframe. File mode holds the file's
// source string and patches it. No module-level state: two canvases in one
// grid share nothing.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const DRAG_THRESHOLD = 4;
  const MODES = ["code", "canvas", "preview"];
  const ASSET_MODES = ["data", "raw", "folder"];
  const SNAPSHOT_MODES = ["raster", "playwright", "none"];
  const BACK_LINK = "code-canvas-source";

  function ensureStyles() {
    if (document.getElementById("mxcv-style")) return;
    const style = document.createElement("style");
    style.id = "mxcv-style";
    style.textContent = `
      .mxcv-wrap { display: flex; flex-direction: column; height: 100%; }
      .mxcv-wrap [hidden] { display: none !important; }
      .mxcv-bar { display: flex; align-items: center; gap: 4px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; flex-wrap: wrap; }
      .mxcv-tabs { display: flex; gap: 2px; padding: 2px 6px; flex: 0 0 auto;
        overflow-x: auto; border-bottom: 1px solid var(--border, #333); }
      .mxcv-tab { padding: 2px 6px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--border, #333); color: var(--text-2, #aaa);
        background: none; white-space: nowrap; }
      .mxcv-tab.mxcv-on { background: var(--surface-2, #1c1c1c); color: var(--text-1, #ddd); }
      .mxcv-path { flex: 1 1 auto; font-size: 11px; color: var(--text-2, #aaa);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mxcv-status { font-size: 11px; color: var(--text-3, #888); min-width: 3em; text-align: right; }
      .mxcv-from { font-size: 11px; color: var(--text-3, #888); }
      .mxcv-zoom { display: flex; align-items: center; gap: 2px; }
      .mxcv-readout { font-size: 11px; color: var(--text-2, #aaa); min-width: 3em; text-align: center; }
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

  // function: doc mode for a .json target, file mode for .html.
  function modeForTarget(target) {
    if (/\.json$/i.test(target)) return "doc";
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

  // ---------- doc mode geometry, ported from Code Canvas canvas.js ----------

  function matrixEl(cv) {
    return cv.idoc ? cv.idoc.getElementById("matrix") : null;
  }

  function settings(cv) {
    return cv.state.get().settings;
  }

  function paperColor(cv, s) {
    return cv.resolve.palette(s).paper || "#ffffff";
  }

  function widgetOf(cv, id) {
    const s = cv.state.get();
    for (let p = 0; p < s.pages.length; p++) {
      const list = s.pages[p].widgets;
      for (let w = 0; w < list.length; w++) {
        if (list[w].id === id) return list[w];
      }
    }
    return null;
  }

  function isFluid(s) { return !!(s.width && s.width.mode === "fluid"); }

  function pageWidth(cv, s) {
    const m = matrixEl(cv);
    if (isFluid(s)) return (m && m.clientWidth) || 1;
    return (s.width && s.width.px) || 1280;
  }

  function snapPx(v, s) {
    const g = s.grid || 8;
    return Math.round(v / g) * g;
  }

  // function: pixel width of the space a widget's box lives in.
  function spaceWidth(cv, id, s) {
    const w = widgetOf(cv, id);
    if (!w || !w.parent) return pageWidth(cv, s);
    const wrap = wrapOf(cv, id);
    const host = wrap && wrap.parentNode;
    if (host && host.offsetWidth) return host.offsetWidth;
    return pageWidth(cv, s);
  }

  // function: snap a horizontal value. Percent in fluid mode.
  function snapH(cv, v, s, width) {
    if (!isFluid(s)) return snapPx(v, s);
    const w = width || pageWidth(cv, s);
    return snapPx(v / 100 * w, s) / w * 100;
  }

  function gridH(cv, s, width) {
    if (!isFluid(s)) return s.grid || 8;
    return (s.grid || 8) / (width || pageWidth(cv, s)) * 100;
  }

  // function: clamp a box inside its space. Fixed mode only.
  function clampBox(cv, box, s, width) {
    if (isFluid(s)) return box;
    const max = width || pageWidth(cv, s);
    if (box.w > max) box.w = max;
    if (box.x < 0) box.x = 0;
    if (box.y < 0) box.y = 0;
    if (box.x + box.w > max) box.x = max - box.w;
    return box;
  }

  // function: viewport wrapper for the page. Created once, wraps #matrix.
  function viewport(cv) {
    const el = matrixEl(cv);
    if (!el) return null;
    let vp = el.parentNode;
    if (vp && vp.classList && vp.classList.contains("cc-canvas-viewport")) return vp;
    vp = cv.idoc.createElement("div");
    vp.className = "cc-canvas-viewport";
    el.parentNode.insertBefore(vp, el);
    vp.appendChild(el);
    return vp;
  }

  function clampZoom(p) {
    p = Math.round(p);
    if (p < 25) return 25;
    if (p > 200) return 200;
    return p;
  }

  function updateReadout(cv) {
    if (cv.readoutEl) cv.readoutEl.textContent = cv.zoomPct + "%";
  }

  // function: apply the current zoom. Scale the page, center it.
  function applyZoom(cv) {
    updateReadout(cv);
    const page = matrixEl(cv);
    const vp = viewport(cv);
    if (!page || !vp) return;
    const scale = cv.zoomPct / 100;
    page.style.transformOrigin = "0 0";
    page.style.transform = "scale(" + scale + ")";
    const pw = page.offsetWidth, ph = page.offsetHeight;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    page.style.marginLeft = Math.max(0, (vw - pw * scale) / 2) + "px";
    page.style.marginTop = Math.max(0, (vh - ph * scale) / 2) + "px";
  }

  // function: set zoom. aroundClient keeps that point fixed under the pointer.
  function setZoom(cv, p, aroundClient) {
    const newPct = clampZoom(p);
    const vp = viewport(cv);
    const page = matrixEl(cv);
    if (!vp || !page) { cv.zoomPct = newPct; updateReadout(cv); return; }
    const beforeScale = cv.zoomPct / 100;
    let rect, localX, localY;
    if (aroundClient) {
      rect = vp.getBoundingClientRect();
      const mx0 = parseFloat(page.style.marginLeft) || 0;
      const my0 = parseFloat(page.style.marginTop) || 0;
      localX = (aroundClient.x - rect.left + vp.scrollLeft - mx0) / beforeScale;
      localY = (aroundClient.y - rect.top + vp.scrollTop - my0) / beforeScale;
    }
    cv.zoomPct = newPct;
    applyZoom(cv);
    if (aroundClient) {
      const scale = cv.zoomPct / 100;
      const mx1 = parseFloat(page.style.marginLeft) || 0;
      const my1 = parseFloat(page.style.marginTop) || 0;
      vp.scrollLeft = localX * scale + mx1 - (aroundClient.x - rect.left);
      vp.scrollTop = localY * scale + my1 - (aroundClient.y - rect.top);
    }
    markDirty(cv);
  }

  function fitZoom(cv) {
    const page = matrixEl(cv);
    const vp = viewport(cv);
    if (!page || !vp) return;
    const pw = page.offsetWidth, ph = page.offsetHeight;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    if (!pw || !ph || !vw || !vh) return;
    const scale = Math.min(vw / pw, vh / ph);
    cv.zoomPct = clampZoom(Math.floor(scale * 100));
    applyZoom(cv);
    markDirty(cv);
  }

  // function: paint the grid. Bright lines while a gesture runs. Preview
  // mode paints paper only.
  function drawGrid(cv, active) {
    const m = matrixEl(cv);
    if (!m) return;
    const s = settings(cv);
    const g = s.grid || 8;
    const style = s.gridStyle || "dynamic";
    const faint = "rgba(0,0,0,0.08)";
    const bright = "rgba(42,109,244,0.35)";
    m.classList.add("cc-canvas-matrix");
    if (cv.mode === "preview") {
      m.style.backgroundImage = "none";
    } else {
      const lines = (style === "lines") || (style === "dynamic" && active);
      const c = (style === "dynamic" && active) ? bright : faint;
      if (lines) {
        m.style.backgroundImage =
          "linear-gradient(to right, " + c + " 1px, transparent 1px)," +
          "linear-gradient(to bottom, " + c + " 1px, transparent 1px)";
      } else {
        m.style.backgroundImage = "radial-gradient(" + faint + " 1px, transparent 1px)";
      }
    }
    m.style.backgroundSize = g + "px " + g + "px";
    m.style.backgroundColor = paperColor(cv, s);
    m.style.width = isFluid(s) ? "100%" : pageWidth(cv, s) + "px";
  }

  function wrapOf(cv, id) {
    const m = matrixEl(cv);
    if (!m) return null;
    return m.querySelector('[data-widget-id="' + id + '"]');
  }

  // function: paint outlines and handles for the selection.
  function paintSelection(cv) {
    const m = matrixEl(cv);
    if (!m) return;
    const old = m.querySelectorAll(".cc-canvas-selected");
    for (let i = 0; i < old.length; i++) old[i].classList.remove("cc-canvas-selected");
    const handles = m.querySelectorAll(".cc-canvas-handle");
    for (let h = 0; h < handles.length; h++) handles[h].parentNode.removeChild(handles[h]);
    if (cv.mode === "preview") return;
    const dirs = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (let j = 0; j < cv.selection.length; j++) {
      const wrap = wrapOf(cv, cv.selection[j]);
      if (!wrap) continue;
      wrap.classList.add("cc-canvas-selected");
      for (let d = 0; d < dirs.length; d++) {
        const el = cv.idoc.createElement("div");
        el.className = "cc-canvas-handle cc-canvas-handle-" + dirs[d];
        el.setAttribute("data-handle", dirs[d]);
        wrap.appendChild(el);
      }
    }
  }

  // function: set the selection and announce it on the mirror.
  function setSelection(cv, ids) {
    cv.selection = ids.slice();
    paintSelection(cv);
    if (cv.mirrors) cv.mirrors.select.emit({ ids: cv.selection.slice() });
    markDirty(cv);
  }

  // function: selection from a sibling. Painted, never re-emitted.
  function applySelection(cv, ids) {
    cv.selection = Array.isArray(ids) ? ids.slice() : [];
    if (cv.docMode === "doc") paintSelection(cv);
    else paintFileSelection(cv);
  }

  function pruneSelection(cv) {
    const kept = [];
    for (let i = 0; i < cv.selection.length; i++) {
      if (widgetOf(cv, cv.selection[i])) kept.push(cv.selection[i]);
    }
    if (kept.length !== cv.selection.length) cv.selection = kept;
  }

  // function: ids whose widget record changed since the last draw. null when
  // the page, settings, render mode or widget order moved.
  function changedIds(cv, s, pid) {
    const pg = s.pages.filter((p) => p.id === pid)[0];
    const sig = { page: pid, mode: renderMode(cv), byId: {}, order: [] };
    if (pg) {
      for (const w of pg.widgets) {
        sig.order.push(w.id);
        sig.byId[w.id] = JSON.stringify(w);
      }
    }
    sig.settings = JSON.stringify(s.settings);
    const old = cv.drawSig;
    cv.drawSig = sig;
    if (!old || old.page !== sig.page || old.mode !== sig.mode) return null;
    if (old.settings !== sig.settings) return null;
    if (old.order.join("|") !== sig.order.join("|")) return null;
    const out = sig.order.filter((id) => old.byId[id] !== sig.byId[id]);
    return out.length ? out : null;
  }

  // function: full redraw. Grid, widgets, selection, zoom transform.
  function redraw(cv) {
    if (cv.docMode !== "doc" || !cv.render || !cv.idoc) return;
    const s = cv.state.get();
    const pid = cv.pageId || s.page;
    viewport(cv);
    drawGrid(cv, !!cv.gesture);
    cv.render.setMode(renderMode(cv));
    cv.render.page(pid, { play: cv.mode === "preview", only: changedIds(cv, s, pid) });
    pruneSelection(cv);
    paintSelection(cv);
    applyZoom(cv);
  }

  function renderMode(cv) {
    return (cv.schematic || cv.mode === "code") ? "schematic" : "preview";
  }

  // function: new widget on the current page, snapped.
  function place(cv, type, at) {
    if (cv.docMode !== "doc" || !cv.state) return null;
    const pid = cv.pageId || cv.state.get().page;
    if (!pid) return null;
    const s = settings(cv);
    const scale = cv.zoomPct / 100;
    const box = {
      x: snapH(cv, ((at && at.x) || 0) / scale, s),
      y: snapPx(((at && at.y) || 0) / scale, s)
    };
    const kit = cv.core && cv.core.kit;
    const list = (kit && kit.widgets) || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].type === type && list[i].box) {
        box.w = list[i].box.w;
        box.h = list[i].box.h;
      }
    }
    return cv.state.addWidget(pid, type, box);
  }

  // function: copy a widget one grid unit down and right. New id.
  function duplicate(cv, id) {
    const w = widgetOf(cv, id);
    const pid = cv.pageId || cv.state.get().page;
    if (!w || !pid) return null;
    const s = settings(cv);
    const sw = spaceWidth(cv, id, s);
    const box = {
      x: w.box.x + gridH(cv, s, sw), y: w.box.y + (s.grid || 8),
      w: w.box.w, h: w.box.h
    };
    let nid = null;
    cv.state.batch(function () {
      nid = cv.state.duplicateWidget(id);
      if (nid) cv.state.moveWidget(nid, clampBox(cv, box, s, sw));
    });
    return nid;
  }

  // function: move a widget one step in the widget array.
  function shiftOrder(cv, id, step) {
    const s = cv.state.get();
    for (let p = 0; p < s.pages.length; p++) {
      const list = s.pages[p].widgets;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          const next = i + step;
          if (next < 0 || next >= list.length) return;
          cv.state.reorder(id, next);
          return;
        }
      }
    }
  }

  function closeMenu(cv) {
    if (cv.menu && cv.menu.parentNode) cv.menu.parentNode.removeChild(cv.menu);
    cv.menu = null;
  }

  // function: context menu at a point for one widget.
  function openMenu(cv, x, y, id) {
    closeMenu(cv);
    const w = widgetOf(cv, id);
    const items = [
      ["Duplicate", function () {
        for (let i = 0; i < cv.selection.length; i++) duplicate(cv, cv.selection[i]);
      }],
      ["Delete", function () {
        const ids = cv.selection.slice();
        setSelection(cv, []);
        cv.state.batch(function () {
          for (let i = 0; i < ids.length; i++) cv.state.removeWidget(ids[i]);
        });
      }],
      ["Notes", function () {
        if (cv.mirrors) cv.mirrors.select.emit({ ids: [id], notes: true });
      }],
      ["Bring forward", function () {
        cv.state.batch(function () {
          for (let i = 0; i < cv.selection.length; i++) shiftOrder(cv, cv.selection[i], 1);
        });
      }],
      ["Send back", function () {
        cv.state.batch(function () {
          for (let i = 0; i < cv.selection.length; i++) shiftOrder(cv, cv.selection[i], -1);
        });
      }],
      [w && w.locked ? "Unlock position" : "Lock position", function () {
        cv.state.setLocked(id, !(w && w.locked));
      }]
    ];
    const menu = cv.idoc.createElement("div");
    menu.className = "cc-canvas-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    for (let i = 0; i < items.length; i++) {
      const fn = items[i][1];
      const row = cv.idoc.createElement("div");
      row.textContent = items[i][0];
      row.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu(cv);
        fn();
      });
      menu.appendChild(row);
    }
    cv.idoc.body.appendChild(menu);
    cv.menu = menu;
  }

  // function: box for a resize direction, from the start box and deltas.
  function resizeBox(start, dir, dx, dy) {
    const box = { x: start.x, y: start.y, w: start.w, h: start.h };
    if (dir.indexOf("e") !== -1) box.w = start.w + dx;
    if (dir.indexOf("s") !== -1) box.h = start.h + dy;
    if (dir.indexOf("w") !== -1) { box.x = start.x + dx; box.w = start.w - dx; }
    if (dir.indexOf("n") !== -1) { box.y = start.y + dy; box.h = start.h - dy; }
    return box;
  }

  // ---------- doc mode listeners ----------

  function onMouseDown(cv, e) {
    if (cv.mirrors) cv.mirrors.focus.emit({});
    if (cv.frozen || cv.mode === "preview") return;
    closeMenu(cv);
    if (cv.spaceDown) {
      const vp = viewport(cv);
      if (vp && vp.contains(e.target)) {
        e.preventDefault();
        cv.gesture = {
          kind: "pan", sx: e.clientX, sy: e.clientY,
          sl: vp.scrollLeft, st: vp.scrollTop
        };
        return;
      }
    }
    const m = matrixEl(cv);
    if (!m || !m.contains(e.target)) return;
    if (e.button !== 0) return;
    const s = settings(cv);

    const handle = e.target.getAttribute ? e.target.getAttribute("data-handle") : null;
    const wrap = e.target.closest ? e.target.closest("[data-widget-id]") : null;

    if (!wrap) {
      const rect = m.getBoundingClientRect();
      cv.gesture = { kind: "marquee", x0: e.clientX - rect.left, y0: e.clientY - rect.top };
      cv.marquee = cv.idoc.createElement("div");
      cv.marquee.className = "cc-canvas-marquee";
      m.appendChild(cv.marquee);
      if (!e.shiftKey) setSelection(cv, []);
      return;
    }

    const id = wrap.getAttribute("data-widget-id");
    const w = widgetOf(cv, id);
    if (!w) return;

    if (e.shiftKey) {
      if (cv.selection.indexOf(id) === -1) setSelection(cv, cv.selection.concat([id]));
    } else if (cv.selection.indexOf(id) === -1) {
      setSelection(cv, [id]);
    } else if (cv.mirrors) {
      // state: already selected, clicked id announced first, selection unchanged
      cv.mirrors.select.emit({
        ids: [id].concat(cv.selection.filter((x) => x !== id))
      });
    }

    if (w.locked) return;

    e.preventDefault();
    cv.gesture = {
      kind: handle ? "resize" : "move",
      id: id, dir: handle,
      start: { x: w.box.x, y: w.box.y, w: w.box.w, h: w.box.h },
      sw: spaceWidth(cv, id, s),
      cx: e.clientX, cy: e.clientY
    };
    drawGrid(cv, true);
  }

  function onMouseMove(cv, e) {
    if (cv.frozen || cv.mode === "preview" || !cv.gesture) return;
    const g = cv.gesture;
    if (g.kind === "pan") {
      const vpPan = viewport(cv);
      if (vpPan) {
        vpPan.scrollLeft = g.sl - (e.clientX - g.sx);
        vpPan.scrollTop = g.st - (e.clientY - g.sy);
      }
      return;
    }
    const m = matrixEl(cv);
    if (!m) return;
    const s = settings(cv);
    const zscale = cv.zoomPct / 100;

    if (g.kind === "marquee") {
      const rect = m.getBoundingClientRect();
      const x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
      cv.marquee.style.left = Math.min(g.x0, x1) + "px";
      cv.marquee.style.top = Math.min(g.y0, y1) + "px";
      cv.marquee.style.width = Math.abs(x1 - g.x0) + "px";
      cv.marquee.style.height = Math.abs(y1 - g.y0) + "px";
      return;
    }

    const wrap = wrapOf(cv, g.id);
    if (!wrap) return;
    const dx = (e.clientX - g.cx) / zscale, dy = (e.clientY - g.cy) / zscale;
    const pw = g.sw || pageWidth(cv, s);
    const fluid = isFluid(s);

    if (g.kind === "move") {
      const nx = g.start.x + (fluid ? dx / pw * 100 : dx);
      wrap.style.left = fluid ? nx + "%" : nx + "px";
      wrap.style.top = (g.start.y + dy) + "px";
      return;
    }

    const box = resizeBox(g.start, g.dir, fluid ? dx / pw * 100 : dx, dy);
    wrap.style.left = fluid ? box.x + "%" : box.x + "px";
    wrap.style.width = fluid ? box.w + "%" : box.w + "px";
    wrap.style.top = box.y + "px";
    wrap.style.height = box.h + "px";
  }

  function onMouseUp(cv, e) {
    if (cv.frozen || cv.mode === "preview" || !cv.gesture) return;
    const g = cv.gesture;
    const s = settings(cv);
    cv.gesture = null;

    if (g.kind === "pan") return;

    if (g.kind === "marquee") {
      if (cv.marquee && cv.marquee.parentNode) cv.marquee.parentNode.removeChild(cv.marquee);
      cv.marquee = null;
      const m = matrixEl(cv);
      const rect = m.getBoundingClientRect();
      const x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
      const lo = { x: Math.min(g.x0, x1), y: Math.min(g.y0, y1) };
      const hi = { x: Math.max(g.x0, x1), y: Math.max(g.y0, y1) };
      const hits = e.shiftKey ? cv.selection.slice() : [];
      const wraps = m.querySelectorAll("[data-widget-id]");
      for (let i = 0; i < wraps.length; i++) {
        const r = wraps[i].getBoundingClientRect();
        const wx = r.left - rect.left, wy = r.top - rect.top;
        // containment: only widgets fully inside the marquee.
        if (wx >= lo.x && wx + r.width <= hi.x && wy >= lo.y && wy + r.height <= hi.y) {
          const wid = wraps[i].getAttribute("data-widget-id");
          if (hits.indexOf(wid) === -1) hits.push(wid);
        }
      }
      setSelection(cv, hits);
      drawGrid(cv, false);
      return;
    }

    const zscale = cv.zoomPct / 100;
    const dx = (e.clientX - g.cx) / zscale, dy = (e.clientY - g.cy) / zscale;
    // a nested box is parent-relative: its space, not the page.
    const pw = g.sw || pageWidth(cv, s);
    const fluid = isFluid(s);
    let box;
    if (g.kind === "move") {
      box = {
        x: g.start.x + (fluid ? dx / pw * 100 : dx),
        y: g.start.y + dy, w: g.start.w, h: g.start.h
      };
    } else {
      box = resizeBox(g.start, g.dir, fluid ? dx / pw * 100 : dx, dy);
    }
    box.x = snapH(cv, box.x, s, pw);
    box.w = snapH(cv, box.w, s, pw);
    box.y = snapPx(box.y, s);
    box.h = snapPx(box.h, s);
    if (box.w < (s.grid || 8)) box.w = gridH(cv, s, pw);
    if (box.h < (s.grid || 8)) box.h = s.grid || 8;
    cv.state.moveWidget(g.id, clampBox(cv, box, s, pw));
    drawGrid(cv, false);
  }

  function onContextMenu(cv, e) {
    if (cv.frozen || cv.mode === "preview") return;
    const m = matrixEl(cv);
    if (!m || !m.contains(e.target)) return;
    e.preventDefault();
    const wrap = e.target.closest ? e.target.closest("[data-widget-id]") : null;
    if (!wrap) { closeMenu(cv); return; }
    const id = wrap.getAttribute("data-widget-id");
    if (cv.selection.indexOf(id) === -1) setSelection(cv, [id]);
    openMenu(cv, e.clientX, e.clientY, id);
  }

  // function: true when the key belongs to a text field.
  function editingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }

  function onKeyDown(cv, e) {
    if (cv.frozen || editingTarget(e.target)) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      cv.spaceDown = true;
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const s = settings(cv);
    let i;

    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      setZoom(cv, cv.zoomPct + 10, null);
      return;
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      setZoom(cv, cv.zoomPct - 10, null);
      return;
    }
    if (mod && e.key === "0") {
      e.preventDefault();
      fitZoom(cv);
      return;
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      doSave(cv);
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) cv.state.redo(); else cv.state.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      for (i = 0; i < cv.selection.length; i++) duplicate(cv, cv.selection[i]);
      return;
    }
    if (!cv.selection.length) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const ids = cv.selection.slice();
      setSelection(cv, []);
      cv.state.batch(function () {
        for (i = 0; i < ids.length; i++) cv.state.removeWidget(ids[i]);
      });
      return;
    }
    let dx = 0, dy = 0;
    if (e.key === "ArrowLeft") dx = -1;
    else if (e.key === "ArrowRight") dx = 1;
    else if (e.key === "ArrowUp") dy = -1;
    else if (e.key === "ArrowDown") dy = 1;
    else return;
    e.preventDefault();
    cv.state.batch(function () {
      for (i = 0; i < cv.selection.length; i++) {
        const w = widgetOf(cv, cv.selection[i]);
        if (!w || w.locked) continue;
        const sw = spaceWidth(cv, cv.selection[i], s);
        const box = {
          x: w.box.x + dx * gridH(cv, s, sw), y: w.box.y + dy * (s.grid || 8),
          w: w.box.w, h: w.box.h
        };
        cv.state.moveWidget(cv.selection[i], clampBox(cv, box, s, sw));
      }
    });
  }

  function onKeyUp(cv, e) {
    if (e.key === " " || e.code === "Space") cv.spaceDown = false;
  }

  // function: Cmd-wheel zooms around the pointer. Plain wheel pans natively.
  function onWheel(cv, e) {
    if (cv.frozen) return;
    const vp = viewport(cv);
    if (!vp || !vp.contains(e.target)) return;
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -10 : 10;
    setZoom(cv, cv.zoomPct + dir, { x: e.clientX, y: e.clientY });
  }

  function bindDocListeners(cv) {
    const d = cv.idoc, w = cv.iwin;
    const on = (el, type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      cv.listeners.push([el, type, fn, opts]);
    };
    on(d, "mousedown", (e) => onMouseDown(cv, e), true);
    on(d, "mousemove", (e) => onMouseMove(cv, e), true);
    on(d, "mouseup", (e) => onMouseUp(cv, e), true);
    on(d, "contextmenu", (e) => onContextMenu(cv, e), true);
    on(w, "keydown", (e) => onKeyDown(cv, e), true);
    on(w, "keyup", (e) => onKeyUp(cv, e), true);
    on(d, "wheel", (e) => onWheel(cv, e), { passive: false, capture: true });
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

  function closestTarget(cv, e) {
    let el = e.target;
    while (el && el.nodeType === 1) {
      if (el === cv.idoc.body || el === cv.idoc.documentElement) return null;
      if (!isHostNode(cv, el)) return el;
      el = el.parentElement;
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
    layer.setAttribute("aria-hidden", "true");
    cv.idoc.body.appendChild(layer);
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

  function paintFileSelection(cv) {
    if (!cv.idoc || cv.docMode !== "file") return;
    if (cv.mode === "preview") { clearGuides(cv); return; }
    const id = cv.selection[0];
    if (!id) { clearGuides(cv); return; }
    const el = cv.patch.find(cv.idoc, id);
    if (!el) { clearGuides(cv); return; }
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    renderSelectedChrome(cv, layer, rectFor(el));
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

  function composeTransform(prefix, tx, ty) {
    const t = "translate(" + Math.round(tx) + "px, " + Math.round(ty) + "px)";
    return prefix ? (prefix + " " + t) : t;
  }

  // function: a text leaf. No element children, some text.
  function isTextLeaf(el) {
    if (!el || el.children.length) return false;
    return !!(el.textContent || "").trim();
  }

  function finishTextEdit(cv, commit) {
    const session = cv.textEdit;
    if (!session) return false;
    cv.textEdit = null;
    const el = session.el;
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-od-editing");
    el.removeEventListener("keydown", session.onKey);
    const value = (el.textContent || "").trim();
    const changed = value !== session.originalText.trim();
    if (commit && changed) {
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
        finishTextEdit(cv, false);
      }
    };
    cv.textEdit = { el: el, id: cv.patch.stableId(el), originalText: originalText, onKey: onKey };
    el.addEventListener("keydown", onKey);
  }

  // function: apply a patch to the held source, mark dirty, announce it.
  function patchSource(cv, patch) {
    if (cv.docMode !== "file" || !patch) return cv.source;
    const next = cv.patch.apply(cv.source, patch);
    if (next === cv.source) {
      setStatus(cv, "patch refused", true);
      return cv.source;
    }
    cv.source = next;
    cv.dirty = true;
    setStatus(cv, "dirty", true);
    if (cv.mirrors) cv.mirrors.change.emit({});
    markDirty(cv);
    return cv.source;
  }

  function onFilePointerDown(cv, e) {
    if (cv.mirrors) cv.mirrors.focus.emit({});
    if (cv.frozen || cv.mode === "preview" || cv.textEdit) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('[data-od-editing="true"]')) return;
    const el = closestTarget(cv, e);
    if (!el) { cv.drag = null; return; }
    const base = readTranslateBase(el);
    cv.drag = {
      el: el, id: cv.patch.stableId(el),
      startX: e.clientX, startY: e.clientY,
      prefix: base.prefix, baseTx: base.tx, baseTy: base.ty,
      started: false, bumpedDisplay: false
    };
  }

  function onFilePointerMove(cv, e) {
    const drag = cv.drag;
    if (!drag || cv.frozen) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.started && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      drag.started = true;
      // transform does not move a non-replaced inline element; bump it once.
      try {
        const disp = cv.iwin.getComputedStyle(drag.el).display;
        if (disp === "inline") {
          drag.el.style.display = "inline-block";
          drag.bumpedDisplay = true;
        }
      } catch (err) { /* computed style best effort */ }
      if (cv.selection[0] !== drag.id) setSelection(cv, [drag.id]);
    }
    if (!drag.started) return;
    drag.el.style.transform = composeTransform(drag.prefix, drag.baseTx + dx, drag.baseTy + dy);
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    renderReferenceGuides(cv, layer, drag.el);
    renderSelectedChrome(cv, layer, rectFor(drag.el));
    e.preventDefault();
  }

  function onFilePointerUp(cv, e) {
    const drag = cv.drag;
    if (!drag) return;
    cv.drag = null;
    if (!drag.started) return;
    cv.justDragged = true;
    e.preventDefault();
    e.stopPropagation();
    const styles = { transform: drag.el.style.transform || "" };
    if (drag.bumpedDisplay) styles.display = "inline-block";
    patchSource(cv, { id: drag.id, kind: "set-style", styles: styles });
    clearGuides(cv);
    paintFileSelection(cv);
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
    const el = closestTarget(cv, e);
    if (!el) { setSelection(cv, []); clearGuides(cv); return; }
    e.preventDefault();
    setSelection(cv, [cv.patch.stableId(el)]);
    paintFileSelection(cv);
  }

  function onFileDblClick(cv, e) {
    if (cv.frozen || cv.mode === "preview") return;
    const el = closestTarget(cv, e);
    if (!el || !isTextLeaf(el)) return;
    e.preventDefault();
    makeEditable(cv, el);
  }

  function bindFileListeners(cv) {
    const d = cv.idoc;
    const on = (el, type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      cv.listeners.push([el, type, fn, opts]);
    };
    on(d, "pointerdown", (e) => onFilePointerDown(cv, e), true);
    on(d, "pointermove", (e) => onFilePointerMove(cv, e), true);
    on(d, "pointerup", (e) => onFilePointerUp(cv, e), true);
    on(d, "click", (e) => onFileClick(cv, e), true);
    on(d, "dblclick", (e) => onFileDblClick(cv, e), true);
  }

  // ---------- load, save, export ----------

  function loadTarget(cv) {
    const frame = cv.frame;
    const target = frame.options.target || "";
    detachListeners(cv);
    closeMenu(cv);
    cv.path = target;
    cv.docMode = modeForTarget(target);
    cv.dirty = false;
    cv.gesture = null;
    cv.drag = null;
    cv.textEdit = null;
    cv.state = null;
    cv.render = null;
    cv.resolve = null;
    cv.source = "";
    cv.fromDoc = "";
    if (!target) {
      blankIframe(cv);
      renderBar(cv);
      setStatus(cv, "no target", true);
      return;
    }
    if (!cv.docMode) {
      blankIframe(cv);
      renderBar(cv);
      setStatus(cv, "target must be .json or .html", true);
      return;
    }
    setStatus(cv, "loading…", true);
    renderBar(cv);
    frame.send({ type: "open", path: target, inst: frame.id });
  }

  function loadDocMode(cv, text) {
    const core = cv.core;
    let parsed;
    try {
      parsed = JSON.parse(text || "");
    } catch (e) {
      setStatus(cv, "bad json", true);
      return;
    }
    cv.state = core.makeState(core.kit);
    cv.resolve = core.makeResolve(core.kit, cv.state);
    cv.loading = true;
    cv.state.load(parsed);
    cv.state.setDocPath(cv.path);
    cv.state.setAssetMode(cv.assetMode);
    cv.state.on(function () { onStateChange(cv); });
    loadIframe(cv, core.baseDocument("doc")).then((idoc) => {
      if (!cv.live) return;
      cv.idoc = idoc;
      cv.iwin = cv.iframe.contentWindow;
      cv.render = core.makeRender(cv.state, cv.resolve, idoc);
      bindDocListeners(cv);
      const s = cv.state.get();
      const known = s.pages.some((p) => p.id === cv.pageId);
      const pid = known ? cv.pageId : (s.page || (s.pages[0] && s.pages[0].id) || "");
      cv.pageId = pid;
      if (pid && pid !== s.page) cv.state.setPage(pid);
      redraw(cv);
      cv.loading = false;
      cv.dirty = false;
      renderBar(cv);
      setStatus(cv, "loaded");
      if (cv.mirrors) cv.mirrors.doc.emit({ mode: "doc", path: cv.path });
    });
  }

  function loadFileMode(cv, text) {
    const core = cv.core;
    cv.source = String(text || "");
    loadIframe(cv, core.baseDocument("file", cv.source)).then((idoc) => {
      if (!cv.live) return;
      cv.idoc = idoc;
      cv.iwin = cv.iframe.contentWindow;
      bindFileListeners(cv);
      const meta = idoc.querySelector('meta[name="' + BACK_LINK + '"]');
      cv.fromDoc = meta ? (meta.getAttribute("content") || "") : "";
      cv.dirty = false;
      renderBar(cv);
      paintFileSelection(cv);
      setStatus(cv, "loaded");
      if (cv.mirrors) cv.mirrors.doc.emit({ mode: "file", path: cv.path });
    });
  }

  // function: a State commit. Redraw, announce, mark dirty.
  function onStateChange(cv) {
    if (!cv.live) return;
    redraw(cv);
    renderTabs(cv);
    if (cv.loading) return;
    cv.dirty = true;
    setStatus(cv, "dirty", true);
    if (cv.mirrors) cv.mirrors.change.emit({});
    markDirty(cv);
  }

  function docText(cv) {
    if (cv.docMode === "doc" && cv.state) return JSON.stringify(cv.state.get(), null, 2);
    return cv.source || "";
  }

  function doSave(cv) {
    if (!cv.path || !cv.docMode) return Promise.resolve(false);
    const content = docText(cv);
    return new Promise((resolve) => {
      cv.pending[cv.path] = { content: content, resolve: resolve };
      setStatus(cv, "saving…", true);
      cv.frame.send({ type: "save", path: cv.path, content: content, inst: cv.frame.id });
    });
  }

  function exportPath(cv) {
    return String(cv.path).replace(/\.json$/i, "") + ".html";
  }

  // function: the current page as a standalone html string. The back-link
  // meta names the doc it came from.
  function exportHtml(cv) {
    const m = matrixEl(cv);
    if (!m) return "";
    const clone = m.cloneNode(true);
    const handles = clone.querySelectorAll(".cc-canvas-handle");
    for (let i = 0; i < handles.length; i++) handles[i].parentNode.removeChild(handles[i]);
    const sel = clone.querySelectorAll(".cc-canvas-selected");
    for (let i = 0; i < sel.length; i++) sel[i].classList.remove("cc-canvas-selected");
    const mq = clone.querySelectorAll(".cc-canvas-marquee");
    for (let i = 0; i < mq.length; i++) mq[i].parentNode.removeChild(mq[i]);
    clone.classList.remove("cc-canvas-matrix");
    clone.removeAttribute("id");
    const s = settings(cv);
    clone.setAttribute("style", "position: relative; margin: 0 auto; "
      + "background-color: " + paperColor(cv, s) + "; "
      + "width: " + (isFluid(s) ? "100%" : pageWidth(cv, s) + "px") + "; "
      + "min-height: 600px;");
    const styleEl = cv.idoc.getElementById("cc-render-style");
    const css = styleEl ? styleEl.textContent : "";
    const meta = cv.backLink
      ? '<meta name="' + BACK_LINK + '" content="' + cv.path.replace(/"/g, "&quot;") + '">\n'
      : "";
    return "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
      + meta
      + "<style>\n"
      + "html, body { margin: 0; }\n"
      + ".cc-canvas-widget { position: absolute; box-sizing: border-box; }\n"
      + css + "\n</style>\n</head>\n<body>\n"
      + clone.outerHTML
      + "\n</body>\n</html>\n";
  }

  function doExport(cv) {
    if (cv.docMode !== "doc" || !cv.idoc) return;
    const html = exportHtml(cv);
    if (!html) return;
    const path = exportPath(cv);
    cv.pending[path] = { content: html, resolve: () => {} };
    setStatus(cv, "exporting…", true);
    cv.frame.send({ type: "save", path: path, content: html, inst: cv.frame.id });
  }

  // ---------- bar ----------

  function renderTabs(cv) {
    const host = cv.tabBar;
    if (!host) return;
    host.textContent = "";
    if (cv.docMode !== "doc" || !cv.state) { host.hidden = true; return; }
    const s = cv.state.get();
    if (!s.pages || s.pages.length < 2) { host.hidden = true; return; }
    host.hidden = false;
    for (const p of s.pages) {
      const on = p.id === (cv.pageId || s.page);
      const t = document.createElement("button");
      t.type = "button";
      t.className = "mxcv-tab" + (on ? " mxcv-on" : "");
      t.textContent = p.name;
      t.addEventListener("click", () => setPage(cv, p.id));
      host.appendChild(t);
    }
  }

  function setPage(cv, pid) {
    if (cv.docMode !== "doc" || !cv.state) return;
    cv.pageId = pid;
    cv.state.setPage(pid);
    redraw(cv);
    renderTabs(cv);
    markDirty(cv);
  }

  function setMode(cv, mode) {
    if (MODES.indexOf(mode) < 0) return;
    cv.mode = mode;
    for (const key of Object.keys(cv.modeBtns)) {
      cv.modeBtns[key].classList.toggle("mxcv-btn-on", key === mode);
    }
    if (cv.docMode === "doc") redraw(cv);
    else paintFileSelection(cv);
    if (cv.mirrors) cv.mirrors.mode.emit({ mode: mode });
    markDirty(cv);
  }

  function renderBar(cv) {
    if (cv.pathEl) cv.pathEl.textContent = cv.path || "no target";
    if (cv.fromEl) {
      const has = cv.docMode === "file" && cv.fromDoc;
      cv.fromEl.hidden = !has;
      cv.fromBtn.hidden = !has;
      if (has) cv.fromEl.textContent = "from " + cv.fromDoc;
    }
    if (cv.exportBtn) cv.exportBtn.hidden = cv.docMode !== "doc";
    if (cv.schemBtn) {
      cv.schemBtn.hidden = cv.docMode !== "doc";
      cv.schemBtn.classList.toggle("mxcv-btn-on", !!cv.schematic);
    }
    if (cv.zoomBar) cv.zoomBar.hidden = cv.docMode !== "doc";
    updateReadout(cv);
    renderTabs(cv);
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

    cv.schemBtn = mkBtn("schematic", () => {
      cv.schematic = !cv.schematic;
      cv.schemBtn.classList.toggle("mxcv-btn-on", cv.schematic);
      redraw(cv);
      markDirty(cv);
    });
    bar.appendChild(cv.schemBtn);

    const zoom = document.createElement("span");
    zoom.className = "mxcv-zoom";
    zoom.appendChild(mkBtn("−", () => setZoom(cv, cv.zoomPct - 10, null)));
    cv.readoutEl = document.createElement("span");
    cv.readoutEl.className = "mxcv-readout";
    zoom.appendChild(cv.readoutEl);
    zoom.appendChild(mkBtn("+", () => setZoom(cv, cv.zoomPct + 10, null)));
    zoom.appendChild(mkBtn("Fit", () => fitZoom(cv)));
    cv.zoomBar = zoom;
    bar.appendChild(zoom);

    cv.pathEl = document.createElement("span");
    cv.pathEl.className = "mxcv-path";
    bar.appendChild(cv.pathEl);

    cv.fromEl = document.createElement("span");
    cv.fromEl.className = "mxcv-from";
    cv.fromEl.hidden = true;
    bar.appendChild(cv.fromEl);

    cv.fromBtn = mkBtn("Open doc", () => {
      if (cv.fromDoc) frame.setOption("target", cv.fromDoc);
    });
    cv.fromBtn.hidden = true;
    bar.appendChild(cv.fromBtn);

    bar.appendChild(mkBtn("Save", () => doSave(cv)));

    cv.exportBtn = mkBtn("Export", () => doExport(cv));
    bar.appendChild(cv.exportBtn);

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
      target: "", mode: "canvas", zoom: 100, selection: [],
      schematic: false, page: "", assetMode: "data", backLink: true,
      annotate: false, snapshot: "raster", annotateTrack: ""
    },

    optionControls: {
      target: MX.canvasTargetControl(true),
      mode: { kind: "select", values: () => MODES.slice() },
      assetMode: { kind: "select", values: () => ASSET_MODES.slice() },
      snapshot: { kind: "select", values: () => SNAPSHOT_MODES.slice() },
      annotateTrack: { kind: "select", values: (f) => trackNamesFor(f) }
    },

    mount(frame) {
      ensureStyles();

      const cv = frame._canvasState = {
        frame: frame, live: true, core: null,
        state: null, resolve: null, render: null, patch: null,
        iframe: null, idoc: null, iwin: null,
        mode: MODES.indexOf(frame.options.mode) >= 0 ? frame.options.mode : "canvas",
        zoomPct: clampZoom(Number(frame.options.zoom) || 100),
        selection: Array.isArray(frame.options.selection) ? frame.options.selection.slice() : [],
        schematic: !!frame.options.schematic,
        pageId: frame.options.page || "",
        assetMode: ASSET_MODES.indexOf(frame.options.assetMode) >= 0 ? frame.options.assetMode : "data",
        backLink: frame.options.backLink !== false,
        annotateOn: false,
        snapshotMethod: SNAPSHOT_MODES.indexOf(frame.options.snapshot) >= 0 ? frame.options.snapshot : "raster",
        annotateTrack: frame.options.annotateTrack || "",
        trackNames: [],
        ann: null, annBtn: null,
        path: "", docMode: "", source: "", fromDoc: "",
        dirty: false, loading: false, frozen: false,
        gesture: null, marquee: null, menu: null, spaceDown: false,
        drag: null, textEdit: null, justDragged: false, selfSavedAt: 0,
        listeners: [], mirrors: null, ro: null,
        pending: Object.create(null), drawSig: null,
        modeBtns: {}, statusEl: null, statusTimer: null, pathEl: null, tabBar: null,
        readoutEl: null, zoomBar: null, schemBtn: null,
        exportBtn: null, fromEl: null, fromBtn: null
      };

      const wrap = document.createElement("div");
      wrap.className = "mxcv-wrap";
      wrap.appendChild(buildBar(cv, frame));

      cv.tabBar = document.createElement("div");
      cv.tabBar.className = "mxcv-tabs";
      cv.tabBar.hidden = true;
      wrap.appendChild(cv.tabBar);

      const body = document.createElement("div");
      body.className = "mxcv-body";
      cv.iframe = document.createElement("iframe");
      cv.iframe.className = "mxcv-frame";
      body.appendChild(cv.iframe);
      cv.ann = MX.annotate(frame, body);
      body.appendChild(cv.ann.el);
      wrap.appendChild(body);
      frame.host.appendChild(wrap);

      frame.subscribe(["file", "saved", "tree_dirty", "ade_init", "track_list"]);
      frame.send({ type: "roster", inst: frame.id });

      // fluid width is the iframe's width; a resize rebases the page.
      if (window.ResizeObserver) {
        cv.ro = new ResizeObserver(() => {
          if (cv.docMode === "doc" && cv.render) redraw(cv);
        });
        cv.ro.observe(cv.iframe);
      }

      // the sibling-facing handle. 3C to 3E read it.
      frame._canvas = {
        place: (type, at) => place(cv, type, at),
        selected: () => cv.selection.slice(),
        freeze: (on) => applyFreeze(cv, on),
        redraw: () => (cv.docMode === "doc" ? redraw(cv) : paintFileSelection(cv)),
        get state() { return cv.state; },
        source: () => docText(cv),
        patchSource: (patch) => patchSource(cv, patch),
        mode: () => cv.mode,
        doc: () => cv.idoc
      };

      MX.canvasCore().then((core) => {
        if (!cv.live) return;
        cv.core = core;
        cv.patch = core.patch;
        cv.mirrors = core.mirrors(frame, {
          select: (payload) => applySelection(cv, payload.ids),
          freeze: (payload) => applyFreeze(cv, payload.on)
        });
        loadTarget(cv);
      });
    },

    canClose(frame) {
      const cv = frame._canvasState;
      if (!cv || !cv.dirty) return true;
      return MX.ui.choose("Unsaved changes",
        (cv.path || "This canvas") + " has unsaved changes.", [
          { label: "Save", value: "save", cls: "mx-go" },
          { label: "Discard", value: "discard" },
          { label: "Cancel", value: "cancel" }
        ]).then((choice) => {
          if (choice === "cancel") return false;
          if (choice === "discard") return true;
          return doSave(cv).then((ok) => !!ok);
        });
    },

    unmount(frame) {
      const cv = frame._canvasState;
      if (!cv) return;
      cv.live = false;
      if (cv.statusTimer) { clearTimeout(cv.statusTimer); cv.statusTimer = null; }
      detachListeners(cv);
      closeMenu(cv);
      if (cv.mirrors) cv.mirrors.off();
      if (cv.ro) { try { cv.ro.disconnect(); } catch (e) { /* teardown best effort */ } }
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
        return;
      }

      if (!cv.core) return;

      if (msg.type === "file") {
        if (msg.inst !== frame.id) return;
        if (msg.path !== cv.path) return;
        if (cv.docMode === "doc") loadDocMode(cv, msg.content || "");
        else loadFileMode(cv, msg.content || "");
        return;
      }

      if (msg.type === "saved") {
        const rec = cv.pending[msg.path];
        const denied = msg.ok === false || (typeof msg.result === "string"
          && (msg.result.startsWith("[save denied")
            || msg.result.startsWith("[WRITE refused")
            || msg.result.startsWith("[WRITE failed")));
        if (rec && msg.inst === frame.id) {
          delete cv.pending[msg.path];
          cv.selfSavedAt = Date.now();
          if (!denied && msg.path === cv.path) cv.dirty = false;
          setStatus(cv, denied ? (msg.result || "refused") : "saved", denied);
          rec.resolve(!denied);
          return;
        }
        // another instance wrote this path: take its copy when we hold none
        if (msg.inst !== frame.id && msg.path === cv.path && !denied) reopenIfClean(cv);
        return;
      }

      if (msg.type === "tree_dirty") reopenIfClean(cv);
    },

    onOption(frame, key, value) {
      const cv = frame._canvasState;
      if (!cv) return;
      if (key === "target") {
        if (cv.core) loadTarget(cv);
        return;
      }
      if (key === "mode") { setMode(cv, value); return; }
      if (key === "zoom") {
        cv.zoomPct = clampZoom(Number(value) || 100);
        applyZoom(cv);
        return;
      }
      if (key === "selection") { applySelection(cv, value); return; }
      if (key === "schematic") {
        cv.schematic = !!value;
        if (cv.schemBtn) cv.schemBtn.classList.toggle("mxcv-btn-on", cv.schematic);
        redraw(cv);
        return;
      }
      if (key === "page") {
        if (value && value !== cv.pageId) setPage(cv, value);
        return;
      }
      if (key === "assetMode") {
        cv.assetMode = ASSET_MODES.indexOf(value) >= 0 ? value : "data";
        if (cv.state) cv.state.setAssetMode(cv.assetMode);
        redraw(cv);
        return;
      }
      if (key === "backLink") { cv.backLink = value !== false; return; }
      if (key === "annotate") { setAnnotate(cv, !!value); return; }
      if (key === "snapshot") {
        cv.snapshotMethod = SNAPSHOT_MODES.indexOf(value) >= 0 ? value : "raster";
        return;
      }
      if (key === "annotateTrack") { cv.annotateTrack = value || ""; }
    },

    getOptions(frame) {
      const cv = frame._canvasState;
      if (!cv) return JSON.parse(JSON.stringify(frame.options));
      return {
        target: frame.options.target || "",
        mode: cv.mode,
        zoom: cv.zoomPct,
        selection: cv.selection.slice(),
        schematic: !!cv.schematic,
        page: cv.pageId || "",
        assetMode: cv.assetMode,
        backLink: !!cv.backLink,
        annotate: false,
        snapshot: cv.snapshotMethod,
        annotateTrack: cv.annotateTrack
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

  // function: cached track ids for the annotateTrack select.
  function trackNamesFor(frame) {
    const cv = frame._canvasState;
    return (cv && cv.trackNames) ? cv.trackNames.slice() : [];
  }

  // function: freeze from a sibling. Gestures are refused, the view stays.
  function applyFreeze(cv, on) {
    cv.frozen = !!on;
    const m = matrixEl(cv);
    if (m) m.classList.toggle("cc-canvas-frozen", cv.frozen);
    if (cv.frozen) closeMenu(cv);
  }

  // function: someone else wrote the tree. Take their copy when this
  // instance holds nothing unsaved and no gesture is live.
  function reopenIfClean(cv) {
    if (!cv.path || !cv.docMode) return;
    if (cv.dirty || cv.gesture || cv.drag || cv.textEdit) return;
    // our own save echoes back as tree_dirty; the copy on disk is ours
    if (cv.selfSavedAt && Date.now() - cv.selfSavedAt < 2000) return;
    cv.frame.send({ type: "open", path: cv.path, inst: cv.frame.id });
  }

  MX.registerWidget("canvas", MOD);
})();
