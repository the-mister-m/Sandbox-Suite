// graph cards widget — search, tabs, one node's card; the graph.* reading pane
//
// State: target's Index + a Filters instance built from options. Search box
// bound to query, three checkboxes bound to searchName/searchFacts/
// searchComments (ported from search.ts). Tabs strip, one per selectedIds
// (ported from tabs.ts). Card body, one node (ported from card.ts, monaco
// cut — openInEditor becomes a fourth mirror, "graph.open").
// Mirrors: select/filters/reach from MX.graphMirrors, plus one direct
// MX.mirror on "graph.open" this widget only emits on.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // graph-core.js's one copy — the Filters class fields, target excluded
  const FILTER_FIELDS = MX.graphFilterFields;

  const KIND_WORD = {
    file: "file", function: "function", class: "class", "css-rule": "css rule",
    element: "element", asset: "asset", folder: "folder",
  };

  const CHAIN_ROWS = 20;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function ensureStyles() {
    if (document.getElementById("cg-style")) return;
    const style = document.createElement("style");
    style.id = "cg-style";
    style.textContent = `
      .cg-wrap { display: flex; flex-direction: column; height: 100%; font-size: 12px; }
      .cg-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; }
      .cg-search { flex: 1 1 auto; font-size: 12px; }
      .cg-check { display: flex; align-items: center; gap: 2px; font-size: 11px; white-space: nowrap; }
      .cg-hits { max-height: 140px; overflow: auto; border-bottom: 1px solid var(--border, #333); }
      .cg-hits[hidden] { display: none; }
      .cg-hit { padding: 2px 6px; cursor: pointer; }
      .cg-hit:hover { background: var(--surface-2, #1c1c1c); }
      .cg-tabs { display: flex; gap: 2px; padding: 2px 6px; overflow-x: auto;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; }
      .cg-tabs[hidden] { display: none; }
      .cg-tab { padding: 2px 6px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--border, #333); white-space: nowrap; }
      .cg-tab-here { background: var(--surface-2, #1c1c1c); }
      .cg-card-host { flex: 1 1 auto; overflow: auto; padding: 4px 6px; }
      .cg-row { margin-bottom: 8px; }
      .cg-row-label { font-size: 10px; opacity: .6; letter-spacing: .05em; }
      .cg-muted { opacity: .55; }
      .cg-chip { display: inline-block; padding: 0 4px; margin-left: 4px;
        border: 1px solid var(--border, #333); border-radius: 3px; font-size: 10px; }
      .cg-empty { padding: 12px 6px; opacity: .7; }
      .cg-facts, .cg-edge-list { margin: 2px 0 0; padding-left: 16px; }
      .cg-chain-hop { cursor: pointer; text-decoration: underline dotted; }
      .cg-w-cell { display: inline-block; margin-right: 10px; text-align: center; }
      [data-jump] { cursor: pointer; }
    `;
    document.head.appendChild(style);
  }

  function field(label, body) {
    return `<section class="cg-row"><div class="cg-row-label">${label}</div><div class="cg-row-body">${body}</div></section>`;
  }

  function emptyCardHtml() {
    return `<div class="cg-empty">Pick a node in any graph widget on this target.</div>`;
  }

  function factList(facts) {
    if (!facts || !facts.length) return "";
    const shown = facts.slice(0, 14);
    const rest = facts.length - shown.length;
    return `<ul class="cg-facts">${shown.map((f) => `<li>${esc(f)}</li>`).join("")}` +
      (rest > 0 ? `<li class="cg-muted">+${rest} more</li>` : "") + "</ul>";
  }

  function commentList(items, total) {
    if (!total) return '<p class="cg-muted">nothing written on it</p>';
    if (!items.length) return `<p class="cg-muted">all ${total} hidden by filter</p>`;
    const rows = items.map((c) => {
      const lines = c.span[1] > c.span[0] ? `L${c.span[0]}–${c.span[1]}` : `L${c.span[0]}`;
      return `<div class="cg-cmt">
        <div class="cg-cmt-head">
          <span class="cg-cmt-where">${esc(c.where)}</span>
          <span class="cg-cmt-line">${lines}</span>
          ${c.what === "prose" ? "" : `<span class="cg-cmt-what">${esc(c.what)}</span>`}
        </div>
        <pre class="cg-cmt-text">${esc(c.text)}</pre>
      </div>`;
    }).join("");
    const hidden = total - items.length;
    return rows + (hidden ? `<p class="cg-muted">${hidden} hidden by filter</p>` : "");
  }

  function edgeList(index, edges, side, counted) {
    if (!edges.length) return '<p class="cg-muted">nothing</p>';
    const groups = new Map();
    for (const e of edges) {
      if (!groups.has(e.kind)) groups.set(e.kind, []);
      groups.get(e.kind).push(e);
    }
    const out = [];
    for (const kind of [...groups.keys()].sort()) {
      const list = groups.get(kind).slice().sort((a, b) => (a[side] < b[side] ? -1 : 1));
      out.push(`<div class="cg-edge-group">
        <div class="cg-edge-kind">${esc(kind)}${counted ? ` <span class="cg-count">${list.length}</span>` : ""}</div>
        <ul class="cg-edge-list">${list.map((e) => {
          const other = index.byId.get(e[side]);
          const label = other ? other.name : e[side];
          const where = other && other.path !== other.name ? other.path : "";
          return `<li data-jump="${esc(e[side])}">
            <span class="cg-e-name">${esc(label)}</span>
            ${where ? ` <span class="cg-e-path">${esc(where)}</span>` : ""}
            <span class="cg-stamp"> ${esc(e.resolved)}</span>
          </li>`;
        }).join("")}</ul>
      </div>`);
    }
    return out.join("");
  }

  function chainList(index, chains, chainCap) {
    const shown = chains.slice(0, CHAIN_ROWS);
    const rest = chains.length - shown.length;
    const rows = shown.map((chain) => {
      const capped = chain.slice(0, chainCap);
      const hops = capped.map((id) => {
        const other = index.byId.get(id);
        return `<span class="cg-chain-hop" data-jump="${esc(id)}">${esc(other ? other.name : id)}</span>`;
      });
      return `<div class="cg-chain">${hops.join(" ~&gt; ")}` +
        (chain.length > chainCap ? " ~&gt; <span class=\"cg-muted\">...</span>" : "") + "</div>";
    }).join("");
    return rows + (rest > 0 ? `<p class="cg-muted">+${rest} more</p>` : "");
  }

  function weight(w) {
    if (!w) return '<p class="cg-muted">—</p>';
    const cells = Object.entries(w)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `<div class="cg-w-cell"><b>${v}</b><br><span class="cg-muted">${esc(k)}</span></div>`);
    return cells.length ? `<div class="cg-weight">${cells.join("")}</div>` : '<p class="cg-muted">—</p>';
  }

  // ---- search.ts, ported -----------------------------------------------

  function haystack(n, fields, index) {
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
  }

  function searchIds(index, query, fields) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    if (!fields.searchName && !fields.searchFacts && !fields.searchComments) return [];
    const hits = [];
    for (const n of index.nodes) {
      for (const text of haystack(n, fields, index)) {
        if (String(text).toLowerCase().includes(q)) { hits.push(n.id); break; }
      }
    }
    return hits;
  }

  function paintHits(el, ids) {
    el.hidden = ids.length === 0;
    el.innerHTML = ids.map((id) => `<div class="cg-hit" data-id="${esc(id)}">${esc(id)}</div>`).join("");
  }

  // ---- per-frame state ---------------------------------------------------

  function pickId(frame, id) {
    frame.setOption("selectedIds", [id]);
    frame.setOption("focusedId", id);
  }

  function updateChains(frame) {
    const st = frame._cards;
    st.chains = [];
    if (!st.index || !st.filters || !st.filters.reachCard || !frame.options.focusedId) return;
    const { chains } = st.core.reachFrom(st.index, frame.options.focusedId, !!st.filters.reachDeep);
    st.chains = chains;
  }

  function maybeOpenInEditor(frame, node) {
    const st = frame._cards;
    if (!frame.options.openInEditor || !node || node.synthetic || !node.path) return;
    const root = (st.index.graph && st.index.graph.root) || "";
    const full = root
      ? root.replace(/\/+$/, "") + "/" + String(node.path).replace(/^\/+/, "")
      : node.path;
    st.openMirror.emit({ path: full, span: node.span || null });
  }

  function renderCard(frame) {
    const st = frame._cards;
    const node = st.index ? st.index.byId.get(frame.options.focusedId) : null;
    if (!node) { st.cardEl.innerHTML = emptyCardHtml(); return; }
    const idx = st.index;
    const outs = node.synthetic ? [] : idx.outOf(node.id);
    const ins = node.synthetic ? [] : idx.inOf(node.id);
    const s = node.summary || {};

    const rows = [];
    rows.push(field("WHO", `
      <div class="cg-who">
        <span class="cg-who-name">${esc(node.name)}</span>
        <span class="cg-chip cg-kind-${node.kind}">${esc(KIND_WORD[node.kind] || node.kind)}</span>
        ${node.lang ? `<span class="cg-chip">${esc(node.lang)}</span>` : ""}
        ${node.parse_status === "failed" ? '<span class="cg-chip">parse failed</span>' : ""}
      </div>`));

    rows.push(field("WHERE", `
      <div class="cg-where">
        <span class="cg-path">${esc(node.path)}</span>
        ${node.span ? ` <span class="cg-span">lines ${node.span[0]}–${node.span[1]}</span>` : ' <span class="cg-muted">no span</span>'}
      </div>`));

    const all = node.synthetic ? [] : idx.commentsOn(node.id);
    const { shown, total } = st.filters ? st.filters.comments(all) : { shown: all, total: all.length };
    rows.push(field(total ? `COMMENTS ${shown.length} of ${total}` : "COMMENTS", commentList(shown, total)));

    rows.push(field("SHAPE", s.shape
      ? `<code class="cg-shape">${esc(s.shape)}</code>${factList(s.facts)}`
      : '<p class="cg-muted">—</p>'));

    if (node.synthetic) {
      rows.push(field("HOLDS", '<p class="cg-muted">Open it on the map to see what is inside.</p>'));
    } else {
      rows.push(field("USES →", edgeList(idx, outs, "to")));
      rows.push(field("← USED", edgeList(idx, ins, "from", true)));
    }
    rows.push(field("WEIGHT", weight(s.weight)));

    if (st.chains.length) rows.push(field("REACH", chainList(idx, st.chains, st.core.CHAIN_CAP)));

    st.cardEl.innerHTML = `<div class="cg-card">${rows.join("")}</div>`;
    st.cardEl.scrollTop = 0;

    maybeOpenInEditor(frame, node);
  }

  function renderTabs(frame) {
    const st = frame._cards;
    const ids = frame.options.selectedIds || [];
    st.tabsEl.hidden = ids.length === 0;
    st.tabsEl.textContent = "";
    if (!ids.length) return;
    for (const id of ids) {
      const node = st.index ? st.index.byId.get(id) : null;
      const tab = document.createElement("span");
      tab.className = "cg-tab" + (id === frame.options.focusedId ? " cg-tab-here" : "");
      tab.dataset.id = id;
      tab.textContent = node ? node.name : id;
      st.tabsEl.appendChild(tab);
    }
  }

  function redrawHits(frame) {
    const st = frame._cards;
    if (!st.index) { st.hitsEl.hidden = true; st.hitsEl.innerHTML = ""; return; }
    const fields = {
      searchName: !!frame.options.searchName,
      searchFacts: !!frame.options.searchFacts,
      searchComments: !!frame.options.searchComments,
    };
    paintHits(st.hitsEl, searchIds(st.index, frame.options.query || "", fields));
  }

  function redrawAll(frame) {
    redrawHits(frame);
    renderTabs(frame);
    renderCard(frame);
  }

  function filtersPayload(frame) {
    const out = {};
    for (const key of Object.keys(frame.options)) {
      if (key !== "target") out[key] = frame.options[key];
    }
    return out;
  }

  function loadTarget(frame) {
    const st = frame._cards;
    if (!frame.options.target) { st.index = null; st.filters = null; redrawAll(frame); return; }
    MX.graphCore().then((core) => {
      st.core = core;
      return MX.graphLoad(frame.options.target);
    }).then((index) => {
      st.index = index;
      return MX.graphFilters(frame.options);
    }).then((filters) => {
      st.filters = filters;
      updateChains(frame);
      redrawAll(frame);
    }).catch((e) => {
      st.index = null;
      st.filters = null;
      console.warn("graph_cards load failed:", e);
      redrawAll(frame);
    });
  }

  // st.applying: set around the setOption calls below so onOption's mirror
  // emit (further down) skips re-broadcasting what we just received.
  function applySelect(frame, payload) {
    const st = frame._cards;
    st.applying = true;
    // focus staged before the first emitting write
    frame.options.focusedId = payload.focused || "";
    frame.setOption("selectedIds", Array.isArray(payload.ids) ? payload.ids.slice() : []);
    frame.setOption("focusedId", payload.focused || "");
    st.applying = false;
  }

  function applyFilters(frame, payload) {
    const st = frame._cards;
    const incoming = payload.filters || {};
    st.applying = true;
    for (const key of Object.keys(incoming)) {
      if (key === "target") continue;
      frame.setOption(key, incoming[key]);
    }
    st.applying = false;
  }

  MX.registerWidget("graph_cards", {
    defaults: Object.assign({
      target: "", selectedIds: [], focusedId: "", openInEditor: false, query: "",
    }, MX.graphFiltersDefaults()),

    optionControls: MX.graphOptionControls(),

    mount(frame) {
      ensureStyles();
      const st = frame._cards = {
        core: null, index: null, filters: null, chains: [],
        searchInput: null, hitsEl: null, tabsEl: null, cardEl: null,
        checks: {}, mirrors: null, openMirror: null, applying: false,
      };

      const wrap = document.createElement("div");
      wrap.className = "cg-wrap";

      const bar = document.createElement("div");
      bar.className = "cg-bar";
      const search = document.createElement("input");
      search.type = "text";
      search.className = "cg-search";
      search.placeholder = "search";
      search.value = frame.options.query || "";
      search.addEventListener("input", () => frame.setOption("query", search.value));
      st.searchInput = search;
      bar.appendChild(search);

      for (const key of ["searchName", "searchFacts", "searchComments"]) {
        const lbl = document.createElement("label");
        lbl.className = "cg-check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !!frame.options[key];
        box.addEventListener("change", () => frame.setOption(key, box.checked));
        st.checks[key] = box;
        lbl.appendChild(box);
        lbl.appendChild(document.createTextNode(key.slice("search".length)));
        bar.appendChild(lbl);
      }
      wrap.appendChild(bar);

      const hits = document.createElement("div");
      hits.className = "cg-hits";
      hits.hidden = true;
      hits.addEventListener("click", (ev) => {
        const row = ev.target.closest("[data-id]");
        if (row) pickId(frame, row.getAttribute("data-id"));
      });
      st.hitsEl = hits;
      wrap.appendChild(hits);

      const tabs = document.createElement("div");
      tabs.className = "cg-tabs";
      tabs.hidden = true;
      tabs.addEventListener("click", (ev) => {
        const tab = ev.target.closest(".cg-tab");
        if (tab) frame.setOption("focusedId", tab.dataset.id);
      });
      st.tabsEl = tabs;
      wrap.appendChild(tabs);

      const card = document.createElement("div");
      card.className = "cg-card-host";
      card.innerHTML = emptyCardHtml();
      card.addEventListener("click", (ev) => {
        const jump = ev.target.closest("[data-jump]");
        if (jump) pickId(frame, jump.getAttribute("data-jump"));
      });
      st.cardEl = card;
      wrap.appendChild(card);

      frame.host.appendChild(wrap);

      st.mirrors = MX.graphMirrors(frame, {
        select: (payload) => applySelect(frame, payload),
        filters: (payload) => applyFilters(frame, payload),
        reach: () => {},
        rescan: () => loadTarget(frame),
      });
      st.openMirror = MX.mirror(frame, "graph.open", () => {});

      loadTarget(frame);
    },

    unmount(frame) {
      const st = frame._cards;
      if (!st) return;
      if (st.mirrors) st.mirrors.off();
      if (st.openMirror) st.openMirror.off();
      frame._cards = null;
    },

    onOption(frame, key, value) {
      const st = frame._cards;
      if (!st) return;

      if (key === "target") {
        st.index = null; st.filters = null; st.chains = [];
        redrawAll(frame);
        loadTarget(frame);
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
        return;
      }
      if (FILTER_FIELDS.indexOf(key) >= 0) {
        if (st.filters) st.filters[key] = value;
        if (st.checks[key]) st.checks[key].checked = !!value;
        updateChains(frame);
        redrawAll(frame);
        if (st.mirrors && !st.applying) st.mirrors.filters.emit({ filters: filtersPayload(frame) });
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
        return;
      }
      if (key === "selectedIds" || key === "focusedId") {
        updateChains(frame);
        redrawAll(frame);
        if (st.mirrors && !st.applying) {
          st.mirrors.select.emit({
            ids: frame.options.selectedIds || [],
            focused: frame.options.focusedId || "",
          });
        }
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
        return;
      }
      if (key === "query") {
        redrawHits(frame);
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
        return;
      }
      if (key === "openInEditor") {
        renderCard(frame);
        if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(frame);
      }
    },

    getOptions(frame) {
      const out = {
        target: frame.options.target || "",
        selectedIds: Array.isArray(frame.options.selectedIds) ? frame.options.selectedIds.slice() : [],
        focusedId: frame.options.focusedId || "",
        openInEditor: !!frame.options.openInEditor,
        query: frame.options.query || "",
      };
      for (const key of FILTER_FIELDS) out[key] = frame.options[key];
      return out;
    },
  });
})();
