// nested model picker — provider, then model, then version
//
// Rows come from GET /api/library/models, the same rows Router.list_models
// returns: id, provider, model, version. The provider's hidden filter is the
// route's business; this module draws whatever it is handed.
//
// State: three selects, each narrowing the next. Never one flat list.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  let _rows = null;

  function loadRows() {
    if (_rows) return Promise.resolve(_rows);
    return fetch("/api/library/models")
      .then((r) => r.json())
      .then((d) => (_rows = Array.isArray(d && d.list) ? d.list : []))
      .catch(() => (_rows = []));
  }

  function fill(select, values, chosen, labelFor) {
    select.textContent = "";
    for (const v of values) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = (labelFor ? labelFor(v) : v) || "—";
      if (v === chosen) o.selected = true;
      select.appendChild(o);
    }
    select.disabled = values.length === 0;
  }

  function uniq(list) {
    const seen = [];
    for (const v of list) {
      if (seen.indexOf(v) < 0) seen.push(v);
    }
    return seen;
  }

  // host: element to build into. opts: { value, onPick(id, row) }.
  MX.mountModelPicker = function (host, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "mx-model-picker";
    const providerSel = document.createElement("select");
    const modelSel = document.createElement("select");
    const versionSel = document.createElement("select");
    providerSel.className = "mx-mp-provider";
    modelSel.className = "mx-mp-model";
    versionSel.className = "mx-mp-version";
    wrap.appendChild(providerSel);
    wrap.appendChild(modelSel);
    wrap.appendChild(versionSel);
    host.appendChild(wrap);

    const state = { rows: [], provider: "", model: "", version: "" };

    function rowFor() {
      return state.rows.find((r) => r.provider === state.provider
        && r.model === state.model
        && (r.version || "") === state.version) || null;
    }

    function announce() {
      const row = rowFor();
      if (row && typeof opts.onPick === "function") opts.onPick(row.id, row);
    }

    // an alias row carries no version and draws its resolved id instead
    // of a dash, when the row has one. When nothing is chosen, land on
    // the newest dated version instead; aliases stay in the list and
    // stay selectable.
    function drawVersions() {
      const matched = state.rows
        .filter((r) => r.provider === state.provider && r.model === state.model);
      const versions = uniq(matched.map((r) => r.version || ""));
      if (versions.indexOf(state.version) < 0) {
        const dated = versions.filter(Boolean).sort().reverse();
        state.version = dated[0] || versions[0] || "";
      }
      fill(versionSel, versions, state.version, (v) => {
        if (v) return v;
        const row = matched.find((r) => (r.version || "") === "");
        return (row && row.resolved) || v;
      });
    }

    function drawModels() {
      const models = uniq(state.rows
        .filter((r) => r.provider === state.provider)
        .map((r) => r.model));
      if (models.indexOf(state.model) < 0) state.model = models[0] || "";
      fill(modelSel, models, state.model);
      drawVersions();
    }

    function drawProviders() {
      const providers = uniq(state.rows.map((r) => r.provider));
      if (providers.indexOf(state.provider) < 0) state.provider = providers[0] || "";
      fill(providerSel, providers, state.provider);
      drawModels();
    }

    providerSel.addEventListener("change", () => {
      state.provider = providerSel.value;
      state.model = "";
      state.version = "";
      drawModels();
      announce();
    });
    modelSel.addEventListener("change", () => {
      state.model = modelSel.value;
      state.version = "";
      drawVersions();
      announce();
    });
    versionSel.addEventListener("change", () => {
      state.version = versionSel.value;
      announce();
    });

    const ready = loadRows().then((rows) => {
      state.rows = rows;
      const want = state.rows.find((r) => r.id === opts.value);
      if (want) {
        state.provider = want.provider;
        state.model = want.model;
        state.version = want.version || "";
      }
      drawProviders();
      return {
        el: wrap,
        value() { const r = rowFor(); return r ? r.id : ""; },
        row() { return rowFor(); },
      };
    });

    return ready;
  };
})();
