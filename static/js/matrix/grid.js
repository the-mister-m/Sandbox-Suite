// matrix grid — slots, border resize, move-button rearrange, per-window persistence

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const COLS = 12;
  const ROWS = 12;
  const NEW_W = 4;
  const NEW_H = 4;

  // one id per browser tab, so two windows on one session keep separate layouts
  function windowId() {
    let id = null;
    try { id = window.sessionStorage.getItem("mx.window"); } catch (e) { id = null; }
    if (!id) {
      id = "w-" + Math.random().toString(36).slice(2, 10);
      try { window.sessionStorage.setItem("mx.window", id); } catch (e) { /* memory only */ }
    }
    return id;
  }

  const WINDOW_ID = windowId();

  function gridUrl(sid) {
    return `/api/grid/${encodeURIComponent(sid)}/${encodeURIComponent(WINDOW_ID)}`;
  }

  const grid = {
    el: null,
    cols: COLS,
    rows: ROWS,
    sid: null,
    instances: [],
    frames: Object.create(null),

    init(el) {
      this.el = el;
      this._applyDims();
      MX.socket.onFrame((msg) => {
        for (const inst of this.instances) {
          const f = this.frames[inst.id];
          if (f) f.deliver(msg);
        }
      });
    },

    _applyDims() {
      this.el.style.setProperty("--mx-cols", this.cols);
      this.el.style.setProperty("--mx-rows", this.rows);
    },

    // persistence — the server holds one grid per session per window

    async load(sid) {
      let saved = null;
      try {
        const r = await fetch(gridUrl(sid));
        const d = await r.json();
        saved = d && d.grid;
      } catch (e) { saved = null; }
      if (saved && Array.isArray(saved.widgets)) {
        this.cols = saved.cols || COLS;
        this.rows = saved.rows || ROWS;
        return saved.widgets;
      }
      // a window with no stored grid starts blank
      this.cols = COLS;
      this.rows = ROWS;
      return [];
    },

    save() {
      if (!this.sid) return;
      const body = { cols: this.cols, rows: this.rows, widgets: this.snapshot() };
      fetch(gridUrl(this.sid), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => { /* layout stays in memory for this window */ });
    },

    snapshot() {
      return this.instances.map((inst) => {
        const f = this.frames[inst.id];
        return {
          id: inst.id,
          type: inst.type,
          slot: Object.assign({}, inst.slot),
          options: f ? f.getOptions() : JSON.parse(JSON.stringify(inst.options || {})),
        };
      });
    },

    // one window's grid and widget list, the matrix template body
    toTemplate() {
      return {
        grid: { cols: this.cols, rows: this.rows },
        widgets: this.snapshot().map((w) => ({
          type: w.type, slot: w.slot, options: w.options,
        })),
      };
    },

    // binding

    async bindSession(sid) {
      this.unmountAll();
      this.sid = sid;
      const saved = await this.load(sid);
      this.instances = saved.map((w) => this._normalize(w));
      this._applyDims();
      this.render();
    },

    // the grid stays, every widget rebinds
    async rebind(sid) {
      const carried = this.snapshot();
      this.unmountAll();
      this.sid = sid;
      const saved = await this.load(sid);
      this.instances = (saved.length ? saved : carried).map((w) => this._normalize(w));
      this._applyDims();
      this.render();
      this.save();
    },

    _normalize(w) {
      const type = w.type;
      const slot = w.slot && typeof w.slot === "object" ? w.slot : {};
      return {
        id: w.id || MX.newInstanceId(type),
        type: type,
        slot: {
          col: Math.max(1, Math.min(this.cols, slot.col || 1)),
          row: Math.max(1, Math.min(this.rows, slot.row || 1)),
          w: Math.max(1, Math.min(this.cols, slot.w || NEW_W)),
          h: Math.max(1, Math.min(this.rows, slot.h || NEW_H)),
        },
        options: w.options && typeof w.options === "object"
          ? JSON.parse(JSON.stringify(w.options))
          : MX.startingOptions(type),
      };
    },

    // widget list

    addWidget(type) {
      const slot = this._freeSlot(NEW_W, NEW_H);
      const inst = {
        id: MX.newInstanceId(type),
        type: type,
        slot: slot,
        options: MX.startingOptions(type),
      };
      this.instances.push(inst);
      // mount only the new instance; render() rebuilds every widget's
      // frame from scratch and would wipe every other widget's live state
      if (this.el) this.el.appendChild(this._build(inst));
      this.save();
      return inst;
    },

    // the instance is asked first; it may refuse and stay mounted
    removeWidget(id) {
      const f = this.frames[id];
      if (!f) {
        this.instances = this.instances.filter((i) => i.id !== id);
        this.render();
        this.save();
        return Promise.resolve(true);
      }
      return f.canClose().then((ok) => {
        if (!ok) return false;
        f.unmount();
        delete this.frames[id];
        this.instances = this.instances.filter((i) => i.id !== id);
        this.render();
        this.save();
        return true;
      });
    },

    unmountAll() {
      for (const inst of this.instances) {
        const f = this.frames[inst.id];
        if (f) f.unmount();
      }
      this.frames = Object.create(null);
      if (this.el) this.el.textContent = "";
    },

    // mounts each widget fresh
    applyTemplate(tpl) {
      this.unmountAll();
      const g = tpl && tpl.grid ? tpl.grid : {};
      this.cols = g.cols || COLS;
      this.rows = g.rows || ROWS;
      const rows = tpl && Array.isArray(tpl.widgets) ? tpl.widgets : [];
      this.instances = rows.map((w) => this._normalize({
        type: w.type, slot: w.slot, options: w.options,
      }));
      this._applyDims();
      this.render();
      this.save();
    },

    _occupied() {
      const map = [];
      for (let r = 0; r <= this.rows; r++) map.push(new Array(this.cols + 1).fill(false));
      for (const inst of this.instances) {
        const s = inst.slot;
        for (let r = s.row; r < s.row + s.h && r <= this.rows; r++) {
          for (let c = s.col; c < s.col + s.w && c <= this.cols; c++) map[r][c] = true;
        }
      }
      return map;
    },

    _freeSlot(w, h) {
      const map = this._occupied();
      for (let r = 1; r + h - 1 <= this.rows; r++) {
        for (let c = 1; c + w - 1 <= this.cols; c++) {
          let clear = true;
          for (let rr = r; rr < r + h && clear; rr++) {
            for (let cc = c; cc < c + w; cc++) {
              if (map[rr][cc]) { clear = false; break; }
            }
          }
          if (clear) return { col: c, row: r, w: w, h: h };
        }
      }
      return { col: 1, row: 1, w: w, h: h };
    },

    // rendering

    render() {
      if (!this.el) return;
      this.el.textContent = "";
      for (const inst of this.instances) {
        this.el.appendChild(this._build(inst));
      }
    },

    _build(inst) {
      const el = document.createElement("div");
      el.className = "mx-widget";
      el.dataset.instance = inst.id;
      this._place(el, inst.slot);

      const bar = document.createElement("div");
      bar.className = "mx-bar";

      const move = document.createElement("button");
      move.className = "mx-bar-btn mx-move";
      move.type = "button";
      move.title = "hold to move";
      move.textContent = "✣";
      bar.appendChild(move);

      const name = document.createElement("span");
      name.className = "mx-bar-name";
      name.textContent = `${MX.widgetLabel(inst.type)} · ${inst.id}`;
      bar.appendChild(name);

      const opts = document.createElement("button");
      opts.className = "mx-bar-btn";
      opts.type = "button";
      opts.textContent = "options";
      bar.appendChild(opts);

      const close = document.createElement("button");
      close.className = "mx-bar-btn";
      close.type = "button";
      close.title = "close this widget";
      close.textContent = "×";
      close.addEventListener("click", () => this.removeWidget(inst.id));
      bar.appendChild(close);

      el.appendChild(bar);

      const host = document.createElement("div");
      host.className = "mx-host";
      el.appendChild(host);

      for (const side of ["e", "s", "se"]) {
        const edge = document.createElement("div");
        edge.className = `mx-edge mx-edge-${side}`;
        edge.addEventListener("pointerdown", (ev) => this._startResize(ev, inst, el, side));
        el.appendChild(edge);
      }

      const frame = new MX.WidgetFrame(inst, this.sid);
      frame.el = el;
      this.frames[inst.id] = frame;
      opts.addEventListener("click", () => frame.toggleOptions());
      move.addEventListener("pointerdown", (ev) => this._startMove(ev, inst, el));
      frame.mount(host);

      return el;
    },

    _place(el, slot) {
      el.style.gridColumn = `${slot.col} / span ${slot.w}`;
      el.style.gridRow = `${slot.row} / span ${slot.h}`;
    },

    _cellSize() {
      const box = this.el.getBoundingClientRect();
      const style = window.getComputedStyle(this.el);
      const gap = parseFloat(style.gap) || 0;
      const padL = parseFloat(style.paddingLeft) || 0;
      const padT = parseFloat(style.paddingTop) || 0;
      const padR = parseFloat(style.paddingRight) || 0;
      const padB = parseFloat(style.paddingBottom) || 0;
      const w = (box.width - padL - padR - gap * (this.cols - 1)) / this.cols;
      const h = (box.height - padT - padB - gap * (this.rows - 1)) / this.rows;
      return { w: w + gap, h: h + gap, left: box.left + padL, top: box.top + padT };
    },

    // every border between widgets drags to resize

    _startResize(ev, inst, el, side) {
      ev.preventDefault();
      ev.stopPropagation();
      const cell = this._cellSize();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startW = inst.slot.w;
      const startH = inst.slot.h;
      const target = ev.currentTarget;
      target.setPointerCapture(ev.pointerId);

      const onMove = (e) => {
        if (side !== "s") {
          const dc = Math.round((e.clientX - startX) / cell.w);
          inst.slot.w = Math.max(1, Math.min(this.cols - inst.slot.col + 1, startW + dc));
        }
        if (side !== "e") {
          const dr = Math.round((e.clientY - startY) / cell.h);
          inst.slot.h = Math.max(1, Math.min(this.rows - inst.slot.row + 1, startH + dr));
        }
        this._place(el, inst.slot);
      };
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        this.save();
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },

    // the move button lifts the widget and drops it into a slot

    _startMove(ev, inst, el) {
      ev.preventDefault();
      ev.stopPropagation();
      const cell = this._cellSize();
      const target = ev.currentTarget;
      target.setPointerCapture(ev.pointerId);
      el.classList.add("mx-lifted");
      this.el.classList.add("mx-lifting");
      let landing = { col: inst.slot.col, row: inst.slot.row };
      let hot = null;

      const clearHot = () => {
        if (hot) hot.classList.remove("mx-drop-target");
        hot = null;
      };

      const onMove = (e) => {
        const col = Math.max(1, Math.min(this.cols, Math.floor((e.clientX - cell.left) / cell.w) + 1));
        const row = Math.max(1, Math.min(this.rows, Math.floor((e.clientY - cell.top) / cell.h) + 1));
        landing = { col: col, row: row };
        clearHot();
        const under = this._instanceAt(col, row, inst.id);
        if (under) {
          const node = this.el.querySelector(`[data-instance="${under.id}"]`);
          if (node) { node.classList.add("mx-drop-target"); hot = node; }
        }
      };

      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        el.classList.remove("mx-lifted");
        this.el.classList.remove("mx-lifting");
        clearHot();
        this._drop(inst, landing);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },

    _instanceAt(col, row, skipId) {
      for (const other of this.instances) {
        if (other.id === skipId) continue;
        const s = other.slot;
        if (col >= s.col && col < s.col + s.w && row >= s.row && row < s.row + s.h) return other;
      }
      return null;
    },

    _drop(inst, landing) {
      const under = this._instanceAt(landing.col, landing.row, inst.id);
      if (under) {
        const mine = Object.assign({}, inst.slot);
        inst.slot = Object.assign({}, under.slot);
        under.slot = mine;
      } else {
        inst.slot.col = Math.max(1, Math.min(this.cols - inst.slot.w + 1, landing.col));
        inst.slot.row = Math.max(1, Math.min(this.rows - inst.slot.h + 1, landing.row));
      }
      for (const other of this.instances) {
        const node = this.el.querySelector(`[data-instance="${other.id}"]`);
        if (node) this._place(node, other.slot);
      }
      this.save();
    },
  };

  MX.grid = grid;
  MX.WINDOW_ID = WINDOW_ID;
})();
