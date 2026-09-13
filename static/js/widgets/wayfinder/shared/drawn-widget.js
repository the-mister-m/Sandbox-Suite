// drawn widget shared — plumbing common to MapView-backed graph widgets
//
// State: none, every export is a pure function taking what it needs.
// MX.drawnWidgetEsc(s): html-escape.
// MX.drawnWidgetCentreFit(view, svg): fit() then recentre — MapView.fit
// leaves 430px for Wayfinder's own card panel (map.js fit/frame); a widget
// has none, so content is nudged back to the middle of the box.
// MX.drawnWidgetApplyCamera(view, svg, camera, homeYaw, homePitch): write a
// stored {yaw, pitch, scale} onto a MapView, zooming about the box middle
// so a remembered scale never shoves the graph off-screen.
// MX.drawnWidgetReadCamera(view): current camera as {yaw, pitch, scale}.
// MX.drawnWidgetHaystack/drawnWidgetSearchIds: search.ts port, same text
// every graph widget's search box runs against.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.drawnWidgetEsc = function (s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  };

  MX.drawnWidgetCentreFit = function (view, svg) {
    if (!view) return;
    view.fit();
    const r = svg.getBoundingClientRect();
    const free = Math.max(r.width - 430, 320);
    view.cam.ox += r.width / 2 - (free / 2 + 24 + 65);
    view.render();
  };

  MX.drawnWidgetApplyCamera = function (view, svg, camera, homeYaw, homePitch) {
    if (!view) return;
    const cam = camera || {};
    view.cam.yaw = typeof cam.yaw === "number" ? cam.yaw : homeYaw;
    view.cam.pitch = typeof cam.pitch === "number" ? cam.pitch : homePitch;
    const want = typeof cam.scale === "number" ? cam.scale : view.cam.scale;
    if (want && want !== view.cam.scale) {
      const r = svg.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      const k = want / view.cam.scale;
      view.cam.scale = want;
      view.cam.ox = cx - (cx - view.cam.ox) * k;
      view.cam.oy = cy - (cy - view.cam.oy) * k;
    }
    view.render();
  };

  MX.drawnWidgetReadCamera = function (view) {
    return { yaw: view.cam.yaw, pitch: view.cam.pitch, scale: view.cam.scale };
  };

  MX.drawnWidgetHaystack = function (n, fields, index) {
    const out = [];
    if (fields.searchName) {
      out.push(n.id);
      const path = n.path || n.id;
      out.push(path.slice(path.lastIndexOf("/") + 1));
    }
    const s = n.summary;
    if (s && fields.searchFacts) {
      if (s.shape) out.push(s.shape);
      if (s.facts) for (const f of s.facts) out.push(f);
    }
    if (fields.searchComments) {
      for (const c of index.commentsOn(n.id)) out.push(c.text);
    }
    return out;
  };

  MX.drawnWidgetSearchIds = function (index, query, fields) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    if (!fields.searchName && !fields.searchFacts && !fields.searchComments) return [];
    const hits = [];
    for (const n of index.nodes) {
      for (const text of MX.drawnWidgetHaystack(n, fields, index)) {
        if (String(text).toLowerCase().includes(q)) { hits.push(n.id); break; }
      }
    }
    return hits;
  };
})();
