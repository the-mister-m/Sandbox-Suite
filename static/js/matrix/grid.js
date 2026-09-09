// matrix grid — slots, border resize, move-button rearrange, per-window persistence

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  const COLS = 28;
  const ROWS = 18;
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

      for (const side of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
        const edge = document.createElement("div");
        edge.className = `mx-edge mx-edge-${side}`;
        edge.addEventListener("pointerdown", (ev) => this._startResize(ev, inst, el, side));
        el.appendChild(edge);
      }

      const frame = new MX.WidgetFrame(inst, this.sid);
      frame.el = el;
      this.frames[inst.id] = frame;
      opts.addEventListener("click", () => frame.toggleOptions());
      bar.addEventListener("pointerdown", (ev) => {
        if (ev.target === opts || ev.target === close) return;
        this._startMove(ev, inst, el);
      });
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

    // every border and corner drags to resize; n/w edges move col/row
    // as they shrink or grow so the opposite side stays put

    _startResize(ev, inst, el, side) {
      ev.preventDefault();
      ev.stopPropagation();
      const cell = this._cellSize();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startCol = inst.slot.col;
      const startRow = inst.slot.row;
      const startW = inst.slot.w;
      const startH = inst.slot.h;
      const hasE = side.includes("e");
      const hasW = side.includes("w");
      const hasS = side.includes("s");
      const hasN = side.includes("n");
      const target = ev.currentTarget;
      target.setPointerCapture(ev.pointerId);

      const onMove = (e) => {
        const dc = Math.round((e.clientX - startX) / cell.w);
        const dr = Math.round((e.clientY - startY) / cell.h);
        if (hasE) {
          inst.slot.w = Math.max(1, Math.min(this.cols - startCol + 1, startW + dc));
        }
        if (hasW) {
          const col = Math.max(1, Math.min(startCol + startW - 1, startCol + dc));
          inst.slot.col = col;
          inst.slot.w = startCol + startW - col;
        }
        if (hasS) {
          inst.slot.h = Math.max(1, Math.min(this.rows - startRow + 1, startH + dr));
        }
        if (hasN) {
          const row = Math.max(1, Math.min(startRow + startH - 1, startRow + dr));
          inst.slot.row = row;
          inst.slot.h = startRow + startH - row;
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

    // any other instance's footprint overlapping this rect blocks the drop
    _overlaps(col, row, w, h, skipId) {
      for (const other of this.instances) {
        if (other.id === skipId) continue;
        const s = other.slot;
        if (col < s.col + s.w && col + w > s.col && row < s.row + s.h && row + h > s.row) return true;
      }
      return false;
    },

    // the move button lifts the widget; a ghost snaps to the grid and
    // only lands where nothing else is sitting

    _startMove(ev, inst, el) {
      ev.preventDefault();
      ev.stopPropagation();
      const cell = this._cellSize();
      const target = ev.currentTarget;
      target.setPointerCapture(ev.pointerId);
      el.classList.add("mx-lifted");
      this.el.classList.add("mx-lifting");
      this.el.style.backgroundImage =
        `repeating-linear-gradient(to right, var(--gridline, #2a2a2a) 0 1px, transparent 1px ${cell.w}px),` +
        `repeating-linear-gradient(to bottom, var(--gridline, #2a2a2a) 0 1px, transparent 1px ${cell.h}px)`;

      const w = inst.slot.w;
      const h = inst.slot.h;
      const ghost = document.createElement("div");
      ghost.className = "mx-ghost";
      this.el.appendChild(ghost);

      let landing = { col: inst.slot.col, row: inst.slot.row };
      this._place(ghost, { col: landing.col, row: landing.row, w: w, h: h });

      const onMove = (e) => {
        const col = Math.max(1, Math.min(this.cols - w + 1, Math.floor((e.clientX - cell.left) / cell.w) + 1));
        const row = Math.max(1, Math.min(this.rows - h + 1, Math.floor((e.clientY - cell.top) / cell.h) + 1));
        const valid = !this._overlaps(col, row, w, h, inst.id);
        this._place(ghost, { col: col, row: row, w: w, h: h });
        ghost.classList.toggle("mx-ghost-invalid", !valid);
        if (valid) landing = { col: col, row: row };
      };

      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        el.classList.remove("mx-lifted");
        this.el.classList.remove("mx-lifting");
        this.el.style.backgroundImage = "";
        ghost.remove();
        this._drop(inst, el, landing);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },

    _drop(inst, el, landing) {
      inst.slot.col = landing.col;
      inst.slot.row = landing.row;
      this._place(el, inst.slot);
      this.save();
    },
  };

  MX.grid = grid;
  MX.WINDOW_ID = WINDOW_ID;
})();
