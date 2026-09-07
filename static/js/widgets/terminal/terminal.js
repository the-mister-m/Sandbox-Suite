// terminal widget — one tab is one PTY, many tabs per instance
//
// Frames: "follow" (stream a region to this socket), "unfollow", "input"
// (keystrokes, addressed by region and shell key), "close_shell" (end one
// PTY), "mirror" kind "term" (shell output, tagged with region and shell).
// Regions come off "ade_init"/"track_list".
//
// State: every tab holds its own shell key, so two tabs on one region are two
// PTYs and each renders only its own output.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  let _xtermState = "idle"; // idle | loading | ready
  const _xtermWaiters = [];

  function ensureXtermLoaded(cb) {
    if (_xtermState === "ready") { cb(); return; }
    _xtermWaiters.push(cb);
    if (_xtermState === "loading") return;
    _xtermState = "loading";
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/static/vendor/xterm.css";
    document.head.appendChild(css);
    const s1 = document.createElement("script");
    s1.src = "/static/vendor/xterm.min.js";
    s1.onload = function () {
      const s2 = document.createElement("script");
      s2.src = "/static/vendor/xterm-addon-fit.min.js";
      s2.onload = function () {
        _xtermState = "ready";
        const waiters = _xtermWaiters.slice();
        _xtermWaiters.length = 0;
        for (const fn of waiters) fn();
      };
      s2.onerror = function () { _xtermState = "idle"; };
      document.head.appendChild(s2);
    };
    s1.onerror = function () { _xtermState = "idle"; };
    document.head.appendChild(s1);
  }

  function ensureTerminalStyles() {
    if (document.getElementById("mxtm-style")) return;
    const style = document.createElement("style");
    style.id = "mxtm-style";
    style.textContent = `
      .mxtm-wrap { display: flex; flex-direction: column; height: 100%; }
      .mxtm-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border-bottom: 1px solid var(--border, #333); flex: 0 0 auto; }
      .mxtm-region { flex: 1 1 auto; min-width: 0; }
      .mxtm-status { font-size: 11px; color: var(--text-3, #888); white-space: nowrap; }
      .mxtm-tabs { display: flex; gap: 2px; padding: 2px 6px; flex: 0 0 auto;
        overflow-x: auto; border-bottom: 1px solid var(--border, #333); }
      .mxtm-tab { display: flex; align-items: center; gap: 4px; padding: 2px 6px;
        font-size: 11px; cursor: pointer; border: 1px solid var(--border, #333);
        border-bottom: none; color: var(--text-2, #aaa); white-space: nowrap; }
      .mxtm-tab.mxtm-on { background: var(--surface-2, #1c1c1c); color: var(--text-1, #ddd); }
      .mxtm-tab-x { border: none; background: none; color: inherit; cursor: pointer;
        font-size: 11px; padding: 0 2px; }
      .mxtm-panes { flex: 1 1 auto; min-height: 0; position: relative; }
      .mxtm-pane { position: absolute; inset: 0; padding: 4px; }
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

  function scheduleFit(tab, tries) {
    tries = tries || 0;
    if (!tab || !tab.fit) return;
    requestAnimationFrame(() => {
      if (!tab.fit) return;
      let dims = null;
      try { dims = tab.fit.proposeDimensions(); } catch (e) { /* not laid out yet */ }
      if (dims && dims.rows > 0 && dims.cols > 0 && isFinite(dims.rows)) {
        try { tab.fit.fit(); } catch (e) { /* fit best effort */ }
      } else if (tries < 30) {
        scheduleFit(tab, tries + 1);
      }
    });
  }

  function createXterm(frame, tab, tries) {
    tries = tries || 0;
    const t = frame._term;
    if (!t || !t.live || !tab.host) return;
    if (!document.body.contains(tab.host)) {
      if (tries < 30) requestAnimationFrame(() => createXterm(frame, tab, tries + 1));
      return;
    }
    ensureXtermLoaded(() => {
      if (!t.live || tab.term) return;
      try {
        const term = new Terminal({
          fontSize: 13,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          convertEol: false,
        });
        const fit = new FitAddon.FitAddon();
        term.loadAddon(fit);
        term.open(tab.host);
        tab.term = term;
        tab.fit = fit;
        scheduleFit(tab);
        for (const chunk of tab.backlog) term.write(chunk);
        tab.backlog.length = 0;
        term.onData((d) => {
          frame.send({ type: "input", track: tab.region, shell: tab.key,
                       data: d, inst: frame.id });
        });
        try {
          const ro = new ResizeObserver(() => scheduleFit(tab));
          ro.observe(tab.host);
          tab.ro = ro;
        } catch (e) { /* no ResizeObserver — initial fit still applies */ }
      } catch (e) {
        tab.host.textContent = "[terminal: xterm failed]";
      }
    });
  }

  function populateRegions(frame, rows) {
    const t = frame._term;
    if (!t) return;
    t.regions = Array.isArray(rows) ? rows : [];
    const sel = t.select;
    const current = sel.value;
    sel.innerHTML = "";
    for (const r of t.regions) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name || r.id;
      sel.appendChild(opt);
    }
    if (t.regions.some((r) => r.id === current)) sel.value = current;
    else if (frame.options.region && t.regions.some((r) => r.id === frame.options.region)) {
      sel.value = frame.options.region;
    }
    // tabs restored from grid state open once the roster names their region
    for (const tab of t.tabs) {
      if (!tab.term && tab.region) openPty(frame, tab);
    }
    renderTabs(frame);
  }

  function regionName(frame, rid) {
    const t = frame._term;
    const row = (t.regions || []).find((r) => r.id === rid);
    return (row && (row.name || row.id)) || rid || "region";
  }

  function newTab(frame, region, key) {
    const t = frame._term;
    if (!t) return null;
    const rid = region || t.select.value || "";
    if (!rid) { t.statusEl.textContent = "pick a region first"; return null; }
    t.seq += 1;
    const tab = {
      key: key || (frame.id + "-sh" + t.seq),
      region: rid,
      term: null, fit: null, ro: null, host: null,
      backlog: [], opened: false,
    };
    t.tabs.push(tab);
    t.active = tab.key;
    frame.options.region = rid;
    renderTabs(frame);
    openPty(frame, tab);
    return tab;
  }

  // one PTY per tab: follow the region, then wake this tab's own shell
  function openPty(frame, tab) {
    const t = frame._term;
    if (!t || tab.opened) return;
    tab.opened = true;
    if (!t.followed[tab.region]) {
      t.followed[tab.region] = 0;
      frame.send({ type: "follow", track: tab.region, inst: frame.id });
    }
    t.followed[tab.region] += 1;
    createXterm(frame, tab);
    frame.send({ type: "input", track: tab.region, shell: tab.key,
                 data: "\n", inst: frame.id });
  }

  function closeTab(frame, key) {
    const t = frame._term;
    if (!t) return;
    const i = t.tabs.findIndex((x) => x.key === key);
    if (i < 0) return;
    const tab = t.tabs[i];
    frame.send({ type: "close_shell", track: tab.region, shell: tab.key, inst: frame.id });
    if (t.followed[tab.region]) {
      t.followed[tab.region] -= 1;
      if (t.followed[tab.region] <= 0) {
        delete t.followed[tab.region];
        frame.send({ type: "unfollow", track: tab.region, inst: frame.id });
      }
    }
    if (tab.ro) { try { tab.ro.disconnect(); } catch (e) { /* teardown best effort */ } }
    if (tab.term) { try { tab.term.dispose(); } catch (e) { /* teardown best effort */ } }
    t.tabs.splice(i, 1);
    if (t.active === key) t.active = t.tabs.length ? t.tabs[Math.max(0, i - 1)].key : null;
    renderTabs(frame);
  }

  function renderTabs(frame) {
    const t = frame._term;
    if (!t) return;
    t.tabBar.textContent = "";
    for (const tab of t.tabs) {
      const el = document.createElement("div");
      el.className = "mxtm-tab" + (tab.key === t.active ? " mxtm-on" : "");
      const label = document.createElement("span");
      label.textContent = regionName(frame, tab.region);
      el.appendChild(label);
      const x = document.createElement("button");
      x.type = "button";
      x.className = "mxtm-tab-x";
      x.textContent = "×";
      x.addEventListener("click", (ev) => { ev.stopPropagation(); closeTab(frame, tab.key); });
      el.appendChild(x);
      el.addEventListener("click", () => { t.active = tab.key; renderTabs(frame); });
      t.tabBar.appendChild(el);

      if (!tab.host) {
        const pane = document.createElement("div");
        pane.className = "mxtm-pane";
        tab.host = pane;
        t.panes.appendChild(pane);
        createXterm(frame, tab);
      }
      tab.host.hidden = tab.key !== t.active;
      if (tab.key === t.active) {
        scheduleFit(tab);
        if (tab.term) tab.term.focus();
      }
    }
    for (const pane of Array.from(t.panes.children)) {
      if (!t.tabs.some((x) => x.host === pane)) t.panes.removeChild(pane);
    }
    t.statusEl.textContent = t.tabs.length
      ? String(t.tabs.length) + (t.tabs.length === 1 ? " shell" : " shells")
      : "no shell";
  }

  MX.registerWidget("terminal", {
    mount(frame) {
      ensureTerminalStyles();

      const t = frame._term = {
        live: true, regions: [], tabs: [], active: null, seq: 0,
        followed: Object.create(null),
        select: null, statusEl: null, tabBar: null, panes: null,
      };

      const wrap = document.createElement("div");
      wrap.className = "mxtm-wrap";

      const bar = document.createElement("div");
      bar.className = "mxtm-bar";

      const select = document.createElement("select");
      select.className = "mxtm-region";
      t.select = select;

      const status = document.createElement("span");
      status.className = "mxtm-status";
      status.textContent = "no shell";
      t.statusEl = status;

      bar.appendChild(select);
      bar.appendChild(mkBtn("New Tab", () => newTab(frame)));
      bar.appendChild(status);
      wrap.appendChild(bar);

      t.tabBar = document.createElement("div");
      t.tabBar.className = "mxtm-tabs";
      wrap.appendChild(t.tabBar);

      t.panes = document.createElement("div");
      t.panes.className = "mxtm-panes";
      wrap.appendChild(t.panes);

      frame.host.appendChild(wrap);

      // tab state rides the grid, so a restored window comes back with its tabs
      for (const saved of (frame.options.tabs || [])) {
        if (!saved || !saved.region) continue;
        t.seq += 1;
        t.tabs.push({
          key: saved.key || (frame.id + "-sh" + t.seq), region: saved.region,
          term: null, fit: null, ro: null, host: null, backlog: [], opened: false,
        });
      }
      t.active = frame.options.active || (t.tabs.length ? t.tabs[0].key : null);

      frame.subscribe(["ade_init", "track_list", "mirror", "term"]);
      renderTabs(frame);
    },

    // the grid asks before removing: live PTYs get one question
    canClose(frame) {
      const t = frame._term;
      if (!t || !t.tabs.length) return true;
      const n = t.tabs.length;
      return MX.ui.choose("Close terminal",
        n === 1 ? "One shell is still running." : n + " shells are still running.", [
          { label: "Close", value: "close", cls: "mx-go" },
          { label: "Keep open", value: "cancel" },
        ]).then((choice) => choice === "close");
    },

    unmount(frame) {
      const t = frame._term;
      if (!t) return;
      t.live = false;
      for (const tab of t.tabs.slice()) closeTab(frame, tab.key);
      frame._term = null;
    },

    onFrame(frame, msg) {
      const t = frame._term;
      if (!t) return;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        populateRegions(frame, msg.tracks);
        return;
      }

      // shell output arrives tagged with its region and its shell key
      let data = null;
      let shell = null;
      let region = null;
      if (msg.type === "mirror" && msg.kind === "term") {
        data = msg.data; shell = msg.shell || ""; region = msg.track;
      } else if (msg.type === "term") {
        data = msg.data; shell = msg.shell || ""; region = msg.region || "";
      }
      if (data === null || data === undefined) return;

      for (const tab of t.tabs) {
        if (shell && tab.key !== shell) continue;
        if (!shell && region && tab.region !== region) continue;
        const text = String(data).replace(/\r?\n/g, "\r\n");
        if (tab.term) tab.term.write(text);
        else tab.backlog.push(text);
      }
    },

    getOptions(frame) {
      const t = frame._term;
      if (!t) return JSON.parse(JSON.stringify(frame.options));
      return {
        region: t.select ? t.select.value : (frame.options.region || ""),
        tabs: t.tabs.map((x) => ({ key: x.key, region: x.region })),
        active: t.active || "",
      };
    },
  });
})();
