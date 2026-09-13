// graph stack widget — the drawn graph, MapView over planeLayout's shelves
//
// State: target's Index, a Filters instance, one ViewModel from
// MX.graphCore()'s planeLayout(index, filters) (no sim, no positions map),
// a mermaid frame under the svg. `show(vm)` runs on target or filter
// change only; MapView's own bind() renders on every camera move, so this
// widget never calls render() itself.
// Mirrors: select/filters/reach from MX.graphMirrors.
// Camera math and search are drawn-widget.js's MX.drawnWidget* pure
// functions, the same ones force.js calls.
// Empty state (no target): "Pick a target." over the map host.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // graph-core.js owns the one copy
  const FILTER_FIELDS = MX.graphFilterFields;

  // layout.js :31-32 — copied so `defaults` stays synchronous
  const HOME_YAW = -0.42;
  const HOME_PITCH = 0.92;

  function ensureStyles() {
    if (document.getElementById("sg-style")) return;
    const style = document.createElement("style");
    style.id = "sg-style";
    style.textContent = `
      .sg-wrap { display: flex; flex-direction: column; height: 100%; font-size: 12px; }
      .sg-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; }
      .sg-title { font-size: 11px; letter-spacing: .05em; opacity: .6; white-space: nowrap; }
      .sg-search { flex: 1 1 auto; min-width: 60px; font-size: 12px; }
      .sg-check { display: flex; align-items: center; gap: 2px; font-size: 11px; white-space: nowrap; }
      .sg-btn { font-size: 11px; padding: 1px 6px; cursor: pointer;
        border: 1px solid var(--border, #333); background: none; color: inherit; }
      .sg-hits { max-height: 120px; overflow: auto; flex: 0 0 auto;
        border-bottom: 1px solid var(--border, #333); }
      .sg-hits[hidden] { display: none; }
      .sg-hit { padding: 2px 6px; cursor: pointer; }
      .sg-hit:hover { background: var(--surface-2, #1c1c1c); }
      .sg-map-host { flex: 1 1 auto; position: relative; min-height: 80px; overflow: hidden; }
      .sg-empty { position: absolute; inset: 0; display: flex; align-items: center;
        justify-content: center; opacity: .6; pointer-events: none; }
      .sg-empty[hidden] { display: none; }
      .sg-mermaid-host { flex: 0 0 auto; max-height: 40%; overflow: auto;
        border-top: 1px solid var(--border, #333); }
    `;
    document.head.appendChild(style);
  }

  // ---- view -----------------------------------------------------------------

  function centreFit(frame) {
    const st = frame._stack;
    MX.drawnWidgetCentreFit(st.view, st.svg);
  }

  function applyCamera(frame) {
    const st = frame._stack;
    MX.drawnWidgetApplyCamera(st.view, st.svg, frame.options.camera, HOME_YAW, HOME_PITCH);
  }

  // st.restoring: camera writes off until applyCamera has run
  function readCamera(frame) {
    const st = frame._stack;
    if (!st.view) return;
    if (st.restoring) return;
    frame.options.camera = MX.drawnWidgetReadCamera(st.view);
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
  }

  function redrawHits(frame) {
    const st = frame._stack;
    if (!st.index) { st.hitsEl.hidden = true; st.hitsEl.innerHTML = ""; return; }
    const fields = {
      searchName: !!frame.options.searchName,
      searchFacts: !!frame.options.searchFacts,
      searchComments: !!frame.options.searchComments,
    };
    const ids = MX.drawnWidgetSearchIds(st.index, frame.options.query || "", fields);
    st.hitsEl.hidden = ids.length === 0;
    st.hitsEl.innerHTML = ids
      .map((id) => `<div class="sg-hit" data-id="${MX.drawnWidgetEsc(id)}">${MX.drawnWidgetEsc(id)}</div>`).join("");
  }

  // ---- build and rebuild --------------------------------------------------

  function rebuild(frame) {
    const st = frame._stack;
    if (!st.index || !st.filters || !st.view) return;
    st.vm = st.core.planeLayout(st.index, st.filters);
    st.view.show(st.vm, { keepSelection: true, keepCamera: true });
    pushSelection(frame);
    centreFit(frame);
  }

  function loadTarget(frame) {
    const st = frame._stack;
    st.emptyEl.hidden = !!frame.options.target;
    if (!frame.options.target) {
      st.index = null; st.filters = null; st.vm = null;
      if (st.view) { st.view.vm = null; }
      if (st.mermaid) st.mermaid.clear();
      redrawHits(frame);
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
          onDrill: () => {},
          look: (e) => st.filters.stampOf(e),
        });
        st.svg.addEventListener("wf-cam", () => readCamera(frame));
        st.svg.addEventListener("wheel", () => readCamera(frame), { passive: true });
        st.svg.addEventListener("pointerup", () => readCamera(frame));
      } else {
        st.view.index = st.index;
      }
      st.vm = st.core.planeLayout(st.index, st.filters);
      st.restoring = true;
      st.view.show(st.vm, { keepSelection: false, keepCamera: true });
      pushSelection(frame);
      centreFit(frame);
      applyCamera(frame);
      st.restoring = false;
      setMermaid(frame);
      redrawHits(frame);
    }).catch((e) => {
      st.index = null; st.filters = null; st.vm = null;
      console.warn("graph_stack load failed:", e);
      redrawHits(frame);
    });
  }

  // ---- selection, mermaid, reach ------------------------------------------

  function setMermaid(frame) {
    const st = frame._stack;
    if (!st.mermaid || !st.index) return;
    st.mermaid.set(st.index, frame.options.selectedIds || [], !!frame.options.reachDeep);
  }

  function emitReach(frame) {
    const st = frame._stack;
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
    const st = frame._stack;
    if (!st.view) return;
    st.view.reachSet = ids && ids.length ? new Set(ids) : null;
    st.view.paintState();
  }

  // the map's own pick, on its way out
  function onPick(frame) {
    const st = frame._stack;
    frame.options.selectedIds = st.view.selectedIds.slice();
    frame.options.focusedId = st.view.focusedId || "";
    st.mirrors.select.emit({
      ids: frame.options.selectedIds, focused: frame.options.focusedId,
    });
    setMermaid(frame);
    emitReach(frame);
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
  }

  function pushSelection(frame) {
    const st = frame._stack;
    if (!st.view) return;
    const ids = (frame.options.selectedIds || []).filter((id) => st.vm && st.vm.nodes.has(id));
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

  // ---- mirror arrivals ------------------------------------------------------

  // st.applying: a mirror arrival goes through setOption like any other
  // change, and onOption's emit sites stand down while it does
  function applySelect(frame, payload) {
    const st = frame._stack;
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
    const st = frame._stack;
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

  MX.registerWidget("graph_stack", {
    defaults: Object.assign({
      target: "",
      selectedIds: [],
      focusedId: "",
      camera: { yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1 },
      mermaidCollapsed: false,
      query: "",
    }, MX.graphFiltersDefaults()),

    optionControls: Object.assign({}, MX.graphOptionControls()),

    mount(frame) {
      ensureStyles();
      MX.graphMapStyles();

      const st = frame._stack = {
        core: null, index: null, filters: null, view: null, vm: null,
        mermaid: null, svg: null, hitsEl: null, emptyEl: null, checks: {},
        mirrors: null, applying: false,
      };

      const wrap = document.createElement("div");
      wrap.className = "sg-wrap";

      const bar = document.createElement("div");
      bar.className = "sg-bar";

      const title = document.createElement("span");
      title.className = "sg-title";
      title.textContent = "stack";
      bar.appendChild(title);

      const search = document.createElement("input");
      search.type = "text";
      search.className = "sg-search";
      search.placeholder = "search";
      search.value = frame.options.query || "";
      search.addEventListener("input", () => frame.setOption("query", search.value));
      bar.appendChild(search);

      for (const key of ["searchName", "searchFacts", "searchComments"]) {
        const lbl = document.createElement("label");
        lbl.className = "sg-check";
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
      fitBtn.className = "sg-btn";
      fitBtn.textContent = "fit";
      fitBtn.addEventListener("click", () => { centreFit(frame); readCamera(frame); });
      bar.appendChild(fitBtn);

      const gearBtn = document.createElement("button");
      gearBtn.type = "button";
      gearBtn.className = "sg-btn";
      gearBtn.textContent = "⚙";
      gearBtn.title = "options";
      gearBtn.addEventListener("click", () => frame.toggleOptions());
      bar.appendChild(gearBtn);

      wrap.appendChild(bar);

      const hits = document.createElement("div");
      hits.className = "sg-hits";
      hits.hidden = true;
      hits.addEventListener("click", (ev) => {
        const row = ev.target.closest("[data-id]");
        if (!row || !st.view) return;
        st.view.select(row.getAttribute("data-id"), { add: false });
      });
      st.hitsEl = hits;
      wrap.appendChild(hits);

      const mapHost = document.createElement("div");
      mapHost.className = "sg-map-host";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "mx-map");
      st.svg = svg;
      mapHost.appendChild(svg);

      const emptyEl = document.createElement("div");
      emptyEl.className = "sg-empty";
      emptyEl.textContent = "Pick a target.";
      emptyEl.hidden = !!frame.options.target;
      st.emptyEl = emptyEl;
      mapHost.appendChild(emptyEl);

      wrap.appendChild(mapHost);

      const mermaidHost = document.createElement("div");
      mermaidHost.className = "sg-mermaid-host";
      wrap.appendChild(mermaidHost);

      frame.host.appendChild(wrap);

      st.mermaid = MX.mermaidFrame(mermaidHost, { collapsed: !!frame.options.mermaidCollapsed });

      st.mirrors = MX.graphMirrors(frame, {
        select: (payload) => applySelect(frame, payload),
        filters: (payload) => applyFilters(frame, payload),
        reach: (payload) => applyReach(frame, payload),
      });

      loadTarget(frame);
    },

    unmount(frame) {
      const st = frame._stack;
      if (!st) return;
      if (st.mirrors) st.mirrors.off();
      if (st.mermaid) {
        st.mermaid.clear();
        if (st.mermaid.el && st.mermaid.el.parentNode) st.mermaid.el.parentNode.removeChild(st.mermaid.el);
      }
      st.view = null;
      st.vm = null;
      frame._stack = null;
    },

    onOption(frame, key, value) {
      const st = frame._stack;
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
        if (st.applying) { dirty(); return; }   // applyFilters rebuilds once, after
        rebuild(frame);
        redrawHits(frame);
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
      const st = frame._stack;
      const cam = (st && st.view)
        ? { yaw: st.view.cam.yaw, pitch: st.view.cam.pitch, scale: st.view.cam.scale }
        : (frame.options.camera || { yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1 });
      const collapsed = (st && st.mermaid && st.mermaid.el)
        ? st.mermaid.el.dataset.collapsed === "true"
        : !!frame.options.mermaidCollapsed;
      const out = {
        target: frame.options.target || "",
        selectedIds: Array.isArray(frame.options.selectedIds) ? frame.options.selectedIds.slice() : [],
        focusedId: frame.options.focusedId || "",
        camera: cam,
        mermaidCollapsed: collapsed,
        query: frame.options.query || "",
      };
      for (const key of FILTER_FIELDS) out[key] = frame.options[key];
      return out;
    },
  });
})();
