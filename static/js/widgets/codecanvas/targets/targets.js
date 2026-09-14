// targets widget — the .html/.json tabs one canvas has open: add, remove,
// reorder, switch.
//
// Binds to one canvas widget on this surface that shares its target: the
// instance named by the `canvas` option, else the last to emit canvas.focus.
// State: per instance on frame._targetsState. No module-level state.

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};

  function ensureStyles() {
    if (document.getElementById("mxtg-style")) return;
    const style = document.createElement("style");
    style.id = "mxtg-style";
    style.textContent = `
      .mxtg-wrap { display: flex; flex-direction: column; height: 100%;
        font: 12px system-ui, sans-serif; color: var(--text-1, #ddd); }
      .mxtg-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
      .mxtg-empty { padding: 8px; color: var(--text-3, #888); }
      .mxtg-list { display: flex; flex-direction: column; }
      .mxtg-row { display: flex; align-items: center; gap: 6px;
        padding: 4px 8px; cursor: pointer;
        border-bottom: 1px solid var(--border, #333); }
      .mxtg-row:hover { background: var(--surface-2, #2f2f2f); }
      .mxtg-on { background: #2a3a5c; }
      .mxtg-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; }
      .mxtg-x { background: none; border: 0; cursor: pointer;
        color: var(--text-3, #888); font-size: 12px; padding: 0 2px; }
      .mxtg-add { margin: 6px 8px; padding: 2px 8px; font-size: 11px;
        cursor: pointer; border: 1px solid var(--border, #333);
        background: none; color: var(--text-2, #aaa); align-self: flex-start; }
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

  function empty(host, text) {
    host.appendChild(el("div", "mxtg-empty", text));
  }

  function basename(path) {
    const parts = String(path || "").split("/");
    return parts[parts.length - 1] || path;
  }

  // ---------- which canvas ----------

  // function: every canvas instance id on this surface.
  function canvasIdsFor(frame) {
    const g = MX.grid;
    if (!frame || !g || !Array.isArray(g.instances)) return [];
    const out = [];
    for (const inst of g.instances) {
      if (inst.type !== "canvas") continue;
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
  function boundFrame(tg) {
    const ids = canvasIdsFor(tg.frame);
    if (tg.canvasOpt !== "focused") {
      return ids.indexOf(tg.canvasOpt) >= 0 ? canvasFrame(tg.canvasOpt) : null;
    }
    if (tg.focusedInst && ids.indexOf(tg.focusedInst) >= 0) {
      const f = canvasFrame(tg.focusedInst);
      if (f) return f;
    }
    for (const id of ids) {
      const f = canvasFrame(id);
      if (f) return f;
    }
    return null;
  }

  // function: follow mode adopts any focused canvas on this target.
  function onAnyFocus(tg, payload) {
    if (tg.canvasOpt !== "focused" || !payload || !payload.inst) return;
    tg.focusedInst = payload.inst;
    render(tg);
  }

  // ---------- rows ----------

  function reorder(list, draggedPath, targetPath, before) {
    const out = list.slice();
    const from = out.indexOf(draggedPath);
    if (from < 0) return list;
    out.splice(from, 1);
    let to = out.indexOf(targetPath);
    if (to < 0) return list;
    if (!before) to += 1;
    out.splice(to, 0, draggedPath);
    return out;
  }

  function onRemove(tg, bf, path) {
    const targets = (bf.options.targets || []).slice();
    const idx = targets.indexOf(path);
    if (idx < 0) return;
    const wasActive = (bf.options.target || "") === path;
    targets.splice(idx, 1);
    bf.setOption("targets", targets);
    if (!wasActive) return;
    const next = targets[idx] !== undefined ? targets[idx]
      : (targets[idx - 1] !== undefined ? targets[idx - 1] : "");
    bf.setOption("target", next);
  }

  function onAdd(tg) {
    const bf = boundFrame(tg);
    if (!bf) return;
    MX.openRootBrowser("/", (path) => {
      const targets = (bf.options.targets || []).slice();
      if (targets.indexOf(path) < 0) {
        targets.push(path);
        bf.setOption("targets", targets);
      }
      bf.setOption("target", path);
    }, { ext: [".html", ".json"] });
  }

  function buildRow(tg, bf, path, active) {
    const row = el("div", "mxtg-row" + (active ? " mxtg-on" : ""));
    row.title = path;
    row.draggable = true;
    row.appendChild(el("span", "mxtg-name", basename(path)));
    row.appendChild(mkBtn("×", "mxtg-x", (e) => {
      e.stopPropagation();
      onRemove(tg, bf, path);
    }));
    row.addEventListener("click", () => bf.setOption("target", path));
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", path);
    });
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedPath = e.dataTransfer.getData("text/plain");
      if (!draggedPath || draggedPath === path) return;
      const rect = row.getBoundingClientRect();
      const before = rect.height ? (e.clientY - rect.top) / rect.height < 0.5 : true;
      const targets = bf.options.targets || [];
      bf.setOption("targets", reorder(targets, draggedPath, path, before));
      // state: no target change, so no canvas.doc follows; rows redraw here.
      render(tg);
    });
    return row;
  }

  function render(tg) {
    if (!tg.live || !tg.bodyEl) return;
    tg.bodyEl.innerHTML = "";
    const bf = boundFrame(tg);
    if (!bf) { empty(tg.bodyEl, "No canvas on this surface."); return; }
    const targets = bf.options.targets || [];
    const active = bf.options.target || "";
    const list = el("div", "mxtg-list");
    for (const path of targets) list.appendChild(buildRow(tg, bf, path, path === active));
    tg.bodyEl.appendChild(list);
    tg.bodyEl.appendChild(mkBtn("+ Add", "mxtg-add", () => onAdd(tg)));
  }

  // ---------- module ----------

  const MOD = {
    defaults: { canvas: "focused", followTarget: "" },

    optionControls: {
      canvas: { kind: "select", values: (f) => ["focused"].concat(canvasIdsFor(f)) }
    },

    mount(frame) {
      ensureStyles();

      const tg = frame._targetsState = {
        frame: frame, live: true,
        canvasOpt: frame.options.canvas || "focused",
        focusedInst: "",
        offLayout: null, focusMirror: null, docMirror: null,
        bodyEl: null
      };

      // surface.layout: re-render
      tg.offLayout = MX.bus.on("surface.layout", () => render(tg));

      const wrap = el("div", "mxtg-wrap");
      tg.bodyEl = el("div", "mxtg-body");
      wrap.appendChild(tg.bodyEl);
      frame.host.appendChild(wrap);

      // empty followTarget option: hears canvas.focus / canvas.doc on every target
      tg.focusMirror = MX.mirror(frame, "canvas.focus",
        (payload) => onAnyFocus(tg, payload), "followTarget");
      tg.docMirror = MX.mirror(frame, "canvas.doc",
        () => render(tg), "followTarget");

      render(tg);
    },

    unmount(frame) {
      const tg = frame._targetsState;
      if (!tg) return;
      tg.live = false;
      if (tg.focusMirror) tg.focusMirror.off();
      if (tg.docMirror) tg.docMirror.off();
      if (tg.offLayout) tg.offLayout();
      frame._targetsState = null;
    },

    onOption(frame, key, value) {
      const tg = frame._targetsState;
      if (!tg) return;
      if (key === "canvas") {
        tg.canvasOpt = value || "focused";
        render(tg);
        return;
      }
      if (key === "followTarget") render(tg);
    },

    getOptions(frame) {
      const tg = frame._targetsState;
      if (!tg) return JSON.parse(JSON.stringify(frame.options));
      return {
        canvas: tg.canvasOpt,
        followTarget: frame.options.followTarget || ""
      };
    }
  };

  MX.registerWidget("canvas_targets", MOD);
})();
