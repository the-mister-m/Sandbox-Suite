// canvas resolve — kit names to css, content to html, tags to text
//
// MX.canvasResolve(kit, state): def, palette, prop, content, map, fill,
// escape, asset, googleFont, setDocument. Render and the panels call
// these and nothing else. The kit and the state come in as arguments.
// googleFont(name, doc) injects its link into that document's head; the
// doc defaults to the one setDocument was last given.
// asset(id) resolves a record per the state's assetMode: data keeps the
// data url, raw holds an /api/fs/raw url, folder holds a path relative
// to the document's own folder.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  // function: folder part of a path, "" when there is none.
  function dirOf(path) {
    var s = String(path || "");
    var i = s.lastIndexOf("/");
    return i < 0 ? "" : s.slice(0, i);
  }

  MX.canvasResolve = function (kit, state) {
    // state: google families linked per document, one link per family.
    var families = [];
    var targetDoc = document;

    // function: the linked-family set for one document.
    function familiesFor(doc) {
      for (var i = 0; i < families.length; i++) {
        if (families[i].doc === doc) return families[i].set;
      }
      var entry = { doc: doc, set: {} };
      families.push(entry);
      return entry.set;
    }

    // function: the kit. An empty shape when it is absent.
    function k() {
      return (kit && Array.isArray(kit.widgets))
        ? kit
        : { palettes: {}, sizes: {}, fonts: {}, shadows: {}, widgets: [] };
    }

    // function: widget definition for a type, or null.
    function def(type) {
      var list = k().widgets;
      for (var i = 0; i < list.length; i++) {
        if (list[i].type === type) return list[i];
      }
      return null;
    }

    // function: active palette. Kit palettes first, then settings.palettes.
    function palette(settings) {
      var kk = k();
      var name = (settings && settings.palette) || "default";
      if (kk.palettes && kk.palettes[name]) return kk.palettes[name];
      if (settings && settings.palettes && settings.palettes[name]) {
        return settings.palettes[name];
      }
      return (kk.palettes && kk.palettes["default"]) || {};
    }

    // function: google family link, once per family per document.
    function googleFont(name, doc) {
      var d = doc || targetDoc || document;
      var set = familiesFor(d);
      if (!set[name]) {
        set[name] = true;
        var link = d.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=" +
          encodeURIComponent(name).replace(/%20/g, "+") + "&display=swap";
        d.head.appendChild(link);
      }
      return '"' + name + '", sans-serif';
    }

    // function: the url for an as_ id, or the id when it is unknown.
    // data: the data url as stored. raw: the stored /api/fs/raw url.
    // folder: the relative path joined to the document's folder.
    function asset(id) {
      var list = (state && state.get().assets) || [];
      var rec = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { rec = list[i]; break; }
      }
      if (!rec) return id;
      var data = String(rec.data || "");
      var mode = state.assetMode ? state.assetMode() : "data";
      if (mode === "folder") {
        if (/^(data:|https?:|\/)/.test(data)) return data;
        var dir = dirOf(state.docPath ? state.docPath() : "");
        var full = dir ? dir + "/" + data : data;
        return "/api/fs/raw?path=" + encodeURIComponent(full);
      }
      return data;
    }

    // function: one prop value to css. Kit names, booleans, asset ids.
    function prop(key, value, settings) {
      if (value === true) return key;
      if (value === false) return "";
      var kk = k();
      if (key === "size") {
        var sizes = kk.sizes || {};
        return sizes[value] !== undefined ? sizes[value] : value;
      }
      if (key === "font") {
        var fonts = kk.fonts || {};
        if (fonts[value] !== undefined) return fonts[value];
        return googleFont(String(value));
      }
      if (key === "fill" || key === "text" || key === "border") {
        var pal = palette(settings);
        return pal[value] !== undefined ? pal[value] : value;
      }
      if (key === "shadow") {
        var shadows = kk.shadows || {};
        return shadows[value] !== undefined ? shadows[value] : value;
      }
      if (typeof value === "string" && value.indexOf("as_") === 0) {
        return asset(value);
      }
      return value;
    }

    // function: escape literal content before it enters a template.
    function escape(s) {
      return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // function: raw content. Literal value, or filler in instruction mode.
    function rawContent(widget, d) {
      if (widget.content && widget.content.mode === "instruction") {
        var hint = (d && d.filler) ? d.filler : { kind: "words", count: 4 };
        if (!kit || typeof kit.makeFiller !== "function") return "";
        return kit.makeFiller({ kind: hint.kind, count: hint.count, id: widget.id });
      }
      return (widget.content && widget.content.value) || "";
    }

    // function: raw content to items, one per array entry or per line.
    function items(raw) {
      return (raw instanceof Array) ? raw : String(raw).split("\n");
    }

    // function: wrap each non-empty item in a tag.
    function wrapItems(raw, tag) {
      var list = items(raw);
      var out = "";
      for (var i = 0; i < list.length; i++) {
        var item = String(list[i]);
        if (item !== "") out += "<" + tag + ">" + escape(item) + "</" + tag + ">";
      }
      return out;
    }

    // function: content html. Kind from def.content: text, list, options, none.
    function content(widget, d) {
      var kind = (d && d.content) ? d.content : "text";
      if (kind === "none") return "";
      var raw = rawContent(widget, d);
      if (raw && typeof raw === "object" && !(raw instanceof Array)) return "";
      if (kind === "list") return wrapItems(raw, "li");
      if (kind === "options") return wrapItems(raw, "option");
      if (raw instanceof Array) raw = raw.join(" ");
      return escape(raw);
    }

    // function: template tag from props.tag, else ol/ul from style, else empty.
    // An empty tag on a block floors to p, so the template never fills blank.
    function tagFor(d, props) {
      if (d && d.defaults && d.defaults.tag !== undefined) return props.tag || "p";
      if (props.style === "number") return "ol";
      if (props.style === "bullet") return "ul";
      return "";
    }

    // function: the fill map for a widget. Id, content, tag, resolved props.
    function map(widget, settings) {
      var d = def(widget.type);
      var props = widget.props || {};
      var out = { id: widget.id, content: content(widget, d) };
      for (var key in props) {
        if (props.hasOwnProperty(key)) out[key] = prop(key, props[key], settings);
      }
      // tag last: the floor in tagFor outranks a blank props.tag.
      out.tag = tagFor(d, props);
      return out;
    }

    // function: fill {{tags}} from a map. Unknown tags become empty.
    function fill(tpl, m) {
      return String(tpl === undefined || tpl === null ? "" : tpl)
        .replace(/\{\{(\w+)\}\}/g, function (_m, key) {
          return m[key] !== undefined ? m[key] : "";
        });
    }

    return {
      def: def,
      palette: palette,
      prop: prop,
      content: content,
      map: map,
      fill: fill,
      escape: escape,
      asset: asset,
      googleFont: googleFont,
      // state: the document google font links land in by default.
      setDocument: function (doc) { targetDoc = doc || document; }
    };
  };
})();
