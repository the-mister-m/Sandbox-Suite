// devagent widget — every track, every region, every frame the backend
// accepts, for one session. Replaces the old track settings modal.
//
// Left pane: track/region tree. Right pane: one header for the selected
// track and region, then three tabs — settings / context / gates — each
// drawing the track and the region together in collapsible blocks.
//
// State lives on frame._dev. Any incoming roster/status/catalog frame
// triggers a full rebuild of both panes — simplest correct approach for
// a dev tool; an unlocked context textarea syncs its own state on input
// so a rebuild mid-edit does not drop unsaved text.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const PANE_TABS = ["settings", "context", "gates", "preset"];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function sendFrame(frame, obj) {
    obj.inst = frame.id;
    frame.send(obj);
  }

  function trackById(dev, id) {
    return dev.trackRows.find((t) => t.id === id) || null;
  }

  function regionById(dev, id) {
    return dev.regionRows.find((r) => r.id === id) || null;
  }

  function regionsOfTrack(dev, trackId) {
    return dev.regionRows.filter((r) => r.track === trackId);
  }

  // ---- widget css ----
  //
  // Each row is its own grid element, so the label / control / edit columns
  // line up across rows only at explicit widths — content sizing would let
  // every row pick its own.

  const DEV_CSS_ID = "mx-devagent-css";
  const DEV_CSS = `
.mx-devagent{ --dv-key:150px; --dv-ctl:210px; --dv-h:22px;
  --dv-gap:4px; --dv-sec:12px; --dv-indent:10px; }

/* one control height across every field and button */
.mx-devagent input[type="text"],
.mx-devagent input[type="number"],
.mx-devagent select,
.mx-devagent .mx-btn{ box-sizing:border-box; height:var(--dv-h); }

/* section heads carry the spacing; their rows sit indented under them */
.mx-dev-caret{ flex:0 0 auto; }

/* rung heads — title, path and phase stop colliding */
.mx-dev-rung-head{ display:flex; flex-wrap:wrap; align-items:baseline; gap:10px;
  margin:var(--dv-sec) 0 var(--dv-gap); }
.mx-dev-rung-head:first-child{ margin-top:0; }

/* button groups */
.mx-dev-tabs,
.mx-dev-region-actions{ display:flex; flex-wrap:wrap; align-items:center; gap:6px;
  margin-top:var(--dv-sec); }

/* the active tab had no rule, so the three read as plain buttons */
.mx-dev-tabs{ border-bottom:1px solid var(--gridline); padding-bottom:var(--dv-gap); }
.mx-btn.mx-dev-tab-active{ background:var(--surface-2);
  border-color:var(--text-2, #aaa); }

/* tree — the selected marker had no rule, so selection was invisible */
.mx-dev-tree-list{ margin-bottom:var(--dv-sec); }
.mx-dev-track-head,
.mx-dev-region-row{ display:flex; align-items:center; gap:6px;
  padding:3px 6px; border-left:3px solid transparent; cursor:pointer; }
.mx-dev-region-row{ padding-left:var(--dv-indent); }
.mx-dev-track-head.mx-dev-selected,
.mx-dev-region-row.mx-dev-selected{ border-left-color:var(--text-2, #aaa);
  background:var(--surface-2); }
.mx-dev-dot{ flex:0 0 auto; }
`;

  function ensureDevCss() {
    if (document.getElementById(DEV_CSS_ID)) return;
    const style = document.createElement("style");
    style.id = DEV_CSS_ID;
    style.textContent = DEV_CSS;
    document.head.appendChild(style);
  }

  // ---- tree (left pane) ----

  function renderTree(frame) {
    const dev = frame._dev;
    const host = dev.treeEl;
    host.textContent = "";

    const list = el("div", "mx-dev-tree-list");
    const tracks = dev.trackRows.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const t of tracks) {
      const collapsed = dev.collapsedTracks.has(t.id);
      const head = el("div", "mx-dev-track-head" + (t.id === dev.selectedTrackId ? " mx-dev-selected" : ""));
      const caret = el("span", "mx-dev-caret", collapsed ? "▸" : "▾");
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        if (collapsed) dev.collapsedTracks.delete(t.id); else dev.collapsedTracks.add(t.id);
        render(frame);
      });
      head.appendChild(caret);
      head.appendChild(el("span", "mx-dev-track-name", t.name));
      head.addEventListener("click", () => {
        dev.selectedTrackId = t.id;
        render(frame);
      });
      list.appendChild(head);

      if (!collapsed) {
        for (const r of regionsOfTrack(dev, t.id)) {
          const phase = dev.phaseByRegion[r.id];
          const selected = r.id === dev.selectedRegionId;
          const filled = selected || (!!phase && phase !== "idle");
          const row = el("div", "mx-dev-region-row" + (selected ? " mx-dev-selected" : ""));
          row.appendChild(el("span", "mx-dev-dot", filled ? "●" : "○"));
          row.appendChild(el("span", "mx-dev-region-name", r.name));
          row.addEventListener("click", () => {
            dev.selectedRegionId = r.id;
            dev.selectedTrackId = r.track;
            render(frame);
          });
          list.appendChild(row);
        }
      }
    }
    host.appendChild(list);

    const selectedTrack = trackById(dev, dev.selectedTrackId);
    const trackCtrl = MX.mountAddControls(host, frame, { mode: "track" });
    trackCtrl.refresh({ sessionRoot: dev.sessionRoot, workspaceRoot: dev.workspaceRoot });
    const regionCtrl = MX.mountAddControls(host, frame,
      { mode: "region", track: () => dev.selectedTrackId || null });
    regionCtrl.refresh({ sessionRoot: dev.sessionRoot, workspaceRoot: dev.workspaceRoot,
      trackRoot: selectedTrack ? selectedTrack.root : "" });
  }

  // ---- track rung (top-right) ----

  function buildTrackFieldRow(frame, track, key, label) {
    const row = el("div", "mx-dev-row");
    row.appendChild(el("label", "mx-dev-key", label));
    const input = el("input");
    input.type = key === "order" ? "number" : "text";
    input.value = track[key] === undefined || track[key] === null ? "" : track[key];
    row.appendChild(input);
    const btn = el("button", "mx-btn", "apply");
    btn.type = "button";
    btn.addEventListener("click", () => {
      const value = key === "order" ? Number(input.value) : input.value;
      sendFrame(frame, { type: "edit_track_row", track: track.id, fields: { [key]: value } });
    });
    row.appendChild(btn);
    return row;
  }

  // a collapsible section head devagent owns; the settings-rows module
  // draws its own for the region blocks
  function sectionHead(dev, key, label, note) {
    const collapsed = dev.collapsedBlocks.has(key);
    const head = el("div", "mx-dev-block-head");
    head.appendChild(el("span", "mx-dev-caret", collapsed ? "▸" : "▾"));
    head.appendChild(el("span", "", label));
    if (note) head.appendChild(el("span", "mx-dim", note));
    return { head: head, collapsed: collapsed };
  }

  function renderHeads(frame, container) {
    const dev = frame._dev;
    const track = trackById(dev, dev.selectedTrackId);
    const region = regionById(dev, dev.selectedRegionId);

    const head = el("div", "mx-dev-rung-head");
    head.appendChild(el("span", "mx-dev-rung-title",
      track ? "TRACK " + track.name : "TRACK —"));
    if (track) head.appendChild(el("span", "mx-dim", "root " + (track.root || "")));
    container.appendChild(head);

    const rhead = el("div", "mx-dev-rung-head");
    rhead.appendChild(el("span", "mx-dev-rung-title",
      region ? "REGION " + region.name : "REGION —"));
    if (region) {
      rhead.appendChild(el("span", "mx-dim", modelDisplay(dev, region)));
      rhead.appendChild(el("span", "mx-dim", dev.phaseByRegion[region.id] || "idle"));
    }
    container.appendChild(rhead);
  }

  // ---- region rung (bottom-right) ----

  // small display-only lookup; the settings-rows module owns the row
  // builders but this rung head text is devagent's own to draw
  function modelDisplay(dev, region) {
    const row = (dev.modelRows || []).find((m) => m.id === region.model);
    if (row) return [row.provider, row.model, row.version].filter(Boolean).join(" / ");
    return [region.provider, region.model].filter(Boolean).join(" / ");
  }

  function renderRegionButtons(frame, region, container) {
    const row = el("div", "mx-dev-region-actions");

    const reset = el("button", "mx-btn", "reset");
    reset.type = "button";
    reset.addEventListener("click", () => sendFrame(frame, { type: "reset_track", track: region.id }));
    row.appendChild(reset);

    const stop = el("button", "mx-btn", "stop");
    stop.type = "button";
    stop.addEventListener("click", () => sendFrame(frame, { type: "stop", track: region.id }));
    row.appendChild(stop);

    const closeShell = el("button", "mx-btn", "close shell");
    closeShell.type = "button";
    closeShell.addEventListener("click", () => sendFrame(frame, { type: "close_shell", track: region.id }));
    row.appendChild(closeShell);

    const del = el("button", "mx-btn", "delete");
    del.type = "button";
    del.addEventListener("click", () => {
      if (window.confirm("delete region " + region.name + "?")) {
        sendFrame(frame, { type: "kill_track", track: region.id });
      }
    });
    row.appendChild(del);

    container.appendChild(row);
  }

  // ---- tab bodies ----

  function renderSettingsPane(frame, body) {
    const dev = frame._dev;
    const track = trackById(dev, dev.selectedTrackId);
    const region = regionById(dev, dev.selectedRegionId);

    if (track) {
      const key = "trk:" + track.id;
      const sec = sectionHead(dev, key, "track (3)");
      sec.head.addEventListener("click", () => {
        if (sec.collapsed) dev.collapsedBlocks.delete(key); else dev.collapsedBlocks.add(key);
        render(frame);
      });
      body.appendChild(sec.head);
      if (!sec.collapsed) {
        body.appendChild(buildTrackFieldRow(frame, track, "name", "name"));
        body.appendChild(buildTrackFieldRow(frame, track, "root", "root"));
        body.appendChild(buildTrackFieldRow(frame, track, "order", "order"));
      }
    }

    if (region) dev.settingsRows.renderSettings(region, body);
    else body.appendChild(el("div", "mx-dim", "no region selected"));
  }

  function renderContextPane(frame, body) {
    const dev = frame._dev;
    const track = trackById(dev, dev.selectedTrackId);
    const region = regionById(dev, dev.selectedRegionId);

    const levels = [
      { kind: "track", row: track, label: "track" },
      { kind: "region", row: region, label: "region" },
    ];

    for (const lv of levels) {
      if (!lv.row) {
        body.appendChild(el("div", "mx-dim", "no " + lv.label + " selected"));
        continue;
      }
      const key = "ctx:" + lv.kind + ":" + lv.row.id;
      const path = "injections/" + lv.kind + "/" + lv.row.id + ".md";
      const sec = sectionHead(dev, key, lv.label, path);
      sec.head.addEventListener("click", () => {
        if (sec.collapsed) dev.collapsedBlocks.delete(key); else dev.collapsedBlocks.add(key);
        render(frame);
      });
      body.appendChild(sec.head);
      if (!sec.collapsed) dev.settingsRows.renderContext(lv.kind, lv.row.id, body);
    }
  }

  function renderGatesPane(frame, body) {
    const dev = frame._dev;
    const region = regionById(dev, dev.selectedRegionId);
    if (!region) {
      body.appendChild(el("div", "mx-dim", "no region selected"));
      return;
    }
    dev.settingsRows.renderGates(region, body);
  }

  function renderPresetPane(frame, body) {
    const dev = frame._dev;
    const region = regionById(dev, dev.selectedRegionId);
    if (!region) {
      body.appendChild(el("div", "mx-dim", "no region selected"));
      return;
    }
    dev.settingsRows.renderPreset(region, body);
  }

  // ---- top-level render ----
  //
  // renderDetail redraws the right pane alone. Tab clicks and caret clicks
  // go through it, so the tree's add-control inputs keep whatever is typed
  // in them; only roster and status frames rebuild the whole widget.

  function renderDetail(frame) {
    const dev = frame._dev;
    if (!dev) return;

    const detail = dev.detailEl;
    detail.textContent = "";
    renderHeads(frame, detail);

    const tabs = el("div", "mx-dev-tabs");
    for (const tab of PANE_TABS) {
      const b = el("button", "mx-btn" + (dev.paneTab === tab ? " mx-dev-tab-active" : ""), tab);
      b.type = "button";
      b.addEventListener("click", () => { dev.paneTab = tab; render(frame); });
      tabs.appendChild(b);
    }
    detail.appendChild(tabs);

    const body = el("div", "mx-dev-tab-body");
    if (dev.paneTab === "context") renderContextPane(frame, body);
    else if (dev.paneTab === "gates") renderGatesPane(frame, body);
    else if (dev.paneTab === "preset") renderPresetPane(frame, body);
    else renderSettingsPane(frame, body);
    detail.appendChild(body);

    const region = regionById(dev, dev.selectedRegionId);
    if (region) renderRegionButtons(frame, region, detail);
    if (dev.lastOut) detail.appendChild(el("div", "mx-dim mx-dev-status", dev.lastOut));
  }

  function render(frame) {
    const dev = frame._dev;
    if (!dev) return;
    renderTree(frame);
    renderDetail(frame);
  }

  // ---- roster bookkeeping shared by ade_init and track_list ----

  function applyRoster(frame, msg) {
    const dev = frame._dev;
    dev.trackRows = msg.rows || [];
    dev.regionRows = msg.tracks || [];
    dev.namesMap = msg.names || {};
    if (dev.selectedRegionId && !regionById(dev, dev.selectedRegionId)) dev.selectedRegionId = null;
    if (dev.selectedTrackId && !trackById(dev, dev.selectedTrackId)) dev.selectedTrackId = null;
    if (!dev.selectedTrackId && dev.trackRows.length) dev.selectedTrackId = dev.trackRows[0].id;
  }

  MX.registerWidget("devagent", {
    mount(frame) {
      const dev = frame._dev = {
        trackRows: [], regionRows: [], namesMap: {},
        phaseByRegion: {}, gateEdges: null, policyHooks: [],
        modelRows: [], presetNames: [], presetsLoaded: false, outputStyles: [],
        selectedTrackId: null, selectedRegionId: null, paneTab: "settings",
        changePrompt: null, contexts: {}, lastOut: "",
        collapsedTracks: new Set(), collapsedBlocks: new Set(),
        blocksTouched: new Set(),
        sessionRoot: "", workspaceRoot: "",
      };
      dev.settingsRows = MX.settingsRows.create(frame, { state: dev, rerender: () => render(frame) });

      ensureDevCss();
      const wrap = el("div", "mx-devagent");
      dev.treeEl = el("div", "mx-devagent-tree");
      dev.detailEl = el("div", "mx-devagent-detail");
      wrap.appendChild(dev.treeEl);
      wrap.appendChild(dev.detailEl);
      frame.host.appendChild(wrap);

      frame._devOpenHandler = (e) => {
        const d = (e && e.detail) || {};
        if (d.region) {
          dev.selectedRegionId = d.region;
          if (d.track) dev.selectedTrackId = d.track;
        } else if (d.track) {
          dev.selectedTrackId = d.track;
        }
        render(frame);
      };
      document.addEventListener("mx:open-devagent", frame._devOpenHandler);

      fetch("/api/library/models").then((r) => r.json()).then((d) => {
        dev.modelRows = (d && d.list) || [];
        render(frame);
      }).catch(() => {});

      // value sets for the dropdown-backed settings rows; the preset tab
      // reads the same list, so it is fetched here rather than on tab open
      dev.presetsLoaded = true;
      fetch("/api/library/presets").then((r) => r.json()).then((d) => {
        dev.presetNames = (d && d.names) || [];
        render(frame);
      }).catch(() => {});

      // hook names for the gates tab; the gate_edges frame carries only
      // edge and scope, so the value set comes from the policy endpoint
      fetch("/api/policy").then((r) => r.json()).then((d) => {
        dev.policyHooks = (d && d.hooks) || [];
        render(frame);
      }).catch(() => {});

      fetch("/api/claude/output-styles").then((r) => r.json()).then((d) => {
        dev.outputStyles = ((d && d.styles) || []).map((s) => s.name).filter(Boolean);
        render(frame);
      }).catch(() => {});

      // inherited root shown on the add controls: session rung, global behind it
      fetch("/api/workspace-root").then((r) => r.json()).then((d) => {
        dev.workspaceRoot = (d && d.root) || "";
        render(frame);
      }).catch(() => {});

      const sid = MX.socket && MX.socket.sid ? MX.socket.sid() : null;
      if (sid) {
        fetch("/api/session-settings/" + encodeURIComponent(sid))
          .then((r) => r.json()).then((d) => {
            dev.sessionRoot = (d && d.effective && d.effective.root) || "";
            render(frame);
          }).catch(() => {});
      }

      frame.subscribe(["ade_init", "track_list", "track_created", "track_removed",
        "region_replaced", "track_status", "models", "gate_edges",
        "change_prompt", "saved", "file", "out"]);

      render(frame);
    },

    unmount(frame) {
      if (frame._devOpenHandler) {
        document.removeEventListener("mx:open-devagent", frame._devOpenHandler);
        frame._devOpenHandler = null;
      }
      frame._dev = null;
    },

    onFrame(frame, msg) {
      const dev = frame._dev;
      if (!dev) return;

      if (msg.type === "ade_init" || msg.type === "track_list") {
        applyRoster(frame, msg);
        render(frame);
        return;
      }

      if (msg.type === "track_created") {
        if (msg.track) {
          dev.selectedRegionId = msg.track.id;
          dev.selectedTrackId = msg.track.track;
        }
        return; // the roster (_roster()) that follows carries the full state
      }

      if (msg.type === "track_removed") {
        dev.regionRows = dev.regionRows.filter((r) => r.id !== msg.id);
        if (dev.selectedRegionId === msg.id) dev.selectedRegionId = null;
        render(frame);
        return;
      }

      if (msg.type === "region_replaced") {
        if (dev.selectedRegionId === msg.old_id) dev.selectedRegionId = msg.new_id;
        render(frame);
        return;
      }

      if (msg.type === "track_status") {
        dev.phaseByRegion[msg.track] = msg.phase;
        render(frame);
        return;
      }

      if (msg.type === "models") {
        dev.modelRows = msg.rows || dev.modelRows;
        render(frame);
        return;
      }

      if (msg.type === "gate_edges") {
        dev.gateEdges = msg.edges;
        render(frame);
        return;
      }

      if (msg.type === "change_prompt") {
        dev.changePrompt = msg;
        render(frame);
        return;
      }

      if (msg.type === "saved") {
        dev.settingsRows.onFrame(msg);
        return;
      }

      if (msg.type === "out") {
        dev.lastOut = msg.text || "";
        render(frame);
        return;
      }

      // "file" is subscribed to per spec but unused — context loads go
      // through /api/fs/read, not the "open" frame
    },
  });
})();
