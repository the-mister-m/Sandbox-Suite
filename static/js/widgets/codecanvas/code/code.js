// code widget — the source view over one canvas's file
//
// Binds to one canvas widget on this surface that shares its target: the
// instance named by the `canvas` option, else the last to emit canvas.focus.
// State: per instance on frame._codeState. No module-level state.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};


  function ensureStyles() {
    if (document.getElementById("mxcd-style")) return;
    const style = document.createElement("style");
    style.id = "mxcd-style";
    style.textContent = `
      .mxcd-wrap { display: flex; flex-direction: column; height: 100%; }
      .mxcd-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        flex: 0 0 auto; border-bottom: 1px solid var(--border, #333); }
      .mxcd-btn { padding: 2px 8px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--border, #333); background: none;
        color: var(--text-2, #aaa); }
      .mxcd-btn.mxcd-on { border-color: #2a6df4; color: var(--text-1, #ddd); }
      .mxcd-spacer { flex: 1 1 auto; }
      .mxcd-notice { font-size: 10px; color: #e0a030; }
      .mxcd-notice.mxcd-empty { display: none; }
      .mxcd-editor { flex: 1 1 auto; min-height: 0; }
      .mxcd-editor.mxcd-unlocked { box-shadow: inset 0 0 0 2px #2a6df4; }
    `;
    document.head.appendChild(style);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function mkBtn(label, cls, onClick) {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- which canvas, ported from tools.js ----------

  function canvasIdsFor(frame) {
    const g = MX.grid;
    if (!frame || !g || !Array.isArray(g.instances)) return [];
    const want = frame.options.target || "";
    const out = [];
    for (const inst of g.instances) {
      if (inst.type !== "canvas") continue;
      if (((inst.options && inst.options.target) || "") !== want) continue;
      out.push(inst.id);
    }
    return out;
  }

  function canvasFrame(id) {
    const g = MX.grid;
    const f = g && g.frames ? g.frames[id] : null;
    return (f && f._canvas) ? f : null;
  }

  // function: the bound canvas. An instance id pins; "focused" follows the
  // last canvas.focus on this target and falls back to the first on it.
  function boundFrame(cs) {
    const ids = canvasIdsFor(cs.frame);
    if (cs.canvasOpt !== "focused") {
      return ids.indexOf(cs.canvasOpt) >= 0 ? canvasFrame(cs.canvasOpt) : null;
    }
    if (cs.focusedInst && ids.indexOf(cs.focusedInst) >= 0) {
      const f = canvasFrame(cs.focusedInst);
      if (f) return f;
    }
    for (const id of ids) {
      const f = canvasFrame(id);
      if (f) return f;
    }
    return null;
  }

  // function: follow mode adopts any focused canvas and takes its target.
  function onAnyFocus(cs, payload) {
    if (cs.canvasOpt !== "focused" || !payload || !payload.inst) return;
    const want = payload.target || "";
    // state: the target option clears focusedInst, so it is set after.
    if (want !== (cs.frame.options.target || "")) {
      cs.frame.setOption("target", want);
      cs.focusedInst = payload.inst;
      renderCurrent(cs);
      return;
    }
    cs.focusedInst = payload.inst;
    renderCurrent(cs);
  }

  function api(cs) {
    const f = boundFrame(cs);
    return f ? f._canvas : null;
  }

  // ---------- monaco: one editor, one source model ----------

  function ensureEditor(cs) {
    MX.monacoReady().then((monaco) => {
      if (!cs.live || cs.editor) return;
      cs.monaco = monaco;
      // occurrencesHighlight off: its delayer rejects with "Canceled" when a
      // view switch calls setModel while a highlight request is in flight
      cs.editor = monaco.editor.create(cs.editorHost, {
        value: "", language: "html", theme: "vs-dark", readOnly: true,
        automaticLayout: true, minimap: { enabled: false },
        scrollBeyondLastLine: false, occurrencesHighlight: "off"
      });
      // cmd/ctrl-s while unlocked: apply then relock
      cs.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (cs.locked) return;
        applyEdits(cs);
        relock(cs);
      });
      renderCurrent(cs);
    }).catch(() => { cs.editorHost.textContent = "[code: monaco failed]"; });
  }

  function resetModels(cs) {
    for (const key of Object.keys(cs.models)) {
      try { cs.models[key].dispose(); } catch (e) { /* dispose best effort */ }
    }
    cs.models = {};
  }

  function setViewModel(cs, view, text, lang) {
    if (!cs.monaco || !cs.editor) return;
    let model = cs.models[view];
    if (!model) {
      model = cs.monaco.editor.createModel(text, lang);
      cs.models[view] = model;
    } else {
      model.setValue(text);
    }
    if (cs.editor.getModel() !== model) cs.editor.setModel(model);
  }

  function showGuide(cs, msg) {
    if (!cs.monaco || !cs.editor) return;
    if (!cs.guideModel) cs.guideModel = cs.monaco.editor.createModel(msg, "plaintext");
    else cs.guideModel.setValue(msg);
    if (cs.editor.getModel() !== cs.guideModel) cs.editor.setModel(cs.guideModel);
  }

  function updateReadOnly(cs, a) {
    if (!cs.editor) return;
    a = a || api(cs);
    const editable = !!a && !cs.locked;
    cs.editor.updateOptions({ readOnly: !editable });
    if (cs.editorHost) cs.editorHost.classList.toggle("mxcd-unlocked", editable);
  }

  function updateBar(cs, a) {
    if (!cs.lockBtn) return;
    cs.lockBtn.textContent = cs.locked ? "Locked" : "Unlocked";
    cs.lockBtn.classList.toggle("mxcd-on", !cs.locked);
    cs.lockBtn.disabled = !a;
  }

  function setNotice(cs, msg) {
    if (!cs.noticeEl) return;
    cs.noticeEl.textContent = msg || "";
    cs.noticeEl.classList.toggle("mxcd-empty", !msg);
  }

  // ---------- render ----------

  function renderCurrent(cs) {
    if (!cs.live || !cs.editor) return;
    const a = api(cs);
    updateBar(cs, a);
    if (!a) { showGuide(cs, "No canvas on this target."); updateReadOnly(cs, a); return; }
    setViewModel(cs, "source", a.source(), "html");
    cs.baselineText = cs.editor.getValue();
    updateReadOnly(cs, a);
  }

  // ---------- lock / unlock / relock ----------

  function unlock(cs) {
    const a = api(cs);
    if (!a) return;
    cs.locked = false;
    if (cs.mirrors) cs.mirrors.freeze.emit({ on: true });
    updateReadOnly(cs, a);
    updateBar(cs, a);
  }

  function relock(cs) {
    cs.locked = true;
    if (cs.mirrors) cs.mirrors.freeze.emit({ on: false });
    renderCurrent(cs);
  }

  function applyEdits(cs) {
    const a = api(cs);
    if (!a || !cs.editor) return;
    const text = cs.editor.getValue();
    a.patchSource({ kind: "set-full-source", source: text });
    setNotice(cs, "");
  }

  function discardEdits(cs) {
    setNotice(cs, "");
  }

  function onLockClick(cs) {
    if (cs.locked) { unlock(cs); return; }
    const dirty = !!(cs.editor && cs.editor.getValue() !== cs.baselineText);
    if (!dirty) { relock(cs); return; }
    MX.ui.choose("Apply edits and lock?", "", [
      { label: "Apply", value: "apply", cls: "mx-go" },
      { label: "Discard", value: "discard" }
    ]).then((choice) => {
      if (choice === "apply") applyEdits(cs);
      else if (choice === "discard") discardEdits(cs);
      else return;
      relock(cs);
    });
  }

  // ---------- module ----------

  const MOD = {
    defaults: { target: "", canvas: "focused", locked: false, followTarget: "" },

    optionControls: {
      target: MX.canvasTargetControl(false),
      canvas: { kind: "select", values: (f) => ["focused"].concat(canvasIdsFor(f)) }
    },

    mount(frame) {
      ensureStyles();

      const cs = frame._codeState = {
        frame: frame, live: true, core: null,
        canvasOpt: frame.options.canvas || "focused",
        locked: true, focusedInst: "",
        mirrors: null, followMirror: null, monaco: null, editor: null, editorHost: null,
        models: {}, guideModel: null,
        baselineText: "",
        noticeEl: null, lockBtn: null
      };

      const wrap = el("div", "mxcd-wrap");
      const bar = el("div", "mxcd-bar");
      cs.lockBtn = mkBtn("Locked", "mxcd-btn", () => onLockClick(cs));
      bar.appendChild(cs.lockBtn);
      cs.noticeEl = el("span", "mxcd-notice mxcd-empty");
      bar.appendChild(cs.noticeEl);
      bar.appendChild(el("div", "mxcd-spacer"));
      bar.appendChild(mkBtn("⚙", "mxcd-btn", () => frame.toggleOptions()));
      wrap.appendChild(bar);

      cs.editorHost = el("div", "mxcd-editor");
      wrap.appendChild(cs.editorHost);
      frame.host.appendChild(wrap);

      ensureEditor(cs);

      MX.canvasCore().then((core) => {
        if (!cs.live) return;
        cs.core = core;
        cs.mirrors = core.mirrors(frame, {
          change: () => { if (!cs.locked) return; renderCurrent(cs); },
          doc: () => { renderCurrent(cs); },
          focus: (payload) => {
            cs.focusedInst = payload.inst || "";
            if (cs.canvasOpt === "focused") renderCurrent(cs);
          }
        });
        // empty followTarget option: hears canvas.focus on every target
        cs.followMirror = MX.mirror(frame, "canvas.focus",
          (payload) => onAnyFocus(cs, payload), "followTarget");
        renderCurrent(cs);
      });
    },

    unmount(frame) {
      const cs = frame._codeState;
      if (!cs) return;
      cs.live = false;
      if (cs.mirrors) cs.mirrors.off();
      if (cs.followMirror) cs.followMirror.off();
      if (cs.editor) { try { cs.editor.dispose(); } catch (e) { /* dispose best effort */ } }
      resetModels(cs);
      if (cs.guideModel) { try { cs.guideModel.dispose(); } catch (e) { /* dispose best effort */ } }
      frame._codeState = null;
    },

    onOption(frame, key, value) {
      const cs = frame._codeState;
      if (!cs) return;
      if (key === "target") { cs.focusedInst = ""; renderCurrent(cs); return; }
      if (key === "canvas") { cs.canvasOpt = value || "focused"; renderCurrent(cs); return; }
    },

    getOptions(frame) {
      const cs = frame._codeState;
      if (!cs) return JSON.parse(JSON.stringify(frame.options));
      return {
        target: frame.options.target || "",
        canvas: cs.canvasOpt,
        locked: false,
        followTarget: frame.options.followTarget || ""
      };
    }
  };

  MX.registerWidget("canvas_code", MOD);
})();
