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
      .mxcv-targets { display: flex; gap: 2px; padding: 2px 6px; flex: 0 0 auto;
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
    if (cv.docMode === "file") paintFileSelection(cv);
    else paintSelection(cv);
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
    cv.render.page(pid, {
      play: cv.mode === "preview", only: changedIds(cv, s, pid),
      links: cv.mode === "preview" || !!cv.linksLive
    });
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
    for (let i = 0; i < items.length; i++) {
      const fn = items[i][1];
      const row = cv.idoc.createElement("div");
      row.textContent = items[i][0];
      row.style.cssText = "padding: 4px 16px; cursor: default;";
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

  // function: [label, fn] rows for the current selection and docMode. Shared
  // by the canvas's own menus and the Layers panel's right-click.
  function menuItems(cv) {
    if (cv.docMode === "file") {
      return [
        ["Group", () => fileGroup(cv, cv.selection.slice())],
        ["Ungroup", () => fileUngroup(cv, cv.selection[0])],
        ["Bring forward", () => fileOrder(cv, cv.selection.slice(), "forward")],
        ["Send backward", () => fileOrder(cv, cv.selection.slice(), "back")],
        ["Bring to front", () => fileOrder(cv, cv.selection.slice(), "front")],
        ["Send to back", () => fileOrder(cv, cv.selection.slice(), "toBack")],
        ["Duplicate", () => fileDuplicate(cv, cv.selection.slice())],
        ["Delete", () => fileRemove(cv, cv.selection.slice())]
      ];
    }
    // state: the doc list's Lock label reads the first selected widget.
    const id = cv.selection[0];
    const w = id ? widgetOf(cv, id) : null;
    return [
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
        if (cv.mirrors && id) cv.mirrors.select.emit({ ids: [id], notes: true });
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
        if (id) cv.state.setLocked(id, !(w && w.locked));
      }]
    ];
  }

  // function: context menu at a point for the current selection.
  function openMenu(cv, x, y) {
    openMenuItems(cv, x, y, menuItems(cv));
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

  // function: true for the port's own chrome inside the iframe.
  function inChrome(target) {
    return !!(target && target.closest
      && target.closest(".cc-canvas-menu, [data-od-edit-guides-layer]"));
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
    // state: a host node, so patch.js skips it when it counts children.
    layer.setAttribute("data-od-edit-bridge", "guides");
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

  // function: chrome for every selected id.
  function paintFileSelection(cv) {
    if (!cv.idoc || cv.docMode !== "file" || !cv.patch) return;
    if (cv.mode === "preview") { clearGuides(cv); return; }
    if (!cv.selection.length) { clearGuides(cv); return; }
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    for (let i = 0; i < cv.selection.length; i++) {
      const el = cv.patch.find(cv.idoc, cv.selection[i]);
      if (el) renderSelectedChrome(cv, layer, rectFor(el));
    }
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
      return;
    }
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
    for (let j = 0; j < drag.items.length; j++) {
      const moved = drag.items[j];
      moved.el.style.transform = composeTransform(moved.prefix, moved.baseTx + dx, moved.baseTy + dy);
    }
    const layer = ensureGuidesLayer(cv);
    layer.replaceChildren();
    const lead = drag.items[0];
    if (lead) {
      renderReferenceGuides(cv, layer, lead.el);
      for (let k = 0; k < drag.items.length; k++) {
        renderSelectedChrome(cv, layer, rectFor(drag.items[k].el));
      }
    }
    e.preventDefault();
  }

  function onFilePointerUp(cv, e) {
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
    const el = closestTarget(cv, e);
    if (!el || !isTextLeaf(el)) return;
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
      const base = readTranslateBase(el);
      patches.push({
        kind: "set-style", id: cv.selection[i],
        styles: { transform: composeTransform(base.prefix, base.tx + dx, base.ty + dy) }
      });
    }
    if (!patches.length) return false;
    return applyPatches(cv, patches);
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
      setSelection(cv, []);
      return;
    }
    if (mod && key === "s") { e.preventDefault(); doSave(cv); return; }
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
  }

  // ---------- load, save, export ----------

  // function: the element that scrolls. The doc-mode viewport, else the
  // iframe document.
  function scrollerFor(cv) {
    if (!cv.idoc) return null;
    const vp = cv.docMode === "doc" ? viewport(cv) : null;
    return vp || cv.idoc.scrollingElement;
  }

  // function: hold the active tab's text, dirty flag, selection, scroll and
  // history in cv.tabs.
  function stash(cv) {
    if (!cv.path) return;
    const sc = scrollerFor(cv);
    cv.tabs[cv.path] = {
      text: docText(cv),
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
    cv.history = (rec.history && docText(cv) === rec.text) ? rec.history : null;
    cv.dirty = !!rec.dirty;
  }

  function loadTarget(cv) {
    const frame = cv.frame;
    const target = frame.options.target || "";
    if (cv.docMode === "file" && cv.idoc) endGestures(cv, true);
    if (cv.path && cv.path !== target) stash(cv);
    detachListeners(cv);
    closeMenu(cv);
    cv.path = target;
    cv.docMode = modeForTarget(target);
    cv.dirty = false;
    cv.history = null;
    cv.gesture = null;
    cv.drag = null;
    cv.fileMarquee = null;
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
    const rec = cv.tabs[target];
    if (rec && rec.dirty) {
      if (cv.docMode === "doc") loadDocMode(cv, rec.text);
      else loadFileMode(cv, rec.text);
      return;
    }
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
      restoreTab(cv, cv.tabs[cv.path]);
      renderBar(cv);
      setStatus(cv, cv.dirty ? "dirty" : "loaded", cv.dirty);
      // state: focus first, so a sibling on the old tab re-targets before the
      // doc frame it filters by target arrives.
      if (cv.mirrors) {
        cv.mirrors.focus.emit({});
        cv.mirrors.doc.emit({ mode: "doc", path: cv.path });
      }
    });
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
      const meta = idoc.querySelector('meta[name="' + BACK_LINK + '"]');
      cv.fromDoc = meta ? (meta.getAttribute("content") || "") : "";
      cv.dirty = false;
      restoreTab(cv, cv.tabs[cv.path]);
      ensureHistory(cv);
      renderBar(cv);
      paintFileSelection(cv);
      setStatus(cv, cv.dirty ? "dirty" : "loaded", cv.dirty);
      if (cv.mirrors) {
        cv.mirrors.focus.emit({});
        cv.mirrors.doc.emit({ mode: "file", path: cv.path });
      }
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
    if (cv.docMode === "file" && cv.idoc) endGestures(cv, true);
    stash(cv);
    cv.frame.setOption("target", path);
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
    if (cv.docMode === "file" && cv.idoc) endGestures(cv, true);
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
    if (cv.linksBtn) {
      cv.linksBtn.hidden = cv.docMode !== "doc";
      cv.linksBtn.classList.toggle("mxcv-btn-on", !!cv.linksLive);
    }
    if (cv.zoomBar) cv.zoomBar.hidden = cv.docMode !== "doc";
    updateReadout(cv);
    renderTargetTabs(cv);
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

    cv.linksBtn = mkBtn("links", () => {
      cv.linksLive = !cv.linksLive;
      cv.linksBtn.classList.toggle("mxcv-btn-on", cv.linksLive);
      redraw(cv);
      markDirty(cv);
    });
    bar.appendChild(cv.linksBtn);

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
      target: "", targets: [], mode: "preview", zoom: 100, selection: [],
      schematic: false, linksLive: false, page: "", assetMode: "data", backLink: true,
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
        mode: "preview",
        targets: Array.isArray(frame.options.targets) ? frame.options.targets.slice() : [],
        tabs: Object.create(null),
        history: null,
        zoomPct: clampZoom(Number(frame.options.zoom) || 100),
        selection: Array.isArray(frame.options.selection) ? frame.options.selection.slice() : [],
        schematic: !!frame.options.schematic,
        linksLive: !!frame.options.linksLive,
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
        drag: null, fileMarquee: null, textEdit: null,
        justDragged: false, selfSavedAt: 0,
        listeners: [], mirrors: null, ro: null,
        pending: Object.create(null), drawSig: null,
        modeBtns: {}, statusEl: null, statusTimer: null, pathEl: null,
        tabBar: null, targetsEl: null,
        readoutEl: null, zoomBar: null, schemBtn: null, linksBtn: null,
        exportBtn: null, fromEl: null, fromBtn: null
      };

      const wrap = document.createElement("div");
      wrap.className = "mxcv-wrap";
      wrap.appendChild(buildBar(cv, frame));

      cv.targetsEl = document.createElement("div");
      cv.targetsEl.className = "mxcv-targets";
      cv.targetsEl.hidden = true;
      wrap.appendChild(cv.targetsEl);

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

      // state: the active target always has a tab.
      if (frame.options.target && cv.targets.indexOf(frame.options.target) < 0) {
        cv.targets.push(frame.options.target);
        frame.setOption("targets", cv.targets.slice());
      }
      renderTargetTabs(cv);

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
        menuItems: () => menuItems(cv)
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
      if (cv.docMode === "file" && cv.idoc) endGestures(cv, false);
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
        if (cv.ann && cv.ann.refreshTracks) cv.ann.refreshTracks();
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
      if (key === "linksLive") {
        cv.linksLive = !!value;
        if (cv.linksBtn) cv.linksBtn.classList.toggle("mxcv-btn-on", cv.linksLive);
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
        targets: cv.targets.slice(),
        mode: cv.mode,
        zoom: cv.zoomPct,
        selection: cv.selection.slice(),
        schematic: !!cv.schematic,
        linksLive: !!cv.linksLive,
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
