// tools widget — inspector, layer tree, library and page options for one canvas
//
// Binds to one canvas widget on this surface that shares its target: the
// instance named by the `canvas` option, else the last to emit canvas.focus.
// State: per instance on frame._toolsState. No module-level state.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const SECTIONS = ["tools", "layers", "library", "page"];
  // label: the tab's face. The section key stays the contract name.
  const SECTION_LABELS = { page: "pages" };
  const TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "small"];
  const GRID_STYLES = ["lines", "dots", "dynamic"];
  const WIDTH_MODES = ["fixed", "fluid"];

  // state: ManualEditStyles, grouped for the file-mode inspector.
  const STYLE_GROUPS = [
    ["Text", ["fontFamily", "fontSize", "fontWeight", "color", "textAlign",
      "lineHeight", "letterSpacing"]],
    ["Layout", ["display", "width", "height", "minHeight", "gap",
      "flexDirection", "justifyContent", "alignItems", "transform"]],
    ["Spacing", ["padding", "paddingTop", "paddingRight", "paddingBottom",
      "paddingLeft", "margin", "marginTop", "marginRight", "marginBottom",
      "marginLeft"]],
    ["Surface", ["backgroundColor", "opacity"]],
    ["Border", ["border", "borderTopWidth", "borderRightWidth",
      "borderBottomWidth", "borderLeftWidth", "borderStyle", "borderColor",
      "borderRadius"]]
  ];

  function ensureStyles() {
    if (document.getElementById("mxtl-style")) return;
    const style = document.createElement("style");
    style.id = "mxtl-style";
    style.textContent = `
      .mxtl-wrap { display: flex; flex-direction: column; height: 100%; }
      .mxtl-tabs { display: flex; gap: 2px; padding: 4px 6px; flex: 0 0 auto;
        border-bottom: 1px solid var(--border, #333); }
      .mxtl-tab { padding: 2px 8px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--border, #333); background: none;
        color: var(--text-2, #aaa); }
      .mxtl-tab.mxtl-on { background: var(--surface-2, #1c1c1c);
        color: var(--text-1, #ddd); box-shadow: inset 0 -2px 0 #2a6df4; }
      .mxtl-spacer { flex: 1 1 auto; }
      .mxtl-who { font-size: 10px; color: var(--text-3, #888); align-self: center; }
      .mxtl-body { flex: 1 1 auto; min-height: 0; overflow-y: auto;
        font: 12px system-ui, sans-serif; color: var(--text-1, #ddd); }
      .cc-panel-empty { padding: 8px; color: var(--text-3, #888); }
      .cc-panel-tool { padding: 8px; border-bottom: 1px solid var(--border, #333); }
      .cc-panel-tool-title { font-weight: bold; margin-bottom: 6px; }
      .cc-panel-label { display: block; margin: 4px 0; }
      .cc-panel-label > span { display: block; font-size: 10px;
        color: var(--text-3, #888); }
      .cc-panel-field { width: 100%; box-sizing: border-box; margin-top: 2px;
        background: var(--surface-2, #2f2f2f); color: var(--text-1, #e8e8e8);
        border: 1px solid var(--border, #3a3a3a); font: inherit; }
      .cc-panel-notes-field { min-height: 60px; }
      .cc-panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .cc-panel-swatch-row { display: flex; align-items: center; gap: 4px; margin: 4px 0; }
      .cc-panel-swatch-label { font-size: 10px; color: var(--text-3, #888);
        min-width: 4em; }
      .cc-panel-swatch { width: 16px; height: 16px; border: 1px solid #555; padding: 0; }
      .cc-panel-swatch-active { outline: 2px solid #2a6df4; }
      .cc-panel-palette-editor { display: flex; flex-wrap: wrap; gap: 4px;
        align-items: center; margin-top: 6px; }
      .cc-panel-picker { width: 24px; height: 20px; padding: 0; border: 0; }
      .cc-panel-link-list { display: flex; flex-direction: column; gap: 2px;
        max-height: 160px; overflow-y: auto; }
      .cc-panel-link-page, .cc-panel-link-widget, .cc-panel-link-clear,
      .cc-panel-add-palette, .cc-panel-toggle {
        background: none; border: 1px solid var(--border, #3a3a3a);
        color: var(--text-2, #aaa); font: inherit; cursor: pointer; text-align: left; }
      .cc-panel-link-page { font-weight: bold; }
      .cc-panel-link-widget { padding-left: 12px; }
      .cc-panel-link-active { border-color: #2a6df4; color: var(--text-1, #ddd); }
      .cc-panel-order-head { display: flex; justify-content: space-between;
        align-items: center; padding: 6px 8px; }
      .cc-panel-row { display: flex; gap: 6px; align-items: baseline;
        padding: 2px 8px; cursor: pointer; }
      .cc-panel-row:hover { background: var(--surface-2, #2f2f2f); }
      .cc-panel-row-active { background: #2a3a5c; }
      .cc-panel-row-id { color: var(--text-3, #888); font-size: 10px; }
      .cc-panel-row-name { flex: 1 1 auto; }
      .cc-panel-row-content { color: var(--text-3, #888); font-size: 10px; }
      .cc-panel-row-btn { background: none; border: 0; cursor: pointer;
        color: var(--text-3, #888); font-size: 11px; padding: 0 2px; }
      .cc-panel-row-btn.cc-panel-row-btn-on { color: #2a6df4; }
      .cc-nav-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 6px 8px; }
      .cc-nav-tab { padding: 2px 6px; font-size: 11px; cursor: pointer;
        border: 1px solid var(--border, #3a3a3a); background: none;
        color: var(--text-2, #aaa); }
      .cc-nav-tab-on { background: var(--surface-2, #1c1c1c); color: var(--text-1, #ddd); }
      .cc-nav-title { font-size: 12px; margin: 6px 8px 0; }
      .cc-nav-cards { display: flex; flex-direction: column; gap: 3px; padding: 0 8px 8px; }
      .cc-nav-card { border: 1px solid var(--border, #3a3a3a); padding: 4px 6px;
        cursor: grab; display: flex; justify-content: space-between; gap: 6px; }
      .cc-nav-card-type { color: var(--text-3, #888); font-size: 10px; }
      .cc-nav-field { padding: 4px 8px; }
      .cc-nav-pages { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 8px; }
    `;
    document.head.appendChild(style);
  }

  // ---------- dom helpers ----------

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

  function labelWrap(label, field) {
    const wrap = el("label", "cc-panel-label");
    wrap.appendChild(el("span", null, label));
    wrap.appendChild(field);
    return wrap;
  }

  function selectField(label, options, current, onChange) {
    const s = el("select", "cc-panel-field");
    for (const o of options) {
      const opt = el("option", null, o);
      opt.value = o;
      if (o === current) opt.selected = true;
      s.appendChild(opt);
    }
    s.addEventListener("change", () => onChange(s.value));
    return labelWrap(label, s);
  }

  // function: debounce typing. One write on a 500ms pause or on blur.
  function bindTyping(tl, node, key, writeFn) {
    node.addEventListener("input", () => {
      clearTimeout(tl.timers[key]);
      tl.timers[key] = setTimeout(() => {
        delete tl.timers[key];
        writeFn(node.value);
      }, 500);
    });
    node.addEventListener("blur", () => {
      if (!tl.timers[key]) return;
      clearTimeout(tl.timers[key]);
      delete tl.timers[key];
      writeFn(node.value);
    });
  }

  function textField(tl, label, current, key, onWrite) {
    const i = el("input", "cc-panel-field");
    i.type = "text";
    i.value = current === undefined || current === null ? "" : String(current);
    bindTyping(tl, i, key, onWrite);
    return labelWrap(label, i);
  }

  function numberField(tl, label, current, key, onWrite) {
    const n = el("input", "cc-panel-field");
    n.type = "number";
    n.value = current;
    bindTyping(tl, n, key, (v) => onWrite(Number(v)));
    return labelWrap(label, n);
  }

  function markDirty(tl) {
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(tl.frame);
  }

  // ---------- which canvas ----------

  // function: canvas instance ids on this surface sharing the frame's target.
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
  function boundFrame(tl) {
    const ids = canvasIdsFor(tl.frame);
    if (tl.canvasOpt !== "focused") {
      return ids.indexOf(tl.canvasOpt) >= 0 ? canvasFrame(tl.canvasOpt) : null;
    }
    if (tl.focusedInst && ids.indexOf(tl.focusedInst) >= 0) {
      const f = canvasFrame(tl.focusedInst);
      if (f) return f;
    }
    for (const id of ids) {
      const f = canvasFrame(id);
      if (f) return f;
    }
    return null;
  }

  // function: the target option of a canvas instance on this surface.
  function targetOfInst(id) {
    const g = MX.grid;
    if (!id || !g || !Array.isArray(g.instances)) return null;
    for (const inst of g.instances) {
      if (inst.id === id) return (inst.options && inst.options.target) || "";
    }
    return null;
  }

  // function: follow mode adopts any focused canvas and takes its target.
  function onAnyFocus(tl, payload) {
    if (tl.canvasOpt !== "focused" || !payload || !payload.inst) return;
    tl.focusedInst = payload.inst;
    const want = payload.target || "";
    if (want !== (tl.frame.options.target || "")) {
      unbindDrop(tl);
      tl.frame.setOption("target", want);
      return;
    }
    render(tl);
  }

  function api(tl) {
    const f = boundFrame(tl);
    return f ? f._canvas : null;
  }

  function defOf(tl, type) {
    if (!tl.core) return null;
    try { return tl.core.kit.get(type); } catch (e) { return null; }
  }

  // function: one resolve per state object, for palettes.
  function resolveFor(tl, state) {
    if (!tl.core || !state) return null;
    if (tl.resolveOf !== state) {
      tl.resolve = tl.core.makeResolve(tl.core.kit, state);
      tl.resolveOf = state;
    }
    return tl.resolve;
  }

  // ---------- selection and writers ----------

  function findWidget(state, id) {
    const pages = state.get().pages;
    for (const p of pages) {
      for (const w of p.widgets) if (w.id === id) return { widget: w, page: p };
    }
    return null;
  }

  function selectedWidgets(tl, a) {
    if (!a || !a.state) return [];
    const out = [];
    for (const id of a.selected()) {
      const found = findWidget(a.state, id);
      if (found) out.push(found.widget);
    }
    return out;
  }

  // function: tools shared by every selected widget's kit entry.
  function sharedTools(tl, widgets) {
    if (!widgets.length) return [];
    const lists = widgets.map((w) => {
      const d = defOf(tl, w.type);
      return d ? d.tools : [];
    });
    return lists[0].filter((t) => lists.every((list) => list.indexOf(t) >= 0));
  }

  function idsOf(widgets) { return widgets.map((w) => w.id); }

  function writeProp(state, ids, key, value) {
    state.batch(() => { for (const id of ids) state.setProp(id, key, value); });
  }
  function writeNotes(state, ids, value) {
    state.batch(() => { for (const id of ids) state.setNotes(id, value); });
  }
  function writeBox(state, ids, key, value) {
    const patch = {};
    patch[key] = value;
    state.batch(() => { for (const id of ids) state.moveWidget(id, patch); });
  }
  function writeContent(state, widgets, mode, value) {
    state.batch(() => {
      for (const w of widgets) {
        const m = mode !== undefined ? mode : w.content.mode;
        const v = value !== undefined ? value : w.content.value;
        state.setContent(w.id, m, v);
      }
    });
  }
  function writeLink(state, ids, target) {
    state.batch(() => { for (const id of ids) state.setLink(id, target); });
  }

  // ---------- tool builders ----------

  function buildTextTool(tl, widgets, state) {
    const box = el("div", "cc-panel-tool");
    box.appendChild(el("div", "cc-panel-tool-title", "Text"));
    const first = widgets[0];
    const ids = idsOf(widgets);
    const kit = tl.core.kit;

    const ta = el("textarea", "cc-panel-field");
    ta.value = first.content.value;
    bindTyping(tl, ta, "content", (v) => writeContent(state, widgets, undefined, v));
    box.appendChild(labelWrap("Content", ta));

    box.appendChild(selectField("Mode", ["literal", "instruction"], first.content.mode,
      (v) => writeContent(state, widgets, v, undefined)));

    const allHaveTag = widgets.every((w) => {
      const d = defOf(tl, w.type);
      return !!(d && d.defaults && d.defaults.tag !== undefined);
    });
    if (allHaveTag) {
      box.appendChild(selectField("Tag", TAGS, first.props.tag,
        (v) => writeProp(state, ids, "tag", v)));
    }

    box.appendChild(selectField("Size", Object.keys(kit.sizes), first.props.size,
      (v) => writeProp(state, ids, "size", v)));
    box.appendChild(selectField("Weight", ["normal", "bold"], first.props.weight,
      (v) => writeProp(state, ids, "weight", v)));
    box.appendChild(selectField("Align", ["left", "center", "right"], first.props.align,
      (v) => writeProp(state, ids, "align", v)));

    const fontKeys = Object.keys(kit.fonts);
    const isKitFont = fontKeys.indexOf(first.props.font) >= 0;
    const fontSel = el("select", "cc-panel-field");
    for (const f of fontKeys.concat(["custom"])) {
      const o = el("option", null, f);
      o.value = f;
      if ((isKitFont && first.props.font === f) || (!isKitFont && f === "custom")) o.selected = true;
      fontSel.appendChild(o);
    }
    const fontCustom = el("input", "cc-panel-field");
    fontCustom.type = "text";
    fontCustom.placeholder = "Google Fonts family name";
    fontCustom.value = isKitFont ? "" : first.props.font;
    fontCustom.hidden = isKitFont;
    fontSel.addEventListener("change", () => {
      if (fontSel.value === "custom") { fontCustom.hidden = false; return; }
      fontCustom.hidden = true;
      writeProp(state, ids, "font", fontSel.value);
    });
    bindTyping(tl, fontCustom, "font", (v) => writeProp(state, ids, "font", v));
    box.appendChild(labelWrap("Font", fontSel));
    box.appendChild(fontCustom);

    if (widgets.every((w) => w.type === "text.list")) {
      box.appendChild(selectField("List style", ["bullet", "number"], first.props.style,
        (v) => writeProp(state, ids, "style", v)));
    }
    return box;
  }

  function buildBoxTool(tl, widgets, state) {
    const box = el("div", "cc-panel-tool");
    box.appendChild(el("div", "cc-panel-tool-title", "Box"));
    const first = widgets[0];
    const ids = idsOf(widgets);
    const grid = el("div", "cc-panel-grid");
    grid.appendChild(numberField(tl, "X", first.box.x, "x",
      (v) => writeBox(state, ids, "x", v)));
    grid.appendChild(numberField(tl, "Y", first.box.y, "y",
      (v) => writeBox(state, ids, "y", v)));
    grid.appendChild(numberField(tl, "Width", first.box.w, "w",
      (v) => writeBox(state, ids, "w", v)));
    grid.appendChild(numberField(tl, "Height", first.box.h, "h",
      (v) => writeBox(state, ids, "h", v)));
    grid.appendChild(numberField(tl, "Padding", first.props.padding, "padding",
      (v) => writeProp(state, ids, "padding", v)));
    grid.appendChild(numberField(tl, "Margin", first.props.margin, "margin",
      (v) => writeProp(state, ids, "margin", v)));
    grid.appendChild(numberField(tl, "Corner", first.props.corner, "corner",
      (v) => writeProp(state, ids, "corner", v)));
    grid.appendChild(selectField("Shadow", ["none", "sm", "md", "lg"], first.props.shadow,
      (v) => writeProp(state, ids, "shadow", v)));
    box.appendChild(grid);
    return box;
  }

  function buildColorTool(tl, widgets, state) {
    const box = el("div", "cc-panel-tool");
    box.appendChild(el("div", "cc-panel-tool-title", "Color"));
    const first = widgets[0];
    const ids = idsOf(widgets);
    const snap = state.get();
    const resolve = resolveFor(tl, state);
    const palette = resolve ? resolve.palette(snap.settings) : {};

    for (const propKey of ["fill", "text", "border"]) {
      const row = el("div", "cc-panel-swatch-row");
      row.appendChild(el("span", "cc-panel-swatch-label", propKey));
      for (const name of Object.keys(palette)) {
        const sw = el("button", "cc-panel-swatch");
        sw.type = "button";
        sw.style.background = palette[name];
        sw.title = name;
        if (first.props[propKey] === name) sw.classList.add("cc-panel-swatch-active");
        sw.addEventListener("click", () => writeProp(state, ids, propKey, name));
        row.appendChild(sw);
      }
      box.appendChild(row);
    }

    const editor = el("div", "cc-panel-palette-editor");
    const nameInput = el("input", "cc-panel-field");
    nameInput.type = "text";
    nameInput.placeholder = "Palette name";
    editor.appendChild(nameInput);
    const keys = Object.keys(tl.core.kit.palettes.default);
    const pickers = {};
    for (const k of keys) {
      const picker = el("input", "cc-panel-picker");
      picker.type = "color";
      picker.title = k;
      pickers[k] = picker;
      editor.appendChild(picker);
    }
    editor.appendChild(mkBtn("Add palette", "cc-panel-add-palette", () => {
      if (!nameInput.value) return;
      const entry = {};
      for (const k of keys) entry[k] = pickers[k].value;
      const merged = JSON.parse(JSON.stringify(state.get().settings.palettes));
      merged[nameInput.value] = entry;
      state.setSetting("palettes", merged);
    }));
    box.appendChild(editor);
    return box;
  }

  function buildLinkTool(tl, widgets, state) {
    const box = el("div", "cc-panel-tool");
    box.appendChild(el("div", "cc-panel-tool-title", "Link"));
    const first = widgets[0];
    const ids = idsOf(widgets);
    const current = first.link ? first.link.target : null;
    const list = el("div", "cc-panel-link-list");
    for (const page of state.get().pages) {
      const pageBtn = mkBtn(page.name, "cc-panel-link-page",
        () => writeLink(state, ids, page.id));
      if (current === page.id) pageBtn.classList.add("cc-panel-link-active");
      list.appendChild(pageBtn);
      for (const w of page.widgets) {
        const d = defOf(tl, w.type);
        const wBtn = mkBtn((d ? d.label : w.type) + " — " + w.id, "cc-panel-link-widget",
          () => writeLink(state, ids, w.id));
        if (current === w.id) wBtn.classList.add("cc-panel-link-active");
        list.appendChild(wBtn);
      }
    }
    box.appendChild(list);
    box.appendChild(mkBtn("Clear", "cc-panel-link-clear",
      () => writeLink(state, ids, null)));
    return box;
  }

  // Notes tool: inline textarea, every selected widget.
  function buildNotesTool(tl, widgets, state) {
    const box = el("div", "cc-panel-tool");
    box.appendChild(el("div", "cc-panel-tool-title", "Notes"));
    const ta = el("textarea", "cc-panel-field cc-panel-notes-field");
    ta.value = widgets[0].notes;
    bindTyping(tl, ta, "notes", (v) => writeNotes(state, idsOf(widgets), v));
    box.appendChild(ta);
    return box;
  }

  // function: builder table for this instance. The kit queue drains on top.
  function toolTable(tl) {
    const t = {
      text: (w, s) => buildTextTool(tl, w, s),
      box: (w, s) => buildBoxTool(tl, w, s),
      color: (w, s) => buildColorTool(tl, w, s),
      link: (w, s) => buildLinkTool(tl, w, s),
      notes: (w, s) => buildNotesTool(tl, w, s)
    };
    for (const q of tl.core.kit.tools) t[q.name] = q.builder;
    return t;
  }

  // ---------- sections ----------

  function empty(host, text) {
    host.appendChild(el("div", "cc-panel-empty", text));
  }

  function renderTools(tl, host, a) {
    if (!a.state) { renderInspector(tl, host, a); return; }
    const widgets = selectedWidgets(tl, a);
    if (!widgets.length) { empty(host, "Nothing selected"); return; }
    for (const name of sharedTools(tl, widgets)) {
      const build = tl.tools[name];
      if (build) host.appendChild(build(widgets, a.state));
    }
  }

  function firstWords(w) {
    if (w.content.mode !== "literal") return "(instruction)";
    const words = (w.content.value || "").trim().split(/\s+/).slice(0, 4).join(" ");
    return words || "(empty)";
  }

  function renderLayers(tl, host, a) {
    if (!a.state) { renderFileLayers(tl, host, a); return; }
    const state = a.state;
    const snap = state.get();
    let page = null;
    for (const p of snap.pages) if (p.id === snap.page) page = p;
    const widgets = page ? page.widgets : [];
    const chosen = a.selected();

    const head = el("div", "cc-panel-order-head");
    head.appendChild(el("span", "cc-panel-tool-title", "Layers"));
    head.appendChild(mkBtn(tl.showContent ? "Show: content" : "Show: type",
      "cc-panel-toggle", () => { tl.showContent = !tl.showContent; render(tl); }));
    host.appendChild(head);

    const byParent = {};
    for (const w of widgets) {
      const key = w.parent || "__root__";
      if (!byParent[key]) byParent[key] = [];
      byParent[key].push(w);
    }

    function indexOfWidget(id) {
      for (let i = 0; i < widgets.length; i++) if (widgets[i].id === id) return i;
      return widgets.length;
    }

    function renderRow(w, depth) {
      const row = el("div", "cc-panel-row");
      row.draggable = true;
      row.dataset.id = w.id;
      row.style.paddingLeft = (8 + depth * 12) + "px";
      row.appendChild(el("div", "cc-panel-row-id", w.id));
      const d = defOf(tl, w.type);
      row.appendChild(el("div", "cc-panel-row-name", d ? d.label : w.type));
      if (tl.showContent) row.appendChild(el("div", "cc-panel-row-content", firstWords(w)));
      if (chosen.indexOf(w.id) >= 0) row.classList.add("cc-panel-row-active");

      const eye = mkBtn(w.hidden ? "◌" : "◉", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        state.setHidden(w.id, !w.hidden);
      });
      eye.title = w.hidden ? "hidden" : "visible";
      row.appendChild(eye);

      const lock = mkBtn(w.locked ? "🔒" : "🔓", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        state.setLocked(w.id, !w.locked);
      });
      lock.title = w.locked ? "locked" : "unlocked";
      if (w.locked) lock.classList.add("cc-panel-row-btn-on");
      row.appendChild(lock);

      row.addEventListener("click", () => {
        if (tl.mirrors) tl.mirrors.select.emit({ ids: [w.id] });
        render(tl);
      });
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", w.id);
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === w.id) return;
        const rect = row.getBoundingClientRect();
        const offset = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
        if (offset < 0.25) state.reorder(draggedId, indexOfWidget(w.id));
        else if (offset > 0.75) state.reorder(draggedId, indexOfWidget(w.id) + 1);
        else state.setParent(draggedId, w.id);
      });

      host.appendChild(row);
      for (const child of (byParent[w.id] || [])) renderRow(child, depth + 1);
    }

    for (const w of (byParent.__root__ || [])) renderRow(w, 0);
    if (!widgets.length) empty(host, "This page is empty.");
  }

  // ---------- file mode layers ----------

  const FILE_LAYER_SKIP_TAGS = ["script", "style", "template", "link", "meta"];

  // function: chrome or skip-tag node, dropped from the file layers tree.
  function isFileLayerSkip(tl, node) {
    const sel = tl.core.patch.HOST_NODE_SELECTOR;
    if (node.matches && node.matches(sel)) return true;
    if (node.matches && node.matches("[data-od-edit-guides-layer]")) return true;
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    return FILE_LAYER_SKIP_TAGS.indexOf(tag) >= 0;
  }

  // function: element children shown in the file layers tree.
  function fileLayerChildren(tl, node) {
    const out = [];
    for (const child of Array.prototype.slice.call(node.children || [])) {
      if (!isFileLayerSkip(tl, child)) out.push(child);
    }
    return out;
  }

  function fileRowLabel(node) {
    const tag = node.tagName ? node.tagName.toLowerCase() : "?";
    if (node.id) return tag + "#" + node.id;
    if (node.classList && node.classList.length) return tag + "." + node.classList[0];
    return tag;
  }

  // function: first four words of an element's own text nodes.
  function fileOwnWords(node) {
    let text = "";
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
    }
    return text.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  }

  // function: replace or toggle the file-mode selection, then emit it.
  function fileSelect(tl, a, id, additive) {
    const cur = a.selected();
    const at = cur.indexOf(id);
    const next = !additive ? [id]
      : (at >= 0 ? cur.slice(0, at).concat(cur.slice(at + 1)) : cur.concat([id]));
    tl.mirrors.select.emit({ ids: next });
    // state: the canvas paints a sibling's selection without re-emitting.
    render(tl);
  }

  // function: an element's parent id for a.move; body maps to "__body__".
  // function: an element's id, the canvas's stableId fallback when unset.
  function fileNodeId(node) {
    return MX.canvasPatch().stableId(node);
  }

  function fileParentId(node) {
    const parent = node.parentElement;
    if (!parent) return "__body__";
    if (parent.tagName && parent.tagName.toLowerCase() === "body") return "__body__";
    return fileNodeId(parent);
  }

  // function: an element's non-host-node children, matching patch.js's
  // childrenOf. Feeds both drag index and drop-as-last-child count.
  function fileNonHostChildren(tl, node) {
    const sel = tl.core.patch.HOST_NODE_SELECTOR;
    const out = [];
    for (const child of Array.prototype.slice.call(node.children || [])) {
      if (!(child.matches && child.matches(sel))) out.push(child);
    }
    return out;
  }

  function fileChildIndex(tl, node) {
    const parent = node.parentElement;
    if (!parent) return 0;
    return fileNonHostChildren(tl, parent).indexOf(node);
  }

  function fileChildCount(tl, node) {
    return fileNonHostChildren(tl, node).length;
  }

  function renderFileLayers(tl, host, a) {
    const idoc = a.doc ? a.doc() : null;
    if (!idoc || !idoc.body) { empty(host, "Canvas not loaded."); return; }
    const body = idoc.body;
    const chosen = a.selected();

    const head = el("div", "cc-panel-order-head");
    head.appendChild(el("span", "cc-panel-tool-title", "Layers"));
    const groupBtn = mkBtn("Group", "cc-panel-toggle", () => a.group(a.selected()));
    const ungroupBtn = mkBtn("Ungroup", "cc-panel-toggle", () => a.ungroup(a.selected()[0]));
    groupBtn.disabled = !chosen.length;
    ungroupBtn.disabled = !chosen.length;
    head.appendChild(groupBtn);
    head.appendChild(ungroupBtn);
    host.appendChild(head);

    function renderRow(node, depth) {
      const id = fileNodeId(node);
      const row = el("div", "cc-panel-row");
      row.draggable = true;
      row.dataset.id = id || "";
      row.style.paddingLeft = (8 + depth * 12) + "px";
      row.appendChild(el("div", "cc-panel-row-name", fileRowLabel(node)));
      const words = fileOwnWords(node);
      if (words) row.appendChild(el("div", "cc-panel-row-content", words));
      if (node.hasAttribute("data-od-group")) {
        row.appendChild(el("div", "cc-panel-row-content", "group"));
      }
      if (id && chosen.indexOf(id) >= 0) row.classList.add("cc-panel-row-active");

      const hidden = node.style.display === "none";
      const eye = mkBtn(hidden ? "◌" : "◉", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        a.patchSource({ id: id, kind: "set-style", styles: { display: hidden ? "" : "none" } });
      });
      eye.title = hidden ? "hidden" : "visible";
      row.appendChild(eye);

      row.addEventListener("click", (e) => {
        if (id) fileSelect(tl, a, id, e.shiftKey);
      });
      row.addEventListener("dragstart", (e) => {
        if (id) e.dataTransfer.setData("text/plain", id);
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === id) return;
        const rect = row.getBoundingClientRect();
        const offset = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
        const parentId = fileParentId(node);
        // state: index counted with the dragged element out of the list.
        const sibs = node.parentElement
          ? fileNonHostChildren(tl, node.parentElement).filter((n) => fileNodeId(n) !== draggedId)
          : [];
        const at = Math.max(0, sibs.indexOf(node));
        if (offset < 0.25) a.move(draggedId, parentId, at);
        else if (offset > 0.75) a.move(draggedId, parentId, at + 1);
        else a.move(draggedId, id, fileChildCount(tl, node));
      });

      host.appendChild(row);
      for (const child of fileLayerChildren(tl, node)) renderRow(child, depth + 1);
    }

    const top = fileLayerChildren(tl, body);
    if (!top.length) { empty(host, "This page is empty."); return; }
    for (const node of top) renderRow(node, 0);
  }

  function renderLibrary(tl, host) {
    const groups = tl.core.kit.byTaxonomy();
    const names = Object.keys(groups);
    if (!names.length) { empty(host, "The kit is empty."); return; }
    if (names.indexOf(tl.libTab) < 0) tl.libTab = names[0];

    host.appendChild(el("h2", "cc-nav-title", "Widget library"));
    const tabs = el("div", "cc-nav-tabs");
    for (const n of names) {
      tabs.appendChild(mkBtn(n, "cc-nav-tab" + (n === tl.libTab ? " cc-nav-tab-on" : ""),
        () => { tl.libTab = n; render(tl); }));
    }
    host.appendChild(tabs);

    const cards = el("div", "cc-nav-cards");
    for (const w of groups[tl.libTab]) {
      const c = el("div", "cc-nav-card");
      c.appendChild(document.createTextNode(w.label || w.type));
      c.appendChild(el("span", "cc-nav-card-type", w.type));
      c.draggable = true;
      c.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", w.type);
        e.dataTransfer.effectAllowed = "copy";
      });
      cards.appendChild(c);
    }
    host.appendChild(cards);
  }

  function renderPageSection(tl, host, a) {
    const bf = boundFrame(tl);
    if (!a.state || !bf) { empty(host, "Page options need a doc canvas."); return; }
    const state = a.state;
    const snap = state.get();
    const s = snap.settings;

    const box = el("div", "cc-panel-tool");
    box.appendChild(el("div", "cc-panel-tool-title", "Page options"));
    box.appendChild(numberField(tl, "Grid size", s.grid, "grid",
      (v) => state.setSetting("grid", v)));
    box.appendChild(selectField("Grid style", GRID_STYLES, s.gridStyle,
      (v) => state.setSetting("gridStyle", v)));
    const width = s.width || { mode: "fixed", px: 1280 };
    box.appendChild(selectField("Width mode", WIDTH_MODES, width.mode,
      (v) => state.setSetting("width", { mode: v, px: width.px })));
    box.appendChild(numberField(tl, "Fixed px", width.px, "widthpx",
      (v) => state.setSetting("width", { mode: width.mode, px: v })));

    const names = Object.keys(tl.core.kit.palettes);
    for (const n of Object.keys(s.palettes || {})) if (names.indexOf(n) < 0) names.push(n);
    box.appendChild(selectField("Palette", names, s.palette,
      (v) => state.setSetting("palette", v)));
    host.appendChild(box);

    const pages = el("div", "cc-panel-tool");
    pages.appendChild(el("div", "cc-panel-tool-title", "Pages"));
    const list = el("div", "cc-nav-pages");
    for (const p of snap.pages) {
      const on = p.id === snap.page;
      const t = mkBtn(p.name, "cc-nav-tab" + (on ? " cc-nav-tab-on" : ""),
        () => bf.setOption("page", p.id));
      t.addEventListener("dblclick", () => {
        const next = window.prompt("Page name", p.name);
        if (next) state.renamePage(p.id, next);
      });
      list.appendChild(t);
    }
    list.appendChild(mkBtn("+ Page", "cc-nav-tab", () => {
      const id = state.addPage("Page " + (state.get().pages.length + 1));
      if (id) bf.setOption("page", id);
    }));
    pages.appendChild(list);
    host.appendChild(pages);
  }

  // ---------- file mode inspector ----------

  function isTextLeaf(node) {
    if (!node.children || node.children.length) return false;
    return !!(node.textContent || "").trim();
  }

  function inferKind(node) {
    const explicit = node.getAttribute("data-od-edit");
    if (explicit) return explicit;
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    if (tag === "a") return "link";
    if (tag === "img") return "image";
    if (isTextLeaf(node)) return "text";
    return "container";
  }

  // function: the selected element as it stands in the held source.
  function sourceEl(tl, a, id) {
    const doc = tl.core.patch.parse(a.source());
    if (!doc) return null;
    return tl.core.patch.find(doc, id);
  }

  // function: attribute write. The source element is cloned, the bridge's
  // own attributes stripped, and the clone replaces it.
  function writeAttr(tl, a, id, name, value) {
    const node = sourceEl(tl, a, id);
    if (!node) return;
    const clone = node.cloneNode(true);
    clone.setAttribute(name, value);
    for (const attr of Array.prototype.slice.call(clone.attributes)) {
      if (attr.name.indexOf("data-od-") === 0) clone.removeAttribute(attr.name);
    }
    a.patchSource({ id: id, kind: "replace-outer-html", html: clone.outerHTML });
  }

  function renderInspector(tl, host, a) {
    const ids = a.selected();
    if (!ids.length) { empty(host, "Nothing selected"); return; }
    const idoc = a.doc ? a.doc() : null;
    if (!idoc) { empty(host, "Canvas not loaded."); return; }
    const id = ids[0];
    const node = tl.core.patch.find(idoc, id);
    if (!node) { empty(host, "No element for " + id); return; }

    const kind = inferKind(node);
    const head = el("div", "cc-panel-tool");
    head.appendChild(el("div", "cc-panel-tool-title",
      (node.tagName || "element").toLowerCase() + " — " + kind));
    head.appendChild(el("div", "cc-panel-row-id", id));

    if (kind === "text" || kind === "link" || kind === "container") {
      const ta = el("textarea", "cc-panel-field");
      ta.value = (node.textContent || "").trim();
      bindTyping(tl, ta, "fm-text", (v) => {
        a.patchSource({ id: id, kind: "set-text", value: v });
      });
      head.appendChild(labelWrap("Text", ta));
    }
    if (kind === "link") {
      head.appendChild(textField(tl, "Href", node.getAttribute("href") || "", "fm-href",
        (v) => writeAttr(tl, a, id, "href", v)));
    }
    if (kind === "image") {
      head.appendChild(textField(tl, "Src", node.getAttribute("src") || "", "fm-src",
        (v) => writeAttr(tl, a, id, "src", v)));
      head.appendChild(textField(tl, "Alt", node.getAttribute("alt") || "", "fm-alt",
        (v) => writeAttr(tl, a, id, "alt", v)));
    }
    host.appendChild(head);

    const computed = idoc.defaultView
      ? idoc.defaultView.getComputedStyle(node) : null;
    for (const group of STYLE_GROUPS) {
      const box = el("div", "cc-panel-tool");
      box.appendChild(el("div", "cc-panel-tool-title", group[0]));
      for (const prop of group[1]) {
        const current = node.style[prop] || (computed ? computed[prop] : "") || "";
        box.appendChild(textField(tl, prop, current, "fm-" + prop, (v) => {
          const styles = {};
          styles[prop] = v;
          a.patchSource({ id: id, kind: "set-style", styles: styles });
        }));
      }
      host.appendChild(box);
    }
  }

  // ---------- drop into the canvas iframe ----------

  function unbindDrop(tl) {
    if (!tl.drop) return;
    try {
      tl.drop.doc.removeEventListener("dragover", tl.drop.over);
      tl.drop.doc.removeEventListener("drop", tl.drop.drop);
    } catch (e) { /* the iframe document may be gone */ }
    tl.drop = null;
  }

  // function: HTML5 DnD crosses a same-origin iframe. The listener lives on
  // the bound canvas's iframe document and calls its place.
  function bindDrop(tl) {
    const a = api(tl);
    const idoc = (a && a.doc) ? a.doc() : null;
    if (!idoc) { unbindDrop(tl); return; }
    if (tl.drop && tl.drop.doc === idoc) return;
    unbindDrop(tl);
    const over = (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e) => {
      e.preventDefault();
      const type = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      if (!type) return;
      const cur = api(tl);
      if (!cur) return;
      cur.place(type, { x: e.clientX, y: e.clientY });
    };
    idoc.addEventListener("dragover", over);
    idoc.addEventListener("drop", drop);
    tl.drop = { doc: idoc, over: over, drop: drop };
  }

  // ---------- render ----------

  // function: file mode has no library or page; those tabs hide.
  function renderTabs(tl) {
    const a = api(tl);
    const fileMode = !!a && !a.state;
    for (const name of ["library", "page"]) {
      const b = tl.tabs[name];
      if (b) b.hidden = fileMode;
    }
    if (fileMode && (tl.section === "library" || tl.section === "page")) {
      tl.section = "tools";
    }
    for (const name of SECTIONS) {
      const b = tl.tabs[name];
      if (b) b.classList.toggle("mxtl-on", name === tl.section);
    }
    if (!tl.whoEl) return;
    const bf = boundFrame(tl);
    tl.whoEl.textContent = bf
      ? (tl.canvasOpt === "focused" ? "following " : "pinned ") + bf.id
      : "";
  }

  function render(tl, opts) {
    if (!tl.live || !tl.core || !tl.bodyEl) return;
    if (opts && opts.keepFocus && tl.bodyEl.contains(document.activeElement)) return;
    bindDrop(tl);
    renderTabs(tl);
    tl.bodyEl.textContent = "";
    const a = api(tl);
    if (!a) { empty(tl.bodyEl, "No canvas on this target."); return; }
    if (tl.section === "layers") renderLayers(tl, tl.bodyEl, a);
    else if (tl.section === "library") renderLibrary(tl, tl.bodyEl);
    else if (tl.section === "page") renderPageSection(tl, tl.bodyEl, a);
    else renderTools(tl, tl.bodyEl, a);
  }

  function focusNotes(tl) {
    const ta = tl.bodyEl ? tl.bodyEl.querySelector(".cc-panel-notes-field") : null;
    if (ta) ta.focus();
  }

  // ---------- module ----------

  const MOD = {
    defaults: { target: "", canvas: "focused", section: "tools", followTarget: "" },

    optionControls: {
      target: MX.canvasTargetControl(false),
      canvas: { kind: "select", values: (f) => ["focused"].concat(canvasIdsFor(f)) }
    },

    mount(frame) {
      ensureStyles();

      const tl = frame._toolsState = {
        frame: frame, live: true, core: null, tools: null,
        canvasOpt: frame.options.canvas || "focused",
        section: SECTIONS.indexOf(frame.options.section) >= 0 ? frame.options.section : "tools",
        focusedInst: "", libTab: "", showContent: false,
        timers: Object.create(null),
        mirrors: null, followMirror: null, offLayout: null, drop: null,
        resolve: null, resolveOf: null,
        tabs: {}, bodyEl: null, whoEl: null
      };

      // a canvas added or closed changes what this widget can bind to
      tl.offLayout = MX.bus.on("surface.layout", () => render(tl));

      const wrap = el("div", "mxtl-wrap");
      const tabs = el("div", "mxtl-tabs");
      for (const name of SECTIONS) {
        const b = mkBtn(SECTION_LABELS[name] || name, "mxtl-tab", () => {
          tl.section = name;
          markDirty(tl);
          render(tl);
        });
        tl.tabs[name] = b;
        tabs.appendChild(b);
      }
      tabs.appendChild(el("div", "mxtl-spacer"));
      tl.whoEl = el("span", "mxtl-who");
      tabs.appendChild(tl.whoEl);
      tabs.appendChild(mkBtn("⚙", "mxtl-tab", () => frame.toggleOptions()));
      wrap.appendChild(tabs);

      tl.bodyEl = el("div", "mxtl-body");
      wrap.appendChild(tl.bodyEl);
      frame.host.appendChild(wrap);

      MX.canvasCore().then((core) => {
        if (!tl.live) return;
        tl.core = core;
        tl.tools = toolTable(tl);
        tl.mirrors = core.mirrors(frame, {
          select: (payload) => {
            if (payload.notes) {
              tl.section = "tools";
              markDirty(tl);
              render(tl);
              focusNotes(tl);
              return;
            }
            render(tl);
          },
          focus: (payload) => {
            tl.focusedInst = payload.inst || "";
            if (tl.canvasOpt === "focused") render(tl);
          },
          doc: () => { unbindDrop(tl); render(tl); },
          change: () => render(tl, { keepFocus: true })
        });
        // empty followTarget option: hears canvas.focus on every target
        tl.followMirror = MX.mirror(frame, "canvas.focus",
          (payload) => onAnyFocus(tl, payload), "followTarget");
        render(tl);
      });
    },

    unmount(frame) {
      const tl = frame._toolsState;
      if (!tl) return;
      tl.live = false;
      for (const key of Object.keys(tl.timers)) clearTimeout(tl.timers[key]);
      unbindDrop(tl);
      if (tl.mirrors) tl.mirrors.off();
      if (tl.followMirror) tl.followMirror.off();
      if (tl.offLayout) tl.offLayout();
      frame._toolsState = null;
    },

    onOption(frame, key, value) {
      const tl = frame._toolsState;
      if (!tl) return;
      if (key === "target") { unbindDrop(tl); render(tl); return; }
      if (key === "canvas") {
        tl.canvasOpt = value || "focused";
        unbindDrop(tl);
        // a pinned instance brings its own target along
        const pinned = tl.canvasOpt === "focused" ? null : targetOfInst(tl.canvasOpt);
        if (pinned !== null && pinned !== (frame.options.target || "")) {
          frame.setOption("target", pinned);
          return;
        }
        render(tl);
        return;
      }
      if (key === "section") {
        if (SECTIONS.indexOf(value) < 0) return;
        tl.section = value;
        render(tl);
      }
    },

    getOptions(frame) {
      const tl = frame._toolsState;
      if (!tl) return JSON.parse(JSON.stringify(frame.options));
      return {
        target: frame.options.target || "",
        canvas: tl.canvasOpt,
        section: tl.section,
        followTarget: frame.options.followTarget || ""
      };
    }
  };

  MX.registerWidget("canvas_tools", MOD);
})();
