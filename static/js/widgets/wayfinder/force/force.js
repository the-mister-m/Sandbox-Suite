// graph force widget — the drawn graph, MapView over a live force sim
//
// State: target's Index, a Filters instance, a position Map the sim mutates,
// one ViewModel handed to MapView.show, a mermaid frame under the svg.
// Loop: requestAnimationFrame, STEPS_PER_FRAME sim steps per frame, stops on
// freeze or when the largest displacement stays under SETTLE_MOVE for
// SETTLE_TICKS steps.
// Mirrors: select/filters/reach from MX.graphMirrors.
// Camera math and search are drawn-widget.js's MX.drawnWidget* pure
// functions (added by 2D in parallel), shared with stack.js since 2C.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // graph-core.js owns the one copy
  const FILTER_FIELDS = MX.graphFilterFields;

  // layout.js :31-32 HOME_YAW/HOME_PITCH, :35-37 R_BASE/R_STEP/R_CAP — copied
  // so `defaults` and the sim node list stay synchronous
  const HOME_YAW = -0.42;
  const HOME_PITCH = 0.92;
  const R_BASE = 6.2;
  const R_STEP = 1.05;
  const R_CAP = 8;

  const STEPS_PER_FRAME = 8;   // sim steps per animation frame
  const SETTLE_MOVE = 0.05;    // displacement that counts as still
  const SETTLE_TICKS = 30;     // still steps in a row before the loop stops
  const SEED_SPREAD = 40;      // world box a new node is seeded into

  function ensureStyles() {
    if (document.getElementById("gf-style")) return;
    const style = document.createElement("style");
    style.id = "gf-style";
    style.textContent = `
      .gf-wrap { display: flex; flex-direction: column; height: 100%; font-size: 12px; }
      .gf-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; }
      .gf-search { flex: 1 1 auto; min-width: 60px; font-size: 12px; }
      .gf-check { display: flex; align-items: center; gap: 2px; font-size: 11px; white-space: nowrap; }
      .gf-btn { font-size: 11px; padding: 1px 6px; cursor: pointer;
        border: 1px solid var(--border, #333); background: none; color: inherit; }
      .gf-btn.gf-on { background: var(--surface-2, #1c1c1c); }
      .gf-hits { max-height: 120px; overflow: auto; flex: 0 0 auto;
        border-bottom: 1px solid var(--border, #333); }
      .gf-hits[hidden] { display: none; }
      .gf-hit { padding: 2px 6px; cursor: pointer; }
      .gf-hit:hover { background: var(--surface-2, #1c1c1c); }
      .gf-map-host { flex: 1 1 auto; position: relative; min-height: 80px; overflow: hidden; }
      .gf-mermaid-host { flex: 0 0 auto; max-height: 40%; overflow: auto;
        border-top: 1px solid var(--border, #333); }
    `;
    document.head.appendChild(style);
  }

  // ---- sim inputs ---------------------------------------------------------

  function simOpts(frame) {
    const sim = frame.options.sim || {};
    return Object.assign(MX.forceSimDefaults(), sim, {
      dims: frame.options.dims === 2 ? 2 : 3,
    });
  }

  // node list and edge list the sim runs on, rebuilt whenever the filter set
  // changes what is visible
  function buildSimInputs(frame) {
    const st = frame._force;
    const vis = st.filters.nodes(st.index);
    const raw = st.filters.edges(st.index, vis);
    const deg = new Map();
    for (const e of raw) {
      if (e.kind === "contains") continue;
      deg.set(e.from, (deg.get(e.from) || 0) + 1);
      deg.set(e.to, (deg.get(e.to) || 0) + 1);
    }
    st.simNodes = [...vis].map((id) => ({
      id, r: R_BASE + Math.min(deg.get(id) || 0, R_CAP) * R_STEP,
    }));
    st.simEdges = raw;
    return vis;
  }

  // existing nodes keep their place, new ones start near the centre
  function seedPositions(frame, vis, reseedAll) {
    const st = frame._force;
    const flat = frame.options.dims === 2;
    const next = new Map();
    let n = 0;
    for (const id of vis) {
      const had = reseedAll ? null : st.positions.get(id);
      if (had) {
        next.set(id, {
          x: had.x, y: had.y, z: flat ? 0 : had.z, vx: 0, vy: 0, vz: 0,
        });
      } else {
        // deterministic scatter, so a rebuild does not jump the whole layout
        const a = (n * 2.399963) % (Math.PI * 2);
        const b = (n * 0.7654) % 1;
        const rad = SEED_SPREAD * (0.15 + b * 0.5);
        next.set(id, {
          x: Math.cos(a) * rad,
          y: flat ? 0 : Math.sin(a) * rad * 0.6,
          z: flat ? 0 : Math.sin(a * 1.7) * rad,
          vx: 0, vy: 0, vz: 0,
        });
      }
      n++;
    }
    st.positions = next;
  }

  function writePlaced(frame) {
    const st = frame._force;
    if (!st.vm) return;
    const k = MX.forceWorldScale;
    for (const [id, rec] of st.vm.placed) {
      const p = st.positions.get(id);
      if (!p) continue;
      rec.x = p.x * k;
      rec.y = p.y * k;
      rec.z = p.z * k;
    }
  }

  // ---- the loop -----------------------------------------------------------

  function stopLoop(frame) {
    const st = frame._force;
    if (st && st.raf) { cancelAnimationFrame(st.raf); st.raf = null; }
  }

  function startLoop(frame) {
    const st = frame._force;
    if (!st || !st.vm || !st.view || frame.options.frozen) return;
    if (st.raf) return;
    st.still = 0;
    st.ticks = 0;
    st.startedAt = (window.performance || Date).now();
    st.raf = requestAnimationFrame(() => tick(frame));
  }

  function tick(frame) {
    const st = frame._force;
    if (!st) return;
    st.raf = null;
    if (!st.vm || !st.view || frame.options.frozen) return;

    const opts = simOpts(frame);
    let maxMove = 0;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      const out = MX.forceSim(st.simNodes, st.simEdges, st.positions, opts);
      st.ticks++;
      maxMove = out.maxMove;
      if (maxMove < SETTLE_MOVE) st.still++; else st.still = 0;
      if (st.still >= SETTLE_TICKS) break;
    }
    writePlaced(frame);
    st.view.render();

    if (st.still >= SETTLE_TICKS) {
      st.settleMs = Math.round((window.performance || Date).now() - st.startedAt);
      return;
    }
    st.raf = requestAnimationFrame(() => tick(frame));
  }

  // ---- view ---------------------------------------------------------------

  function centreFit(frame) {
    const st = frame._force;
    MX.drawnWidgetCentreFit(st.view, st.svg);
  }

  function applyCamera(frame) {
    const st = frame._force;
    MX.drawnWidgetApplyCamera(st.view, st.svg, frame.options.camera, HOME_YAW, HOME_PITCH);
  }

  // st.restoring: camera writes off until applyCamera has run
  function readCamera(frame) {
    const st = frame._force;
    if (!st.view) return;
    if (st.restoring) return;
    frame.options.camera = MX.drawnWidgetReadCamera(st.view);
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
  }

  function redrawHits(frame) {
    const st = frame._force;
    if (!st.index) { st.hitsEl.hidden = true; st.hitsEl.innerHTML = ""; return; }
    const fields = {
      searchName: !!frame.options.searchName,
      searchFacts: !!frame.options.searchFacts,
      searchComments: !!frame.options.searchComments,
    };
    const ids = MX.drawnWidgetSearchIds(st.index, frame.options.query || "", fields);
    st.hitsEl.hidden = ids.length === 0;
    st.hitsEl.innerHTML = ids
      .map((id) => `<div class="gf-hit" data-id="${MX.drawnWidgetEsc(id)}">${MX.drawnWidgetEsc(id)}</div>`).join("");
  }

  function setMermaid(frame) {
    const st = frame._force;
    if (!st.mermaid || !st.index) return;
    st.mermaid.set(st.index, frame.options.selectedIds || [], !!frame.options.reachDeep);
  }

  function emitReach(frame) {
    const st = frame._force;
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
    const st = frame._force;
    if (!st.view) return;
    st.view.reachSet = ids && ids.length ? new Set(ids) : null;
    st.view.paintState();
  }

  // the map's own pick, on its way out
  function onPick(frame) {
    const st = frame._force;
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
    const st = frame._force;
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

  // ---- build and rebuild --------------------------------------------------

  function rebuild(frame, reseedAll) {
    const st = frame._force;
    if (!st.index || !st.filters || !st.view) return;
    const vis = buildSimInputs(frame);
    seedPositions(frame, vis, reseedAll);
    st.vm = MX.forceLayout(st.index, st.filters, st.positions);
    st.view.show(st.vm, { keepSelection: true, keepCamera: true });
    pushSelection(frame);
    centreFit(frame);
    stopLoop(frame);
    startLoop(frame);
  }

  function loadTarget(frame) {
    const st = frame._force;
    stopLoop(frame);
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
      const vis = buildSimInputs(frame);
      seedPositions(frame, vis, true);
      st.vm = MX.forceLayout(st.index, st.filters, st.positions);
      st.restoring = true;
      st.view.show(st.vm, { keepSelection: false, keepCamera: true });
      pushSelection(frame);
      centreFit(frame);
      applyCamera(frame);
      st.restoring = false;
      setMermaid(frame);
      redrawHits(frame);
      startLoop(frame);
    }).catch((e) => {
      st.index = null; st.filters = null; st.vm = null;
      console.warn("graph_force load failed:", e);
      redrawHits(frame);
    });
  }

  // ---- mirror arrivals ----------------------------------------------------

  // st.applying: a mirror arrival goes through setOption like any other
  // change, and onOption's emit sites stand down while it does
  function applySelect(frame, payload) {
    const st = frame._force;
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
    const st = frame._force;
    const incoming = payload.filters || {};
    const wasDims = frame.options.dims;
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
    const dimsMoved = frame.options.dims !== wasDims;
    if (touchedFilter || dimsMoved) rebuild(frame, dimsMoved);
    else if (frame.options.frozen) stopLoop(frame);
    else startLoop(frame);
    redrawHits(frame);
  }

  function applyReach(frame, payload) {
    lightReach(frame, payload.ids || []);
  }

  MX.registerWidget("graph_force", {
    defaults: Object.assign({
      target: "",
      selectedIds: [],
      focusedId: "",
      camera: { yaw: HOME_YAW, pitch: HOME_PITCH, scale: 1 },
      frozen: false,
      dims: 3,
      mermaidCollapsed: false,
      query: "",
      sim: MX.forceSimDefaults(),
    }, MX.graphFiltersDefaults()),

    optionControls: Object.assign({}, MX.graphOptionControls()),

    mount(frame) {
      ensureStyles();
      MX.graphMapStyles();

      const st = frame._force = {
        core: null, index: null, filters: null, view: null, vm: null,
        mermaid: null, positions: new Map(), simNodes: [], simEdges: [],
        raf: null, still: 0, ticks: 0, startedAt: 0, settleMs: 0,
        svg: null, hitsEl: null, checks: {}, freezeBox: null, dimsBtn: null,
        mirrors: null, applying: false,
      };

      const wrap = document.createElement("div");
      wrap.className = "gf-wrap";

      const bar = document.createElement("div");
      bar.className = "gf-bar";

      const freezeLbl = document.createElement("label");
      freezeLbl.className = "gf-check";
      const freezeBox = document.createElement("input");
      freezeBox.type = "checkbox";
      freezeBox.checked = !!frame.options.frozen;
      freezeBox.addEventListener("change", () => frame.setOption("frozen", freezeBox.checked));
      st.freezeBox = freezeBox;
      freezeLbl.appendChild(freezeBox);
      freezeLbl.appendChild(document.createTextNode("freeze"));
      bar.appendChild(freezeLbl);

      const dimsBtn = document.createElement("button");
      dimsBtn.type = "button";
      dimsBtn.className = "gf-btn";
      dimsBtn.textContent = frame.options.dims === 2 ? "2D" : "3D";
      dimsBtn.addEventListener("click", () => {
        frame.setOption("dims", frame.options.dims === 2 ? 3 : 2);
      });
      st.dimsBtn = dimsBtn;
      bar.appendChild(dimsBtn);

      const search = document.createElement("input");
      search.type = "text";
      search.className = "gf-search";
      search.placeholder = "search";
      search.value = frame.options.query || "";
      search.addEventListener("input", () => frame.setOption("query", search.value));
      bar.appendChild(search);

      for (const key of ["searchName", "searchFacts", "searchComments"]) {
        const lbl = document.createElement("label");
        lbl.className = "gf-check";
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
      fitBtn.className = "gf-btn";
      fitBtn.textContent = "fit";
      fitBtn.addEventListener("click", () => { centreFit(frame); readCamera(frame); });
      bar.appendChild(fitBtn);

      const gearBtn = document.createElement("button");
      gearBtn.type = "button";
      gearBtn.className = "gf-btn";
      gearBtn.textContent = "⚙";
      gearBtn.title = "options";
      gearBtn.addEventListener("click", () => frame.toggleOptions());
      bar.appendChild(gearBtn);

      wrap.appendChild(bar);

      const hits = document.createElement("div");
      hits.className = "gf-hits";
      hits.hidden = true;
      hits.addEventListener("click", (ev) => {
        const row = ev.target.closest("[data-id]");
        if (!row || !st.view) return;
        st.view.select(row.getAttribute("data-id"), { add: false });
      });
      st.hitsEl = hits;
      wrap.appendChild(hits);

      const mapHost = document.createElement("div");
      mapHost.className = "gf-map-host";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "mx-map");
      st.svg = svg;
      mapHost.appendChild(svg);
      wrap.appendChild(mapHost);

      const mermaidHost = document.createElement("div");
      mermaidHost.className = "gf-mermaid-host";
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
      const st = frame._force;
      if (!st) return;
      stopLoop(frame);
      if (st.mirrors) st.mirrors.off();
      if (st.mermaid) {
        st.mermaid.clear();
        if (st.mermaid.el && st.mermaid.el.parentNode) st.mermaid.el.parentNode.removeChild(st.mermaid.el);
      }
      st.view = null;
      st.vm = null;
      frame._force = null;
    },

    onOption(frame, key, value) {
      const st = frame._force;
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
        rebuild(frame, false);
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
      if (key === "frozen") {
        if (st.freezeBox) st.freezeBox.checked = !!value;
        if (value) stopLoop(frame); else startLoop(frame);
        dirty();
        return;
      }
      if (key === "dims") {
        if (st.dimsBtn) st.dimsBtn.textContent = value === 2 ? "2D" : "3D";
        if (st.applying) { dirty(); return; }   // applyFilters rebuilds once, after
        rebuild(frame, true);
        dirty();
        return;
      }
      if (key === "camera") {
        applyCamera(frame);
        dirty();
        return;
      }
      if (key === "sim") {
        stopLoop(frame);
        startLoop(frame);
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
      const st = frame._force;
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
        frozen: !!frame.options.frozen,
        dims: frame.options.dims === 2 ? 2 : 3,
        mermaidCollapsed: collapsed,
        query: frame.options.query || "",
        sim: Object.assign(MX.forceSimDefaults(), frame.options.sim || {}),
      };
      for (const key of FILTER_FIELDS) out[key] = frame.options[key];
      return out;
    },
  });
})();
