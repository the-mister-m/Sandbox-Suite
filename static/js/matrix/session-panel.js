// session panel — the bound session and every open session, with window counts

(function () {
  "use strict";

  const MX = window.MX = window.MX || {};
  const ui = () => MX.ui;

  async function openSessions() {
    try {
      const r = await fetch("/api/sessions/open");
      const d = await r.json();
      return Array.isArray(d.list) ? d.list : [];
    } catch (e) {
      return [];
    }
  }

  async function saveSession(sid, name) {
    const r = await fetch(`/api/sessions/${encodeURIComponent(sid)}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "" }),
    });
    return r.json();
  }

  async function endSession(sid) {
    const r = await fetch(`/api/sessions/${encodeURIComponent(sid)}/end`, { method: "POST" });
    return r.json();
  }

  // a new session comes from the suite's new-session route when it is in place
  async function newSession() {
    const r = await fetch("/api/sessions/new", { method: "POST" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.session ? d.session.id || d.session.sid : d.sid || d.id || null;
  }

  function sessionRow(row, onPick) {
    const el = ui().el;
    const line = el("div", "mx-row");
    const label = el("div", "mx-grow");
    label.textContent = row.name || row.id;
    line.appendChild(label);
    line.appendChild(el("span", "mx-dim",
      `${row.windows} window${row.windows === 1 ? "" : "s"} · ${row.tracks} track${row.tracks === 1 ? "" : "s"}`
      + (row.saved ? "" : " · unsaved")));
    line.appendChild(ui().button(row.id === MX.socket.sid() ? "Bound" : "Switch", null, () => onPick(row)));
    return line;
  }

  const panel = {
    // blank window: the picker is the open-session list plus New Session
    async openPicker(host, onBound) {
      const el = ui().el;
      host.textContent = "";
      const card = el("div", "mx-panel");
      card.appendChild(el("h3", null, "Bind this matrix window to a session"));

      const rows = await openSessions();
      if (!rows.length) card.appendChild(el("div", "mx-dim", "no open sessions"));
      for (const row of rows) {
        card.appendChild(sessionRow(row, (r) => onBound(r.id)));
      }

      const actions = el("div", "mx-actions");
      actions.appendChild(ui().button("New Session", "mx-go", async () => {
        const sid = await newSession();
        if (sid) { onBound(sid); return; }
        card.appendChild(el("div", "mx-dim",
          "new-session route not in place — start a session from the Suite Page"));
      }));
      actions.appendChild(ui().button("Refresh", null, () => panel.openPicker(host, onBound)));
      card.appendChild(actions);
      host.appendChild(card);
    },

    async open(onSwitch) {
      const el = ui().el;
      const sid = MX.socket.sid();
      const o = ui().overlay("Session");

      const rows = await openSessions();
      const mine = rows.find((r) => r.id === sid) || null;

      const head = el("div", "mx-row");
      head.appendChild(el("div", "mx-grow", mine ? (mine.name || mine.id) : (sid || "not bound")));
      head.appendChild(el("span", "mx-dim", mine ? (mine.saved ? "saved" : "unsaved") : "unknown"));
      o.panel.appendChild(head);

      const actions = el("div", "mx-actions");

      actions.appendChild(ui().button("Save", null, () => {
        ui().prompt("Save Session", "name", mine ? (mine.name || "") : "", async (name) => {
          await saveSession(sid, name);
        });
      }));

      actions.appendChild(ui().button("Save Session Template", null, () => {
        ui().prompt("Save Session Template", "name", "", (name) => {
          MX.socket.send({ type: "ade_save", name: name, session_template: true });
        });
      }));

      actions.appendChild(ui().button("Save Matrix Template", null, () => {
        ui().prompt("Save Matrix Template", "name", "", async (name) => {
          await MX.templates.write(name, MX.grid.toTemplate());
        });
      }));

      actions.appendChild(ui().button("End", "mx-warn", () => {
        ui().modal("End Session", "Save this session before it ends?", [
          { label: "Save", cls: "mx-go", run: async () => {
            await saveSession(sid, mine ? (mine.name || "") : "");
            await endSession(sid);
            o.close();
          } },
          { label: "End", cls: "mx-warn", run: async () => {
            await endSession(sid);
            o.close();
          } },
          { label: "Cancel", run: () => {} },
        ]);
      }));

      o.panel.appendChild(actions);

      // matrix templates — load one into this window
      o.panel.appendChild(el("h4", null, "Matrix templates"));
      const names = await MX.templates.list();
      if (!names.length) o.panel.appendChild(el("div", "mx-dim", "none saved"));
      for (const name of names) {
        const line = el("div", "mx-row");
        line.appendChild(el("div", "mx-grow", name));
        line.appendChild(ui().button("Load", null, async () => {
          const tpl = await MX.templates.read(name);
          MX.grid.applyTemplate(tpl);
          o.close();
        }));
        line.appendChild(ui().button("Delete", null, async () => {
          await MX.templates.remove(name);
          o.close();
          panel.open(onSwitch);
        }));
        o.panel.appendChild(line);
      }

      // every open session, with how many matrix windows each has
      o.panel.appendChild(el("h4", null, "Open sessions"));
      if (!rows.length) o.panel.appendChild(el("div", "mx-dim", "none"));
      for (const row of rows) {
        o.panel.appendChild(sessionRow(row, (r) => {
          if (r.id === sid) return;
          o.close();
          onSwitch(r.id);
        }));
      }

      return o;
    },
  };

  MX.sessionPanel = panel;
  MX.openSessions = openSessions;

  // session rung — corner button beside Settings, expands into a draggable
  // panel: session id/name/root, the session settings tier, ade.md readonly

  async function sessionSettings(sid) {
    try {
      const r = await fetch("/api/session-settings/" + encodeURIComponent(sid));
      const d = await r.json();
      return (d && d.effective) || {};
    } catch (e) {
      return {};
    }
  }

  async function writeSessionSettings(sid, values) {
    try {
      await fetch("/api/session-settings/" + encodeURIComponent(sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch (e) { /* best effort */ }
  }

  // guessed route, same shape as widget-registry's sid+path query — confirm
  // against whatever wave wires the file-read side of context files
  async function readAdeMd(sid) {
    try {
      const r = await fetch("/api/fs/read?path="
        + encodeURIComponent("injections/session/ade.md"));
      const d = await r.json();
      return typeof d.text === "string" ? d.text : "";
    } catch (e) {
      return "";
    }
  }

  // ---- root browser ----

  const ROOT_CSS_ID = "mx-sp-rootmodal-css";
  const ROOT_CSS = `
.sp-rootmodal{ position:fixed; inset:0; z-index:600; display:none;
  align-items:center; justify-content:center; background:rgba(6,6,6,.7); }
.sp-rootmodal.show{ display:flex; }
.sp-rootmodal .sp-rootbox{ width:min(640px, 92vw); max-height:82vh; overflow-y:auto;
  background:var(--surface-1); border:1px solid var(--border-2); border-radius:10px;
  padding:18px 20px; box-shadow:0 24px 70px rgba(0,0,0,.7); }
.sp-rootmodal .sp-roothead{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.sp-rootmodal .sp-roothead h3{ margin:0; font-size:14px; color:var(--text-1); }
.sp-rootmodal .sp-rootx{ flex:0 0 auto; width:24px; height:24px; padding:0; font-size:15px; line-height:1;
  background:var(--surface-2); border:1px solid var(--border); border-radius:5px;
  color:var(--text-3); cursor:pointer; }
.sp-rootmodal .sp-rootsub{ font-size:11px; color:var(--text-4); line-height:1.5; margin:6px 0 14px; }
.sp-rootmodal .sp-rootbtn{ padding:4px 9px; font-size:10.5px; font-weight:500;
  background:var(--surface-2); border:1px solid var(--border); border-radius:5px;
  color:var(--text-2); cursor:pointer; }
.sp-rootmodal .sp-rootbtnrow{ display:flex; align-items:center; gap:8px; margin:4px 0; }
.sp-rootmodal .sp-rootscope{ font-family:var(--mono); font-size:9.5px; color:var(--text-4); flex:0 0 auto; }
.sp-rootmodal .sp-rootpath{ font-size:11px; color:var(--text-2); background:var(--deep);
  border:1px solid var(--gridline); border-radius:5px; padding:6px 8px;
  margin-bottom:8px; overflow-x:auto; white-space:nowrap; font-family:var(--mono); }
.sp-rootmodal .sp-rootlist{ max-height:240px; overflow-y:auto; background:var(--deep);
  border:1px solid var(--gridline); border-radius:6px; padding:4px; margin-bottom:10px; }
.sp-rootmodal .sp-rootitem{ padding:5px 8px; font-size:11.5px; font-family:var(--mono);
  color:var(--text-2); border-radius:4px; cursor:pointer; }
.sp-rootmodal .sp-rootitem:hover{ background:var(--surface-3); color:var(--text-1); }

.sp-rootfield input:disabled{ color:var(--text-4); font-style:italic; opacity:.75; }
`;

  function ensureRootCss() {
    if (document.getElementById(ROOT_CSS_ID)) return;
    const style = document.createElement("style");
    style.id = ROOT_CSS_ID;
    style.textContent = ROOT_CSS;
    document.head.appendChild(style);
  }

  function spEl(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // filesystem folder picker; commit takes the chosen path, opens at start
  function openRootBrowser(start, commit) {
    ensureRootCss();
    const stale = document.querySelector(".sp-rootmodal");
    if (stale) stale.remove();

    const ov = spEl("div", "sp-rootmodal");
    const box = spEl("div", "sp-rootbox");
    const head = spEl("div", "sp-roothead");
    head.appendChild(spEl("h3", null, "Session root"));
    const closeBtn = spEl("button", "sp-rootx", "×");
    closeBtn.type = "button";
    head.appendChild(closeBtn);
    box.appendChild(head);
    box.appendChild(spEl("div", "sp-rootsub",
      "Browse the filesystem and pick a folder. Select copies the path into "
      + "root — nothing else changes; Set root submits it."));
    const body = spEl("div", "sp-rootbody");
    box.appendChild(body);
    ov.appendChild(box);
    document.body.appendChild(ov);

    const pathLine = spEl("div", "sp-rootpath");
    const listBox = spEl("div", "sp-rootlist");
    const selectRow = spEl("div", "sp-rootbtnrow");
    const selectBtn = spEl("button", "sp-rootbtn", "Select");
    selectBtn.type = "button";
    selectRow.appendChild(selectBtn);
    body.appendChild(pathLine);
    body.appendChild(listBox);
    body.appendChild(selectRow);

    let browsePath = start || "/";
    const parentOf = (p) => {
      const trimmed = p.replace(/\/+$/, "");
      const idx = trimmed.lastIndexOf("/");
      return idx > 0 ? trimmed.slice(0, idx) : "/";
    };
    const joinPath = (base, name) => (base === "/" ? "/" + name : base + "/" + name);

    function scopeLine(text) { return spEl("div", "sp-rootscope", text); }

    function loadDirs(path) {
      pathLine.textContent = path;
      listBox.innerHTML = "";
      listBox.appendChild(scopeLine("loading…"));
      fetch("/api/fs/browse?path=" + encodeURIComponent(path))
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            listBox.innerHTML = "";
            listBox.appendChild(scopeLine(data.error));
            return;
          }
          browsePath = data.path || path;
          pathLine.textContent = browsePath;
          listBox.innerHTML = "";
          if (browsePath !== "/") {
            const up = spEl("div", "sp-rootitem", ".. (up one level)");
            up.addEventListener("click", () => loadDirs(parentOf(browsePath)));
            listBox.appendChild(up);
          }
          const dirs = Array.isArray(data.dirs) ? data.dirs : [];
          if (!dirs.length) listBox.appendChild(scopeLine("no subfolders"));
          for (const name of dirs) {
            const item = spEl("div", "sp-rootitem", name);
            item.addEventListener("click", () => loadDirs(joinPath(browsePath, name)));
            listBox.appendChild(item);
          }
        })
        .catch(() => {
          listBox.innerHTML = "";
          listBox.appendChild(scopeLine("browse failed"));
        });
    }

    let onKey = null;
    function close() {
      ov.classList.remove("show");
      if (onKey) { document.removeEventListener("keydown", onKey); onKey = null; }
      ov.remove();
    }
    onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    closeBtn.addEventListener("click", close);
    selectBtn.addEventListener("click", () => { commit(browsePath); close(); });

    loadDirs(browsePath);
    ov.classList.add("show");
  }

  function edgeStyle(edge) {
    const base = "position:fixed;z-index:480;background:var(--surface-1,#1b1b1f);"
      + "border:1px solid var(--border-2,#444);border-radius:8px;padding:10px;"
      + "width:280px;max-height:70vh;overflow:auto;";
    if (edge === "left")   return base + "top:60px;left:8px;";
    if (edge === "right")  return base + "top:60px;right:8px;";
    if (edge === "top")    return base + "top:8px;left:50%;transform:translateX(-50%);";
    return base + "bottom:8px;left:50%;transform:translateX(-50%);"; // bottom
  }

  // drag by the panel's head; on release, snap to whichever edge is nearest
  function makeDraggable(el, head, onSnap) {
    let dragging = false, sx = 0, sy = 0;
    head.style.cursor = "move";
    head.addEventListener("mousedown", (ev) => {
      dragging = true; sx = ev.clientX; sy = ev.clientY;
      ev.preventDefault();
    });
    window.addEventListener("mousemove", (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      el.style.transform = "";
      el.style.left = (el.offsetLeft + dx) + "px";
      el.style.top = (el.offsetTop + dy) + "px";
      el.style.right = "auto"; el.style.bottom = "auto";
      sx = ev.clientX; sy = ev.clientY;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      const r = el.getBoundingClientRect();
      const distances = {
        left: r.left, right: window.innerWidth - r.right,
        top: r.top, bottom: window.innerHeight - r.bottom,
      };
      let edge = "right", best = Infinity;
      for (const k in distances) { if (distances[k] < best) { best = distances[k]; edge = k; } }
      el.style.cssText = edgeStyle(edge);
      onSnap(edge);
    });
  }

  const rung = {
    el: null,
    edge: "right",
    btn: null,

    attach() {
      let bar = document.getElementById("mxCornerBody") || document.getElementById("mxCorners") || document.querySelector(".mx-corner-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "mx-corner-bar";
        bar.style.cssText = "position:fixed;top:8px;right:8px;display:flex;gap:6px;z-index:500;";
        document.body.appendChild(bar);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mx-btn mx-rung-btn";
      btn.textContent = "Settings";
      btn.title = "session settings";
      btn.addEventListener("click", () => this.toggle());
      bar.appendChild(btn);
      this.btn = btn;
    },

    toggle() { if (this.el) this.close(); else this.open(); },

    close() {
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
    },

    async open() {
      if (this.el) return;
      const ui = MX.ui;
      const sid = MX.socket.sid();
      const el = ui.el("div", "mx-rung");
      el.style.cssText = edgeStyle(this.edge);
      document.body.appendChild(el);
      this.el = el;

      const head = ui.el("div", "mx-row", "Session");
      el.appendChild(head);
      makeDraggable(el, head, (edge) => { this.edge = edge; });

      if (!sid) { el.appendChild(ui.el("div", "mx-dim", "not bound")); return; }

      const rows = await openSessions();
      const mine = rows.find((r) => r.id === sid) || null;
      el.appendChild(ui.el("div", "mx-dim", "id: " + sid));
      el.appendChild(ui.el("div", "mx-dim", "name: " + (mine ? (mine.name || "") : "")));

      const settings = await sessionSettings(sid);
      const values = Object.assign({}, settings);

      // root shows the session's current root disabled; browse enables it
      ensureRootCss();
      const rootRow = ui.el("div", "mx-row sp-rootfield");
      const rootInput = document.createElement("input");
      rootInput.type = "text";
      rootInput.value = values.root || "";
      rootInput.disabled = true;
      rootRow.appendChild(rootInput);
      rootRow.appendChild(ui.button("Browse", null, () => {
        openRootBrowser(rootInput.value.trim(), (path) => {
          rootInput.value = path;
          rootInput.disabled = false;
        });
      }));
      rootRow.appendChild(ui.button("Set root", "mx-go", () => {
        const path = rootInput.value.trim();
        if (!path) return;
        MX.socket.send({ type: "setroot", path: path });
      }));
      el.appendChild(rootRow);

      el.appendChild(ui.el("h4", null, "session settings"));
      for (const key of Object.keys(settings)) {
        if (key === "root") continue;
        const row = ui.el("div", "mx-opt-row");
        row.appendChild(ui.el("label", null, key));
        const value = settings[key];
        let input;
        if (typeof value === "boolean") {
          input = document.createElement("input");
          input.type = "checkbox";
          input.checked = value;
          input.addEventListener("change", () => {
            values[key] = input.checked;
            writeSessionSettings(sid, values);
          });
        } else {
          input = document.createElement("input");
          input.type = "text";
          input.value = value === null || value === undefined ? "" : String(value);
          input.addEventListener("change", () => {
            const raw = input.value;
            values[key] = (typeof value === "number" && raw !== "" && !isNaN(Number(raw)))
              ? Number(raw) : raw;
            writeSessionSettings(sid, values);
          });
        }
        row.appendChild(input);
        el.appendChild(row);
      }

      el.appendChild(ui.el("h4", null, "injections/session/ade.md"));
      const ta = document.createElement("textarea");
      ta.readOnly = true;
      ta.style.cssText = "width:100%;min-height:120px;";
      ta.value = await readAdeMd(sid);
      el.appendChild(ta);
    },
  };

  rung.attach();
  MX.sessionRung = rung;
})();
