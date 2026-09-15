// tools widget — inspector, layer tree, snippets and page options for one canvas
//
// Binds to one canvas widget on this surface that shares its target: the
// instance named by the `canvas` option, else the last to emit canvas.focus.
// State: per instance on frame._toolsState. No module-level state.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const SECTIONS = ["tools", "layers", "snippets", "page"];
  // label: the tab's face. The section key stays the contract name.
  const SECTION_LABELS = { page: "pages" };

  // state: STYLE_CONTROL — control kind per file-mode style prop.
  const STYLE_COLOR_PROPS = ["color", "backgroundColor", "borderColor"];
  const STYLE_SELECT_PROPS = {
    display: ["block", "flex", "grid", "inline", "inline-block", "none"],
    textAlign: ["left", "center", "right", "justify"],
    fontWeight: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
    flexDirection: ["row", "column", "row-reverse", "column-reverse"],
    justifyContent: ["flex-start", "center", "flex-end", "space-between", "space-around"],
    alignItems: ["flex-start", "center", "flex-end", "stretch", "baseline"],
    borderStyle: ["none", "solid", "dashed", "dotted"]
  };
  const STYLE_NUMBER_UNIT_PROPS = [
    "fontSize", "lineHeight", "letterSpacing", "width", "height", "minHeight", "gap",
    "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderRadius", "opacity"
  ];
  const STYLE_UNITS = ["px", "%", "em", "rem", ""];

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

  // state: page block — --cc-* token per page() field, and its default.
  const PAGE_TOKEN = {
    w: "--cc-page-w", h: "--cc-page-h",
    marginTop: "--cc-margin-top", marginRight: "--cc-margin-right",
    marginBottom: "--cc-margin-bottom", marginLeft: "--cc-margin-left",
    columns: "--cc-columns", gutter: "--cc-gutter", bleed: "--cc-bleed", grid: "--cc-grid"
  };
  const PAGE_DEFAULTS = {
    w: 816, h: 1056, marginTop: 48, marginRight: 48, marginBottom: 48,
    marginLeft: 48, columns: 3, gutter: 16, bleed: 0, grid: 8
  };
  const PAGE_UNITLESS = { columns: true };
  const PAGE_SIZES = [
    ["Letter", 816, 1056], ["Tabloid", 1056, 1632],
    ["A4", 794, 1123], ["A3", 1123, 1587]
  ];

  // state: snippets — Layout set, dropped onto the active layer.
  const SNIPPET_IMG_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' "
    + "width='320' height='240'%3E%3Crect width='100%25' height='100%25' fill='%23ccc'/%3E%3C/svg%3E";
  const SNIPPETS_LAYOUT = [
    { name: "Text frame", tag: "div", w: 240, h: 120, extra: "",
      inner: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>" },
    { name: "Headline", tag: "h1", w: 240, h: 60, extra: "margin:0;",
      inner: "Headline" },
    { name: "Image frame", tag: "div", w: 320, h: 240, extra: "overflow:hidden;",
      inner: '<img src="' + SNIPPET_IMG_PLACEHOLDER + '" alt="" '
        + 'style="width:100%;height:100%;object-fit:cover;display:block">' },
    { name: "Pull quote", tag: "blockquote", w: 240, h: 120, extra: "margin:0;",
      inner: "Pull quote text goes here." },
    { name: "Caption", tag: "p", w: 240, h: 24, extra: "margin:0;",
      inner: "<small>Caption</small>" },
    { name: "Rectangle", tag: "div", w: 160, h: 100, extra: "border:1px solid #333;", inner: "" },
    { name: "Ellipse", tag: "div", w: 160, h: 100,
      extra: "border:1px solid #333;border-radius:50%;", inner: "" },
    { name: "Line", tag: "div", w: 160, h: 1, extra: "background:#333;", inner: "" },
    { name: "Group", tag: "div", w: 200, h: 200, extra: "outline:1px dashed #888;", inner: "" }
  ];
  // state: SVG shapes land here in job 9. Heading only, for now.
  const SNIPPET_SETS = [["Layout", SNIPPETS_LAYOUT], ["Shapes", []]];
  const SNIPPET_BY_NAME = Object.create(null);
  for (const def of SNIPPETS_LAYOUT) SNIPPET_BY_NAME[def.name] = def;

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
      .cc-panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .cc-panel-swatch-row { display: flex; align-items: center; gap: 4px; margin: 4px 0; }
      .cc-panel-picker { width: 24px; height: 20px; padding: 0; border: 0; }
      .cc-panel-toggle {
        background: none; border: 1px solid var(--border, #3a3a3a);
        color: var(--text-2, #aaa); font: inherit; cursor: pointer; text-align: left; }
      .cc-panel-order-head { display: flex; justify-content: space-between;
        align-items: center; padding: 6px 8px; position: sticky; top: 0;
        background: var(--surface-1, #1b1b1b); z-index: 1; }
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
      .cc-panel-row-btn:disabled { opacity: 0.3; cursor: default; }
      .cc-layer-row { border-top: 1px solid var(--border, #333); font-weight: bold; }
      .cc-layer-dot { color: #2a6df4; font-size: 10px; }
      .cc-layer-plugin { color: var(--text-3, #888); font-size: 10px;
        border: 1px solid var(--border, #3a3a3a); padding: 0 3px; }
      .cc-layer-hidden { opacity: 0.45; }
      .cc-layer-locked .cc-panel-row-name { font-style: italic; }
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

  // function: true for a css hex color the <input type=color> can hold.
  function isHexColor(v) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || "").trim());
  }

  // function: color picker + text field. Both write the same prop.
  function colorControl(tl, label, current, key, onWrite) {
    const wrap = el("label", "cc-panel-label");
    wrap.appendChild(el("span", null, label));
    const row = el("div", "cc-panel-swatch-row");
    const picker = el("input", "cc-panel-picker");
    picker.type = "color";
    picker.value = isHexColor(current) ? current : "#000000";
    const text = el("input", "cc-panel-field");
    text.type = "text";
    text.value = current === undefined || current === null ? "" : String(current);
    picker.addEventListener("change", () => {
      text.value = picker.value;
      onWrite(picker.value);
    });
    bindTyping(tl, text, key, onWrite);
    row.appendChild(picker);
    row.appendChild(text);
    wrap.appendChild(row);
    return wrap;
  }

  // function: current value first when it is not already in the list, so a
  // select never silently changes what it shows.
  function selectControlOptions(list, current) {
    const has = current !== undefined && current !== null && String(current) !== "";
    if (has && list.indexOf(String(current)) < 0) return [String(current)].concat(list);
    return list;
  }

  // function: leading number and trailing unit from a css value. null when
  // the value does not parse (a keyword like normal or auto).
  function parseNumUnit(value) {
    const s = value === undefined || value === null ? "" : String(value).trim();
    if (s === "" || s === "normal") return { num: "", unit: "" };
    const m = s.match(/^(-?\d*\.?\d+)(px|%|em|rem)?$/);
    if (!m) return null;
    return { num: m[1], unit: m[2] || "" };
  }

  // function: number field plus a small unit select. Both write num+unit.
  function numberUnitControl(tl, label, current, key, onWrite) {
    const parsed = parseNumUnit(current);
    const wrap = el("label", "cc-panel-label");
    wrap.appendChild(el("span", null, label));
    const row = el("div", "cc-panel-swatch-row");
    const num = el("input", "cc-panel-field");
    num.type = "number";
    num.value = parsed.num;
    const unitSel = el("select", "cc-panel-field");
    for (const u of STYLE_UNITS) {
      const o = el("option", null, u || "—");
      o.value = u;
      if (u === parsed.unit) o.selected = true;
      unitSel.appendChild(o);
    }
    const write = () => onWrite((num.value === "" ? "" : num.value) + unitSel.value);
    bindTyping(tl, num, key, write);
    unitSel.addEventListener("change", write);
    row.appendChild(num);
    row.appendChild(unitSel);
    wrap.appendChild(row);
    return wrap;
  }

  // function: the control for a file-mode style prop. Falls back to text.
  function styleControlFor(tl, prop, current, key, onWrite) {
    if (STYLE_COLOR_PROPS.indexOf(prop) >= 0) return colorControl(tl, prop, current, key, onWrite);
    if (STYLE_SELECT_PROPS[prop]) {
      return selectField(prop, selectControlOptions(STYLE_SELECT_PROPS[prop], current), current, onWrite);
    }
    if (prop === "lineHeight" || prop === "letterSpacing") {
      return numberUnitControl(tl, prop, current, key, onWrite);
    }
    if (STYLE_NUMBER_UNIT_PROPS.indexOf(prop) >= 0) {
      const parsed = parseNumUnit(current);
      if (parsed) return numberUnitControl(tl, prop, current, key, onWrite);
    }
    return textField(tl, prop, current, key, onWrite);
  }

  function markDirty(tl) {
    if (MX.grid && MX.grid.markDirty) MX.grid.markDirty(tl.frame);
  }

  // ---------- layers context menu ----------

  // function: close the row-level menu and its listeners, if any are live.
  function closeLayerMenu(tl) {
    if (tl.menu && tl.menu.parentNode) tl.menu.parentNode.removeChild(tl.menu);
    tl.menu = null;
    if (tl.menuOutside) { document.removeEventListener("mousedown", tl.menuOutside, true); tl.menuOutside = null; }
    if (tl.menuEsc) { document.removeEventListener("keydown", tl.menuEsc, true); tl.menuEsc = null; }
  }

  // function: a row menu at x,y. items are [label, fn] or [label, fn, off].
  // Inline rules match the canvas's context menu; the parent document has
  // no access to the canvas's own stylesheet.
  function openMenu(tl, items, x, y) {
    closeLayerMenu(tl);
    const menu = el("div", null);
    menu.style.cssText = "position: fixed; z-index: 2147483647; background: #ffffff; "
      + "border: 1px solid #d0d0d0; box-shadow: 0 2px 8px rgba(0,0,0,0.15); "
      + "font: 13px system-ui, sans-serif; padding: 4px 0;";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    for (const item of items) {
      const label = item[0], fn = item[1], off = !!item[2];
      const row = el("div", null, label);
      row.style.cssText = "padding: 4px 16px; cursor: default;"
        + (off ? " opacity: 0.4;" : "");
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (off) return;
        closeLayerMenu(tl);
        fn();
      });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    tl.menu = menu;
    tl.menuOutside = (e) => { if (!menu.contains(e.target)) closeLayerMenu(tl); };
    tl.menuEsc = (e) => { if (e.key === "Escape") closeLayerMenu(tl); };
    document.addEventListener("mousedown", tl.menuOutside, true);
    document.addEventListener("keydown", tl.menuEsc, true);
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
      tl.frame.setOption("target", want);
      return;
    }
    render(tl);
  }

  function api(tl) {
    const f = boundFrame(tl);
    return f ? f._canvas : null;
  }

  // ---------- page ----------

  // function: page block read from computed :root. Defaults, missing:true when absent.
  function readPage(a) {
    const doc = a && a.doc ? a.doc() : null;
    if (!doc || !doc.documentElement || !doc.defaultView) {
      return Object.assign({}, PAGE_DEFAULTS, { missing: true });
    }
    const computed = doc.defaultView.getComputedStyle(doc.documentElement);
    const out = {};
    let any = false;
    for (const key of Object.keys(PAGE_TOKEN)) {
      const raw = computed.getPropertyValue(PAGE_TOKEN[key]).trim();
      if (raw) { any = true; out[key] = parseFloat(raw) || 0; }
      else out[key] = PAGE_DEFAULTS[key];
    }
    out.missing = !any;
    return out;
  }

  // function: token value text. Columns is unitless, the rest are px.
  function pageTokenValue(key, value) {
    return PAGE_UNITLESS[key] ? String(value) : value + "px";
  }

  // function: preset name for a w,h pair. "Custom" when no preset matches.
  function pageSizeName(w, h) {
    for (const size of PAGE_SIZES) {
      if (size[1] === w && size[2] === h) return size[0];
    }
    return "Custom";
  }

  // function: page block missing. First write creates :root, body, layer
  // rules from scope 3.1, root token values from page with key overridden.
  function createPageBlock(a, page, key, value) {
    const vals = Object.assign({}, page);
    vals[key] = value;
    const decl = Object.keys(PAGE_TOKEN)
      .map((k) => PAGE_TOKEN[k] + ": " + pageTokenValue(k, vals[k]) + ";").join(" ");
    a.patchSource({ kind: "set-css-rule", block: "page", selector: ":root", declarations: decl });
    a.patchSource({
      kind: "set-css-rule", block: "page", selector: "body",
      declarations: "width: var(--cc-page-w); height: var(--cc-page-h); "
        + "position: relative; margin: 0 auto; overflow: hidden;"
    });
    a.patchSource({
      kind: "set-css-rule", block: "page", selector: "[data-cc-layer]",
      declarations: "position: absolute; inset: 0;"
    });
    a.patchSource({
      kind: "set-css-rule", block: "page", selector: "[data-cc-layer][data-cc-hidden]",
      declarations: "display: none;"
    });
  }

  // function: write one or more page fields. Creates the block on the
  // first write when missing (scope 3.1's four rules, all four written).
  function writePageFields(tl, a, page, changes) {
    let missing = page.missing;
    for (const change of changes) {
      const key = change[0], value = change[1];
      if (missing) {
        createPageBlock(a, page, key, value);
        missing = false;
      } else {
        a.patchSource({ kind: "set-css-token", token: PAGE_TOKEN[key], value: pageTokenValue(key, value) });
      }
    }
    markDirty(tl);
    render(tl);
  }

  // function: the pages tab — size, margins, columns, bleed, grid.
  function renderPage(tl, host, a) {
    const page = readPage(a);
    const sizeName = pageSizeName(page.w, page.h);
    const custom = sizeName === "Custom";

    const sizeBox = el("div", "cc-panel-tool");
    sizeBox.appendChild(el("div", "cc-panel-tool-title", "Size"));
    sizeBox.appendChild(selectField("Size",
      PAGE_SIZES.map((s) => s[0]).concat(["Custom"]), sizeName, (name) => {
        if (name === "Custom") { render(tl); return; }
        const preset = PAGE_SIZES.filter((s) => s[0] === name)[0];
        writePageFields(tl, a, page, [["w", preset[1]], ["h", preset[2]]]);
      }));
    const wField = numberField(tl, "W", page.w, "pg-w",
      (v) => writePageFields(tl, a, readPage(a), [["w", v]]));
    const hField = numberField(tl, "H", page.h, "pg-h",
      (v) => writePageFields(tl, a, readPage(a), [["h", v]]));
    if (!custom) {
      wField.querySelector("input").disabled = true;
      hField.querySelector("input").disabled = true;
    }
    sizeBox.appendChild(wField);
    sizeBox.appendChild(hField);
    host.appendChild(sizeBox);

    const marginBox = el("div", "cc-panel-tool");
    marginBox.appendChild(el("div", "cc-panel-tool-title", "Margins"));
    const linkRow = el("label", "cc-panel-label");
    const linkCb = el("input", null);
    linkCb.type = "checkbox";
    linkCb.checked = !!tl.pageMarginLink;
    linkCb.addEventListener("change", () => { tl.pageMarginLink = linkCb.checked; });
    linkRow.appendChild(linkCb);
    linkRow.appendChild(el("span", null, "link"));
    marginBox.appendChild(linkRow);

    const marginKeys = ["marginTop", "marginRight", "marginBottom", "marginLeft"];
    const marginLabels = { marginTop: "Top", marginRight: "Right", marginBottom: "Bottom", marginLeft: "Left" };
    for (const key of marginKeys) {
      marginBox.appendChild(numberField(tl, marginLabels[key], page[key], "pg-" + key, (v) => {
        const cur = readPage(a);
        if (tl.pageMarginLink) writePageFields(tl, a, cur, marginKeys.map((k) => [k, v]));
        else writePageFields(tl, a, cur, [[key, v]]);
      }));
    }
    host.appendChild(marginBox);

    const gridBox = el("div", "cc-panel-tool");
    gridBox.appendChild(el("div", "cc-panel-tool-title", "Columns"));
    gridBox.appendChild(numberField(tl, "Count", page.columns, "pg-columns",
      (v) => writePageFields(tl, a, readPage(a), [["columns", v]])));
    gridBox.appendChild(numberField(tl, "Gutter", page.gutter, "pg-gutter",
      (v) => writePageFields(tl, a, readPage(a), [["gutter", v]])));
    gridBox.appendChild(numberField(tl, "Bleed", page.bleed, "pg-bleed",
      (v) => writePageFields(tl, a, readPage(a), [["bleed", v]])));
    gridBox.appendChild(numberField(tl, "Grid", page.grid, "pg-grid",
      (v) => writePageFields(tl, a, readPage(a), [["grid", v]])));
    host.appendChild(gridBox);
  }

  // ---------- sections ----------

  function empty(host, text) {
    host.appendChild(el("div", "cc-panel-empty", text));
  }

  // ---------- snippets ----------

  // function: outer html for a drop, position/size baked in as inline style.
  function snippetOuterHtml(def, id, x, y) {
    const style = "position:absolute;left:" + Math.round(x) + "px;top:" + Math.round(y) + "px;"
      + "width:" + def.w + "px;height:" + def.h + "px;" + (def.extra || "");
    return "<" + def.tag + ' data-od-id="' + id + '" style="' + style + '">'
      + (def.inner || "") + "</" + def.tag + ">";
  }

  // function: the snippets drawer — one card per Layout snippet, a
  // second "Shapes" heading left empty for job 9's SVG shapes.
  function renderSnippets(tl, host, a) {
    for (const set of SNIPPET_SETS) {
      const name = set[0], defs = set[1];
      host.appendChild(el("div", "cc-nav-title", name));
      if (!defs.length) continue;
      const cards = el("div", "cc-nav-cards");
      for (const def of defs) {
        const c = el("div", "cc-nav-card");
        c.appendChild(document.createTextNode(def.name));
        c.appendChild(el("span", "cc-nav-card-type", def.tag));
        c.draggable = true;
        c.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", def.name);
          e.dataTransfer.effectAllowed = "copy";
        });
        cards.appendChild(c);
      }
      host.appendChild(cards);
    }
  }

  // ---------- drop into the canvas ----------

  function unbindDrop(tl) {
    if (!tl.drop) return;
    try {
      tl.drop.doc.removeEventListener("dragover", tl.drop.over);
      tl.drop.doc.removeEventListener("drop", tl.drop.drop);
    } catch (e) { /* the iframe document may be gone */ }
    tl.drop = null;
  }

  // function: drop point relative to the page (body). Listeners live on
  // the iframe's own document, whose event coordinates are already that
  // frame's local space — no zoom accessor exists on the contract yet
  // (3.3/3.4 job 3), see PICKS.
  function dropPoint(doc, e) {
    const rect = doc.body.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // function: the first [data-cc-layer], or body when none.
  function dropParentNode(doc) {
    return doc.querySelector("[data-cc-layer]") || doc.body;
  }

  // function: HTML5 DnD crosses a same-origin iframe. The listener lives
  // on the bound canvas's iframe document, as the old library did.
  function bindDrop(tl) {
    const a = api(tl);
    const idoc = (a && a.doc) ? a.doc() : null;
    if (!idoc || !idoc.body) { unbindDrop(tl); return; }
    if (tl.drop && tl.drop.doc === idoc) return;
    unbindDrop(tl);
    const over = (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e) => {
      e.preventDefault();
      const name = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      const def = SNIPPET_BY_NAME[name];
      const cur = api(tl);
      if (!def || !cur) return;
      const doc = cur.doc();
      const pt = dropPoint(doc, e);
      const html = snippetOuterHtml(def, "drop", pt.x, pt.y);
      cur.insertAt(html, pt);
      markDirty(tl);
      render(tl);
    };
    idoc.addEventListener("dragover", over);
    idoc.addEventListener("drop", drop);
    tl.drop = { doc: idoc, over: over, drop: drop };
  }

  // ---------- layers ----------

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

  // ---------- layer model ----------
  // state: patchSource takes one patch per call, so every helper here is
  // one or more sequential calls.

  const LAYER_SEL = "[data-cc-layer]";
  const LAYER_FLAG_ATTR = { locked: "data-cc-locked", hidden: "data-cc-hidden" };

  // function: body's layer sections, DOM order, first is bottom.
  function layerNodes(a) {
    const doc = a && a.doc ? a.doc() : null;
    if (!doc || !doc.body) return [];
    return Array.prototype.slice.call(doc.body.children)
      .filter((n) => n.matches && n.matches(LAYER_SEL));
  }

  function layerRecord(node) {
    return {
      id: fileNodeId(node),
      name: node.getAttribute("data-cc-name") || "",
      plugin: node.getAttribute("data-cc-plugin") || "html",
      locked: node.hasAttribute("data-cc-locked"),
      hidden: node.hasAttribute("data-cc-hidden")
    };
  }

  function layers(a) {
    return layerNodes(a).map(layerRecord);
  }

  function layerNodeById(a, id) {
    for (const node of layerNodes(a)) if (fileNodeId(node) === id) return node;
    return null;
  }

  // function: the layer an element sits in. "" when outside every layer.
  function layerOf(a, id) {
    const doc = a && a.doc ? a.doc() : null;
    const node = doc ? tlFind(doc, id) : null;
    if (!node) return "";
    const layer = node.closest ? node.closest(LAYER_SEL) : null;
    return layer ? fileNodeId(layer) : "";
  }

  function tlFind(doc, id) {
    return MX.canvasPatch().find(doc, id);
  }

  // function: children patch.js counts for an insert or move index.
  function nonHostKids(node) {
    const sel = MX.canvasPatch().HOST_NODE_SELECTOR;
    return Array.prototype.slice.call((node && node.children) || [])
      .filter((child) => !(child.matches && child.matches(sel)));
  }

  function attrEscape(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // function: name not already taken by a layer, "Layer 2", "Layer 3"…
  function freeLayerName(a, base) {
    const taken = layers(a).map((l) => l.name);
    if (taken.indexOf(base) < 0) return base;
    for (let n = 2; n < 999; n++) {
      if (taken.indexOf(base + " " + n) < 0) return base + " " + n;
    }
    return base;
  }

  // function: first load in canvas mode. A file with no layer section gets
  // one, "Layer 1", wrapped around body's own children.
  function ensureLayers(tl, a) {
    const doc = a && a.doc ? a.doc() : null;
    if (!doc || !doc.body) return false;
    if (layerNodes(a).length) return false;
    const id = MX.canvasPatch().newId("ly");
    const kids = fileLayerChildren(tl, doc.body);
    if (kids.length) {
      a.patchSource({ kind: "wrap", id: id, ids: kids.map(fileNodeId), tag: "section" });
      a.patchSource({ kind: "set-attr", id: id, name: "data-cc-layer", value: "1" });
      a.patchSource({ kind: "set-attr", id: id, name: "data-cc-name", value: "Layer 1" });
      a.patchSource({ kind: "set-attr", id: id, name: "data-cc-plugin", value: "html" });
      return true;
    }
    addLayer(a, "Layer 1", "html");
    return true;
  }

  function layerHtml(a, id, name, plugin) {
    let inner = "";
    if (plugin === "svg") {
      const page = readPage(a);
      inner = '<svg viewBox="0 0 ' + page.w + " " + page.h
        + '" width="100%" height="100%"></svg>';
    }
    return '<section data-cc-layer="1" data-cc-name="' + attrEscape(name)
      + '" data-cc-plugin="' + plugin + '" data-od-id="' + id + '">'
      + inner + "</section>";
  }

  // function: new empty layer on top. svg plugin carries its own <svg>
  // sized from the page tokens.
  function addLayer(a, name, plugin) {
    const doc = a && a.doc ? a.doc() : null;
    if (!doc || !doc.body) return "";
    const id = MX.canvasPatch().newId("ly");
    const p = plugin === "svg" ? "svg" : "html";
    a.patchSource({
      kind: "insert", parent: "__body__",
      index: nonHostKids(doc.body).length,
      html: layerHtml(a, id, name, p)
    });
    return id;
  }

  function removeLayer(a, id) {
    a.patchSource({ kind: "remove", id: id });
  }

  function renameLayer(a, id, name) {
    a.patchSource({ kind: "set-attr", id: id, name: "data-cc-name", value: name });
  }

  // function: locked and hidden are present or absent, never "0".
  function setLayerFlag(a, id, flag, on) {
    const attr = LAYER_FLAG_ATTR[flag];
    if (!attr) return;
    a.patchSource({ kind: "set-attr", id: id, name: attr, value: on ? "1" : null });
  }

  // function: layer to a new slot among body's children.
  function moveLayer(a, id, index) {
    a.patchSource({ kind: "move", id: id, parent: "__body__", index: index });
  }

  // function: every child into the layer below, then the empty layer goes.
  function mergeDown(a, id) {
    const nodes = layerNodes(a);
    const at = nodes.map(fileNodeId).indexOf(id);
    if (at <= 0) return false;
    const belowId = fileNodeId(nodes[at - 1]);
    const kids = nonHostKids(nodes[at]);
    let index = nonHostKids(nodes[at - 1]).length;
    for (const kid of kids) {
      a.patchSource({ kind: "move", id: fileNodeId(kid), parent: belowId, index: index });
      index++;
    }
    removeLayer(a, id);
    return true;
  }

  // function: each id to the end of the target layer.
  function moveToLayer(a, ids, layerId) {
    const node = layerNodeById(a, layerId);
    if (!node) return;
    let index = nonHostKids(node).length;
    for (const id of ids || []) {
      if (id === layerId) continue;
      a.patchSource({ kind: "move", id: id, parent: layerId, index: index });
      index++;
    }
  }

  // function: active layer, the canvas option. Empty falls to the topmost
  // unlocked layer.
  function activeLayer(tl) {
    const bf = boundFrame(tl);
    const held = bf && bf.options ? (bf.options.activeLayer || "") : "";
    if (held) return held;
    return tl.activeLayerLocal || "";
  }

  function setActiveLayer(tl, id) {
    const bf = boundFrame(tl);
    tl.activeLayerLocal = id || "";
    if (bf) bf.setOption("activeLayer", id || "");
  }

  // function: the layer new items land in. Empty option falls to the
  // topmost unlocked layer.
  function activeLayerId(tl, a) {
    const stack = layerNodes(a);
    const held = activeLayer(tl);
    for (const node of stack) if (fileNodeId(node) === held) return held;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!stack[i].hasAttribute("data-cc-locked")) return fileNodeId(stack[i]);
    }
    return "";
  }

  // function: the drop slot for a layer, counted with the dragged layer
  // out of body's list. front is the later index.
  function layerDropIndex(a, draggedId, targetNode, front) {
    const doc = a.doc ? a.doc() : null;
    if (!doc || !doc.body) return 0;
    const kids = nonHostKids(doc.body).filter((n) => fileNodeId(n) !== draggedId);
    const at = Math.max(0, kids.indexOf(targetNode));
    return front ? at + 1 : at;
  }

  // ---------- row menus ----------

  // function: a layer copy with every bridge id dropped, so the insert
  // stamps fresh ones.
  function duplicateLayer(a, id, name) {
    const node = layerNodeById(a, id);
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.setAttribute("data-cc-name", name);
    const all = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*")));
    for (const elx of all) {
      for (const attr of Array.prototype.slice.call(elx.attributes)) {
        if (attr.name.indexOf("data-od-") === 0) elx.removeAttribute(attr.name);
      }
    }
    const newId = MX.canvasPatch().newId("ly");
    clone.setAttribute("data-od-id", newId);
    const doc = a.doc();
    const at = nonHostKids(doc.body).indexOf(node);
    a.patchSource({
      kind: "insert", parent: "__body__",
      index: at < 0 ? nonHostKids(doc.body).length : at + 1,
      html: clone.outerHTML
    });
    return newId;
  }

  function layerChildIds(tl, a, id) {
    const node = layerNodeById(a, id);
    if (!node) return [];
    return fileLayerChildren(tl, node).map(fileNodeId).filter(Boolean);
  }

  // function: every item on the layer becomes the selection.
  function selectAllOnLayer(tl, a, id) {
    tl.mirrors.select.emit({ ids: layerChildIds(tl, a, id) });
    render(tl);
  }

  function layerMenuItems(tl, a, rec) {
    const stack = layerNodes(a).map(fileNodeId);
    const atBottom = stack.indexOf(rec.id) <= 0;
    const chosen = a.selected();
    return [
      ["New layer", () => {
        const id = addLayer(a, freeLayerName(a, "Layer " + (stack.length + 1)), "html");
        if (id) setActiveLayer(tl, id);
        render(tl);
      }],
      ["Duplicate layer", () => {
        duplicateLayer(a, rec.id, freeLayerName(a, rec.name + " copy"));
        render(tl);
      }],
      ["Delete layer", () => { removeLayer(a, rec.id); render(tl); }],
      ["Rename", () => { tl.renamingLayer = rec.id; render(tl); }],
      [rec.locked ? "Unlock" : "Lock", () => {
        setLayerFlag(a, rec.id, "locked", !rec.locked);
        render(tl);
      }],
      [rec.hidden ? "Show" : "Hide", () => {
        setLayerFlag(a, rec.id, "hidden", !rec.hidden);
        render(tl);
      }],
      ["Merge down", () => { mergeDown(a, rec.id); render(tl); }, atBottom],
      ["Select all on layer", () => selectAllOnLayer(tl, a, rec.id)],
      ["Move selection here", () => {
        moveToLayer(a, chosen, rec.id);
        render(tl);
      }, !chosen.length]
    ];
  }

  // function: an element and everything under it.
  function subtreeIds(tl, a, id) {
    const doc = a.doc ? a.doc() : null;
    const node = doc ? tlFind(doc, id) : null;
    if (!node) return [id];
    const out = [id];
    for (const kid of Array.prototype.slice.call(node.querySelectorAll("*"))) {
      if (isFileLayerSkip(tl, kid)) continue;
      const kidId = fileNodeId(kid);
      if (kidId) out.push(kidId);
    }
    return out;
  }

  // function: the canvas's own items plus Isolate. job 5 paints the dim.
  function itemMenuItems(tl, a, id) {
    const items = a.menuItems ? a.menuItems().slice() : [];
    items.push(["Isolate", () => {
      tl.mirrors.select.emit({ ids: subtreeIds(tl, a, id), isolate: true });
      render(tl);
    }]);
    return items;
  }

  function renderLayers(tl, host, a) {
    const idoc = a.doc ? a.doc() : null;
    if (!idoc || !idoc.body) { empty(host, "Canvas not loaded."); return; }
    // state: one attempt per target; the change mirror redraws after it.
    const targetKey = tl.frame.options.target || "";
    if (tl.layersEnsured !== targetKey) {
      tl.layersEnsured = targetKey;
      ensureLayers(tl, a);
    }
    const chosen = a.selected();
    const stack = layerNodes(a);
    const activeId = activeLayerId(tl, a);

    const head = el("div", "cc-panel-order-head");
    head.appendChild(el("span", "cc-panel-tool-title", "Layers"));
    head.appendChild(mkBtn("+ Layer", "cc-panel-toggle", () => {
      const id = addLayer(a, freeLayerName(a, "Layer " + (stack.length + 1)), "html");
      if (id) setActiveLayer(tl, id);
      render(tl);
    }));
    const groupBtn = mkBtn("Group", "cc-panel-toggle", () => a.group(a.selected()));
    const ungroupBtn = mkBtn("Ungroup", "cc-panel-toggle", () => a.ungroup(a.selected()[0]));
    groupBtn.disabled = !chosen.length;
    ungroupBtn.disabled = !chosen.length;
    head.appendChild(groupBtn);
    head.appendChild(ungroupBtn);
    host.appendChild(head);

    if (!stack.length) { empty(host, "This page is empty."); return; }

    // function: inline rename. Enter commits, Esc cancels.
    function startRename(layerId, nameEl, current) {
      const input = el("input", "cc-panel-field");
      input.value = current;
      nameEl.textContent = "";
      nameEl.appendChild(input);
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("dblclick", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tl.renamingLayer = "";
          renameLayer(a, layerId, input.value);
          render(tl);
        } else if (e.key === "Escape") {
          e.preventDefault();
          tl.renamingLayer = "";
          render(tl);
        }
      });
      input.focus();
      input.select();
    }

    function renderLayerRow(node) {
      const rec = layerRecord(node);
      const row = el("div", "cc-panel-row cc-layer-row");
      row.draggable = true;
      row.dataset.layer = rec.id;
      row.dataset.id = rec.id;
      if (rec.hidden) row.classList.add("cc-layer-hidden");
      if (rec.locked) row.classList.add("cc-layer-locked");
      if (rec.id === activeId) row.classList.add("cc-panel-row-active");

      const dot = el("span", "cc-layer-dot", rec.id === activeId ? "●" : "○");
      dot.title = rec.id === activeId ? "active layer" : "";
      row.appendChild(dot);

      const nameEl = el("div", "cc-panel-row-name", rec.name);
      nameEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startRename(rec.id, nameEl, rec.name);
      });
      row.appendChild(nameEl);
      if (tl.renamingLayer === rec.id) startRename(rec.id, nameEl, rec.name);
      // label: plugin — the layer's engine.
      row.appendChild(el("span", "cc-layer-plugin", rec.plugin));

      const eye = mkBtn(rec.hidden ? "◌" : "◉", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        setLayerFlag(a, rec.id, "hidden", !rec.hidden);
        render(tl);
      });
      eye.title = rec.hidden ? "hidden" : "visible";
      row.appendChild(eye);

      const lock = mkBtn(rec.locked ? "■" : "□", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        setLayerFlag(a, rec.id, "locked", !rec.locked);
        render(tl);
      });
      lock.title = rec.locked ? "locked" : "unlocked";
      if (rec.locked) lock.classList.add("cc-panel-row-btn-on");
      row.appendChild(lock);

      row.addEventListener("click", () => {
        setActiveLayer(tl, rec.id);
        render(tl);
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMenu(tl, layerMenuItems(tl, a, rec), e.clientX, e.clientY);
      });
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", rec.id);
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === rec.id) return;
        const rect = row.getBoundingClientRect();
        const offset = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
        if (offset < 0.25 || offset > 0.75) {
          // state: the panel draws top-is-front; the top quarter is the later slot.
          moveLayer(a, draggedId, layerDropIndex(a, draggedId, node, offset < 0.25));
        } else {
          moveToLayer(a, [draggedId], rec.id);
        }
        render(tl);
      });

      host.appendChild(row);
      const kids = fileLayerChildren(tl, node);
      for (let i = kids.length - 1; i >= 0; i--) renderItemRow(kids[i], 1, rec.locked);
    }

    function renderItemRow(node, depth, locked) {
      const id = fileNodeId(node);
      const row = el("div", "cc-panel-row");
      row.draggable = !locked;
      row.dataset.id = id || "";
      row.style.paddingLeft = (8 + depth * 12) + "px";
      row.appendChild(el("div", "cc-panel-row-name", fileRowLabel(node)));
      const words = fileOwnWords(node);
      if (words) row.appendChild(el("div", "cc-panel-row-content", words));
      if (node.hasAttribute("data-od-group")) {
        row.appendChild(el("div", "cc-panel-row-content", "group"));
      }
      if (id && chosen.indexOf(id) >= 0) row.classList.add("cc-panel-row-active");

      const parent = node.parentElement;
      const parentId = fileParentId(node);
      const idx = fileChildIndex(tl, node);
      const sibs = parent ? fileNonHostChildren(tl, parent) : [];
      const grand = parent ? parent.parentElement : null;
      const canOut = !!(parent && grand && !parent.matches(LAYER_SEL)
        && parent.tagName.toLowerCase() !== "body");

      // function: order and nesting buttons. Same result as the drag.
      const up = mkBtn("▲", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        a.move(id, parentId, idx + 1);
      });
      up.disabled = locked || idx >= sibs.length - 1;
      const down = mkBtn("▼", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        a.move(id, parentId, idx - 1);
      });
      down.disabled = locked || idx <= 0;
      const out = mkBtn("◀", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        a.move(id, fileParentId(parent), fileChildIndex(tl, parent) + 1);
      });
      out.disabled = locked || !canOut;
      const into = mkBtn("▶", "cc-panel-row-btn", (e) => {
        e.stopPropagation();
        const prev = sibs[idx - 1];
        if (prev) a.move(id, fileNodeId(prev), fileChildCount(tl, prev));
      });
      into.disabled = locked || idx <= 0;
      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(out);
      row.appendChild(into);

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
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!id) return;
        if (a.selected().indexOf(id) < 0) fileSelect(tl, a, id, false);
        openMenu(tl, itemMenuItems(tl, a, id), e.clientX, e.clientY);
      });
      row.addEventListener("dragstart", (e) => {
        if (id) e.dataTransfer.setData("text/plain", id);
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === id) return;
        const rect = row.getBoundingClientRect();
        const offset = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
        // state: index counted with the dragged element out of the list.
        const free = parent
          ? fileNonHostChildren(tl, parent).filter((n) => fileNodeId(n) !== draggedId)
          : [];
        const at = Math.max(0, free.indexOf(node));
        // the panel draws siblings reversed; the top edge is the later slot.
        if (offset < 0.25) a.move(draggedId, parentId, at + 1);
        else if (offset > 0.75) a.move(draggedId, parentId, at);
        else a.move(draggedId, id, fileChildCount(tl, node));
      });

      host.appendChild(row);
      const kids = fileLayerChildren(tl, node);
      for (let i = kids.length - 1; i >= 0; i--) renderItemRow(kids[i], depth + 1, locked);
    }

    // layer rows: first is bottom in the DOM, drawn top is front.
    for (let i = stack.length - 1; i >= 0; i--) renderLayerRow(stack[i]);
  }

  // ---------- inspector ----------

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

  function renderTools(tl, host, a) {
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
        box.appendChild(styleControlFor(tl, prop, current, "fm-" + prop, (v) => {
          const styles = {};
          styles[prop] = v;
          a.patchSource({ id: id, kind: "set-style", styles: styles });
        }));
      }
      host.appendChild(box);
    }
  }

  // ---------- render ----------

  // function: the tab row. All four sections live in file mode.
  function renderTabs(tl) {
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
    else if (tl.section === "snippets") renderSnippets(tl, tl.bodyEl, a);
    else if (tl.section === "page") renderPage(tl, tl.bodyEl, a);
    else renderTools(tl, tl.bodyEl, a);
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
        frame: frame, live: true, core: null,
        canvasOpt: frame.options.canvas || "focused",
        section: SECTIONS.indexOf(frame.options.section) >= 0 ? frame.options.section : "tools",
        focusedInst: "",
        timers: Object.create(null),
        mirrors: null, followMirror: null, offLayout: null,
        menu: null, menuOutside: null, menuEsc: null,
        tabs: {}, bodyEl: null, whoEl: null,
        pageMarginLink: false, drop: null,
        layersEnsured: null, renamingLayer: "", activeLayerLocal: ""
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
        tl.mirrors = core.mirrors(frame, {
          select: () => render(tl),
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
      closeLayerMenu(tl);
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
