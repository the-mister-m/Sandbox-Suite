// devagent widget — every track, every region, every frame the backend
// accepts, for one session.
//
// One column. "Add track" on top. Under it, one group per track, a rule
// between groups. Each group is a stack of region cards: every live region,
// then one blank draft card. Draft and live cards share one shape —
// track / region names, the model picker, a collapsible tab strip
// (settings / context / gates / presets), and a button column on the right.
// Draft: "Start region". Live: reset / stop / close shell / delete.
//
// State lives on frame._dev. Roster, status and catalog frames rebuild the
// column. Draft text syncs on input so a rebuild mid-edit keeps it.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const CARD_TABS = ["settings", "context", "gates", "presets"];

  // a draft is a region that does not exist on the server yet, shaped like
  // web_io._region_row so the shared setting rows read it unchanged. One
  // per track, keyed "__draft__:<trackId>".
  const DRAFT_ID = "__draft__";

  function draftIdFor(trackId) { return DRAFT_ID + ":" + trackId; }
  function isDraftId(id) { return typeof id === "string" && id.indexOf(DRAFT_ID) === 0; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(cls, label, onClick) {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function sendFrame(frame, obj) {
    obj.inst = frame.id;
    frame.send(obj);
  }

  function trackById(dev, id) {
    return dev.trackRows.find((t) => t.id === id) || null;
  }

  function regionById(dev, id) {
    if (isDraftId(id)) return dev.drafts[id] || null;
    return dev.regionRows.find((r) => r.id === id) || null;
  }

  function liveRegionsOfTrack(dev, trackId) {
    return dev.regionRows.filter((r) => r.track === trackId);
  }

  // ---- drafts ----

  // the blank card under a track. Settings seed from regionDefaults once
  // that fetch lands, so the rows show the values the server would apply.
  function ensureDraft(dev, trackId) {
    const id = draftIdFor(trackId);
    let d = dev.drafts[id];
    if (!d) {
      d = dev.drafts[id] = {
        id: id, track: trackId, name: "", model: "", seat: "", root: "",
        provider: "", loop_class: "", mechanism: "",
        settings: {}, overlay: null, region: {}, seeded: false,
      };
      dev.openCards.add(id);
      dev.cardTab[id] = "settings";
    }
    if (!d.seeded && Object.keys(dev.regionDefaults).length) {
      d.settings = Object.assign({}, dev.regionDefaults, d.settings);
      d.seeded = true;
    }
    return d;
  }

  function setDraftModel(dev, d, id) {
    d.model = id;
    d.settings.model = id;
    const row = (dev.modelRows || []).find((m) => m.id === id);
    d.provider = (row && row.provider) || "";
  }

  // one create frame carrying every drafted field. Settings ride the
  // settings bag; seat, root and overlay are their own arguments server
  // side, and an untouched overlay is left off so the server default wins.
  // No name gate — the server names an empty region "untitled".
  function startDraft(frame, d) {
    const dev = frame._dev;
    if (!d.model) {
      const p = dev.pickers[d.id];
      const v = p && p.value();
      if (v) setDraftModel(dev, d, v);
    }
    if (!d.model && dev.modelRows.length) setDraftModel(dev, d, dev.modelRows[0].id);
    if (!d.model) {
      dev.lastOut = "no model available";
      render(frame);
      return;
    }
    const msg = { type: "insert_region", track: d.track, name: d.name.trim() || "untitled",
                  model: d.model, settings: d.settings };
    if (d.root) msg.root = d.root;
    if (d.seat) msg.seat = d.seat;
    if (d.provider) msg.provider = d.provider;
    if (Array.isArray(d.overlay)) msg.overlay_rows = d.overlay;
    delete dev.drafts[d.id];
    dev.openCards.delete(d.id);
    delete dev.cardTab[d.id];
    sendFrame(frame, msg);
    render(frame);
  }

  // ---- widget css ----

  const DEV_CSS_ID = "mx-devagent-css";
  const DEV_CSS = `
.mx-devagent{ --dv-key:150px; --dv-ctl:210px; --dv-h:22px;
  --dv-gap:4px; --dv-sec:12px; --dv-indent:10px;
  display:flex; flex-direction:column; gap:var(--dv-sec); padding:var(--dv-sec); }

/* one control height across every field and button */
.mx-devagent input[type="text"],
.mx-devagent input[type="number"],
.mx-devagent select,
.mx-devagent .mx-btn{ box-sizing:border-box; height:var(--dv-h); }

.mx-devagent input[type="text"],
.mx-devagent input[type="number"],
.mx-devagent select{ background:var(--surface-1, #0e0e0e); color:var(--text-1, #ddd);
  border:1px solid var(--border, #383838); border-radius:3px; padding:0 5px; }

/* top — one button, a rule under it */
.mx-dev-top{ display:flex; justify-content:center;
  padding-bottom:var(--dv-sec); border-bottom:1px solid var(--border, #383838); }
.mx-dev-add-track{ min-width:240px; font-weight:700; }

/* track group — cards stacked, a rule under the group */
.mx-dev-track-group{ display:flex; flex-direction:column; gap:var(--dv-sec);
  padding-bottom:var(--dv-sec); border-bottom:1px solid var(--border, #383838); }

/* card — main stack left, button column right */
.mx-dev-card{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:start; }
.mx-dev-card-main{ display:flex; flex-direction:column; gap:var(--dv-gap); min-width:0; }
.mx-dev-card-side{ display:flex; flex-direction:column; gap:var(--dv-gap); }
.mx-dev-card-side .mx-btn{ min-width:100px; }
.mx-dev-start{ width:64px; min-width:64px; height:64px; padding:0 6px;
  white-space:normal; line-height:1.2; font-weight:700; }

/* card head — track and region lines in one filled box */
.mx-dev-card-head{ background:var(--surface-2, #141414); border:1px solid var(--border, #383838);
  border-radius:3px; padding:6px 8px; display:flex; flex-direction:column; gap:var(--dv-gap); }
.mx-dev-card-draft .mx-dev-card-head{ border-style:dashed; }
.mx-dev-card-line{ display:flex; align-items:center; gap:8px; }
.mx-dev-card-label{ flex:0 0 58px; font-weight:700; }
.mx-dev-card-line input[type="text"]{ flex:1 1 80px; min-width:80px;
  background:transparent; border-color:transparent; }
.mx-dev-card-line input[type="text"]:hover,
.mx-dev-card-line input[type="text"]:focus{ border-color:var(--border, #383838);
  background:var(--surface-1, #0e0e0e); }
.mx-dev-card-line .mx-dim{ flex:0 0 auto; }

/* picker row — provider / model / version share the width */
.mx-dev-card-picker{ border:1px solid var(--border, #383838); border-radius:3px;
  padding:4px 8px; background:var(--surface-1, #0e0e0e); }
.mx-dev-card-picker .mx-model-picker{ display:flex; flex-wrap:wrap; gap:6px; }
.mx-dev-card-picker select{ flex:1 1 90px; min-width:90px; }

/* tab strip — carets at both ends fold the body */
.mx-dev-strip{ display:flex; align-items:center; justify-content:space-between; gap:6px;
  border:1px solid var(--border, #383838); border-radius:3px; padding:2px 6px;
  background:var(--surface-1, #0e0e0e); }
.mx-dev-strip .mx-btn{ background:transparent; border-color:transparent;
  border-bottom:2px solid transparent; }
.mx-dev-strip .mx-btn.mx-dev-tab-active{ background:var(--surface-2, #141414);
  border-color:transparent; border-bottom-color:var(--accent, #2a6); }
.mx-dev-strip .mx-dev-strip-caret{ padding:0 4px; font-size:14px; }

/* tab body — indented under the strip */
.mx-dev-card-body{ padding:6px 8px; border-left:2px solid var(--border, #383838); }
.mx-dev-caret{ flex:0 0 auto; }
.mx-dev-block-head{ display:flex; align-items:center; gap:6px; cursor:pointer;
  margin:var(--dv-sec) 0 var(--dv-gap); }
.mx-dev-block-head:first-child{ margin-top:0; }

.mx-dev-status{ padding-top:var(--dv-gap); }
`;

  function ensureDevCss() {
    if (document.getElementById(DEV_CSS_ID)) return;
    const style = document.createElement("style");
    style.id = DEV_CSS_ID;
    style.textContent = DEV_CSS;
    document.head.appendChild(style);
  }

  // ---- fields ----

  // text input that commits on blur or Enter, only when changed
  function textField(value, placeholder, onCommit) {
    const input = el("input");
    input.type = "text";
    input.value = value === undefined || value === null ? "" : value;
    input.placeholder = placeholder;
    let baseline = input.value;
    input.addEventListener("blur", () => {
      if (input.value === baseline) return;
      baseline = input.value;
      onCommit(input.value);
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    return input;
  }

  // ---- card ----

  function renderCard(frame, track, region, host) {
    const dev = frame._dev;
    const draft = isDraftId(region.id);
    const open = dev.openCards.has(region.id);
    const tab = dev.cardTab[region.id] || "settings";

    const card = el("div", "mx-dev-card" + (draft ? " mx-dev-card-draft" : ""));
    const main = el("div", "mx-dev-card-main");
    const side = el("div", "mx-dev-card-side");

    // head — track line, region line
    const head = el("div", "mx-dev-card-head");

    const tLine = el("div", "mx-dev-card-line");
    tLine.appendChild(el("span", "mx-dev-card-label", "Track:"));
    tLine.appendChild(textField(track.name, "track name", (v) => {
      sendFrame(frame, { type: "edit_track_row", track: track.id, fields: { name: v } });
    }));
    head.appendChild(tLine);

    const rLine = el("div", "mx-dev-card-line");
    rLine.appendChild(el("span", "mx-dev-card-label", "Region:"));
    const rName = textField(region.name, draft ? "untitled" : "region name", (v) => {
      if (draft) return;
      sendFrame(frame, { type: "edit_track", track: region.id, fields: { name: v } });
    });
    if (draft) rName.addEventListener("input", () => { region.name = rName.value; });
    rLine.appendChild(rName);
    rLine.appendChild(el("span", "mx-dim",
      draft ? "draft" : (dev.phaseByRegion[region.id] || "idle")));
    head.appendChild(rLine);
    main.appendChild(head);

    // picker — draft merges, live sends edit_track
    const pick = el("div", "mx-dev-card-picker");
    const picked = MX.mountModelPicker(pick, {
      value: region.model,
      onPick: (id) => {
        if (id === region.model) return;
        if (draft) setDraftModel(dev, region, id);
        else sendFrame(frame, { type: "edit_track", track: region.id, fields: { model: id } });
      },
    });
    Promise.resolve(picked).then((ctrl) => { if (ctrl) dev.pickers[region.id] = ctrl; });
    main.appendChild(pick);

    // strip — fold carets, tabs
    const strip = el("div", "mx-dev-strip");
    const toggle = () => {
      if (open) dev.openCards.delete(region.id); else dev.openCards.add(region.id);
      render(frame);
    };
    strip.appendChild(button("mx-btn mx-dev-strip-caret", open ? "▾" : "▸", toggle));
    for (const t of CARD_TABS) {
      strip.appendChild(button("mx-btn" + (open && tab === t ? " mx-dev-tab-active" : ""), t, () => {
        dev.cardTab[region.id] = t;
        dev.openCards.add(region.id);
        render(frame);
      }));
    }
    strip.appendChild(button("mx-btn mx-dev-strip-caret", open ? "▾" : "▸", toggle));
    main.appendChild(strip);

    if (open) {
      const body = el("div", "mx-dev-card-body");
      renderTab(frame, track, region, tab, body);
      main.appendChild(body);
    }

    // side — start for a draft, the live actions otherwise
    if (draft) {
      side.appendChild(button("mx-btn mx-dev-start", "Start region", () => startDraft(frame, region)));
    } else {
      side.appendChild(button("mx-btn", "reset", () => sendFrame(frame, { type: "reset_track", track: region.id })));
      side.appendChild(button("mx-btn", "stop", () => sendFrame(frame, { type: "stop", track: region.id })));
      side.appendChild(button("mx-btn", "close shell", () => sendFrame(frame, { type: "close_shell", track: region.id })));
      side.appendChild(button("mx-btn", "delete", () => {
        if (window.confirm("delete region " + region.name + "?")) {
          sendFrame(frame, { type: "kill_track", track: region.id });
        }
      }));
    }

    card.appendChild(main);
    card.appendChild(side);
    host.appendChild(card);
  }

  // ---- tab bodies ----

  function blockHead(dev, key, label, note, rerender) {
    const collapsed = dev.collapsedBlocks.has(key);
    const head = el("div", "mx-dev-block-head");
    head.appendChild(el("span", "mx-dev-caret", collapsed ? "▸" : "▾"));
    head.appendChild(el("span", "", label));
    if (note) head.appendChild(el("span", "mx-dim", note));
    head.addEventListener("click", () => {
      if (collapsed) dev.collapsedBlocks.delete(key); else dev.collapsedBlocks.add(key);
      rerender();
    });
    return { head: head, collapsed: collapsed };
  }

  function renderTab(frame, track, region, tab, body) {
    const dev = frame._dev;
    const rerender = () => render(frame);

    if (tab === "context") {
      const levels = [
        { kind: "track", row: track, label: "track" },
        { kind: "region", row: region, label: "region" },
      ];
      for (const lv of levels) {
        const key = "ctx:" + lv.kind + ":" + lv.row.id;
        const path = "injections/" + lv.kind + "/" + lv.row.id + ".md";
        const sec = blockHead(dev, key, lv.label, isDraftId(lv.row.id) ? "" : path, rerender);
        body.appendChild(sec.head);
        if (!sec.collapsed) dev.settingsRows.renderContext(lv.kind, lv.row.id, body);
      }
      return;
    }
    if (tab === "gates") { dev.settingsRows.renderGates(region, body); return; }
    if (tab === "presets") { dev.settingsRows.renderPreset(region, body); return; }
    dev.settingsRows.renderSettings(region, body);
  }

  // ---- top-level render ----

  function render(frame) {
    const dev = frame._dev;
    if (!dev) return;
    const host = dev.rootEl;
    host.textContent = "";
    dev.pickers = {};

    const top = el("div", "mx-dev-top");
    top.appendChild(button("mx-btn mx-dev-add-track", "Add track", () => {
      sendFrame(frame, { type: "create_track", name: "track " + (dev.trackRows.length + 1) });
    }));
    host.appendChild(top);

    const tracks = dev.trackRows.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const t of tracks) {
      const group = el("div", "mx-dev-track-group");
      for (const r of liveRegionsOfTrack(dev, t.id)) renderCard(frame, t, r, group);
      renderCard(frame, t, ensureDraft(dev, t.id), group);
      host.appendChild(group);
    }
    if (!tracks.length) host.appendChild(el("div", "mx-dim", "no tracks"));

    if (dev.lastOut) host.appendChild(el("div", "mx-dim mx-dev-status", dev.lastOut));
  }

  // ---- roster bookkeeping shared by ade_init and track_list ----

  function applyRoster(frame, msg) {
    const dev = frame._dev;
    dev.trackRows = msg.rows || [];
    dev.regionRows = msg.tracks || [];
    dev.namesMap = msg.names || {};
    // a draft outlives roster frames, but not the track it sits under
    for (const id of Object.keys(dev.drafts)) {
      if (!trackById(dev, dev.drafts[id].track)) {
        delete dev.drafts[id];
        dev.openCards.delete(id);
        delete dev.cardTab[id];
      }
    }
  }

  MX.registerWidget("devagent", {
    mount(frame) {
      const dev = frame._dev = {
        trackRows: [], regionRows: [], namesMap: {},
        phaseByRegion: {}, gateEdges: null, policyHooks: [],
        modelRows: [], presetNames: [], presetsLoaded: false, outputStyles: [],
        changePrompt: null, contexts: {}, lastOut: "",
        collapsedBlocks: new Set(), blocksTouched: new Set(),
        drafts: {}, regionDefaults: {},
        openCards: new Set(), cardTab: {}, pickers: {},
      };
      dev.settingsRows = MX.settingsRows.create(frame, { state: dev, rerender: () => render(frame) });

      ensureDevCss();
      dev.rootEl = el("div", "mx-devagent");
      frame.host.appendChild(dev.rootEl);

      // another widget asks for a region's card to open
      frame._devOpenHandler = (e) => {
        const d = (e && e.detail) || {};
        if (d.region) dev.openCards.add(d.region);
        render(frame);
      };
      document.addEventListener("mx:open-devagent", frame._devOpenHandler);

      fetch("/api/library/models").then((r) => r.json()).then((d) => {
        dev.modelRows = (d && d.list) || [];
        render(frame);
      }).catch(() => {});

      dev.presetsLoaded = true;
      fetch("/api/library/presets").then((r) => r.json()).then((d) => {
        dev.presetNames = Array.isArray(d && d.names) ? d.names
                        : (Array.isArray(d && d.list) ? d.list : []);
        render(frame);
      }).catch(() => {});

      // the bag a region is born with; drafts seed from it
      fetch("/api/settings/region-defaults").then((r) => r.json()).then((d) => {
        dev.regionDefaults = (d && d.defaults) || {};
        render(frame);
      }).catch(() => {});

      // hook names for the gates tab
      fetch("/api/policy").then((r) => r.json()).then((d) => {
        dev.policyHooks = (d && d.hooks) || [];
        render(frame);
      }).catch(() => {});

      fetch("/api/claude/output-styles").then((r) => r.json()).then((d) => {
        dev.outputStyles = ((d && d.styles) || []).map((s) => s.name).filter(Boolean);
        render(frame);
      }).catch(() => {});

      frame.subscribe(["ade_init", "track_list", "track_created", "track_removed",
        "region_replaced", "track_status", "models", "gate_edges",
        "change_prompt", "saved", "file", "out"]);
      frame.send({ type: "roster", inst: frame.id });
      // socket-open sends gate_edges once, before this frame mounted
      frame.send({ type: "gate_edges", inst: frame.id });

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
        // a new region's card opens on settings; the roster that follows draws it
        if (msg.track && msg.track.id) {
          dev.openCards.add(msg.track.id);
          dev.cardTab[msg.track.id] = "settings";
        }
        return;
      }

      if (msg.type === "track_removed") {
        dev.regionRows = dev.regionRows.filter((r) => r.id !== msg.id);
        dev.openCards.delete(msg.id);
        delete dev.cardTab[msg.id];
        render(frame);
        return;
      }

      if (msg.type === "region_replaced") {
        if (dev.openCards.has(msg.old_id)) {
          dev.openCards.delete(msg.old_id);
          dev.openCards.add(msg.new_id);
          dev.cardTab[msg.new_id] = dev.cardTab[msg.old_id];
          delete dev.cardTab[msg.old_id];
        }
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

      // "file" is subscribed but unused — context loads go through /api/fs/read
    },
  });
})();
