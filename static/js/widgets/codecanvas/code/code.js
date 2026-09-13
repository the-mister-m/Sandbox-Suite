// code widget — blocks, doc and source views over one canvas's document
//
// Binds to one canvas widget on this surface that shares its target: the
// instance named by the `canvas` option, else the last to emit canvas.focus.
// State: per instance on frame._codeState. No module-level state.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const VIEWS = ["blocks", "doc", "source"];
  const CODE_MODES = ["resolved", "template"];

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
      .mxcd-highlight { background: rgba(42,109,244,.25); }
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

  function api(cs) {
    const f = boundFrame(cs);
    return f ? f._canvas : null;
  }

  // function: mode this widget cares about. state present means doc.
  function modeOf(a) {
    return a && a.state ? "doc" : (a ? "file" : null);
  }

  // ---------- resolve, cached per state object ----------

  function resolveFor(cs, state) {
    if (!cs.core || !state) return null;
    if (cs.resolveOf !== state) {
      cs.resolve = cs.core.makeResolve(cs.core.kit, state);
      cs.resolveOf = state;
    }
    return cs.resolve;
  }

  // ---------- source + display, ported from Code Canvas drawer.js ----------

  function sourceFor(w, def) {
    if (w.code && w.code.custom) {
      return { html: w.code.html || "", css: w.code.css || "", js: w.code.js || "" };
    }
    return { html: (def && def.html) || "", css: (def && def.css) || "", js: (def && def.js) || "" };
  }

  // function: html/css/js text to show. Resolved fills {{tags}}; template leaves them.
  function displayFor(cs, state, w, mode) {
    const resolve = resolveFor(cs, state);
    const src = sourceFor(w, resolve ? resolve.def(w.type) : null);
    if (mode === "template") return src;
    const map = resolve ? resolve.map(w, state.get().settings) : {};
    return {
      html: resolve ? resolve.fill(src.html, map) : src.html,
      css: resolve ? resolve.fill(src.css, map) : src.css,
      js: resolve ? resolve.fill(src.js, map) : src.js
    };
  }

  function pageWidgets(state) {
    const s = state.get();
    for (const p of s.pages) if (p.id === s.page) return p.widgets;
    return [];
  }

  function headerLine(w) { return "// " + w.id + " " + w.type; }

  function buildCodeText(cs, state, mode) {
    const widgets = pageWidgets(state);
    const lines = [];
    const index = {};
    for (const w of widgets) {
      const d = displayFor(cs, state, w, mode);
      index[w.id] = lines.length;
      lines.push(headerLine(w));
      lines.push("// html"); lines.push(d.html);
      lines.push("// css"); lines.push(d.css);
      lines.push("// js"); lines.push(d.js);
      lines.push("");
    }
    return { text: lines.join("\n"), index: index };
  }

  // function: html/css/js body between markers. A second "// html" marker
  // means a deleted header's block ran on into this one; cut there.
  function parseFields(bodyLines) {
    const htmlAt = [];
    for (let i = 0; i < bodyLines.length; i++) if (bodyLines[i] === "// html") htmlAt.push(i);
    if (htmlAt.length > 1) bodyLines = bodyLines.slice(0, htmlAt[1]);
    const markers = { html: -1, css: -1, js: -1 };
    for (let i = 0; i < bodyLines.length; i++) {
      if (bodyLines[i] === "// html") markers.html = i;
      else if (bodyLines[i] === "// css") markers.css = i;
      else if (bodyLines[i] === "// js") markers.js = i;
    }
    function slice(from, to) {
      if (from === -1) return "";
      const end = (to === -1) ? bodyLines.length : to;
      return bodyLines.slice(from + 1, end).join("\n").replace(/\n+$/, "");
    }
    const htmlEnd = markers.css !== -1 ? markers.css : (markers.js !== -1 ? markers.js : -1);
    const cssEnd = markers.js !== -1 ? markers.js : -1;
    return {
      html: slice(markers.html, htmlEnd),
      css: slice(markers.css, cssEnd),
      js: slice(markers.js, -1)
    };
  }

  // function: id -> {html,css,js}. Widgets with a lost header are absent.
  function parseBlocks(text) {
    const lines = text.split("\n");
    const headerLines = [];
    const re = /^\/\/ (\S+) (\S+)$/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) headerLines.push({ line: i, id: m[1] });
    }
    const blocks = {};
    for (let h = 0; h < headerLines.length; h++) {
      const start = headerLines[h].line + 1;
      const end = (h + 1 < headerLines.length) ? headerLines[h + 1].line : lines.length;
      blocks[headerLines[h].id] = parseFields(lines.slice(start, end));
    }
    return blocks;
  }

  // ---------- monaco: one editor, one model per view ----------

  function ensureEditor(cs) {
    MX.monacoReady().then((monaco) => {
      if (!cs.live || cs.editor) return;
      cs.monaco = monaco;
      cs.editor = monaco.editor.create(cs.editorHost, {
        value: "", language: "html", theme: "vs-dark", readOnly: true,
        automaticLayout: true, minimap: { enabled: false },
        scrollBeyondLastLine: false
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
    let editable = false;
    if (a && !cs.locked) {
      const mode = modeOf(a);
      if (cs.view === "blocks" && mode === "doc") editable = true;
      else if (cs.view === "source" && mode === "file") editable = true;
      else if (cs.view === "doc" && mode === "doc" && cs.docEditable) editable = true;
    }
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

  // function: header line for id, blocks view only.
  function scrollToWidget(cs, id) {
    if (cs.view !== "blocks" || !id) return;
    // queued until the blocks index exists, replayed once
    if (!cs.editor || !cs.blocksIndex) { cs.pendingSelect = id; return; }
    const idx = cs.blocksIndex[id];
    if (idx === undefined) return;
    const lineNo = idx + 1;
    cs.editor.revealLineInCenter(lineNo);
    cs.decor = cs.editor.deltaDecorations(cs.decor || [], [{
      range: new cs.monaco.Range(lineNo, 1, lineNo, 1),
      options: { isWholeLine: true, className: "mxcd-highlight" }
    }]);
  }

  // ---------- render ----------

  function renderCurrent(cs) {
    if (!cs.live || !cs.editor) return;
    const a = api(cs);
    updateBar(cs, a);
    if (!a) { showGuide(cs, "No canvas on this target."); updateReadOnly(cs, a); return; }
    const mode = modeOf(a);
    if (cs.view === "source" && mode !== "file") {
      showGuide(cs, "Source view: file mode only.");
      updateReadOnly(cs, a);
      return;
    }
    if (cs.view !== "source" && mode !== "doc") {
      showGuide(cs, "Blocks and doc need a document canvas.");
      updateReadOnly(cs, a);
      return;
    }
    if (cs.view === "blocks") {
      const built = buildCodeText(cs, a.state, cs.codeMode);
      cs.blocksIndex = built.index;
      cs.baseline = {};
      for (const w of pageWidgets(a.state)) cs.baseline[w.id] = displayFor(cs, a.state, w, cs.codeMode);
      setViewModel(cs, "blocks", built.text, "html");
      if (cs.pendingSelect) {
        const queued = cs.pendingSelect;
        cs.pendingSelect = null;
        scrollToWidget(cs, queued);
      }
    } else if (cs.view === "doc") {
      setViewModel(cs, "doc", JSON.stringify(a.state.get(), null, 2), "json");
    } else {
      setViewModel(cs, "source", a.source(), "html");
    }
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
    if (cs.view === "blocks") {
      const parsed = parseBlocks(text);
      const widgets = pageWidgets(a.state);
      let missing = 0;
      for (const w of widgets) {
        const p = parsed[w.id];
        if (!p) { missing++; continue; }
        const base = cs.baseline ? cs.baseline[w.id] : null;
        if (base && (p.html !== base.html || p.css !== base.css || p.js !== base.js)) {
          a.state.setCode(w.id, p.html, p.css, p.js);
        }
      }
      setNotice(cs, missing > 0 ? (missing + (missing === 1 ? " block" : " blocks") + " skipped: missing header") : "");
    } else if (cs.view === "doc") {
      if (!cs.docEditable) return;
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { setNotice(cs, "parse failed: " + e.message); return; }
      a.state.replace(parsed);
      setNotice(cs, "");
    } else if (cs.view === "source") {
      a.patchSource({ kind: "set-full-source", source: text });
      setNotice(cs, "");
    }
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

  function markDirty(cs) {
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(cs.frame);
  }

  // ---------- module ----------

  const MOD = {
    defaults: { target: "", canvas: "focused", view: "blocks", codeMode: "resolved", docEditable: false, locked: false },

    mount(frame) {
      ensureStyles();

      const cs = frame._codeState = {
        frame: frame, live: true, core: null,
        canvasOpt: frame.options.canvas || "focused",
        view: VIEWS.indexOf(frame.options.view) >= 0 ? frame.options.view : "blocks",
        codeMode: CODE_MODES.indexOf(frame.options.codeMode) >= 0 ? frame.options.codeMode : "resolved",
        docEditable: !!frame.options.docEditable,
        locked: true, focusedInst: "",
        mirrors: null, monaco: null, editor: null, editorHost: null,
        models: {}, guideModel: null, decor: [],
        baseline: null, baselineText: "", blocksIndex: null, pendingSelect: null,
        resolve: null, resolveOf: null,
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
        MOD.optionControls = Object.assign({}, core.optionControls(), {
          canvas: { kind: "select", values: (f) => ["focused"].concat(canvasIdsFor(f)) },
          view: { kind: "select", values: () => VIEWS.slice() },
          codeMode: { kind: "select", values: () => CODE_MODES.slice() }
        });
        cs.mirrors = core.mirrors(frame, {
          select: (payload) => scrollToWidget(cs, payload.ids && payload.ids[0]),
          change: () => { if (!cs.locked) return; renderCurrent(cs); },
          doc: () => { resetModels(cs); renderCurrent(cs); },
          focus: (payload) => {
            cs.focusedInst = payload.inst || "";
            if (cs.canvasOpt === "focused") renderCurrent(cs);
          }
        });
        renderCurrent(cs);
      });
    },

    unmount(frame) {
      const cs = frame._codeState;
      if (!cs) return;
      cs.live = false;
      if (cs.mirrors) cs.mirrors.off();
      if (cs.editor) { try { cs.editor.dispose(); } catch (e) { /* dispose best effort */ } }
      for (const key of Object.keys(cs.models)) {
        try { cs.models[key].dispose(); } catch (e) { /* dispose best effort */ }
      }
      if (cs.guideModel) { try { cs.guideModel.dispose(); } catch (e) { /* dispose best effort */ } }
      frame._codeState = null;
    },

    onOption(frame, key, value) {
      const cs = frame._codeState;
      if (!cs) return;
      if (key === "target") { resetModels(cs); cs.focusedInst = ""; renderCurrent(cs); return; }
      if (key === "canvas") { cs.canvasOpt = value || "focused"; resetModels(cs); renderCurrent(cs); return; }
      if (key === "view") {
        if (VIEWS.indexOf(value) < 0) return;
        cs.view = value; markDirty(cs); renderCurrent(cs);
        return;
      }
      if (key === "codeMode") {
        if (CODE_MODES.indexOf(value) < 0) return;
        cs.codeMode = value; markDirty(cs); renderCurrent(cs);
        return;
      }
      if (key === "docEditable") { cs.docEditable = !!value; updateReadOnly(cs); return; }
    },

    getOptions(frame) {
      const cs = frame._codeState;
      if (!cs) return JSON.parse(JSON.stringify(frame.options));
      return {
        target: frame.options.target || "",
        canvas: cs.canvasOpt,
        view: cs.view,
        codeMode: cs.codeMode,
        docEditable: cs.docEditable,
        locked: false
      };
    }
  };

  MX.registerWidget("canvas_code", MOD);
})();
