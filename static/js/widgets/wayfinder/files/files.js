// graph files widget — MapView over fileLayout (global) or zoomLayout (local)
//
// State: target's Index, a Filters instance, one ViewModel handed to
// MapView.show, a mermaid frame under the svg. No sim: both recipes are
// flat, MapView's own bind pans/zooms flat modes with no orbit.
// view "global" -> fileLayout(index, filters), one box per file.
// view "local"  -> zoomLayout(index, filters, trail, page), one folder
// open at a time; trail/page persist, drilling sets trail from
// vm.drillTo.get(id) on a click MapView marks drillable.
// Mirrors: select/filters/reach from MX.graphMirrors. A mirrored select for
// an id not on the current local level lights nothing and leaves trail
// alone — pushSelection filters against vm.placed (the level's own drawn
// boxes), not vm.nodes (zoomLayout hands back the whole index there).

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // graph-core.js owns the one copy
  const FILTER_FIELDS = MX.graphFilterFields;

  const esc = MX.drawnWidgetEsc;

  function ensureStyles() {
    if (document.getElementById("flg-style")) return;
    const style = document.createElement("style");
    style.id = "flg-style";
    style.textContent = `
      .flg-wrap { display: flex; flex-direction: column; height: 100%; font-size: 12px; }
      .flg-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; flex-wrap: wrap; }
      .flg-search { flex: 1 1 auto; min-width: 60px; font-size: 12px; }
      .flg-check { display: flex; align-items: center; gap: 2px; font-size: 11px; white-space: nowrap; }
      .flg-btn { font-size: 11px; padding: 1px 6px; cursor: pointer;
        border: 1px solid var(--border, #333); background: none; color: inherit; }
      .flg-btn.flg-on { background: var(--surface-2, #1c1c1c); }
      .flg-btn[disabled] { opacity: .4; cursor: default; }
      .flg-crumbs { display: flex; align-items: center; gap: 4px; font-size: 11px; }
      .flg-crumbs[hidden] { display: none; }
      .flg-crumb { cursor: pointer; text-decoration: underline dotted; }
      .flg-hits { max-height: 120px; overflow: auto; flex: 0 0 auto;
        border-bottom: 1px solid var(--border, #333); }
      .flg-hits[hidden] { display: none; }
      .flg-hit { padding: 2px 6px; cursor: pointer; }
      .flg-hit:hover { background: var(--surface-2, #1c1c1c); }
      .flg-map-host { flex: 1 1 auto; position: relative; min-height: 80px; overflow: hidden; }
      .flg-path { position: absolute; top: 4px; left: 6px; font-size: 10.5px;
        color: var(--wf-ink, #d7dee9); opacity: .8; pointer-events: none;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
      .flg-path[hidden] { display: none; }
      .flg-mermaid-host { flex: 0 0 auto; max-height: 40%; overflow: auto;
        border-top: 1px solid var(--border, #333); }
    `;
    document.head.appendChild(style);
  }

  // ---- search ---------------------------------------------------------

  function redrawHits(frame) {
    const st = frame._files;
    if (!st.index) { st.hitsEl.hidden = true; st.hitsEl.innerHTML = ""; return; }
    const fields = {
      searchName: !!frame.options.searchName,
      searchFacts: !!frame.options.searchFacts,
      searchComments: !!frame.options.searchComments,
    };
    const ids = MX.drawnWidgetSearchIds(st.index, frame.options.query || "", fields);
    st.hitsEl.hidden = ids.length === 0;
    st.hitsEl.innerHTML = ids
      .map((id) => `<div class="flg-hit" data-id="${esc(id)}">${esc(id)}</div>`).join("");
  }

  // ---- view / crumbs / paging ------------------------------------------

  // layout.js already stamps a folder crumb's trailing slash
  function crumbLabel(c) {
    return c.label;
  }

  function redrawCrumbs(frame) {
    const st = frame._files;
    const local = frame.options.view === "local";
    const vm = st.vm;
    const crumbs = (local && vm && vm.crumbs) ? vm.crumbs : [];

    st.viewBtn.textContent = local ? "local" : "global";
    st.viewBtn.classList.toggle("flg-on", local);

    st.crumbBar.hidden = !local || crumbs.length === 0;
    st.crumbBar.innerHTML = crumbs
      .map((c, i) => `<span class="flg-crumb" data-idx="${i}">${esc(crumbLabel(c, i))}</span>`)
      .join('<span aria-hidden="true"> / </span>');
    st.homeBtn.hidden = !local || (frame.options.trail || []).length === 0;

    const page = local && vm ? vm.page : null;
    const paged = !!(page && page.pages > 1);
    st.pageBox.hidden = !paged;
    if (paged) {
      st.prevBtn.disabled = page.at <= 0;
      st.nextBtn.disabled = page.at >= page.pages - 1;
      st.pageLbl.textContent = `${page.at + 1}/${page.pages}`;
    }

    st.pathEl.hidden = !local || crumbs.length === 0;
    st.pathEl.textContent = crumbs.map((c, i) => crumbLabel(c, i)).join(" / ");
  }

  function setTrail(frame, trail) {
    const st = frame._files;
    st.applying = true;
    try { frame.setOption("page", 0); } finally { st.applying = false; }
    frame.setOption("trail", (trail || []).slice());
  }

  function setView(frame, next) {
    const st = frame._files;
    st.applying = true;
    try { frame.setOption("page", 0); } finally { st.applying = false; }
    frame.setOption("view", next);
  }

  // ---- camera ------------------------------------------------------------

  function centreFit(frame) {
    const st = frame._files;
    MX.drawnWidgetCentreFit(st.view, st.svg);
  }

  function applyCamera(frame) {
    const st = frame._files;
    if (!st.view) return;
    MX.drawnWidgetApplyCamera(st.view, st.svg, frame.options.camera, 0, 0);
  }

  // st.restoring: camera writes off until applyCamera has run
  function readCamera(frame) {
    const st = frame._files;
    if (!st.view) return;
    if (st.restoring) return;
    frame.options.camera = MX.drawnWidgetReadCamera(st.view);
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
  }

  // ---- mermaid / reach -----------------------------------------------

  function setMermaid(frame) {
    const st = frame._files;
    if (!st.mermaid || !st.index) return;
    st.mermaid.set(st.index, frame.options.selectedIds || [], !!frame.options.reachDeep);
  }

  function emitReach(frame) {
    const st = frame._files;
    if (!st.index || !st.core || !st.mirrors) return;
    if (!frame.options.reachMap || !frame.options.focusedId) return;
    const deep = !!frame.options.reachDeep;
    const out = st.core.reachFrom(st.index, frame.options.focusedId, deep);
    st.mirrors.reach.emit({
      from: frame.options.focusedId, deep, ids: out.ids, chains: out.chains,
    });
    lightReach(frame, out.ids);
  }

  function lightReach(frame, ids) {
    const st = frame._files;
    if (!st.view) return;
    st.view.reachSet = ids && ids.length ? new Set(ids) : null;
    st.view.paintState();
  }

  // ---- selection ----------------------------------------------------

  // the map's own pick, on its way out
  function onPick(frame) {
    const st = frame._files;
    frame.options.selectedIds = st.view.selectedIds.slice();
    frame.options.focusedId = st.view.focusedId || "";
    st.mirrors.select.emit({
      ids: frame.options.selectedIds, focused: frame.options.focusedId,
    });
    setMermaid(frame);
    emitReach(frame);
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
  }

  function onDrillBox(frame, id) {
    const st = frame._files;
    if (!st.vm || !st.vm.drillTo || !st.vm.drillTo.has(id)) return;
    setTrail(frame, st.vm.drillTo.get(id));
  }

  // vm.placed is the current level's own drawn boxes — zoomLayout's
  // vm.nodes is the whole index, not this level, so a stale pick from
  // another level would otherwise look "on screen" and throw on select.
  function pushSelection(frame) {
    const st = frame._files;
    if (!st.view) return;
    const onLevel = (id) => st.vm && st.vm.placed && st.vm.placed.has(id);
    const ids = (frame.options.selectedIds || []).filter(onLevel);
    st.view.selectedIds = ids;
    st.view.focusedId = ids.indexOf(frame.options.focusedId) >= 0
      ? frame.options.focusedId : (ids[ids.length - 1] || null);
    st.view.paintState();
  }

  function filtersPayload(frame) {
    const out = {};
    for (const key of Object.keys(frame.options)) {
      if (key !== "target") out[key] = frame.options[key];
    }
    return out;
  }

  // ---- build / rebuild -------------------------------------------------

  function computeVm(st, frame) {
    if (frame.options.view === "local") {
      return st.core.zoomLayout(st.index, st.filters, frame.options.trail || [], frame.options.page || 0);
    }
    return st.core.fileLayout(st.index, st.filters);
  }

  function rebuild(frame) {
    const st = frame._files;
    if (!st.index || !st.filters || !st.view) return;
    st.vm = computeVm(st, frame);
    st.view.show(st.vm, { keepSelection: true, keepCamera: true });
    pushSelection(frame);
    centreFit(frame);
    redrawHits(frame);
    redrawCrumbs(frame);
  }

  function loadTarget(frame) {
    const st = frame._files;
    if (!frame.options.target) {
      st.index = null; st.filters = null; st.vm = null;
      if (st.view) st.view.vm = null;
      if (st.mermaid) st.mermaid.clear();
      redrawHits(frame);
      redrawCrumbs(frame);
      return;
    }
    MX.graphCore().then((core) => {
      st.core = core;
      return MX.graphLoad(frame.options.target);
    }).then((index) => {
      st.index = index;
      return MX.graphFilters(frame.options);
    }).then((filters) => {
      st.filters = filters;
      if (!st.view) {
        st.view = new st.core.MapView(st.svg, st.index, {
          onSelect: () => onPick(frame),
          onDrill: (id) => onDrillBox(frame, id),
          look: (e) => st.filters.stampOf(e),
        });
        st.svg.addEventListener("wf-cam", () => readCamera(frame));
        st.svg.addEventListener("wheel", () => readCamera(frame), { passive: true });
        st.svg.addEventListener("pointerup", () => readCamera(frame));
      } else {
        st.view.index = st.index;
      }
      st.vm = computeVm(st, frame);
      st.restoring = true;
      st.view.show(st.vm, { keepSelection: false, keepCamera: true });
      pushSelection(frame);
      centreFit(frame);
      applyCamera(frame);
      st.restoring = false;
      setMermaid(frame);
      redrawHits(frame);
      redrawCrumbs(frame);
    }).catch((e) => {
      st.index = null; st.filters = null; st.vm = null;
      console.warn("graph_files load failed:", e);
      redrawHits(frame);
      redrawCrumbs(frame);
    });
  }

  // ---- mirror arrivals ----------------------------------------------------

  // st.applying: a mirror arrival goes through setOption like any other
  // change, and onOption's emit sites stand down while it does
  function applySelect(frame, payload) {
    const st = frame._files;
    st.applying = true;
    try {
      // focus staged before the first emitting write
      frame.options.focusedId = payload.focused || "";
      frame.setOption("selectedIds", Array.isArray(payload.ids) ? payload.ids.slice() : []);
      frame.setOption("focusedId", payload.focused || "");
    } finally {
      st.applying = false;
    }
    setMermaid(frame);
  }

  function applyFilters(frame, payload) {
    const st = frame._files;
    const incoming = payload.filters || {};
    let touchedFilter = false;
    st.applying = true;
    try {
      for (const key of Object.keys(incoming)) {
        if (key === "target") continue;
        frame.setOption(key, incoming[key]);
        if (FILTER_FIELDS.indexOf(key) >= 0) touchedFilter = true;
      }
    } finally {
      st.applying = false;
    }
    if (touchedFilter) rebuild(frame);
    redrawHits(frame);
  }

  function applyReach(frame, payload) {
    lightReach(frame, payload.ids || []);
  }

  MX.registerWidget("graph_files", {
    defaults: Object.assign({
      target: "",
      selectedIds: [],
      focusedId: "",
      camera: { yaw: -0.42, pitch: 0.92, scale: 1 },
      mermaidCollapsed: false,
      view: "global",
      trail: [],
      page: 0,
      query: "",
    }, MX.graphFiltersDefaults()),

    optionControls: Object.assign({}, MX.graphOptionControls(), {
      view: { kind: "select", values: () => ["global", "local"] },
    }),

    mount(frame) {
      ensureStyles();
      MX.graphMapStyles();

      const st = frame._files = {
        core: null, index: null, filters: null, view: null, vm: null,
        mermaid: null, svg: null, hitsEl: null, checks: {},
        viewBtn: null, crumbBar: null, homeBtn: null,
        pageBox: null, prevBtn: null, nextBtn: null, pageLbl: null,
        pathEl: null, mirrors: null, applying: false,
      };

      const wrap = document.createElement("div");
      wrap.className = "flg-wrap";

      const bar = document.createElement("div");
      bar.className = "flg-bar";

      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "flg-btn";
      viewBtn.textContent = frame.options.view === "local" ? "local" : "global";
      viewBtn.addEventListener("click", () => {
        setView(frame, frame.options.view === "local" ? "global" : "local");
      });
      st.viewBtn = viewBtn;
      bar.appendChild(viewBtn);

      const homeBtn = document.createElement("button");
      homeBtn.type = "button";
      homeBtn.className = "flg-btn";
      homeBtn.textContent = "home";
      homeBtn.hidden = true;
      homeBtn.addEventListener("click", () => setTrail(frame, []));
      st.homeBtn = homeBtn;
      bar.appendChild(homeBtn);

      const crumbBar = document.createElement("div");
      crumbBar.className = "flg-crumbs";
      crumbBar.hidden = true;
      crumbBar.addEventListener("click", (ev) => {
        const c = ev.target.closest("[data-idx]");
        if (!c || !st.vm || !st.vm.crumbs) return;
        const crumb = st.vm.crumbs[Number(c.getAttribute("data-idx"))];
        if (crumb) setTrail(frame, crumb.trail);
      });
      st.crumbBar = crumbBar;
      bar.appendChild(crumbBar);

      const pageBox = document.createElement("span");
      pageBox.className = "flg-check";
      pageBox.hidden = true;
      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "flg-btn";
      prevBtn.textContent = "‹";
      prevBtn.addEventListener("click", () => frame.setOption("page", Math.max(0, (frame.options.page || 0) - 1)));
      const pageLbl = document.createElement("span");
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "flg-btn";
      nextBtn.textContent = "›";
      nextBtn.addEventListener("click", () => frame.setOption("page", (frame.options.page || 0) + 1));
      pageBox.appendChild(prevBtn);
      pageBox.appendChild(pageLbl);
      pageBox.appendChild(nextBtn);
      st.pageBox = pageBox; st.prevBtn = prevBtn; st.nextBtn = nextBtn; st.pageLbl = pageLbl;
      bar.appendChild(pageBox);

      const search = document.createElement("input");
      search.type = "text";
      search.className = "flg-search";
      search.placeholder = "search";
      search.value = frame.options.query || "";
      search.addEventListener("input", () => frame.setOption("query", search.value));
      bar.appendChild(search);

      for (const key of ["searchName", "searchFacts", "searchComments"]) {
        const lbl = document.createElement("label");
        lbl.className = "flg-check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !!frame.options[key];
        box.addEventListener("change", () => frame.setOption(key, box.checked));
        st.checks[key] = box;
        lbl.appendChild(box);
        lbl.appendChild(document.createTextNode(key.slice("search".length)));
        bar.appendChild(lbl);
      }

      const fitBtn = document.createElement("button");
      fitBtn.type = "button";
      fitBtn.className = "flg-btn";
      fitBtn.textContent = "fit";
      fitBtn.addEventListener("click", () => { centreFit(frame); readCamera(frame); });
      bar.appendChild(fitBtn);

      const gearBtn = document.createElement("button");
      gearBtn.type = "button";
      gearBtn.className = "flg-btn";
      gearBtn.textContent = "⚙";
      gearBtn.title = "options";
      gearBtn.addEventListener("click", () => frame.toggleOptions());
      bar.appendChild(gearBtn);

      wrap.appendChild(bar);

      const hits = document.createElement("div");
      hits.className = "flg-hits";
      hits.hidden = true;
      hits.addEventListener("click", (ev) => {
        const row = ev.target.closest("[data-id]");
        if (!row || !st.view) return;
        st.view.select(row.getAttribute("data-id"), { add: false });
      });
      st.hitsEl = hits;
      wrap.appendChild(hits);

      const mapHost = document.createElement("div");
      mapHost.className = "flg-map-host";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "mx-map");
      st.svg = svg;
      mapHost.appendChild(svg);
      const pathEl = document.createElement("div");
      pathEl.className = "flg-path";
      pathEl.hidden = true;
      st.pathEl = pathEl;
      mapHost.appendChild(pathEl);
      wrap.appendChild(mapHost);

      const mermaidHost = document.createElement("div");
      mermaidHost.className = "flg-mermaid-host";
      wrap.appendChild(mermaidHost);

      frame.host.appendChild(wrap);

      st.mermaid = MX.mermaidFrame(mermaidHost, { collapsed: !!frame.options.mermaidCollapsed });

      st.mirrors = MX.graphMirrors(frame, {
        select: (payload) => applySelect(frame, payload),
        filters: (payload) => applyFilters(frame, payload),
        reach: (payload) => applyReach(frame, payload),
        rescan: () => loadTarget(frame),
      });

      loadTarget(frame);
    },

    unmount(frame) {
      const st = frame._files;
      if (!st) return;
      if (st.mirrors) st.mirrors.off();
      if (st.mermaid) {
        st.mermaid.clear();
        if (st.mermaid.el && st.mermaid.el.parentNode) st.mermaid.el.parentNode.removeChild(st.mermaid.el);
      }
      st.view = null;
      st.vm = null;
      frame._files = null;
    },

    onOption(frame, key, value) {
      const st = frame._files;
      if (!st) return;
      const dirty = () => { if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame); };

      if (key === "target") {
        loadTarget(frame);
        dirty();
        return;
      }
      if (FILTER_FIELDS.indexOf(key) >= 0) {
        if (st.filters) st.filters[key] = value;
        if (st.checks[key]) st.checks[key].checked = !!value;
        if (st.applying) { dirty(); return; }
        rebuild(frame);
        if (key === "reachMap" || key === "reachDeep") {
          if (frame.options.reachMap) emitReach(frame); else lightReach(frame, []);
          setMermaid(frame);
        }
        st.mirrors.filters.emit({ filters: filtersPayload(frame) });
        dirty();
        return;
      }
      if (key === "selectedIds" || key === "focusedId") {
        pushSelection(frame);
        if (st.applying) { dirty(); return; }
        setMermaid(frame);
        st.mirrors.select.emit({
          ids: frame.options.selectedIds || [], focused: frame.options.focusedId || "",
        });
        emitReach(frame);
        dirty();
        return;
      }
      if (key === "view" || key === "trail" || key === "page") {
        if (st.applying) { dirty(); return; }
        rebuild(frame);
        dirty();
        return;
      }
      if (key === "camera") {
        applyCamera(frame);
        dirty();
        return;
      }
      if (key === "query") {
        redrawHits(frame);
        dirty();
        return;
      }
      if (key === "mermaidCollapsed") {
        if (st.mermaid && st.mermaid.el) st.mermaid.el.dataset.collapsed = value ? "true" : "false";
        dirty();
      }
    },

    getOptions(frame) {
      const st = frame._files;
      const cam = (st && st.view)
        ? MX.drawnWidgetReadCamera(st.view)
        : (frame.options.camera || { yaw: 0, pitch: 0, scale: 1 });
      const collapsed = (st && st.mermaid && st.mermaid.el)
        ? st.mermaid.el.dataset.collapsed === "true"
        : !!frame.options.mermaidCollapsed;
      const out = {
        target: frame.options.target || "",
        selectedIds: Array.isArray(frame.options.selectedIds) ? frame.options.selectedIds.slice() : [],
        focusedId: frame.options.focusedId || "",
        camera: cam,
        mermaidCollapsed: collapsed,
        view: frame.options.view === "local" ? "local" : "global",
        trail: Array.isArray(frame.options.trail) ? frame.options.trail.slice() : [],
        page: frame.options.page | 0,
        query: frame.options.query || "",
      };
      for (const key of FILTER_FIELDS) out[key] = frame.options[key];
      return out;
    },
  });
})();
