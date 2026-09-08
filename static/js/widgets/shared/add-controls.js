// shared add controls — inline create-track / create-region forms
//
// MX.mountAddControls(host, frame, opts) builds the form into host and
// returns { el, refresh(state), onFrame(msg) }.
//
// opts.mode: "track" (name, root, + track button, sends create_track),
// "region" (name, root, model, + region button, sends insert_region on
// opts.track() — disabled while opts.track() returns null), "both" (track
// name, region name, root, model, one button — sends create_track, then on
// the track_created frame whose row matches sends insert_region; this is
// the mount widget's behavior).
//
// refresh(state) takes { sessionRoot, workspaceRoot, trackRoot } and
// repaints the inherited root placeholder. trackRoot wins over sessionRoot,
// which wins over workspaceRoot.
//
// Lifted from devagent's renderAddControls, rootField, inheritedRoot.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const CSS_ID = "mx-add-controls-css";
  const CSS = `
.mx-add-controls{ display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:4px; }
.mx-add-controls-caption{ flex:0 0 auto; color:var(--text-3, #888); font-size:11px; }
.mx-add-controls-wrap + .mx-add-controls-wrap{ border-top:1px solid var(--border, #383838);
  margin-top:6px; padding-top:6px; }

/* text inputs and native selects read the same surface, border, radius */
.mx-add-controls input[type="text"],
.mx-add-controls select{ box-sizing:border-box; height:22px; background:var(--surface-1, #0e0e0e);
  color:var(--text-1, #ddd); border:1px solid var(--border, #383838); border-radius:3px;
  padding:0 5px; }

/* model picker — three selects on one line, shrinking instead of wrapping */
.mx-model-picker{ display:flex; align-items:center; flex-wrap:nowrap; gap:4px; min-width:0; }
.mx-model-picker select{ min-width:0; flex:1 1 0; }
`;

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

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

  // root field starts disabled showing the inherited root; browse enables it
  // as an override. override() returns "" while inherited, so no root is sent
  function rootField(base, placeholder) {
    const wrap = el("div", "mx-dev-rootfield");
    const input = el("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = base;
    input.disabled = true;
    const btn = el("button", "mx-btn", "browse");
    btn.type = "button";
    btn.addEventListener("click", () => {
      MX.openRootBrowser(input.value || base, (path) => {
        input.value = path;
        input.disabled = false;
      }, {});
    });
    wrap.appendChild(input);
    wrap.appendChild(btn);
    return {
      el: wrap,
      override: () => (input.disabled ? "" : input.value.trim()),
      reset() { input.value = base; input.disabled = true; },
      rebase(next) { base = next; if (input.disabled) input.value = base; },
    };
  }

  MX.mountAddControls = function (host, frame, opts) {
    opts = opts || {};
    ensureCss();
    const mode = opts.mode;
    const state = { sessionRoot: "", workspaceRoot: "", trackRoot: "" };
    const inheritedRoot = () => state.trackRoot || state.sessionRoot || state.workspaceRoot || "";

    const wrap = el("div", "mx-add-controls-wrap");
    host.appendChild(wrap);

    const ctrl = { el: wrap };
    const roots = [];

    if (mode === "track" || mode === "both") {
      const row = el("div", "mx-add-controls");
      if (mode === "track") row.appendChild(el("span", "mx-add-controls-caption", "add track"));
      const tName = el("input"); tName.type = "text"; tName.placeholder = "track name";
      row.appendChild(tName);
      const tRoot = rootField(inheritedRoot(), "root path");
      roots.push(tRoot);
      row.appendChild(tRoot.el);

      if (mode === "track") {
        const tBtn = el("button", "mx-btn", "+ track");
        tBtn.type = "button";
        tBtn.addEventListener("click", () => {
          const name = tName.value.trim(), root = tRoot.override();
          if (!name) return;
          const msg = { type: "create_track", name: name };
          if (root) msg.root = root;
          sendFrame(frame, msg);
          tName.value = ""; tRoot.reset();
        });
        row.appendChild(tBtn);
        wrap.appendChild(row);
      } else {
        // "both" — track name, region name, root, model, one button. Sends
        // create_track, then on the track_created frame whose row matches
        // the pending name, sends insert_region.
        const rName = el("input"); rName.type = "text"; rName.placeholder = "region name";
        row.appendChild(rName);
        const pickerHost = el("div", "mx-add-controls-picker");
        row.appendChild(pickerHost);
        let pickerCtrl = null;
        MX.mountModelPicker(pickerHost, {}).then((c) => { pickerCtrl = c; });

        const btn = el("button", "mx-btn", "+ track + region");
        btn.type = "button";
        let pending = null;
        btn.addEventListener("click", () => {
          const trackName = tName.value.trim();
          const regionName = rName.value.trim();
          const root = tRoot.override();
          const model = pickerCtrl ? pickerCtrl.value() : "";
          if (!trackName || !regionName || !model) return;
          pending = { trackName, regionName, root, model };
          const msg = { type: "create_track", name: trackName };
          if (root) msg.root = root;
          sendFrame(frame, msg);
          tName.value = ""; rName.value = ""; tRoot.reset();
        });
        row.appendChild(btn);
        wrap.appendChild(row);

        ctrl.onFrame = function (msg) {
          if (!pending) return;
          if (msg.type === "track_created" && msg.row && msg.row.name === pending.trackName) {
            const p = pending;
            pending = null;
            const out = { type: "insert_region", track: msg.row.id, name: p.regionName, model: p.model };
            if (p.root) out.root = p.root;
            sendFrame(frame, out);
          }
        };
      }
    }

    if (mode === "region") {
      const row = el("div", "mx-add-controls");
      row.appendChild(el("span", "mx-add-controls-caption", "add region"));
      const rName = el("input"); rName.type = "text"; rName.placeholder = "region name";
      row.appendChild(rName);
      const rRoot = rootField(inheritedRoot(), "root path");
      roots.push(rRoot);
      row.appendChild(rRoot.el);
      const pickerHost = el("div", "mx-add-controls-picker");
      row.appendChild(pickerHost);
      let pickerCtrl = null;
      MX.mountModelPicker(pickerHost, {}).then((c) => { pickerCtrl = c; });
      const rBtn = el("button", "mx-btn", "+ region");
      rBtn.type = "button";
      const paintDisabled = () => { rBtn.disabled = !opts.track || opts.track() == null; };
      paintDisabled();
      rBtn.addEventListener("click", () => {
        const track = opts.track ? opts.track() : null;
        const name = rName.value.trim();
        const root = rRoot.override();
        const model = pickerCtrl ? pickerCtrl.value() : "";
        if (!track || !name || !model) return;
        const msg = { type: "insert_region", track: track, name: name, model: model };
        if (root) msg.root = root;
        sendFrame(frame, msg);
        rName.value = "";
      });
      row.appendChild(rBtn);
      wrap.appendChild(row);
      ctrl._paintDisabled = paintDisabled;
    }

    ctrl.refresh = function (next) {
      Object.assign(state, next || {});
      const base = inheritedRoot();
      roots.forEach((r) => r.rebase(base));
      if (ctrl._paintDisabled) ctrl._paintDisabled();
    };
    if (!ctrl.onFrame) ctrl.onFrame = function () {};

    return ctrl;
  };
})();
