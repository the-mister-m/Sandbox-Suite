// shared settings rows — region settings / context / gates / preset tab bodies
//
// MX.settingsRows.create(frame, opts) returns { renderSettings(region, host),
// renderContext(kind, id, host), renderGates(region, host),
// renderPreset(region, host), onFrame(msg) }.
//
// opts.state is an object the caller owns. Required keys: gateEdges,
// policyHooks, modelRows, presetNames, outputStyles, changePrompt, contexts,
// collapsedBlocks, blocksTouched, lastOut. opts.rerender is a function this
// module calls after any state change it makes.
//
// Moved from devagent.js as is.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};
  MX.settingsRows = MX.settingsRows || {};

  // every region-tier key in engine/settings.py ROWS, grouped by its own
  // block field. overlay is region-tier too but draws in the gates tab.
  const HARNESS_KEYS = ["model", "seat", "preset_name", "reset_on_change",
    "gate_wait_s", "max_tools", "request_timeout", "allow_agent_reset",
    "context_reset_cap_k", "start_turn_on_reset", "reset_instruction"];

  const OLLAMA_KEYS = ["num_ctx", "think", "keep_alive", "temperature",
    "top_k", "top_p", "min_p", "repeat_penalty", "repeat_last_n", "seed",
    "num_predict", "mirostat", "mirostat_tau", "mirostat_eta", "num_gpu",
    "num_thread"];

  const CLAUDE_KEYS = ["claude_mode", "claude_effort", "claude_partial",
    "claude_cache_ttl", "claude_keep_warm", "claude_exclude_dynamic",
    "claude_tools", "claude_disallowed_tools", "claude_add_dirs",
    "claude_hook_ask_blocking", "claude_setting_sources",
    "claude_system_prompt", "claude_bare", "claude_config_dir",
    "claude_memory_enabled", "claude_md_excludes", "claude_output_style",
    "claude_settings_file"];

  const BLOCKS = [
    { name: "harness", keys: HARNESS_KEYS, provider: null },
    { name: "ollama", keys: OLLAMA_KEYS, provider: "ollama" },
    { name: "claude", keys: CLAUDE_KEYS, provider: "claude" },
  ];

  // keys whose value set is fixed. Anything not listed here draws as text.
  const CHOICES = {
    claude_cache_ttl: ["5m", "1h"],
    claude_effort: ["low", "medium", "high", "xhigh", "max"],
  };

  // keys holding a filesystem path — text field plus a browse button.
  // ext narrows the file list; null browses folders only.
  const PATH_KEYS = {
    claude_settings_file: ".json",
    claude_config_dir: null,
  };

  // keys whose value set is fetched at mount and cached on dev state.
  // preset_name draws its own control, not this one.
  const CHOICES_LIVE = {
    claude_output_style: "outputStyles",
  };

  function choicesFor(state, key) {
    if (CHOICES[key]) return CHOICES[key];
    const bucket = CHOICES_LIVE[key];
    const live = bucket ? state[bucket] : null;
    return Array.isArray(live) && live.length ? live : null;
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

  // ---- draft region ----
  //
  // A region the user is still filling in has this id instead of a server
  // one. Every row reads region.settings[key] and writes through commit(),
  // so a draft renders through the same builders as a live region; commit
  // merges into the draft object rather than sending edit_track.

  // one draft per track: "__draft__:<trackId>"
  const DRAFT_ID = "__draft__";
  MX.settingsRows.DRAFT_ID = DRAFT_ID;
  function isDraft(id) { return typeof id === "string" && id.indexOf(DRAFT_ID) === 0; }
  MX.settingsRows.isDraft = isDraft;

  // mirrors the type tagging frames.py does on edit_track: name, root, seat
  // and overlay are their own edit types, the rail keys are their own, and
  // everything else lands in the settings bag
  function applyToDraft(state, region, fields) {
    for (const key of Object.keys(fields)) {
      const value = fields[key];
      if (key === "name") region.name = value;
      else if (key === "root") region.root = value;
      else if (key === "seat") { region.seat = value; region.settings.seat = value || ""; }
      else if (key === "overlay") region.overlay = value;
      else if (key === "provider" || key === "loop_class" || key === "mechanism") region[key] = value;
      else if (key === "model") {
        region.model = value;
        region.settings.model = value;
        const row = (state.modelRows || []).find((m) => m.id === value);
        if (row && row.provider) region.provider = row.provider;
      } else {
        region.settings[key] = value;
      }
    }
  }

  function commit(frame, state, rerender, region, fields) {
    if (isDraft(region.id)) {
      applyToDraft(state, region, fields);
      rerender();
      return;
    }
    sendFrame(frame, { type: "edit_track", track: region.id, fields: fields });
  }

  // declared kind for keys whose engine/settings.py Row is nullable (or
  // just unset before a first edit) — controlKind falls back to "str" for
  // null/undefined, which then saves a numeric key as a string
  const NUM_KEYS = ["gate_wait_s", "max_tools", "request_timeout",
    "context_reset_cap_k", "num_ctx", "keep_alive", "temperature", "top_k",
    "top_p", "min_p", "repeat_penalty", "repeat_last_n", "seed",
    "num_predict", "mirostat", "mirostat_tau", "mirostat_eta", "num_gpu",
    "num_thread", "order"];
  const BOOL_KEYS = ["reset_on_change", "allow_agent_reset",
    "start_turn_on_reset", "think", "claude_partial", "claude_keep_warm",
    "claude_exclude_dynamic", "claude_hook_ask_blocking", "claude_bare",
    "claude_memory_enabled"];

  function controlKind(v, key) {
    if (Array.isArray(v)) return "list";
    if (typeof v === "boolean") return "bool";
    if (typeof v === "number") return "num";
    if (v === null || v === undefined) {
      if (NUM_KEYS.indexOf(key) >= 0) return "num";
      if (BOOL_KEYS.indexOf(key) >= 0) return "bool";
    }
    return "str";
  }

  // ---- context file boxes (track + region context textareas) ----

  function contextKey(kind, id) { return kind + ":" + id; }

  function ensureContextBox(state, kind, id) {
    const key = contextKey(kind, id);
    if (!state.contexts[key]) {
      const path = (kind === "track" ? "injections/track/" : "injections/region/") + id + ".md";
      state.contexts[key] = { locked: true, text: "", loaded: false, path: path, absPath: null };
    }
    return state.contexts[key];
  }

  function loadContext(frame, state, rerender, kind, id) {
    const box = ensureContextBox(state, kind, id);
    if (box.loaded) return;
    box.loaded = true; // one fetch per box; re-fetched only after a reset (new id -> new box)
    fetch("/api/fs/read?path=" + encodeURIComponent(box.path))
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.text === "string") {
          box.text = d.text;
          box.absPath = d.path;
        }
        rerender();
      })
      .catch(() => { /* missing file shows empty; Save creates it */ });
  }

  function saveContext(frame, state, kind, id, text) {
    const box = ensureContextBox(state, kind, id);
    box.text = text;
    // the save frame needs a path that resolves the same way the read did —
    // use the absolute path handed back by fs/read when we have one
    sendFrame(frame, { type: "save", path: box.absPath || box.path, content: text });
  }

  // ---- widget css ----
  //
  // Each row is its own grid element, so the label / control / edit columns
  // line up across rows only at explicit widths — content sizing would let
  // every row pick its own. Relies on the --dv-* variables devagent.js
  // defines on .mx-devagent; this module only ever renders inside that tree.

  const CSS_ID = "mx-settings-rows-css";
  const CSS = `
.mx-dev-row{ display:grid; grid-template-columns:var(--dv-key) var(--dv-ctl) auto;
  align-items:center; column-gap:8px; padding-left:var(--dv-indent); }
.mx-dev-row:hover{ background:var(--surface-2, #141414); }
.mx-dev-row + .mx-dev-row{ margin-top:var(--dv-gap); }
.mx-dev-row > .mx-dev-key{ min-width:0; overflow-wrap:anywhere; }
.mx-dev-row > input,
.mx-dev-row > select,
.mx-dev-row > .mx-dev-model-host{ min-width:0; }
.mx-dev-row > .mx-btn{ justify-self:start; }
.mx-dev-row > input[type="text"],
.mx-dev-row > input[type="number"],
.mx-dev-row > select{ width:100%; }
.mx-dev-row > input[type="checkbox"]{ width:14px; height:14px; margin:0; justify-self:start; }

/* text inputs and native selects read the same surface, border, radius */
.mx-dev-row input[type="text"],
.mx-dev-row input[type="number"],
.mx-dev-row select,
.mx-dev-tab-body > select{ box-sizing:border-box; background:var(--surface-1, #0e0e0e);
  color:var(--text-1, #ddd); border:1px solid var(--border, #383838); border-radius:3px;
  padding:0 5px; }

/* model picker — three selects on one line, shrinking instead of wrapping */
.mx-dev-model-host{ display:flex; align-items:center; gap:4px; overflow:hidden; }
.mx-model-picker{ display:flex; align-items:center; flex-wrap:nowrap; gap:4px; min-width:0; }
.mx-model-picker select{ width:auto; min-width:0; flex:1 1 0; }

/* section heads carry the spacing; their rows sit indented under them */
.mx-dev-block{ margin-top:var(--dv-sec); }
.mx-dev-block-title,
.mx-dev-block-head{ margin:var(--dv-sec) 0 var(--dv-gap); padding-bottom:3px;
  border-bottom:1px solid var(--gridline); }
.mx-dev-block > .mx-dev-block-title:first-child{ margin-top:0; }
.mx-dev-block-head{ display:flex; align-items:center; gap:6px; cursor:pointer; }
.mx-dev-caret{ flex:0 0 auto; }

/* button groups */
.mx-dev-context-actions,
.mx-dev-preset-actions,
.mx-dev-change-choices{ display:flex; flex-wrap:wrap; align-items:center; gap:6px;
  margin-top:var(--dv-gap); }

/* loose children of a tab body — the gates apply, the preset select */
.mx-dev-tab-body{ margin-top:var(--dv-gap); }
.mx-dev-tab-body > select{ width:var(--dv-ctl); margin-left:var(--dv-indent); }
.mx-dev-tab-body > .mx-btn{ margin:var(--dv-sec) 0 0 var(--dv-indent); }
.mx-dev-tab-body > .mx-dim{ padding-left:var(--dv-indent); }
.mx-dev-textarea{ box-sizing:border-box; width:100%; min-height:90px; }
.mx-dev-status{ margin-top:var(--dv-gap); padding-left:var(--dv-indent); }

/* gates rows put the scope after the hook picker, not in the label */
.mx-dev-row > .mx-dim{ min-width:0; overflow-wrap:anywhere; }

/* context and preset action rows sit under their block head */
.mx-dev-context-actions,
.mx-dev-preset-actions{ padding-left:var(--dv-indent); }
.mx-dev-change-prompt{ margin-top:var(--dv-sec); padding-left:var(--dv-indent); }
`;

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ---- track / region rung helpers ----

  // a provider block the region does not use starts closed; every other
  // block starts open. A caret click pins the block's state either way.
  function blockCollapsed(state, region, block) {
    const key = region.id + ":" + block.name;
    const touched = state.blocksTouched;
    if (touched && touched.has(key)) return state.collapsedBlocks.has(key);
    return !!block.provider && block.provider !== region.provider;
  }

  function toggleBlock(state, region, block) {
    const key = region.id + ":" + block.name;
    const now = blockCollapsed(state, region, block);
    state.blocksTouched.add(key);
    if (now) state.collapsedBlocks.delete(key); else state.collapsedBlocks.add(key);
  }

  function modelDisplay(state, region) {
    const row = (state.modelRows || []).find((m) => m.id === region.model);
    if (row) return [row.provider, row.model, row.version].filter(Boolean).join(" / ");
    return [region.provider, region.model].filter(Boolean).join(" / ");
  }

  function buildSettingRow(frame, state, rerender, region, key) {
    const value = region.settings ? region.settings[key] : undefined;
    const row = el("div", "mx-dev-row");
    row.appendChild(el("label", "mx-dev-key", key));

    if (key === "model") {
      const host = el("div", "mx-dev-model-host");
      row.appendChild(host);
      MX.mountModelPicker(host, {
        value: value,
        onPick: (id) => commit(frame, state, rerender, region, { model: id }),
      });
      return row;
    }

    // a path key draws a text field plus a browse button; the browse
    // commits, and typing still commits through the row's own button
    if (Object.prototype.hasOwnProperty.call(PATH_KEYS, key)) {
      const wrap = el("div", "mx-dev-rootfield");
      const input = el("input");
      input.type = "text";
      input.value = value === null || value === undefined ? "" : String(value);
      const browse = el("button", "mx-btn", "browse");
      browse.type = "button";
      browse.addEventListener("click", () => {
        MX.openRootBrowser(input.value || "/", (path) => {
          input.value = path;
          commit(frame, state, rerender, region, { [key]: path });
        }, { ext: PATH_KEYS[key] });
      });
      wrap.appendChild(input);
      wrap.appendChild(browse);
      row.appendChild(wrap);

      const commitBtn = el("button", "mx-btn", "apply");
      commitBtn.type = "button";
      const baseline = input.value;
      const checkDirty = () => { commitBtn.hidden = input.value === baseline; };
      checkDirty();
      input.addEventListener("input", checkDirty);
      commitBtn.addEventListener("click", () => {
        commit(frame, state, rerender, region, { [key]: input.value });
      });
      row.appendChild(commitBtn);
      return row;
    }

    // preset_name draws the preset list and loads on change
    if (key === "preset_name") {
      const sel = el("select");
      const current = value === null || value === undefined ? "" : String(value);
      const names = state.presetNames || [];
      const list = names.indexOf(current) < 0 ? [current].concat(names) : names.slice();
      for (const c of list) {
        const o = el("option", "", c || "—");
        o.value = c;
        if (c === current) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        if (sel.value) loadPreset(frame, state, rerender, region, sel.value);
      });
      row.appendChild(sel);
      return row;
    }

    // a fixed value set draws as a dropdown and commits on change
    const choices = choicesFor(state, key);
    if (choices) {
      const sel = el("select");
      const current = value === null || value === undefined ? "" : String(value);
      const list = choices.indexOf(current) < 0 ? [current].concat(choices) : choices;
      for (const c of list) {
        const o = el("option", "", c || "—");
        o.value = c;
        if (c === current) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        commit(frame, state, rerender, region, { [key]: sel.value });
      });
      row.appendChild(sel);
      return row;
    }

    const kind = controlKind(value, key);
    let input;
    if (kind === "bool") {
      input = el("input"); input.type = "checkbox"; input.checked = !!value;
    } else if (kind === "num") {
      input = el("input"); input.type = "number"; input.value = value === null || value === undefined ? "" : value;
    } else if (kind === "list") {
      input = el("input"); input.type = "text"; input.value = (value || []).join(", ");
    } else {
      input = el("input"); input.type = "text"; input.value = value === null || value === undefined ? "" : String(value);
    }
    row.appendChild(input);

    const btn = el("button", "mx-btn", "apply");
    btn.type = "button";
    const baseline = kind === "bool" ? input.checked : input.value;
    const checkDirty = () => {
      const dirty = kind === "bool" ? input.checked !== baseline : input.value !== baseline;
      btn.hidden = !dirty;
    };
    checkDirty();
    input.addEventListener(kind === "bool" ? "change" : "input", checkDirty);
    btn.addEventListener("click", () => {
      let out;
      if (kind === "bool") out = input.checked;
      else if (kind === "num") out = input.value === "" ? null : Number(input.value);
      else if (kind === "list") out = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      else out = input.value;
      commit(frame, state, rerender, region, { [key]: out });
    });
    row.appendChild(btn);
    return row;
  }

  function renderChangePrompt(frame, state, rerender, region, container) {
    const cp = state.changePrompt;
    if (!cp || cp.region !== region.id) return;
    const box = el("div", "mx-dev-change-prompt");
    box.appendChild(el("div", "mx-dim", cp.text || "How would you like to change?"));
    const choices = el("div", "mx-dev-change-choices");
    for (const choice of (cp.choices || [])) {
      const b = el("button", "mx-btn", choice);
      b.type = "button";
      b.addEventListener("click", () => {
        sendFrame(frame, { type: "change_answer", token: cp.token, choice: choice });
        state.changePrompt = null;
        rerender();
      });
      choices.appendChild(b);
    }
    box.appendChild(choices);
    container.appendChild(box);
  }

  // only the harness block and the block for the region's provider draw.
  // model is skipped — the card head carries the picker.
  function renderSettingsTab(frame, state, rerender, region, container) {
    for (const block of BLOCKS) {
      if (block.provider && block.provider !== region.provider) continue;
      const collapsed = blockCollapsed(state, region, block);
      const head = el("div", "mx-dev-block-head");
      const caret = el("span", "mx-dev-caret", collapsed ? "▸" : "▾");
      head.appendChild(caret);
      head.appendChild(el("span", "", block.name));
      head.addEventListener("click", () => {
        toggleBlock(state, region, block);
        rerender();
      });
      container.appendChild(head);
      if (collapsed) continue;
      for (const k of block.keys) {
        if (k === "model") continue;
        container.appendChild(buildSettingRow(frame, state, rerender, region, k));
      }
    }

    renderChangePrompt(frame, state, rerender, region, container);
  }

  // the box reads and writes injections/<kind>/<id>.md — a draft has no id
  // on disk, so the file cannot exist yet
  function renderContextBlockImpl(frame, state, rerender, kind, id, container) {
    if (isDraft(id)) {
      container.appendChild(el("div", "mx-dim",
        "context file appears after the region is created"));
      return;
    }
    loadContext(frame, state, rerender, kind, id);
    const box = ensureContextBox(state, kind, id);
    const ta = el("textarea", "mx-dev-textarea");
    ta.value = box.text;
    ta.readOnly = box.locked;
    ta.addEventListener("input", () => { box.text = ta.value; });
    container.appendChild(ta);

    const actions = el("div", "mx-dev-context-actions");
    if (box.locked) {
      const unlock = el("button", "mx-btn", "unlock");
      unlock.type = "button";
      unlock.addEventListener("click", () => { box.locked = false; rerender(); });
      actions.appendChild(unlock);
    } else {
      const save = el("button", "mx-btn", "save");
      save.type = "button";
      save.addEventListener("click", () => saveContext(frame, state, kind, id, ta.value));
      actions.appendChild(save);
    }
    container.appendChild(actions);
  }

  // the gate_edges frame carries {edge, scope} only — hooks come from
  // /api/policy, and every row the backend stores is
  // {edge, driver, scope, hook}, so driver rides along and no row is dropped
  const GATE_DRIVER = "model";
  const GATE_DEFAULT_HOOK = "ask";

  function renderGatesTab(frame, state, rerender, region, container) {
    const edges = Array.isArray(state.gateEdges) ? state.gateEdges : [];
    const hooks = Array.isArray(state.policyHooks) ? state.policyHooks : [];
    const overlay = Array.isArray(region.overlay) ? region.overlay : [];
    const rowCtrls = [];

    if (!edges.length) {
      container.appendChild(el("div", "mx-dim", "no gate edges"));
      return;
    }

    for (const e of edges) {
      const edgeKey = e.edge || "";
      const scope = e.scope || "";
      const current = overlay.find((o) => o.edge === edgeKey && o.scope === scope);
      const hook = current ? (current.hook || GATE_DEFAULT_HOOK) : GATE_DEFAULT_HOOK;

      const row = el("div", "mx-dev-row");
      row.appendChild(el("label", "mx-dev-key", edgeKey));

      const sel = el("select");
      const list = hooks.indexOf(hook) < 0 ? [hook].concat(hooks) : hooks;
      for (const h of list) {
        const o = el("option", "", h);
        o.value = h;
        if (h === hook) o.selected = true;
        sel.appendChild(o);
      }
      row.appendChild(sel);
      row.appendChild(el("span", "mx-dim", scope));

      container.appendChild(row);
      rowCtrls.push({ edge: edgeKey, scope: scope, input: sel });
    }

    const apply = el("button", "mx-btn", "apply");
    apply.type = "button";
    apply.addEventListener("click", () => {
      const fullOverlay = rowCtrls.map((c) => ({
        edge: c.edge, driver: GATE_DRIVER, scope: c.scope, hook: c.input.value,
      }));
      commit(frame, state, rerender, region, { overlay: fullOverlay });
    });
    container.appendChild(apply);
  }

  // ---- presets ----
  //
  // Draft: REST, /api/library/presets/<name>. Live region: load_preset and
  // save_preset frames, which park a change prompt server side.

  const OVERLAY_KEY = "overlay_rows";

  // engine/settings.py preset_keys() — region-tier rows less preset_name
  // and overlay_rows. Derived from regionDefaults, not fetched.
  function presetKeys(state) {
    return Object.keys(state.regionDefaults || {})
      .filter((k) => k !== "preset_name" && k !== OVERLAY_KEY);
  }

  function presetNote(state, rerender, text) {
    state.lastOut = text;
    rerender();
  }

  // _preset_load_items: bag resets to defaults, then the preset applies
  function loadPresetIntoDraft(state, rerender, region, name) {
    fetch("/api/library/presets/" + encodeURIComponent(name))
      .then((r) => r.json())
      .then((d) => {
        const got = (d && d.fields) || {};
        const bag = Object.assign({}, state.regionDefaults, got);
        const overlay = bag[OVERLAY_KEY];
        delete bag[OVERLAY_KEY];
        // reset_on_change unset in the preset holds the region's value
        if (!Object.prototype.hasOwnProperty.call(got, "reset_on_change")) {
          bag.reset_on_change = region.settings.reset_on_change;
        }
        // no rail keys — Region.__init__ normalizes them at birth
        if (Array.isArray(overlay)) bag.overlay = overlay;
        bag.preset_name = name;
        applyToDraft(state, region, bag);
        const warns = (d && d.warnings) || [];
        presetNote(state, rerender, warns.length
          ? "[preset " + name + "] " + warns.join("; ")
          : "[preset " + name + " loaded]");
      })
      .catch(() => presetNote(state, rerender, "[preset " + name + ": load failed]"));
  }

  // _capture_preset_fields: preset keys plus overlay, model required.
  // write_preset does not filter, so the capture is explicit.
  function savePresetFromDraft(state, rerender, region, name) {
    const bag = region.settings || {};
    const fields = {};
    for (const k of presetKeys(state)) {
      if (Object.prototype.hasOwnProperty.call(bag, k)) fields[k] = bag[k];
    }
    if (Array.isArray(region.overlay)) fields[OVERLAY_KEY] = region.overlay;
    if (!String(fields.model || "").trim()) {
      presetNote(state, rerender, "nothing to save — this region has no model, "
        + "and a preset with no model loads onto the wrong rail. "
        + name + " was left alone");
      return;
    }
    fetch("/api/library/presets/" + encodeURIComponent(name), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).then((r) => r.json()).then((d) => {
      if (d && d.error) {
        presetNote(state, rerender, "[save_preset failed: " + d.error + "]");
        return;
      }
      if (Array.isArray(d && d.list)) state.presetNames = d.list;
      presetNote(state, rerender, "[preset saved: " + ((d && d.path) || name) + "]");
    }).catch(() => presetNote(state, rerender, "[save_preset failed]"));
  }

  function loadPreset(frame, state, rerender, region, name) {
    if (isDraft(region.id)) {
      loadPresetIntoDraft(state, rerender, region, name);
      return;
    }
    // no mode — the server parks a change prompt instead of applying
    sendFrame(frame, { type: "load_preset", track: region.id, name: name });
  }

  function savePreset(frame, state, rerender, region, name) {
    if (isDraft(region.id)) {
      savePresetFromDraft(state, rerender, region, name);
      return;
    }
    sendFrame(frame, { type: "save_preset", track: region.id, name: name });
  }

  // rename and delete carry no region — one frame path for draft and live
  function renderPresetTab(frame, state, rerender, region, container) {
    if (!state.presetsLoaded) {
      state.presetsLoaded = true;
      fetch("/api/library/presets").then((r) => r.json()).then((d) => {
        state.presetNames = Array.isArray(d && d.names) ? d.names
                          : (Array.isArray(d && d.list) ? d.list : []);
        rerender();
      }).catch(() => {});
    }

    const active = (region.settings && region.settings.preset_name) || "";
    const sel = el("select");
    for (const name of state.presetNames) {
      const o = el("option", "", name);
      o.value = name;
      if (name === active) o.selected = true;
      sel.appendChild(o);
    }
    container.appendChild(sel);

    const current = () => sel.value || "";
    const actions = el("div", "mx-dev-preset-actions");

    const load = el("button", "mx-btn", "load");
    load.type = "button";
    load.addEventListener("click", () => {
      if (current()) loadPreset(frame, state, rerender, region, current());
    });
    actions.appendChild(load);

    const save = el("button", "mx-btn", "save");
    save.type = "button";
    save.addEventListener("click", () => {
      const name = window.prompt("preset name?");
      if (name) savePreset(frame, state, rerender, region, name.trim());
    });
    actions.appendChild(save);

    const rename = el("button", "mx-btn", "rename");
    rename.type = "button";
    rename.addEventListener("click", () => {
      if (!current()) return;
      const name = window.prompt("new name for " + current() + "?");
      if (name) sendFrame(frame, { type: "rename_preset", old_name: current(), new_name: name.trim() });
    });
    actions.appendChild(rename);

    const del = el("button", "mx-btn", "delete");
    del.type = "button";
    del.addEventListener("click", () => {
      if (current() && window.confirm("delete preset " + current() + "?")) {
        sendFrame(frame, { type: "delete_preset", name: current() });
      }
    });
    actions.appendChild(del);

    container.appendChild(actions);

    if (state.lastOut) container.appendChild(el("div", "mx-dim", state.lastOut));
  }

  MX.settingsRows.create = function (frame, opts) {
    opts = opts || {};
    const state = opts.state || {};
    const rerender = typeof opts.rerender === "function" ? opts.rerender : function () {};
    ensureCss();

    return {
      renderSettings(region, host) { renderSettingsTab(frame, state, rerender, region, host); },
      renderContext(kind, id, host) { renderContextBlockImpl(frame, state, rerender, kind, id, host); },
      renderGates(region, host) { renderGatesTab(frame, state, rerender, region, host); },
      renderPreset(region, host) { renderPresetTab(frame, state, rerender, region, host); },
      onFrame(msg) {
        if (msg.type !== "saved") return;
        if (msg.inst !== frame.id) return;
        for (const key of Object.keys(state.contexts || {})) {
          const box = state.contexts[key];
          if (box.absPath === msg.path || box.path === msg.path) {
            box.locked = true;
            if (msg.ok && !box.absPath) box.absPath = msg.path;
          }
        }
        rerender();
      },
    };
  };
})();
