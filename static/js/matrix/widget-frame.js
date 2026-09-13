// widget frame — what the grid gives one widget instance and what it gives back
//
// The frame hands a widget: host, sid, send, subscribe, options.
// A widget module supplies: mount, unmount, onFrame, getOptions.
// Options are per instance. Unmounting discards them.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  let _seq = 0;

  function newInstanceId(type) {
    _seq += 1;
    return `${type}-${Date.now().toString(36)}-${_seq}`;
  }

  function startingOptions(type) {
    const fromRegistry = MX.widgetDefaults(type) || {};
    const mod = MX.widgetModule(type);
    const fromModule = (mod && mod.defaults) ? JSON.parse(JSON.stringify(mod.defaults)) : {};
    return Object.assign(fromModule, fromRegistry);
  }

  function WidgetFrame(inst, sid) {
    this.id = inst.id;
    this.type = inst.type;
    this.sid = sid;
    this.options = inst.options && typeof inst.options === "object"
      ? inst.options
      : startingOptions(inst.type);
    this.host = null;
    this.el = null;
    this._mod = MX.widgetModule(inst.type);
    this._wants = null;
    this._mounted = false;
    this._panel = null;
  }

  // frames the widget asked for, nothing else
  WidgetFrame.prototype.subscribe = function (types) {
    if (types === "*" || types === true) {
      this._wants = "*";
      return;
    }
    this._wants = Array.isArray(types) ? types.slice() : [];
  };

  WidgetFrame.prototype.send = function (obj) {
    return MX.socket.send(obj);
  };

  WidgetFrame.prototype.deliver = function (msg) {
    if (!this._mounted || !this._mod || !this._mod.onFrame) return;
    if (this._wants === null) return;
    if (this._wants !== "*" && this._wants.indexOf(msg.type) < 0) return;
    try { this._mod.onFrame(this, msg); } catch (e) { /* one widget does not stop the rest */ }
  };

  WidgetFrame.prototype.mount = function (hostEl) {
    this.host = hostEl;
    this._mounted = true;
    if (this._mod && this._mod.mount) {
      try { this._mod.mount(this); } catch (e) { hostEl.textContent = `[${this.type}: ${e}]`; }
    } else {
      hostEl.textContent = `[no widget module for ${this.type}]`;
    }
  };

  // the grid asks before removing; a widget may refuse by answering false
  WidgetFrame.prototype.canClose = function () {
    if (!this._mounted || !this._mod || !this._mod.canClose) return Promise.resolve(true);
    let answer;
    try { answer = this._mod.canClose(this); } catch (e) { answer = true; }
    return Promise.resolve(answer).then((v) => v !== false).catch(() => true);
  };

  WidgetFrame.prototype.unmount = function () {
    if (!this._mounted) return;
    this._mounted = false;
    if (this._mod && this._mod.unmount) {
      try { this._mod.unmount(this); } catch (e) { /* teardown is best effort */ }
    }
    this.closeOptions();
    if (this.host) this.host.textContent = "";
    this._wants = null;
  };

  WidgetFrame.prototype.getOptions = function () {
    if (this._mod && this._mod.getOptions) {
      try { return this._mod.getOptions(this); } catch (e) { /* fall through to the frame's copy */ }
    }
    return JSON.parse(JSON.stringify(this.options));
  };

  WidgetFrame.prototype.setOption = function (key, value) {
    this.options[key] = value;
    if (this._mod && this._mod.onOption) {
      try { this._mod.onOption(this, key, value); } catch (e) { /* widget may ignore it */ }
    }
    // options ride entirely on setOption/getOptions; without this a
    // widget that persists only through options never survives a reload
    if (MX.grid && MX.grid.save) MX.grid.save();
    if (MX.grid && MX.grid._applying) return; // this change came from the mirror
    MX.bus.emit("surface.widget",
      { surface: MX.WINDOW_ID, id: this.id, options: this.getOptions() },
      { remote: true });
  };

  // applies a remote option change; never re-saves or re-emits
  WidgetFrame.prototype.applyOptions = function (options) {
    if (!options) return;
    for (const key of Object.keys(options)) {
      const value = options[key];
      if (JSON.stringify(this.options[key]) === JSON.stringify(value)) continue;
      this.options[key] = value;
      if (this._mod && this._mod.onOption) {
        try { this._mod.onOption(this, key, value); } catch (e) { /* widget may ignore it */ }
      }
    }
  };

  // per-instance options panel, opened from the widget's own bar

  WidgetFrame.prototype.closeOptions = function () {
    if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    this._panel = null;
  };

  WidgetFrame.prototype.toggleOptions = function () {
    if (this._panel) { this.closeOptions(); return; }
    if (!this.el) return;

    const panel = document.createElement("div");
    panel.className = "mx-options";

    const head = document.createElement("h4");
    head.textContent = `${MX.widgetLabel(this.type)} options — ${this.id}`;
    panel.appendChild(head);

    const keys = Object.keys(this.options);
    if (!keys.length) {
      const none = document.createElement("div");
      none.className = "mx-dim";
      none.textContent = "no options for this type";
      panel.appendChild(none);
    }

    const controls = (this._mod && this._mod.optionControls) || {};

    for (const key of keys) {
      const row = document.createElement("div");
      row.className = "mx-opt-row";
      const label = document.createElement("label");
      label.textContent = key;
      row.appendChild(label);

      const value = this.options[key];
      const control = controls[key];
      let input;
      let refillSelect = null;
      if (control && control.kind === "select") {
        input = document.createElement("select");
        refillSelect = () => {
          Promise.resolve(control.values(this)).then((list) => {
            list = Array.isArray(list) ? list.slice() : [];
            const current = this.options[key];
            if (current !== undefined && current !== null && current !== ""
              && list.indexOf(current) < 0) list.push(current);
            input.textContent = "";
            for (const v of list) {
              const opt = document.createElement("option");
              opt.value = v;
              opt.textContent = v;
              input.appendChild(opt);
            }
            input.value = current;
          });
        };
        refillSelect();
        input.addEventListener("change", () => this.setOption(key, input.value));
      } else if (typeof value === "boolean") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = value;
        input.addEventListener("change", () => this.setOption(key, input.checked));
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = value === null || value === undefined ? "" : String(value);
        input.addEventListener("change", () => {
          const raw = input.value;
          this.setOption(key, typeof value === "number" && raw !== "" && !isNaN(Number(raw))
            ? Number(raw) : raw);
        });
      }
      row.appendChild(input);
      if (control && control.kind === "select" && control.onNew) {
        const newBtn = document.createElement("button");
        newBtn.className = "mx-btn";
        newBtn.textContent = "New";
        newBtn.addEventListener("click", () => {
          Promise.resolve(control.onNew(this)).then(() => refillSelect());
        });
        row.appendChild(newBtn);
      }
      panel.appendChild(row);
    }

    const actions = document.createElement("div");
    actions.className = "mx-actions";
    const close = document.createElement("button");
    close.className = "mx-btn";
    close.textContent = "Close";
    close.addEventListener("click", () => this.closeOptions());
    actions.appendChild(close);
    panel.appendChild(actions);

    this.el.appendChild(panel);
    this._panel = panel;
  };

  MX.WidgetFrame = WidgetFrame;
  MX.newInstanceId = newInstanceId;
  MX.startingOptions = startingOptions;
})();
