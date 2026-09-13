// graph core — vendored wayfinder loader, graph fetch, filters, shared bits
//
// MX.graphCore(): the five vendored modules as one resolved object.
// MX.graphLoad(target)/graphDrop(target): fetch+memoize an Index per target.
// MX.graphFilters(options)/graphFiltersDefaults(): a Filters instance/plain
// object built from the option keys every graph widget persists.
// MX.graphKindClass(node): css class a node's kind paints as.
// MX.graphOptionControls(): the shared optionControls entries.
// MX.graphMirrors(frame, handlers): the four graph.* mirrors one frame.
// MX.graphRescanned(target): drop the cached Index, tell every tab to reload.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const VENDOR = "/static/vendor/wayfinder/";

  // section 3's defaults list, Filters constructor order
  // MX.graphFilterFields: the one copy — other widgets read this, none keep their own.
  const FILTER_FIELDS = Object.freeze([
    "codeFiles", "otherFiles", "duplicates", "guesses", "nestFolders",
    "capLevels", "searchName", "searchFacts", "searchComments",
    "reachMap", "reachCard", "reachDeep", "reachCommon",
    "commentHeader", "commentLeading", "commentTrailing", "commentInterior",
    "commentOrphan", "commentProse", "commentDead", "commentTodo",
    "commentDirective",
  ]);
  MX.graphFilterFields = FILTER_FIELDS;

  MX.graphCore = function () {
    return MX.moduleReady("wayfinder", () => Promise.all([
      import(VENDOR + "index.js"),
      import(VENDOR + "reach.js"),
      import(VENDOR + "filters.js"),
      import(VENDOR + "layout.js"),
      import(VENDOR + "map.js"),
    ]).then(([indexMod, reachMod, filtersMod, layoutMod, mapMod]) => ({
      loadGraph: indexMod.loadGraph,
      Index: indexMod.Index,
      EXPECTED_SCHEMA_VERSION: indexMod.EXPECTED_SCHEMA_VERSION,
      Filters: filtersMod.Filters,
      GUESS: filtersMod.GUESS,
      reachFrom: reachMod.reachFrom,
      chainText: reachMod.chainText,
      CHAIN_CAP: reachMod.CHAIN_CAP,
      planeLayout: layoutMod.planeLayout,
      fileLayout: layoutMod.fileLayout,
      zoomLayout: layoutMod.zoomLayout,
      makeProjection: layoutMod.makeProjection,
      HOME_YAW: layoutMod.HOME_YAW,
      HOME_PITCH: layoutMod.HOME_PITCH,
      MapView: mapMod.MapView,
    })));
  };

  const _indexCache = Object.create(null);

  MX.graphLoad = function (target) {
    if (!target) return Promise.reject(new Error("graphLoad: no target"));
    if (_indexCache[target]) return _indexCache[target];
    const p = MX.graphCore().then((core) => {
      const url = `/api/library/graphs/${encodeURIComponent(target)}`;
      // loadGraph(url) fetches and validates schema_version, returns the
      // raw graph; construct Index ourselves either way.
      if (typeof core.loadGraph === "function" && core.loadGraph.length >= 1) {
        return core.loadGraph(url).then((graph) => new core.Index(graph));
      }
      return fetch(url).then((r) => r.json()).then((graph) => new core.Index(graph));
    });
    _indexCache[target] = p;
    p.catch(() => { delete _indexCache[target]; });
    return p;
  };

  MX.graphDrop = function (target) {
    delete _indexCache[target];
  };

  // rescan stamp per target: one drop per scan, however many frames hear it
  const _rescanSeen = Object.create(null);

  function dropOnce(target, stamp) {
    if (_rescanSeen[target] === stamp) return;
    _rescanSeen[target] = stamp;
    MX.graphDrop(target);
  }

  MX.graphRescanned = function (target) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    dropOnce(target, stamp);
    MX.bus.emit("graph.rescan", { target: target, inst: "", stamp: stamp }, { remote: true });
  };

  // filters.js's own constructor defaults, copied here so a widget's
  // `defaults` object is synchronous — the vendored Filters class only
  // resolves after MX.graphCore()'s import().
  const FILTER_DEFAULTS = {
    codeFiles: true, otherFiles: true, duplicates: true, guesses: "flag",
    nestFolders: false, capLevels: false, searchName: true, searchFacts: false,
    searchComments: false, reachMap: false, reachCard: false, reachDeep: false,
    reachCommon: false, commentHeader: false, commentLeading: true,
    commentTrailing: true, commentInterior: true, commentOrphan: false,
    commentProse: true, commentDead: true, commentTodo: false,
    commentDirective: false,
  };

  MX.graphFiltersDefaults = function () {
    return Object.assign({}, FILTER_DEFAULTS);
  };

  // one-time drift check: FILTER_DEFAULTS is a second, hardcoded source of
  // truth for filters.js's constructor defaults (kept sync for widget
  // `defaults` objects). Warn once if the vendored ctor moves out of step.
  let _filterDefaultsDriftChecked = false;
  MX.graphCore().then((core) => {
    if (_filterDefaultsDriftChecked) return;
    _filterDefaultsDriftChecked = true;
    const live = new core.Filters();
    for (const key of Object.keys(FILTER_DEFAULTS)) {
      if (live[key] !== FILTER_DEFAULTS[key]) {
        console.warn(`graph-core: FILTER_DEFAULTS.${key} (${FILTER_DEFAULTS[key]}) drifted from Filters ctor (${live[key]})`);
      }
    }
  }).catch(() => {});

  MX.graphFilters = function (options) {
    return MX.graphCore().then((core) => {
      const f = new core.Filters();
      const opts = options || {};
      for (const key of Object.keys(opts)) {
        if (key !== "target") f[key] = opts[key];
      }
      return f;
    });
  };

  MX.graphKindClass = function (node) {
    return `kind-${node && node.kind}`;
  };

  // MapView builds bare svg elements; the paint is Wayfinder's own sheets,
  // ported here — style.css :601-676 and reach.css :10-50. Scoped to
  // .mx-map so nothing leaks into the rest of a surface.
  MX.graphMapStyles = function () {
    if (document.getElementById("mx-map-style")) return;
    const style = document.createElement("style");
    style.id = "mx-map-style";
    style.textContent = `
      .mx-map {
        --wf-ink: #d7dee9; --wf-ink-faint: #5c687a;
        --wf-html: #f0883e; --wf-css: #a371f7; --wf-js: #58a6ff;
        --wf-asset: #8b949e; --wf-class: #3fb950; --wf-fail: #f85149;
        --wf-e-imports: #58a6ff; --wf-e-contains: #8fa3c0; --wf-e-calls: #3fb950;
        --wf-e-styles: #a371f7; --wf-e-touches: #f0883e;
        --wf-reach: #57e0b8;
        --wf-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        display: block; width: 100%; height: 100%;
        cursor: grab; touch-action: none; background: #0b0d13;
      }
      .mx-map:active { cursor: grabbing; }

      .mx-map .wf-plane-face { fill: rgba(120,152,200,.045);
        stroke: rgba(150,185,235,.30); stroke-width: 1; }
      .mx-map .wf-plane-side { fill: rgba(70,92,128,.30);
        stroke: rgba(150,185,235,.16); stroke-width: .75; }
      .mx-map .wf-plane-grid { fill: none; stroke: rgba(140,175,225,.075); stroke-width: 1; }
      .mx-map .wf-plane-rule { stroke: rgba(150,185,235,.32); stroke-width: 1; }
      .mx-map .wf-plane-label { fill: var(--wf-ink); font-family: var(--wf-mono);
        font-size: 11px; letter-spacing: 2px; text-anchor: end; text-transform: lowercase;
        paint-order: stroke; stroke: rgba(8,10,15,.85); stroke-width: 3px; }
      .mx-map .wf-plane-count { fill: var(--wf-ink-faint); font-family: var(--wf-mono);
        font-size: 9px; letter-spacing: 1px; text-anchor: end;
        paint-order: stroke; stroke: rgba(8,10,15,.85); stroke-width: 3px; }

      .mx-map .wf-edge { fill: none; stroke-width: 1.25; stroke-linecap: round;
        transition: opacity .18s, stroke-width .18s; }
      .mx-map .wf-edge.k-imports  { stroke: var(--wf-e-imports);  opacity: .85; stroke-width: 2; }
      .mx-map .wf-edge.k-contains { stroke: var(--wf-e-contains); opacity: .11; stroke-width: 1; }
      .mx-map .wf-edge.k-calls    { stroke: var(--wf-e-calls);    opacity: .22; stroke-width: 1; }
      .mx-map .wf-edge.k-styles   { stroke: var(--wf-e-styles);   opacity: .72; stroke-width: 1.7; }
      .mx-map .wf-edge.k-touches  { stroke: var(--wf-e-touches);  opacity: .72; stroke-width: 1.7; }
      .mx-map .wf-edge.r-guess    { stroke-dasharray: 4 4; }
      .mx-map .wf-edge.dim        { opacity: .05 !important; }
      .mx-map .wf-edge.lit        { opacity: 1 !important; stroke-width: 2.4; filter: url(#wf-glow); }

      .mx-map .wf-node { cursor: pointer; transition: opacity .18s; }
      .mx-map .wf-node.is-file { stroke-width: 1.4; fill-opacity: .17; }
      .mx-map .wf-node.is-box  { stroke-width: 1.3; fill-opacity: .10; }
      .mx-map .wf-node.is-box:hover { fill-opacity: .22; }
      .mx-map .wf-node.openable { stroke-dasharray: none; stroke-width: 1.7; }
      .mx-map .wf-node.is-part { stroke-width: 1.2; fill-opacity: .55; }
      .mx-map .wf-node.lang-html       { fill: var(--wf-html);  stroke: var(--wf-html); }
      .mx-map .wf-node.lang-css        { fill: var(--wf-css);   stroke: var(--wf-css); }
      .mx-map .wf-node.lang-javascript { fill: var(--wf-js);    stroke: var(--wf-js); }
      .mx-map .wf-node.lang-none       { fill: var(--wf-asset); stroke: var(--wf-asset); }
      .mx-map .wf-node.kind-class      { fill: var(--wf-class); stroke: var(--wf-class); }
      .mx-map .wf-node.kind-folder     { fill: #7ee0c4; stroke: #7ee0c4; }
      .mx-map .wf-node.failed { stroke: var(--wf-fail); stroke-width: 2.2; stroke-dasharray: 5 3; }
      .mx-map .wf-node.dim    { opacity: .16; }
      .mx-map .wf-node.lit    { filter: url(#wf-glow); fill-opacity: .5; }
      .mx-map .wf-node.picked { stroke-width: 2.6; filter: url(#wf-glow); }

      .mx-map .wf-node-label { fill: var(--wf-ink); font-family: var(--wf-mono);
        font-size: 10.5px; text-anchor: middle; letter-spacing: .4px; pointer-events: none;
        paint-order: stroke; stroke: rgba(8,10,15,.9); stroke-width: 3.5px;
        transition: opacity .18s; }
      .mx-map .wf-node-label.dim { opacity: .2; }
      .mx-map .wf-node-label.lit { fill: #fff; }
      .mx-map .wf-node-sub { fill: var(--wf-ink-faint); font-family: var(--wf-mono);
        font-size: 9px; text-anchor: middle; letter-spacing: .6px; pointer-events: none;
        paint-order: stroke; stroke: rgba(8,10,15,.9); stroke-width: 3px; }
      .mx-map .wf-node-sub.dim { opacity: .15; }
      .mx-map .wf-hover-label { fill: #fff; font-family: var(--wf-mono); font-size: 10.5px;
        text-anchor: middle; pointer-events: none; paint-order: stroke;
        stroke: rgba(8,10,15,.95); stroke-width: 4px; }

      .mx-map .wf-node.reachlit { stroke: var(--wf-reach); stroke-width: 1.9; paint-order: stroke; }
      .mx-map .wf-node.reachlit.dim,
      .mx-map .wf-node-label.reachlit.dim,
      .mx-map .wf-node-sub.reachlit.dim { opacity: .92; }
      .mx-map .wf-node.is-file.reachlit { filter: url(#wf-glow); }
      .mx-map .wf-node.picked.reachlit { stroke: var(--wf-reach); stroke-width: 2.4; }
      .mx-map .wf-node-label.reachlit,
      .mx-map .wf-node-sub.reachlit { fill: var(--wf-reach); }
    `;
    document.head.appendChild(style);
  };

  MX.graphOptionControls = function () {
    return {
      target: MX.targetControl(MX.graphTargets, MX.graphTargetNew),
      guesses: { kind: "select", values: () => ["on", "flag", "off"] },
    };
  };

  MX.graphMirrors = function (frame, handlers) {
    handlers = handlers || {};
    const select = MX.mirror(frame, "graph.select", handlers.select || (() => {}));
    const filters = MX.mirror(frame, "graph.filters", handlers.filters || (() => {}));
    const reach = MX.mirror(frame, "graph.reach", handlers.reach || (() => {}));
    const rescan = MX.mirror(frame, "graph.rescan", (payload) => {
      dropOnce(payload.target, payload.stamp);
      (handlers.rescan || (() => {}))(payload);
    });

    // select emit: one per tick, last fields win
    const sendSelect = select.emit;
    let pending = null;
    select.emit = function (fields) {
      const idle = pending === null;
      pending = fields;
      if (!idle) return;
      Promise.resolve().then(() => {
        const out = pending;
        pending = null;
        sendSelect(out);
      });
    };

    return {
      select, filters, reach, rescan,
      off() { select.off(); filters.off(); reach.off(); rescan.off(); },
    };
  };
})();
