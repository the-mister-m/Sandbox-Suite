// canvas render — state to dom inside one document
//
// MX.canvasRender(state, resolve, doc): {page, widget, flush, setMode,
// mode}. page(id, opts): opts.only is a list of widget ids redrawn in
// their existing wrappers; anything else rebuilds the page.
// doc is the iframe's document: the cc-render-style block lives
// there and #matrix is looked up there. Every kit lookup goes through
// resolve.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  MX.canvasRender = function (state, resolve, doc) {
    var d = doc || document;
    if (resolve && typeof resolve.setDocument === "function") resolve.setDocument(d);

    // state: view mode. preview or schematic.
    var mode = "preview";
    // state: css text per widget id, flushed to one style block.
    var rules = {};
    var styleEl = null;

    // function: write all rules into one style block.
    function flush() {
      if (!styleEl || styleEl.ownerDocument !== d) {
        styleEl = d.getElementById("cc-render-style");
      }
      if (!styleEl) {
        styleEl = d.createElement("style");
        styleEl.id = "cc-render-style";
        d.head.appendChild(styleEl);
      }
      var css = "";
      for (var id in rules) {
        if (rules.hasOwnProperty(id)) css += rules[id] + "\n";
      }
      styleEl.textContent = css;
    }

    // function: one widget to a dom element. Custom code replaces the kit.
    function widget(w) {
      var settings = state.get().settings;
      var def = resolve.def(w.type);
      var custom = !!(w.code && w.code.custom);
      var map = resolve.map(w, settings);
      var html = custom
        ? (w.code.html || "")
        : (def && def.html ? def.html : "");
      if (!html) html = '<div data-id="{{id}}">{{content}}</div>';
      var holder = d.createElement("div");
      holder.innerHTML = resolve.fill(html, map);
      var el = holder.firstElementChild;
      if (!el) {
        el = d.createElement("div");
        el.setAttribute("data-id", w.id);
      }
      // css: custom keeps its own; otherwise the kit owns the rule.
      rules[w.id] = custom
        ? resolve.fill(w.code.css || "", map)
        : ((def && def.css) ? resolve.fill(def.css, map) : "");
      flush();
      return el;
    }

    // function: schematic box. Id, type, then behavior and animation counts.
    function schematic(w) {
      var el = d.createElement("div");
      el.className = "cc-canvas-schematic";
      el.setAttribute("data-id", w.id);
      var b = (w.behaviors && w.behaviors.length) || 0;
      var a = (w.animations && w.animations.length) || 0;
      var label = w.id + " " + w.type;
      if (b) label += " b" + b;
      if (a) label += " a" + a;
      el.textContent = label;
      return el;
    }

    // function: link wrap. An <a> around the element, never around an a.
    function anchor(w, el) {
      if (!w.link || !w.link.target) return el;
      if (el.tagName && el.tagName.toLowerCase() === "a") return el;
      var a = d.createElement("a");
      a.setAttribute("href", "#" + w.link.target);
      a.appendChild(el);
      return a;
    }

    // function: place a wrapper. Fluid: x and w percent, y and h pixels.
    // flowChild: the parent is a flow container. Static, w and h only;
    // x and y are ignored.
    function position(el, w, settings, flowChild) {
      var fluid = settings.width && settings.width.mode === "fluid";
      if (flowChild) {
        el.style.position = "static";
        el.style.width = fluid ? w.box.w + "%" : w.box.w + "px";
        el.style.height = w.box.h + "px";
        return;
      }
      el.style.left = fluid ? w.box.x + "%" : w.box.x + "px";
      el.style.width = fluid ? w.box.w + "%" : w.box.w + "px";
      el.style.top = w.box.y + "px";
      el.style.height = w.box.h + "px";
    }

    // function: the page record, else null.
    function pageOf(s, pageId) {
      for (var i = 0; i < s.pages.length; i++) {
        if (s.pages[i].id === pageId) return s.pages[i];
      }
      return null;
    }

    // function: redraw named widgets in their existing wrappers.
    // false when any id or its wrapper is missing, or the page nests.
    function redrawOnly(matrix, s, pg, ids) {
      var byId = {};
      for (var i = 0; i < pg.widgets.length; i++) {
        if (pg.widgets[i].parent) return false;
        byId[pg.widgets[i].id] = pg.widgets[i];
      }
      var jobs = [];
      for (var j = 0; j < ids.length; j++) {
        var w = byId[ids[j]];
        if (!w) return false;
        var wrap = matrix.querySelector('[data-widget-id="' + ids[j] + '"]');
        if (!wrap || wrap.parentNode !== matrix) return false;
        jobs.push([w, wrap]);
      }
      for (var k = 0; k < jobs.length; k++) {
        var wi = jobs[k][0];
        var old = jobs[k][1];
        var node = d.createElement("div");
        node.className = "cc-canvas-widget";
        node.setAttribute("data-widget-id", wi.id);
        if (wi.hidden) node.style.display = "none";
        position(node, wi, s.settings, false);
        var el = (mode === "schematic") ? schematic(wi) : widget(wi);
        var def = resolve.def(wi.type);
        // layout: flow makes the container box-tall, not content-tall.
        if (def && def.children && wi.props && wi.props.layout === "flow") {
          el.style.minHeight = wi.box.h + "px";
        }
        node.appendChild(anchor(wi, el));
        matrix.replaceChild(node, old);
      }
      flush();
      return true;
    }

    // function: render a page into the matrix. Array order, nested by parent.
    // One pass. Parent before child is a state invariant, so hosts[w.parent]
    // is always filled by the time the child arrives. A nested box is
    // parent-relative; position reads it straight through.
    function page(pageId, opts) {
      var play = !!(opts && opts.play);
      var matrix = d.getElementById("matrix");
      if (!matrix) return;
      var s = state.get();
      var pg = pageOf(s, pageId);
      var only = opts && opts.only;
      if (pg && only && only.length && redrawOnly(matrix, s, pg, only)) return;
      matrix.innerHTML = "";
      rules = {};
      if (!pg) { flush(); return; }
      // state: where each widget's children go. Element when kit children, else wrapper.
      var hosts = {};
      // state: widget records by id, filled as each is placed.
      var byId = {};
      for (var j = 0; j < pg.widgets.length; j++) {
        var w = pg.widgets[j];
        byId[w.id] = w;
        var wrap = d.createElement("div");
        wrap.className = "cc-canvas-widget";
        wrap.setAttribute("data-widget-id", w.id);
        if (w.hidden) wrap.style.display = "none";
        var parentW = w.parent ? byId[w.parent] : null;
        var flowChild = !!(parentW && parentW.props &&
          parentW.props.layout === "flow");
        position(wrap, w, s.settings, flowChild);
        var el = (mode === "schematic") ? schematic(w) : widget(w);
        var def = resolve.def(w.type);
        // layout: flow makes the container box-tall, not content-tall.
        if (def && def.children && w.props && w.props.layout === "flow") {
          el.style.minHeight = w.box.h + "px";
        }
        wrap.appendChild(anchor(w, el));
        hosts[w.id] = (def && def.children) ? el : wrap;
        var host = (w.parent && hosts[w.parent]) ? hosts[w.parent] : matrix;
        host.appendChild(wrap);
      }
      if (play) {
        // play: phase 4 fills this
      }
      flush();
    }

    return {
      widget: widget,
      page: page,
      flush: flush,
      setMode: function (m) { mode = (m === "schematic") ? "schematic" : "preview"; },
      mode: function () { return mode; }
    };
  };
})();
