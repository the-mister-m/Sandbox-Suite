// matrix widget registry — widget modules by type, registry rows from the server

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const _modules = Object.create(null);
  let _rows = [];
  let _defaults = Object.create(null);

  // a widget module is { mount, unmount, onFrame, getOptions }
  MX.registerWidget = function (type, mod) {
    _modules[type] = mod;
  };

  MX.widgetModule = function (type) {
    return _modules[type] || null;
  };

  MX.registryRows = function () {
    return _rows.slice();
  };

  MX.widgetLabel = function (type) {
    for (const row of _rows) {
      if (row.type === type) return row.label || type;
    }
    return type;
  };

  MX.widgetDefaults = function (type) {
    const d = _defaults[type];
    return d ? JSON.parse(JSON.stringify(d)) : {};
  };

  // registry rows carry the widget's own file path; defaults come per session
  MX.widgetPath = function (type) {
    for (const row of _rows) {
      if (row.type === type) return row.path || "";
    }
    return "";
  };

  MX.loadRegistry = async function (sid) {
    try {
      const r = await fetch("/api/widget-registry"
        + (sid ? "?sid=" + encodeURIComponent(sid) : ""));
      const d = await r.json();
      _rows = Array.isArray(d.list) ? d.list : [];
      _defaults = d.defaults && typeof d.defaults === "object" ? d.defaults : Object.create(null);
    } catch (e) {
      _rows = [];
      _defaults = Object.create(null);
    }
    return _rows;
  };
})();
