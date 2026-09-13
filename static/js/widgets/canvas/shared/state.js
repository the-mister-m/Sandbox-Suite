// canvas state — the document, one instance per widget
//
// MX.canvasState(kit): an instance. get, defaultState, load, save, commit,
// batch, undo, redo, the widget record writers, setCode, the asset
// writers, and on(fn) for change. The kit comes in as an argument; no
// module-level state, no window.Kit.
// assetMode and docPath are instance-local view settings, never document
// fields; resolve reads them. putAsset stores per mode and commits the
// record.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  var ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

  // function: id generator. Prefix plus six random chars.
  function genId(prefix) {
    var s = "";
    for (var i = 0; i < 6; i++) {
      s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
    return prefix + "_" + s;
  }

  // function: deep clone via JSON. State is plain data.
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // state: version 1 to 2 type migration.
  var MIGRATE_TYPE = {
    "text.heading": { type: "text.block", tag: "h1" },
    "text.subheading": { type: "text.block", tag: "h2" },
    "text.paragraph": { type: "text.block", tag: "p" },
    "text.quote": { type: "text.block", tag: "blockquote" },
    "text.caption": { type: "text.block", tag: "small" },
    "text.list": { type: "text.list", tag: null }
  };

  // function: migrate one widget record in place. Unknown types untouched.
  function migrateWidget(w) {
    var m = MIGRATE_TYPE[w.type];
    if (!m) return;
    w.type = m.type;
    if (m.tag) {
      w.props = w.props || {};
      w.props.tag = m.tag;
    }
  }

  // function: migrate a version 1 state to version 2 in place.
  function migrateV1(s) {
    var p, i;
    for (p = 0; p < s.pages.length; p++) {
      var widgets = s.pages[p].widgets;
      for (i = 0; i < widgets.length; i++) migrateWidget(widgets[i]);
    }
    if (s.library && s.library.objects) {
      for (var o = 0; o < s.library.objects.length; o++) {
        var ow = s.library.objects[o].widgets || [];
        for (i = 0; i < ow.length; i++) migrateWidget(ow[i]);
      }
    }
    s.version = 2;
    return s;
  }

  // function: default document shape.
  function defaultState() {
    return {
      app: "Code Canvas",
      version: 2,
      settings: {
        grid: 8,
        gridStyle: "dynamic",
        width: { mode: "fixed", px: 1280 },
        palette: "default",
        palettes: {}
      },
      page: null,
      pages: [],
      library: { objects: [], animations: [], behaviors: [] },
      assets: []
    };
  }

  // function: float noise off. Whole pixels stay whole.
  function trim(v) { return Math.round(v * 10000) / 10000; }

  // function: filename safe for a workspace path.
  function safeName(name) {
    return String(name || "asset").replace(/[^A-Za-z0-9._-]+/g, "_");
  }

  // function: folder part of a path, "" when there is none.
  function dirOf(path) {
    var s = String(path || "");
    var i = s.lastIndexOf("/");
    return i < 0 ? "" : s.slice(0, i);
  }

  // function: basename without its extension.
  function stemOf(path) {
    var s = String(path || "");
    var i = s.lastIndexOf("/");
    var base = i < 0 ? s : s.slice(i + 1);
    var dot = base.lastIndexOf(".");
    return dot <= 0 ? base : base.slice(0, dot);
  }

  // function: base64 payload of a data url, "" when it is not one.
  function b64Of(dataUrl) {
    var s = String(dataUrl || "");
    var i = s.indexOf("base64,");
    return i < 0 ? "" : s.slice(i + 7);
  }

  MX.canvasState = function (kit) {
    var state = defaultState();
    var history = [clone(state)];
    var pointer = 0;
    var listeners = { change: [] };
    var batchDepth = 0;
    var batchPending = false;
    var assetMode = "data";
    var docPath = "";

    // function: kit defaults lookup for a type.
    function getKitDefaults(type) {
      var list = (kit && kit.widgets) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].type === type) return list[i].defaults;
      }
      return undefined;
    }

    // function: find widget by id across all pages.
    function findWidget(id) {
      for (var p = 0; p < state.pages.length; p++) {
        var widgets = state.pages[p].widgets;
        for (var w = 0; w < widgets.length; w++) {
          if (widgets[w].id === id) {
            return { widget: widgets[w], page: state.pages[p] };
          }
        }
      }
      return null;
    }

    function findPage(id) {
      for (var p = 0; p < state.pages.length; p++) {
        if (state.pages[p].id === id) return state.pages[p];
      }
      return null;
    }

    // function: a widget by id inside one page.
    function widgetIn(page, id) {
      var list = page.widgets;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    }

    // function: a widget and every descendant, in array order.
    function subtree(page, id) {
      var list = page.widgets, ids = {}, i, more = true;
      ids[id] = true;
      while (more) {
        more = false;
        for (i = 0; i < list.length; i++) {
          var w = list[i];
          if (!ids[w.id] && w.parent && ids[w.parent]) {
            ids[w.id] = true;
            more = true;
          }
        }
      }
      var out = [];
      for (i = 0; i < list.length; i++) {
        if (ids[list[i].id]) out.push(list[i]);
      }
      return out;
    }

    // function: the page-space frame a child of this widget lives in.
    // Fixed: x, y, w in pixels. Fluid: x and w are page fractions,
    // y is pixels. A null id is the page itself.
    function absFrame(page, id, fluid, depth) {
      if (!id || (depth || 0) > 32) return { x: 0, y: 0, w: fluid ? 1 : 0 };
      var w = widgetIn(page, id);
      if (!w) return { x: 0, y: 0, w: fluid ? 1 : 0 };
      var p = absFrame(page, w.parent, fluid, (depth || 0) + 1);
      if (fluid) {
        return {
          x: p.x + (w.box.x / 100) * p.w,
          y: p.y + w.box.y,
          w: (w.box.w / 100) * p.w
        };
      }
      return { x: p.x + w.box.x, y: p.y + w.box.y, w: w.box.w };
    }

    // function: rebase a widget's box from one parent's space into another's.
    function rebase(page, w, fromId, toId) {
      var fluid = !!(state.settings.width &&
        state.settings.width.mode === "fluid");
      var from = absFrame(page, fromId, fluid);
      var to = absFrame(page, toId, fluid);
      var ax, aw;
      if (fluid) {
        ax = from.x + (w.box.x / 100) * from.w;
        aw = (w.box.w / 100) * from.w;
      } else {
        ax = from.x + w.box.x;
        aw = w.box.w;
      }
      var ay = from.y + w.box.y;
      if (fluid) {
        w.box.x = to.w ? trim((ax - to.x) / to.w * 100) : 0;
        w.box.w = to.w ? trim(aw / to.w * 100) : w.box.w;
      } else {
        w.box.x = trim(ax - to.x);
      }
      w.box.y = trim(ay - to.y);
    }

    // function: parent before child, the array invariant. Moves the
    // widget's subtree to sit directly after its parent when it does not.
    function keepOrder(page, w) {
      if (!w.parent) return;
      var list = page.widgets, i, pi = -1;
      for (i = 0; i < list.length; i++) {
        if (list[i].id === w.parent) { pi = i; break; }
      }
      if (pi === -1) return;
      var group = subtree(page, w.id);
      var min = list.length;
      for (i = 0; i < group.length; i++) {
        var gi = list.indexOf(group[i]);
        if (gi < min) min = gi;
      }
      if (pi < min) return;
      for (i = 0; i < group.length; i++) {
        list.splice(list.indexOf(group[i]), 1);
      }
      for (i = 0; i < list.length; i++) {
        if (list[i].id === w.parent) { pi = i; break; }
      }
      for (i = 0; i < group.length; i++) list.splice(pi + 1 + i, 0, group[i]);
    }

    // function: notify listeners. Fires once per write, with the state.
    function notify(event) {
      var fns = listeners[event] || [];
      for (var i = 0; i < fns.length; i++) fns[i](state);
    }

    // function: commit. One write, one undo step. Snapshot per action.
    // Inside a batch, defers to the outermost batch call.
    function commit() {
      if (batchDepth > 0) {
        batchPending = true;
        return;
      }
      history.length = pointer + 1;
      history.push(clone(state));
      pointer = history.length - 1;
      notify("change");
    }

    // function: run fn as one write. Nested batch is one batch.
    function batch(fn) {
      batchDepth++;
      try {
        fn();
      } finally {
        batchDepth--;
      }
      if (batchDepth === 0 && batchPending) {
        batchPending = false;
        history.length = pointer + 1;
        history.push(clone(state));
        pointer = history.length - 1;
        notify("change");
      }
    }

    function addAsset(name, mime, data) {
      var id = genId("as");
      state.assets.push({ id: id, name: name, mime: mime, data: data });
      commit();
      return id;
    }

    // function: write bytes under the workspace. b64 rides the put route.
    function putFile(path, dataUrl) {
      return fetch("/api/fs/put", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path, b64: b64Of(dataUrl) })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
    }

    var api = {
      get: function () {
        return clone(state);
      },

      defaultState: defaultState,

      addWidget: function (pageId, type, box) {
        var page = findPage(pageId);
        if (!page) return null;
        var id = genId("wg");
        var defaults = getKitDefaults(type) || {};
        var b = { x: 0, y: 0, w: 160, h: 40 };
        if (box) {
          if (box.x !== undefined) b.x = box.x;
          if (box.y !== undefined) b.y = box.y;
          if (box.w !== undefined) b.w = box.w;
          if (box.h !== undefined) b.h = box.h;
        }
        var widget = {
          id: id,
          type: type,
          parent: null,
          box: b,
          content: { mode: "literal", value: "" },
          props: clone(defaults),
          link: null,
          notes: "",
          locked: false,
          hidden: false,
          behaviors: [],
          animations: [],
          code: { custom: false, html: "", css: "", js: "" }
        };
        page.widgets.push(widget);
        commit();
        return id;
      },

      // Deleting a container deletes its children. One write, one undo.
      removeWidget: function (id) {
        var found = findWidget(id);
        if (!found) return;
        var widgets = found.page.widgets;
        var group = subtree(found.page, id);
        for (var i = 0; i < group.length; i++) {
          var idx = widgets.indexOf(group[i]);
          if (idx !== -1) widgets.splice(idx, 1);
        }
        commit();
      },

      moveWidget: function (id, box) {
        var found = findWidget(id);
        if (!found) return;
        var b = found.widget.box;
        if (box.x !== undefined) b.x = box.x;
        if (box.y !== undefined) b.y = box.y;
        if (box.w !== undefined) b.w = box.w;
        if (box.h !== undefined) b.h = box.h;
        commit();
      },

      setContent: function (id, mode, value) {
        var found = findWidget(id);
        if (!found) return;
        found.widget.content = { mode: mode, value: value };
        commit();
      },

      setProp: function (id, key, value) {
        var found = findWidget(id);
        if (!found) return false;
        var defaults = getKitDefaults(found.widget.type);
        if (!defaults || !(key in defaults)) return false;
        found.widget.props[key] = value;
        commit();
        return true;
      },

      // The box is rebased into the new parent's space, and the array
      // is kept parent before child.
      setParent: function (id, parentId) {
        var found = findWidget(id);
        if (!found) return;
        if (parentId === undefined) parentId = null;
        var w = found.widget;
        if (parentId === id) return;
        rebase(found.page, w, w.parent, parentId);
        w.parent = parentId;
        keepOrder(found.page, w);
        commit();
      },

      reorder: function (id, index) {
        var found = findWidget(id);
        if (!found) return;
        var widgets = found.page.widgets;
        var idx = widgets.indexOf(found.widget);
        widgets.splice(idx, 1);
        widgets.splice(index, 0, found.widget);
        commit();
      },

      setLink: function (id, target) {
        var found = findWidget(id);
        if (!found) return;
        found.widget.link = (target === null || target === undefined)
          ? null
          : { target: target };
        commit();
      },

      setNotes: function (id, text) {
        var found = findWidget(id);
        if (!found) return;
        found.widget.notes = text;
        commit();
      },

      setLocked: function (id, bool) {
        var found = findWidget(id);
        if (!found) return;
        found.widget.locked = !!bool;
        commit();
      },

      // state: hidden widgets stay in the document and draw as display:none.
      setHidden: function (id, bool) {
        var found = findWidget(id);
        if (!found) return;
        found.widget.hidden = !!bool;
        commit();
      },

      setCode: function (id, html, css, js) {
        var found = findWidget(id);
        if (!found) return;
        found.widget.code = { custom: true, html: html, css: css, js: js };
        commit();
      },

      // state: the widget's animation list. Written here, played in phase 4.
      setAnimations: function (id, list) {
        var found = findWidget(id);
        if (!found) return;
        batch(function () {
          found.widget.animations = clone(list || []);
          commit();
        });
      },

      // state: the widget's behavior list. Written here, played in phase 4.
      setBehaviors: function (id, list) {
        var found = findWidget(id);
        if (!found) return;
        batch(function () {
          found.widget.behaviors = clone(list || []);
          commit();
        });
      },

      // state: a document-level motion list. kind is animations or behaviors.
      setLibraryMotion: function (kind, list) {
        if (kind !== "animations" && kind !== "behaviors") return;
        batch(function () {
          if (!state.library) state.library = { objects: [], animations: [], behaviors: [] };
          state.library[kind] = clone(list || []);
          commit();
        });
      },

      addPage: function (name) {
        var id = genId("pg");
        state.pages.push({ id: id, name: name, notes: "", widgets: [] });
        if (!state.page) state.page = id;
        commit();
        return id;
      },

      removePage: function (id) {
        var idx = -1;
        for (var i = 0; i < state.pages.length; i++) {
          if (state.pages[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return;
        state.pages.splice(idx, 1);
        if (state.page === id) {
          state.page = state.pages.length ? state.pages[0].id : null;
        }
        commit();
      },

      setPage: function (id) {
        if (!findPage(id)) return false;
        state.page = id;
        commit();
        return true;
      },

      // Duplicating a container duplicates its children, parent ids
      // remapped. The copied root keeps its own parent.
      duplicateWidget: function (id) {
        var found = findWidget(id);
        if (!found) return null;
        var group = subtree(found.page, id);
        var idMap = {}, copies = [], i;
        for (i = 0; i < group.length; i++) {
          var copy = clone(group[i]);
          idMap[group[i].id] = genId("wg");
          copy.id = idMap[group[i].id];
          copies.push(copy);
        }
        for (i = 0; i < copies.length; i++) {
          if (copies[i].parent && idMap[copies[i].parent]) {
            copies[i].parent = idMap[copies[i].parent];
          }
          found.page.widgets.push(copies[i]);
        }
        commit();
        return idMap[id];
      },

      batch: batch,

      renamePage: function (id, name) {
        var page = findPage(id);
        if (!page) return;
        page.name = name;
        commit();
      },

      setSetting: function (key, value) {
        state.settings[key] = value;
        commit();
      },

      undo: function () {
        if (pointer <= 0) return;
        pointer--;
        state = clone(history[pointer]);
        notify("change");
      },

      redo: function () {
        if (pointer >= history.length - 1) return;
        pointer++;
        state = clone(history[pointer]);
        notify("change");
      },

      save: function () {
        return JSON.stringify(state);
      },

      load: function (json) {
        state = (typeof json === "string") ? JSON.parse(json) : clone(json);
        // No version means version 1. Above 2 passes through untouched.
        if (state.version === undefined || state.version === null) {
          state.version = 1;
        }
        if (state.version === 1) {
          migrateV1(state);
        }
        if (!state.page) {
          state.page = state.pages.length ? state.pages[0].id : null;
        }
        history = [clone(state)];
        pointer = 0;
        notify("change");
      },

      // state: whole-document swap as one commit. undo restores the prior document.
      replace: function (json) {
        var next = (typeof json === "string") ? JSON.parse(json) : clone(json);
        if (next.version === undefined || next.version === null) next.version = 1;
        if (next.version === 1) migrateV1(next);
        if (!next.page) next.page = next.pages.length ? next.pages[0].id : null;
        state = next;
        commit();
      },

      addAsset: addAsset,

      removeAsset: function (id) {
        var idx = -1;
        for (var i = 0; i < state.assets.length; i++) {
          if (state.assets[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return;
        state.assets.splice(idx, 1);
        commit();
      },

      // function: store a file per assetMode and commit its record.
      // data keeps the data url; raw writes library/assets/ and holds a
      // /api/fs/raw url; folder writes <docstem>.assets/ beside the doc
      // and holds the relative path.
      putAsset: function (name, mime, dataUrl) {
        var file = safeName(name);
        var token = genId("f").slice(2);
        if (assetMode === "raw") {
          var rawPath = "library/assets/" + token + "-" + file;
          return putFile(rawPath, dataUrl).then(function (res) {
            if (!res.ok || !res.data || !res.data.path) {
              console.warn("putAsset raw refused:", res.data);
              return addAsset(name, mime, dataUrl);
            }
            return addAsset(name, mime,
              "/api/fs/raw?path=" + encodeURIComponent(res.data.path));
          });
        }
        if (assetMode === "folder") {
          var rel = stemOf(docPath) + ".assets/" + token + "-" + file;
          var dir = dirOf(docPath);
          var full = dir ? dir + "/" + rel : rel;
          return putFile(full, dataUrl).then(function (res) {
            if (!res.ok) {
              console.warn("putAsset folder refused:", res.data);
              return addAsset(name, mime, dataUrl);
            }
            return addAsset(name, mime, rel);
          });
        }
        return Promise.resolve(addAsset(name, mime, dataUrl));
      },

      // state: asset store mode. data, raw or folder. Read by resolve.
      assetMode: function () { return assetMode; },
      setAssetMode: function (mode) {
        assetMode = (mode === "raw" || mode === "folder") ? mode : "data";
      },

      // state: the document's own path. folder-mode assets resolve against it.
      docPath: function () { return docPath; },
      setDocPath: function (path) { docPath = String(path || ""); },

      // function: change listener. on(fn) or on("change", fn).
      on: function (a, b) {
        var event = (typeof a === "function") ? "change" : a;
        var fn = (typeof a === "function") ? a : b;
        if (typeof fn !== "function") return;
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      }
    };

    return api;
  };
})();
